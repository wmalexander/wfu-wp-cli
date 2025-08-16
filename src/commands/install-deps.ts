import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';

interface InstallResult {
  success: boolean;
  message: string;
}

function detectOS(): 'amazon-linux' | 'ubuntu' | 'macos' | 'rhel' | 'unknown' {
  const platform = os.platform();
  if (platform === 'darwin') return 'macos';
  if (platform !== 'linux') return 'unknown';
  try {
    if (fs.existsSync('/etc/amazon-linux-release')) {
      return 'amazon-linux';
    }
    if (fs.existsSync('/etc/redhat-release')) {
      const content = fs.readFileSync('/etc/redhat-release', 'utf8');
      if (content.includes('Red Hat')) return 'rhel';
    }
    if (fs.existsSync('/etc/os-release')) {
      const content = fs.readFileSync('/etc/os-release', 'utf8');
      if (content.includes('Amazon Linux')) return 'amazon-linux';
      if (content.includes('Ubuntu')) return 'ubuntu';
      if (content.includes('Red Hat')) return 'rhel';
    }
  } catch (error) {
    // Continue to return unknown
  }
  return 'unknown';
}

function runCommand(command: string, description: string): boolean {
  try {
    console.log(chalk.gray(`  → ${description}`));
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.log(chalk.red(`  ✗ Failed: ${description}`));
    return false;
  }
}

function runCommandWithSudo(command: string, description: string): boolean {
  const needsSudo = process.getuid && process.getuid() !== 0;
  const fullCommand = needsSudo ? `sudo ${command}` : command;
  return runCommand(fullCommand, description);
}

async function installDockerAmazonLinux(): Promise<InstallResult> {
  console.log(chalk.cyan('\n📦 Installing Docker...'));
  const steps = [
    { cmd: 'yum update -y', desc: 'Updating package manager' },
    { cmd: 'yum install -y docker', desc: 'Installing Docker' },
    { cmd: 'systemctl start docker', desc: 'Starting Docker service' },
    { cmd: 'systemctl enable docker', desc: 'Enabling Docker on boot' },
    {
      cmd: 'usermod -a -G docker ec2-user',
      desc: 'Adding user to docker group',
    },
  ];
  for (const step of steps) {
    if (!runCommandWithSudo(step.cmd, step.desc)) {
      return { success: false, message: 'Docker installation failed' };
    }
  }
  return {
    success: true,
    message:
      'Docker installed successfully. You may need to logout and login again for group changes to take effect.',
  };
}

async function installMySQLClientAmazonLinux(): Promise<InstallResult> {
  console.log(chalk.cyan('\n📦 Installing MySQL client...'));
  const steps = [
    {
      cmd: 'yum install -y mariadb',
      desc: 'Installing MariaDB client (MySQL compatible)',
    },
  ];
  for (const step of steps) {
    if (!runCommandWithSudo(step.cmd, step.desc)) {
      return { success: false, message: 'MySQL client installation failed' };
    }
  }
  return { success: true, message: 'MySQL client installed successfully' };
}

async function installDockerUbuntu(): Promise<InstallResult> {
  console.log(chalk.cyan('\n📦 Installing Docker...'));
  const steps = [
    { cmd: 'apt-get update', desc: 'Updating package manager' },
    {
      cmd: 'apt-get install -y apt-transport-https ca-certificates curl software-properties-common',
      desc: 'Installing prerequisites',
    },
    {
      cmd: 'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -',
      desc: 'Adding Docker GPG key',
    },
    {
      cmd: 'add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"',
      desc: 'Adding Docker repository',
    },
    { cmd: 'apt-get update', desc: 'Updating package list' },
    {
      cmd: 'apt-get install -y docker-ce docker-ce-cli containerd.io',
      desc: 'Installing Docker',
    },
    { cmd: 'systemctl start docker', desc: 'Starting Docker service' },
    { cmd: 'systemctl enable docker', desc: 'Enabling Docker on boot' },
    {
      cmd: `usermod -a -G docker ${process.env.USER || 'ubuntu'}`,
      desc: 'Adding user to docker group',
    },
  ];
  for (const step of steps) {
    if (!runCommandWithSudo(step.cmd, step.desc)) {
      return { success: false, message: 'Docker installation failed' };
    }
  }
  return {
    success: true,
    message:
      'Docker installed successfully. You may need to logout and login again for group changes to take effect.',
  };
}

async function installMySQLClientUbuntu(): Promise<InstallResult> {
  console.log(chalk.cyan('\n📦 Installing MySQL client...'));
  const steps = [
    { cmd: 'apt-get update', desc: 'Updating package manager' },
    { cmd: 'apt-get install -y mysql-client', desc: 'Installing MySQL client' },
  ];
  for (const step of steps) {
    if (!runCommandWithSudo(step.cmd, step.desc)) {
      return { success: false, message: 'MySQL client installation failed' };
    }
  }
  return { success: true, message: 'MySQL client installed successfully' };
}

async function installDockerMacOS(): Promise<InstallResult> {
  console.log(chalk.cyan('\n📦 Installing Docker...'));
  console.log(
    chalk.yellow('  ⚠ Docker Desktop must be installed manually on macOS')
  );
  console.log('  Please visit: https://www.docker.com/products/docker-desktop');
  console.log('  Or use Homebrew: brew install --cask docker');
  return { success: false, message: 'Manual installation required for macOS' };
}

async function installMySQLClientMacOS(): Promise<InstallResult> {
  console.log(chalk.cyan('\n📦 Installing MySQL client...'));
  try {
    execSync('which brew', { stdio: 'ignore' });
    if (
      runCommand(
        'brew install mysql-client',
        'Installing MySQL client via Homebrew'
      )
    ) {
      console.log(
        chalk.yellow('\n  ⚠ You may need to add MySQL client to your PATH:')
      );
      console.log(
        '  echo \'export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"\' >> ~/.zshrc'
      );
      console.log('  source ~/.zshrc');
      return { success: true, message: 'MySQL client installed via Homebrew' };
    }
  } catch {
    console.log(chalk.red('  ✗ Homebrew is not installed'));
    console.log('  Install Homebrew first: https://brew.sh');
  }
  return { success: false, message: 'MySQL client installation failed' };
}

async function checkComponent(
  name: string,
  checkCommand: string
): Promise<boolean> {
  try {
    execSync(checkCommand, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function registerInstallDepsCommand(program: Command) {
  program
    .command('install-deps')
    .description('Install required system dependencies (Docker, MySQL client)')
    .option('--docker-only', 'Install only Docker')
    .option('--mysql-only', 'Install only MySQL client')
    .option(
      '--check',
      'Check which dependencies are missing without installing'
    )
    .option('--force', 'Force installation even if already installed')
    .action(async (options) => {
      console.log(chalk.bold('\n🔧 WFU WordPress CLI Dependency Installer\n'));
      const osType = detectOS();
      console.log(`Detected OS: ${chalk.cyan(osType)}`);
      if (osType === 'unknown') {
        console.log(chalk.red('\n❌ Unsupported operating system'));
        console.log('Please install dependencies manually:');
        console.log('  • Docker: https://docs.docker.com/get-docker/');
        console.log(
          '  • MySQL client: Install mysql or mariadb package for your OS'
        );
        process.exit(1);
      }
      // Check current status
      const dockerInstalled = await checkComponent(
        'Docker',
        'docker --version'
      );
      const mysqlInstalled = await checkComponent(
        'MySQL client',
        'mysql --version'
      );
      console.log('\nCurrent status:');
      console.log(
        `  • Docker: ${dockerInstalled ? chalk.green('✓ Installed') : chalk.red('✗ Not installed')}`
      );
      console.log(
        `  • MySQL client: ${mysqlInstalled ? chalk.green('✓ Installed') : chalk.red('✗ Not installed')}`
      );
      if (options.check) {
        if (dockerInstalled && mysqlInstalled) {
          console.log(
            chalk.green('\n✅ All dependencies are already installed!')
          );
        } else {
          console.log(chalk.yellow('\n⚠ Some dependencies are missing.'));
          console.log('Run without --check to install them.');
        }
        process.exit(dockerInstalled && mysqlInstalled ? 0 : 1);
      }
      // Determine what to install
      const installDocker =
        !options.mysqlOnly && (!dockerInstalled || options.force);
      const installMysql =
        !options.dockerOnly && (!mysqlInstalled || options.force);
      if (!installDocker && !installMysql) {
        console.log(
          chalk.green('\n✅ All required dependencies are already installed!')
        );
        console.log('Use --force to reinstall.');
        process.exit(0);
      }
      // Warn about sudo requirements
      if (osType !== 'macos' && process.getuid && process.getuid() !== 0) {
        console.log(
          chalk.yellow('\n⚠ This script may require sudo privileges.')
        );
        console.log('You may be prompted for your password.\n');
      }
      const results: { component: string; result: InstallResult }[] = [];
      // Install Docker if needed
      if (installDocker) {
        let result: InstallResult;
        switch (osType) {
          case 'amazon-linux':
            result = await installDockerAmazonLinux();
            break;
          case 'ubuntu':
            result = await installDockerUbuntu();
            break;
          case 'macos':
            result = await installDockerMacOS();
            break;
          case 'rhel':
            console.log(
              chalk.yellow(
                '\n⚠ RHEL detected. Using Amazon Linux compatible installation.'
              )
            );
            result = await installDockerAmazonLinux();
            break;
          default:
            result = { success: false, message: 'Unsupported OS' };
        }
        results.push({ component: 'Docker', result });
      }
      // Install MySQL client if needed
      if (installMysql) {
        let result: InstallResult;
        switch (osType) {
          case 'amazon-linux':
            result = await installMySQLClientAmazonLinux();
            break;
          case 'ubuntu':
            result = await installMySQLClientUbuntu();
            break;
          case 'macos':
            result = await installMySQLClientMacOS();
            break;
          case 'rhel':
            console.log(
              chalk.yellow(
                '\n⚠ RHEL detected. Using Amazon Linux compatible installation.'
              )
            );
            result = await installMySQLClientAmazonLinux();
            break;
          default:
            result = { success: false, message: 'Unsupported OS' };
        }
        results.push({ component: 'MySQL client', result });
      }
      // Summary
      console.log(chalk.bold('\n📋 Installation Summary:\n'));
      let hasFailure = false;
      for (const { component, result } of results) {
        const icon = result.success ? chalk.green('✓') : chalk.red('✗');
        console.log(`${icon} ${component}: ${result.message}`);
        if (!result.success) hasFailure = true;
      }
      if (!hasFailure) {
        console.log(
          chalk.green('\n✅ All dependencies installed successfully!')
        );
        if (osType !== 'macos') {
          console.log(
            chalk.yellow(
              '\n⚠ Important: You may need to logout and login again for Docker group changes to take effect.'
            )
          );
          console.log('Or run: ' + chalk.cyan('newgrp docker'));
        }
        console.log('\nNext steps:');
        console.log('  1. Verify installation: ' + chalk.cyan('wfuwp doctor'));
        console.log(
          '  2. Configure the tool: ' + chalk.cyan('wfuwp config wizard')
        );
        console.log(
          '  3. Start migrating: ' + chalk.cyan('wfuwp env-migrate --help')
        );
      } else {
        console.log(chalk.red('\n❌ Some installations failed.'));
        console.log(
          'Please check the error messages above and try manual installation if needed.'
        );
        console.log('\nManual installation guides:');
        console.log('  • Docker: https://docs.docker.com/get-docker/');
        console.log(
          '  • MySQL client: Search for "install mysql client [your OS]"'
        );
        process.exit(1);
      }
    });
}
