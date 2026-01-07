import simpleGit, { SimpleGit, StatusResult } from 'simple-git';

export interface BranchSyncResult {
  branch: string;
  success: boolean;
  action: 'synced' | 'rebuilt' | 'skipped';
  error?: string;
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
    const git = simpleGit(path);
    await git.revparse(['--is-inside-work-tree']);
    return true;
  } catch {
    return false;
  }
}

export async function hasUncommittedChanges(
  repoPath: string
): Promise<boolean> {
  const git = simpleGit(repoPath);
  const status: StatusResult = await git.status();
  return !status.isClean();
}

export async function detectPrimaryBranch(repoPath: string): Promise<string> {
  const git = simpleGit(repoPath);
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
  const git = simpleGit(repoPath);
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
  const git = simpleGit(repoPath);
  const branches = await git.branchLocal();
  return branches.all.includes(branch);
}

async function syncBranchNormal(
  git: SimpleGit,
  branch: string,
  dryRun: boolean
): Promise<BranchSyncResult> {
  if (dryRun) {
    return { branch, success: true, action: 'synced' };
  }
  try {
    if (await localBranchExistsInternal(git, branch)) {
      await git.branch(['-D', branch]);
    }
    await git.fetch('origin', branch);
    await git.checkout(['-b', branch, `origin/${branch}`]);
    await git.pull('origin', branch);
    return { branch, success: true, action: 'synced' };
  } catch (error) {
    return {
      branch,
      success: false,
      action: 'skipped',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function syncBranchRebuild(
  git: SimpleGit,
  branch: string,
  primaryBranch: string,
  dryRun: boolean
): Promise<BranchSyncResult> {
  if (dryRun) {
    return { branch, success: true, action: 'rebuilt' };
  }
  try {
    await git.checkout(primaryBranch);
    if (await localBranchExistsInternal(git, branch)) {
      await git.branch(['-D', branch]);
    }
    try {
      await git.push('origin', `:${branch}`);
    } catch {
      // Remote branch may not exist, that's ok
    }
    await git.checkout(['-b', branch]);
    await git.push(['-u', 'origin', branch]);
    return { branch, success: true, action: 'rebuilt' };
  } catch (error) {
    return {
      branch,
      success: false,
      action: 'skipped',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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
      result.skipped = true;
      result.skipReason = 'Uncommitted changes';
      return result;
    }
    const git = simpleGit(repoPath);
    result.primaryBranch = await detectPrimaryBranch(repoPath);
    if (!options.dryRun) {
      await git.checkout(result.primaryBranch);
      await git.pull('origin', result.primaryBranch);
      await git.fetch(['--tags']);
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
    result.success = result.branchResults.every(
      (r) => r.success || r.action === 'skipped'
    );
  } catch (error) {
    result.success = false;
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }
  return result;
}
