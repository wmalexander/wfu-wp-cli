# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.20.0] - 2025-10-06

### Added
- AWS credentials validation during pre-flight checks for migrate and env-migrate commands
- New `checkAwsCredentials()` method that verifies AWS credentials are valid before migration starts
- Clear warning messages when AWS credentials are invalid or expired, instructing users to refresh credentials
- Prevents wasted time on migrations that will fail during S3 operations due to expired credentials

## [0.19.7] - 2025-10-06

### Fixed
- Critical fix for Docker-based SQL imports that were silently failing
- Changed Docker import to pipe SQL content into container instead of using file redirect
- Resolves "No tables found in migration environment" error for users without native mysql client

## [0.19.6] - 2025-10-06

### Fixed
- Extended Docker fallback support to all utility files that make direct MySQL calls
- Added automatic MySQL client detection to: file-naming.ts, site-enumerator.ts, backup-recovery.ts, environment-cleanup.ts, migration-validator.ts, and error-recovery.ts
- Fixes "mysql: command not found" warnings when MySQL client is not installed locally
- Ensures consistent behavior across all database operations by using Docker when native client unavailable

## [0.12.1] - 2025-08-16

### Fixed
- Fixed MySQL operations failing on EC2 instances without native MySQL client
- Added dual-mode MySQL client support: uses native client on Mac, Docker on EC2
- All database operations now automatically detect and use appropriate execution method
- Resolved "mysqldump command not found" errors during network table migrations on EC2

## [0.7.0] - 2025-08-11

### Added
- **ClickUp Integration**: Complete task management integration with comprehensive CLI commands
  - Create and manage ClickUp tasks with full metadata support (priority, assignee, due date, tags)
  - List and filter tasks with advanced filtering options (status, assignee, priority, date ranges)
  - Export tasks in multiple formats (CSV, JSON, Markdown)
  - Batch create tasks from plain text or JSON files
  - Navigate workspace hierarchies and search across workspaces
  - Interactive task creation mode with guided prompts
  - Secure encrypted storage of API credentials
  - Comprehensive error handling with retry logic for API failures
  - Full documentation in wp-docs/clickup.md with troubleshooting guide

### Enhanced
- Updated README.md to include ClickUp integration overview with quick start examples
- Added comprehensive test coverage for ClickUp utilities and validation
- Improved config system to support ClickUp API token encryption

## [0.3.2] - 2025-08-06

### Enhanced
- Updated spoof command to add all available IP addresses to hosts file instead of just the first one
- Ensures proper load balancing by including all 4 IP addresses from news.wfu.edu resolution
- Improved console output to show count and list of IP addresses being added

## [0.3.1] - 2025-08-06

### Fixed
- Fixed IP address parsing in spoof command when news.wfu.edu is a CNAME pointing to Elastic Beanstalk environment
- Now correctly handles host command output with multiple IP addresses and extracts the first available IP

## [0.3.0] - 2025-08-06

### Added
- `spoof` command for DNS spoofing by adding entries to /etc/hosts
- `unspoof` command for removing DNS spoofing entries from /etc/hosts
- Support for environment-specific subdomains (e.g., --env dev for *.dev.wfu.edu)
- Automatic IP resolution from news.wfu.edu for spoofing
- Safe hosts file management with markers for easy cleanup
- Sudo privilege checking and user-friendly error messages
- Comprehensive help text and usage examples for DNS spoofing commands
- Unit tests for spoof and unspoof commands
- Updated documentation with DNS spoofing workflow examples

### Features
- Automatic detection and removal of existing WFU spoofing entries
- Support for custom domain patterns (subdomain.wfu.edu, subdomain.env.wfu.edu)
- Clear feedback about what domains are being spoofed and their target IPs
- Integration with existing CLI help system and error handling patterns

## [0.2.2] - 2025-08-06

### Added
- `removehostkey` command for removing SSH host keys for EC2 instances
- Support for all environments: dev, uat, pprd, prod
- Command options: --dry-run, --all, --known-hosts, --yes
- Safety features: confirmation prompts and validation
- Integration with existing listips command to fetch EC2 instance IPs
- Comprehensive help text and usage examples
- Unit tests for the new command

### Features
- Removes host keys for both private and public IPs
- Custom known_hosts file path support
- Dry-run mode for previewing changes
- Skip confirmation prompt option (-y, --yes)
- Error handling and user feedback

## [0.1.0] - 2025-08-06

### Added
- Initial release of WFU WordPress CLI tool
- `syncs3` command for synchronizing WordPress sites between S3 environments
- Support for environments: dev, stg, prop, pprd, prod
- Input validation and safety features
- Dry-run mode for previewing changes
- Interactive confirmation prompts
- Comprehensive documentation
- Unit tests and CI/CD pipeline

### Features
- AWS CLI dependency checking
- Colorful CLI output with chalk
- TypeScript support
- ESLint and Prettier for code quality
- Jest for testing
- GitHub Actions for automated testing and releases

[Unreleased]: https://github.com/alexandw/wfu-wp-cli/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/alexandw/wfu-wp-cli/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/alexandw/wfu-wp-cli/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/alexandw/wfu-wp-cli/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/alexandw/wfu-wp-cli/compare/v0.1.0...v0.2.2
[0.1.0]: https://github.com/alexandw/wfu-wp-cli/releases/tag/v0.1.0