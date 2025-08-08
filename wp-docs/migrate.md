# migrate - WordPress Database Migration

Complete WordPress multisite database migration with automated export/import/archival workflow. The migrate command handles the entire process of moving WordPress site data between environments safely.

## Overview

The migrate command supports two modes:
- **Complete Workflow** (default): Full automated migration with export/import/transform/backup/archival
- **Simple Mode**: Uses migration database for search-replace only (assumes tables already imported)

## Usage

```bash
wfuwp migrate <site-id> --from <source-env> --to <target-env> [options]
```

## Examples

### Complete Workflow
```bash
# Basic migration
wfuwp migrate 43 --from prod --to pprd

# Include WordPress file sync
wfuwp migrate 43 --from prod --to pprd --sync-s3
```

### Simple Mode
```bash
# Phase 1 behavior - search-replace only
wfuwp migrate 43 --from prod --to pprd --simple
```

## Complete Workflow Steps

1. **Export** site tables from source environment
2. **Import** to migration database
3. **Transform** data with search-replace operations
4. **Backup** existing target tables
5. **Export** migrated tables from migration database
6. **Import** to target environment
7. **Sync** WordPress files between S3 environments (if --sync-s3)
8. **Archive** all SQL files (to S3 if configured, otherwise local backup directory)
9. **Cleanup** migration database

## Options

- `--sync-s3` - Include WordPress file synchronization between S3 environments
- `--simple` - Use simple mode (Phase 1 behavior)
- `--skip-backup` - Skip backup of target tables (not recommended)
- `--skip-s3` - Skip S3 archival even if configured
- `--keep-files` - Keep local SQL files after archival
- `--work-dir <path>` - Custom working directory for temporary files

## Safety Features

- **Pre-flight checks** - Validates database connections, site existence, AWS CLI availability
- **Target backups** - Automatically backs up existing target tables before import
- **S3 archival** - Archives all SQL files with metadata for audit trail
- **Rollback capability** - Can restore from backups if migration fails
- **Confirmation prompts** - Asks before destructive operations
- **Progress tracking** - Shows step-by-step progress with file counts and sizes

## WordPress Multisite Specifics

- **Main site (ID 1)**: Tables like `wp_posts`, `wp_options`
- **Subsites (ID > 1)**: Tables like `wp_43_posts`, `wp_43_options`
- **Network tables**: Shared tables like `wp_users`, `wp_blogs` (excluded from site migrations)
- **Automatic detection**: Identifies site-specific tables automatically

## Configuration Requirements

The migrate command requires configuration for:
- Source and target environment database connections
- Migration database for temporary operations
- Optional S3 configuration for archival
- Optional local backup directory

See the [config command documentation](config.md) for setup details.

## Common Use Cases

**Production to Pre-Production:**
```bash
wfuwp migrate 43 --from prod --to pprd --sync-s3
```

**UAT to Development:**
```bash
wfuwp migrate 12 --from uat --to dev
```

**Simple search-replace only:**
```bash
wfuwp migrate 43 --from prod --to pprd --simple
```

## Troubleshooting

**Database connection errors:**
- Verify environment configuration with `wfuwp config verify`
- Check database credentials and network connectivity

**Migration database issues:**
- Ensure migration database exists and is accessible
- Check that user has CREATE, DROP, INSERT, SELECT permissions

**S3 archival failures:**
- Verify AWS CLI configuration with `aws configure list`
- Check S3 bucket permissions and region settings

**File sync issues:**
- Ensure source and target S3 buckets exist
- Verify AWS credentials have S3 read/write permissions

For detailed configuration help, see: `wfuwp config --help`