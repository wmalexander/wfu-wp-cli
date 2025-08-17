import { Command } from 'commander';
import chalk from 'chalk';
import { getDiskUsage, formatBytes } from '../utils/disk-space';
import {
  findOrphanedDirectories,
  OrphanedDirectory,
} from '../utils/cleanup-utils';

interface CleanupOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  olderThan?: string;
  path?: string;
}

const formatSize = formatBytes;

function formatAge(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  } else if (hours < 24) {
    return `${Math.round(hours)} hours`;
  } else {
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
}

async function performCleanup(
  directories: OrphanedDirectory[],
  options: CleanupOptions
): Promise<void> {
  if (directories.length === 0) {
    console.log(chalk.green('✓ No orphaned directories found'));
    return;
  }

  const totalSize = directories.reduce((sum, dir) => sum + dir.size, 0);

  console.log(
    chalk.blue(`\nFound ${directories.length} orphaned migration directories:`)
  );
  console.log(chalk.cyan(`Total size: ${formatSize(totalSize)}\n`));

  if (options.verbose) {
    console.log(chalk.gray('Directory listing:'));
    directories.forEach((dir, index) => {
      console.log(
        chalk.gray(
          `  ${index + 1}. ${dir.name} (${formatSize(dir.size)}, ${formatAge(dir.ageHours)} old)`
        )
      );
    });
    console.log('');
  }

  if (options.dryRun) {
    console.log(
      chalk.yellow('DRY RUN - Would remove the following directories:')
    );
    directories.forEach((dir) => {
      console.log(chalk.gray(`  • ${dir.path} (${formatSize(dir.size)})`));
    });
    console.log(
      chalk.cyan(`\nTotal space that would be freed: ${formatSize(totalSize)}`)
    );
    return;
  }

  if (!options.force) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question(
        chalk.yellow(
          `Remove ${directories.length} directories (${formatSize(totalSize)})? (y/N): `
        ),
        resolve
      );
    });

    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(chalk.yellow('Cleanup cancelled'));
      return;
    }
  }

  console.log(chalk.blue('Removing orphaned directories...'));

  let removedCount = 0;
  let freedSpace = 0;

  for (const dir of directories) {
    try {
      require('fs').rmSync(dir.path, { recursive: true, force: true });
      removedCount++;
      freedSpace += dir.size;

      if (options.verbose) {
        console.log(
          chalk.green(`  ✓ Removed ${dir.name} (${formatSize(dir.size)})`)
        );
      }
    } catch (error) {
      console.warn(chalk.yellow(`  ⚠ Failed to remove ${dir.name}: ${error}`));
    }
  }

  console.log(chalk.green(`\n✓ Cleanup completed`));
  console.log(
    chalk.cyan(`  Removed: ${removedCount}/${directories.length} directories`)
  );
  console.log(chalk.cyan(`  Freed: ${formatSize(freedSpace)}`));
}

async function runCleanup(options: CleanupOptions): Promise<void> {
  const cleanupPath = options.path || '/tmp';
  const olderThanHours = options.olderThan ? parseFloat(options.olderThan) : 24;

  if (isNaN(olderThanHours) || olderThanHours < 0) {
    throw new Error('--older-than must be a positive number of hours');
  }

  console.log(chalk.blue.bold('🧹 WFU WordPress Migration Cleanup'));
  console.log(chalk.cyan(`Scanning path: ${cleanupPath}`));
  console.log(
    chalk.cyan(
      `Looking for directories older than: ${formatAge(olderThanHours)}`
    )
  );

  // Show disk usage
  try {
    const diskUsage = getDiskUsage(cleanupPath);
    console.log(
      chalk.gray(
        `Disk usage: ${diskUsage.usagePercent}% (${formatSize(diskUsage.used)} / ${formatSize(diskUsage.total)})`
      )
    );

    if (diskUsage.usagePercent > 90) {
      console.log(chalk.red('⚠ Disk usage is critically high!'));
    } else if (diskUsage.usagePercent > 80) {
      console.log(chalk.yellow('⚠ Disk usage is high'));
    }
  } catch (error) {
    console.warn(chalk.yellow(`Warning: Could not get disk usage: ${error}`));
  }

  console.log('');

  // Find orphaned directories
  console.log(chalk.gray('Scanning for orphaned migration directories...'));
  const orphanedDirs = findOrphanedDirectories(cleanupPath, olderThanHours);

  // Perform cleanup
  await performCleanup(orphanedDirs, options);
}

export const cleanupCommand = new Command('cleanup')
  .description('Clean up orphaned migration temporary directories')
  .option(
    '--dry-run',
    'Preview what would be cleaned without actually removing files',
    false
  )
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option(
    '--older-than <hours>',
    'Only remove directories older than specified hours (default: 24)',
    '24'
  )
  .option(
    '--path <path>',
    'Custom path to scan for orphaned directories (default: /tmp)',
    '/tmp'
  )
  .action(async (options: CleanupOptions) => {
    try {
      await runCleanup(options);
    } catch (error) {
      console.error(
        chalk.red(
          `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  })
  .addHelpText(
    'after',
    `
Examples:
  $ wfuwp cleanup                          # Clean directories older than 24 hours in /tmp
  $ wfuwp cleanup --dry-run                # Preview what would be cleaned
  $ wfuwp cleanup --older-than 12          # Clean directories older than 12 hours
  $ wfuwp cleanup --path /var/tmp          # Clean directories in /var/tmp
  $ wfuwp cleanup --force --verbose        # Force cleanup with detailed output

Notes:
  - Only removes directories starting with 'wp-migrate-', 'wp-env-migrate-', or 'wp-ec2-local-export-'
  - Shows disk usage and warns when space is low
  - Sorts directories by size to show largest first
  - Safe to run - only removes known migration temporary directories
`
  );
