# WFU WordPress CLI Tool

A command-line interface for WFU WordPress management tasks, including S3 synchronization between environments.

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

**Configuration Keys (Phase 1 - Single Database):**
- `migration.host`: Migration database hostname
- `migration.user`: Migration database username
- `migration.password`: Migration database password (encrypted when stored)
- `migration.database`: Migration database name

**Multi-Environment Configuration (Phase 2 - env-migrate):**
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
# Phase 1 Migration Database Setup
wfuwp config set migration.host migration-db.wfu.edu
wfuwp config set migration.user wp_admin
wfuwp config set migration.password secretpassword123
wfuwp config set migration.database wp_migration

# Phase 2 Multi-Environment Setup (Interactive Wizard Recommended)
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
wfuwp config set s3.prefix migrations

# Local Backup Alternative
wfuwp config set backup.localPath /path/to/local/backups

# Check current configuration
wfuwp config list

# Verify environment-specific configuration
wfuwp config verify

# Reset all settings
wfuwp config reset
```

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

#### `migrate` - Migrate WordPress multisite database between environments (Phase 1)

Migrates WordPress multisite database content between environments by performing URL and path replacements. Integrates with WP-CLI for reliable database operations.

**⚠️ Current Limitations (Phase 1):**
- Requires tables to be manually imported into migration database before running
- Does not handle export/import operations automatically
- Single database configuration only
- No S3 archival of SQL dumps

**📋 Phase 2 Available:** See `env-migrate` command below for complete automated environment migration.

#### `env-migrate` - Complete Environment Migration (Phase 2)

Comprehensive WordPress multisite environment migration with complete automation, safety features, and S3 integration. Migrates entire environments or specific sites with full orchestration.

**✅ Phase 2 Features:**
- Complete automated workflow with export/import/archival
- Multi-environment configuration support
- Network table migration between environments
- Automatic safety backups and rollback capability
- S3 archival with configurable storage classes
- WordPress file synchronization between environments
- Batch processing with parallel execution
- Comprehensive error recovery and retry logic
- Pre-flight validation and health checks

```bash
wfuwp env-migrate <source-env> <target-env> [options]
```

**Arguments:**
- `source-env`: Source environment (`dev`, `uat`, `pprd`, `prod`)
- `target-env`: Target environment (`dev`, `uat`, `pprd`, `prod`, `local`)

**Core Options:**
- `--dry-run`: Preview migration without executing changes
- `-f, --force`: Skip confirmation prompts
- `-v, --verbose`: Show detailed output and progress
- `--network-only`: Migrate network tables only (no individual sites)
- `--sites-only`: Migrate sites only (skip network tables)

**Site Selection:**
- `--include-sites <list>`: Comma-separated list of site IDs to include
- `--exclude-sites <list>`: Comma-separated list of site IDs to exclude
- `--active-only`: Only migrate active sites (not archived/deleted)

**Batch Processing:**
- `--batch-size <size>`: Number of sites to process at once (default: 5)
- `--parallel`: Process sites in parallel within batches
- `--concurrency <limit>`: Maximum concurrent migrations when using --parallel (default: 3)

**Safety & Recovery:**
- `--skip-backup`: Skip environment backup (dangerous, not recommended)
- `--auto-rollback`: Automatically rollback on failure
- `--max-retries <count>`: Maximum retry attempts for transient errors (default: 3)
- `--health-check`: Perform comprehensive health checks before migration

**S3 Integration:**
- `--skip-s3`: Skip S3 archival of migration files
- `--sync-s3`: Sync WordPress files between S3 environments
- `--s3-storage-class <class>`: S3 storage class for archives (STANDARD|STANDARD_IA|GLACIER, default: STANDARD_IA)
- `--archive-backups`: Also archive backup files to S3

**Advanced Options:**
- `--work-dir <path>`: Custom working directory for temporary files
- `--keep-files`: Do not delete local SQL files after migration
- `--timeout <minutes>`: Custom timeout for large databases (default: 20)

**Examples:**

```bash
# Complete environment migration with confirmation
wfuwp env-migrate prod uat

# Dry run to preview full migration
wfuwp env-migrate prod uat --dry-run --verbose

# Migrate specific sites with parallel processing
wfuwp env-migrate prod pprd --include-sites "1,43,78" --parallel --concurrency 5

# Network tables only migration
wfuwp env-migrate prod uat --network-only --force

# Full migration with S3 file sync and archival
wfuwp env-migrate prod pprd --sync-s3 --archive-backups --s3-storage-class GLACIER

# Batch migration with custom settings
wfuwp env-migrate dev uat --batch-size 10 --parallel --max-retries 5 --timeout 30

# Active sites only with safety features
wfuwp env-migrate prod pprd --active-only --auto-rollback --health-check

# Local environment migration (prod to local development)
wfuwp env-migrate prod local --sync-s3 --verbose
```

**📍 Local Environment Support:**

The `local` environment is a special target designed for local development setups:

- **Supported Migration:** Only `prod → local` migrations are allowed
- **Domain Transformation:** Converts production domains (e.g., `wordpress.wfu.edu` → `wordpress.wfu.local`)
- **S3 File Sync:** For `--sync-s3`, files are synced from prod S3 to dev S3 (not to a local S3 bucket)
- **Use Case:** Set up local development environments with production data

**Local Environment Restrictions:**
- ❌ `local` cannot be used as a source environment
- ❌ Only `prod → local` migration path is supported
- ❌ Other combinations like `dev → local`, `uat → local` are not allowed

**Local Environment Example:**
```bash
# Migrate production data to local development environment
wfuwp env-migrate prod local --sync-s3 --include-sites "1,43" --verbose
```

**Migration Workflow:**

1. **Pre-flight Validation**
   - System requirements check (MySQL, WP-CLI, AWS CLI, Docker)
   - Database connection validation for all environments
   - S3 access verification (if enabled)
   - Site existence and consistency checks

2. **Environment Backup**
   - Complete backup of target environment
   - Backup integrity validation
   - S3 archival of backup files (if configured)

3. **Site Enumeration & Selection**
   - Discover all sites in source environment
   - Apply filters (include/exclude lists, active-only)
   - Site validation and consistency checks

4. **Network Table Migration**
   - Export network tables (wp_blogs, wp_site, wp_sitemeta, wp_blogmeta)
   - Transform domains and URLs for target environment
   - Import to target environment with validation

5. **Site Migration (Batch Processing)**
   - Process sites in configurable batches
   - Parallel processing within batches (optional)
   - Progress tracking with real-time updates
   - Error recovery and retry for transient failures

6. **WordPress File Synchronization (Optional)**
   - Sync uploads and theme files between S3 environments
   - Progress tracking and error handling
   - Validation of file transfer integrity

7. **Post-Migration Validation & Archival**
   - Health checks on migrated environment
   - Archive all migration artifacts to S3
   - Cleanup of temporary files (unless --keep-files)
   - Migration summary and reporting

**Prerequisites:**
- Multi-environment configuration (see Configuration section below)
- Docker (for WP-CLI operations)
- AWS CLI (for S3 operations)
- Sufficient disk space for temporary files
- Network access to all configured databases

**Safety Features:**
- Automatic environment backup before migration
- Pre-flight validation prevents invalid configurations
- Rollback capability with --auto-rollback
- Retry logic for transient network/database errors
- Comprehensive logging and error reporting
- Dry-run mode for testing migration plans

#### `migrate` - Single Site Migration (Phase 1)

**Arguments:**
- `site-id`: Numeric site identifier for the multisite installation (e.g., 43)

**Required Options:**
- `--from <env>`: Source environment (`dev`, `uat`, `pprd`, `prod`)
- `--to <env>`: Target environment (`dev`, `uat`, `pprd`, `prod`, `local`)

**Optional Flags:**
- `--dry-run`: Preview changes without executing them
- `-f, --force`: Skip confirmation prompts
- `-v, --verbose`: Show detailed output including all WP-CLI commands
- `--homepage`: Include homepage tables (default: exclude for non-homepage sites)
- `--custom-domain <source:target>`: Additional custom domain replacement
- `--log-dir <path>`: Custom log directory (default: `./logs`)

**Supported Migration Paths:**
- `prod` ↔ `pprd` (production to/from pre-production)
- `dev` ↔ `uat` (development to/from user acceptance testing)
- `prod` → `local` (production to local development environment)

**Examples:**

```bash
# Basic migration with confirmation prompt
wfuwp migrate 43 --from uat --to pprd

# Dry run to preview changes
wfuwp migrate 43 --from prod --to pprd --dry-run

# Force migration without confirmation
wfuwp migrate 15 --from pprd --to prod --force

# Migration with custom domain replacement
wfuwp migrate 22 --from dev --to uat --custom-domain "oldsite.wfu.edu:newsite.wfu.edu"

# Homepage migration with verbose output
wfuwp migrate 1 --from prod --to pprd --homepage --verbose

# Custom log directory
wfuwp migrate 43 --from uat --to pprd --log-dir /custom/logs

# Migrate to local development environment
wfuwp migrate 43 --from prod --to local --verbose
```

**Prerequisites:**
- Database configuration must be set using `wfuwp config` commands
- WP-CLI must be installed and accessible in PATH
- Appropriate database access permissions for the configured user
- **Phase 1**: Tables must be manually imported into migration database before running

**Current Workflow (Phase 1):**
1. Manually export site tables from source environment
2. Manually import tables into wp_migration database
3. Run `wfuwp migrate` command for URL replacements
4. Manually export transformed tables from wp_migration
5. Manually backup target environment tables
6. Manually import transformed tables to target environment

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

## Safety Features

### Input Validation
- Site IDs must be positive integers
- Only valid environment names are accepted
- Source and destination environments cannot be the same

### Confirmation Prompts
- Interactive confirmation before executing sync and migration operations
- Use `--force` flag to bypass confirmations in automated scripts

### Dry Run Mode
- Use `--dry-run` to preview what files would be synced or what database changes would be made
- No actual changes are made in dry-run mode

### Secure Configuration Storage
- Database passwords are encrypted when stored locally
- Configuration files are stored in user's home directory (`~/.wfuwp/config.json`)
- WP-CLI commands mask passwords in verbose output

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

**"WP-CLI is not installed or not in PATH"**
- Install WP-CLI: https://wp-cli.org/
- Ensure it's accessible in your system PATH
- Test with `wp --version`

**"Migration path [env] -> [env] is not supported"**
- Use supported migration paths: prod↔pprd, dev↔uat
- Check that both environments are valid: dev, uat, pprd, prod

### Getting Help

```bash
# General help
wfuwp --help

# Command-specific help
wfuwp syncs3 --help
wfuwp config --help
wfuwp migrate --help

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
│   │   ├── config.ts     # Configuration management command
│   │   └── migrate.ts    # Database migration command
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