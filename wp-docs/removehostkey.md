# removehostkey - Clean Up SSH Host Keys

Remove SSH host keys for EC2 instances when IP addresses change, preventing "host key verification failed" errors.

## Overview

The removehostkey command cleans up SSH host keys from your `~/.ssh/known_hosts` file when EC2 instances are recreated or IP addresses change. This prevents the common "host key verification failed" error that blocks SSH connections.

## Usage

```bash
wfuwp removehostkey <environment> [options]
```

## Parameters

- `<environment>` - Target environment (dev, uat, pprd, prod)

## Examples

### Basic Host Key Removal
```bash
# Remove host keys for UAT environment
wfuwp removehostkey uat

# Remove host keys for production
wfuwp removehostkey prod
```

### Preview and Automation
```bash
# Preview what would be removed (dry run)
wfuwp removehostkey prod --dry-run

# Skip confirmation prompts
wfuwp removehostkey dev -y

# Combine options
wfuwp removehostkey uat --dry-run -y
```

### Custom Known Hosts File
```bash
# Use custom known_hosts file location
wfuwp removehostkey pprd --known-hosts ~/.ssh/custom_hosts

# Work with specific file
wfuwp removehostkey dev --known-hosts /path/to/ssh/known_hosts
```

## Options

- `--dry-run` - Preview changes without executing them
- `-y, --yes` - Skip confirmation prompts
- `--known-hosts <path>` - Specify custom known_hosts file location (default: ~/.ssh/known_hosts)

## When to Use

### Common Scenarios

**After EC2 instance recreation:**
```bash
# Instances recreated, SSH fails with host key errors
wfuwp removehostkey prod
wfuwp sshaws prod  # Should work now
```

**IP address changes:**
```bash
# Infrastructure changes caused IP reassignment
wfuwp removehostkey uat --dry-run  # See what would be removed
wfuwp removehostkey uat            # Clean up old keys
```

**Deployment automation:**
```bash
# Clean slate for automated deployments
wfuwp removehostkey dev -y         # No prompts for automation
```

## Host Key Discovery

The command identifies host keys by:
- **IP address matching** - Finds keys for current environment instance IPs
- **Hostname matching** - Removes keys for environment-specific hostnames
- **Pattern recognition** - Identifies WFU environment naming conventions

### Key Identification Process
1. Query AWS EC2 for current instance IPs in environment
2. Search known_hosts file for matching entries
3. Identify both current and potentially stale entries
4. Present findings for confirmation or removal

## Output Examples

### Dry Run Output
```bash
$ wfuwp removehostkey uat --dry-run
Found host keys to remove from ~/.ssh/known_hosts:
- 10.0.1.100 (line 15)
- 10.0.1.101 (line 23)  
- old-uat-host.wfu.edu (line 8)

Would remove 3 host key entries.
```

### Normal Operation
```bash
$ wfuwp removehostkey prod
Found 2 host keys for production environment.
Remove these host keys? (y/N): y
Removed 2 host key entries from ~/.ssh/known_hosts
```

### No Keys Found
```bash
$ wfuwp removehostkey dev
No host keys found for dev environment in ~/.ssh/known_hosts
```

## Integration with SSH Workflow

### Typical Troubleshooting Sequence
```bash
# SSH connection fails with host key error
wfuwp sshaws uat
# Error: Host key verification failed

# Clean up old keys
wfuwp removehostkey uat

# Retry SSH connection
wfuwp sshaws uat
# Should work now
```

### With Other Commands
```bash
# Check current IPs
wfuwp listips prod

# Clean up old host keys
wfuwp removehostkey prod --dry-run
wfuwp removehostkey prod

# Connect with clean slate
wfuwp sshaws prod
```

## Safety Features

- **Backup creation** - Creates backup of known_hosts before modifications
- **Confirmation prompts** - Asks before removing keys (unless -y flag used)
- **Dry run mode** - Preview operations with --dry-run
- **Precise matching** - Only removes keys specifically related to the environment
- **Error handling** - Graceful handling of missing files or permission issues

## File Management

### Backup Behavior
```bash
# Automatic backup created
~/.ssh/known_hosts.wfuwp-backup-20240315-143022
```

### Known Hosts File Format
The command works with standard SSH known_hosts format:
```
10.0.1.100 ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC...
[10.0.1.101]:22 ecdsa-sha2-nistp256 AAAAE2VjZHNhLXN...
hostname.wfu.edu ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAA...
```

## Error Handling

### Missing Known Hosts File
```bash
# Creates empty file if none exists
# No error if file doesn't exist initially
```

### Permission Issues
```bash
# Checks file permissions
# Provides guidance for fixing permission problems
chmod 644 ~/.ssh/known_hosts
```

### AWS Connection Problems
```bash
# Validates AWS connectivity before proceeding
# Provides clear error messages for credential issues
```

## Advanced Usage

### Automation Scripts
```bash
#!/bin/bash
# Deployment script with host key cleanup
wfuwp removehostkey prod -y --dry-run > /tmp/keys_to_remove.log
if [ -s /tmp/keys_to_remove.log ]; then
    wfuwp removehostkey prod -y
fi
wfuwp sshaws prod --dry-run  # Test connection
```

### Custom SSH Configurations
```bash
# For custom SSH config with specific known_hosts
wfuwp removehostkey uat --known-hosts ~/.ssh/project_known_hosts
```

### Batch Operations
```bash
# Clean all environments (be careful!)
for env in dev uat pprd prod; do
    wfuwp removehostkey $env -y
done
```

## Common Error Messages

### "Host key verification failed"
```bash
# This is the error that removehostkey fixes
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

# Solution:
wfuwp removehostkey <environment>
```

### "No instances found"
- Check environment name spelling (dev, uat, pprd, prod)
- Verify AWS credentials have EC2 describe permissions
- Ensure instances exist in the specified environment

## Troubleshooting

### SSH Still Failing After Key Removal
```bash
# Check if connection works now
wfuwp sshaws env --dry-run

# Verify instances are accessible
wfuwp listips env --public

# Check SSH key permissions
ls -la ~/.ssh/
```

### Keys Not Found
```bash
# Check current known_hosts content
cat ~/.ssh/known_hosts | grep -E "(10\.|prod|uat|pprd|dev)"

# Verify instances are running
wfuwp listips env
```

### File Permission Errors
```bash
# Fix known_hosts permissions
chmod 644 ~/.ssh/known_hosts
chmod 700 ~/.ssh/

# Verify ownership
ls -la ~/.ssh/known_hosts
```

For detailed help: `wfuwp removehostkey --help`