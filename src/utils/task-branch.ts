import simpleGit, { SimpleGit } from 'simple-git';
import { spawnSync } from 'child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  isGitRepository,
  hasUncommittedChanges,
  describeUncommittedChanges,
  detectPrimaryBranch,
  localBranchExists,
  remoteBranchExists,
} from './git-operations';

export interface TaskRef {
  /// The human-facing reference used in the branch name, e.g. WP-8848.
  ref: string;
  name: string;
  url: string;
}

export interface StartBranchOptions {
  push?: boolean;
  pr?: boolean;
  dryRun?: boolean;
  /// Injectable gh runner so tests never spawn the real CLI.
  runGh?: (args: string[], cwd: string) => { status: number; output: string };
}

export interface StartBranchResult {
  branch: string;
  base: string;
  actions: string[];
  pushed: boolean;
  prUrl?: string;
}

/// A ClickUp custom task ID like WP-8848: a letter-led prefix, a hyphen, digits.
export function isCustomTaskId(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(value);
}

export function slugifyTaskName(name: string, maxWords = 5): string {
  const words = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, maxWords);
  let slug = words.join('-');
  if (slug.length > 48) {
    slug = slug.slice(0, 48).replace(/-[^-]*$/, '');
  }
  return slug;
}

export function buildBranchName(taskRef: string, taskName: string): string {
  const slug = slugifyTaskName(taskName);
  const refPart = taskRef.toLowerCase();
  return slug ? `feature-${refPart}-${slug}` : `feature-${refPart}`;
}

function defaultRunGh(
  args: string[],
  cwd: string
): { status: number; output: string } {
  const result = spawnSync('gh', args, {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
  });
  if (result.error) {
    return { status: 127, output: result.error.message };
  }
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
  return { status: result.status ?? 1, output };
}

function prBodySkeleton(task: TaskRef): string {
  return [
    '## TL;DR',
    '',
    '(Describe the change in plain English once the work exists.)',
    '',
    '## Why this is worth your time',
    '',
    '(Fill in before requesting review.)',
    '',
    '## Review gates',
    '',
    '(Answer all five before requesting review: actual problem, demonstrable impact, would prioritize, tested by the author, context for the reviewer.)',
    '',
    '## Testing already done',
    '',
    '(Say exactly what ran.)',
    '',
    '## Ticket and evidence',
    '',
    `- ClickUp: ${task.ref}, "${task.name}"`,
    `- ${task.url}`,
    '',
    '## Development stages',
    '',
    '- [ ] **Local (DDEV):** built and exercised locally.',
    '- [ ] **Remote dev:** deployed to dev and exercised there.',
    '- [ ] **Automated review:** all findings resolved.',
    '- [ ] **Tests:** full suite green.',
    '',
  ].join('\n');
}

async function assertOnABranch(git: SimpleGit): Promise<void> {
  const head = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  if (head === 'HEAD') {
    throw new Error(
      'HEAD is detached. Check out a branch first, so nothing you have committed here gets stranded.'
    );
  }
}

async function resolveBase(repoPath: string, git: SimpleGit): Promise<string> {
  const remotes = await git.getRemotes();
  if (!remotes.some((remote) => remote.name === 'origin')) {
    throw new Error('This repository has no origin remote.');
  }
  const primary = await detectPrimaryBranch(repoPath);
  if (!(await remoteBranchExists(repoPath, primary))) {
    throw new Error(
      `origin has no "${primary}" branch, so there is nothing to branch from.`
    );
  }
  await git.fetch(['--quiet', 'origin', primary]);
  return `origin/${primary}`;
}

export async function startTaskBranch(
  repoPath: string,
  task: TaskRef,
  options: StartBranchOptions = {}
): Promise<StartBranchResult> {
  if (!(await isGitRepository(repoPath))) {
    throw new Error(`${repoPath} is not the root of a git repository.`);
  }
  if (await hasUncommittedChanges(repoPath)) {
    const { detail } = await describeUncommittedChanges(repoPath);
    throw new Error(
      `The working tree has uncommitted changes (${detail}). Commit or stash them first.`
    );
  }
  const git = simpleGit({ baseDir: repoPath, binary: 'git' });
  await assertOnABranch(git);
  const branch = buildBranchName(task.ref, task.name);
  const base = await resolveBase(repoPath, git);
  if (await localBranchExists(repoPath, branch)) {
    throw new Error(
      `Branch ${branch} already exists locally. Check it out or delete it first.`
    );
  }
  if (await remoteBranchExists(repoPath, branch)) {
    throw new Error(
      `Branch ${branch} already exists on origin. Someone may already be on this task.`
    );
  }
  const wantsPush = Boolean(options.push || options.pr);
  const result: StartBranchResult = {
    branch,
    base,
    actions: [],
    pushed: false,
  };
  if (options.dryRun) {
    result.actions.push(`Would create ${branch} from ${base}.`);
    if (wantsPush) {
      result.actions.push(`Would push ${branch} to origin.`);
    }
    if (options.pr) {
      result.actions.push(
        `Would add an empty starting commit and open a draft pull request titled "${task.ref}: ${task.name}".`
      );
    }
    return result;
  }
  await git.checkout(['-b', branch, '--no-track', base]);
  result.actions.push(`Created ${branch} from ${base}.`);
  if (options.pr) {
    try {
      await git.raw([
        'commit',
        '--allow-empty',
        '-m',
        `Starting ${task.ref}: ${task.name}`,
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The branch ${branch} is created and checked out, but the starting commit failed (${message}). Commit hooks or signing settings are the usual cause.`
      );
    }
    result.actions.push(
      'Added an empty starting commit so the pull request can open.'
    );
  }
  if (wantsPush) {
    try {
      await git.push(['--quiet', '-u', 'origin', branch]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The branch ${branch} is created and checked out locally, but pushing it to origin failed (${message}).`
      );
    }
    result.pushed = true;
    result.actions.push(`Pushed ${branch} to origin.`);
  }
  if (options.pr) {
    const runGh = options.runGh ?? defaultRunGh;
    const versionCheck = runGh(['--version'], repoPath);
    if (versionCheck.status !== 0) {
      throw new Error(
        `The branch is created and pushed, but the draft pull request needs the gh CLI, which is not available (${versionCheck.output || 'gh not found'}).`
      );
    }
    const bodyDir = mkdtempSync(join(tmpdir(), 'wfuwp-task-branch-'));
    const bodyFile = join(bodyDir, 'pr-body.md');
    try {
      writeFileSync(bodyFile, prBodySkeleton(task));
      const create = runGh(
        [
          'pr',
          'create',
          '--draft',
          '--head',
          branch,
          '--title',
          `${task.ref}: ${task.name}`,
          '--body-file',
          bodyFile,
        ],
        repoPath
      );
      if (create.status !== 0) {
        throw new Error(
          `The branch is created and pushed, but opening the draft pull request failed: ${create.output}`
        );
      }
      const urlMatch = create.output.match(/https:\/\/github\.com\/\S+/);
      result.prUrl = urlMatch ? urlMatch[0] : undefined;
      result.actions.push(
        result.prUrl
          ? `Opened a draft pull request: ${result.prUrl}`
          : 'Opened a draft pull request.'
      );
    } finally {
      rmSync(bodyDir, { recursive: true, force: true });
    }
  }
  return result;
}
