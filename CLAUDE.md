# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
This is a Node.js CLI tool (`wfuwp`) for WFU WordPress management tasks, including complete database migration workflows, S3 synchronization, EC2 instance management, and DNS spoofing for development. **Phase 2** implements automated database migration with export/import/archival.

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
  - `migrate.ts` - **Phase 2** Complete WordPress multisite database migration
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

## Phase 2 Migration System
The migrate command now supports complete automated workflows:

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
s3: { bucket, region, prefix }
```

### Complete Workflow (Default)
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
8. Archive all SQL files to S3
9. Cleanup migration database

### Simple Mode (Phase 1 behavior)
```bash
wfuwp migrate 43 --from prod --to pprd --simple
```
Uses migration database for search-replace only (assumes tables already imported)

## Key Patterns
- **Multi-environment config**: `Config.getEnvironmentConfig(env)` for any environment
- **WordPress multisite**: Handles main site (ID 1) vs subsites (wp_43_*) table detection
- **WP-CLI integration**: All database operations via WP-CLI with proper authentication
- **Safety first**: Pre-flight checks, backups, confirmations, rollback on failure
- **S3 archival**: Automatic backup with metadata for audit trail
- **Environment validation**: Strict validation of dev/uat/pprd/prod environments

## Configuration Setup
```bash
# Interactive wizard (recommended)
wfuwp config wizard

# Manual configuration
wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set migration.database wp_migration
wfuwp config set s3.bucket wfu-wp-backups

# Verification
wfuwp config verify
```

## Testing
- Tests are in `tests/` directory with corresponding `.test.ts` files for each command
- Uses Jest as the test framework
- Run single test: `npm test -- --testNamePattern="test name"`
- Database operations require test WordPress multisite setup

## External Dependencies
- **WP-CLI**: Required for all database operations
- **AWS CLI**: Required for S3 operations and EC2 management
- **MySQL**: WordPress multisite databases in multiple environments
- Uses Commander.js for CLI framework
- Chalk for colored terminal output
- Crypto for password encryption

## WordPress Multisite Specifics
- **Main site (ID 1)**: Tables like `wp_posts`, `wp_options`
- **Subsites (ID > 1)**: Tables like `wp_43_posts`, `wp_43_options`
- **Network tables**: Shared tables like `wp_users`, `wp_blogs` (excluded from site migrations)
- **Table detection**: Automatic identification of site-specific tables

## Phase 2 Features
- **Complete database migration**: Automated export/import/transform workflow  
- **WordPress file sync**: Optional S3 sync with --sync-s3 flag
- **Multi-environment config**: Support for dev/uat/pprd/prod environments
- **Pre-flight checks**: Database connections, site existence, AWS CLI availability
- **Safety features**: Target backups, S3 archival, rollback on failure
- **Progress tracking**: Step-by-step output with file counts and sizes
- **Flexible options**: Skip backups, skip S3, keep files, custom work directories