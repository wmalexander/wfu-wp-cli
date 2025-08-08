# spoof/unspoof - DNS Spoofing for Testing

DNS spoofing commands for testing websites before DNS changes take effect by modifying the local `/etc/hosts` file.

## Overview

The spoof and unspoof commands allow you to test WFU WordPress sites locally before DNS changes are implemented. This is essential for testing site deployments, SSL certificates, and functionality in a production-like environment.

## Commands

### spoof - Add DNS Spoofing
```bash
sudo wfuwp spoof <subdomain> [options]
```

### unspoof - Remove DNS Spoofing  
```bash
sudo wfuwp unspoof
```

## Why sudo is Required

These commands modify the system `/etc/hosts` file, which requires administrator privileges. The `sudo` prefix is mandatory for both commands.

## spoof Command

### Usage
```bash
sudo wfuwp spoof <subdomain> [options]
```

### Parameters
- `<subdomain>` - The subdomain to spoof (e.g., 'mysite' creates mysite.wfu.edu)

### Examples

#### Production Domain Spoofing
```bash
# Spoof shoes.wfu.edu to point to development server
sudo wfuwp spoof shoes

# Spoof tennis.wfu.edu to point to development server
sudo wfuwp spoof tennis
```

#### Development Environment Spoofing
```bash
# Spoof tennis.dev.wfu.edu to point to development server
sudo wfuwp spoof tennis --env dev

# Spoof mysite.uat.wfu.edu to point to development server
sudo wfuwp spoof mysite --env uat
```

### Options
- `--env <environment>` - Target environment (dev, uat, pprd). Default: production (no subdomain)

### Domain Creation Logic
- **Without --env**: Creates `{subdomain}.wfu.edu`
- **With --env dev**: Creates `{subdomain}.dev.wfu.edu`  
- **With --env uat**: Creates `{subdomain}.uat.wfu.edu`
- **With --env pprd**: Creates `{subdomain}.pprd.wfu.edu`

## unspoof Command

### Usage
```bash
sudo wfuwp unspoof
```

### Function
Removes all WFU-related DNS spoofing entries from `/etc/hosts`, restoring normal DNS resolution for all WFU domains.

### Examples
```bash
# Remove all spoofed WFU domains
sudo wfuwp unspoof
```

## How DNS Spoofing Works

### /etc/hosts File
The commands modify `/etc/hosts` to redirect domain names to your development server:

```
# Added by wfuwp spoof command
127.0.0.1 shoes.wfu.edu
127.0.0.1 tennis.dev.wfu.edu  
```

### IP Address Target
By default, spoofed domains point to `127.0.0.1` (localhost). This assumes you're running a local development server that can handle the spoofed domain requests.

## Common Workflows

### Testing New Site Deployment
```bash
# 1. Spoof the domain
sudo wfuwp spoof newsite

# 2. Test the site in browser at newsite.wfu.edu
# (Your local development server should handle this)

# 3. Remove spoofing when done
sudo wfuwp unspoof
```

### Pre-Launch Testing
```bash
# 1. Spoof production domain to test locally
sudo wfuwp spoof mysite

# 2. Test SSL certificates, functionality, etc.
# Visit mysite.wfu.edu in browser

# 3. Clean up when testing complete
sudo wfuwp unspoof
```

### Environment-Specific Testing
```bash
# Test UAT subdomain locally  
sudo wfuwp spoof testsite --env uat
# Now testsite.uat.wfu.edu points to localhost

# Test in browser, then clean up
sudo wfuwp unspoof
```

## Integration with Development Setup

### Local WordPress Development
```bash
# Set up local WordPress multisite
# Configure virtual hosts for spoofed domains
# Spoof domain for testing
sudo wfuwp spoof mysite

# Test at mysite.wfu.edu
# Should hit your local development server
```

### SSL Certificate Testing
```bash
# Spoof domain to test SSL certificates
sudo wfuwp spoof secursite

# Test HTTPS at https://secursite.wfu.edu
# Verify certificates work with spoofed domain
```

## Safety Features

- **Backup creation** - Creates backup of original `/etc/hosts` before modifications
- **WFU domain filtering** - Only affects WFU-related domains, leaves other entries intact
- **Clean removal** - `unspoof` removes only WFU entries added by the tool
- **Validation** - Checks subdomain format and prevents invalid entries

## File Management

### Backup Behavior
- Creates timestamped backup: `/etc/hosts.wfuwp-backup-YYYYMMDD-HHMMSS`
- Preserves existing `/etc/hosts` entries
- Allows manual recovery if needed

### Entry Format
```
# Added by wfuwp spoof command - [timestamp]
127.0.0.1 subdomain.wfu.edu
# End wfuwp spoof entries
```

## Troubleshooting

### Permission Errors
```bash
# Ensure using sudo
sudo wfuwp spoof mysite

# Check file permissions
ls -la /etc/hosts
```

### DNS Not Working
```bash
# Clear DNS cache after spoofing
sudo dscacheutil -flushcache  # macOS
sudo systemctl restart systemd-resolved  # Linux
```

### Browser Cache Issues
- Clear browser cache after spoofing/unspoofing
- Use private/incognito mode for testing
- Check browser developer tools for cached redirects

### Verification
```bash
# Check if spoofing worked
nslookup mysite.wfu.edu
# Should show 127.0.0.1

# Or check hosts file directly
cat /etc/hosts | grep wfu.edu
```

### Local Server Not Responding
- Ensure local development server is running
- Configure server to handle spoofed domain names
- Check virtual host configuration matches spoofed domains

## Important Notes

### Production Safety
- **Only affects local machine** - DNS spoofing doesn't affect other users
- **Temporary testing** - Always run `unspoof` when testing is complete
- **No production impact** - Changes only local DNS resolution

### Development Environment
- Configure local server to handle spoofed domain requests
- Set up SSL certificates for HTTPS testing if needed
- Ensure WordPress multisite can handle the spoofed domain names

### Team Coordination
- Document which domains are being spoofed during testing
- Communicate testing periods to avoid confusion
- Use version control for development server configuration changes

For detailed help: `wfuwp spoof --help` or `wfuwp unspoof --help`