# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js CLI tool (`wfuwp`) for WFU WordPress management tasks: S3 synchronization, EC2 management, DNS spoofing for local development, ClickUp utilities, local DDEV environment management, and several WordPress maintenance helpers.

**Database migration has been removed from this tool as of v0.26.0** and lives in its own dedicated CLI, `wfu-migrate` (`npm install -g wfu-migrate`). Any `migrate`, `env-migrate`, or `migration-cleanup` references that survive in older docs are stale — see the v0.26.0 CHANGELOG entry.

## Documentation Maintenance

This repository maintains audience-specific documentation in the `documentation/` directory:

- `DEVELOPER_GUIDE.md` — Technical reference for developers
- `ADMIN_GUIDE.md` — Usage guide for WordPress admins / operational users
- `USER_GUIDE.md` — Feature guide for frontend visitors

In addition, in-tree user-facing help lives under `wp-docs/` and is surfaced via `wfuwp docs`.

**PR Requirement:** Every pull request that changes functionality, adds features, fixes bugs, or modifies configuration must include corresponding updates to the relevant documentation files. Reviewers should verify documentation accuracy as part of the PR review process.

## Development Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run with ts-node for development testing
npm run test         # Run Jest test suite
npm run lint         # Run ESLint on source files
npm run format       # Format code with Prettier
npm run release      # Execute release script (scripts/release.sh)
```

## Architecture

- **Entry point**: `src/index.ts` — sets up the Commander.js program and registers every subcommand. Each subcommand exports a `Command` instance from its own file in `src/commands/`.
- **Commands** (`src/commands/`):
  - `syncs3.ts` — Sync WordPress sites between S3 environment buckets
  - `listips.ts` — List EC2 instance IPs for an environment
  - `sshaws.ts` — SSH into EC2 instances
  - `removehostkey.ts` — Remove SSH known-host entries for EC2 instances
  - `spoof.ts` / `unspoof.ts` — Add/remove `/etc/hosts` entries for WFU subdomains
  - `config.ts` — Multi-environment configuration with wizard, encryption, and verification
  - `db.ts` — Database connection utilities (`test`, `list`)
  - `download-local.ts` — Download DB exports from S3 for local import
  - `delete-site.ts` — Delete a WordPress site and all its tables from an environment
  - `clean-lower-envs.ts` — Clean up orphaned sites and tables in dev/uat/pprd
  - `md2wpblock.ts` — Convert Markdown into WordPress block-editor HTML
  - `restore.ts` — Restore-related workflows
  - `clickup.ts` — ClickUp utilities (workspace-wide task filtering, threaded comments, etc.)
  - `local.ts` — Local DDEV environment management (domains, setup)
  - `cleanup.ts` — Clean up orphaned temporary directories
  - `release.ts` — Release/branch cleanup utilities
  - `doctor.ts` — System-prerequisite and tool-health checks
  - `docs.ts` — Browse/search the in-tree `wp-docs/` documentation
  - `install-deps.ts` — Install required system dependencies (Docker, MySQL client)
- **Utilities** (`src/utils/`):
  - `config.ts` — Multi-environment configuration with AES encryption
  - `database.ts` — WordPress database operations via WP-CLI (used by the remaining DB-touching helpers, not migration)
  - `s3.ts` — S3 archival and backup helpers
  - `s3sync.ts` — WordPress file synchronization between S3 buckets
  - `first-run.ts` — First-run detection and configuration hint

## Key Patterns

- **Multi-environment config**: `Config.getEnvironmentConfig(env)` for any of `dev` / `uat` / `pprd` / `prod` / `local`.
- **AWS CLI shell-out**: AWS work is done by shelling out to the user's installed `aws` binary rather than the AWS SDK. The user must have AWS credentials configured for the WFU account.
- **WordPress multisite awareness**: helpers that still touch the DB distinguish main site (ID 1, `wp_posts`, `wp_options`) from subsites (e.g. `wp_43_posts`, `wp_43_options`) and network tables (`wp_users`, `wp_blogs`, etc.).
- **WP-CLI integration**: when WP-CLI is needed it runs inside a `wordpress:cli` Docker container.
- **First-run experience**: on first invocation, `checkFirstRun()` surfaces a hint pointing the user at `wfuwp doctor` and `wfuwp config wizard`.

## Configuration Setup

```bash
# Interactive wizard (recommended)
wfuwp config wizard

# Manual configuration
wfuwp config set env.prod.host prod-db.wfu.edu

# S3 backups (optional)
wfuwp config set s3.bucket wfu-wp-backups

# Local backups (alternative to S3)
wfuwp config set backup.localPath /path/to/backups

# Verification
wfuwp config verify
```

Encrypted config lives in `~/.wfuwp/config.json` (AES-256-CBC).

## Database Migration

DB migration has moved to a separate CLI. Do not add `migrate`, `env-migrate`, or `migration-cleanup` commands here; route users to `wfu-migrate` instead:

```bash
npm install -g wfu-migrate
wfu-migrate config wizard
wfu-migrate migrate 43 --from prod --to pprd
```

The `wfuwp help` action and the `--help` text already point users at `wfu-migrate` for this; keep those pointers accurate when commands change.

## Testing

- Tests live in `tests/` with corresponding `.test.ts` files for each command.
- Uses Jest as the test framework.
- Run a single test: `npm test -- --testNamePattern="test name"`.
- Some integration tests require a test WordPress multisite setup.

## External Dependencies

- **AWS CLI**: required for S3 operations, EC2 management, and any other AWS work.
- **Docker**: required for WP-CLI operations in commands that still need them.
- Commander.js for the CLI framework.
- Chalk for colored terminal output.
- Native `crypto` for password encryption.

## WordPress Multisite Specifics

- **Main site (ID 1)**: tables like `wp_posts`, `wp_options`.
- **Subsites (ID > 1)**: tables like `wp_43_posts`, `wp_43_options`.
- **Network tables**: shared tables like `wp_users`, `wp_blogs`.
- **Table detection**: automatic identification of site-specific vs network tables in any helper that walks the schema.

## When updating this file

This `CLAUDE.md` is the source of truth for how the codebase actually behaves today. If a command is removed, the entry above should be removed. If a major feature is added, this file should learn about it in the same PR.

Stale entries that previously misled readers (notably the Phase 1 / Phase 2 migration system that was removed in v0.26.0) are exactly the kind of drift that downstream tooling, including the WFU documentation wiki at `s3://wfu-umc-wp-team-internal-docs/`, depends on us correcting.
