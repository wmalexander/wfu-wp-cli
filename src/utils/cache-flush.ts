import chalk from 'chalk';
import { DatabaseOperations } from './database';

export interface CacheFlushResult {
  success: boolean;
  message: string;
  flushId?: string;
}

export class CacheFlush {
  private static getEnvironmentMainUrl(environment: string): string {
    const urlMapping: Record<string, string> = {
      prod: 'https://www.wfu.edu',
      pprd: 'https://pprd.wfu.edu',
      uat: 'https://uat.wfu.edu',
      dev: 'https://dev.wfu.edu',
      local: 'https://localhost:8080',
    };

    return urlMapping[environment] || urlMapping.prod;
  }

  static async flushCache(
    targetEnvironment: string,
    options: { verbose?: boolean; dryRun?: boolean } = {}
  ): Promise<CacheFlushResult> {
    const flushId = Date.now().toString();

    if (options.verbose) {
      console.log(
        chalk.blue('Flushing cache for environment: ' + targetEnvironment)
      );
      console.log(chalk.gray('  Generated flush ID: ' + flushId));
    }

    if (options.dryRun) {
      return {
        success: true,
        message: 'Would flush cache with ID: ' + flushId,
        flushId,
      };
    }

    try {
      // Step 1: Update network option in database
      if (options.verbose) {
        console.log(chalk.gray('  Updating network option in database...'));
      }

      await DatabaseOperations.updateNetworkOption(
        targetEnvironment,
        'wfu_redis_cache_flush_id',
        flushId,
        options.verbose
      );

      // Verify the setting was actually stored
      if (options.verbose) {
        console.log(chalk.gray('  Verifying network option was stored...'));
      }

      const storedFlushId = await DatabaseOperations.getNetworkOption(
        targetEnvironment,
        'wfu_redis_cache_flush_id',
        options.verbose
      );

      if (storedFlushId !== flushId) {
        throw new Error(
          `Failed to verify flush ID storage. Expected: ${flushId}, Got: ${storedFlushId}`
        );
      }

      if (options.verbose) {
        console.log(chalk.green('  ✓ Flush ID verified in database'));
      }

      // Step 2: Make HTTP request to trigger cache flush
      if (options.verbose) {
        console.log(chalk.gray('  Triggering cache flush via HTTP request...'));
      }

      const mainUrl = this.getEnvironmentMainUrl(targetEnvironment);
      const flushUrl = `${mainUrl}/?flushid=${flushId}`;

      if (options.verbose) {
        console.log(chalk.gray('  Flush URL: ' + flushUrl));
      }

      // Make HTTP request to trigger flush
      const response = await this.makeFlushRequest(flushUrl, options.verbose);

      if (response.success) {
        return {
          success: true,
          message: `Cache flushed successfully for ${targetEnvironment}`,
          flushId,
        };
      } else {
        return {
          success: false,
          message: `Cache flush request failed: ${response.error}`,
          flushId,
        };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Cache flush failed: ${errorMessage}`,
        flushId,
      };
    }
  }

  private static async makeFlushRequest(
    url: string,
    verbose?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Use fetch if available (Node 18+), otherwise use https module
      if (typeof fetch !== 'undefined') {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (verbose) {
            console.log(
              chalk.gray(`  HTTP response status: ${response.status}`)
            );
          }

          return {
            success: response.ok,
            error: response.ok ? undefined : `HTTP ${response.status}`,
          };
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if ((fetchError as any).name === 'AbortError') {
            return {
              success: false,
              error: 'Request timeout',
            };
          }
          throw fetchError;
        }
      } else {
        // Fallback to https module for older Node versions
        return await this.makeFlushRequestWithHttps(url, verbose);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private static async makeFlushRequestWithHttps(
    url: string,
    verbose?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const https = require('https');
      const urlObj = new URL(url);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        timeout: 10000,
        // Accept self-signed certificates for development environments
        rejectUnauthorized: !url.includes('localhost') && !url.includes('dev.'),
      };

      const req = https.request(options, (res: any) => {
        if (verbose) {
          console.log(chalk.gray(`  HTTP response status: ${res.statusCode}`));
        }

        resolve({
          success: res.statusCode >= 200 && res.statusCode < 400,
          error: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : undefined,
        });
      });

      req.on('error', (error: Error) => {
        resolve({
          success: false,
          error: error.message,
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          error: 'Request timeout',
        });
      });

      req.end();
    });
  }
}
