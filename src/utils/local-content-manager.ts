import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { Config } from './config';
import { DDEVManager } from './ddev-manager';

export interface RefreshOptions {
  siteId: string;
  environment: string;
  force: boolean;
  backup: boolean;
  workDir?: string;
  keepFiles?: boolean;
}

export interface ResetOptions {
  force: boolean;
  keepConfig: boolean;
  deepReset?: boolean;
}

export interface InitialDatabaseOptions {
  force: boolean;
  backup: boolean;
  workDir?: string;
  keepFiles?: boolean;
}

export interface RefreshResult {
  success: boolean;
  message: string;
  databaseFile?: string;
  backupFile?: string;
  error?: string;
}

export interface ResetResult {
  success: boolean;
  message: string;
  removedItems: string[];
  error?: string;
}

export interface BuildOperations {
  success: boolean;
  operations: string[];
  errors: string[];
}

export class LocalContentManager {
  private ddevManager: DDEVManager;
  private readonly defaultWorkDir: string;

  constructor() {
    this.ddevManager = new DDEVManager();
    this.defaultWorkDir = path.join(os.homedir(), '.wfuwp', 'local-refresh');
  }

  private runCommand(
    command: string,
    options: { silent?: boolean; cwd?: string } = {}
  ): string {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit',
        cwd: options.cwd || process.cwd(),
      });
      return result ? result.trim() : '';
    } catch (error) {
      if (!options.silent) {
        throw error;
      }
      return '';
    }
  }

  private ensureWorkDir(workDir: string): void {
    if (!existsSync(workDir)) {
      mkdirSync(workDir, { recursive: true });
    }
  }

  private findProjectForSite(
    siteId: string
  ): { name: string; location: string } | null {
    const projects = this.ddevManager.getProjects();
    const project = projects.find(
      (p) => p.siteId === siteId || p.name.includes(siteId)
    );

    if (!project || !project.location) {
      return null;
    }

    return {
      name: project.name,
      location: project.location,
    };
  }

  private createBackup(siteId: string, workDir: string): string | null {
    try {
      const project = this.findProjectForSite(siteId);
      if (!project) {
        console.log(
          chalk.yellow(
            `⚠️ No DDEV project found for site ${siteId}, skipping database backup`
          )
        );
        return null;
      }

      const backupPath = path.join(
        workDir,
        `site-${siteId}-backup-${Date.now()}.sql`
      );

      console.log(chalk.blue(`📦 Creating backup of current database...`));

      this.runCommand(
        `ddev export-db --file="${backupPath}"`,
        { silent: false }
      );

      if (existsSync(backupPath)) {
        console.log(
          chalk.green(`✅ Backup created: ${path.basename(backupPath)}`)
        );
        return backupPath;
      }

      return null;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to create backup: ${error}`));
      return null;
    }
  }

  async refreshDatabase(options: RefreshOptions): Promise<RefreshResult> {
    try {
      const workDir = options.workDir || this.defaultWorkDir;
      this.ensureWorkDir(workDir);

      if (!/^\d+$/.test(options.siteId)) {
        return {
          success: false,
          message: 'Site ID must be a positive integer',
          error: 'Invalid site ID format',
        };
      }

      const project = this.findProjectForSite(options.siteId);
      if (!project) {
        return {
          success: false,
          message: `No DDEV project found for site ${options.siteId}. Make sure the project exists and is configured.`,
          error: 'Project not found',
        };
      }

      console.log(
        chalk.blue(
          `🔄 Refreshing database for site ${options.siteId} from ${options.environment}...\n`
        )
      );

      const health = this.ddevManager.checkEnvironmentHealth();
      if (health.overall === 'error') {
        return {
          success: false,
          message:
            'Local development environment is not healthy. Run "wfuwp local status" for details.',
          error: 'Environment not ready',
        };
      }

      let backupFile: string | null = null;
      if (options.backup) {
        backupFile = this.createBackup(options.siteId, workDir);
      }

      if (!Config.hasRequiredS3Config()) {
        return {
          success: false,
          message:
            'S3 configuration is missing. Run "wfuwp config wizard" to configure S3 backup access.',
          error: 'S3 not configured',
        };
      }

      console.log(
        chalk.blue(
          `📥 Downloading database backup from ${options.environment}...`
        )
      );

      const s3Config = Config.getS3Config();
      const backupFileName = `site-${options.siteId}-${options.environment}-${Date.now()}.sql.gz`;
      const localBackupPath = path.join(workDir, backupFileName);

      try {
        const s3Path = `${s3Config.prefix || 'backups'}/${options.environment}/site-${options.siteId}/latest.sql.gz`;
        this.runCommand(
          `aws s3 cp s3://${s3Config.bucket}/${s3Path} "${localBackupPath}"`,
          { silent: false }
        );
      } catch (error) {
        console.log(
          chalk.yellow(
            `⚠️ Latest backup not found, searching for recent backups...`
          )
        );

        try {
          const s3Path = `${s3Config.prefix || 'backups'}/${options.environment}/site-${options.siteId}/`;
          const listOutput = this.runCommand(
            `aws s3 ls s3://${s3Config.bucket}/${s3Path} --recursive | sort -k1,2 | tail -1`,
            { silent: true }
          );

          if (!listOutput.trim()) {
            return {
              success: false,
              message: `No database backups found for site ${options.siteId} in ${options.environment} environment`,
              error: 'No backups available',
            };
          }

          const parts = listOutput.trim().split(/\s+/);
          const recentBackupKey = parts[parts.length - 1];

          this.runCommand(
            `aws s3 cp s3://${s3Config.bucket}/${recentBackupKey} "${localBackupPath}"`,
            { silent: false }
          );
        } catch (listError) {
          return {
            success: false,
            message: `Failed to find or download database backup: ${listError}`,
            error: 'Download failed',
          };
        }
      }

      if (!existsSync(localBackupPath)) {
        return {
          success: false,
          message: 'Database backup download failed - file not found',
          error: 'Download verification failed',
        };
      }

      console.log(chalk.blue(`📤 Importing database to DDEV project...`));

      const decompressedPath = localBackupPath.replace('.gz', '');
      if (localBackupPath.endsWith('.gz')) {
        this.runCommand(`gunzip -f "${localBackupPath}"`);
      }

      this.runCommand(
        `ddev import-db --file="${decompressedPath}"`,
        { silent: false }
      );

      if (!options.keepFiles) {
        if (existsSync(decompressedPath)) {
          rmSync(decompressedPath);
        }
        if (existsSync(localBackupPath)) {
          rmSync(localBackupPath);
        }
      }

      return {
        success: true,
        message: `Successfully refreshed database for site ${options.siteId} from ${options.environment}`,
        databaseFile: options.keepFiles ? decompressedPath : undefined,
        backupFile: backupFile || undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: `Database refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async setupInitialDatabase(options: InitialDatabaseOptions): Promise<RefreshResult> {
    try {
      const workDir = options.workDir || this.defaultWorkDir;
      this.ensureWorkDir(workDir);

      console.log(
        chalk.blue(
          '🔄 Setting up initial multisite database with all sites...\n'
        )
      );

      const health = this.ddevManager.checkEnvironmentHealth();
      if (health.overall === 'error') {
        return {
          success: false,
          message:
            'Local development environment is not healthy. Run "wfuwp local status" for details.',
          error: 'Environment not ready',
        };
      }

      let backupFile: string | null = null;
      if (options.backup) {
        console.log(chalk.blue('💾 Creating backup of current database...'));
        backupFile = this.createBackup('multisite', workDir);
      }

      console.log(
        chalk.blue(
          '📥 Downloading complete multisite database from S3...'
        )
      );

      const backupFileName = `wfu-local-default-${Date.now()}.sql.gz`;
      const localBackupPath = path.join(workDir, backupFileName);

      const s3Url = 'https://wfu-cer-wordpress-dev-us-east-1.s3.us-east-1.amazonaws.com/wfu-local/wfu-local-default.sql.gz';
      
      try {
        this.runCommand(
          `curl -o "${localBackupPath}" "${s3Url}"`,
          { silent: false }
        );
      } catch (error) {
        return {
          success: false,
          message: `Failed to download initial database: ${error}`,
          error: 'Download failed',
        };
      }

      if (!existsSync(localBackupPath)) {
        return {
          success: false,
          message: 'Initial database download failed - file not found',
          error: 'Download verification failed',
        };
      }

      console.log(chalk.blue('📤 Importing initial database to DDEV...'));

      const ddevProjects = this.ddevManager.getProjects();
      const runningProject = ddevProjects.find((p) => p.status === 'running');
      
      if (!runningProject) {
        return {
          success: false,
          message: 'No running DDEV project found. Start a project first with "wfuwp local start".',
          error: 'No running project',
        };
      }

      const decompressedPath = localBackupPath.replace('.gz', '');
      if (localBackupPath.endsWith('.gz')) {
        this.runCommand(`gunzip -f "${localBackupPath}"`);
      }

      this.runCommand(
        `ddev import-db --file="${decompressedPath}"`,
        { silent: false }
      );

      console.log(
        chalk.green(
          '✅ Initial multisite database imported successfully!'
        )
      );

      if (!options.keepFiles) {
        if (existsSync(decompressedPath)) {
          rmSync(decompressedPath);
        }
        if (existsSync(localBackupPath)) {
          rmSync(localBackupPath);
        }
      }

      return {
        success: true,
        message: 'Initial multisite database setup completed successfully',
        databaseFile: options.keepFiles ? decompressedPath : undefined,
        backupFile: backupFile || undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: `Initial database setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async resetEnvironment(options: ResetOptions): Promise<ResetResult> {
    try {
      const removedItems: string[] = [];

      console.log(
        chalk.red(`🗑️  Resetting local development environment...\n`)
      );

      if (options.deepReset) {
        console.log(chalk.blue(`🛑 Stopping all DDEV projects...`));
        const stopResult = this.ddevManager.stopProject();
        if (stopResult.success) {
          console.log(chalk.green(`✅ All projects stopped`));
        } else {
          console.log(
            chalk.yellow(
              `⚠️ Some projects may still be running: ${stopResult.message}`
            )
          );
        }
        console.log(chalk.blue(`🗑️  Deleting WFU local DDEV project...`));
        try {
          this.runCommand('ddev delete wfu-local -Oy', { silent: false });
          removedItems.push('WFU local DDEV project');
          console.log(chalk.green(`✅ WFU local DDEV project deleted`));
        } catch (error) {
          console.log(
            chalk.yellow(
              `⚠️ Could not delete WFU local project (may not exist): ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
        }
      }

      const workDir = this.defaultWorkDir;
      if (existsSync(workDir)) {
        console.log(chalk.blue(`🧹 Cleaning temporary files...`));
        const files = readdirSync(workDir);
        rmSync(workDir, { recursive: true, force: true });
        removedItems.push(`${files.length} temporary files from ${workDir}`);
        console.log(chalk.green(`✅ Cleaned ${files.length} temporary files`));
      }

      if (options.deepReset) {
        const globalDdevDir = path.join(os.homedir(), '.ddev');
        const globalConfigPath = path.join(globalDdevDir, 'global_config.yaml');

        if (existsSync(globalConfigPath)) {
          console.log(chalk.blue(`🔧 Resetting DDEV global configuration...`));
          try {
            const backupPath = globalConfigPath + '.backup-' + Date.now();
            this.runCommand(`cp "${globalConfigPath}" "${backupPath}"`);
            this.runCommand('ddev config global --auto');
            removedItems.push('DDEV global configuration (backup created)');
            console.log(
              chalk.green(
                `✅ DDEV global config reset (backup: ${path.basename(backupPath)})`
              )
            );
          } catch (error) {
            console.log(
              chalk.yellow(`⚠️ Could not reset DDEV global config: ${error}`)
            );
          }
        }
      }

      if (!options.keepConfig) {
        const hostsManager = await import('./local-hosts-manager');
        const manager = new hostsManager.LocalHostsManager();
        const domains = manager.getCurrentDomains();

        if (domains.length > 0) {
          console.log(
            chalk.blue(
              `🌐 Removing ${domains.length} local development domains...`
            )
          );
          try {
            const removedCount = manager.removeAllDomains();
            removedItems.push(`${removedCount} local development domains`);
            console.log(
              chalk.green(
                `✅ Removed ${removedCount} local development domains`
              )
            );
          } catch (error) {
            console.log(chalk.red(`❌ Failed to remove domains: ${error}`));
            console.log(chalk.dim('You may need to run with sudo privileges'));
          }
        }
      }

      if (options.deepReset) {
        const projectsDir = path.join(os.homedir(), 'wfu-wp-local');
        if (existsSync(projectsDir)) {
          if (!options.force) {
            console.log(
              chalk.red(
                `⚠️ Deep reset would remove workspace directory: ${projectsDir}`
              )
            );
            console.log(
              chalk.red(
                `This contains your local WordPress projects and cannot be undone.`
              )
            );
            console.log(
              chalk.dim(
                `Use --force flag to confirm removal of workspace directory`
              )
            );
            return {
              success: false,
              message:
                'Deep reset cancelled - workspace directory would be removed',
              removedItems,
              error: 'Confirmation required for workspace removal',
            };
          }

          console.log(chalk.blue(`🗂️ Removing workspace directory...`));
          const projects = readdirSync(projectsDir);
          rmSync(projectsDir, { recursive: true, force: true });
          removedItems.push(
            `Workspace directory with ${projects.length} projects`
          );
          console.log(
            chalk.green(
              `✅ Removed workspace directory (${projects.length} projects)`
            )
          );
        }
      }

      console.log(chalk.green(`\n🎉 Environment reset complete!`));

      return {
        success: true,
        message: `Successfully reset local development environment (${removedItems.length} items removed)`,
        removedItems,
      };
    } catch (error) {
      return {
        success: false,
        message: `Environment reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        removedItems: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  performBuildOperations(siteId: string): BuildOperations {
    const operations: string[] = [];
    const errors: string[] = [];

    try {
      const project = this.findProjectForSite(siteId);
      if (!project) {
        return {
          success: false,
          operations,
          errors: [`No DDEV project found for site ${siteId}`],
        };
      }

      console.log(
        chalk.blue(`🔨 Running build operations for ${project.name}...`)
      );

      try {
        console.log(chalk.dim(`Running composer update...`));
        this.runCommand(`ddev composer update`, { cwd: project.location });
        operations.push('Composer dependencies updated');
        console.log(chalk.green(`✅ Composer update completed`));
      } catch (error) {
        const errorMsg = `Composer update failed: ${error}`;
        errors.push(errorMsg);
        console.log(chalk.yellow(`⚠️ ${errorMsg}`));
      }

      try {
        console.log(chalk.dim(`Clearing WordPress cache...`));
        this.runCommand(`ddev wp cache flush`, { cwd: project.location });
        operations.push('WordPress cache cleared');
        console.log(chalk.green(`✅ Cache cleared`));
      } catch (error) {
        const errorMsg = `Cache clear failed: ${error}`;
        errors.push(errorMsg);
        console.log(chalk.yellow(`⚠️ ${errorMsg}`));
      }

      try {
        console.log(chalk.dim(`Updating WordPress database...`));
        this.runCommand(`ddev wp core update-db`, { cwd: project.location });
        operations.push('WordPress database updated');
        console.log(chalk.green(`✅ Database updated`));
      } catch (error) {
        const errorMsg = `Database update failed: ${error}`;
        errors.push(errorMsg);
        console.log(chalk.yellow(`⚠️ ${errorMsg}`));
      }

      const packageJsonPath = path.join(project.location, 'package.json');
      if (existsSync(packageJsonPath)) {
        try {
          console.log(chalk.dim(`Running npm install...`));
          this.runCommand(`ddev npm install`, { cwd: project.location });
          operations.push('NPM dependencies installed');
          console.log(chalk.green(`✅ NPM install completed`));
        } catch (error) {
          const errorMsg = `NPM install failed: ${error}`;
          errors.push(errorMsg);
          console.log(chalk.yellow(`⚠️ ${errorMsg}`));
        }

        try {
          console.log(chalk.dim(`Building frontend assets...`));
          this.runCommand(`ddev npm run build`, { cwd: project.location });
          operations.push('Frontend assets built');
          console.log(chalk.green(`✅ Build completed`));
        } catch (error) {
          const errorMsg = `Build failed: ${error}`;
          errors.push(errorMsg);
          console.log(chalk.yellow(`⚠️ ${errorMsg}`));
        }
      }

      return {
        success: errors.length === 0,
        operations,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        operations,
        errors: [
          `Build operations failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ],
      };
    }
  }

  generateRefreshSummary(options: RefreshOptions, result: RefreshResult): void {
    console.log(chalk.bold('\n📊 Refresh Summary:'));
    console.log(`  ${chalk.cyan('Site ID')}: ${options.siteId}`);
    console.log(
      `  ${chalk.cyan('Source Environment')}: ${options.environment}`
    );
    console.log(
      `  ${chalk.cyan('Status')}: ${result.success ? chalk.green('Success') : chalk.red('Failed')}`
    );

    if (result.backupFile) {
      console.log(
        `  ${chalk.cyan('Backup Created')}: ${chalk.dim(path.basename(result.backupFile))}`
      );
    }

    if (result.databaseFile && options.keepFiles) {
      console.log(
        `  ${chalk.cyan('Database File')}: ${chalk.dim(path.basename(result.databaseFile))}`
      );
    }

    console.log();

    if (result.success) {
      console.log(chalk.green('🎉 Database refresh completed successfully!'));
      console.log(
        chalk.dim(
          'Your local environment now has the latest data from production.'
        )
      );
    } else {
      console.log(chalk.red('❌ Database refresh failed.'));
      if (result.error) {
        console.log(chalk.red(`Error: ${result.error}`));
      }
    }
  }
}
