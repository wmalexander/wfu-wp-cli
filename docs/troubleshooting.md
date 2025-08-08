# Troubleshooting Guide

## Common Issues and Solutions

### Installation Issues

#### Node.js Version Mismatch

**Error:**
```
Error: Node.js version 16.x.x is not supported. Required: >=18.0.0
```

**Solution:**
```bash
# Check current version
node --version

# Install Node.js 18+ using nvm
nvm install 18
nvm use 18
nvm alias default 18

# Verify
node --version
```

#### NPM Permission Errors

**Error:**
```
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /usr/local/lib/node_modules
```

**Solution:**
```bash
# Option 1: Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Option 2: Use npx instead
npx @wfu/wp-cli migrate 43 --from prod --to pprd
```

#### Docker Not Found

**Error:**
```
Error: Docker is not installed or not running
/bin/sh: docker: command not found
```

**Solution:**
```bash
# macOS
brew install --cask docker
open -a Docker

# Linux
sudo apt-get update
sudo apt-get install docker.io
sudo systemctl start docker
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker run hello-world
```

### Configuration Issues

#### Configuration File Not Found

**Error:**
```
Error: Configuration file not found at ~/.wfuwp/config.json
```

**Solution:**
```bash
# Run configuration wizard
wfuwp config wizard

# Or create manually
mkdir -p ~/.wfuwp
wfuwp config set env.prod.host prod-db.wfu.edu
```

#### Corrupted Configuration

**Error:**
```
Error: Failed to parse configuration file
SyntaxError: Unexpected token in JSON
```

**Solution:**
```bash
# Backup corrupted file
mv ~/.wfuwp/config.json ~/.wfuwp/config.json.backup

# Recreate configuration
wfuwp config wizard

# Or restore from backup
cp ~/.wfuwp/config.json.backup.working ~/.wfuwp/config.json
```

#### Encryption/Decryption Errors

**Error:**
```
Error: Failed to decrypt configuration value
Error: Invalid authentication tag
```

**Solution:**
```bash
# Re-encrypt configuration
wfuwp config re-encrypt

# If that fails, reset configuration
mv ~/.wfuwp/config.json ~/.wfuwp/config.json.old
wfuwp config wizard
```

### Database Connection Issues

#### Connection Refused

**Error:**
```
Error: connect ECONNREFUSED 10.0.1.50:3306
Error: Can't connect to MySQL server
```

**Solution:**
```bash
# Test connectivity
ping prod-db.wfu.edu
telnet prod-db.wfu.edu 3306

# Check firewall rules
# Ensure your IP is whitelisted

# Test with mysql client
mysql -h prod-db.wfu.edu -u wordpress -p

# Verify configuration
wfuwp config get env.prod.host
wfuwp config verify --env prod
```

#### Authentication Failed

**Error:**
```
Error: ER_ACCESS_DENIED_ERROR: Access denied for user 'wordpress'@'10.0.0.1'
```

**Solution:**
```bash
# Verify credentials
wfuwp config set env.prod.password --prompt

# Test with mysql client
mysql -h prod-db.wfu.edu -u wordpress -p wordpress_prod

# Check user permissions in MySQL
SHOW GRANTS FOR 'wordpress'@'%';
```

#### Database Not Found

**Error:**
```
Error: ER_BAD_DB_ERROR: Unknown database 'wordpress_prod'
```

**Solution:**
```bash
# Verify database name
wfuwp config get env.prod.database

# List available databases
mysql -h prod-db.wfu.edu -u wordpress -p -e "SHOW DATABASES"

# Update configuration
wfuwp config set env.prod.database correct_database_name
```

### Migration Issues

#### Site Not Found

**Error:**
```
Error: Site 43 not found in production database
```

**Solution:**
```bash
# Check if site exists
mysql -h prod-db.wfu.edu -u wordpress -p wordpress_prod \
  -e "SELECT blog_id, domain FROM wp_blogs WHERE blog_id = 43"

# List all sites
mysql -h prod-db.wfu.edu -u wordpress -p wordpress_prod \
  -e "SELECT blog_id, domain FROM wp_blogs ORDER BY blog_id"
```

#### Export Failed

**Error:**
```
Error: Failed to export tables from source database
mysqldump: Got error: 1045: Access denied
```

**Solution:**
```bash
# Verify WP-CLI Docker image
docker pull wordpress:cli
docker run --rm wordpress:cli wp --version

# Test export manually
docker run --rm -v /tmp:/tmp wordpress:cli \
  wp db export /tmp/test.sql \
  --host=prod-db.wfu.edu \
  --user=wordpress \
  --pass=yourpassword \
  --dbname=wordpress_prod
```

#### Search-Replace Timeout

**Error:**
```
Error: WP-CLI search-replace operation timed out
```

**Solution:**
```bash
# Increase timeout
wfuwp config set docker.timeout 600

# Use simple mode for large databases
wfuwp migrate 43 --from prod --to pprd --simple

# Manual search-replace with smaller batches
wp search-replace 'old.com' 'new.com' \
  --precise --recurse-objects \
  --skip-columns=guid \
  --dry-run
```

#### Import Failed

**Error:**
```
Error: Failed to import to target database
ERROR 1153: Got a packet bigger than 'max_allowed_packet' bytes
```

**Solution:**
```bash
# Check MySQL settings
mysql -h pprd-db.wfu.edu -u wordpress -p \
  -e "SHOW VARIABLES LIKE 'max_allowed_packet'"

# Split large SQL files
split -b 100M export.sql export-part-

# Import in parts
for file in export-part-*; do
  mysql -h pprd-db.wfu.edu -u wordpress -p wordpress_pprd < $file
done
```

### AWS/S3 Issues

#### AWS CLI Not Configured

**Error:**
```
Error: Unable to locate credentials
The AWS CLI is not configured
```

**Solution:**
```bash
# Configure AWS CLI
aws configure

# Enter:
# AWS Access Key ID: [your-key]
# AWS Secret Access Key: [your-secret]
# Default region: us-east-1
# Default output format: json

# Test
aws s3 ls
```

#### S3 Access Denied

**Error:**
```
Error: Access Denied to S3 bucket
403 Forbidden
```

**Solution:**
```bash
# Check IAM permissions
aws iam get-user
aws iam list-attached-user-policies --user-name your-user

# Test S3 access
aws s3 ls s3://wfu-wordpress-backups/

# Use specific profile
export AWS_PROFILE=wfu-wordpress
aws s3 ls
```

#### S3 Sync Failed

**Error:**
```
Error: S3 sync failed
fatal error: An error occurred (NoSuchBucket)
```

**Solution:**
```bash
# Verify bucket names
wfuwp config get s3.bucket
aws s3 ls

# Check bucket region
aws s3api get-bucket-location --bucket wfu-wordpress-prod

# Update configuration
wfuwp config set s3.region us-west-2
```

### Docker Issues

#### Docker Daemon Not Running

**Error:**
```
Error: Cannot connect to the Docker daemon
Is the docker daemon running?
```

**Solution:**
```bash
# macOS
open -a Docker
# Wait for Docker to start

# Linux
sudo systemctl start docker
sudo systemctl enable docker

# Check status
docker info
```

#### Container Permission Issues

**Error:**
```
Error: Permission denied while trying to connect to Docker daemon socket
```

**Solution:**
```bash
# Linux: Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# macOS: Ensure Docker Desktop has permissions
# System Preferences > Security & Privacy > Privacy > Files and Folders

# Test
docker run hello-world
```

#### Image Pull Failures

**Error:**
```
Error: Failed to pull wordpress:cli image
Error response from daemon: pull access denied
```

**Solution:**
```bash
# Login to Docker Hub (if needed)
docker login

# Pull manually
docker pull wordpress:cli

# Use specific version
docker pull wordpress:cli-2.7

# Update configuration
wfuwp config set docker.wpCliImage wordpress:cli-2.7
```

### SSH Issues

#### Host Key Verification Failed

**Error:**
```
Host key verification failed
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
```

**Solution:**
```bash
# Remove old host key
wfuwp removehostkey prod-web-01.wfu.edu

# Or manually
ssh-keygen -R prod-web-01.wfu.edu
ssh-keygen -R 10.0.1.50

# Connect and accept new key
ssh ec2-user@prod-web-01.wfu.edu
```

#### Permission Denied (SSH)

**Error:**
```
Permission denied (publickey)
```

**Solution:**
```bash
# Check SSH key permissions
chmod 600 ~/.ssh/wfu-wordpress.pem

# Verify correct key
wfuwp config get ssh.defaultKey

# Test connection
ssh -i ~/.ssh/wfu-wordpress.pem ec2-user@10.0.1.50

# Use verbose mode for debugging
ssh -vvv -i ~/.ssh/wfu-wordpress.pem ec2-user@10.0.1.50
```

### File System Issues

#### Disk Space Errors

**Error:**
```
Error: ENOSPC: no space left on device
```

**Solution:**
```bash
# Check disk space
df -h
df -h /tmp
df -h ~/.wfuwp

# Clean up old backups
find ~/.wfuwp/backups -mtime +30 -delete

# Clean Docker
docker system prune -a

# Use different work directory
wfuwp migrate 43 --from prod --to pprd \
  --work-dir /mnt/large-disk
```

#### Permission Denied (Files)

**Error:**
```
Error: EACCES: permission denied, open '/etc/hosts'
```

**Solution:**
```bash
# For spoof/unspoof commands
sudo wfuwp spoof example.com 127.0.0.1

# Fix config permissions
chmod 700 ~/.wfuwp
chmod 600 ~/.wfuwp/config.json

# Check file ownership
ls -la ~/.wfuwp/
```

## Debugging Techniques

### Enable Debug Mode

```bash
# Set debug environment variable
export WFUWP_DEBUG=true

# Run with verbose output
wfuwp migrate 43 --from prod --to pprd --verbose --debug

# Check debug logs
tail -f ~/.wfuwp/logs/debug.log
```

### Check Logs

```bash
# Main application log
tail -f ~/.wfuwp/logs/wfuwp.log

# Migration specific logs
ls -la ~/.wfuwp/logs/migration-*.log

# Docker logs
docker logs $(docker ps -lq)

# System logs (Linux)
journalctl -xe
```

### Test Components Individually

```bash
# Test database connection
mysql -h prod-db.wfu.edu -u wordpress -p -e "SELECT 1"

# Test Docker
docker run --rm wordpress:cli wp --version

# Test AWS
aws s3 ls
aws ec2 describe-instances

# Test configuration
wfuwp config verify
```

### Use Dry Run Mode

```bash
# Preview migration without changes
wfuwp migrate 43 --from prod --to pprd --dry-run

# Preview S3 sync
wfuwp syncs3 --from prod --to pprd --dry-run
```

## Performance Optimization

### Slow Migrations

```bash
# Use compression
wfuwp config set migration.compress true

# Increase memory
export NODE_OPTIONS="--max-old-space-size=4096"

# Use faster network path
wfuwp config set migration.host migration-local.wfu.edu

# Skip non-essential operations
wfuwp migrate 43 --from prod --to pprd \
  --skip-backup --skip-s3
```

### S3 Transfer Speed

```bash
# Limit bandwidth
wfuwp syncs3 --from prod --to pprd --max-bandwidth 10

# Use multipart uploads
aws configure set s3.max_concurrent_requests 10
aws configure set s3.max_queue_size 10000
aws configure set s3.multipart_threshold 64MB

# Sync specific directories
wfuwp syncs3 --from prod --to pprd \
  --prefix wp-content/uploads/2024
```

## Getting Help

### Documentation

```bash
# Command help
wfuwp --help
wfuwp migrate --help
wfuwp config set --help

# View documentation
open https://github.com/wfu/wfu-wp-cli/docs
```

### Support Channels

1. **GitHub Issues**: Report bugs and feature requests
2. **Wiki**: Community documentation and tips
3. **Slack**: #wordpress-cli channel
4. **Email**: it-wordpress@wfu.edu

### Diagnostic Information

When reporting issues, include:

```bash
# Version information
wfuwp --version
node --version
docker --version
aws --version

# Configuration (sanitized)
wfuwp config export --no-passwords

# Recent logs
tail -n 100 ~/.wfuwp/logs/wfuwp.log

# System information
uname -a
df -h
free -m
```

## Emergency Procedures

### Rollback Failed Migration

```bash
# 1. Find backup
ls -la ~/.wfuwp/backups/*/target-site-43-backup.sql

# 2. Restore backup
mysql -h target-db.wfu.edu -u wordpress -p wordpress_target \
  < ~/.wfuwp/backups/[timestamp]/target-site-43-backup.sql

# 3. Verify restoration
mysql -h target-db.wfu.edu -u wordpress -p wordpress_target \
  -e "SELECT option_value FROM wp_43_options WHERE option_name = 'siteurl'"
```

### Reset Everything

```bash
# Backup current state
cp -r ~/.wfuwp ~/.wfuwp.backup

# Remove configuration
rm -rf ~/.wfuwp

# Reinstall
npm uninstall -g @wfu/wp-cli
npm install -g @wfu/wp-cli

# Reconfigure
wfuwp config wizard
```

### Contact Emergency Support

For critical production issues:

1. **On-call**: Page the on-call engineer
2. **Escalation**: Contact team lead
3. **Vendor support**: Open AWS support ticket if needed