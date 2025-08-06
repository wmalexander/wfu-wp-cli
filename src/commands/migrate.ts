import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { Config } from '../utils/config';

interface MigrateOptions {
  from: string;
  to: string;
  dryRun?: boolean;
  force?: boolean;
  verbose?: boolean;
  homepage?: boolean;
  customDomain?: string;
  logDir?: string;
}

interface EnvironmentMapping {
  urlReplacements: Array<{ from: string; to: string }>;
  s3Replacements: Array<{ from: string; to: string }>;
}

export const migrateCommand = new Command('migrate')
  .description('Migrate WordPress multisite database between environments')
  .argument('<site-id>', 'Numeric site identifier (e.g., 43)')
  .requiredOption('--from <env>', 'Source environment (dev, uat, pprd, prod)')
  .requiredOption('--to <env>', 'Target environment (dev, uat, pprd, prod)')
  .option('--dry-run', 'Preview changes without executing', false)
  .option('-f, --force', 'Skip confirmation prompts', false)
  .option('-v, --verbose', 'Show detailed output', false)
  .option('--homepage', 'Include homepage tables (default: exclude)', false)
  .option(
    '--custom-domain <mapping>',
    'Custom domain replacement (format: source:target)'
  )
  .option('--log-dir <path>', 'Custom log directory', './logs')
  .action(async (siteId: string, options: MigrateOptions) => {
    try {
      await runMigration(siteId, options);
    } catch (error) {
      console.error(
        chalk.red(
          `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

async function runMigration(
  siteId: string,
  options: MigrateOptions
): Promise<void> {
  validateInputs(siteId, options);

  const dbConfig = Config.getDbConfig();
  if (!Config.hasRequiredDbConfig()) {
    console.error(
      chalk.red(
        'Database configuration incomplete. Please set up database connection:'
      )
    );
    console.log(chalk.yellow('  wfuwp config set db.host <hostname>'));
    console.log(chalk.yellow('  wfuwp config set db.user <username>'));
    console.log(chalk.yellow('  wfuwp config set db.password <password>'));
    console.log(chalk.yellow('  wfuwp config set db.name <database-name>'));
    process.exit(1);
  }

  checkWpCliAvailability();

  const environmentMapping = getEnvironmentMapping(options.from, options.to);
  const skipTables = getSkipTables(options.homepage || false);
  const logFile = setupLogging(options.logDir || './logs');

  console.log(chalk.blue.bold(`Starting migration for site ${siteId}`));
  console.log(chalk.cyan(`Source: ${options.from} → Target: ${options.to}`));

  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN MODE - No changes will be made'));
  }

  if (!options.force && !options.dryRun) {
    const confirmation = await confirmMigration(
      siteId,
      options.from,
      options.to
    );
    if (!confirmation) {
      console.log(chalk.yellow('Migration cancelled'));
      return;
    }
  }

  console.log(chalk.green('Executing migration...'));

  for (const replacement of environmentMapping.urlReplacements) {
    await executeWpCliCommand(
      'search-replace',
      [replacement.from, replacement.to],
      {
        skipTables,
        dbConfig,
        logFile,
        dryRun: options.dryRun,
        verbose: options.verbose,
      }
    );
  }

  for (const replacement of environmentMapping.s3Replacements) {
    await executeWpCliCommand(
      'search-replace',
      [replacement.from, replacement.to],
      {
        skipTables,
        dbConfig,
        logFile,
        dryRun: options.dryRun,
        verbose: options.verbose,
      }
    );
  }

  if (options.customDomain) {
    const [sourceDomain, targetDomain] = options.customDomain.split(':');
    if (!sourceDomain || !targetDomain) {
      throw new Error('Custom domain must be in format: source:target');
    }

    await executeWpCliCommand('search-replace', [sourceDomain, targetDomain], {
      skipTables,
      dbConfig,
      logFile,
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
  }

  if (options.dryRun) {
    console.log(chalk.green('✓ Dry run completed - see log for details'));
  } else {
    console.log(chalk.green('✓ Migration completed successfully'));
  }

  console.log(chalk.blue(`Log file: ${logFile}`));
}

function validateInputs(siteId: string, options: MigrateOptions): void {
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum) || siteIdNum <= 0) {
    throw new Error('Site ID must be a positive integer');
  }

  const validEnvs = ['dev', 'uat', 'pprd', 'prod'];
  if (!validEnvs.includes(options.from)) {
    throw new Error(
      `Invalid source environment. Must be one of: ${validEnvs.join(', ')}`
    );
  }

  if (!validEnvs.includes(options.to)) {
    throw new Error(
      `Invalid target environment. Must be one of: ${validEnvs.join(', ')}`
    );
  }

  if (options.from === options.to) {
    throw new Error('Source and target environments cannot be the same');
  }
}

function checkWpCliAvailability(): void {
  try {
    execSync('wp --version', { stdio: 'ignore' });
  } catch (error) {
    throw new Error(
      'WP-CLI is not installed or not in PATH. Please install WP-CLI: https://wp-cli.org/'
    );
  }
}

function getEnvironmentMapping(from: string, to: string): EnvironmentMapping {
  const mappings: Record<string, EnvironmentMapping> = {
    'prod->pprd': {
      urlReplacements: [
        { from: '.wfu.edu', to: '.pprd.wfu.edu' },
        { from: '.pprd.pprd.wfu.edu', to: '.pprd.wfu.edu' },
        { from: 'www.pprd.wfu.edu', to: 'pprd.wfu.edu' },
        { from: 'aws.pprd.wfu.edu', to: 'aws.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-prod-us', to: 'wordpress-pprd-us' },
        { from: 'prod.wp.cdn.aws.wfu.edu', to: 'pprd.wp.cdn.aws.wfu.edu' },
      ],
    },
    'pprd->prod': {
      urlReplacements: [
        { from: '.pprd.wfu.edu', to: '.wfu.edu' },
        { from: 'pprd.wfu.edu', to: 'www.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-pprd-us', to: 'wordpress-prod-us' },
        { from: 'pprd.wp.cdn.aws.wfu.edu', to: 'prod.wp.cdn.aws.wfu.edu' },
      ],
    },
    'uat->dev': {
      urlReplacements: [
        { from: '.uat.wfu.edu', to: '.dev.wfu.edu' },
        { from: 'uat.wfu.edu', to: 'dev.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-uat-us', to: 'wordpress-dev-us' },
        { from: 'uat.wp.cdn.aws.wfu.edu', to: 'dev.wp.cdn.aws.wfu.edu' },
      ],
    },
    'dev->uat': {
      urlReplacements: [
        { from: '.dev.wfu.edu', to: '.uat.wfu.edu' },
        { from: 'dev.wfu.edu', to: 'uat.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-dev-us', to: 'wordpress-uat-us' },
        { from: 'dev.wp.cdn.aws.wfu.edu', to: 'uat.wp.cdn.aws.wfu.edu' },
      ],
    },
  };

  const key = `${from}->${to}`;
  if (!mappings[key]) {
    throw new Error(`Migration path ${from} -> ${to} is not supported`);
  }

  return mappings[key];
}

function getSkipTables(includeHomepage: boolean): string {
  const baseTables =
    'wp_blogmeta,wp_blogs,wp_registration_log,wp_signups,wp_site,wp_sitemeta,wp_usermeta,wp_users';

  if (includeHomepage) {
    return baseTables;
  }

  return (
    baseTables +
    ',wp_commentmeta,wp_comments,wp_links,wp_options,wp_postmeta,wp_posts,wp_term_relationships,wp_term_taxonomy,wp_termmeta,wp_terms'
  );
}

function setupLogging(logDir: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logPath = join(logDir, `wpcli-migrate-${timestamp}`);

  if (!existsSync(logPath)) {
    mkdirSync(logPath, { recursive: true });
  }

  return join(logPath, 'migration.log');
}

async function confirmMigration(
  siteId: string,
  from: string,
  to: string
): Promise<boolean> {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    readline.question(
      chalk.yellow(
        `Are you sure you want to migrate site ${siteId} from ${from} to ${to}? (y/N): `
      ),
      (answer: string) => {
        readline.close();
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
      }
    );
  });
}

async function executeWpCliCommand(
  command: string,
  args: string[],
  options: {
    skipTables: string;
    dbConfig: any;
    logFile: string;
    dryRun?: boolean;
    verbose?: boolean;
  }
): Promise<void> {
  const wpCommand = [
    'wp',
    command,
    ...args,
    '--all-tables',
    `--skip-tables=${options.skipTables}`,
    `--dbhost=${options.dbConfig.host}`,
    `--dbuser=${options.dbConfig.user}`,
    `--dbpass=${options.dbConfig.password}`,
    `--dbname=${options.dbConfig.name}`,
    `--log=${options.logFile}`,
  ];

  if (options.dryRun) {
    wpCommand.push('--dry-run');
  }

  const commandString = wpCommand.join(' ');

  if (options.verbose) {
    console.log(
      chalk.gray(
        `Executing: ${commandString.replace(/--dbpass=[^ ]+/, '--dbpass=****')}`
      )
    );
  }

  try {
    const output = execSync(commandString, {
      encoding: 'utf8',
      stdio: options.verbose ? 'inherit' : 'pipe',
    });

    if (!options.verbose && output) {
      console.log(output);
    }
  } catch (error) {
    throw new Error(
      `WP-CLI command failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
