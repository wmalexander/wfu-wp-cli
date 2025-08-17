import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export interface OrphanedDirectory {
  path: string;
  name: string;
  size: number;
  ageHours: number;
  lastModified: Date;
}

export function getDirectorySize(dirPath: string): number {
  try {
    // Use -sk for compatibility with both Linux and macOS
    const result = execSync(`du -sk "${dirPath}"`, { encoding: 'utf8' });
    const kilobytes = parseInt(result.split('\t')[0], 10);
    return kilobytes * 1024; // Convert KB to bytes
  } catch (error) {
    // Fallback to manual calculation if du fails
    try {
      let totalSize = 0;
      const items = readdirSync(dirPath);

      for (const item of items) {
        const fullPath = join(dirPath, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          totalSize += getDirectorySize(fullPath);
        } else {
          totalSize += stat.size;
        }
      }

      return totalSize;
    } catch (fallbackError) {
      return 0;
    }
  }
}

export function findOrphanedDirectories(
  basePath: string,
  olderThanHours: number
): OrphanedDirectory[] {
  const orphaned: OrphanedDirectory[] = [];

  if (!existsSync(basePath)) {
    return orphaned;
  }

  try {
    const items = readdirSync(basePath);
    const migrationDirs = items.filter(
      (item) =>
        item.startsWith('wp-migrate-') ||
        item.startsWith('wp-env-migrate-') ||
        item.startsWith('wp-ec2-local-export-')
    );

    for (const dir of migrationDirs) {
      const fullPath = join(basePath, dir);

      try {
        const stat = statSync(fullPath);
        if (!stat.isDirectory()) continue;

        const ageMs = Date.now() - stat.mtime.getTime();
        const ageHours = ageMs / (1000 * 60 * 60);

        if (ageHours >= olderThanHours) {
          const size = getDirectorySize(fullPath);

          orphaned.push({
            path: fullPath,
            name: dir,
            size,
            ageHours,
            lastModified: stat.mtime,
          });
        }
      } catch (error) {
        // Skip directories we can't analyze
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }

  return orphaned.sort((a, b) => b.size - a.size); // Sort by size descending
}
