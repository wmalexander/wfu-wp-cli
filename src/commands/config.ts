import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';

export const configCommand = new Command('config')
  .description('Manage configuration settings')
  .addCommand(
    new Command('set')
      .description('Set a configuration value')
      .argument(
        '<key>',
        'Configuration key (e.g., env.prod.host, migration.database, s3.bucket)'
      )
      .argument('<value>', 'Configuration value')
      .action((key: string, value: string) => {
        try {
          Config.set(key, value);
          console.log(chalk.green(`✓ Set ${key} successfully`));
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('<key>', 'Configuration key')
      .action((key: string) => {
        try {
          const value = Config.get(key);
          if (value === undefined) {
            console.log(chalk.yellow(`Configuration key '${key}' not found`));
          } else {
            console.log(value);
          }
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List all configuration values')
      .action(() => {
        try {
          const config = Config.list();
          if (Object.keys(config).length === 0) {
            console.log(chalk.yellow('No configuration found'));
            return;
          }

          console.log(chalk.blue.bold('Configuration:'));
          console.log(JSON.stringify(config, null, 2));
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('wizard')
      .description('Interactive setup wizard for first-time configuration')
      .action(async () => {
        try {
          await runConfigWizard();
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('verify')
      .description('Verify configuration is complete and valid')
      .option('--env <environment>', 'Verify specific environment')
      .action((options: { env?: string }) => {
        try {
          verifyConfiguration(options.env);
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('reset')
      .description('Reset all configuration to defaults')
      .action(() => {
        try {
          Config.reset();
          console.log(chalk.green('✓ Configuration reset successfully'));
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  );

async function runConfigWizard(): Promise<void> {
  console.log(chalk.blue.bold('WFU WordPress Migration Configuration Wizard'));
  console.log(
    chalk.cyan(
      'This wizard will help you set up database connections and S3 settings.\n'
    )
  );

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      readline.question(prompt, (answer: string) => {
        resolve(answer.trim());
      });
    });
  };

  try {
    // Configure environments (standard ones first)
    const standardEnvironments = ['dev', 'uat', 'pprd', 'prod'];

    for (const env of standardEnvironments) {
      console.log(chalk.yellow(`\n--- ${env.toUpperCase()} Environment ---`));

      // Ring bell for environment configuration decision
      process.stdout.write('\x07');
      const configure = await question(`Configure ${env} environment? (y/N): `);
      if (
        configure.toLowerCase() !== 'y' &&
        configure.toLowerCase() !== 'yes'
      ) {
        continue;
      }

      const host = await question(`${env} database host: `);
      const user = await question(`${env} database user: `);
      const password = await question(`${env} database password: `);
      const database = await question(`${env} database name: `);

      if (host) Config.set(`env.${env}.host`, host);
      if (user) Config.set(`env.${env}.user`, user);
      if (password) Config.set(`env.${env}.password`, password);
      if (database) Config.set(`env.${env}.database`, database);

      console.log(chalk.green(`✓ ${env} environment configured`));
    }

    // Configure local environment (special section)
    console.log(chalk.yellow('\n--- LOCAL Environment (Optional) ---'));
    console.log(
      chalk.gray(
        'Local environment is used for prod → local development migrations'
      )
    );
    console.log(
      chalk.gray(
        'This configures your local DDEV WordPress development environment'
      )
    );

    // Ring bell for local environment configuration decision
    process.stdout.write('\x07');
    const configureLocal = await question(
      'Configure local DDEV environment for development? (y/N): '
    );
    if (
      configureLocal.toLowerCase() === 'y' ||
      configureLocal.toLowerCase() === 'yes'
    ) {
      console.log(chalk.cyan('\n💡 DDEV Configuration:'));
      console.log(
        chalk.gray(
          '  Run "ddev describe" in your project to get the exact connection details'
        )
      );
      console.log(
        chalk.gray(
          '  Typical DDEV setup: Host=ddev-<project>-db, Port=3306, User=db, Password=db, Database=db\n'
        )
      );

      const localHost = await question(
        'Local database host (e.g., ddev-myproject-db): '
      );
      const localPort =
        (await question('Local database port (default: 3306): ')) || '3306';
      const localUser =
        (await question('Local database user (default: db): ')) || 'db';
      const localPassword =
        (await question('Local database password (default: db): ')) || 'db';
      const localDatabase =
        (await question('Local database name (default: db): ')) || 'db';

      Config.set('env.local.host', localHost);
      if (localPort) Config.set('env.local.port', localPort);
      Config.set('env.local.user', localUser);
      Config.set('env.local.password', localPassword);
      Config.set('env.local.database', localDatabase);

      console.log(
        chalk.green('✓ Local environment configured for development migrations')
      );
      console.log(
        chalk.cyan('  You can now run: wfuwp env-migrate prod local --dry-run')
      );
    }

    // Configure migration database
    console.log(chalk.yellow('\n--- Migration Database ---'));
    const migrationHost = await question(
      'Migration database host (usually same as one of the environments): '
    );
    const migrationUser = await question('Migration database user: ');
    const migrationPassword = await question('Migration database password: ');
    const migrationDatabase = await question(
      'Migration database name (e.g., wp_migration): '
    );

    if (migrationHost) Config.set('migration.host', migrationHost);
    if (migrationUser) Config.set('migration.user', migrationUser);
    if (migrationPassword) Config.set('migration.password', migrationPassword);
    if (migrationDatabase) Config.set('migration.database', migrationDatabase);

    console.log(chalk.green('✓ Migration database configured'));

    // Configure S3 (optional)
    console.log(chalk.yellow('\n--- S3 Configuration (Optional) ---'));
    console.log(
      chalk.gray('Leave S3 bucket empty to use local backups instead')
    );
    const s3Bucket = await question(
      'S3 bucket for backups (leave empty for local backups): '
    );

    if (s3Bucket) {
      const s3Region =
        (await question('S3 region (default: us-east-1): ')) || 'us-east-1';
      const s3Prefix =
        (await question('S3 prefix (default: migrations): ')) || 'migrations';

      Config.set('s3.bucket', s3Bucket);
      Config.set('s3.region', s3Region);
      Config.set('s3.prefix', s3Prefix);

      console.log(chalk.green('✓ S3 configuration complete'));
    } else {
      // Configure local backup path
      console.log(chalk.yellow('\n--- Local Backup Configuration ---'));
      const defaultPath = Config.getBackupPath();
      const backupPath = await question(
        `Local backup directory (default: ${defaultPath}): `
      );

      if (backupPath && backupPath !== defaultPath) {
        Config.set('backup.localPath', backupPath);
      }

      console.log(
        chalk.green(`✓ Local backups configured: ${Config.getBackupPath()}`)
      );
    }
    console.log(chalk.blue.bold('\n🎉 Configuration wizard complete!'));
    console.log(
      chalk.cyan('Run "wfuwp config verify" to check your configuration.')
    );
  } finally {
    readline.close();
  }
}

function verifyConfiguration(environment?: string): void {
  console.log(chalk.blue.bold('Configuration Verification'));

  let hasErrors = false;

  if (environment) {
    // Verify specific environment
    console.log(chalk.cyan(`\nChecking ${environment} environment...`));
    if (!Config.getValidEnvironments().includes(environment)) {
      console.log(chalk.red(`✗ Invalid environment: ${environment}`));
      hasErrors = true;
    } else if (Config.hasRequiredEnvironmentConfig(environment)) {
      console.log(
        chalk.green(`✓ ${environment} environment configured correctly`)
      );
    } else {
      console.log(
        chalk.red(`✗ ${environment} environment missing required configuration`)
      );
      const config = Config.getEnvironmentConfig(environment);
      if (!config.host) console.log(chalk.yellow('  Missing: host'));
      if (!config.user) console.log(chalk.yellow('  Missing: user'));
      if (!config.password) console.log(chalk.yellow('  Missing: password'));
      if (!config.database) console.log(chalk.yellow('  Missing: database'));
      hasErrors = true;
    }
  } else {
    // Verify all environments
    console.log(chalk.cyan('\nChecking environments...'));
    const standardEnvironments = ['dev', 'uat', 'pprd', 'prod'];
    let configuredEnvs = 0;

    // Check standard environments
    standardEnvironments.forEach((env) => {
      if (Config.hasRequiredEnvironmentConfig(env)) {
        console.log(chalk.green(`✓ ${env}`));
        configuredEnvs++;
      } else {
        console.log(chalk.yellow(`- ${env} (not configured)`));
      }
    });

    // Check local environment (optional)
    console.log(chalk.cyan('\nChecking local environment (optional)...'));
    if (Config.hasRequiredEnvironmentConfig('local')) {
      console.log(
        chalk.green('✓ local (configured for development migrations)')
      );
    } else {
      console.log(chalk.gray('- local (not configured - optional)'));
    }

    if (configuredEnvs === 0) {
      console.log(chalk.red('✗ No environments configured'));
      hasErrors = true;
    }

    // Verify migration database
    console.log(chalk.cyan('\nChecking migration database...'));
    if (Config.hasRequiredMigrationConfig()) {
      console.log(chalk.green('✓ Migration database configured'));
    } else {
      console.log(chalk.red('✗ Migration database not configured'));
      hasErrors = true;
    }

    // Verify S3
    console.log(chalk.cyan('\nChecking S3 configuration...'));
    if (Config.hasRequiredS3Config()) {
      console.log(chalk.green('✓ S3 configuration complete'));
    } else {
      console.log(chalk.red('✗ S3 bucket not configured'));
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.log(
      chalk.red(
        '\n❌ Configuration has errors. Run "wfuwp config wizard" to fix.'
      )
    );
    process.exit(1);
  } else {
    console.log(chalk.green('\n✅ Configuration is valid!'));
  }
}
