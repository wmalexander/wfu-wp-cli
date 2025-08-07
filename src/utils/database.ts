import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import chalk from 'chalk';
import { Config } from './config';

interface ExportResult {
  filePath: string;
  tableCount: number;
  fileSize: number;
}

interface ImportResult {
  success: boolean;
  tableCount: number;
}

export class DatabaseOperations {
  static checkDockerAvailability(): void {
    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        'Docker is not installed or not running. Please install Docker: https://www.docker.com/get-started'
      );
    }
    
    try {
      execSync('docker info', { stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        'Docker is installed but not running. Please start Docker daemon.'
      );
    }
  }

  // Legacy method - now checks Docker instead of WP-CLI
  static checkWpCliAvailability(): void {
    this.checkDockerAvailability();
  }

  static async exportSiteTables(
    siteId: string,
    environment: string,
    outputPath: string,
    verbose = false
  ): Promise<ExportResult> {
    let envConfig;

    if (environment === 'migration') {
      envConfig = Config.getMigrationDbConfig();
      if (!Config.hasRequiredMigrationConfig()) {
        throw new Error(
          'Migration database is not configured. Run "wfuwp config wizard" to set up.'
        );
      }
    } else {
      envConfig = Config.getEnvironmentConfig(environment);
      if (!Config.hasRequiredEnvironmentConfig(environment)) {
        throw new Error(
          `Environment '${environment}' is not configured. Run 'wfuwp config wizard' to set up.`
        );
      }
    }

    const tables = this.getSiteTables(siteId, environment);

    if (tables.length === 0) {
      throw new Error(
        `No tables found for site ${siteId} in ${environment} environment`
      );
    }

    if (verbose) {
      console.log(
        chalk.gray(`Exporting ${tables.length} tables: ${tables.join(', ')}`)
      );
    }

    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Use mysqldump directly (much more efficient than WP-CLI)
    try {
      if (verbose) {
        console.log(chalk.gray('Running mysqldump export...'));
      }
      
      const mysqldumpCommand = [
        'mysqldump',
        '-h', `"${envConfig.host}"`,
        '-u', `"${envConfig.user}"`,
        `-p"${envConfig.password}"`,
        `"${envConfig.database}"`,
        '--skip-lock-tables',
        '--no-tablespaces',
        '--set-gtid-purged=OFF',
        ...tables.map(table => `"${table}"`),
        '>', `"${outputPath}"`
      ].join(' ');

      execSync(mysqldumpCommand, {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
        shell: '/bin/bash',
        timeout: 900000, // 15 minutes
        env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
      });

      if (!existsSync(outputPath)) {
        throw new Error('Export file was not created');
      }

      const stats = require('fs').statSync(outputPath);

      return {
        filePath: outputPath,
        tableCount: tables.length,
        fileSize: stats.size,
      };
    } catch (error) {
      throw new Error(
        `Database export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async importSqlFile(
    sqlFile: string,
    targetConfig: {
      host?: string;
      user?: string;
      password?: string;
      database?: string;
    },
    verbose = false
  ): Promise<ImportResult> {
    if (!existsSync(sqlFile)) {
      throw new Error(`SQL file not found: ${sqlFile}`);
    }

    if (
      !targetConfig.host ||
      !targetConfig.user ||
      !targetConfig.password ||
      !targetConfig.database
    ) {
      throw new Error('Target database configuration is incomplete');
    }

    // Use mysql directly (much more efficient than WP-CLI)
    try {
      if (verbose) {
        console.log(chalk.gray('Running mysql import...'));
      }
      
      const mysqlCommand = [
        'mysql',
        '-h', `"${targetConfig.host}"`,
        '-u', `"${targetConfig.user}"`,
        `-p"${targetConfig.password}"`,
        `"${targetConfig.database}"`,
        '--max_allowed_packet=1G',
        '<', `"${sqlFile}"`
      ].join(' ');

      execSync(mysqlCommand, {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
        shell: '/bin/bash',
        timeout: 600000, // 10 minutes
        env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
      });

      // Get table count to verify import
      const tableCount = this.getTableCount(targetConfig);

      return {
        success: true,
        tableCount,
      };
    } catch (error) {
      throw new Error(
        `Database import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static getSiteTables(siteId: string, environment: string): string[] {
    let envConfig;

    if (environment === 'migration') {
      envConfig = Config.getMigrationDbConfig();
      if (!Config.hasRequiredMigrationConfig()) {
        throw new Error('Migration database is not configured');
      }
    } else {
      envConfig = Config.getEnvironmentConfig(environment);
      if (!Config.hasRequiredEnvironmentConfig(environment)) {
        throw new Error(`Environment '${environment}' is not configured`);
      }
    }

    try {
      const prefix = siteId === '1' ? 'wp_' : `wp_${siteId}_`;
      
      // Use direct MySQL query instead of WP-CLI to avoid memory issues
      const query = `SHOW TABLES LIKE '${prefix}%'`;
      const output = execSync(`mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "${query}" -s`, {
        encoding: 'utf8',
        env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
      });
      
      const tables = output
        .trim()
        .split('\n')
        .filter((table) => table.length > 0);

      if (siteId === '1') {
        // For main site, filter out numbered tables (subsites) and keep only main site tables
        return tables.filter((table) => !table.match(/wp_\d+_/));
      }

      // For subsites, filter to ensure exact site ID match (avoid wp_430_ when looking for wp_43_)
      const exactPrefix = `wp_${siteId}_`;
      return tables.filter((table) => table.startsWith(exactPrefix));
    } catch (error) {
      throw new Error(
        `Failed to get site tables: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async cleanMigrationDatabase(): Promise<void> {
    const migrationConfig = Config.getMigrationDbConfig();

    if (!Config.hasRequiredMigrationConfig()) {
      throw new Error(
        'Migration database is not configured. Run "wfuwp config wizard" to set up.'
      );
    }

    // Use direct MySQL to clean migration database (much more efficient than WP-CLI)
    try {
      // Get all tables in the migration database
      const showTablesQuery = 'SHOW TABLES';
      const tablesOutput = execSync(`mysql -h "${migrationConfig.host}" -u "${migrationConfig.user}" -p"${migrationConfig.password}" "${migrationConfig.database}" -e "${showTablesQuery}" -s`, {
        encoding: 'utf8',
        env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
      });

      const tables = tablesOutput
        .trim()
        .split('\n')
        .filter((table) => table.length > 0);

      if (tables.length > 0) {
        // Drop tables in batches of 10 to avoid command length limits
        const batchSize = 10;
        for (let i = 0; i < tables.length; i += batchSize) {
          const batch = tables.slice(i, i + batchSize);
          const dropTablesQuery = `DROP TABLE IF EXISTS ${batch.map(table => `\`${table}\``).join(', ')}`;
          execSync(`mysql -h "${migrationConfig.host}" -u "${migrationConfig.user}" -p"${migrationConfig.password}" "${migrationConfig.database}" -e "${dropTablesQuery}"`, {
            encoding: 'utf8',
            stdio: 'ignore',
            env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
          });
        }
      }
    } catch (error) {
      // Don't fail the entire migration if cleanup fails - log warning and continue
      console.warn(chalk.yellow(`Warning: Could not clean migration database: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  static async verifyMigrationDatabase(): Promise<boolean> {
    const migrationConfig = Config.getMigrationDbConfig();

    if (!Config.hasRequiredMigrationConfig()) {
      return false;
    }

    try {
      const tableCount = this.getTableCount(migrationConfig);
      return tableCount === 0;
    } catch (error) {
      return false;
    }
  }

  private static getTableCount(dbConfig: {
    host?: string;
    user?: string;
    password?: string;
    database?: string;
  }): number {
    // Use Docker to get table count
    const bashScript = [
      'cd /var/www/html',
      'wp core download',
      'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
      'wp db tables --format=count'
    ].join(' && ');

    try {
      const output = execSync(`docker run --rm \\
        -e WORDPRESS_DB_HOST="${dbConfig.host}" \\
        -e WORDPRESS_DB_USER="${dbConfig.user}" \\
        -e WORDPRESS_DB_PASSWORD="${dbConfig.password}" \\
        -e WORDPRESS_DB_NAME="${dbConfig.database}" \\
        -e WP_CLI_PHP_ARGS="-d memory_limit=512M" \\
        wordpress:cli \\
        bash -c '${bashScript}'`, { 
        encoding: 'utf8',
        shell: '/bin/bash'
      });
      return parseInt(output.trim(), 10) || 0;
    } catch (error) {
      return 0;
    }
  }

  static async testConnection(environment: string): Promise<boolean> {
    const envConfig = Config.getEnvironmentConfig(environment);

    if (!Config.hasRequiredEnvironmentConfig(environment)) {
      return false;
    }

    // Use Docker to run simple connection test
    const bashScript = [
      'cd /var/www/html',
      'wp core download',
      'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
      'wp db query "SELECT 1 as connection_test"'
    ].join(' && ');

    try {
      const result = execSync(`docker run --rm \\
        -e WORDPRESS_DB_HOST="${envConfig.host}" \\
        -e WORDPRESS_DB_USER="${envConfig.user}" \\
        -e WORDPRESS_DB_PASSWORD="${envConfig.password}" \\
        -e WORDPRESS_DB_NAME="${envConfig.database}" \\
        -e WP_CLI_PHP_ARGS="-d memory_limit=512M" \\
        wordpress:cli \\
        bash -c '${bashScript}'`, { 
        encoding: 'utf8',
        stdio: 'pipe',
        shell: '/bin/bash'
      });
      // Check if result contains expected output
      return result.includes('connection_test') || result.includes('1');
    } catch (error) {
      return false;
    }
  }
}
