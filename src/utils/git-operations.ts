import simpleGit, {
  SimpleGit,
  SimpleGitOptions,
  StatusResult,
} from 'simple-git';
import { realpathSync } from 'fs';

const gitOptions: Partial<SimpleGitOptions> = {
  baseDir: process.cwd(),
  binary: 'git',
  maxConcurrentProcesses: 1,
  config: [],
};

function createGit(repoPath: string): SimpleGit {
  return simpleGit({ ...gitOptions, baseDir: repoPath });
}

export type BranchFailureKind =
  | 'remote-branch-missing'
  | 'remote-read-only'
  | 'remote-denied'
  | 'push-rejected'
  | 'unknown';

export interface BranchSyncResult {
  branch: string;
  success: boolean;
  action: 'synced' | 'rebuilt' | 'skipped' | 'failed';
  failureKind?: BranchFailureKind;
  error?: string;
}

export function classifyGitFailure(message: string): BranchFailureKind {
  if (/archived so it is read-only|read[- ]only/i.test(message)) {
    return 'remote-read-only';
  }
  if (
    /permission denied|403|access denied|authentication failed/i.test(message)
  ) {
    return 'remote-denied';
  }
  if (/\[rejected\]|non-fast-forward|failed to push/i.test(message)) {
    return 'push-rejected';
  }
  return 'unknown';
}

export interface RepoCleanupResult {
  repoPath: string;
  repoName: string;
  success: boolean;
  primaryBranch: string;
  branchResults: BranchSyncResult[];
  prunedBranches: string[];
  skipped: boolean;
  skipReason?: string;
  skipDetail?: string;
  untrackedOnly?: boolean;
  error?: string;
}

export interface CleanupOptions {
  verbose?: boolean;
  rebuildBranch?: boolean;
  dryRun?: boolean;
  environments?: string[];
}

export async function isGitRepository(path: string): Promise<boolean> {
  try {
    const git = createGit(path);
    const topLevel = (await git.revparse(['--show-toplevel'])).trim();
    if (!topLevel) {
      return false;
    }
    return realpathSync(topLevel) === realpathSync(path);
  } catch {
    return false;
  }
}

export async function describeUncommittedChanges(
  repoPath: string
): Promise<{ detail: string; untrackedOnly: boolean }> {
  const git = createGit(repoPath);
  const status: StatusResult = await git.status();
  const untracked = status.not_added.length;
  const tracked = status.files.length - untracked;
  const untrackedOnly = tracked === 0 && untracked > 0;
  const parts: string[] = [];
  if (tracked > 0) {
    parts.push(`${tracked} tracked file${tracked === 1 ? '' : 's'} changed`);
  }
  if (untracked > 0) {
    parts.push(`${untracked} untracked file${untracked === 1 ? '' : 's'}`);
  }
  const names = status.not_added.slice(0, 3).join(', ');
  const suffix =
    untrackedOnly && names ? ` (${names}${untracked > 3 ? ', ...' : ''})` : '';
  return { detail: `${parts.join(', ')}${suffix}`, untrackedOnly };
}

export async function hasUncommittedChanges(
  repoPath: string
): Promise<boolean> {
  const git = createGit(repoPath);
  const status: StatusResult = await git.status();
  return !status.isClean();
}

export async function detectPrimaryBranch(repoPath: string): Promise<string> {
  const git = createGit(repoPath);
  const branches = await git.branchLocal();
  if (branches.all.includes('main')) {
    return 'main';
  }
  if (branches.all.includes('master')) {
    return 'master';
  }
  return 'main';
}

export async function remoteBranchExists(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const git = createGit(repoPath);
  try {
    const refs = await git.listRemote(['--heads', 'origin', branch]);
    return refs.trim().length > 0;
  } catch {
    return false;
  }
}

export async function localBranchExists(
  repoPath: string,
  branch: string
): Promise<boolean> {
  const git = createGit(repoPath);
  const branches = await git.branchLocal();
  return branches.all.includes(branch);
}

function failureResult(branch: string, error: unknown): BranchSyncResult {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return {
    branch,
    success: false,
    action: 'failed',
    failureKind: classifyGitFailure(message),
    error: message,
  };
}

async function syncBranchNormal(
  git: SimpleGit,
  branch: string,
  dryRun: boolean
): Promise<BranchSyncResult> {
  if (dryRun) {
    try {
      await git.fetch(['--dry-run', '--quiet', 'origin', branch]);
      return { branch, success: true, action: 'synced' };
    } catch (error) {
      return failureResult(branch, error);
    }
  }
  try {
    if (await localBranchExistsInternal(git, branch)) {
      await git.branch(['-D', branch]);
    }
    await git.fetch(['--quiet', 'origin', branch]);
    await git.checkout(['-b', branch, `origin/${branch}`]);
    await git.pull(['--quiet', 'origin', branch]);
    return { branch, success: true, action: 'synced' };
  } catch (error) {
    return failureResult(branch, error);
  }
}

async function syncBranchRebuild(
  git: SimpleGit,
  branch: string,
  primaryBranch: string,
  dryRun: boolean
): Promise<BranchSyncResult> {
  if (dryRun) {
    try {
      await git.push([
        '--dry-run',
        '--force',
        '--quiet',
        'origin',
        `${primaryBranch}:${branch}`,
      ]);
      return { branch, success: true, action: 'rebuilt' };
    } catch (error) {
      return failureResult(branch, error);
    }
  }
  try {
    await git.checkout(primaryBranch);
    if (await localBranchExistsInternal(git, branch)) {
      await git.branch(['-D', branch]);
    }
    try {
      await git.push(['--quiet', 'origin', `:${branch}`]);
    } catch {
      // Remote branch may not exist, that's ok
    }
    await git.checkout(['-b', branch]);
    await git.push(['--quiet', '-u', 'origin', branch]);
    return { branch, success: true, action: 'rebuilt' };
  } catch (error) {
    return failureResult(branch, error);
  }
}

async function localBranchExistsInternal(
  git: SimpleGit,
  branch: string
): Promise<boolean> {
  const branches = await git.branchLocal();
  return branches.all.includes(branch);
}

async function migrateMasterToMain(
  git: SimpleGit,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return;
  const branches = await git.branchLocal();
  if (branches.all.includes('master') && !branches.all.includes('main')) {
    await git.branch(['-m', 'master', 'main']);
    try {
      await git.push(['-u', 'origin', 'main']);
      await git.push(['origin', ':master']);
    } catch {
      // Remote operations may fail if already migrated
    }
  }
}

async function pruneAndCleanup(
  git: SimpleGit,
  dryRun: boolean
): Promise<string[]> {
  const prunedBranches: string[] = [];
  if (dryRun) return prunedBranches;
  try {
    const pruneOutput = await git.remote(['prune', 'origin']);
    const pruneMatches = pruneOutput?.match(/\[pruned\].*origin\/(\S+)/g) || [];
    for (const match of pruneMatches) {
      const branchMatch = match.match(/origin\/(\S+)/);
      if (branchMatch) {
        const branchName = branchMatch[1];
        prunedBranches.push(branchName);
        try {
          await git.branch(['-D', branchName]);
        } catch {
          // Branch may not exist locally
        }
      }
    }
  } catch {
    // Prune failures are non-fatal
  }
  return prunedBranches;
}

export async function cleanupRepo(
  repoPath: string,
  options: CleanupOptions = {}
): Promise<RepoCleanupResult> {
  const repoName = repoPath.split('/').pop() || repoPath;
  const environments = options.environments || ['dev', 'uat'];
  const result: RepoCleanupResult = {
    repoPath,
    repoName,
    success: false,
    primaryBranch: 'main',
    branchResults: [],
    prunedBranches: [],
    skipped: false,
  };
  try {
    if (!(await isGitRepository(repoPath))) {
      result.skipped = true;
      result.skipReason = 'Not a git repository';
      return result;
    }
    if (await hasUncommittedChanges(repoPath)) {
      const { detail, untrackedOnly } =
        await describeUncommittedChanges(repoPath);
      result.skipped = true;
      result.skipReason = 'Uncommitted changes';
      result.skipDetail = detail;
      result.untrackedOnly = untrackedOnly;
      return result;
    }
    const git = createGit(repoPath);
    result.primaryBranch = await detectPrimaryBranch(repoPath);
    if (options.dryRun) {
      await git.fetch(['--dry-run', '--quiet', 'origin']);
    } else {
      await git.checkout(result.primaryBranch);
      await git.pull(['--quiet', 'origin', result.primaryBranch]);
      await git.fetch(['--tags', '--quiet']);
      if (result.primaryBranch === 'master') {
        await migrateMasterToMain(git, options.dryRun || false);
        result.primaryBranch = 'main';
      }
    }
    for (const branch of environments) {
      const remoteExists = await remoteBranchExists(repoPath, branch);
      if (!remoteExists && !options.rebuildBranch) {
        result.branchResults.push({
          branch,
          success: true,
          action: 'skipped',
          failureKind: 'remote-branch-missing',
          error: 'Remote branch does not exist',
        });
        continue;
      }
      let branchResult: BranchSyncResult;
      if (options.rebuildBranch) {
        branchResult = await syncBranchRebuild(
          git,
          branch,
          result.primaryBranch,
          options.dryRun || false
        );
      } else {
        branchResult = await syncBranchNormal(
          git,
          branch,
          options.dryRun || false
        );
      }
      result.branchResults.push(branchResult);
    }
    result.prunedBranches = await pruneAndCleanup(git, options.dryRun || false);
    if (!options.dryRun) {
      await git.checkout(result.primaryBranch);
    }
    const failedBranches = result.branchResults.filter((r) => !r.success);
    result.success = failedBranches.length === 0;
    if (failedBranches.length > 0) {
      result.error = failedBranches
        .map((r) => `${r.branch}: ${r.error || 'Unknown error'}`)
        .join('; ');
    }
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }
  return result;
}
