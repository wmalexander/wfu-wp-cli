import { execSync } from 'child_process';
import chalk from 'chalk';
import { Config } from './config';
import { DatabaseOperations } from './database';
import { SiteEnumerator } from './site-enumerator';
import { BackupRecovery } from './backup-recovery';

export interface CleanupResult {
  environment: string;
  deletedSites: number[];
  droppedTables: string[];
  errors: string[];
  spaceReclaimed?: number;
  duration: number;
}

export interface CleanupOptions {
  dryRun?: boolean;
  sitesOnly?: boolean;
  tablesOnly?: boolean;
  targetEnvironments?: string[];
  targetSite?: number;
  createBackup?: boolean;
  verbose?: boolean;
  force?: boolean;
}

export interface OrphanedSite {
  siteId: number;
  domain: string;
  path: string;
  tables: string[];
  estimatedSize?: number;
}

export interface OrphanedTable {
  tableName: string;
  siteId: number;
  estimatedSize?: number;
}

export interface EnvironmentComparison {
  environment: string;
  orphanedSites: OrphanedSite[];
  orphanedTables: OrphanedTable[];
  totalOrphanedTables: number;
  estimatedSpaceSavings?: number;
}

export class EnvironmentCleanupService {
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

  static async compareEnvironments(
    sourceEnv: string = 'prod',
    targetEnvs: string[] = ['dev', 'uat', 'pprd'],
    options: CleanupOptions = {}
  ): Promise<EnvironmentComparison[]> {
    if (sourceEnv === 'prod' && targetEnvs.includes('prod')) {
      throw new Error(
        'Cannot perform cleanup operations on production environment'
      );
    }
    const sourceSites = await SiteEnumerator.enumerateSites(sourceEnv, {
      activeOnly: true,
      includeMainSite: true,
    });
    const sourceSiteIds = new Set(sourceSites.sites.map((site) => site.blogId));
    const comparisons: EnvironmentComparison[] = [];
    for (const targetEnv of targetEnvs) {
      if (options.verbose) {
        console.log(chalk.gray(`Analyzing ${targetEnv} environment...`));
      }
      const targetSites = await SiteEnumerator.enumerateSites(targetEnv, {
        includeMainSite: true,
      });
      const orphanedSites: OrphanedSite[] = [];
      const orphanedTables: OrphanedTable[] = [];
      for (const site of targetSites.sites) {
        if (!sourceSiteIds.has(site.blogId)) {
          const siteTables = DatabaseOperations.getSiteTables(
            site.blogId.toString(),
            targetEnv
          );
          orphanedSites.push({
            siteId: site.blogId,
            domain: site.domain,
            path: site.path,
            tables: siteTables,
          });
        }
      }
      if (!options.sitesOnly) {
        for (const site of targetSites.sites) {
          if (sourceSiteIds.has(site.blogId)) {
            const sourceTables = new Set(
              DatabaseOperations.getSiteTables(
                site.blogId.toString(),
                sourceEnv
              )
            );
            const targetTables = DatabaseOperations.getSiteTables(
              site.blogId.toString(),
              targetEnv
            );

            for (const table of targetTables) {
              if (!sourceTables.has(table)) {
                orphanedTables.push({
                  tableName: table,
                  siteId: site.blogId,
                });
              }
            }
          }
        }
      }
      comparisons.push({
        environment: targetEnv,
        orphanedSites,
        orphanedTables,
        totalOrphanedTables:
          orphanedSites.reduce((sum, site) => sum + site.tables.length, 0) +
          orphanedTables.length,
      });
    }
    return comparisons;
  }

  static async deleteSiteFromEnvironment(
    siteId: number,
    environment: string,
    options: CleanupOptions = {}
  ): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      environment,
      deletedSites: [],
      droppedTables: [],
      errors: [],
      duration: 0,
    };
    if (environment === 'prod') {
      throw new Error('Cannot delete sites from production environment');
    }
    try {
      const siteExists = await SiteEnumerator.validateSiteExists(
        siteId,
        environment
      );
      if (!siteExists) {
        result.errors.push(
          `Site ${siteId} does not exist in ${environment} environment`
        );
        return result;
      }
      if (options.createBackup && !options.dryRun) {
        if (options.verbose) {
          console.log(chalk.gray(`Creating backup for site ${siteId}...`));
        }
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .slice(0, 19);
        const backupPath = require('path').join(
          process.cwd(),
          `site-${siteId}-${environment}-${timestamp}.sql`
        );
        await BackupRecovery.backupSiteTables(environment, siteId, backupPath);
      }
      const siteTables = DatabaseOperations.getSiteTables(
        siteId.toString(),
        environment
      );

      if (!options.dryRun) {
        if (options.verbose) {
          console.log(
            chalk.gray(`Deleting site ${siteId} from wp_blogs table...`)
          );
        }
        await this.deleteSiteFromBlogsTable(siteId, environment);
        result.deletedSites.push(siteId);
        if (options.verbose) {
          console.log(
            chalk.gray(
              `Dropping ${siteTables.length} tables for site ${siteId}...`
            )
          );
        }
        await this.dropTables(siteTables, environment);
        result.droppedTables = siteTables;
      } else {
        result.droppedTables = siteTables;
      }
    } catch (error) {
      result.errors.push(
        `Failed to delete site ${siteId}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
    result.duration = Date.now() - startTime;
    return result;
  }

  static async cleanupOrphanedTables(
    tables: OrphanedTable[],
    environment: string,
    options: CleanupOptions = {}
  ): Promise<CleanupResult> {
    const startTime = Date.now();
    const result: CleanupResult = {
      environment,
      deletedSites: [],
      droppedTables: [],
      errors: [],
      duration: 0,
    };
    if (environment === 'prod') {
      throw new Error('Cannot cleanup tables in production environment');
    }
    const tableNames = tables.map((t) => t.tableName);

    if (!options.dryRun) {
      try {
        await this.dropTables(tableNames, environment);
        result.droppedTables = tableNames;
      } catch (error) {
        result.errors.push(
          `Failed to drop orphaned tables: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } else {
      result.droppedTables = tableNames;
    }
    result.duration = Date.now() - startTime;
    return result;
  }

  static async performEnvironmentCleanup(
    sourceEnv: string = 'prod',
    targetEnvs: string[] = ['dev', 'uat', 'pprd'],
    options: CleanupOptions = {}
  ): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];
    const comparisons = await this.compareEnvironments(
      sourceEnv,
      targetEnvs,
      options
    );
    for (const comparison of comparisons) {
      const envResult: CleanupResult = {
        environment: comparison.environment,
        deletedSites: [],
        droppedTables: [],
        errors: [],
        duration: 0,
      };
      const startTime = Date.now();
      try {
        if (!options.tablesOnly) {
          for (const orphanedSite of comparison.orphanedSites) {
            if (
              options.targetSite &&
              options.targetSite !== orphanedSite.siteId
            ) {
              continue;
            }
            const siteResult = await this.deleteSiteFromEnvironment(
              orphanedSite.siteId,
              comparison.environment,
              options
            );
            envResult.deletedSites.push(...siteResult.deletedSites);
            envResult.droppedTables.push(...siteResult.droppedTables);
            envResult.errors.push(...siteResult.errors);
          }
        }
        if (!options.sitesOnly) {
          const tablesToDrop = comparison.orphanedTables.filter(
            (t) => !options.targetSite || t.siteId === options.targetSite
          );

          if (tablesToDrop.length > 0) {
            const tableResult = await this.cleanupOrphanedTables(
              tablesToDrop,
              comparison.environment,
              options
            );
            envResult.droppedTables.push(...tableResult.droppedTables);
            envResult.errors.push(...tableResult.errors);
          }
        }
      } catch (error) {
        envResult.errors.push(
          `Environment cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
      envResult.duration = Date.now() - startTime;
      results.push(envResult);
    }
    return results;
  }

  static async generateCleanupReport(
    comparisons: EnvironmentComparison[],
    results?: CleanupResult[]
  ): Promise<string> {
    let report = '\n' + chalk.bold.cyan('🧹 Environment Cleanup Report') + '\n';
    report += '=' + '='.repeat(50) + '\n\n';
    for (let i = 0; i < comparisons.length; i++) {
      const comparison = comparisons[i];
      const result = results?.[i];
      report += chalk.bold.yellow(
        `Environment: ${comparison.environment.toUpperCase()}\n`
      );
      report += `-`.repeat(20) + '\n';
      if (comparison.orphanedSites.length > 0) {
        report += chalk.red(
          `📍 Orphaned Sites: ${comparison.orphanedSites.length}\n`
        );
        comparison.orphanedSites.forEach((site) => {
          const status = result?.deletedSites.includes(site.siteId)
            ? chalk.green('✓ DELETED')
            : result
              ? chalk.yellow('⚠ SKIPPED')
              : chalk.gray('PENDING');
          report += `  Site ${site.siteId}: ${site.domain}${site.path} (${site.tables.length} tables) ${status}\n`;
        });
        report += '\n';
      }
      if (comparison.orphanedTables.length > 0) {
        report += chalk.red(
          `🗂 Orphaned Tables: ${comparison.orphanedTables.length}\n`
        );
        const groupedBySize = comparison.orphanedTables.slice(0, 10);
        groupedBySize.forEach((table) => {
          const status = result?.droppedTables.includes(table.tableName)
            ? chalk.green('✓ DROPPED')
            : result
              ? chalk.yellow('⚠ SKIPPED')
              : chalk.gray('PENDING');
          report += `  ${table.tableName} (Site ${table.siteId}) ${status}\n`;
        });
        if (comparison.orphanedTables.length > 10) {
          report += `  ... and ${comparison.orphanedTables.length - 10} more tables\n`;
        }
        report += '\n';
      }
      report += chalk.cyan(
        `Total Tables to Clean: ${comparison.totalOrphanedTables}\n`
      );
      if (result) {
        report += chalk.green(`✅ Completed in ${result.duration}ms\n`);
        if (result.errors.length > 0) {
          report += chalk.red(`❌ Errors: ${result.errors.length}\n`);
          result.errors.forEach((error) => {
            report += `    ${error}\n`;
          });
        }
      }
      report += '\n';
    }
    const totalOrphaned = comparisons.reduce(
      (sum, c) => sum + c.totalOrphanedTables,
      0
    );
    const totalSites = comparisons.reduce(
      (sum, c) => sum + c.orphanedSites.length,
      0
    );
    report += chalk.bold.green(`📊 Summary:\n`);
    report += `  Total Orphaned Sites: ${totalSites}\n`;
    report += `  Total Orphaned Tables: ${totalOrphaned}\n`;

    if (results) {
      const totalDeleted = results.reduce(
        (sum, r) => sum + r.deletedSites.length,
        0
      );
      const totalDropped = results.reduce(
        (sum, r) => sum + r.droppedTables.length,
        0
      );
      const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
      report += `  Sites Deleted: ${totalDeleted}\n`;
      report += `  Tables Dropped: ${totalDropped}\n`;
      if (totalErrors > 0) {
        report += chalk.red(`  Errors Encountered: ${totalErrors}\n`);
      }
    }
    return report;
  }

  private static async deleteSiteFromBlogsTable(
    siteId: number,
    environment: string
  ): Promise<void> {
    const envConfig = Config.getEnvironmentConfig(environment);
    const deleteQuery = `DELETE FROM wp_blogs WHERE blog_id = ${siteId}`;
    try {
      const mysqlCommand = this.buildMysqlCommand(envConfig, [
        '-e',
        `"${deleteQuery}"`,
      ]);
      execSync(mysqlCommand, {
        encoding: 'utf8',
        stdio: 'ignore',
        env: {
          ...process.env,
          MYSQL_PWD: envConfig.password,
          PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
        },
      });
    } catch (error) {
      throw new Error(
        `Failed to delete site ${siteId} from wp_blogs: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private static async dropTables(
    tables: string[],
    environment: string
  ): Promise<void> {
    if (tables.length === 0) return;
    const envConfig = Config.getEnvironmentConfig(environment);
    const batchSize = 10;
    for (let i = 0; i < tables.length; i += batchSize) {
      const batch = tables.slice(i, i + batchSize);
      for (const table of batch) {
        try {
          const dropQuery = `DROP TABLE IF EXISTS \`${table}\``;
          const mysqlCommand = this.buildMysqlCommand(envConfig, [
            '-e',
            `"${dropQuery}"`,
          ]);
          execSync(mysqlCommand, {
            encoding: 'utf8',
            stdio: 'ignore',
            env: {
              ...process.env,
              MYSQL_PWD: envConfig.password,
              PATH: `/opt/homebrew/opt/mysql-client/bin:${process.env.PATH}`,
            },
          });
        } catch (error) {
          throw new Error(
            `Failed to drop table ${table}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }
    }
  }
}
