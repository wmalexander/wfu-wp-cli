# Phase 2 Implementation Plan: Complete Migration Workflow

## Overview

Phase 2 will transform the current core migration tool into a complete, production-ready migration system that handles the entire workflow automatically.

## Current State (Phase 1)

### What We Have
- ✅ Core migration logic (search-replace operations)
- ✅ Single database configuration
- ✅ Basic safety features (dry-run, confirmations)
- ✅ Logging infrastructure

### Current Workflow (Manual)
1. User exports tables from source → SQL file
2. User imports SQL file → wp_migration database
3. **User runs `wfuwp migrate`** ← Phase 1 handles this
4. User exports from wp_migration → SQL file
5. User backs up target tables → SQL file
6. User imports to target database
7. User archives SQL files to S3

## Target State (Phase 2)

### Complete Automated Workflow
```bash
# One command does everything
wfuwp migrate 43 --from prod --to pprd --complete
```

This single command will:
1. ✅ Export site 43 tables from prod database
2. ✅ Import into wp_migration database
3. ✅ Run search-replace operations
4. ✅ Backup existing pprd tables
5. ✅ Export migrated tables from wp_migration
6. ✅ Import to pprd database
7. ✅ Archive all SQL files to S3
8. ✅ Clean up wp_migration database

## Implementation Tasks

### 1. Enhanced Configuration System

#### Task 1.1: Multi-Environment Config Structure
```typescript
interface EnvironmentConfig {
  host: string;
  user: string;
  password: string; // encrypted
  database: string;
}

interface MigrationConfig {
  environments: {
    dev: EnvironmentConfig;
    uat: EnvironmentConfig;
    pprd: EnvironmentConfig;
    prod: EnvironmentConfig;
  };
  migration: {
    host: string;
    user: string;
    password: string; // encrypted
    database: string; // wp_migration
  };
  s3: {
    bucket: string;
    region: string;
    prefix: string;
  };
}
```

#### Task 1.2: New Config Commands
```bash
# Environment-specific configs
wfuwp config env <environment> set <key> <value>
wfuwp config env <environment> get <key>
wfuwp config env <environment> list

# Migration database config
wfuwp config migration set <key> <value>
wfuwp config migration get <key>

# S3 config
wfuwp config s3 set <key> <value>
wfuwp config s3 get <key>

# Wizard for initial setup
wfuwp config wizard
```

### 2. Database Operations Module

#### Task 2.1: Export Functions
```typescript
// Export tables for a specific site
async function exportSiteTables(
  siteId: string,
  environment: string,
  outputPath: string
): Promise<ExportResult>

// Get list of tables for a site
async function getSiteTables(
  siteId: string,
  environment: string
): Promise<string[]>

// Handle main site (ID 1) vs subsites
function getTablePrefix(siteId: string): string
```

#### Task 2.2: Import Functions
```typescript
// Import SQL file to specified database
async function importSqlFile(
  sqlFile: string,
  targetConfig: EnvironmentConfig
): Promise<ImportResult>

// Verify import success
async function verifyImport(
  siteId: string,
  targetConfig: EnvironmentConfig
): Promise<boolean>
```

#### Task 2.3: Migration Database Management
```typescript
// Clean migration database before use
async function cleanMigrationDatabase(): Promise<void>

// Verify migration database is ready
async function verifyMigrationDatabase(): Promise<boolean>

// Get migration database status
async function getMigrationDbStatus(): Promise<DbStatus>
```

### 3. S3 Integration

#### Task 3.1: Backup Operations
```typescript
// Archive SQL files to S3
async function archiveToS3(
  files: string[],
  metadata: MigrationMetadata
): Promise<S3Result>

// Generate S3 path structure
function getS3Path(
  siteId: string,
  from: string,
  to: string,
  timestamp: string
): string

// List previous migrations
async function listMigrations(
  siteId?: string
): Promise<MigrationHistory[]>
```

#### Task 3.2: Restore Operations
```typescript
// Download migration from S3
async function downloadMigration(
  migrationId: string,
  localPath: string
): Promise<void>

// Restore from backup
async function restoreFromBackup(
  backupId: string,
  target: string
): Promise<void>
```

### 4. Complete Workflow Orchestration

#### Task 4.1: Main Migration Flow
```typescript
class CompleteMigration {
  private workDir: string;
  private siteId: string;
  private sourceEnv: string;
  private targetEnv: string;
  private timestamp: string;
  
  async execute(): Promise<MigrationResult> {
    await this.validatePrerequisites();
    await this.createWorkingDirectory();
    
    try {
      // Step 1: Export from source
      const sourceExport = await this.exportFromSource();
      
      // Step 2: Import to migration DB
      await this.importToMigrationDb(sourceExport);
      
      // Step 3: Run transformations
      await this.runTransformations();
      
      // Step 4: Backup target
      const targetBackup = await this.backupTarget();
      
      // Step 5: Export migrated data
      const migratedExport = await this.exportFromMigrationDb();
      
      // Step 6: Import to target
      await this.importToTarget(migratedExport);
      
      // Step 7: Archive to S3
      await this.archiveAll([sourceExport, targetBackup, migratedExport]);
      
      // Step 8: Cleanup
      await this.cleanup();
      
      return this.generateReport();
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }
}
```

#### Task 4.2: Progress Tracking
```typescript
// Real-time progress updates
class MigrationProgress {
  onStepStart(step: number, description: string): void
  onStepComplete(step: number, result: StepResult): void
  onProgress(percentage: number, message: string): void
  onError(step: number, error: Error): void
}
```

#### Task 4.3: Rollback Capability
```typescript
// Rollback on failure
class MigrationRollback {
  async rollbackTarget(backupFile: string): Promise<void>
  async cleanupPartialImport(): Promise<void>
  async notifyFailure(error: Error): Promise<void>
}
```

### 5. New Commands Structure

#### Task 5.1: Enhanced Migrate Command
```bash
# Complete migration (new default)
wfuwp migrate <site-id> --from <env> --to <env> [options]

Options:
  --complete          Run complete workflow (default in Phase 2)
  --simple           Use simple mode (Phase 1 behavior)
  --skip-backup      Skip target backup (dangerous)
  --skip-s3          Skip S3 archival
  --work-dir <path>  Custom working directory
  --keep-files       Don't delete local SQL files
```

#### Task 5.2: New Subcommands
```bash
# Manual step-by-step control
wfuwp migrate export <site-id> --env <environment>
wfuwp migrate import <sql-file> --env <environment>
wfuwp migrate transform <site-id> --from <env> --to <env>
wfuwp migrate backup <site-id> --env <environment>
wfuwp migrate restore <backup-id> --env <environment>

# Management commands
wfuwp migrate list               # List recent migrations
wfuwp migrate status <migration-id>  # Check migration status
wfuwp migrate clean              # Clean migration database
wfuwp migrate verify <site-id> --env <environment>  # Verify site tables
```

### 6. Safety Enhancements

#### Task 6.1: Pre-flight Checks
- Verify all database connections
- Check migration database is clean
- Verify S3 access and bucket exists
- Estimate migration size and duration
- Check available disk space

#### Task 6.2: Validation
- Verify table counts match after export/import
- Compare row counts before/after migration
- Validate SQL file integrity
- Check for orphaned tables

#### Task 6.3: Error Recovery
- Automatic retry with exponential backoff
- Partial migration recovery
- Detailed error logging with context
- Rollback procedures for each step

## Testing Strategy

### Unit Tests
- Configuration management with multiple environments
- Export/import operations
- S3 operations
- Table detection for different site IDs

### Integration Tests
- Complete workflow with test database
- Rollback scenarios
- Error handling at each step
- Large database handling

### End-to-End Tests
- Full migration simulation
- Multi-site scenarios
- Performance benchmarks
- Concurrent migration handling

## Migration Path from Phase 1

### Backward Compatibility
- Keep `--simple` flag for Phase 1 behavior
- Existing configs continue to work
- Gradual migration wizard for config upgrade

### Documentation Updates
- Complete workflow guide
- Troubleshooting guide for each step
- Performance tuning guide
- S3 permissions setup

## Success Metrics

### Functional
- ✅ Zero manual steps required
- ✅ All SQL files archived automatically
- ✅ Rollback capability at every step
- ✅ Complete audit trail

### Performance
- ⏱️ < 5 minutes for sites under 1GB
- ⏱️ < 20 minutes for sites under 10GB
- 📊 Progress tracking with ETA
- 🔄 Parallel processing where possible

### Reliability
- 🛡️ 100% rollback success rate
- 📝 Comprehensive error messages
- 🔍 Pre-flight validation catches 95% of issues
- 📈 Retry logic handles transient failures

## Implementation Timeline

### Week 1: Configuration System
- Multi-environment config structure
- Config migration from Phase 1
- Config wizard implementation

### Week 2: Database Operations
- Export/import functions
- Table detection logic
- Migration database management

### Week 3: S3 Integration
- Backup operations
- Restore capabilities
- S3 path management

### Week 4: Workflow Orchestration
- Complete migration flow
- Progress tracking
- Error handling and rollback

### Week 5: Testing & Documentation
- Comprehensive test suite
- Documentation updates
- Performance optimization

### Week 6: Beta Testing & Refinement
- Real-world testing
- Bug fixes
- Performance tuning

## Risk Mitigation

### Technical Risks
- **Large database handling**: Implement streaming and chunking
- **Network interruptions**: Add resume capability
- **Permission issues**: Comprehensive pre-flight checks
- **Version incompatibilities**: WP-CLI version detection

### Operational Risks
- **Accidental overwrites**: Multiple confirmation steps
- **Incomplete migrations**: Atomic operations with rollback
- **Lost backups**: Redundant S3 archival with versioning
- **Configuration errors**: Validation and wizard setup

## Definition of Done

### Phase 2 is complete when:
1. ✅ Complete workflow executes with single command
2. ✅ All manual steps are eliminated
3. ✅ S3 archival is automatic
4. ✅ Rollback works at every step
5. ✅ Performance meets targets for 95% of sites
6. ✅ Documentation covers all scenarios
7. ✅ Test coverage exceeds 80%
8. ✅ Beta tested on production-like data

## Next Steps

1. Review and approve Phase 2 plan
2. Create detailed tickets for each task
3. Set up test environment with multiple databases
4. Begin implementation with config system
5. Regular progress reviews and adjustments