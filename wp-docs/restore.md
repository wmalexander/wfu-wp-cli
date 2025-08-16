# restore - Database Restore from SQL Backup

Restore a WordPress database from an SQL backup file. This command imports SQL dump files directly into a target environment's database.

## Overview

The `restore` command allows you to restore WordPress databases from SQL backup files created by migrations, manual exports, or automated backups. It's useful for:
- Recovering from failed migrations
- Restoring previous database states
- Importing manually exported databases
- Setting up environments from backups

## Usage

```bash
wfuwp restore <sql-file> --to <target-env> [options]
```

## Arguments

- `sql-file` - Path to the SQL backup file to restore

## Required Options

- `--to <env>` - Target environment to restore to (dev, uat, pprd, prod)

## Optional Options

- `--dry-run` - Preview what would be restored without making changes
- `-f, --force` - Skip confirmation prompt (use with caution!)
- `-v, --verbose` - Show detailed output during import
- `--timeout <minutes>` - Custom timeout for large databases (default: 20)

## Examples

### Basic Restore

```bash
# Restore a backup to UAT environment
wfuwp restore ./backups/site43_backup.sql --to uat

# Restore with verbose output
wfuwp restore ./backups/site43_backup.sql --to uat --verbose
```

### Restore from Migration Backup

```bash
# Migrations create automatic backups
# Find backup file in ~/.wfuwp/backups/ or S3
wfuwp restore ~/.wfuwp/backups/2024-01-15/pprd_site43_backup.sql --to pprd
```

### Preview Restore (Dry Run)

```bash
# See what would happen without making changes
wfuwp restore ./prod_export.sql --to dev --dry-run
```

### Force Restore (Skip Confirmation)

```bash
# Skip confirmation prompt - dangerous!
wfuwp restore ./backup.sql --to uat --force
```

### Large Database Restore

```bash
# Increase timeout for large databases
wfuwp restore ./large_backup.sql --to pprd --timeout 60 --verbose
```

## Safety Features

### Confirmation Prompt

By default, the restore command asks for confirmation before overwriting data:

```
⚠️  This will OVERWRITE the existing uat database with data from:
   ./backup.sql

Are you sure you want to continue? (y/N):
```

### Pre-flight Checks

Before restoring, the command:
1. Verifies the SQL file exists
2. Validates the target environment
3. Checks database configuration
4. Tests database connection
5. Confirms you want to proceed

## Where to Find Backup Files

### Automatic Migration Backups

When you run migrations, backups are automatically created:

```bash
# Local backups (default)
~/.wfuwp/backups/
└── 2024-01-15/
    ├── pprd_site43_backup.sql
    ├── pprd_site43_tables.sql
    └── metadata.json

# S3 backups (if configured)
s3://wfu-wp-backups/
└── migrations/
    └── 2024-01-15/
        └── site43_pprd_to_prod/
            ├── backup_pprd_site43.sql
            └── metadata.json
```

### Manual Database Exports

You can create manual exports using various methods:

```bash
# Using Docker and WP-CLI
docker run --rm -v $(pwd):/backup wordpress:cli \
  wp db export /backup/manual_export.sql \
  --host=prod-db.wfu.edu \
  --user=wp_user \
  --pass=password

# Using mysqldump directly
mysqldump -h prod-db.wfu.edu -u wp_user -p \
  wp_production > manual_export.sql
```

## Workflow Examples

### Rollback Failed Migration

```bash
# Migration failed or caused issues
# Find the automatic backup
ls ~/.wfuwp/backups/2024-01-15/

# Restore the original state
wfuwp restore ~/.wfuwp/backups/2024-01-15/pprd_site43_backup.sql --to pprd

# Verify the site works
# Visit the site in your browser
```

### Copy Production to Development

```bash
# Export production database (manually or use migrate)
# Then restore to development
wfuwp restore ./prod_export.sql --to dev

# The restore won't do URL replacements
# You may need to run search-replace separately
```

### Disaster Recovery

```bash
# Download backup from S3
aws s3 cp s3://wfu-wp-backups/migrations/latest/backup.sql ./

# Restore to production (be very careful!)
wfuwp restore ./backup.sql --to prod --verbose

# Verify immediately
wfuwp db test prod
```

## Important Notes

### No URL Replacement

The `restore` command does **NOT** perform URL replacements. It imports the SQL file as-is. If you're restoring from a different environment, you may need to:

1. Use the `migrate` command instead (which handles URL replacements)
2. Manually run search-replace operations after restore
3. Update the WordPress site URL in the database

### Database Permissions

The database user must have permissions to:
- DROP tables (to replace existing ones)
- CREATE tables
- INSERT data
- ALTER table structures

### Large Files

For very large SQL files:
- Use `--timeout` to increase the timeout
- Use `--verbose` to monitor progress
- Consider splitting the file if it's too large
- Ensure sufficient disk space for temporary files

## Troubleshooting

### File Not Found

**Error:** `SQL file not found: ./backup.sql`

**Solution:**
- Check the file path is correct
- Use absolute path: `/home/user/backups/backup.sql`
- Verify file exists: `ls -la ./backup.sql`

### Connection Failed

**Error:** `Database connection test failed`

**Solution:**
- Test connection: `wfuwp db test uat`
- Fix configuration: `wfuwp config wizard`
- Check network/VPN connection

### Import Timeout

**Error:** `Import operation timed out`

**Solution:**
- Increase timeout: `--timeout 60`
- Check database server resources
- Consider splitting large SQL file

### Permission Denied

**Error:** `Access denied for user`

**Solution:**
- Verify database user permissions
- Check password: `wfuwp config set env.uat.password --prompt`
- Contact database administrator for permissions

## Best Practices

1. **Always test in non-production first** - Restore to dev/uat before pprd/prod
2. **Keep backups of backups** - Before restoring, backup the current state
3. **Verify after restore** - Always check the site works after restoring
4. **Document what you restore** - Keep notes on what was restored and why
5. **Use dry-run first** - Preview the operation before executing

## See Also

- [migrate](./migrate.md) - Migrate with URL replacements
- [db](./db.md) - Test database connections
- [config](./config.md) - Configure database settings