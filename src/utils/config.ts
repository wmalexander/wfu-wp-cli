import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as crypto from 'crypto';

interface EnvironmentConfig {
  host?: string;
  user?: string;
  password?: string; // encrypted
  database?: string;
}

interface ConfigData {
  environments?: {
    dev?: EnvironmentConfig;
    uat?: EnvironmentConfig;
    pprd?: EnvironmentConfig;
    prod?: EnvironmentConfig;
  };
  migration?: {
    host?: string;
    user?: string;
    password?: string; // encrypted
    database?: string;
  };
  s3?: {
    bucket?: string;
    region?: string;
    prefix?: string;
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

    if (keys.length < 2) {
      throw new Error(
        'Invalid config key. Use format: env.<environment>.<key>, migration.<key>, or s3.<key>'
      );
    }

    const section = keys[0];

    if (section === 'env') {
      this.setEnvironmentConfig(config, keys, value);
    } else if (section === 'migration') {
      this.setMigrationConfig(config, keys, value);
    } else if (section === 's3') {
      this.setS3Config(config, keys, value);
    } else {
      throw new Error(
        'Invalid config section. Use: env.<environment>.<key>, migration.<key>, or s3.<key>'
      );
    }

    this.saveConfig(config);
  }

  private static setEnvironmentConfig(
    config: ConfigData,
    keys: string[],
    value: string
  ): void {
    if (keys.length !== 3) {
      throw new Error(
        'Invalid environment config key. Use format: env.<environment>.<key>'
      );
    }

    const environment = keys[1];
    const envKey = keys[2];

    if (!['dev', 'uat', 'pprd', 'prod'].includes(environment)) {
      throw new Error(
        'Invalid environment. Valid environments: dev, uat, pprd, prod'
      );
    }

    if (!['host', 'user', 'password', 'database'].includes(envKey)) {
      throw new Error(
        'Invalid environment config key. Valid keys: host, user, password, database'
      );
    }

    if (!config.environments) {
      config.environments = {};
    }

    if (
      !config.environments[
        environment as keyof NonNullable<ConfigData['environments']>
      ]
    ) {
      config.environments[
        environment as keyof NonNullable<ConfigData['environments']>
      ] = {};
    }

    const envConfig =
      config.environments[
        environment as keyof NonNullable<ConfigData['environments']>
      ]!;

    if (envKey === 'password') {
      envConfig[envKey as keyof EnvironmentConfig] = this.encrypt(value);
    } else {
      envConfig[envKey as keyof EnvironmentConfig] = value;
    }
  }

  private static setMigrationConfig(
    config: ConfigData,
    keys: string[],
    value: string
  ): void {
    if (keys.length !== 2) {
      throw new Error(
        'Invalid migration config key. Use format: migration.<key>'
      );
    }

    const migrationKey = keys[1];

    if (!['host', 'user', 'password', 'database'].includes(migrationKey)) {
      throw new Error(
        'Invalid migration config key. Valid keys: host, user, password, database'
      );
    }

    if (!config.migration) {
      config.migration = {};
    }

    if (migrationKey === 'password') {
      config.migration[
        migrationKey as keyof NonNullable<ConfigData['migration']>
      ] = this.encrypt(value);
    } else {
      config.migration[
        migrationKey as keyof NonNullable<ConfigData['migration']>
      ] = value;
    }
  }

  private static setS3Config(
    config: ConfigData,
    keys: string[],
    value: string
  ): void {
    if (keys.length !== 2) {
      throw new Error('Invalid S3 config key. Use format: s3.<key>');
    }

    const s3Key = keys[1];

    if (!['bucket', 'region', 'prefix'].includes(s3Key)) {
      throw new Error(
        'Invalid S3 config key. Valid keys: bucket, region, prefix'
      );
    }

    if (!config.s3) {
      config.s3 = {};
    }

    config.s3[s3Key as keyof NonNullable<ConfigData['s3']>] = value;
  }

  static get(key: string): string | undefined {
    const config = this.loadConfig();
    const keys = key.split('.');

    if (keys.length < 2) {
      throw new Error(
        'Invalid config key. Use format: env.<environment>.<key>, migration.<key>, or s3.<key>'
      );
    }

    const section = keys[0];

    if (section === 'env') {
      return this.getEnvironmentConfigValue(config, keys);
    } else if (section === 'migration') {
      return this.getMigrationConfigValue(config, keys);
    } else if (section === 's3') {
      return this.getS3ConfigValue(config, keys);
    } else {
      throw new Error(
        'Invalid config section. Use: env.<environment>.<key>, migration.<key>, or s3.<key>'
      );
    }
  }

  private static getEnvironmentConfigValue(
    config: ConfigData,
    keys: string[]
  ): string | undefined {
    if (keys.length !== 3) {
      throw new Error(
        'Invalid environment config key. Use format: env.<environment>.<key>'
      );
    }

    const environment = keys[1];
    const envKey = keys[2];

    if (
      !config.environments ||
      !config.environments[
        environment as keyof NonNullable<ConfigData['environments']>
      ]
    ) {
      return undefined;
    }

    const envConfig =
      config.environments[
        environment as keyof NonNullable<ConfigData['environments']>
      ];
    const value = envConfig?.[envKey as keyof EnvironmentConfig];

    if (!value) {
      return undefined;
    }

    if (envKey === 'password') {
      return this.decrypt(value);
    }

    return value;
  }

  private static getMigrationConfigValue(
    config: ConfigData,
    keys: string[]
  ): string | undefined {
    if (keys.length !== 2) {
      throw new Error(
        'Invalid migration config key. Use format: migration.<key>'
      );
    }

    const migrationKey = keys[1];

    if (!config.migration) {
      return undefined;
    }

    const value =
      config.migration[
        migrationKey as keyof NonNullable<ConfigData['migration']>
      ];

    if (!value) {
      return undefined;
    }

    if (migrationKey === 'password') {
      return this.decrypt(value);
    }

    return value;
  }

  private static getS3ConfigValue(
    config: ConfigData,
    keys: string[]
  ): string | undefined {
    if (keys.length !== 2) {
      throw new Error('Invalid S3 config key. Use format: s3.<key>');
    }

    const s3Key = keys[1];

    if (!config.s3) {
      return undefined;
    }

    return config.s3[s3Key as keyof NonNullable<ConfigData['s3']>];
  }

  static list(): ConfigData {
    const config = this.loadConfig();

    // Mask passwords in environments
    if (config.environments) {
      Object.keys(config.environments).forEach((env) => {
        const envConfig =
          config.environments![
            env as keyof NonNullable<ConfigData['environments']>
          ];
        if (envConfig?.password) {
          envConfig.password = '****';
        }
      });
    }

    // Mask password in migration config
    if (config.migration?.password) {
      config.migration.password = '****';
    }

    return config;
  }

  static reset(): void {
    this.ensureConfigDir();
    if (existsSync(this.CONFIG_FILE)) {
      writeFileSync(this.CONFIG_FILE, '{}');
    }
  }

  static getEnvironmentConfig(environment: string): EnvironmentConfig {
    const config = this.loadConfig();
    if (
      !config.environments ||
      !config.environments[
        environment as keyof NonNullable<ConfigData['environments']>
      ]
    ) {
      return {};
    }

    const envConfig =
      config.environments[
        environment as keyof NonNullable<ConfigData['environments']>
      ];
    return {
      host: envConfig?.host,
      user: envConfig?.user,
      password: envConfig?.password
        ? this.decrypt(envConfig.password)
        : undefined,
      database: envConfig?.database,
    };
  }

  static getMigrationDbConfig(): EnvironmentConfig {
    const config = this.loadConfig();
    if (!config.migration) {
      return {};
    }

    return {
      host: config.migration.host,
      user: config.migration.user,
      password: config.migration.password
        ? this.decrypt(config.migration.password)
        : undefined,
      database: config.migration.database,
    };
  }

  static getS3Config(): { bucket?: string; region?: string; prefix?: string } {
    const config = this.loadConfig();
    return config.s3 || {};
  }

  static hasRequiredEnvironmentConfig(environment: string): boolean {
    const envConfig = this.getEnvironmentConfig(environment);
    return !!(
      envConfig.host &&
      envConfig.user &&
      envConfig.password &&
      envConfig.database
    );
  }

  static hasRequiredMigrationConfig(): boolean {
    const migrationConfig = this.getMigrationDbConfig();
    return !!(
      migrationConfig.host &&
      migrationConfig.user &&
      migrationConfig.password &&
      migrationConfig.database
    );
  }

  static hasRequiredS3Config(): boolean {
    const s3Config = this.getS3Config();
    return !!s3Config.bucket;
  }

  static getValidEnvironments(): string[] {
    return ['dev', 'uat', 'pprd', 'prod'];
  }
}
