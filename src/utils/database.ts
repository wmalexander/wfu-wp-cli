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
    verbose = false,
    timeoutMinutes = 15
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
        timeout: timeoutMinutes * 60 * 1000, // Convert minutes to milliseconds
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
    verbose = false,
    timeoutMinutes = 20
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
        timeout: timeoutMinutes * 60 * 1000, // Convert minutes to milliseconds
        env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
      });

      // Count the number of CREATE TABLE statements in the SQL file to get accurate import count
      const fileContent = require('fs').readFileSync(sqlFile, 'utf8');
      const createTableMatches = fileContent.match(/CREATE TABLE/gi);
      const tableCount = createTableMatches ? createTableMatches.length : 0;

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
    // Use direct MySQL query to get table count (much more efficient than WP-CLI)
    try {
      const query = 'SHOW TABLES';
      const output = execSync(`mysql -h "${dbConfig.host}" -u "${dbConfig.user}" -p"${dbConfig.password}" "${dbConfig.database}" -e "${query}" -s`, {
        encoding: 'utf8',
        env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
      });
      
      const tables = output.trim().split('\n').filter(table => table.length > 0);
      return tables.length;
    } catch (error) {
      return 0;
    }
  }

  static async sqlSearchReplace(
    environment: string,
    replacements: Array<{ from: string; to: string }>,
    siteId: string,
    verbose = false
  ): Promise<void> {
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

    // Get all tables for the site
    const tables = this.getSiteTables(siteId, environment);
    
    if (tables.length === 0) {
      throw new Error(`No tables found for site ${siteId} in ${environment} environment`);
    }

    if (verbose) {
      console.log(chalk.gray(`Running SQL search-replace on ${tables.length} tables`));
    }

    // WordPress fields that commonly contain URLs
    const urlFields = [
      'post_content', 'post_excerpt', 'meta_value', 'option_value', 
      'comment_content', 'description', 'guid'
    ];

    for (const replacement of replacements) {
      if (verbose) {
        console.log(chalk.gray(`Replacing "${replacement.from}" → "${replacement.to}"`));
      }

      for (const table of tables) {
        // Get table columns to identify which fields exist
        const columnsQuery = `DESCRIBE ${table}`;
        try {
          const columnsOutput = execSync(`mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "${columnsQuery}" -s`, {
            encoding: 'utf8',
            env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
          });

          const columns = columnsOutput
            .trim()
            .split('\n')
            .map(line => line.split('\t')[0])
            .filter(col => col.length > 0);

          // Update each URL field that exists in this table
          for (const field of urlFields) {
            if (columns.includes(field)) {
              const updateQuery = `UPDATE ${table} SET ${field} = REPLACE(${field}, '${replacement.from}', '${replacement.to}') WHERE ${field} LIKE '%${replacement.from}%'`;
              
              execSync(`mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "${updateQuery}"`, {
                encoding: 'utf8',
                stdio: 'ignore',
                env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
              });

              if (verbose) {
                console.log(chalk.gray(`  Updated ${table}.${field}`));
              }
            }
          }
        } catch (error) {
          // Skip tables that can't be processed
          if (verbose) {
            console.log(chalk.yellow(`  Skipped ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        }
      }
    }
  }

  static async testConnection(environment: string): Promise<boolean> {
    const envConfig = Config.getEnvironmentConfig(environment);

    if (!Config.hasRequiredEnvironmentConfig(environment)) {
      return false;
    }

    // Use direct MySQL connection test (much more efficient than WP-CLI)
    try {
      const mysqlCommand = [
        'mysql',
        '-h', `"${envConfig.host}"`,
        '-u', `"${envConfig.user}"`,
        `-p"${envConfig.password}"`,
        `"${envConfig.database}"`,
        '-e', '"SELECT 1 as connection_test"'
      ].join(' ');

      const result = execSync(mysqlCommand, {
        encoding: 'utf8',
        stdio: 'pipe',
        shell: '/bin/bash',
        timeout: 10000, // 10 seconds
        env: { ...process.env, PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}` }
      });
      
      return result.includes('connection_test') || result.includes('1');
    } catch (error) {
      return false;
    }
  }
}
