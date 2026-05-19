import { execSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { BackupRecovery, BackupMetadata } from '../../src/utils/backup-recovery';

jest.mock('child_process');
jest.mock('fs');
jest.mock('../../src/utils/site-enumerator');
jest.mock('../../src/utils/network-tables');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<
  typeof writeFileSync
>;

function sampleMetadata(overrides: Partial<BackupMetadata> = {}): BackupMetadata {
  return {
    timestamp: '2026-05-19T12:00:00.000Z',
    environment: 'prod',
    backupId: 'backup-2026-05-19T12-00-00-abc123',
    networkTables: ['wp_blogs'],
    sites: [1],
    totalSize: 100,
    backupPaths: {
      networkTablesFile: '/b/network.sql',
      sitesFiles: { 1: '/b/site-1.sql' },
      metadataFile: '/b/metadata.json',
    },
    checksums: {},
    ...overrides,
  };
}

describe('BackupRecovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateBackupId', () => {
    it('produces a backup- prefixed id', () => {
      expect(BackupRecovery.generateBackupId()).toMatch(/^backup-[\dT-]+-[a-z0-9]+$/);
    });

    it('produces distinct ids on repeated calls', () => {
      const a = BackupRecovery.generateBackupId();
      const b = BackupRecovery.generateBackupId();
      expect(a).not.toEqual(b);
    });
  });

  describe('getBackupDirectory', () => {
    it('returns the explicit workDir, creating it when missing', () => {
      mockExistsSync.mockReturnValue(false);
      const dir = BackupRecovery.getBackupDirectory('/tmp/custom');
      expect(dir).toBe('/tmp/custom');
      expect(mockMkdirSync).toHaveBeenCalledWith('/tmp/custom', {
        recursive: true,
      });
    });

    it('does not recreate an existing explicit workDir', () => {
      mockExistsSync.mockReturnValue(true);
      const dir = BackupRecovery.getBackupDirectory('/tmp/custom');
      expect(dir).toBe('/tmp/custom');
      expect(mockMkdirSync).not.toHaveBeenCalled();
    });

    it('defaults to ~/.wfuwp/backups when no workDir is given', () => {
      mockExistsSync.mockReturnValue(true);
      expect(BackupRecovery.getBackupDirectory()).toMatch(
        /\.wfuwp[/\\]backups$/
      );
    });
  });

  describe('verifyBackupIntegrity', () => {
    it('is valid when all referenced files exist and no checksums', () => {
      mockExistsSync.mockReturnValue(true);
      const result = BackupRecovery.verifyBackupIntegrity(sampleMetadata());
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('reports missing metadata and site files', () => {
      mockExistsSync.mockReturnValue(false);
      const result = BackupRecovery.verifyBackupIntegrity(sampleMetadata());
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'Metadata file missing',
          'Network tables backup file missing',
          expect.stringContaining('Site 1 backup file missing'),
        ])
      );
    });

    it('flags a checksum mismatch', () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue('deadbeef  /b/site-1.sql' as any);
      const result = BackupRecovery.verifyBackupIntegrity(
        sampleMetadata({ checksums: { 'site-1.sql': 'expected123' } })
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Checksum mismatch for site-1.sql');
    });
  });

  describe('listAvailableBackups', () => {
    it('parses metadata.json from backup subdirectories, newest first', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([
        { name: 'backup-old', isDirectory: () => true },
        { name: 'backup-new', isDirectory: () => true },
        { name: 'a-file', isDirectory: () => false },
      ] as any);
      mockReadFileSync.mockImplementation((p: any) =>
        p.includes('backup-old')
          ? JSON.stringify(sampleMetadata({ timestamp: '2026-01-01T00:00:00.000Z' }))
          : JSON.stringify(sampleMetadata({ timestamp: '2026-05-01T00:00:00.000Z' }))
      );
      const list = BackupRecovery.listAvailableBackups('/tmp/b');
      expect(list).toHaveLength(2);
      expect(new Date(list[0].timestamp).getTime()).toBeGreaterThan(
        new Date(list[1].timestamp).getTime()
      );
    });

    it('returns an empty array when the directory cannot be read', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(BackupRecovery.listAvailableBackups('/tmp/missing')).toEqual([]);
    });
  });

  describe('deleteBackup', () => {
    it('returns false when the backup directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      await expect(BackupRecovery.deleteBackup('backup-x', '/tmp/b')).resolves.toBe(
        false
      );
    });

    it('removes the directory and returns true on success', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue('' as any);
      await expect(BackupRecovery.deleteBackup('backup-x', '/tmp/b')).resolves.toBe(
        true
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('rm -rf')
      );
    });

    it('returns false when removal fails', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => {
        throw new Error('rm failed');
      });
      await expect(BackupRecovery.deleteBackup('backup-x', '/tmp/b')).resolves.toBe(
        false
      );
    });
  });

  describe('createFullEnvironmentBackup', () => {
    it('returns a result carrying a generated backupId and the environment', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue('' as any);
      mockWriteFileSync.mockReturnValue(undefined);
      const result = await BackupRecovery.createFullEnvironmentBackup('prod', {
        workDir: '/tmp/b',
        sites: [],
        skipNetworkTables: true,
      });
      expect(result.backupId).toMatch(/^backup-/);
      expect(result.metadata.environment).toBe('prod');
      expect(result.metadata.backupPaths.metadataFile).toContain(
        result.backupId
      );
    });
  });
});
