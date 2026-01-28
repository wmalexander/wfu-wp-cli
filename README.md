# WFU WordPress CLI Tool

A comprehensive command-line interface for managing WordPress multisite installations across multiple environments. Automates S3 synchronization, EC2 management, and local development workflows.

## 📚 Documentation

- **[Tool Introduction](wp-docs/wfuwp-introduction.md)** - What is wfuwp and how to get started
- **Built-in Help System** - Use `wfuwp --help` and `wfuwp docs --list` for complete, current documentation
- **[Developer Documentation](docs/)** - Technical architecture and development guides

## Database Migration

> **Note:** Database migration functionality has been moved to a dedicated tool: **wfu-migrate**
>
> Install it with: `npm install -g wfu-migrate`
>
> See the [wfu-migrate documentation](https://github.com/wmalexander/wfu-migrate) for usage.

## Installation

### Install globally from npm (Recommended)

```bash
npm install -g wfuwp
```

### Install from source

```bash
git clone <repository-url>
cd wfu-wp-cli
npm install
npm run build
npm link
```

## Prerequisites

- Node.js 16.0.0 or higher
- AWS CLI installed and configured with appropriate credentials
- Access to WFU WordPress S3 buckets

### AWS CLI Setup

Make sure you have the AWS CLI installed and configured:

```bash
# Install AWS CLI (if not already installed)
# macOS
brew install awscli

# Configure with your credentials
aws configure
```

## Usage

### Basic Command Structure

```bash
wfuwp <command> [options] [arguments]
```

### Available Commands

> **Note:** For complete command documentation, see the [Commands Reference](docs/commands.md) or [Quick Reference](docs/quick-reference.md)

#### `syncs3` - Sync WordPress sites between S3 environments

Synchronizes WordPress site files between different S3 environments.

```bash
wfuwp syncs3 <site-id> <from-env> <to-env> [options]
```

**Arguments:**
- `site-id`: Numeric site identifier (e.g., 43)
- `from-env`: Source environment (`dev`, `uat`, `pprd`, `prod`)
- `to-env`: Destination environment (`dev`, `uat`, `pprd`, `prod`)

**Options:**
- `-d, --dry-run`: Preview what would be synced without making changes
- `-f, --force`: Skip confirmation prompt
- `-v, --verbose`: Show detailed output including all synced files
- `-h, --help`: Display help for command

**Examples:**

```bash
# Basic sync with confirmation
wfuwp syncs3 43 uat pprd

# Dry run to preview changes
wfuwp syncs3 43 uat pprd --dry-run

# Force sync without confirmation
wfuwp syncs3 43 uat pprd --force

# Show detailed output with all file transfers
wfuwp syncs3 43 uat pprd --verbose
```

#### `listips` - List EC2 instance IP addresses

Lists IP addresses of running EC2 instances for a given environment.

```bash
wfuwp listips <environment> [options]
```

**Arguments:**
- `environment`: Environment name (`dev`, `uat`, `pprd`, `prod`)

**Options:**
- `--private`: Show private IP addresses (default behavior)
- `--public`: Show public IP addresses
- `--json`: Output as JSON for scripting
- `-h, --help`: Display help for command

**Examples:**

```bash
# List private IPs (default)
wfuwp listips uat

# List public IPs
wfuwp listips prod --public

# Get JSON output for scripting
wfuwp listips dev --json
```

#### `sshaws` - SSH into EC2 instances

SSH into EC2 instances for a given environment with flexible authentication.

```bash
wfuwp sshaws <environment> [options]
```

**Arguments:**
- `environment`: Environment name (`dev`, `uat`, `pprd`, `prod`)

**Options:**
- `--all`: Connect to all instances sequentially (default: first instance only)
- `--list`: List available instances without connecting
- `--key <path>`: Path to SSH private key file (optional)
- `--user <username>`: SSH username (default: ec2-user)
- `--dry-run`: Show what SSH commands would be executed
- `-h, --help`: Display help for command

**Examples:**

```bash
# SSH to first instance (uses system SSH defaults)
wfuwp sshaws uat

# SSH to all instances sequentially
wfuwp sshaws prod --all

# List instances without connecting
wfuwp sshaws dev --list

# Use specific SSH key
wfuwp sshaws pprd --key ~/.ssh/my-aws-key.pem

# Use different username
wfuwp sshaws dev --user ubuntu

# Preview SSH commands
wfuwp sshaws uat --dry-run
```

#### `config` - Manage configuration settings

Manage database connection settings and other configuration options. Configuration is stored securely with encrypted passwords.

```bash
wfuwp config <subcommand> [arguments]
```

**Subcommands:**

```bash
# Set configuration values
wfuwp config set <key> <value>

# Get configuration values
wfuwp config get <key>

# List all configuration
wfuwp config list

# Reset all configuration
wfuwp config reset
```

**Multi-Environment Configuration:**
- `environments.dev.host`: Development database hostname
- `environments.dev.user`: Development database username
- `environments.dev.password`: Development database password (encrypted)
- `environments.dev.database`: Development database name
- `environments.uat.host`: UAT database hostname
- `environments.uat.user`: UAT database username
- `environments.uat.password`: UAT database password (encrypted)
- `environments.uat.database`: UAT database name
- `environments.pprd.host`: Pre-production database hostname
- `environments.pprd.user`: Pre-production database username
- `environments.pprd.password`: Pre-production database password (encrypted)
- `environments.pprd.database`: Pre-production database name
- `environments.prod.host`: Production database hostname
- `environments.prod.user`: Production database username
- `environments.prod.password`: Production database password (encrypted)
- `environments.prod.database`: Production database name

**S3 Configuration (Optional):**
- `s3.bucket`: S3 bucket name for backup archival
- `s3.region`: AWS region for S3 bucket (default: us-east-1)
- `s3.prefix`: Prefix for organized S3 storage (default: backups)

**Local Backup Configuration (Alternative to S3):**
- `backup.localPath`: Local directory for backup storage (default: ~/.wfuwp/backups)

**Examples:**

```bash
# Multi-Environment Setup (Interactive Wizard Recommended)
wfuwp config wizard

# Manual Multi-Environment Configuration
wfuwp config set environments.prod.host prod-db.wfu.edu
wfuwp config set environments.prod.user wp_prod
wfuwp config set environments.prod.password prod_password
wfuwp config set environments.prod.database wp_production

wfuwp config set environments.uat.host uat-db.wfu.edu
wfuwp config set environments.uat.user wp_uat
wfuwp config set environments.uat.password uat_password
wfuwp config set environments.uat.database wp_uat

# S3 Configuration for Backup Archival
wfuwp config set s3.bucket wfu-wp-backups
wfuwp config set s3.region us-east-1
wfuwp config set s3.prefix backups

# Local Backup Alternative
wfuwp config set backup.localPath /path/to/local/backups

# Check current configuration
wfuwp config list

# Verify environment-specific configuration
wfuwp config verify

# Reset all settings
wfuwp config reset
```

#### `db` - Database Connection Utilities

Test and verify database connections for all configured environments.

```bash
wfuwp db <subcommand>
```

**Subcommands:**
- `test <env>` - Test database connection for an environment
- `list` - List all configured database environments

**Examples:**
```bash
# Test production database connection
wfuwp db test prod

# List all configured environments
wfuwp db list
```

**📖 Documentation:** See [wp-docs/db.md](wp-docs/db.md) for detailed usage and troubleshooting.

#### `restore` - Restore Database from Backup

Restore WordPress database from SQL backup files.

```bash
wfuwp restore <sql-file> --to <env> [options]
```

**Examples:**
```bash
# Restore backup to UAT environment
wfuwp restore ./backup.sql --to uat

# Preview restore without making changes
wfuwp restore ./backup.sql --to dev --dry-run

# Restore with increased timeout for large files
wfuwp restore ./large_backup.sql --to pprd --timeout 60
```

**📖 Documentation:** See [wp-docs/restore.md](wp-docs/restore.md) for detailed usage and recovery workflows.

#### `clickup` - ClickUp Task Management Integration

Comprehensive ClickUp integration for managing tasks directly from the command line.

```bash
wfuwp clickup <subcommand> [options]
```

**Key Features:**
- Create and manage ClickUp tasks with full metadata support
- List and filter tasks with advanced filtering options
- Export tasks in CSV, JSON, and Markdown formats
- Batch create tasks from text or JSON files
- Navigate workspace hierarchies and search across workspaces
- Secure encrypted storage of API credentials

**Quick Start:**
```bash
# Configure API token
wfuwp clickup config set token pk_your_api_token

# Create a task
wfuwp clickup create "Fix login bug" --priority high --assignee USER_ID

# List your tasks
wfuwp clickup tasks --my-tasks

# Export tasks to CSV
wfuwp clickup tasks --export csv
```

**📖 Detailed Documentation:** See [wp-docs/clickup.md](wp-docs/clickup.md) for comprehensive usage instructions, batch operations, export formats, and troubleshooting.

#### `local` - Local Development Environment Management

Complete local development environment management for WFU WordPress sites with DDEV integration, domain management, and automated setup workflows.

**✅ All phases complete:**
- Domain management (modify /etc/hosts)
- Environment status and health checks
- Automated dependency installation
- Environment control (start/stop/restart)
- Content management (refresh/reset)
- Configuration management

```bash
wfuwp local <subcommand> [options]
```

**Available Subcommands:**
- `domain` - Manage local development domains (/etc/hosts)
- `status` - Show environment status and health checks
- `install` - Install and setup development dependencies
- `start` - Start local development environment
- `stop` - Stop local development environment
- `restart` - Restart local development environment
- `refresh` - Refresh database from production
- `reset` - Reset entire local environment
- `config` - Configure local development settings

**Key Features:**
- **Cross-platform support**: macOS, Linux, Windows/WSL
- **Docker/DDEV integration**: Automated container management
- **Domain management**: Separate /etc/hosts markers from DNS spoofing
- **Environment health**: Comprehensive dependency checking
- **Database refresh**: Download from S3 production backups
- **Interactive setup**: Configuration wizard for first-time users

**Examples:**

```bash
# First-time setup workflow
wfuwp local install              # Install Docker, DDEV, dependencies
wfuwp local config wizard        # Configure settings
sudo wfuwp local domain add 43   # Add domain for site 43
wfuwp local install database     # Download production database
wfuwp local start 43             # Start development environment

# Daily development workflow
wfuwp local status               # Check environment health
wfuwp local start 43             # Start site 43
wfuwp local refresh database     # Refresh with latest prod data
wfuwp local stop 43              # Stop when done

# Environment management
wfuwp local domain list          # Show configured domains
wfuwp local reset site43 --deep  # Complete environment reset
wfuwp local install --force      # Reinstall dependencies
```

**Prerequisites:**
- Docker (will be installed automatically if missing)
- DDEV (will be installed automatically if missing)
- Sudo access (for domain management only)

**System Requirements:**
- macOS: Homebrew for automated installation
- Linux: Native package managers (apt, yum, pacman)
- Windows: WSL recommended, manual installation links provided

## Quick Start

New to wfuwp? Start with the **[Tool Introduction](wp-docs/wfuwp-introduction.md)** and use the built-in documentation system for complete guidance.

```bash
# 1. Install the tool
npm install -g wfuwp

# 2. Check system prerequisites
wfuwp doctor

# 3. Run configuration wizard
wfuwp config wizard

# 4. Verify your setup
wfuwp config verify
wfuwp db list

# 5. Explore built-in documentation
wfuwp --help                    # See all commands
wfuwp docs --list               # Browse documentation topics
wfuwp docs getting-started      # Detailed setup guide
```

## Safety Features

### Input Validation
- Site IDs must be positive integers
- Only valid environment names are accepted
- Source and destination environments cannot be the same

### Confirmation Prompts
- Interactive confirmation before executing sync operations
- Use `--force` flag to bypass confirmations in automated scripts

### Dry Run Mode
- Use `--dry-run` to preview what files would be synced
- No actual changes are made in dry-run mode

### Secure Configuration Storage
- Database passwords are encrypted when stored locally
- Configuration files are stored in user's home directory (`~/.wfuwp/config.json`)

### AWS CLI Verification
- Checks if AWS CLI is installed and accessible
- Provides helpful error messages if prerequisites are missing

## Troubleshooting

### Common Issues

**"AWS CLI is not installed or not in PATH"**
- Install AWS CLI: https://aws.amazon.com/cli/
- Ensure it's in your system PATH

**"Site ID must be a positive integer"**
- Ensure you're using a numeric site ID (e.g., 43, not "abc")

**"Invalid source/destination environment"**
- Use only valid environment names: `dev`, `uat`, `pprd`, `prod`

**"Source and destination environments cannot be the same"**
- Ensure you're specifying different environments for source and destination

**"Database configuration incomplete"**
- Set up database connection using `wfuwp config set` commands
- Ensure all required fields are configured: host, user, password, name

### Getting Help

```bash
# General help
wfuwp --help

# Command-specific help
wfuwp syncs3 --help
wfuwp config --help

# Display version
wfuwp --version
```

## Development

### Building from Source

```bash
git clone <repository-url>
cd wfu-wp-cli
npm install
npm run build
```

### Development Scripts

```bash
npm run build      # Compile TypeScript
npm run dev        # Run with ts-node for development
npm run test       # Run tests
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Project Structure

```
wfu-wp-cli/
├── src/
│   ├── commands/
│   │   ├── syncs3.ts     # S3 sync command implementation
│   │   ├── listips.ts    # EC2 IP listing command
│   │   ├── sshaws.ts     # SSH connection command
│   │   ├── removehostkey.ts # SSH host key removal command
│   │   └── config.ts     # Configuration management command
│   ├── utils/
│   │   └── config.ts     # Configuration storage utilities
│   └── index.ts          # Main CLI entry point
├── bin/
│   └── wfuwp            # Binary wrapper
├── dist/                # Compiled JavaScript (generated)
├── tests/               # Test files
├── docs/                # Additional documentation
└── package.json         # Package configuration
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Commit your changes: `git commit -m "feat: add new feature"`
7. Push to the branch: `git push origin feature-name`
8. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Search existing issues in the repository
3. Create a new issue with detailed information about the problem
