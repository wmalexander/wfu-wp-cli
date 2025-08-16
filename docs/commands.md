# Commands Reference

## Overview

The WFU WordPress CLI provides a comprehensive set of commands for managing WordPress multisite installations across multiple environments.

## Global Options

All commands support these global options:

```bash
wfuwp [command] [options]

Global Options:
  -V, --version      Output version number
  -h, --help        Display help for command
  --profile <name>   Use specific configuration profile
  --config <path>    Use custom configuration file
  --verbose         Enable verbose output
  --debug          Enable debug mode
  --quiet          Suppress output except errors
  --no-color       Disable colored output
```

## Commands

### migrate - Database Migration

Migrate WordPress multisite databases between environments with automated search-replace operations.

```bash
wfuwp migrate <siteId> --from <source> --to <target> [options]
```

#### Arguments
- `siteId` - WordPress site ID (e.g., 43 for site wp_43_*)

#### Required Options
- `--from <env>` - Source environment (dev/uat/pprd/prod)
- `--to <env>` - Target environment (dev/uat/pprd/prod)

#### Optional Options
- `--sync-s3` - Also sync WordPress files between S3 buckets
- `--simple` - Use simple mode (Phase 1 behavior)
- `--skip-backup` - Skip backing up target database
- `--skip-s3` - Skip S3 archival of SQL files
- `--keep-files` - Don't delete temporary SQL files
- `--work-dir <path>` - Custom working directory
- `--dry-run` - Show what would be done without executing
- `--force` - Skip confirmation prompts

#### Examples

```bash
# Full migration with all safety features
wfuwp migrate 43 --from prod --to pprd

# Include WordPress files sync
wfuwp migrate 43 --from prod --to pprd --sync-s3

# Simple mode (search-replace only)
wfuwp migrate 43 --from prod --to pprd --simple

# Skip backups (dangerous!)
wfuwp migrate 43 --from prod --to pprd --skip-backup --force

# Dry run to preview operations
wfuwp migrate 43 --from prod --to pprd --dry-run
```

#### Migration Workflow
1. Export site tables from source database
2. Import tables to migration database
3. Run search-replace operations
4. Backup existing target tables
5. Export migrated tables
6. Import to target database
7. Sync S3 files (if --sync-s3)
8. Archive SQL files to S3/local
9. Cleanup migration database

---

### install-deps - Install System Dependencies

Install required system dependencies (Docker and MySQL client) for the WFU WordPress CLI tool.

```bash
wfuwp install-deps [options]
```

#### Options
- `--docker-only` - Install only Docker
- `--mysql-only` - Install only MySQL client
- `--check` - Check which dependencies are missing without installing
- `--force` - Force installation even if already installed

#### Examples
```bash
# Check current dependency status
wfuwp install-deps --check

# Install all missing dependencies
wfuwp install-deps

# Install only Docker
wfuwp install-deps --docker-only

# Force reinstall all dependencies
wfuwp install-deps --force
```

#### Supported Operating Systems
- Amazon Linux (EC2)
- Ubuntu
- Red Hat Enterprise Linux (RHEL)
- macOS (partial - Docker requires manual installation)

#### Notes
- Requires sudo privileges on Linux systems
- May require logout/login for Docker group changes to take effect
- On macOS, Docker Desktop must be installed manually
- MySQL client installation uses MariaDB client on Amazon Linux (fully compatible)

---

### config - Configuration Management

Manage multi-environment configuration settings.

```bash
wfuwp config <subcommand> [options]
```

#### Subcommands

##### wizard
Interactive configuration wizard
```bash
wfuwp config wizard
```

##### show
Display configuration
```bash
wfuwp config show [path]
wfuwp config show env.prod
wfuwp config show --raw  # Show encrypted values
```

##### get
Get specific configuration value
```bash
wfuwp config get <path>
wfuwp config get env.prod.host
```

##### set
Set configuration value
```bash
wfuwp config set <path> <value>
wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set env.prod.password --prompt  # Prompt for password
```

##### delete
Remove configuration value
```bash
wfuwp config delete <path>
wfuwp config delete env.dev
```

##### verify
Test all connections
```bash
wfuwp config verify
wfuwp config verify --env prod
wfuwp config verify --migration
wfuwp config verify --s3
```

##### export
Export configuration
```bash
wfuwp config export > config.json
wfuwp config export --no-passwords > template.json
```

##### import
Import configuration
```bash
wfuwp config import config.json
```

##### reset
Reset to defaults
```bash
wfuwp config reset
wfuwp config reset --confirm
```

---

### syncs3 - S3 Synchronization

Synchronize WordPress files between S3 buckets across environments.

```bash
wfuwp syncs3 --from <source> --to <target> [options]
```

#### Required Options
- `--from <env>` - Source environment (dev/uat/pprd/prod)
- `--to <env>` - Target environment (dev/uat/pprd/prod)

#### Optional Options
- `--site-id <id>` - Specific site ID to sync
- `--prefix <path>` - S3 prefix to sync (default: wp-content/uploads)
- `--dry-run` - Preview changes without syncing
- `--delete` - Delete files in target not in source
- `--exclude <pattern>` - Exclude files matching pattern
- `--include <pattern>` - Include only files matching pattern
- `--max-bandwidth <MB/s>` - Limit transfer bandwidth
- `--storage-class <class>` - S3 storage class for target

#### Examples

```bash
# Sync all WordPress uploads
wfuwp syncs3 --from prod --to uat

# Sync specific site uploads
wfuwp syncs3 --from prod --to uat --site-id 43

# Dry run to preview
wfuwp syncs3 --from prod --to uat --dry-run

# Full mirror with deletion
wfuwp syncs3 --from prod --to uat --delete

# Exclude certain files
wfuwp syncs3 --from prod --to uat --exclude "*.tmp"
```

---

### listips - List EC2 Instance IPs

Display EC2 instances with their IP addresses and tags.

```bash
wfuwp listips [options]
```

#### Options
- `--region <region>` - AWS region (default: us-east-1)
- `--filter <tag>` - Filter by tag (e.g., Environment=prod)
- `--format <type>` - Output format (table/json/csv)
- `--private` - Show private IPs instead of public
- `--all-regions` - Search all AWS regions

#### Examples

```bash
# List all instances
wfuwp listips

# Filter by environment
wfuwp listips --filter Environment=prod

# Show private IPs
wfuwp listips --private

# JSON output
wfuwp listips --format json

# All regions
wfuwp listips --all-regions
```

---

### sshaws - SSH to EC2 Instance

Connect to EC2 instance via SSH.

```bash
wfuwp sshaws <instance-id|name|ip> [options]
```

#### Arguments
- `instance-id|name|ip` - Instance ID, Name tag, or IP address

#### Options
- `--user <username>` - SSH user (default: ec2-user)
- `--key <path>` - SSH key file path
- `--port <number>` - SSH port (default: 22)
- `--command <cmd>` - Execute command and exit
- `--tunnel <local:remote>` - Create SSH tunnel

#### Examples

```bash
# Connect by instance ID
wfuwp sshaws i-1234567890abcdef0

# Connect by name tag
wfuwp sshaws prod-web-01

# Connect by IP
wfuwp sshaws 10.0.1.50

# Custom user and key
wfuwp sshaws prod-web-01 --user ubuntu --key ~/.ssh/custom.pem

# Execute command
wfuwp sshaws prod-web-01 --command "df -h"

# Create tunnel
wfuwp sshaws prod-db-01 --tunnel 3306:localhost:3306
```

---

### spoof - DNS Spoofing

Add DNS entries to /etc/hosts for local development.

```bash
wfuwp spoof <domain> <ip> [options]
```

#### Arguments
- `domain` - Domain name to spoof
- `ip` - IP address to point to

#### Options
- `--comment <text>` - Add comment to hosts entry
- `--multiple` - Add multiple domains (comma-separated)
- `--backup` - Backup hosts file first

#### Examples

```bash
# Spoof single domain
wfuwp spoof example.wfu.edu 127.0.0.1

# Multiple domains
wfuwp spoof --multiple "site1.wfu.edu,site2.wfu.edu" 127.0.0.1

# With comment
wfuwp spoof example.wfu.edu 192.168.1.100 --comment "Local dev"

# With backup
wfuwp spoof example.wfu.edu 127.0.0.1 --backup
```

---

### unspoof - Remove DNS Spoofing

Remove DNS entries from /etc/hosts.

```bash
wfuwp unspoof <domain> [options]
```

#### Arguments
- `domain` - Domain to remove (or 'all' for all wfuwp entries)

#### Options
- `--all` - Remove all wfuwp-managed entries
- `--backup` - Backup hosts file first

#### Examples

```bash
# Remove specific domain
wfuwp unspoof example.wfu.edu

# Remove all spoofed entries
wfuwp unspoof --all

# With backup
wfuwp unspoof example.wfu.edu --backup
```

---

### removehostkey - Remove SSH Host Key

Remove SSH host key from known_hosts file.

```bash
wfuwp removehostkey <host> [options]
```

#### Arguments
- `host` - Hostname or IP address

#### Options
- `--all-variants` - Remove all variants (hostname, IP, etc.)
- `--known-hosts <path>` - Custom known_hosts file

#### Examples

```bash
# Remove single host
wfuwp removehostkey prod-web-01.wfu.edu

# Remove all variants
wfuwp removehostkey prod-web-01.wfu.edu --all-variants

# Custom known_hosts
wfuwp removehostkey 10.0.1.50 --known-hosts ~/.ssh/custom_known_hosts
```

---

## Command Aliases

For convenience, several command aliases are available:

```bash
# Shortcuts
wfuwp m    # migrate
wfuwp c    # config
wfuwp s3   # syncs3
wfuwp ips  # listips
wfuwp ssh  # sshaws

# Examples
wfuwp m 43 --from prod --to pprd
wfuwp c wizard
wfuwp s3 --from prod --to uat
wfuwp ips --filter Environment=prod
wfuwp ssh prod-web-01
```

## Exit Codes

| Code | Description |
|------|-------------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | Connection error |
| 4 | Permission denied |
| 5 | File not found |
| 6 | Invalid arguments |
| 7 | Operation cancelled |
| 8 | Dependency missing |

## Environment Variables

Commands respect these environment variables:

```bash
# Override configuration
WFUWP_CONFIG_DIR    # Configuration directory
WFUWP_PROFILE       # Default profile
WFUWP_DEBUG         # Enable debug mode

# AWS settings
AWS_PROFILE         # AWS credentials profile
AWS_REGION          # Default AWS region

# Database overrides
WFUWP_PROD_HOST     # Production database host
WFUWP_PROD_USER     # Production database user
WFUWP_PROD_PASSWORD # Production database password
```

## Scripting Examples

### Automated Migration

```bash
#!/bin/bash
# Migrate multiple sites

SITES=(43 52 67 89)
SOURCE=prod
TARGET=pprd

for site in "${SITES[@]}"; do
  echo "Migrating site $site..."
  wfuwp migrate $site --from $SOURCE --to $TARGET --force
  
  if [ $? -eq 0 ]; then
    echo "Site $site migrated successfully"
  else
    echo "Failed to migrate site $site"
    exit 1
  fi
done
```

### Backup All Sites

```bash
#!/bin/bash
# Backup all sites to S3

ENVIRONMENTS=(dev uat pprd prod)

for env in "${ENVIRONMENTS[@]}"; do
  echo "Backing up $env..."
  
  # Get site IDs from database
  SITES=$(mysql -h $env-db.wfu.edu -u wordpress -p$PASSWORD \
    -e "SELECT blog_id FROM wp_blogs" -s)
  
  for site in $SITES; do
    wfuwp migrate $site --from $env --to $env \
      --backup-only --skip-migration
  done
done
```

### Environment Sync

```bash
#!/bin/bash
# Full environment sync

# Database
wfuwp migrate 1 --from prod --to uat --force

# Files
wfuwp syncs3 --from prod --to uat --delete

# Verify
wfuwp config verify --env uat
```

## Getting Help

```bash
# General help
wfuwp --help

# Command help
wfuwp migrate --help
wfuwp config --help

# Subcommand help
wfuwp config set --help
```