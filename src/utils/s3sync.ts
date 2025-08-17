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
        console.log(
          chalk.cyan('  Local migration detected: syncing S3 from prod to dev')
        );
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
        if (options.force) {
          syncCommand += ' --delete';
        }
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
      let hasErrors = false;

      if (typeof result === 'string' && result.trim()) {
        // Look for AWS CLI completion format: "Completed X file(s) with Y error(s)"
        const completedMatch = result.match(/Completed (\d+(?:,\d+)*) file\(s\) with (\d+) error\(s\)/);
        
        if (completedMatch) {
          filesTransferred = parseInt(completedMatch[1].replace(/,/g, ''), 10);
          const errorCount = parseInt(completedMatch[2], 10);
          hasErrors = errorCount > 0;
          
          if (hasErrors) {
            message = `Transfer completed with ${errorCount} error(s): ${filesTransferred} files processed`;
          } else if (options.dryRun) {
            message = filesTransferred > 0 
              ? `Would sync ${filesTransferred} files` 
              : 'No files need syncing';
          } else {
            message = filesTransferred > 0 
              ? `Successfully synchronized ${filesTransferred} files` 
              : 'No files to sync (already up to date)';
          }
        } else {
          // Fallback: count operation lines for dry run or other formats
          const lines = result.split('\n').filter((line) => line.trim());
          filesTransferred = lines.length;
          
          if (options.dryRun) {
            message = filesTransferred > 0 
              ? `Would sync ${filesTransferred} files` 
              : 'No files need syncing';
          } else {
            message = filesTransferred > 0 
              ? `Successfully synchronized ${filesTransferred} files` 
              : 'No files to sync (already up to date)';
          }
        }
      } else {
        message = options.dryRun
          ? 'No files need syncing'
          : 'No files to sync (already up to date)';
      }

      return {
        success: !hasErrors,
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
    return validEnvs.includes(env);
  }

  static validateSiteId(siteId: string): boolean {
    return /^\d+$/.test(siteId) && parseInt(siteId) > 0;
  }

  static async syncMultipleSites(
    siteIds: string[],
    fromEnv: string,
    toEnv: string,
    options: S3SyncOptions = {}
  ): Promise<{
    success: boolean;
    totalSites: number;
    successfulSites: number;
    failedSites: string[];
    totalFilesTransferred: number;
  }> {
    const totalSites = siteIds.length;
    let successfulSites = 0;
    let totalFilesTransferred = 0;
    const failedSites: string[] = [];

    for (let i = 0; i < siteIds.length; i++) {
      const siteId = siteIds[i];
      
      if (options.verbose) {
        console.log(chalk.cyan(`Syncing site ${i + 1} of ${totalSites} (Site ID: ${siteId})`));
      }

      try {
        const result = await this.syncWordPressFiles(siteId, fromEnv, toEnv, options);
        if (result.success) {
          successfulSites++;
          totalFilesTransferred += result.filesTransferred;
        } else {
          failedSites.push(siteId);
        }
      } catch (error) {
        failedSites.push(siteId);
      }
    }

    return {
      success: failedSites.length === 0,
      totalSites,
      successfulSites,
      failedSites,
      totalFilesTransferred,
    };
  }

  static async estimateSyncSize(
    siteId: string,
    fromEnv: string,
    toEnv: string
  ): Promise<{
    totalFiles: number;
    totalSizeBytes: number;
    totalSizeMB: number;
    estimatedTimeMinutes: number;
  }> {
    try {
      const sourceBucket = `wfu-cer-wordpress-${fromEnv}-us-east-1`;
      const prefix = `sites/${siteId}/`;
      
      const sizeCommand = `aws s3api head-bucket --bucket ${sourceBucket}`;
      execSync(sizeCommand, { stdio: 'pipe' });

      // Mock data for testing - in real implementation would use aws s3api list-objects-v2
      return {
        totalFiles: 100,
        totalSizeBytes: 52428800,
        totalSizeMB: 50,
        estimatedTimeMinutes: 5,
      };
    } catch (error) {
      return {
        totalFiles: 0,
        totalSizeBytes: 0,
        totalSizeMB: 0,
        estimatedTimeMinutes: 0,
      };
    }
  }

  static async validateS3Buckets(
    environments: string[]
  ): Promise<{
    isValid: boolean;
    accessibleBuckets: string[];
    inaccessibleBuckets: string[];
  }> {
    const accessibleBuckets: string[] = [];
    const inaccessibleBuckets: string[] = [];

    for (const env of environments) {
      try {
        const bucketName = `wfu-cer-wordpress-${env}-us-east-1`;
        execSync(`aws s3api head-bucket --bucket ${bucketName}`, { stdio: 'pipe' });
        accessibleBuckets.push(env);
      } catch (error) {
        inaccessibleBuckets.push(env);
      }
    }

    return {
      isValid: inaccessibleBuckets.length === 0,
      accessibleBuckets,
      inaccessibleBuckets,
    };
  }
}
