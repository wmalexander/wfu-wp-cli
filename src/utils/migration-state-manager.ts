import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

interface MigrationState {
  id: string;
  sourceEnv: string;
  targetEnv: string;
  startTime: Date;
  lastUpdate: Date;
  status: 'running' | 'paused' | 'failed' | 'completed';
  completedSites: number[];
  failedSites: Array<{
    siteId: number;
    error: string;
    attemptCount: number;
    lastAttempt: Date;
  }>;
  skippedSites: number[];
  networkTablesCompleted: boolean;
  totalSites: number;
  options: any;
  consecutiveFailures: number;
  lastHealthCheck: Date;
}

interface MigrationIndex {
  migrations: Array<{
    id: string;
    sourceEnv: string;
    targetEnv: string;
    startTime: string;
    status: string;
    totalSites: number;
    completedSites: number;
    failedSites: number;
  }>;
}

export class MigrationStateManager {
  private static readonly MIGRATIONS_DIR = join(
    homedir(),
    '.wfuwp',
    'migrations'
  );
  private static readonly INDEX_FILE = join(
    MigrationStateManager.MIGRATIONS_DIR,
    'index.json'
  );

  static ensureMigrationsDir(): void {
    if (!existsSync(MigrationStateManager.MIGRATIONS_DIR)) {
      mkdirSync(MigrationStateManager.MIGRATIONS_DIR, { recursive: true });
    }
  }

  static generateMigrationId(sourceEnv: string, targetEnv: string): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    return `${sourceEnv}-to-${targetEnv}-${timestamp}`;
  }

  static createMigration(
    sourceEnv: string,
    targetEnv: string,
    totalSites: number,
    options: any
  ): MigrationState {
    const id = this.generateMigrationId(sourceEnv, targetEnv);
    const now = new Date();

    const migration: MigrationState = {
      id,
      sourceEnv,
      targetEnv,
      startTime: now,
      lastUpdate: now,
      status: 'running',
      completedSites: [],
      failedSites: [],
      skippedSites: [],
      networkTablesCompleted: false,
      totalSites,
      options,
      consecutiveFailures: 0,
      lastHealthCheck: now,
    };

    this.saveMigration(migration);
    this.updateIndex(migration);

    return migration;
  }

  static saveMigration(migration: MigrationState): void {
    this.ensureMigrationsDir();

    const migrationDir = join(
      MigrationStateManager.MIGRATIONS_DIR,
      migration.id
    );
    if (!existsSync(migrationDir)) {
      mkdirSync(migrationDir, { recursive: true });
    }

    // Save main state
    const statePath = join(migrationDir, 'state.json');
    writeFileSync(statePath, JSON.stringify(migration, null, 2));

    // Save completed sites list for quick access
    const completedPath = join(migrationDir, 'completed.json');
    writeFileSync(
      completedPath,
      JSON.stringify(migration.completedSites, null, 2)
    );

    // Save failed sites with details
    const failedPath = join(migrationDir, 'failed.json');
    writeFileSync(failedPath, JSON.stringify(migration.failedSites, null, 2));

    // Save original options
    const optionsPath = join(migrationDir, 'options.json');
    writeFileSync(optionsPath, JSON.stringify(migration.options, null, 2));
  }

  static loadMigration(migrationId: string): MigrationState | null {
    const migrationDir = join(
      MigrationStateManager.MIGRATIONS_DIR,
      migrationId
    );
    const statePath = join(migrationDir, 'state.json');

    if (!existsSync(statePath)) {
      return null;
    }

    try {
      const stateContent = readFileSync(statePath, 'utf8');
      const migration = JSON.parse(stateContent) as MigrationState;

      // Convert date strings back to Date objects
      migration.startTime = new Date(migration.startTime);
      migration.lastUpdate = new Date(migration.lastUpdate);
      migration.lastHealthCheck = new Date(migration.lastHealthCheck);

      migration.failedSites.forEach((failed) => {
        failed.lastAttempt = new Date(failed.lastAttempt);
      });

      return migration;
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Warning: Could not load migration state ${migrationId}: ${error}`
        )
      );
      return null;
    }
  }

  static updateMigration(migration: MigrationState): void {
    migration.lastUpdate = new Date();
    this.saveMigration(migration);
    this.updateIndex(migration);
  }

  static markSiteCompleted(migration: MigrationState, siteId: number): void {
    if (!migration.completedSites.includes(siteId)) {
      migration.completedSites.push(siteId);
    }

    // Remove from failed sites if it was there
    migration.failedSites = migration.failedSites.filter(
      (f) => f.siteId !== siteId
    );

    // Reset consecutive failures on success
    migration.consecutiveFailures = 0;

    this.updateMigration(migration);
  }

  static markSiteFailed(
    migration: MigrationState,
    siteId: number,
    error: string
  ): void {
    const existingFailure = migration.failedSites.find(
      (f) => f.siteId === siteId
    );

    if (existingFailure) {
      existingFailure.attemptCount++;
      existingFailure.error = error;
      existingFailure.lastAttempt = new Date();
    } else {
      migration.failedSites.push({
        siteId,
        error,
        attemptCount: 1,
        lastAttempt: new Date(),
      });
    }

    migration.consecutiveFailures++;
    this.updateMigration(migration);
  }

  static markNetworkTablesCompleted(migration: MigrationState): void {
    migration.networkTablesCompleted = true;
    this.updateMigration(migration);
  }

  static updateStatus(
    migration: MigrationState,
    status: MigrationState['status']
  ): void {
    migration.status = status;
    this.updateMigration(migration);
  }

  static getRemainingSites(
    migration: MigrationState,
    allSites: number[]
  ): number[] {
    return allSites.filter(
      (siteId) => !migration.completedSites.includes(siteId)
    );
  }

  static getRetryableSites(
    migration: MigrationState,
    maxAttempts: number = 3
  ): number[] {
    return migration.failedSites
      .filter((failed) => failed.attemptCount < maxAttempts)
      .map((failed) => failed.siteId);
  }

  static listMigrations(): MigrationIndex {
    this.ensureMigrationsDir();

    if (!existsSync(MigrationStateManager.INDEX_FILE)) {
      return { migrations: [] };
    }

    try {
      const indexContent = readFileSync(
        MigrationStateManager.INDEX_FILE,
        'utf8'
      );
      return JSON.parse(indexContent) as MigrationIndex;
    } catch (error) {
      console.warn(
        chalk.yellow(`Warning: Could not read migration index: ${error}`)
      );
      return { migrations: [] };
    }
  }

  static getLatestMigration(): MigrationState | null {
    const index = this.listMigrations();

    if (index.migrations.length === 0) {
      return null;
    }

    // Sort by start time (most recent first)
    const sorted = index.migrations.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

    return this.loadMigration(sorted[0].id);
  }

  static getLatestIncompleteMigration(): MigrationState | null {
    const index = this.listMigrations();

    // Find the most recent migration that is not completed
    const incomplete = index.migrations
      .filter((m) => m.status !== 'completed')
      .sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );

    if (incomplete.length === 0) {
      return null;
    }

    return this.loadMigration(incomplete[0].id);
  }

  private static updateIndex(migration: MigrationState): void {
    const index = this.listMigrations();

    // Remove existing entry for this migration
    index.migrations = index.migrations.filter((m) => m.id !== migration.id);

    // Add updated entry
    index.migrations.push({
      id: migration.id,
      sourceEnv: migration.sourceEnv,
      targetEnv: migration.targetEnv,
      startTime: migration.startTime.toISOString(),
      status: migration.status,
      totalSites: migration.totalSites,
      completedSites: migration.completedSites.length,
      failedSites: migration.failedSites.length,
    });

    writeFileSync(
      MigrationStateManager.INDEX_FILE,
      JSON.stringify(index, null, 2)
    );
  }

  static getMigrationSummary(migration: MigrationState): string {
    const elapsed = Date.now() - migration.startTime.getTime();
    const elapsedMinutes = Math.floor(elapsed / 60000);
    const completionPercentage = Math.round(
      (migration.completedSites.length / migration.totalSites) * 100
    );

    return [
      `Migration: ${migration.id}`,
      `  Source: ${migration.sourceEnv} → Target: ${migration.targetEnv}`,
      `  Status: ${migration.status}`,
      `  Progress: ${migration.completedSites.length}/${migration.totalSites} sites (${completionPercentage}%)`,
      `  Failed: ${migration.failedSites.length} sites`,
      `  Runtime: ${elapsedMinutes} minutes`,
      `  Network tables: ${migration.networkTablesCompleted ? 'completed' : 'pending'}`,
    ].join('\n');
  }

  static cleanupOldMigrations(keepDays: number = 30): void {
    this.ensureMigrationsDir();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - keepDays);

    try {
      const entries = readdirSync(MigrationStateManager.MIGRATIONS_DIR);

      for (const entry of entries) {
        if (entry === 'index.json') continue;

        const migration = this.loadMigration(entry);
        if (
          migration &&
          migration.startTime < cutoffDate &&
          migration.status === 'completed'
        ) {
          // In a real implementation, you'd recursively delete the directory
          // For now, just log what would be cleaned
          console.log(chalk.gray(`Would cleanup old migration: ${entry}`));
        }
      }
    } catch (error) {
      console.warn(
        chalk.yellow(`Warning: Could not cleanup old migrations: ${error}`)
      );
    }
  }
}
