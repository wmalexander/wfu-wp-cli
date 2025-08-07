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
      Config.set('db.host', 'localhost');
      expect(Config.get('db.host')).toBe('localhost');
    });

    it('should set and get database user', () => {
      Config.set('db.user', 'testuser');
      expect(Config.get('db.user')).toBe('testuser');
    });

    it('should encrypt and decrypt passwords', () => {
      const password = 'secret123';
      Config.set('db.password', password);
      expect(Config.get('db.password')).toBe(password);
    });

    it('should set and get database name', () => {
      Config.set('db.name', 'wp_test');
      expect(Config.get('db.name')).toBe('wp_test');
    });

    it('should return undefined for unset keys', () => {
      expect(Config.get('db.host')).toBeUndefined();
    });

    it('should throw error for invalid keys', () => {
      expect(() => Config.set('invalid.key', 'value')).toThrow();
      expect(() => Config.get('invalid.key')).toThrow();
    });
  });

  describe('list', () => {
    it('should list all configuration with masked password', () => {
      Config.set('db.host', 'localhost');
      Config.set('db.user', 'testuser');
      Config.set('db.password', 'secret123');
      Config.set('db.name', 'wp_test');

      const config = Config.list();
      expect(config.db?.host).toBe('localhost');
      expect(config.db?.user).toBe('testuser');
      expect(config.db?.password).toBe('****');
      expect(config.db?.name).toBe('wp_test');
    });

    it('should return empty object when no config exists', () => {
      const config = Config.list();
      expect(config).toEqual({});
    });
  });

  describe('reset', () => {
    it('should reset configuration', () => {
      Config.set('db.host', 'localhost');
      Config.reset();
      expect(Config.get('db.host')).toBeUndefined();
    });
  });

  describe('getDbConfig', () => {
    it('should return complete database configuration', () => {
      Config.set('db.host', 'localhost');
      Config.set('db.user', 'testuser');
      Config.set('db.password', 'secret123');
      Config.set('db.name', 'wp_test');

      const dbConfig = Config.getDbConfig();
      expect(dbConfig).toEqual({
        host: 'localhost',
        user: 'testuser',
        password: 'secret123',
        name: 'wp_test'
      });
    });

    it('should return empty object when no config exists', () => {
      const dbConfig = Config.getDbConfig();
      expect(dbConfig).toEqual({});
    });
  });

  describe('hasRequiredDbConfig', () => {
    it('should return true when all required fields are set', () => {
      Config.set('db.host', 'localhost');
      Config.set('db.user', 'testuser');
      Config.set('db.password', 'secret123');
      Config.set('db.name', 'wp_test');

      expect(Config.hasRequiredDbConfig()).toBe(true);
    });

    it('should return false when fields are missing', () => {
      Config.set('db.host', 'localhost');
      Config.set('db.user', 'testuser');
      
      expect(Config.hasRequiredDbConfig()).toBe(false);
    });

    it('should return false when no config exists', () => {
      expect(Config.hasRequiredDbConfig()).toBe(false);
    });
  });
});