# sshaws - SSH Into EC2 Instances

Easily SSH into EC2 instances in any environment with automatic key management and connection handling.

## Overview

The sshaws command simplifies SSH connections to EC2 instances by automatically discovering instances in specified environments, handling SSH keys, and managing connections. No need to manually look up IP addresses or manage SSH key paths.

## Usage

```bash
wfuwp sshaws <environment> [options]
```

## Parameters

- `<environment>` - Target environment (dev, uat, pprd, prod)

## Examples

### Basic SSH Connection
```bash
# Connect to first instance in UAT
wfuwp sshaws uat

# Connect to first instance in production  
wfuwp sshaws prod
```

### Multiple Instance Handling
```bash
# Connect to all instances (opens separate terminals)
wfuwp sshaws prod --all

# List instances without connecting
wfuwp sshaws dev --list
```

### Connection Options
```bash
# Use custom SSH key
wfuwp sshaws uat --key ~/.ssh/my_custom_key

# Preview SSH commands without executing
wfuwp sshaws pprd --dry-run

# Connect using specific username
wfuwp sshaws dev --user ubuntu
```

## Options

- `--all` - Connect to all running instances in environment
- `--list` - List available instances without connecting
- `--key <path>` - Use specific SSH private key file
- `--user <username>` - SSH username (default: ec2-user)
- `--dry-run` - Show SSH commands without executing them

## SSH Key Management

### Automatic Key Discovery
The tool automatically searches for SSH keys in standard locations:
- `~/.ssh/id_rsa`
- `~/.ssh/id_ed25519`
- `~/.ssh/{environment}-key`
- `~/.ssh/{environment}.pem`

### Custom Key Specification
```bash
# Use environment-specific key
wfuwp sshaws prod --key ~/.ssh/prod-key.pem

# Use personal key
wfuwp sshaws dev --key ~/.ssh/my_personal_key
```

## Multiple Instance Behavior

### Single Instance (Default)
Connects to the first available instance in the environment.

### All Instances (--all flag)
```bash
wfuwp sshaws prod --all
```
- Opens separate terminal windows/tabs for each instance
- Useful for environments with multiple load-balanced servers
- Each connection runs independently

### Instance Selection
When multiple instances exist, the tool:
1. Lists all available instances
2. Connects to first instance by default
3. Allows --all flag for multiple connections
4. Shows instance IDs and IP addresses for reference

## Connection Process

1. **Discovery** - Finds running EC2 instances in specified environment
2. **Key location** - Identifies appropriate SSH key file
3. **Connection** - Establishes SSH connection with proper parameters
4. **Error handling** - Provides clear feedback on connection issues

## Output Examples

### Listing Instances
```bash
$ wfuwp sshaws uat --list
UAT Environment EC2 Instances:
- i-1234567890abcdef0: 10.0.1.100 (ec2-user@10.0.1.100)
- i-0987654321fedcba0: 10.0.1.101 (ec2-user@10.0.1.101)
```

### Dry Run Output
```bash
$ wfuwp sshaws prod --dry-run
Would execute: ssh -i ~/.ssh/prod-key.pem ec2-user@54.123.456.789
```

### Successful Connection
```bash
$ wfuwp sshaws uat
Connecting to UAT instance i-1234567890abcdef0 (10.0.1.100)...
[SSH connection opens]
```

## Environment Integration

### With Other Commands
```bash
# Check instance IPs first
wfuwp listips uat

# Then connect
wfuwp sshaws uat

# Clean up host keys if needed
wfuwp removehostkey uat
```

### Workflow Integration
```bash
# Typical deployment workflow
wfuwp syncs3 43 uat prod          # Sync files
wfuwp migrate 43 --from uat --to prod  # Migrate database
wfuwp sshaws prod                 # Connect to verify deployment
```

## Security Features

- **Key validation** - Verifies SSH key file exists and has proper permissions
- **Connection security** - Uses standard SSH security practices
- **No credential storage** - Relies on local SSH key files, no password storage
- **Permission checking** - Validates SSH key permissions (600/400)

## Common Use Cases

### Server Maintenance
```bash
# Connect to production for maintenance
wfuwp sshaws prod
```

### Log Checking
```bash
# Connect to check application logs
wfuwp sshaws uat --dry-run  # Preview connection
wfuwp sshaws uat           # Connect and check logs
```

### Multi-Server Operations
```bash
# Connect to all instances for cluster operations
wfuwp sshaws prod --all
```

### Troubleshooting
```bash
# List instances to see what's available
wfuwp sshaws dev --list

# Connect with specific key if default fails
wfuwp sshaws dev --key ~/.ssh/debug-key.pem
```

## Prerequisites

- SSH client installed (standard on macOS/Linux)
- AWS CLI configured with appropriate credentials
- SSH private key files with correct permissions (600 or 400)
- EC2 instances configured to accept SSH connections

## Error Handling

**No instances found:**
- Checks if environment has running instances
- Verifies environment name is correct
- Suggests using `wfuwp listips <env>` to verify instances

**SSH key issues:**
- Validates key file existence
- Checks key file permissions
- Provides guidance on fixing permission problems

**Connection failures:**
- Suggests running `wfuwp removehostkey <env>` for host key issues
- Checks security group configurations
- Provides network troubleshooting steps

## Troubleshooting

**Host key verification failed:**
```bash
wfuwp removehostkey uat  # Clean up old keys
wfuwp sshaws uat         # Retry connection
```

**Permission denied (publickey):**
- Verify SSH key path: `wfuwp sshaws uat --key ~/.ssh/correct-key.pem`
- Check key permissions: `chmod 600 ~/.ssh/your-key.pem`
- Confirm key is associated with EC2 instances

**Connection timeout:**
- Check instance status: `wfuwp listips uat`
- Verify security groups allow SSH (port 22)
- Confirm network connectivity

**Multiple key files:**
```bash
# Specify exact key to use
wfuwp sshaws prod --key ~/.ssh/prod-specific-key.pem
```

For detailed help: `wfuwp sshaws --help`