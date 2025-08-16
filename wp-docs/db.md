# db - Database Connection Utilities

Test and verify database connections for all configured environments. This command helps troubleshoot connection issues and verify your configuration.

## Overview

The `db` command provides utilities to test database connections and list configured environments. It's particularly useful for:
- Verifying database credentials are correct
- Troubleshooting connection issues
- Checking which environments are configured
- Testing connections before running migrations

## Usage

```bash
wfuwp db <subcommand>
```

## Subcommands

### test - Test Database Connection

Test the connection to a specific environment's database.

```bash
wfuwp db test <environment>
```

**Arguments:**
- `environment` - The environment to test (dev, uat, pprd, prod, local)

**Examples:**

```bash
# Test production database connection
wfuwp db test prod

# Test local development database
wfuwp db test local

# Test UAT database
wfuwp db test uat
```

**What it does:**
1. Validates the environment name
2. Checks if the environment is configured
3. Shows connection details (with password masked)
4. Tests the actual database connection
5. Verifies database access with a simple query
6. Provides troubleshooting tips if connection fails

**Success output:**
```
Testing prod database connection...

Connection details:
  Host: prod-db.wfu.edu
  User: wp_prod
  Database: wp_production
  Password: ********

Testing connection...
✓ Database connection successful!
✓ Database access verified (245 tables found)
```

**Failure output with troubleshooting:**
```
Testing prod database connection...
✗ Database connection failed

Troubleshooting tips:
  1. Verify the host and port are correct
  2. Check if the database server is running
  3. Verify username and password
  4. Ensure the database exists
```

### list - List Database Environments

Display all configured database environments and their status.

```bash
wfuwp db list
```

**Examples:**

```bash
# List all database environments
wfuwp db list
```

**Output example:**
```
Configured Database Environments:
✓ dev
    dev-db.wfu.edu → wp_development
✓ uat
    uat-db.wfu.edu → wp_uat
✓ pprd
    pprd-db.wfu.edu → wp_preprod
✓ prod
    prod-db.wfu.edu → wp_production
- local (not configured)

Migration Database:
✓ migration
    migration-db.wfu.edu → wp_migration
```

## Common Use Cases

### Before Running a Migration

Always test connections before migrating:

```bash
# Test source and target databases
wfuwp db test prod
wfuwp db test pprd

# If both succeed, proceed with migration
wfuwp migrate 43 --from prod --to pprd
```

### After Configuration

Verify your setup after running the configuration wizard:

```bash
# Configure environments
wfuwp config wizard

# Verify all connections work
wfuwp db list
wfuwp db test dev
wfuwp db test uat
wfuwp db test pprd
wfuwp db test prod
```

### Troubleshooting Connection Issues

When a migration fails with connection errors:

```bash
# Test the specific environment
wfuwp db test uat

# If it fails, check configuration
wfuwp config show env.uat

# Fix the configuration
wfuwp config set env.uat.host correct-host.wfu.edu
wfuwp config set env.uat.password --prompt

# Test again
wfuwp db test uat
```

## Local Development (DDEV)

For local DDEV environments, the connection details are typically:

```bash
# Standard DDEV connection settings
Host: ddev-projectname-db
Port: 3306
User: db
Password: db
Database: db

# Test local DDEV connection
wfuwp db test local
```

If local connection fails:
1. Ensure DDEV is running: `ddev start`
2. Check DDEV status: `ddev describe`
3. Verify connection details: `ddev mysql -e "SELECT 1"`

## Troubleshooting

### Connection Refused

**Error:** `connect ECONNREFUSED`

**Solutions:**
- Verify the hostname is correct
- Check if you're on VPN (if required)
- Ensure the database server is running
- Check firewall rules

### Access Denied

**Error:** `Access denied for user`

**Solutions:**
- Verify username and password
- Check user permissions in database
- Update configuration: `wfuwp config set env.prod.password --prompt`

### Unknown Host

**Error:** `Unknown MySQL server host`

**Solutions:**
- Verify the hostname
- Check DNS resolution: `nslookup prod-db.wfu.edu`
- Try using IP address instead of hostname

### Socket Connection Failed

**Error:** `Can't connect to local MySQL server through socket`

**Solutions:**
- For local: Ensure MySQL/MariaDB is running
- For DDEV: Run `ddev start`
- Check if using correct host (not 'localhost' for Docker)

## See Also

- [config](./config.md) - Configure database connections
- [migrate](./migrate.md) - Migrate databases between environments
- [env-migrate](./env-migrate.md) - Migrate entire environments