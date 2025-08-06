#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { syncS3Command } from './commands/syncs3';
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
  .version(packageJson.version);

program.addCommand(syncS3Command);

program
  .command('help')
  .description('Display help information')
  .action(() => {
    console.log(chalk.blue.bold('WFU WordPress CLI Tool'));
    console.log('\nAvailable commands:');
    console.log(chalk.green('  syncs3') + ' - Sync WordPress sites between S3 environments');
    console.log('\nUse "wfuwp <command> --help" for more information about a command.');
  });

program.on('command:*', () => {
  console.error(chalk.red(`Invalid command: ${program.args.join(' ')}`));
  console.log(chalk.yellow('See "wfuwp --help" for available commands.'));
  process.exit(1);
});

if (process.argv.length <= 2) {
  program.help();
}

program.parse(process.argv);