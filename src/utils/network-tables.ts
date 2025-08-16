import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';
import { Config } from './config';

interface NetworkExportResult {
  filePath: string;
  tableCount: number;
  fileSize: number;
}

interface NetworkImportResult {
  success: boolean;
  tableCount: number;
}

interface NetworkBackupResult {
  filePath: string;
  tableCount: number;
  fileSize: number;
}

interface NetworkTableInfo {
  name: string;
  type: 'core' | 'meta' | 'user' | 'registration';
  description: string;
  migrateable: boolean;
}

export class NetworkTableOperations {
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

  // Get table columns (cached) to avoid repeated DESCRIBE queries
  private static getTableColumns(tableName: string, envConfig: any): string[] {
    const cacheKey = `${envConfig.host}:${envConfig.database}:${tableName}`;
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
            encoding: 'utf8',
            env: {
              ...process.env,
              MYSQL_PWD: envConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          }
        : { encoding: 'utf8' };

      const columnsOutput = execSync(mysqlCommand, execOptions);

      const columns = columnsOutput
        .trim()
        .split('\n')
        .map((line) => line.split('\t')[0])
        .filter((col) => col.length > 0);

      this.columnCache.set(cacheKey, columns);
      return columns;
    } catch (error) {
      return [];
    }
  }
  static getNetworkTables(): NetworkTableInfo[] {
    return [
      {
        name: 'wp_blogs',
        type: 'core',
        description: 'Multisite blogs/sites registry',
        migrateable: true,
      },
      {
        name: 'wp_site',
        type: 'core',
        description: 'Network configuration',
        migrateable: true,
      },
      {
        name: 'wp_sitemeta',
        type: 'meta',
        description: 'Network metadata',
        migrateable: true,
      },
      {
        name: 'wp_blogmeta',
        type: 'meta',
        description: 'Blog metadata',
        migrateable: true,
      },
      {
        name: 'wp_users',
        type: 'user',
        description: 'User accounts',
        migrateable: false,
      },
      {
        name: 'wp_usermeta',
        type: 'user',
        description: 'User metadata',
        migrateable: false,
      },
      {
        name: 'wp_registration_log',
        type: 'registration',
        description: 'Registration log',
        migrateable: false,
      },
      {
        name: 'wp_signups',
        type: 'registration',
        description: 'User signups',
        migrateable: false,
      },
    ];
  }

  static getMigrateableNetworkTables(): string[] {
    return this.getNetworkTables()
      .filter((table) => table.migrateable)
      .map((table) => table.name);
  }

  static getExistingNetworkTables(environment: string): string[] {
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
      const networkTableNames = this.getNetworkTables().map(
        (table) => table.name
      );

      // Single query to get all tables, then filter for network tables
      const query = 'SHOW TABLES';
      const mysqlCommand = this.buildMysqlCommand(envConfig, [
        '-e',
        `"${query}"`,
        '-s',
      ]);
      const execOptions = this.hasNativeMysqlClient()
        ? {
            encoding: 'utf8',
            env: {
              ...process.env,
              MYSQL_PWD: envConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          }
        : { encoding: 'utf8' };

      const output = execSync(mysqlCommand, execOptions);

      const allTables = output
        .trim()
        .split('\n')
        .filter((table) => table.length > 0);

      // Filter for existing network tables
      const existingTables = networkTableNames.filter((tableName) =>
        allTables.includes(tableName)
      );

      return existingTables;
    } catch (error) {
      throw new Error(
        `Failed to get network tables: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static validateNetworkTablesForMigration(
    sourceEnv: string,
    targetEnv: string
  ): void {
    const sourceNetworkTables = this.getExistingNetworkTables(sourceEnv);
    const targetNetworkTables = this.getExistingNetworkTables(targetEnv);
    const migrateableTables = this.getMigrateableNetworkTables();

    const sourceMigrateableTables = sourceNetworkTables.filter((table) =>
      migrateableTables.includes(table)
    );

    if (sourceMigrateableTables.length === 0) {
      throw new Error(
        `No migrateable network tables found in source environment '${sourceEnv}'`
      );
    }

    const missingInTarget = migrateableTables.filter(
      (table) => !targetNetworkTables.includes(table)
    );

    if (missingInTarget.length > 0) {
      console.warn(
        chalk.yellow(
          `Warning: Some network tables missing in target '${targetEnv}': ${missingInTarget.join(', ')}`
        )
      );
    }
  }

  static async exportNetworkTables(
    sourceEnv: string,
    outputPath: string,
    verbose = false,
    timeoutMinutes = 15
  ): Promise<NetworkExportResult> {
    const envConfig = Config.getEnvironmentConfig(sourceEnv);
    if (!Config.hasRequiredEnvironmentConfig(sourceEnv)) {
      throw new Error(
        `Environment '${sourceEnv}' is not configured. Run 'wfuwp config wizard' to set up.`
      );
    }

    const migrateableTables = this.getMigrateableNetworkTables();
    const existingTables = this.getExistingNetworkTables(sourceEnv);
    const tablesToExport = migrateableTables.filter((table) =>
      existingTables.includes(table)
    );

    if (tablesToExport.length === 0) {
      throw new Error(
        `No migrateable network tables found in ${sourceEnv} environment`
      );
    }

    if (verbose) {
      console.log(
        chalk.gray(
          `Exporting ${tablesToExport.length} network tables: ${tablesToExport.join(', ')}`
        )
      );
    }

    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    try {
      if (verbose) {
        console.log(chalk.gray('Running mysqldump for network tables...'));
      }

      let exportCommand: string;

      if (this.hasNativeMysqlClient()) {
        const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
        exportCommand = [
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
          ...tablesToExport.map((table) => `"${table}"`),
          '>',
          `"${outputPath}"`,
        ]
          .filter((arg) => arg.length > 0)
          .join(' ');

        execSync(exportCommand, {
          encoding: 'utf8',
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
            ...tablesToExport.map((table) => `"${table}"`),
          ]
            .filter((arg) => arg.length > 0)
            .join(' ') + ` > "${outputPath}"`;

        execSync(exportCommand, {
          encoding: 'utf8',
          stdio: verbose ? 'inherit' : 'ignore',
          shell: '/bin/bash',
          timeout: timeoutMinutes * 60 * 1000,
        });
      }

      if (!existsSync(outputPath)) {
        throw new Error('Network export file was not created');
      }

      const stats = require('fs').statSync(outputPath);

      return {
        filePath: outputPath,
        tableCount: tablesToExport.length,
        fileSize: stats.size,
      };
    } catch (error) {
      throw new Error(
        `Network tables export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async importNetworkTables(
    sqlFile: string,
    targetEnv: string,
    verbose = false,
    timeoutMinutes = 20
  ): Promise<NetworkImportResult> {
    if (!existsSync(sqlFile)) {
      throw new Error(`Network SQL file not found: ${sqlFile}`);
    }

    const envConfig = Config.getEnvironmentConfig(targetEnv);
    if (!Config.hasRequiredEnvironmentConfig(targetEnv)) {
      throw new Error(
        `Environment '${targetEnv}' is not configured. Run 'wfuwp config wizard' to set up.`
      );
    }

    try {
      if (verbose) {
        console.log(chalk.gray('Running mysql import for network tables...'));
      }

      let importCommand: string;

      if (this.hasNativeMysqlClient()) {
        const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
        importCommand = [
          'mysql',
          '-h',
          `"${envConfig.host}"`,
          portArg,
          '-u',
          `"${envConfig.user}"`,
          `"${envConfig.database}"`,
          '--max_allowed_packet=1G',
          '<',
          `"${sqlFile}"`,
        ]
          .filter((arg) => arg.length > 0)
          .join(' ');

        execSync(importCommand, {
          encoding: 'utf8',
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
        importCommand =
          [
            'docker run --rm',
            '-v',
            `"${dirname(sqlFile)}:${dirname(sqlFile)}"`,
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
            '--max_allowed_packet=1G',
          ]
            .filter((arg) => arg.length > 0)
            .join(' ') + ` < "${sqlFile}"`;

        execSync(importCommand, {
          encoding: 'utf8',
          stdio: verbose ? 'inherit' : 'ignore',
          shell: '/bin/bash',
          timeout: timeoutMinutes * 60 * 1000,
        });
      }

      const fileContent = require('fs').readFileSync(sqlFile, 'utf8');
      const createTableMatches = fileContent.match(/CREATE TABLE/gi);
      const tableCount = createTableMatches ? createTableMatches.length : 0;

      return {
        success: true,
        tableCount,
      };
    } catch (error) {
      throw new Error(
        `Network tables import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async backupNetworkTables(
    targetEnv: string,
    backupPath: string,
    verbose = false,
    timeoutMinutes = 15
  ): Promise<NetworkBackupResult> {
    const envConfig = Config.getEnvironmentConfig(targetEnv);
    if (!Config.hasRequiredEnvironmentConfig(targetEnv)) {
      throw new Error(
        `Environment '${targetEnv}' is not configured. Run 'wfuwp config wizard' to set up.`
      );
    }

    const migrateableTables = this.getMigrateableNetworkTables();
    const existingTables = this.getExistingNetworkTables(targetEnv);
    const tablesToBackup = migrateableTables.filter((table) =>
      existingTables.includes(table)
    );

    if (tablesToBackup.length === 0) {
      if (verbose) {
        console.log(
          chalk.gray('No network tables to backup in target environment')
        );
      }
      require('fs').writeFileSync(
        backupPath,
        '-- No network tables to backup\n'
      );
      return {
        filePath: backupPath,
        tableCount: 0,
        fileSize: 0,
      };
    }

    if (verbose) {
      console.log(
        chalk.gray(
          `Backing up ${tablesToBackup.length} network tables: ${tablesToBackup.join(', ')}`
        )
      );
    }

    const outputDir = dirname(backupPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    try {
      if (verbose) {
        console.log(
          chalk.gray('Running mysqldump for network table backup...')
        );
      }

      let backupCommand: string;

      if (this.hasNativeMysqlClient()) {
        const portArg = envConfig.port ? `-P "${envConfig.port}"` : '';
        backupCommand = [
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
          ...tablesToBackup.map((table) => `"${table}"`),
          '>',
          `"${backupPath}"`,
        ]
          .filter((arg) => arg.length > 0)
          .join(' ');

        execSync(backupCommand, {
          encoding: 'utf8',
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
        backupCommand =
          [
            'docker run --rm',
            '-v',
            `"${dirname(backupPath)}:${dirname(backupPath)}"`,
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
            ...tablesToBackup.map((table) => `"${table}"`),
          ]
            .filter((arg) => arg.length > 0)
            .join(' ') + ` > "${backupPath}"`;

        execSync(backupCommand, {
          encoding: 'utf8',
          stdio: verbose ? 'inherit' : 'ignore',
          shell: '/bin/bash',
          timeout: timeoutMinutes * 60 * 1000,
        });
      }

      if (!existsSync(backupPath)) {
        throw new Error('Network backup file was not created');
      }

      const stats = require('fs').statSync(backupPath);

      return {
        filePath: backupPath,
        tableCount: tablesToBackup.length,
        fileSize: stats.size,
      };
    } catch (error) {
      throw new Error(
        `Network tables backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async transformNetworkTablesForEnvironment(
    environment: string,
    replacements: Array<{ from: string; to: string }>,
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

    const networkTables = this.getExistingNetworkTables(environment);
    if (networkTables.length === 0) {
      if (verbose) {
        console.log(chalk.gray('No network tables found for transformation'));
      }
      return;
    }

    if (verbose) {
      console.log(
        chalk.gray(`Transforming ${networkTables.length} network tables`)
      );
    }

    const fieldsToTransform = [
      'domain',
      'path',
      'siteurl',
      'home',
      'meta_value',
      'option_value',
    ];

    for (const replacement of replacements) {
      if (verbose) {
        console.log(
          chalk.gray(
            `Network tables: Replacing "${replacement.from}" → "${replacement.to}"`
          )
        );
      }

      for (const table of networkTables) {
        try {
          // Get table columns using cached approach (avoids repeated DESCRIBE queries)
          const columns = this.getTableColumns(table, envConfig);

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

          for (const field of fieldsToTransform) {
            if (columns.includes(field)) {
              const updateQuery = `UPDATE ${table} SET ${field} = REPLACE(${field}, '${replacement.from}', '${replacement.to}') WHERE ${field} LIKE '%${replacement.from}%'`;

              const mysqlCommand = this.buildMysqlCommand(envConfig, [
                '-e',
                `"${updateQuery}"`,
              ]);
              const execOptions = this.hasNativeMysqlClient()
                ? {
                    encoding: 'utf8',
                    stdio: 'ignore' as const,
                    env: {
                      ...process.env,
                      MYSQL_PWD: envConfig.password,
                      PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
                    },
                  }
                : {
                    encoding: 'utf8',
                    stdio: 'ignore' as const,
                  };

              execSync(mysqlCommand, execOptions);

              if (verbose) {
                console.log(chalk.gray(`  Updated ${table}.${field}`));
              }
            }
          }
        } catch (error) {
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
}
