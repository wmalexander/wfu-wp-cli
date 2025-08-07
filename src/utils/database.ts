import { execSync } from 'child_process';
import { existsSync } from 'fs';
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
  static checkWpCliAvailability(): void {
    try {
      execSync('wp --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        'WP-CLI is not installed or not in PATH. Please install WP-CLI: https://wp-cli.org/'
      );
    }
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

    const wpCommand = [
      'wp db export',
      outputPath,
      `--tables=${tables.join(',')}`,
      `--dbhost=${envConfig.host}`,
      `--dbuser=${envConfig.user}`,
      `--dbpass=${envConfig.password}`,
      `--dbname=${envConfig.database}`,
      '--skip-plugins',
      '--skip-themes',
      '--skip-packages',
      '--path=/tmp/wp-cli-env',
    ];

    try {
      execSync(wpCommand.join(' '), {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
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

    const wpCommand = [
      'wp db import',
      sqlFile,
      `--dbhost=${targetConfig.host}`,
      `--dbuser=${targetConfig.user}`,
      `--dbpass=${targetConfig.password}`,
      `--dbname=${targetConfig.database}`,
      '--skip-plugins',
      '--skip-themes',
      '--skip-packages',
    ];

    try {
      execSync(wpCommand.join(' '), {
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
      let wpCommand: string;

      if (siteId === '1') {
        // Main site - get tables without prefix numbers
        wpCommand = [
          'wp db tables',
          '--all-tables-with-prefix=wp_',
          `--dbhost=${envConfig.host}`,
          `--dbuser=${envConfig.user}`,
          `--dbpass=${envConfig.password}`,
          `--dbname=${envConfig.database}`,
          '--format=csv',
          '--skip-plugins',
          '--skip-themes',
          '--skip-packages',
        ].join(' ');
      } else {
        // Subsite - get tables with site prefix
        wpCommand = [
          'wp db tables',
          `--all-tables-with-prefix=wp_${siteId}_`,
          `--dbhost=${envConfig.host}`,
          `--dbuser=${envConfig.user}`,
          `--dbpass=${envConfig.password}`,
          `--dbname=${envConfig.database}`,
          '--format=csv',
          '--skip-plugins',
          '--skip-themes',
          '--skip-packages',
        ].join(' ');
      }

      const output = execSync(wpCommand, { encoding: 'utf8' });
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

    const wpCommand = [
      'wp db reset --yes',
      `--dbhost=${migrationConfig.host}`,
      `--dbuser=${migrationConfig.user}`,
      `--dbpass=${migrationConfig.password}`,
      `--dbname=${migrationConfig.database}`,
      '--skip-plugins',
      '--skip-themes',
      '--skip-packages',
    ];

    try {
      execSync(wpCommand.join(' '), { encoding: 'utf8', stdio: 'ignore' });
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
    const wpCommand = [
      'wp db tables',
      `--dbhost=${dbConfig.host}`,
      `--dbuser=${dbConfig.user}`,
      `--dbpass=${dbConfig.password}`,
      `--dbname=${dbConfig.database}`,
      '--format=count',
      '--skip-plugins',
      '--skip-themes',
      '--skip-packages',
    ];

    try {
      const output = execSync(wpCommand.join(' '), { encoding: 'utf8' });
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

    const wpCommand = [
      'wp db check',
      `--dbhost=${envConfig.host}`,
      `--dbuser=${envConfig.user}`,
      `--dbpass=${envConfig.password}`,
      '--skip-plugins',
      '--skip-themes',
      '--skip-packages',
      `--dbname=${envConfig.database}`,
    ];

    try {
      execSync(wpCommand.join(' '), { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }
}
