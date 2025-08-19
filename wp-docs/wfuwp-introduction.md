# WFU WordPress CLI Tool - Introduction

The WFU WordPress CLI tool (`wfuwp`) is a comprehensive command-line interface designed to simplify WordPress multisite management across multiple environments. It automates complex database migrations, S3 file synchronization, EC2 instance management, and local development workflows.

## What Does It Do?

The tool provides enterprise-grade automation for common WordPress operations:

- **Environment Migration** - Move WordPress sites between dev, uat, pprd, and prod environments with complete safety features
- **Database Management** - Automated export/import with URL transformations and backup creation  
- **File Synchronization** - Sync WordPress uploads and media files between S3 buckets
- **Local Development** - Set up local development environments with production data
- **Infrastructure Management** - Connect to EC2 instances, manage DNS, and handle AWS resources
- **System Health** - Check prerequisites, install dependencies, and validate configurations

## Installation

### Install the Tool

```bash
npm install -g wfuwp
```

### Check System Requirements

```bash
# Check what's installed and what's needed
wfuwp doctor

# Install missing dependencies automatically  
wfuwp install-deps
```

### Initial Setup

```bash
# Configure your environments interactively
wfuwp config wizard

# Verify everything is working
wfuwp config verify
```

## Updating

Keep your tool current with the latest features and fixes:

```bash
# Check current version
wfuwp --version

# Update to latest version
npm update -g wfuwp

# Verify update
wfuwp --version
```

## Command Categories

The tool organizes commands into logical categories:

### Migration and Environment Management
- **env-migrate** - Complete environment migration with automation and safety features
- **migrate** - Single-site database migration with manual control
- **local** - Local development environment management

### Configuration and Setup
- **config** - Multi-environment configuration with interactive wizard
- **db** - Database connection testing and validation
- **doctor** - System health check and prerequisite validation
- **install-deps** - Automated dependency installation

### Data Management
- **restore** - Restore WordPress databases from backup files
- **syncs3** - Synchronize S3 files between environments
- **delete-site** - Safely delete WordPress sites and database tables
- **clean-lower-envs** - Clean up orphaned sites in lower environments

### AWS and Infrastructure
- **listips** - Display EC2 instance IP addresses
- **sshaws** - SSH into EC2 instances with automatic key management
- **spoof/unspoof** - DNS spoofing for local testing
- **removehostkey** - Clean up SSH host keys

### Utilities and Maintenance
- **clickup** - ClickUp task management integration
- **cleanup** - Clean up temporary migration files
- **download-local** - Download database exports from S3
- **md2wpblock** - Convert Markdown to WordPress block editor HTML

## Getting Help - The Built-In Documentation System

**The tool includes comprehensive built-in documentation that's always current and complete.** Instead of maintaining separate documentation files, use these commands to access detailed help:

### General Help and Command List

```bash
# See all available commands
wfuwp --help

# Check tool version
wfuwp --version
```

### Command-Specific Help

Every command has detailed help with examples:

```bash
# Get help for any command
wfuwp <command> --help

# Examples:
wfuwp env-migrate --help      # Complete environment migration
wfuwp migrate --help          # Single-site migration  
wfuwp config --help           # Configuration management
wfuwp doctor --help           # System health checks
wfuwp syncs3 --help          # S3 file synchronization
```

### Built-In Documentation Browser

The tool includes a documentation browser with search capabilities:

```bash
# List all documentation topics
wfuwp docs --list

# View specific topics
wfuwp docs getting-started    # New user guide
wfuwp docs quick-reference    # Command cheat sheet
wfuwp docs troubleshooting    # Common problems and solutions
wfuwp docs migration          # Migration workflows and strategies

# Search documentation
wfuwp docs --search "backup"
wfuwp docs --search "s3"
```

### Health Checks and Diagnostics

Before using the tool, always verify your system:

```bash
# Complete system health check
wfuwp doctor

# Check specific areas
wfuwp doctor --category prerequisites
wfuwp doctor --category configuration  
wfuwp doctor --category connectivity

# Get detailed fix instructions
wfuwp doctor --fix
```

## Quick Start Workflow

Here's the recommended first-time setup process:

```bash
# 1. Install the tool
npm install -g wfuwp

# 2. Check system health and install dependencies
wfuwp doctor
wfuwp install-deps  # If needed

# 3. Configure environments
wfuwp config wizard

# 4. Verify setup
wfuwp config verify
wfuwp doctor

# 5. Explore available commands
wfuwp --help

# 6. Try your first operation (with preview)
wfuwp env-migrate prod uat --dry-run --verbose
```

## Common Usage Patterns

### Environment Migration
```bash
# Preview complete environment migration
wfuwp env-migrate prod uat --dry-run

# Migrate specific sites with file sync
wfuwp env-migrate prod uat --include-sites "1,43,52" --sync-s3
```

### Single Site Migration
```bash
# Preview single site migration
wfuwp migrate 43 --from prod --to pprd --dry-run

# Perform migration with file sync
wfuwp migrate 43 --from prod --to pprd --sync-s3
```

### File Synchronization
```bash
# Preview S3 sync
wfuwp syncs3 43 uat prod --dry-run

# Sync files between environments
wfuwp syncs3 43 uat prod
```

### Infrastructure Management
```bash
# List EC2 instances
wfuwp listips prod

# SSH to instances
wfuwp sshaws prod
```

## Safety Features

The tool includes extensive safety measures:

- **Dry run mode** - Preview operations with `--dry-run` before executing
- **Automatic backups** - Creates backups before destructive operations
- **Input validation** - Validates environment names, site IDs, and file paths
- **Confirmation prompts** - Interactive confirmation before dangerous operations
- **Health checks** - Validates system state before operations
- **Comprehensive logging** - Detailed logs for troubleshooting and auditing

## Why Use the Built-In Documentation?

The built-in help system offers several advantages over external documentation:

1. **Always Current** - Help text is updated with every release
2. **Context-Aware** - Shows options relevant to your current configuration
3. **Searchable** - Find specific topics quickly with the search function
4. **Offline Access** - Available anywhere the tool is installed
5. **Consistent** - Same format and style across all commands
6. **Interactive** - Includes examples you can copy and paste directly

## Support and Troubleshooting

When you encounter issues:

1. **Start with health checks**: `wfuwp doctor --fix`
2. **Check command help**: `wfuwp <command> --help`
3. **Search documentation**: `wfuwp docs --search "<topic>"`
4. **Use verbose mode**: Add `--verbose` to any command for detailed output
5. **Preview operations**: Use `--dry-run` to understand what will happen

The tool is designed to be self-documenting and self-diagnosing, providing the information you need when you need it, right in your terminal.

## Next Steps

Once you've installed and configured the tool:

1. Run `wfuwp doctor` to ensure everything is working
2. Explore `wfuwp --help` to see all available commands
3. Use `wfuwp docs --list` to see built-in documentation topics
4. Try commands with `--dry-run` to safely explore functionality
5. Use `wfuwp docs getting-started` for detailed first-time user guidance

The comprehensive built-in documentation system will guide you through everything from basic configuration to advanced migration scenarios, all accessible directly from your command line.