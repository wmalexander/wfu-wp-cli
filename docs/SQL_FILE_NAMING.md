# SQL File Naming Convention

## Format
`{siteName}-{siteId}-{environment}-{purpose}-{date}.sql`

## Examples
- `magazine-43-pprd-initial-export-08-08-2025.sql`
- `magazine-43-dev-backup-export-08-08-2025.sql` 
- `law-school-25-prod-migrated-export-08-08-2025.sql`

## Components

### Site Name
- Automatically extracted from WordPress `wp_blogs` table
- Domain-based: `magazine.wfu.edu` → `magazine`
- Path-based: `wfu.edu/law/` → `wfu-law`
- Sanitized: lowercase, no special chars, dashes for separators
- Fallback: `site{ID}` if database lookup fails

### Site ID
- Numeric WordPress multisite blog ID
- Used as secondary identifier

### Environment  
- `dev`, `uat`, `pprd`, `prod`
- Source environment for exports
- Target environment for migrated files

### Purpose
- `initial-export`: Original source data
- `backup-export`: Target environment backup before migration
- `migrated-export`: Processed data ready for import
- `rename-export`: Search-replace transformed data

### Date
- Format: `MM-DD-YYYY`
- Based on export timestamp
- Helps identify file age and sequence

## Implementation

The naming convention is implemented in `src/utils/file-naming.ts` with:

- `generateSqlFilename()`: Creates standardized filenames
- `parseFilename()`: Parses existing filenames back to components  
- `getSiteName()`: Queries database for actual site names
- `generateFilePath()`: Full path generation for migrations

## Integration

Used throughout the migration system:
- Source exports: `{siteName}-{siteId}-{sourceEnv}-initial-export-{date}.sql`
- Target backups: `{siteName}-{siteId}-{targetEnv}-backup-export-{date}.sql`  
- Migrated exports: `{siteName}-{siteId}-{targetEnv}-migrated-export-{date}.sql`

Files are automatically named and stored in S3 or local backup directories with this standardized format.