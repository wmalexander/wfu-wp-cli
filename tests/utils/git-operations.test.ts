import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  cleanupRepo,
  isGitRepository,
  classifyGitFailure,
  describeUncommittedChanges,
} from '../../src/utils/git-operations';

jest.setTimeout(120000);

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
}

describe('cleanupRepo', () => {
  let root: string;
  let origin: string;
  let work: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wfuwp-git-'));
    origin = join(root, 'origin.git');
    work = join(root, 'work');
    git(root, ['init', '--bare', '--initial-branch=main', origin]);
    git(root, ['init', '--initial-branch=main', work]);
    git(work, ['config', 'user.name', 'Test']);
    git(work, ['config', 'user.email', 'test@example.com']);
    writeFileSync(join(work, 'README.md'), 'hello\n');
    git(work, ['add', '.']);
    git(work, ['commit', '-m', 'initial']);
    git(work, ['remote', 'add', 'origin', origin]);
    git(work, ['push', '-u', 'origin', 'main']);
    git(work, ['push', 'origin', 'main:dev']);
  });

  function advanceMain(): void {
    writeFileSync(join(work, 'README.md'), 'advanced\n');
    git(work, ['add', '.']);
    git(work, ['commit', '-m', 'advance main']);
    git(work, ['push', 'origin', 'main']);
  }

  function setOriginWritable(writable: boolean): void {
    execFileSync('chmod', ['-R', writable ? 'u+w' : 'a-w', origin]);
  }

  afterEach(() => {
    setOriginWritable(true);
    rmSync(root, { recursive: true, force: true });
  });

  it('reports success when every environment branch syncs', async () => {
    const result = await cleanupRepo(work, { environments: ['dev'] });
    expect(result.skipped).toBe(false);
    expect(result.success).toBe(true);
    expect(result.branchResults).toEqual([
      { branch: 'dev', success: true, action: 'synced' },
    ]);
  });

  it('reports failure when a branch push is rejected by a read-only remote', async () => {
    advanceMain();
    setOriginWritable(false);
    const result = await cleanupRepo(work, {
      environments: ['dev'],
      rebuildBranch: true,
    });
    expect(result.branchResults).toHaveLength(1);
    expect(result.branchResults[0].success).toBe(false);
    expect(result.branchResults[0].action).toBe('failed');
    expect(result.success).toBe(false);
    expect(result.error).toContain('dev');
  });

  it('does not treat a failed branch as a skipped branch', async () => {
    advanceMain();
    setOriginWritable(false);
    const result = await cleanupRepo(work, {
      environments: ['dev'],
      rebuildBranch: true,
    });
    expect(result.branchResults[0].action).not.toBe('skipped');
  });

  it('skips a path that is not a git repository', async () => {
    const plain = join(root, 'plain');
    execFileSync('mkdir', [plain]);
    const result = await cleanupRepo(plain, { environments: ['dev'] });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Not a git repository');
  });

  it('skips a repository with uncommitted changes', async () => {
    writeFileSync(join(work, 'README.md'), 'changed\n');
    const result = await cleanupRepo(work, { environments: ['dev'] });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Uncommitted changes');
  });
});

describe('classifyGitFailure', () => {
  it('recognizes an archived read-only remote', () => {
    expect(
      classifyGitFailure(
        'ERROR: This repository was archived so it is read-only.'
      )
    ).toBe('remote-read-only');
  });

  it('recognizes a denied push', () => {
    expect(classifyGitFailure('remote: Permission denied to user')).toBe(
      'remote-denied'
    );
  });

  it('recognizes a rejected push', () => {
    expect(
      classifyGitFailure('! [rejected] dev -> dev (non-fast-forward)')
    ).toBe('push-rejected');
  });

  it('falls back to unknown for anything else', () => {
    expect(classifyGitFailure('could not read from remote repository')).toBe(
      'unknown'
    );
  });
});

describe('isGitRepository and skip diagnostics', () => {
  let root: string;
  let origin: string;
  let work: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wfuwp-git-diag-'));
    origin = join(root, 'origin.git');
    work = join(root, 'work');
    git(root, ['init', '--bare', '--initial-branch=main', origin]);
    git(root, ['init', '--initial-branch=main', work]);
    git(work, ['config', 'user.name', 'Test']);
    git(work, ['config', 'user.email', 'test@example.com']);
    writeFileSync(join(work, 'README.md'), 'hello\n');
    git(work, ['add', '.']);
    git(work, ['commit', '-m', 'initial']);
    git(work, ['remote', 'add', 'origin', origin]);
    git(work, ['push', '-u', 'origin', 'main']);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('treats a repository root as a git repository', async () => {
    await expect(isGitRepository(work)).resolves.toBe(true);
  });

  it('does not treat a plain subdirectory of a repository as its own repository', async () => {
    const nested = join(work, 'nested-project');
    mkdirSync(nested);
    writeFileSync(join(nested, 'file.txt'), 'x\n');
    await expect(isGitRepository(nested)).resolves.toBe(false);
  });

  it('reports a non-repo subdirectory as not a git repository, not as dirty', async () => {
    const nested = join(work, 'nested-project');
    mkdirSync(nested);
    writeFileSync(join(nested, 'file.txt'), 'x\n');
    const result = await cleanupRepo(nested, { environments: ['dev'] });
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Not a git repository');
  });

  it('flags a skip caused only by untracked files', async () => {
    mkdirSync(join(work, 'testing'));
    writeFileSync(join(work, 'testing', 'notes.md'), 'scratch\n');
    const described = await describeUncommittedChanges(work);
    expect(described.untrackedOnly).toBe(true);
    const result = await cleanupRepo(work, { environments: ['dev'] });
    expect(result.skipReason).toBe('Uncommitted changes');
    expect(result.untrackedOnly).toBe(true);
    expect(result.skipDetail).toContain('untracked');
  });

  it('does not flag untracked-only when a tracked file is modified', async () => {
    writeFileSync(join(work, 'README.md'), 'changed\n');
    const described = await describeUncommittedChanges(work);
    expect(described.untrackedOnly).toBe(false);
    expect(described.detail).toContain('tracked file');
  });

  it('labels a missing remote branch distinctly from a failure', async () => {
    const result = await cleanupRepo(work, { environments: ['dev'] });
    expect(result.success).toBe(true);
    expect(result.branchResults[0]).toMatchObject({
      branch: 'dev',
      success: true,
      action: 'skipped',
      failureKind: 'remote-branch-missing',
    });
  });

  it('surfaces a remote failure during a dry run instead of reporting success', async () => {
    git(work, ['remote', 'set-url', 'origin', join(root, 'missing.git')]);
    const result = await cleanupRepo(work, {
      environments: ['dev'],
      dryRun: true,
      rebuildBranch: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
