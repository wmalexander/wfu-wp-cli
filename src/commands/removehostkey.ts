import { Command } from 'commander';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'pprd', 'prod'];

interface RemoveHostKeyOptions {
  dryRun?: boolean;
  all?: boolean;
  knownHosts?: string;
  yes?: boolean;
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
      .filter((instance: any[]) => instance[3] === 'running')
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

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeHostKey(
  ip: string,
  knownHostsPath: string,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) {
    console.log(chalk.yellow(`Would remove host key for IP: ${ip}`));
    console.log(
      chalk.gray(`Command: ssh-keygen -R ${ip} -f ${knownHostsPath}`)
    );
    return true;
  }

  try {
    const command = `ssh-keygen -R ${ip} -f ${knownHostsPath}`;
    execSync(command, { stdio: 'pipe' });
    console.log(chalk.green(`✓ Removed host key for IP: ${ip}`));
    return true;
  } catch (error) {
    console.log(chalk.red(`✗ Failed to remove host key for IP: ${ip}`));
    console.log(chalk.gray(`Error: ${error}`));
    return false;
  }
}

function promptConfirmation(message: string): boolean {
  if (process.env.NODE_ENV === 'test') {
    return true;
  }

  try {
    const response = execSync(`read -p "${message} (y/N): " && echo $REPLY`, {
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit'],
      shell: '/bin/bash',
    })
      .trim()
      .toLowerCase();

    return response === 'y' || response === 'yes';
  } catch {
    return false;
  }
}

async function removeHostKeys(
  environment: string,
  options: RemoveHostKeyOptions
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

  const knownHostsPath =
    options.knownHosts || join(homedir(), '.ssh', 'known_hosts');

  if (!(await checkFileExists(knownHostsPath))) {
    console.error(
      chalk.red(`Error: known_hosts file not found at ${knownHostsPath}`)
    );
    process.exit(1);
  }

  try {
    console.log(
      chalk.blue(`Fetching EC2 instances for environment: ${environment}...`)
    );
    const instances = await getEC2Instances(environment);

    if (instances.length === 0) {
      console.error(
        chalk.yellow(
          `No running EC2 instances found for environment: ${environment}`
        )
      );
      return;
    }

    const ipsToRemove: string[] = [];

    instances.forEach((instance) => {
      if (instance.privateIp) {
        ipsToRemove.push(instance.privateIp);
      }
      if (instance.publicIp) {
        ipsToRemove.push(instance.publicIp);
      }
    });

    if (ipsToRemove.length === 0) {
      console.log(chalk.yellow('No IP addresses found for the instances.'));
      return;
    }

    console.log(
      chalk.blue(
        `\nFound ${instances.length} running instance(s) with ${ipsToRemove.length} IP address(es):`
      )
    );
    instances.forEach((instance, index) => {
      console.log(chalk.gray(`Instance ${index + 1}: ${instance.instanceId}`));
      if (instance.privateIp) {
        console.log(chalk.gray(`  Private IP: ${instance.privateIp}`));
      }
      if (instance.publicIp) {
        console.log(chalk.gray(`  Public IP:  ${instance.publicIp}`));
      }
    });

    if (!options.dryRun && !options.yes) {
      console.log(
        chalk.blue(`\nThis will remove host keys for the following IPs:`)
      );
      ipsToRemove.forEach((ip) => {
        console.log(chalk.gray(`  ${ip}`));
      });
      console.log(chalk.gray(`From: ${knownHostsPath}`));

      if (!promptConfirmation('\nProceed with host key removal?')) {
        console.log(chalk.yellow('Operation cancelled.'));
        return;
      }
    }

    console.log(chalk.blue('\nRemoving host keys...'));
    let successCount = 0;
    let failureCount = 0;

    for (const ip of ipsToRemove) {
      const success = await removeHostKey(ip, knownHostsPath, !!options.dryRun);
      if (success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    console.log(chalk.blue('\n' + '='.repeat(50)));
    if (options.dryRun) {
      console.log(
        chalk.yellow(
          `Dry run completed. Would have processed ${ipsToRemove.length} IP address(es).`
        )
      );
    } else {
      console.log(
        chalk.green(`Successfully removed: ${successCount} host key(s)`)
      );
      if (failureCount > 0) {
        console.log(chalk.red(`Failed to remove: ${failureCount} host key(s)`));
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

export const removeHostKeyCommand = new Command('removehostkey')
  .description('Remove SSH host keys for EC2 instances in a given environment')
  .argument(
    '<environment>',
    `Environment name (${VALID_ENVIRONMENTS.join('|')})`
  )
  .option('--dry-run', 'Show what would be removed without making changes')
  .option('--all', 'Remove host keys for all IPs (both private and public)')
  .option(
    '--known-hosts <path>',
    'Specify custom known_hosts file path',
    join(homedir(), '.ssh', 'known_hosts')
  )
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (environment: string, options: RemoveHostKeyOptions) => {
    await removeHostKeys(environment.toLowerCase(), options);
  })
  .addHelpText(
    'after',
    `
Examples:
  $ wfuwp removehostkey uat              # Remove host keys for UAT environment
  $ wfuwp removehostkey prod --dry-run   # Preview what would be removed
  $ wfuwp removehostkey dev -y           # Remove without confirmation prompt
  $ wfuwp removehostkey pprd --known-hosts ~/.ssh/custom_hosts # Use custom known_hosts file

Note: This command will remove host keys for both private and public IPs of all running 
EC2 instances in the specified environment. This is useful when instance IPs change 
and you need to clean up SSH host key conflicts.
`
  );
