# Development Guide

## Development Environment Setup

### Prerequisites

```bash
# Required tools
node --version  # 18+
npm --version   # 8+
git --version   # 2.0+
docker --version # 20+

# Development tools
npm install -g typescript
npm install -g ts-node
npm install -g jest
```

### Clone and Setup

```bash
# Clone repository
git clone https://github.com/wfu/wfu-wp-cli.git
cd wfu-wp-cli

# Install dependencies
npm install

# Build project
npm run build

# Run tests
npm test

# Link for local testing
npm link
```

### IDE Configuration

#### VS Code

`.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "jest.autoRun": {
    "watch": true,
    "onStartup": ["all-tests"]
  }
}
```

Recommended extensions:
- ESLint
- Prettier
- Jest Runner
- Docker
- GitLens

#### IntelliJ IDEA / WebStorm

1. Enable TypeScript service
2. Configure ESLint
3. Set up Jest run configurations
4. Install Docker plugin

## Project Structure

### Source Organization

```
src/
├── index.ts              # Entry point & CLI setup
├── commands/            # Command implementations
│   ├── base.command.ts  # Base command class
│   └── *.ts            # Individual commands
├── utils/              # Utility modules
│   ├── config.ts       # Configuration management
│   ├── database.ts     # Database operations
│   └── *.ts           # Other utilities
├── services/           # Service layer
│   ├── docker.ts       # Docker integration
│   ├── aws.ts         # AWS SDK wrapper
│   └── *.ts          # Other services
├── types/             # TypeScript definitions
│   ├── index.d.ts     # Main types
│   └── *.d.ts        # Module types
└── constants/         # Constants and enums
    └── index.ts       # Shared constants
```

### Coding Standards

#### TypeScript Style

```typescript
// Use interfaces for data structures
interface MigrationOptions {
  siteId: number
  source: Environment
  target: Environment
  syncS3?: boolean
}

// Use classes for services
class MigrationService {
  constructor(
    private readonly config: Config,
    private readonly database: Database
  ) {}
  
  async migrate(options: MigrationOptions): Promise<void> {
    // Implementation
  }
}

// Use enums for constants
enum Environment {
  DEV = 'dev',
  UAT = 'uat',
  PPRD = 'pprd',
  PROD = 'prod'
}

// Use type guards
function isValidEnvironment(env: string): env is Environment {
  return Object.values(Environment).includes(env as Environment)
}
```

#### Error Handling

```typescript
// Custom error classes
class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message)
    this.name = 'MigrationError'
  }
}

// Proper error handling
async function executeCommand(): Promise<void> {
  try {
    await riskyOperation()
  } catch (error) {
    if (error instanceof MigrationError) {
      logger.error('Migration failed', error.details)
      throw error
    }
    
    // Wrap unknown errors
    throw new MigrationError(
      'Unexpected error during migration',
      'UNKNOWN_ERROR',
      { originalError: error }
    )
  }
}
```

#### Async/Await Patterns

```typescript
// Parallel execution
async function parallelOperations(): Promise<void> {
  const [result1, result2] = await Promise.all([
    operation1(),
    operation2()
  ])
}

// Sequential with error handling
async function sequentialOperations(): Promise<void> {
  try {
    const step1 = await operation1()
    const step2 = await operation2(step1)
    return await operation3(step2)
  } finally {
    await cleanup()
  }
}

// With timeout
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
  )
  return Promise.race([promise, timeout])
}
```

## Adding New Commands

### Command Template

Create `src/commands/mycommand.ts`:

```typescript
import { Command } from 'commander'
import { BaseCommand } from './base.command'
import { Config } from '../utils/config'
import { Logger } from '../utils/logger'

interface MyCommandOptions {
  option1: string
  option2?: boolean
}

export class MyCommand extends BaseCommand {
  constructor(
    private readonly config: Config,
    private readonly logger: Logger
  ) {
    super()
  }
  
  register(program: Command): void {
    program
      .command('mycommand <arg>')
      .description('Description of my command')
      .option('-o, --option1 <value>', 'Option description')
      .option('-f, --flag', 'Flag description')
      .action(this.execute.bind(this))
  }
  
  async execute(arg: string, options: MyCommandOptions): Promise<void> {
    this.logger.info('Executing my command', { arg, options })
    
    // Validate inputs
    this.validateInputs(arg, options)
    
    // Execute command logic
    await this.performOperation(arg, options)
    
    this.logger.success('Command completed successfully')
  }
  
  private validateInputs(arg: string, options: MyCommandOptions): void {
    if (!arg) {
      throw new Error('Argument is required')
    }
    
    if (options.option1 && !this.isValidOption(options.option1)) {
      throw new Error('Invalid option value')
    }
  }
  
  private async performOperation(
    arg: string,
    options: MyCommandOptions
  ): Promise<void> {
    // Implementation
  }
}
```

### Register Command

Update `src/index.ts`:

```typescript
import { MyCommand } from './commands/mycommand'

// In main function
const myCommand = new MyCommand(config, logger)
myCommand.register(program)
```

### Add Tests

Create `tests/commands/mycommand.test.ts`:

```typescript
import { MyCommand } from '../../src/commands/mycommand'
import { Config } from '../../src/utils/config'
import { Logger } from '../../src/utils/logger'

describe('MyCommand', () => {
  let command: MyCommand
  let mockConfig: jest.Mocked<Config>
  let mockLogger: jest.Mocked<Logger>
  
  beforeEach(() => {
    mockConfig = createMockConfig()
    mockLogger = createMockLogger()
    command = new MyCommand(mockConfig, mockLogger)
  })
  
  describe('execute', () => {
    it('should execute successfully with valid inputs', async () => {
      await command.execute('test-arg', { option1: 'value' })
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Executing my command',
        expect.any(Object)
      )
      expect(mockLogger.success).toHaveBeenCalled()
    })
    
    it('should throw error with invalid inputs', async () => {
      await expect(
        command.execute('', { option1: 'invalid' })
      ).rejects.toThrow('Argument is required')
    })
  })
})
```

## Testing

### Test Structure

```
tests/
├── unit/               # Unit tests
│   ├── commands/      # Command tests
│   ├── utils/         # Utility tests
│   └── services/      # Service tests
├── integration/       # Integration tests
│   ├── database/      # Database tests
│   ├── docker/        # Docker tests
│   └── s3/           # S3 tests
├── e2e/              # End-to-end tests
├── fixtures/         # Test data
└── helpers/          # Test utilities
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- mycommand.test.ts

# Run tests in watch mode
npm run test:watch

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

### Writing Tests

#### Unit Test Example

```typescript
describe('DatabaseUtil', () => {
  let database: Database
  
  beforeEach(() => {
    database = new Database()
  })
  
  describe('getTablesForSite', () => {
    it('should return main site tables for site ID 1', () => {
      const tables = database.getTablesForSite(1)
      
      expect(tables).toContain('wp_posts')
      expect(tables).toContain('wp_options')
      expect(tables).not.toContain('wp_1_posts')
    })
    
    it('should return prefixed tables for subsites', () => {
      const tables = database.getTablesForSite(43)
      
      expect(tables).toContain('wp_43_posts')
      expect(tables).toContain('wp_43_options')
      expect(tables).not.toContain('wp_posts')
    })
  })
})
```

#### Integration Test Example

```typescript
describe('Migration Integration', () => {
  let testDb: TestDatabase
  
  beforeAll(async () => {
    testDb = await TestDatabase.create()
    await testDb.seed()
  })
  
  afterAll(async () => {
    await testDb.destroy()
  })
  
  it('should migrate site between environments', async () => {
    const migration = new MigrationService(config, testDb)
    
    await migration.migrate({
      siteId: 1,
      source: 'dev',
      target: 'test'
    })
    
    const result = await testDb.query(
      'SELECT option_value FROM wp_options WHERE option_name = "siteurl"'
    )
    
    expect(result[0].option_value).toBe('https://test.example.com')
  })
})
```

### Mocking

#### Mock Factories

```typescript
// tests/helpers/mocks.ts
export function createMockConfig(): jest.Mocked<Config> {
  return {
    get: jest.fn(),
    set: jest.fn(),
    getEnvironmentConfig: jest.fn().mockReturnValue({
      host: 'test-db.example.com',
      user: 'test',
      password: 'test',
      database: 'test_db'
    })
  }
}

export function createMockDocker(): jest.Mocked<DockerService> {
  return {
    run: jest.fn().mockResolvedValue(''),
    pullImage: jest.fn().mockResolvedValue(true),
    containerExists: jest.fn().mockResolvedValue(false)
  }
}
```

#### Using Mocks

```typescript
import { createMockConfig, createMockDocker } from '../helpers/mocks'

describe('Command with mocks', () => {
  it('should use mocked services', async () => {
    const mockConfig = createMockConfig()
    const mockDocker = createMockDocker()
    
    mockDocker.run.mockResolvedValue('export successful')
    
    const command = new MyCommand(mockConfig, mockDocker)
    await command.execute()
    
    expect(mockDocker.run).toHaveBeenCalledWith(
      'wordpress:cli',
      expect.arrayContaining(['wp', 'db', 'export'])
    )
  })
})
```

## Debugging

### Debug Configuration

`.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug CLI",
      "program": "${workspaceFolder}/src/index.ts",
      "args": ["migrate", "43", "--from", "prod", "--to", "pprd"],
      "runtimeArgs": ["-r", "ts-node/register"],
      "env": {
        "WFUWP_DEBUG": "true"
      }
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand", "--no-cache"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Debug Logging

```typescript
// Enable debug logging
import debug from 'debug'

const log = debug('wfuwp:migration')

export class MigrationService {
  async migrate(options: MigrationOptions): Promise<void> {
    log('Starting migration', options)
    
    // Detailed logging
    log('Exporting from %s', options.source)
    const exportResult = await this.export(options.source)
    log('Export complete: %d tables', exportResult.tables.length)
    
    // Conditional debug output
    if (process.env.WFUWP_DEBUG) {
      console.debug('Detailed export result:', exportResult)
    }
  }
}

// Run with debug output
// DEBUG=wfuwp:* npm run dev migrate 43 --from prod --to pprd
```

## Build and Release

### Build Process

```bash
# Clean build
npm run clean
npm run build

# Production build
npm run build:prod

# Watch mode
npm run build:watch
```

### Version Management

```bash
# Bump version (patch)
npm version patch

# Bump version (minor)
npm version minor

# Bump version (major)
npm version major

# Custom version
npm version 1.2.3
```

### Release Process

```bash
# Run release script
npm run release

# Manual release steps
1. Update version in package.json
2. Update CHANGELOG.md
3. Build production bundle
4. Run tests
5. Create git tag
6. Push to repository
7. Publish to npm (if applicable)
```

`scripts/release.sh`:
```bash
#!/bin/bash
set -e

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")

echo "Releasing version $VERSION"

# Run tests
npm test

# Build
npm run build:prod

# Create git tag
git tag -a "v$VERSION" -m "Release version $VERSION"

# Push
git push origin main
git push origin "v$VERSION"

# Publish to npm (if configured)
# npm publish

echo "Release $VERSION complete"
```

## Contributing

### Development Workflow

1. **Fork and clone**
   ```bash
   git clone https://github.com/yourusername/wfu-wp-cli.git
   cd wfu-wp-cli
   git remote add upstream https://github.com/wfu/wfu-wp-cli.git
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

3. **Make changes**
   - Write code
   - Add tests
   - Update documentation

4. **Test locally**
   ```bash
   npm test
   npm run lint
   npm run build
   ```

5. **Commit changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

6. **Push and create PR**
   ```bash
   git push origin feature/my-feature
   ```

### Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

Examples:
```bash
git commit -m "feat(migrate): add dry-run mode"
git commit -m "fix(config): handle missing encryption key"
git commit -m "docs: update migration guide"
git commit -m "test(s3): add integration tests"
```

### Code Review Checklist

- [ ] Tests pass
- [ ] Code follows style guide
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Error handling implemented
- [ ] Security considerations addressed
- [ ] Performance impact assessed
- [ ] Breaking changes documented

## Performance Profiling

### CPU Profiling

```typescript
// Add profiling code
import { performance } from 'perf_hooks'

class PerformanceMonitor {
  private marks: Map<string, number> = new Map()
  
  mark(name: string): void {
    this.marks.set(name, performance.now())
  }
  
  measure(name: string, startMark: string): number {
    const start = this.marks.get(startMark)
    if (!start) throw new Error(`Mark ${startMark} not found`)
    
    const duration = performance.now() - start
    console.log(`${name}: ${duration.toFixed(2)}ms`)
    return duration
  }
}

// Usage
const perf = new PerformanceMonitor()

perf.mark('migration-start')
await migrate()
perf.measure('Total migration', 'migration-start')
```

### Memory Profiling

```bash
# Run with memory profiling
node --inspect-brk dist/index.js migrate 43 --from prod --to pprd

# Open Chrome DevTools
chrome://inspect

# Take heap snapshots
# Analyze memory usage
```

## Security Considerations

### Input Validation

```typescript
// Sanitize user input
function sanitizeInput(input: string): string {
  return input
    .replace(/[^\w\s-]/g, '')
    .trim()
    .substring(0, 100)
}

// Validate environment names
function validateEnvironment(env: string): void {
  const valid = ['dev', 'uat', 'pprd', 'prod']
  if (!valid.includes(env)) {
    throw new Error(`Invalid environment: ${env}`)
  }
}

// Prevent SQL injection
function escapeSqlIdentifier(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`'
}
```

### Credential Handling

```typescript
// Never log credentials
function sanitizeForLogging(config: any): any {
  const sanitized = { ...config }
  
  if (sanitized.password) sanitized.password = '***'
  if (sanitized.apiKey) sanitized.apiKey = '***'
  if (sanitized.secret) sanitized.secret = '***'
  
  return sanitized
}

// Clear sensitive data from memory
function clearSensitiveData(buffer: Buffer): void {
  crypto.randomFillSync(buffer)
}
```

## Resources

### Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Commander.js Guide](https://github.com/tj/commander.js)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Docker CLI Reference](https://docs.docker.com/engine/reference/commandline/cli/)
- [AWS SDK for JavaScript](https://docs.aws.amazon.com/sdk-for-javascript/)

### Tools
- [TypeScript Playground](https://www.typescriptlang.org/play)
- [Regex101](https://regex101.com/) - Test regular expressions
- [JWT.io](https://jwt.io/) - Debug JWTs
- [Postman](https://www.postman.com/) - API testing

### Learning Resources
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Clean Code JavaScript](https://github.com/ryanmcdermott/clean-code-javascript)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)