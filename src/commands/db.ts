import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';
import { DatabaseOperations } from '../utils/database';

export const dbCommand = new Command('db')
  .description('Database connection utilities')
  .addCommand(
    new Command('test')
      .description('Test database connection for an environment')
      .argument(
        '<environment>',
        'Environment to test (dev, uat, pprd, prod, local)'
      )
      .action(async (environment: string) => {
        try {
          await testDatabaseConnection(environment);
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
      .description('List all configured database environments')
      .action(() => {
        try {
          listDatabaseEnvironments();
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

async function testDatabaseConnection(environment: string): Promise<void> {
  console.log(chalk.blue.bold(`Testing ${environment} database connection...`));

  // Validate environment
  if (!Config.getValidEnvironments().includes(environment)) {
    throw new Error(
      `Invalid environment '${environment}'. Valid environments: ${Config.getValidEnvironments().join(', ')}`
    );
  }

  // Check if environment is configured
  if (!Config.hasRequiredEnvironmentConfig(environment)) {
    console.log(chalk.red(`✗ Environment '${environment}' is not configured`));

    const config = Config.getEnvironmentConfig(environment);
    console.log(chalk.yellow('Missing configuration:'));
    if (!config.host) console.log(chalk.red('  - host'));
    if (!config.user) console.log(chalk.red('  - user'));
    if (!config.password) console.log(chalk.red('  - password'));
    if (!config.database) console.log(chalk.red('  - database'));

    console.log(chalk.cyan(`\nTo configure: wfuwp config wizard`));
    process.exit(1);
  }

  // Show configuration details
  const config = Config.getEnvironmentConfig(environment);
  console.log(chalk.cyan('\nConnection details:'));
  console.log(chalk.gray(`  Host: ${config.host}`));
  if (config.port) {
    console.log(chalk.gray(`  Port: ${config.port}`));
  }
  console.log(chalk.gray(`  User: ${config.user}`));
  console.log(chalk.gray(`  Database: ${config.database}`));
  console.log(
    chalk.gray(`  Password: ${'*'.repeat(config.password?.length || 0)}`)
  );

  // Test the connection
  console.log(chalk.blue('\nTesting connection...'));

  try {
    const connectionTest = await DatabaseOperations.testConnection(environment);

    if (connectionTest) {
      console.log(chalk.green('✓ Database connection successful!'));

      // Try a simple query to verify database access
      try {
        const tableCount =
          await DatabaseOperations.getEnvironmentTableCount(environment);
        console.log(
          chalk.green(`✓ Database access verified (${tableCount} tables found)`)
        );
      } catch (queryError) {
        console.log(
          chalk.yellow('⚠ Connection established but database query failed')
        );
        console.log(
          chalk.gray(
            `  Query error: ${queryError instanceof Error ? queryError.message : 'Unknown error'}`
          )
        );
      }
    } else {
      console.log(chalk.red('✗ Database connection failed'));

      console.log(chalk.yellow('\nTroubleshooting tips:'));
      console.log(chalk.gray('  1. Verify the host and port are correct'));
      console.log(chalk.gray('  2. Check if the database server is running'));
      console.log(chalk.gray('  3. Verify username and password'));
      console.log(chalk.gray('  4. Ensure the database exists'));
      if (environment === 'local') {
        console.log(
          chalk.gray(
            '  5. For DDEV: Make sure your project is running (ddev start)'
          )
        );
        console.log(
          chalk.gray(
            '  6. For DDEV: Check connection details with "ddev describe"'
          )
        );
      }

      process.exit(1);
    }
  } catch (testError) {
    console.log(chalk.red('✗ Database connection test failed'));
    console.log(
      chalk.red(
        `Error: ${testError instanceof Error ? testError.message : 'Unknown error'}`
      )
    );

    // Show specific error guidance
    const errorMessage = testError instanceof Error ? testError.message : '';
    if (errorMessage.includes('Unknown MySQL server host')) {
      console.log(
        chalk.yellow(
          '\n💡 This usually means the hostname is incorrect or not accessible.'
        )
      );
      if (environment === 'local') {
        console.log(
          chalk.yellow(
            '   For DDEV, the host should be something like "ddev-myproject-db"'
          )
        );
      }
    } else if (
      errorMessage.includes("Can't connect") &&
      errorMessage.includes('socket')
    ) {
      console.log(
        chalk.yellow(
          '\n💡 This usually means the MySQL server is not running or wrong port.'
        )
      );
      if (environment === 'local') {
        console.log(
          chalk.yellow(
            '   For DDEV, make sure your project is started with "ddev start"'
          )
        );
      }
    } else if (errorMessage.includes('Access denied')) {
      console.log(
        chalk.yellow('\n💡 This usually means wrong username or password.')
      );
    }

    process.exit(1);
  }
}

function listDatabaseEnvironments(): void {
  console.log(chalk.blue.bold('Configured Database Environments:'));

  const environments = Config.getValidEnvironments();
  let hasConfigured = false;

  environments.forEach((env) => {
    if (Config.hasRequiredEnvironmentConfig(env)) {
      const config = Config.getEnvironmentConfig(env);
      console.log(chalk.green(`✓ ${env}`));
      console.log(
        chalk.gray(
          `    ${config.host}${config.port ? ':' + config.port : ''} → ${config.database}`
        )
      );
      hasConfigured = true;
    } else {
      console.log(chalk.yellow(`- ${env} (not configured)`));
    }
  });

  if (!hasConfigured) {
    console.log(chalk.red('\nNo database environments are configured.'));
    console.log(
      chalk.cyan('Run "wfuwp config wizard" to set up your environments.')
    );
  }

}
