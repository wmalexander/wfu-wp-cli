import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';
import { SiteEnumerator, SiteInfo } from '../utils/site-enumerator';
import { NetworkTableOperations } from '../utils/network-tables';

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
  .argument('<source-env>', 'Source environment (dev, uat, pprd, prod)')
  .argument('<target-env>', 'Target environment (dev, uat, pprd, prod)')
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
  .option('--work-dir <path>', 'Custom working directory', undefined)
  .option('--keep-files', 'Do not delete local SQL files', false)
  .option(
    '--timeout <minutes>',
    'Custom timeout in minutes for large databases (default: 20)',
    '20'
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
            `Environment migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
        process.exit(1);
      }
    }
  );

async function runEnvironmentMigration(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  validateInputs(sourceEnv, targetEnv, options);

  console.log(
    chalk.blue.bold(
      `Starting environment migration: ${sourceEnv} → ${targetEnv}`
    )
  );

  // Run pre-flight checks
  await runPreflightChecks(sourceEnv, targetEnv, options);

  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN MODE - No actual changes will be made'));
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
    sitesToMigrate = await discoverSites(sourceEnv, options);

    if (sitesToMigrate.length === 0) {
      console.log(chalk.yellow('No sites found to migrate'));
      return;
    }

    console.log(
      chalk.green(`✓ Found ${sitesToMigrate.length} sites to migrate`)
    );

    if (options.verbose) {
      console.log(chalk.cyan(`  Sites: ${sitesToMigrate.join(', ')}`));
    }
  }

  // Step 2: Migrate network tables (unless sites-only)
  if (!options.sitesOnly) {
    console.log(chalk.blue('Step 2: Migrating network tables...'));
    await migrateNetworkTables(sourceEnv, targetEnv, options);
    console.log(chalk.green('✓ Network tables migration completed'));
  }

  // Step 3: Migrate individual sites (unless network-only)
  if (!options.networkOnly && sitesToMigrate.length > 0) {
    console.log(chalk.blue('Step 3: Migrating individual sites...'));
    await migrateSites(sitesToMigrate, sourceEnv, targetEnv, options);
    console.log(chalk.green('✓ Site migrations completed'));
  }

  console.log(
    chalk.green(
      `\n🎉 Environment migration completed successfully: ${sourceEnv} → ${targetEnv}`
    )
  );
}

function validateInputs(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): void {
  const validEnvs = ['dev', 'uat', 'pprd', 'prod'];

  if (!validEnvs.includes(sourceEnv)) {
    throw new Error(
      `Invalid source environment. Must be one of: ${validEnvs.join(', ')}`
    );
  }

  if (!validEnvs.includes(targetEnv)) {
    throw new Error(
      `Invalid target environment. Must be one of: ${validEnvs.join(', ')}`
    );
  }

  if (sourceEnv === targetEnv) {
    throw new Error('Source and target environments cannot be the same');
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
}

async function runPreflightChecks(
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  console.log(chalk.blue('Running pre-flight checks...'));

  // Import utilities
  const { DatabaseOperations } = await import('../utils/database');

  // Check Docker availability
  DatabaseOperations.checkDockerAvailability();

  // Check environment configurations
  if (!Config.hasRequiredEnvironmentConfig(sourceEnv)) {
    throw new Error(
      `Source environment '${sourceEnv}' is not configured. Run 'wfuwp config wizard'.`
    );
  }

  if (!Config.hasRequiredEnvironmentConfig(targetEnv)) {
    throw new Error(
      `Target environment '${targetEnv}' is not configured. Run 'wfuwp config wizard'.`
    );
  }

  // Check migration database configuration
  if (!Config.hasRequiredMigrationConfig()) {
    throw new Error(
      'Migration database is not configured. Run "wfuwp config wizard".'
    );
  }

  // Test database connections
  console.log(chalk.gray(`  Testing ${sourceEnv} database connection...`));
  const sourceTest = await DatabaseOperations.testConnection(sourceEnv);
  if (!sourceTest) {
    console.log(
      chalk.yellow(
        `  Warning: Connection test failed for ${sourceEnv}, but proceeding anyway`
      )
    );
  } else {
    console.log(chalk.green(`  ✓ ${sourceEnv} database connection successful`));
  }

  console.log(chalk.gray(`  Testing ${targetEnv} database connection...`));
  const targetTest = await DatabaseOperations.testConnection(targetEnv);
  if (!targetTest) {
    console.log(
      chalk.yellow(
        `  Warning: Connection test failed for ${targetEnv}, but proceeding anyway`
      )
    );
  } else {
    console.log(chalk.green(`  ✓ ${targetEnv} database connection successful`));
  }

  // Test S3 access if needed
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
          `    ${site.blogId}: ${site.domain}${site.path} (${site.isArchived ? 'archived' : 'active'})`
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
    const workDir = options.workDir || `/tmp/wp-env-migrate-${timestamp}`;

    if (!require('fs').existsSync(workDir)) {
      require('fs').mkdirSync(workDir, { recursive: true });
    }

    // Export network tables from source
    const exportPath = require('path').join(
      workDir,
      `network-tables-${sourceEnv}-${timestamp}.sql`
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
          `  ✓ Exported ${exportResult.tableCount} network tables (${(exportResult.fileSize / 1024 / 1024).toFixed(2)} MB)`
        )
      );
    }

    // Backup existing network tables in target (if not skipped)
    if (!options.skipBackup) {
      const backupPath = require('path').join(
        workDir,
        `network-tables-backup-${targetEnv}-${timestamp}.sql`
      );
      const backupResult = await NetworkTableOperations.backupNetworkTables(
        targetEnv,
        backupPath,
        options.verbose,
        parseInt(options.timeout || '20', 10)
      );

      if (options.verbose) {
        console.log(
          chalk.green(`  ✓ Backed up ${backupResult.tableCount} network tables`)
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
          `  ✓ Imported ${importResult.tableCount} network tables to ${targetEnv}`
        )
      );
    }

    // Clean up temporary files unless keeping them
    if (!options.keepFiles) {
      require('fs').unlinkSync(exportPath);
      if (!options.skipBackup) {
        const backupPath = require('path').join(
          workDir,
          `network-tables-backup-${targetEnv}-${timestamp}.sql`
        );
        if (require('fs').existsSync(backupPath)) {
          require('fs').unlinkSync(backupPath);
        }
      }
      require('fs').rmdirSync(workDir, { recursive: true });
    }
  } catch (error) {
    throw new Error(
      `Network table migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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
      `Starting batch processing: ${progress.totalSites} sites in ${totalBatches} batches of ${batchSize}`
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
        `\n  Batch ${batchNumber}/${totalBatches}: Processing sites ${batch.join(', ')}`
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
      `${failedSites.length} sites failed to migrate. Check logs for details.`
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
        `    Processing ${siteIds.length} sites in parallel (max ${concurrencyLimit} concurrent)...`
      )
    );

    await processWithConcurrencyLimit(
      siteIds,
      concurrencyLimit,
      async (siteId) => {
        try {
          await migrateSingleSite(siteId, sourceEnv, targetEnv, options);
          completedSites.push(siteId);
          if (options.verbose) {
            console.log(chalk.green(`      ✓ Site ${siteId} completed`));
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
            chalk.red(`      ✗ Site ${siteId} failed: ${errorMessage}`)
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
      chalk.gray(`    Processing ${siteIds.length} sites sequentially...`)
    );

    for (const siteId of siteIds) {
      try {
        await migrateSingleSite(siteId, sourceEnv, targetEnv, options);
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
    execSync(`npx ts-node src/index.ts ${migrateArgs.join(' ')}`, {
      stdio: 'pipe', // Always pipe to prevent output conflicts
      cwd: process.cwd(),
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      `Site ${siteId} migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  let message = `Are you sure you want to migrate the entire environment from ${sourceEnv} to ${targetEnv}`;

  if (options.networkOnly) {
    message += ' (network tables only)';
  } else if (options.sitesOnly) {
    message += ' (sites only, no network tables)';
  } else {
    message += ' (network tables and all sites)';
  }

  if (options.syncS3) {
    message += ' including WordPress files';
  }

  message += '? This is a major operation. (y/N): ';

  return new Promise((resolve) => {
    readline.question(chalk.yellow(message), (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
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
    `\r    Progress: ${totalProcessed}/${progress.totalSites} (${percentage}%) - ETA: ${formatDuration(estimatedTimeRemaining)}`
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
      `    ${icon} Batch ${batchNumber}/${progress.totalBatches}: ${completedSites.length} completed, ${failedSites.length} failed (${formatDuration(duration)})`
    )
  );

  if (failedSites.length > 0 && progress.totalBatches > 1) {
    console.log(
      chalk.red(
        `      Failed sites: ${failedSites.map((f: { siteId: number; error: string }) => f.siteId).join(', ')}`
      )
    );
  }

  const overallPercentage = Math.round(
    (progress.completedSites / progress.totalSites) * 100
  );
  console.log(
    chalk.cyan(
      `    Overall progress: ${progress.completedSites}/${progress.totalSites} sites (${overallPercentage}%)`
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
  console.log(chalk.white(`  Total sites: ${progress.totalSites}`));
  console.log(chalk.green(`  Completed: ${progress.completedSites}`));

  if (progress.failedSites > 0) {
    console.log(chalk.red(`  Failed: ${progress.failedSites}`));
  }

  console.log(chalk.white(`  Total batches: ${progress.totalBatches}`));
  console.log(chalk.green(`  Successful batches: ${successfulBatches}`));
  console.log(
    chalk.white(`  Total duration: ${formatDuration(totalDuration)}`)
  );

  if (progress.completedSites > 0) {
    const avgTimePerSite = totalDuration / progress.completedSites;
    console.log(
      chalk.gray(`  Average time per site: ${formatDuration(avgTimePerSite)}`)
    );
  }

  if (failedSites.length > 0) {
    console.log(chalk.red('\n❌ Failed Sites:'));
    failedSites.forEach(({ siteId, error }) => {
      console.log(chalk.red(`  Site ${siteId}: ${error}`));
    });
  }
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
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
