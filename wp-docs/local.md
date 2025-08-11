# local - Local Development Environment Management

Complete local development environment management for WFU WordPress sites with DDEV integration, domain management, and automated setup workflows.

## Overview

The local command provides comprehensive local development environment management including:
- **Domain Management**: Configure local development domains in /etc/hosts
- **Environment Status**: Monitor Docker, DDEV, and system dependencies
- **Automated Installation**: Install Docker, DDEV, mkcert, and setup workspace
- **Environment Control**: Start, stop, and restart local development environments
- **Content Management**: Refresh database from production, reset environments
- **Configuration**: Interactive setup wizard and advanced settings management

## Usage

```bash
wfuwp local <subcommand> [options]
```

## Subcommands Overview

All 8 phases of local development management are complete and ready to use:

- ✅ `domain` - Manage local development domains (/etc/hosts)
- ✅ `status` - Show environment status and health checks
- ✅ `install` - Install and setup development dependencies
- ✅ `start` - Start local development environment
- ✅ `stop` - Stop local development environment
- ✅ `restart` - Restart local development environment
- ✅ `refresh` - Refresh database from production
- ✅ `reset` - Reset entire local environment
- ✅ `config` - Configure local development settings

## Domain Management

Manage local development domains through /etc/hosts modification with separate markers from DNS spoofing functionality.

### Usage
```bash
# Add domain for site (requires sudo)
sudo wfuwp local domain add <site-id> [--port 8443]

# Remove domain for site (requires sudo)
sudo wfuwp local domain remove <site-id>

# List all configured domains
wfuwp local domain list

# Remove all domains (requires sudo)
sudo wfuwp local domain reset
```

### Examples
```bash
# Add domain for site 43
sudo wfuwp local domain add 43

# Add domain with custom port
sudo wfuwp local domain add 43 --port 8080

# Remove domain for site 43
sudo wfuwp local domain remove 43

# List all domains
wfuwp local domain list

# Remove all local development domains
sudo wfuwp local domain reset
```

### Domain Format
- Domains follow format: `site-{ID}.local.wfu.edu`
- Example: Site 43 becomes `site43.local.wfu.edu`
- Default port: 8443 (DDEV HTTPS)
- Points to: 127.0.0.1 (localhost)

## Environment Status

Monitor local development environment health with comprehensive dependency checking.

### Usage
```bash
# Basic status check
wfuwp local status

# Detailed status with verbose information
wfuwp local status --verbose
```

### Status Information
- **Overall Health**: Healthy, Warning, or Error status
- **Core Dependencies**: Docker installation and status, DDEV availability
- **System Tools**: git, mkcert, PHP (optional dependencies)
- **DDEV Projects**: Running projects with URLs and status
- **Local Domains**: Configured development domains (verbose mode)
- **WordPress Projects**: Discovered WordPress projects (verbose mode)

### Health Assessment
- **Healthy**: All required dependencies available and running
- **Warning**: Some optional tools missing or Docker stopped
- **Error**: Critical dependencies missing (Docker or DDEV)

## Installation & Setup

Automated installation of development dependencies with cross-platform support.

### Usage
```bash
# Install all dependencies interactively
wfuwp local install

# Install specific dependency
wfuwp local install docker
wfuwp local install ddev
wfuwp local install mkcert

# Setup workspace and clone repositories
wfuwp local install workspace

# Download and setup database
wfuwp local install database [--environment prod]

# Force reinstall existing dependencies
wfuwp local install --force
```

### Supported Platforms
- **macOS**: Homebrew-based installation
- **Linux**: Native package managers (apt, yum, pacman)
- **Windows**: Manual download links and guidance

### Installation Components
- **Docker**: Container platform for DDEV
- **DDEV**: Local development environment manager
- **mkcert**: Local SSL certificate generation
- **Workspace**: ~/wfu-wp-local directory structure
- **Database**: S3 backup download and import

## Environment Control

Start, stop, and restart local development environments with health checking.

### Usage
```bash
# Start specific project
wfuwp local start [project-name]

# Start project by site ID
wfuwp local start 43

# Start all projects
wfuwp local start --all

# Stop specific project
wfuwp local stop [project-name]

# Stop project by site ID
wfuwp local stop 43

# Stop all projects
wfuwp local stop --all

# Restart specific project
wfuwp local restart [project-name]

# Restart all projects
wfuwp local restart --all
```

### Features
- **Pre-flight Checks**: Docker status, DDEV installation validation
- **Project Discovery**: Find projects by name or site ID matching
- **Health Monitoring**: Verify successful start/stop operations
- **URL Display**: Show accessible URLs after successful start
- **Error Recovery**: Actionable troubleshooting hints

## Content Management

Refresh database content from production and reset local environments.

### Database Refresh
```bash
# Refresh from production (default)
wfuwp local refresh database [project-name]

# Refresh from specific environment
wfuwp local refresh database --environment uat [project-name]

# Skip backup before refresh
wfuwp local refresh database --no-backup [project-name]
```

### Environment Reset
```bash
# Standard reset (removes containers, keeps code)
wfuwp local reset [project-name]

# Deep reset (removes everything including code)
wfuwp local reset --deep [project-name]

# Reset with custom backup directory
wfuwp local reset --backup-dir /path/to/backups [project-name]
```

### Build Operations
```bash
# Run full build pipeline
wfuwp local refresh build [project-name]

# Skip specific build steps
wfuwp local refresh build --no-composer [project-name]
wfuwp local refresh build --no-npm [project-name]
```

### Features
- **Automatic Backups**: Database backups before major operations
- **Environment Selection**: Choose source environment for refresh
- **Build Pipeline**: Composer, npm, cache clearing, WordPress updates
- **Progress Tracking**: Step-by-step progress with file counts
- **Safety Confirmations**: Confirmation prompts for destructive operations

## Configuration Management

Interactive setup wizard and advanced configuration management.

### Configuration Wizard
```bash
# Run interactive setup wizard
wfuwp local config wizard
```

### Configuration Settings
```bash
# View all settings
wfuwp local config show

# Get specific setting
wfuwp local config get workspaceDir
wfuwp local config get defaultPort

# Set specific setting
wfuwp local config set workspaceDir /path/to/workspace
wfuwp local config set defaultPort 8443
wfuwp local config set defaultEnvironment prod
wfuwp local config set autoStart true
wfuwp local config set backupBeforeRefresh false

# Reset to defaults
wfuwp local config reset
```

### Available Settings
- **workspaceDir**: Local development workspace directory
- **defaultPort**: Default port for new domains (8443)
- **defaultEnvironment**: Default source environment for refresh (prod)
- **autoStart**: Auto-start projects after refresh (true)
- **backupBeforeRefresh**: Create backups before refresh (true)

### Configuration Wizard Features
- **Intelligent Defaults**: Platform-appropriate default values
- **Validation**: Path validation, port range checking
- **Error Handling**: Attempt limits and fallback defaults
- **Integration**: Uses existing Config system encryption

## Integration with Existing Features

### Hosts File Management
- **Separate Markers**: Uses "Local Development" markers distinct from DNS spoofing
- **No Conflicts**: Compatible with existing spoof/unspoof commands
- **Sudo Requirements**: All domain operations require sudo privileges

### Configuration System
- **Encrypted Storage**: Uses existing Config class encryption
- **Environment Support**: Integrates with dev/uat/pprd/prod environments
- **S3 Integration**: Uses existing S3 utilities for database downloads

### WordPress Multisite
- **Site ID Support**: All commands support WordPress multisite site IDs
- **Project Naming**: Follows `site{ID}` naming convention
- **Database Integration**: Compatible with existing migration workflows

## Common Workflows

### First-Time Setup
```bash
# 1. Install dependencies
wfuwp local install

# 2. Setup workspace
wfuwp local install workspace

# 3. Configure settings
wfuwp local config wizard

# 4. Add domain for site
sudo wfuwp local domain add 43

# 5. Download database
wfuwp local install database

# 6. Start environment
wfuwp local start 43
```

### Daily Development
```bash
# Check status
wfuwp local status

# Start development environment
wfuwp local start 43

# Refresh with latest production data
wfuwp local refresh database site43 --environment prod

# Stop when done
wfuwp local stop 43
```

### Troubleshooting Reset
```bash
# Check what's wrong
wfuwp local status --verbose

# Reset environment
wfuwp local reset site43

# Fresh database
wfuwp local refresh database site43

# Restart everything
wfuwp local restart 43
```

## System Requirements

### Required Dependencies
- **Docker**: Container platform (required)
- **DDEV**: Local development environment manager (required)

### Optional Dependencies
- **git**: Version control (recommended)
- **mkcert**: Local SSL certificates (recommended)
- **PHP**: CLI tools (optional)

### Workspace Structure
```
~/wfu-wp-local/              # Default workspace directory
├── projects/                # DDEV project directories
│   ├── site43/             # Individual site projects
│   └── site12/
├── backups/                 # Local database backups
│   ├── 2024-01-15/         # Date-organized backups
│   └── site43-backup.sql
└── downloads/               # Temporary download directory
```

## Troubleshooting

### Docker Issues
```bash
# Check Docker status
wfuwp local status

# Install Docker if missing
wfuwp local install docker

# Start Docker Desktop manually if stopped
```

### DDEV Issues
```bash
# Install DDEV
wfuwp local install ddev

# Check DDEV projects
ddev list

# Reset DDEV project
wfuwp local reset site43
```

### Domain Access Issues
```bash
# Check configured domains
wfuwp local domain list

# Remove and re-add domain
sudo wfuwp local domain remove 43
sudo wfuwp local domain add 43

# Verify hosts file
cat /etc/hosts | grep "Local Development"
```

### Database Issues
```bash
# Download fresh database
wfuwp local install database --environment prod

# Reset environment completely
wfuwp local reset --deep site43

# Check DDEV database
ddev ssh -s db
```

### Permission Issues
```bash
# Domain management requires sudo
sudo wfuwp local domain add 43

# Check file permissions in workspace
ls -la ~/wfu-wp-local/

# Fix workspace permissions
chmod -R 755 ~/wfu-wp-local/
```

## Security Considerations

### Sudo Requirements
- Domain management modifies /etc/hosts and requires sudo
- Other operations run as regular user for security
- Clear error messages when sudo required

### Local-Only Development
- All domains point to 127.0.0.1 (localhost)
- No external network exposure
- Database credentials stored encrypted

### Safe Reset Operations
- Automatic backups before destructive operations
- Confirmation prompts for dangerous operations
- Rollback capability for failed operations

For detailed configuration help, see: `wfuwp config --help`
For migration workflows, see: `wfuwp migrate --help`