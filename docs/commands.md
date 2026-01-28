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

### Database Migration

> **Note:** Database migration functionality has been moved to a dedicated tool: **wfu-migrate**
>
> Install it with: `npm install -g wfu-migrate`
>
> See the [wfu-migrate documentation](https://github.com/wmalexander/wfu-migrate) for usage.

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

### db - Database Connection Utilities

Test and verify database connections for all configured environments.

```bash
wfuwp db <subcommand>
```

#### Subcommands
- `test <env>` - Test database connection for an environment
- `list` - List all configured database environments

#### Examples
```bash
# Test production database connection
wfuwp db test prod

# List all configured environments
wfuwp db list
```

---

### restore - Restore Database from Backup

Restore WordPress database from SQL backup files.

```bash
wfuwp restore <sql-file> --to <env> [options]
```

#### Arguments
- `sql-file` - Path to SQL backup file

#### Required Options
- `--to <env>` - Target environment to restore to

#### Optional Options
- `--dry-run` - Preview restore without making changes
- `--timeout <minutes>` - Custom timeout for large files (default: 20)

#### Examples
```bash
# Restore backup to UAT environment
wfuwp restore ./backup.sql --to uat

# Preview restore without making changes
wfuwp restore ./backup.sql --to dev --dry-run
```

---

### clickup - ClickUp Task Management Integration

Comprehensive ClickUp integration for managing tasks directly from the command line.

```bash
wfuwp clickup <subcommand> [options]
```

#### Key Features
- Create and manage ClickUp tasks with full metadata support
- List and filter tasks with advanced filtering options
- Export tasks in CSV, JSON, and Markdown formats
- Batch create tasks from text or JSON files

#### Quick Start
```bash
# Configure API token
wfuwp clickup config set token pk_your_api_token

# Create a task
wfuwp clickup create "Fix login bug" --priority high

# List your tasks
wfuwp clickup tasks --my-tasks
```

---

### local - Local Development Environment Management

Complete local development environment management for WFU WordPress sites with DDEV integration, domain management, and automated setup workflows.

```bash
wfuwp local <subcommand> [options]
```

#### Subcommands
- `domain` - Manage local development domains (/etc/hosts)
- `status` - Show environment status and health checks
- `install` - Install and setup development dependencies
- `start` - Start local development environment
- `stop` - Stop local development environment
- `restart` - Restart local development environment
- `refresh` - Refresh database from production
- `reset` - Reset entire local environment
- `config` - Configure local development settings

#### Examples
```bash
# First-time setup workflow
wfuwp local install              # Install Docker, DDEV, dependencies
wfuwp local config wizard        # Configure settings
sudo wfuwp local domain add 43   # Add domain for site 43
wfuwp local start 43             # Start development environment
```

---

### doctor - System Prerequisites and Health Check

Check system prerequisites and tool health for the WFU WordPress CLI.

```bash
wfuwp doctor [options]
```

#### Options
- `--category <type>` - Check specific category (prerequisites, configuration, connectivity)
- `--fix` - Show detailed fix instructions

#### Examples
```bash
# Full system check
wfuwp doctor

# Check only prerequisites
wfuwp doctor --category prerequisites

# Show fix instructions for issues
wfuwp doctor --fix
```

---

### docs - Browse and Search Documentation

Browse and search documentation topics directly from the command line.

```bash
wfuwp docs [options] [topic]
```

#### Options
- `-l, --list` - List all available topics
- `-s, --search <query>` - Search documentation for a term
- `-b, --browser` - Open in browser (GitHub)
- `-p, --print` - Print to terminal (default for local files)

#### Examples
```bash
# List all documentation topics
wfuwp docs --list

# View getting started guide
wfuwp docs getting-started

# Search documentation
wfuwp docs --search "migrate"
```

---

### download-local - Download Local Database Exports

Download local database exports from S3 for development use.

```bash
wfuwp download-local [options]
```

#### Options
- `--environment <env>` - Source environment for database export
- `--site-id <id>` - Specific site ID to download
- `--output-dir <path>` - Custom output directory

#### Examples
```bash
# Download latest production export
wfuwp download-local --environment prod

# Download specific site export
wfuwp download-local --environment prod --site-id 43
```

---

### delete-site - Delete WordPress Site

Delete a WordPress site and all its tables from a specific environment.

```bash
wfuwp delete-site <site-id> <environment> [options]
```

#### Arguments
- `site-id` - Numeric site identifier
- `environment` - Target environment (dev/uat/pprd/prod)

#### Options
- `--dry-run` - Preview what would be deleted
- `--force` - Skip confirmation prompts
- `--backup` - Create backup before deletion

#### Examples
```bash
# Delete site with confirmation
wfuwp delete-site 43 uat

# Preview deletion
wfuwp delete-site 43 uat --dry-run

# Force delete with backup
wfuwp delete-site 43 dev --force --backup
```

---

### clean-lower-envs - Clean Up Orphaned Sites

Clean up orphaned sites and tables in lower environments by comparing with production.

```bash
wfuwp clean-lower-envs [options]
```

#### Options
- `--environment <env>` - Target environment to clean (dev/uat/pprd)
- `--dry-run` - Preview what would be cleaned
- `--force` - Skip confirmation prompts

#### Examples
```bash
# Clean UAT environment
wfuwp clean-lower-envs --environment uat

# Preview cleanup
wfuwp clean-lower-envs --environment dev --dry-run
```

---

### md2wpblock - Convert Markdown to WordPress Blocks

Convert Markdown files to WordPress block editor HTML format.

```bash
wfuwp md2wpblock <path> [options]
```

#### Arguments
- `path` - Path to Markdown file or directory

#### Options
- `--output <path>` - Output file or directory
- `--overwrite` - Overwrite existing HTML files
- `--recursive` - Process directories recursively

#### Examples
```bash
# Convert single file
wfuwp md2wpblock document.md

# Convert entire directory
wfuwp md2wpblock ./docs --output ./html --recursive
```

---

### cleanup - Clean Up Temporary Directories

Clean up orphaned temporary directories and files.

```bash
wfuwp cleanup [options]
```

#### Options
- `--dry-run` - Preview what would be cleaned
- `--force` - Skip confirmation prompts
- `--older-than <days>` - Only clean files older than specified days

#### Examples
```bash
# Clean up old temporary files
wfuwp cleanup

# Preview cleanup
wfuwp cleanup --dry-run

# Clean files older than 7 days
wfuwp cleanup --older-than 7
```

---

## Command Aliases

For convenience, several command aliases are available:

```bash
# Shortcuts
wfuwp c    # config
wfuwp s3   # syncs3
wfuwp ips  # listips
wfuwp ssh  # sshaws

# Examples
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