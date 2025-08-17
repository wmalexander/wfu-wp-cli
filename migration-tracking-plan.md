# Comprehensive Migration Resume & Recovery Plan

Based on the migration failure analysis, this document outlines a robust solution addressing both the resume capability and the critical cleanup issue that caused cascading failures.

## Problem Analysis

### Issues Identified:
1. **Site 22**: Failed with "Out of memory" error (expected - huge site)
2. **Site 43**: Failed during migration (expected - large site) 
3. **Sites 68-555**: ALL failed with mysqldump export errors (systemic failure)

### Root Cause:
The current code has a critical flaw: when `env-migrate` calls `migrate` via execSync and it fails, the migration database is NOT cleaned up, causing subsequent sites to fail due to leftover tables from failed migrations.

## **CRITICAL FIX: Migration Database Cleanup**

The current code has a major flaw: when `env-migrate` calls `migrate` and it fails, the migration database is NOT cleaned up, causing cascading failures. Fix this by:

1. **Add explicit cleanup after each site failure** in `env-migrate`
2. **Ensure cleanup happens BEFORE the next site** starts
3. **Add a pre-migration check** to clean any leftover tables

## Complete Implementation Plan

### 1. **Migration State Persistence**

Create a `MigrationStateManager` class that maintains state in `~/.wfuwp/migrations/`:

```typescript
interface MigrationState {
  id: string;                    // e.g., "dev-to-uat-2025-08-17T02-52-55"
  sourceEnv: string;
  targetEnv: string;
  startTime: Date;
  lastUpdate: Date;
  status: 'running' | 'paused' | 'failed' | 'completed';
  completedSites: number[];
  failedSites: Array<{
    siteId: number;
    error: string;
    attemptCount: number;
    lastAttempt: Date;
  }>;
  skippedSites: number[];       // Large sites to defer
  networkTablesCompleted: boolean;
  totalSites: number;
  options: any;                  // Original command options
  consecutiveFailures: number;
  lastHealthCheck: Date;
}
```

### 2. **Enhanced `env-migrate` Options**

```bash
# Resume a previous migration
--resume <migration-id>          # Continue from where it left off
--resume-latest                  # Resume the most recent incomplete migration

# Site management
--skip-completed                 # Skip sites already migrated
--retry-failed                   # Retry previously failed sites
--large-sites "22,43"           # Mark sites as large (increases timeout)
--skip-large-sites              # Defer large sites to end
--exclude-failed                # Skip sites that previously failed

# Failure handling
--max-consecutive-failures <n>   # Stop after n consecutive failures (default: 5)
--pause-on-failure              # Pause for manual intervention on failure
--cleanup-on-failure            # Force migration DB cleanup after each failure

# Health monitoring
--health-check-interval <n>     # Check DB health every n sites
--connection-test-interval <n>  # Test connections every n sites

# Management
--list-migrations               # Show all previous migrations
--migration-status <id>         # Show detailed status of a migration
```

### 3. **Critical Database Cleanup Fix**

```typescript
// In migrateSingleSite function, wrap with cleanup:
async function migrateSingleSiteWithCleanup(
  siteId: number,
  sourceEnv: string,
  targetEnv: string,
  options: EnvMigrateOptions
): Promise<void> {
  try {
    await migrateSingleSite(siteId, sourceEnv, targetEnv, options);
  } catch (error) {
    // CRITICAL: Always clean migration database on failure
    console.log(chalk.yellow(`Cleaning migration database for site ${siteId}...`));
    try {
      await DatabaseOperations.cleanMigrationDatabase(siteId.toString());
      console.log(chalk.green(` Cleaned migration database for site ${siteId}`));
    } catch (cleanupError) {
      console.error(chalk.red(`Failed to clean migration database: ${cleanupError}`));
      // Force a full cleanup if site-specific cleanup fails
      try {
        await DatabaseOperations.cleanMigrationDatabase(); // Clean all tables
      } catch (fullCleanupError) {
        console.error(chalk.red(`Critical: Could not clean migration database`));
      }
    }
    throw error; // Re-throw after cleanup
  }
}
```

### 4. **Systemic Failure Detection**

```typescript
class SystemicFailureDetector {
  private consecutiveFailures = 0;
  private readonly maxConsecutive: number;
  
  async checkAndHandle(failed: boolean): Promise<'continue' | 'pause' | 'abort'> {
    if (failed) {
      this.consecutiveFailures++;
      
      if (this.consecutiveFailures >= this.maxConsecutive) {
        console.error(chalk.red(`\n   SYSTEMIC FAILURE DETECTED`));
        console.error(chalk.red(`${this.consecutiveFailures} consecutive sites failed`));
        
        // Check if it's a database connection issue
        const dbHealthy = await this.checkDatabaseHealth();
        if (!dbHealthy) {
          console.error(chalk.red(`Database appears to be down or overloaded`));
          return 'abort';
        }
        
        // Offer options
        const response = await prompt('Continue (c), Pause (p), or Abort (a)?');
        return response === 'c' ? 'continue' : response === 'p' ? 'pause' : 'abort';
      }
    } else {
      this.consecutiveFailures = 0; // Reset on success
    }
    return 'continue';
  }
}
```

### 5. **Large Site Handling**

```typescript
class LargeSiteHandler {
  private largeSites: Set<number>;
  
  isLargeSite(siteId: number): boolean {
    return this.largeSites.has(siteId);
  }
  
  getTimeoutForSite(siteId: number, defaultTimeout: number): number {
    // Triple timeout for large sites
    return this.isLargeSite(siteId) ? defaultTimeout * 3 : defaultTimeout;
  }
  
  // Split large sites into separate batch at end
  separateLargeSites(sites: number[]): {
    regular: number[],
    large: number[]
  } {
    return {
      regular: sites.filter(id => !this.isLargeSite(id)),
      large: sites.filter(id => this.isLargeSite(id))
    };
  }
}
```

### 6. **Resume Workflow**

```typescript
async function resumeMigration(migrationId: string): Promise<void> {
  const state = await MigrationStateManager.load(migrationId);
  
  console.log(chalk.blue(`Resuming migration ${migrationId}`));
  console.log(chalk.gray(`  Completed: ${state.completedSites.length} sites`));
  console.log(chalk.gray(`  Failed: ${state.failedSites.length} sites`));
  console.log(chalk.gray(`  Remaining: ${state.totalSites - state.completedSites.length} sites`));
  
  // Filter out completed sites
  const remainingSites = allSites.filter(id => !state.completedSites.includes(id));
  
  // Optionally retry failed sites
  if (options.retryFailed) {
    const failedIds = state.failedSites.map(f => f.siteId);
    remainingSites.unshift(...failedIds);
  }
  
  // Continue migration with remaining sites
  await migrateSites(remainingSites, state.sourceEnv, state.targetEnv, {
    ...state.options,
    migrationState: state
  });
}
```

### 7. **Migration State Files**

```
~/.wfuwp/
  migrations/
    index.json                    # List of all migrations
    dev-to-uat-2025-08-17T02-52-55/
      state.json                  # Current state
      completed.json              # Completed sites list
      failed.json                 # Failed sites with details
      options.json                # Original options
      logs/
        site-22.log              # Individual site logs
        site-43.log
```

### 8. **Usage Examples**

```bash
# Initial migration with large site handling
wfuwp env-migrate dev uat \
  --large-sites "22,43" \
  --skip-large-sites \
  --max-consecutive-failures 3 \
  --cleanup-on-failure

# Resume after failure (skip 46 completed sites)
wfuwp env-migrate --resume-latest

# Resume specific migration
wfuwp env-migrate --resume dev-to-uat-2025-08-17T02-52-55

# Retry only failed sites
wfuwp env-migrate --resume-latest --retry-failed --exclude-completed

# Handle large sites separately at the end
wfuwp env-migrate dev uat --large-sites "22,43" --defer-large-sites
```

### 9. **Implementation Priority**

1. **IMMEDIATE FIX**: Add migration database cleanup after each failure
2. **HIGH**: Implement state persistence and resume capability
3. **HIGH**: Add consecutive failure detection
4. **MEDIUM**: Implement large site handling
5. **LOW**: Add detailed logging and health checks

## Expected Benefits

This solution will:

- **Prevent cascading failures** by cleaning the migration database after each failure
- **Save time** by allowing you to resume from site 47 instead of re-migrating 46 sites
- **Handle large sites** specially with increased timeouts
- **Detect systemic issues** and stop/pause appropriately
- **Provide visibility** into migration progress and failures

## Files to Modify

1. `src/commands/env-migrate.ts` - Add state persistence and resume logic
2. `src/utils/migration-state-manager.ts` - New file for state management
3. `src/utils/database.ts` - Ensure cleanup methods are robust
4. `src/utils/systemic-failure-detector.ts` - New file for failure detection
5. `src/utils/large-site-handler.ts` - New file for large site handling

## Immediate Action Required

The most critical fix is to add explicit migration database cleanup after each site failure in the `env-migrate` command. This should be implemented immediately to prevent the cascading failure pattern that occurred from site 68 onwards.