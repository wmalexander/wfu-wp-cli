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

### syncs3 - Sync S3 Assets Between Environments

Safely sync S3 assets (uploads, media files, etc.) for WordPress sites between different environments with validation and confirmation prompts.

**Usage:** `wfuwp syncs3 <site-id> <source-env> <target-env> [options]`

**Examples:**

- Basic sync with confirmation: `wfuwp syncs3 43 uat pprd`
- Preview changes (dry run): `wfuwp syncs3 43 uat pprd --dry-run`
- Show detailed output: `wfuwp syncs3 43 uat pprd --verbose`
- Skip confirmation: `wfuwp syncs3 43 uat pprd --force`

### listips - List EC2 Instance IP Addresses

Display IP addresses of running EC2 instances in a specified environment, useful for SSH connections and network troubleshooting.

**Usage:** `wfuwp listips <environment> [options]`

**Examples:**

- List private IPs: `wfuwp listips uat`
- List public IPs: `wfuwp listips uat --public`
- Output as JSON: `wfuwp listips prod --json`
- Show both private and public: `wfuwp listips pprd --private --public`

### sshaws - SSH Into EC2 Instances

Easily SSH into EC2 instances in any environment with automatic key management and connection handling.

**Usage:** `wfuwp sshaws <environment> [options]`

**Examples:**

- Connect to first instance: `wfuwp sshaws uat`
- Connect to all instances: `wfuwp sshaws prod --all`
- List instances without connecting: `wfuwp sshaws dev --list`
- Use custom SSH key: `wfuwp sshaws uat --key ~/.ssh/my_key`
- Preview SSH commands: `wfuwp sshaws pprd --dry-run`

### removehostkey - Clean Up SSH Host Keys

Remove SSH host keys for EC2 instances when IP addresses change, preventing "host key verification failed" errors.

**Usage:** `wfuwp removehostkey <environment> [options]`

**Examples:**

- Remove host keys: `wfuwp removehostkey uat`
- Preview what would be removed: `wfuwp removehostkey prod --dry-run`
- Skip confirmation: `wfuwp removehostkey dev -y`
- Use custom known_hosts file: `wfuwp removehostkey pprd --known-hosts ~/.ssh/custom_hosts`

### spoof - DNS Spoofing for Testing

Spoof DNS for a WFU subdomain by adding entries to /etc/hosts. This allows you to test sites before DNS changes take effect.

**Usage:** `sudo wfuwp spoof <subdomain> [options]`

**Examples:**

- Spoof main domain: `sudo wfuwp spoof shoes` (creates shoes.wfu.edu)
- Spoof dev environment: `sudo wfuwp spoof tennis --env dev` (creates tennis.dev.wfu.edu)
- Spoof any subdomain: `sudo wfuwp spoof mysite` (creates mysite.wfu.edu)

### unspoof - Remove DNS Spoofing

Remove all WFU DNS spoofing entries from /etc/hosts to restore normal DNS resolution.

**Usage:** `sudo wfuwp unspoof`

**Examples:**

- Remove all spoofed entries: `sudo wfuwp unspoof`

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

## Troubleshooting

**AWS-related errors:**  
Make sure your AWS CLI is configured: `aws configure list`

**SSH connection issues:**  
Clean up old host keys: `wfuwp removehostkey <environment>`  
Check your SSH key permissions: `ls -la ~/.ssh/`

**Permission errors:**  
If your AWS keys have expired, [follow this guide to refresh them](https://web.dev.wfu.edu/2025/03/regenerating-aws-credentials/).

The tool uses the same S3 buckets, EC2 instances, and permissions you already have - it's just a safer, easier way to manage your WordPress environments and AWS resources.