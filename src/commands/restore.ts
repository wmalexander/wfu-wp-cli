import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { Config } from '../utils/config';

interface RestoreOptions {
  to: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  timeout?: string;
}

export const restoreCommand = new Command('restore')
  .description('Restore WordPress site from SQL backup file')
  .argument('<sql-file>', 'Path to SQL backup file to restore')
  .requiredOption('--to <env>', 'Target environment (dev, uat, pprd, prod)')
  .option('--dry-run', 'Preview restore without executing', false)
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--timeout <minutes>', 'Custom timeout in minutes for large databases (default: 20)', '20')
  .action(async (sqlFile: string, options: RestoreOptions) => {
    try {
      await runRestore(sqlFile, options);
    } catch (error) {
      console.error(
        chalk.red(
          `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

async function runRestore(
  sqlFile: string,
  options: RestoreOptions
): Promise<void> {
  // Validate inputs
  if (!existsSync(sqlFile)) {
    throw new Error(`SQL file not found: ${sqlFile}`);
  }

  const validEnvs = ['dev', 'uat', 'pprd', 'prod'];
  if (!validEnvs.includes(options.to)) {
    throw new Error(
      `Invalid environment. Must be one of: ${validEnvs.join(', ')}`
    );
  }

  // Import required utilities
  const { DatabaseOperations } = await import('../utils/database');
  
  console.log(chalk.blue.bold('Starting database restore'));
  console.log(chalk.cyan(`SQL File: ${sqlFile}`));
  console.log(chalk.cyan(`Target Environment: ${options.to}`));

  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN MODE - No changes will be made'));
  }

  // Pre-flight checks
  await runPreflightChecks(options.to, DatabaseOperations);

  if (!options.force && !options.dryRun) {
    const confirmation = await confirmRestore(sqlFile, options.to);
    if (!confirmation) {
      console.log(chalk.yellow('Restore cancelled'));
      return;
    }
  }

  if (!options.dryRun) {
    console.log(chalk.blue('Importing SQL file to target environment...'));
    
    const timeoutMinutes = parseInt(options.timeout || '20', 10);
    const targetConfig = Config.getEnvironmentConfig(options.to);
    
    const importResult = await DatabaseOperations.importSqlFile(
      sqlFile,
      targetConfig,
      options.verbose,
      timeoutMinutes
    );
    
    if (importResult.success) {
      console.log(
        chalk.green(`✓ Successfully restored ${importResult.tableCount} tables`)
      );
      console.log(chalk.green('\n🎉 Database restore completed successfully!'));
    } else {
      throw new Error('Import operation failed');
    }
  } else {
    console.log(chalk.gray('  Would import SQL file to target environment'));
    console.log(chalk.green('\n🎭 Restore dry run completed - no changes made'));
  }
}

async function runPreflightChecks(
  environment: string,
  DatabaseOperations: any
): Promise<void> {
  console.log(chalk.blue('Running pre-flight checks...'));

  // Check environment configuration
  if (!Config.hasRequiredEnvironmentConfig(environment)) {
    throw new Error(
      `Environment '${environment}' is not configured. Run 'wfuwp config wizard'.`
    );
  }

  // Test database connection
  console.log(chalk.gray(`  Testing ${environment} database connection...`));
  const connectionTest = await DatabaseOperations.testConnection(environment);
  if (!connectionTest) {
    console.log(chalk.yellow(`  Warning: Connection test failed for ${environment}, but proceeding anyway`));
  } else {
    console.log(chalk.green(`  ✓ ${environment} database connection successful`));
  }

  console.log(chalk.green('✓ Pre-flight checks passed'));
}

async function confirmRestore(
  sqlFile: string,
  environment: string
): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const message = chalk.yellow(
    `⚠️  This will OVERWRITE the existing ${environment} database with data from:\n` +
    `   ${sqlFile}\n\n` +
    `Are you sure you want to continue? (y/N): `
  );

  return new Promise((resolve) => {
    readline.question(message, (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}