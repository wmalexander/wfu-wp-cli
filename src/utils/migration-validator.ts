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
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" -e "${privilegeQuery}" 2>/dev/null || echo "GRANT_CHECK_FAILED"`,
        {
          encoding: 'utf8',
          env: {
            ...process.env,
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
      // Test basic operations with a temporary table
      const testTableName = `wp_migration_test_${Date.now()}`;

      // Create table
      execSync(
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "CREATE TABLE ${testTableName} (id INT AUTO_INCREMENT PRIMARY KEY, test_col VARCHAR(255))"`,
        {
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      // Insert data
      execSync(
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "INSERT INTO ${testTableName} (test_col) VALUES ('test')"`,
        {
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      // Update data
      execSync(
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "UPDATE ${testTableName} SET test_col = 'updated' WHERE id = 1"`,
        {
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      // Delete data
      execSync(
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "DELETE FROM ${testTableName} WHERE id = 1"`,
        {
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      // Drop table
      execSync(
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "DROP TABLE ${testTableName}"`,
        {
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      return true;
    } catch (error) {
      return false;
    }
  }

  static async calculateEnvironmentSize(
    environment: string
  ): Promise<EnvironmentValidation['sizeInfo']> {
    const envConfig = Config.getEnvironmentConfig(environment);

    try {
      // Get network table sizes
      const networkTables =
        NetworkTableOperations.getMigrateableNetworkTables();
      let networkTableSize = 0;

      for (const tableName of networkTables) {
        try {
          const sizeQuery = `SELECT ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'size_mb' FROM information_schema.tables WHERE table_schema = '${envConfig.database}' AND table_name = '${tableName}'`;
          const output = execSync(
            `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" -e "${sizeQuery}" -s`,
            {
              encoding: 'utf8',
              env: {
                ...process.env,
                PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
              },
            }
          );

          const sizeMB = parseFloat(output.trim()) || 0;
          networkTableSize += sizeMB;
        } catch (error) {
          // Skip if table doesn't exist or can't get size
        }
      }

      // Get site table sizes
      let totalSiteSize = 0;
      try {
        const siteResult = await SiteEnumerator.enumerateSites(environment, {});

        for (const site of siteResult.sites) {
          const tablePrefix = site.blogId === 1 ? 'wp_' : `wp_${site.blogId}_`;
          const sizeQuery = `SELECT ROUND(SUM((data_length + index_length) / 1024 / 1024), 2) AS 'size_mb' FROM information_schema.tables WHERE table_schema = '${envConfig.database}' AND table_name LIKE '${tablePrefix}%'`;

          try {
            const output = execSync(
              `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" -e "${sizeQuery}" -s`,
              {
                encoding: 'utf8',
                env: {
                  ...process.env,
                  PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
                },
              }
            );

            const sizeMB = parseFloat(output.trim()) || 0;
            totalSiteSize += sizeMB;
          } catch (error) {
            // Skip if can't get site size
          }
        }
      } catch (error) {
        // Skip site size calculation if enumeration fails
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
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" -e "${sizeQuery}" -s`,
        {
          encoding: 'utf8',
          env: {
            ...process.env,
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
        `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "${versionQuery}" -s`,
        {
          encoding: 'utf8',
          env: {
            ...process.env,
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

    // Check Docker availability
    try {
      const { DatabaseOperations } = await import('./database');
      DatabaseOperations.checkDockerAvailability();
    } catch (error) {
      errors.push(
        `Docker is not available: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Check MySQL client availability
    try {
      execSync('mysql --version', { stdio: 'pipe' });
    } catch (error) {
      errors.push('MySQL client is not available in PATH');
      recommendations.push('Install MySQL client or ensure it is in PATH');
    }

    // Check mysqldump availability
    try {
      execSync('mysqldump --version', { stdio: 'pipe' });
    } catch (error) {
      errors.push('mysqldump is not available in PATH');
      recommendations.push('Install mysqldump or ensure it is in PATH');
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
