# ClickUp Integration

The WFU WordPress CLI tool includes comprehensive ClickUp integration for managing tasks directly from the command line.

## Overview

The ClickUp integration allows you to:
- Create and manage ClickUp tasks
- View and filter tasks with advanced options
- Export task data in multiple formats
- Batch create tasks from files
- Navigate workspace hierarchies
- Search across your ClickUp workspaces

## Quick Start

### 1. Get Your API Token
1. Go to ClickUp Settings → Apps → API Token
2. Generate a new API token (starts with `pk_`)
3. Copy the token

### 2. Configure the CLI
```bash
# Set your API token (encrypted storage)
wfuwp clickup config set token pk_your_token_here

# Test the connection
wfuwp clickup test

# Get your user information
wfuwp clickup whoami

# List available workspaces
wfuwp clickup lists
```

### 3. Set Default List (Recommended)
```bash
# Find your list ID and set as default
wfuwp clickup config set defaultListId YOUR_LIST_ID

# Verify configuration
wfuwp clickup config show
```

### 4. Start Creating Tasks
```bash
# Create a simple task
wfuwp clickup create "Fix login bug"

# Create with details
wfuwp clickup create "Fix login bug" --priority high --assignee USER_ID --due 2024-12-31 --tags "bug,urgent"
```

## Available Commands

### Configuration Commands

#### `clickup config`
Manage ClickUp configuration settings.

```bash
# Set configuration values
wfuwp clickup config set token pk_your_token
wfuwp clickup config set defaultListId LIST_ID
wfuwp clickup config set defaultWorkspaceId WORKSPACE_ID

# Show current configuration
wfuwp clickup config show
```

#### `clickup test`
Test connectivity to the ClickUp API.

```bash
wfuwp clickup test
```

#### `clickup whoami`
Display current user information.

```bash
wfuwp clickup whoami
```

### Task Management Commands

#### `clickup create`
Create new ClickUp tasks with various options.

```bash
# Basic task creation
wfuwp clickup create "Task title"

# With full options
wfuwp clickup create "Task title" \
  --description "Detailed description" \
  --priority urgent|high|normal|low \
  --assignee USER_ID \
  --due YYYY-MM-DD \
  --tags "tag1,tag2,tag3" \
  --list LIST_ID

# Interactive mode (guided creation)
wfuwp clickup create --interactive

# Batch creation from file
wfuwp clickup create --from-file tasks.json
wfuwp clickup create --from-file tasks.txt
```

**Priority Options:**
- `urgent` (red, priority 1)
- `high` (yellow, priority 2) 
- `normal` (blue, priority 3)
- `low` (gray, priority 4)

#### `clickup task`
View detailed information about a specific task.

```bash
wfuwp clickup task TASK_ID
```

#### `clickup tasks`
List and filter tasks with comprehensive options.

```bash
# Basic task listing
wfuwp clickup tasks

# Filter options
wfuwp clickup tasks --status "to do,in progress"
wfuwp clickup tasks --assignee USER_ID
wfuwp clickup tasks --tag "urgent,bug"
wfuwp clickup tasks --priority high
wfuwp clickup tasks --due-before 2024-12-31
wfuwp clickup tasks --due-after 2024-01-01
wfuwp clickup tasks --created-after 2024-01-01
wfuwp clickup tasks --updated-before 2024-12-31

# Include closed/archived tasks
wfuwp clickup tasks --include-closed
wfuwp clickup tasks --include-archived

# Pagination
wfuwp clickup tasks --page 2

# Quick filters
wfuwp clickup tasks --my-tasks           # Tasks assigned to you
wfuwp clickup tasks --overdue            # Overdue tasks
wfuwp clickup tasks --due-today          # Tasks due today
wfuwp clickup tasks --due-this-week      # Tasks due this week
wfuwp clickup tasks --urgent             # Urgent priority tasks
wfuwp clickup tasks --high-priority      # Urgent + high priority tasks
wfuwp clickup tasks --recent             # Updated in last 7 days

# Export tasks
wfuwp clickup tasks --export csv
wfuwp clickup tasks --export json
wfuwp clickup tasks --export markdown
wfuwp clickup tasks --export csv --export-file my-tasks.csv
```

### Workspace Navigation Commands

#### `clickup lists`
Navigate and explore ClickUp workspace hierarchies.

```bash
# List all workspaces
wfuwp clickup lists

# Explore specific workspace
wfuwp clickup lists --workspace WORKSPACE_ID

# Show complete hierarchy
wfuwp clickup lists --workspace WORKSPACE_ID --all

# Browse specific space
wfuwp clickup lists --space SPACE_ID

# Browse specific folder
wfuwp clickup lists --folder FOLDER_ID
```

#### `clickup search`
Search tasks across your ClickUp workspace.

```bash
# Basic search
wfuwp clickup search "login bug"

# Search with pagination
wfuwp clickup search "bug" --page 2 --limit 50

# Export search results
wfuwp clickup search "urgent" --export csv
```

### Batch Operations

#### `clickup examples`
Generate example files for batch task creation.

```bash
# Generate both formats
wfuwp clickup examples

# Generate specific format
wfuwp clickup examples --format txt
wfuwp clickup examples --format json
```

## Batch Task Creation

### Plain Text Format
Create a file with one task per line, using `|` to separate options:

```
# Example: tasks.txt
Fix login bug | High priority | @john | Due: 2024-12-31 | Tags: bug,urgent
Update documentation | Normal priority | Desc: Update API docs
Refactor auth module | Low priority | @sarah | Tags: refactor,backend
Add dark mode toggle | Urgent priority | Due: 2024-12-25
```

**Supported options:**
- Priority: `Urgent priority`, `High priority`, `Normal priority`, `Low priority`
- Assignee: `@username` or `@userid`
- Due date: `Due: YYYY-MM-DD`
- Description: `Desc: Your description here`
- Tags: `Tags: tag1,tag2,tag3`

### JSON Format
Create a structured JSON file:

```json
{
  "tasks": [
    {
      "name": "Fix login bug",
      "description": "Users cannot log in on mobile devices",
      "priority": "high",
      "assignee": "john",
      "dueDate": "2024-12-31",
      "tags": ["bug", "urgent"]
    },
    {
      "name": "Update documentation",
      "description": "Update API documentation with new endpoints",
      "priority": "normal"
    }
  ]
}
```

## Export Formats

### CSV Export
Comma-separated values with headers, suitable for spreadsheets:
- All task metadata in columns
- Proper escaping for commas and quotes
- Time estimates and spent time in human-readable format

### JSON Export
Structured JSON with metadata:
```json
{
  "exportDate": "2024-08-11T02:30:00.000Z",
  "taskCount": 25,
  "tasks": [...]
}
```

### Markdown Export
Formatted markdown document:
- Hierarchical structure with headers
- All task details in readable format
- Clickable links to tasks
- Export metadata

## Configuration

### Encrypted Storage
- API tokens are encrypted using AES encryption
- Configuration stored in `~/.wfuwp/config.json`
- Never logs full API tokens (only first/last 4 characters)

### Configuration Options
```bash
# Required
clickup.token              # Your ClickUp API token (encrypted)

# Optional but recommended  
clickup.defaultListId      # Default list for task operations
clickup.defaultWorkspaceId # Default workspace for searches
```

## Error Handling

The integration includes comprehensive error handling:

### API Errors
- **401 Unauthorized**: Invalid API token
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Invalid task/list/workspace ID
- **429 Rate Limited**: Automatic retry with exponential backoff
- **5xx Server Errors**: Automatic retry with exponential backoff

### Input Validation
- Task titles (required, length limits)
- Dates (YYYY-MM-DD format validation)
- Priority values (urgent/high/normal/low)
- User IDs and list IDs
- Export formats (csv/json/markdown)

### Rate Limiting
- Automatic handling of ClickUp API rate limits
- Exponential backoff retry strategy
- Rate limit warnings when approaching limits
- Up to 3 retry attempts for transient errors

## Advanced Features

### Interactive Mode
Use `--interactive` for guided task creation with:
- Step-by-step prompts
- Input validation
- Default value suggestions
- Confirmation before creation

### Quick Filters
Shortcut options for common task queries:
- `--my-tasks`: Tasks assigned to you
- `--overdue`: Past due date
- `--due-today`: Due today
- `--due-this-week`: Due within 7 days
- `--urgent`: Urgent priority only
- `--high-priority`: Urgent and high priority
- `--recent`: Updated in last 7 days

### Workspace Navigation
Hierarchical browsing of ClickUp structure:
- Workspaces → Spaces → Folders → Lists
- Visual tree formatting with emojis
- Task counts and metadata display
- Support for folderless lists

## Integration with Existing CLI

The ClickUp integration follows the same patterns as other CLI commands:
- Consistent error handling and output formatting
- Integration with existing configuration system
- Follows project code conventions
- Compatible with existing logging and debugging

## API Documentation

For detailed ClickUp API information:
- [ClickUp API Documentation](https://developer.clickup.com/)
- [Authentication Guide](https://developer.clickup.com/docs/authentication)
- [API Reference](https://clickup.com/api/)

## Troubleshooting

### Common Issues

**"ClickUp API token not configured"**
```bash
wfuwp clickup config set token pk_your_token_here
```

**"No list ID provided and no default list configured"**
```bash
wfuwp clickup config set defaultListId YOUR_LIST_ID
```

**"Rate limited" errors**
- Wait for the specified time before retrying
- Consider reducing request frequency
- Check your ClickUp plan's rate limits

**Connection timeouts**
- Check internet connectivity
- Verify ClickUp service status
- Try again after a short wait

### Getting Help

```bash
# View available commands
wfuwp clickup --help

# Get help for specific commands
wfuwp clickup create --help
wfuwp clickup tasks --help

# Test your configuration
wfuwp clickup test
wfuwp clickup whoami
```