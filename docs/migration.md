# Migration Workflows Guide

## Overview

The migration system provides automated workflows for moving WordPress multisite databases between environments. Phase 2 implementation includes complete export/import/transform pipelines with safety features.

## Migration Types

### 1. Complete Migration (Default)

Full automated workflow with all safety features:

```bash
wfuwp migrate 43 --from prod --to pprd
```

**Workflow Steps:**
1. Pre-flight checks (connections, site existence)
2. Export source database tables
3. Import to migration database
4. Run search-replace operations
5. Backup target database tables
6. Export transformed tables
7. Import to target database
8. Archive all SQL files
9. Cleanup migration database

### 2. Migration with File Sync

Include WordPress files (uploads, themes, plugins):

```bash
wfuwp migrate 43 --from prod --to pprd --sync-s3
```

**Additional Steps:**
- Sync wp-content/uploads between S3 buckets
- Preserve file permissions and metadata
- Incremental sync (only changed files)

### 3. Simple Migration

Phase 1 behavior for search-replace only:

```bash
wfuwp migrate 43 --from prod --to pprd --simple
```

**Workflow:**
- Assumes tables already in migration database
- Runs search-replace operations only
- No export/import automation

## Understanding WordPress Multisite

### Table Structure

WordPress multisite uses prefixed tables:

**Main Site (ID 1):**
```
wp_posts
wp_postmeta
wp_options
wp_terms
wp_term_taxonomy
wp_term_relationships
wp_comments
wp_commentmeta
```

**Subsites (e.g., ID 43):**
```
wp_43_posts
wp_43_postmeta
wp_43_options
wp_43_terms
wp_43_term_taxonomy
wp_43_term_relationships
wp_43_comments
wp_43_commentmeta
```

**Network Tables (Not Migrated):**
```
wp_blogs
wp_blog_versions
wp_registration_log
wp_signups
wp_site
wp_sitemeta
wp_users
wp_usermeta
```

### Site Detection

The tool automatically detects:
- Main site vs subsite based on ID
- All tables belonging to a site
- Tables to exclude from migration

## Search-Replace Operations

### Automatic Replacements

The migration tool automatically handles:

1. **Domain Changes**
   ```
   prod.example.edu → pprd.example.edu
   https://prod.example.edu → https://pprd.example.edu
   ```

2. **Serialized Data**
   - PHP serialized arrays
   - JSON encoded strings
   - Base64 encoded URLs

3. **Common Paths**
   ```
   /var/www/prod/ → /var/www/pprd/
   /uploads/sites/43/ → /uploads/sites/43/
   ```

### Custom Search-Replace

Add custom replacements via configuration:

```bash
# Add custom replacement
wfuwp config set migration.replacements[0].search "old-value"
wfuwp config set migration.replacements[0].replace "new-value"

# Multiple replacements
wfuwp config set migration.replacements '[
  {"search": "prod-api.edu", "replace": "pprd-api.edu"},
  {"search": "PROD_KEY", "replace": "PPRD_KEY"}
]'
```

## Pre-Flight Checks

Before migration, the tool verifies:

### 1. Database Connectivity
```bash
# Manual verification
wfuwp config verify --env prod
wfuwp config verify --env pprd
wfuwp config verify --migration
```

### 2. Site Existence
```bash
# Check if site exists
mysql -h prod-db.wfu.edu -u wordpress -p \
  -e "SELECT blog_id FROM wp_blogs WHERE blog_id = 43"
```

### 3. AWS Resources
```bash
# Verify S3 access
aws s3 ls s3://wfu-wordpress-prod/
aws s3 ls s3://wfu-wordpress-pprd/

# Check AWS CLI
aws --version
```

### 4. Docker Availability
```bash
# Verify Docker
docker --version
docker run --rm wordpress:cli wp --version
```

## Backup Strategies

### Automatic Backups

Every migration creates backups:

```
~/.wfuwp/backups/
└── 2024-01-15T10-30-45/
    ├── pprd-site-43-backup.sql
    ├── pprd-site-43-backup.sql.metadata.json
    └── migration.log
```

### S3 Archival

With S3 configured:

```
s3://wfu-wordpress-backups/
└── migrations/
    └── 2024-01-15/
        ├── prod-site-43-export.sql
        ├── pprd-site-43-backup.sql
        ├── migration-site-43-transformed.sql
        └── metadata.json
```

### Manual Backup

Before migration:

```bash
# Export specific site
wfuwp migrate 43 --from prod --to prod --backup-only

# Export entire database
mysqldump -h prod-db.wfu.edu -u wordpress -p \
  wordpress_prod > prod-full-backup.sql
```

## Migration Scenarios

### 1. Production to Pre-Production

Standard deployment workflow:

```bash
# Migrate database
wfuwp migrate 43 --from prod --to pprd

# Sync files
wfuwp syncs3 --from prod --to pprd --site-id 43

# Verify
curl https://pprd.example.edu/site-43/
```

### 2. Production to UAT

Testing environment refresh:

```bash
# Full migration with files
wfuwp migrate 43 --from prod --to uat --sync-s3

# Update test data
mysql -h uat-db.wfu.edu -u wordpress -p \
  -e "UPDATE wp_43_options SET option_value = 'UAT Testing' 
      WHERE option_name = 'blogname'"
```

### 3. Development to Production

Deploying changes:

```bash
# Dry run first
wfuwp migrate 43 --from dev --to prod --dry-run

# Review changes
cat ~/.wfuwp/logs/migration-dry-run.log

# Execute with confirmation
wfuwp migrate 43 --from dev --to prod
```

### 4. Emergency Rollback

Restore from backup:

```bash
# Find backup
ls ~/.wfuwp/backups/*/prod-site-43-backup.sql

# Restore
mysql -h prod-db.wfu.edu -u wordpress -p wordpress_prod \
  < ~/.wfuwp/backups/2024-01-15T10-30-45/prod-site-43-backup.sql
```

## Advanced Options

### Custom Working Directory

```bash
# Use specific directory for large migrations
wfuwp migrate 43 --from prod --to pprd \
  --work-dir /mnt/large-disk/migrations
```

### Keep Temporary Files

```bash
# Preserve SQL files for debugging
wfuwp migrate 43 --from prod --to pprd --keep-files

# Files location
ls /tmp/wfuwp-migrate-*/
```

### Skip Safety Features

```bash
# Skip backup (dangerous!)
wfuwp migrate 43 --from prod --to pprd --skip-backup

# Skip S3 archival
wfuwp migrate 43 --from prod --to pprd --skip-s3

# Force without confirmation
wfuwp migrate 43 --from prod --to pprd --force
```

### Dry Run Mode

```bash
# Preview operations
wfuwp migrate 43 --from prod --to pprd --dry-run

# Check log
cat ~/.wfuwp/logs/migration-dry-run.log
```

## Troubleshooting Migrations

### Common Issues

#### 1. Large Database Timeout

**Problem:** Migration times out on large databases

**Solution:**
```bash
# Increase Docker timeout
wfuwp config set docker.timeout 600

# Use custom working directory with more space
wfuwp migrate 43 --from prod --to pprd \
  --work-dir /mnt/large-disk
```

#### 2. Search-Replace Failures

**Problem:** WP-CLI search-replace fails

**Solution:**
```bash
# Use simple mode and manual search-replace
wfuwp migrate 43 --from prod --to pprd --simple

# Manual search-replace
docker run --rm -v /tmp/sql:/sql wordpress:cli \
  wp search-replace 'prod.edu' 'pprd.edu' \
  --export=/sql/output.sql
```

#### 3. Connection Refused

**Problem:** Cannot connect to database

**Solution:**
```bash
# Verify credentials
wfuwp config verify --env prod

# Test with mysql client
mysql -h prod-db.wfu.edu -u wordpress -p

# Check firewall/security groups
telnet prod-db.wfu.edu 3306
```

#### 4. S3 Sync Failures

**Problem:** S3 sync fails or is slow

**Solution:**
```bash
# Check AWS credentials
aws configure list
aws s3 ls

# Use bandwidth limiting
wfuwp syncs3 --from prod --to pprd \
  --max-bandwidth 10

# Sync specific directories
wfuwp syncs3 --from prod --to pprd \
  --prefix wp-content/uploads/2024
```

### Migration Logs

Check logs for details:

```bash
# Main log
tail -f ~/.wfuwp/logs/wfuwp.log

# Migration specific
cat ~/.wfuwp/logs/migration-43-prod-to-pprd.log

# Docker logs
docker logs $(docker ps -lq)
```

### Recovery Procedures

#### Failed Migration Recovery

1. **Identify failure point:**
   ```bash
   grep ERROR ~/.wfuwp/logs/wfuwp.log
   ```

2. **Restore from backup:**
   ```bash
   # Find backup
   ls ~/.wfuwp/backups/*/pprd-site-43-backup.sql
   
   # Restore
   mysql -h pprd-db.wfu.edu -u wordpress -p wordpress_pprd \
     < [backup-file]
   ```

3. **Clean migration database:**
   ```bash
   mysql -h migration-db.wfu.edu -u migration -p \
     -e "DROP DATABASE wp_migration; CREATE DATABASE wp_migration"
   ```

4. **Retry migration:**
   ```bash
   wfuwp migrate 43 --from prod --to pprd
   ```

## Best Practices

### Before Migration

1. **Verify configuration:**
   ```bash
   wfuwp config verify
   ```

2. **Check disk space:**
   ```bash
   df -h /tmp
   df -h ~/.wfuwp/backups
   ```

3. **Test in lower environment:**
   ```bash
   wfuwp migrate 43 --from uat --to dev
   ```

4. **Create manual backup:**
   ```bash
   mysqldump -h prod-db.wfu.edu -u wordpress -p \
     wordpress_prod > manual-backup.sql
   ```

### During Migration

1. **Monitor progress:**
   ```bash
   tail -f ~/.wfuwp/logs/wfuwp.log
   ```

2. **Check system resources:**
   ```bash
   top
   df -h
   ```

3. **Verify each step:**
   - Export completed
   - Import successful
   - Search-replace done
   - Target updated

### After Migration

1. **Verify site functionality:**
   ```bash
   curl -I https://pprd.example.edu/site-43/
   ```

2. **Check database:**
   ```bash
   mysql -h pprd-db.wfu.edu -u wordpress -p \
     -e "SELECT option_value FROM wp_43_options 
         WHERE option_name = 'siteurl'"
   ```

3. **Review logs:**
   ```bash
   grep -i error ~/.wfuwp/logs/wfuwp.log
   grep -i warning ~/.wfuwp/logs/wfuwp.log
   ```

4. **Clean up old backups:**
   ```bash
   find ~/.wfuwp/backups -mtime +30 -delete
   ```

## Performance Optimization

### Large Sites

For sites over 1GB:

```bash
# Use compression
wfuwp config set migration.compress true

# Increase memory limits
export NODE_OPTIONS="--max-old-space-size=4096"

# Use dedicated migration server
wfuwp config set migration.host dedicated-migration.wfu.edu
```

### Batch Processing

Migrate multiple sites:

```bash
#!/bin/bash
SITES=(43 52 67 89 101)

for site in "${SITES[@]}"; do
  wfuwp migrate $site --from prod --to pprd --force
  sleep 60  # Pause between migrations
done
```

### Parallel Execution

For independent sites:

```bash
# Run migrations in parallel
wfuwp migrate 43 --from prod --to pprd &
wfuwp migrate 52 --from prod --to pprd &
wfuwp migrate 67 --from prod --to pprd &
wait
```