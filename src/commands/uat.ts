import { Command } from 'commander';
import chalk from 'chalk';
import { execFileSync } from 'child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AlbRule,
  MAINT_TAG,
  awsJson,
  aws,
  checkAwsCli,
  confirm,
  currentSourceIps,
  defaultTargetGroupArn,
  deleteState,
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
import {
  UAT_BASES,
  UatBuildRequest,
  describeRequest,
  isDefaultRequest,
  isUatBase,
  packageAlias,
  parseWith,
} from '../utils/uat-build';

export const UAT_WEB_ENV = 'wordpress-uat';
export const UAT_WORKER_ENV = 'wordpress-uat-worker';
const POLL_SECONDS = 15;
const APP_REPO = 'git@github.com:wakeforestuniversity/app-web-aws-wp.git';
const UAT_BUILD_FILE = 'uat-build.json';
export const ADMIN_PATH_TAGS = [
  'Allow Maintenance Page',
  'Allow Maintenance Support',
  'Allow Maintenance Assets',
];
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
  if (computeDown && page === 'uat-asleep') return 'asleep';
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

export function adminPathActions(
  body: string | null,
  targetGroup: string
): any[] {
  if (body !== null) return fixedResponseAction(body);
  return [{ Type: 'forward', TargetGroupArn: targetGroup }];
}

function setRuleActions(ruleArn: string, actions: any[]): void {
  const path = join(tmpdir(), `wfuwp-uat-actions-${process.pid}.json`);
  writeFileSync(path, JSON.stringify(actions));
  try {
    aws(`elbv2 modify-rule --rule-arn ${ruleArn} --actions file://${path}`);
  } finally {
    unlinkSync(path);
  }
}

function setAdminPaths(ctx: UatContext, body: string | null): void {
  for (const tag of ADMIN_PATH_TAGS) {
    const rule = findTaggedRule(ctx.listener, tag);
    if (!rule) continue;
    setRuleActions(rule.RuleArn, adminPathActions(body, ctx.targetGroup));
  }
}

function adminPathsParked(ctx: UatContext): number {
  return ADMIN_PATH_TAGS.map((tag) => findTaggedRule(ctx.listener, tag)).filter(
    (rule) => rule?.Actions?.[0]?.Type === 'fixed-response'
  ).length;
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
  setAdminPaths(ctx, body);
}

function restoreUatOff(ctx: UatContext): void {
  const maint = refreshRule(ctx);
  const state = readState('uat');
  const stateIps = state?.conditions
    ? currentSourceIps({ ...maint, Conditions: state.conditions })
    : [];
  const usable =
    state?.actions && stateIps.length > 0 && !stateIps.includes('0.0.0.0/0');
  if (usable) {
    modifyRuleSourceIp(maint.RuleArn, stateIps, state.actions);
  } else {
    modifyRuleSourceIp(maint.RuleArn, ['152.17.0.0/32'], maint.Actions);
  }
  deleteState('uat');
  setAdminPaths(ctx, null);
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
  console.log(
    `  login and admin paths: ${adminPathsParked(ctx) ? 'showing the page' : 'forwarding to WordPress'}`
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
  restoreUatOff(ctx);
  console.log(
    chalk.green(
      `[uat] UAT is awake. Total wake time ${elapsedLabel(startedAt)}.`
    )
  );
}

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitUserName(dir: string): string {
  try {
    return git(dir, ['config', 'user.name']) || 'unknown';
  } catch {
    return 'unknown';
  }
}

function packageRepoUrl(devComposer: any, pkg: string): string | null {
  const core = pkg.split('/')[1].replace(/^wfu-/, '');
  const repos: { url?: string }[] = devComposer.repositories ?? [];
  const matches = repos.filter((r) => {
    const name =
      (r.url ?? '')
        .split('/')
        .pop()
        ?.replace(/\.git$/, '') ?? '';
    return name === `wfu-${core}` || name.endsWith(`-${core}`);
  });
  return matches.length === 1 ? (matches[0].url ?? null) : null;
}

function checkPinnedBranches(
  devComposer: any,
  pinned: Record<string, string>
): void {
  for (const [pkg, branch] of Object.entries(pinned)) {
    if (!packageAlias(devComposer, pkg))
      fail(
        `${pkg} has no branch alias in composer-dev.json, so it cannot be pinned to a branch.`
      );
    const url = packageRepoUrl(devComposer, pkg);
    if (!url) {
      console.log(
        chalk.yellow(
          `  Could not find the repository for ${pkg}; not checking that ${branch} exists.`
        )
      );
      continue;
    }
    const heads = execFileSync('git', ['ls-remote', '--heads', url, branch], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (!heads) fail(`${pkg} has no branch named ${branch} (${url}).`);
  }
}

async function doUatBuild(opts: {
  base: string;
  with: string[];
  dryRun: boolean;
  yes: boolean;
}): Promise<void> {
  if (!isUatBase(opts.base))
    fail(`--base must be one of ${UAT_BASES.join(', ')} (got "${opts.base}")`);
  let pinned: Record<string, string> = {};
  try {
    pinned = parseWith(opts.with);
  } catch (error) {
    fail((error as Error).message);
  }
  const dir = mkdtempSync(join(tmpdir(), 'wfuwp-uat-build-'));
  try {
    console.log(chalk.gray(`  Cloning the uat branch of ${APP_REPO}...`));
    execFileSync(
      'git',
      ['clone', '--quiet', '--branch', 'uat', APP_REPO, dir],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    const devComposer = JSON.parse(
      readFileSync(join(dir, 'composer-dev.json'), 'utf8')
    );
    checkPinnedBranches(devComposer, pinned);
    if (opts.base === 'main') {
      try {
        git(dir, [
          'merge',
          '--no-ff',
          '--no-edit',
          '-m',
          'Merging main into uat for a UAT build.',
          'origin/main',
        ]);
      } catch {
        fail(
          'Merging main into uat conflicts. Resolve it on the uat branch by hand, then rerun.'
        );
      }
    }
    const requestPath = join(dir, UAT_BUILD_FILE);
    const request: UatBuildRequest = {
      base: opts.base,
      with: pinned,
      requestedBy: gitUserName(dir),
      requestedAt: new Date().toISOString(),
    };
    if (isDefaultRequest(request)) {
      if (existsSync(requestPath)) unlinkSync(requestPath);
    } else {
      writeFileSync(requestPath, JSON.stringify(request, null, 2) + '\n');
    }
    const tracked = git(dir, ['ls-files', UAT_BUILD_FILE]);
    if (existsSync(requestPath) || tracked)
      git(dir, ['add', '-A', '--', UAT_BUILD_FILE]);
    const staged = git(dir, ['diff', '--cached', '--name-only']);
    const ahead = git(dir, ['log', '--oneline', 'origin/uat..HEAD']);
    if (!staged && !ahead) {
      console.log(
        chalk.green(
          `[uat] UAT already builds from ${describeRequest(request)}. Run juat to rebuild it.`
        )
      );
      return;
    }
    console.log(chalk.bold('[uat] Build UAT from ') + describeRequest(request));
    if (ahead)
      console.log(`  New commits for uat:\n${ahead.replace(/^/gm, '    ')}`);
    if (staged)
      console.log(
        `  ${UAT_BUILD_FILE}: ${isDefaultRequest(request) ? 'removed (back to the uat branches)' : 'written'}`
      );
    if (opts.dryRun) {
      console.log(chalk.gray('  Dry run: nothing was pushed.'));
      return;
    }
    if (!opts.yes) {
      const ok = await confirm(
        'Push this to uat? Jenkins will rebuild and deploy UAT. (y/N)'
      );
      if (!ok) {
        console.log('Aborted.');
        return;
      }
    }
    if (staged)
      git(dir, [
        'commit',
        '--quiet',
        '-m',
        `Building UAT from ${describeRequest(request)}.`,
      ]);
    git(dir, ['push', '--quiet', 'origin', 'HEAD:uat']);
    console.log(
      chalk.green(
        '[uat] Pushed. Jenkins is building UAT; follow it in #ait-wp-jenkins.'
      )
    );
    console.log(
      chalk.gray(
        '  If UAT is asleep, the new build is what it runs the next time it wakes.'
      )
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
  )
  .addCommand(
    new Command('build')
      .description(
        'Choose the code UAT builds from and push it so Jenkins rebuilds UAT'
      )
      .option('-b, --base <base>', 'uat, dev, or main', 'uat')
      .option(
        '-w, --with <package:branch>',
        'Pin one WFU package to a branch (repeatable)',
        (value: string, previous: string[]) => previous.concat([value]),
        [] as string[]
      )
      .option('--dry-run', 'Show what would be pushed without pushing', false)
      .option('-y, --yes', 'Skip confirmation prompt', false)
      .action(async (opts) => {
        await doUatBuild(opts);
      })
  );
