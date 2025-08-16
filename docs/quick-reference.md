# Quick Reference / Cheat Sheet

## Essential Commands

### 🚀 Setup & Configuration
```bash
npm install -g wfuwp              # Install the tool
wfuwp install-deps                # Install Docker & MySQL client
wfuwp config wizard               # Interactive setup
wfuwp config verify               # Verify all connections
wfuwp db test prod                # Test specific database
wfuwp db list                     # List all environments
```

### 📦 Database Migration
```bash
# Basic migration
wfuwp migrate 43 --from prod --to pprd

# Migration with file sync
wfuwp migrate 43 --from prod --to pprd --sync-s3

# Dry run (preview only)
wfuwp migrate 43 --from prod --to pprd --dry-run

# Force without confirmation
wfuwp migrate 43 --from prod --to pprd --force
```

### 🌍 Environment Migration (Full)
```bash
# Complete environment migration
wfuwp env-migrate prod uat

# Specific sites only
wfuwp env-migrate prod pprd --include-sites "1,43,78"

# Network tables only
wfuwp env-migrate prod uat --network-only

# With S3 file sync
wfuwp env-migrate prod pprd --sync-s3
```

### 💾 Backup & Restore
```bash
# Restore from backup
wfuwp restore ./backup.sql --to uat

# Restore with timeout for large files
wfuwp restore ./backup.sql --to dev --timeout 60

# Preview restore
wfuwp restore ./backup.sql --to uat --dry-run
```

### ☁️ S3 Operations
```bash
# Sync files between environments
wfuwp syncs3 --from prod --to uat --site-id 43

# Dry run sync
wfuwp syncs3 --from prod --to uat --dry-run

# Full mirror with deletion
wfuwp syncs3 --from prod --to uat --delete
```

### 🖥️ EC2 Management
```bash
# List EC2 instances
wfuwp listips prod                # Private IPs
wfuwp listips prod --public       # Public IPs
wfuwp listips prod --json         # JSON output

# SSH into instances
wfuwp sshaws uat                  # First instance
wfuwp sshaws prod --all           # All instances
wfuwp sshaws dev --list           # List only

# Clean SSH keys
wfuwp removehostkey uat           # Remove old keys
```

### 🏠 Local Development
```bash
# Setup local environment
wfuwp local install               # Install dependencies
wfuwp local start 43              # Start site 43
wfuwp local stop 43               # Stop site 43
wfuwp local status                # Check status

# Domain management
sudo wfuwp local domain add 43    # Add local domain
sudo wfuwp local domain list      # List domains
sudo wfuwp local domain remove 43 # Remove domain

# Database refresh
wfuwp local refresh database      # Get latest from prod
```

### 🔗 DNS Spoofing
```bash
# Spoof DNS for testing
sudo wfuwp spoof mysite           # Add to /etc/hosts
sudo wfuwp spoof mysite --ip 10.0.1.50

# Remove spoofing
sudo wfuwp unspoof                # Remove all
sudo wfuwp unspoof mysite         # Remove specific
```

### 📝 Utilities
```bash
# Convert Markdown to WordPress
wfuwp md2wpblock ./docs/          # Convert directory
wfuwp md2wpblock ./README.md      # Convert single file

# ClickUp integration
wfuwp clickup tasks --my-tasks    # List your tasks
wfuwp clickup create "Fix bug"    # Create task
```

## Environment Names

| Environment | Description | Common Use |
|------------|-------------|------------|
| `dev` | Development | Feature development, testing |
| `uat` | User Acceptance Testing | QA testing, client review |
| `pprd` | Pre-production/Staging | Final testing before production |
| `prod` | Production | Live site (be careful!) |
| `local` | Local development | Your machine (DDEV/Docker) |

## Common Workflows

### 🔄 Production to Staging Refresh
```bash
# 1. Test connections
wfuwp db test prod
wfuwp db test pprd

# 2. Migrate database
wfuwp migrate 43 --from prod --to pprd --sync-s3

# 3. Verify
# Visit the pprd site in browser
```

### 🛠️ Local Development Setup
```bash
# 1. Configure
wfuwp config wizard

# 2. Setup local environment
wfuwp local install
sudo wfuwp local domain add 43

# 3. Get production data
wfuwp migrate 43 --from prod --to local --sync-s3

# 4. Start development
wfuwp local start 43
```

### 🚨 Emergency Rollback
```bash
# 1. Find backup
ls ~/.wfuwp/backups/

# 2. Restore backup
wfuwp restore ~/.wfuwp/backups/2024-01-15/pprd_site43_backup.sql --to pprd --force

# 3. Verify
wfuwp db test pprd
```

### 🔍 Troubleshooting Connections
```bash
# 1. List configurations
wfuwp db list

# 2. Test failing environment
wfuwp db test uat

# 3. Fix configuration
wfuwp config set env.uat.host correct-host.wfu.edu
wfuwp config set env.uat.password --prompt

# 4. Retest
wfuwp db test uat
```

## Flags Reference

### Universal Flags
- `--help` - Show help for any command
- `--version` - Show tool version
- `--verbose` / `-v` - Detailed output
- `--force` / `-f` - Skip confirmations
- `--dry-run` - Preview without changes

### Migration Flags
- `--from <env>` - Source environment
- `--to <env>` - Target environment
- `--sync-s3` - Include file sync
- `--skip-backup` - Don't backup target
- `--keep-files` - Keep SQL files
- `--timeout <min>` - Custom timeout

### Environment Migration Flags
- `--include-sites` - Specific site IDs
- `--exclude-sites` - Sites to skip
- `--active-only` - Only active sites
- `--network-only` - Network tables only
- `--sites-only` - Skip network tables
- `--parallel` - Parallel processing
- `--batch-size` - Sites per batch

## Safety Reminders

⚠️ **Always:**
- Use `--dry-run` first
- Test in dev/uat before pprd/prod
- Keep backups before major changes
- Verify after migrations

❌ **Never:**
- Skip pre-flight checks
- Ignore error messages
- Migrate to prod without testing
- Use `--force` in production carelessly

## Getting Help

```bash
wfuwp --help                      # General help
wfuwp <command> --help            # Command help
wfuwp config verify               # Check setup
wfuwp db test <env>               # Test connections
```

## File Locations

| Type | Default Location |
|------|-----------------|
| Configuration | `~/.wfuwp/config.json` |
| Local Backups | `~/.wfuwp/backups/` |
| Logs | `./logs/` or custom with `--log-dir` |
| S3 Backups | `s3://bucket/migrations/` |
| Temp Files | `/tmp/wfuwp/` or custom with `--work-dir` |