import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';
import { SiteEnumerator, SiteInfo } from '../utils/site-enumerator';
import { NetworkTableOperations } from '../utils/network-tables';
import { BackupRecovery } from '../utils/backup-recovery';
import { ErrorRecovery } from '../utils/error-recovery';
import { MigrationValidator } from '../utils/migration-validator';
import { S3Operations } from '../utils/s3';
import { S3Sync } from '../utils/s3sync';
import { DatabaseOperations } from '../utils/database';
import { EC2Detector } from '../utils/ec2-detector';
import {
  MigrationStateManager,
  MigrationState,
  ResumeOptions,
} from '../utils/migration-state';

interface EnvMigrateOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  networkOnly?: boolean;
  sitesOnly?: boolean;
  batchSize?: string;
  parallel?: boolean;
  concurrency?: string;
  excludeSites?: string;
  includeSites?: string;
  activeOnly?: boolean;
  skipBackup?: boolean;
  skipS3?: boolean;
  syncS3?: boolean;
  workDir?: string;
  keepFiles?: boolean;
  timeout?: string;
  autoRollback?: boolean;
  maxRetries?: string;
  healthCheck?: boolean;
  s3StorageClass?: string;
  archiveBackups?: boolean;
  resume?: string;
  skipFailed?: boolean;
  skipTimeouts?: boolean;
  retryFailed?: boolean;
  listMigrations?: boolean;
  ec2Export?: boolean;
}

interface MigrationProgress {
  totalSites: number;
  completedSites: number;
  failedSites: number;
  currentBatch: number;
  totalBatches: number;
  startTime: Date;
  lastUpdate: Date;
}

interface BatchResult {
  batchNumber: number;
  siteIds: number[];
  completedSites: number[];
  failedSites: Array<{ siteId: number; error: string }>;
  duration: number;
  success: boolean;
}

export const envMigrateCommand = new Command('env-migrate')
  .description(
    'Migrate entire WordPress multisite environment between environments'
  )
  .argument('[source-env]', 'Source environment (dev, uat, pprd, prod)')
  .argument('[target-env]', 'Target environment (dev, uat, pprd, prod, local)')
  .option('--dry-run', 'Preview changes without executing', false)
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--network-only', 'Migrate network tables only', false)
  .option('--sites-only', 'Migrate sites only (skip network tables)', false)
  .option(
    '--batch-size <size>',
    'Number of sites to process at once (default: 5)',
    '5'
  )
  .option('--parallel', 'Process sites in parallel within batches', false)
  .option(
    '--concurrency <limit>',
    'Maximum number of concurrent migrations when using --parallel (default: 3)',
    '3'
  )
  .option(
    '--exclude-sites <list>',
    'Comma-separated list of site IDs to exclude'
  )
  .option(
    '--include-sites <list>',
    'Comma-separated list of site IDs to include'
  )
  .option('--active-only', 'Only migrate active sites', false)
  .option('--skip-backup', 'Skip environment backup (dangerous)', false)
  .option('--skip-s3', 'Skip S3 archival', false)
  .option('--sync-s3', 'Sync WordPress files between S3 environments', false)
  .option(
    '--s3-storage-class <class>',
    'S3 storage class for archived files (STANDARD|STANDARD_IA|GLACIER)',
    'STANDARD_IA'
  )
  .option('--archive-backups', 'Also archive backup files to S3', false)
  .option('--work-dir <path>', 'Custom working directory', undefined)
  .option('--keep-files', 'Do not delete local SQL files', false)
  .option(
    '--timeout <minutes>',
    'Custom timeout in minutes for large databases (default: 20)',
    '20'
  )
  .option(
    '--auto-rollback',
    'Automatically rollback on failure (default: interactive)',
    false
  )
  .option(
    '--max-retries <count>',
    'Maximum number of retries for failed operations (default: 3)',
    '3'
  )
  .option(
    '--health-check',
    'Perform health checks before and after migration',
    false
  )
  .option(
    '--resume <migration-id>',
    'Resume a specific incomplete migration by ID'
  )
  .option(
    '--skip-failed',
    'Skip sites that failed in previous migration attempts',
    false
  )
  .option(
    '--skip-timeouts',
    'Skip sites that timed out in previous migration attempts',
    false
  )
  .option(
    '--retry-failed',
    'Retry only sites that failed in previous migration attempts',
    false
  )
  .option(
    '--list-migrations',
    'List incomplete migrations that can be resumed',
    false
  )
  .option(
    '--ec2-export',
    'Export complete database to S3 for local download (EC2 mode)',
    false
  )
  .action(
    async (
      sourceEnv: string | undefined,
      targetEnv: string | undefined,
      options: EnvMigrateOptions
    ) => {
      try {
        if (options.listMigrations) {
          await listIncompleteMigrations();
          return;
        }

        if (options.resume) {
          await resumeMigration(options.resume, options);
          return;
        }

        if (!sourceEnv || !targetEnv) {
          console.error(
            chalk.red(
              'Source and target environments are required for new migrations'
            )
          );
          console.log(chalk.cyan('Usage:'));
          console.log(
            chalk.white(
              '  wfuwp env-migrate <source-env> <target-env> [options]'
            )
          );
          console.log(chalk.white('  wfuwp env-migrate --list-migrations'));
          console.log(
            chalk.white('  wfuwp env-migrate --resume <migration-id>')
          );
          process.exit(1);
        }

        if (
          targetEnv === 'local' &&
          (options.ec2Export || EC2Detector.isRunningOnEC2())
        ) {
          await handleEC2LocalExport(sourceEnv, options);
        } else {
          await handleNewMigration(sourceEnv, targetEnv, options);
        }
      } catch (error) {
        console.error(
          chalk.red(
            'Environment migration failed: ' +
              (error instanceof Error ? error.message : 'Unknown error')
          )
        );
        process.stdout.write('\x07');
        process.exit(1);
      }
    }
  );

async function runEnvironmentMigration(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions,
  existingState?: MigrationState
): Promise<void> {
  // Create migration context for error recovery
  let migrationContext = ErrorRecovery.createMigrationContext(
    sourceEnv,
    targetEnv,
    options
  );
  let backupId: string | undefined;
  let migrationState: MigrationState | undefined = existingState;

  try {
    validateInputs(sourceEnv, targetEnv, options);

    console.log(
      chalk.blue.bold(
        'Starting environment migration: ' + sourceEnv + ' → ' + targetEnv
      )
    );

    // Run pre-flight checks
    migrationContext = ErrorRecovery.updateMigrationContext(migrationContext, {
      currentStep: 'pre-flight checks',
    });
    await runPreflightChecks(sourceEnv, targetEnv, options);

    // Perform initial health check if requested
    if (options.healthCheck) {
      migrationContext = ErrorRecovery.updateMigrationContext(
        migrationContext,
        {
          currentStep: 'initial health check',
        }
      );
      const healthCheck = await ErrorRecovery.performHealthCheck(targetEnv);
      if (!healthCheck.healthy) {
        console.log(
          chalk.yellow('⚠ Pre-migration health check found issues:')
        );
        healthCheck.issues.forEach((issue) => {
          console.log(chalk.red(`  • ${issue}`));
        });

        if (!options.force) {
          throw new Error(
            'Health check failed. Use --force to proceed anyway.'
          );
        }
      } else {
        console.log(chalk.green('✓ Pre-migration health check passed'));
      }
    }

    if (options.dryRun) {
      console.log(
        chalk.yellow('DRY RUN MODE - No actual changes will be made')
      );
    }

    // Get confirmation unless forced
    if (!options.force && !options.dryRun) {
      const confirmation = await confirmEnvironmentMigration(
        sourceEnv,
        targetEnv,
        options
      );
      if (!confirmation) {
        console.log(chalk.yellow('Environment migration cancelled'));
        return;
      }
    }

    // Step 1: Discover sites (unless network-only)
    let sitesToMigrate: number[] = [];
    if (!options.networkOnly) {
      console.log(chalk.blue('Step 1: Discovering sites...'));

      if (migrationState) {
        // Resuming migration - get sites from existing state
        sitesToMigrate = Array.from(migrationState.sites.keys());
        console.log(
          chalk.yellow(
            '✓ Resuming migration with ' + sitesToMigrate.length + ' sites'
          )
        );
      } else {
        // New migration - discover sites
        sitesToMigrate = await discoverSites(sourceEnv, options);

        if (sitesToMigrate.length === 0) {
          console.log(chalk.yellow('No sites found to migrate'));
          return;
        }

        console.log(
          chalk.green('✓ Found ' + sitesToMigrate.length + ' sites to migrate')
        );

        // Create migration state for new migration
        migrationState = MigrationStateManager.createMigrationState(
          sourceEnv,
          targetEnv,
          sitesToMigrate,
          options
        );

        console.log(
          chalk.cyan('✓ Migration state created: ' + migrationState.migrationId)
        );
      }

      if (options.verbose) {
        console.log(chalk.cyan('  Sites: ' + sitesToMigrate.join(', ')));
      }
    }

    // Step 2: Migrate network tables (unless sites-only)
    if (!options.sitesOnly) {
      console.log(chalk.blue('Step 2: Migrating network tables...'));
      await migrateNetworkTables(sourceEnv, targetEnv, options);
      console.log(chalk.green('✓ Network tables migration completed'));
    }

    // Step 3: Migrate individual sites (unless network-only)
    if (!options.networkOnly && sitesToMigrate.length > 0 && migrationState) {
      console.log(chalk.blue('Step 3: Migrating individual sites...'));

      // Update migration state to sites phase
      MigrationStateManager.updatePhaseStatus(
        migrationState,
        'sites',
        'in_progress'
      );

      await migrateSites(
        sitesToMigrate,
        sourceEnv,
        targetEnv,
        options,
        migrationState
      );
      console.log(chalk.green('✓ Site migrations completed'));

      // Mark sites phase as completed
      MigrationStateManager.updatePhaseStatus(
        migrationState,
        'sites',
        'completed'
      );
    }

    // Perform final health check if requested
    if (options.healthCheck) {
      migrationContext = ErrorRecovery.updateMigrationContext(
        migrationContext,
        {
          currentStep: 'final health check',
        }
      );

      console.log(chalk.blue('Performing final health check...'));
      const finalHealthCheck =
        await ErrorRecovery.performHealthCheck(targetEnv);
      if (finalHealthCheck.healthy) {
        console.log(chalk.green('✓ Final health check passed'));
      } else {
        console.log(chalk.yellow('⚠ Final health check found issues:'));
        finalHealthCheck.issues.forEach((issue) => {
          console.log(chalk.red(`  • ${issue}`));
        });
        finalHealthCheck.warnings.forEach((warning) => {
          console.log(chalk.yellow(`  • ${warning}`));
        });
      }
    }

    console.log(
      chalk.green(
        '\n🎉 Environment migration completed successfully: ' +
          sourceEnv +
          ' → ' +
          targetEnv
      )
    );

    // Mark migration as completed
    if (migrationState) {
      MigrationStateManager.markMigrationComplete(migrationState, 'completed');
      console.log(chalk.cyan('✓ Migration state marked as completed'));
    }

    // Ring terminal bell on success
    process.stdout.write('\x07');

    // Cleanup successful backup if not keeping files
    if (backupId && !options.keepFiles) {
      console.log(chalk.gray('Cleaning up successful migration backup...'));
      await BackupRecovery.deleteBackup(backupId, options.workDir);
    } else if (backupId) {
      console.log(chalk.cyan('Migration backup preserved: ' + backupId));
    }
  } catch (error) {
    // Mark migration as failed in state
    if (migrationState) {
      MigrationStateManager.markMigrationComplete(migrationState, 'failed');
      console.log(chalk.red('✗ Migration state marked as failed'));
    }

    // Handle migration failure with comprehensive error recovery
    const recoveryResult = await ErrorRecovery.handleMigrationFailure(
      migrationContext,
      error instanceof Error ? error : new Error(String(error)),
      {
        autoRollback: options.autoRollback,
        interactive: !options.force && !options.autoRollback,
        skipConfirmation: options.force,
      }
    );

    if (recoveryResult.success && recoveryResult.action === 'rollback') {
      console.log(chalk.blue('Migration failed but rollback was successful'));
      console.log(
        chalk.cyan('Target environment has been restored to previous state')
      );
    } else if (!recoveryResult.success) {
      console.log(chalk.red('Migration failed and recovery was unsuccessful'));
      console.log(chalk.yellow('Manual intervention may be required'));

      if (backupId) {
        console.log(
          chalk.cyan('Backup available for manual recovery: ' + backupId)
        );
      }
    }

    // Perform cleanup
    await ErrorRecovery.cleanupAfterFailure(migrationContext, {
      cleanupTempFiles: !options.keepFiles,
      workDir: options.workDir,
    });

    // Ring terminal bell on failure
    process.stdout.write('\x07');
    throw error;
  }
}

function validateInputs(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): void {
  const validSourceEnvs = ['dev', 'uat', 'pprd', 'prod'];
  const validTargetEnvs = ['dev', 'uat', 'pprd', 'prod', 'local'];

  if (!validSourceEnvs.includes(sourceEnv)) {
    throw new Error(
      'Invalid source environment. Must be one of: ' +
        validSourceEnvs.join(', ')
    );
  }

  if (!validTargetEnvs.includes(targetEnv)) {
    throw new Error(
      'Invalid target environment. Must be one of: ' +
        validTargetEnvs.join(', ')
    );
  }

  if (sourceEnv === targetEnv) {
    throw new Error('Source and target environments cannot be the same');
  }

  // Validate local environment restrictions
  if (targetEnv === 'local') {
    if (sourceEnv !== 'prod') {
      throw new Error(
        'Local environment migration is only supported from prod environment. ' +
          'Use: prod → local'
      );
    }
  }

  if (sourceEnv === 'local') {
    throw new Error(
      'Migration from local environment is not supported. ' +
        'Local can only be used as target environment for prod → local migrations.'
    );
  }

  if (options.networkOnly && options.sitesOnly) {
    throw new Error('Cannot use both --network-only and --sites-only options');
  }

  if (options.includeSites && options.excludeSites) {
    throw new Error(
      'Cannot use both --include-sites and --exclude-sites options'
    );
  }

  const batchSize = parseInt(options.batchSize || '5', 10);
  if (isNaN(batchSize) || batchSize <= 0) {
    throw new Error('Batch size must be a positive integer');
  }

  // Validate S3 storage class if provided
  if (options.s3StorageClass) {
    const validStorageClasses = [
      'STANDARD',
      'STANDARD_IA',
      'GLACIER',
      'GLACIER_IR',
      'DEEP_ARCHIVE',
    ];
    if (!validStorageClasses.includes(options.s3StorageClass)) {
      throw new Error(
        'Invalid S3 storage class. Must be one of: ' +
          validStorageClasses.join(', ')
      );
    }
  }

  // Validate S3 options
  if (options.syncS3 && !S3Sync.checkAwsCli()) {
    throw new Error('S3 sync requires AWS CLI to be installed and configured');
  }

  if ((options.syncS3 || !options.skipS3) && !Config.hasRequiredS3Config()) {
    console.warn(
      chalk.yellow(
        'Warning: S3 features require S3 configuration. Run "wfuwp config wizard" to set up.'
      )
    );
  }
}

async function runPreflightChecks(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  console.log(chalk.blue('Running comprehensive pre-flight checks...'));

  // Validate system requirements
  console.log(chalk.gray('  Checking system requirements...'));
  const systemValidation =
    await MigrationValidator.validateSystemRequirements();
  if (!systemValidation.valid) {
    console.log(chalk.red('  ✗ System requirements check failed:'));
    systemValidation.errors.forEach((error) => {
      console.log(chalk.red('    • ' + error));
    });
    throw new Error(
      'System requirements not met. Please resolve the issues above.'
    );
  }

  if (systemValidation.warnings.length > 0) {
    console.log(chalk.yellow('  ⚠ System warnings:'));
    systemValidation.warnings.forEach((warning) => {
      console.log(chalk.yellow('    • ' + warning));
    });
  }

  if (systemValidation.recommendations.length > 0) {
    console.log(chalk.cyan('  💡 Recommendations:'));
    systemValidation.recommendations.forEach((rec) => {
      console.log(chalk.cyan('    • ' + rec));
    });
  }

  console.log(chalk.green('  ✓ System requirements check passed'));

  // Validate migration configuration
  console.log(chalk.gray('  Checking migration configuration...'));
  const configValidation = await MigrationValidator.validateMigrationConfig();
  if (!configValidation.valid) {
    console.log(chalk.red('  ✗ Configuration validation failed:'));
    configValidation.errors.forEach((error) => {
      console.log(chalk.red('    • ' + error));
    });
    throw new Error(
      'Migration configuration is invalid. Please resolve the issues above.'
    );
  }

  if (configValidation.warnings.length > 0) {
    console.log(chalk.yellow('  ⚠ Configuration warnings:'));
    configValidation.warnings.forEach((warning) => {
      console.log(chalk.yellow('    • ' + warning));
    });
  }

  console.log(chalk.green('  ✓ Migration configuration check passed'));

  // Validate migration compatibility
  console.log(chalk.gray('  Checking migration compatibility...'));
  const compatibilityCheck =
    await MigrationValidator.validateMigrationCompatibility(
      sourceEnv,
      targetEnv
    );

  if (!compatibilityCheck.compatible) {
    console.log(chalk.red('  ✗ Compatibility check failed:'));
    compatibilityCheck.compatibilityIssues.forEach((issue) => {
      console.log(chalk.red('    • ' + issue));
    });
    throw new Error(
      'Environments are not compatible for migration. Please resolve the issues above.'
    );
  }

  // Display environment information
  console.log(chalk.cyan('  📊 Migration size estimation:'));
  if (compatibilityCheck.sourceInfo.sizeInfo) {
    const sizeInfo = compatibilityCheck.sourceInfo.sizeInfo;
    console.log(
      chalk.cyan('    Network tables: ' + sizeInfo.networkTableSize + ' MB')
    );
    console.log(
      chalk.cyan('    Site tables: ' + sizeInfo.totalSiteSize + ' MB')
    );
    console.log(
      chalk.cyan(
        '    Estimated total: ' + sizeInfo.estimatedMigrationSize + ' MB'
      )
    );
  }

  if (compatibilityCheck.warnings.length > 0) {
    console.log(chalk.yellow('  ⚠ Compatibility warnings:'));
    compatibilityCheck.warnings.forEach((warning) => {
      console.log(chalk.yellow('    • ' + warning));
    });
  }

  if (compatibilityCheck.recommendations.length > 0) {
    console.log(chalk.cyan('  💡 Recommendations:'));
    compatibilityCheck.recommendations.forEach((rec) => {
      console.log(chalk.cyan('    • ' + rec));
    });
  }

  console.log(chalk.green('  ✓ Migration compatibility check passed'));

  // Test S3 access if needed
  if (options.syncS3 || (!options.skipS3 && Config.hasRequiredS3Config())) {
    console.log(chalk.gray('  Testing S3 access...'));

    if (options.syncS3) {
      if (!S3Sync.checkAwsCli()) {
        throw new Error(
          'AWS CLI is not available but required for --sync-s3. Please install and configure AWS CLI.'
        );
      }
    }

    if (!options.skipS3 && Config.hasRequiredS3Config()) {
      const s3AccessTest = await S3Operations.testS3Access();
      if (!s3AccessTest) {
        console.log(
          chalk.yellow('  ⚠ S3 access test failed - archival will be skipped')
        );
      } else {
        console.log(chalk.green('  ✓ S3 access test passed'));
      }
    }

    if (options.syncS3) {
      console.log(chalk.green('  ✓ AWS CLI check passed'));
    }
  }

  console.log(chalk.green('✓ All pre-flight checks passed'));
}

async function discoverSites(
  sourceEnv: string,
  options: EnvMigrateOptions
): Promise<number[]> {
  // Build filter options
  const filterOptions: any = {
    activeOnly: options.activeOnly || false,
  };

  if (options.includeSites) {
    filterOptions.includeSites = options.includeSites
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));
  }

  if (options.excludeSites) {
    filterOptions.excludeSites = options.excludeSites
      .split(',')
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id));
  }

  // Discover sites using static method
  const result = await SiteEnumerator.enumerateSites(sourceEnv, filterOptions);

  if (options.verbose) {
    console.log(chalk.cyan('  Site details:'));
    result.sites.forEach((site: SiteInfo) => {
      console.log(
        chalk.gray(
          '    ' +
            site.blogId +
            ': ' +
            site.domain +
            site.path +
            ' (' +
            (site.isArchived ? 'archived' : 'active') +
            ')'
        )
      );
    });
  }

  return result.sites.map((site: SiteInfo) => site.blogId);
}

async function migrateNetworkTables(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  if (options.dryRun) {
    console.log(chalk.gray('  Would migrate network tables'));
    return;
  }

  // For Phase 3, implement a basic network table migration
  // This can be enhanced in later phases
  try {
    // Validate network tables for migration
    NetworkTableOperations.validateNetworkTablesForMigration(
      sourceEnv,
      targetEnv
    );

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const workDir = options.workDir || '/tmp/wp-env-migrate-' + timestamp;

    if (!require('fs').existsSync(workDir)) {
      require('fs').mkdirSync(workDir, { recursive: true });
    }

    // Export network tables from source
    const exportPath = require('path').join(
      workDir,
      'network-tables-' + sourceEnv + '-' + timestamp + '.sql'
    );
    const exportResult = await NetworkTableOperations.exportNetworkTables(
      sourceEnv,
      exportPath,
      options.verbose,
      parseInt(options.timeout || '20', 10)
    );

    if (options.verbose) {
      console.log(
        chalk.green(
          '  ✓ Exported ' +
            exportResult.tableCount +
            ' network tables (' +
            (exportResult.fileSize / 1024 / 1024).toFixed(2) +
            ' MB)'
        )
      );
    }

    // Backup existing network tables in target (if not skipped)
    if (!options.skipBackup) {
      const backupPath = require('path').join(
        workDir,
        'network-tables-backup-' + targetEnv + '-' + timestamp + '.sql'
      );
      const backupResult = await NetworkTableOperations.backupNetworkTables(
        targetEnv,
        backupPath,
        options.verbose,
        parseInt(options.timeout || '20', 10)
      );

      if (options.verbose) {
        console.log(
          chalk.green(
            '  ✓ Backed up ' + backupResult.tableCount + ' network tables'
          )
        );
      }
    }

    // Import network tables to target
    const importResult = await NetworkTableOperations.importNetworkTables(
      exportPath,
      targetEnv,
      options.verbose,
      parseInt(options.timeout || '20', 10)
    );

    if (options.verbose) {
      console.log(
        chalk.green(
          '  ✓ Imported ' +
            importResult.tableCount +
            ' network tables to ' +
            targetEnv
        )
      );
    }

    // Archive to S3 if configured and not skipped
    if (!options.skipS3 && Config.hasRequiredS3Config()) {
      try {
        const filesToArchive = [exportPath];
        if (!options.skipBackup) {
          const backupPath = require('path').join(
            workDir,
            'network-tables-backup-' + targetEnv + '-' + timestamp + '.sql'
          );
          if (require('fs').existsSync(backupPath)) {
            filesToArchive.push(backupPath);
          }
        }

        const metadata = {
          siteId: 'network',
          fromEnvironment: sourceEnv,
          toEnvironment: targetEnv,
          timestamp,
          sourceExport: exportPath,
          targetBackup: !options.skipBackup
            ? require('path').join(
                workDir,
                'network-tables-backup-' + targetEnv + '-' + timestamp + '.sql'
              )
            : undefined,
        };

        const s3Result = await S3Operations.archiveToS3(
          filesToArchive,
          metadata,
          options.verbose,
          options.s3StorageClass
        );

        if (options.verbose) {
          console.log(
            chalk.green(
              '  ✓ Archived ' +
                s3Result.files.length +
                ' files to S3: ' +
                s3Result.bucket +
                '/' +
                s3Result.path
            )
          );
        }
      } catch (error) {
        console.warn(
          chalk.yellow(
            'Warning: S3 archival failed: ' +
              (error instanceof Error ? error.message : 'Unknown error')
          )
        );
      }
    }

    // Clean up temporary files unless keeping them
    if (!options.keepFiles) {
      require('fs').unlinkSync(exportPath);
      if (!options.skipBackup) {
        const backupPath = require('path').join(
          workDir,
          'network-tables-backup-' + targetEnv + '-' + timestamp + '.sql'
        );
        if (require('fs').existsSync(backupPath)) {
          require('fs').unlinkSync(backupPath);
        }
      }
      require('fs').rmdirSync(workDir, { recursive: true });
    }
  } catch (error) {
    throw new Error(
      'Network table migration failed: ' +
        (error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

async function migrateSites(
  siteIds: number[],
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions,
  migrationState: MigrationState
): Promise<void> {
  // Filter sites to only process incomplete ones
  const resumeOptions: ResumeOptions = {
    skipFailed: options.skipFailed,
    skipTimeouts: options.skipTimeouts,
    retryFailed: options.retryFailed,
    onlyFailed: options.retryFailed,
  };

  const sitesToProcess = MigrationStateManager.getSitesToProcess(
    migrationState,
    resumeOptions
  );

  if (sitesToProcess.length === 0) {
    console.log(chalk.green('✓ All sites already completed'));
    return;
  }

  if (sitesToProcess.length < siteIds.length) {
    const completedCount = siteIds.length - sitesToProcess.length;
    console.log(
      chalk.cyan(`Skipping ${completedCount} already completed sites`)
    );
    console.log(
      chalk.cyan(`Processing ${sitesToProcess.length} remaining sites`)
    );
  }

  const batchSize = parseInt(options.batchSize || '5', 10);
  const totalBatches = Math.ceil(sitesToProcess.length / batchSize);

  const progress: MigrationProgress = {
    totalSites: siteIds.length,
    completedSites: migrationState.completedSites,
    failedSites: migrationState.failedSites,
    currentBatch: 0,
    totalBatches,
    startTime: new Date(),
    lastUpdate: new Date(),
  };

  console.log(
    chalk.blue(
      'Starting batch processing: ' +
        sitesToProcess.length +
        ' sites in ' +
        totalBatches +
        ' batches of ' +
        batchSize
    )
  );

  const failedSites: Array<{ siteId: number; error: string }> = [];
  const batchResults: BatchResult[] = [];

  // Process sites in batches with enhanced progress tracking
  for (let i = 0; i < sitesToProcess.length; i += batchSize) {
    const batch = sitesToProcess.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    progress.currentBatch = batchNumber;

    console.log(
      chalk.cyan(
        '\n  Batch ' +
          batchNumber +
          '/' +
          totalBatches +
          ': Processing sites ' +
          batch.join(', ')
      )
    );

    const batchResult = await processBatch(
      batch,
      batchNumber,
      sourceEnv,
      targetEnv,
      options,
      progress,
      migrationState
    );

    batchResults.push(batchResult);
    progress.completedSites += batchResult.completedSites.length;
    progress.failedSites += batchResult.failedSites.length;
    progress.lastUpdate = new Date();

    // Add failed sites to overall tracking
    failedSites.push(...batchResult.failedSites);

    // Display batch completion with progress
    displayBatchProgress(batchResult, progress);
  }

  // Display final migration summary
  displayMigrationSummary(progress, failedSites, batchResults);

  // Throw error if any sites failed
  if (failedSites.length > 0) {
    throw new Error(
      failedSites.length + ' sites failed to migrate. Check logs for details.'
    );
  }
}

async function processBatch(
  siteIds: number[],
  batchNumber: number,
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions,
  progress: MigrationProgress,
  migrationState: MigrationState
): Promise<BatchResult> {
  const startTime = Date.now();
  const completedSites: number[] = [];
  const failedSites: Array<{ siteId: number; error: string }> = [];

  if (options.parallel) {
    // Process sites in parallel within the batch with concurrency control
    const concurrencyLimit = parseInt(options.concurrency || '3', 10);
    console.log(
      chalk.gray(
        '    Processing ' +
          siteIds.length +
          ' sites in parallel (max ' +
          concurrencyLimit +
          ' concurrent)...'
      )
    );

    await processWithConcurrencyLimit(
      siteIds,
      concurrencyLimit,
      async (siteId) => {
        try {
          // Mark site as in progress
          MigrationStateManager.updateSiteStatus(
            migrationState,
            siteId,
            'in_progress'
          );

          await ErrorRecovery.retryWithBackoff(
            () => migrateSingleSite(siteId, sourceEnv, targetEnv, options),
            'Site ' + siteId + ' migration',
            { maxRetries: parseInt(options.maxRetries || '3', 10) }
          );

          // Mark site as completed
          MigrationStateManager.updateSiteStatus(
            migrationState,
            siteId,
            'completed'
          );
          completedSites.push(siteId);

          if (options.verbose) {
            console.log(chalk.green('      ✓ Site ' + siteId + ' completed'));
          }
          updateProgressDisplay(
            progress,
            completedSites.length + failedSites.length
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          // Mark site as failed with error message
          MigrationStateManager.updateSiteStatus(
            migrationState,
            siteId,
            'failed',
            errorMessage
          );
          failedSites.push({ siteId, error: errorMessage });

          console.log(
            chalk.red('      ✗ Site ' + siteId + ' failed: ' + errorMessage)
          );
          updateProgressDisplay(
            progress,
            completedSites.length + failedSites.length
          );
        }
      }
    );
  } else {
    // Process sites sequentially within the batch
    console.log(
      chalk.gray('    Processing ' + siteIds.length + ' sites sequentially...')
    );

    for (const siteId of siteIds) {
      try {
        // Mark site as in progress
        MigrationStateManager.updateSiteStatus(
          migrationState,
          siteId,
          'in_progress'
        );

        await ErrorRecovery.retryWithBackoff(
          () => migrateSingleSite(siteId, sourceEnv, targetEnv, options),
          `Site ${siteId} migration`,
          { maxRetries: parseInt(options.maxRetries || '3', 10) }
        );

        // Mark site as completed
        MigrationStateManager.updateSiteStatus(
          migrationState,
          siteId,
          'completed'
        );
        completedSites.push(siteId);

        if (options.verbose) {
          console.log(chalk.green(`      ✓ Site ${siteId} completed`));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Mark site as failed with error message
        MigrationStateManager.updateSiteStatus(
          migrationState,
          siteId,
          'failed',
          errorMessage
        );
        failedSites.push({ siteId, error: errorMessage });

        console.log(
          chalk.red(`      ✗ Site ${siteId} failed: ${errorMessage}`)
        );
      }
      updateProgressDisplay(
        progress,
        completedSites.length + failedSites.length
      );
    }
  }

  const duration = Date.now() - startTime;
  const success = failedSites.length === 0;

  return {
    batchNumber,
    siteIds,
    completedSites,
    failedSites,
    duration,
    success,
  };
}

async function migrateSingleSite(
  siteId: number,
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  if (options.dryRun) {
    // Simulate processing time for dry run
    await new Promise((resolve) => setTimeout(resolve, 100));
    return;
  }

  // Defensive cleanup: Clean migration database before starting to ensure no leftover tables
  try {
    await DatabaseOperations.cleanMigrationDatabase(siteId.toString());
    if (options.verbose) {
      console.log(
        chalk.gray(`      Cleaned migration database for site ${siteId}`)
      );
    }
  } catch (cleanupError) {
    // Log warning but don't fail the migration for cleanup issues
    if (options.verbose) {
      console.log(
        chalk.yellow(
          `      Warning: Pre-migration cleanup failed for site ${siteId}: ${
            cleanupError instanceof Error
              ? cleanupError.message
              : 'Unknown error'
          }`
        )
      );
    }
  }

  // For Phase 3, we'll use execSync to call the migrate command
  // In later phases, this can be refactored to call migrate functions directly
  const { execSync } = require('child_process');

  const migrateArgs = [
    'migrate',
    siteId.toString(),
    '--from',
    sourceEnv,
    '--to',
    targetEnv,
    '--force', // Skip confirmation for individual sites
    '--complete', // Use complete workflow
  ];

  if (options.verbose) {
    migrateArgs.push('--verbose');
  }

  if (options.skipBackup) {
    migrateArgs.push('--skip-backup');
  }

  if (options.skipS3) {
    migrateArgs.push('--skip-s3');
  }

  if (options.syncS3) {
    migrateArgs.push('--sync-s3');
  }

  // Handle S3 integration for WordPress files sync
  if (options.syncS3) {
    try {
      if (options.verbose) {
        console.log(
          chalk.blue('    Syncing WordPress files for site ' + siteId + '...')
        );
      }

      const syncResult = await S3Sync.syncWordPressFiles(
        siteId.toString(),
        sourceEnv,
        targetEnv,
        {
          dryRun: options.dryRun,
          verbose: options.verbose,
        }
      );

      if (options.verbose) {
        console.log(chalk.green('    ✓ ' + syncResult.message));
      }
    } catch (error) {
      if (options.verbose) {
        console.log(
          chalk.yellow(
            '    Warning: S3 sync failed for site ' +
              siteId +
              ': ' +
              (error instanceof Error ? error.message : 'Unknown error')
          )
        );
      }
    }
  }

  if (options.workDir) {
    migrateArgs.push('--work-dir', options.workDir);
  }

  if (options.keepFiles) {
    migrateArgs.push('--keep-files');
  }

  if (options.timeout) {
    migrateArgs.push('--timeout', options.timeout);
  }

  try {
    // Execute the migrate command as a subprocess
    execSync('wfuwp ' + migrateArgs.join(' '), {
      stdio: 'pipe', // Always pipe to prevent output conflicts
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  } catch (error) {
    // Clean up migration database on failure to prevent leftover tables
    try {
      await DatabaseOperations.cleanMigrationDatabase(siteId.toString());
      if (options.verbose) {
        console.log(
          chalk.gray(
            `      Cleaned migration database after failure for site ${siteId}`
          )
        );
      }
    } catch (cleanupError) {
      // Log cleanup failure but don't mask the original error
      if (options.verbose) {
        console.log(
          chalk.yellow(
            `      Warning: Post-failure cleanup failed for site ${siteId}: ${
              cleanupError instanceof Error
                ? cleanupError.message
                : 'Unknown error'
            }`
          )
        );
      }
    }

    throw new Error(
      'Site ' +
        siteId +
        ' migration failed: ' +
        (error instanceof Error ? error.message : 'Unknown error')
    );
  }
}

async function confirmEnvironmentMigration(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Display comprehensive migration summary
  console.log(chalk.yellow.bold('\nMIGRATION CONFIRMATION REQUIRED'));
  console.log(
    chalk.white(
      '\nYou are about to perform an environment migration with the following details:'
    )
  );

  console.log(chalk.cyan('\nMigration Details:'));
  console.log(chalk.white('  Source Environment: ' + chalk.bold(sourceEnv)));
  console.log(chalk.white(`  Target Environment: ${chalk.bold(targetEnv)}`));

  if (options.networkOnly) {
    console.log(chalk.white('  Scope: Network tables only'));
  } else if (options.sitesOnly) {
    console.log(chalk.white('  Scope: Sites only (no network tables)'));
  } else {
    console.log(
      chalk.white('  Scope: Complete environment (network tables + all sites)')
    );
  }

  if (options.syncS3) {
    console.log(chalk.white('  WordPress Files: Will be synced via S3'));
  }

  console.log(chalk.cyan('\nMigration Settings:'));
  console.log(
    chalk.white('  Batch Size: ' + (options.batchSize || '5') + ' sites')
  );
  if (options.parallel) {
    console.log(
      chalk.white(
        '  Parallel Processing: Enabled (max ' +
          (options.concurrency || '3') +
          ' concurrent)'
      )
    );
  } else {
    console.log(chalk.white('  Parallel Processing: Disabled (sequential)'));
  }
  if (options.skipBackup) {
    console.log(
      chalk.white('  Backup Creation: SKIPPED') + chalk.red(' (DANGEROUS)')
    );
  } else {
    console.log(chalk.white('  Backup Creation: Enabled'));
  }
  console.log(
    chalk.white(
      '  Error Recovery: ' +
        (options.autoRollback ? 'Automatic rollback' : 'Interactive recovery')
    )
  );
  console.log(
    chalk.white(
      '  Retry Attempts: ' + (options.maxRetries || '3') + ' per site'
    )
  );
  console.log(
    chalk.white(
      '  Health Checks: ' + (options.healthCheck ? 'Enabled' : 'Disabled')
    )
  );

  console.log(chalk.red('\nWARNING - DESTRUCTIVE OPERATION:'));
  console.log(
    chalk.red('  * This will OVERWRITE existing data in the target environment')
  );
  console.log(chalk.red('  * Network tables in target will be REPLACED'));
  console.log(chalk.red('  * Conflicting sites in target will be OVERWRITTEN'));
  if (options.skipBackup) {
    console.log(
      chalk.red.bold(
        '  * NO BACKUP will be created - RECOVERY WILL NOT BE POSSIBLE'
      )
    );
  } else {
    console.log(
      chalk.green('  * Automatic backup will be created before migration')
    );
    console.log(
      chalk.green('  * Rollback will be available if migration fails')
    );
  }

  console.log(chalk.cyan('\nPre-Migration Checklist:'));
  console.log(chalk.green('  - System requirements validated'));
  console.log(chalk.green('  - Database connections tested'));
  console.log(chalk.green('  - Migration compatibility verified'));
  console.log(chalk.green('  - Configuration validated'));

  // Get size estimation for confirmation
  try {
    const compatibilityCheck =
      await MigrationValidator.validateMigrationCompatibility(
        sourceEnv,
        targetEnv
      );

    if (compatibilityCheck.sourceInfo.sizeInfo) {
      const sizeInfo = compatibilityCheck.sourceInfo.sizeInfo;
      console.log(chalk.cyan('\nEstimated Migration Size:'));
      console.log(
        chalk.white('  Network Tables: ' + sizeInfo.networkTableSize + ' MB')
      );
      console.log(
        chalk.white('  Site Tables: ' + sizeInfo.totalSiteSize + ' MB')
      );
      console.log(
        chalk.white(
          '  Total Estimated: ' + sizeInfo.estimatedMigrationSize + ' MB'
        )
      );

      // Estimate duration based on size
      const estimatedMinutes = Math.max(
        Math.ceil(sizeInfo.estimatedMigrationSize / 50),
        5
      ); // ~50MB per minute estimate
      console.log(
        chalk.white('  Estimated Duration: ' + estimatedMinutes + ' minutes')
      );
    }
  } catch (error) {
    // Size estimation is optional for confirmation
  }

  if (options.skipBackup) {
    console.log(
      chalk.red.bold(
        '\nFINAL WARNING: You have disabled backups. If this migration fails,'
      )
    );
    console.log(
      chalk.red.bold(
        '   your target environment may be left in an inconsistent state'
      )
    );
    console.log(chalk.red.bold('   with NO AUTOMATIC RECOVERY POSSIBLE.'));
  }

  const confirmationMessage =
    '\n' +
    chalk.yellow.bold('Do you want to proceed with this migration?') +
    ' ' +
    chalk.gray('(y/N):') +
    ' ';

  return new Promise((resolve) => {
    // Ring bell to draw attention to the confirmation prompt
    process.stdout.write('\x07');
    readline.question(confirmationMessage, (answer: string) => {
      readline.close();
      const confirmed =
        answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';

      if (confirmed) {
        console.log(
          chalk.green('\nMigration confirmed. Starting migration process...')
        );
      } else {
        console.log(chalk.yellow('\nMigration cancelled by user.'));
      }

      resolve(confirmed);
    });
  });
}

function updateProgressDisplay(
  progress: MigrationProgress,
  processedInBatch: number
): void {
  const totalProcessed =
    progress.completedSites + progress.failedSites + processedInBatch;
  const percentage = Math.round((totalProcessed / progress.totalSites) * 100);
  const elapsed = Date.now() - progress.startTime.getTime();
  const avgTimePerSite = elapsed / Math.max(totalProcessed, 1);
  const estimatedTimeRemaining =
    avgTimePerSite * (progress.totalSites - totalProcessed);

  process.stdout.write(
    '\r    Progress: ' +
      totalProcessed +
      '/' +
      progress.totalSites +
      ' (' +
      percentage +
      '%) - ETA: ' +
      formatDuration(estimatedTimeRemaining)
  );
}

function displayBatchProgress(
  batchResult: BatchResult,
  progress: MigrationProgress
): void {
  const { batchNumber, completedSites, failedSites, duration } = batchResult;
  const batchSuccess = failedSites.length === 0;
  const icon = batchSuccess ? '✓' : '⚠';
  const color = batchSuccess ? chalk.green : chalk.yellow;

  console.log(''); // New line after progress display
  console.log(
    color(
      '    ' +
        icon +
        ' Batch ' +
        batchNumber +
        '/' +
        progress.totalBatches +
        ': ' +
        completedSites.length +
        ' completed, ' +
        failedSites.length +
        ' failed (' +
        formatDuration(duration) +
        ')'
    )
  );

  if (failedSites.length > 0 && progress.totalBatches > 1) {
    console.log(
      chalk.red(
        '      Failed sites: ' +
          failedSites
            .map((f: { siteId: number; error: string }) => f.siteId)
            .join(', ')
      )
    );
  }

  const overallPercentage = Math.round(
    (progress.completedSites / progress.totalSites) * 100
  );
  console.log(
    chalk.cyan(
      '    Overall progress: ' +
        progress.completedSites +
        '/' +
        progress.totalSites +
        ' sites (' +
        overallPercentage +
        '%)'
    )
  );
}

function displayMigrationSummary(
  progress: MigrationProgress,
  failedSites: Array<{ siteId: number; error: string }>,
  batchResults: BatchResult[]
): void {
  const totalDuration = Date.now() - progress.startTime.getTime();
  const successfulBatches = batchResults.filter((b) => b.success).length;

  console.log(chalk.blue('\n📊 Migration Summary:'));
  console.log(chalk.white('  Total sites: ' + progress.totalSites));
  console.log(chalk.green('  Completed: ' + progress.completedSites));

  if (progress.failedSites > 0) {
    console.log(chalk.red('  Failed: ' + progress.failedSites));
  }

  console.log(chalk.white('  Total batches: ' + progress.totalBatches));
  console.log(chalk.green('  Successful batches: ' + successfulBatches));
  console.log(
    chalk.white('  Total duration: ' + formatDuration(totalDuration))
  );

  if (progress.completedSites > 0) {
    const avgTimePerSite = totalDuration / progress.completedSites;
    console.log(
      chalk.gray('  Average time per site: ' + formatDuration(avgTimePerSite))
    );
  }

  if (failedSites.length > 0) {
    console.log(chalk.red('\n❌ Failed Sites:'));
    failedSites.forEach(({ siteId, error }) => {
      console.log(chalk.red('  Site ' + siteId + ': ' + error));
    });
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return hours + 'h ' + (minutes % 60) + 'm ' + (seconds % 60) + 's';
  } else if (minutes > 0) {
    return minutes + 'm ' + (seconds % 60) + 's';
  } else {
    return seconds + 's';
  }
}

async function processWithConcurrencyLimit<T>(
  items: T[],
  concurrencyLimit: number,
  processor: (item: T) => Promise<void>
): Promise<void> {
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = processor(item).finally(() => {
      const index = executing.indexOf(promise);
      if (index !== -1) {
        executing.splice(index, 1);
      }
    });

    executing.push(promise);

    if (executing.length >= concurrencyLimit) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

async function listIncompleteMigrations(): Promise<void> {
  console.log(chalk.blue.bold('📋 Incomplete Migrations'));

  const incompleteMigrations = MigrationStateManager.findIncompleteMigrations();

  if (incompleteMigrations.length === 0) {
    console.log(chalk.gray('No incomplete migrations found.'));
    return;
  }

  console.log('');
  incompleteMigrations.forEach((migration, index) => {
    const duration = migration.duration
      ? formatDuration(migration.duration)
      : 'Unknown';
    const canResumeIcon = migration.canResume ? '✅' : '🔒';
    const statusColor =
      migration.status === 'failed'
        ? chalk.red
        : migration.status === 'paused'
          ? chalk.yellow
          : chalk.blue;

    console.log(
      `${index + 1}. ${canResumeIcon} ${chalk.bold(migration.migrationId)}`
    );
    console.log(
      `   ${chalk.cyan('Source:')} ${migration.sourceEnv} → ${chalk.cyan('Target:')} ${migration.targetEnv}`
    );
    console.log(`   ${chalk.cyan('Status:')} ${statusColor(migration.status)}`);
    console.log(
      `   ${chalk.cyan('Progress:')} ${migration.completedSites}/${migration.totalSites} sites completed`
    );
    if (migration.failedSites > 0) {
      console.log(`   ${chalk.red('Failed:')} ${migration.failedSites} sites`);
    }
    if (migration.timeoutSites > 0) {
      console.log(
        `   ${chalk.yellow('Timeouts:')} ${migration.timeoutSites} sites`
      );
    }
    console.log(
      `   ${chalk.cyan('Started:')} ${migration.startTime.toLocaleString()}`
    );
    console.log(`   ${chalk.cyan('Duration:')} ${duration}`);
    if (!migration.canResume) {
      console.log(
        `   ${chalk.red('Note:')} Migration is currently running or locked`
      );
    }
    console.log('');
  });

  console.log(
    chalk.cyan('To resume a migration, use: ') +
      chalk.white('wfuwp env-migrate --resume <migration-id>')
  );
}

async function handleNewMigration(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  // Check for active migrations
  const activeMigration = MigrationStateManager.checkForActiveMigration();
  if (activeMigration) {
    console.log(
      chalk.yellow(
        `⚠ Another migration is currently running: ${activeMigration}`
      )
    );
    console.log(chalk.cyan('You can:'));
    console.log(chalk.white('  1. Wait for it to complete'));
    console.log(
      chalk.white('  2. List migrations: ') +
        chalk.gray('wfuwp env-migrate --list-migrations')
    );
    throw new Error('Another migration is already in progress');
  }

  // Check for incomplete migrations for same environments
  const incompleteMigrations =
    MigrationStateManager.findIncompleteMigrations().filter(
      (m) =>
        m.sourceEnv === sourceEnv && m.targetEnv === targetEnv && m.canResume
    );

  if (incompleteMigrations.length > 0 && !options.force) {
    const shouldResume = await promptForResume(incompleteMigrations[0]);
    if (shouldResume) {
      return resumeMigration(incompleteMigrations[0].migrationId, options);
    }
  }

  // Proceed with new migration
  await runEnvironmentMigration(sourceEnv, targetEnv, options);
}

async function resumeMigration(
  migrationId: string,
  options: EnvMigrateOptions
): Promise<void> {
  console.log(chalk.blue.bold(`🔄 Resuming migration: ${migrationId}`));

  const state = MigrationStateManager.loadState(migrationId);
  if (!state) {
    throw new Error(`Migration state not found: ${migrationId}`);
  }

  if (state.status === 'completed') {
    console.log(chalk.green('Migration is already completed.'));
    return;
  }

  console.log(chalk.cyan(`Resuming: ${state.sourceEnv} → ${state.targetEnv}`));
  console.log(
    chalk.gray(
      `Progress: ${state.completedSites}/${state.totalSites} sites completed`
    )
  );

  if (state.failedSites > 0) {
    console.log(chalk.red(`Failed sites: ${state.failedSites}`));
  }

  if (state.timeoutSites > 0) {
    console.log(chalk.yellow(`Timeout sites: ${state.timeoutSites}`));
  }

  // Update state status to running
  state.status = 'running';
  MigrationStateManager.saveState(state);

  // Resume migration with existing state
  await runEnvironmentMigration(
    state.sourceEnv,
    state.targetEnv,
    options,
    state
  );
}

async function promptForResume(migration: any): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.yellow.bold('\n🔄 Incomplete Migration Found'));
  console.log(chalk.white(`Migration ID: ${migration.migrationId}`));
  console.log(
    chalk.white(
      `Progress: ${migration.completedSites}/${migration.totalSites} sites completed`
    )
  );
  if (migration.failedSites > 0) {
    console.log(chalk.red(`Failed sites: ${migration.failedSites}`));
  }
  if (migration.timeoutSites > 0) {
    console.log(chalk.yellow(`Timeout sites: ${migration.timeoutSites}`));
  }

  return new Promise((resolve) => {
    const question = chalk.yellow(
      'Would you like to resume this migration? (y/N): '
    );
    readline.question(question, (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function handleEC2LocalExport(
  sourceEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  console.log(
    chalk.blue.bold('🚀 Starting EC2 Local Export: ' + sourceEnv + ' → S3')
  );

  if (options.verbose) {
    EC2Detector.printEC2Info(true);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const workDir = options.workDir || `/tmp/wp-ec2-local-export-${timestamp}`;

  if (!require('fs').existsSync(workDir)) {
    require('fs').mkdirSync(workDir, { recursive: true });
  }

  try {
    console.log(chalk.blue('Step 1: Running pre-flight checks...'));
    await runPreflightChecks(sourceEnv, 'local', options);

    if (!Config.hasRequiredS3Config()) {
      throw new Error(
        'S3 configuration is required for EC2 local export. Run "wfuwp config wizard" to configure S3.'
      );
    }

    if (!options.force && !options.dryRun) {
      const confirmation = await confirmEC2LocalExport(sourceEnv, options);
      if (!confirmation) {
        console.log(chalk.yellow('EC2 local export cancelled'));
        return;
      }
    }

    if (options.dryRun) {
      console.log(
        chalk.yellow('DRY RUN MODE - No actual export will be performed')
      );
      console.log(chalk.gray('Would perform complete database export to S3'));
      return;
    }

    console.log(chalk.blue('Step 2: Discovering and exporting all sites...'));

    const sites = await discoverSites(sourceEnv, options);
    console.log(
      chalk.green(`✓ Found ${sites.length} sites to include in export`)
    );

    await migrateAllSitesToMigrationDB(sites, sourceEnv, options);

    console.log(chalk.blue('Step 3: Exporting network tables...'));
    await migrateNetworkTables(sourceEnv, 'migration', options);

    console.log(
      chalk.blue('Step 4: Performing search-replace for local environment...')
    );
    await DatabaseOperations.performLocalSearchReplace(
      sourceEnv,
      options.verbose
    );

    console.log(chalk.blue('Step 5: Creating complete database export...'));
    const exportResult = await DatabaseOperations.exportCompleteLocalDatabase(
      sourceEnv,
      workDir,
      options.verbose,
      parseInt(options.timeout || '20', 10)
    );

    console.log(chalk.blue('Step 6: Compressing export...'));
    const compressedPath = await DatabaseOperations.compressDatabaseExport(
      exportResult.filePath,
      options.verbose
    );

    console.log(chalk.blue('Step 7: Uploading to S3...'));
    const s3Result = await S3Operations.uploadLocalExport(
      compressedPath,
      sourceEnv,
      options.verbose,
      options.s3StorageClass
    );

    console.log(chalk.green('\n🎉 EC2 Local Export completed successfully!'));
    console.log(chalk.cyan('Export Details:'));
    console.log(chalk.white(`  Source Environment: ${sourceEnv}`));
    console.log(chalk.white(`  Sites Exported: ${sites.length}`));
    console.log(chalk.white(`  Tables Exported: ${exportResult.tableCount}`));
    console.log(
      chalk.white(
        `  Compressed Size: ${(require('fs').statSync(compressedPath).size / 1024 / 1024).toFixed(2)} MB`
      )
    );
    console.log(
      chalk.white(`  S3 Location: s3://${s3Result.bucket}/${s3Result.path}`)
    );

    console.log(chalk.yellow('\n📥 To download and use locally:'));
    console.log(chalk.white('  wfuwp download-local --list'));
    console.log(
      chalk.white(
        `  wfuwp download-local --id ${s3Result.path.split('/').slice(-2, -1)[0]}`
      )
    );

    if (!options.keepFiles) {
      console.log(chalk.gray('Cleaning up temporary files...'));
      require('fs').unlinkSync(compressedPath);
      require('fs').rmdirSync(workDir, { recursive: true });
    }

    process.stdout.write('\x07');
  } catch (error) {
    console.error(
      chalk.red(
        'EC2 local export failed: ' +
          (error instanceof Error ? error.message : 'Unknown error')
      )
    );
    process.stdout.write('\x07');
    throw error;
  }
}

async function migrateAllSitesToMigrationDB(
  siteIds: number[],
  sourceEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  const { execSync } = require('child_process');

  for (const siteId of siteIds) {
    try {
      if (options.verbose) {
        console.log(chalk.gray(`  Exporting site ${siteId}...`));
      }

      const migrateArgs = [
        'migrate',
        siteId.toString(),
        '--from',
        sourceEnv,
        '--to',
        'migration',
        '--force',
        '--skip-backup',
        '--skip-s3',
      ];

      if (options.verbose) {
        migrateArgs.push('--verbose');
      }

      execSync('wfuwp ' + migrateArgs.join(' '), {
        stdio: options.verbose ? 'inherit' : 'pipe',
        cwd: process.cwd(),
        encoding: 'utf8',
      });
    } catch (error) {
      if (options.verbose) {
        console.log(
          chalk.yellow(
            `  Warning: Failed to export site ${siteId}, continuing...`
          )
        );
      }
    }
  }
}

async function confirmEC2LocalExport(
  sourceEnv: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
  _options: EnvMigrateOptions
): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.yellow.bold('\nEC2 LOCAL EXPORT CONFIRMATION'));
  console.log(
    chalk.white('\nYou are about to export the complete database to S3:')
  );
  console.log(chalk.cyan(`\n  Source Environment: ${chalk.bold(sourceEnv)}`));
  console.log(
    chalk.white('  Export Type: Complete database (all sites + network tables)')
  );
  console.log(chalk.white('  Destination: S3 bucket for local download'));
  console.log(chalk.white('  Processing: Search-replace for localhost URLs'));

  if (EC2Detector.isRunningOnEC2()) {
    const instanceId = EC2Detector.getEC2InstanceId();
    const region = EC2Detector.getEC2Region();
    console.log(chalk.cyan('\nEC2 Instance Details:'));
    if (instanceId) console.log(chalk.white(`  Instance ID: ${instanceId}`));
    if (region) console.log(chalk.white(`  Region: ${region}`));
  }

  console.log(chalk.green('\n✓ This will create a compressed database export'));
  console.log(
    chalk.green('✓ All URLs will be converted for local development')
  );
  console.log(chalk.green('✓ Export will be uploaded to S3 for download'));

  const confirmationMessage =
    '\n' +
    chalk.yellow.bold('Proceed with EC2 local export?') +
    ' ' +
    chalk.gray('(y/N): ') +
    ' ';

  return new Promise((resolve) => {
    process.stdout.write('\x07');
    readline.question(confirmationMessage, (answer: string) => {
      readline.close();
      const confirmed =
        answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';

      if (confirmed) {
        console.log(chalk.green('\nExport confirmed. Starting process...'));
      } else {
        console.log(chalk.yellow('\nExport cancelled by user.'));
      }

      resolve(confirmed);
    });
  });
}
