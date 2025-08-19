# Getting Started Guide

Welcome to the WFU WordPress CLI tool! This guide will walk you through setting up and using the tool for the first time.

## What is wfuwp?

The `wfuwp` CLI tool helps you manage WordPress multisite installations across different environments (development, testing, staging, and production). It automates complex tasks like database migrations, file synchronization, and environment management.

## Prerequisites Overview

You'll need Node.js and some additional system dependencies, but don't worry about installing everything manually - the CLI tool can help!

**Minimum requirement:**
- [ ] **Node.js 16+** installed ([Download](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm))

**Additional dependencies** (can be installed automatically):
- Docker (for database operations)
- MySQL client (for database connectivity) 
- AWS CLI (for S3 and EC2 operations)

## Step 1: Installation

Install the tool globally using npm:

```bash
npm install -g wfuwp
```

Verify the installation:

```bash
wfuwp --version
```

## Step 2: System Health Check

Check your system and install missing dependencies:

```bash
# Check what's installed and what's needed
wfuwp doctor

# Install missing dependencies automatically
wfuwp install-deps

# Verify everything is working
wfuwp doctor
```

The `doctor` command will check:
- Node.js version compatibility
- Docker installation and daemon status
- AWS CLI configuration
- Database connectivity requirements
- Network access to required services

## Step 3: Initial Configuration

Run the configuration wizard to set up your environment connections:

```bash
wfuwp config wizard
```

The wizard will guide you through configuring:
1. Database connections for each environment (dev, uat, pprd, prod)
2. Migration database for temporary operations
3. S3 bucket settings for backups (optional)
4. Local backup directory (optional)

### Understanding Environments

- **dev** - Development environment for testing new features
- **uat** - User Acceptance Testing environment for QA
- **pprd** - Pre-production/staging environment, mirrors production
- **prod** - Production environment (live site)
- **local** - Your local development environment (optional)

## Step 4: Verify Your Setup

Test all your connections to ensure everything is configured correctly:

```bash
# Verify all configurations
wfuwp config verify

# Test specific database connection
wfuwp db test prod

# List all configured environments
wfuwp db list

# Final health check
wfuwp doctor
```

## Step 5: Your First Migration

The tool provides two migration approaches. For most users, **Phase 2 (env-migrate)** is recommended for its automation and safety features.

### Option A: Complete Environment Migration (Phase 2) - Recommended

For migrating entire environments or multiple sites with full automation:

#### 1. Preview the migration (dry run)

```bash
wfuwp env-migrate prod uat --dry-run --verbose
```

#### 2. Perform complete environment migration

```bash
# Migrate entire environment
wfuwp env-migrate prod uat

# Or migrate specific sites with file sync
wfuwp env-migrate prod uat --include-sites "1,43,52" --sync-s3
```

The tool will automatically:
1. Validate system requirements and database connections
2. Create complete backup of target environment
3. Discover and enumerate all sites (or use your include list)
4. Migrate network tables (wp_blogs, wp_site, etc.)
5. Process sites in batches with progress tracking
6. Sync WordPress files between S3 environments (if --sync-s3)
7. Archive all migration artifacts
8. Provide comprehensive migration report

### Option B: Single Site Migration (Phase 1)

For migrating individual sites with more manual control:

#### 1. Preview the migration (dry run)

```bash
wfuwp migrate 43 --from prod --to pprd --dry-run
```

#### 2. Perform the migration

```bash
wfuwp migrate 43 --from prod --to pprd --sync-s3
```

The tool will:
1. Export the site's database tables from production
2. Transform URLs and paths for the target environment
3. Back up the existing pre-production data
4. Import the migrated data to pre-production
5. Sync WordPress files (if --sync-s3)
6. Archive all backup files

### 4. Verify the migration

Visit the migrated site in your browser to confirm everything works correctly.

## Step 5: Common Tasks

### Sync WordPress Files Between Environments

```bash
# Sync uploads/media files from production to UAT
wfuwp syncs3 --from prod --to uat --site-id 43
```

### List EC2 Instances

```bash
# Show all EC2 instances in production
wfuwp listips prod
```

### SSH into EC2 Instances

```bash
# Connect to UAT server
wfuwp sshaws uat
```

### Test Local Development

```bash
# Spoof DNS for local testing
sudo wfuwp spoof mysite

# Remove DNS spoofing when done
sudo wfuwp unspoof
```

## Getting Help

### Command Help

Every command has built-in help:

```bash
# General help
wfuwp --help

# Command-specific help
wfuwp migrate --help
wfuwp config --help
wfuwp syncs3 --help
```

### Troubleshooting

If you encounter issues:

1. Check the [Troubleshooting Guide](./troubleshooting.md)
2. Verify your configuration: `wfuwp config verify`
3. Test database connections: `wfuwp db test <environment>`
4. Check AWS credentials: `aws configure list`

## Safety Tips

1. **Always use dry-run first** - Preview changes before executing
2. **Check your environment** - Double-check you're migrating to the right place
3. **Keep backups** - The tool creates automatic backups, but verify they exist
4. **Test after migration** - Always verify the migrated site works correctly

## Next Steps

- Read the [Commands Reference](./commands.md) for detailed command documentation
- Learn about [Migration Workflows](./migration.md) for complex scenarios
- Explore [Configuration Options](./configuration.md) for advanced settings
- Review [Architecture](./architecture.md) to understand how the tool works

## Glossary

- **Environment**: A separate WordPress installation (dev, uat, pprd, prod)
- **Migration**: Moving WordPress data from one environment to another
- **Multisite**: WordPress feature allowing multiple sites in one installation
- **Site ID**: Numeric identifier for a specific site in a multisite network
- **S3**: Amazon's cloud storage service for files and backups
- **EC2**: Amazon's cloud computing service for running servers
- **WP-CLI**: WordPress command-line interface used internally by this tool
- **Docker**: Container platform used to run WP-CLI commands reliably