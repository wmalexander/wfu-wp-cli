# Configuration Guide

## Overview

The WFU WordPress CLI uses a centralized configuration system stored in `~/.wfuwp/config.json`. All sensitive data is encrypted using AES-256-GCM encryption.

## Configuration Structure

```json
{
  "environments": {
    "dev": {
      "host": "dev-db.wfu.edu",
      "user": "wordpress",
      "password": "encrypted...",
      "database": "wordpress_dev"
    },
    "uat": {
      "host": "uat-db.wfu.edu",
      "user": "wordpress",
      "password": "encrypted...",
      "database": "wordpress_uat"
    },
    "pprd": {
      "host": "pprd-db.wfu.edu",
      "user": "wordpress",
      "password": "encrypted...",
      "database": "wordpress_pprd"
    },
    "prod": {
      "host": "prod-db.wfu.edu",
      "user": "wordpress",
      "password": "encrypted...",
      "database": "wordpress_prod"
    }
  },
  "migration": {
    "host": "migration-db.wfu.edu",
    "user": "migration",
    "password": "encrypted...",
    "database": "wp_migration"
  },
  "s3": {
    "bucket": "wfu-wordpress-backups",
    "region": "us-east-1",
    "prefix": "migrations"
  },
  "backup": {
    "localPath": "~/.wfuwp/backups"
  }
}
```

## Configuration Methods

### Method 1: Interactive Wizard (Recommended)

```bash
wfuwp config wizard
```

The wizard will prompt for:
1. Database credentials for each environment
2. Migration database credentials
3. S3 bucket configuration (optional)
4. Local backup directory (optional)

### Method 2: Manual Configuration

```bash
# Set environment credentials
wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set env.prod.user wordpress
wfuwp config set env.prod.password "your-password"
wfuwp config set env.prod.database wordpress_prod

# Set migration database
wfuwp config set migration.host migration-db.wfu.edu
wfuwp config set migration.user migration
wfuwp config set migration.password "migration-password"
wfuwp config set migration.database wp_migration

# Set S3 configuration
wfuwp config set s3.bucket wfu-wordpress-backups
wfuwp config set s3.region us-east-1
wfuwp config set s3.prefix migrations

# Set backup location
wfuwp config set backup.localPath ~/.wfuwp/backups
```

### Method 3: Import Existing Configuration

```bash
# Import from JSON file
wfuwp config import config.json

# Export current configuration
wfuwp config export > config-backup.json
```

## Environment Configuration

### Database Settings

Each environment requires:

| Field | Description | Example |
|-------|-------------|---------|
| host | Database hostname or IP | prod-db.wfu.edu |
| user | MySQL username | wordpress |
| password | MySQL password | (encrypted) |
| database | Database name | wordpress_prod |

### Migration Database

Special database used for search-replace operations:

```bash
# Configure migration database
wfuwp config set migration.host localhost
wfuwp config set migration.user root
wfuwp config set migration.password "root-password"
wfuwp config set migration.database wp_migration

# Create migration database if needed
mysql -h localhost -u root -p -e "CREATE DATABASE IF NOT EXISTS wp_migration"
```

## S3 Configuration

### Basic S3 Setup

```bash
# Set S3 bucket for backups
wfuwp config set s3.bucket wfu-wordpress-backups
wfuwp config set s3.region us-east-1
wfuwp config set s3.prefix migrations
```

### S3 Environment Mapping

For file synchronization between environments:

```bash
# Map environments to S3 buckets
wfuwp config set s3.environments.prod wfu-wordpress-prod
wfuwp config set s3.environments.pprd wfu-wordpress-pprd
wfuwp config set s3.environments.uat wfu-wordpress-uat
wfuwp config set s3.environments.dev wfu-wordpress-dev
```

## Backup Configuration

### Local Backups

```bash
# Set local backup directory
wfuwp config set backup.localPath /path/to/backups

# Use timestamp subdirectories
wfuwp config set backup.useTimestamp true

# Set retention days
wfuwp config set backup.retentionDays 30
```

### S3 Backups

```bash
# Enable S3 backups
wfuwp config set backup.useS3 true

# Set S3 lifecycle policy
wfuwp config set backup.s3.lifecycle.enabled true
wfuwp config set backup.s3.lifecycle.days 90
```

## Advanced Configuration

### SSH Settings

```bash
# Default SSH key for EC2 instances
wfuwp config set ssh.defaultKey ~/.ssh/wfu-wordpress.pem

# SSH user for instances
wfuwp config set ssh.defaultUser ec2-user

# Known hosts file
wfuwp config set ssh.knownHosts ~/.ssh/known_hosts
```

### Docker Settings

```bash
# Custom Docker socket
wfuwp config set docker.socket /var/run/docker.sock

# WP-CLI image version
wfuwp config set docker.wpCliImage wordpress:cli-2.7

# Container timeout (seconds)
wfuwp config set docker.timeout 300
```

### Logging Configuration

```bash
# Log level (debug, info, warn, error)
wfuwp config set logging.level info

# Log file location
wfuwp config set logging.file ~/.wfuwp/logs/wfuwp.log

# Log rotation
wfuwp config set logging.maxSize 10M
wfuwp config set logging.maxFiles 5
```

## Configuration Commands

### View Configuration

```bash
# Show all configuration
wfuwp config show

# Show specific section
wfuwp config show env.prod
wfuwp config show s3

# Show raw JSON (with encrypted values)
wfuwp config show --raw
```

### Get Specific Values

```bash
# Get single value
wfuwp config get env.prod.host

# Get nested values
wfuwp config get s3.bucket
wfuwp config get backup.localPath
```

### Set Values

```bash
# Set single value
wfuwp config set env.dev.host localhost

# Set nested values
wfuwp config set s3.region us-west-2

# Set with prompt for password
wfuwp config set env.prod.password --prompt
```

### Delete Configuration

```bash
# Delete specific value
wfuwp config delete env.dev.password

# Delete entire section
wfuwp config delete s3

# Reset to defaults
wfuwp config reset
```

## Validation

### Verify All Connections

```bash
# Test all configured connections
wfuwp config verify

# Test specific environment
wfuwp config verify --env prod

# Test migration database
wfuwp config verify --migration

# Test S3 access
wfuwp config verify --s3
```

### Connection Testing

```bash
# Test database connection
wfuwp config test env.prod

# Test with verbose output
wfuwp config test env.prod --verbose

# Test all environments
wfuwp config test --all
```

## Security

### Encryption

All passwords are encrypted using:
- Algorithm: AES-256-GCM
- Key derivation: PBKDF2
- Iterations: 100,000
- Salt: Random 64-byte

### File Permissions

```bash
# Set secure permissions
chmod 700 ~/.wfuwp
chmod 600 ~/.wfuwp/config.json

# Verify permissions
ls -la ~/.wfuwp/
```

### Password Management

```bash
# Change password
wfuwp config set env.prod.password --prompt

# Rotate encryption key
wfuwp config rotate-key

# Export without passwords
wfuwp config export --no-passwords > config-template.json
```

## Environment Variables

Override configuration with environment variables:

```bash
# Database overrides
export WFUWP_PROD_HOST=prod-db.wfu.edu
export WFUWP_PROD_USER=wordpress
export WFUWP_PROD_PASSWORD=secret
export WFUWP_PROD_DATABASE=wordpress_prod

# S3 overrides
export WFUWP_S3_BUCKET=wfu-wordpress-backups
export WFUWP_S3_REGION=us-east-1

# AWS credentials
export AWS_PROFILE=wfu-wordpress
export AWS_REGION=us-east-1
```

## Multiple Configurations

### Profile Support

```bash
# Use specific profile
wfuwp --profile production migrate 43 --from prod --to pprd

# Set default profile
export WFUWP_PROFILE=production

# List profiles
wfuwp config profiles
```

### Configuration Files

```bash
# Use custom config file
wfuwp --config ~/custom-config.json migrate 43

# Merge configurations
wfuwp config merge additional-config.json
```

## Troubleshooting Configuration

### Common Issues

#### Permission Denied
```bash
# Fix config directory permissions
chmod 700 ~/.wfuwp
chmod 600 ~/.wfuwp/config.json
```

#### Corrupted Configuration
```bash
# Backup and recreate
mv ~/.wfuwp/config.json ~/.wfuwp/config.json.backup
wfuwp config wizard
```

#### Connection Failures
```bash
# Test with mysql client
mysql -h prod-db.wfu.edu -u wordpress -p wordpress_prod

# Check firewall/security groups
telnet prod-db.wfu.edu 3306
```

#### Encryption Issues
```bash
# Re-encrypt configuration
wfuwp config re-encrypt

# Export decrypted for debugging
wfuwp config export --decrypt > config-debug.json
```

## Best Practices

1. **Use the wizard** for initial setup
2. **Verify connections** after configuration changes
3. **Backup configuration** before major changes
4. **Use environment variables** for CI/CD
5. **Rotate passwords** regularly
6. **Limit file permissions** to owner only
7. **Use AWS IAM roles** instead of keys when possible
8. **Test in dev** before production changes
9. **Document custom settings** in team wiki
10. **Monitor log files** for configuration errors