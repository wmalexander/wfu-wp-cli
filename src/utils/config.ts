import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as crypto from 'crypto';

interface EnvironmentConfig {
  host?: string;
  port?: string;
  user?: string;
  password?: string; // encrypted
  database?: string;
}

export interface LocalConfig {
  workspaceDir?: string;
  defaultPort?: number;
  defaultEnvironment?: string;
  autoStart?: boolean;
  backupBeforeRefresh?: boolean;
}

interface ConfigData {
  environments?: {
    dev?: EnvironmentConfig;
    uat?: EnvironmentConfig;
    pprd?: EnvironmentConfig;
    prod?: EnvironmentConfig;
    local?: EnvironmentConfig;
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
  backup?: {
    localPath?: string;
  };
  clickup?: {
    token?: string; // encrypted
    defaultListId?: string;
    defaultWorkspaceId?: string;
  };
  local?: LocalConfig;
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
        'Invalid config key. Use format: env.<environment>.<key>, migration.<key>, s3.<key>, backup.<key>, clickup.<key>, or local.<key>'
      );
    }

    const section = keys[0];

    if (section === 'env') {
      this.setEnvironmentConfig(config, keys, value);
    } else if (section === 'migration') {
      this.setMigrationConfig(config, keys, value);
    } else if (section === 's3') {
      this.setS3Config(config, keys, value);
    } else if (section === 'backup') {
      this.setBackupConfig(config, keys, value);
    } else if (section === 'clickup') {
      this.setClickUpConfig(config, keys, value);
    } else if (section === 'local') {
      this.setLocalConfig(config, keys, value);
    } else {
      throw new Error(
        'Invalid config section. Use: env.<environment>.<key>, migration.<key>, s3.<key>, backup.<key>, clickup.<key>, or local.<key>'
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

    if (!this.getValidEnvironments().includes(environment)) {
      throw new Error(
        'Invalid environment. Valid environments: ' + this.getValidEnvironments().join(', ')
      );
    }

    if (!['host', 'port', 'user', 'password', 'database'].includes(envKey)) {
      throw new Error(
        'Invalid environment config key. Valid keys: host, port, user, password, database'
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

  private static setBackupConfig(
    config: ConfigData,
    keys: string[],
    value: string
  ): void {
    if (keys.length !== 2) {
      throw new Error('Invalid backup config key. Use format: backup.<key>');
    }

    const backupKey = keys[1];

    if (!['localPath'].includes(backupKey)) {
      throw new Error('Invalid backup config key. Valid keys: localPath');
    }

    if (!config.backup) {
      config.backup = {};
    }

    config.backup[backupKey as keyof NonNullable<ConfigData['backup']>] = value;
  }

  private static setClickUpConfig(
    config: ConfigData,
    keys: string[],
    value: string
  ): void {
    if (keys.length !== 2) {
      throw new Error('Invalid ClickUp config key. Use format: clickup.<key>');
    }

    const clickupKey = keys[1];

    if (
      !['token', 'defaultListId', 'defaultWorkspaceId'].includes(clickupKey)
    ) {
      throw new Error(
        'Invalid ClickUp config key. Valid keys: token, defaultListId, defaultWorkspaceId'
      );
    }

    if (!config.clickup) {
      config.clickup = {};
    }

    if (clickupKey === 'token') {
      config.clickup[clickupKey as keyof NonNullable<ConfigData['clickup']>] =
        this.encrypt(value);
    } else {
      config.clickup[clickupKey as keyof NonNullable<ConfigData['clickup']>] =
        value;
    }
  }

  private static setLocalConfig(
    config: ConfigData,
    keys: string[],
    value: string
  ): void {
    if (keys.length !== 2) {
      throw new Error('Invalid local config key. Use format: local.<key>');
    }

    const localKey = keys[1];

    if (
      ![
        'workspaceDir',
        'defaultPort',
        'defaultEnvironment',
        'autoStart',
        'backupBeforeRefresh',
      ].includes(localKey)
    ) {
      throw new Error(
        'Invalid local config key. Valid keys: workspaceDir, defaultPort, defaultEnvironment, autoStart, backupBeforeRefresh'
      );
    }

    if (!config.local) {
      config.local = {};
    }

    if (localKey === 'defaultPort') {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error('defaultPort must be a valid port number (1-65535)');
      }
      config.local.defaultPort = port;
    } else if (localKey === 'autoStart' || localKey === 'backupBeforeRefresh') {
      const boolValue = value.toLowerCase();
      if (!['true', 'false'].includes(boolValue)) {
        throw new Error(`${localKey} must be either 'true' or 'false'`);
      }
      (config.local as any)[localKey] = boolValue === 'true';
    } else if (localKey === 'defaultEnvironment') {
      if (!['dev', 'uat', 'pprd', 'prod'].includes(value)) {
        throw new Error(
          'defaultEnvironment must be one of: dev, uat, pprd, prod'
        );
      }
      (config.local as any)[localKey] = value;
    } else {
      (config.local as any)[localKey] = value;
    }
  }

  static get(key: string): string | undefined {
    const config = this.loadConfig();
    const keys = key.split('.');

    if (keys.length < 2) {
      throw new Error(
        'Invalid config key. Use format: env.<environment>.<key>, migration.<key>, s3.<key>, backup.<key>, clickup.<key>, or local.<key>'
      );
    }

    const section = keys[0];

    if (section === 'env') {
      return this.getEnvironmentConfigValue(config, keys);
    } else if (section === 'migration') {
      return this.getMigrationConfigValue(config, keys);
    } else if (section === 's3') {
      return this.getS3ConfigValue(config, keys);
    } else if (section === 'backup') {
      return this.getBackupConfigValue(config, keys);
    } else if (section === 'clickup') {
      return this.getClickUpConfigValue(config, keys);
    } else if (section === 'local') {
      return this.getLocalConfigValue(config, keys);
    } else {
      throw new Error(
        'Invalid config section. Use: env.<environment>.<key>, migration.<key>, s3.<key>, backup.<key>, clickup.<key>, or local.<key>'
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

  private static getBackupConfigValue(
    config: ConfigData,
    keys: string[]
  ): string | undefined {
    if (keys.length !== 2) {
      throw new Error('Invalid backup config key. Use format: backup.<key>');
    }

    const backupKey = keys[1];

    if (!config.backup) {
      return undefined;
    }

    return config.backup[backupKey as keyof NonNullable<ConfigData['backup']>];
  }

  private static getClickUpConfigValue(
    config: ConfigData,
    keys: string[]
  ): string | undefined {
    if (keys.length !== 2) {
      throw new Error('Invalid ClickUp config key. Use format: clickup.<key>');
    }

    const clickupKey = keys[1];

    if (!config.clickup) {
      return undefined;
    }

    const value =
      config.clickup[clickupKey as keyof NonNullable<ConfigData['clickup']>];

    if (!value) {
      return undefined;
    }

    if (clickupKey === 'token') {
      return this.decrypt(value);
    }

    return value;
  }

  private static getLocalConfigValue(
    config: ConfigData,
    keys: string[]
  ): string | undefined {
    if (keys.length !== 2) {
      throw new Error('Invalid local config key. Use format: local.<key>');
    }

    const localKey = keys[1];

    if (!config.local) {
      return undefined;
    }

    const value = config.local[localKey as keyof LocalConfig];

    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'boolean') {
      return value.toString();
    }

    if (typeof value === 'number') {
      return value.toString();
    }

    return value;
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

    // Mask token in ClickUp config
    if (config.clickup?.token) {
      config.clickup.token = '****';
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
      port: envConfig?.port,
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

  static getBackupConfig(): { localPath?: string } {
    const config = this.loadConfig();
    return config.backup || {};
  }

  static getBackupPath(): string {
    const backupConfig = this.getBackupConfig();
    return backupConfig.localPath || join(this.CONFIG_DIR, 'backups');
  }

  static hasS3Config(): boolean {
    return this.hasRequiredS3Config();
  }

  static getValidEnvironments(): string[] {
    return ['dev', 'uat', 'pprd', 'prod', 'local'];
  }

  static getClickUpConfig(): {
    token?: string;
    defaultListId?: string;
    defaultWorkspaceId?: string;
  } {
    const config = this.loadConfig();
    if (!config.clickup) {
      return {};
    }

    return {
      token: config.clickup.token
        ? this.decrypt(config.clickup.token)
        : undefined,
      defaultListId: config.clickup.defaultListId,
      defaultWorkspaceId: config.clickup.defaultWorkspaceId,
    };
  }

  static hasClickUpToken(): boolean {
    const clickupConfig = this.getClickUpConfig();
    return !!clickupConfig.token;
  }

  static getLocalConfig(): LocalConfig {
    const config = this.loadConfig();
    return config.local || {};
  }

  static getLocalWorkspaceDir(): string {
    const localConfig = this.getLocalConfig();
    return localConfig.workspaceDir || join(homedir(), 'wfu-wp-local');
  }

  static getLocalDefaultPort(): number {
    const localConfig = this.getLocalConfig();
    return localConfig.defaultPort || 8080;
  }

  static getLocalDefaultEnvironment(): string {
    const localConfig = this.getLocalConfig();
    return localConfig.defaultEnvironment || 'prod';
  }

  static getLocalAutoStart(): boolean {
    const localConfig = this.getLocalConfig();
    return localConfig.autoStart !== undefined ? localConfig.autoStart : true;
  }

  static getLocalBackupBeforeRefresh(): boolean {
    const localConfig = this.getLocalConfig();
    return localConfig.backupBeforeRefresh !== undefined
      ? localConfig.backupBeforeRefresh
      : true;
  }

  static hasLocalConfig(): boolean {
    const config = this.loadConfig();
    return !!config.local && Object.keys(config.local).length > 0;
  }
}
