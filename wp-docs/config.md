# config - Configuration Management

Multi-environment configuration management with interactive wizard for setting up database connections, S3 backups, and other tool settings.

## Overview

The config command manages all configuration settings for the WFU WordPress CLI tool, including database connections for multiple environments, migration settings, S3 configuration, and backup preferences.

## Usage

```bash
wfuwp config <subcommand> [options]
```

## Subcommands

### wizard - Interactive Configuration Setup
```bash
wfuwp config wizard
```
Interactive wizard that guides you through complete tool configuration. Recommended for first-time setup.

### set - Set Configuration Values
```bash
wfuwp config set <key> <value>
```

### get - Get Configuration Values  
```bash
wfuwp config get <key>
```

### verify - Verify Configuration
```bash
wfuwp config verify
```
Tests database connections and validates all configuration settings.

### list - List All Configuration
```bash
wfuwp config list
```

## Configuration Structure

### Environment Database Connections
```bash
# Production environment
wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set env.prod.user wp_user
wfuwp config set env.prod.password secure_password
wfuwp config set env.prod.database wp_prod

# UAT environment
wfuwp config set env.uat.host uat-db.wfu.edu
wfuwp config set env.uat.user wp_user
wfuwp config set env.uat.password secure_password
wfuwp config set env.uat.database wp_uat

# Pre-production environment
wfuwp config set env.pprd.host pprd-db.wfu.edu
wfuwp config set env.pprd.user wp_user
wfuwp config set env.pprd.password secure_password
wfuwp config set env.pprd.database wp_pprd

# Development environment
wfuwp config set env.dev.host dev-db.wfu.edu
wfuwp config set env.dev.user wp_user
wfuwp config set env.dev.password secure_password
wfuwp config set env.dev.database wp_dev
```

### Migration Database
```bash
wfuwp config set migration.host migration-db.wfu.edu
wfuwp config set migration.user wp_migration_user
wfuwp config set migration.password migration_password
wfuwp config set migration.database wp_migration
```

### S3 Configuration (Optional)
```bash
wfuwp config set s3.bucket wfu-wp-backups
wfuwp config set s3.region us-east-1
wfuwp config set s3.prefix backups/
```

### Local Backup Configuration (Alternative to S3)
```bash
wfuwp config set backup.localPath /path/to/local/backups
```

## Examples

### Complete Setup with Wizard
```bash
wfuwp config wizard
```
The wizard will prompt you for all necessary configuration values.

### Manual Configuration
```bash
# Set production database
wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set env.prod.database wp_multisite

# Set migration database
wfuwp config set migration.host migration-db.wfu.edu
wfuwp config set migration.database wp_migration

# Configure S3 backups
wfuwp config set s3.bucket wfu-wp-backups
wfuwp config set s3.region us-east-1

# Verify everything is working
wfuwp config verify
```

### Check Current Settings
```bash
# View all configuration
wfuwp config list

# Check specific setting
wfuwp config get env.prod.host

# Verify database connections
wfuwp config verify
```

## Security Features

- **Password encryption** - Database passwords are encrypted before storage
- **Secure storage** - Configuration stored in `~/.wfuwp/config.json` with restricted permissions
- **No plain text passwords** - Encrypted configuration prevents accidental exposure
- **Environment isolation** - Each environment has separate, isolated configuration

## Configuration File Location

The configuration is stored in:
```
~/.wfuwp/config.json
```

This file contains encrypted passwords and should not be shared or committed to version control.

## Validation

The `verify` subcommand tests:
- Database connectivity for all configured environments
- Migration database accessibility
- S3 bucket permissions (if configured)
- AWS CLI configuration
- Configuration file integrity

## Required vs Optional Settings

### Required for Basic Operations
- At least one environment database configuration
- Migration database configuration (for migrate command)

### Optional Settings
- S3 configuration (enables cloud archival)
- Local backup path (alternative to S3)
- All four environments (dev, uat, pprd, prod)

## Environment Variables

Configuration can also be provided via environment variables:
```bash
export WFUWP_ENV_PROD_HOST=prod-db.wfu.edu
export WFUWP_ENV_PROD_DATABASE=wp_multisite
export WFUWP_MIGRATION_HOST=migration-db.wfu.edu
```

Environment variables take precedence over configuration file settings.

## Troubleshooting

**Configuration file not found:**
Run `wfuwp config wizard` to create initial configuration.

**Database connection failures:**
- Verify host, port, and credentials with `wfuwp config verify`
- Check network connectivity to database servers
- Ensure database users have required permissions

**Permission errors:**
Configuration file permissions may be too restrictive. The tool will attempt to fix permissions automatically.

**S3 configuration issues:**
- Verify AWS CLI is configured: `aws configure list`
- Test S3 access: `aws s3 ls s3://your-bucket-name`
- Check bucket region matches configuration

For detailed help on any subcommand: `wfuwp config <subcommand> --help`