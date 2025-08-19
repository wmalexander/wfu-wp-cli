import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';
import { DatabaseOperations } from '../utils/database';
import { SiteEnumerator } from '../utils/site-enumerator';
import { BackupRecovery } from '../utils/backup-recovery';
import { EnvironmentCleanupService } from '../utils/environment-cleanup';

interface DeleteSiteOptions {
  force?: boolean;
  verbose?: boolean;
  backup?: boolean;
  dryRun?: boolean;
  skipConfirmation?: boolean;
}

export const deleteSiteCommand = new Command('delete-site')
  .description(
    'Delete a WordPress site and all its tables from a specific environment'
  )
  .argument('<site-id>', 'Site ID to delete')
  .argument('<environment>', 'Target environment (dev, uat, pprd, local)')
  .option('--dry-run', 'Preview changes without executing', false)
  .option('-f, --force', 'Skip all confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--no-backup', 'Skip creating backup before deletion', false)
  .option(
    '--skip-confirmation',
    'Skip detailed confirmation (but still show preview)',
    false
  )
  .action(
    async (
      siteIdArg: string,
      environment: string,
      options: DeleteSiteOptions
    ) => {
      try {
        const siteId = parseInt(siteIdArg, 10);

        if (isNaN(siteId) || siteId <= 0) {
          console.error(chalk.red('❌ Site ID must be a positive number'));
          process.exit(1);
        }

        if (environment === 'prod') {
          console.error(
            chalk.red(
              '❌ Cannot delete sites from production environment for safety'
            )
          );
          process.exit(1);
        }

        const validEnvironments = ['dev', 'uat', 'pprd', 'local'];
        if (!validEnvironments.includes(environment)) {
          console.error(
            chalk.red(
              `❌ Invalid environment. Must be one of: ${validEnvironments.join(', ')}`
            )
          );
          process.exit(1);
        }

        if (!Config.hasRequiredEnvironmentConfig(environment)) {
          console.error(
            chalk.red(
              `❌ Environment '${environment}' is not configured. Run 'wfuwp config wizard' to set up.`
            )
          );
          process.exit(1);
        }

        console.log(chalk.bold.cyan(`🔍 Site Deletion Analysis`));
        console.log(`Site ID: ${chalk.yellow(siteId)}`);
        console.log(`Environment: ${chalk.yellow(environment.toUpperCase())}`);
        console.log();

        if (options.verbose) {
          console.log(chalk.gray('Checking database connectivity...'));
        }

        const connectionTest =
          await DatabaseOperations.testConnection(environment);
        if (!connectionTest) {
          console.error(
            chalk.red(`❌ Cannot connect to ${environment} database`)
          );
          process.exit(1);
        }

        if (options.verbose) {
          console.log(chalk.green('✓ Database connection successful'));
        }

        const siteInfo = await SiteEnumerator.getSiteInfo(siteId, environment);
        if (!siteInfo) {
          console.error(
            chalk.red(
              `❌ Site ${siteId} does not exist in ${environment} environment`
            )
          );
          process.exit(1);
        }

        const siteTables = DatabaseOperations.getSiteTables(
          siteId.toString(),
          environment
        );

        if (siteTables.length === 0) {
          console.log(
            chalk.yellow(
              `⚠ No tables found for site ${siteId} in ${environment} environment`
            )
          );
          if (!options.force && !options.skipConfirmation) {
            const { default: inquirer } = await import('inquirer');
            const { proceed } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'proceed',
                message:
                  'Site exists in wp_blogs but has no tables. Delete site entry anyway?',
                default: false,
              },
            ]);
            if (!proceed) {
              console.log(chalk.yellow('Operation cancelled'));
              process.exit(0);
            }
          }
        }

        console.log(chalk.cyan('\n📊 Site Information:'));
        console.log(`  Domain: ${chalk.white(siteInfo.domain)}`);
        console.log(`  Path: ${chalk.white(siteInfo.path)}`);
        console.log(
          `  Status: ${
            siteInfo.isDeleted
              ? chalk.red('DELETED')
              : siteInfo.isArchived
                ? chalk.yellow('ARCHIVED')
                : siteInfo.isSpam
                  ? chalk.red('SPAM')
                  : chalk.green('ACTIVE')
          }`
        );
        console.log(`  Tables to delete: ${chalk.yellow(siteTables.length)}`);

        if (siteTables.length > 0) {
          if (siteTables.length <= 10) {
            console.log(chalk.cyan('\n📋 Tables to be deleted:'));
            siteTables.forEach((table) => {
              console.log(`  ${chalk.gray('•')} ${table}`);
            });
          } else {
            console.log(chalk.cyan('\n📋 Sample of tables to be deleted:'));
            siteTables.slice(0, 5).forEach((table) => {
              console.log(`  ${chalk.gray('•')} ${table}`);
            });
            console.log(
              `  ${chalk.gray('...')} and ${siteTables.length - 5} more tables`
            );
          }
        }

        if (options.dryRun) {
          console.log(chalk.blue('\n🔍 DRY RUN - No changes will be made'));
          console.log(chalk.gray('Operations that would be performed:'));
          console.log(
            chalk.gray(
              `  1. ${options.backup !== false ? 'Create backup of site data' : 'Skip backup (--no-backup)'}`
            )
          );
          console.log(
            chalk.gray(`  2. Delete site ${siteId} from wp_blogs table`)
          );
          if (siteTables.length > 0) {
            console.log(
              chalk.gray(`  3. Drop ${siteTables.length} site-specific tables`)
            );
          }
          console.log(
            chalk.green('\n✓ Dry run completed - use --force to execute')
          );
          return;
        }

        if (!options.force && !options.skipConfirmation) {
          console.log(
            chalk.yellow('\n⚠ WARNING: This operation is irreversible!')
          );
          console.log(chalk.red('This will permanently delete:'));
          console.log(
            chalk.red(`  • Site ${siteId} entry from wp_blogs table`)
          );
          if (siteTables.length > 0) {
            console.log(
              chalk.red(
                `  • All ${siteTables.length} site-specific database tables`
              )
            );
            console.log(
              chalk.red(
                '  • All content, posts, pages, and settings for this site'
              )
            );
          }

          const { default: inquirer } = await import('inquirer');
          const { confirmDelete } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirmDelete',
              message: `Are you absolutely sure you want to delete site ${siteId} from ${environment}?`,
              default: false,
            },
          ]);

          if (!confirmDelete) {
            console.log(chalk.yellow('Operation cancelled by user'));
            process.exit(0);
          }

          await inquirer.prompt([
            {
              type: 'input',
              name: 'typeConfirmation',
              message: `Type "DELETE SITE ${siteId}" to confirm:`,
              validate: (input: string) => {
                return (
                  input === `DELETE SITE ${siteId}` ||
                  'Confirmation text does not match'
                );
              },
            },
          ]);
        }

        console.log(chalk.cyan('\n🚀 Starting site deletion...'));
        const startTime = Date.now();

        if (options.backup !== false) {
          try {
            console.log(chalk.gray('Creating backup before deletion...'));
            const timestamp = new Date()
              .toISOString()
              .replace(/[:.]/g, '-')
              .slice(0, 19);
            const backupPath = require('path').join(
              process.cwd(),
              `site-${siteId}-${environment}-${timestamp}.sql`
            );
            await BackupRecovery.backupSiteTables(
              environment,
              siteId,
              backupPath
            );
            console.log(chalk.green('✓ Backup created successfully'));
          } catch (error) {
            console.error(
              chalk.red(
                `❌ Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );

            if (!options.force) {
              const { default: inquirer } = await import('inquirer');
              const { proceedWithoutBackup } = await inquirer.prompt([
                {
                  type: 'confirm',
                  name: 'proceedWithoutBackup',
                  message: 'Backup failed. Proceed with deletion anyway?',
                  default: false,
                },
              ]);

              if (!proceedWithoutBackup) {
                console.log(
                  chalk.yellow('Operation cancelled due to backup failure')
                );
                process.exit(1);
              }
            }
          }
        } else if (options.verbose) {
          console.log(chalk.gray('Skipping backup (--no-backup specified)'));
        }

        const result =
          await EnvironmentCleanupService.deleteSiteFromEnvironment(
            siteId,
            environment,
            {
              dryRun: false,
              createBackup: false, // Already handled above
              verbose: options.verbose,
            }
          );

        const duration = Date.now() - startTime;

        if (result.errors.length > 0) {
          console.log(chalk.red('\n❌ Errors encountered during deletion:'));
          result.errors.forEach((error) => {
            console.log(chalk.red(`  • ${error}`));
          });
        }

        if (result.deletedSites.length > 0 || result.droppedTables.length > 0) {
          console.log(
            chalk.green('\n✅ Site deletion completed successfully!')
          );
          console.log(
            `  ${chalk.green('•')} Site deleted from wp_blogs: ${result.deletedSites.length > 0 ? 'Yes' : 'No'}`
          );
          console.log(
            `  ${chalk.green('•')} Tables dropped: ${result.droppedTables.length}`
          );
          console.log(`  ${chalk.green('•')} Duration: ${duration}ms`);
        } else {
          console.log(
            chalk.yellow(
              '\n⚠ No changes were made (site may not have existed)'
            )
          );
        }

        if (options.verbose) {
          console.log(chalk.cyan('\n📊 Detailed Results:'));
          console.log(`  Environment: ${result.environment}`);
          console.log(
            `  Deleted sites: ${JSON.stringify(result.deletedSites)}`
          );
          console.log(
            `  Dropped tables: ${
              result.droppedTables.length > 5
                ? `${result.droppedTables.slice(0, 5).join(', ')}... (${result.droppedTables.length - 5} more)`
                : result.droppedTables.join(', ')
            }`
          );
        }
      } catch (error) {
        console.error(chalk.red('\n❌ Site deletion failed:'));
        console.error(
          chalk.red(error instanceof Error ? error.message : 'Unknown error')
        );

        if (options.verbose && error instanceof Error && error.stack) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }

        process.exit(1);
      }
    }
  );
