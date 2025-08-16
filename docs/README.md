# WFU WordPress CLI Documentation

## Overview

The WFU WordPress CLI (`wfuwp`) is a comprehensive command-line tool designed for managing Wake Forest University's WordPress multisite infrastructure. It provides automated workflows for database migrations, S3 synchronization, EC2 instance management, and development environment configuration.

## Table of Contents

### Getting Started
- [**Getting Started Guide**](./getting-started.md) - **Start here if you're new!**
- [**Quick Reference**](./quick-reference.md) - Command cheat sheet for quick lookups
- [Installation](./installation.md) - Detailed installation and system requirements

### Core Documentation
- [Commands Reference](./commands.md) - Detailed documentation for all CLI commands
- [Configuration](./configuration.md) - Setting up multi-environment configurations
- [Migration Workflows](./migration.md) - Complete guide to database migration processes
- [Visual Workflows](./workflows.md) - ASCII diagrams showing how processes work

### Troubleshooting & Support
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions
- [Command-Specific Troubleshooting](./troubleshooting-by-command.md) - Issues by command

### Advanced Topics
- [Architecture](./architecture.md) - Technical architecture and design patterns
- [Development](./development.md) - Contributing and development guidelines

## Quick Start

1. Install the CLI tool:
   ```bash
   npm install -g @wfu/wp-cli
   ```

2. Run the configuration wizard:
   ```bash
   wfuwp config wizard
   ```

3. Verify your configuration:
   ```bash
   wfuwp config verify
   ```

4. Start using commands:
   ```bash
   wfuwp migrate 43 --from prod --to pprd
   wfuwp syncs3 --from prod --to uat
   wfuwp listips
   ```

## Key Features

### Database Migration (Phase 2)
- **Automated Workflows**: Complete export/import/transform pipelines
- **Multi-Environment Support**: Seamless migrations between dev/uat/pprd/prod
- **WordPress Multisite**: Full support for main site and subsites
- **Safety Features**: Automatic backups, pre-flight checks, and rollback capabilities
- **S3 Integration**: Optional file synchronization with migrations

### S3 Management
- **Bucket Synchronization**: Transfer WordPress files between environments
- **Automatic Backups**: Archive SQL exports to S3 with metadata
- **Incremental Sync**: Efficient transfers with AWS CLI

### EC2 Management
- **Instance Listing**: Quick view of all EC2 instances and IPs
- **SSH Connections**: Direct SSH access to instances
- **DNS Management**: Spoof/unspoof domains for local development

### Configuration Management
- **Encrypted Storage**: Secure credential management
- **Multi-Environment**: Separate configs for dev/uat/pprd/prod
- **Interactive Wizard**: Guided setup process
- **Validation Tools**: Verify connectivity and permissions

## System Requirements

- **Node.js**: Version 18 or higher
- **Docker**: Required for WP-CLI database operations
- **AWS CLI**: Required for S3 and EC2 features
- **MySQL Client**: For direct database connections (optional)
- **Operating System**: macOS, Linux, or WSL2 on Windows

## Support Environments

The tool supports four standard WordPress environments:

- **Development (dev)**: Local development and testing
- **UAT (uat)**: User acceptance testing
- **Pre-Production (pprd)**: Staging environment
- **Production (prod)**: Live production site

## Security

- Credentials are encrypted using AES-256-GCM
- Configuration stored in `~/.wfuwp/config.json`
- SSH key authentication for EC2 instances
- AWS IAM roles for S3 access
- No credentials in command history

## License

Internal tool for Wake Forest University IT Services.

## Support

For issues or questions:
- Check the [Troubleshooting Guide](./troubleshooting.md)
- Review the [Commands Reference](./commands.md)
- Contact the WFU IT Services team