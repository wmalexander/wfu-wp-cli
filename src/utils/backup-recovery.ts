import { execSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  readdirSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { Config } from './config';
import { SiteEnumerator, SiteInfo } from './site-enumerator';
import { NetworkTableOperations } from './network-tables';

export interface BackupMetadata {
  timestamp: string;
  environment: string;
  backupId: string;
  networkTables: string[];
  sites: number[];
  totalSize: number;
  backupPaths: {
    networkTablesFile?: string;
    sitesFiles: Record<number, string>;
    metadataFile: string;
  };
  checksums: Record<string, string>;
}

interface BackupResult {
  success: boolean;
  backupId: string;
  metadata: BackupMetadata;
  totalSize: number;
  errors: string[];
}

interface RestoreOptions {
  networkTables?: boolean;
  sites?: number[];
  skipConfirmation?: boolean;
  timeout?: number;
}

interface RestoreResult {
  success: boolean;
  restoredNetworkTables: boolean;
  restoredSites: number[];
  failedSites: number[];
  errors: string[];
}

export class BackupRecovery {
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
  static generateBackupId(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const random = Math.random().toString(36).substring(2, 8);
    return `backup-${timestamp}-${random}`;
  }

  static getBackupDirectory(workDir?: string): string {
    if (workDir) {
      // If explicit workDir provided, use it
      if (!existsSync(workDir)) {
        mkdirSync(workDir, { recursive: true });
      }
      return workDir;
    }

    // Use consistent location in ~/.wfuwp/backups
    const wfuwpDir = join(homedir(), '.wfuwp');
    const baseDir = join(wfuwpDir, 'backups');
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    return baseDir;
  }

  static async createFullEnvironmentBackup(
    environment: string,
    options: {
      workDir?: string;
      verbose?: boolean;
      timeout?: number;
      sites?: number[];
      skipNetworkTables?: boolean;
    } = {}
  ): Promise<BackupResult> {
    const backupId = this.generateBackupId();
    const backupDir = join(this.getBackupDirectory(options.workDir), backupId);
    const errors: string[] = [];
    let totalSize = 0;

    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    if (options.verbose) {
      console.log(
        chalk.blue(`Creating full environment backup for '${environment}'...`)
      );
      console.log(chalk.gray(`  Backup ID: ${backupId}`));
      console.log(chalk.gray(`  Backup directory: ${backupDir}`));
    }

    const metadata: BackupMetadata = {
      timestamp: new Date().toISOString(),
      environment,
      backupId,
      networkTables: [],
      sites: [],
      totalSize: 0,
      backupPaths: {
        sitesFiles: {},
        metadataFile: join(backupDir, 'metadata.json'),
      },
      checksums: {},
    };

    try {
      // Backup network tables unless skipped
      if (!options.skipNetworkTables) {
        try {
          if (options.verbose) {
            console.log(chalk.gray('  Backing up network tables...'));
          }

          const networkBackupPath = join(
            backupDir,
            `network-tables-${environment}.sql`
          );
          const networkResult =
            await NetworkTableOperations.backupNetworkTables(
              environment,
              networkBackupPath,
              options.verbose || false,
              options.timeout || 20
            );

          metadata.networkTables =
            NetworkTableOperations.getMigrateableNetworkTables();
          metadata.backupPaths.networkTablesFile = networkBackupPath;
          totalSize += networkResult.fileSize;

          if (options.verbose) {
            console.log(
              chalk.green(
                `    ✓ Network tables backup completed (${(networkResult.fileSize / 1024 / 1024).toFixed(2)} MB)`
              )
            );
          }
        } catch (error) {
          const errorMessage = `Network tables backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          if (options.verbose) {
            console.log(chalk.red(`    ✗ ${errorMessage}`));
          }
        }
      }

      // Discover and backup sites
      let sitesToBackup = options.sites;
      if (!sitesToBackup) {
        try {
          if (options.verbose) {
            console.log(chalk.gray('  Discovering sites...'));
          }

          const siteResult = await SiteEnumerator.enumerateSites(environment, {
            activeOnly: true,
          });
          sitesToBackup = siteResult.sites.map((site: SiteInfo) => site.blogId);

          if (options.verbose) {
            console.log(
              chalk.green(`    ✓ Found ${sitesToBackup.length} sites to backup`)
            );
          }
        } catch (error) {
          const errorMessage = `Site discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMessage);
          sitesToBackup = [];
        }
      }

      // Backup individual sites
      if (sitesToBackup && sitesToBackup.length > 0) {
        if (options.verbose) {
          console.log(
            chalk.gray(`  Backing up ${sitesToBackup.length} sites...`)
          );
        }

        for (const siteId of sitesToBackup) {
          try {
            const siteBackupPath = join(
              backupDir,
              `site-${siteId}-${environment}.sql`
            );
            const siteSize = await this.backupSiteTables(
              environment,
              siteId,
              siteBackupPath,
              options.timeout || 20
            );

            metadata.sites.push(siteId);
            metadata.backupPaths.sitesFiles[siteId] = siteBackupPath;
            totalSize += siteSize;

            if (options.verbose) {
              console.log(
                chalk.green(
                  `    ✓ Site ${siteId} backup completed (${(siteSize / 1024 / 1024).toFixed(2)} MB)`
                )
              );
            }
          } catch (error) {
            const errorMessage = `Site ${siteId} backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMessage);
            if (options.verbose) {
              console.log(chalk.red(`    ✗ ${errorMessage}`));
            }
          }
        }
      }

      // Generate checksums for all backup files
      const allFiles = Object.values(metadata.backupPaths.sitesFiles);
      if (metadata.backupPaths.networkTablesFile) {
        allFiles.push(metadata.backupPaths.networkTablesFile);
      }

      for (const filePath of allFiles) {
        if (existsSync(filePath)) {
          try {
            const checksum = execSync(`shasum -a 256 "${filePath}"`, {
              encoding: 'utf8',
            }).split(' ')[0];
            metadata.checksums[basename(filePath)] = checksum;
          } catch (error) {
            if (options.verbose) {
              console.log(
                chalk.yellow(
                  `    Warning: Could not generate checksum for ${basename(filePath)}`
                )
              );
            }
          }
        }
      }

      // Save metadata
      metadata.totalSize = totalSize;
      writeFileSync(
        metadata.backupPaths.metadataFile,
        JSON.stringify(metadata, null, 2)
      );

      const success = errors.length === 0;
      if (options.verbose) {
        if (success) {
          console.log(
            chalk.green(`✓ Full environment backup completed successfully`)
          );
          console.log(
            chalk.cyan(
              `  Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`
            )
          );
          console.log(
            chalk.cyan(`  Network tables: ${metadata.networkTables.length}`)
          );
          console.log(chalk.cyan(`  Sites: ${metadata.sites.length}`));
        } else {
          console.log(
            chalk.yellow(
              `⚠ Environment backup completed with ${errors.length} errors`
            )
          );
        }
      }

      return {
        success,
        backupId,
        metadata,
        totalSize,
        errors,
      };
    } catch (error) {
      const errorMessage = `Backup operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMessage);

      return {
        success: false,
        backupId,
        metadata,
        totalSize,
        errors,
      };
    }
  }

  static async backupSiteTables(
    environment: string,
    siteId: number,
    outputPath: string,
    timeoutMinutes = 20
  ): Promise<number> {
    const envConfig = Config.getEnvironmentConfig(environment);
    if (!Config.hasRequiredEnvironmentConfig(environment)) {
      throw new Error(`Environment '${environment}' is not configured`);
    }

    // Create output directory if needed
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Get site table names
    const siteTableNames = await this.getSiteTableNames(environment, siteId);

    if (siteTableNames.length === 0) {
      throw new Error(
        `No tables found for site ${siteId} in environment '${environment}'`
      );
    }

    // Create mysqldump command
    const tablesArg = siteTableNames.join(' ');
    const portArg = envConfig.port ? `--port=${envConfig.port}` : '';
    const mysqldumpCmd = [
      'mysqldump',
      '--single-transaction',
      '--routines',
      '--triggers',
      '--lock-tables=false',
      '--complete-insert',
      `--host=${envConfig.host}`,
      portArg,
      `--user=${envConfig.user}`,
      envConfig.database,
      tablesArg,
    ]
      .filter((arg) => arg && arg.length > 0)
      .join(' ');

    try {
      execSync(`${mysqldumpCmd} > "${outputPath}"`, {
        timeout: timeoutMinutes * 60 * 1000,
        env: {
          ...process.env,
          MYSQL_PWD: envConfig.password,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
      });

      // Get file size
      const stats = require('fs').statSync(outputPath);
      return stats.size;
    } catch (error) {
      // Clean up partial file
      if (existsSync(outputPath)) {
        unlinkSync(outputPath);
      }
      throw new Error(
        `Site ${siteId} backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async getSiteTableNames(
    environment: string,
    siteId: number
  ): Promise<string[]> {
    const envConfig = Config.getEnvironmentConfig(environment);
    const tablePrefix = siteId === 1 ? 'wp_' : `wp_${siteId}_`;

    try {
      const output = execSync(
        this.buildMysqlCommand(envConfig, [
          '-e',
          `"SHOW TABLES LIKE '${tablePrefix}%'"`,
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

      return output
        .trim()
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .filter((tableName) => {
          // Exclude network tables for individual site backups
          const networkTables = [
            'wp_blogs',
            'wp_site',
            'wp_sitemeta',
            'wp_blogmeta',
            'wp_users',
            'wp_usermeta',
            'wp_registration_log',
            'wp_signups',
          ];
          return !networkTables.includes(tableName);
        });
    } catch (error) {
      throw new Error(
        `Failed to get site table names: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async restoreFromBackup(
    backupId: string,
    targetEnvironment: string,
    options: RestoreOptions = {}
  ): Promise<RestoreResult> {
    const backupDir = join(this.getBackupDirectory(), backupId);
    const metadataPath = join(backupDir, 'metadata.json');

    if (!existsSync(metadataPath)) {
      throw new Error(`Backup metadata not found: ${metadataPath}`);
    }

    const metadata: BackupMetadata = JSON.parse(
      readFileSync(metadataPath, 'utf8')
    );
    const errors: string[] = [];
    let restoredNetworkTables = false;
    const restoredSites: number[] = [];
    const failedSites: number[] = [];

    console.log(
      chalk.blue(
        `Restoring from backup ${backupId} to environment '${targetEnvironment}'...`
      )
    );

    // Verify backup integrity
    console.log(chalk.gray('  Verifying backup integrity...'));
    const integrityCheck = this.verifyBackupIntegrity(metadata);
    if (!integrityCheck.valid) {
      errors.push(
        `Backup integrity check failed: ${integrityCheck.errors.join(', ')}`
      );
      console.log(chalk.red(`  ✗ Backup integrity check failed`));

      if (!options.skipConfirmation) {
        console.log(
          chalk.yellow('  Backup may be corrupted. Continue anyway? (y/N)')
        );
        // Add confirmation logic here if needed
      }
    } else {
      console.log(chalk.green('  ✓ Backup integrity verified'));
    }

    // Restore network tables if requested
    if (
      options.networkTables !== false &&
      metadata.backupPaths.networkTablesFile
    ) {
      try {
        console.log(chalk.gray('  Restoring network tables...'));
        await NetworkTableOperations.importNetworkTables(
          metadata.backupPaths.networkTablesFile,
          targetEnvironment,
          true,
          options.timeout || 20
        );
        restoredNetworkTables = true;
        console.log(chalk.green('  ✓ Network tables restored successfully'));
      } catch (error) {
        const errorMessage = `Network tables restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        console.log(chalk.red(`  ✗ ${errorMessage}`));
      }
    }

    // Restore sites
    const sitesToRestore = options.sites || metadata.sites;
    if (sitesToRestore.length > 0) {
      console.log(chalk.gray(`  Restoring ${sitesToRestore.length} sites...`));

      for (const siteId of sitesToRestore) {
        if (
          metadata.backupPaths.sitesFiles[siteId] &&
          existsSync(metadata.backupPaths.sitesFiles[siteId])
        ) {
          try {
            await this.restoreSiteTables(
              metadata.backupPaths.sitesFiles[siteId],
              targetEnvironment,
              siteId,
              options.timeout || 20
            );
            restoredSites.push(siteId);
            console.log(
              chalk.green(`    ✓ Site ${siteId} restored successfully`)
            );
          } catch (error) {
            const errorMessage = `Site ${siteId} restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMessage);
            failedSites.push(siteId);
            console.log(chalk.red(`    ✗ ${errorMessage}`));
          }
        } else {
          const errorMessage = `Backup file not found for site ${siteId}`;
          errors.push(errorMessage);
          failedSites.push(siteId);
          console.log(chalk.red(`    ✗ ${errorMessage}`));
        }
      }
    }

    const success = errors.length === 0;
    if (success) {
      console.log(chalk.green('✓ Backup restoration completed successfully'));
    } else {
      console.log(
        chalk.yellow(
          `⚠ Backup restoration completed with ${errors.length} errors`
        )
      );
    }

    return {
      success,
      restoredNetworkTables,
      restoredSites,
      failedSites,
      errors,
    };
  }

  static async restoreSiteTables(
    backupFilePath: string,
    targetEnvironment: string,
    siteId: number,
    timeoutMinutes = 20
  ): Promise<void> {
    const envConfig = Config.getEnvironmentConfig(targetEnvironment);
    if (!Config.hasRequiredEnvironmentConfig(targetEnvironment)) {
      throw new Error(`Environment '${targetEnvironment}' is not configured`);
    }

    if (!existsSync(backupFilePath)) {
      throw new Error(`Backup file not found: ${backupFilePath}`);
    }

    try {
      execSync(`${this.buildMysqlCommand(envConfig)} < "${backupFilePath}"`, {
        timeout: timeoutMinutes * 60 * 1000,
        env: {
          ...process.env,
          MYSQL_PWD: envConfig.password,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
      });
    } catch (error) {
      throw new Error(
        `Site ${siteId} restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static verifyBackupIntegrity(metadata: BackupMetadata): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check if metadata file exists
    if (!existsSync(metadata.backupPaths.metadataFile)) {
      errors.push('Metadata file missing');
    }

    // Check if network tables file exists
    if (
      metadata.backupPaths.networkTablesFile &&
      !existsSync(metadata.backupPaths.networkTablesFile)
    ) {
      errors.push('Network tables backup file missing');
    }

    // Check if site backup files exist
    for (const [siteId, filePath] of Object.entries(
      metadata.backupPaths.sitesFiles
    )) {
      if (!existsSync(filePath)) {
        errors.push(`Site ${siteId} backup file missing: ${filePath}`);
      }
    }

    // Verify checksums if available
    for (const [fileName, expectedChecksum] of Object.entries(
      metadata.checksums
    )) {
      let filePath: string | undefined;

      if (
        metadata.backupPaths.networkTablesFile &&
        basename(metadata.backupPaths.networkTablesFile) === fileName
      ) {
        filePath = metadata.backupPaths.networkTablesFile;
      } else {
        filePath = Object.values(metadata.backupPaths.sitesFiles).find(
          (path) => basename(path) === fileName
        );
      }

      if (filePath && existsSync(filePath)) {
        try {
          const actualChecksum = execSync(`shasum -a 256 "${filePath}"`, {
            encoding: 'utf8',
          }).split(' ')[0];
          if (actualChecksum !== expectedChecksum) {
            errors.push(
              `Checksum mismatch for ${fileName}: expected ${expectedChecksum}, got ${actualChecksum}`
            );
          }
        } catch (error) {
          errors.push(`Could not verify checksum for ${fileName}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  static listAvailableBackups(workDir?: string): BackupMetadata[] {
    const backupDir = this.getBackupDirectory(workDir);
    const backups: BackupMetadata[] = [];

    try {
      const entries = readdirSync(backupDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadataPath = join(backupDir, entry.name, 'metadata.json');
          if (existsSync(metadataPath)) {
            try {
              const metadata: BackupMetadata = JSON.parse(
                readFileSync(metadataPath, 'utf8')
              );
              backups.push(metadata);
            } catch (error) {
              // Skip invalid metadata files
            }
          }
        }
      }
    } catch (error) {
      // Return empty array if backup directory doesn't exist or can't be read
    }

    return backups.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  static async deleteBackup(
    backupId: string,
    workDir?: string
  ): Promise<boolean> {
    const backupDir = join(this.getBackupDirectory(workDir), backupId);

    if (!existsSync(backupDir)) {
      return false;
    }

    try {
      execSync(`rm -rf "${backupDir}"`);
      return true;
    } catch (error) {
      return false;
    }
  }
}
