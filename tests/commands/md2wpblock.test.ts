import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

describe('md2wpblock command', () => {
  const testDir = join(__dirname, '../fixtures/test-temp');
  const cliPath = join(__dirname, '../../dist/index.js');

  beforeEach(() => {
    // Create test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('single file processing', () => {
    it('should convert a single markdown file', () => {
      const inputFile = join(testDir, 'test.md');
      const outputFile = join(testDir, 'test.html');
      
      // Create test markdown file
      writeFileSync(inputFile, '# Test Document\n\nThis is a test.');
      
      // Run command
      const result = execSync(`node ${cliPath} md2wpblock ${inputFile}`, { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      // Check that output file was created
      expect(existsSync(outputFile)).toBe(true);
      
      // Check output content
      const output = readFileSync(outputFile, 'utf8');
      expect(output).toContain('<!-- wp:heading -->');
      expect(output).toContain('<h1 class="wp-block-heading">Test Document</h1>');
      expect(output).toContain('<!-- wp:paragraph -->');
      expect(output).toContain('<p>This is a test.</p>');
      
      // Check command output
      expect(result).toContain('test.md → test.html');
    });

    it('should support custom output filename', () => {
      const inputFile = join(testDir, 'input.md');
      const outputFile = join(testDir, 'custom-output.html');
      
      writeFileSync(inputFile, '# Custom Output Test');
      
      execSync(`node ${cliPath} md2wpblock ${inputFile} -o custom-output.html`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      expect(existsSync(outputFile)).toBe(true);
      
      const output = readFileSync(outputFile, 'utf8');
      expect(output).toContain('Custom Output Test');
    });

    it('should show error for non-markdown file', () => {
      const textFile = join(testDir, 'test.txt');
      writeFileSync(textFile, 'not markdown');
      
      expect(() => {
        execSync(`node ${cliPath} md2wpblock ${textFile}`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
      }).toThrow();
    });

    it('should show error for non-existent file', () => {
      expect(() => {
        execSync(`node ${cliPath} md2wpblock ${join(testDir, 'missing.md')}`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
      }).toThrow();
    });
  });

  describe('directory processing', () => {
    it('should convert all markdown files in directory', () => {
      // Create multiple markdown files
      writeFileSync(join(testDir, 'file1.md'), '# File 1\n\nContent 1');
      writeFileSync(join(testDir, 'file2.md'), '# File 2\n\nContent 2');
      writeFileSync(join(testDir, 'file3.markdown'), '# File 3\n\nContent 3');
      writeFileSync(join(testDir, 'ignore.txt'), 'Should be ignored');
      
      const result = execSync(`node ${cliPath} md2wpblock ${testDir}`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      // Check that HTML files were created
      expect(existsSync(join(testDir, 'file1.html'))).toBe(true);
      expect(existsSync(join(testDir, 'file2.html'))).toBe(true);
      expect(existsSync(join(testDir, 'file3.html'))).toBe(true);
      expect(existsSync(join(testDir, 'ignore.html'))).toBe(false);
      
      // Check content of one file
      const output1 = readFileSync(join(testDir, 'file1.html'), 'utf8');
      expect(output1).toContain('<h1 class="wp-block-heading">File 1</h1>');
      expect(output1).toContain('<p>Content 1</p>');
      
      // Check command output
      expect(result).toContain('Found 3 Markdown file(s)');
      expect(result).toContain('Successfully converted 3 file(s)');
    });

    it('should handle empty directory', () => {
      const result = execSync(`node ${cliPath} md2wpblock ${testDir}`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      expect(result).toContain('No Markdown files found');
    });
  });

  describe('dry run mode', () => {
    it('should preview operations without creating files', () => {
      const inputFile = join(testDir, 'dryrun.md');
      const outputFile = join(testDir, 'dryrun.html');
      
      writeFileSync(inputFile, '# Dry Run Test');
      
      const result = execSync(`node ${cliPath} md2wpblock ${inputFile} --dry-run`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      // File should not be created
      expect(existsSync(outputFile)).toBe(false);
      
      // Should show preview message
      expect(result).toContain('[DRY RUN] Would create:');
      expect(result).toContain('dryrun.html');
    });

    it('should show HTML content in verbose dry run', () => {
      const inputFile = join(testDir, 'verbose.md');
      writeFileSync(inputFile, '# Verbose Test');
      
      const result = execSync(`node ${cliPath} md2wpblock ${inputFile} --dry-run --verbose`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      expect(result).toContain('--- Generated HTML ---');
      expect(result).toContain('<!-- wp:heading -->');
      expect(result).toContain('--- End HTML ---');
    });
  });

  describe('verbose mode', () => {
    it('should show detailed progress', () => {
      const inputFile = join(testDir, 'verbose.md');
      writeFileSync(inputFile, '# Verbose Test');
      
      const result = execSync(`node ${cliPath} md2wpblock ${inputFile} --verbose`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      expect(result).toContain('Converting: verbose.md');
      expect(result).toContain('✓ Created: verbose.html');
    });
  });

  describe('HTML escaping option', () => {
    it.skip('should escape HTML when option is provided', () => {
      const inputFile = join(testDir, 'escape.md');
      const outputFile = join(testDir, 'escape.html');
      
      writeFileSync(inputFile, 'Text with <em>HTML</em> tags');
      
      execSync(`node ${cliPath} md2wpblock ${inputFile} --escape-html`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      const output = readFileSync(outputFile, 'utf8');
      expect(output).toContain('&lt;em&gt;HTML&lt;/em&gt;');
    });
  });

  describe('error handling', () => {
    it('should handle processing errors gracefully', () => {
      // Create multiple files, one that might cause issues
      writeFileSync(join(testDir, 'good.md'), '# Good File');
      writeFileSync(join(testDir, 'empty.md'), '');
      
      const result = execSync(`node ${cliPath} md2wpblock ${testDir}`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      // Should still process the good file
      expect(existsSync(join(testDir, 'good.html'))).toBe(true);
      expect(existsSync(join(testDir, 'empty.html'))).toBe(true);
    });
  });

  describe('help text', () => {
    it('should show help with examples', () => {
      const result = execSync(`node ${cliPath} md2wpblock --help`, {
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      expect(result).toContain('Convert Markdown files to WordPress block editor HTML');
      expect(result).toContain('Examples:');
      expect(result).toContain('wfuwp md2wpblock document.md');
      expect(result).toContain('wfuwp md2wpblock wp-docs/');
    });
  });
});