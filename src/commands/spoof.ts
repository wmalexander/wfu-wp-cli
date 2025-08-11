import { Command } from 'commander';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';

const HOSTS_FILE = '/etc/hosts';
const MARKER_START = '# WFU WordPress CLI - DNS Spoofing Start';
const MARKER_END = '# WFU WordPress CLI - DNS Spoofing End';

interface SpoofOptions {
  env?: string;
}

function getNewsWfuEduIps(): string[] {
  try {
    const output = execSync('host news.wfu.edu', { encoding: 'utf8' });

    // Extract all IP addresses from the output
    const ipMatches = output.match(/has address ([\d.]+)/g);

    if (!ipMatches || ipMatches.length === 0) {
      throw new Error('Could not parse IP addresses from host command output');
    }

    // Extract just the IP addresses from the matches
    const ips = ipMatches
      .map((match) => {
        const ipMatch = match.match(/([\d.]+)/);
        return ipMatch ? ipMatch[1] : '';
      })
      .filter((ip) => ip !== '');

    if (ips.length === 0) {
      throw new Error('No valid IP addresses found in host command output');
    }

    return ips;
  } catch (error) {
    throw new Error(`Failed to get IP addresses for news.wfu.edu: ${error}`);
  }
}

function readHostsFile(): string {
  try {
    return readFileSync(HOSTS_FILE, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read hosts file: ${error}`);
  }
}

function writeHostsFile(content: string): void {
  try {
    writeFileSync(HOSTS_FILE, content, 'utf8');
  } catch (error) {
    throw new Error(
      `Failed to write hosts file: ${error}. Make sure you run this command with sudo.`
    );
  }
}

function removeExistingWfuEntries(hostsContent: string): string {
  const startIndex = hostsContent.indexOf(MARKER_START);
  const endIndex = hostsContent.indexOf(MARKER_END);

  if (startIndex !== -1 && endIndex !== -1) {
    const before = hostsContent.substring(0, startIndex);
    const after = hostsContent.substring(endIndex + MARKER_END.length);
    return before + after.replace(/^\n/, '');
  }

  return hostsContent;
}

function createDomainName(subdomain: string, options: SpoofOptions): string {
  const env = options.env || 'wfu.edu';
  if (env === 'wfu.edu') {
    return `${subdomain}.wfu.edu`;
  }
  return `${subdomain}.${env}.wfu.edu`;
}

async function spoofDomain(
  subdomain: string,
  options: SpoofOptions
): Promise<void> {
  const targetDomain = createDomainName(subdomain, options);

  console.log(chalk.blue(`Getting IP addresses for news.wfu.edu...`));
  const ipAddresses = getNewsWfuEduIps();
  console.log(
    chalk.green(`Found ${ipAddresses.length} IPs: ${ipAddresses.join(', ')}`)
  );

  console.log(chalk.blue(`Updating hosts file to spoof ${targetDomain}...`));

  let hostsContent = readHostsFile();
  hostsContent = removeExistingWfuEntries(hostsContent);

  // Create entries for all IP addresses
  const spoofEntries = ipAddresses
    .map((ip) => `${ip} ${targetDomain}`)
    .join('\n');
  const spoofEntry = `\n${MARKER_START}\n${spoofEntries}\n${MARKER_END}\n`;

  if (!hostsContent.endsWith('\n')) {
    hostsContent += '\n';
  }

  hostsContent += spoofEntry;

  writeHostsFile(hostsContent);

  console.log(
    chalk.green(
      `Successfully spoofed ${targetDomain} with ${ipAddresses.length} IP addresses`
    )
  );
  console.log(
    chalk.yellow(
      `Remember to run 'sudo wfuwp unspoof' when you're done testing!`
    )
  );
}

export const spoofCommand = new Command('spoof')
  .description('Spoof DNS for a WFU subdomain by adding an entry to /etc/hosts')
  .argument(
    '<subdomain>',
    'The subdomain to spoof (e.g., "shoes" for shoes.wfu.edu)'
  )
  .option(
    '--env <environment>',
    'Environment subdomain (e.g., "dev" for shoes.dev.wfu.edu)'
  )
  .action(async (subdomain: string, options: SpoofOptions) => {
    try {
      if (process.getuid && process.getuid() !== 0) {
        console.error(chalk.red('Error: This command must be run with sudo'));
        console.error(chalk.yellow('Example: sudo wfuwp spoof shoes'));
        process.exit(1);
      }

      await spoofDomain(subdomain, options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  })
  .addHelpText(
    'after',
    `
Examples:
  $ sudo wfuwp spoof shoes                # Spoofs shoes.wfu.edu
  $ sudo wfuwp spoof tennis --env dev     # Spoofs tennis.dev.wfu.edu
  $ sudo wfuwp spoof mysite               # Spoofs mysite.wfu.edu

Note: This command requires sudo privileges to modify /etc/hosts
`
  );
