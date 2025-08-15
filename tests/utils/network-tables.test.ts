import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('../../src/utils/config');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;

describe('NetworkTableOperations', () => {
  let NetworkTableOperations: any;
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

  describe('getNetworkTables', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/network-tables');
      NetworkTableOperations = module.NetworkTableOperations;
    });

    it('should return all network table definitions', () => {
      const tables = NetworkTableOperations.getNetworkTables();
      
      expect(Array.isArray(tables)).toBe(true);
      expect(tables.length).toBeGreaterThan(0);
      
      // Check required tables are present
      const tableNames = tables.map((table: any) => table.name);
      expect(tableNames).toContain('wp_blogs');
      expect(tableNames).toContain('wp_site');
      expect(tableNames).toContain('wp_sitemeta');
      expect(tableNames).toContain('wp_blogmeta');
    });

    it('should have correct table structure', () => {
      const tables = NetworkTableOperations.getNetworkTables();
      
      tables.forEach((table: any) => {
        expect(table).toHaveProperty('name');
        expect(table).toHaveProperty('type');
        expect(table).toHaveProperty('description');
        expect(table).toHaveProperty('migrateable');
        
        expect(typeof table.name).toBe('string');
        expect(['core', 'meta', 'user', 'registration']).toContain(table.type);
        expect(typeof table.description).toBe('string');
        expect(typeof table.migrateable).toBe('boolean');
      });
    });

    it('should identify migrateable vs non-migrateable tables', () => {
      const tables = NetworkTableOperations.getNetworkTables();
      
      const migrateableTables = tables.filter((table: any) => table.migrateable);
      const nonMigrateableTables = tables.filter((table: any) => !table.migrateable);
      
      expect(migrateableTables.length).toBeGreaterThan(0);
      expect(nonMigrateableTables.length).toBeGreaterThan(0);
      
      // Check specific tables
      expect(migrateableTables.map((t: any) => t.name)).toContain('wp_blogs');
      expect(nonMigrateableTables.map((t: any) => t.name)).toContain('wp_users');
    });
  });

  describe('getMigrateableTables', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/network-tables');
      NetworkTableOperations = module.NetworkTableOperations;
    });

    it('should return only migrateable tables', () => {
      const migrateableTables = NetworkTableOperations.getMigrateableTables();
      
      expect(Array.isArray(migrateableTables)).toBe(true);
      expect(migrateableTables.every((table: any) => table.migrateable)).toBe(true);
      
      const tableNames = migrateableTables.map((table: any) => table.name);
      expect(tableNames).toContain('wp_blogs');
      expect(tableNames).toContain('wp_site');
      expect(tableNames).toContain('wp_sitemeta');
      expect(tableNames).toContain('wp_blogmeta');
      
      // Should not contain non-migrateable tables
      expect(tableNames).not.toContain('wp_users');
      expect(tableNames).not.toContain('wp_usermeta');
    });
  });

  describe('exportNetworkTables', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/network-tables');
      NetworkTableOperations = module.NetworkTableOperations;
    });

    it('should export network tables successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockReturnValue(undefined);
      mockExecSync.mockReturnValue(''); // Successful mysqldump

      const result = await NetworkTableOperations.exportNetworkTables('prod', '/tmp/export.sql');
      
      expect(result).toEqual({
        filePath: '/tmp/export.sql',
        tableCount: expect.any(Number),
        fileSize: expect.any(Number)
      });
      
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('mysqldump'),
        expect.any(Object)
      );
    });

    it('should throw error for unconfigured environment', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(false);
      
      await expect(
        NetworkTableOperations.exportNetworkTables('invalid', '/tmp/export.sql')
      ).rejects.toThrow("Environment 'invalid' is not configured");
    });

    it('should handle mysqldump errors', async () => {
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
        throw new Error('mysqldump failed');
      });

      await expect(
        NetworkTableOperations.exportNetworkTables('prod', '/tmp/export.sql')
      ).rejects.toThrow('mysqldump failed');
    });

    it('should create output directory if needed', async () => {
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

      await NetworkTableOperations.exportNetworkTables('prod', '/path/to/export.sql');
      
      expect(mockMkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
    });
  });

  describe('importNetworkTables', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/network-tables');
      NetworkTableOperations = module.NetworkTableOperations;
    });

    it('should import network tables successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue(''); // Successful mysql import

      const result = await NetworkTableOperations.importNetworkTables('prod', '/tmp/import.sql');
      
      expect(result).toEqual({
        success: true,
        tableCount: expect.any(Number)
      });
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('mysql'),
        expect.any(Object)
      );
    });

    it('should throw error for missing import file', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      
      mockExistsSync.mockReturnValue(false);
      
      await expect(
        NetworkTableOperations.importNetworkTables('prod', '/tmp/missing.sql')
      ).rejects.toThrow('Import file does not exist');
    });

    it('should handle mysql import errors', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => {
        throw new Error('mysql import failed');
      });

      await expect(
        NetworkTableOperations.importNetworkTables('prod', '/tmp/import.sql')
      ).rejects.toThrow('mysql import failed');
    });
  });

  describe('backupNetworkTables', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/network-tables');
      NetworkTableOperations = module.NetworkTableOperations;
    });

    it('should create backup successfully', async () => {
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

      const result = await NetworkTableOperations.backupNetworkTables('prod', '/tmp/backup.sql');
      
      expect(result).toEqual({
        filePath: '/tmp/backup.sql',
        tableCount: expect.any(Number),
        fileSize: expect.any(Number)
      });
    });
  });

  describe('transformNetworkData', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/network-tables');
      NetworkTableOperations = module.NetworkTableOperations;
    });

    it('should transform domain and URL data', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockReturnValue('');

      const transformations = {
        'old-domain.com': 'new-domain.com',
        'old-site.com': 'new-site.com'
      };

      await NetworkTableOperations.transformNetworkData('prod', '/tmp/data.sql', transformations);
      
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('wp search-replace'),
        expect.any(Object)
      );
    });

    it('should handle transformation errors', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExistsSync.mockReturnValue(true);
      mockExecSync.mockImplementation(() => {
        throw new Error('wp search-replace failed');
      });

      const transformations = {
        'old-domain.com': 'new-domain.com'
      };

      await expect(
        NetworkTableOperations.transformNetworkData('prod', '/tmp/data.sql', transformations)
      ).rejects.toThrow('wp search-replace failed');
    });
  });

  describe('validateNetworkTables', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/network-tables');
      NetworkTableOperations = module.NetworkTableOperations;
    });

    it('should validate existing network tables', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock SQL query showing tables exist
      mockExecSync.mockReturnValue('wp_blogs\nwp_site\nwp_sitemeta\nwp_blogmeta');

      const result = await NetworkTableOperations.validateNetworkTables('prod');
      
      expect(result.isValid).toBe(true);
      expect(result.missingTables).toHaveLength(0);
      expect(result.existingTables.length).toBeGreaterThan(0);
    });

    it('should detect missing network tables', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock SQL query showing only some tables exist
      mockExecSync.mockReturnValue('wp_blogs');

      const result = await NetworkTableOperations.validateNetworkTables('prod');
      
      expect(result.isValid).toBe(false);
      expect(result.missingTables.length).toBeGreaterThan(0);
      expect(result.missingTables).toContain('wp_site');
    });
  });
});