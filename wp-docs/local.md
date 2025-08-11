# local - Local Development Environment Management

Simple local development environment management for WFU WordPress sites with DDEV integration.

## Overview

The local command provides essential local development environment management:
- **Environment Status**: Monitor Docker and DDEV health
- **Automated Installation**: Install Docker, DDEV, and mkcert dependencies
- **Environment Control**: Start, stop, and restart local development environments
- **Project Management**: Delete projects and reset to fresh state

## Usage

```bash
wfuwp local <subcommand> [options]
```

## Commands

### Environment Setup

#### `status`
Check local development environment health.

```bash
# Check environment status
wfuwp local status
```

**Status Information:**
- Overall health (Healthy, Warning, or Error)
- Docker installation and running status
- DDEV availability and running projects

#### `install`
Install all required dependencies (Docker, DDEV, mkcert).

```bash
# Install all dependencies
wfuwp local install

# Force reinstallation
wfuwp local install --force
```

**What gets installed:**
- **Docker Desktop**: Container platform for DDEV
- **DDEV**: Local development environment manager  
- **mkcert**: Local SSL certificate generation

### Project Control

#### `start`
Start the local development environment.

```bash
# Start local development environment
wfuwp local start
```

Shows active projects with URLs after successful start.

#### `stop`
Stop the local development environment.

```bash
# Stop local development environment
wfuwp local stop
```

#### `restart` 
Restart the local development environment.

```bash
# Restart local development environment
wfuwp local restart
```

### Project Management

#### `delete`
Completely delete the local DDEV project.

```bash
# Delete DDEV project (with confirmation)
wfuwp local delete

# Delete without confirmation
wfuwp local delete --force
```

**What gets deleted:**
- DDEV project containers and databases
- DDEV project configuration
- **Note**: Local code files are NOT deleted

#### `reset`
Reset to a fresh, known-good state.

```bash
# Reset to fresh state (with confirmation)
wfuwp local reset

# Reset without confirmation  
wfuwp local reset --force
```

**Reset process:**
1. Switch to main branch and pull latest changes (`git checkout main && git pull`)
2. Update Composer dependencies (`composer update`)
3. Import initial multisite database with all sites

## Quick Start Workflow

### First-Time Setup
```bash
# 1. Install dependencies
wfuwp local install

# 2. Start environment
wfuwp local start
```

### Daily Development
```bash
# Check status
wfuwp local status

# Start development
wfuwp local start

# When done working
wfuwp local stop
```

### Troubleshooting
```bash
# Check what's wrong
wfuwp local status

# Reset to fresh state
wfuwp local reset --force

# If issues persist, delete and reinstall
wfuwp local delete --force
wfuwp local install
wfuwp local start
```

## System Requirements

### Required Dependencies
- **Docker Desktop**: Container platform (auto-installed)
- **DDEV**: Local development environment manager (auto-installed)

### Optional Dependencies
- **mkcert**: Local SSL certificates (auto-installed)

### Supported Platforms
- **macOS**: Homebrew-based installation
- **Linux**: Native package managers
- **Windows**: Manual installation guidance

## Troubleshooting

### Docker Issues
```bash
# Check Docker status
wfuwp local status

# Install Docker if missing
wfuwp local install

# Start Docker Desktop manually if stopped
```

### DDEV Issues
```bash
# Check DDEV projects
wfuwp local status

# Reset DDEV project
wfuwp local reset --force
```

### Complete Reset
```bash
# Nuclear option - delete everything and start fresh
wfuwp local delete --force
wfuwp local install
wfuwp local start
```

## Database

The reset command automatically imports an initial multisite database that includes:
- Complete WordPress multisite network setup
- Home site and key subsites
- Production content for development

No manual database configuration required.

## Security

- All development happens locally (127.0.0.1)
- No external network exposure
- Automatic SSL certificates via mkcert
- Safe reset operations with confirmation prompts

For other WFU WordPress CLI features, see: `wfuwp --help`