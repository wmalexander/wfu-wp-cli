import chalk from 'chalk';
import { BackupRecovery, BackupMetadata } from './backup-recovery';

interface MigrationContext {
  sourceEnv: string;
  targetEnv: string;
  backupId?: string;
  sitesInProgress: number[];
  completedSites: number[];
  failedSites: Array<{ siteId: number; error: string; step: string }>;
  networkTablesProcessed: boolean;
  startTime: Date;
  currentStep: string;
  options: any;
}

interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

interface RecoveryResult {
  success: boolean;
  action: 'rollback' | 'retry' | 'skip' | 'abort';
  message: string;
  restoredSites?: number[];
  restoredNetworkTables?: boolean;
}

interface HealthCheckResult {
  healthy: boolean;
  issues: string[];
  warnings: string[];
  recommendations: string[];
}

export class ErrorRecovery {
  // Helper method to build MySQL command with proper port handling
  private static buildMysqlCommand(
    envConfig: any,
    additionalArgs: string[] = []
  ): string {
    const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
    const baseArgs = [
      'mysql',
      '-h',
      `"${envConfig.host}"`,
      portArg,
      '-u',
      `"${envConfig.user}"`,
      `"${envConfig.database}"`,
    ].filter((arg) => arg.length > 0);

    return [...baseArgs, ...additionalArgs].join(' ');
  }
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    retryDelay: 5000, // 5 seconds
    backoffMultiplier: 2,
    retryableErrors: [
      'connection timeout',
      'temporary failure',
      'lock wait timeout',
      'deadlock',
      'connection refused',
      'network error',
      'too many connections',
    ],
  };

  static isRetryableError(error: string): boolean {
    const lowerError = error.toLowerCase();
    return this.DEFAULT_RETRY_CONFIG.retryableErrors.some((retryableError) =>
      lowerError.includes(retryableError)
    );
  }

  static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const retryConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error;

    for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(
            chalk.yellow(
              `  Retry ${attempt}/${retryConfig.maxRetries} for ${context}...`
            )
          );
        }

        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (
          attempt === retryConfig.maxRetries ||
          !this.isRetryableError(lastError.message)
        ) {
          break;
        }

        const delay =
          retryConfig.retryDelay *
          Math.pow(retryConfig.backoffMultiplier, attempt - 1);
        console.log(
          chalk.yellow(
            `  ${context} failed (attempt ${attempt}): ${lastError.message}`
          )
        );
        console.log(chalk.gray(`  Waiting ${delay / 1000}s before retry...`));

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  static async handleMigrationFailure(
    context: MigrationContext,
    error: Error,
    options: {
      autoRollback?: boolean;
      interactive?: boolean;
      skipConfirmation?: boolean;
    } = {}
  ): Promise<RecoveryResult> {
    console.log(
      chalk.red(`\n❌ Migration failure in step: ${context.currentStep}`)
    );
    console.log(chalk.red(`   Error: ${error.message}`));

    // Perform health check first
    const healthCheck = await this.performHealthCheck(
      context.targetEnv,
      context.sitesInProgress
    );
    if (!healthCheck.healthy) {
      console.log(chalk.yellow('\n⚠ Health check detected issues:'));
      healthCheck.issues.forEach((issue) => {
        console.log(chalk.red(`  • ${issue}`));
      });
    }

    // Check if we have a backup to rollback to
    if (!context.backupId) {
      console.log(
        chalk.yellow(
          '⚠ No backup available for rollback. Manual recovery may be required.'
        )
      );
      return {
        success: false,
        action: 'abort',
        message: 'No backup available for automatic recovery',
      };
    }

    // Auto-rollback if configured
    if (options.autoRollback && !options.interactive) {
      console.log(chalk.blue('🔄 Initiating automatic rollback...'));
      return await this.performRollback(context, { skipConfirmation: true });
    }

    // Interactive recovery options
    if (options.interactive && !options.skipConfirmation) {
      return await this.promptRecoveryAction(context, error);
    }

    // Default action: rollback
    console.log(chalk.blue('🔄 Initiating rollback...'));
    return await this.performRollback(context, options);
  }

  static async performRollback(
    context: MigrationContext,
    options: { skipConfirmation?: boolean } = {}
  ): Promise<RecoveryResult> {
    if (!context.backupId) {
      return {
        success: false,
        action: 'rollback',
        message: 'No backup ID available for rollback',
      };
    }

    console.log(
      chalk.blue(`Performing rollback using backup: ${context.backupId}`)
    );

    try {
      // Determine what needs to be restored
      const restoreOptions = {
        networkTables: context.networkTablesProcessed,
        sites: [...context.completedSites, ...context.sitesInProgress],
        skipConfirmation: options.skipConfirmation || false,
        timeout: 30, // Longer timeout for recovery operations
      };

      console.log(chalk.gray('  Determining restoration scope...'));
      if (restoreOptions.networkTables) {
        console.log(chalk.gray('    • Network tables will be restored'));
      }
      if (restoreOptions.sites.length > 0) {
        console.log(
          chalk.gray(
            `    • ${restoreOptions.sites.length} sites will be restored: ${restoreOptions.sites.join(', ')}`
          )
        );
      }

      // Perform the restoration
      const restoreResult = await BackupRecovery.restoreFromBackup(
        context.backupId,
        context.targetEnv,
        restoreOptions
      );

      if (restoreResult.success) {
        console.log(chalk.green('✅ Rollback completed successfully'));
        console.log(
          chalk.cyan(
            `   Restored network tables: ${restoreResult.restoredNetworkTables ? 'Yes' : 'No'}`
          )
        );
        console.log(
          chalk.cyan(`   Restored sites: ${restoreResult.restoredSites.length}`)
        );

        if (restoreResult.failedSites.length > 0) {
          console.log(
            chalk.yellow(
              `   Failed to restore sites: ${restoreResult.failedSites.join(', ')}`
            )
          );
        }
      } else {
        console.log(chalk.red('❌ Rollback failed'));
        restoreResult.errors.forEach((error) => {
          console.log(chalk.red(`   • ${error}`));
        });
      }

      return {
        success: restoreResult.success,
        action: 'rollback',
        message: restoreResult.success
          ? 'Rollback completed successfully'
          : `Rollback failed: ${restoreResult.errors.join(', ')}`,
        restoredSites: restoreResult.restoredSites,
        restoredNetworkTables: restoreResult.restoredNetworkTables,
      };
    } catch (error) {
      const errorMessage = `Rollback operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.log(chalk.red(`❌ ${errorMessage}`));

      return {
        success: false,
        action: 'rollback',
        message: errorMessage,
      };
    }
  }

  static async promptRecoveryAction(
    context: MigrationContext,
    error: Error
  ): Promise<RecoveryResult> {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(chalk.yellow('\n🤔 Recovery Options:'));
    console.log(chalk.white('  1. Rollback to backup (recommended)'));
    console.log(chalk.white('  2. Retry current operation'));
    console.log(chalk.white('  3. Skip current operation and continue'));
    console.log(chalk.white('  4. Abort migration'));

    return new Promise((resolve) => {
      // Ring bell to draw attention to the recovery prompt
      process.stdout.write('\x07');
      readline.question(
        chalk.yellow('Select recovery action (1-4): '),
        async (answer: string) => {
          readline.close();

          switch (answer.trim()) {
            case '1':
              resolve(await this.performRollback(context));
              break;
            case '2':
              resolve({
                success: true,
                action: 'retry',
                message: 'User selected retry operation',
              });
              break;
            case '3':
              resolve({
                success: true,
                action: 'skip',
                message: 'User selected skip current operation',
              });
              break;
            case '4':
            default:
              resolve({
                success: false,
                action: 'abort',
                message: 'User selected abort migration',
              });
              break;
          }
        }
      );
    });
  }

  static async performHealthCheck(
    environment: string,
    sitesInProgress: number[] = []
  ): Promise<HealthCheckResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Import utilities
      const { DatabaseOperations } = await import('./database');
      const { Config } = await import('./config');

      // Check database connection
      try {
        const connectionTest =
          await DatabaseOperations.testConnection(environment);
        if (!connectionTest) {
          issues.push(`Database connection to ${environment} is not working`);
        }
      } catch (error) {
        issues.push(
          `Failed to test database connection: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      // Check for partially migrated sites
      if (sitesInProgress.length > 0) {
        warnings.push(
          `${sitesInProgress.length} sites may be in partially migrated state: ${sitesInProgress.join(', ')}`
        );
        recommendations.push(
          'Consider rolling back these sites to a consistent state'
        );
      }

      // Check database integrity
      try {
        await this.checkDatabaseIntegrity(environment);
      } catch (error) {
        issues.push(
          `Database integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      // Check for orphaned tables
      try {
        const orphanedTables = await this.findOrphanedTables(environment);
        if (orphanedTables.length > 0) {
          warnings.push(
            `Found ${orphanedTables.length} potentially orphaned tables`
          );
          recommendations.push('Review and cleanup orphaned tables if needed');
        }
      } catch (error) {
        warnings.push(
          `Could not check for orphaned tables: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      // Check disk space (if applicable)
      try {
        await this.checkDiskSpace();
      } catch (error) {
        warnings.push(
          `Could not check disk space: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } catch (error) {
      issues.push(
        `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return {
      healthy: issues.length === 0,
      issues,
      warnings,
      recommendations,
    };
  }

  static async checkDatabaseIntegrity(environment: string): Promise<void> {
    const { Config } = await import('./config');
    const envConfig = Config.getEnvironmentConfig(environment);

    if (!Config.hasRequiredEnvironmentConfig(environment)) {
      throw new Error(`Environment '${environment}' is not configured`);
    }

    const { execSync } = require('child_process');

    try {
      // Basic connection test with a simple query
      execSync(
        `${this.buildMysqlCommand(envConfig, ['-e', '"SELECT 1"'])} > /dev/null`,
        {
          timeout: 30000,
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );
    } catch (error) {
      throw new Error(
        `Database integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async findOrphanedTables(environment: string): Promise<string[]> {
    const { Config } = await import('./config');
    const { SiteEnumerator } = await import('./site-enumerator');
    const { NetworkTableOperations } = await import('./network-tables');

    const envConfig = Config.getEnvironmentConfig(environment);
    if (!Config.hasRequiredEnvironmentConfig(environment)) {
      throw new Error(`Environment '${environment}' is not configured`);
    }

    const { execSync } = require('child_process');

    try {
      // Get all tables in database
      const allTablesOutput = execSync(
        this.buildMysqlCommand(envConfig, ['-e', '"SHOW TABLES"', '-s']),
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const allTables = allTablesOutput
        .trim()
        .split('\n')
        .filter((line: string) => line.trim().length > 0);

      // Get known network tables
      const networkTables = NetworkTableOperations.getNetworkTables().map(
        (table) => table.name
      );

      // Get active sites
      const siteResult = await SiteEnumerator.enumerateSites(environment, {});
      const activeSiteIds = siteResult.sites.map((site) => site.blogId);

      // Find orphaned tables
      const orphanedTables: string[] = [];

      for (const tableName of allTables) {
        // Skip network tables
        if (networkTables.includes(tableName)) {
          continue;
        }

        // Check if it's a site-specific table
        const siteTableMatch = tableName.match(/^wp_(\d+)_/);
        if (siteTableMatch) {
          const siteId = parseInt(siteTableMatch[1], 10);
          if (!activeSiteIds.includes(siteId)) {
            orphanedTables.push(tableName);
          }
        } else if (
          tableName.startsWith('wp_') &&
          !tableName.match(/^wp_\d+_/)
        ) {
          // Main site table - check if site 1 exists
          if (!activeSiteIds.includes(1)) {
            orphanedTables.push(tableName);
          }
        }
      }

      return orphanedTables;
    } catch (error) {
      throw new Error(
        `Failed to find orphaned tables: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async checkDiskSpace(): Promise<void> {
    const { execSync } = require('child_process');

    try {
      const dfOutput = execSync('df -h .', { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');

      if (lines.length >= 2) {
        const usage = lines[1].split(/\s+/)[4]; // Usage percentage
        const usagePercent = parseInt(usage.replace('%', ''), 10);

        if (usagePercent > 90) {
          throw new Error(`Disk space is critically low: ${usage} used`);
        } else if (usagePercent > 80) {
          console.log(chalk.yellow(`  Warning: Disk space is ${usage} used`));
        }
      }
    } catch (error) {
      // Not critical if disk space check fails
      if (error instanceof Error && error.message.includes('critically low')) {
        throw error;
      }
    }
  }

  static createMigrationContext(
    sourceEnv: string,
    targetEnv: string,
    options: any
  ): MigrationContext {
    return {
      sourceEnv,
      targetEnv,
      sitesInProgress: [],
      completedSites: [],
      failedSites: [],
      networkTablesProcessed: false,
      startTime: new Date(),
      currentStep: 'initialization',
      options,
    };
  }

  static updateMigrationContext(
    context: MigrationContext,
    updates: Partial<MigrationContext>
  ): MigrationContext {
    return { ...context, ...updates };
  }

  static async cleanupAfterFailure(
    context: MigrationContext,
    options: {
      cleanupTempFiles?: boolean;
      cleanupBackups?: boolean;
      workDir?: string;
    } = {}
  ): Promise<void> {
    console.log(chalk.blue('🧹 Performing cleanup after failure...'));

    try {
      // Cleanup temporary files
      if (options.cleanupTempFiles && options.workDir) {
        const { existsSync, rmSync } = require('fs');

        if (existsSync(options.workDir)) {
          console.log(
            chalk.gray(`  Removing temporary directory: ${options.workDir}`)
          );
          rmSync(options.workDir, { recursive: true, force: true });
        }
      }

      // Cleanup backups if requested (and not the main recovery backup)
      if (options.cleanupBackups && context.backupId) {
        console.log(
          chalk.gray(`  Keeping backup ${context.backupId} for manual recovery`)
        );
      }

      console.log(chalk.green('✓ Cleanup completed'));
    } catch (error) {
      console.log(
        chalk.yellow(
          `⚠ Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
    }
  }
}
