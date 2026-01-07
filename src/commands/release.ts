import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';
import {
  cleanupRepo,
  RepoCleanupResult,
  CleanupOptions,
} from '../utils/git-operations';
import {
  findWpContentPath,
  discoverRepositories,
  getTotalRepoCount,
  RepoFilter,
} from '../utils/repo-discovery';

interface ReleaseCleanupOptions {
  verbose?: boolean;
  rebuildBranch?: boolean;
  dryRun?: boolean;
  current?: boolean;
  plugins?: boolean;
  themes?: boolean;
  muPlugins?: boolean;
  path?: string;
}

function formatBranchResults(result: RepoCleanupResult): string {
  const branches = result.branchResults
    .filter((r) => r.action !== 'skipped' || r.error)
    .map((r) => {
      if (r.success && r.action === 'synced') return r.branch;
      if (r.success && r.action === 'rebuilt') return `${r.branch} (rebuilt)`;
      return `${r.branch} (failed)`;
    });
  if (branches.length === 0) {
    return 'no branches to sync';
  }
  return branches.join(', ');
}

async function processRepoCategory(
  categoryName: string,
  repos: string[],
  options: CleanupOptions,
  verbose: boolean
): Promise<{ processed: number; skipped: number; failed: number }> {
  const stats = { processed: 0, skipped: 0, failed: 0 };
  if (repos.length === 0) return stats;
  console.log('');
  console.log(chalk.blue.bold(`Processing ${categoryName}:`));
  for (const repoPath of repos) {
    const result = await cleanupRepo(repoPath, options);
    if (result.skipped) {
      stats.skipped++;
      console.log(
        chalk.yellow(`  ⚠ ${result.repoName} - ${result.skipReason}, skipped`)
      );
    } else if (result.success) {
      stats.processed++;
      const branchInfo = formatBranchResults(result);
      console.log(chalk.green(`  ✓ ${result.repoName} - ${branchInfo}`));
      if (verbose && result.prunedBranches.length > 0) {
        console.log(
          chalk.gray(`    Pruned: ${result.prunedBranches.join(', ')}`)
        );
      }
    } else {
      stats.failed++;
      console.log(
        chalk.red(`  ✗ ${result.repoName} - ${result.error || 'Unknown error'}`)
      );
    }
  }
  return stats;
}

async function runReleaseCleanup(
  options: ReleaseCleanupOptions
): Promise<void> {
  console.log(chalk.blue.bold('Release Cleanup'));
  console.log(chalk.gray('───────────────'));
  console.log('');
  const environments = Config.get('release.environments')?.split(',') || [
    'dev',
    'uat',
  ];
  const cleanupOptions: CleanupOptions = {
    verbose: options.verbose,
    rebuildBranch: options.rebuildBranch,
    dryRun: options.dryRun,
    environments,
  };
  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN - No changes will be made'));
    console.log('');
  }
  if (options.rebuildBranch) {
    console.log(
      chalk.yellow(
        'REBUILD MODE - Environment branches will be recreated from primary'
      )
    );
    console.log('');
  }
  if (options.current) {
    const cwd = process.cwd();
    console.log(chalk.cyan(`Processing current directory: ${cwd}`));
    console.log('');
    const result = await cleanupRepo(cwd, cleanupOptions);
    if (result.skipped) {
      console.log(chalk.yellow(`⚠ ${result.skipReason}`));
      return;
    }
    if (result.success) {
      const branchInfo = formatBranchResults(result);
      console.log(chalk.green(`✓ Branches synced: ${branchInfo}`));
      if (options.verbose && result.prunedBranches.length > 0) {
        console.log(chalk.gray(`Pruned: ${result.prunedBranches.join(', ')}`));
      }
    } else {
      console.log(chalk.red(`✗ Failed: ${result.error || 'Unknown error'}`));
      process.exit(1);
    }
    return;
  }
  let wpContentPath = options.path;
  if (!wpContentPath) {
    wpContentPath = Config.get('wordpress.path');
    if (wpContentPath) {
      const wpContent = findWpContentPath(wpContentPath);
      wpContentPath = wpContent || undefined;
    }
  }
  if (!wpContentPath) {
    wpContentPath = findWpContentPath(process.cwd()) || undefined;
  }
  if (!wpContentPath) {
    console.error(
      chalk.red(
        'Could not find wp-content directory. Use --path or run from within a WordPress installation.'
      )
    );
    process.exit(1);
  }
  console.log(chalk.cyan(`WordPress path: ${wpContentPath}`));
  console.log(chalk.cyan(`Environment branches: ${environments.join(', ')}`));
  console.log('');
  console.log(chalk.gray('Scanning repositories...'));
  const filter: RepoFilter = {
    muPlugins: options.muPlugins,
    plugins: options.plugins,
    themes: options.themes,
  };
  const repos = await discoverRepositories(wpContentPath, filter);
  const totalCount = getTotalRepoCount(repos);
  if (totalCount === 0) {
    console.log(chalk.yellow('No repositories found.'));
    return;
  }
  console.log(
    chalk.cyan(
      `  Found: ${repos.plugins.length} plugins, ${repos.themes.length} themes, ${repos.muPlugins.length} mu-plugins`
    )
  );
  const totals = { processed: 0, skipped: 0, failed: 0 };
  if (repos.muPlugins.length > 0) {
    const stats = await processRepoCategory(
      'mu-plugins',
      repos.muPlugins,
      cleanupOptions,
      options.verbose || false
    );
    totals.processed += stats.processed;
    totals.skipped += stats.skipped;
    totals.failed += stats.failed;
  }
  if (repos.plugins.length > 0) {
    const stats = await processRepoCategory(
      'plugins',
      repos.plugins,
      cleanupOptions,
      options.verbose || false
    );
    totals.processed += stats.processed;
    totals.skipped += stats.skipped;
    totals.failed += stats.failed;
  }
  if (repos.themes.length > 0) {
    const stats = await processRepoCategory(
      'themes',
      repos.themes,
      cleanupOptions,
      options.verbose || false
    );
    totals.processed += stats.processed;
    totals.skipped += stats.skipped;
    totals.failed += stats.failed;
  }
  console.log('');
  const summaryParts = [
    `${totals.processed}/${totalCount} repositories cleaned`,
  ];
  if (totals.skipped > 0) {
    summaryParts.push(`${totals.skipped} skipped`);
  }
  if (totals.failed > 0) {
    summaryParts.push(`${totals.failed} failed`);
  }
  console.log(chalk.blue.bold(`Summary: ${summaryParts.join(', ')}`));
  if (totals.failed > 0) {
    process.exit(1);
  }
}

export const releaseCommand = new Command('release')
  .description('Release management commands')
  .addCommand(
    new Command('cleanup')
      .description('Sync git branches after release (post-merge cleanup)')
      .option('-v, --verbose', 'Show detailed output')
      .option(
        '--rebuild-branch',
        'Rebuild environment branches from primary instead of syncing'
      )
      .option('--dry-run', 'Preview actions without making changes')
      .option('--current', 'Only process the current directory')
      .option('--plugins', 'Only process plugins (wfu-* prefixed)')
      .option('--themes', 'Only process themes')
      .option('--mu-plugins', 'Only process mu-plugins')
      .option('--path <path>', 'WordPress installation path')
      .action(async (options: ReleaseCleanupOptions) => {
        try {
          await runReleaseCleanup(options);
        } catch (error) {
          console.error(
            chalk.red(
              `Release cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
      .addHelpText(
        'after',
        `
Examples:
  $ wfuwp release cleanup                    # Sync all WFU repositories
  $ wfuwp release cleanup --dry-run          # Preview what would happen
  $ wfuwp release cleanup --current          # Only process current directory
  $ wfuwp release cleanup --plugins          # Only process WFU plugins
  $ wfuwp release cleanup --rebuild-branch   # Recreate env branches from primary
  $ wfuwp release cleanup --verbose          # Show detailed output

Notes:
  - Discovers repositories by walking up from current directory to find wp-content
  - Only processes wfu-* prefixed plugins, all themes, and all mu-plugins
  - Skips repositories with uncommitted changes
  - Default environment branches: dev, uat (configurable via release.environments)
`
      )
  );
