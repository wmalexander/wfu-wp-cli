# Command-Specific Troubleshooting Guide

This guide provides troubleshooting steps for each wfuwp command.

## Table of Contents

- [migrate](#migrate-command)
- [env-migrate](#env-migrate-command)
- [config](#config-command)
- [db](#db-command)
- [restore](#restore-command)
- [syncs3](#syncs3-command)
- [listips](#listips-command)
- [sshaws](#sshaws-command)
- [local](#local-command)
- [spoof/unspoof](#spoofunspoof-commands)

---

## migrate Command

### Error: "Database configuration incomplete"

**Symptom:**
```
Error: Environment 'prod' is not configured
```

**Solution:**
```bash
# Run configuration wizard
wfuwp config wizard

# Or set manually
wfuwp config set env.prod.host prod-db.wfu.edu
wfuwp config set env.prod.user wp_user
wfuwp config set env.prod.password --prompt
wfuwp config set env.prod.database wp_production
```

### Error: "Site tables not found"

**Symptom:**
```
Error: No tables found for site 43 in source database
```

**Solutions:**
1. Verify site ID exists:
   ```bash
   wfuwp db test prod
   # Check if wp_43_* tables exist
   ```

2. For main site (ID 1), tables don't have numeric prefix:
   ```bash
   wfuwp migrate 1 --from prod --to pprd --homepage
   ```

### Error: "Migration database connection failed"

**Symptom:**
```
Error: Cannot connect to migration database
```

**Solution:**
```bash
# Configure migration database
wfuwp config set migration.host migration-db.wfu.edu
wfuwp config set migration.user wp_migration
wfuwp config set migration.password --prompt
wfuwp config set migration.database wp_migration

# Test connection
wfuwp db test migration
```

### Error: "S3 sync failed"

**Symptom:**
```
Error: AWS CLI failed to sync files
```

**Solutions:**
1. Check AWS credentials:
   ```bash
   aws configure list
   aws s3 ls
   ```

2. Verify S3 bucket access:
   ```bash
   aws s3 ls s3://wfu-wordpress-prod/
   ```

3. Skip S3 sync if not needed:
   ```bash
   wfuwp migrate 43 --from prod --to pprd --skip-s3
   ```

---

## env-migrate Command

### Error: "Pre-flight validation failed"

**Symptom:**
```
Error: Pre-flight checks failed: Docker not found
```

**Solutions:**
1. Install missing dependencies:
   ```bash
   # macOS
   brew install --cask docker
   open -a Docker
   
   # Linux
   sudo apt-get install docker.io
   sudo systemctl start docker
   ```

2. Verify all requirements:
   ```bash
   docker --version
   aws --version
   wp --version
   ```

### Error: "Site enumeration failed"

**Symptom:**
```
Error: Failed to enumerate sites from source environment
```

**Solution:**
```bash
# Test source database connection
wfuwp db test prod

# Try with specific sites instead
wfuwp env-migrate prod uat --include-sites "1,43,78"
```

### Error: "Batch processing timeout"

**Symptom:**
```
Error: Batch 3 failed after maximum retries
```

**Solutions:**
1. Reduce batch size:
   ```bash
   wfuwp env-migrate prod uat --batch-size 2
   ```

2. Increase timeout:
   ```bash
   wfuwp env-migrate prod uat --timeout 60
   ```

3. Skip problematic sites:
   ```bash
   wfuwp env-migrate prod uat --exclude-sites "99,105"
   ```

---

## config Command

### Error: "Failed to encrypt password"

**Symptom:**
```
Error: Failed to encrypt configuration value
```

**Solution:**
```bash
# Reset configuration
mv ~/.wfuwp/config.json ~/.wfuwp/config.json.backup
wfuwp config wizard
```

### Error: "Configuration file corrupted"

**Symptom:**
```
Error: Failed to parse configuration file
SyntaxError: Unexpected token
```

**Solution:**
```bash
# Backup corrupted file
cp ~/.wfuwp/config.json ~/.wfuwp/config.json.corrupt

# Recreate configuration
rm ~/.wfuwp/config.json
wfuwp config wizard
```

### Error: "Permission denied"

**Symptom:**
```
Error: EACCES: permission denied, open '/home/user/.wfuwp/config.json'
```

**Solution:**
```bash
# Fix permissions
chmod 700 ~/.wfuwp
chmod 600 ~/.wfuwp/config.json

# Or change ownership
sudo chown -R $(whoami):$(whoami) ~/.wfuwp
```

---

## db Command

### Error: "Unknown MySQL server host"

**Symptom:**
```
Error: getaddrinfo ENOTFOUND prod-db.wfu.edu
```

**Solutions:**
1. Check DNS resolution:
   ```bash
   nslookup prod-db.wfu.edu
   ping prod-db.wfu.edu
   ```

2. Check VPN connection if required

3. Use IP address instead:
   ```bash
   wfuwp config set env.prod.host 10.0.1.50
   ```

### Error: "Access denied for user"

**Symptom:**
```
Error: Access denied for user 'wp_user'@'host'
```

**Solution:**
```bash
# Update password
wfuwp config set env.prod.password --prompt

# Verify username
wfuwp config show env.prod.user
```

### Error: "Can't connect to MySQL server"

**Symptom:**
```
Error: connect ETIMEDOUT
```

**Solutions:**
1. Check firewall/security groups
2. Verify port (default 3306):
   ```bash
   wfuwp config set env.prod.port 3306
   ```
3. Test with mysql client:
   ```bash
   mysql -h prod-db.wfu.edu -u wp_user -p
   ```

---

## restore Command

### Error: "SQL file not found"

**Symptom:**
```
Error: SQL file not found: ./backup.sql
```

**Solution:**
```bash
# Use absolute path
wfuwp restore /home/user/backups/backup.sql --to uat

# List available backups
ls -la ~/.wfuwp/backups/
```

### Error: "Import operation failed"

**Symptom:**
```
Error: Import operation failed
MySQL Error 1153: Got a packet bigger than 'max_allowed_packet'
```

**Solutions:**
1. Split large SQL file:
   ```bash
   split -b 100M backup.sql backup_part_
   ```

2. Increase timeout:
   ```bash
   wfuwp restore backup.sql --to uat --timeout 120
   ```

3. Contact DBA to increase max_allowed_packet

---

## syncs3 Command

### Error: "AWS CLI is not installed"

**Symptom:**
```
Error: AWS CLI is not installed or not in PATH
```

**Solution:**
```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verify
aws --version
```

### Error: "S3 bucket does not exist"

**Symptom:**
```
Error: The specified bucket does not exist
```

**Solution:**
```bash
# List available buckets
aws s3 ls

# Check bucket name in different environments
aws s3 ls s3://wfu-wordpress-prod/
aws s3 ls s3://wfu-wordpress-uat/
```

### Error: "Access Denied"

**Symptom:**
```
Error: Access Denied (403)
```

**Solutions:**
1. Check AWS credentials:
   ```bash
   aws configure list
   aws sts get-caller-identity
   ```

2. Verify IAM permissions for S3 bucket

3. Refresh credentials if expired

---

## listips Command

### Error: "No instances found"

**Symptom:**
```
No running EC2 instances found for environment: prod
```

**Solutions:**
1. Check AWS region:
   ```bash
   aws configure get region
   ```

2. Verify tag filters are correct

3. Check instance state:
   ```bash
   aws ec2 describe-instances --filters "Name=tag:Environment,Values=prod"
   ```

---

## sshaws Command

### Error: "Permission denied (publickey)"

**Symptom:**
```
Permission denied (publickey)
```

**Solutions:**
1. Specify SSH key:
   ```bash
   wfuwp sshaws uat --key ~/.ssh/aws-key.pem
   ```

2. Check key permissions:
   ```bash
   chmod 600 ~/.ssh/aws-key.pem
   ```

3. Add key to SSH agent:
   ```bash
   ssh-add ~/.ssh/aws-key.pem
   ```

### Error: "Host key verification failed"

**Symptom:**
```
Host key verification failed
```

**Solution:**
```bash
# Remove old host key
wfuwp removehostkey uat

# Then retry SSH
wfuwp sshaws uat
```

---

## local Command

### Error: "Docker not running"

**Symptom:**
```
Error: Docker is not running
```

**Solutions:**
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker

# Verify
docker ps
```

### Error: "DDEV project not found"

**Symptom:**
```
Error: No DDEV project found in current directory
```

**Solution:**
```bash
# Initialize DDEV project
ddev config --project-type=wordpress
ddev start
```

### Error: "Permission denied for /etc/hosts"

**Symptom:**
```
Error: Permission denied: /etc/hosts
```

**Solution:**
```bash
# Use sudo for domain commands
sudo wfuwp local domain add 43
```

---

## spoof/unspoof Commands

### Error: "Must run with sudo"

**Symptom:**
```
Error: This command requires sudo privileges
```

**Solution:**
```bash
sudo wfuwp spoof mysite
sudo wfuwp unspoof
```

### Error: "Invalid IP address"

**Symptom:**
```
Error: Invalid IP address format
```

**Solution:**
```bash
# Use valid IP format
sudo wfuwp spoof mysite --ip 10.0.1.50
# Not: --ip 10.0.1
```

### Error: "Entry already exists"

**Symptom:**
```
Warning: DNS spoofing already active for mysite.wfu.edu
```

**Solution:**
```bash
# Remove existing entry first
sudo wfuwp unspoof mysite

# Then add new one
sudo wfuwp spoof mysite
```

---

## General Troubleshooting Tips

### Check Tool Version
```bash
wfuwp --version
npm list -g wfuwp
```

### Update to Latest Version
```bash
npm update -g wfuwp
```

### Enable Debug Mode
```bash
export WFUWP_DEBUG=true
wfuwp migrate 43 --from prod --to pprd --verbose
```

### Check System Requirements
```bash
node --version  # Should be 18+
docker --version
aws --version
```

### Reset Everything
```bash
# Backup current config
cp -r ~/.wfuwp ~/.wfuwp.backup

# Uninstall and reinstall
npm uninstall -g wfuwp
npm cache clean --force
npm install -g wfuwp

# Reconfigure
wfuwp config wizard
```

### Get Help
```bash
wfuwp --help
wfuwp <command> --help
```

## Still Having Issues?

1. Check the [Getting Started Guide](./getting-started.md)
2. Review the [Commands Reference](./commands.md)
3. Look at [Visual Workflows](./workflows.md) to understand the process
4. Search existing issues in the repository
5. Create a new issue with:
   - Command that failed
   - Complete error message
   - Output of `wfuwp --version`
   - Output of `wfuwp config verify`