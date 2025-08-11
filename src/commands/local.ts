import { Command } from 'commander';
import chalk from 'chalk';
import { LocalHostsManager } from '../utils/local-hosts-manager';
import { DDEVManager } from '../utils/ddev-manager';
import { LocalInstaller } from '../utils/local-installer';
import { LocalContentManager } from '../utils/local-content-manager';

export const localCommand = new Command('local')
  .description('Manage local development environment for WFU WordPress sites')
  .addHelpText(
    'after',
    `
${chalk.bold('Examples:')}
  ${chalk.green('sudo wfuwp local domain add 43')}     Add local domain for site 43
  ${chalk.green('wfuwp local domain list')}            List all configured domains
  ${chalk.green('sudo wfuwp local domain remove 43')}  Remove domain for site 43
  ${chalk.green('wfuwp local status')}                 Show development environment status

${chalk.bold('Available Subcommands:')}
  ${chalk.cyan('domain')}         ${chalk.green('✓')} Manage local development domains (/etc/hosts)
  ${chalk.cyan('status')}         ${chalk.green('✓')} Show environment status and health checks
  ${chalk.cyan('install')}        ${chalk.green('✓')} Install and setup development dependencies
  ${chalk.cyan('start')}          ${chalk.green('✓')} Start local development environment
  ${chalk.cyan('stop')}           ${chalk.green('✓')} Stop local development environment
  ${chalk.cyan('restart')}        ${chalk.green('✓')} Restart local development environment
  ${chalk.cyan('refresh')}        ${chalk.green('✓')} Refresh database from production
  ${chalk.cyan('reset')}          ${chalk.green('✓')} Reset entire local environment
  ${chalk.cyan('config')}         ${chalk.yellow('Phase 7')} Configure local development settings

${chalk.dim('Note: Domain management requires sudo privileges to modify /etc/hosts')}
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
              `  ${chalk.green('•')} Site ${chalk.cyan(domain.siteId)}: ${chalk.blue(domain.domain)} (port ${chalk.yellow(domain.port)})`
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
      .description('Add local development domain for a site')
      .argument('<site-id>', 'Numeric site identifier (e.g., 43)')
      .option('-p, --port <port>', 'Port number for local development', '8443')
      .action(async (siteId, options) => {
        try {
          if (!/^\d+$/.test(siteId)) {
            console.error(
              chalk.red('Error: Site ID must be a positive integer')
            );
            process.exit(1);
          }

          const manager = new LocalHostsManager();
          const domain = manager.addDomain(siteId, options.port);

          console.log(
            chalk.green(`Successfully added local development domain:`)
          );
          console.log(`  Site ID: ${chalk.cyan(domain.siteId)}`);
          console.log(`  Domain: ${chalk.blue(domain.domain)}`);
          console.log(`  Port: ${chalk.yellow(domain.port)}`);
          console.log(`  IP: ${chalk.dim(domain.ipAddress)}`);
          console.log();
          console.log(chalk.dim('You can now access your local site at:'));
          console.log(chalk.green(`  https://${domain.domain}:${domain.port}`));
        } catch (error) {
          console.error(chalk.red(`Error: ${error}`));
          if (
            error instanceof Error &&
            error.message.includes('Administrator privileges')
          ) {
            console.error(
              chalk.yellow(
                'Hint: Run with sudo - example: sudo wfuwp local domain add 43'
              )
            );
          }
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove local development domain for a site')
      .argument('<site-id>', 'Numeric site identifier (e.g., 43)')
      .action(async (siteId) => {
        try {
          if (!/^\d+$/.test(siteId)) {
            console.error(
              chalk.red('Error: Site ID must be a positive integer')
            );
            process.exit(1);
          }

          const manager = new LocalHostsManager();
          const domain = manager.getDomain(siteId);

          if (!domain) {
            console.log(
              chalk.yellow(
                `No local development domain found for site ${siteId}`
              )
            );
            return;
          }

          const removed = manager.removeDomain(siteId);

          if (removed) {
            console.log(
              chalk.green(`Successfully removed local development domain:`)
            );
            console.log(`  Site ID: ${chalk.cyan(domain.siteId)}`);
            console.log(`  Domain: ${chalk.blue(domain.domain)}`);
          } else {
            console.log(
              chalk.yellow(
                `No local development domain found for site ${siteId}`
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
                'Hint: Run with sudo - example: sudo wfuwp local domain remove 43'
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
            console.log(chalk.green('  sudo wfuwp local domain add <site-id>'));
            return;
          }

          console.log(chalk.bold('\nLocal Development Domains:'));
          console.log();
          console.log(chalk.dim('Site ID | Domain | Port | Access URL'));
          console.log(chalk.dim('--------|--------|------|----------'));

          for (const domain of domains) {
            const url = `https://${domain.domain}:${domain.port}`;
            console.log(
              `${chalk.cyan(domain.siteId.padEnd(7))} | ${chalk.blue(domain.domain)} | ${chalk.yellow(domain.port.padEnd(4))} | ${chalk.green(url)}`
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
                `  ${chalk.dim('•')} Site ${chalk.cyan(domain.siteId)}: ${chalk.blue(domain.domain)} (port ${chalk.yellow(domain.port)})`
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
  .description('Install and setup local development dependencies')
  .option('--docker', 'Install Docker Desktop', false)
  .option('--ddev', 'Install DDEV', false)
  .option('--mkcert', 'Install mkcert for SSL certificates', false)
  .option('--all', 'Install all dependencies', false)
  .option('-f, --force', 'Force reinstallation of existing dependencies', false)
  .option('--guide', 'Show installation guide', false)
  .option('--setup-workspace [dir]', 'Setup local workspace directory')
  .option('--setup-database <site-id>', 'Download database backup for site')
  .option(
    '--from <env>',
    'Source environment for database (prod, uat, pprd, dev)',
    'prod'
  )
  .action(async (options) => {
    try {
      const installer = new LocalInstaller();

      if (options.guide) {
        installer.showInstallationGuide();
        return;
      }

      const hasInstallOptions =
        options.docker || options.ddev || options.mkcert || options.all;
      const hasSetupOptions =
        options.setupWorkspace !== undefined || options.setupDatabase;

      if (!hasInstallOptions && !hasSetupOptions) {
        console.log(chalk.blue('\n🔧 Local Development Environment Setup\n'));
        console.log('Choose an option:');
        console.log(
          chalk.green('  --all                     ') +
            chalk.dim('Install all dependencies')
        );
        console.log(
          chalk.green('  --guide                   ') +
            chalk.dim('Show installation guide')
        );
        console.log(
          chalk.green('  --setup-workspace         ') +
            chalk.dim('Setup workspace directory')
        );
        console.log(
          chalk.green('  --setup-database <site-id>') +
            chalk.dim('Download database backup')
        );
        console.log();
        console.log(chalk.dim('Use "--help" for detailed options'));
        return;
      }

      if (hasInstallOptions) {
        console.log(
          chalk.blue('\n🚀 Installing Local Development Dependencies\n')
        );

        const result = await installer.installDependencies({
          docker: options.docker,
          ddev: options.ddev,
          mkcert: options.mkcert,
          all: options.all,
          force: options.force,
        });

        console.log(chalk.bold('\n📊 Installation Summary:'));

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
          console.log(chalk.green('🎉 Installation completed successfully!'));
          console.log(chalk.dim('Verify with: wfuwp local status'));
        } else {
          console.log(chalk.red('❌ Installation completed with errors.'));
          console.log(
            chalk.dim('See installation guide: wfuwp local install --guide')
          );
          process.exit(1);
        }
      }

      if (options.setupWorkspace !== undefined) {
        console.log(chalk.blue('\n📁 Setting up workspace...\n'));

        const workspaceResult = await installer.setupWorkspace({
          workspaceDir:
            typeof options.setupWorkspace === 'string'
              ? options.setupWorkspace
              : undefined,
          force: options.force,
        });

        if (workspaceResult.success) {
          console.log(chalk.green('✅ Workspace setup complete'));
        } else {
          console.error(
            chalk.red(`❌ Workspace setup failed: ${workspaceResult.error}`)
          );
          process.exit(1);
        }
      }

      if (options.setupDatabase) {
        if (!/^\d+$/.test(options.setupDatabase)) {
          console.error(chalk.red('Error: Site ID must be a positive integer'));
          process.exit(1);
        }

        console.log(
          chalk.blue(
            `\n🗄️  Setting up database for site ${options.setupDatabase}...\n`
          )
        );

        const dbResult = await installer.setupDatabase({
          siteId: options.setupDatabase,
          environment: options.from,
          force: options.force,
        });

        if (dbResult.success) {
          console.log(chalk.green('✅ Database setup complete'));
          console.log(
            chalk.dim(
              'Import the database using DDEV when your project is ready'
            )
          );
        } else {
          console.error(
            chalk.red(`❌ Database setup failed: ${dbResult.error}`)
          );
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(chalk.red(`Error during installation: ${error}`));
      process.exit(1);
    }
  });

localCommand
  .command('start')
  .description('Start local development environment')
  .option('-s, --site <site-id>', 'Start specific site only')
  .action(async (options) => {
    try {
      console.log(chalk.bold('\n🚀 Starting Local Development Environment\n'));
      const manager = new DDEVManager();
      const result = manager.startProject(options.site);
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        if (!options.site) {
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
  .option('-s, --site <site-id>', 'Stop specific site only')
  .action(async (options) => {
    try {
      console.log(chalk.bold('\n🛑 Stopping Local Development Environment\n'));
      const manager = new DDEVManager();
      const result = manager.stopProject(options.site);
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        if (!options.site) {
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
            console.log(
              chalk.dim(
                '\n💡 Use "wfuwp local stop --site <site-id>" to stop specific sites'
              )
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
  .option('-s, --site <site-id>', 'Restart specific site only')
  .action(async (options) => {
    try {
      console.log(
        chalk.bold('\n🔄 Restarting Local Development Environment\n')
      );
      const manager = new DDEVManager();
      const result = manager.restartProject(options.site);
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
        if (!options.site) {
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
  .command('refresh')
  .description('Refresh database from production S3 bucket')
  .argument('<site-id>', 'Numeric site identifier (e.g., 43)')
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('--no-backup', 'Skip creating backup before refresh', false)
  .option('--from <env>', 'Source environment (prod, uat, pprd, dev)', 'prod')
  .option('--keep-files', 'Keep downloaded database files', false)
  .option('--work-dir <dir>', 'Custom work directory for temporary files')
  .option('--build', 'Run build operations after refresh', false)
  .action(async (siteId, options) => {
    try {
      if (!/^\d+$/.test(siteId)) {
        console.error(chalk.red('Error: Site ID must be a positive integer'));
        process.exit(1);
      }

      if (!['prod', 'uat', 'pprd', 'dev'].includes(options.from)) {
        console.error(
          chalk.red('Error: Invalid environment. Use prod, uat, pprd, or dev')
        );
        process.exit(1);
      }

      if (!options.force) {
        console.log(chalk.yellow(`\n⚠️  Database Refresh Confirmation`));
        console.log(
          `This will replace the local database for site ${chalk.cyan(siteId)} with data from ${chalk.cyan(options.from)}.`
        );
        console.log(
          `Current local data will be ${options.backup ? 'backed up and then ' : ''}${chalk.red('REPLACED')}.`
        );
        console.log();
        console.log(chalk.dim('Use --force to skip this confirmation'));
        console.log(chalk.red('Cancelled - use --force flag to proceed'));
        process.exit(1);
      }

      const contentManager = new LocalContentManager();
      const result = await contentManager.refreshDatabase({
        siteId,
        environment: options.from,
        force: options.force,
        backup: options.backup,
        workDir: options.workDir,
        keepFiles: options.keepFiles,
      });

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
  .description('Reset entire local development environment')
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('--keep-config', 'Keep configuration settings (domains, etc.)', false)
  .option(
    '--deep',
    'Deep reset including DDEV config and workspace directory',
    false
  )
  .action(async (options) => {
    try {
      if (!options.force) {
        console.log(chalk.red(`\n💥 Environment Reset Confirmation`));
        console.log(
          'This will remove temporary files and reset your local development environment.'
        );

        if (options.deep) {
          console.log(chalk.red('⚠️  DEEP RESET will also remove:'));
          console.log('  • DDEV global configuration');
          console.log('  • Local workspace directory (~/wfu-wp-local)');
          console.log('  • All local WordPress projects');
        }

        if (!options.keepConfig) {
          console.log('  • Local development domains (/etc/hosts entries)');
        }

        console.log();
        console.log(chalk.red('⚠️  This action cannot be undone!'));
        console.log();
        console.log(chalk.dim('Use --force to proceed with reset'));
        console.log(chalk.red('Cancelled - use --force flag to proceed'));
        process.exit(1);
      }

      const contentManager = new LocalContentManager();
      const result = await contentManager.resetEnvironment({
        force: options.force,
        keepConfig: options.keepConfig,
        deepReset: options.deep,
      });

      console.log(chalk.bold('\n📊 Reset Summary:'));
      if (result.removedItems.length > 0) {
        console.log(
          chalk.green(`✅ Removed (${result.removedItems.length} items):`)
        );
        for (const item of result.removedItems) {
          console.log(`  ${chalk.green('•')} ${item}`);
        }
      } else {
        console.log(chalk.yellow('⚪ No items needed to be removed'));
      }

      console.log();

      if (result.success) {
        console.log(
          chalk.green('🎉 Environment reset completed successfully!')
        );
        console.log();
        console.log(
          chalk.dim('Your local development environment has been reset.')
        );
        console.log(
          chalk.dim('Use "wfuwp local status" to verify the current state.')
        );
        console.log(
          chalk.dim('Use "wfuwp local install" to set up dependencies again.')
        );
      } else {
        console.log(chalk.red('❌ Environment reset failed.'));
        if (result.error) {
          console.log(chalk.red(`Error: ${result.error}`));
        }
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
      .description('Interactive configuration wizard')
      .action(async () => {
        console.log(
          chalk.yellow('Config wizard will be implemented in Phase 7')
        );
      })
  )
  .addCommand(
    new Command('show')
      .description('Show current configuration')
      .action(async () => {
        console.log(chalk.yellow('Config show will be implemented in Phase 7'));
      })
  );
