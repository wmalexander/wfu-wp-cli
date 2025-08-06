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
        'Configuration key (e.g., db.host, db.user, db.password, db.name)'
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
