# listips - List EC2 Instance IP Addresses

Display IP addresses of running EC2 instances in a specified environment, useful for SSH connections and network troubleshooting.

## Overview

The listips command queries AWS EC2 to find running instances in a specified environment and displays their IP addresses. This is particularly useful for determining which instances to connect to via SSH or for network troubleshooting.

## Usage

```bash
wfuwp listips <environment> [options]
```

## Parameters

- `<environment>` - Target environment (dev, uat, pprd, prod)

## Examples

### Basic IP Listing
```bash
# List private IPs for UAT environment
wfuwp listips uat

# List private IPs for production
wfuwp listips prod
```

### Public IP Addresses
```bash
# List public IPs for UAT environment
wfuwp listips uat --public

# List both private and public IPs
wfuwp listips pprd --private --public
```

### Output Formats
```bash
# Human-readable output (default)
wfuwp listips uat

# JSON output for scripting
wfuwp listips prod --json

# JSON with both IP types
wfuwp listips dev --json --private --public
```

## Options

- `--public` - Show public IP addresses instead of private
- `--private` - Show private IP addresses (default behavior)
- `--json` - Output as JSON for scripting/automation

## Output Format

### Default (Human-readable)
```
UAT Environment EC2 Instances:
- i-1234567890abcdef0: 10.0.1.100
- i-0987654321fedcba0: 10.0.1.101
```

### JSON Format
```json
{
  "environment": "uat",
  "instances": [
    {
      "instanceId": "i-1234567890abcdef0",
      "privateIpAddress": "10.0.1.100",
      "publicIpAddress": "54.123.456.789"
    },
    {
      "instanceId": "i-0987654321fedcba0", 
      "privateIpAddress": "10.0.1.101",
      "publicIpAddress": null
    }
  ]
}
```

## Instance Discovery

The command identifies instances by:
- **Running state** - Only shows instances that are currently running
- **Environment tags** - Uses AWS tags to identify environment membership
- **Name patterns** - Recognizes WFU naming conventions for environment identification

## Use Cases

### SSH Connection Planning
```bash
# Find instances to SSH into
wfuwp listips uat
wfuwp sshaws uat  # Use discovered IPs for SSH
```

### Network Troubleshooting
```bash
# Check public connectivity
wfuwp listips prod --public

# Verify private network setup
wfuwp listips dev --private
```

### Automation and Scripting
```bash
# Get JSON for scripts
INSTANCES=$(wfuwp listips prod --json)
echo $INSTANCES | jq '.instances[0].privateIpAddress'
```

### Load Balancer Configuration
```bash
# List all instances in environment for load balancer setup
wfuwp listips pprd --json --private --public
```

## Environment Validation

The command validates that:
- Environment name is one of: dev, uat, pprd, prod
- AWS CLI is configured and accessible
- AWS credentials have EC2 describe permissions

## AWS Permissions Required

The command requires these AWS IAM permissions:
- `ec2:DescribeInstances` - To list and filter EC2 instances
- `ec2:DescribeTags` - To identify instances by environment tags

## Integration with Other Commands

### With SSH Commands
```bash
# List IPs then SSH
wfuwp listips uat
wfuwp sshaws uat
```

### With Host Key Management
```bash
# List IPs to know which host keys to remove
wfuwp listips prod --public
wfuwp removehostkey prod
```

### With Network Configuration
```bash
# Get IPs for DNS spoofing
wfuwp listips dev --public
sudo wfuwp spoof mysite --env dev
```

## Common Scenarios

### Multi-Instance Environments
```bash
# Production with multiple instances
wfuwp listips prod --json
```

### Development Environment Check
```bash
# Quick check of dev environment
wfuwp listips dev --private --public
```

### Public Access Verification
```bash
# Check which instances have public IPs
wfuwp listips uat --public
```

## Error Handling

**No instances found:**
- Verifies environment has running EC2 instances
- Checks if instances are properly tagged
- Suggests checking environment name spelling

**AWS credential issues:**
- Validates AWS CLI configuration
- Checks credential expiration
- Provides guidance for credential refresh

**Permission errors:**
- Identifies missing EC2 permissions
- Suggests required IAM policies
- Provides AWS documentation links

## Troubleshooting

**Empty results:**
- Verify instances are in "running" state
- Check environment tags match expected values
- Confirm AWS region is correct

**Connection timeouts:**
- Check internet connectivity
- Verify AWS CLI configuration: `aws configure list`
- Test basic AWS access: `aws ec2 describe-regions`

**Permission denied:**
- Ensure AWS credentials have EC2 read permissions
- Check IAM policies include `ec2:DescribeInstances`
- Verify credentials haven't expired

For detailed help: `wfuwp listips --help`