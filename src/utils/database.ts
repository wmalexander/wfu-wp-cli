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

    // Use Docker to run WP-CLI export
    const containerPath = '/workspace/' + outputPath.split('/').pop();
    const bashScript = [
      'export WP_CLI_PHP_ARGS="-d memory_limit=1024M"',
      'cd /var/www/html',
      'wp core download',
      'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
      `wp db export ${containerPath} --tables=${tables.join(',')}`
    ].join(' && ');

    try {
      if (verbose) {
        console.log(chalk.gray('Running Docker WP-CLI export...'));
      }
      
      execSync(`docker run --rm \\
        --memory=2g \\
        -v "${process.cwd()}:/workspace" \\
        -e WORDPRESS_DB_HOST="${envConfig.host}" \\
        -e WORDPRESS_DB_USER="${envConfig.user}" \\
        -e WORDPRESS_DB_PASSWORD="${envConfig.password}" \\
        -e WORDPRESS_DB_NAME="${envConfig.database}" \\
        wordpress:cli \\
        bash -c '${bashScript}'`, {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
        shell: '/bin/bash'
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

    // Use Docker to run WP-CLI import
    const containerPath = '/workspace/' + sqlFile.split('/').pop();
    const dockerCommand = [
      'docker', 'run', '--rm',
      '-v', `${process.cwd()}:/workspace`,
      '-e', `WORDPRESS_DB_HOST=${targetConfig.host}`,
      '-e', `WORDPRESS_DB_USER=${targetConfig.user}`,
      '-e', `WORDPRESS_DB_PASSWORD=${targetConfig.password}`,
      '-e', `WORDPRESS_DB_NAME=${targetConfig.database}`,
      '-e', 'WP_CLI_PHP_ARGS=-d memory_limit=512M',
      'wordpress:cli',
      'bash', '-c', [
        'cd /var/www/html',
        'wp core download',
        'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
        `wp db import ${containerPath}`
      ].join(' && ')
    ];

    try {
      if (verbose) {
        console.log(chalk.gray('Running Docker WP-CLI import...'));
      }
      
      execSync(dockerCommand.join(' '), {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
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

      return tables;
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

    // Use Docker to clean migration database
    const dockerCommand = [
      'docker', 'run', '--rm',
      '-e', `WORDPRESS_DB_HOST=${migrationConfig.host}`,
      '-e', `WORDPRESS_DB_USER=${migrationConfig.user}`,
      '-e', `WORDPRESS_DB_PASSWORD=${migrationConfig.password}`,
      '-e', `WORDPRESS_DB_NAME=${migrationConfig.database}`,
      '-e', 'WP_CLI_PHP_ARGS=-d memory_limit=512M',
      'wordpress:cli',
      'bash', '-c', [
        'cd /var/www/html',
        'wp core download',
        'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
        'wp db reset --yes'
      ].join(' && ')
    ];

    try {
      execSync(dockerCommand.join(' '), { encoding: 'utf8', stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        `Failed to clean migration database: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
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
    const dockerCommand = [
      'docker', 'run', '--rm',
      '-e', `WORDPRESS_DB_HOST=${dbConfig.host}`,
      '-e', `WORDPRESS_DB_USER=${dbConfig.user}`,
      '-e', `WORDPRESS_DB_PASSWORD=${dbConfig.password}`,
      '-e', `WORDPRESS_DB_NAME=${dbConfig.database}`,
      '-e', 'WP_CLI_PHP_ARGS=-d memory_limit=512M',
      'wordpress:cli',
      'bash', '-c', [
        'cd /var/www/html',
        'wp core download',
        'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
        'wp db tables --format=count'
      ].join(' && ')
    ];

    try {
      const output = execSync(dockerCommand.join(' '), { encoding: 'utf8' });
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
    const dockerCommand = [
      'docker', 'run', '--rm',
      '-e', `WORDPRESS_DB_HOST=${envConfig.host}`,
      '-e', `WORDPRESS_DB_USER=${envConfig.user}`,
      '-e', `WORDPRESS_DB_PASSWORD=${envConfig.password}`,
      '-e', `WORDPRESS_DB_NAME=${envConfig.database}`,
      '-e', 'WP_CLI_PHP_ARGS=-d memory_limit=512M',
      'wordpress:cli',
      'bash', '-c', [
        'cd /var/www/html',
        'wp core download',
        'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
        'wp db query "SELECT 1 as connection_test"'
      ].join(' && ')
    ];

    try {
      const result = execSync(dockerCommand.join(' '), { 
        encoding: 'utf8',
        stdio: 'pipe'
      });
      // Check if result contains expected output
      return result.includes('connection_test') || result.includes('1');
    } catch (error) {
      return false;
    }
  }
}
