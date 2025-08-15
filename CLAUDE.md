# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a Node.js CLI tool (`wfuwp`) for WFU WordPress management tasks, including complete database migration workflows, S3 synchronization, EC2 instance management, and DNS spoofing for development. **Phase 2** implements automated database migration with export/import/archival and comprehensive environment migration capabilities.

## Development Commands
```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with ts-node for development testing
npm run test         # Run Jest test suite
npm run lint         # Run ESLint on source files
npm run format       # Format code with Prettier
npm run release      # Execute release script (scripts/release.sh)
```

## Architecture
- **Entry Point**: `src/index.ts` - Sets up Commander.js CLI with all commands
- **Commands**: Individual command implementations in `src/commands/`
  - `migrate.ts` - **Phase 1** Single-site WordPress database migration
  - `env-migrate.ts` - **Phase 2** Complete environment migration with automation
  - `config.ts` - Multi-environment configuration management with wizard
  - `syncs3.ts` - S3 bucket synchronization between environments
  - `listips.ts` - EC2 instance IP address listing
  - `sshaws.ts` - SSH connection to EC2 instances
  - `spoof.ts` - DNS spoofing via /etc/hosts modification
  - `unspoof.ts` - Remove DNS spoofing entries
  - `removehostkey.ts` - SSH host key management
- **Utilities**: Core functionality in `src/utils/`
  - `config.ts` - Multi-environment configuration with encryption
  - `database.ts` - WordPress database operations via WP-CLI
  - `s3.ts` - S3 archival and backup operations
  - `s3sync.ts` - WordPress file synchronization between S3 buckets
  - `site-enumerator.ts` - WordPress multisite site discovery and filtering
  - `network-tables.ts` - Network table operations and transformations
  - `backup-recovery.ts` - Environment backup and rollback capabilities
  - `error-recovery.ts` - Error handling and retry logic with exponential backoff
  - `migration-validator.ts` - Pre-flight validation and compatibility checks

## Migration Systems

### Phase 1: Single Site Migration (`migrate` command)
The original migrate command supports individual site migration with manual import/export workflows.

### Phase 2: Complete Environment Migration (`env-migrate` command)
The env-migrate command provides comprehensive automated environment migration with:

**Core Features:**
- Site discovery and enumeration with flexible filtering
- Network table migration (wp_blogs, wp_site, wp_sitemeta, wp_blogmeta)
- Batch processing with configurable parallelism
- Complete environment backup and rollback capabilities
- Error recovery with exponential backoff retry logic
- Pre-flight validation and compatibility checks
- S3 integration for file sync and backup archival
- Real-time progress tracking and comprehensive reporting

**Command Structure:**
```bash
wfuwp env-migrate <source-env> <target-env> [options]
```

**Key Workflow:**
1. **Pre-flight Validation** - System requirements, database connections, S3 access
2. **Site Enumeration** - Discover sites with filtering (include/exclude, active-only)
3. **Environment Backup** - Complete backup of target environment with integrity checks
4. **Network Migration** - Migrate and transform network tables between environments
5. **Site Migration** - Batch process sites with parallel execution and progress tracking
6. **File Synchronization** - Optional S3 file sync between environments
7. **Archival & Cleanup** - Archive artifacts to S3, cleanup temporary files

### Configuration Structure
```typescript
// Multi-environment configuration
environments: {
  dev: { host, user, password, database }
  uat: { host, user, password, database }
  pprd: { host, user, password, database }
  prod: { host, user, password, database }
}
migration: { host, user, password, database } // wp_migration
s3: { bucket, region, prefix } // Optional - for S3 backups
backup: { localPath } // Optional - for local backups (default: ~/.wfuwp/backups)
```

### Phase 1 Workflow (Single Site Migration)
```bash
wfuwp migrate 43 --from prod --to pprd
wfuwp migrate 43 --from prod --to pprd --sync-s3  # Include WordPress files
```
1. Export site tables from source environment
2. Import to migration database
3. Run search-replace operations
4. Backup existing target tables
5. Export migrated tables
6. Import to target environment
7. Sync WordPress files between S3 environments (if --sync-s3)
8. Archive all SQL files (to S3 if configured, otherwise to local backup directory)
9. Cleanup migration database

**Simple Mode (Phase 1 behavior):**
```bash
wfuwp migrate 43 --from prod --to pprd --simple
```
Uses migration database for search-replace only (assumes tables already imported)

### Phase 2 Workflow (Complete Environment Migration)
```bash
# Complete environment migration
wfuwp env-migrate prod uat

# Environment migration with specific options
wfuwp env-migrate prod pprd --include-sites "1,43,78" --parallel --sync-s3

# Network tables only
wfuwp env-migrate prod uat --network-only --force

# Dry run with detailed output
wfuwp env-migrate dev uat --dry-run --verbose --health-check

# Local development environment migration
wfuwp env-migrate prod local --sync-s3 --verbose
```

**Automated Workflow:**
1. Pre-flight validation (system requirements, database connections, S3 access)
2. Site enumeration and filtering (discover all sites, apply include/exclude filters)
3. Environment backup (complete backup of target environment with validation)
4. Network table migration (export, transform, import network tables)
5. Batch site processing (process sites in configurable batches with parallel execution)
6. File synchronization (optional S3 sync between environments)
7. Post-migration validation and archival (health checks, S3 archival, cleanup)

## Key Patterns
- **Multi-environment config**: `Config.getEnvironmentConfig(env)` for any environment
- **WordPress multisite**: Handles main site (ID 1) vs subsites (wp_43_*) table detection
- **WP-CLI integration**: All database operations via WP-CLI with proper authentication
- **Safety first**: Pre-flight checks, backups, confirmations, rollback on failure
- **S3 archival**: Automatic backup with metadata for audit trail
- **Environment validation**: Strict validation of dev/uat/pprd/prod/local environments

## Configuration Setup
```bash
# Interactive wizard (recommended)
wfuwp config wizard

# Manual configuration
wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set migration.database wp_migration

# S3 backups (optional)
wfuwp config set s3.bucket wfu-wp-backups

# Local backups (alternative to S3)  
wfuwp config set backup.localPath /path/to/backups

# Verification
wfuwp config verify
```

## Testing
- Tests are in `tests/` directory with corresponding `.test.ts` files for each command
- Uses Jest as the test framework
- Run single test: `npm test -- --testNamePattern="test name"`
- Database operations require test WordPress multisite setup

## External Dependencies
- **Docker**: Required for WP-CLI database operations (uses `wordpress:cli` image)
- **AWS CLI**: Required for S3 operations and EC2 management  
- **MySQL**: WordPress multisite databases in multiple environments
- Uses Commander.js for CLI framework
- Chalk for colored terminal output
- Crypto for password encryption

## Hybrid Architecture Approach
The tool uses a **hybrid approach** combining the best of both worlds:
- **Docker containers**: Handle all WP-CLI database operations reliably
- **Native Node.js**: Manages configuration, S3 operations, file handling, and workflow orchestration
- **Proven reliability**: Leverages existing Docker-based WP-CLI solutions that work with remote databases
- **Modern interface**: Provides unified CLI with comprehensive Phase 2 features

## WordPress Multisite Specifics
- **Main site (ID 1)**: Tables like `wp_posts`, `wp_options`
- **Subsites (ID > 1)**: Tables like `wp_43_posts`, `wp_43_options`
- **Network tables**: Shared tables like `wp_users`, `wp_blogs` (excluded from site migrations)
- **Table detection**: Automatic identification of site-specific tables

## Phase 2 Features (env-migrate)
- **Complete environment migration**: Automated discovery, export/import/transform workflow
- **Site enumeration**: Flexible filtering with include/exclude lists and active-only options
- **Network table migration**: Comprehensive network table operations with URL transformations
- **Batch processing**: Configurable batch sizes with parallel execution support
- **Safety & recovery**: Complete environment backups, rollback capability, error recovery
- **Pre-flight validation**: System requirements, database connections, S3 access, compatibility
- **Progress tracking**: Real-time progress with completion percentages and ETA
- **S3 integration**: File synchronization and backup archival with configurable storage classes
- **Error handling**: Exponential backoff retry logic for transient failures
- **Health monitoring**: Pre and post-migration health checks with issue detection