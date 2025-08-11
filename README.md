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

**Configuration Keys:**
- `db.host`: Database hostname
- `db.user`: Database username
- `db.password`: Database password (encrypted when stored)
- `db.name`: Database name

**Examples:**

```bash
# Initial database setup
wfuwp config set db.host prod-db.wfu.edu
wfuwp config set db.user wp_admin
wfuwp config set db.password secretpassword123
wfuwp config set db.name wp_multisite

# Check current configuration
wfuwp config list

# Get specific value
wfuwp config get db.host

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

**📋 Phase 2 (Coming Soon):**
- Complete automated workflow with export/import
- Multi-environment configuration support
- Automatic S3 backup archival
- Full migration orchestration with single command

```bash
wfuwp migrate <site-id> --from <source-env> --to <target-env> [options]
```

**Arguments:**
- `site-id`: Numeric site identifier for the multisite installation (e.g., 43)

**Required Options:**
- `--from <env>`: Source environment (`dev`, `uat`, `pprd`, `prod`)
- `--to <env>`: Target environment (`dev`, `uat`, `pprd`, `prod`)

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