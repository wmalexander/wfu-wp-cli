import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
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
  // Cache for all tables to avoid repeated SHOW TABLES queries
  private static tableCache: Map<string, string[]> = new Map();
  // Cache for table columns to avoid repeated DESCRIBE queries
  private static columnCache: Map<string, string[]> = new Map();
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
      `-p"${envConfig.password}"`,
      `"${envConfig.database}"`,
    ].filter((arg) => arg.length > 0);

    return [...baseArgs, ...additionalArgs].join(' ');
  }

  // Helper method specifically for migration database commands
  private static buildMigrationMysqlCommand(
    migrationConfig: any,
    additionalArgs: string[] = []
  ): string {
    const portArg = migrationConfig.port ? `-P "${migrationConfig.port}"` : '';
    const baseArgs = [
      'mysql',
      '-h',
      `"${migrationConfig.host}"`,
      portArg,
      '-u',
      `"${migrationConfig.user}"`,
      `-p"${migrationConfig.password}"`,
      `"${migrationConfig.database}"`,
    ].filter((arg) => arg.length > 0);

    return [...baseArgs, ...additionalArgs].join(' ');
  }

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

      const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
      const mysqldumpCommand = [
        'mysqldump',
        '-h',
        `"${envConfig.host}"`,
        portArg,
        '-u',
        `"${envConfig.user}"`,
        `-p"${envConfig.password}"`,
        `"${envConfig.database}"`,
        '--skip-lock-tables',
        '--no-tablespaces',
        '--set-gtid-purged=OFF',
        ...tables.map((table) => `"${table}"`),
        '>',
        `"${outputPath}"`,
      ]
        .filter((arg) => arg.length > 0)
        .join(' ');

      execSync(mysqldumpCommand, {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
        shell: '/bin/bash',
        timeout: timeoutMinutes * 60 * 1000, // Convert minutes to milliseconds
        env: {
          ...process.env,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
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
        '-h',
        `"${targetConfig.host}"`,
        '-u',
        `"${targetConfig.user}"`,
        `-p"${targetConfig.password}"`,
        `"${targetConfig.database}"`,
        '--max_allowed_packet=1G',
        '<',
        `"${sqlFile}"`,
      ].join(' ');

      execSync(mysqlCommand, {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
        shell: '/bin/bash',
        timeout: timeoutMinutes * 60 * 1000, // Convert minutes to milliseconds
        env: {
          ...process.env,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
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

  // Get all tables for an environment (cached)
  static getAllTables(environment: string): string[] {
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

    // Check cache first
    const cacheKey = `${environment}:${envConfig.host}:${envConfig.database}`;
    if (this.tableCache.has(cacheKey)) {
      return this.tableCache.get(cacheKey)!;
    }

    try {
      const query = 'SHOW TABLES';
      const output = execSync(
        this.buildMysqlCommand(envConfig, ['-e', `"${query}"`, '-s']),
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const tables = output
        .trim()
        .split('\n')
        .filter((table) => table.length > 0);

      // Cache the results
      this.tableCache.set(cacheKey, tables);
      return tables;
    } catch (error) {
      throw new Error(
        `Failed to get all tables: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Clear table cache (call when tables might have changed)
  static clearTableCache(): void {
    this.tableCache.clear();
  }

  // Get table columns (cached)
  static getTableColumns(tableName: string, environment: string): string[] {
    let envConfig;
    if (environment === 'migration') {
      envConfig = Config.getMigrationDbConfig();
    } else {
      envConfig = Config.getEnvironmentConfig(environment);
    }

    const cacheKey = `${environment}:${envConfig.host}:${envConfig.database}:${tableName}`;
    if (this.columnCache.has(cacheKey)) {
      return this.columnCache.get(cacheKey)!;
    }

    try {
      const columnsQuery = `DESCRIBE ${tableName}`;
      const columnsOutput = execSync(
        this.buildMysqlCommand(envConfig, ['-e', `"${columnsQuery}"`, '-s']),
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const columns = columnsOutput
        .trim()
        .split('\n')
        .map((line) => line.split('\t')[0])
        .filter((col) => col.length > 0);

      this.columnCache.set(cacheKey, columns);
      return columns;
    } catch (error) {
      // Return empty array if table doesn't exist or can't be described
      return [];
    }
  }

  // Clear column cache
  static clearColumnCache(): void {
    this.columnCache.clear();
  }

  // Clear all caches
  static clearAllCaches(): void {
    this.clearTableCache();
    this.clearColumnCache();
  }

  static getSiteTables(siteId: string, environment: string): string[] {
    try {
      // Get all tables using cached approach (single query instead of per-site)
      const allTables = this.getAllTables(environment);

      // Filter tables for this specific site from the complete list
      const siteTables = allTables.filter((table) => {
        if (siteId === '1') {
          // For main site, include wp_ tables but exclude numbered subsites (wp_43_*)
          return table.startsWith('wp_') && !table.match(/wp_\d+_/);
        } else {
          // For subsites, match exact prefix (avoid wp_430_ when looking for wp_43_)
          const exactPrefix = `wp_${siteId}_`;
          return (
            table.startsWith(exactPrefix) &&
            !table.startsWith(`${exactPrefix}\\d`) && // Avoid longer site IDs
            table.split('_')[1] === siteId
          ); // Ensure exact match
        }
      });

      return siteTables;
    } catch (error) {
      throw new Error(
        `Failed to get site tables: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async cleanMigrationDatabase(siteId?: string): Promise<void> {
    const migrationConfig = Config.getMigrationDbConfig();

    if (!Config.hasRequiredMigrationConfig()) {
      throw new Error(
        'Migration database is not configured. Run "wfuwp config wizard" to set up.'
      );
    }

    // Security validation: only allow drops on wp_migration database
    if (
      !migrationConfig.database ||
      !migrationConfig.database.includes('migration')
    ) {
      throw new Error(
        'Security violation: Table drops are only allowed on wp_migration database for safety.'
      );
    }

    // Use direct MySQL to clean migration database (much more efficient than WP-CLI)
    try {
      // Get all tables in the migration database
      const showTablesQuery = 'SHOW TABLES';
      const tablesOutput = execSync(
        this.buildMigrationMysqlCommand(migrationConfig, [
          '-e',
          `"${showTablesQuery}"`,
          '-s',
        ]),
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const allTables = tablesOutput
        .trim()
        .split('\n')
        .filter((table) => table.length > 0);

      let tablesToDrop = allTables;

      // If siteId is provided, only drop tables for that specific site
      if (siteId) {
        tablesToDrop = allTables.filter((table) => {
          if (siteId === '1') {
            // For main site, include wp_ tables but exclude numbered subsites (wp_43_*)
            return table.startsWith('wp_') && !table.match(/wp_\d+_/);
          } else {
            // For subsites, match exact prefix
            const exactPrefix = `wp_${siteId}_`;
            return (
              table.startsWith(exactPrefix) &&
              !table.startsWith(`${exactPrefix}\\d`) && // Avoid longer site IDs
              table.split('_')[1] === siteId
            ); // Ensure exact match
          }
        });
      }

      if (tablesToDrop.length > 0) {
        // Drop tables in batches of 10 to avoid command length limits
        const batchSize = 10;
        for (let i = 0; i < tablesToDrop.length; i += batchSize) {
          const batch = tablesToDrop.slice(i, i + batchSize);
          const dropTablesQuery = `DROP TABLE IF EXISTS ${batch.map((table) => `\`${table}\``).join(', ')}`;
          execSync(
            this.buildMigrationMysqlCommand(migrationConfig, [
              '-e',
              `"${dropTablesQuery}"`,
            ]),
            {
              encoding: 'utf8',
              stdio: 'ignore',
              env: {
                ...process.env,
                PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
              },
            }
          );
        }
      }
    } catch (error) {
      // Don't fail the entire migration if cleanup fails - log warning and continue
      console.warn(
        chalk.yellow(
          `Warning: Could not clean migration database: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
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
    port?: string;
    user?: string;
    password?: string;
    database?: string;
  }): number {
    // Use direct MySQL query to get table count (much more efficient than WP-CLI)
    try {
      const query = 'SHOW TABLES';
      const portArg = dbConfig.port ? `-P "${dbConfig.port}"` : '';
      const output = execSync(
        `mysql -h "${dbConfig.host}" ${portArg} -u "${dbConfig.user}" -p"${dbConfig.password}" "${dbConfig.database}" -e "${query}" -s`,
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const tables = output
        .trim()
        .split('\n')
        .filter((table) => table.length > 0);
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
      throw new Error(
        `No tables found for site ${siteId} in ${environment} environment`
      );
    }

    if (verbose) {
      console.log(
        chalk.gray(`Running SQL search-replace on ${tables.length} tables`)
      );
    }

    // WordPress fields that commonly contain URLs
    const urlFields = [
      'post_content',
      'post_excerpt',
      'meta_value',
      'option_value',
      'comment_content',
      'description',
      'guid',
    ];

    for (const replacement of replacements) {
      if (verbose) {
        console.log(
          chalk.gray(`Replacing "${replacement.from}" → "${replacement.to}"`)
        );
      }

      for (const table of tables) {
        try {
          // Get table columns using cached approach (avoids repeated DESCRIBE queries)
          const columns = this.getTableColumns(table, environment);

          if (columns.length === 0) {
            if (verbose) {
              console.log(
                chalk.yellow(
                  `  Skipped ${table}: Could not get table structure`
                )
              );
            }
            continue;
          }

          // Update each URL field that exists in this table
          for (const field of urlFields) {
            if (columns.includes(field)) {
              const updateQuery = `UPDATE ${table} SET ${field} = REPLACE(${field}, '${replacement.from}', '${replacement.to}') WHERE ${field} LIKE '%${replacement.from}%'`;

              execSync(
                this.buildMysqlCommand(envConfig, ['-e', `"${updateQuery}"`]),
                {
                  encoding: 'utf8',
                  stdio: 'ignore',
                  env: {
                    ...process.env,
                    PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
                  },
                }
              );

              if (verbose) {
                console.log(chalk.gray(`  Updated ${table}.${field}`));
              }
            }
          }
        } catch (error) {
          // Skip tables that can't be processed
          if (verbose) {
            console.log(
              chalk.yellow(
                `  Skipped ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`
              )
            );
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
      const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
      const mysqlCommand = [
        'mysql',
        '-h',
        `"${envConfig.host}"`,
        portArg,
        '-u',
        `"${envConfig.user}"`,
        `-p"${envConfig.password}"`,
        `"${envConfig.database}"`,
        '-e',
        '"SELECT 1 as connection_test"',
      ]
        .filter((arg) => arg.length > 0)
        .join(' ');

      const result = execSync(mysqlCommand, {
        encoding: 'utf8',
        stdio: 'pipe',
        shell: '/bin/bash',
        timeout: 10000, // 10 seconds
        env: {
          ...process.env,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
      });

      return result.includes('connection_test') || result.includes('1');
    } catch (error) {
      return false;
    }
  }

  static async getEnvironmentTableCount(environment: string): Promise<number> {
    const envConfig = Config.getEnvironmentConfig(environment);

    if (!Config.hasRequiredEnvironmentConfig(environment)) {
      throw new Error(`Environment '${environment}' is not configured`);
    }

    // Use direct MySQL query to get table count
    try {
      const query = 'SHOW TABLES';
      const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
      const output = execSync(
        `mysql -h "${envConfig.host}" ${portArg} -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "${query}" -s`,
        {
          encoding: 'utf8',
          stdio: 'pipe',
          shell: '/bin/bash',
          timeout: 10000, // 10 seconds
          env: {
            ...process.env,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        }
      );

      const tables = output
        .trim()
        .split('\n')
        .filter((line) => line.length > 0);
      return tables.length;
    } catch (error) {
      throw new Error(
        `Failed to get table count: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
