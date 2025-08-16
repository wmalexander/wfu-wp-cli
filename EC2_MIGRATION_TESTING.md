# Running WFU-WP-CLI on EC2 for Performance Improvements

## Quick Setup on EC2

1. **SSH into your EC2 instance**:
   ```bash
   ssh ec2-user@your-ec2-instance
   ```

2. **Install Node.js** (if not already installed):
   ```bash
   # For Amazon Linux 2
   curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
   sudo yum install -y nodejs
   
   # Verify installation
   node --version
   npm --version
   ```

3. **Install the CLI tool**:
   ```bash
   sudo npm install -g wfuwp@latest
   ```

4. **Configure the tool**:
   ```bash
   # Interactive configuration wizard
   wfuwp config wizard
   
   # Or copy existing config from local machine
   scp ~/.wfuwp/config.json ec2-user@your-ec2:~/.wfuwp/
   ```

5. **Run migrations with improved performance**:
   ```bash
   # Single site migration
   wfuwp migrate 43 --from prod --to pprd
   
   # Full environment migration
   wfuwp env-migrate prod uat --parallel --sync-s3
   ```

## Performance Benefits

Running on EC2 provides significant performance improvements:

- **Database operations**: 10-50x faster (AWS internal network, ~1ms latency vs 50-200ms from local)
- **S3 operations**: 20-100x faster (GB/s speeds vs MB/s from local)
- **No data transfer costs**: Operations within same AWS region are free
- **Parallel processing**: Can use larger EC2 instance types for better concurrency

## Best Practices

1. **Choose the right EC2 instance**:
   - `t3.large` or `t3.xlarge` for most migrations
   - `c5n.xlarge` for network-intensive operations
   - `m5.2xlarge` for balanced compute/memory needs

2. **Place EC2 in the right location**:
   - Same VPC as your RDS databases for minimal latency
   - Same availability zone if possible
   - Use VPC endpoints for S3 to avoid internet routing

3. **Resource considerations**:
   - Check available resources before running: `top` or `htop`
   - Monitor disk space: `df -h` (migrations create temporary SQL files)
   - Run during low-usage periods if EC2 hosts other services
   - Use `nice -n 10 wfuwp ...` to lower priority if needed

## Creating an AMI for Future Use

Once you have the EC2 configured perfectly:

1. **Create an AMI**:
   - AWS Console → EC2 → Instances → Select instance
   - Actions → Image and templates → Create image
   - Name it something like "wfuwp-migration-tool-v0.9.3"

2. **Launch new instances from AMI**:
   - Now you can launch pre-configured instances in seconds
   - Everything will be ready to run migrations immediately

## Troubleshooting

- **Docker not found**: The EC2 needs Docker for WP-CLI operations
  ```bash
  sudo yum install -y docker
  sudo service docker start
  sudo usermod -a -G docker ec2-user
  # Log out and back in for group changes to take effect
  ```

- **Permission denied**: Ensure proper IAM role attached to EC2 for S3/RDS access

- **Network timeouts**: Check security groups allow connection to RDS databases

## Example Migration Commands

```bash
# Test database connectivity
wfuwp db test --env prod

# List available sites
wfuwp db list --env prod

# Migrate with all options
wfuwp env-migrate prod uat \
  --include-sites "1,43,78" \
  --parallel \
  --sync-s3 \
  --verbose \
  --health-check

# Network tables only
wfuwp env-migrate prod uat --network-only

# Dry run to preview
wfuwp env-migrate prod uat --dry-run
```