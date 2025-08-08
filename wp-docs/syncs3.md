# syncs3 - S3 Asset Synchronization

Safely sync S3 assets (uploads, media files, etc.) for WordPress sites between different environments with validation and confirmation prompts.

## Overview

The syncs3 command synchronizes WordPress uploads and media files stored in S3 buckets between different environments. This is essential when migrating sites or testing with production-like content.

## Usage

```bash
wfuwp syncs3 <site-id> <source-env> <target-env> [options]
```

## Parameters

- `<site-id>` - WordPress multisite ID (e.g., 43 for site wp_43_*)
- `<source-env>` - Source environment (dev, uat, pprd, prod)
- `<target-env>` - Target environment (dev, uat, pprd, prod)

## Examples

### Basic Synchronization
```bash
# Sync site 43 from UAT to Pre-Production
wfuwp syncs3 43 uat pprd

# Sync site 12 from Production to Development
wfuwp syncs3 12 prod dev
```

### Preview and Validation
```bash
# Preview changes without making them (dry run)
wfuwp syncs3 43 uat pprd --dry-run

# Show detailed file-by-file output
wfuwp syncs3 43 uat pprd --verbose
```

### Automation-Friendly Options
```bash
# Skip confirmation prompts
wfuwp syncs3 43 uat pprd --force

# Combine options
wfuwp syncs3 43 prod pprd --dry-run --verbose
```

## Options

- `--dry-run` - Preview changes without executing them
- `--verbose` - Show detailed output including individual file operations
- `--force` - Skip confirmation prompts (use with caution)

## Safety Features

- **Input validation** - Validates environment names and site IDs
- **Confirmation prompts** - Asks before making changes (unless --force is used)
- **Dry run mode** - Preview operations with --dry-run before executing
- **AWS CLI verification** - Checks AWS configuration before attempting operations
- **S3 bucket validation** - Verifies source and target buckets exist and are accessible
- **File count reporting** - Shows number of files to be synchronized

## S3 Bucket Structure

The tool expects S3 buckets to follow WFU's standard structure:
```
bucket-name/
├── dev/
│   ├── wp-content/uploads/sites/43/
│   └── wp-content/uploads/sites/12/
├── uat/
│   ├── wp-content/uploads/sites/43/
│   └── wp-content/uploads/sites/12/
├── pprd/
│   └── wp-content/uploads/sites/43/
└── prod/
    └── wp-content/uploads/sites/43/
```

## WordPress Multisite Considerations

- **Main site (ID 1)**: Uses `wp-content/uploads/` path
- **Subsites (ID > 1)**: Uses `wp-content/uploads/sites/{ID}/` path
- **Automatic detection**: Tool automatically determines correct paths based on site ID
- **Environment isolation**: Each environment has separate S3 bucket prefixes

## Operation Details

The syncs3 command:
1. Validates source and target environments
2. Checks AWS CLI configuration and credentials
3. Verifies S3 bucket accessibility
4. Determines appropriate S3 paths based on site ID
5. Shows summary of files to be synchronized
6. Requests confirmation (unless --force is used)
7. Executes AWS S3 sync operation
8. Reports results and any errors

## AWS CLI Integration

This command uses the AWS CLI `s3 sync` operation with:
- `--delete` flag to remove files that don't exist in source
- Progress reporting for large operations
- Automatic retry on network errors
- Preservation of file metadata and permissions

## Common Use Cases

**Before database migration:**
```bash
# Preview file sync
wfuwp syncs3 43 prod pprd --dry-run

# Execute file sync
wfuwp syncs3 43 prod pprd
```

**Development environment refresh:**
```bash
# Get latest files from UAT
wfuwp syncs3 43 uat dev --verbose
```

**Testing with production data:**
```bash
# Copy production files to pre-production
wfuwp syncs3 43 prod pprd --force
```

## Prerequisites

- AWS CLI installed and configured with WFU credentials
- S3 bucket read/write permissions for source and target environments
- Valid environment names (dev, uat, pprd, prod)
- Existing WordPress multisite with specified site ID

## Troubleshooting

**AWS credential errors:**
- Verify AWS CLI configuration: `aws configure list`
- Check credential expiration and refresh if needed
- Ensure credentials have S3 permissions

**S3 bucket access errors:**
- Verify bucket names and regions are correct
- Check that buckets exist and are accessible
- Test manual access: `aws s3 ls s3://bucket-name/environment/`

**Permission denied errors:**
- Ensure AWS credentials have s3:GetObject and s3:PutObject permissions
- Check bucket policies allow access from your AWS user/role

**Large file operations:**
- Use --verbose to monitor progress on large synchronizations
- Network timeouts may require retrying the operation

**Environment validation errors:**
- Ensure source and target environments are different
- Verify environment names are exactly: dev, uat, pprd, or prod

For additional help: `wfuwp syncs3 --help`