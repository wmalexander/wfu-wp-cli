import chalk from 'chalk';
import { Config } from './config';
import { execSync } from 'child_process';

interface FailureDetectorConfig {
  maxConsecutiveFailures: number;
  healthCheckInterval: number;
  connectionTestInterval: number;
  pauseOnFailure: boolean;
}

interface HealthCheckResult {
  healthy: boolean;
  issues: string[];
  warnings: string[];
  responseTime: number;
}

export class SystemicFailureDetector {
  private consecutiveFailures = 0;
  private readonly config: FailureDetectorConfig;
  private sitesProcessed = 0;
  private lastHealthCheck = new Date();
  private lastConnectionTest = new Date();

  constructor(config: Partial<FailureDetectorConfig> = {}) {
    this.config = {
      maxConsecutiveFailures: 5,
      healthCheckInterval: 10, // Check every 10 sites
      connectionTestInterval: 20, // Test connections every 20 sites
      pauseOnFailure: false,
      ...config,
    };
  }

  async checkAndHandle(failed: boolean): Promise<'continue' | 'pause' | 'abort'> {
    this.sitesProcessed++;

    if (failed) {
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        console.error(chalk.red(`\n🚨  SYSTEMIC FAILURE DETECTED`));
        console.error(
          chalk.red(`${this.consecutiveFailures} consecutive sites failed`)
        );

        // Perform immediate health check
        const healthResult = await this.performHealthCheck();

        if (!healthResult.healthy) {
          console.error(chalk.red(`Database health check failed:`));
          healthResult.issues.forEach((issue) => {
            console.error(chalk.red(`  • ${issue}`));
          });

          if (this.config.pauseOnFailure) {
            return 'pause';
          } else {
            return await this.promptForAction();
          }
        }

        // If health check passes but we still have consecutive failures,
        // it might be a temporary issue or configuration problem
        console.warn(
          chalk.yellow(
            `Database appears healthy but ${this.consecutiveFailures} sites failed in a row`
          )
        );
        console.warn(
          chalk.yellow(
            `This may indicate a configuration issue or temporary network problems`
          )
        );

        return await this.promptForAction();
      }
    } else {
      this.consecutiveFailures = 0; // Reset on success
    }

    // Periodic health checks
    if (this.shouldPerformHealthCheck()) {
      const healthResult = await this.performHealthCheck();
      this.lastHealthCheck = new Date();

      if (!healthResult.healthy) {
        console.warn(chalk.yellow(`⚠ Periodic health check found issues:`));
        healthResult.issues.forEach((issue) => {
          console.warn(chalk.yellow(`  • ${issue}`));
        });

        if (healthResult.issues.length > 2) {
          console.warn(
            chalk.yellow(
              `Multiple health issues detected - consider pausing migration`
            )
          );
        }
      }
    }

    // Periodic connection tests
    if (this.shouldPerformConnectionTest()) {
      await this.performConnectionTest();
      this.lastConnectionTest = new Date();
    }

    return 'continue';
  }

  private shouldPerformHealthCheck(): boolean {
    return (
      this.sitesProcessed % this.config.healthCheckInterval === 0 &&
      Date.now() - this.lastHealthCheck.getTime() > 300000 // At least 5 minutes apart
    );
  }

  private shouldPerformConnectionTest(): boolean {
    return (
      this.sitesProcessed % this.config.connectionTestInterval === 0 &&
      Date.now() - this.lastConnectionTest.getTime() > 600000 // At least 10 minutes apart
    );
  }

  private async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const result: HealthCheckResult = {
      healthy: true,
      issues: [],
      warnings: [],
      responseTime: 0,
    };

    try {
      // Test migration database connection
      const migrationConfig = Config.getMigrationDbConfig();
      if (Config.hasRequiredMigrationConfig()) {
        try {
          await this.testDatabaseConnection(migrationConfig, 'migration');
        } catch (error) {
          result.healthy = false;
          result.issues.push(`Migration database connection failed: ${error}`);
        }
      }

      // Test a few environment database connections
      const environments = ['dev', 'uat', 'pprd', 'prod'];
      for (const env of environments) {
        if (Config.hasRequiredEnvironmentConfig(env)) {
          try {
            const envConfig = Config.getEnvironmentConfig(env);
            await this.testDatabaseConnection(envConfig, env);
          } catch (error) {
            result.issues.push(`${env} database connection failed: ${error}`);
            // Only mark as unhealthy if it's a critical environment
            if (env === 'prod' || env === 'pprd') {
              result.healthy = false;
            } else {
              result.warnings.push(
                `Non-critical environment ${env} connection issue`
              );
            }
          }
        }
      }

      // Check system resources
      try {
        const memoryUsage = process.memoryUsage();
        const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;

        if (memoryUsageMB > 512) {
          result.warnings.push(
            `High memory usage: ${memoryUsageMB.toFixed(0)}MB`
          );
        }

        if (memoryUsageMB > 1024) {
          result.issues.push(
            `Very high memory usage: ${memoryUsageMB.toFixed(0)}MB - potential memory leak`
          );
        }
      } catch (error) {
        result.warnings.push(`Could not check memory usage: ${error}`);
      }
    } catch (error) {
      result.healthy = false;
      result.issues.push(`Health check failed: ${error}`);
    }

    result.responseTime = Date.now() - startTime;

    if (result.responseTime > 30000) {
      // 30 seconds
      result.warnings.push(
        `Slow health check response: ${result.responseTime}ms`
      );
    }

    return result;
  }

  private async testDatabaseConnection(
    dbConfig: any,
    environmentName: string
  ): Promise<void> {
    try {
      const query = 'SELECT 1 as test';
      let mysqlCommand: string;

      // Build MySQL command based on available client
      if (this.hasNativeMysqlClient()) {
        const portArg = dbConfig.port ? `-P ${dbConfig.port}` : '';
        mysqlCommand = `mysql -h ${dbConfig.host} ${portArg} -u ${dbConfig.user} ${dbConfig.database} -e "${query}" -s`;
      } else {
        const portArg = dbConfig.port ? `--port=${dbConfig.port}` : '';
        mysqlCommand = `docker run --rm -e MYSQL_PWD="${dbConfig.password}" mysql:8.0 mysql -h "${dbConfig.host}" ${portArg} -u "${dbConfig.user}" "${dbConfig.database}" -e "${query}" -s`;
      }

      const execOptions = this.hasNativeMysqlClient()
        ? {
            encoding: 'utf8' as const,
            timeout: 10000, // 10 second timeout
            env: {
              ...process.env,
              MYSQL_PWD: dbConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          }
        : {
            encoding: 'utf8' as const,
            timeout: 10000, // 10 second timeout
          };

      execSync(mysqlCommand, execOptions);
    } catch (error) {
      throw new Error(
        `Connection test failed for ${environmentName}: ${error}`
      );
    }
  }

  private hasNativeMysqlClient(): boolean {
    try {
      execSync('which mysql', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  private async performConnectionTest(): Promise<void> {
    try {
      // Test basic network connectivity to database hosts
      const environments = ['migration', 'dev', 'uat', 'pprd', 'prod'];

      for (const env of environments) {
        let config;
        if (env === 'migration') {
          if (!Config.hasRequiredMigrationConfig()) continue;
          config = Config.getMigrationDbConfig();
        } else {
          if (!Config.hasRequiredEnvironmentConfig(env)) continue;
          config = Config.getEnvironmentConfig(env);
        }

        // Quick ping test (basic connectivity)
        try {
          const pingCommand = `ping -c 1 -W 5000 ${config.host}`;
          execSync(pingCommand, { stdio: 'ignore', timeout: 6000 });
        } catch (error) {
          console.warn(
            chalk.yellow(
              `⚠ Network connectivity issue to ${env} database host: ${config.host}`
            )
          );
        }
      }
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Connection test failed: ${error}`));
    }
  }

  private async promptForAction(): Promise<'continue' | 'pause' | 'abort'> {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.yellow('\nOptions:'));
    console.log(chalk.white('  c) Continue migration (may continue to fail)'));
    console.log(
      chalk.white('  p) Pause migration (save current state and exit)')
    );
    console.log(chalk.white('  a) Abort migration (stop immediately)'));

    return new Promise((resolve) => {
      readline.question(
        chalk.cyan('\nWhat would you like to do? (c/p/a): '),
        (answer: string) => {
          readline.close();

          const choice = answer.toLowerCase().trim();
          if (choice === 'c' || choice === 'continue') {
            console.log(
              chalk.yellow('Continuing migration despite failures...')
            );
            this.consecutiveFailures = 0; // Reset counter to give it another chance
            resolve('continue');
          } else if (choice === 'p' || choice === 'pause') {
            console.log(
              chalk.blue('Pausing migration - current state will be saved')
            );
            resolve('pause');
          } else {
            console.log(chalk.red('Aborting migration'));
            resolve('abort');
          }
        }
      );
    });
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  getSitesProcessed(): number {
    return this.sitesProcessed;
  }

  reset(): void {
    this.consecutiveFailures = 0;
    this.sitesProcessed = 0;
    this.lastHealthCheck = new Date();
    this.lastConnectionTest = new Date();
  }
}
