import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';

const CACHE_ROOT = join(tmpdir(), 'wfuwp-wp-cli-cache');

function cacheInitialized(cacheDir: string): boolean {
  return existsSync(join(cacheDir, 'wp-includes', 'version.php'));
}

/**
 * Ensures a reusable WordPress core directory exists for Docker-based WP-CLI runs.
 * Downloads core once (per version) into the host cache so each container can mount it
 * instead of pulling WordPress repeatedly.
 */
export async function ensureWpCliCache(
  version = 'latest',
  verbose = false
): Promise<string> {
  const cacheDir = join(CACHE_ROOT, version);

  if (cacheInitialized(cacheDir)) {
    return cacheDir;
  }

  mkdirSync(cacheDir, { recursive: true });

  const versionFlag = version !== 'latest' ? ` --version=${version}` : '';
  const downloadCommand = `docker run --rm \\
    -v "${cacheDir}:/var/www/html" \\
    wordpress:cli \\
    bash -c 'cd /var/www/html && wp core download${versionFlag} --skip-content --force'`;

  if (verbose) {
    console.log(
      chalk.gray(
        `  Preparing WordPress CLI cache (${version}): ${cacheDir}`
      )
    );
  }

  try {
    execSync(downloadCommand, {
      stdio: verbose ? 'inherit' : 'ignore',
      encoding: 'utf8',
      shell: '/bin/bash',
    });
  } catch (error) {
    throw new Error(
      `Failed to prepare WordPress CLI cache: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }

  if (!cacheInitialized(cacheDir)) {
    throw new Error('WordPress CLI cache was not initialized correctly');
  }

  return cacheDir;
}
