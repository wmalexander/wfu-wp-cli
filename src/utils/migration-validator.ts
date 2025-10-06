import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { Config } from './config';
import { SiteEnumerator } from './site-enumerator';
import { NetworkTableOperations } from './network-tables';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

interface EnvironmentValidation {
  environment: string;
  configValid: boolean;
  connectionValid: boolean;
  accessValid: boolean;
  sizeInfo?: {
    networkTableSize: number;
    totalSiteSize: number;
    estimatedMigrationSize: number;
  };
  issues: string[];
  warnings: string[];
}

interface MigrationCompatibilityCheck {
  compatible: boolean;
  sourceInfo: EnvironmentValidation;
  targetInfo: EnvironmentValidation;
  compatibilityIssues: string[];
  warnings: string[];
  recommendations: string[];
}

export class MigrationValidator {
  private static mysqlClientAvailable: boolean | null = null;
  private static hasNativeMysqlClient(): boolean {
    if (this.mysqlClientAvailable !== null) {
      return this.mysqlClientAvailable;
    }
    try {
      execSync('which mysqldump', { stdio: 'ignore' });
      execSync('which mysql', { stdio: 'ignore' });
      this.mysqlClientAvailable = true;
      return true;
    } catch {
      this.mysqlClientAvailable = false;
      return false;
    }
  }
  private static buildMysqlCommand(
    envConfig: any,
    additionalArgs: string[] = []
  ): string {
    if (this.hasNativeMysqlClient()) {
      const portArg = envConfig.port ? `-P ${envConfig.port}` : '';
      const baseArgs = [
        'mysql',
        '-h',
        envConfig.host,
        portArg,
        '-u',
        envConfig.user,
        envConfig.database,
      ].filter((arg) => arg.length > 0);
      return [...baseArgs, ...additionalArgs].join(' ');
    } else {
      const portArg = envConfig.port ? `--port=${envConfig.port}` : '';
      const baseArgs = [
        'docker run --rm',
        '-e',
        `MYSQL_PWD="${envConfig.password}"`,
        'mysql:8.0',
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
  }

  static async validateEnvironmentSetup(
    environment: string
  ): Promise<EnvironmentValidation> {
    const issues: string[] = [];
    const warnings: string[] = [];
    let configValid = false;
    let connectionValid = false;
    let accessValid = false;
    let sizeInfo: EnvironmentValidation['sizeInfo'];

    // Check configuration
    try {
      if (!Config.hasRequiredEnvironmentConfig(environment)) {
        issues.push(`Environment '${environment}' is not properly configured`);
      } else {
        configValid = true;
      }
    } catch (error) {
      issues.push(
        `Configuration check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Test database connection
    if (configValid) {
      try {
        const { DatabaseOperations } = await import('./database');
        connectionValid = await DatabaseOperations.testConnection(environment);
        if (!connectionValid) {
          issues.push(`Cannot connect to ${environment} database`);
        }
      } catch (error) {
        issues.push(
          `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Test database access and permissions
    if (connectionValid) {
      try {
        accessValid = await this.validateDatabaseAccess(environment);
        if (!accessValid) {
          issues.push(`Insufficient database permissions for ${environment}`);
        }
      } catch (error) {
        issues.push(
          `Database access validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Get size information
    if (connectionValid) {
      try {
        sizeInfo = await this.calculateEnvironmentSize(environment);
      } catch (error) {
        warnings.push(
          `Could not calculate environment size: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return {
      environment,
      configValid,
      connectionValid,
      accessValid,
      sizeInfo,
      issues,
      warnings,
    };
  }

  static async validateDatabaseAccess(environment: string): Promise<boolean> {
    const envConfig = Config.getEnvironmentConfig(environment);
    const requiredPrivileges = [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'CREATE',
      'DROP',
      'LOCK TABLES',
    ];

    try {
      // Check if user has required privileges
      const privilegeQuery = `SHOW GRANTS FOR '${envConfig.user}'@'%'`;
      const output = execSync(
        `${this.buildMysqlCommand(envConfig, ['-e', `"${privilegeQuery}"`])} 2>/dev/null || echo "GRANT_CHECK_FAILED"`,
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      if (output.includes('GRANT_CHECK_FAILED')) {
        // Fall back to basic operation test
        return await this.testBasicDatabaseOperations(environment);
      }

      // Check for ALL privileges or specific required privileges
      const hasAllPrivileges =
        output.includes('ALL PRIVILEGES') || output.includes('GRANT ALL');
      if (hasAllPrivileges) {
        return true;
      }

      // Check for specific privileges
      const missingPrivileges = requiredPrivileges.filter(
        (priv) => !output.includes(priv)
      );
      if (missingPrivileges.length > 0) {
        console.log(
          chalk.yellow(
            `  Warning: Missing privileges: ${missingPrivileges.join(', ')}`
          )
        );
        return false;
      }

      return true;
    } catch (error) {
      // Fall back to basic operation test
      return await this.testBasicDatabaseOperations(environment);
    }
  }

  static async testBasicDatabaseOperations(
    environment: string
  ): Promise<boolean> {
    const envConfig = Config.getEnvironmentConfig(environment);

    try {
      // Simple connection and basic access test - much more efficient than full CRUD
      // This single query tests connection, database access, and basic SELECT capability
      const testQuery =
        'SELECT 1 as test_connection, COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = DATABASE() LIMIT 1';

      const output = execSync(
        this.buildMysqlCommand(envConfig, ['-e', `"${testQuery}"`, '-s']),
        {
          encoding: 'utf8',
          timeout: 10000, // 10 second timeout
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      // If we get any output, the connection and basic operations work
      return output.trim().length > 0;
    } catch (error) {
      return false;
    }
  }

  static async calculateEnvironmentSize(
    environment: string
  ): Promise<EnvironmentValidation['sizeInfo']> {
    const envConfig = Config.getEnvironmentConfig(environment);

    try {
      // Get network table sizes in a single query (optimized)
      const networkTables =
        NetworkTableOperations.getMigrateableNetworkTables();
      let networkTableSize = 0;

      if (networkTables.length > 0) {
        try {
          const tableList = networkTables.map((t) => `'${t}'`).join(',');
          const batchSizeQuery = `SELECT SUM(ROUND(((data_length + index_length) / 1024 / 1024), 2)) AS 'total_size_mb' FROM information_schema.tables WHERE table_schema = '${envConfig.database}' AND table_name IN (${tableList})`;

          const output = execSync(
            this.buildMysqlCommand(envConfig, [
              '-e',
              `"${batchSizeQuery}"`,
              '-s',
            ]),
            {
              encoding: 'utf8',
              env: {
                ...process.env,
                MYSQL_PWD: envConfig.password,
                PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
              },
            }
          );

          networkTableSize = parseFloat(output.trim()) || 0;
        } catch (error) {
          // Skip if can't get network table sizes
        }
      }

      // Get site table sizes with optimized batch query
      let totalSiteSize = 0;
      try {
        // Single query to get total size of all site-specific tables
        // This avoids N queries (one per site) and does it all at once
        const siteTablesQuery = `SELECT ROUND(SUM((data_length + index_length) / 1024 / 1024), 2) AS 'total_size_mb' FROM information_schema.tables WHERE table_schema = '${envConfig.database}' AND (table_name LIKE 'wp_%' AND table_name NOT REGEXP '^wp_(blogs|site|sitemeta|blogmeta|users|usermeta|registration_log|signups)$')`;

        const output = execSync(
          this.buildMysqlCommand(envConfig, [
            '-e',
            `"${siteTablesQuery}"`,
            '-s',
          ]),
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              MYSQL_PWD: envConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          }
        );

        totalSiteSize = parseFloat(output.trim()) || 0;
      } catch (error) {
        // Skip site size calculation if query fails
      }

      return {
        networkTableSize: Math.round(networkTableSize * 100) / 100,
        totalSiteSize: Math.round(totalSiteSize * 100) / 100,
        estimatedMigrationSize:
          Math.round((networkTableSize + totalSiteSize) * 100) / 100,
      };
    } catch (error) {
      throw new Error(
        `Size calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async validateMigrationCompatibility(
    sourceEnv: string,
    targetEnv: string
  ): Promise<MigrationCompatibilityCheck> {
    const compatibilityIssues: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Validate both environments
    const sourceInfo = await this.validateEnvironmentSetup(sourceEnv);
    const targetInfo = await this.validateEnvironmentSetup(targetEnv);

    // Check if both environments are valid
    if (sourceInfo.issues.length > 0) {
      compatibilityIssues.push(
        `Source environment issues: ${sourceInfo.issues.join(', ')}`
      );
    }

    if (targetInfo.issues.length > 0) {
      compatibilityIssues.push(
        `Target environment issues: ${targetInfo.issues.join(', ')}`
      );
    }

    // Check size compatibility
    if (sourceInfo.sizeInfo && targetInfo.sizeInfo) {
      const sourceSize = sourceInfo.sizeInfo.estimatedMigrationSize;
      const targetAvailableSpace = await this.estimateAvailableSpace(targetEnv);

      if (
        targetAvailableSpace !== null &&
        sourceSize > targetAvailableSpace * 0.8
      ) {
        warnings.push(
          `Migration size (${sourceSize} MB) may exceed available space in target environment`
        );
        recommendations.push(
          'Consider freeing up space in target environment before migration'
        );
      }

      if (sourceSize > 1000) {
        // 1GB
        warnings.push(
          `Large migration detected (${sourceSize} MB). Consider using --timeout option with higher value`
        );
        recommendations.push('Use --timeout 60 or higher for large databases');
      }
    }

    // Check WordPress versions compatibility (if possible)
    try {
      const sourceVersion = await this.getWordPressVersion(sourceEnv);
      const targetVersion = await this.getWordPressVersion(targetEnv);

      if (sourceVersion && targetVersion) {
        const sourceVersionNum = this.parseVersion(sourceVersion);
        const targetVersionNum = this.parseVersion(targetVersion);

        if (sourceVersionNum > targetVersionNum) {
          warnings.push(
            `Source WordPress version (${sourceVersion}) is newer than target (${targetVersion})`
          );
          recommendations.push(
            'Consider updating target WordPress version before migration'
          );
        }
      }
    } catch (error) {
      // WordPress version check is optional
    }

    // Check for conflicting sites
    try {
      const sourceResult = await SiteEnumerator.enumerateSites(sourceEnv, {});
      const targetResult = await SiteEnumerator.enumerateSites(targetEnv, {});

      const sourceSiteIds = sourceResult.sites.map((site) => site.blogId);
      const targetSiteIds = targetResult.sites.map((site) => site.blogId);
      const conflictingSites = sourceSiteIds.filter((id) =>
        targetSiteIds.includes(id)
      );

      if (conflictingSites.length > 0) {
        warnings.push(
          `Sites exist in both environments and will be overwritten: ${conflictingSites.join(', ')}`
        );
        recommendations.push(
          'Use --skip-backup only if you are certain about overwriting existing sites'
        );
      }
    } catch (error) {
      // Site conflict check is optional
    }

    const compatible = compatibilityIssues.length === 0;

    return {
      compatible,
      sourceInfo,
      targetInfo,
      compatibilityIssues,
      warnings,
      recommendations,
    };
  }

  static async estimateAvailableSpace(
    environment: string
  ): Promise<number | null> {
    try {
      const envConfig = Config.getEnvironmentConfig(environment);

      // Get database size information
      const sizeQuery = `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'database_size_mb' FROM information_schema.tables WHERE table_schema = '${envConfig.database}'`;
      const output = execSync(
        this.buildMysqlCommand(envConfig, ['-e', `"${sizeQuery}"`, '-s']),
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const currentSize = parseFloat(output.trim()) || 0;

      // This is a rough estimate - in practice you'd want to query actual disk space
      // For now, assume we have at least 10GB available for migrations
      return Math.max(10240 - currentSize, 0); // 10GB in MB minus current size
    } catch (error) {
      return null;
    }
  }

  static async getWordPressVersion(
    environment: string
  ): Promise<string | null> {
    try {
      const envConfig = Config.getEnvironmentConfig(environment);

      // Try to get WordPress version from wp_options table
      const versionQuery = `SELECT option_value FROM wp_options WHERE option_name = 'db_version' LIMIT 1`;
      const output = execSync(
        this.buildMysqlCommand(envConfig, ['-e', `"${versionQuery}"`, '-s']),
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const dbVersion = output.trim();
      return dbVersion || null;
    } catch (error) {
      return null;
    }
  }

  static parseVersion(versionString: string): number {
    // Convert version string to comparable number
    const parts = versionString
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
    return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
  }

  static async validateSystemRequirements(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];
    // Check if dependencies are missing and attempt auto-install
    let dockerMissing = false;
    let mysqlClientMissing = false;
    // Check Docker availability
    try {
      const { DatabaseOperations } = await import('./database');
      DatabaseOperations.checkDockerAvailability();
    } catch (error) {
      dockerMissing = true;
      if (
        error instanceof Error &&
        !error.message.includes('Docker is not installed')
      ) {
        // Docker is installed but not running, will be auto-started
        dockerMissing = false;
      }
    }
    // Check MySQL client availability
    try {
      execSync('mysql --version', {
        stdio: 'pipe',
        env: {
          ...process.env,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
      });
    } catch (error) {
      mysqlClientMissing = true;
    }
    // Check mysqldump availability (usually comes with mysql client)
    let mysqldumpMissing = false;
    try {
      execSync('mysqldump --version', {
        stdio: 'pipe',
        env: {
          ...process.env,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
      });
    } catch (error) {
      mysqldumpMissing = true;
    }
    // Auto-install missing dependencies
    if (dockerMissing || mysqlClientMissing || mysqldumpMissing) {
      console.log(chalk.yellow('\n⚠ Missing required dependencies detected'));
      console.log(
        chalk.cyan(
          'Attempting to install missing dependencies automatically...\n'
        )
      );
      try {
        const installCmd = ['npx', 'wfuwp', 'install-deps'];
        if (dockerMissing && !mysqlClientMissing) {
          installCmd.push('--docker-only');
        } else if (!dockerMissing && mysqlClientMissing) {
          installCmd.push('--mysql-only');
        }
        console.log(chalk.gray(`Running: ${installCmd.join(' ')}`));
        execSync(installCmd.join(' '), {
          stdio: 'inherit',
          env: process.env,
        });
        console.log(chalk.green('\n✓ Dependencies installed successfully'));
        console.log(chalk.cyan('Continuing with migration...\n'));
        // Re-check after installation
        dockerMissing = false;
        mysqlClientMissing = false;
        mysqldumpMissing = false;
        // Verify Docker is now available
        try {
          const { DatabaseOperations } = await import('./database');
          DatabaseOperations.checkDockerAvailability();
        } catch (error) {
          dockerMissing = true;
        }
        // Verify MySQL client is now available
        try {
          execSync('mysql --version', {
            stdio: 'pipe',
            env: {
              ...process.env,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          });
        } catch (error) {
          mysqlClientMissing = true;
        }
        // Verify mysqldump is now available
        try {
          execSync('mysqldump --version', {
            stdio: 'pipe',
            env: {
              ...process.env,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          });
        } catch (error) {
          mysqldumpMissing = true;
        }
      } catch (installError) {
        console.log(chalk.red('\n✗ Automatic dependency installation failed'));
        console.log(chalk.yellow('Please run "wfuwp install-deps" manually\n'));
      }
    }
    // Final check - report any remaining issues
    if (dockerMissing) {
      errors.push(
        'Docker is not installed. Run "wfuwp install-deps" to install'
      );
    }
    if (mysqlClientMissing) {
      errors.push('MySQL client is not available in PATH');
      recommendations.push('Run "wfuwp install-deps" to install MySQL client');
    }
    if (mysqldumpMissing) {
      errors.push('mysqldump is not available in PATH');
      recommendations.push('Run "wfuwp install-deps" to install mysqldump');
    }

    // Check available disk space
    try {
      const dfOutput = execSync('df -h .', { encoding: 'utf8' });
      const lines = dfOutput.trim().split('\n');

      if (lines.length >= 2) {
        const usage = lines[1].split(/\s+/)[4];
        const usagePercent = parseInt(usage.replace('%', ''), 10);

        if (usagePercent > 90) {
          errors.push(`Disk space is critically low: ${usage} used`);
        } else if (usagePercent > 80) {
          warnings.push(`Disk space is ${usage} used`);
          recommendations.push(
            'Consider freeing up disk space before migration'
          );
        }
      }
    } catch (error) {
      warnings.push('Could not check disk space availability');
    }

    // Check memory availability
    try {
      const freeOutput = execSync('free -h 2>/dev/null || vm_stat', {
        encoding: 'utf8',
      });
      if (freeOutput.includes('available') || freeOutput.includes('free')) {
        // Basic memory check passed
      }
    } catch (error) {
      warnings.push('Could not check memory availability');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      recommendations,
    };
  }

  static async validateMigrationConfig(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Check migration database configuration
    if (!Config.hasRequiredMigrationConfig()) {
      errors.push('Migration database is not configured');
      recommendations.push(
        'Run "wfuwp config wizard" to configure migration database'
      );
    }

    // Check S3 configuration if needed
    try {
      const s3Bucket = Config.get('s3.bucket');
      if (s3Bucket) {
        // Check AWS CLI availability
        try {
          execSync('aws --version', { stdio: 'pipe' });
        } catch (error) {
          warnings.push('AWS CLI is not available but S3 is configured');
          recommendations.push(
            'Install and configure AWS CLI for S3 operations'
          );
        }
      }
    } catch (error) {
      // S3 config is optional
    }

    // Check backup configuration
    const backupLocalPath = Config.get('backup.localPath');
    if (backupLocalPath) {
      if (!existsSync(backupLocalPath)) {
        warnings.push(
          `Configured backup path does not exist: ${backupLocalPath}`
        );
        recommendations.push('Create backup directory or update configuration');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      recommendations,
    };
  }
}
