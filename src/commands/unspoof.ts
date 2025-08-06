import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import chalk from 'chalk';

const HOSTS_FILE = '/etc/hosts';
const MARKER_START = '# WFU WordPress CLI - DNS Spoofing Start';
const MARKER_END = '# WFU WordPress CLI - DNS Spoofing End';

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

function removeWfuSpoofEntries(hostsContent: string): {
  content: string;
  removed: boolean;
} {
  const startIndex = hostsContent.indexOf(MARKER_START);
  const endIndex = hostsContent.indexOf(MARKER_END);

  if (startIndex === -1 || endIndex === -1) {
    return { content: hostsContent, removed: false };
  }

  const before = hostsContent.substring(0, startIndex);
  const after = hostsContent.substring(endIndex + MARKER_END.length);
  const cleanedContent = before + after.replace(/^\n/, '');

  return { content: cleanedContent, removed: true };
}

async function unspoofDomains(): Promise<void> {
  console.log(
    chalk.blue('Removing WFU DNS spoofing entries from hosts file...')
  );

  const hostsContent = readHostsFile();
  const { content: cleanedContent, removed } =
    removeWfuSpoofEntries(hostsContent);

  if (!removed) {
    console.log(
      chalk.yellow('No WFU DNS spoofing entries found in hosts file.')
    );
    return;
  }

  writeHostsFile(cleanedContent);

  console.log(chalk.green('Successfully removed all WFU DNS spoofing entries'));
  console.log(chalk.blue('DNS resolution will now use normal DNS servers'));
}

export const unspoofCommand = new Command('unspoof')
  .description('Remove all WFU DNS spoofing entries from /etc/hosts')
  .action(async () => {
    try {
      if (process.getuid && process.getuid() !== 0) {
        console.error(chalk.red('Error: This command must be run with sudo'));
        console.error(chalk.yellow('Example: sudo wfuwp unspoof'));
        process.exit(1);
      }

      await unspoofDomains();
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  })
  .addHelpText(
    'after',
    `
Examples:
  $ sudo wfuwp unspoof    # Removes all WFU DNS spoofing entries

Note: This command requires sudo privileges to modify /etc/hosts
`
  );
