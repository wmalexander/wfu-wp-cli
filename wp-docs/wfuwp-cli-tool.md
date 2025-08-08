# WFU WordPress CLI Tool

The WFU WordPress CLI tool provides a comprehensive set of commands to manage WordPress environments, EC2 instances, and AWS resources. Instead of manually running complex AWS CLI commands, you can now use simple, validated commands with built-in safety features.

## Installation

Just run this one command:  
`npm install -g wfuwp`

**To update to the latest version:**  
`npm update -g wfuwp`

Prerequisites:

- Node.js (most of you already have this)
- AWS CLI installed and configured with your WFU credentials

## Available Commands

**Environments supported**: dev, uat, pprd, prod

### Command Reference

- **[migrate](migrate.md)** - Complete WordPress multisite database migration with automated export/import/archival
- **[config](config.md)** - Multi-environment configuration management with interactive wizard  
- **[syncs3](syncs3.md)** - Sync S3 assets (uploads, media files, etc.) between WordPress environments
- **[listips](listips.md)** - Display IP addresses of running EC2 instances in specified environments
- **[sshaws](sshaws.md)** - SSH into EC2 instances with automatic key management and connection handling
- **[spoof/unspoof](spoof-unspoof.md)** - DNS spoofing for testing sites before DNS changes take effect
- **[removehostkey](removehostkey.md)** - Clean up SSH host keys when EC2 IP addresses change
- **[md2wpblock](md2wpblock.md)** - Convert Markdown files to WordPress block editor HTML format

## Safety Features

- **Input validation** - Validates all environment names, site IDs, and file paths
- **Confirmation prompts** - Asks before making changes (can be skipped with --force or --yes)
- **Dry run mode** - Preview changes with --dry-run before running for real
- **AWS CLI checks** - Verifies your AWS setup before attempting operations
- **File existence validation** - Checks for required files (SSH keys, known_hosts) before proceeding
- **Error handling** - Clear error messages with suggestions for resolution

## Getting Help

```bash
wfuwp --help                # General help and command list
wfuwp <command> --help      # Specific command help
wfuwp --version             # Check current version
```

## Staying Updated

**Check for updates:**  
Run `wfuwp --version` and compare with the latest version on [npm](https://www.npmjs.com/package/wfuwp).

**Update to latest version:**  
`npm update -g wfuwp`

**When new features are added:**  
New commands and options are regularly added. After updating, run `wfuwp --help` to see all available commands, or check this documentation page for the latest features and examples.

**Command-specific help examples:**

- `wfuwp syncs3 --help`
- `wfuwp listips --help`
- `wfuwp sshaws --help`
- `wfuwp removehostkey --help`
- `wfuwp spoof --help`
- `wfuwp unspoof --help`
- `wfuwp md2wpblock --help`

## Common Workflows

**Deploying changes to production:**

```bash
# 1. List instances to verify environment
wfuwp listips prod

# 2. Preview the sync operation
wfuwp syncs3 43 uat prod --dry-run

# 3. Perform the actual sync
wfuwp syncs3 43 uat prod
```

**Troubleshooting SSH connections:**

```bash
# 1. Check instance IPs
wfuwp listips uat --public

# 2. Clean up old host keys
wfuwp removehostkey uat

# 3. Test SSH connection
wfuwp sshaws uat --dry-run
```

**Testing a site before DNS changes:**

```bash
# 1. Spoof DNS for testing
sudo wfuwp spoof newsite

# 2. Test your site at newsite.wfu.edu
# (Visit the site in your browser to verify it works)

# 3. Remove spoofing when done
sudo wfuwp unspoof
```

**Converting documentation for WordPress:**

```bash
# 1. Update your markdown documentation
# Edit your .md files in wp-docs/ directory

# 2. Convert to WordPress block HTML
wfuwp md2wpblock wp-docs/

# 3. Copy the generated .html files to WordPress
# Upload or paste the HTML into WordPress block editor
```

## Troubleshooting

**AWS-related errors:**  
Make sure your AWS CLI is configured: `aws configure list`

**SSH connection issues:**  
Clean up old host keys: `wfuwp removehostkey <environment>`  
Check your SSH key permissions: `ls -la ~/.ssh/`

**Permission errors:**  
If your AWS keys have expired, [follow this guide to refresh them](https://web.dev.wfu.edu/2025/03/regenerating-aws-credentials/).

The tool uses the same S3 buckets, EC2 instances, and permissions you already have - it's just a safer, easier way to manage your WordPress environments and AWS resources.