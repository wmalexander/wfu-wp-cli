import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join } from 'path';
import { SqlFileAnalyzer } from '../../src/utils/sql-file-analyzer';

describe('SqlFileAnalyzer', () => {
  const testDir = join(__dirname, 'temp-test-files');

  beforeAll(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    const files = ['small-test.sql', 'large-test.sql', 'no-tables.sql'];
    files.forEach(file => {
      const filePath = join(testDir, file);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    });
  });

  describe('countTablesInSqlFile', () => {
    it('should count CREATE TABLE statements in a small SQL file', async () => {
      const sqlContent = `
-- Test SQL file
DROP TABLE IF EXISTS wp_43_posts;
CREATE TABLE wp_43_posts (
  ID bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  post_title text COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (ID)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS wp_43_options;
CREATE TABLE wp_43_options (
  option_id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  option_name varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  PRIMARY KEY (option_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Some more SQL
INSERT INTO wp_43_posts VALUES (1, 'Hello World');
`;

      const testFile = join(testDir, 'small-test.sql');
      writeFileSync(testFile, sqlContent);

      const count = await SqlFileAnalyzer.countTablesInSqlFile(testFile);
      expect(count).toBe(2);
    });

    it('should handle case-insensitive CREATE TABLE statements', async () => {
      const sqlContent = `
create table wp_lowercase (id int);
CREATE TABLE wp_uppercase (id int);
Create Table wp_mixedcase (id int);
CREATE  TABLE wp_extraspaces (id int);
`;

      const testFile = join(testDir, 'case-test.sql');
      writeFileSync(testFile, sqlContent);

      const count = await SqlFileAnalyzer.countTablesInSqlFile(testFile);
      expect(count).toBe(4);
    });

    it('should return 0 for a file with no CREATE TABLE statements', async () => {
      const sqlContent = `
-- This file has no table creation statements
INSERT INTO existing_table VALUES (1, 'test');
UPDATE existing_table SET column = 'value';
SELECT * FROM another_table;
DROP TABLE IF EXISTS some_table;
`;

      const testFile = join(testDir, 'no-tables.sql');
      writeFileSync(testFile, sqlContent);

      const count = await SqlFileAnalyzer.countTablesInSqlFile(testFile);
      expect(count).toBe(0);
    });

    it('should handle large files efficiently without loading into memory', async () => {
      // Create a large SQL file (simulating a large database dump)
      const testFile = join(testDir, 'large-test.sql');
      
      // Write file in chunks to simulate a large file
      const chunk = 'INSERT INTO wp_43_posts VALUES (1, "' + 'x'.repeat(1000) + '");\n';
      let content = 'CREATE TABLE wp_43_posts (id int);\n';
      
      // Add many insert statements to make the file large
      for (let i = 0; i < 1000; i++) {
        content += chunk;
      }
      
      content += 'CREATE TABLE wp_43_options (id int);\n';
      
      // Add more inserts
      for (let i = 0; i < 1000; i++) {
        content += chunk.replace('wp_43_posts', 'wp_43_options');
      }
      
      writeFileSync(testFile, content);

      const startTime = Date.now();
      const count = await SqlFileAnalyzer.countTablesInSqlFile(testFile);
      const endTime = Date.now();

      expect(count).toBe(2);
      // Should complete quickly even for large files (under 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should reject when file does not exist', async () => {
      const nonExistentFile = join(testDir, 'does-not-exist.sql');
      
      await expect(SqlFileAnalyzer.countTablesInSqlFile(nonExistentFile))
        .rejects
        .toThrow('Failed to analyze SQL file');
    });

    it('should handle empty files', async () => {
      const testFile = join(testDir, 'empty.sql');
      writeFileSync(testFile, '');

      const count = await SqlFileAnalyzer.countTablesInSqlFile(testFile);
      expect(count).toBe(0);
    });

    it('should handle files with only whitespace', async () => {
      const testFile = join(testDir, 'whitespace.sql');
      writeFileSync(testFile, '   \n  \t  \n   ');

      const count = await SqlFileAnalyzer.countTablesInSqlFile(testFile);
      expect(count).toBe(0);
    });
  });
});