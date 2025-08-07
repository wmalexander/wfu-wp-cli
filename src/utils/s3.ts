import { execSync } from 'child_process';
import { basename } from 'path';
import chalk from 'chalk';
import { Config } from './config';

interface MigrationMetadata {
  siteId: string;
  fromEnvironment: string;
  toEnvironment: string;
  timestamp: string;
  sourceExport?: string;
  targetBackup?: string;
  migratedExport?: string;
}

interface S3Result {
  bucket: string;
  path: string;
  files: string[];
}

export class S3Operations {
  static checkAwsCliAvailability(): void {
    try {
      execSync('aws --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error(
        'AWS CLI is not installed or not in PATH. Please install and configure AWS CLI.'
      );
    }
  }

  static async archiveToS3(
    localFiles: string[],
    metadata: MigrationMetadata,
    verbose = false
  ): Promise<S3Result> {
    const s3Config = Config.getS3Config();

    if (!Config.hasRequiredS3Config()) {
      throw new Error(
        'S3 configuration is incomplete. Run "wfuwp config wizard" to set up.'
      );
    }

    this.checkAwsCliAvailability();

    const s3Path = this.getS3Path(
      metadata.siteId,
      metadata.fromEnvironment,
      metadata.toEnvironment,
      metadata.timestamp
    );

    const uploadedFiles: string[] = [];

    for (const localFile of localFiles) {
      if (!require('fs').existsSync(localFile)) {
        console.warn(
          chalk.yellow(`Warning: File not found, skipping: ${localFile}`)
        );
        continue;
      }

      const fileName = basename(localFile);
      const s3FilePath = `${s3Path}${fileName}`;

      const awsCommand = [
        'aws s3 cp',
        `"${localFile}"`,
        `"s3://${s3Config.bucket}/${s3FilePath}"`,
        '--storage-class STANDARD_IA',
      ];

      if (verbose) {
        console.log(chalk.gray(`Uploading to S3: ${fileName}`));
      }

      try {
        execSync(awsCommand.join(' '), {
          encoding: 'utf8',
          stdio: verbose ? 'inherit' : 'ignore',
        });

        uploadedFiles.push(fileName);
      } catch (error) {
        console.error(
          chalk.yellow(
            `Warning: Failed to upload ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        );
      }
    }

    // Create metadata file
    const metadataContent = JSON.stringify(metadata, null, 2);
    const metadataPath = `/tmp/migration-metadata-${metadata.timestamp}.json`;
    require('fs').writeFileSync(metadataPath, metadataContent);

    try {
      const metadataS3Path = `${s3Path}metadata.json`;
      const awsMetadataCommand = [
        'aws s3 cp',
        `"${metadataPath}"`,
        `"s3://${s3Config.bucket}/${metadataS3Path}"`,
      ];

      execSync(awsMetadataCommand.join(' '), { stdio: 'ignore' });
      uploadedFiles.push('metadata.json');

      // Clean up local metadata file
      require('fs').unlinkSync(metadataPath);
    } catch (error) {
      console.warn(chalk.yellow('Warning: Failed to upload metadata file'));
    }

    return {
      bucket: s3Config.bucket!,
      path: s3Path,
      files: uploadedFiles,
    };
  }

  static getS3Path(
    siteId: string,
    from: string,
    to: string,
    timestamp: string
  ): string {
    const s3Config = Config.getS3Config();
    const prefix = s3Config.prefix || 'migrations';

    const datePrefix = timestamp.slice(0, 10); // YYYY-MM-DD
    return `${prefix}/${datePrefix}/${timestamp}/site${siteId}-${from}-to-${to}/`;
  }

  static async listMigrations(siteId?: string): Promise<any[]> {
    const s3Config = Config.getS3Config();

    if (!Config.hasRequiredS3Config()) {
      throw new Error('S3 configuration is incomplete');
    }

    this.checkAwsCliAvailability();

    const prefix = s3Config.prefix || 'migrations';
    const searchPrefix = siteId ? `${prefix}/site${siteId}-` : `${prefix}/`;

    const awsCommand = [
      'aws s3api list-objects-v2',
      `--bucket ${s3Config.bucket}`,
      `--prefix "${searchPrefix}"`,
      '--query "Contents[?Key != \\`${prefix}/\\`].[Key,LastModified,Size]"',
      '--output table',
    ];

    try {
      const output = execSync(awsCommand.join(' '), { encoding: 'utf8' });
      // This is a simplified version - you'd parse the JSON output properly
      console.log(output);
      return [];
    } catch (error) {
      throw new Error(
        `Failed to list S3 migrations: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async downloadMigration(
    migrationPath: string,
    localPath: string,
    verbose = false
  ): Promise<void> {
    const s3Config = Config.getS3Config();

    if (!Config.hasRequiredS3Config()) {
      throw new Error('S3 configuration is incomplete');
    }

    this.checkAwsCliAvailability();

    const awsCommand = [
      'aws s3 cp',
      `"s3://${s3Config.bucket}/${migrationPath}"`,
      `"${localPath}"`,
      '--recursive',
    ];

    if (verbose) {
      console.log(chalk.gray(`Downloading from S3: ${migrationPath}`));
    }

    try {
      execSync(awsCommand.join(' '), {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'ignore',
      });
    } catch (error) {
      throw new Error(
        `S3 download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  static async testS3Access(): Promise<boolean> {
    const s3Config = Config.getS3Config();

    if (!Config.hasRequiredS3Config()) {
      return false;
    }

    try {
      this.checkAwsCliAvailability();

      const awsCommand = [
        'aws s3api head-bucket',
        `--bucket ${s3Config.bucket}`,
      ];

      execSync(awsCommand.join(' '), { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }
}
