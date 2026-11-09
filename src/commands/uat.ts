import { Command } from 'commander';
import chalk from 'chalk';
import {
  AlbRule,
  MAINT_TAG,
  awsJson,
  aws,
  checkAwsCli,
  confirm,
  currentSourceIps,
  defaultTargetGroupArn,
  doOff,
  fail,
  findTaggedRule,
  fixedResponseAction,
  get443ListenerArn,
  isOn,
  listRules,
  modifyRuleSourceIp,
  readState,
  resolveAlbArn,
  writeState,
} from './maintenance';
import {
  detectUatPage,
  uatAsleepBody,
  uatWakingBody,
} from '../utils/uat-pages';

export const UAT_WEB_ENV = 'wordpress-uat';
export const UAT_WORKER_ENV = 'wordpress-uat-worker';
const POLL_SECONDS = 15;
const PROGRESS_EVERY_SECONDS = 60;

export interface AsgState {
  name: string;
  min: number;
  max: number;
  desired: number;
  inService: number;
}

export interface UatContext {
  listener: string;
  maint: AlbRule;
  targetGroup: string;
  webAsg: string;
  workerAsg: string;
}

export type UatPhase = 'asleep' | 'waking' | 'awake' | 'mixed';

export function envAsgName(envName: string): string {
  const res = awsJson<{
    EnvironmentResources: { AutoScalingGroups: { Name: string }[] };
  }>(
    `elasticbeanstalk describe-environment-resources --environment-name ${envName}`
  );
  const name = res.EnvironmentResources.AutoScalingGroups?.[0]?.Name;
  if (!name) fail(`No Auto Scaling group found for ${envName}.`);
  return name;
}

export function asgState(name: string): AsgState {
  const res = awsJson<{
    AutoScalingGroups: {
      MinSize: number;
      MaxSize: number;
      DesiredCapacity: number;
      Instances: { LifecycleState: string }[];
    }[];
  }>(
    `autoscaling describe-auto-scaling-groups --auto-scaling-group-names ${name}`
  );
  const g = res.AutoScalingGroups[0];
  if (!g) fail(`Auto Scaling group ${name} not found.`);
  return {
    name,
    min: g.MinSize,
    max: g.MaxSize,
    desired: g.DesiredCapacity,
    inService: g.Instances.filter((i) => i.LifecycleState === 'InService')
      .length,
  };
}

export function setCapacity(name: string, min: number, desired: number): void {
  aws(
    `autoscaling update-auto-scaling-group --auto-scaling-group-name ${name} ` +
      `--min-size ${min} --desired-capacity ${desired}`
  );
}

export function ebHealth(envName: string): string {
  const res = awsJson<{
    Environments: { Status: string; Health: string }[];
  }>(`elasticbeanstalk describe-environments --environment-names ${envName}`);
  const e = res.Environments[0];
  if (!e) return 'unknown';
  return `${e.Status}/${e.Health}`;
}

export function workerReady(health: string): boolean {
  const color = health.split('/')[1] ?? '';
  return color === 'Green' || color === 'Yellow';
}

export function healthyTargets(targetGroup: string): number {
  const res = awsJson<{
    TargetHealthDescriptions: { TargetHealth: { State: string } }[];
  }>(`elbv2 describe-target-health --target-group-arn ${targetGroup}`);
  return res.TargetHealthDescriptions.filter(
    (t) => t.TargetHealth.State === 'healthy'
  ).length;
}

export function uatPageOnRule(maint: AlbRule): string | null {
  if (!isOn(maint)) return null;
  const body = maint.Actions?.[0]?.FixedResponseConfig?.MessageBody ?? '';
  return detectUatPage(body) ?? 'other';
}

export function classifyPhase(
  page: string | null,
  web: AsgState,
  worker: AsgState,
  healthy: number
): UatPhase {
  if (page === 'uat-waking') return 'waking';
  const computeDown =
    web.desired === 0 && web.inService === 0 && worker.desired === 0;
  if (computeDown) return 'asleep';
  const computeUp = healthy > 0 && worker.inService > 0;
  if (computeUp && page === null) return 'awake';
  return 'mixed';
}

function loadContext(): UatContext {
  checkAwsCli();
  const listener = get443ListenerArn(resolveAlbArn('uat'));
  const maint = findTaggedRule(listener, MAINT_TAG);
  if (!maint)
    fail(
      `No rule tagged "${MAINT_TAG}" on uat. Run: wfuwp maintenance init --env uat`
    );
  return {
    listener,
    maint,
    targetGroup: defaultTargetGroupArn(listRules(listener)),
    webAsg: envAsgName(UAT_WEB_ENV),
    workerAsg: envAsgName(UAT_WORKER_ENV),
  };
}

function refreshRule(ctx: UatContext): AlbRule {
  const maint = findTaggedRule(ctx.listener, MAINT_TAG);
  if (!maint) fail(`The "${MAINT_TAG}" rule disappeared from uat.`);
  return maint;
}

function showPage(ctx: UatContext, body: string): void {
  const maint = refreshRule(ctx);
  if (!isOn(maint) && !readState('uat')) {
    writeState('uat', {
      capturedAt: new Date().toISOString(),
      ruleArn: maint.RuleArn,
      conditions: maint.Conditions,
      actions: maint.Actions,
    });
  }
  modifyRuleSourceIp(maint.RuleArn, ['0.0.0.0/0'], fixedResponseAction(body));
}

function formatAsg(label: string, s: AsgState): string {
  return (
    `  ${label}: desired ${s.desired} (min ${s.min}, max ${s.max}), ` +
    `in service ${s.inService}`
  );
}

function phaseLabel(phase: UatPhase): string {
  if (phase === 'awake') return chalk.green('AWAKE');
  if (phase === 'asleep') return chalk.blue('ASLEEP');
  if (phase === 'waking') return chalk.yellow('WAKING');
  return chalk.yellow('MIXED');
}

function elapsedLabel(startedAt: number): string {
  const total = Math.round((Date.now() - startedAt) / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function doUatStatus(): Promise<void> {
  const ctx = loadContext();
  const web = asgState(ctx.webAsg);
  const worker = asgState(ctx.workerAsg);
  const healthy = healthyTargets(ctx.targetGroup);
  const page = uatPageOnRule(ctx.maint);
  const phase = classifyPhase(page, web, worker, healthy);
  console.log(chalk.bold('[uat] ') + phaseLabel(phase));
  console.log(formatAsg(`web (${UAT_WEB_ENV})`, web));
  console.log(formatAsg(`worker (${UAT_WORKER_ENV})`, worker));
  console.log(`  healthy web targets: ${healthy}`);
  console.log(
    `  EB health: web ${ebHealth(UAT_WEB_ENV)}, worker ${ebHealth(UAT_WORKER_ENV)}`
  );
  console.log(
    `  page: ${page ?? 'off (requests go to WordPress)'}` +
      (page ? ` (source-ip ${currentSourceIps(ctx.maint).join(', ')})` : '')
  );
  if (phase === 'mixed' && page === null && healthy === 0)
    console.log(
      chalk.yellow(
        '  Note: no page is up and no web server is healthy, so visitors get ' +
          'a 503. Run: wfuwp uat down (or wfuwp uat up).'
      )
    );
}

async function doUatDown(yes: boolean, force: boolean): Promise<void> {
  const ctx = loadContext();
  const page = uatPageOnRule(ctx.maint);
  if (page === 'other' && !force)
    fail(
      'A non-UAT maintenance page is ON for uat. Turn it off first, or pass ' +
        '--force to replace it with the asleep page.'
    );
  if (!yes) {
    const ok = await confirm(
      'Put UAT to sleep? Visitors will see the asleep page. (y/N)'
    );
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }
  showPage(ctx, uatAsleepBody());
  console.log(chalk.blue('[uat] Asleep page ON.'));
  setCapacity(ctx.webAsg, 0, 0);
  setCapacity(ctx.workerAsg, 0, 0);
  console.log(chalk.blue('[uat] Web and worker scaled to 0. UAT is asleep.'));
}

async function waitUntilAwake(
  ctx: UatContext,
  startedAt: number,
  timeoutMinutes: number
): Promise<boolean> {
  const deadline = startedAt + timeoutMinutes * 60 * 1000;
  let lastProgress = 0;
  while (Date.now() < deadline) {
    const healthy = healthyTargets(ctx.targetGroup);
    const worker = asgState(ctx.workerAsg);
    const workerHealth = ebHealth(UAT_WORKER_ENV);
    if (healthy > 0 && worker.inService > 0 && workerReady(workerHealth))
      return true;
    if (Date.now() - lastProgress >= PROGRESS_EVERY_SECONDS * 1000) {
      const web = asgState(ctx.webAsg);
      console.log(
        chalk.gray(
          `  ${elapsedLabel(startedAt)}: web in service ${web.inService}, ` +
            `healthy ${healthy}; worker in service ${worker.inService} ` +
            `(${workerHealth})`
        )
      );
      lastProgress = Date.now();
    }
    await sleep(POLL_SECONDS);
  }
  return false;
}

async function doUatUp(yes: boolean, timeoutMinutes: number): Promise<void> {
  const ctx = loadContext();
  const page = uatPageOnRule(ctx.maint);
  if (page === 'other')
    fail(
      'A non-UAT maintenance page is ON for uat. Turn it off with ' +
        '"wfuwp maintenance off --env uat" before waking UAT.'
    );
  const web = asgState(ctx.webAsg);
  const worker = asgState(ctx.workerAsg);
  const healthy = healthyTargets(ctx.targetGroup);
  if (classifyPhase(page, web, worker, healthy) === 'awake') {
    console.log(chalk.green('[uat] UAT is already awake.'));
    return;
  }
  if (!yes) {
    const ok = await confirm('Wake UAT? (y/N)');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }
  const startedAt = Date.now();
  showPage(ctx, uatWakingBody());
  console.log(chalk.yellow('[uat] Waking page ON.'));
  if (web.desired < 1) setCapacity(ctx.webAsg, 1, 1);
  if (worker.desired < 1) setCapacity(ctx.workerAsg, 1, 1);
  console.log(
    chalk.yellow(
      `[uat] Web and worker scaling to 1. Waiting up to ${timeoutMinutes} minutes...`
    )
  );
  const awake = await waitUntilAwake(ctx, startedAt, timeoutMinutes);
  if (!awake)
    fail(
      `UAT did not become healthy within ${timeoutMinutes} minutes. The ` +
        'waking page is still up. Check the wordpress-uat environment in ' +
        'Elastic Beanstalk, then rerun "wfuwp uat up" or "wfuwp uat down".'
    );
  console.log(
    chalk.green(
      `[uat] Healthy after ${elapsedLabel(startedAt)}. Removing the waking page.`
    )
  );
  await doOff('uat', true);
  console.log(
    chalk.green(
      `[uat] UAT is awake. Total wake time ${elapsedLabel(startedAt)}.`
    )
  );
}

export const uatCommand = new Command('uat')
  .description('Put the UAT environment to sleep or wake it up')
  .addCommand(
    new Command('status')
      .description('Show whether UAT is asleep, waking, or awake')
      .action(async () => {
        await doUatStatus();
      })
  )
  .addCommand(
    new Command('down')
      .description('Show the asleep page and scale UAT web and worker to 0')
      .option('-y, --yes', 'Skip confirmation prompt', false)
      .option(
        '--force',
        'Replace a non-UAT maintenance page with the asleep page',
        false
      )
      .action(async (opts) => {
        await doUatDown(opts.yes, opts.force);
      })
  )
  .addCommand(
    new Command('up')
      .description(
        'Show the waking page, scale UAT to 1, and remove the page once healthy'
      )
      .option('-y, --yes', 'Skip confirmation prompt', false)
      .option('-t, --timeout <minutes>', 'Minutes to wait for UAT', '25')
      .action(async (opts) => {
        await doUatUp(opts.yes, Number(opts.timeout));
      })
  );
