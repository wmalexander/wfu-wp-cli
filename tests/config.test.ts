import { Config } from '../src/utils/config';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

describe('Config', () => {
  const testConfigDir = join(homedir(), '.wfuwp-test');
  const originalConfigDir = (Config as any).CONFIG_DIR;

  beforeAll(() => {
    (Config as any).CONFIG_DIR = testConfigDir;
    (Config as any).CONFIG_FILE = join(testConfigDir, 'config.json');
  });

  afterAll(() => {
    (Config as any).CONFIG_DIR = originalConfigDir;
    (Config as any).CONFIG_FILE = join(originalConfigDir, 'config.json');
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('set and get', () => {
    it('should set and get database host', () => {
      Config.set('migration.host', 'localhost');
      expect(Config.get('migration.host')).toBe('localhost');
    });

    it('should set and get database user', () => {
      Config.set('migration.user', 'testuser');
      expect(Config.get('migration.user')).toBe('testuser');
    });

    it('should encrypt and decrypt passwords', () => {
      const password = 'secret123';
      Config.set('migration.password', password);
      expect(Config.get('migration.password')).toBe(password);
    });

    it('should set and get database name', () => {
      Config.set('migration.database', 'wp_test');
      expect(Config.get('migration.database')).toBe('wp_test');
    });

    it('should return undefined for unset keys', () => {
      expect(Config.get('migration.host')).toBeUndefined();
    });

    it('should throw error for invalid keys', () => {
      expect(() => Config.set('invalid.key', 'value')).toThrow();
      expect(() => Config.get('invalid.key')).toThrow();
    });
  });

  describe('list', () => {
    it('should list all configuration with masked password', () => {
      Config.set('migration.host', 'localhost');
      Config.set('migration.user', 'testuser');
      Config.set('migration.password', 'secret123');
      Config.set('migration.database', 'wp_test');

      const config = Config.list();
      expect(config.migration?.host).toBe('localhost');
      expect(config.migration?.user).toBe('testuser');
      expect(config.migration?.password).toBe('****');
      expect(config.migration?.database).toBe('wp_test');
    });

    it('should return empty object when no config exists', () => {
      const config = Config.list();
      expect(config).toEqual({});
    });
  });

  describe('reset', () => {
    it('should reset configuration', () => {
      Config.set('migration.host', 'localhost');
      Config.reset();
      expect(Config.get('migration.host')).toBeUndefined();
    });
  });

  describe('getDbConfig', () => {
    it('should return complete database configuration', () => {
      Config.set('migration.host', 'localhost');
      Config.set('migration.user', 'testuser');
      Config.set('migration.password', 'secret123');
      Config.set('migration.database', 'wp_test');

      const dbConfig = Config.getMigrationDbConfig();
      expect(dbConfig).toEqual({
        host: 'localhost',
        user: 'testuser',
        password: 'secret123',
        database: 'wp_test'
      });
    });

    it('should return empty object when no config exists', () => {
      const dbConfig = Config.getMigrationDbConfig();
      expect(dbConfig).toEqual({});
    });
  });

  describe('hasRequiredDbConfig', () => {
    it('should return true when all required fields are set', () => {
      Config.set('migration.host', 'localhost');
      Config.set('migration.user', 'testuser');
      Config.set('migration.password', 'secret123');
      Config.set('migration.database', 'wp_test');

      expect(Config.hasRequiredMigrationConfig()).toBe(true);
    });

    it('should return false when fields are missing', () => {
      Config.set('migration.host', 'localhost');
      Config.set('migration.user', 'testuser');
      
      expect(Config.hasRequiredMigrationConfig()).toBe(false);
    });

    it('should return false when no config exists', () => {
      expect(Config.hasRequiredMigrationConfig()).toBe(false);
    });
  });
});