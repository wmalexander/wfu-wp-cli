import { execSync } from 'child_process';
import chalk from 'chalk';
import { Config } from './config';

export interface CacheFlushOptions {
  verbose?: boolean;
  timeout?: number;
}

export interface CacheFlushResult {
  success: boolean;
  message: string;
  details?: string;
}

export class CacheFlush {
  static async flushSiteCache(
    siteId: string,
    environment: string,
    options: CacheFlushOptions = {}
  ): Promise<CacheFlushResult> {
    try {
      const envConfig = Config.getEnvironmentConfig(environment);
      const verbose = options.verbose || false;
      const timeout = options.timeout || 30;

      if (verbose) {
        console.log(
          chalk.gray(`  Flushing cache for site ${siteId} in ${environment}...`)
        );
      }

      // Use Docker to run WP-CLI cache flush
      const bashScript = [
        'cd /var/www/html',
        'wp core download',
        'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
        `wp cache flush --url="site-${siteId}"`,
      ].join(' && ');

      const dockerCommand = `docker run --rm \\
        --memory=1g \\
        -e WORDPRESS_DB_HOST="${envConfig.host}" \\
        -e WORDPRESS_DB_USER="${envConfig.user}" \\
        -e WORDPRESS_DB_PASSWORD="${envConfig.password}" \\
        -e WORDPRESS_DB_NAME="${envConfig.database}" \\
        -e WP_CLI_PHP_ARGS="-d memory_limit=512M -d max_execution_time=${timeout}" \\
        wordpress:cli \\
        bash -c '${bashScript}'`;

      const output = execSync(dockerCommand, {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'pipe',
        shell: '/bin/bash',
        timeout: timeout * 1000,
      });

      if (verbose && output) {
        console.log(chalk.gray(`    Cache flush output: ${output.trim()}`));
      }

      return {
        success: true,
        message: `Cache flushed successfully for site ${siteId}`,
        details: output?.trim(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Check for common cache flush errors and provide helpful messages
      if (errorMessage.includes('timeout')) {
        return {
          success: false,
          message: `Cache flush timed out for site ${siteId}`,
          details:
            'Consider increasing the timeout or checking network connectivity',
        };
      }

      if (errorMessage.includes('docker')) {
        return {
          success: false,
          message: `Docker error during cache flush for site ${siteId}`,
          details: 'Ensure Docker is running and accessible',
        };
      }

      return {
        success: false,
        message: `Cache flush failed for site ${siteId}: ${errorMessage}`,
        details: errorMessage,
      };
    }
  }

  static async flushMultipleSitesCache(
    siteIds: string[],
    environment: string,
    options: CacheFlushOptions = {}
  ): Promise<{
    successful: string[];
    failed: Array<{ siteId: string; error: string }>;
  }> {
    const successful: string[] = [];
    const failed: Array<{ siteId: string; error: string }> = [];

    for (const siteId of siteIds) {
      try {
        const result = await this.flushSiteCache(siteId, environment, options);

        if (result.success) {
          successful.push(siteId);
          if (options.verbose) {
            console.log(chalk.green(`    ✓ Cache flushed for site ${siteId}`));
          }
        } else {
          failed.push({ siteId, error: result.message });
          if (options.verbose) {
            console.log(
              chalk.yellow(
                `    ⚠ Cache flush failed for site ${siteId}: ${result.message}`
              )
            );
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        failed.push({ siteId, error: errorMessage });
        if (options.verbose) {
          console.log(
            chalk.red(
              `    ✗ Cache flush error for site ${siteId}: ${errorMessage}`
            )
          );
        }
      }
    }

    return { successful, failed };
  }

  static ringTerminalBell(): void {
    // Ring the terminal bell by writing the bell character (ASCII 7) to stdout
    process.stdout.write('\x07');
  }

  static async flushAllCache(
    environment: string,
    options: CacheFlushOptions = {}
  ): Promise<CacheFlushResult> {
    try {
      const envConfig = Config.getEnvironmentConfig(environment);
      const verbose = options.verbose || false;
      const timeout = options.timeout || 60;

      if (verbose) {
        console.log(
          chalk.gray(`  Flushing all object cache in ${environment}...`)
        );
      }

      // Use Docker to run WP-CLI cache flush for entire network
      const bashScript = [
        'cd /var/www/html',
        'wp core download',
        'wp config create --dbname="$WORDPRESS_DB_NAME" --dbuser="$WORDPRESS_DB_USER" --dbpass="$WORDPRESS_DB_PASSWORD" --dbhost="$WORDPRESS_DB_HOST"',
        'wp cache flush',
      ].join(' && ');

      const dockerCommand = `docker run --rm \\
        --memory=1g \\
        -e WORDPRESS_DB_HOST="${envConfig.host}" \\
        -e WORDPRESS_DB_USER="${envConfig.user}" \\
        -e WORDPRESS_DB_PASSWORD="${envConfig.password}" \\
        -e WORDPRESS_DB_NAME="${envConfig.database}" \\
        -e WP_CLI_PHP_ARGS="-d memory_limit=512M -d max_execution_time=${timeout}" \\
        wordpress:cli \\
        bash -c '${bashScript}'`;

      const output = execSync(dockerCommand, {
        encoding: 'utf8',
        stdio: verbose ? 'inherit' : 'pipe',
        shell: '/bin/bash',
        timeout: timeout * 1000,
      });

      if (verbose && output) {
        console.log(chalk.gray(`    Cache flush output: ${output.trim()}`));
      }

      return {
        success: true,
        message: `All cache flushed successfully in ${environment}`,
        details: output?.trim(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        message: `Cache flush failed in ${environment}: ${errorMessage}`,
        details: errorMessage,
      };
    }
  }
}
