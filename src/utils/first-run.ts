import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function checkFirstRun(): boolean {
  const configPath = path.join(os.homedir(), '.wfuwp', 'config.json');
  const firstRunFile = path.join(os.homedir(), '.wfuwp', '.first-run-complete');
  // Check if config exists or first-run marker exists
  if (!fs.existsSync(configPath) && !fs.existsSync(firstRunFile)) {
    showWelcomeMessage();
    // Create first-run marker
    const dir = path.dirname(firstRunFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(firstRunFile, new Date().toISOString());
    return true;
  }
  return false;
}

function showWelcomeMessage(): void {
  console.log();
  console.log(chalk.bold.cyan('👋 Welcome to WFU WordPress CLI!'));
  console.log();
  console.log('This tool helps you manage WordPress multisite installations');
  console.log('across different environments (dev, uat, pprd, prod).');
  console.log();
  console.log(chalk.bold('🚀 Quick Start:'));
  console.log();
  console.log('  1. Check prerequisites:');
  console.log('     ' + chalk.cyan('wfuwp doctor'));
  console.log();
  console.log('  2. Configure your environments:');
  console.log('     ' + chalk.cyan('wfuwp config wizard'));
  console.log();
  console.log('  3. Read the getting started guide:');
  console.log('     ' + chalk.cyan('wfuwp docs getting-started'));
  console.log();
  console.log(chalk.bold('📚 Resources:'));
  console.log();
  console.log('  • Quick reference: ' + chalk.cyan('wfuwp docs quick'));
  console.log(
    '  • Troubleshooting: ' + chalk.cyan('wfuwp docs troubleshooting')
  );
  console.log('  • All commands:    ' + chalk.cyan('wfuwp --help'));
  console.log();
  console.log('─'.repeat(50));
  console.log();
}

export function showConfigurationHint(): void {
  const configPath = path.join(os.homedir(), '.wfuwp', 'config.json');
  if (!fs.existsSync(configPath)) {
    console.log();
    console.log(chalk.yellow('⚠️  No configuration found!'));
    console.log();
    console.log('To get started, run: ' + chalk.cyan('wfuwp config wizard'));
    console.log('For help, run: ' + chalk.cyan('wfuwp doctor'));
    console.log();
  }
}
