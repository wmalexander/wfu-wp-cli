import { Command } from 'commander';
import { execSync } from 'child_process';
import {
  writeFileSync,
  unlinkSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { tmpdir, homedir } from 'os';
import { join, dirname } from 'path';
import * as readline from 'readline';
import * as https from 'https';
import chalk from 'chalk';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'pprd', 'prod'];
const MAINT_TAG = 'Maintenance Mode';
const BYPASS_TAG = 'Maintenance Bypass';
const LOOPBACK_TAG = 'Allow Wordpress Loopback';
const LOOPBACK_CIDR = '34.192.207.124/32';
const STATE_BUCKET = 'wfu-umc-wp-team-internal-docs';
const REGION = 'us-east-1';
const PAGE_MARKER = 'WFU.EDU is not available.';

const MAINTENANCE_URL =
  'https://wakealert.wfu.edu/downpage/maintenance-mode.html';
const DOWN_URL = 'https://wakealert.wfu.edu/downpage/downpage.html';

interface EnvConfig {
  offSentinel: string;
  verifyUrl: string;
}

const ENV_CONFIG: Record<string, EnvConfig> = {
  dev: {
    offSentinel: '152.17.0.0/32',
    verifyUrl: 'https://www.dev.wfu.edu',
  },
  uat: {
    offSentinel: '152.17.0.0/32',
    verifyUrl: 'https://www.uat.wfu.edu',
  },
  pprd: {
    offSentinel: '152.17.255.255/32',
    verifyUrl: 'https://www.pprd.wfu.edu',
  },
  prod: {
    offSentinel: '152.17.0.0/32',
    verifyUrl: 'https://www.wfu.edu',
  },
};

function fail(message: string): never {
  console.error(chalk.red(`Error: ${message}`));
  process.exit(1);
}

function validateEnvironment(env: string): void {
  if (!env || !VALID_ENVIRONMENTS.includes(env)) {
    fail(
      `Invalid environment "${env}". Valid: ${VALID_ENVIRONMENTS.join(', ')}`
    );
  }
}

function checkAwsCli(): void {
  try {
    execSync('aws --version', { stdio: 'ignore' });
  } catch {
    fail('AWS CLI not found. Install and configure it (aws sso login) first.');
  }
}

function aws(args: string): string {
  return execSync(`aws ${args} --region ${REGION}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function awsJson<T = any>(args: string): T {
  const out = aws(`${args} --output json`);
  return JSON.parse(out) as T;
}

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function requireExactConfirm(expected: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`Type "${expected}" to proceed: `, (answer) => {
      rl.close();
      resolve(answer.trim() === expected);
    });
  });
}

function resolveAlbArn(env: string): string {
  const wanted = `wordpress-${env}`;
  const lbs = awsJson<{ LoadBalancers: { LoadBalancerArn: string }[] }>(
    'elbv2 describe-load-balancers'
  ).LoadBalancers.map((l) => l.LoadBalancerArn);
  if (lbs.length === 0) fail('No load balancers found in this account.');
  const chunks: string[][] = [];
  for (let i = 0; i < lbs.length; i += 20) chunks.push(lbs.slice(i, i + 20));
  for (const chunk of chunks) {
    const tags = awsJson<{
      TagDescriptions: {
        ResourceArn: string;
        Tags: { Key: string; Value: string }[];
      }[];
    }>(
      `elbv2 describe-tags --resource-arns ${chunk.join(' ')}`
    ).TagDescriptions;
    for (const td of tags) {
      const match = td.Tags.find(
        (t) =>
          t.Key === 'elasticbeanstalk:environment-name' && t.Value === wanted
      );
      if (match) return td.ResourceArn;
    }
  }
  fail(
    `Could not find an ALB tagged elasticbeanstalk:environment-name=${wanted}`
  );
}

function get443ListenerArn(albArn: string): string {
  const listeners = awsJson<{
    Listeners: { Port: number; ListenerArn: string }[];
  }>(`elbv2 describe-listeners --load-balancer-arn ${albArn}`).Listeners;
  const https = listeners.find((l) => l.Port === 443);
  if (!https) fail('No HTTPS:443 listener on the resolved ALB.');
  return https.ListenerArn;
}

interface AlbRule {
  RuleArn: string;
  Priority: string;
  Conditions: any[];
  Actions: any[];
}

function listRules(listenerArn: string): AlbRule[] {
  return awsJson<{ Rules: AlbRule[] }>(
    `elbv2 describe-rules --listener-arn ${listenerArn}`
  ).Rules;
}

function ruleTagName(ruleArns: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  if (ruleArns.length === 0) return result;
  const tags = awsJson<{
    TagDescriptions: {
      ResourceArn: string;
      Tags: { Key: string; Value: string }[];
    }[];
  }>(
    `elbv2 describe-tags --resource-arns ${ruleArns.join(' ')}`
  ).TagDescriptions;
  for (const td of tags) {
    const name = td.Tags.find((t) => t.Key === 'Name');
    if (name) result[td.ResourceArn] = name.Value;
  }
  return result;
}

function findTaggedRule(listenerArn: string, tagName: string): AlbRule | null {
  const rules = listRules(listenerArn).filter((r) => r.Priority !== 'default');
  const names = ruleTagName(rules.map((r) => r.RuleArn));
  const found = rules.filter((r) => names[r.RuleArn] === tagName);
  if (found.length === 0) return null;
  if (found.length > 1)
    fail(
      `Multiple rules tagged "${tagName}" on this listener. Resolve manually.`
    );
  return found[0];
}

function buildBody(pageUrl: string): string {
  return (
    '<!DOCTYPE html> <html lang="en"> <head> <meta charset="UTF-8"> ' +
    '<meta http-equiv="X-UA-Compatible" content="IE=edge"> ' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"> ' +
    `<title>${PAGE_MARKER}</title> </head> <body> ` +
    `<iframe src="${pageUrl}" style="position:fixed; top:0; left:0; bottom:0; ` +
    'right:0; width:100%; height:100%; border:none; margin:0; padding:0; ' +
    `overflow:hidden; z-index:999999;"> ${PAGE_MARKER} </iframe> ` +
    '<script> setTimeout(function () { window.location.reload(); }, 120000); ' +
    '</script> </body> </html>'
  );
}

function writeTempJson(name: string, value: unknown): string {
  const path = join(tmpdir(), `wfuwp-maint-${name}-${process.pid}.json`);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function modifyRuleSourceIp(
  ruleArn: string,
  values: string[],
  actions: any[]
): void {
  const conditions = [
    { Field: 'source-ip', SourceIpConfig: { Values: values } },
  ];
  const cPath = writeTempJson('cond', conditions);
  const aPath = writeTempJson('act', actions);
  try {
    aws(
      `elbv2 modify-rule --rule-arn ${ruleArn} ` +
        `--conditions file://${cPath} --actions file://${aPath}`
    );
  } finally {
    unlinkSync(cPath);
    unlinkSync(aPath);
  }
}

function fixedResponseAction(body: string): any[] {
  return [
    {
      Type: 'fixed-response',
      FixedResponseConfig: {
        MessageBody: body,
        StatusCode: '200',
        ContentType: 'text/html',
      },
    },
  ];
}

function stateKey(env: string): string {
  return `maintenance-state/${env}.json`;
}

function readState(env: string): any | null {
  try {
    const out = aws(`s3 cp s3://${STATE_BUCKET}/${stateKey(env)} -`);
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function writeState(env: string, state: unknown): void {
  const path = writeTempJson(`state-${env}`, state);
  try {
    aws(
      `s3 cp ${path} s3://${STATE_BUCKET}/${stateKey(env)} ` +
        '--content-type application/json'
    );
  } finally {
    unlinkSync(path);
  }
}

function deleteState(env: string): void {
  try {
    aws(`s3 rm s3://${STATE_BUCKET}/${stateKey(env)}`);
  } catch {
    return;
  }
}

function getMyIp(): string {
  const ip = execSync('curl -s --max-time 10 https://checkip.amazonaws.com', {
    encoding: 'utf8',
  }).trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
    fail(`Could not resolve a public IP (got "${ip}")`);
  return `${ip}/32`;
}

function detectPage(body: string): string {
  if (body.includes(MAINTENANCE_URL)) return 'maintenance';
  if (body.includes(DOWN_URL)) return 'down';
  return 'unknown';
}

function softMyIp(): string | null {
  try {
    const ip = execSync('curl -s --max-time 10 https://checkip.amazonaws.com', {
      encoding: 'utf8',
    }).trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, oct) => acc * 256 + Number(oct), 0);
}

function ipv4InCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split('/');
  const bits = Number(bitsRaw);
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(base) || bits < 0 || bits > 32)
    return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? -1 : ~((1 << (32 - bits)) - 1);
  return (ipToLong(ip) & mask) === (ipToLong(base) & mask);
}

function shadowingForwardRule(
  listener: string,
  maint: AlbRule,
  ip: string
): AlbRule | null {
  const maintP = Number(maint.Priority);
  const rules = listRules(listener).filter(
    (r) => r.Priority !== 'default' && r.Actions?.[0]?.Type === 'forward'
  );
  for (const r of rules) {
    if (Number(r.Priority) >= maintP) continue;
    if (currentSourceIps(r).some((c) => ipv4InCidr(ip, c))) return r;
  }
  return null;
}

function verify(
  env: string,
  expectPage: boolean,
  listener: string,
  maint: AlbRule
): void {
  const url = ENV_CONFIG[env].verifyUrl;
  const attempts = 6;
  let onPage = false;
  let curlFailed = false;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const body = execSync(`curl -s -L --max-time 20 ${url}`, {
        encoding: 'utf8',
      });
      curlFailed = false;
      onPage = body.includes(PAGE_MARKER);
    } catch {
      curlFailed = true;
    }
    if (!curlFailed && onPage === expectPage) break;
    if (i < attempts - 1) execSync('sleep 3');
  }
  if (curlFailed) {
    console.log(
      chalk.yellow(`  (could not curl ${url} to verify; check manually)`)
    );
    return;
  }
  if (expectPage && onPage) {
    console.log(
      chalk.green(`  Verified: ${url} is serving the maintenance page.`)
    );
    return;
  }
  if (!expectPage && !onPage) {
    console.log(chalk.green(`  Verified: ${url} is serving the live site.`));
    return;
  }
  if (expectPage && !onPage) {
    const myIp = softMyIp();
    const shadow = myIp ? shadowingForwardRule(listener, maint, myIp) : null;
    if (shadow) {
      console.log(
        chalk.cyan(
          `  Note: your IP ${myIp} is allowlisted by a higher-priority ` +
            `forward rule (priority ${shadow.Priority}: ` +
            `${currentSourceIps(shadow).join(', ')}), so you reach the live ` +
            'site even though the page is ON. This is expected. Verify from ' +
            'an external/off-network IP to see the page itself.'
        )
      );
      return;
    }
  }
  console.log(
    chalk.yellow(
      `  Warning: ${url} did not match expected state ` +
        `(expected ${expectPage ? 'maintenance page' : 'live site'}). ` +
        'DNS/cache propagation can lag a few seconds.'
    )
  );
}

function currentSourceIps(rule: AlbRule): string[] {
  const cond = rule.Conditions.find((c) => c.Field === 'source-ip');
  return cond?.SourceIpConfig?.Values ?? [];
}

function isOn(rule: AlbRule): boolean {
  return currentSourceIps(rule).includes('0.0.0.0/0');
}

async function doStatus(env: string): Promise<void> {
  validateEnvironment(env);
  checkAwsCli();
  const listener = get443ListenerArn(resolveAlbArn(env));
  const maint = findTaggedRule(listener, MAINT_TAG);
  if (!maint) {
    console.log(
      chalk.yellow(
        `[${env}] No rule tagged "${MAINT_TAG}". ` +
          (env === 'dev' || env === 'uat'
            ? `Run: wfuwp maintenance init --env ${env}`
            : 'This environment is not standardized yet.')
      )
    );
    return;
  }
  const on = isOn(maint);
  const body = maint.Actions?.[0]?.FixedResponseConfig?.MessageBody ?? '';
  const page = detectPage(body);
  console.log(
    chalk.bold(`[${env}] Maintenance page: `) +
      (on ? chalk.red('ON') : chalk.green('OFF'))
  );
  console.log(`  source-ip: ${currentSourceIps(maint).join(', ')}`);
  if (on) console.log(`  page: ${page}`);
  const bypass = findTaggedRule(listener, BYPASS_TAG);
  if (bypass) {
    const ips = currentSourceIps(bypass).filter(
      (v) => v !== ENV_CONFIG[env].offSentinel
    );
    console.log(`  bypass IPs: ${ips.length ? ips.join(', ') : '(none)'}`);
  } else {
    console.log(`  bypass rule: (none on this environment)`);
  }
  verify(env, on, listener, maint);
}

async function doOn(
  env: string,
  page: string,
  allowMe: boolean,
  yes: boolean
): Promise<void> {
  validateEnvironment(env);
  if (page !== 'maintenance' && page !== 'down')
    fail(`--page must be "maintenance" or "down" (got "${page}")`);
  checkAwsCli();
  const listener = get443ListenerArn(resolveAlbArn(env));
  const maint = findTaggedRule(listener, MAINT_TAG);
  if (!maint)
    fail(
      `No rule tagged "${MAINT_TAG}" on ${env}. ` +
        (env === 'dev' || env === 'uat'
          ? `Run: wfuwp maintenance init --env ${env}`
          : `${env} is not standardized; refusing to act.`)
    );
  if (!yes) {
    console.log(
      chalk.red.bold(
        `About to take ${env.toUpperCase()} OFFLINE for all visitors (${page} page).`
      )
    );
    const ok =
      env === 'prod'
        ? await requireExactConfirm('prod')
        : await confirm('Proceed? (y/N)');
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }
  if (isOn(maint)) {
    console.log(
      chalk.gray(
        `  Already ON; preserving the existing OFF snapshot (page swap only).`
      )
    );
  } else if (readState(env)) {
    console.log(chalk.gray(`  OFF snapshot already saved; preserving it.`));
  } else {
    writeState(env, {
      capturedAt: new Date().toISOString(),
      ruleArn: maint.RuleArn,
      conditions: maint.Conditions,
      actions: maint.Actions,
    });
  }
  const pageUrl = page === 'down' ? DOWN_URL : MAINTENANCE_URL;
  modifyRuleSourceIp(
    maint.RuleArn,
    ['0.0.0.0/0'],
    fixedResponseAction(buildBody(pageUrl))
  );
  console.log(chalk.red(`[${env}] Maintenance page ON (${page}).`));
  if (allowMe) {
    const bypass = findTaggedRule(listener, BYPASS_TAG);
    if (!bypass)
      fail(`No "${BYPASS_TAG}" rule on ${env}; cannot apply --allow-me.`);
    const ip = getMyIp();
    const existing = currentSourceIps(bypass).filter(
      (v) => v !== ENV_CONFIG[env].offSentinel
    );
    const values = Array.from(new Set([...existing, ip]));
    modifyRuleSourceIp(bypass.RuleArn, values, bypass.Actions);
    console.log(
      chalk.cyan(`  Bypass added for ${ip} (you can still reach the site).`)
    );
  }
  verify(env, true, listener, maint);
}

async function doOff(env: string, yes: boolean): Promise<void> {
  validateEnvironment(env);
  checkAwsCli();
  const listener = get443ListenerArn(resolveAlbArn(env));
  const maint = findTaggedRule(listener, MAINT_TAG);
  if (!maint) fail(`No rule tagged "${MAINT_TAG}" on ${env}.`);
  if (!yes) {
    const ok = await confirm(`Bring ${env.toUpperCase()} back online? (y/N)`);
    if (!ok) {
      console.log('Aborted.');
      return;
    }
  }
  const state = readState(env);
  const stateIps = state?.conditions
    ? currentSourceIps({ ...maint, Conditions: state.conditions })
    : [];
  const stateUsable =
    state &&
    state.conditions &&
    state.actions &&
    stateIps.length > 0 &&
    !stateIps.includes('0.0.0.0/0');
  if (stateUsable) {
    modifyRuleSourceIp(maint.RuleArn, stateIps, state.actions);
    console.log(chalk.green(`[${env}] Restored captured OFF state.`));
  } else {
    if (state)
      console.log(
        chalk.yellow(
          `[${env}] Saved state was not a valid OFF snapshot; ignoring it.`
        )
      );
    modifyRuleSourceIp(
      maint.RuleArn,
      [ENV_CONFIG[env].offSentinel],
      maint.Actions
    );
    console.log(
      chalk.yellow(
        `[${env}] No saved state; fell back to known OFF sentinel ` +
          `${ENV_CONFIG[env].offSentinel}.`
      )
    );
  }
  const bypass = findTaggedRule(listener, BYPASS_TAG);
  if (bypass) {
    modifyRuleSourceIp(
      bypass.RuleArn,
      [ENV_CONFIG[env].offSentinel],
      bypass.Actions
    );
    console.log(chalk.green('  Bypass rule cleared.'));
  }
  deleteState(env);
  verify(env, false, listener, maint);
}

async function doBypass(env: string, add: boolean): Promise<void> {
  validateEnvironment(env);
  checkAwsCli();
  const listener = get443ListenerArn(resolveAlbArn(env));
  const bypass = findTaggedRule(listener, BYPASS_TAG);
  if (!bypass)
    fail(
      `No "${BYPASS_TAG}" rule on ${env}. Run: wfuwp maintenance init --env ${env}`
    );
  const sentinel = ENV_CONFIG[env].offSentinel;
  const existing = currentSourceIps(bypass).filter((v) => v !== sentinel);
  if (add) {
    const ip = getMyIp();
    const values = Array.from(new Set([...existing, ip]));
    modifyRuleSourceIp(bypass.RuleArn, values, bypass.Actions);
    console.log(chalk.cyan(`[${env}] Bypass added for ${ip}.`));
    return;
  }
  const values = existing.length ? existing : [sentinel];
  modifyRuleSourceIp(bypass.RuleArn, values, bypass.Actions);
  console.log(chalk.green(`[${env}] Bypass cleared.`));
}

function defaultTargetGroupArn(rules: AlbRule[]): string {
  const def = rules.find((r) => r.Priority === 'default');
  const action = def?.Actions?.[0];
  const tg =
    action?.TargetGroupArn ??
    action?.ForwardConfig?.TargetGroups?.[0]?.TargetGroupArn;
  if (!tg) fail('Could not determine default target group for forward rule.');
  return tg;
}

function nextFreePriority(used: Set<number>, start: number): number {
  let p = start;
  while (used.has(p)) p += 1;
  used.add(p);
  return p;
}

function deleteRule(ruleArn: string): void {
  aws(`elbv2 delete-rule --rule-arn ${ruleArn}`);
}

function createRule(
  listener: string,
  priority: number,
  conditions: unknown,
  actions: unknown,
  tagName: string
): void {
  const c = writeTempJson('crcond', conditions);
  const a = writeTempJson('cract', actions);
  try {
    aws(
      `elbv2 create-rule --listener-arn ${listener} --priority ${priority} ` +
        `--conditions file://${c} --actions file://${a} ` +
        `--tags Key=Name,Value="${tagName}"`
    );
  } finally {
    unlinkSync(c);
    unlinkSync(a);
  }
}

function forwardRules(rules: AlbRule[]): AlbRule[] {
  return rules.filter(
    (r) => r.Priority !== 'default' && r.Actions?.[0]?.Type === 'forward'
  );
}

async function doInit(env: string): Promise<void> {
  validateEnvironment(env);
  if (env !== 'dev' && env !== 'uat')
    fail('init is only allowed on dev or uat. pprd/prod are out of scope.');
  checkAwsCli();
  const listener = get443ListenerArn(resolveAlbArn(env));
  const tg = defaultTargetGroupArn(listRules(listener));
  const existingMaint = findTaggedRule(listener, MAINT_TAG);
  const preservedActions =
    existingMaint?.Actions?.[0]?.Type === 'fixed-response'
      ? existingMaint.Actions
      : fixedResponseAction(buildBody(MAINTENANCE_URL));
  for (const tag of [BYPASS_TAG, MAINT_TAG]) {
    const r = findTaggedRule(listener, tag);
    if (r) {
      deleteRule(r.RuleArn);
      console.log(chalk.gray(`[${env}] Removed stale "${tag}" rule.`));
    }
  }
  let rules = listRules(listener);
  for (const r of forwardRules(rules)) {
    const ips = currentSourceIps(r);
    if (ips.includes(LOOPBACK_CIDR) && ips.length > 1) {
      modifyRuleSourceIp(r.RuleArn, [LOOPBACK_CIDR], r.Actions);
      aws(
        `elbv2 add-tags --resource-arns ${r.RuleArn} ` +
          `--tags Key=Name,Value="${LOOPBACK_TAG}"`
      );
      console.log(
        chalk.yellow(
          `[${env}] Narrowed forward rule (priority ${r.Priority}) from ` +
            `[${ips.join(', ')}] to loopback-only and tagged "${LOOPBACK_TAG}".`
        )
      );
    }
  }
  rules = listRules(listener);
  let loopback = forwardRules(rules).find((r) => {
    const ips = currentSourceIps(r);
    return ips.length === 1 && ips[0] === LOOPBACK_CIDR;
  });
  const used = new Set<number>();
  for (const r of rules)
    if (r.Priority !== 'default') used.add(Number(r.Priority));
  if (!loopback) {
    const lp = nextFreePriority(used, 1);
    createRule(
      listener,
      lp,
      [{ Field: 'source-ip', SourceIpConfig: { Values: [LOOPBACK_CIDR] } }],
      [{ Type: 'forward', TargetGroupArn: tg }],
      LOOPBACK_TAG
    );
    console.log(
      chalk.green(`[${env}] Created loopback forward rule at priority ${lp}.`)
    );
    rules = listRules(listener);
    loopback = forwardRules(rules).find((r) => {
      const ips = currentSourceIps(r);
      return ips.length === 1 && ips[0] === LOOPBACK_CIDR;
    });
  }
  const loopbackP = loopback ? Number(loopback.Priority) : 1;
  const otherForwardP = forwardRules(rules)
    .filter((r) => r.RuleArn !== loopback?.RuleArn)
    .map((r) => Number(r.Priority));
  const ceiling = otherForwardP.length ? Math.min(...otherForwardP) : Infinity;
  const bypassP = nextFreePriority(used, loopbackP + 1);
  const maintP = nextFreePriority(used, bypassP + 1);
  if (maintP >= ceiling)
    fail(
      `Cannot place Maintenance Mode (priority ${maintP}) above an existing ` +
        `general forward rule at priority ${ceiling}. Resolve manually.`
    );
  createRule(
    listener,
    bypassP,
    [
      {
        Field: 'source-ip',
        SourceIpConfig: { Values: [ENV_CONFIG[env].offSentinel] },
      },
    ],
    [{ Type: 'forward', TargetGroupArn: tg }],
    BYPASS_TAG
  );
  console.log(
    chalk.green(`[${env}] Created "${BYPASS_TAG}" rule at priority ${bypassP}.`)
  );
  createRule(
    listener,
    maintP,
    [
      {
        Field: 'source-ip',
        SourceIpConfig: { Values: [ENV_CONFIG[env].offSentinel] },
      },
    ],
    preservedActions,
    MAINT_TAG
  );
  console.log(
    chalk.green(`[${env}] Created "${MAINT_TAG}" rule at priority ${maintP}.`)
  );
  if (!(loopbackP < bypassP && bypassP < maintP && maintP < ceiling))
    fail(
      `Invariant violated: need loopback(${loopbackP}) < bypass(${bypassP}) ` +
        `< maintenance(${maintP}) < other-forwards(${ceiling}).`
    );
  console.log(
    chalk.green(
      `[${env}] Standardized: loopback@${loopbackP} -> bypass@${bypassP} ` +
        `-> maintenance@${maintP}. Maintenance ON shows the page to everyone ` +
        'except loopback and explicit bypass IPs.'
    )
  );
}

interface ProbeSample {
  ts: number;
  code: number | null;
  ms: number;
  err?: string;
}

function probeOnce(url: string, timeoutMs: number): Promise<ProbeSample> {
  return new Promise((resolve) => {
    const start = Date.now();
    let settled = false;
    const done = (s: ProbeSample): void => {
      if (settled) return;
      settled = true;
      resolve(s);
    };
    const req = https.get(
      url,
      {
        headers: { 'User-Agent': 'wfuwp-maintenance-probe/1' },
        timeout: timeoutMs,
      },
      (res) => {
        res.on('data', () => undefined);
        res.on('end', () =>
          done({ ts: start, code: res.statusCode ?? 0, ms: Date.now() - start })
        );
        res.on('error', (e) =>
          done({
            ts: start,
            code: null,
            ms: Date.now() - start,
            err: e.message,
          })
        );
      }
    );
    req.on('error', (e) =>
      done({ ts: start, code: null, ms: Date.now() - start, err: e.message })
    );
    req.on('timeout', () => {
      req.destroy();
      done({ ts: start, code: null, ms: Date.now() - start, err: 'timeout' });
    });
  });
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length)
  );
  return sorted[idx];
}

// "responding" = any HTTP response received with status < 500.
// "outage" = no response (connection error/timeout) OR server-side 5xx.
// 3xx redirects are treated as the site responding, not as downtime.
function isResponding(s: ProbeSample): boolean {
  return s.code !== null && s.code < 500;
}

function isOutage(s: ProbeSample): boolean {
  return s.code === null || s.code >= 500;
}

function summarize(samples: ProbeSample[]): string {
  if (samples.length === 0) return '  (no samples collected)';
  const respondingCount = samples.filter(isResponding).length;
  const outageCount = samples.filter(isOutage).length;
  const errCount = samples.filter((s) => s.code === null).length;
  const buckets: Record<string, number> = {};
  for (const s of samples) {
    const key = s.code === null ? 'err' : `${Math.floor(s.code / 100)}xx`;
    buckets[key] = (buckets[key] || 0) + 1;
  }
  const latencies = samples.map((s) => s.ms).sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  let longestStart = 0;
  let longestEnd = 0;
  let longestLen = 0;
  let curStart = 0;
  let curLen = 0;
  for (const s of samples) {
    if (isOutage(s)) {
      if (curLen === 0) curStart = s.ts;
      curLen += 1;
      if (curLen > longestLen) {
        longestLen = curLen;
        longestStart = curStart;
        longestEnd = s.ts;
      }
    } else {
      curLen = 0;
    }
  }
  const respondingPct = ((respondingCount / samples.length) * 100).toFixed(2);
  const lines = [
    `  samples: ${samples.length}`,
    `  by class: ${Object.entries(buckets)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
    `  responding (<500): ${respondingCount} (${respondingPct}%)`,
    `  outage (5xx or no response): ${outageCount} (errors: ${errCount})`,
    `  latency: p50=${p50}ms p95=${p95}ms`,
  ];
  if (longestLen > 0) {
    const start = new Date(longestStart).toISOString();
    const end = new Date(longestEnd).toISOString();
    lines.push(
      `  longest outage run: ${longestLen} samples, ${start} -> ${end}`
    );
  } else {
    lines.push('  longest outage run: none');
  }
  return lines.join('\n');
}

async function doProbe(
  env: string,
  opts: { interval: string; duration?: string; out?: string; url?: string }
): Promise<void> {
  validateEnvironment(env);
  let url = ENV_CONFIG[env].verifyUrl;
  if (opts.url) {
    if (!/^https?:\/\//i.test(opts.url))
      fail(`--url must be http(s) (got "${opts.url}")`);
    url = opts.url;
  }
  const intervalMs = Math.max(
    100,
    Math.floor(Number(opts.interval || '1') * 1000)
  );
  const durationMs = opts.duration
    ? Math.floor(Number(opts.duration) * 1000)
    : 0;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath =
    opts.out ||
    join(homedir(), 'workspace', 'tmp', `wfuwp-probe-${env}-${stamp}.log`);
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const header =
    `# wfuwp maintenance probe\n# env=${env} url=${url} ` +
    `interval=${intervalMs}ms duration=${durationMs ? durationMs + 'ms' : 'open'} ` +
    `started=${new Date().toISOString()}\n`;
  writeFileSync(outPath, header);
  console.log(
    chalk.bold(`Probing ${url}`) +
      chalk.gray(`  (every ${intervalMs}ms, log: ${outPath}, Ctrl-C to stop)`)
  );
  const samples: ProbeSample[] = [];
  let stopping = false;
  const stop = (): void => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const startedAt = Date.now();
  while (!stopping) {
    const tickStart = Date.now();
    const s = await probeOnce(url, Math.max(intervalMs * 2, 5000));
    samples.push(s);
    const line =
      `${new Date(s.ts).toISOString()} code=${s.code ?? 'ERR'} ` +
      `t=${(s.ms / 1000).toFixed(3)}s` +
      (s.err ? ` err=${s.err}` : '');
    appendFileSync(outPath, line + '\n');
    const colored = isOutage(s) ? chalk.red(line) : chalk.green(line);
    console.log(`  ${colored}`);
    if (durationMs > 0 && Date.now() - startedAt >= durationMs) break;
    if (stopping) break;
    const elapsed = Date.now() - tickStart;
    const wait = Math.max(0, intervalMs - elapsed);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  console.log('');
  console.log(chalk.bold('Probe summary:'));
  console.log(summarize(samples));
  console.log(chalk.gray(`Log: ${outPath}`));
}

export const maintenanceCommand = new Command('maintenance')
  .description('Control the wfu.edu down/maintenance page (ALB switch)')
  .addCommand(
    new Command('status')
      .description('Show whether the maintenance page is on for an environment')
      .requiredOption('-e, --env <env>', 'Environment (dev|uat|pprd|prod)')
      .action(async (opts) => {
        await doStatus(opts.env);
      })
  )
  .addCommand(
    new Command('on')
      .description('Turn the maintenance page ON for an environment')
      .requiredOption('-e, --env <env>', 'Environment (dev|uat|pprd|prod)')
      .option(
        '-p, --page <page>',
        'Page to show: maintenance|down',
        'maintenance'
      )
      .option(
        '--allow-me',
        'Also let your current public IP bypass the page',
        false
      )
      .option('-y, --yes', 'Skip confirmation prompt', false)
      .action(async (opts) => {
        await doOn(opts.env, opts.page, opts.allowMe, opts.yes);
      })
  )
  .addCommand(
    new Command('off')
      .description('Turn the maintenance page OFF for an environment')
      .requiredOption('-e, --env <env>', 'Environment (dev|uat|pprd|prod)')
      .option('-y, --yes', 'Skip confirmation prompt', false)
      .action(async (opts) => {
        await doOff(opts.env, opts.yes);
      })
  )
  .addCommand(
    new Command('allow-me')
      .description('Add your public IP to the bypass rule')
      .requiredOption('-e, --env <env>', 'Environment (dev|uat|pprd|prod)')
      .action(async (opts) => {
        await doBypass(opts.env, true);
      })
  )
  .addCommand(
    new Command('revoke-me')
      .description('Clear the bypass rule')
      .requiredOption('-e, --env <env>', 'Environment (dev|uat|pprd|prod)')
      .action(async (opts) => {
        await doBypass(opts.env, false);
      })
  )
  .addCommand(
    new Command('init')
      .description('Provision standardized rules (dev|uat only)')
      .requiredOption('-e, --env <env>', 'Environment (dev|uat)')
      .action(async (opts) => {
        await doInit(opts.env);
      })
  )
  .addCommand(
    new Command('probe')
      .description(
        'Measure perceived availability of an environment by polling its public URL'
      )
      .requiredOption('-e, --env <env>', 'Environment (dev|uat|pprd|prod)')
      .option(
        '-i, --interval <seconds>',
        'Seconds between samples (min 0.1)',
        '1'
      )
      .option(
        '-d, --duration <seconds>',
        'Stop after this many seconds (default: until Ctrl-C)'
      )
      .option(
        '-u, --url <url>',
        "Override the URL to probe (default: the env's public site)"
      )
      .option(
        '-o, --out <path>',
        'Log file path (default: ~/workspace/tmp/...)'
      )
      .action(async (opts) => {
        await doProbe(opts.env, opts);
      })
  );
