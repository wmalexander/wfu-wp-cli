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
  const totalSites = siteIds.length;
  let completedSites = 0;

  // Process sites in batches
  for (let i = 0; i < siteIds.length; i += batchSize) {
    const batch = siteIds.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(siteIds.length / batchSize);

    console.log(
      chalk.cyan(
        `  Processing batch ${batchNumber}/${totalBatches}: sites ${batch.join(', ')}`
      )
    );

    if (options.parallel) {
      // Process sites in parallel within the batch
      const promises = batch.map((siteId) =>
        migrateSingleSite(siteId, sourceEnv, targetEnv, options)
      );
      await Promise.all(promises);
    } else {
      // Process sites sequentially within the batch
      for (const siteId of batch) {
        await migrateSingleSite(siteId, sourceEnv, targetEnv, options);
      }
    }

    completedSites += batch.length;
    console.log(
      chalk.green(
        `    ✓ Completed batch ${batchNumber}/${totalBatches} (${completedSites}/${totalSites} sites)`
      )
    );
  }
}

async function migrateSingleSite(
  siteId: number,
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  if (options.verbose) {
    console.log(chalk.gray(`      Migrating site ${siteId}...`));
  }

  if (options.dryRun) {
    console.log(chalk.gray(`        Would migrate site ${siteId}`));
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
      stdio: options.verbose ? 'inherit' : 'pipe',
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    if (options.verbose) {
      console.log(chalk.green(`        ✓ Site ${siteId} migration completed`));
    }
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
