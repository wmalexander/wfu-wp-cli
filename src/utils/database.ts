import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';
import { Config } from './config';
import { SqlFileAnalyzer } from './sql-file-analyzer';

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
  // Cache for mysql client availability
  private static mysqlClientAvailable: boolean | null = null;

  // Detect if native mysql client is available
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
  // Helper method to build MySQL command with proper port handling
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

  // Helper method specifically for migration database commands
  private static buildMigrationMysqlCommand(
    migrationConfig: any,
    additionalArgs: string[] = []
  ): string {
    if (this.hasNativeMysqlClient()) {
      const portArg = migrationConfig.port ? `-P ${migrationConfig.port}` : '';
      const baseArgs = [
        'mysql',
        '-h',
        migrationConfig.host,
        portArg,
        '-u',
        migrationConfig.user,
        migrationConfig.database,
      ].filter((arg) => arg.length > 0);
      return [...baseArgs, ...additionalArgs].join(' ');
    } else {
      const portArg = migrationConfig.port
        ? `--port=${migrationConfig.port}`
        : '';
      const baseArgs = [
        'docker run --rm',
        '-e',
        `MYSQL_PWD="${migrationConfig.password}"`,
        'mysql:8.0',
        'mysql',
        '-h',
        `"${migrationConfig.host}"`,
        portArg,
        '-u',
        `"${migrationConfig.user}"`,
        `"${migrationConfig.database}"`,
      ].filter((arg) => arg.length > 0);
      return [...baseArgs, ...additionalArgs].join(' ');
    }
  }

  static checkDockerAvailability(): void {
    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        'Docker is not installed. Please install Docker: https://www.docker.com/get-started'
      );
    }
    try {
      execSync('docker info', { stdio: 'ignore' });
    } catch (error) {
      console.log(
        chalk.yellow(
          'Docker daemon is not running. Attempting to start Docker...'
        )
      );
      try {
        if (process.platform === 'linux') {
          try {
            execSync('sudo systemctl start docker 2>/dev/null', {
              stdio: 'ignore',
            });
            console.log(chalk.green('✓ Started Docker using systemctl'));
          } catch {
            try {
              execSync('sudo service docker start 2>/dev/null', {
                stdio: 'ignore',
              });
              console.log(
                chalk.green('✓ Started Docker using service command')
              );
            } catch {
              throw new Error('Failed to start Docker daemon automatically');
            }
          }
          execSync('sleep 2', { stdio: 'ignore' });
          try {
            execSync('docker info', { stdio: 'ignore' });
            console.log(chalk.green('✓ Docker daemon is now running'));
          } catch {
            throw new Error(
              'Docker started but not yet ready. Please wait a moment and try again.'
            );
          }
        } else if (process.platform === 'darwin') {
          try {
            execSync('open -a Docker', { stdio: 'ignore' });
            console.log(
              chalk.yellow(
                'Starting Docker Desktop... Please wait 10-15 seconds'
              )
            );
            execSync('sleep 10', { stdio: 'ignore' });
            let retries = 0;
            while (retries < 10) {
              try {
                execSync('docker info', { stdio: 'ignore' });
                console.log(chalk.green('✓ Docker Desktop is now running'));
                return;
              } catch {
                retries++;
                execSync('sleep 2', { stdio: 'ignore' });
              }
            }
            throw new Error(
              'Docker Desktop is starting. Please wait and try again in a few seconds.'
            );
          } catch (openError) {
            throw new Error(
              'Could not start Docker Desktop. Please start it manually.'
            );
          }
        } else {
          throw new Error(
            'Docker is installed but not running. Please start Docker daemon manually.'
          );
        }
      } catch (startError) {
        if (
          startError instanceof Error &&
          startError.message.includes('Docker started but not yet ready')
        ) {
          throw startError;
        }
        if (
          startError instanceof Error &&
          startError.message.includes('Docker Desktop is starting')
        ) {
          throw startError;
        }
        throw new Error(
          `Docker is installed but not running. Unable to start automatically: ${
            startError instanceof Error ? startError.message : 'Unknown error'
          }`
        );
      }
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

      let exportCommand: string;

      if (this.hasNativeMysqlClient()) {
        const portArg = envConfig.port ? `-P ${envConfig.port}` : '';

        // Build base command without GTID option first
        const baseCommand = [
          'mysqldump',
          '-h',
          envConfig.host,
          portArg,
          '-u',
          envConfig.user,
          envConfig.database,
          '--skip-lock-tables',
          '--no-tablespaces',
          ...tables,
          '>',
          `"${outputPath}"`,
        ].filter((arg) => arg && arg.length > 0);

        // Check if MySQL version supports GTID options
        let supportsGtid = false;
        try {
          const versionCheck = execSync(
            `mysqldump --help | grep "set-gtid-purged" || echo "no-gtid"`,
            {
              encoding: 'utf8',
              stdio: 'pipe',
              env: {
                ...process.env,
                PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
              },
            }
          );
          supportsGtid =
            versionCheck.includes('set-gtid-purged') &&
            !versionCheck.includes('no-gtid');
          if (verbose) {
            console.log(
              chalk.gray(
                `GTID support check: ${supportsGtid ? 'supported' : 'not supported'}`
              )
            );
          }
        } catch {
          supportsGtid = false;
          if (verbose) {
            console.log(
              chalk.gray('GTID support check: failed, assuming not supported')
            );
          }
        }

        // Add GTID option only if supported
        if (supportsGtid) {
          const insertIndex = baseCommand.indexOf('--no-tablespaces') + 1;
          baseCommand.splice(insertIndex, 0, '--set-gtid-purged=OFF');
        }

        exportCommand = baseCommand.join(' ');

        execSync(exportCommand, {
          encoding: 'utf8' as const,
          stdio: verbose ? 'inherit' : 'ignore',
          shell: '/bin/bash',
          timeout: timeoutMinutes * 60 * 1000,
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        });
      } else {
        const portArg = envConfig.port ? `--port=${envConfig.port}` : '';
        exportCommand =
          [
            'docker run --rm',
            '-v',
            `"${dirname(outputPath)}:${dirname(outputPath)}"`,
            '-e',
            `MYSQL_PWD="${envConfig.password}"`,
            'mysql:8.0',
            'mysqldump',
            '-h',
            `"${envConfig.host}"`,
            portArg,
            '-u',
            `"${envConfig.user}"`,
            `"${envConfig.database}"`,
            '--skip-lock-tables',
            '--no-tablespaces',
            '--set-gtid-purged=OFF',
            ...tables.map((table) => `"${table}"`),
          ]
            .filter((arg) => arg.length > 0)
            .join(' ') + ` > "${outputPath}"`;

        execSync(exportCommand, {
          encoding: 'utf8' as const,
          stdio: verbose ? 'inherit' : 'ignore',
          shell: '/bin/bash',
          timeout: timeoutMinutes * 60 * 1000,
        });
      }

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

      let importCommand: string;

      if (this.hasNativeMysqlClient()) {
        importCommand = [
          'mysql',
          '-h',
          targetConfig.host,
          '-u',
          targetConfig.user,
          targetConfig.database,
          '--max_allowed_packet=1G',
          '<',
          `"${sqlFile}"`,
        ].join(' ');

        execSync(importCommand, {
          encoding: 'utf8' as const,
          stdio: verbose ? 'inherit' : 'ignore',
          shell: '/bin/bash',
          timeout: timeoutMinutes * 60 * 1000,
          env: {
            ...process.env,
            MYSQL_PWD: targetConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        });
      } else {
        importCommand =
          [
            'docker run --rm',
            '-v',
            `"${dirname(sqlFile)}:${dirname(sqlFile)}"`,
            '-e',
            `MYSQL_PWD="${targetConfig.password}"`,
            'mysql:8.0',
            'mysql',
            '-h',
            `"${targetConfig.host}"`,
            '-u',
            `"${targetConfig.user}"`,
            `"${targetConfig.database}"`,
            '--max_allowed_packet=1G',
          ]
            .filter((arg) => arg.length > 0)
            .join(' ') + ` < "${sqlFile}"`;

        execSync(importCommand, {
          encoding: 'utf8' as const,
          stdio: verbose ? 'inherit' : 'ignore',
          shell: '/bin/bash',
          timeout: timeoutMinutes * 60 * 1000,
        });
      }

      // Count the number of CREATE TABLE statements in the SQL file to get accurate import count
      const tableCount = await SqlFileAnalyzer.countTablesInSqlFile(sqlFile);

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
      const mysqlCommand = this.buildMysqlCommand(envConfig, [
        '-e',
        `"${query}"`,
        '-s',
      ]);
      const execOptions = this.hasNativeMysqlClient()
        ? {
            encoding: 'utf8' as const,
            env: {
              ...process.env,
              MYSQL_PWD: envConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          }
        : { encoding: 'utf8' as const };

      const output = execSync(mysqlCommand, execOptions);

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
      const mysqlCommand = this.buildMysqlCommand(envConfig, [
        '-e',
        `"${columnsQuery}"`,
        '-s',
      ]);
      const execOptions = this.hasNativeMysqlClient()
        ? {
            encoding: 'utf8' as const,
            env: {
              ...process.env,
              MYSQL_PWD: envConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          }
        : { encoding: 'utf8' as const };

      const columnsOutput = execSync(mysqlCommand, execOptions);

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
      const mysqlCommand = this.buildMigrationMysqlCommand(migrationConfig, [
        '-e',
        `"${showTablesQuery}"`,
        '-s',
      ]);
      const execOptions = this.hasNativeMysqlClient()
        ? {
            encoding: 'utf8' as const,
            env: {
              ...process.env,
              MYSQL_PWD: migrationConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          }
        : { encoding: 'utf8' as const };

      const tablesOutput = execSync(mysqlCommand, execOptions);

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

          // Drop tables one by one to avoid command length issues and get better error handling
          for (const table of batch) {
            try {
              const dropQuery = `DROP TABLE IF EXISTS ${table}`;
              const mysqlCommand = this.buildMigrationMysqlCommand(
                migrationConfig,
                ['-e', `'${dropQuery}'`]
              );
              const execOptions = this.hasNativeMysqlClient()
                ? {
                    encoding: 'utf8' as const,
                    stdio: 'ignore' as const,
                    env: {
                      ...process.env,
                      MYSQL_PWD: migrationConfig.password,
                      PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
                    },
                  }
                : {
                    encoding: 'utf8' as const,
                    stdio: 'ignore' as const,
                  };

              execSync(mysqlCommand, execOptions);
            } catch (tableError) {
              // If DROP fails, try TRUNCATE as fallback to at least clear the data
              try {
                const truncateQuery = `TRUNCATE TABLE ${table}`;
                execSync(
                  this.buildMigrationMysqlCommand(migrationConfig, [
                    '-e',
                    `'${truncateQuery}'`,
                  ]),
                  {
                    encoding: 'utf8' as const,
                    stdio: 'ignore',
                    env: {
                      ...process.env,
                      MYSQL_PWD: migrationConfig.password,
                      PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
                    },
                  }
                );
                // Only show this message on the first successful truncate to avoid spam
                if (batch.indexOf(table) === 0) {
                  console.warn(
                    chalk.yellow(
                      `Note: DROP permission denied, using TRUNCATE to clear table data instead.`
                    )
                  );
                }
              } catch (truncateError) {
                // If both DROP and TRUNCATE fail, it's likely a more serious permission issue
                if (batch.indexOf(table) === 0) {
                  console.warn(
                    chalk.yellow(
                      `Warning: Insufficient database permissions for cleanup. Migration completed but temporary tables remain in wp_migration database.`
                    )
                  );
                }
              }
            }
          }
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
      let mysqlCommand: string;
      let execOptions: any;

      if (this.hasNativeMysqlClient()) {
        const portArg = dbConfig.port ? `-P ${dbConfig.port}` : '';
        mysqlCommand = `mysql -h ${dbConfig.host} ${portArg} -u ${dbConfig.user} ${dbConfig.database} -e "${query}" -s`;
        execOptions = {
          encoding: 'utf8' as const,
          env: {
            ...process.env,
            MYSQL_PWD: dbConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        };
      } else {
        const portArg = dbConfig.port ? `--port=${dbConfig.port}` : '';
        mysqlCommand = `docker run --rm -e MYSQL_PWD="${dbConfig.password}" mysql:8.0 mysql -h "${dbConfig.host}" ${portArg} -u "${dbConfig.user}" "${dbConfig.database}" -e "${query}" -s`;
        execOptions = { encoding: 'utf8' as const };
      }

      const output = execSync(mysqlCommand, execOptions);

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

              const mysqlCommand = this.buildMysqlCommand(envConfig, [
                '-e',
                `"${updateQuery}"`,
              ]);
              const execOptions = this.hasNativeMysqlClient()
                ? {
                    encoding: 'utf8' as const,
                    stdio: 'ignore' as const,
                    env: {
                      ...process.env,
                      MYSQL_PWD: envConfig.password,
                      PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
                    },
                  }
                : {
                    encoding: 'utf8' as const,
                    stdio: 'ignore' as const,
                  };

              execSync(mysqlCommand, execOptions);

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
      let mysqlCommand: string;
      let execOptions: any;

      if (this.hasNativeMysqlClient()) {
        const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
        mysqlCommand = [
          'mysql',
          '-h',
          `"${envConfig.host}"`,
          portArg,
          '-u',
          `"${envConfig.user}"`,
          `"${envConfig.database}"`,
          '-e',
          '"SELECT 1 as connection_test"',
        ]
          .filter((arg) => arg && arg.length > 0)
          .join(' ');

        execOptions = {
          encoding: 'utf8' as const,
          stdio: 'pipe' as const,
          shell: '/bin/bash',
          timeout: 10000,
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        };
      } else {
        const portArg = envConfig.port ? `--port=${envConfig.port}` : '';
        mysqlCommand = [
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
          '-e',
          '"SELECT 1 as connection_test"',
        ]
          .filter((arg) => arg && arg.length > 0)
          .join(' ');

        execOptions = {
          encoding: 'utf8' as const,
          stdio: 'pipe' as const,
          shell: '/bin/bash',
          timeout: 10000,
        };
      }

      const result = execSync(mysqlCommand, execOptions);

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
      let mysqlCommand: string;
      let execOptions: any;

      if (this.hasNativeMysqlClient()) {
        const portArg = envConfig.port ? `-P ${envConfig.port}` : '';
        mysqlCommand = `mysql -h ${envConfig.host} ${portArg} -u ${envConfig.user} ${envConfig.database} -e "${query}" -s`;
        execOptions = {
          encoding: 'utf8' as const,
          stdio: 'pipe' as const,
          shell: '/bin/bash',
          timeout: 10000,
          env: {
            ...process.env,
            MYSQL_PWD: envConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        };
      } else {
        const portArg = envConfig.port ? `--port=${envConfig.port}` : '';
        mysqlCommand = `docker run --rm -e MYSQL_PWD="${envConfig.password}" mysql:8.0 mysql -h "${envConfig.host}" ${portArg} -u "${envConfig.user}" "${envConfig.database}" -e "${query}" -s`;
        execOptions = {
          encoding: 'utf8' as const,
          stdio: 'pipe' as const,
          shell: '/bin/bash',
          timeout: 10000,
        };
      }

      const output = execSync(mysqlCommand, execOptions);

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

  static async exportCompleteLocalDatabase(
    sourceEnv: string,
    workDir: string,
    verbose = false,
    timeout = 20
  ): Promise<ExportResult> {
    const migrationConfig = Config.getMigrationDbConfig();

    if (!Config.hasRequiredMigrationConfig()) {
      throw new Error('Migration database is not configured');
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);

    const exportPath = require('path').join(
      workDir,
      `complete-local-database-${timestamp}.sql`
    );

    try {
      if (verbose) {
        console.log(
          chalk.gray('Creating complete database dump for local import...')
        );
      }

      let mysqldumpCommand: string;
      let execOptions: any;

      if (this.hasNativeMysqlClient()) {
        const portArg = migrationConfig.port
          ? `-P ${migrationConfig.port}`
          : '';
        mysqldumpCommand = [
          'mysqldump',
          '-h',
          migrationConfig.host,
          portArg,
          '-u',
          migrationConfig.user,
          '--single-transaction',
          '--routines',
          '--triggers',
          '--add-drop-table',
          '--complete-insert',
          '--hex-blob',
          migrationConfig.database,
        ]
          .filter((arg) => arg && arg.length > 0)
          .join(' ');

        execOptions = {
          encoding: 'utf8' as const,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: timeout * 60 * 1000,
          env: {
            ...process.env,
            MYSQL_PWD: migrationConfig.password,
            PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
          },
        };
      } else {
        const portArg = migrationConfig.port
          ? `--port=${migrationConfig.port}`
          : '';
        mysqldumpCommand = [
          'docker run --rm',
          '-e',
          `MYSQL_PWD="${migrationConfig.password}"`,
          'mysql:8.0',
          'mysqldump',
          '-h',
          `"${migrationConfig.host}"`,
          portArg,
          '-u',
          `"${migrationConfig.user}"`,
          '--single-transaction',
          '--routines',
          '--triggers',
          '--add-drop-table',
          '--complete-insert',
          '--hex-blob',
          `"${migrationConfig.database}"`,
        ]
          .filter((arg) => arg && arg.length > 0)
          .join(' ');

        execOptions = {
          encoding: 'utf8' as const,
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: timeout * 60 * 1000,
        };
      }

      const output = execSync(mysqldumpCommand, execOptions);

      require('fs').writeFileSync(exportPath, output);

      const stats = require('fs').statSync(exportPath);
      const tableCount = this.countTablesInDump(output);

      if (verbose) {
        console.log(
          chalk.green(
            `✓ Exported ${tableCount} tables (${(stats.size / 1024 / 1024).toFixed(2)} MB)`
          )
        );
      }

      return {
        filePath: exportPath,
        tableCount,
        fileSize: stats.size,
      };
    } catch (error) {
      throw new Error(
        `Failed to export complete database: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async compressDatabaseExport(
    sqlFilePath: string,
    verbose = false
  ): Promise<string> {
    const gzipPath = `${sqlFilePath}.gz`;

    try {
      if (verbose) {
        console.log(chalk.gray('Compressing database export...'));
      }

      execSync(`gzip -9 "${sqlFilePath}"`, {
        stdio: verbose ? 'inherit' : 'ignore',
      });

      const stats = require('fs').statSync(gzipPath);

      if (verbose) {
        console.log(
          chalk.green(
            `✓ Compressed to ${(stats.size / 1024 / 1024).toFixed(2)} MB`
          )
        );
      }

      return gzipPath;
    } catch (error) {
      throw new Error(
        `Failed to compress database export: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private static countTablesInDump(dumpContent: string): number {
    const tableMatches = dumpContent.match(/CREATE TABLE/gi);
    return tableMatches ? tableMatches.length : 0;
  }

  static async performLocalSearchReplace(
    environment: string,
    verbose = false
  ): Promise<void> {
    const envConfig = Config.getEnvironmentConfig(environment);
    const migrationConfig = Config.getMigrationDbConfig();

    if (!Config.hasRequiredMigrationConfig()) {
      throw new Error('Migration database is not configured');
    }

    if (verbose) {
      console.log(
        chalk.gray('Performing search-replace for local environment...')
      );
    }

    const host = envConfig.host || 'localhost';
    const searchReplaceOperations = [
      {
        from: host.includes('prod') ? 'https://www.wfu.edu' : `https://${host}`,
        to: 'http://localhost:8080',
      },
      {
        from: host.includes('prod') ? 'www.wfu.edu' : host,
        to: 'localhost:8080',
      },
    ];

    try {
      for (const operation of searchReplaceOperations) {
        const wpCliArgs = [
          'search-replace',
          `"${operation.from}"`,
          `"${operation.to}"`,
          '--skip-columns=guid',
          '--dry-run=false',
          '--quiet',
        ];

        if (verbose) {
          console.log(
            chalk.gray(`  Replacing: ${operation.from} → ${operation.to}`)
          );
        }

        const dockerCommand = [
          'docker run --rm',
          `-e WORDPRESS_DB_HOST="${migrationConfig.host}:${migrationConfig.port || 3306}"`,
          `-e WORDPRESS_DB_USER="${migrationConfig.user}"`,
          `-e WORDPRESS_DB_PASSWORD="${migrationConfig.password}"`,
          `-e WORDPRESS_DB_NAME="${migrationConfig.database}"`,
          'wordpress:cli',
          'wp',
          ...wpCliArgs,
        ].join(' ');

        execSync(dockerCommand, {
          stdio: verbose ? 'inherit' : 'ignore',
        });
      }

      if (verbose) {
        console.log(chalk.green('✓ Search-replace operations completed'));
      }
    } catch (error) {
      throw new Error(
        `Search-replace failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async updateNetworkOption(
    environment: string,
    optionKey: string,
    optionValue: string,
    verbose = false
  ): Promise<void> {
    const envConfig = Config.getEnvironmentConfig(environment);

    if (verbose) {
      console.log(chalk.gray(`Updating network option: ${optionKey} = ${optionValue}`));
    }

    const sql = `INSERT INTO wp_sitemeta (site_id, meta_key, meta_value) VALUES (1, '${optionKey}', '${optionValue}') ON DUPLICATE KEY UPDATE meta_value = '${optionValue}'`;

    try {
      if (this.hasNativeMysqlClient()) {
        const command = `MYSQL_PWD="${envConfig.password}" mysql -h ${envConfig.host} ${envConfig.port ? `-P ${envConfig.port}` : ''} -u ${envConfig.user} ${envConfig.database} -e "${sql}"`;
        
        if (verbose) {
          console.log(chalk.gray('  Using native MySQL client'));
        }

        execSync(command, {
          stdio: verbose ? 'inherit' : 'ignore',
        });
      } else {
        const dockerCommand = [
          'docker run --rm',
          `-e MYSQL_PWD="${envConfig.password}"`,
          'mysql:8.0',
          'mysql',
          '-h', `"${envConfig.host}"`,
          envConfig.port ? `--port=${envConfig.port}` : '',
          '-u', `"${envConfig.user}"`,
          `"${envConfig.database}"`,
          '-e', `"${sql}"`
        ].filter(arg => arg.length > 0).join(' ');

        if (verbose) {
          console.log(chalk.gray('  Using Docker MySQL client'));
        }

        execSync(dockerCommand, {
          stdio: verbose ? 'inherit' : 'ignore',
        });
      }

      if (verbose) {
        console.log(chalk.green(`✓ Network option ${optionKey} updated successfully`));
      }
    } catch (error) {
      throw new Error(
        `Failed to update network option: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
