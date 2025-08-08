import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, extname, basename, dirname } from 'path';
import { convertMarkdownToWpBlocks } from '../utils/markdown-to-wp-blocks';

export const md2wpblockCommand = new Command('md2wpblock')
  .description('Convert Markdown files to WordPress block editor HTML format')
  .argument('<path>', 'Path to Markdown file or directory containing Markdown files')
  .option('-o, --output <filename>', 'Custom output filename (single file mode only)')
  .option('--dry-run', 'Preview operations without creating files')
  .option('-v, --verbose', 'Show detailed output')
  .option('--escape-html', 'Escape HTML entities in output')
  .action(async (inputPath: string, options) => {
    try {
      const processor = new Md2WpBlockProcessor(options);
      await processor.process(inputPath);
    } catch (error) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  });

interface ProcessorOptions {
  output?: string;
  dryRun?: boolean;
  verbose?: boolean;
  escapeHtml?: boolean;
}

class Md2WpBlockProcessor {
  private options: ProcessorOptions;

  constructor(options: ProcessorOptions = {}) {
    this.options = options;
  }

  async process(inputPath: string): Promise<void> {
    if (!existsSync(inputPath)) {
      throw new Error(`Path does not exist: ${inputPath}`);
    }

    const stats = statSync(inputPath);

    if (stats.isFile()) {
      await this.processFile(inputPath);
    } else if (stats.isDirectory()) {
      await this.processDirectory(inputPath);
    } else {
      throw new Error(`Path is neither a file nor a directory: ${inputPath}`);
    }
  }

  private async processFile(filePath: string): Promise<void> {
    if (!this.isMarkdownFile(filePath)) {
      throw new Error(`File is not a Markdown file: ${filePath}`);
    }

    const outputPath = this.getOutputPath(filePath);
    await this.convertFile(filePath, outputPath);
  }

  private async processDirectory(dirPath: string): Promise<void> {
    if (this.options.output) {
      console.warn(
        chalk.yellow('Warning: --output option ignored in directory mode')
      );
    }

    const files = readdirSync(dirPath);
    const markdownFiles = files
      .filter(file => this.isMarkdownFile(file))
      .map(file => join(dirPath, file));

    if (markdownFiles.length === 0) {
      console.log(chalk.yellow(`No Markdown files found in directory: ${dirPath}`));
      return;
    }

    console.log(
      chalk.blue(`Found ${markdownFiles.length} Markdown file(s) in ${dirPath}`)
    );

    let successCount = 0;
    let errorCount = 0;

    for (const filePath of markdownFiles) {
      try {
        const outputPath = this.getOutputPath(filePath);
        await this.convertFile(filePath, outputPath);
        successCount++;
      } catch (error) {
        console.error(
          chalk.red(
            `Failed to convert ${basename(filePath)}: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
        );
        errorCount++;
      }
    }

    console.log(
      chalk.green(`✓ Successfully converted ${successCount} file(s)`) +
        (errorCount > 0 ? chalk.red(` (${errorCount} failed)`) : '')
    );
  }

  private async convertFile(inputPath: string, outputPath: string): Promise<void> {
    if (this.options.verbose) {
      console.log(chalk.blue(`Converting: ${basename(inputPath)}`));
    }

    const markdown = readFileSync(inputPath, 'utf8');
    const html = convertMarkdownToWpBlocks(markdown, {
      escapeHtml: this.options.escapeHtml,
    });

    if (this.options.dryRun) {
      console.log(chalk.yellow(`[DRY RUN] Would create: ${outputPath}`));
      if (this.options.verbose) {
        console.log(chalk.gray('--- Generated HTML ---'));
        console.log(html);
        console.log(chalk.gray('--- End HTML ---'));
      }
      return;
    }

    writeFileSync(outputPath, html, 'utf8');

    if (this.options.verbose) {
      console.log(chalk.green(`✓ Created: ${basename(outputPath)}`));
    } else {
      console.log(
        chalk.green(
          `✓ ${basename(inputPath)} → ${basename(outputPath)}`
        )
      );
    }
  }

  private getOutputPath(inputPath: string): string {
    if (this.options.output && statSync(inputPath).isFile()) {
      // Custom output filename for single file
      if (this.options.output.includes('/')) {
        // Full path provided
        return this.options.output;
      } else {
        // Just filename provided, use same directory
        return join(dirname(inputPath), this.options.output);
      }
    }

    // Default: same directory, same name with .html extension
    const dir = dirname(inputPath);
    const name = basename(inputPath, extname(inputPath));
    return join(dir, `${name}.html`);
  }

  private isMarkdownFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.markdown';
  }
}

// Add help examples
md2wpblockCommand.addHelpText('after', `
Examples:
  $ wfuwp md2wpblock document.md                    # Convert single file
  $ wfuwp md2wpblock wp-docs/                      # Convert all .md files in directory
  $ wfuwp md2wpblock file.md -o custom.html        # Custom output name
  $ wfuwp md2wpblock directory/ --dry-run          # Preview what would be converted
  $ wfuwp md2wpblock file.md --verbose             # Show detailed progress
  $ wfuwp md2wpblock file.md --escape-html         # Escape HTML entities
`);