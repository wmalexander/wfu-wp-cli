import { Command } from 'commander';
import chalk from 'chalk';
import {
  MigrationStateManager,
  MigrationSummary,
} from '../utils/migration-state';
import { existsSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';

interface MigrationCleanupOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  all?: boolean;
  migrationId?: string;
  legacy?: boolean;
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatStatus(status: string): string {
  switch (status) {
    case 'completed':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    case 'cancelled':
      return chalk.yellow(status);
    case 'running':
    case 'initializing':
      return chalk.blue(status);
    case 'paused':
      return chalk.cyan(status);
    default:
      return chalk.gray(status);
  }
}

async function cleanupMigrationState(
  migrations: MigrationSummary[],
  options: MigrationCleanupOptions
): Promise<void> {
  if (migrations.length === 0) {
    console.log(chalk.green('✓ No migration state to clean up'));
    return;
  }

  console.log(
    chalk.blue(`\nFound ${migrations.length} migration state records:`)
  );

  if (options.verbose) {
    console.log(chalk.gray('\nMigration records:'));
    migrations.forEach((migration, index) => {
      const duration = migration.duration
        ? formatDuration(migration.duration)
        : 'unknown';
      const progress = `${migration.completedSites}/${migration.totalSites}`;
      console.log(chalk.gray(`  ${index + 1}. ${migration.migrationId}`));
      console.log(
        chalk.gray(
          `     ${migration.sourceEnv} → ${migration.targetEnv} | ${formatStatus(migration.status)} | ${progress} sites | ${duration}`
        )
      );
      console.log(
        chalk.gray(`     Started: ${migration.startTime.toLocaleString()}`)
      );
      if (migration.endTime) {
        console.log(
          chalk.gray(`     Ended: ${migration.endTime.toLocaleString()}`)
        );
      }
      if (!migration.canResume) {
        console.log(chalk.yellow('     ⚠ Migration appears to be running'));
      }
    });
    console.log('');
  }

  if (options.dryRun) {
    console.log(
      chalk.yellow('DRY RUN - Would remove the following migration states:')
    );
    migrations.forEach((migration) => {
      console.log(
        chalk.gray(
          `  • ${migration.migrationId} (${migration.sourceEnv} → ${migration.targetEnv})`
        )
      );
    });
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
          `Remove ${migrations.length} migration state records? This will permanently delete migration logs and state files. (y/N): `
        ),
        resolve
      );
    });

    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log(chalk.yellow('Migration cleanup cancelled'));
      return;
    }
  }

  console.log(chalk.blue('Removing migration state records...'));

  let removedCount = 0;
  let errors: string[] = [];

  for (const migration of migrations) {
    try {
      const logDir = MigrationStateManager.getMigrationDirectory(
        migration.migrationId
      );

      if (existsSync(logDir)) {
        rmSync(logDir, { recursive: true, force: true });
        removedCount++;

        if (options.verbose) {
          console.log(chalk.green(`  ✓ Removed ${migration.migrationId}`));
        }
      } else {
        const legacyLogDir = join(
          MigrationStateManager.getLegacyLogsDirectory(),
          migration.migrationId
        );

        if (existsSync(legacyLogDir)) {
          rmSync(legacyLogDir, { recursive: true, force: true });
          removedCount++;

          if (options.verbose) {
            console.log(
              chalk.green(
                `  ✓ Removed ${migration.migrationId} (legacy location)`
              )
            );
          }
        } else {
          if (options.verbose) {
            console.log(
              chalk.yellow(
                `  ⚠ Migration directory not found: ${migration.migrationId}`
              )
            );
          }
        }
      }
    } catch (error) {
      const errorMsg = `Failed to remove ${migration.migrationId}: ${error}`;
      errors.push(errorMsg);
      console.warn(chalk.yellow(`  ⚠ ${errorMsg}`));
    }
  }

  console.log(chalk.green(`\n✓ Migration cleanup completed`));
  console.log(
    chalk.cyan(
      `  Removed: ${removedCount}/${migrations.length} migration states`
    )
  );

  if (errors.length > 0) {
    console.log(chalk.yellow(`  Errors: ${errors.length}`));
  }
}

async function cleanupLegacyMigrationFiles(
  options: MigrationCleanupOptions
): Promise<void> {
  const legacyDir = MigrationStateManager.getLegacyLogsDirectory();
  const currentDir = MigrationStateManager.getLogsDirectory();

  console.log(chalk.blue('\n🔄 Checking for legacy migration files...'));
  console.log(chalk.cyan(`Legacy location: ${legacyDir}`));
  console.log(chalk.cyan(`Current location: ${currentDir}`));

  if (!existsSync(legacyDir)) {
    console.log(chalk.green('✓ No legacy migration directory found'));
    return;
  }

  try {
    const entries = readdirSync(legacyDir, { withFileTypes: true });
    const migrationDirs = entries.filter(
      (entry) => entry.isDirectory() && entry.name.startsWith('env-migrate-')
    );

    if (migrationDirs.length === 0) {
      console.log(chalk.green('✓ No legacy migration files found'));
      return;
    }

    console.log(
      chalk.yellow(`Found ${migrationDirs.length} legacy migration directories`)
    );

    if (options.verbose) {
      migrationDirs.forEach((dir, index) => {
        console.log(chalk.gray(`  ${index + 1}. ${dir.name}`));
      });
    }

    if (options.dryRun) {
      console.log(
        chalk.yellow(
          'DRY RUN - Would move legacy migration files to current location'
        )
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
            `Move ${migrationDirs.length} legacy migration directories to new location? (y/N): `
          ),
          resolve
        );
      });

      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log(chalk.yellow('Legacy migration cleanup cancelled'));
        return;
      }
    }

    console.log(chalk.blue('Moving legacy migration files...'));

    let movedCount = 0;
    const fs = require('fs');

    for (const dir of migrationDirs) {
      try {
        const srcPath = join(legacyDir, dir.name);
        const destPath = join(currentDir, dir.name);

        if (existsSync(destPath)) {
          console.warn(
            chalk.yellow(
              `  ⚠ Destination already exists, skipping: ${dir.name}`
            )
          );
          continue;
        }

        fs.renameSync(srcPath, destPath);
        movedCount++;

        if (options.verbose) {
          console.log(chalk.green(`  ✓ Moved ${dir.name}`));
        }
      } catch (error) {
        console.warn(chalk.yellow(`  ⚠ Failed to move ${dir.name}: ${error}`));
      }
    }

    console.log(chalk.green(`\n✓ Legacy migration cleanup completed`));
    console.log(
      chalk.cyan(`  Moved: ${movedCount}/${migrationDirs.length} directories`)
    );

    if (movedCount > 0) {
      console.log(
        chalk.cyan(
          '\n💡 Legacy migration files have been moved to the new location.'
        )
      );
      console.log(
        chalk.cyan(
          'You can now use "wfuwp env-migrate --resume" to continue interrupted migrations.'
        )
      );
    }
  } catch (error) {
    console.error(
      chalk.red(`Error processing legacy migration files: ${error}`)
    );
  }
}

async function runMigrationCleanup(
  options: MigrationCleanupOptions
): Promise<void> {
  console.log(chalk.blue.bold('🧹 WFU WordPress Migration State Cleanup'));

  if (options.legacy) {
    await cleanupLegacyMigrationFiles(options);
    return;
  }

  let migrationsToClean: MigrationSummary[] = [];

  if (options.migrationId) {
    const state = MigrationStateManager.loadState(options.migrationId);
    if (!state) {
      throw new Error(`Migration ${options.migrationId} not found`);
    }

    migrationsToClean = [
      {
        migrationId: state.migrationId,
        sourceEnv: state.sourceEnv,
        targetEnv: state.targetEnv,
        status: state.status,
        startTime: state.startTime,
        endTime: state.endTime,
        totalSites: state.totalSites,
        completedSites: state.completedSites,
        failedSites: state.failedSites,
        timeoutSites: state.timeoutSites,
        duration: state.actualDuration,
        canResume: true,
      },
    ];
  } else {
    const allMigrations = MigrationStateManager.findIncompleteMigrations();

    if (options.all) {
      migrationsToClean = allMigrations;
    } else {
      migrationsToClean = allMigrations.filter(
        (m) =>
          m.status === 'failed' ||
          m.status === 'cancelled' ||
          (m.status === 'running' && m.canResume)
      );
    }
  }

  await cleanupMigrationState(migrationsToClean, options);
}

export const migrationCleanupCommand = new Command('migration-cleanup')
  .description('Clean up migration state records and legacy files')
  .option(
    '--dry-run',
    'Preview what would be cleaned without actually removing files',
    false
  )
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option(
    '--all',
    'Clean up all migration states (including completed ones)',
    false
  )
  .option('--migration-id <id>', 'Clean up specific migration by ID')
  .option(
    '--legacy',
    'Move legacy migration files from ./logs to ~/.wfuwp/migration-logs',
    false
  )
  .action(async (options: MigrationCleanupOptions) => {
    try {
      await runMigrationCleanup(options);
    } catch (error) {
      console.error(
        chalk.red(
          `Migration cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  })
  .addHelpText(
    'after',
    `
Examples:
  $ wfuwp migration-cleanup                    # Clean failed/cancelled migration states
  $ wfuwp migration-cleanup --all              # Clean all migration states
  $ wfuwp migration-cleanup --dry-run          # Preview what would be cleaned
  $ wfuwp migration-cleanup --legacy           # Move legacy files to new location
  $ wfuwp migration-cleanup --migration-id xxx # Clean specific migration
  $ wfuwp migration-cleanup --force --verbose  # Force cleanup with detailed output

Notes:
  - By default, only cleans failed, cancelled, or stale running migrations
  - Use --all to clean completed migrations as well
  - Use --legacy to move files from ./logs to ~/.wfuwp/migration-logs
  - This will permanently delete migration logs and state files
  - Use --dry-run to preview changes before applying them
`
  );
