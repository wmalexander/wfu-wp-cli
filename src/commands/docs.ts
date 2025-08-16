import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface DocTopic {
  name: string;
  file: string;
  description: string;
  aliases?: string[];
}

const DOC_TOPICS: DocTopic[] = [
  {
    name: 'getting-started',
    file: 'docs/getting-started.md',
    description: 'New user guide with prerequisites and first steps',
    aliases: ['start', 'begin', 'setup'],
  },
  {
    name: 'quick',
    file: 'docs/quick-reference.md',
    description: 'Command cheat sheet and quick reference',
    aliases: ['quick-reference', 'cheatsheet', 'reference'],
  },
  {
    name: 'troubleshooting',
    file: 'docs/troubleshooting-by-command.md',
    description: 'Solutions to common problems by command',
    aliases: ['trouble', 'problems', 'issues', 'errors'],
  },
  {
    name: 'workflows',
    file: 'docs/workflows.md',
    description: 'Visual diagrams showing migration processes',
    aliases: ['diagrams', 'visual', 'flow'],
  },
  {
    name: 'commands',
    file: 'docs/commands.md',
    description: 'Detailed documentation for all commands',
    aliases: ['command', 'api'],
  },
  {
    name: 'configuration',
    file: 'docs/configuration.md',
    description: 'Configuration options and settings',
    aliases: ['config', 'settings'],
  },
  {
    name: 'migration',
    file: 'docs/migration.md',
    description: 'Database migration workflows and strategies',
    aliases: ['migrate', 'database'],
  },
  {
    name: 'architecture',
    file: 'docs/architecture.md',
    description: 'Technical architecture and design',
    aliases: ['technical', 'design'],
  },
];

function findTopic(name: string): DocTopic | undefined {
  const normalized = name.toLowerCase();
  return DOC_TOPICS.find(
    (topic) => topic.name === normalized || topic.aliases?.includes(normalized)
  );
}

function getProjectRoot(): string {
  // Try to find the project root by looking for package.json
  let currentDir = __dirname;
  while (currentDir !== '/') {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return process.cwd();
}

function openInBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }
  try {
    execSync(command, { stdio: 'ignore' });
    console.log(chalk.green('✓') + ' Opened documentation in browser');
  } catch (error) {
    console.log(chalk.yellow('⚠️  Could not open browser automatically'));
    console.log('Please visit: ' + chalk.cyan(url));
  }
}

function displayDocContent(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Simple markdown rendering for terminal
    const lines = content.split('\n');
    let inCodeBlock = false;
    lines.forEach((line) => {
      if (line.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        console.log(chalk.gray(line));
      } else if (inCodeBlock) {
        console.log(chalk.gray(line));
      } else if (line.startsWith('# ')) {
        console.log('\n' + chalk.bold.cyan(line.substring(2)) + '\n');
      } else if (line.startsWith('## ')) {
        console.log('\n' + chalk.bold(line.substring(3)) + '\n');
      } else if (line.startsWith('### ')) {
        console.log(chalk.bold(line.substring(4)));
      } else if (line.startsWith('- ')) {
        console.log(chalk.gray('  •') + line.substring(1));
      } else if (line.match(/^\d+\. /)) {
        console.log('  ' + line);
      } else {
        console.log(line);
      }
    });
  } catch (error) {
    console.log(
      chalk.red('Error reading documentation file:'),
      (error as Error).message
    );
  }
}

function searchDocs(query: string): void {
  const projectRoot = getProjectRoot();
  const docsDir = path.join(projectRoot, 'docs');
  if (!fs.existsSync(docsDir)) {
    console.log(chalk.red('Documentation directory not found'));
    return;
  }
  console.log(chalk.bold(`\nSearching for "${query}" in documentation...\n`));
  const results: Array<{ file: string; line: number; text: string }> = [];
  DOC_TOPICS.forEach((topic) => {
    const filePath = path.join(projectRoot, topic.file);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            file: topic.name,
            line: index + 1,
            text: line.trim().substring(0, 80),
          });
        }
      });
    }
  });
  if (results.length === 0) {
    console.log(chalk.yellow('No results found'));
    console.log('\nTry browsing topics: ' + chalk.cyan('wfuwp docs --list'));
  } else {
    console.log(`Found ${chalk.green(results.length)} results:\n`);
    const grouped = results.reduce(
      (acc, result) => {
        if (!acc[result.file]) acc[result.file] = [];
        acc[result.file].push(result);
        return acc;
      },
      {} as Record<string, typeof results>
    );
    Object.entries(grouped).forEach(([file, matches]) => {
      console.log(chalk.bold(`📄 ${file}:`));
      matches.slice(0, 3).forEach((match) => {
        console.log(`  Line ${match.line}: ${chalk.gray(match.text)}`);
      });
      if (matches.length > 3) {
        console.log(chalk.gray(`  ... and ${matches.length - 3} more matches`));
      }
      console.log();
    });
    console.log('View a specific topic: ' + chalk.cyan('wfuwp docs <topic>'));
  }
}

export function registerDocsCommand(program: Command) {
  program
    .command('docs')
    .description('Browse and search documentation')
    .argument('[topic]', 'Documentation topic to open')
    .option('-l, --list', 'List all available topics')
    .option('-s, --search <query>', 'Search documentation for a term')
    .option('-b, --browser', 'Open in browser (GitHub)')
    .option('-p, --print', 'Print to terminal (default for local files)')
    .action((topic, options) => {
      // Handle search
      if (options.search) {
        searchDocs(options.search);
        return;
      }
      // Handle list
      if (options.list || !topic) {
        console.log(chalk.bold('\n📚 Available Documentation:\n'));
        DOC_TOPICS.forEach((t) => {
          console.log(`  ${chalk.cyan(t.name.padEnd(18))} - ${t.description}`);
          if (t.aliases && t.aliases.length > 0) {
            console.log(
              `  ${' '.repeat(18)}   ${chalk.gray('Aliases: ' + t.aliases.join(', '))}`
            );
          }
        });
        console.log();
        console.log('Usage:');
        console.log('  View a topic:  ' + chalk.cyan('wfuwp docs <topic>'));
        console.log(
          '  Search docs:   ' + chalk.cyan('wfuwp docs --search <term>')
        );
        console.log(
          '  Open in browser: ' + chalk.cyan('wfuwp docs <topic> --browser')
        );
        console.log();
        console.log('Examples:');
        console.log('  ' + chalk.gray('wfuwp docs getting-started'));
        console.log('  ' + chalk.gray('wfuwp docs quick'));
        console.log('  ' + chalk.gray('wfuwp docs --search "migrate"'));
        console.log();
        return;
      }
      // Find and display topic
      const docTopic = findTopic(topic);
      if (!docTopic) {
        console.log(chalk.red(`Documentation topic "${topic}" not found`));
        console.log('\nAvailable topics:');
        DOC_TOPICS.forEach((t) => {
          console.log('  • ' + chalk.cyan(t.name));
        });
        console.log(
          '\nUse ' + chalk.cyan('wfuwp docs --list') + ' for descriptions'
        );
        return;
      }
      // Open in browser if requested or if GitHub URL would be better
      if (options.browser) {
        const githubUrl = `https://github.com/wmalexander/wfu-wp-cli/blob/main/${docTopic.file}`;
        console.log(
          chalk.bold(`\n📖 Opening ${docTopic.name} documentation...\n`)
        );
        openInBrowser(githubUrl);
      } else {
        // Display in terminal
        const projectRoot = getProjectRoot();
        const filePath = path.join(projectRoot, docTopic.file);
        if (fs.existsSync(filePath)) {
          console.log(chalk.bold(`\n📖 ${docTopic.name}\n`));
          console.log(chalk.gray(`File: ${docTopic.file}`));
          console.log(chalk.gray('─'.repeat(50)) + '\n');
          displayDocContent(filePath);
          console.log('\n' + chalk.gray('─'.repeat(50)));
          console.log(
            chalk.gray('View in browser: ') +
              chalk.cyan(`wfuwp docs ${topic} --browser`)
          );
        } else {
          console.log(
            chalk.yellow('Local file not found, opening in browser...')
          );
          const githubUrl = `https://github.com/wmalexander/wfu-wp-cli/blob/main/${docTopic.file}`;
          openInBrowser(githubUrl);
        }
      }
    });
}
