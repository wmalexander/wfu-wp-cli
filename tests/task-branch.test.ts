import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';
import simpleGit from 'simple-git';
import {
  isCustomTaskId,
  slugifyTaskName,
  buildBranchName,
  startTaskBranch,
  prCommentText,
} from '../src/utils/task-branch';

jest.setTimeout(60000);

const TASK = {
  ref: 'WP-8848',
  name: 'Review PHP coding standards page',
  url: 'https://app.clickup.com/t/8558964/WP-8848',
};

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

describe('isCustomTaskId', () => {
  it('accepts WFU-style custom IDs', () => {
    expect(isCustomTaskId('WP-8848')).toBe(true);
    expect(isCustomTaskId('AIT-61481')).toBe(true);
    expect(isCustomTaskId('wp-8848')).toBe(true);
  });

  it('rejects internal ClickUp IDs and malformed values', () => {
    expect(isCustomTaskId('86akkbrcx')).toBe(false);
    expect(isCustomTaskId('WP-')).toBe(false);
    expect(isCustomTaskId('-8848')).toBe(false);
    expect(isCustomTaskId('WP 8848')).toBe(false);
  });
});

describe('slugifyTaskName', () => {
  it('lowercases, strips punctuation, and joins with hyphens', () => {
    expect(slugifyTaskName('Review PHP coding standards page')).toBe(
      'review-php-coding-standards-page'
    );
  });

  it('keeps at most five words', () => {
    expect(
      slugifyTaskName('Fix the thing that breaks every single morning run')
    ).toBe('fix-the-thing-that-breaks');
  });

  it('drops apostrophes instead of hyphenating them', () => {
    expect(slugifyTaskName("Don't break the editor")).toBe(
      'dont-break-the-editor'
    );
  });

  it('truncates very long slugs at a hyphen boundary', () => {
    const slug = slugifyTaskName(
      'Reconfigure supercalifragilisticexpialidocious antidisestablishmentarianism infrastructure immediately please'
    );
    expect(slug.length).toBeLessThanOrEqual(48);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns an empty slug for a name with no usable words', () => {
    expect(slugifyTaskName('!!! ???')).toBe('');
  });
});

describe('prCommentText', () => {
  it('ends with the bare URL so no renderer folds punctuation into it', () => {
    expect(
      prCommentText('https://github.com/org/repo/pull/9', 'feature-wp-1-fix')
    ).toBe(
      'A draft pull request for this task is open on branch feature-wp-1-fix: https://github.com/org/repo/pull/9'
    );
  });
});

describe('buildBranchName', () => {
  it('builds the team convention from the custom ID and title', () => {
    expect(buildBranchName('WP-8848', 'Review PHP coding standards page')).toBe(
      'feature-wp-8848-review-php-coding-standards-page'
    );
  });

  it('omits the slug segment when the title has no usable words', () => {
    expect(buildBranchName('WP-9', '!!!')).toBe('feature-wp-9');
  });
});

describe('startTaskBranch', () => {
  let root: string;
  let origin: string;
  let repo: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'task-branch-test-'));
    origin = join(root, 'origin.git');
    repo = join(root, 'repo');
    execFileSync('git', ['init', '--bare', '--initial-branch=main', origin]);
    execFileSync('git', ['clone', origin, repo], { encoding: 'utf8' });
    git(repo, 'config', 'user.email', 'test@example.com');
    git(repo, 'config', 'user.name', 'Test');
    writeFileSync(join(repo, 'README.md'), 'hello\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'initial');
    git(repo, 'push', '-u', 'origin', 'main');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the branch from origin/main', async () => {
    const result = await startTaskBranch(repo, TASK);
    expect(result.branch).toBe(
      'feature-wp-8848-review-php-coding-standards-page'
    );
    expect(result.base).toBe('origin/main');
    expect(result.pushed).toBe(false);
    const current = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
    expect(current).toBe(result.branch);
  });

  it('pushes the branch when asked', async () => {
    const result = await startTaskBranch(repo, TASK, { push: true });
    expect(result.pushed).toBe(true);
    const remote = git(repo, 'ls-remote', '--heads', 'origin', result.branch);
    expect(remote).toContain(result.branch);
  });

  it('refuses a dirty working tree', async () => {
    writeFileSync(join(repo, 'README.md'), 'changed\n');
    await expect(startTaskBranch(repo, TASK)).rejects.toThrow(
      'uncommitted changes'
    );
  });

  it('refuses when the branch already exists locally', async () => {
    git(repo, 'branch', 'feature-wp-8848-review-php-coding-standards-page');
    await expect(startTaskBranch(repo, TASK)).rejects.toThrow(
      'already exists locally'
    );
  });

  it('refuses when the branch already exists on origin', async () => {
    git(
      repo,
      'push',
      'origin',
      'main:feature-wp-8848-review-php-coding-standards-page'
    );
    await expect(startTaskBranch(repo, TASK)).rejects.toThrow(
      'already exists on origin'
    );
  });

  it('refuses a directory that is not a repository root', async () => {
    await expect(startTaskBranch(root, TASK)).rejects.toThrow(
      'not the root of a git repository'
    );
  });

  it('changes nothing on a dry run', async () => {
    const result = await startTaskBranch(repo, TASK, {
      dryRun: true,
      pr: true,
    });
    expect(result.actions.join(' ')).toContain('Would create');
    expect(result.actions.join(' ')).toContain('draft pull request');
    const current = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
    expect(current).toBe('main');
    const branches = git(repo, 'branch', '--list').trim();
    expect(branches).toBe('* main');
  });

  it('opens a draft pull request through the injected gh runner', async () => {
    const calls: string[][] = [];
    const result = await startTaskBranch(repo, TASK, {
      pr: true,
      runGh: (args) => {
        calls.push(args);
        if (args[0] === '--version') {
          return { status: 0, output: 'gh version 2.0.0' };
        }
        return {
          status: 0,
          output: 'https://github.com/wakeforestuniversity/example/pull/7',
        };
      },
    });
    expect(result.pushed).toBe(true);
    expect(result.prUrl).toBe(
      'https://github.com/wakeforestuniversity/example/pull/7'
    );
    const createCall = calls.find((args) => args[0] === 'pr');
    expect(createCall).toContain('--draft');
    expect(createCall).toContain('WP-8848: Review PHP coding standards page');
    const log = git(repo, 'log', '--oneline', 'origin/main..HEAD').trim();
    expect(log).toContain('Starting WP-8848');
  });

  it('refuses a detached HEAD so stranded commits cannot happen', async () => {
    const sha = git(repo, 'rev-parse', 'HEAD').trim();
    git(repo, 'checkout', '--detach', sha);
    await expect(startTaskBranch(repo, TASK)).rejects.toThrow(
      'HEAD is detached'
    );
  });

  it('names the missing origin remote plainly', async () => {
    const bare = join(root, 'no-origin');
    execFileSync('git', ['init', '--initial-branch=main', bare]);
    git(bare, 'config', 'user.email', 'test@example.com');
    git(bare, 'config', 'user.name', 'Test');
    writeFileSync(join(bare, 'README.md'), 'hello\n');
    git(bare, 'add', '.');
    git(bare, 'commit', '-m', 'initial');
    await expect(startTaskBranch(bare, TASK)).rejects.toThrow(
      'no origin remote'
    );
  });

  it('reports the kept branch when the push itself fails', async () => {
    const hook = join(origin, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\necho rejected by policy >&2\nexit 1\n', {
      mode: 0o755,
    });
    await expect(startTaskBranch(repo, TASK, { push: true })).rejects.toThrow(
      'created and checked out locally, but pushing'
    );
    const current = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
    expect(current).toBe('feature-wp-8848-review-php-coding-standards-page');
  });

  it('reports the create failure when gh exists but pr create fails', async () => {
    await expect(
      startTaskBranch(repo, TASK, {
        pr: true,
        runGh: (args) =>
          args[0] === '--version'
            ? { status: 0, output: 'gh version 2.0.0' }
            : { status: 1, output: 'GraphQL: something broke' },
      })
    ).rejects.toThrow(
      'opening the draft pull request failed: GraphQL: something broke'
    );
    const remote = git(repo, 'ls-remote', '--heads', 'origin').trim();
    expect(remote).toContain('feature-wp-8848');
  });

  it('keeps the branch but reports when gh is unavailable', async () => {
    await expect(
      startTaskBranch(repo, TASK, {
        pr: true,
        runGh: () => ({ status: 127, output: 'gh not found' }),
      })
    ).rejects.toThrow('needs the gh CLI');
    const current = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
    expect(current).toBe('feature-wp-8848-review-php-coding-standards-page');
    const remote = git(repo, 'ls-remote', '--heads', 'origin').trim();
    expect(remote).toContain('feature-wp-8848');
  });
});
