import { execSync } from 'child_process';
import chalk from 'chalk';
import { findOrphanedDirectories } from './cleanup-utils';

export interface DiskUsage {
  total: number;
  used: number;
  available: number;
  usagePercent: number;
  path: string;
}

export interface DiskSpaceCheck {
  usage: DiskUsage;
  hasOrphanedDirs: boolean;
  orphanedDirCount: number;
  orphanedDirSize: number;
  needsCleanup: boolean;
  criticallyLow: boolean;
  warning?: string;
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function getDiskUsage(path: string): DiskUsage {
  try {
    const result = execSync(`df -k "${path}"`, { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    const dataLine = lines[lines.length - 1];
    const parts = dataLine.split(/\s+/);

    const total = parseInt(parts[1], 10) * 1024; // Convert from KB to bytes
    const used = parseInt(parts[2], 10) * 1024;
    const available = parseInt(parts[3], 10) * 1024;
    const usagePercent = Math.round((used / total) * 100);

    return { total, used, available, usagePercent, path };
  } catch (error) {
    throw new Error(`Failed to get disk usage for ${path}: ${error}`);
  }
}

export async function checkDiskSpace(
  path: string = '/tmp',
  autoCleanup: boolean = false
): Promise<DiskSpaceCheck> {
  const usage = getDiskUsage(path);
  const orphanedDirs = findOrphanedDirectories(path, 24); // 24 hours old

  const orphanedDirSize = orphanedDirs.reduce((sum, dir) => sum + dir.size, 0);
  const hasOrphanedDirs = orphanedDirs.length > 0;
  const criticallyLow = usage.usagePercent >= 95;
  const needsCleanup = usage.usagePercent >= 85 && hasOrphanedDirs;

  let warning: string | undefined;

  if (criticallyLow) {
    warning = `Disk space critically low (${usage.usagePercent}%). Migration may fail.`;
  } else if (usage.usagePercent >= 90) {
    warning = `Disk space very low (${usage.usagePercent}%). Consider cleaning up.`;
  } else if (needsCleanup) {
    warning = `Disk usage high (${usage.usagePercent}%) with ${orphanedDirs.length} orphaned directories (${formatBytes(orphanedDirSize)}).`;
  }

  const result: DiskSpaceCheck = {
    usage,
    hasOrphanedDirs,
    orphanedDirCount: orphanedDirs.length,
    orphanedDirSize,
    needsCleanup,
    criticallyLow,
    warning,
  };

  // Auto cleanup if requested and needed
  if (autoCleanup && needsCleanup && orphanedDirs.length > 0) {
    console.log(
      chalk.yellow(
        `⚠ Auto-cleaning ${orphanedDirs.length} orphaned directories to free space...`
      )
    );

    let freedSpace = 0;
    let cleanedCount = 0;

    for (const dir of orphanedDirs) {
      try {
        require('fs').rmSync(dir.path, { recursive: true, force: true });
        freedSpace += dir.size;
        cleanedCount++;
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Could not remove ${dir.name}`));
      }
    }

    if (cleanedCount > 0) {
      console.log(
        chalk.green(
          `✓ Auto-cleanup freed ${formatBytes(freedSpace)} by removing ${cleanedCount} directories`
        )
      );

      // Update disk usage after cleanup
      const newUsage = getDiskUsage(path);
      result.usage = newUsage;
      result.hasOrphanedDirs = false;
      result.orphanedDirCount = 0;
      result.orphanedDirSize = 0;
      result.needsCleanup = false;
      result.criticallyLow = newUsage.usagePercent >= 95;

      if (result.criticallyLow) {
        result.warning = `Disk space still critically low (${newUsage.usagePercent}%) after cleanup.`;
      } else if (newUsage.usagePercent >= 90) {
        result.warning = `Disk space still very low (${newUsage.usagePercent}%) after cleanup.`;
      } else {
        result.warning = undefined;
      }
    }
  }

  return result;
}

export function displayDiskSpaceStatus(
  check: DiskSpaceCheck,
  verbose: boolean = false
): void {
  const { usage, warning } = check;

  console.log(
    chalk.gray(
      `Disk usage: ${usage.usagePercent}% (${formatBytes(usage.used)} / ${formatBytes(usage.total)})`
    )
  );

  if (check.hasOrphanedDirs) {
    console.log(
      chalk.gray(
        `Orphaned migration directories: ${check.orphanedDirCount} (${formatBytes(check.orphanedDirSize)})`
      )
    );
  }

  if (warning) {
    const color = check.criticallyLow ? chalk.red : chalk.yellow;
    console.log(color(`⚠ ${warning}`));

    if (check.hasOrphanedDirs) {
      console.log(chalk.cyan(`  Tip: Run 'wfuwp cleanup' to free up space`));
    }
  }

  if (verbose && check.hasOrphanedDirs) {
    console.log(
      chalk.gray(`  Run 'wfuwp cleanup --dry-run' to see what can be cleaned`)
    );
  }
}

export function shouldBlockMigration(check: DiskSpaceCheck): boolean {
  // Block migration if critically low (95%+) and no cleanup possible
  return check.criticallyLow && !check.hasOrphanedDirs;
}
