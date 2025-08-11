import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { Config } from '../utils/config';
import { FileNaming } from '../utils/file-naming';

interface MigrateOptions {
  from: string;
  to: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  homepage?: boolean;
  customDomain?: string;
  logDir?: string;
  simple?: boolean;
  complete?: boolean;
  skipBackup?: boolean;
  skipS3?: boolean;
  syncS3?: boolean;
  workDir?: string;
  keepFiles?: boolean;
  timeout?: string;
}

interface EnvironmentMapping {
  urlReplacements: Array<{ from: string; to: string }>;
  s3Replacements: Array<{ from: string; to: string }>;
}

export const migrateCommand = new Command('migrate')
  .description(
    'Migrate WordPress multisite database between environments (Phase 2)'
  )
  .argument('<site-id>', 'Numeric site identifier (e.g., 43)')
  .requiredOption('--from <env>', 'Source environment (dev, uat, pprd, prod)')
  .requiredOption('--to <env>', 'Target environment (dev, uat, pprd, prod)')
  .option('--dry-run', 'Preview changes without executing', false)
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--simple', 'Use Phase 1 behavior (search-replace only)', false)
  .option('--complete', 'Run complete workflow (default)', true)
  .option('--skip-backup', 'Skip target backup (dangerous)', false)
  .option('--skip-s3', 'Skip S3 archival', false)
  .option('--sync-s3', 'Sync WordPress files between S3 environments', false)
  .option('--work-dir <path>', 'Custom working directory', undefined)
  .option('--keep-files', 'Do not delete local SQL files', false)
  .option('--homepage', 'Include homepage tables (default: exclude)', false)
  .option(
    '--timeout <minutes>',
    'Custom timeout in minutes for large databases (default: 20)',
    '20'
  )
  .option(
    '--custom-domain <mapping>',
    'Custom domain replacement (format: source:target)'
  )
  .option('--log-dir <path>', 'Custom log directory', './logs')
  .action(async (siteId: string, options: MigrateOptions) => {
    try {
      await runMigration(siteId, options);
    } catch (error) {
      console.error(
        chalk.red(
          `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

async function runMigration(
  siteId: string,
  options: MigrateOptions
): Promise<void> {
  validateInputs(siteId, options);

  // Import required utilities
  const { DatabaseOperations } = await import('../utils/database');
  const { S3Operations } = await import('../utils/s3');

  if (options.simple) {
    // Phase 1 behavior - simple search-replace
    return runSimpleMigration(siteId, options);
  }

  // Phase 2 behavior - complete workflow
  return runCompleteMigration(
    siteId,
    options,
    DatabaseOperations,
    S3Operations
  );
}

async function runSimpleMigration(
  siteId: string,
  options: MigrateOptions
): Promise<void> {
  // This maintains the Phase 1 behavior for users who want the simple mode
  // Uses migration database for search-replace only

  if (!Config.hasRequiredMigrationConfig()) {
    console.error(
      chalk.red('Migration database configuration incomplete. Please run:')
    );
    console.log(chalk.yellow('  wfuwp config wizard'));
    process.exit(1);
  }

  const { DatabaseOperations } = await import('../utils/database');
  DatabaseOperations.checkDockerAvailability();

  const migrationConfig = Config.getMigrationDbConfig();
  const environmentMapping = getEnvironmentMapping(options.from, options.to);
  const skipTables = getSkipTables(options.homepage || false);
  const logFile = setupLogging(options.logDir || './logs');

  console.log(chalk.blue.bold(`Starting simple migration for site ${siteId}`));
  console.log(chalk.cyan(`Source: ${options.from} → Target: ${options.to}`));
  console.log(
    chalk.yellow('Using migration database for search-replace operations')
  );

  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN MODE - No changes will be made'));
  }

  if (!options.force && !options.dryRun) {
    const confirmation = await confirmMigration(
      siteId,
      options.from,
      options.to
    );
    if (!confirmation) {
      console.log(chalk.yellow('Migration cancelled'));
      return;
    }
  }

  console.log(chalk.green('Executing search-replace operations...'));

  for (const replacement of environmentMapping.urlReplacements) {
    await executeWpCliCommand(
      'search-replace',
      [replacement.from, replacement.to],
      {
        skipTables,
        dbConfig: migrationConfig,
        logFile,
        dryRun: options.dryRun,
        verbose: options.verbose,
      }
    );
  }

  for (const replacement of environmentMapping.s3Replacements) {
    await executeWpCliCommand(
      'search-replace',
      [replacement.from, replacement.to],
      {
        skipTables,
        dbConfig: migrationConfig,
        logFile,
        dryRun: options.dryRun,
        verbose: options.verbose,
      }
    );
  }

  if (options.customDomain) {
    const [sourceDomain, targetDomain] = options.customDomain.split(':');
    if (!sourceDomain || !targetDomain) {
      throw new Error('Custom domain must be in format: source:target');
    }

    await executeWpCliCommand('search-replace', [sourceDomain, targetDomain], {
      skipTables,
      dbConfig: migrationConfig,
      logFile,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
  }

  if (options.dryRun) {
    console.log(chalk.green('✓ Simple migration dry run completed'));
  } else {
    console.log(chalk.green('✓ Simple migration completed'));
  }

  console.log(chalk.blue(`Log file: ${logFile}`));
}

async function runCompleteMigration(
  siteId: string,
  options: MigrateOptions,
  DatabaseOperations: any,
  S3Operations: any
): Promise<void> {
  console.log(
    chalk.blue.bold(`Starting complete migration for site ${siteId}`)
  );
  console.log(chalk.cyan(`Source: ${options.from} → Target: ${options.to}`));

  // Pre-flight checks
  await runPreflightChecks(siteId, options, DatabaseOperations, S3Operations);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const workDir = options.workDir || `/tmp/wp-migrate-${timestamp}`;

  // Create working directory
  if (!existsSync(workDir)) {
    mkdirSync(workDir, { recursive: true });
  }

  console.log(chalk.cyan(`Working directory: ${workDir}`));

  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN MODE - No actual changes will be made'));
  }

  if (!options.force && !options.dryRun) {
    const confirmation = await confirmMigration(
      siteId,
      options.from,
      options.to,
      { syncS3: options.syncS3 }
    );
    if (!confirmation) {
      console.log(chalk.yellow('Migration cancelled'));
      return;
    }
  }

  const sqlFiles: string[] = [];

  // Get site name for better file naming
  const siteName = await FileNaming.getSiteName(siteId, options.from);
  console.log(chalk.cyan(`Site: ${siteName} (ID: ${siteId})`));

  try {
    // Step 1: Export from source environment
    console.log(
      chalk.blue('Step 1: Exporting tables from source environment...')
    );
    const sourceFile = FileNaming.generateFilePath(workDir, {
      siteId,
      environment: options.from,
      purpose: 'initial-export',
      siteName,
    });

    if (!options.dryRun) {
      const timeoutMinutes = parseInt(options.timeout || '20', 10);
      const sourceExport = await DatabaseOperations.exportSiteTables(
        siteId,
        options.from,
        sourceFile,
        options.verbose,
        timeoutMinutes
      );
      sqlFiles.push(sourceFile);
      console.log(
        chalk.green(
          `✓ Exported ${sourceExport.tableCount} tables (${(sourceExport.fileSize / 1024 / 1024).toFixed(2)} MB)`
        )
      );
    } else {
      console.log(chalk.gray('  Would export site tables from source'));
    }

    // Step 2: Import to migration database
    console.log(chalk.blue('Step 2: Importing to migration database...'));
    if (!options.dryRun) {
      await DatabaseOperations.cleanMigrationDatabase();
      const timeoutMinutes = parseInt(options.timeout || '20', 10);
      const importResult = await DatabaseOperations.importSqlFile(
        sourceFile,
        Config.getMigrationDbConfig(),
        options.verbose,
        timeoutMinutes
      );
      console.log(
        chalk.green(
          `✓ Imported ${importResult.tableCount} tables to migration database`
        )
      );
    } else {
      console.log(chalk.gray('  Would import to migration database'));
    }

    // Step 3: Run search-replace operations
    console.log(chalk.blue('Step 3: Running URL replacements...'));
    if (!options.dryRun) {
      await runSqlSearchReplace(siteId, options);
      console.log(chalk.green('✓ Completed URL and S3 replacements'));
    } else {
      console.log(chalk.gray('  Would run search-replace operations'));
    }

    // Step 4: Backup target tables (if not skipped)
    let backupFile = '';
    if (!options.skipBackup) {
      console.log(chalk.blue('Step 4: Backing up existing target tables...'));
      backupFile = FileNaming.generateFilePath(workDir, {
        siteId,
        environment: options.to,
        purpose: 'backup-export',
        siteName,
      });

      if (!options.dryRun) {
        const timeoutMinutes = parseInt(options.timeout || '20', 10);
        const backupExport = await DatabaseOperations.exportSiteTables(
          siteId,
          options.to,
          backupFile,
          options.verbose,
          timeoutMinutes
        );
        sqlFiles.push(backupFile);
        console.log(
          chalk.green(
            `✓ Backed up ${backupExport.tableCount} tables (${(backupExport.fileSize / 1024 / 1024).toFixed(2)} MB)`
          )
        );
      } else {
        console.log(chalk.gray('  Would backup existing target tables'));
      }
    } else {
      console.log(
        chalk.yellow('Step 4: Skipping target backup (--skip-backup flag)')
      );
    }

    // Step 5: Export migrated tables
    console.log(chalk.blue('Step 5: Exporting migrated tables...'));
    const migratedFile = FileNaming.generateFilePath(workDir, {
      siteId,
      environment: options.to, // Target environment for migrated export
      purpose: 'migrated-export',
      siteName,
    });

    if (!options.dryRun) {
      const timeoutMinutes = parseInt(options.timeout || '20', 10);
      const migratedExport = await DatabaseOperations.exportSiteTables(
        siteId,
        'migration', // Export from migration database
        migratedFile,
        options.verbose,
        timeoutMinutes
      );
      sqlFiles.push(migratedFile);
      console.log(
        chalk.green(`✓ Exported ${migratedExport.tableCount} migrated tables`)
      );
    } else {
      console.log(chalk.gray('  Would export migrated tables'));
    }

    // Step 6: Import to target environment
    console.log(chalk.blue('Step 6: Importing to target environment...'));
    if (!options.dryRun) {
      const timeoutMinutes = parseInt(options.timeout || '20', 10);
      const targetImport = await DatabaseOperations.importSqlFile(
        migratedFile,
        Config.getEnvironmentConfig(options.to),
        options.verbose,
        timeoutMinutes
      );
      console.log(
        chalk.green(
          `✓ Imported ${targetImport.tableCount} tables to ${options.to} environment`
        )
      );
    } else {
      console.log(chalk.gray('  Would import to target environment'));
    }

    // Step 7: Sync WordPress files (if requested)
    if (options.syncS3) {
      console.log(chalk.blue('Step 7: Syncing WordPress files...'));

      if (!options.dryRun) {
        const { S3Sync } = await import('../utils/s3sync');

        // Check AWS CLI availability
        if (!S3Sync.checkAwsCli()) {
          console.warn(
            chalk.yellow('Warning: AWS CLI not available, skipping file sync')
          );
        } else {
          const syncResult = await S3Sync.syncWordPressFiles(
            siteId,
            options.from,
            options.to,
            {
              dryRun: false,
              verbose: options.verbose,
              force: true, // Already confirmed by user for the migration
            }
          );

          if (syncResult.success) {
            console.log(chalk.green(`✓ ${syncResult.message}`));
          } else {
            console.warn(chalk.yellow(`Warning: ${syncResult.message}`));
          }
        }
      } else {
        console.log(
          chalk.gray('  Would sync WordPress files between S3 buckets')
        );
      }
    }

    // Step 8: Archive to S3 (if not skipped)
    if (!options.skipS3 && sqlFiles.length > 0) {
      console.log(chalk.blue('Step 8: Archiving to S3...'));

      if (!options.dryRun) {
        const metadata = {
          siteId,
          fromEnvironment: options.from,
          toEnvironment: options.to,
          timestamp,
          siteName,
          sourceExport: sourceFile,
          targetBackup: backupFile,
          migratedExport: migratedFile,
        };

        if (Config.hasS3Config()) {
          try {
            // Archive to S3
            const s3Result = await S3Operations.archiveToS3(
              sqlFiles,
              metadata,
              options.verbose
            );

            if (s3Result.files.length > 0) {
              console.log(
                chalk.green(`✓ Archived ${s3Result.files.length} files to S3`)
              );
              console.log(
                chalk.cyan(
                  `   S3 location: s3://${s3Result.bucket}/${s3Result.path}`
                )
              );
            } else {
              console.log(
                chalk.yellow(`✓ S3 upload failed, falling back to local backup`)
              );

              // Fall back to local backup when S3 fails
              const backupDir = Config.getBackupPath();
              const timestampDir = join(backupDir, timestamp);

              if (!existsSync(timestampDir)) {
                mkdirSync(timestampDir, { recursive: true });
              }

              const fs = require('fs');
              let copiedFiles = 0;

              for (const [fileName, filePath] of Object.entries(sqlFiles)) {
                const backupPath = join(timestampDir, fileName);
                fs.copyFileSync(filePath, backupPath);
                copiedFiles++;
              }

              const metadataPath = join(
                timestampDir,
                'migration-metadata.json'
              );
              fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

              console.log(
                chalk.green(`✓ Archived ${copiedFiles} files to local backup`)
              );
              console.log(chalk.cyan(`   Local location: ${timestampDir}`));
            }
          } catch (error) {
            console.log(
              chalk.yellow(`✓ S3 archival failed, using local backup instead`)
            );

            // Fall back to local backup when S3 completely fails
            const backupDir = Config.getBackupPath();
            const timestampDir = join(backupDir, timestamp);

            if (!existsSync(timestampDir)) {
              mkdirSync(timestampDir, { recursive: true });
            }

            const fs = require('fs');
            let copiedFiles = 0;

            for (const [fileName, filePath] of Object.entries(sqlFiles)) {
              const backupPath = join(timestampDir, fileName);
              fs.copyFileSync(filePath, backupPath);
              copiedFiles++;
            }

            const metadataPath = join(timestampDir, 'migration-metadata.json');
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            console.log(
              chalk.green(`✓ Archived ${copiedFiles} files to local backup`)
            );
            console.log(chalk.cyan(`   Local location: ${timestampDir}`));
          }
        } else {
          // Archive to local backup directory
          const backupDir = Config.getBackupPath();
          const timestampDir = join(backupDir, timestamp);

          if (!existsSync(timestampDir)) {
            mkdirSync(timestampDir, { recursive: true });
          }

          // Copy SQL files to backup directory
          const fs = require('fs');
          let copiedFiles = 0;

          for (const [fileName, filePath] of Object.entries(sqlFiles)) {
            const backupPath = join(timestampDir, fileName);
            fs.copyFileSync(filePath, backupPath);
            copiedFiles++;
          }

          // Save metadata
          const metadataPath = join(timestampDir, 'migration-metadata.json');
          fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

          console.log(
            chalk.green(`✓ Archived ${copiedFiles} files to local backup`)
          );
          console.log(chalk.cyan(`   Local location: ${timestampDir}`));
        }
      } else {
        if (Config.hasS3Config()) {
          console.log(chalk.gray('  Would archive SQL files to S3'));
        } else {
          console.log(
            chalk.gray(
              `  Would archive SQL files to local backup: ${Config.getBackupPath()}`
            )
          );
        }
      }
    } else if (options.skipS3) {
      console.log(
        chalk.yellow('Step 8: Skipping S3 archival (--skip-s3 flag)')
      );
    }

    // Step 9: Cleanup
    console.log(chalk.blue('Step 9: Cleaning up...'));
    if (!options.dryRun) {
      await DatabaseOperations.cleanMigrationDatabase();

      if (!options.keepFiles) {
        sqlFiles.forEach((file) => {
          try {
            require('fs').unlinkSync(file);
          } catch (error) {
            console.warn(chalk.yellow(`Warning: Could not delete ${file}`));
          }
        });
        require('fs').rmdirSync(workDir, { recursive: true });
        console.log(chalk.green('✓ Cleaned up temporary files'));
      } else {
        console.log(chalk.cyan(`✓ Kept local files in: ${workDir}`));
      }
    } else {
      console.log(
        chalk.gray('  Would clean up migration database and temp files')
      );
    }

    if (options.dryRun) {
      console.log(
        chalk.green(
          '\n🎭 Complete migration dry run finished - no changes made'
        )
      );
    } else {
      console.log(
        chalk.green('\n🎉 Complete migration finished successfully!')
      );
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );

    // Attempt cleanup on failure
    if (!options.dryRun) {
      console.log(chalk.yellow('Attempting to clean up migration database...'));
      try {
        await DatabaseOperations.cleanMigrationDatabase();
      } catch (cleanupError) {
        console.warn(
          chalk.yellow('Warning: Could not clean migration database')
        );
      }
    }

    throw error;
  }
}

function validateInputs(siteId: string, options: MigrateOptions): void {
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum) || siteIdNum <= 0) {
    throw new Error('Site ID must be a positive integer');
  }

  const validEnvs = ['dev', 'uat', 'pprd', 'prod'];
  if (!validEnvs.includes(options.from)) {
    throw new Error(
      `Invalid source environment. Must be one of: ${validEnvs.join(', ')}`
    );
  }

  if (!validEnvs.includes(options.to)) {
    throw new Error(
      `Invalid target environment. Must be one of: ${validEnvs.join(', ')}`
    );
  }

  if (options.from === options.to) {
    throw new Error('Source and target environments cannot be the same');
  }
}

async function runPreflightChecks(
  siteId: string,
  options: MigrateOptions,
  DatabaseOperations: any,
  S3Operations: any
): Promise<void> {
  console.log(chalk.blue('Running pre-flight checks...'));

  // Check Docker availability
  DatabaseOperations.checkDockerAvailability();

  // Check environment configurations
  if (!Config.hasRequiredEnvironmentConfig(options.from)) {
    throw new Error(
      `Source environment '${options.from}' is not configured. Run 'wfuwp config wizard'.`
    );
  }

  if (!Config.hasRequiredEnvironmentConfig(options.to)) {
    throw new Error(
      `Target environment '${options.to}' is not configured. Run 'wfuwp config wizard'.`
    );
  }

  // Check migration database configuration
  if (!Config.hasRequiredMigrationConfig()) {
    throw new Error(
      'Migration database is not configured. Run "wfuwp config wizard".'
    );
  }

  // Check S3 configuration and backup path
  if (!options.skipS3 && !Config.hasS3Config()) {
    console.log(
      chalk.yellow(
        `  S3 not configured - will use local backups in: ${Config.getBackupPath()}`
      )
    );
    // Ensure local backup directory exists
    const backupDir = Config.getBackupPath();
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
      console.log(
        chalk.green(`  ✓ Created local backup directory: ${backupDir}`)
      );
    }
  } else if (!options.skipS3) {
    console.log(chalk.gray(`  S3 configuration found - testing access...`));
  }

  // Test database connections
  console.log(chalk.gray(`  Testing ${options.from} database connection...`));
  const fromConnectionTest = await DatabaseOperations.testConnection(
    options.from
  );
  if (!fromConnectionTest) {
    console.log(
      chalk.yellow(
        `  Warning: Connection test failed for ${options.from}, but proceeding anyway`
      )
    );
  } else {
    console.log(
      chalk.green(`  ✓ ${options.from} database connection successful`)
    );
  }

  console.log(chalk.gray(`  Testing ${options.to} database connection...`));
  const toConnectionTest = await DatabaseOperations.testConnection(options.to);
  if (!toConnectionTest) {
    console.log(
      chalk.yellow(
        `  Warning: Connection test failed for ${options.to}, but proceeding anyway`
      )
    );
  } else {
    console.log(
      chalk.green(`  ✓ ${options.to} database connection successful`)
    );
  }

  // Check that site exists in source
  const sourceTables = DatabaseOperations.getSiteTables(siteId, options.from);
  if (sourceTables.length === 0) {
    throw new Error(`Site ${siteId} not found in ${options.from} environment`);
  }

  // Check migration database is clean
  if (!(await DatabaseOperations.verifyMigrationDatabase())) {
    console.log(
      chalk.yellow('  Migration database is not clean, will be reset')
    );
  }

  // Test S3 access if configured and not skipped
  if (!options.skipS3 && Config.hasS3Config()) {
    if (!(await S3Operations.testS3Access())) {
      console.log(
        chalk.yellow(
          '  Warning: S3 access failed - will use local backups instead'
        )
      );
      // Ensure local backup directory exists when S3 fails
      const backupDir = Config.getBackupPath();
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
        console.log(
          chalk.green(`  ✓ Created local backup directory: ${backupDir}`)
        );
      } else {
        console.log(
          chalk.cyan(`  ✓ Local backup directory ready: ${backupDir}`)
        );
      }
    } else {
      console.log(
        chalk.green('  ✓ S3 access verified - will use S3 for backups')
      );
    }
  }

  // Test AWS CLI for S3 sync if requested
  if (options.syncS3) {
    const { S3Sync } = await import('../utils/s3sync');
    console.log(chalk.gray('  Testing AWS CLI for file sync...'));
    if (!S3Sync.checkAwsCli()) {
      throw new Error(
        'AWS CLI is not available but required for --sync-s3. Please install and configure AWS CLI.'
      );
    }
  }

  console.log(chalk.green('✓ Pre-flight checks passed'));
}

async function runSqlSearchReplace(
  siteId: string,
  options: MigrateOptions
): Promise<void> {
  const environmentMapping = getEnvironmentMapping(options.from, options.to);

  // Combine URL and S3 replacements
  const allReplacements = [
    ...environmentMapping.urlReplacements,
    ...environmentMapping.s3Replacements,
  ];

  // Add custom domain replacement if specified
  if (options.customDomain) {
    const [sourceDomain, targetDomain] = options.customDomain.split(':');
    if (!sourceDomain || !targetDomain) {
      throw new Error('Custom domain must be in format: source:target');
    }
    allReplacements.push({ from: sourceDomain, to: targetDomain });
  }

  // Run SQL-based search-replace on migration database
  const { DatabaseOperations } = await import('../utils/database');
  await DatabaseOperations.sqlSearchReplace(
    'migration',
    allReplacements,
    siteId,
    options.verbose
  );
}

async function runSearchReplace(
  siteId: string,
  options: MigrateOptions
): Promise<void> {
  const migrationConfig = Config.getMigrationDbConfig();
  const environmentMapping = getEnvironmentMapping(options.from, options.to);
  const skipTables = getSkipTables(options.homepage || false);
  const logFile = setupLogging(options.logDir || './logs');

  for (const replacement of environmentMapping.urlReplacements) {
    await executeWpCliCommand(
      'search-replace',
      [replacement.from, replacement.to],
      {
        skipTables,
        dbConfig: migrationConfig,
        logFile,
        dryRun: options.dryRun,
        verbose: options.verbose,
      }
    );
  }

  for (const replacement of environmentMapping.s3Replacements) {
    await executeWpCliCommand(
      'search-replace',
      [replacement.from, replacement.to],
      {
        skipTables,
        dbConfig: migrationConfig,
        logFile,
        dryRun: options.dryRun,
        verbose: options.verbose,
      }
    );
  }

  if (options.customDomain) {
    const [sourceDomain, targetDomain] = options.customDomain.split(':');
    if (!sourceDomain || !targetDomain) {
      throw new Error('Custom domain must be in format: source:target');
    }

    await executeWpCliCommand('search-replace', [sourceDomain, targetDomain], {
      skipTables,
      dbConfig: migrationConfig,
      logFile,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
  }
}

function getEnvironmentMapping(from: string, to: string): EnvironmentMapping {
  const mappings: Record<string, EnvironmentMapping> = {
    'prod->pprd': {
      urlReplacements: [
        { from: '.wfu.edu', to: '.pprd.wfu.edu' },
        { from: '.pprd.pprd.wfu.edu', to: '.pprd.wfu.edu' },
        { from: 'www.pprd.wfu.edu', to: 'pprd.wfu.edu' },
        { from: 'aws.pprd.wfu.edu', to: 'aws.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-prod-us', to: 'wordpress-pprd-us' },
        { from: 'prod.wp.cdn.aws.wfu.edu', to: 'pprd.wp.cdn.aws.wfu.edu' },
      ],
    },
    'pprd->prod': {
      urlReplacements: [
        { from: '.pprd.wfu.edu', to: '.wfu.edu' },
        { from: 'pprd.wfu.edu', to: 'www.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-pprd-us', to: 'wordpress-prod-us' },
        { from: 'pprd.wp.cdn.aws.wfu.edu', to: 'prod.wp.cdn.aws.wfu.edu' },
      ],
    },
    'uat->dev': {
      urlReplacements: [
        { from: '.uat.wfu.edu', to: '.dev.wfu.edu' },
        { from: 'uat.wfu.edu', to: 'dev.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-uat-us', to: 'wordpress-dev-us' },
        { from: 'uat.wp.cdn.aws.wfu.edu', to: 'dev.wp.cdn.aws.wfu.edu' },
      ],
    },
    'dev->uat': {
      urlReplacements: [
        { from: '.dev.wfu.edu', to: '.uat.wfu.edu' },
        { from: 'dev.wfu.edu', to: 'uat.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-dev-us', to: 'wordpress-uat-us' },
        { from: 'dev.wp.cdn.aws.wfu.edu', to: 'uat.wp.cdn.aws.wfu.edu' },
      ],
    },
  };

  const key = `${from}->${to}`;
  if (!mappings[key]) {
    throw new Error(`Migration path ${from} -> ${to} is not supported`);
  }

  return mappings[key];
}

function getSkipTables(includeHomepage: boolean): string {
  const baseTables =
    'wp_blogmeta,wp_blogs,wp_registration_log,wp_signups,wp_site,wp_sitemeta,wp_usermeta,wp_users';

  if (includeHomepage) {
    return baseTables;
  }

  return (
    baseTables +
    ',wp_commentmeta,wp_comments,wp_links,wp_options,wp_postmeta,wp_posts,wp_term_relationships,wp_term_taxonomy,wp_termmeta,wp_terms'
  );
}

function setupLogging(logDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logPath = join(logDir, `wpcli-migrate-${timestamp}`);

  if (!existsSync(logPath)) {
    mkdirSync(logPath, { recursive: true });
  }

  return join(logPath, 'migration.log');
}

async function confirmMigration(
  siteId: string,
  from: string,
  to: string,
  options?: { syncS3?: boolean }
): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let message = `Are you sure you want to migrate site ${siteId} from ${from} to ${to}`;
  if (options?.syncS3) {
    message += ' (including WordPress files)';
  }
  message += '? (y/N): ';

  return new Promise((resolve) => {
    readline.question(chalk.yellow(message), (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function executeWpCliCommand(
  command: string,
  args: string[],
  options: {
    skipTables: string;
    dbConfig: any;
    logFile: string;
    dryRun?: boolean;
    verbose?: boolean;
  }
): Promise<void> {
  // Build WP-CLI command
  const wpCliArgs = [
    command,
    ...args,
    '--all-tables',
    `--skip-tables=${options.skipTables}`,
  ];

  if (options.dryRun) {
    wpCliArgs.push('--dry-run');
  }

  const wpCliCommand = `wp ${wpCliArgs.join(' ')}`;

  // Use Docker to run WP-CLI search-replace
  const bashScript = [
    'cd /var/www/html',
    'wp core download',
    'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
    `${wpCliCommand} --log=/logs/${basename(options.logFile)}`,
  ].join(' && ');

  if (options.verbose) {
    console.log(
      chalk.gray(
        `Executing Docker WP-CLI: ${wpCliCommand.replace(/--dbpass=[^ ]+/, '--dbpass=****')}`
      )
    );
  }

  try {
    const output = execSync(
      `docker run --rm \\
      --memory=4g \\
      -v "${resolve(dirname(options.logFile))}:/logs" \\
      -e WORDPRESS_DB_HOST="${options.dbConfig.host}" \\
      -e WORDPRESS_DB_USER="${options.dbConfig.user}" \\
      -e WORDPRESS_DB_PASSWORD="${options.dbConfig.password}" \\
      -e WORDPRESS_DB_NAME="${options.dbConfig.database}" \\
      -e WP_CLI_PHP_ARGS="-d memory_limit=2048M -d max_execution_time=600" \\
      -e PHP_MEMORY_LIMIT=2048M \\
      wordpress:cli \\
      bash -c '${bashScript}'`,
      {
        encoding: 'utf8',
        stdio: options.verbose ? 'inherit' : 'pipe',
        shell: '/bin/bash',
      }
    );

    if (!options.verbose && output) {
      console.log(output);
    }
  } catch (error) {
    throw new Error(
      `Docker WP-CLI command failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
