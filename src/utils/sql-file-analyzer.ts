import { createReadStream } from 'fs';
import { createInterface } from 'readline';

export class SqlFileAnalyzer {
  static async countTablesInSqlFile(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let tableCount = 0;
      const createTableRegex = /CREATE\s+TABLE/i;

      rl.on('line', (line) => {
        if (createTableRegex.test(line.trim())) {
          tableCount++;
        }
      });

      rl.on('close', () => {
        resolve(tableCount);
      });

      rl.on('error', (error) => {
        reject(new Error(`Failed to analyze SQL file: ${error.message}`));
      });

      fileStream.on('error', (error) => {
        reject(new Error(`Failed to read SQL file: ${error.message}`));
      });
    });
  }
}
