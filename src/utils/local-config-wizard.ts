import * as readline from 'readline';
import chalk from 'chalk';
import { join, resolve } from 'path';
import { Config } from './config';

export class LocalConfigWizard {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  private async question(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  private validatePath(path: string): boolean {
    try {
      resolve(path);
      return true;
    } catch {
      return false;
    }
  }

  private validatePort(port: string): boolean {
    const num = parseInt(port, 10);
    return !isNaN(num) && num >= 1 && num <= 65535;
  }

  private validateEnvironment(env: string): boolean {
    return ['dev', 'uat', 'pprd', 'prod'].includes(env.toLowerCase());
  }

  private validateBoolean(value: string): boolean {
    return ['true', 'false', 'yes', 'no', 'y', 'n'].includes(
      value.toLowerCase()
    );
  }

  private normalizeBoolean(value: string): boolean {
    const lower = value.toLowerCase();
    return ['true', 'yes', 'y'].includes(lower);
  }

  async runWizard(): Promise<void> {
    try {
      console.log(
        chalk.bold.blue('\n🧙 Local Development Configuration Wizard\n')
      );

      console.log(
        chalk.dim(
          'This wizard will help you configure local development settings.'
        )
      );
      console.log(chalk.dim('Press Ctrl+C at any time to cancel.\n'));

      const existingConfig = Config.getLocalConfig();
      const hasExisting = Config.hasLocalConfig();

      if (hasExisting) {
        console.log(chalk.yellow('📋 Current local configuration found:'));
        console.log(JSON.stringify(existingConfig, null, 2));
        console.log();

        const overwrite = await this.question(
          chalk.cyan(
            'Would you like to overwrite the existing configuration? (y/N): '
          )
        );
        if (
          !this.normalizeBoolean(overwrite) &&
          overwrite.toLowerCase() !== 'y'
        ) {
          console.log(
            chalk.green(
              '\n✅ Configuration wizard cancelled. Existing settings preserved.'
            )
          );
          this.rl.close();
          return;
        }
        console.log();
      }

      const workspaceDir = await this.promptForWorkspaceDir(
        existingConfig.workspaceDir
      );
      const defaultPort = await this.promptForDefaultPort(
        existingConfig.defaultPort
      );
      const defaultEnvironment = await this.promptForDefaultEnvironment(
        existingConfig.defaultEnvironment
      );
      const autoStart = await this.promptForAutoStart(existingConfig.autoStart);
      const backupBeforeRefresh = await this.promptForBackupBeforeRefresh(
        existingConfig.backupBeforeRefresh
      );

      console.log(chalk.bold.yellow('\n📝 Configuration Summary:'));
      console.log(`  ${chalk.cyan('Workspace Directory')}: ${workspaceDir}`);
      console.log(`  ${chalk.cyan('Default Port')}: ${defaultPort}`);
      console.log(
        `  ${chalk.cyan('Default Environment')}: ${defaultEnvironment}`
      );
      console.log(`  ${chalk.cyan('Auto Start')}: ${autoStart ? 'Yes' : 'No'}`);
      console.log(
        `  ${chalk.cyan('Backup Before Refresh')}: ${backupBeforeRefresh ? 'Yes' : 'No'}`
      );
      console.log();

      const confirm = await this.question(
        chalk.green('Save this configuration? (Y/n): ')
      );

      if (confirm.toLowerCase() === 'n' || confirm.toLowerCase() === 'no') {
        console.log(chalk.yellow('\n⏹️  Configuration not saved.'));
        this.rl.close();
        return;
      }

      Config.set('local.workspaceDir', workspaceDir);
      Config.set('local.defaultPort', defaultPort.toString());
      Config.set('local.defaultEnvironment', defaultEnvironment);
      Config.set('local.autoStart', autoStart.toString());
      Config.set('local.backupBeforeRefresh', backupBeforeRefresh.toString());

      console.log(
        chalk.bold.green(
          '\n✅ Local development configuration saved successfully!'
        )
      );
      console.log(chalk.dim('\nYou can modify these settings anytime with:'));
      console.log(chalk.green('  wfuwp local config set <key> <value>'));
      console.log(chalk.green('  wfuwp local config list'));
      console.log(chalk.green('  wfuwp local config wizard'));

      this.rl.close();
    } catch (error) {
      console.error(chalk.red('\n❌ Configuration wizard failed:'), error);
      this.rl.close();
      throw error;
    }
  }

  private async promptForWorkspaceDir(current?: string): Promise<string> {
    const defaultDir = current || join(require('os').homedir(), 'wfu-wp-local');

    console.log(chalk.cyan('📁 Workspace Directory'));
    console.log(
      chalk.dim('  Where should local WordPress projects be stored?')
    );
    if (current) {
      console.log(chalk.dim(`  Current: ${current}`));
    }
    console.log(chalk.dim(`  Default: ${defaultDir}`));

    let workspaceDir: string;
    let attempts = 0;
    while (attempts < 5) {
      const input = await this.question(
        chalk.yellow(`  Enter path (or press Enter for default): `)
      );
      workspaceDir = input.trim() || defaultDir;

      if (this.validatePath(workspaceDir)) {
        workspaceDir = resolve(workspaceDir);
        break;
      }
      console.log(
        chalk.red('  ❌ Invalid path. Please enter a valid directory path.')
      );
      attempts++;
    }
    if (attempts >= 5) {
      workspaceDir = resolve(defaultDir);
      console.log(chalk.yellow(`  Using default: ${workspaceDir}`));
    }

    console.log(chalk.green(`  ✅ Workspace directory: ${workspaceDir}\n`));
    return workspaceDir;
  }

  private async promptForDefaultPort(current?: number): Promise<number> {
    const defaultPort = current || 8080;

    console.log(chalk.cyan('🌐 Default Port'));
    console.log(chalk.dim('  Default port for new local development sites'));
    if (current) {
      console.log(chalk.dim(`  Current: ${current}`));
    }
    console.log(chalk.dim(`  Default: ${defaultPort}`));

    let port: number;
    let attempts = 0;
    while (attempts < 5) {
      const input = await this.question(
        chalk.yellow(`  Enter port (or press Enter for default): `)
      );
      const portInput = input.trim() || defaultPort.toString();

      if (this.validatePort(portInput)) {
        port = parseInt(portInput, 10);
        break;
      }
      console.log(
        chalk.red(
          '  ❌ Invalid port. Please enter a number between 1 and 65535.'
        )
      );
      attempts++;
    }
    if (attempts >= 5) {
      port = defaultPort;
      console.log(chalk.yellow(`  Using default: ${port}`));
    }

    console.log(chalk.green(`  ✅ Default port: ${port}\n`));
    return port;
  }

  private async promptForDefaultEnvironment(current?: string): Promise<string> {
    const defaultEnv = current || 'prod';

    console.log(chalk.cyan('🌍 Default Source Environment'));
    console.log(
      chalk.dim(
        '  Which environment should be used by default for database refresh?'
      )
    );
    if (current) {
      console.log(chalk.dim(`  Current: ${current}`));
    }
    console.log(chalk.dim(`  Options: dev, uat, pprd, prod`));
    console.log(chalk.dim(`  Default: ${defaultEnv}`));

    let environment: string;
    let attempts = 0;
    while (attempts < 5) {
      const input = await this.question(
        chalk.yellow(`  Enter environment (or press Enter for default): `)
      );
      environment = (input.trim() || defaultEnv).toLowerCase();

      if (this.validateEnvironment(environment)) {
        break;
      }
      console.log(
        chalk.red('  ❌ Invalid environment. Choose from: dev, uat, pprd, prod')
      );
      attempts++;
    }
    if (attempts >= 5) {
      environment = defaultEnv;
      console.log(chalk.yellow(`  Using default: ${environment}`));
    }

    console.log(chalk.green(`  ✅ Default environment: ${environment}\n`));
    return environment;
  }

  private async promptForAutoStart(current?: boolean): Promise<boolean> {
    const defaultValue = current !== undefined ? current : true;

    console.log(chalk.cyan('🚀 Auto Start'));
    console.log(
      chalk.dim(
        '  Should DDEV projects start automatically when using local commands?'
      )
    );
    if (current !== undefined) {
      console.log(chalk.dim(`  Current: ${current ? 'Yes' : 'No'}`));
    }
    console.log(chalk.dim(`  Default: ${defaultValue ? 'Yes' : 'No'}`));

    let autoStart: boolean;
    let attempts = 0;
    while (attempts < 5) {
      const input = await this.question(
        chalk.yellow(`  Auto start projects? (Y/n): `)
      );
      const autoStartInput = input.trim() || (defaultValue ? 'yes' : 'no');

      if (this.validateBoolean(autoStartInput)) {
        autoStart = this.normalizeBoolean(autoStartInput);
        break;
      }
      console.log(
        chalk.red(
          '  ❌ Invalid input. Please enter yes/no, true/false, or y/n.'
        )
      );
      attempts++;
    }
    if (attempts >= 5) {
      autoStart = defaultValue;
      console.log(chalk.yellow(`  Using default: ${autoStart ? 'Yes' : 'No'}`));
    }

    console.log(chalk.green(`  ✅ Auto start: ${autoStart ? 'Yes' : 'No'}\n`));
    return autoStart;
  }

  private async promptForBackupBeforeRefresh(
    current?: boolean
  ): Promise<boolean> {
    const defaultValue = current !== undefined ? current : true;

    console.log(chalk.cyan('💾 Backup Before Refresh'));
    console.log(
      chalk.dim(
        '  Should databases be backed up automatically before refresh operations?'
      )
    );
    if (current !== undefined) {
      console.log(chalk.dim(`  Current: ${current ? 'Yes' : 'No'}`));
    }
    console.log(chalk.dim(`  Default: ${defaultValue ? 'Yes' : 'No'}`));

    let backup: boolean;
    let attempts = 0;
    while (attempts < 5) {
      const input = await this.question(
        chalk.yellow(`  Backup before refresh? (Y/n): `)
      );
      const backupInput = input.trim() || (defaultValue ? 'yes' : 'no');

      if (this.validateBoolean(backupInput)) {
        backup = this.normalizeBoolean(backupInput);
        break;
      }
      console.log(
        chalk.red(
          '  ❌ Invalid input. Please enter yes/no, true/false, or y/n.'
        )
      );
      attempts++;
    }
    if (attempts >= 5) {
      backup = defaultValue;
      console.log(chalk.yellow(`  Using default: ${backup ? 'Yes' : 'No'}`));
    }

    console.log(
      chalk.green(`  ✅ Backup before refresh: ${backup ? 'Yes' : 'No'}\n`)
    );
    return backup;
  }
}
