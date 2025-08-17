import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

export type SiteStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'timeout';

export interface SiteProgress {
  siteId: number;
  status: SiteStatus;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  attempts: number;
  lastAttemptTime?: Date;
  estimatedSize?: number;
  actualSize?: number;
}

export interface MigrationPhaseProgress {
  phase:
    | 'preflight'
    | 'network_tables'
    | 'sites'
    | 'post_migration'
    | 'cleanup';
  status: SiteStatus;
  startTime?: Date;
  endTime?: Date;
  error?: string;
}

export interface MigrationState {
  migrationId: string;
  version: string;
  sourceEnv: string;
  targetEnv: string;
  startTime: Date;
  endTime?: Date;
  status:
    | 'initializing'
    | 'running'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'paused';
  currentPhase: string;
  phases: MigrationPhaseProgress[];
  sites: Map<number, SiteProgress>;
  totalSites: number;
  completedSites: number;
  failedSites: number;
  skippedSites: number;
  timeoutSites: number;
  backupId?: string;
  workDir: string;
  logDir: string;
  options: any;
  lastSaveTime: Date;
  processId: number;
  estimatedDuration?: number;
  actualDuration?: number;
}

export interface MigrationSummary {
  migrationId: string;
  sourceEnv: string;
  targetEnv: string;
  status: string;
  startTime: Date;
  endTime?: Date;
  totalSites: number;
  completedSites: number;
  failedSites: number;
  timeoutSites: number;
  duration?: number;
  canResume: boolean;
}

export interface ResumeOptions {
  skipFailed?: boolean;
  skipTimeouts?: boolean;
  retryFailed?: boolean;
  onlyFailed?: boolean;
}

export class MigrationStateManager {
  private static readonly STATE_VERSION = '1.0.0';
  private static readonly STATE_FILE = 'migration-state.json';
  private static readonly CONFIG_FILE = 'migration-config.json';
  private static readonly LOCK_FILE = '.migration-lock';
  private static readonly PROGRESS_LOG = 'migration-progress.log';
  private static readonly SUMMARY_FILE = 'migration-summary.json';

  static generateMigrationId(): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const random = Math.random().toString(36).substring(2, 8);
    return `env-migrate-${timestamp}-${random}`;
  }

  static getLogsDirectory(): string {
    const wfuwpDir = join(homedir(), '.wfuwp');
    const logsDir = join(wfuwpDir, 'migration-logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
    return logsDir;
  }

  static getLegacyLogsDirectory(): string {
    return join(process.cwd(), 'logs');
  }

  static getStateDirectoryInfo(): { current: string; legacy: string } {
    return {
      current: this.getLogsDirectory(),
      legacy: this.getLegacyLogsDirectory(),
    };
  }

  static getMigrationDirectory(migrationId: string): string {
    return join(this.getLogsDirectory(), migrationId);
  }

  static createMigrationState(
    sourceEnv: string,
    targetEnv: string,
    sitesToMigrate: number[],
    options: any
  ): MigrationState {
    const migrationId = this.generateMigrationId();
    const logDir = this.getMigrationDirectory(migrationId);

    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const sites = new Map<number, SiteProgress>();
    sitesToMigrate.forEach((siteId) => {
      sites.set(siteId, {
        siteId,
        status: 'pending',
        attempts: 0,
      });
    });

    const state: MigrationState = {
      migrationId,
      version: this.STATE_VERSION,
      sourceEnv,
      targetEnv,
      startTime: new Date(),
      status: 'initializing',
      currentPhase: 'preflight',
      phases: [
        { phase: 'preflight', status: 'pending' },
        { phase: 'network_tables', status: 'pending' },
        { phase: 'sites', status: 'pending' },
        { phase: 'post_migration', status: 'pending' },
        { phase: 'cleanup', status: 'pending' },
      ],
      sites,
      totalSites: sitesToMigrate.length,
      completedSites: 0,
      failedSites: 0,
      skippedSites: 0,
      timeoutSites: 0,
      workDir: options.workDir || '/tmp',
      logDir,
      options,
      lastSaveTime: new Date(),
      processId: process.pid,
    };

    this.saveState(state);
    this.saveConfig(state, options);
    this.createLockFile(state);

    return state;
  }

  static saveState(state: MigrationState): void {
    state.lastSaveTime = new Date();
    const stateFile = join(state.logDir, this.STATE_FILE);

    const serializedState = {
      ...state,
      sites: Array.from(state.sites.entries()),
    };

    writeFileSync(stateFile, JSON.stringify(serializedState, null, 2));
  }

  static loadState(migrationId: string): MigrationState | null {
    const logDir = this.getMigrationDirectory(migrationId);
    const stateFile = join(logDir, this.STATE_FILE);

    let actualStateFile = stateFile;

    if (!existsSync(stateFile)) {
      const legacyLogDir = join(this.getLegacyLogsDirectory(), migrationId);
      const legacyStateFile = join(legacyLogDir, this.STATE_FILE);

      if (existsSync(legacyStateFile)) {
        actualStateFile = legacyStateFile;
        console.log(
          chalk.yellow(
            `⚠ Found migration state in legacy location: ${legacyStateFile}`
          )
        );
        console.log(
          chalk.cyan(
            'Consider running migration state cleanup to move to new location'
          )
        );
      } else {
        return null;
      }
    }

    try {
      const data = JSON.parse(readFileSync(actualStateFile, 'utf8'));

      const state: MigrationState = {
        ...data,
        startTime: new Date(data.startTime),
        endTime: data.endTime ? new Date(data.endTime) : undefined,
        lastSaveTime: new Date(data.lastSaveTime),
        sites: new Map(
          data.sites.map(([id, progress]: [number, any]) => [
            id,
            {
              ...progress,
              startTime: progress.startTime
                ? new Date(progress.startTime)
                : undefined,
              endTime: progress.endTime
                ? new Date(progress.endTime)
                : undefined,
              lastAttemptTime: progress.lastAttemptTime
                ? new Date(progress.lastAttemptTime)
                : undefined,
            },
          ])
        ),
        phases: data.phases.map((phase: any) => ({
          ...phase,
          startTime: phase.startTime ? new Date(phase.startTime) : undefined,
          endTime: phase.endTime ? new Date(phase.endTime) : undefined,
        })),
      };

      return state;
    } catch (error) {
      console.warn(
        chalk.yellow(
          `Warning: Could not load migration state: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      return null;
    }
  }

  static saveConfig(state: MigrationState, options: any): void {
    const configFile = join(state.logDir, this.CONFIG_FILE);
    writeFileSync(
      configFile,
      JSON.stringify(
        {
          migrationId: state.migrationId,
          sourceEnv: state.sourceEnv,
          targetEnv: state.targetEnv,
          timestamp: state.startTime,
          options,
        },
        null,
        2
      )
    );
  }

  static createLockFile(state: MigrationState): void {
    const lockFile = join(state.logDir, this.LOCK_FILE);
    const lockData = {
      migrationId: state.migrationId,
      processId: process.pid,
      startTime: state.startTime,
      sourceEnv: state.sourceEnv,
      targetEnv: state.targetEnv,
    };
    writeFileSync(lockFile, JSON.stringify(lockData, null, 2));
  }

  static removeLockFile(state: MigrationState): void {
    const lockFile = join(state.logDir, this.LOCK_FILE);
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
    }
  }

  static checkForActiveMigration(): string | null {
    const { readdirSync } = require('fs');

    const checkDirectory = (logsDir: string): string | null => {
      if (!existsSync(logsDir)) {
        return null;
      }

      const entries = readdirSync(logsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('env-migrate-')) {
          const lockFile = join(logsDir, entry.name, this.LOCK_FILE);
          if (existsSync(lockFile)) {
            try {
              const lockData = JSON.parse(readFileSync(lockFile, 'utf8'));
              if (this.isProcessRunning(lockData.processId)) {
                return entry.name;
              } else {
                unlinkSync(lockFile);
              }
            } catch (error) {
              unlinkSync(lockFile);
            }
          }
        }
      }
      return null;
    };

    return (
      checkDirectory(this.getLogsDirectory()) ||
      checkDirectory(this.getLegacyLogsDirectory())
    );
  }

  static findIncompleteMigrations(): MigrationSummary[] {
    const { readdirSync } = require('fs');
    const incompleteMigrations: MigrationSummary[] = [];

    const checkDirectory = (logsDir: string) => {
      if (!existsSync(logsDir)) {
        return;
      }

      const entries = readdirSync(logsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('env-migrate-')) {
          const state = this.loadState(entry.name);
          if (state && !this.isMigrationComplete(state)) {
            const lockFile = join(state.logDir, this.LOCK_FILE);
            const hasActiveLock =
              existsSync(lockFile) && this.isProcessRunning(state.processId);

            incompleteMigrations.push({
              migrationId: state.migrationId,
              sourceEnv: state.sourceEnv,
              targetEnv: state.targetEnv,
              status: state.status,
              startTime: state.startTime,
              endTime: state.endTime,
              totalSites: state.totalSites,
              completedSites: state.completedSites,
              failedSites: state.failedSites,
              timeoutSites: state.timeoutSites,
              duration: state.endTime
                ? state.endTime.getTime() - state.startTime.getTime()
                : Date.now() - state.startTime.getTime(),
              canResume: !hasActiveLock,
            });
          }
        }
      }
    };

    checkDirectory(this.getLogsDirectory());
    checkDirectory(this.getLegacyLogsDirectory());

    return incompleteMigrations.sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime()
    );
  }

  static updateSiteStatus(
    state: MigrationState,
    siteId: number,
    status: SiteStatus,
    error?: string
  ): void {
    const site = state.sites.get(siteId);
    if (!site) {
      throw new Error(`Site ${siteId} not found in migration state`);
    }

    const previousStatus = site.status;
    site.status = status;
    site.lastAttemptTime = new Date();

    if (status === 'in_progress') {
      site.startTime = new Date();
      site.attempts += 1;
    } else if (
      status === 'completed' ||
      status === 'failed' ||
      status === 'skipped' ||
      status === 'timeout'
    ) {
      site.endTime = new Date();
      if (error) {
        site.error = error;
      }
    }

    if (status === 'timeout') {
      if (previousStatus !== 'timeout') {
        state.timeoutSites += 1;
      }
    } else if (status === 'failed') {
      if (previousStatus !== 'failed') {
        state.failedSites += 1;
      }
    } else if (status === 'completed') {
      if (previousStatus !== 'completed') {
        state.completedSites += 1;
        if (previousStatus === 'failed') {
          state.failedSites -= 1;
        } else if (previousStatus === 'timeout') {
          state.timeoutSites -= 1;
        }
      }
    } else if (status === 'skipped') {
      if (previousStatus !== 'skipped') {
        state.skippedSites += 1;
        if (previousStatus === 'failed') {
          state.failedSites -= 1;
        } else if (previousStatus === 'timeout') {
          state.timeoutSites -= 1;
        }
      }
    }

    this.saveState(state);
  }

  static updatePhaseStatus(
    state: MigrationState,
    phase: string,
    status: SiteStatus,
    error?: string
  ): void {
    const phaseProgress = state.phases.find((p) => p.phase === phase);
    if (!phaseProgress) {
      throw new Error(`Phase ${phase} not found in migration state`);
    }

    phaseProgress.status = status;
    if (status === 'in_progress') {
      phaseProgress.startTime = new Date();
      state.currentPhase = phase;
    } else if (status === 'completed' || status === 'failed') {
      phaseProgress.endTime = new Date();
      if (error) {
        phaseProgress.error = error;
      }
    }

    this.saveState(state);
  }

  static getSitesToProcess(
    state: MigrationState,
    resumeOptions: ResumeOptions = {}
  ): number[] {
    const sites: number[] = [];

    for (const [siteId, progress] of state.sites) {
      if (progress.status === 'completed') {
        continue;
      }

      if (
        progress.status === 'failed' &&
        resumeOptions.skipFailed &&
        !resumeOptions.onlyFailed
      ) {
        continue;
      }

      if (
        progress.status === 'timeout' &&
        resumeOptions.skipTimeouts &&
        !resumeOptions.onlyFailed
      ) {
        continue;
      }

      if (
        resumeOptions.onlyFailed &&
        progress.status !== 'failed' &&
        progress.status !== 'timeout'
      ) {
        continue;
      }

      sites.push(siteId);
    }

    return sites.sort((a, b) => a - b);
  }

  static markMigrationComplete(
    state: MigrationState,
    status: 'completed' | 'failed' | 'cancelled'
  ): void {
    state.status = status;
    state.endTime = new Date();
    state.actualDuration = state.endTime.getTime() - state.startTime.getTime();

    this.saveState(state);
    this.saveSummary(state);
    this.removeLockFile(state);
  }

  static saveSummary(state: MigrationState): void {
    const summaryFile = join(state.logDir, this.SUMMARY_FILE);
    const summary = {
      migrationId: state.migrationId,
      sourceEnv: state.sourceEnv,
      targetEnv: state.targetEnv,
      status: state.status,
      startTime: state.startTime,
      endTime: state.endTime,
      duration: state.actualDuration,
      totalSites: state.totalSites,
      completedSites: state.completedSites,
      failedSites: state.failedSites,
      skippedSites: state.skippedSites,
      timeoutSites: state.timeoutSites,
      phases: state.phases,
      failedSiteDetails: Array.from(state.sites.values())
        .filter((site) => site.status === 'failed' || site.status === 'timeout')
        .map((site) => ({
          siteId: site.siteId,
          status: site.status,
          error: site.error,
          attempts: site.attempts,
        })),
    };

    writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  }

  static appendToLog(state: MigrationState, message: string): void {
    const logFile = join(state.logDir, this.PROGRESS_LOG);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;

    require('fs').appendFileSync(logFile, logEntry);
  }

  private static isMigrationComplete(state: MigrationState): boolean {
    return (
      state.status === 'completed' ||
      state.status === 'failed' ||
      state.status === 'cancelled'
    );
  }

  private static isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }
}
