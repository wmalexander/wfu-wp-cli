#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { syncS3Command } from './commands/syncs3';
import { listIpsCommand } from './commands/listips';
import { sshAwsCommand } from './commands/sshaws';
import { removeHostKeyCommand } from './commands/removehostkey';
import { spoofCommand } from './commands/spoof';
import { unspoofCommand } from './commands/unspoof';
import { configCommand } from './commands/config';
import { dbCommand } from './commands/db';
import { migrateCommand } from './commands/migrate';
import { envMigrateCommand } from './commands/env-migrate';
import { md2wpblockCommand } from './commands/md2wpblock';
import { restoreCommand } from './commands/restore';
import { clickupCommand } from './commands/clickup';
import { localCommand } from './commands/local';
import { registerDoctorCommand } from './commands/doctor';
import { registerDocsCommand } from './commands/docs';
import { checkFirstRun, showConfigurationHint } from './utils/first-run';
import { readFileSync } from 'fs';
import { join } from 'path';

const program = new Command();

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf8')
);

program
  .name('wfuwp')
  .description('CLI tool for WFU WordPress management tasks')
  .version(packageJson.version)
  .addHelpText('after', `
${chalk.bold('📚 Documentation:')}
  Getting Started:  ${chalk.cyan('wfuwp docs getting-started')}
  Quick Reference:  ${chalk.cyan('wfuwp docs quick')}
  Troubleshooting:  ${chalk.cyan('wfuwp docs troubleshooting')}
  All topics:       ${chalk.cyan('wfuwp docs --list')}

${chalk.bold('🩺 System Check:')}
  Check prerequisites:  ${chalk.cyan('wfuwp doctor')}

${chalk.bold('🚀 First Time?')}
  1. Run ${chalk.cyan('wfuwp doctor')} to check requirements
  2. Run ${chalk.cyan('wfuwp config wizard')} to configure
  3. Read ${chalk.cyan('wfuwp docs getting-started')}
`);

// Check for first run
const isFirstRun = checkFirstRun();

program.addCommand(syncS3Command);
program.addCommand(listIpsCommand);
program.addCommand(sshAwsCommand);
program.addCommand(removeHostKeyCommand);
program.addCommand(spoofCommand);
program.addCommand(unspoofCommand);
program.addCommand(configCommand);
program.addCommand(dbCommand);
program.addCommand(migrateCommand);
program.addCommand(envMigrateCommand);
program.addCommand(md2wpblockCommand);
program.addCommand(restoreCommand);
program.addCommand(clickupCommand);
program.addCommand(localCommand);

// Add new commands
registerDoctorCommand(program);
registerDocsCommand(program);

program
  .command('help')
  .description('Display help information')
  .action(() => {
    console.log(chalk.blue.bold('WFU WordPress CLI Tool'));
    console.log('\nAvailable commands:');
    console.log(chalk.green('  doctor') + '      - Check system prerequisites and tool health');
    console.log(chalk.green('  docs') + '        - Browse and search documentation');
    console.log(chalk.green('  syncs3') + '      - Sync WordPress sites between S3 environments');
    console.log(chalk.green('  listips') + '     - List EC2 instance IP addresses for an environment');
    console.log(chalk.green('  sshaws') + '      - SSH into EC2 instances for an environment');
    console.log(chalk.green('  removehostkey') + ' - Remove SSH host keys for EC2 instances in an environment');
    console.log(chalk.green('  spoof') + '       - Spoof DNS for a WFU subdomain by adding to /etc/hosts');
    console.log(chalk.green('  unspoof') + '     - Remove WFU DNS spoofing entries from /etc/hosts');
    console.log(chalk.green('  config') + '      - Manage configuration settings (database credentials)');
    console.log(chalk.green('  db') + '          - Database connection utilities (test, list)');
    console.log(chalk.green('  migrate') + '     - Migrate WordPress multisite database between environments');
    console.log(chalk.green('  env-migrate') + ' - Migrate entire WordPress multisite environment');
    console.log(chalk.green('  md2wpblock') + '  - Convert Markdown files to WordPress block editor HTML');
    console.log(chalk.green('  local') + '       - Manage local development environment (DDEV, domains, setup)');
    console.log('\nUse "wfuwp <command> --help" for more information about a command.');
    console.log('\n' + chalk.bold('📚 Need help?'));
    console.log('  Documentation: ' + chalk.cyan('wfuwp docs'));
    console.log('  System check:  ' + chalk.cyan('wfuwp doctor'));
  });

program.on('command:*', () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(' ')}`));
  console.log(chalk.yellow('See "wfuwp --help" for available commands.'));
  process.exit(1);
});

if (process.argv.length <= 2) {
  // Show configuration hint if no config exists
  if (!isFirstRun) {
    showConfigurationHint();
  }
  program.help();
}

program.parse(process.argv);

