import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as crypto from 'crypto';

interface ConfigData {
  db?: {
    host?: string;
    user?: string;
    password?: string;
    name?: string;
  };
}

export class Config {
  private static readonly CONFIG_DIR = join(homedir(), '.wfuwp');
  private static readonly CONFIG_FILE = join(Config.CONFIG_DIR, 'config.json');
  private static readonly ENCRYPTION_KEY = 'wfuwp-config-key-v1';

  private static ensureConfigDir(): void {
    if (!existsSync(this.CONFIG_DIR)) {
      mkdirSync(this.CONFIG_DIR, { recursive: true });
    }
  }

  private static encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.ENCRYPTION_KEY, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private static decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.ENCRYPTION_KEY, 'salt', 32);
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private static loadConfig(): ConfigData {
    this.ensureConfigDir();

    if (!existsSync(this.CONFIG_FILE)) {
      return {};
    }

    try {
      const configContent = readFileSync(this.CONFIG_FILE, 'utf8');
      return JSON.parse(configContent);
    } catch (error) {
      console.warn('Warning: Could not read config file, using empty config');
      return {};
    }
  }

  private static saveConfig(config: ConfigData): void {
    this.ensureConfigDir();
    writeFileSync(this.CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  static set(key: string, value: string): void {
    const config = this.loadConfig();
    const keys = key.split('.');

    if (keys.length !== 2 || keys[0] !== 'db') {
      throw new Error(
        'Invalid config key. Use format: db.host, db.user, db.password, or db.name'
      );
    }

    if (!config.db) {
      config.db = {};
    }

    const dbKey = keys[1] as keyof NonNullable<ConfigData['db']>;
    if (!['host', 'user', 'password', 'name'].includes(dbKey)) {
      throw new Error(
        'Invalid database config key. Valid keys: host, user, password, name'
      );
    }

    if (dbKey === 'password') {
      config.db[dbKey] = this.encrypt(value);
    } else {
      config.db[dbKey] = value;
    }

    this.saveConfig(config);
  }

  static get(key: string): string | undefined {
    const config = this.loadConfig();
    const keys = key.split('.');

    if (keys.length !== 2 || keys[0] !== 'db') {
      throw new Error(
        'Invalid config key. Use format: db.host, db.user, db.password, or db.name'
      );
    }

    const dbKey = keys[1] as keyof NonNullable<ConfigData['db']>;
    if (!config.db || !config.db[dbKey]) {
      return undefined;
    }

    if (dbKey === 'password') {
      return this.decrypt(config.db[dbKey]!);
    }

    return config.db[dbKey];
  }

  static list(): ConfigData {
    const config = this.loadConfig();
    if (config.db?.password) {
      config.db.password = '****';
    }
    return config;
  }

  static reset(): void {
    this.ensureConfigDir();
    if (existsSync(this.CONFIG_FILE)) {
      writeFileSync(this.CONFIG_FILE, '{}');
    }
  }

  static getDbConfig(): {
    host?: string;
    user?: string;
    password?: string;
    name?: string;
  } {
    const config = this.loadConfig();
    if (!config.db) {
      return {};
    }

    return {
      host: config.db.host,
      user: config.db.user,
      password: config.db.password
        ? this.decrypt(config.db.password)
        : undefined,
      name: config.db.name,
    };
  }

  static hasRequiredDbConfig(): boolean {
    const dbConfig = this.getDbConfig();
    return !!(
      dbConfig.host &&
      dbConfig.user &&
      dbConfig.password &&
      dbConfig.name
    );
  }
}
