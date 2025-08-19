import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';
import { DatabaseOperations } from '../utils/database';
import {
  EnvironmentCleanupService,
  CleanupOptions,
} from '../utils/environment-cleanup';

interface CleanLowerEnvsOptions {
  sitesOnly?: boolean;
  tablesOnly?: boolean;
  env?: string;
  site?: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  backup?: boolean;
  parallel?: boolean;
  sourceEnv?: string;
}

export const cleanLowerEnvsCommand = new Command('clean-lower-envs')
  .description(
    'Clean up orphaned sites and tables in lower environments by comparing with production'
  )
  .option(
    '--sites-only',
    'Only delete orphaned sites (skip table cleanup)',
    false
  )
  .option(
    '--tables-only',
    'Only remove orphaned tables (skip site deletion)',
    false
  )
  .option(
    '--env <environment>',
    'Target specific environment (dev, uat, pprd). Default: all lower environments'
  )
  .option('--site <siteId>', 'Target specific site ID for cleanup')
  .option(
    '--source-env <environment>',
    'Source environment to compare against (default: prod)',
    'prod'
  )
  .option(
    '--dry-run',
    'Preview changes without executing (default: true)',
    true
  )
  .option('--execute', 'Actually perform the cleanup operations', false)
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--no-backup', 'Skip creating backups before deletion', false)
  .option('--parallel', 'Process environments in parallel', false)
  .action(async (options: CleanLowerEnvsOptions & { execute?: boolean }) => {
    try {
      const isDryRun = !options.execute;

      if (isDryRun) {
        console.log(chalk.blue('🔍 DRY RUN MODE - No changes will be made'));
        console.log(
          chalk.gray(
            'Use --execute flag to perform actual cleanup operations\n'
          )
        );
      }

      const sourceEnv = options.sourceEnv || 'prod';
      if (
        sourceEnv === 'prod' &&
        !['dev', 'uat', 'pprd', 'local'].some((env) =>
          Config.hasRequiredEnvironmentConfig(env)
        )
      ) {
        console.error(
          chalk.red(
            '❌ No lower environments are configured. Run "wfuwp config wizard" to set up.'
          )
        );
        process.exit(1);
      }

      let targetEnvs = ['dev', 'uat', 'pprd'];
      if (options.env) {
        if (options.env === 'prod') {
          console.error(
            chalk.red(
              '❌ Cannot perform cleanup operations on production environment'
            )
          );
          process.exit(1);
        }
        targetEnvs = [options.env];
      }

      targetEnvs = targetEnvs.filter((env) =>
        Config.hasRequiredEnvironmentConfig(env)
      );

      if (targetEnvs.length === 0) {
        console.error(chalk.red('❌ No configured target environments found'));
        process.exit(1);
      }

      if (!Config.hasRequiredEnvironmentConfig(sourceEnv)) {
        console.error(
          chalk.red(`❌ Source environment '${sourceEnv}' is not configured`)
        );
        process.exit(1);
      }

      console.log(chalk.bold.cyan('🧹 Environment Cleanup Analysis'));
      console.log(
        `Source environment: ${chalk.yellow(sourceEnv.toUpperCase())}`
      );
      console.log(
        `Target environments: ${chalk.yellow(targetEnvs.map((e) => e.toUpperCase()).join(', '))}`
      );
      if (options.site) {
        console.log(`Target site: ${chalk.yellow(options.site)}`);
      }
      if (options.sitesOnly) {
        console.log(chalk.blue('Mode: Sites only'));
      } else if (options.tablesOnly) {
        console.log(chalk.blue('Mode: Tables only'));
      } else {
        console.log(chalk.blue('Mode: Full cleanup (sites + tables)'));
      }
      console.log();

      if (options.verbose) {
        console.log(chalk.gray('Testing database connections...'));
      }

      const allEnvs = [sourceEnv, ...targetEnvs];
      for (const env of allEnvs) {
        const connectionTest = await DatabaseOperations.testConnection(env);
        if (!connectionTest) {
          console.error(chalk.red(`❌ Cannot connect to ${env} database`));
          process.exit(1);
        }
        if (options.verbose) {
          console.log(chalk.green(`✓ ${env} database connection successful`));
        }
      }

      console.log(chalk.cyan('🔍 Analyzing environments...'));

      const cleanupOptions: CleanupOptions = {
        dryRun: isDryRun,
        sitesOnly: options.sitesOnly,
        tablesOnly: options.tablesOnly,
        targetEnvironments: targetEnvs,
        targetSite: options.site ? parseInt(options.site, 10) : undefined,
        createBackup: options.backup !== false,
        verbose: options.verbose,
        force: options.force,
      };

      if (
        options.site &&
        (isNaN(parseInt(options.site, 10)) || parseInt(options.site, 10) <= 0)
      ) {
        console.error(chalk.red('❌ Site ID must be a positive number'));
        process.exit(1);
      }

      const comparisons = await EnvironmentCleanupService.compareEnvironments(
        sourceEnv,
        targetEnvs,
        cleanupOptions
      );

      console.log(
        await EnvironmentCleanupService.generateCleanupReport(comparisons)
      );

      const totalOrphanedSites = comparisons.reduce(
        (sum, c) => sum + c.orphanedSites.length,
        0
      );
      const totalOrphanedTables = comparisons.reduce(
        (sum, c) => sum + c.orphanedTables.length,
        0
      );
      const totalTables = comparisons.reduce(
        (sum, c) => sum + c.totalOrphanedTables,
        0
      );

      if (totalOrphanedSites === 0 && totalOrphanedTables === 0) {
        console.log(
          chalk.green('✅ No cleanup needed - all environments are in sync!')
        );
        return;
      }

      if (isDryRun) {
        console.log(chalk.blue('\n🔍 DRY RUN COMPLETE'));
        console.log(
          chalk.gray('To execute these operations, run with --execute flag:')
        );
        console.log(
          chalk.cyan(
            `wfuwp clean-lower-envs --execute${options.env ? ` --env ${options.env}` : ''}${options.site ? ` --site ${options.site}` : ''}${options.sitesOnly ? ' --sites-only' : ''}${options.tablesOnly ? ' --tables-only' : ''}${options.verbose ? ' --verbose' : ''}`
          )
        );
        return;
      }

      if (!options.force) {
        console.log(
          chalk.yellow(
            '\n⚠ WARNING: This operation will permanently delete data!'
          )
        );
        console.log(chalk.red('Operations to perform:'));
        if (!options.tablesOnly && totalOrphanedSites > 0) {
          console.log(
            chalk.red(
              `  • Delete ${totalOrphanedSites} orphaned sites from wp_blogs tables`
            )
          );
        }
        console.log(
          chalk.red(`  • Drop ${totalTables} orphaned database tables`)
        );
        if (options.backup !== false) {
          console.log(chalk.blue(`  • Create backups before deletion`));
        }

        const { default: inquirer } = await import('inquirer');
        const { proceed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Are you sure you want to proceed with cleanup?',
            default: false,
          },
        ]);

        if (!proceed) {
          console.log(chalk.yellow('Operation cancelled by user'));
          process.exit(0);
        }
      }

      console.log(chalk.cyan('\n🚀 Starting cleanup operations...'));
      const startTime = Date.now();

      const results = await EnvironmentCleanupService.performEnvironmentCleanup(
        sourceEnv,
        targetEnvs,
        cleanupOptions
      );

      const totalDuration = Date.now() - startTime;

      console.log(chalk.green('\n✅ Cleanup operations completed!'));

      const finalReport = await EnvironmentCleanupService.generateCleanupReport(
        comparisons,
        results
      );
      console.log(finalReport);

      const totalSitesDeleted = results.reduce(
        (sum, r) => sum + r.deletedSites.length,
        0
      );
      const totalTablesDropped = results.reduce(
        (sum, r) => sum + r.droppedTables.length,
        0
      );
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

      console.log(chalk.bold.green('\n📈 Final Summary:'));
      console.log(`  ${chalk.green('✓')} Sites deleted: ${totalSitesDeleted}`);
      console.log(
        `  ${chalk.green('✓')} Tables dropped: ${totalTablesDropped}`
      );
      console.log(`  ${chalk.blue('⏱')} Total duration: ${totalDuration}ms`);

      if (totalErrors > 0) {
        console.log(`  ${chalk.red('❌')} Errors: ${totalErrors}`);
        console.log(
          chalk.yellow(
            '\nSome operations failed. Run with --verbose for detailed error information.'
          )
        );
      }

      if (totalErrors === 0) {
        console.log(
          chalk.green('\n🎉 All cleanup operations completed successfully!')
        );
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Environment cleanup failed:'));
      console.error(
        chalk.red(error instanceof Error ? error.message : 'Unknown error')
      );

      if (options.verbose && error instanceof Error && error.stack) {
        console.error(chalk.gray('\nStack trace:'));
        console.error(chalk.gray(error.stack));
      }

      process.exit(1);
    }
  });
