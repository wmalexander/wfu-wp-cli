import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from '../utils/config';

interface CheckResult {
  passed: boolean;
  message: string;
  fix?: string;
}

interface SystemCheck {
  name: string;
  check: () => Promise<CheckResult> | CheckResult;
  required: boolean;
  category: 'prerequisites' | 'configuration' | 'connectivity';
}

async function checkNodeVersion(): Promise<CheckResult> {
  try {
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.split('.')[0].substring(1));
    if (major >= 18) {
      return { passed: true, message: `${nodeVersion} installed` };
    }
    return {
      passed: false,
      message: `${nodeVersion} installed (18+ required)`,
      fix: 'Update Node.js: https://nodejs.org/ or use nvm',
    };
  } catch (error) {
    return {
      passed: false,
      message: 'Unable to check Node.js version',
      fix: 'Install Node.js: https://nodejs.org/',
    };
  }
}

async function checkDocker(): Promise<CheckResult> {
  try {
    const dockerVersion = execSync('docker --version', {
      encoding: 'utf-8',
    }).trim();
    try {
      execSync('docker ps', { encoding: 'utf-8' });
      return { passed: true, message: `${dockerVersion} (running)` };
    } catch {
      return {
        passed: false,
        message: `${dockerVersion} (not running)`,
        fix: 'Start Docker Desktop or run: sudo systemctl start docker',
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: 'Not installed',
      fix: 'Install Docker: https://www.docker.com/products/docker-desktop',
    };
  }
}

async function checkAwsCli(): Promise<CheckResult> {
  try {
    const awsVersion = execSync('aws --version 2>&1', {
      encoding: 'utf-8',
    }).trim();
    try {
      execSync('aws sts get-caller-identity 2>&1', { encoding: 'utf-8' });
      return {
        passed: true,
        message: `${awsVersion.split(' ')[0]} (configured)`,
      };
    } catch {
      return {
        passed: true,
        message: `${awsVersion.split(' ')[0]} (not configured)`,
        fix: 'Configure AWS: aws configure',
      };
    }
  } catch (error) {
    return {
      passed: false,
      message: 'Not installed (optional for S3/EC2 features)',
      fix: 'Install AWS CLI: https://aws.amazon.com/cli/',
    };
  }
}

async function checkMysqlClient(): Promise<CheckResult> {
  try {
    const mysqlVersion = execSync('mysql --version 2>&1', {
      encoding: 'utf-8',
    }).trim();
    return { passed: true, message: `${mysqlVersion.split(',')[0]}` };
  } catch (error) {
    return {
      passed: false,
      message: 'Not installed (optional)',
      fix: 'Install MySQL client: apt-get install default-mysql-client or brew install mysql-client',
    };
  }
}

async function checkConfiguration(): Promise<CheckResult> {
  const configPath = path.join(os.homedir(), '.wfuwp', 'config.json');
  if (!fs.existsSync(configPath)) {
    return {
      passed: false,
      message: 'No configuration file found',
      fix: 'Run: wfuwp config wizard',
    };
  }
  const environments = ['dev', 'uat', 'pprd', 'prod'];
  const configured = environments.filter((env) => {
    try {
      const envConfig = Config.getEnvironmentConfig(env);
      return envConfig.host && envConfig.user && envConfig.database;
    } catch {
      return false;
    }
  });
  if (configured.length === 0) {
    return {
      passed: false,
      message: 'No environments configured',
      fix: 'Run: wfuwp config wizard',
    };
  }
  if (configured.length < environments.length) {
    return {
      passed: true,
      message: `${configured.length}/${environments.length} environments configured (${configured.join(', ')})`,
      fix: `Configure remaining: wfuwp config wizard`,
    };
  }
  return { passed: true, message: 'All environments configured' };
}

async function checkDatabaseConnections(): Promise<CheckResult> {
  const environments = ['dev', 'uat', 'pprd', 'prod'];
  const results: string[] = [];
  let hasFailure = false;
  for (const env of environments) {
    try {
      const envConfig = Config.getEnvironmentConfig(env);
      if (envConfig.host) {
        // Simple connectivity check (can't actually test without Docker running)
        results.push(`${env}: configured`);
      }
    } catch {
      // Environment not configured, skip
    }
  }
  if (results.length === 0) {
    return {
      passed: false,
      message: 'No database connections to test',
      fix: 'Configure environments first: wfuwp config wizard',
    };
  }
  return {
    passed: !hasFailure,
    message: results.join(', '),
    fix: hasFailure
      ? 'Test connections: wfuwp db test <environment>'
      : undefined,
  };
}

async function checkS3Configuration(): Promise<CheckResult> {
  const s3Bucket = Config.get('s3.bucket');
  if (!s3Bucket) {
    return {
      passed: false,
      message: 'Not configured (optional)',
      fix: 'Configure S3: wfuwp config wizard (or set s3.bucket manually)',
    };
  }
  return { passed: true, message: `Bucket: ${s3Bucket}` };
}

async function checkWritePermissions(): Promise<CheckResult> {
  const testPaths = [
    { path: os.homedir(), name: 'Home directory' },
    { path: '/tmp', name: 'Temp directory' },
  ];
  const failed: string[] = [];
  for (const testPath of testPaths) {
    try {
      fs.accessSync(testPath.path, fs.constants.W_OK);
    } catch {
      failed.push(testPath.name);
    }
  }
  if (failed.length > 0) {
    return {
      passed: false,
      message: `No write access to: ${failed.join(', ')}`,
      fix: 'Check directory permissions',
    };
  }
  return { passed: true, message: 'All required directories writable' };
}

export function registerDoctorCommand(program: Command) {
  program
    .command('doctor')
    .description('Check system prerequisites and tool health')
    .option(
      '--category <type>',
      'Check specific category (prerequisites, configuration, connectivity)'
    )
    .option('--fix', 'Show detailed fix instructions')
    .action(async (options) => {
      console.log(chalk.bold('\n🩺 WFU WordPress CLI Health Check\n'));
      console.log('Checking system requirements and configuration...\n');
      const checks: SystemCheck[] = [
        // Prerequisites
        {
          name: 'Node.js 18+',
          check: checkNodeVersion,
          required: true,
          category: 'prerequisites',
        },
        {
          name: 'Docker',
          check: checkDocker,
          required: true,
          category: 'prerequisites',
        },
        {
          name: 'AWS CLI',
          check: checkAwsCli,
          required: false,
          category: 'prerequisites',
        },
        {
          name: 'MySQL Client',
          check: checkMysqlClient,
          required: false,
          category: 'prerequisites',
        },
        {
          name: 'Write Permissions',
          check: checkWritePermissions,
          required: true,
          category: 'prerequisites',
        },
        // Configuration
        {
          name: 'Configuration File',
          check: checkConfiguration,
          required: true,
          category: 'configuration',
        },
        {
          name: 'Database Settings',
          check: checkDatabaseConnections,
          required: false,
          category: 'configuration',
        },
        {
          name: 'S3 Configuration',
          check: checkS3Configuration,
          required: false,
          category: 'configuration',
        },
      ];
      const categories = options.category
        ? [options.category]
        : ['prerequisites', 'configuration', 'connectivity'];
      let hasRequiredFailure = false;
      let hasOptionalFailure = false;
      for (const category of categories) {
        const categoryChecks = checks.filter((c) => c.category === category);
        if (categoryChecks.length === 0) continue;
        console.log(
          chalk.bold(`${category.charAt(0).toUpperCase() + category.slice(1)}:`)
        );
        console.log('─'.repeat(40));
        for (const check of categoryChecks) {
          const result = await check.check();
          const icon = result.passed
            ? chalk.green('✓')
            : check.required
              ? chalk.red('✗')
              : chalk.yellow('⚠');
          const name = check.name.padEnd(20);
          console.log(`${icon} ${name} ${chalk.gray(result.message)}`);
          if (!result.passed) {
            if (check.required) hasRequiredFailure = true;
            else hasOptionalFailure = true;
            if (result.fix && (options.fix || check.required)) {
              console.log(`  ${chalk.cyan('→')} ${result.fix}`);
            }
          }
        }
        console.log();
      }
      // Summary
      console.log('─'.repeat(40));
      if (!hasRequiredFailure && !hasOptionalFailure) {
        console.log(
          chalk.green.bold("✅ All checks passed! You're ready to use wfuwp.\n")
        );
        console.log('Next steps:');
        console.log(
          '  1. View available commands: ' + chalk.cyan('wfuwp --help')
        );
        console.log(
          '  2. Read the guide: ' + chalk.cyan('wfuwp docs getting-started')
        );
        console.log(
          '  3. Try a test migration: ' + chalk.cyan('wfuwp migrate --help')
        );
      } else if (hasRequiredFailure) {
        console.log(
          chalk.red.bold('❌ Required components missing or misconfigured.\n')
        );
        console.log(
          'Please fix the required issues above, then run ' +
            chalk.cyan('wfuwp doctor') +
            ' again.'
        );
        console.log(
          '\nFor detailed setup instructions: ' +
            chalk.cyan('wfuwp docs getting-started')
        );
        process.exit(1);
      } else {
        console.log(
          chalk.yellow.bold(
            '⚠️  Some optional components are not configured.\n'
          )
        );
        console.log(
          'The tool will work, but some features may be unavailable.'
        );
        console.log('For full functionality, address the warnings above.');
        console.log('\nTo get started: ' + chalk.cyan('wfuwp --help'));
      }
    });
}
