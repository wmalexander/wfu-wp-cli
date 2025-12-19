import { execSync } from 'child_process';
import chalk from 'chalk';

interface MigrationDbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

const CONTAINER_NAME =
  process.env.WF_MIGRATION_DB_CONTAINER || 'wfuwp-migration-db';
const MYSQL_IMAGE = process.env.WF_MIGRATION_DB_IMAGE || 'mysql:8.0';
const HOST_PORT = parseInt(
  process.env.WF_MIGRATION_DB_PORT || '23306',
  10
);
const DB_NAME = process.env.WF_MIGRATION_DB_NAME || 'wp_migration';
const DB_USER = process.env.WF_MIGRATION_DB_USER || 'wfuwp';
const DB_PASSWORD =
  process.env.WF_MIGRATION_DB_PASSWORD || 'wfuwp_local_pass';
const ROOT_PASSWORD =
  process.env.WF_MIGRATION_DB_ROOT_PASSWORD || 'wfuwp_root_pass';

let cachedConfig: MigrationDbConfig | null = null;

function runCommand(command: string, verbose = false): string {
  return execSync(command, {
    stdio: verbose ? 'inherit' : 'pipe',
    encoding: 'utf8',
    shell: '/bin/bash',
  }).trim();
}

function containerExists(): boolean {
  try {
    const result = execSync(
      `docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format "{{.ID}}"`,
      { encoding: 'utf8', stdio: 'pipe', shell: '/bin/bash' }
    ).trim();
    return result.length > 0;
  } catch {
    return false;
  }
}

function containerIsRunning(): boolean {
  try {
    const status = execSync(
      `docker ps --filter "name=^/${CONTAINER_NAME}$" --format "{{.Status}}"`,
      { encoding: 'utf8', stdio: 'pipe', shell: '/bin/bash' }
    ).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

function startContainer(verbose = false): void {
  if (!containerExists()) {
    if (verbose) {
      console.log(
        chalk.gray(`  Starting local migration database (${CONTAINER_NAME})`)
      );
    }

    const runArgs = [
      'docker run -d',
      `--name ${CONTAINER_NAME}`,
      '--health-cmd "mysqladmin ping -u root -p${MYSQL_ROOT_PASSWORD} || exit 1"',
      '--health-interval 10s',
      '--health-timeout 5s',
      '--health-retries 5',
      `-e MYSQL_ROOT_PASSWORD="${ROOT_PASSWORD}"`,
      `-e MYSQL_DATABASE="${DB_NAME}"`,
      `-e MYSQL_USER="${DB_USER}"`,
      `-e MYSQL_PASSWORD="${DB_PASSWORD}"`,
      `-p 127.0.0.1:${HOST_PORT}:3306`,
      `${MYSQL_IMAGE}`,
      '--default-authentication-plugin=mysql_native_password',
      '--max-allowed-packet=1073741824',
      '--character-set-server=utf8mb4',
      '--collation-server=utf8mb4_unicode_ci',
    ];

    // Run command with root password substitution in health check
    const command = runArgs
      .join(' ')
      .replace('${MYSQL_ROOT_PASSWORD}', ROOT_PASSWORD);

    runCommand(command, verbose);
  } else if (!containerIsRunning()) {
    if (verbose) {
      console.log(
        chalk.gray(`  Restarting local migration database (${CONTAINER_NAME})`)
      );
    }
    runCommand(`docker start ${CONTAINER_NAME}`, verbose);
  }
}

function waitForContainerReady(verbose = false): void {
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      execSync(
        `docker exec -e MYSQL_PWD="${DB_PASSWORD}" ${CONTAINER_NAME} mysql -u ${DB_USER} ${DB_NAME} -e "SELECT 1"`,
        {
          stdio: 'ignore',
          shell: '/bin/bash',
        }
      );
      return;
    } catch {
      if (attempt === maxAttempts) {
        throw new Error('Timed out waiting for local migration database');
      }
      if (verbose) {
        console.log(
          chalk.gray(
            `  Waiting for local migration database to become ready... (${attempt}/${maxAttempts})`
          )
        );
      }
      execSync('sleep 1', { stdio: 'ignore', shell: '/bin/bash' });
    }
  }
}

export function ensureLocalMigrationDb(
  verbose = false
): MigrationDbConfig {
  if (cachedConfig) {
    return { ...cachedConfig };
  }

  // Ensure Docker is available
  try {
    execSync('docker --version', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Docker is required to manage the local migration database. Please install Docker and try again.'
    );
  }

  startContainer(verbose);
  waitForContainerReady(verbose);

  cachedConfig = {
    host: '127.0.0.1',
    port: HOST_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
  };

  return { ...cachedConfig };
}

export function getLocalMigrationDbConfig(): MigrationDbConfig | null {
  return cachedConfig ? { ...cachedConfig } : null;
}

export function stopLocalMigrationDb(verbose = false): void {
  if (!containerExists()) {
    return;
  }

  if (verbose) {
    console.log(chalk.gray(`  Stopping local migration database`));
  }

  runCommand(`docker stop ${CONTAINER_NAME}`, verbose);
}
