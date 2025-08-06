import { Command } from 'commander';
import { execSync } from 'child_process';
import chalk from 'chalk';
import * as readline from 'readline';

const VALID_ENVIRONMENTS = ['dev', 'stg', 'prop', 'pprd', 'prod'];

interface SyncOptions {
  dryRun?: boolean;
  force?: boolean;
}

function validateEnvironment(env: string): boolean {
  return VALID_ENVIRONMENTS.includes(env.toLowerCase());
}

function validateSiteId(id: string): boolean {
  return /^\d+$/.test(id) && parseInt(id) > 0;
}

function checkAwsCli(): boolean {
  try {
    execSync('aws --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${message} (y/N): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function syncS3(
  siteId: string,
  fromEnv: string,
  toEnv: string,
  options: SyncOptions
): Promise<void> {
  if (!validateSiteId(siteId)) {
    console.error(chalk.red('Error: Site ID must be a positive integer'));
    process.exit(1);
  }

  if (!validateEnvironment(fromEnv)) {
    console.error(chalk.red(`Error: Invalid source environment "${fromEnv}"`));
    console.error(
      chalk.yellow(`Valid environments: ${VALID_ENVIRONMENTS.join(', ')}`)
    );
    process.exit(1);
  }

  if (!validateEnvironment(toEnv)) {
    console.error(
      chalk.red(`Error: Invalid destination environment "${toEnv}"`)
    );
    console.error(
      chalk.yellow(`Valid environments: ${VALID_ENVIRONMENTS.join(', ')}`)
    );
    process.exit(1);
  }

  if (fromEnv === toEnv) {
    console.error(
      chalk.red('Error: Source and destination environments cannot be the same')
    );
    process.exit(1);
  }

  if (!checkAwsCli()) {
    console.error(chalk.red('Error: AWS CLI is not installed or not in PATH'));
    console.error(
      chalk.yellow('Please install the AWS CLI: https://aws.amazon.com/cli/')
    );
    process.exit(1);
  }

  const sourceBucket = `s3://wfu-cer-wordpress-${fromEnv}-us-east-1/sites/${siteId}/`;
  const destBucket = `s3://wfu-cer-wordpress-${toEnv}-us-east-1/sites/${siteId}/`;

  console.log(chalk.blue.bold('WFU WordPress S3 Sync'));
  console.log(`Site ID: ${chalk.green(siteId)}`);
  console.log(`From: ${chalk.green(fromEnv)} → To: ${chalk.green(toEnv)}`);
  console.log(`Source: ${chalk.gray(sourceBucket)}`);
  console.log(`Destination: ${chalk.gray(destBucket)}`);

  if (options.dryRun) {
    console.log(chalk.yellow('\n--- DRY RUN MODE ---'));
    try {
      const dryRunCommand = `aws s3 sync ${sourceBucket} ${destBucket} --dry-run`;
      console.log(chalk.gray(`Command: ${dryRunCommand}`));
      execSync(dryRunCommand, { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red('Error running dry-run sync'));
      process.exit(1);
    }
    return;
  }

  if (!options.force) {
    const shouldProceed = await askConfirmation(
      `This will sync site ${siteId} from ${fromEnv} to ${toEnv}. Continue?`
    );

    if (!shouldProceed) {
      console.log(chalk.yellow('Sync cancelled'));
      return;
    }
  }

  try {
    const syncCommand = `aws s3 sync ${sourceBucket} ${destBucket}`;
    console.log(chalk.blue('\nSyncing...'));
    console.log(chalk.gray(`Command: ${syncCommand}`));

    execSync(syncCommand, { stdio: 'inherit' });
    console.log(chalk.green.bold('\n✓ Sync completed successfully'));
  } catch (error) {
    console.error(chalk.red('\n✗ Sync failed'));
    process.exit(1);
  }
}

export const syncS3Command = new Command('syncs3')
  .description('Sync WordPress site files between S3 environments')
  .argument('<site-id>', 'Site ID (numeric)')
  .argument(
    '<from-env>',
    `Source environment (${VALID_ENVIRONMENTS.join('|')})`
  )
  .argument(
    '<to-env>',
    `Destination environment (${VALID_ENVIRONMENTS.join('|')})`
  )
  .option(
    '-d, --dry-run',
    'Preview what would be synced without making changes'
  )
  .option('-f, --force', 'Skip confirmation prompt')
  .action(
    async (
      siteId: string,
      fromEnv: string,
      toEnv: string,
      options: SyncOptions
    ) => {
      await syncS3(siteId, fromEnv.toLowerCase(), toEnv.toLowerCase(), options);
    }
  )
  .addHelpText(
    'after',
    `
Examples:
  $ wfuwp syncs3 43 prop pprd        # Sync site 43 from prop to pprd
  $ wfuwp syncs3 43 prop pprd -d     # Dry run to preview changes
  $ wfuwp syncs3 43 prop pprd -f     # Force sync without confirmation
`
  );
