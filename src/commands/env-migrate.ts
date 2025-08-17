import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';
import { SiteEnumerator, SiteInfo } from '../utils/site-enumerator';
import { NetworkTableOperations } from '../utils/network-tables';
import { ErrorRecovery } from '../utils/error-recovery';
import { MigrationValidator } from '../utils/migration-validator';
import { S3Operations } from '../utils/s3';
import { S3Sync } from '../utils/s3sync';
import { MigrationStateManager } from '../utils/migration-state-manager';
import { SystemicFailureDetector } from '../utils/systemic-failure-detector';
import { LargeSiteHandler } from '../utils/large-site-handler';

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
  exportLocalDb?: boolean;
  // Resume and recovery options
  resume?: string;
  resumeLatest?: boolean;
  skipCompleted?: boolean;
  retryFailed?: boolean;
  excludeFailed?: boolean;
  largeSites?: string;
  skipLargeSites?: boolean;
  deferLargeSites?: boolean;
  maxConsecutiveFailures?: string;
  cleanupOnFailure?: boolean;
  pauseOnFailure?: boolean;
  healthCheckInterval?: string;
  connectionTestInterval?: string;
  listMigrations?: boolean;
  migrationStatus?: string;
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
    '--export-local-db',
    'Export completed local database to S3 (prod → local only)',
    false
  )
  // Resume and recovery options
  .option('--resume <migration-id>', 'Resume a specific migration by ID')
  .option(
    '--resume-latest',
    'Resume the most recent incomplete migration',
    false
  )
  .option(
    '--skip-completed',
    'Skip sites that have already been migrated successfully',
    false
  )
  .option('--retry-failed', 'Retry sites that previously failed', false)
  .option(
    '--exclude-failed',
    'Skip sites that have failed multiple times',
    false
  )
  .option(
    '--large-sites <list>',
    'Comma-separated list of site IDs to treat as large sites (e.g., "22,43")'
  )
  .option(
    '--skip-large-sites',
    'Skip large sites during regular processing',
    false
  )
  .option(
    '--defer-large-sites',
    'Process large sites at the end in separate batches',
    false
  )
  .option(
    '--max-consecutive-failures <count>',
    'Stop migration after this many consecutive site failures (default: 5)',
    '5'
  )
  .option(
    '--cleanup-on-failure',
    'Force migration database cleanup after each site failure',
    false
  )
  .option(
    '--pause-on-failure',
    'Automatically pause migration on systemic failures',
    false
  )
  .option(
    '--health-check-interval <count>',
    'Perform health checks every N sites (default: 10)',
    '10'
  )
  .option(
    '--connection-test-interval <count>',
    'Test database connections every N sites (default: 20)',
    '20'
  )
  .option('--list-migrations', 'List all previous migrations and exit', false)
  .option(
    '--migration-status <id>',
    'Show detailed status of a specific migration and exit'
  )
  .action(
    async (
      sourceEnv: string,
      targetEnv: string,
      options: EnvMigrateOptions
    ) => {
      try {
        await runEnvironmentMigration(sourceEnv, targetEnv, options);
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
  options: EnvMigrateOptions
): Promise<void> {
  // Handle utility commands first (these don't need sourceEnv/targetEnv)
  if (options.listMigrations) {
    await handleListMigrations();
    return;
  }

  if (options.migrationStatus) {
    await handleMigrationStatus(options.migrationStatus);
    return;
  }

  // Handle resume operations (these will get sourceEnv/targetEnv from saved state)
  if (options.resume || options.resumeLatest) {
    await handleResumeMigration(options);
    return;
  }

  // For all other operations, we need sourceEnv and targetEnv
  if (!sourceEnv || !targetEnv) {
    throw new Error('Source and target environments are required for migration operations');
  }

  // Create migration context for error recovery
  let migrationContext = ErrorRecovery.createMigrationContext(
    sourceEnv,
    targetEnv,
    options
  );
  let backupId: string | undefined;

  try {
    validateInputs(sourceEnv, targetEnv, options);

    // Delegate to the new migration function that supports resume and utilities
    await runNewEnvironmentMigration(sourceEnv, targetEnv, options);
  } catch (error) {
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

  // Validate export-local-db option
  if (options.exportLocalDb) {
    if (sourceEnv !== 'prod' || targetEnv !== 'local') {
      throw new Error(
        '--export-local-db option is only supported for prod → local migrations'
      );
    }
    if (!Config.hasRequiredS3Config()) {
      throw new Error(
        '--export-local-db requires S3 configuration. Run "wfuwp config wizard" to set up.'
      );
    }
    // For EC2 export, we'll create a temporary local database
    console.log(chalk.yellow('Note: Running on EC2 - will create temporary local database for export'));
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
  options: EnvMigrateOptions
): Promise<void> {
  const batchSize = parseInt(options.batchSize || '5', 10);
  const totalBatches = Math.ceil(siteIds.length / batchSize);

  const progress: MigrationProgress = {
    totalSites: siteIds.length,
    completedSites: 0,
    failedSites: 0,
    currentBatch: 0,
    totalBatches,
    startTime: new Date(),
    lastUpdate: new Date(),
  };

  console.log(
    chalk.blue(
      'Starting batch processing: ' +
        progress.totalSites +
        ' sites in ' +
        totalBatches +
        ' batches of ' +
        batchSize
    )
  );

  const failedSites: Array<{ siteId: number; error: string }> = [];
  const batchResults: BatchResult[] = [];

  // Process sites in batches with enhanced progress tracking
  for (let i = 0; i < siteIds.length; i += batchSize) {
    const batch = siteIds.slice(i, i + batchSize);
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
      progress
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
  progress: MigrationProgress
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
          await ErrorRecovery.retryWithBackoff(
            () =>
              migrateSingleSiteWithCleanup(
                siteId,
                sourceEnv,
                targetEnv,
                options
              ),
            'Site ' + siteId + ' migration',
            { maxRetries: parseInt(options.maxRetries || '3', 10) }
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
        await ErrorRecovery.retryWithBackoff(
          () =>
            migrateSingleSiteWithCleanup(siteId, sourceEnv, targetEnv, options),
          `Site ${siteId} migration`,
          { maxRetries: parseInt(options.maxRetries || '3', 10) }
        );
        completedSites.push(siteId);
        if (options.verbose) {
          console.log(chalk.green(`      ✓ Site ${siteId} completed`));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
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

async function migrateSingleSiteWithCleanup(
  siteId: number,
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  try {
    await migrateSingleSite(siteId, sourceEnv, targetEnv, options);
  } catch (error) {
    // CRITICAL: Always clean migration database on failure to prevent cascading failures
    console.log(
      chalk.yellow(`Cleaning migration database for site ${siteId}...`)
    );
    try {
      const { DatabaseOperations } = await import('../utils/database');
      await DatabaseOperations.cleanMigrationDatabase(siteId.toString());
      console.log(
        chalk.green(`✓ Cleaned migration database for site ${siteId}`)
      );
    } catch (cleanupError) {
      console.error(
        chalk.red(`Failed to clean migration database: ${cleanupError}`)
      );
      // Force a full cleanup if site-specific cleanup fails
      try {
        const { DatabaseOperations } = await import('../utils/database');
        await DatabaseOperations.cleanMigrationDatabase(); // Clean all tables
        console.log(
          chalk.yellow(`⚠ Performed full migration database cleanup`)
        );
      } catch (fullCleanupError) {
        console.error(
          chalk.red(
            `Critical: Could not clean migration database - manual intervention may be required`
          )
        );
      }
    }
    throw error; // Re-throw after cleanup
  }
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

  // Pre-migration cleanup: ensure migration database is clean before starting
  try {
    const { DatabaseOperations } = await import('../utils/database');
    const isClean = await DatabaseOperations.verifyMigrationDatabase();
    if (!isClean) {
      if (options.verbose) {
        console.log(
          chalk.yellow(
            `  Pre-cleaning migration database for site ${siteId}...`
          )
        );
      }
      await DatabaseOperations.cleanMigrationDatabase();
    }
  } catch (error) {
    if (options.verbose) {
      console.warn(
        chalk.yellow(
          `Warning: Could not verify/clean migration database: ${error}`
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

  if (options.exportLocalDb) {
    console.log(chalk.white('  Local DB Export: Complete database will be exported to S3 after migration'));
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

async function handleListMigrations(): Promise<void> {
  console.log(chalk.blue.bold('Migration History'));

  const index = MigrationStateManager.listMigrations();

  if (index.migrations.length === 0) {
    console.log(chalk.gray('No previous migrations found.'));
    return;
  }

  console.log(
    chalk.white(`\nFound ${index.migrations.length} migration(s):\n`)
  );

  for (const migration of index.migrations) {
    const statusColor =
      migration.status === 'completed'
        ? chalk.green
        : migration.status === 'failed'
          ? chalk.red
          : migration.status === 'paused'
            ? chalk.yellow
            : chalk.blue;

    console.log(chalk.cyan(`ID: ${migration.id}`));
    console.log(
      chalk.white(`  ${migration.sourceEnv} → ${migration.targetEnv}`)
    );
    console.log(statusColor(`  Status: ${migration.status.toUpperCase()}`));
    console.log(
      chalk.white(
        `  Progress: ${migration.completedSites}/${migration.totalSites} sites`
      )
    );
    if (migration.failedSites > 0) {
      console.log(chalk.red(`  Failed: ${migration.failedSites} sites`));
    }
    console.log(
      chalk.gray(`  Started: ${new Date(migration.startTime).toLocaleString()}`)
    );
    console.log('');
  }
}

async function handleMigrationStatus(migrationId: string): Promise<void> {
  const migration = MigrationStateManager.loadMigration(migrationId);

  if (!migration) {
    console.error(chalk.red(`Migration not found: ${migrationId}`));
    process.exit(1);
  }

  console.log(chalk.blue.bold('Migration Status'));
  console.log('');
  console.log(MigrationStateManager.getMigrationSummary(migration));

  if (migration.failedSites.length > 0) {
    console.log(chalk.red('\nFailed Sites:'));
    migration.failedSites.forEach((failed) => {
      console.log(chalk.red(`  Site ${failed.siteId}: ${failed.error}`));
      console.log(
        chalk.gray(
          `    Attempts: ${failed.attemptCount}, Last: ${failed.lastAttempt.toLocaleString()}`
        )
      );
    });
  }

  if (migration.skippedSites.length > 0) {
    console.log(chalk.yellow('\nSkipped Sites:'));
    console.log(chalk.gray(`  ${migration.skippedSites.join(', ')}`));
  }

  console.log(chalk.cyan('\nNext Steps:'));
  if (migration.status === 'completed') {
    console.log(chalk.green('  Migration completed successfully'));
  } else if (migration.status === 'failed') {
    console.log(
      chalk.white('  Use --resume to continue from where it left off')
    );
    console.log(chalk.white('  Use --retry-failed to retry only failed sites'));
  } else {
    console.log(chalk.white(`  Use --resume ${migrationId} to continue`));
  }
}

async function handleResumeMigration(
  options: EnvMigrateOptions
): Promise<void> {
  let migration: any;

  if (options.resume) {
    migration = MigrationStateManager.loadMigration(options.resume);
    if (!migration) {
      console.error(chalk.red(`Migration not found: ${options.resume}`));
      process.exit(1);
    }
  } else if (options.resumeLatest) {
    migration = MigrationStateManager.getLatestIncompleteMigration();
    if (!migration) {
      console.error(chalk.red('No incomplete migrations found to resume'));
      process.exit(1);
    }
  }

  console.log(chalk.blue.bold(`Resuming Migration: ${migration.id}`));
  console.log('');
  console.log(MigrationStateManager.getMigrationSummary(migration));
  console.log('');

  // Merge original options with resume options
  const resumeOptions = {
    ...migration.options,
    ...options,
    skipCompleted: true, // Always skip completed when resuming
  };

  // Continue the migration with the original parameters but updated options
  await runNewEnvironmentMigration(
    migration.sourceEnv,
    migration.targetEnv,
    resumeOptions,
    migration
  );
}

async function runNewEnvironmentMigration(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions,
  existingMigration?: any
): Promise<void> {
  // Initialize utilities
  const largeSiteIds = options.largeSites
    ? options.largeSites
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id))
    : [];

  const largeSiteHandler = new LargeSiteHandler(largeSiteIds, {
    deferToEnd: options.deferLargeSites,
    separateProcessing: true,
  });

  const systemicFailureDetector = new SystemicFailureDetector({
    maxConsecutiveFailures: parseInt(options.maxConsecutiveFailures || '5', 10),
    pauseOnFailure: options.pauseOnFailure,
    healthCheckInterval: parseInt(options.healthCheckInterval || '10', 10),
    connectionTestInterval: parseInt(
      options.connectionTestInterval || '20',
      10
    ),
  });

  // Create or load migration state
  let migrationState = existingMigration;
  if (!migrationState) {
    // This will be set after site discovery
    migrationState = null;
  }

  try {
    console.log(
      chalk.blue.bold(
        (existingMigration ? 'Resuming' : 'Starting') +
          ' environment migration: ' +
          sourceEnv +
          ' → ' +
          targetEnv
      )
    );

    // Run pre-flight checks for new migrations
    if (!existingMigration) {
      await runPreflightChecks(sourceEnv, targetEnv, options);

      // Perform initial health check if requested
      if (options.healthCheck) {
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
    }

    // Step 1: Discover sites (unless network-only or resuming with existing sites)
    let sitesToMigrate: number[] = [];
    if (!options.networkOnly) {
      console.log(chalk.blue('Step 1: Discovering sites...'));
      sitesToMigrate = await discoverSites(sourceEnv, options);

      if (sitesToMigrate.length === 0) {
        console.log(chalk.yellow('No sites found to migrate'));
        return;
      }

      // Create migration state if this is a new migration
      if (!migrationState) {
        migrationState = MigrationStateManager.createMigration(
          sourceEnv,
          targetEnv,
          sitesToMigrate.length,
          options
        );
      }

      // Filter sites based on resume options
      if (options.skipCompleted && migrationState) {
        const originalCount = sitesToMigrate.length;
        sitesToMigrate = MigrationStateManager.getRemainingSites(
          migrationState,
          sitesToMigrate
        );

        if (originalCount > sitesToMigrate.length) {
          console.log(
            chalk.cyan(
              `  Skipping ${originalCount - sitesToMigrate.length} completed sites`
            )
          );
        }
      }

      if (options.retryFailed && migrationState) {
        const retryableSites =
          MigrationStateManager.getRetryableSites(migrationState);
        sitesToMigrate = [...new Set([...sitesToMigrate, ...retryableSites])];

        if (retryableSites.length > 0) {
          console.log(
            chalk.yellow(
              `  Including ${retryableSites.length} failed sites for retry`
            )
          );
        }
      }

      if (options.excludeFailed && migrationState) {
        const originalCount = sitesToMigrate.length;
        const failedSiteIds = migrationState.failedSites.map(
          (f: any) => f.siteId
        );
        sitesToMigrate = sitesToMigrate.filter(
          (id) => !failedSiteIds.includes(id)
        );

        if (originalCount > sitesToMigrate.length) {
          console.log(
            chalk.red(
              `  Excluding ${originalCount - sitesToMigrate.length} previously failed sites`
            )
          );
        }
      }

      console.log(
        chalk.green('✓ Found ' + sitesToMigrate.length + ' sites to migrate')
      );

      if (options.verbose) {
        console.log(chalk.cyan('  Sites: ' + sitesToMigrate.join(', ')));
      }

      // Display large site information
      if (largeSiteIds.length > 0) {
        console.log(chalk.yellow('\nLarge Site Configuration:'));
        largeSiteIds.forEach((siteId) => {
          if (sitesToMigrate.includes(siteId)) {
            largeSiteHandler.displaySiteInfo(siteId);
          }
        });
      }
    }

    // Step 2: Migrate network tables (unless sites-only)
    if (
      !options.sitesOnly &&
      (!existingMigration || !migrationState?.networkTablesCompleted)
    ) {
      console.log(chalk.blue('Step 2: Migrating network tables...'));
      await migrateNetworkTables(sourceEnv, targetEnv, options);
      console.log(chalk.green('✓ Network tables migration completed'));

      if (migrationState) {
        MigrationStateManager.markNetworkTablesCompleted(migrationState);
      }
    } else if (options.sitesOnly) {
      console.log(
        chalk.yellow('Step 2: Skipping network tables (--sites-only flag)')
      );
    } else if (migrationState?.networkTablesCompleted) {
      console.log(
        chalk.cyan('Step 2: Network tables already completed (resuming)')
      );
    }

    // Step 3: Migrate individual sites (unless network-only)
    if (!options.networkOnly && sitesToMigrate.length > 0) {
      console.log(chalk.blue('Step 3: Migrating individual sites...'));
      await migrateWithNewUtilities(sitesToMigrate, sourceEnv, targetEnv, options);
      console.log(chalk.green('✓ Site migrations completed'));
    } else if (options.networkOnly) {
      console.log(
        chalk.yellow('Step 3: Skipping site migrations (--network-only flag)')
      );
    }

    // Perform final health check if requested
    if (options.healthCheck) {
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

    if (migrationState) {
      MigrationStateManager.updateStatus(migrationState, 'completed');
    }

    console.log(
      chalk.green(
        '\n🎉 Environment migration completed successfully: ' +
          sourceEnv +
          ' → ' +
          targetEnv
      )
    );

    // Export local database to S3 if requested
    if (options.exportLocalDb && sourceEnv === 'prod' && targetEnv === 'local') {
      console.log(chalk.blue('\nExporting completed local database to S3...'));
      await exportLocalDatabaseToS3(options);
      console.log(chalk.green('✓ Local database exported to S3'));
    }

    // Ring terminal bell on success
    process.stdout.write('\x07');
  } catch (error) {
    if (migrationState) {
      MigrationStateManager.updateStatus(migrationState, 'failed');
    }
    throw error;
  }
}

async function migrateWithNewUtilities(
  sitesToMigrate: number[],
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  // Enhanced migration with state tracking and failure detection
  // For now, use the existing migrateSites function
  // TODO: Integrate MigrationStateManager, LargeSiteHandler and SystemicFailureDetector in future iterations

  await migrateSites(sitesToMigrate, sourceEnv, targetEnv, options);
}

async function exportLocalDatabaseToS3(options: EnvMigrateOptions): Promise<void> {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  try {
    const localConfig = Config.getEnvironmentConfig('local');
    if (!Config.hasRequiredEnvironmentConfig('local')) {
      throw new Error('Local environment is not configured');
    }
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const workDir = options.workDir || `/tmp/wp-local-export-${timestamp}`;
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    const exportPath = path.join(workDir, `complete-local-database-${timestamp}.sql`);
    if (options.verbose) {
      console.log(chalk.gray(`  Exporting complete local database to: ${exportPath}`));
    }
    let exportCommand: string;
    const timeoutMinutes = parseInt(options.timeout || '30', 10);
    let hasNativeClient = false;
    try {
      execSync('which mysqldump', { stdio: 'ignore' });
      hasNativeClient = true;
    } catch {
      hasNativeClient = false;
    }
    if (hasNativeClient) {
      const portArg = localConfig.port ? `-P ${localConfig.port}` : '';
      const baseCommand = [
        'mysqldump',
        '-h',
        localConfig.host,
        portArg,
        '-u',
        localConfig.user,
        localConfig.database,
        '--single-transaction',
        '--routines',
        '--triggers',
        '--complete-insert',
        '--skip-lock-tables',
        '--no-tablespaces',
        '>',
        `"${exportPath}"`
      ].filter(arg => arg && arg.length > 0);
      let supportsGtid = false;
      try {
        const versionCheck = execSync(`mysqldump --help | grep "set-gtid-purged" || echo "no-gtid"`, {
          encoding: 'utf8',
          stdio: 'pipe',
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        });
        supportsGtid = versionCheck.includes('set-gtid-purged') && !versionCheck.includes('no-gtid');
        if (options.verbose) {
          console.log(chalk.gray(`  GTID support check: ${supportsGtid ? 'supported' : 'not supported'}`));
        }
      } catch {
        supportsGtid = false;
      }
      if (supportsGtid) {
        const insertIndex = baseCommand.indexOf('--no-tablespaces') + 1;
        baseCommand.splice(insertIndex, 0, '--set-gtid-purged=OFF');
      }
      exportCommand = baseCommand.join(' ');
      execSync(exportCommand, {
        encoding: 'utf8',
        stdio: options.verbose ? 'inherit' : 'pipe',
        shell: '/bin/bash',
        timeout: timeoutMinutes * 60 * 1000,
        env: {
          ...process.env,
          MYSQL_PWD: localConfig.password,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
      });
    } else {
      const portArg = localConfig.port ? `--port=${localConfig.port}` : '';
      exportCommand = [
        'docker run --rm',
        '-v',
        `"${path.dirname(exportPath)}:${path.dirname(exportPath)}"`,
        '-e',
        `MYSQL_PWD="${localConfig.password}"`,
        'mysql:8.0',
        'mysqldump',
        '-h',
        `"${localConfig.host}"`,
        portArg,
        '-u',
        `"${localConfig.user}"`,
        `"${localConfig.database}"`,
        '--single-transaction',
        '--routines',
        '--triggers',
        '--complete-insert',
        '--skip-lock-tables',
        '--no-tablespaces',
        '--set-gtid-purged=OFF'
      ].filter(arg => arg.length > 0).join(' ') + ` > "${exportPath}"`;
      execSync(exportCommand, {
        encoding: 'utf8',
        stdio: options.verbose ? 'inherit' : 'pipe',
        shell: '/bin/bash',
        timeout: timeoutMinutes * 60 * 1000,
      });
    }
    if (!fs.existsSync(exportPath)) {
      throw new Error('Local database export file was not created');
    }
    const stats = fs.statSync(exportPath);
    const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
    if (options.verbose) {
      console.log(chalk.green(`  ✓ Database exported successfully (${fileSizeMB} MB)`));
    }
    const metadata = {
      siteId: 'complete-local-db',
      fromEnvironment: 'prod',
      toEnvironment: 'local',
      timestamp,
      siteName: 'complete-local-database',
      sourceExport: exportPath,
      migratedExport: exportPath
    };
    const s3Result = await S3Operations.archiveToS3(
      [exportPath],
      metadata,
      options.verbose,
      options.s3StorageClass || 'STANDARD'
    );
    console.log(chalk.cyan(`
📦 Local Database Export Complete!

S3 Location: s3://${s3Result.bucket}/${s3Result.path}
File Size: ${fileSizeMB} MB
Timestamp: ${timestamp}

To use this database locally:
1. Download from S3: aws s3 cp "s3://${s3Result.bucket}/${s3Result.path}complete-local-database-${timestamp}.sql" ./
2. Import to DDEV: ddev import-db --src=complete-local-database-${timestamp}.sql
3. Clear caches: ddev wp cache flush

The database contains the complete prod dataset with URLs transformed for local development.
    `));
    if (!options.keepFiles) {
      fs.unlinkSync(exportPath);
      if (fs.existsSync(workDir) && fs.readdirSync(workDir).length === 0) {
        fs.rmdirSync(workDir);
      }
    } else {
      console.log(chalk.gray(`Local export file preserved: ${exportPath}`));
    }
  } catch (error) {
    throw new Error(
      `Local database export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
