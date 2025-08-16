# Getting Started Guide

Welcome to the WFU WordPress CLI tool! This guide will walk you through setting up and using the tool for the first time.

## What is wfuwp?

The `wfuwp` CLI tool helps you manage WordPress multisite installations across different environments (development, testing, staging, and production). It automates complex tasks like database migrations, file synchronization, and environment management.

## Prerequisites Checklist

Before you begin, make sure you have:

- [ ] **Node.js 18+** installed ([Download](https://nodejs.org/) or use [nvm](https://github.com/nvm-sh/nvm))
- [ ] **Docker** installed and running ([Download](https://www.docker.com/products/docker-desktop))
- [ ] **AWS CLI** configured with your credentials ([Setup Guide](https://aws.amazon.com/cli/))
- [ ] **Access permissions** to WFU WordPress databases and S3 buckets
- [ ] **SSH keys** configured for EC2 access (if using EC2 features)

## Step 1: Installation

Install the tool globally using npm:

```bash
npm install -g wfuwp
```

Verify the installation:

```bash
wfuwp --version
```

## Step 2: Initial Configuration

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

## Step 3: Verify Your Setup

Test all your connections to ensure everything is configured correctly:

```bash
# Verify all configurations
wfuwp config verify

# Test specific database connection
wfuwp db test prod

# List all configured environments
wfuwp db list
```

## Step 4: Your First Migration (Example)

Let's walk through migrating a WordPress site from production to pre-production:

### 1. Check what site you want to migrate

First, identify the site ID you want to migrate. Site IDs are numbers that correspond to WordPress multisite installations.

### 2. Preview the migration (dry run)

Always start with a dry run to see what will happen:

```bash
wfuwp migrate 43 --from prod --to pprd --dry-run
```

### 3. Perform the actual migration

If the dry run looks good, proceed with the migration:

```bash
wfuwp migrate 43 --from prod --to pprd
```

The tool will:
1. Export the site's database tables from production
2. Transform URLs and paths for the target environment
3. Back up the existing pre-production data
4. Import the migrated data to pre-production
5. Archive all backup files

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