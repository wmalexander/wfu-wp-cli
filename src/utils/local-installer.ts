import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { DDEVManager, EnvironmentHealth } from './ddev-manager';
import { Config } from './config';

export interface InstallOptions {
  docker?: boolean;
  ddev?: boolean;
  mkcert?: boolean;
  all?: boolean;
  force?: boolean;
}

export interface InstallResult {
  success: boolean;
  installed: string[];
  failed: string[];
  skipped: string[];
  errors: string[];
}

export interface WorkspaceSetupOptions {
  repositoryUrl?: string;
  workspaceDir?: string;
  siteId?: string;
  force?: boolean;
}

export interface DatabaseSetupOptions {
  siteId: string;
  environment: string;
  force?: boolean;
}

export class LocalInstaller {
  private dddevManager: DDEVManager;
  private platform: string;

  constructor() {
    this.dddevManager = new DDEVManager();
    this.platform = os.platform();
  }

  private runCommand(
    command: string,
    options: { silent?: boolean } = {}
  ): string {
    try {
      return execSync(command, {
        encoding: 'utf8',
        stdio: options.silent ? 'pipe' : 'inherit',
      }).trim();
    } catch (error) {
      if (!options.silent) {
        throw error;
      }
      return '';
    }
  }

  private isCommandAvailable(command: string): boolean {
    try {
      const which = this.platform === 'win32' ? 'where' : 'which';
      this.runCommand(`${which} ${command}`, { silent: true });
      return true;
    } catch {
      return false;
    }
  }

  private getHomePath(): string {
    return os.homedir();
  }

  private getWorkspaceDir(): string {
    const homeDir = this.getHomePath();
    return path.join(homeDir, 'wfu-wp-local');
  }

  private isInWordPressRepo(): boolean {
    return existsSync('wp-config-ddev.php');
  }

  async ensureWordPressRepo(): Promise<{ success: boolean; error?: string; cloned?: boolean }> {
    if (this.isInWordPressRepo()) {
      return { success: true, cloned: false };
    }

    console.log(chalk.blue('🔍 WordPress repository not detected in current directory'));
    console.log(chalk.blue('📥 Cloning WFU WordPress repository...'));

    try {
      const repoUrl = 'git@github.com:wakeforestuniversity/app-web-aws-wp.git';
      const targetDir = 'wfu-local';

      if (existsSync(targetDir)) {
        return {
          success: false,
          error: `Directory '${targetDir}' already exists. Please remove it or run from inside the WordPress repository.`
        };
      }

      this.runCommand(`git clone ${repoUrl} ${targetDir}`);
      
      process.chdir(targetDir);
      console.log(chalk.green(`✅ Repository cloned and changed to directory: ${targetDir}`));

      console.log(chalk.blue('📦 Installing WordPress dependencies with Composer...'));
      this.runCommand('composer update');
      console.log(chalk.green('✅ Composer dependencies installed'));

      return { success: true, cloned: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async installDependencies(options: InstallOptions): Promise<InstallResult> {
    const result: InstallResult = {
      success: true,
      installed: [],
      failed: [],
      skipped: [],
      errors: [],
    };

    const health = this.dddevManager.checkEnvironmentHealth();
    const toInstall: string[] = [];

    if (options.all) {
      toInstall.push('docker', 'ddev', 'mkcert');
    } else {
      if (options.docker) toInstall.push('docker');
      if (options.ddev) toInstall.push('ddev');
      if (options.mkcert) toInstall.push('mkcert');
    }

    if (toInstall.length === 0) {
      toInstall.push(...this.getRecommendedInstalls(health));
    }

    for (const dependency of toInstall) {
      try {
        console.log(chalk.blue(`\n📦 Installing ${dependency}...`));

        const installResult = await this.installDependency(
          dependency,
          options.force || false,
          health
        );

        if (installResult.success) {
          if (installResult.skipped) {
            result.skipped.push(dependency);
            console.log(
              chalk.yellow(
                `⚠️  ${dependency} already installed (use --force to reinstall)`
              )
            );
          } else {
            result.installed.push(dependency);
            console.log(chalk.green(`✅ ${dependency} installed successfully`));
          }
        } else {
          result.failed.push(dependency);
          result.errors.push(
            installResult.error || `Failed to install ${dependency}`
          );
          console.log(
            chalk.red(
              `❌ Failed to install ${dependency}: ${installResult.error}`
            )
          );
          result.success = false;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.failed.push(dependency);
        result.errors.push(errorMsg);
        result.success = false;
        console.log(
          chalk.red(`❌ Error installing ${dependency}: ${errorMsg}`)
        );
      }
    }

    return result;
  }

  private getRecommendedInstalls(health: EnvironmentHealth): string[] {
    const recommended: string[] = [];

    if (!health.docker.isInstalled) recommended.push('docker');
    if (!health.ddev.isInstalled) recommended.push('ddev');

    const mkcertDep = health.dependencies.find((dep) => dep.name === 'mkcert');
    if (!mkcertDep?.installed) recommended.push('mkcert');

    return recommended;
  }

  private async installDependency(
    dependency: string,
    force: boolean,
    health: EnvironmentHealth
  ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    switch (dependency) {
      case 'docker':
        return this.installDocker(force, health);
      case 'ddev':
        return this.installDDEV(force, health);
      case 'mkcert':
        return this.installMkcert(force, health);
      default:
        return { success: false, error: `Unknown dependency: ${dependency}` };
    }
  }

  private async installDocker(
    force: boolean,
    health: EnvironmentHealth
  ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    if (health.docker.isInstalled && !force) {
      return { success: true, skipped: true };
    }

    try {
      switch (this.platform) {
        case 'darwin':
          return this.installDockerMacOS();
        case 'linux':
          return this.installDockerLinux();
        case 'win32':
          return this.installDockerWindows();
        default:
          return {
            success: false,
            error: `Unsupported platform: ${this.platform}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async installDockerMacOS(): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.isCommandAvailable('brew')) {
      console.log(chalk.yellow('Installing Homebrew first...'));
      try {
        this.runCommand(
          '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        );
      } catch (error) {
        return {
          success: false,
          error:
            'Failed to install Homebrew. Please install it manually from https://brew.sh',
        };
      }
    }

    try {
      this.runCommand('brew install --cask docker');
      console.log(
        chalk.yellow(
          'Docker Desktop installed. You may need to launch it manually the first time.'
        )
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to install Docker via Homebrew' };
    }
  }

  private async installDockerLinux(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.runCommand('curl -fsSL https://get.docker.com -o get-docker.sh');
      this.runCommand('sh get-docker.sh');
      this.runCommand('sudo usermod -aG docker $USER');

      if (this.isCommandAvailable('systemctl')) {
        this.runCommand('sudo systemctl enable docker');
        this.runCommand('sudo systemctl start docker');
      }

      console.log(
        chalk.yellow(
          'Docker installed. You may need to log out and back in for group changes to take effect.'
        )
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to install Docker on Linux' };
    }
  }

  private async installDockerWindows(): Promise<{
    success: boolean;
    error?: string;
  }> {
    return {
      success: false,
      error:
        'Windows installation requires manual download of Docker Desktop from https://docs.docker.com/desktop/install/windows-install/',
    };
  }

  private async installDDEV(
    force: boolean,
    health: EnvironmentHealth
  ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    if (health.ddev.isInstalled && !force) {
      return { success: true, skipped: true };
    }

    if (!health.docker.isInstalled) {
      return { success: false, error: 'Docker must be installed before DDEV' };
    }

    try {
      switch (this.platform) {
        case 'darwin':
          return this.installDDEVMacOS();
        case 'linux':
          return this.installDDEVLinux();
        case 'win32':
          return this.installDDEVWindows();
        default:
          return {
            success: false,
            error: `Unsupported platform: ${this.platform}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async installDDEVMacOS(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.runCommand('brew install ddev/ddev/ddev');
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to install DDEV via Homebrew' };
    }
  }

  private async installDDEVLinux(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.runCommand(
        'curl -fsSL https://pkg.ddev.com/apt/gpg.key | gpg --dearmor | sudo tee /etc/apt/trusted.gpg.d/ddev.gpg > /dev/null'
      );
      this.runCommand(
        'echo "deb [signed-by=/etc/apt/trusted.gpg.d/ddev.gpg] https://pkg.ddev.com/apt/ * *" | sudo tee /etc/apt/sources.list.d/ddev.list >/dev/null'
      );
      this.runCommand('sudo apt update');
      this.runCommand('sudo apt install -y ddev');
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to install DDEV on Linux' };
    }
  }

  private async installDDEVWindows(): Promise<{
    success: boolean;
    error?: string;
  }> {
    return {
      success: false,
      error:
        'Windows installation requires manual download from https://ddev.readthedocs.io/en/stable/users/install/ddev-installation/',
    };
  }

  private async installMkcert(
    force: boolean,
    health: EnvironmentHealth
  ): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
    const mkcertDep = health.dependencies.find((dep) => dep.name === 'mkcert');
    if (mkcertDep?.installed && !force) {
      return { success: true, skipped: true };
    }

    try {
      switch (this.platform) {
        case 'darwin':
          return this.installMkcertMacOS();
        case 'linux':
          return this.installMkcertLinux();
        case 'win32':
          return this.installMkcertWindows();
        default:
          return {
            success: false,
            error: `Unsupported platform: ${this.platform}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async installMkcertMacOS(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.runCommand('brew install mkcert');
      this.runCommand('mkcert -install');
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to install mkcert via Homebrew' };
    }
  }

  private async installMkcertLinux(): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      this.runCommand(
        'curl -s https://api.github.com/repos/FiloSottile/mkcert/releases/latest | grep "browser_download_url.*linux-amd64" | cut -d : -f 2,3 | tr -d \\" | wget -qi -'
      );
      this.runCommand('sudo mv mkcert-*-linux-amd64 /usr/local/bin/mkcert');
      this.runCommand('sudo chmod +x /usr/local/bin/mkcert');
      this.runCommand('mkcert -install');
      return { success: true };
    } catch (error) {
      return { success: false, error: 'Failed to install mkcert on Linux' };
    }
  }

  private async installMkcertWindows(): Promise<{
    success: boolean;
    error?: string;
  }> {
    return {
      success: false,
      error:
        'Windows installation requires manual download from https://github.com/FiloSottile/mkcert/releases',
    };
  }

  async setupWorkspace(
    options: WorkspaceSetupOptions
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const workspaceDir = options.workspaceDir || this.getWorkspaceDir();

      if (!existsSync(workspaceDir)) {
        console.log(
          chalk.blue(`📁 Creating workspace directory: ${workspaceDir}`)
        );
        mkdirSync(workspaceDir, { recursive: true });
      } else if (!options.force) {
        console.log(
          chalk.yellow(`⚠️  Workspace already exists: ${workspaceDir}`)
        );
        return { success: true };
      }

      if (options.repositoryUrl) {
        console.log(chalk.blue(`🔄 Cloning repository...`));
        const repoDir = path.join(workspaceDir, 'wordpress-site');
        this.runCommand(`git clone ${options.repositoryUrl} "${repoDir}"`);
      }

      console.log(chalk.green(`✅ Workspace setup complete: ${workspaceDir}`));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async setupDatabase(
    options: DatabaseSetupOptions
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const envConfig = Config.getEnvironmentConfig(options.environment);
      if (!envConfig || !envConfig.host) {
        return {
          success: false,
          error: `Environment configuration not found for: ${options.environment}. Run "wfuwp config wizard" first.`,
        };
      }

      console.log(
        chalk.blue(
          `🗄️  Setting up database for site ${options.siteId} from ${options.environment}...`
        )
      );

      const s3Config = Config.getS3Config();
      if (s3Config) {
        const s3Prefix = `backups/${options.environment}/site-${options.siteId}`;
        console.log(
          chalk.dim(
            `Looking for latest backup in S3: ${s3Config.bucket}/${s3Prefix}`
          )
        );

        try {
          const listCommand = `aws s3 ls s3://${s3Config.bucket}/${s3Prefix}/ --recursive | tail -1 | awk '{print $4}'`;
          const latestBackup = this.runCommand(listCommand, { silent: true });

          if (latestBackup) {
            const localBackupPath = path.join(
              this.getWorkspaceDir(),
              'database.sql'
            );
            console.log(chalk.blue(`⬇️  Downloading backup: ${latestBackup}`));
            this.runCommand(
              `aws s3 cp s3://${s3Config.bucket}/${latestBackup} "${localBackupPath}"`
            );

            console.log(
              chalk.green(`✅ Database backup downloaded: ${localBackupPath}`)
            );
            return { success: true };
          } else {
            return {
              success: false,
              error: `No backup found in S3 for site ${options.siteId} in ${options.environment}`,
            };
          }
        } catch (error) {
          return {
            success: false,
            error: `Failed to download from S3: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      } else {
        return {
          success: false,
          error:
            'S3 configuration not found. Database setup requires S3 backup access.',
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  showInstallationGuide(): void {
    console.log(chalk.bold('\n🚀 Local Development Installation Guide\n'));

    console.log(chalk.cyan('Required Dependencies:'));
    console.log('• Docker Desktop - Container runtime for DDEV');
    console.log('• DDEV - Local development environment');
    console.log('• mkcert - SSL certificate generation\n');

    console.log(chalk.cyan('Installation Options:'));
    console.log(
      chalk.green('  wfuwp local install --all       ') +
        chalk.dim('Install all dependencies')
    );
    console.log(
      chalk.green('  wfuwp local install --docker    ') +
        chalk.dim('Install Docker only')
    );
    console.log(
      chalk.green('  wfuwp local install --ddev      ') +
        chalk.dim('Install DDEV only')
    );
    console.log(
      chalk.green('  wfuwp local install --mkcert    ') +
        chalk.dim('Install mkcert only')
    );
    console.log(
      chalk.green('  wfuwp local install --force     ') +
        chalk.dim('Force reinstall existing\n')
    );

    console.log(chalk.cyan('Manual Installation (if automatic fails):'));

    if (this.platform === 'darwin') {
      console.log(
        '• Docker: https://docs.docker.com/desktop/install/mac-install/'
      );
      console.log('• DDEV: brew install ddev/ddev/ddev');
      console.log('• mkcert: brew install mkcert');
    } else if (this.platform === 'linux') {
      console.log('• Docker: https://docs.docker.com/engine/install/');
      console.log(
        '• DDEV: https://ddev.readthedocs.io/en/stable/users/install/ddev-installation/'
      );
      console.log('• mkcert: https://github.com/FiloSottile/mkcert');
    } else {
      console.log(
        '• Docker: https://docs.docker.com/desktop/install/windows-install/'
      );
      console.log(
        '• DDEV: https://ddev.readthedocs.io/en/stable/users/install/ddev-installation/'
      );
      console.log('• mkcert: https://github.com/FiloSottile/mkcert/releases');
    }

    console.log(
      chalk.dim('\nAfter installation, verify with: wfuwp local status')
    );
  }
}
