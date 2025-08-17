import { Command } from 'commander';
import chalk from 'chalk';
import { S3Operations } from '../utils/s3';
import { Config } from '../utils/config';

interface DownloadLocalOptions {
  list?: boolean;
  id?: string;
  output?: string;
  verbose?: boolean;
}

export const downloadLocalCommand = new Command('download-local')
  .description('Download local database exports from S3')
  .option('--list', 'List available local exports', false)
  .option('--id <export-id>', 'Download specific export by ID')
  .option('--output <path>', 'Output directory for download', './downloads')
  .option('-v, --verbose', 'Show detailed output', false)
  .action(async (options: DownloadLocalOptions) => {
    try {
      if (options.list) {
        await listLocalExports(options);
        return;
      }

      if (options.id) {
        await downloadLocalExport(options.id, options);
        return;
      }

      console.error(
        chalk.red('Please specify either --list or --id <export-id>')
      );
      console.log(chalk.cyan('Usage:'));
      console.log(chalk.white('  wfuwp download-local --list'));
      console.log(chalk.white('  wfuwp download-local --id <export-id>'));
      process.exit(1);
    } catch (error) {
      console.error(
        chalk.red(
          'Download failed: ' +
            (error instanceof Error ? error.message : 'Unknown error')
        )
      );
      process.exit(1);
    }
  });

async function listLocalExports(options: DownloadLocalOptions): Promise<void> {
  console.log(chalk.blue.bold('📋 Available Local Database Exports'));

  if (!Config.hasRequiredS3Config()) {
    console.error(
      chalk.red(
        'S3 configuration is incomplete. Run "wfuwp config wizard" to set up.'
      )
    );
    process.exit(1);
  }

  try {
    const exports = await S3Operations.listLocalExports(options.verbose);

    if (exports.length === 0) {
      console.log(chalk.gray('No local exports found in S3.'));
      console.log(chalk.cyan('Create one with:'));
      console.log(chalk.white('  wfuwp env-migrate prod local --ec2-export'));
      return;
    }

    console.log('');
    exports.forEach((exportItem, index) => {
      const sizeInMB = (exportItem.size / 1024 / 1024).toFixed(2);
      const timeAgo = getTimeAgo(exportItem.lastModified);

      console.log(`${index + 1}. ${chalk.bold(exportItem.id)}`);
      console.log(
        `   ${chalk.cyan('Source:')} ${exportItem.sourceEnvironment}`
      );
      console.log(
        `   ${chalk.cyan('Created:')} ${exportItem.lastModified.toLocaleString()}`
      );
      console.log(`   ${chalk.cyan('Size:')} ${sizeInMB} MB`);
      console.log(`   ${chalk.cyan('Age:')} ${timeAgo}`);
      console.log(`   ${chalk.cyan('File:')} ${exportItem.fileName}`);
      console.log('');
    });

    console.log(
      chalk.cyan('To download an export, use: ') +
        chalk.white('wfuwp download-local --id <export-id>')
    );
  } catch (error) {
    throw new Error(
      `Failed to list exports: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

async function downloadLocalExport(
  exportId: string,
  options: DownloadLocalOptions
): Promise<void> {
  console.log(chalk.blue.bold(`📥 Downloading Local Export: ${exportId}`));

  if (!Config.hasRequiredS3Config()) {
    console.error(
      chalk.red(
        'S3 configuration is incomplete. Run "wfuwp config wizard" to set up.'
      )
    );
    process.exit(1);
  }

  const outputDir = options.output || './downloads';

  if (!require('fs').existsSync(outputDir)) {
    require('fs').mkdirSync(outputDir, { recursive: true });
    if (options.verbose) {
      console.log(chalk.gray(`Created output directory: ${outputDir}`));
    }
  }

  try {
    const downloadedPath = await S3Operations.downloadLocalExport(
      exportId,
      outputDir,
      options.verbose
    );

    console.log(chalk.green('\n🎉 Download completed successfully!'));
    console.log(chalk.cyan('File Details:'));
    console.log(chalk.white(`  Downloaded to: ${downloadedPath}`));

    const stats = require('fs').statSync(downloadedPath);
    console.log(
      chalk.white(`  File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
    );

    console.log(chalk.yellow('\n🚀 Next Steps - Import to ddev:'));
    console.log(chalk.white('1. Navigate to your ddev project directory'));
    console.log(chalk.white('2. Start ddev if not already running:'));
    console.log(chalk.gray('   ddev start'));
    console.log(chalk.white('3. Import the database:'));
    console.log(chalk.gray(`   ddev import-db --file="${downloadedPath}"`));
    console.log(chalk.white('4. Clear any cache if needed:'));
    console.log(chalk.gray('   ddev exec wp cache flush'));

    console.log(chalk.cyan('\n💡 Tips:'));
    console.log(
      chalk.gray('• The database includes search-replace for localhost URLs')
    );
    console.log(
      chalk.gray('• All WordPress sites and network tables are included')
    );
    console.log(
      chalk.gray('• You may need to update wp-config.php for your local setup')
    );

    if (downloadedPath.endsWith('.gz')) {
      console.log(chalk.yellow('\n⚠ Note: File is compressed (.gz)'));
      console.log(
        chalk.gray('ddev import-db will automatically decompress it')
      );
    }
  } catch (error) {
    throw new Error(
      `Failed to download export: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 30) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}
