# Phase 2 Development Prompt

## Context Setting Prompt for Phase 2 Implementation

Use this prompt when starting Phase 2 development to provide full context to the AI assistant:

---

I'm working on Phase 2 of the wfuwp CLI tool migration feature. Phase 1 (already completed) implemented the core migration logic that performs search-replace operations on a WordPress multisite database. Now I need to implement Phase 2, which adds the complete automated workflow.

## Current State (Phase 1 Completed)

The codebase is at `/Users/alexandw/localdev/wfu-wp-cli` on the `feature/migrate-command` branch.

Phase 1 delivered:
- `wfuwp config` command for database credential management (single database)
- `wfuwp migrate` command that performs search-replace operations
- Assumes tables are already in a `wp_migration` database
- Basic safety features (dry-run, confirmations, logging)

Current implementation files:
- `src/commands/migrate.ts` - Core migration logic
- `src/commands/config.ts` - Configuration management
- `src/utils/config.ts` - Config storage utilities
- Tests and documentation are complete for Phase 1

## Phase 2 Requirements

I need to implement a complete migration workflow that automates these steps:

1. Export specific site tables from source environment database
2. Import those tables into a temporary `wp_migration` database
3. Run search-replace operations (already implemented in Phase 1)
4. Backup existing tables from target environment
5. Export migrated tables from `wp_migration` database
6. Import migrated tables into target environment
7. Archive all SQL dumps to S3 for safekeeping
8. Clean up the migration database

The complete workflow should run with a single command:
```bash
wfuwp migrate 43 --from prod --to pprd --complete
```

## Technical Requirements

### Multi-Environment Configuration
Need to support configurations for all 4 environments (dev, uat, pprd, prod) plus the migration database:
```bash
wfuwp config env dev set host dev-db.wfu.edu
wfuwp config env prod set host prod-db.wfu.edu
wfuwp config migration set database wp_migration
wfuwp config s3 set bucket wfu-wp-backups
```

### WordPress Multisite Handling
- Main site (ID 1): tables like `wp_posts`, `wp_options`
- Other sites (e.g., ID 43): tables like `wp_43_posts`, `wp_43_options`
- Network tables (shared): `wp_users`, `wp_usermeta`, `wp_blogs`, etc.
- Must correctly identify and export only the site-specific tables

### WP-CLI Commands to Use
```bash
# Export specific site tables
wp db export --tables=$(wp db tables --all-tables-with-prefix='wp_43_' --format=csv) site43.sql

# Import SQL file
wp db import site43.sql --dbname=wp_migration

# These must work with remote database connections using --dbhost, --dbuser, --dbpass, --dbname
```

### S3 Integration
- Use AWS CLI to archive SQL dumps
- Path structure: `s3://bucket/migrations/YYYY-MM-DD-HHMMSS/site{id}-{from}-to-{to}/`
- Keep all three SQL files: source export, target backup, migrated export

### Safety Requirements
- Pre-flight checks (verify all connections, check migration DB is clean)
- Progress indicators for long operations
- Rollback capability if any step fails
- Never lose data - always backup before overwriting

## Implementation Priority

Start with these in order:
1. Enhance configuration system for multiple environments
2. Implement export/import functions with WP-CLI
3. Create workflow orchestration
4. Add S3 integration
5. Implement safety checks and rollback

## Key Files to Reference

- `PHASE_2_PLAN.md` - Detailed implementation plan
- `ENHANCED_MIGRATION_DESIGN.md` - Technical design details
- `MIGRATION_METHOD_COMPARISON.md` - Context on why we're moving from Docker

## Testing Approach

- Set up local MySQL databases for testing
- Use Docker containers for isolated database testing
- Test with real WordPress multisite table structures
- Verify each step independently before testing complete workflow

## Success Criteria

Phase 2 is complete when:
- Single command runs entire migration workflow
- No manual steps required
- All SQL files automatically archived to S3
- Rollback works if any step fails
- Works with real WFU WordPress multisite databases

## Current Branch State

We're on the `feature/migrate-command` branch with Phase 1 complete and working. Phase 2 will build on this foundation without breaking existing functionality. The `--simple` flag should preserve Phase 1 behavior for backward compatibility.

Please help me implement Phase 2 following the plan in `PHASE_2_PLAN.md`. Let's start by enhancing the configuration system to support multiple environments.

---

## Additional Context Commands

After providing the above prompt, you may want to add:

```
Please review the following files to understand the current implementation:
- src/commands/migrate.ts
- src/commands/config.ts  
- src/utils/config.ts
- PHASE_2_PLAN.md

Then let's start implementing Task 1.1: Multi-Environment Config Structure from the Phase 2 plan.
```

## Testing Environment Setup

You'll also want to provide details about your testing environment:

```
I have the following test environment available:
- Local MySQL running on port 3306
- Test WordPress multisite database with sites 1, 2, and 43
- AWS CLI configured with access to wfu-wp-backups S3 bucket
- WP-CLI version 2.9.0 installed locally

The test databases are:
- wp_dev (development environment copy)
- wp_uat (UAT environment copy)
- wp_migration (empty, for migration operations)
```

## Common Issues to Watch For

Mention these potential issues:

1. **WP-CLI Remote Operations**: Ensure all WP-CLI commands work with remote databases using --dbhost
2. **Password Escaping**: Database passwords with special characters need proper escaping
3. **Large Databases**: Some sites have GB+ databases, need progress indicators
4. **Table Detection**: Main site (ID 1) has different table naming than subsites
5. **Network Tables**: Don't export shared tables like wp_users when doing site-specific migrations

## Questions to Answer First

Before starting implementation, clarify:

1. Should we support partial migrations (specific tables only)?
2. How should we handle failed S3 uploads (retry logic)?
3. Should migration database be cleaned automatically or require explicit cleanup?
4. Do we need to support custom table prefixes besides 'wp_'?
5. Should we add a migration queue for multiple sites?

---

This prompt provides comprehensive context for starting Phase 2 development and ensures continuity from Phase 1.