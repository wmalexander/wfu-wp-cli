# Enhanced Migration Design: Full Database Export/Import Workflow

## Document Status
- **Phase 1**: ✅ Implemented - Core migration logic with search-replace operations
- **Phase 2**: 📋 Planned - Complete workflow automation with export/import/S3

---

# Phase 2 Design: Full Database Export/Import Workflow

## Current Gap Analysis

### What We Built (Simple Version)
- Direct search-replace on existing database
- Assumes tables are already in place
- Works on a single database connection

### What's Actually Needed (Complete Workflow)
1. **Export** tables from source environment
2. **Import** to temporary migration database
3. **Run migration** (search-replace operations)
4. **Backup** existing tables from target environment
5. **Export** migrated tables from migration database
6. **Import** migrated tables to target environment
7. **Archive** all SQL dumps to S3

## Enhanced Design

### Configuration Structure

```typescript
// Enhanced configuration to support multiple environments
interface EnhancedConfig {
  environments: {
    dev: DatabaseConfig;
    uat: DatabaseConfig;
    pprd: DatabaseConfig;
    prod: DatabaseConfig;
  };
  migration: {
    database: string;        // wp_migration
    s3Bucket: string;       // backup bucket
    workDir: string;        // local working directory
  };
}
```

### New Command Structure

```bash
# Configure all environments
wfuwp config set env.dev.host dev-db.wfu.edu
wfuwp config set env.dev.user wp_admin
wfuwp config set env.dev.password secret123
wfuwp config set env.dev.name wp_dev

wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set env.prod.user wp_admin
wfuwp config set env.prod.password secret456
wfuwp config set env.prod.name wp_prod

wfuwp config set migration.database wp_migration
wfuwp config set migration.s3Bucket wfu-wp-backups

# Run complete migration
wfuwp migrate 43 --from dev --to prod --complete
```

### Implementation Steps

```typescript
async function runCompleteMigration(
  siteId: string,
  from: string,
  to: string,
  options: MigrateOptions
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const workDir = `/tmp/wp-migrate-${timestamp}`;
  
  // Step 1: Export from source
  console.log(chalk.blue('Step 1: Exporting tables from source environment...'));
  const sourceFile = await exportSiteTables(
    siteId,
    from,
    `${workDir}/source-site${siteId}-${from}.sql`
  );
  
  // Step 2: Import to migration database
  console.log(chalk.blue('Step 2: Importing to migration database...'));
  await importToMigrationDb(sourceFile);
  
  // Step 3: Run migrations (existing search-replace logic)
  console.log(chalk.blue('Step 3: Running URL replacements...'));
  await runSearchReplace(siteId, from, to, options);
  
  // Step 4: Backup target tables
  console.log(chalk.blue('Step 4: Backing up existing target tables...'));
  const backupFile = await exportSiteTables(
    siteId,
    to,
    `${workDir}/backup-site${siteId}-${to}.sql`
  );
  
  // Step 5: Export migrated tables
  console.log(chalk.blue('Step 5: Exporting migrated tables...'));
  const migratedFile = await exportFromMigrationDb(
    siteId,
    `${workDir}/migrated-site${siteId}.sql`
  );
  
  // Step 6: Import to target
  console.log(chalk.blue('Step 6: Importing to target environment...'));
  await importToTarget(migratedFile, to);
  
  // Step 7: Archive to S3
  console.log(chalk.blue('Step 7: Archiving to S3...'));
  await archiveToS3(workDir, siteId, from, to, timestamp);
  
  // Cleanup
  await cleanupMigrationDb();
  await cleanupWorkDir(workDir);
}
```

### Key WP-CLI Commands

```typescript
// Export specific site tables
function exportSiteTables(siteId: string, env: string, outputFile: string) {
  const dbConfig = getEnvConfig(env);
  
  // Get site-specific tables (e.g., wp_43_*)
  const tables = execSync(
    `wp db tables --all-tables-with-prefix='wp_${siteId}_' ` +
    `--dbhost=${dbConfig.host} --dbuser=${dbConfig.user} ` +
    `--dbpass=${dbConfig.password} --dbname=${dbConfig.name} ` +
    `--format=csv`
  ).toString().trim();
  
  // Export tables
  execSync(
    `wp db export ${outputFile} --tables=${tables} ` +
    `--dbhost=${dbConfig.host} --dbuser=${dbConfig.user} ` +
    `--dbpass=${dbConfig.password} --dbname=${dbConfig.name}`
  );
  
  return outputFile;
}

// Import to migration database
function importToMigrationDb(sqlFile: string) {
  const migrationConfig = getMigrationDbConfig();
  
  execSync(
    `wp db import ${sqlFile} ` +
    `--dbhost=${migrationConfig.host} --dbuser=${migrationConfig.user} ` +
    `--dbpass=${migrationConfig.password} --dbname=${migrationConfig.database}`
  );
}

// Archive to S3
function archiveToS3(workDir: string, siteId: string, from: string, to: string, timestamp: string) {
  const s3Path = `s3://wfu-wp-backups/migrations/${timestamp}/site${siteId}-${from}-to-${to}/`;
  
  execSync(`aws s3 cp ${workDir}/ ${s3Path} --recursive`);
}
```

## Migration Modes

### Mode 1: Simple (Current Implementation)
```bash
wfuwp migrate 43 --from dev --to prod
```
- Direct search-replace on existing database
- Assumes manual export/import

### Mode 2: Complete (New Implementation)
```bash
wfuwp migrate 43 --from dev --to prod --complete
```
- Full workflow with export/import
- Automatic backups
- S3 archival

### Mode 3: Step-by-Step (For Manual Control)
```bash
wfuwp migrate export 43 --env dev --output source.sql
wfuwp migrate import source.sql --to migration
wfuwp migrate transform 43 --from dev --to prod --db migration
wfuwp migrate export 43 --env migration --output migrated.sql
wfuwp migrate backup 43 --env prod
wfuwp migrate import migrated.sql --to prod
wfuwp migrate archive --dir ./backups --s3
```

## Additional Features Needed

### 1. Multi-Environment Config
```typescript
// Enhanced config structure
class EnvConfig {
  static setEnv(env: string, key: string, value: string): void {
    // wfuwp config set env.dev.host dev-db.wfu.edu
  }
  
  static getEnv(env: string): DatabaseConfig {
    // Returns full config for an environment
  }
}
```

### 2. Table Detection
```typescript
// Detect which tables belong to a site
function getSiteTables(siteId: string, env: string): string[] {
  // For main site (ID 1): wp_posts, wp_options, etc.
  // For other sites: wp_43_posts, wp_43_options, etc.
  
  if (siteId === '1') {
    return getMainSiteTables();
  } else {
    return execSync(`wp db tables --all-tables-with-prefix='wp_${siteId}_'`);
  }
}
```

### 3. Safety Checks
```typescript
// Verify tables exist before operations
function verifyTablesExist(siteId: string, env: string): boolean {
  const tables = getSiteTables(siteId, env);
  return tables.length > 0;
}

// Check migration database is clean
function checkMigrationDbClean(): boolean {
  const tables = execSync('wp db tables --dbname=wp_migration');
  return tables.length === 0;
}
```

## Implementation Priority

### Phase 1: Multi-Environment Config ✅ Critical
- Store multiple database configurations
- Support environment selection

### Phase 2: Export/Import Commands ✅ Critical  
- Export site tables from any environment
- Import to migration database
- Export from migration database
- Import to target environment

### Phase 3: Complete Workflow ✅ Critical
- Orchestrate all steps automatically
- Add progress indicators
- Handle errors gracefully

### Phase 4: S3 Integration 🔄 Important
- Archive SQL dumps to S3
- List previous migrations
- Restore from S3 backups

### Phase 5: Advanced Features 💡 Nice to Have
- Rollback capabilities
- Diff between environments
- Selective table migration
- Parallel processing for large sites

## Example Complete Workflow

```bash
# Initial setup (one time)
wfuwp config set env.dev.host dev-db.wfu.edu
wfuwp config set env.dev.user wp_admin
wfuwp config set env.dev.password devpass123
wfuwp config set env.dev.name wp_dev

wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set env.prod.user wp_admin
wfuwp config set env.prod.password prodpass456
wfuwp config set env.prod.name wp_prod

wfuwp config set migration.database wp_migration
wfuwp config set migration.s3bucket wfu-wp-backups

# Run migration
wfuwp migrate 43 --from dev --to prod --complete

# Output:
# ✓ Step 1: Exported site 43 from dev (15 tables, 2.3MB)
# ✓ Step 2: Imported to migration database
# ✓ Step 3: Completed 24 URL replacements
# ✓ Step 4: Backed up existing prod tables (15 tables, 2.1MB)
# ✓ Step 5: Exported migrated tables (15 tables, 2.3MB)
# ✓ Step 6: Imported to prod environment
# ✓ Step 7: Archived to s3://wfu-wp-backups/migrations/2024-01-15/
# ✓ Migration complete!
```

## Conclusion

The current implementation is a good foundation but needs significant enhancement to match the complete workflow. The enhanced version would:

1. **Eliminate manual steps** - Automate the entire export/import process
2. **Improve safety** - Always backup before overwriting
3. **Add traceability** - Archive everything to S3
4. **Support multiple databases** - Work with separate migration database
5. **Handle multisite properly** - Detect and export correct tables for each site

This would make the tool production-ready for real WordPress multisite migrations.