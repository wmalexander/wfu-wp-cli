import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { LocalHostsManager } from '../utils/local-hosts-manager';
import { DDEVManager } from '../utils/ddev-manager';
import { LocalInstaller } from '../utils/local-installer';
import { LocalContentManager } from '../utils/local-content-manager';
import { LocalConfigWizard } from '../utils/local-config-wizard';
import { Config } from '../utils/config';

export const localCommand = new Command('local')
  .description('Manage local development environment for WFU WordPress sites')
  .addHelpText(
    'after',
    `
${chalk.bold('Examples:')}
  ${chalk.green('wfuwp local install')}                           Complete setup (Docker, DDEV, mkcert, database)
  ${chalk.green('wfuwp local start')}                             Start development environment  
  ${chalk.green('wfuwp local status')}                            Check environment health
  ${chalk.green('wfuwp local reset --force')}                     Reset to fresh state

${chalk.bold('Core Commands:')}
  ${chalk.cyan('status')}         ${chalk.green('✓')} Check environment health
  ${chalk.cyan('install')}        ${chalk.green('✓')} Complete setup (Docker, DDEV, mkcert, database)
  ${chalk.cyan('start')}          ${chalk.green('✓')} Start development environment
  ${chalk.cyan('stop')}           ${chalk.green('✓')} Stop development environment
  ${chalk.cyan('restart')}        ${chalk.green('✓')} Restart development environment
  ${chalk.cyan('delete')}         ${chalk.green('✓')} Delete DDEV project completely
  ${chalk.cyan('reset')}          ${chalk.green('✓')} Reset to fresh state (git main + database)

${chalk.dim('💡 Simple workflow: install → start → [develop] → stop → reset')}
Use "${chalk.green('wfuwp local <subcommand> --help')}" for detailed help on each subcommand.
`
  );

localCommand
  .command('status')
  .description('Show local development environment status')
  .option('-v, --verbose', 'Show detailed status information', false)
  .action(async (options) => {
    try {
      const manager = new DDEVManager();
      const health = manager.checkEnvironmentHealth();

      console.log(chalk.bold('\n🔧 Local Development Environment Status\n'));

      const statusIcon =
        health.overall === 'healthy'
          ? '✅'
          : health.overall === 'warning'
            ? '⚠️'
            : '❌';
      const statusColor =
        health.overall === 'healthy'
          ? chalk.green
          : health.overall === 'warning'
            ? chalk.yellow
            : chalk.red;

      console.log(
        `${statusIcon} ${chalk.bold('Overall Status')}: ${statusColor(health.overall.toUpperCase())}`
      );
      console.log();

      console.log(chalk.bold('📦 Core Dependencies:'));
      console.log(
        `  ${health.docker.isInstalled ? '✅' : '❌'} ${chalk.cyan('Docker')}: ${
          health.docker.isInstalled
            ? `${chalk.green('Installed')} ${health.docker.version ? `(${health.docker.version})` : ''}`
            : chalk.red('Not installed')
        }`
      );

      if (health.docker.isInstalled) {
        console.log(
          `    ${health.docker.isRunning ? '▶️' : '⏹️'} ${chalk.dim('Status')}: ${
            health.docker.isRunning
              ? chalk.green('Running')
              : chalk.yellow('Stopped')
          }`
        );
        console.log(
          `    ${health.docker.compose ? '✅' : '❌'} ${chalk.dim('Docker Compose')}: ${
            health.docker.compose
              ? chalk.green('Available')
              : chalk.red('Not available')
          }`
        );
      }

      console.log(
        `  ${health.ddev.isInstalled ? '✅' : '❌'} ${chalk.cyan('DDEV')}: ${
          health.ddev.isInstalled
            ? `${chalk.green('Installed')} ${health.ddev.version ? `(${health.ddev.version})` : ''}`
            : chalk.red('Not installed')
        }`
      );

      console.log();

      console.log(chalk.bold('🛠️ System Tools:'));
      for (const dep of health.dependencies) {
        const icon = dep.installed ? '✅' : dep.required ? '❌' : '⚪';
        const status = dep.installed
          ? `${chalk.green('Installed')} ${dep.version ? `(${dep.version})` : ''}`
          : chalk.red('Not installed');
        const required = dep.required
          ? chalk.red(' [Required]')
          : chalk.dim(' [Optional]');

        console.log(`  ${icon} ${chalk.cyan(dep.name)}: ${status}${required}`);
      }

      console.log();

      if (health.ddev.isInstalled && health.ddev.projects.length > 0) {
        console.log(chalk.bold('🚀 DDEV Projects:'));
        for (const project of health.ddev.projects) {
          const statusIcon = project.status === 'running' ? '▶️' : '⏹️';
          const statusColor =
            project.status === 'running' ? chalk.green : chalk.yellow;

          console.log(
            `  ${statusIcon} ${chalk.cyan(project.name)}: ${statusColor(project.status)}`
          );
          if (options.verbose) {
            if (project.url) {
              console.log(
                `    ${chalk.dim('URL')}: ${chalk.blue(project.url)}`
              );
            }
            if (project.type) {
              console.log(`    ${chalk.dim('Type')}: ${project.type}`);
            }
            if (project.location) {
              console.log(
                `    ${chalk.dim('Location')}: ${chalk.dim(project.location)}`
              );
            }
          }
        }
        console.log();
      } else if (health.ddev.isInstalled) {
        console.log(chalk.yellow('📂 No DDEV projects found\n'));
      }

      if (health.recommendations.length > 0) {
        console.log(chalk.bold('💡 Recommendations:'));
        for (const rec of health.recommendations) {
          console.log(`  ${chalk.yellow('•')} ${rec}`);
        }
        console.log();
      }

      if (options.verbose) {
        const hostsManager = new LocalHostsManager();
        const domains = hostsManager.getCurrentDomains();

        if (domains.length > 0) {
          console.log(chalk.bold('🌐 Local Development Domains:'));
          for (const domain of domains) {
            console.log(
              `  ${chalk.green('•')} ${chalk.blue(domain.domain)} → ${chalk.dim(domain.ipAddress)}`
            );
          }
          console.log();
        }

        const wpProjects = manager.findWordPressProjects();
        if (wpProjects.length > 0) {
          console.log(chalk.bold('🔍 Found WordPress Projects:'));
          for (const project of wpProjects) {
            console.log(`  ${chalk.green('•')} ${chalk.dim(project)}`);
          }
          console.log();
        }
      }

      if (health.overall !== 'healthy') {
        console.log(
          chalk.dim(
            'Tip: Use "wfuwp local install --help" to set up missing dependencies'
          )
        );
      } else {
        console.log(
          chalk.dim('🎉 Your local development environment is ready!')
        );
      }
    } catch (error) {
      console.error(chalk.red(`Error checking environment status: ${error}`));
      process.exit(1);
    }
  });

localCommand
  .command('domain')
  .description('Manage local development domains')
  .addCommand(
    new Command('add')
      .description('Add local development domain')
      .argument('<domain>', 'Domain name (e.g., test.wfu.local)')
      .action(async (domainName) => {
        try {
          const manager = new LocalHostsManager();
          const domain = manager.addDomain(domainName);

          console.log(
            chalk.green(`Successfully added local development domain:`)
          );
          console.log(`  Domain: ${chalk.blue(domain.domain)}`);
          console.log(`  IP: ${chalk.dim(domain.ipAddress)}`);
          console.log();
          console.log(chalk.dim('Domain added to /etc/hosts file'));
        } catch (error) {
          console.error(chalk.red(`Error: ${error}`));
          if (
            error instanceof Error &&
            error.message.includes('Administrator privileges')
          ) {
            console.error(
              chalk.yellow(
                'Hint: Run with sudo - example: sudo wfuwp local domain add test.wfu.local'
              )
            );
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove local development domain')
      .argument('<domain>', 'Domain name (e.g., test.wfu.local)')
      .action(async (domainName) => {
        try {
          const manager = new LocalHostsManager();
          const domain = manager.getDomain(domainName);

          if (!domain) {
            console.log(
              chalk.yellow(
                `No local development domain found: ${domainName}`
              )
            );
            return;
          }

          const removed = manager.removeDomain(domainName);

          if (removed) {
            console.log(
              chalk.green(`Successfully removed local development domain:`)
            );
            console.log(`  Domain: ${chalk.blue(domain.domain)}`);
            console.log(`  IP: ${chalk.dim(domain.ipAddress)}`);
          } else {
            console.log(
              chalk.yellow(
                `Failed to remove domain: ${domainName}`
              )
            );
          }
        } catch (error) {
          console.error(chalk.red(`Error: ${error}`));
          if (
            error instanceof Error &&
            error.message.includes('Administrator privileges')
          ) {
            console.error(
              chalk.yellow(
                'Hint: Run with sudo - example: sudo wfuwp local domain remove test.wfu.local'
              )
            );
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all local development domains')
      .action(async () => {
        try {
          const manager = new LocalHostsManager();
          const domains = manager.getCurrentDomains();

          if (domains.length === 0) {
            console.log(
              chalk.yellow('No local development domains configured')
            );
            console.log();
            console.log(chalk.dim('Add a domain with:'));
            console.log(chalk.green('  sudo wfuwp local domain add <domain>'));
            return;
          }

          console.log(chalk.bold('\nLocal Development Domains:'));
          console.log();
          console.log(chalk.dim('Domain | IP Address'));
          console.log(chalk.dim('-------|----------'));

          for (const domain of domains) {
            console.log(
              `${chalk.blue(domain.domain.padEnd(25))} | ${chalk.dim(domain.ipAddress)}`
            );
          }

          console.log();
          console.log(
            chalk.dim(
              `Total: ${domains.length} domain${domains.length === 1 ? '' : 's'} configured`
            )
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${error}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('Remove all local development domains')
      .option('-f, --force', 'Skip confirmation prompt', false)
      .action(async (options) => {
        try {
          const manager = new LocalHostsManager();
          const domains = manager.getCurrentDomains();

          if (domains.length === 0) {
            console.log(chalk.yellow('No local development domains to remove'));
            return;
          }

          if (!options.force) {
            console.log(
              chalk.yellow(
                `This will remove ${domains.length} local development domain${domains.length === 1 ? '' : 's'}:`
              )
            );
            console.log();
            for (const domain of domains) {
              console.log(
                `  ${chalk.dim('•')} ${chalk.blue(domain.domain)} → ${chalk.dim(domain.ipAddress)}`
              );
            }
            console.log();
            console.error(
              chalk.red(
                'Use --force flag to confirm removal of all local development domains'
              )
            );
            console.error(
              chalk.dim('Example: sudo wfuwp local domain reset --force')
            );
            process.exit(1);
          }

          const removedCount = manager.removeAllDomains();

          console.log(
            chalk.green(
              `Successfully removed ${removedCount} local development domain${removedCount === 1 ? '' : 's'}`
            )
          );
        } catch (error) {
          console.error(chalk.red(`Error: ${error}`));
          if (
            error instanceof Error &&
            error.message.includes('Administrator privileges')
          ) {
            console.error(
              chalk.yellow(
                'Hint: Run with sudo - example: sudo wfuwp local domain reset --force'
              )
            );
          }
          process.exit(1);
        }
      })
  );

localCommand
  .command('install')
  .description('Install dependencies and setup database (Docker, DDEV, mkcert, initial database)')
  .option('-f, --force', 'Force reinstallation of existing dependencies', false)
  .action(async (options) => {
    try {
      console.log(
        chalk.blue('\n🚀 Setting up Local Development Environment\n')
      );

      const installer = new LocalInstaller();

      // Always install all dependencies (Docker, DDEV, mkcert)
      const result = await installer.installDependencies({
        docker: true,
        ddev: true,
        mkcert: true,
        all: true,
        force: options.force,
      });

      console.log(chalk.bold('\n📊 Step 1/3 - Dependencies Installation:'));
      if (result.installed.length > 0) {
        console.log(
          chalk.green(
            `✅ Installed (${result.installed.length}): ${result.installed.join(', ')}`
          )
        );
      }

      if (result.skipped.length > 0) {
        console.log(
          chalk.yellow(
            `⚠️  Skipped (${result.skipped.length}): ${result.skipped.join(', ')}`
          )
        );
      }

      if (result.failed.length > 0) {
        console.log(
          chalk.red(
            `❌ Failed (${result.failed.length}): ${result.failed.join(', ')}`
          )
        );
        for (const error of result.errors) {
          console.log(chalk.red(`   ${error}`));
        }
      }

      console.log();

      if (result.success) {
        console.log(chalk.green('🎉 Dependencies installed successfully!'));
        
        // Step 2: Start DDEV before importing database
        console.log(chalk.blue('\n🚀 Step 2/3 - Starting DDEV environment...'));
        const manager = new DDEVManager();
        const startResult = manager.startProject();
        
        if (startResult.success) {
          console.log(chalk.green('✅ DDEV environment started'));
          
          // Step 3: Import initial database
          console.log(chalk.blue('\n🗄️  Step 3/3 - Setting up initial multisite database...'));
          const contentManager = new LocalContentManager();
          const dbResult = await contentManager.setupInitialDatabase({
            force: true,
            backup: false,
            keepFiles: false,
          });

          if (dbResult.success) {
            console.log(chalk.green('✅ Initial database imported'));
            console.log(chalk.green('\n🎉 Complete setup finished successfully!'));
            console.log();
            console.log(chalk.dim('💡 Your development environment is ready and running!'));
            
            const status = manager.getStatus();
            if (status.projects.length > 0) {
              console.log(chalk.bold('\n📋 Active Projects:'));
              for (const project of status.projects.filter((p) => p.status === 'running')) {
                console.log(`  ${chalk.cyan(project.name)} - ${chalk.green(project.url || 'No URL')}`);
              }
            }
          } else {
            console.log(chalk.yellow('⚠️  Database import failed, but continuing...'));
            console.log(chalk.dim(`   ${dbResult.message}`));
            console.log(chalk.green('\n🎉 Dependencies installed and DDEV started!'));
            console.log();
            console.log(chalk.dim('💡 Your environment is running (without database)'));
            console.log(chalk.dim('💡 You can import the database later with "wfuwp local reset --force"'));
          }
        } else {
          console.log(chalk.yellow('⚠️  Could not start DDEV environment'));
          console.log(chalk.dim(`   ${startResult.message}`));
          console.log(chalk.green('\n🎉 Dependencies installed successfully!'));
          console.log();
          console.log(chalk.dim('💡 Next: Start your development environment manually'));
          console.log(chalk.dim('      wfuwp local start'));
          console.log(chalk.dim('💡 Then: Import database with "wfuwp local reset --force"'));
        }
      } else {
        console.log(chalk.red('❌ Installation completed with errors.'));
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red(`Error during installation: ${error}`));
      process.exit(1);
    }
  });

localCommand
  .command('start')
  .description('Start local development environment')
  .action(async (options) => {
    try {
      console.log(chalk.bold('\n🚀 Starting Local Development Environment\n'));
      const manager = new DDEVManager();
      const result = manager.startProject();
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        const status = manager.getStatus();
        if (status.projects.length > 0) {
          console.log(chalk.bold('\n📋 Active Projects:'));
          for (const project of status.projects.filter(
            (p) => p.status === 'running'
          )) {
            console.log(
              `  ${chalk.cyan(project.name)} - ${chalk.green(project.url || 'No URL')}`
            );
          }
        }
      } else {
        console.log(chalk.red(`❌ ${result.message}`));
        if (result.message.includes('Docker is not running')) {
          console.log(
            chalk.dim('\n💡 Try: Open Docker Desktop and wait for it to start')
          );
        } else if (result.message.includes('DDEV is not installed')) {
          console.log(chalk.dim('\n💡 Try: wfuwp local install dependencies'));
        }
        process.exit(1);
      }
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Failed to start: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

localCommand
  .command('stop')
  .description('Stop local development environment')
  .action(async (options) => {
    try {
      console.log(chalk.bold('\n🛑 Stopping Local Development Environment\n'));
      const manager = new DDEVManager();
      const result = manager.stopProject();
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        const status = manager.getStatus();
        const runningProjects = status.projects.filter(
          (p) => p.status === 'running'
        );
        if (runningProjects.length > 0) {
          console.log(chalk.yellow('\n⚠️ Some projects are still running:'));
          for (const project of runningProjects) {
            console.log(
              `  ${chalk.cyan(project.name)} - ${chalk.yellow('Still running')}`
            );
          }
        }
      } else {
        console.log(chalk.red(`❌ ${result.message}`));
        if (result.message.includes('DDEV is not installed')) {
          console.log(chalk.dim('\n💡 Try: wfuwp local install dependencies'));
        }
        process.exit(1);
      }
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Failed to stop: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

localCommand
  .command('restart')
  .description('Restart local development environment')
  .action(async (options) => {
    try {
      console.log(
        chalk.bold('\n🔄 Restarting Local Development Environment\n')
      );
      const manager = new DDEVManager();
      const result = manager.restartProject();
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        const status = manager.getStatus();
        if (status.projects.length > 0) {
          console.log(chalk.bold('\n📋 Active Projects:'));
          for (const project of status.projects.filter(
            (p) => p.status === 'running'
          )) {
            console.log(
              `  ${chalk.cyan(project.name)} - ${chalk.green(project.url || 'No URL')}`
            );
          }
        }
      } else {
        console.log(chalk.red(`❌ ${result.message}`));
        if (result.message.includes('Docker is not running')) {
          console.log(
            chalk.dim('\n💡 Try: Open Docker Desktop and wait for it to start')
          );
        } else if (result.message.includes('DDEV is not installed')) {
          console.log(chalk.dim('\n💡 Try: wfuwp local install dependencies'));
        }
        process.exit(1);
      }
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Failed to restart: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

localCommand
  .command('delete')
  .description('Delete local development environment project')
  .option('-f, --force', 'Skip confirmation prompts', false)
  .action(async (options) => {
    try {
      if (!options.force) {
        console.log(chalk.yellow(`\n⚠️  Delete Local Development Environment`));
        console.log(
          `This will ${chalk.red('COMPLETELY DELETE')} the local DDEV project including all data and containers.`
        );
        console.log(
          `Local code files will ${chalk.green('NOT')} be deleted, only the DDEV project.`
        );
        console.log();
        console.log(chalk.dim('Use --force to skip this confirmation'));
        console.log(chalk.red('Cancelled - use --force flag to proceed'));
        process.exit(1);
      }

      console.log(chalk.bold('\n🗑️  Deleting Local Development Environment\n'));
      
      try {
        const { execSync } = require('child_process');
        execSync('ddev delete wfu-local -Oy', { 
          stdio: 'inherit',
          encoding: 'utf8'
        });
        console.log(chalk.green('✅ Local development environment deleted successfully'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('Could not find a project')) {
          console.log(chalk.yellow('⚠️ No DDEV project found to delete'));
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.log(
        chalk.red(
          `❌ Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

localCommand
  .command('refresh')
  .description('Refresh database from production S3 bucket or reset to initial multisite setup')
  .argument('[site-id]', 'Numeric site identifier (e.g., 43) - optional when using --initial-db')
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('--no-backup', 'Skip creating backup before refresh', false)
  .option('--from <env>', 'Source environment (prod, uat, pprd, dev)', 'prod')
  .option('--keep-files', 'Keep downloaded database files', false)
  .option('--work-dir <dir>', 'Custom work directory for temporary files')
  .option('--build', 'Run build operations after refresh', false)
  .option('--initial-db', 'Reset to initial multisite database with all sites', false)
  .action(async (siteId, options) => {
    try {
      if (options.initialDb) {
        if (siteId) {
          console.error(chalk.red('Error: Site ID should not be specified when using --initial-db'));
          process.exit(1);
        }
      } else {
        if (!siteId || !/^\d+$/.test(siteId)) {
          console.error(chalk.red('Error: Site ID must be a positive integer (or use --initial-db for complete multisite setup)'));
          process.exit(1);
        }
      }

      if (!['prod', 'uat', 'pprd', 'dev'].includes(options.from)) {
        console.error(
          chalk.red('Error: Invalid environment. Use prod, uat, pprd, or dev')
        );
        process.exit(1);
      }

      if (!options.force) {
        console.log(chalk.yellow(`\n⚠️  Database Refresh Confirmation`));
        if (options.initialDb) {
          console.log(
            `This will replace the local database with the ${chalk.cyan('complete multisite setup')} including all sites.`
          );
        } else {
          console.log(
            `This will replace the local database for site ${chalk.cyan(siteId)} with data from ${chalk.cyan(options.from)}.`
          );
        }
        console.log(
          `Current local data will be ${options.backup ? 'backed up and then ' : ''}${chalk.red('REPLACED')}.`
        );
        console.log();
        console.log(chalk.dim('Use --force to skip this confirmation'));
        console.log(chalk.red('Cancelled - use --force flag to proceed'));
        process.exit(1);
      }

      const contentManager = new LocalContentManager();
      const result = options.initialDb 
        ? await contentManager.setupInitialDatabase({
            force: options.force,
            backup: options.backup,
            workDir: options.workDir,
            keepFiles: options.keepFiles,
          })
        : await contentManager.refreshDatabase({
            siteId,
            environment: options.from,
            force: options.force,
            backup: options.backup,
            workDir: options.workDir,
            keepFiles: options.keepFiles,
          });

      if (!options.initialDb) {
        contentManager.generateRefreshSummary(
          {
            siteId,
            environment: options.from,
            force: options.force,
            backup: options.backup,
            workDir: options.workDir,
            keepFiles: options.keepFiles,
          },
          result
        );
      }

      if (result.success && options.build) {
        console.log(chalk.blue('\n🔨 Running build operations...'));
        const buildResult = contentManager.performBuildOperations(siteId);

        console.log(chalk.bold('\n🔧 Build Summary:'));
        if (buildResult.operations.length > 0) {
          console.log(
            chalk.green(`✅ Completed (${buildResult.operations.length}):`)
          );
          for (const op of buildResult.operations) {
            console.log(`  ${chalk.green('•')} ${op}`);
          }
        }

        if (buildResult.errors.length > 0) {
          console.log(
            chalk.yellow(`⚠️  Warnings/Errors (${buildResult.errors.length}):`)
          );
          for (const error of buildResult.errors) {
            console.log(`  ${chalk.yellow('•')} ${error}`);
          }
        }

        console.log();
        if (buildResult.success) {
          console.log(
            chalk.green('🎉 Build operations completed successfully!')
          );
        } else {
          console.log(
            chalk.yellow('⚠️ Build completed with some warnings/errors')
          );
        }
      }

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

localCommand
  .command('reset')
  .description('Reset to fresh state (git main, composer update, initial database)')
  .option('-f, --force', 'Skip confirmation prompts', false)
  .action(async (options) => {
    try {
      if (!options.force) {
        console.log(chalk.yellow(`\n🔄 Reset to Fresh State`));
        console.log('This will restore your local development environment to a fresh state:');
        console.log('  • Switch to main branch and pull latest changes');
        console.log('  • Update Composer dependencies');
        console.log('  • Import initial multisite database');

        console.log();
        console.log(chalk.dim('Use --force to proceed with reset'));
        console.log(chalk.red('Cancelled - use --force flag to proceed'));
        process.exit(1);
      }

      console.log(chalk.bold('\n🔄 Resetting to Fresh State\n'));

      const { execSync } = require('child_process');
      
      try {
        // Step 1: Git reset to main
        console.log(chalk.blue('📥 1. Syncing with remote main branch...'));
        execSync('git checkout main', { stdio: 'inherit' });
        execSync('git pull origin main', { stdio: 'inherit' });
        console.log(chalk.green('✅ Git synced to latest main'));

        // Step 2: Update dependencies  
        console.log(chalk.blue('\n📦 2. Updating Composer dependencies...'));
        execSync('composer update', { stdio: 'inherit' });
        console.log(chalk.green('✅ Composer dependencies updated'));

        // Step 3: Import initial database
        console.log(chalk.blue('\n🗄️  3. Importing initial multisite database...'));
        const contentManager = new LocalContentManager();
        const dbResult = await contentManager.setupInitialDatabase({
          force: true,
          backup: false,
          keepFiles: false,
        });

        if (dbResult.success) {
          console.log(chalk.green('✅ Initial database imported'));
        } else {
          console.log(chalk.yellow('⚠️  Database import failed, but continuing...'));
          console.log(chalk.dim(`   ${dbResult.message}`));
        }

        console.log(chalk.green('\n🎉 Fresh state reset completed successfully!'));
        console.log();
        console.log(chalk.dim('💡 Your environment is now in a clean, known-good state'));
        console.log(chalk.dim('💡 Use "wfuwp local start" to begin development'));

      } catch (error) {
        console.log(chalk.red('\n❌ Reset failed during execution'));
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

localCommand
  .command('config')
  .description('Configure local development settings')
  .addCommand(
    new Command('wizard')
      .description('Interactive configuration wizard for first-time setup')
      .action(async () => {
        try {
          const wizard = new LocalConfigWizard();
          await wizard.runWizard();
        } catch (error) {
          if (error instanceof Error && error.message.includes('aborted')) {
            console.log(
              chalk.yellow('\n⏹️  Configuration wizard cancelled by user')
            );
            process.exit(0);
          }
          console.error(chalk.red(`Configuration wizard error: ${error}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('show')
      .alias('list')
      .description('Show current local development configuration')
      .action(async () => {
        try {
          if (!Config.hasLocalConfig()) {
            console.log(
              chalk.yellow('⚠️  No local development configuration found\n')
            );
            console.log(chalk.dim('Setup your local configuration with:'));
            console.log(chalk.green('  wfuwp local config wizard'));
            return;
          }

          console.log(chalk.bold('\n⚙️  Local Development Configuration\n'));

          const workspaceDir = Config.getLocalWorkspaceDir();
          const defaultPort = Config.getLocalDefaultPort();
          const defaultEnvironment = Config.getLocalDefaultEnvironment();
          const autoStart = Config.getLocalAutoStart();
          const backupBeforeRefresh = Config.getLocalBackupBeforeRefresh();

          console.log(`${chalk.cyan('Workspace Directory')}:`);
          console.log(`  ${workspaceDir}`);
          console.log(
            `  ${chalk.dim(`(${existsSync(workspaceDir) ? 'exists' : 'will be created'})`)}\n`
          );

          console.log(
            `${chalk.cyan('Default Port')}: ${chalk.yellow(defaultPort)}\n`
          );

          console.log(
            `${chalk.cyan('Default Environment')}: ${chalk.green(defaultEnvironment)}`
          );
          console.log(
            `  ${chalk.dim('Used for database refresh operations')}\n`
          );

          console.log(
            `${chalk.cyan('Auto Start Projects')}: ${autoStart ? chalk.green('Yes') : chalk.red('No')}`
          );
          console.log(
            `  ${chalk.dim('Automatically start DDEV projects when using local commands')}\n`
          );

          console.log(
            `${chalk.cyan('Backup Before Refresh')}: ${backupBeforeRefresh ? chalk.green('Yes') : chalk.red('No')}`
          );
          console.log(
            `  ${chalk.dim('Create database backups before refresh operations')}\n`
          );

          console.log(chalk.dim('Modify settings with:'));
          console.log(chalk.green('  wfuwp local config set <key> <value>'));
          console.log(chalk.green('  wfuwp local config wizard'));
        } catch (error) {
          console.error(chalk.red(`Error displaying configuration: ${error}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('set')
      .description('Set a local development configuration value')
      .argument(
        '<key>',
        'Configuration key (workspaceDir, defaultPort, defaultEnvironment, autoStart, backupBeforeRefresh)'
      )
      .argument('<value>', 'Configuration value')
      .action(async (key, value) => {
        try {
          const validKeys = [
            'workspaceDir',
            'defaultPort',
            'defaultEnvironment',
            'autoStart',
            'backupBeforeRefresh',
          ];

          if (!validKeys.includes(key)) {
            console.error(chalk.red(`Invalid configuration key: ${key}`));
            console.error(chalk.dim(`Valid keys: ${validKeys.join(', ')}`));
            process.exit(1);
          }

          // Validate the value based on key
          if (key === 'defaultPort') {
            const port = parseInt(value, 10);
            if (isNaN(port) || port < 1 || port > 65535) {
              console.error(
                chalk.red('defaultPort must be a valid port number (1-65535)')
              );
              process.exit(1);
            }
          } else if (key === 'defaultEnvironment') {
            if (!['dev', 'uat', 'pprd', 'prod'].includes(value)) {
              console.error(
                chalk.red(
                  'defaultEnvironment must be one of: dev, uat, pprd, prod'
                )
              );
              process.exit(1);
            }
          } else if (key === 'autoStart' || key === 'backupBeforeRefresh') {
            const boolValue = value.toLowerCase();
            if (!['true', 'false'].includes(boolValue)) {
              console.error(
                chalk.red(`${key} must be either 'true' or 'false'`)
              );
              process.exit(1);
            }
          }

          Config.set(`local.${key}`, value);

          console.log(chalk.green(`✅ Configuration updated successfully`));
          console.log(`  ${chalk.cyan(key)}: ${chalk.yellow(value)}`);
          console.log();
          console.log(chalk.dim('View full configuration with:'));
          console.log(chalk.green('  wfuwp local config show'));
        } catch (error) {
          console.error(chalk.red(`Error setting configuration: ${error}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a local development configuration value')
      .argument('<key>', 'Configuration key')
      .action(async (key) => {
        try {
          const validKeys = [
            'workspaceDir',
            'defaultPort',
            'defaultEnvironment',
            'autoStart',
            'backupBeforeRefresh',
          ];

          if (!validKeys.includes(key)) {
            console.error(chalk.red(`Invalid configuration key: ${key}`));
            console.error(chalk.dim(`Valid keys: ${validKeys.join(', ')}`));
            process.exit(1);
          }

          const value = Config.get(`local.${key}`);

          if (value === undefined) {
            console.log(chalk.yellow(`Configuration key '${key}' is not set`));
            console.log(chalk.dim('Set it with:'));
            console.log(chalk.green(`  wfuwp local config set ${key} <value>`));
            return;
          }

          console.log(value);
        } catch (error) {
          console.error(chalk.red(`Error getting configuration: ${error}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('Reset local development configuration to defaults')
      .option('-f, --force', 'Skip confirmation prompt', false)
      .action(async (options) => {
        try {
          if (!Config.hasLocalConfig()) {
            console.log(
              chalk.yellow('No local development configuration to reset')
            );
            return;
          }

          if (!options.force) {
            console.log(
              chalk.yellow(
                '\n⚠️  This will reset ALL local development configuration to defaults'
              )
            );
            console.log(
              chalk.red('Current configuration will be lost permanently')
            );
            console.log();
            console.log(chalk.dim('Use --force flag to confirm reset'));
            console.log(chalk.dim('Example: wfuwp local config reset --force'));
            process.exit(1);
          }

          // Reset by removing the entire local config section
          const config = Config.list();
          delete config.local;

          // Re-save the config without local section
          const fs = require('fs');
          const path = require('path');
          const configFile = path.join(
            require('os').homedir(),
            '.wfuwp',
            'config.json'
          );
          fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

          console.log(
            chalk.green('✅ Local development configuration reset successfully')
          );
          console.log();
          console.log(chalk.dim('Setup new configuration with:'));
          console.log(chalk.green('  wfuwp local config wizard'));
        } catch (error) {
          console.error(chalk.red(`Error resetting configuration: ${error}`));
          process.exit(1);
        }
      })
  );
