# Visual Workflow Diagrams

## Migration Workflow

### Single Site Migration Process

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│              │     │              │     │              │
│  Source DB   │────▶│  Migration   │────▶│  Target DB   │
│   (prod)     │     │   Database   │     │   (pprd)     │
│              │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
       │                     │                     │
       │ 1. Export           │ 3. Transform       │ 5. Import
       ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  SQL Export  │────▶│ Search/      │────▶│ Transformed  │
│   site_43    │     │ Replace URLs │     │     SQL      │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            │ 4. Backup
                            ▼
                     ┌──────────────┐
                     │   S3/Local   │
                     │   Archive    │
                     └──────────────┘
```

### Complete Environment Migration

```
┌─────────────────────────────────────────────────────────┐
│                    SOURCE (prod)                         │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Site 1   │  │ Site 43  │  │ Site 78  │  ...        │
│  └──────────┘  └──────────┘  └──────────┘             │
│  ┌────────────────────────────────────────┐            │
│  │         Network Tables                 │            │
│  │  (wp_blogs, wp_site, wp_sitemeta)     │            │
│  └────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │      ENUMERATION & FILTERING      │
        │  • Discover all sites             │
        │  • Apply include/exclude filters │
        │  • Check active status            │
        └──────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │        BACKUP TARGET ENV          │
        │  • Complete environment backup    │
        │  • Validate backup integrity      │
        │  • Archive to S3 (optional)       │
        └──────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────┐
        │      BATCH PROCESSING             │
        │  ┌─────┐ ┌─────┐ ┌─────┐        │
        │  │Batch│ │Batch│ │Batch│        │
        │  │ 1-5 │ │ 6-10│ │11-15│  ...   │
        │  └─────┘ └─────┘ └─────┘        │
        │     Parallel execution optional   │
        └──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    TARGET (uat)                          │
├─────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Site 1   │  │ Site 43  │  │ Site 78  │  ...        │
│  └──────────┘  └──────────┘  └──────────┘             │
│  ┌────────────────────────────────────────┐            │
│  │      Migrated Network Tables           │            │
│  └────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
```

## Configuration Workflow

### Initial Setup Process

```
┌──────────────┐
│    START     │
└──────┬───────┘
        │
        ▼
┌──────────────┐     ┌──────────────┐
│   Install    │────▶│    Config    │
│    wfuwp     │     │    Wizard    │
└──────────────┘     └──────┬───────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐   ┌──────────────┐
│  Configure   │    │  Configure   │   │  Configure   │
│  Databases   │    │      S3      │   │    Local     │
│  (required)  │    │  (optional)  │   │  (optional)  │
└──────┬───────┘    └──────┬───────┘   └──────┬───────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
                    ┌──────────────┐
                    │   Verify     │
                    │ Connections  │
                    └──────┬───────┘
                            │
                            ▼
                    ┌──────────────┐
                    │    READY     │
                    └──────────────┘
```

## S3 Sync Workflow

### File Synchronization Between Environments

```
┌────────────────────┐              ┌────────────────────┐
│   Source S3        │              │   Target S3        │
│  (prod bucket)     │              │  (uat bucket)      │
├────────────────────┤              ├────────────────────┤
│ /wp-content/       │              │ /wp-content/       │
│   └── uploads/     │              │   └── uploads/     │
│       └── sites/   │              │       └── sites/   │
│           └── 43/  │──────────────▶       └── 43/     │
│               ├──2024/            │           ├──2024/ │
│               ├──2023/            │           ├──2023/ │
│               └──2022/            │           └──2022/ │
└────────────────────┘              └────────────────────┘
         │                                     │
         │      AWS CLI sync operation        │
         └─────────────────────────────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │  Progress:       │
              │  ▓▓▓▓▓▓▓▓▓░ 90% │
              │  Files: 1,234    │
              │  Size: 2.5 GB    │
              └──────────────────┘
```

## Database Connection Test Workflow

```
┌──────────────┐
│  wfuwp db    │
│  test prod   │
└──────┬───────┘
        │
        ▼
┌──────────────┐     Success      ┌──────────────┐
│   Load       │─────────────────▶│  Establish   │
│   Config     │                   │  Connection  │
└──────┬───────┘                   └──────┬───────┘
        │                                  │
        │ Missing                          ▼
        ▼                          ┌──────────────┐
┌──────────────┐                   │   Run Test   │
│    Error:    │                   │    Query     │
│  Not Config  │                   └──────┬───────┘
└──────────────┘                           │
                                          ▼
                            ┌──────────────────────┐
                            │       Success        │
                            │  ✓ Connection OK     │
                            │  ✓ 245 tables found  │
                            └──────────────────────┘
```

## Local Development Workflow

### Setting Up Local Environment

```
┌────────────────┐
│  Developer     │
│  Machine       │
└───────┬────────┘
        │
        ▼
┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│ Install Docker │───▶│  Install DDEV  │───▶│ Configure      │
│                │    │                │    │ wfuwp local    │
└────────────────┘    └────────────────┘    └───────┬────────┘
                                                      │
                                                      ▼
                                            ┌────────────────┐
                                            │  Add domains   │
                                            │  to /etc/hosts │
                                            └───────┬────────┘
                                                    │
        ┌───────────────────────────────────────────┼───────┐
        ▼                                           ▼       ▼
┌────────────────┐                        ┌────────────────┐
│ Download prod  │                        │  Start DDEV    │
│ database       │                        │  environment   │
└───────┬────────┘                        └────────────────┘
        │                                           │
        ▼                                           ▼
┌────────────────────────────────────────────────────────┐
│              Local Development Ready                    │
│  • Site accessible at: site43.wfu.local                │
│  • Database: local MySQL in DDEV                       │
│  • Files: Synced from S3 (optional)                   │
└────────────────────────────────────────────────────────┘
```

## Error Recovery Workflow

### Automatic Retry with Exponential Backoff

```
┌──────────────┐
│   Command    │
│  Execution   │
└──────┬───────┘
        │
        ▼
┌──────────────┐      Success     ┌──────────────┐
│   Attempt    │─────────────────▶│   Complete   │
│  Operation   │                   └──────────────┘
└──────┬───────┘
        │ Failure
        ▼
┌──────────────┐
│  Is Retry    │──── No ──────────▶ ┌──────────────┐
│  Possible?   │                     │    Error     │
└──────┬───────┘                     │   Reported   │
        │ Yes                        └──────────────┘
        ▼
┌──────────────┐
│   Wait:      │
│  Attempt 1: 1s   │
│  Attempt 2: 2s   │
│  Attempt 3: 4s   │
│  Attempt 4: 8s   │
└──────┬───────┘
        │
        └──────────┐
                   │
                   ▼
            ┌──────────────┐
            │    Retry     │
            │  Operation   │
            └──────────────┘
```

## Backup and Archive Workflow

### Automated Backup Strategy

```
┌─────────────────────────────────────────────┐
│            Migration Process                 │
└─────────────┬───────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│         Generate Backup Files                │
├─────────────────────────────────────────────┤
│  • source_export.sql                         │
│  • target_backup.sql                         │
│  • migration_result.sql                      │
│  • metadata.json                             │
└─────────────┬───────────────────────────────┘
              │
              ▼
        ┌─────────────┐
        │  S3 Config  │
        │  Available? │
        └──────┬──────┘
               │
     ┌─────────┴─────────┐
     │                   │
    Yes                 No
     │                   │
     ▼                   ▼
┌──────────┐      ┌──────────┐
│  Upload  │      │  Store   │
│  to S3   │      │  Local   │
├──────────┤      ├──────────┤
│ Bucket:  │      │ Path:    │
│ /backups │      │ ~/.wfuwp │
│ /2024-   │      │ /backups │
│  01-15/  │      │ /2024-   │
│  site43/ │      │  01-15/  │
└──────────┘      └──────────┘
     │                   │
     └─────────┬─────────┘
               │
               ▼
        ┌──────────┐
        │  Cleanup │
        │  Temp    │
        │  Files   │
        └──────────┘
```

## DNS Spoofing Workflow

```
┌──────────────┐
│ wfuwp spoof  │
│   mysite     │
└──────┬───────┘
        │
        ▼
┌──────────────┐
│ Check sudo   │
│ permissions  │
└──────┬───────┘
        │
        ▼
┌──────────────────────────────┐
│     Read /etc/hosts           │
└──────┬───────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│  Add spoofing entries:        │
│                               │
│  # === WFU DNS SPOOFING ===  │
│  127.0.0.1 mysite.wfu.edu    │
│  # === END WFU SPOOFING ===  │
└──────┬───────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│    Write /etc/hosts           │
└──────┬───────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│  ✓ DNS spoofing active        │
│  mysite.wfu.edu → 127.0.0.1  │
└──────────────────────────────┘
```