import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('../../src/utils/config');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;

describe('BackupRecovery', () => {
  let BackupRecovery: any;
  let Config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to get fresh imports
    jest.resetModules();
    
    // Mock Config module
    Config = {
      getEnvironmentConfig: jest.fn(),
      hasRequiredEnvironmentConfig: jest.fn(),
    };
    
    require('../../src/utils/config').Config = Config;
  });

  describe('createEnvironmentBackup', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/backup-recovery');
      BackupRecovery = module.BackupRecovery;
    });

    it('should create environment backup successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockReturnValue(undefined);
      mockExecSync.mockReturnValue(''); // Successful backup

      const result = await BackupRecovery.createEnvironmentBackup('prod', '/tmp/backup');
      
      expect(result).toEqual({
        backupPath: expect.stringContaining('/tmp/backup'),
        tableCount: expect.any(Number),
        fileSize: expect.any(Number),
        timestamp: expect.any(String),
        environment: 'prod'
      });
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('mysqldump'),
        expect.any(Object)
      );
    });

    it('should throw error for unconfigured environment', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(false);
      
      await expect(
        BackupRecovery.createEnvironmentBackup('invalid', '/tmp/backup')
      ).rejects.toThrow("Environment 'invalid' is not configured");
    });

    it('should handle backup failures', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockReturnValue(undefined);
      mockExecSync.mockImplementation(() => {
        throw new Error('Backup failed');
      });

      await expect(
        BackupRecovery.createEnvironmentBackup('prod', '/tmp/backup')
      ).rejects.toThrow('Backup failed');
    });

    it('should create backup directory if needed', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockReturnValue(undefined);
      mockExecSync.mockReturnValue('');

      await BackupRecovery.createEnvironmentBackup('prod', '/path/to/backup');
      
      expect(mockMkdirSync).toHaveBeenCalledWith('/path/to/backup', { recursive: true });
    });
  });

  describe('restoreFromBackup', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/backup-recovery');
      BackupRecovery = module.BackupRecovery;
    });

    it('should restore from backup successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue(''); // Successful restore

      const result = await BackupRecovery.restoreFromBackup('prod', '/tmp/backup.sql');
      
      expect(result).toEqual({
        success: true,
        restoredTables: expect.any(Number),
        environment: 'prod'
      });
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('mysql'),
        expect.any(Object)
      );
    });

    it('should throw error for missing backup file', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      
      mockExistsSync.mockReturnValue(false);
      
      await expect(
        BackupRecovery.restoreFromBackup('prod', '/tmp/missing.sql')
      ).rejects.toThrow('Backup file does not exist');
    });

    it('should handle restore failures', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => {
        throw new Error('Restore failed');
      });

      await expect(
        BackupRecovery.restoreFromBackup('prod', '/tmp/backup.sql')
      ).rejects.toThrow('Restore failed');
    });
  });

  describe('validateBackupIntegrity', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/backup-recovery');
      BackupRecovery = module.BackupRecovery;
    });

    it('should validate backup integrity successfully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue('wp_blogs\nwp_site\nwp_sitemeta'); // Mock SQL content check

      const result = await BackupRecovery.validateBackupIntegrity('/tmp/backup.sql');
      
      expect(result).toEqual({
        isValid: true,
        fileExists: true,
        hasContent: true,
        tableCount: expect.any(Number),
        fileSize: expect.any(Number)
      });
    });

    it('should detect missing backup file', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await BackupRecovery.validateBackupIntegrity('/tmp/missing.sql');
      
      expect(result.isValid).toBe(false);
      expect(result.fileExists).toBe(false);
    });

    it('should detect empty backup file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue(''); // Empty content

      const result = await BackupRecovery.validateBackupIntegrity('/tmp/empty.sql');
      
      expect(result.isValid).toBe(false);
      expect(result.hasContent).toBe(false);
    });
  });

  describe('cleanupOldBackups', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/backup-recovery');
      BackupRecovery = module.BackupRecovery;
    });

    it('should cleanup old backups successfully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue('backup1.sql\nbackup2.sql\nold_backup.sql'); // Mock ls output

      const result = await BackupRecovery.cleanupOldBackups('/tmp/backups', 5);
      
      expect(result).toEqual({
        cleanedCount: expect.any(Number),
        remainingCount: expect.any(Number),
        freedSpace: expect.any(Number)
      });
    });

    it('should handle non-existent backup directory', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await BackupRecovery.cleanupOldBackups('/tmp/missing', 5);
      
      expect(result.cleanedCount).toBe(0);
      expect(result.remainingCount).toBe(0);
    });
  });

  describe('createRecoveryPlan', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/backup-recovery');
      BackupRecovery = module.BackupRecovery;
    });

    it('should create recovery plan', () => {
      const migrationConfig = {
        sourceEnv: 'prod',
        targetEnv: 'uat',
        siteIds: [1, 2, 3],
        backupPath: '/tmp/backup.sql'
      };

      const plan = BackupRecovery.createRecoveryPlan(migrationConfig);
      
      expect(plan).toEqual({
        steps: expect.arrayContaining([
          expect.objectContaining({
            order: expect.any(Number),
            action: expect.any(String),
            description: expect.any(String)
          })
        ]),
        estimatedTime: expect.any(Number),
        backupPath: '/tmp/backup.sql',
        environment: 'uat'
      });
    });
  });
});