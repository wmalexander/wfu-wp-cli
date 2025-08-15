import { execSync } from 'child_process';
import chalk from 'chalk';

export interface S3SyncOptions {
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
}

export interface S3SyncResult {
  success: boolean;
  filesTransferred: number;
  message: string;
}

export class S3Sync {
  static checkAwsCli(): boolean {
    try {
      execSync('aws --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  static async syncWordPressFiles(
    siteId: string,
    fromEnv: string,
    toEnv: string,
    options: S3SyncOptions = {}
  ): Promise<S3SyncResult> {
    // Special case: for prod→local migrations, sync S3 from prod to dev
    let actualToEnv = toEnv;
    if (toEnv === 'local' && fromEnv === 'prod') {
      actualToEnv = 'dev';
      if (options.verbose) {
        console.log(chalk.cyan('  Local migration detected: syncing S3 from prod to dev'));
      }
    }
    
    const sourceBucket = `s3://wfu-cer-wordpress-${fromEnv}-us-east-1/sites/${siteId}/`;
    const destBucket = `s3://wfu-cer-wordpress-${actualToEnv}-us-east-1/sites/${siteId}/`;

    if (options.verbose) {
      console.log(chalk.blue('WordPress Files S3 Sync'));
      console.log(`  Site ID: ${chalk.green(siteId)}`);
      console.log(
        `  Direction: ${chalk.green(fromEnv)} → ${chalk.green(toEnv)}${actualToEnv !== toEnv ? ` (S3: ${actualToEnv})` : ''}`
      );
      console.log(`  Source: ${chalk.gray(sourceBucket)}`);
      console.log(`  Destination: ${chalk.gray(destBucket)}`);
    }

    try {
      let syncCommand: string;
      let stdio: 'inherit' | 'pipe';

      if (options.dryRun) {
        syncCommand = `aws s3 sync ${sourceBucket} ${destBucket} --dryrun`;
        stdio = options.verbose ? 'inherit' : 'pipe';

        if (options.verbose) {
          console.log(chalk.yellow('  Running in DRY RUN mode...'));
          console.log(chalk.gray(`  Command: ${syncCommand}`));
        }
      } else {
        syncCommand = `aws s3 sync ${sourceBucket} ${destBucket}`;
        stdio = options.verbose ? 'inherit' : 'pipe';

        if (options.verbose) {
          console.log(chalk.blue('  Syncing WordPress files...'));
          console.log(chalk.gray(`  Command: ${syncCommand}`));
        }
      }

      const result = execSync(syncCommand, {
        stdio,
        encoding: 'utf8',
      });

      // Parse result to count files
      let filesTransferred = 0;
      let message = '';

      if (typeof result === 'string' && result.trim()) {
        const lines = result.split('\n').filter((line) => line.trim());
        filesTransferred = lines.length;

        if (options.dryRun) {
          message =
            filesTransferred > 0
              ? `Would sync ${filesTransferred} files`
              : 'No files need syncing';
        } else {
          message =
            filesTransferred > 0
              ? `Synced ${filesTransferred} files`
              : 'No files to sync (already up to date)';
        }
      } else {
        message = options.dryRun
          ? 'No files need syncing'
          : 'No files to sync (already up to date)';
      }

      return {
        success: true,
        filesTransferred,
        message,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        filesTransferred: 0,
        message: `S3 sync failed: ${errorMessage}`,
      };
    }
  }

  static validateEnvironment(env: string): boolean {
    const validEnvs = ['dev', 'uat', 'pprd', 'prod', 'local'];
    return validEnvs.includes(env.toLowerCase());
  }

  static validateSiteId(siteId: string): boolean {
    return /^\d+$/.test(siteId) && parseInt(siteId) > 0;
  }
}
