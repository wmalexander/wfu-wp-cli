# Architecture Documentation

## System Architecture

### Overview

The WFU WordPress CLI uses a hybrid architecture combining Node.js for orchestration and Docker containers for WordPress operations. This approach leverages the reliability of WordPress CLI tools while providing a modern, unified interface.

```
┌─────────────────────────────────────────────┐
│            User Interface (CLI)             │
├─────────────────────────────────────────────┤
│           Commander.js Framework            │
├─────────────────────────────────────────────┤
│            Core Application                 │
│  ┌─────────────┬─────────────┬───────────┐ │
│  │  Commands   │  Utilities  │  Config   │ │
│  └─────────────┴─────────────┴───────────┘ │
├─────────────────────────────────────────────┤
│           External Services                 │
│  ┌──────┬──────┬──────┬──────┬──────────┐ │
│  │Docker│MySQL │ AWS  │ SSH  │ File     │ │
│  │WP-CLI│Client│ CLI  │Client│ System   │ │
│  └──────┴──────┴──────┴──────┴──────────┘ │
└─────────────────────────────────────────────┘
```

## Project Structure

```
wfu-wp-cli/
├── src/                    # Source code
│   ├── index.ts           # Entry point
│   ├── commands/          # Command implementations
│   │   ├── migrate.ts     # Database migration
│   │   ├── config.ts      # Configuration management
│   │   ├── syncs3.ts      # S3 synchronization
│   │   ├── listips.ts     # EC2 instance listing
│   │   ├── sshaws.ts      # SSH connections
│   │   ├── spoof.ts       # DNS spoofing
│   │   └── unspoof.ts     # Remove DNS spoofing
│   ├── utils/             # Utility modules
│   │   ├── config.ts      # Config operations
│   │   ├── database.ts    # Database operations
│   │   ├── s3.ts          # S3 operations
│   │   ├── s3sync.ts      # S3 sync utilities
│   │   ├── docker.ts      # Docker integration
│   │   ├── ssh.ts         # SSH utilities
│   │   └── logger.ts      # Logging system
│   └── types/             # TypeScript definitions
│       └── index.d.ts     # Type definitions
├── tests/                 # Test suites
│   ├── commands/          # Command tests
│   └── utils/             # Utility tests
├── dist/                  # Compiled JavaScript
├── docs/                  # Documentation
├── scripts/               # Build/deploy scripts
│   └── release.sh         # Release automation
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── jest.config.js         # Test configuration
└── CLAUDE.md             # AI assistant guide
```

## Core Components

### 1. Command Layer

Each command is a self-contained module:

```typescript
// commands/migrate.ts structure
export class MigrateCommand {
  constructor(
    private config: Config,
    private database: Database,
    private s3: S3Service
  ) {}
  
  async execute(options: MigrateOptions): Promise<void> {
    // Pre-flight checks
    await this.validateEnvironments()
    await this.checkConnections()
    
    // Migration workflow
    await this.exportSource()
    await this.importToMigration()
    await this.runSearchReplace()
    await this.backupTarget()
    await this.exportTransformed()
    await this.importToTarget()
    
    // Cleanup
    await this.archiveFiles()
    await this.cleanupMigration()
  }
}
```

### 2. Configuration System

Multi-layered configuration with encryption:

```typescript
// Configuration hierarchy
interface Configuration {
  environments: {
    [key: string]: DatabaseConfig  // dev/uat/pprd/prod
  }
  migration: DatabaseConfig         // Migration database
  s3?: S3Config                    // Optional S3 settings
  backup?: BackupConfig            // Backup settings
  docker?: DockerConfig            // Docker settings
  ssh?: SSHConfig                  // SSH settings
}

// Encryption layer
class ConfigEncryption {
  private key: Buffer
  private algorithm = 'aes-256-gcm'
  
  encrypt(value: string): EncryptedValue
  decrypt(encrypted: EncryptedValue): string
}
```

### 3. Database Operations

WordPress multisite table management:

```typescript
// Database utilities
class Database {
  // Table detection
  getTablesForSite(siteId: number): string[] {
    if (siteId === 1) {
      return ['wp_posts', 'wp_options', ...]
    }
    return [`wp_${siteId}_posts`, `wp_${siteId}_options`, ...]
  }
  
  // WP-CLI integration via Docker
  async exportTables(config: DatabaseConfig, tables: string[]): Promise<string> {
    return docker.run('wordpress:cli', [
      'wp', 'db', 'export',
      '--tables=' + tables.join(','),
      '--host=' + config.host,
      '--user=' + config.user,
      '--pass=' + config.password
    ])
  }
}
```

### 4. Docker Integration

Containerized WP-CLI operations:

```typescript
// Docker wrapper
class DockerService {
  async run(image: string, command: string[]): Promise<string> {
    const container = await docker.createContainer({
      Image: image,
      Cmd: command,
      HostConfig: {
        AutoRemove: true,
        NetworkMode: 'host',
        Binds: ['/tmp:/tmp']
      }
    })
    
    await container.start()
    const stream = await container.attach()
    return stream.toString()
  }
}
```

### 5. S3 Operations

AWS SDK integration for file management:

```typescript
// S3 service
class S3Service {
  private s3: AWS.S3
  
  async syncBuckets(source: string, target: string): Promise<void> {
    // Use AWS CLI for efficient sync
    await exec(`aws s3 sync s3://${source} s3://${target}`)
  }
  
  async archiveFile(file: string, metadata: object): Promise<void> {
    await this.s3.putObject({
      Bucket: this.config.bucket,
      Key: path,
      Body: fs.createReadStream(file),
      Metadata: metadata
    }).promise()
  }
}
```

## Data Flow

### Migration Workflow

```
Source DB → Export → Migration DB → Transform → Export → Target DB
     ↓                      ↓                      ↓
   Backup                Search                 Backup
     ↓                  Replace                   ↓
   S3/Local                                    S3/Local
```

### Configuration Flow

```
User Input → Validation → Encryption → Storage
                ↓                         ↓
             Schema                 ~/.wfuwp/config.json
             Check
```

### S3 Sync Flow

```
Source Bucket → List Objects → Compare → Transfer → Target Bucket
                     ↓           ↓          ↓
                  Metadata    Checksums   Progress
```

## Security Architecture

### 1. Credential Management

```typescript
// Layered security
class SecurityManager {
  // Encryption at rest
  private encryptCredentials(credentials: Credentials): Encrypted
  
  // Memory protection
  private clearSensitiveData(): void {
    // Overwrite memory containing passwords
    crypto.randomFillSync(this.passwordBuffer)
  }
  
  // No logging of sensitive data
  private sanitizeForLogging(data: any): any {
    // Remove passwords, keys, tokens
  }
}
```

### 2. Access Control

```yaml
# IAM Policy Example
PolicyDocument:
  Statement:
    - Effect: Allow
      Action:
        - s3:GetObject
        - s3:PutObject
      Resource: arn:aws:s3:::wfu-wordpress-*/*
      Condition:
        IpAddress:
          aws:SourceIp: 
            - 10.0.0.0/8
```

### 3. Audit Trail

```typescript
// Audit logging
class AuditLogger {
  logMigration(event: MigrationEvent): void {
    this.log({
      timestamp: new Date(),
      user: process.env.USER,
      action: 'migration',
      source: event.source,
      target: event.target,
      siteId: event.siteId,
      status: event.status
    })
  }
}
```

## Plugin Architecture

### Command Registration

```typescript
// Extensible command system
class CommandRegistry {
  private commands: Map<string, Command> = new Map()
  
  register(name: string, command: Command): void {
    this.commands.set(name, command)
    
    // Register with Commander.js
    program
      .command(name)
      .description(command.description)
      .action(command.execute.bind(command))
  }
}

// Custom command example
class CustomCommand implements Command {
  name = 'custom'
  description = 'Custom operation'
  
  async execute(options: any): Promise<void> {
    // Implementation
  }
}
```

### Utility Extensions

```typescript
// Pluggable utilities
interface UtilityPlugin {
  name: string
  initialize(): Promise<void>
  execute(context: Context): Promise<any>
}

class PluginManager {
  async loadPlugin(path: string): Promise<UtilityPlugin> {
    const module = await import(path)
    return new module.default()
  }
}
```

## Performance Considerations

### 1. Caching Strategy

```typescript
// Multi-level caching
class CacheManager {
  private memoryCache: Map<string, CacheEntry>
  private diskCache: DiskCache
  
  async get(key: string): Promise<any> {
    // L1: Memory
    if (this.memoryCache.has(key)) {
      return this.memoryCache.get(key)
    }
    
    // L2: Disk
    if (await this.diskCache.has(key)) {
      const value = await this.diskCache.get(key)
      this.memoryCache.set(key, value)
      return value
    }
    
    return null
  }
}
```

### 2. Streaming Operations

```typescript
// Stream processing for large files
class StreamProcessor {
  async processLargeFile(input: string, output: string): Promise<void> {
    const readStream = fs.createReadStream(input)
    const writeStream = fs.createWriteStream(output)
    const transform = new SearchReplaceTransform()
    
    return pipeline(
      readStream,
      transform,
      writeStream
    )
  }
}
```

### 3. Connection Pooling

```typescript
// Database connection pool
class ConnectionPool {
  private pools: Map<string, mysql.Pool>
  
  getConnection(config: DatabaseConfig): mysql.Connection {
    const key = this.getPoolKey(config)
    
    if (!this.pools.has(key)) {
      this.pools.set(key, mysql.createPool({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        connectionLimit: 10
      }))
    }
    
    return this.pools.get(key).getConnection()
  }
}
```

## Error Handling

### Error Hierarchy

```typescript
// Custom error types
class WFUWPError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message)
  }
}

class ConfigurationError extends WFUWPError {}
class ConnectionError extends WFUWPError {}
class MigrationError extends WFUWPError {}
class ValidationError extends WFUWPError {}
```

### Recovery Mechanisms

```typescript
// Automatic retry with backoff
class RetryManager {
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const maxRetries = options.maxRetries || 3
    const backoff = options.backoff || 1000
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation()
      } catch (error) {
        if (i === maxRetries - 1) throw error
        
        await this.delay(backoff * Math.pow(2, i))
      }
    }
  }
}
```

## Testing Architecture

### Test Structure

```typescript
// Unit test example
describe('MigrateCommand', () => {
  let command: MigrateCommand
  let mockDatabase: jest.Mocked<Database>
  let mockS3: jest.Mocked<S3Service>
  
  beforeEach(() => {
    mockDatabase = createMockDatabase()
    mockS3 = createMockS3()
    command = new MigrateCommand(mockDatabase, mockS3)
  })
  
  test('should export tables from source', async () => {
    await command.exportSource(43, 'prod')
    
    expect(mockDatabase.exportTables).toHaveBeenCalledWith(
      expect.objectContaining({ environment: 'prod' }),
      expect.arrayContaining(['wp_43_posts'])
    )
  })
})
```

### Integration Testing

```typescript
// Docker-based integration tests
class IntegrationTestSuite {
  private containers: Docker.Container[] = []
  
  async setup(): Promise<void> {
    // Start MySQL container
    const mysql = await this.startMySQL()
    
    // Start WordPress container
    const wordpress = await this.startWordPress()
    
    // Initialize test data
    await this.loadTestData()
  }
  
  async teardown(): Promise<void> {
    for (const container of this.containers) {
      await container.stop()
      await container.remove()
    }
  }
}
```

## Monitoring & Observability

### Logging System

```typescript
// Structured logging
class Logger {
  private winston: Winston.Logger
  
  constructor() {
    this.winston = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: '~/.wfuwp/logs/wfuwp.log'
        }),
        new winston.transports.Console({
          format: winston.format.simple()
        })
      ]
    })
  }
  
  migration(event: MigrationEvent): void {
    this.winston.info('migration', {
      ...event,
      category: 'migration',
      timestamp: Date.now()
    })
  }
}
```

### Metrics Collection

```typescript
// Performance metrics
class MetricsCollector {
  private metrics: Map<string, Metric> = new Map()
  
  recordDuration(operation: string, duration: number): void {
    this.metrics.set(operation, {
      count: (this.metrics.get(operation)?.count || 0) + 1,
      total: (this.metrics.get(operation)?.total || 0) + duration,
      average: this.calculateAverage(operation),
      last: duration
    })
  }
  
  async report(): Promise<void> {
    // Send to monitoring service
    await this.sendToCloudWatch(this.metrics)
  }
}
```

## Future Architecture Considerations

### Planned Enhancements

1. **GraphQL API**
   - Web interface support
   - Remote execution capabilities
   - Real-time progress updates

2. **Kubernetes Operator**
   - Container orchestration
   - Auto-scaling for large migrations
   - Job scheduling

3. **Event-Driven Architecture**
   - Message queue integration
   - Asynchronous processing
   - Webhook notifications

4. **Machine Learning Integration**
   - Predictive migration timing
   - Anomaly detection
   - Performance optimization

### Scalability Roadmap

```yaml
Phase 1: Current
  - Single-node execution
  - Docker-based operations
  - Local configuration

Phase 2: Distributed
  - Multi-node support
  - Distributed locking
  - Centralized configuration

Phase 3: Cloud-Native
  - Kubernetes deployment
  - Service mesh integration
  - Cloud-native storage
```