import { Command } from 'commander';
import { execSync } from 'child_process';
import chalk from 'chalk';

const VALID_ENVIRONMENTS = ['dev', 'uat', 'pprd', 'prod'];

interface ListIpsOptions {
  public?: boolean;
  private?: boolean;
  json?: boolean;
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
    const query = 'Reservations[].Instances[].[PrivateIpAddress,PublicIpAddress,InstanceId,State.Name]';
    
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
        state: instance[3]
      }));
  } catch (error) {
    throw new Error(`Failed to query EC2 instances: ${error}`);
  }
}

async function listIPs(environment: string, options: ListIpsOptions): Promise<void> {
  if (!validateEnvironment(environment)) {
    console.error(chalk.red(`Error: Invalid environment "${environment}"`));
    console.error(chalk.yellow(`Valid environments: ${VALID_ENVIRONMENTS.join(', ')}`));
    process.exit(1);
  }

  if (!checkAwsCli()) {
    console.error(chalk.red('Error: AWS CLI is not installed or not in PATH'));
    console.error(chalk.yellow('Please install the AWS CLI: https://aws.amazon.com/cli/'));
    process.exit(1);
  }

  try {
    const instances = await getEC2Instances(environment);

    if (instances.length === 0) {
      console.error(chalk.yellow(`No running EC2 instances found for environment: ${environment}`));
      return;
    }

    // Determine which IPs to show
    const showPublic = options.public || (!options.private && !options.public);
    const showPrivate = options.private || (!options.private && !options.public);

    if (options.json) {
      const output = instances.map(instance => ({
        instanceId: instance.instanceId,
        privateIp: showPrivate ? instance.privateIp : undefined,
        publicIp: showPublic ? instance.publicIp : undefined,
        state: instance.state
      }));
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    console.log(chalk.blue.bold(`EC2 Instances for environment: ${environment}`));
    console.log(chalk.gray(`Found ${instances.length} running instance(s)\n`));

    instances.forEach((instance, index) => {
      console.log(chalk.green(`Instance ${index + 1}: ${instance.instanceId}`));
      
      if (showPrivate && instance.privateIp) {
        console.log(chalk.gray(`  Private IP: ${instance.privateIp}`));
      }
      
      if (showPublic && instance.publicIp) {
        console.log(chalk.gray(`  Public IP:  ${instance.publicIp}`));
      }
      
      if (!showPublic && !showPrivate) {
        console.log(chalk.gray('  No IP addresses to display'));
      }
      
      console.log(); // Empty line between instances
    });

    // Also output just the IPs for easy copying (like the original script)
    if (!options.json) {
      if (showPrivate) {
        const privateIps = instances
          .map(i => i.privateIp)
          .filter(ip => ip)
          .join(' ');
        if (privateIps) {
          console.log(chalk.blue('Private IPs (space-separated):'));
          console.log(privateIps);
        }
      }
      
      if (showPublic) {
        const publicIps = instances
          .map(i => i.publicIp)
          .filter(ip => ip)
          .join(' ');
        if (publicIps) {
          console.log(chalk.blue('Public IPs (space-separated):'));
          console.log(publicIps);
        }
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error}`));
    process.exit(1);
  }
}

export const listIpsCommand = new Command('listips')
  .description('List EC2 instance IP addresses for a given environment')
  .argument('<environment>', `Environment name (${VALID_ENVIRONMENTS.join('|')})`)
  .option('--private', 'Show private IP addresses (default behavior)')
  .option('--public', 'Show public IP addresses')
  .option('--json', 'Output as JSON')
  .action(async (environment: string, options: ListIpsOptions) => {
    await listIPs(environment.toLowerCase(), options);
  })
  .addHelpText(
    'after',
    `
Examples:
  $ wfuwp listips uat                # List private IPs for uat environment
  $ wfuwp listips uat --public       # List public IPs for uat environment  
  $ wfuwp listips prod --json        # Output as JSON for scripting
  $ wfuwp listips pprd --private     # Explicitly show private IPs
`
  );