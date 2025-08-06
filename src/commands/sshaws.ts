import { Command } from 'commander';
import { execSync, spawn } from 'child_process';
import chalk from 'chalk';
import * as readline from 'readline';
import { existsSync } from 'fs';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'pprd', 'prod'];

interface SshAwsOptions {
  all?: boolean;
  list?: boolean;
  key?: string;
  user?: string;
  'dry-run'?: boolean;
}

interface EC2Instance {
  privateIp?: string;
  publicIp?: string;
  instanceId: string;
  state: string;
}

function validateEnvironment(env: string): boolean {
  return VALID_ENVIRONMENTS.includes(env.toLowerCase());
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

async function getEC2Instances(environment: string): Promise<EC2Instance[]> {
  try {
    const environmentName = `wordpress-${environment}`;
    const query =
      'Reservations[].Instances[].[PrivateIpAddress,PublicIpAddress,InstanceId,State.Name]';

    const result = execSync(
      `aws ec2 describe-instances --filters "Name=tag:elasticbeanstalk:environment-name,Values=[\\"${environmentName}\\"]" --query '${query}' --output json`,
      { encoding: 'utf8' }
    );

    const instances = JSON.parse(result);
    return instances
      .filter((instance: any[]) => instance[3] === 'running') // Only running instances
      .map((instance: any[]) => ({
        privateIp: instance[0] || undefined,
        publicIp: instance[1] || undefined,
        instanceId: instance[2],
        state: instance[3],
      }));
  } catch (error) {
    throw new Error(`Failed to query EC2 instances: ${error}`);
  }
}

function buildSshCommand(
  ip: string,
  user: string,
  keyPath?: string
): { command: string; args: string[] } {
  const args = [];

  // Use WFU_AIT as default key if no key specified and it exists
  const defaultKeyPath = `${process.env.HOME}/.ssh/WFU_AIT`;
  const finalKeyPath =
    keyPath || (existsSync(defaultKeyPath) ? defaultKeyPath : undefined);

  if (finalKeyPath) {
    if (!existsSync(finalKeyPath)) {
      throw new Error(`SSH key file not found: ${finalKeyPath}`);
    }
    args.push('-i', finalKeyPath);
  }

  args.push(`${user}@${ip}`);

  return {
    command: 'ssh',
    args: args,
  };
}

async function connectToInstance(
  instance: EC2Instance,
  user: string,
  keyPath?: string
): Promise<void> {
  const ip = instance.privateIp || instance.publicIp;
  if (!ip) {
    throw new Error(
      `No IP address available for instance ${instance.instanceId}`
    );
  }

  console.log(chalk.blue(`Connecting to ${instance.instanceId} (${ip})...`));

  const { command, args } = buildSshCommand(ip, user, keyPath);

  return new Promise((resolve, reject) => {
    const sshProcess = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
    });

    sshProcess.on('close', (code) => {
      if (code === 0) {
        console.log(
          chalk.green(`✓ SSH session ended for ${instance.instanceId}`)
        );
        resolve();
      } else {
        console.log(
          chalk.yellow(
            `SSH session ended with code ${code} for ${instance.instanceId}`
          )
        );
        resolve(); // Don't reject, as user might have intentionally disconnected
      }
    });

    sshProcess.on('error', (error) => {
      console.error(chalk.red(`✗ SSH connection failed: ${error.message}`));
      reject(error);
    });
  });
}

async function sshToAws(
  environment: string,
  options: SshAwsOptions
): Promise<void> {
  if (!validateEnvironment(environment)) {
    console.error(chalk.red(`Error: Invalid environment "${environment}"`));
    console.error(
      chalk.yellow(`Valid environments: ${VALID_ENVIRONMENTS.join(', ')}`)
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

  const user = options.user || 'ec2-user';

  try {
    const instances = await getEC2Instances(environment);

    if (instances.length === 0) {
      console.error(
        chalk.yellow(
          `No running EC2 instances found for environment: ${environment}`
        )
      );
      return;
    }

    console.log(
      chalk.blue.bold(`EC2 Instances for environment: ${environment}`)
    );
    console.log(chalk.gray(`Found ${instances.length} running instance(s)`));

    // List instances
    instances.forEach((instance, index) => {
      const ip = instance.privateIp || instance.publicIp || 'No IP';
      console.log(
        chalk.green(`  ${index + 1}. ${instance.instanceId} - ${ip}`)
      );
    });

    if (options.list) {
      return; // Just list, don't connect
    }

    if (options['dry-run']) {
      console.log(chalk.yellow('\n--- DRY RUN MODE ---'));

      if (options.all) {
        instances.forEach((instance) => {
          const ip = instance.privateIp || instance.publicIp;
          if (ip) {
            const { command, args } = buildSshCommand(
              ip,
              'ec2-user',
              options.key
            );
            console.log(
              chalk.gray(`Would execute: ${command} ${args.join(' ')}`)
            );
          }
        });
      } else {
        const firstInstance = instances[0];
        const ip = firstInstance.privateIp || firstInstance.publicIp;
        if (ip) {
          const { command, args } = buildSshCommand(ip, user, options.key);
          console.log(
            chalk.gray(`Would execute: ${command} ${args.join(' ')}`)
          );
        }
      }
      return;
    }

    // Confirmation
    const connectAll = options.all;
    const targetDescription = connectAll
      ? `all ${instances.length} instances`
      : `the first instance (${instances[0].instanceId})`;

    const shouldConnect = await askConfirmation(
      `Connect via SSH to ${targetDescription} in ${environment}?`
    );

    if (!shouldConnect) {
      console.log(chalk.yellow('SSH cancelled'));
      return;
    }

    // Connect to instances
    if (connectAll) {
      console.log(chalk.blue('\nConnecting to all instances sequentially...'));
      for (let i = 0; i < instances.length; i++) {
        const instance = instances[i];
        console.log(
          chalk.blue(`\n--- Instance ${i + 1}/${instances.length} ---`)
        );
        try {
          await connectToInstance(instance, user, options.key);
        } catch (error) {
          console.error(
            chalk.red(`Failed to connect to ${instance.instanceId}: ${error}`)
          );

          if (i < instances.length - 1) {
            const shouldContinue = await askConfirmation(
              'Continue to next instance?'
            );
            if (!shouldContinue) break;
          }
        }
      }
    } else {
      // Connect to first instance only
      const firstInstance = instances[0];
      await connectToInstance(firstInstance, user, options.key);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

export const sshAwsCommand = new Command('sshaws')
  .description('SSH into EC2 instances for a given environment')
  .argument(
    '<environment>',
    `Environment name (${VALID_ENVIRONMENTS.join('|')})`
  )
  .option(
    '--all',
    'Connect to all instances sequentially (default: first instance only)'
  )
  .option('--list', 'List available instances without connecting')
  .option(
    '--key <path>',
    'Path to SSH private key file (default: ~/.ssh/WFU_AIT if exists)'
  )
  .option('--user <username>', 'SSH username (default: ec2-user)', 'ec2-user')
  .option('--dry-run', 'Show what SSH commands would be executed')
  .action(async (environment: string, options: SshAwsOptions) => {
    await sshToAws(environment.toLowerCase(), options);
  })
  .addHelpText(
    'after',
    `
Examples:
  $ wfuwp sshaws uat                     # SSH to first instance in uat
  $ wfuwp sshaws uat --all               # SSH to all instances in uat (sequentially)
  $ wfuwp sshaws uat --list              # List instances without connecting
  $ wfuwp sshaws prod --key ~/.ssh/my.pem # Use specific SSH key
  $ wfuwp sshaws dev --user ubuntu       # Use different username
  $ wfuwp sshaws pprd --dry-run          # Preview SSH commands without connecting

Notes:
  - Automatically uses ~/.ssh/WFU_AIT key if it exists (WFU default)
  - Falls back to system SSH configuration if WFU_AIT key not found
  - Connects to private IPs by default, public IPs as fallback
  - Only shows running EC2 instances
`
  );
