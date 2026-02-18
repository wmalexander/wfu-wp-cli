# Admin Guide

## Overview

`wfuwp` is a command-line tool for WFU WordPress administrators and developers. It simplifies common operational tasks such as syncing files between environments, connecting to servers, managing local development environments, and integrating with ClickUp for task management. It replaces manual AWS Console and SSH workflows with simple, memorable commands.

## Installation

### Install from npm (Recommended)

```bash
npm install -g wfuwp
```

### Install from Source

```bash
git clone <repository-url>
cd wfu-wp-cli
npm install
npm run build
npm link
```

### Prerequisites

- **Node.js 16.0.0 or higher**
- **AWS CLI** installed and configured with WFU credentials
- **Docker** (for database operations)
- **DDEV** (for local development -- can be auto-installed)

### Verify Installation

```bash
wfuwp --version
wfuwp doctor      # Check all prerequisites
```

## Configuration

### Interactive Setup (Recommended)

```bash
wfuwp config wizard
```

The wizard walks through configuring:
- Database connections for each environment (dev, uat, pprd, prod)
- S3 bucket settings for backups
- ClickUp API token

### Manual Configuration

```bash
# Database settings
wfuwp config set environments.prod.host prod-db.wfu.edu
wfuwp config set environments.prod.user wp_prod
wfuwp config set environments.prod.password your_password
wfuwp config set environments.prod.database wp_production

# S3 settings
wfuwp config set s3.bucket wfu-wp-backups
wfuwp config set s3.region us-east-1

# ClickUp
wfuwp config set clickup.token pk_your_api_token

# View current settings
wfuwp config list

# Verify everything works
wfuwp config verify
```

Configuration is stored at `~/.wfuwp/config.json` with passwords encrypted.

## Usage

### S3 File Synchronization

Sync WordPress site files between environments:

```bash
# Preview what would be synced (dry run)
wfuwp syncs3 43 uat pprd --dry-run

# Sync with confirmation prompt
wfuwp syncs3 43 uat pprd

# Sync without confirmation
wfuwp syncs3 43 uat pprd --force

# Verbose output showing all files
wfuwp syncs3 43 uat pprd --verbose
```

### EC2 Instance Management

List running EC2 instance IPs:

```bash
wfuwp listips uat              # Private IPs (default)
wfuwp listips prod --public    # Public IPs
wfuwp listips dev --json       # JSON output for scripting
```

SSH into EC2 instances:

```bash
wfuwp sshaws uat               # Connect to first instance
wfuwp sshaws prod --all        # Connect to all instances
wfuwp sshaws dev --list        # List instances without connecting
wfuwp sshaws pprd --key ~/.ssh/key.pem  # Use specific SSH key
```

### Database Operations

Test database connections:

```bash
wfuwp db test prod
wfuwp db list
```

Restore from backup:

```bash
wfuwp restore ./backup.sql --to uat
wfuwp restore ./backup.sql --to dev --dry-run
```

### Local Development

```bash
# First-time setup
wfuwp local install              # Install Docker, DDEV
wfuwp local config wizard        # Configure settings
sudo wfuwp local domain add 43   # Add domain to /etc/hosts
wfuwp local install database     # Download production database
wfuwp local start 43             # Start environment

# Daily workflow
wfuwp local status               # Check environment health
wfuwp local start 43             # Start site
wfuwp local refresh database     # Refresh with latest data
wfuwp local stop 43              # Stop when done
```

### ClickUp Task Management

```bash
# Create a task
wfuwp clickup create "Fix login bug" --priority high

# List tasks
wfuwp clickup tasks --my-tasks
wfuwp clickup tasks --status "in progress"

# Update a task
wfuwp clickup update TASK_ID --status "complete"

# Export tasks
wfuwp clickup tasks --export csv
```

### DNS Spoofing for Development

```bash
# Spoof local domains to point to an environment
sudo wfuwp spoof --env dev

# Remove spoofing
sudo wfuwp unspoof
```

### Release Branch Cleanup

After merging PRs to main, sync dev/uat branches:

```bash
wfuwp release cleanup              # Sync all repos
wfuwp release cleanup --dry-run    # Preview changes
```

## Troubleshooting

### "AWS CLI is not installed or not in PATH"

Install AWS CLI and ensure it is in your PATH:

```bash
brew install awscli      # macOS
aws configure            # Set up credentials
```

### "Site ID must be a positive integer"

The syncs3 command requires a numeric site ID (e.g., `43`), not a site name.

### "Invalid source/destination environment"

Valid environment names are: `dev`, `uat`, `pprd`, `prod`.

### "Database configuration incomplete"

Run `wfuwp config wizard` to set up database connections, or manually configure using `wfuwp config set`.

### "Docker is not running"

Start Docker Desktop before running database or local development commands.

### General Debugging

```bash
wfuwp doctor          # Check all prerequisites
wfuwp config verify   # Verify configuration
wfuwp --help          # See all available commands
wfuwp docs --list     # Browse built-in documentation
```

## FAQ

**Q: Where is the configuration stored?**
A: In `~/.wfuwp/config.json`. Passwords are encrypted.

**Q: Can I use this tool without AWS access?**
A: Commands like `clickup`, `local`, and `docs` work without AWS. S3 and EC2 commands require AWS CLI configuration.

**Q: How do I update wfuwp?**
A: Run `npm update -g wfuwp` to get the latest version.

**Q: Where did the database migration commands go?**
A: Database migration has been moved to a dedicated tool: `wfu-migrate`. Install it with `npm install -g wfu-migrate`.

**Q: Is this tool safe to use on production?**
A: The tool includes safety features like confirmation prompts, dry-run mode, and input validation. Always use `--dry-run` first when running commands against production.
