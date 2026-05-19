import { Config } from '../src/utils/config';
import { existsSync, rmSync } from 'fs';
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
    it('sets and gets an environment host', () => {
      Config.set('env.dev.host', 'localhost');
      expect(Config.get('env.dev.host')).toBe('localhost');
    });

    it('sets and gets an environment user', () => {
      Config.set('env.dev.user', 'testuser');
      expect(Config.get('env.dev.user')).toBe('testuser');
    });

    it('encrypts and decrypts passwords transparently', () => {
      Config.set('env.dev.password', 'secret123');
      expect(Config.get('env.dev.password')).toBe('secret123');
    });

    it('sets and gets a database name', () => {
      Config.set('env.dev.database', 'wp_test');
      expect(Config.get('env.dev.database')).toBe('wp_test');
    });

    it('returns undefined for unset keys', () => {
      expect(Config.get('env.dev.host')).toBeUndefined();
    });

    it('throws for an invalid section', () => {
      expect(() => Config.set('invalid.key', 'value')).toThrow();
      expect(() => Config.get('invalid.key')).toThrow();
    });
  });

  describe('list', () => {
    it('lists configuration with the password masked', () => {
      Config.set('env.dev.host', 'localhost');
      Config.set('env.dev.user', 'testuser');
      Config.set('env.dev.password', 'secret123');
      Config.set('env.dev.database', 'wp_test');

      const config = Config.list();
      expect(config.environments?.dev?.host).toBe('localhost');
      expect(config.environments?.dev?.user).toBe('testuser');
      expect(config.environments?.dev?.password).toBe('****');
      expect(config.environments?.dev?.database).toBe('wp_test');
    });

    it('returns an empty object when no config exists', () => {
      expect(Config.list()).toEqual({});
    });
  });

  describe('reset', () => {
    it('clears configuration', () => {
      Config.set('env.dev.host', 'localhost');
      Config.reset();
      expect(Config.get('env.dev.host')).toBeUndefined();
    });
  });

  describe('getEnvironmentConfig', () => {
    it('returns the full decrypted environment configuration', () => {
      Config.set('env.dev.host', 'localhost');
      Config.set('env.dev.user', 'testuser');
      Config.set('env.dev.password', 'secret123');
      Config.set('env.dev.database', 'wp_test');

      expect(Config.getEnvironmentConfig('dev')).toEqual(
        expect.objectContaining({
          host: 'localhost',
          user: 'testuser',
          password: 'secret123',
          database: 'wp_test',
        })
      );
    });

    it('returns an empty object when no config exists', () => {
      expect(Config.getEnvironmentConfig('dev')).toEqual({});
    });
  });

  describe('hasRequiredEnvironmentConfig', () => {
    it('is true when all required fields are set', () => {
      Config.set('env.dev.host', 'localhost');
      Config.set('env.dev.user', 'testuser');
      Config.set('env.dev.password', 'secret123');
      Config.set('env.dev.database', 'wp_test');

      expect(Config.hasRequiredEnvironmentConfig('dev')).toBe(true);
    });

    it('is false when fields are missing', () => {
      Config.set('env.dev.host', 'localhost');
      Config.set('env.dev.user', 'testuser');

      expect(Config.hasRequiredEnvironmentConfig('dev')).toBe(false);
    });

    it('is false when no config exists', () => {
      expect(Config.hasRequiredEnvironmentConfig('dev')).toBe(false);
    });
  });
});
