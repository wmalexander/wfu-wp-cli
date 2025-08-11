/**
 * Utility functions for standardized SQL file naming
 * Format: {siteName}-{siteId}-{environment}-{purpose}-{date}.sql
 * Example: magazine-43-pprd-rename-export-08-05-2025.sql
 */

export interface SqlFileOptions {
  siteId: string;
  environment: string;
  purpose:
    | 'initial-export'
    | 'backup-export'
    | 'rename-export'
    | 'migrated-export';
  siteName?: string;
  date?: Date;
}

export class FileNaming {
  /**
   * Generate standardized SQL filename
   */
  static generateSqlFilename(options: SqlFileOptions): string {
    const date = options.date || new Date();
    const dateStr = this.formatDate(date);

    const siteName = options.siteName || `site${options.siteId}`;
    const sanitizedSiteName = this.sanitizeSiteName(siteName);

    return `${sanitizedSiteName}-${options.siteId}-${options.environment}-${options.purpose}-${dateStr}.sql`;
  }

  /**
   * Format date as MM-DD-YYYY
   */
  private static formatDate(date: Date): string {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();

    return `${month}-${day}-${year}`;
  }

  /**
   * Sanitize site name for use in filenames
   * - Convert to lowercase
   * - Replace spaces and special chars with dashes
   * - Remove multiple consecutive dashes
   * - Remove leading/trailing dashes
   */
  private static sanitizeSiteName(siteName: string): string {
    return siteName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Parse a standardized SQL filename back into components
   */
  static parseFilename(filename: string): Partial<SqlFileOptions> | null {
    const basename = filename.replace(/\.sql$/i, '');
    const parts = basename.split('-');

    if (parts.length < 5) {
      return null;
    }

    // Extract components (working backwards from the end)
    const year = parts.pop();
    const day = parts.pop();
    const month = parts.pop();
    const purpose = parts.slice(-2).join('-') as SqlFileOptions['purpose'];
    const environment = parts[parts.length - 3];
    const siteId = parts[parts.length - 4];
    const siteName = parts.slice(0, -4).join('-');

    // Validate extracted data
    if (
      !year ||
      !day ||
      !month ||
      !siteId ||
      !environment ||
      !purpose ||
      !siteName
    ) {
      return null;
    }

    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (isNaN(date.getTime())) {
      return null;
    }

    return {
      siteId,
      environment,
      purpose,
      siteName,
      date,
    };
  }

  /**
   * Get site name from WordPress database
   * Queries the wp_blogs table to get the actual site domain/path
   */
  static async getSiteName(
    siteId: string,
    environment: string
  ): Promise<string> {
    try {
      const { Config } = await import('./config');
      const envConfig = Config.getEnvironmentConfig(environment);

      // Use MySQL to query the site name from wp_blogs table
      const { execSync } = await import('child_process');

      const query = `SELECT domain, path FROM wp_blogs WHERE blog_id = ${siteId} LIMIT 1;`;
      const mysqlCmd = `mysql -h "${envConfig.host}" -u "${envConfig.user}" -p"${envConfig.password}" "${envConfig.database}" -e "${query}" --silent --raw`;

      try {
        const result = execSync(mysqlCmd, { encoding: 'utf8', stdio: 'pipe' });
        const lines = result.trim().split('\n');

        if (lines.length > 0 && lines[0]) {
          const [domain, path] = lines[0].split('\t');

          if (domain && domain !== 'domain') {
            // Skip header row
            // Extract meaningful name from domain
            let siteName = domain.replace(
              /\.(wfu\.edu|pprd\.wfu\.edu|dev\.wfu\.edu|uat\.wfu\.edu)$/,
              ''
            );
            siteName = siteName.replace(/^(www\.|aws\.)/, '');

            // If path has meaningful info, include it
            if (path && path !== '/' && path !== '/wp/') {
              const pathName = path
                .replace(/^\//, '')
                .replace(/\/$/, '')
                .replace(/\/wp$/, '');
              if (pathName) {
                siteName = `${siteName}-${pathName}`;
              }
            }

            return siteName || `site${siteId}`;
          }
        }
      } catch (dbError) {
        // If database query fails, fall back to default
        console.warn(
          `Warning: Could not get site name from database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`
        );
      }
    } catch (error) {
      // If any other error occurs, fall back to default
    }

    return `site${siteId}`;
  }

  /**
   * Generate full file path with standardized naming
   */
  static generateFilePath(workDir: string, options: SqlFileOptions): string {
    const filename = this.generateSqlFilename(options);
    return `${workDir}/${filename}`;
  }
}
