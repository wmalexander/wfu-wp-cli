# ClickUp API Integration Specification for CLI Tool

## Overview
Add ClickUp task management functionality to the existing CLI tool, allowing users to create, retrieve, and manage tasks directly from the command line without leaving their development workflow.

## Core Requirements

### 1. Authentication Setup
- Support for ClickUp Personal API Token authentication
- Token should be stored securely in environment variables or a config file
- Token format: starts with `pk_` prefix
- Authorization header format: `Authorization: {personal_token}`

### 2. Configuration Management
Create a configuration system to store:
- ClickUp API token (required)
- Default list ID (optional but recommended)
- Default workspace ID (optional)
- Default assignee IDs (optional)

Configuration storage options:
- Environment variables: `CLICKUP_API_TOKEN`, `CLICKUP_DEFAULT_LIST_ID`
- Config file: `.clickuprc` or similar in home directory or project root
- Allow per-project overrides via local config files

### 3. Command Structure
Add a new command group for ClickUp operations:

```bash
# Basic task creation
<cli-tool> clickup create "Task title" --list <list-id>

# With description
<cli-tool> clickup create "Task title" --description "Detailed description" --list <list-id>

# With additional options
<cli-tool> clickup create "Task title" \
  --description "Description" \
  --priority high \
  --assignee <user-id> \
  --due "2024-12-31" \
  --tags "bug,urgent"

# Using defaults from config
<cli-tool> clickup create "Quick task"

# Interactive mode
<cli-tool> clickup create --interactive
```

### 4. API Implementation Details

#### Base Configuration
- API Base URL: `https://api.clickup.com/api/v2`
- Content-Type: `application/json`
- Accept: `application/json`

#### Create Task Endpoint
- **Endpoint**: `POST /list/{list_id}/task`
- **Required**: `list_id` in URL path
- **Request Body Parameters**:
  ```json
  {
    "name": "string (required)",
    "description": "string",
    "markdown_description": "string (use instead of description for markdown)",
    "assignees": ["user_id"],
    "tags": ["string"],
    "status": "string",
    "priority": 1-4 or null,
    "due_date": unix timestamp in milliseconds,
    "due_date_time": boolean,
    "time_estimate": milliseconds,
    "start_date": unix timestamp in milliseconds,
    "start_date_time": boolean,
    "notify_all": boolean,
    "parent": "task_id for subtask",
    "custom_fields": [{"id": "field_id", "value": "value"}]
  }
  ```

#### Get Tasks Endpoint
- **Endpoint**: `GET /list/{list_id}/task`
- **Required**: `list_id` in URL path
- **Response Limit**: 100 tasks per page
- **Query Parameters**:
  - `include_closed=true` - Include completed/closed tasks
  - `archived=true` - Include archived tasks
  - `statuses[]=status_name` - Filter by specific status(es)
  - `assignees[]=user_id` - Filter by assignee(s)
  - `tags[]=tag_name` - Filter by tag(s)
  - `due_date_gt=unix_timestamp` - Due after date
  - `due_date_lt=unix_timestamp` - Due before date
  - `date_created_gt=unix_timestamp` - Created after date
  - `date_created_lt=unix_timestamp` - Created before date
  - `date_updated_gt=unix_timestamp` - Updated after date
  - `date_updated_lt=unix_timestamp` - Updated before date
  - `page=number` - Page number for pagination

#### Get Single Task Endpoint  
- **Endpoint**: `GET /task/{task_id}`
- **Required**: `task_id` in URL path
- **Returns**: Complete task details including comments, time tracking, custom fields

#### Response Data Structure
Task objects include:
- Basic info: `id`, `name`, `description`, `status`, `priority`
- Dates: `date_created`, `date_updated`, `due_date`, `start_date`
- Assignment: `assignees`, `watchers`, `creator`
- Organization: `tags`, `list`, `folder`, `space`
- Progress: `time_estimate`, `time_spent` (in milliseconds)
- Relationships: `parent`, `subtasks`, `dependencies`
- Custom fields and attachments

#### Priority Mapping
- 1 = Urgent (red)
- 2 = High (yellow)
- 3 = Normal (blue)
- 4 = Low (gray)

### 5. Additional Commands

```bash
# List available lists
<cli-tool> clickup lists --workspace <workspace-id>

# Get current user info (useful for getting user ID)
<cli-tool> clickup whoami

# Configure defaults
<cli-tool> clickup config set token <api-token>
<cli-tool> clickup config set default-list <list-id>
<cli-tool> clickup config show

# List tasks from a specific list
<cli-tool> clickup tasks --list <list-id>
<cli-tool> clickup tasks --list <list-id> --status open
<cli-tool> clickup tasks --list <list-id> --assignee <user-id>
<cli-tool> clickup tasks --list <list-id> --tag urgent
<cli-tool> clickup tasks --list <list-id> --due-before "2024-12-31"

# Get detailed task information
<cli-tool> clickup task <task-id>

# List tasks with various filters
<cli-tool> clickup tasks --list <list-id> --include-closed --priority high
<cli-tool> clickup tasks --list <list-id> --created-after "2024-01-01"
```

### 6. Error Handling
- Validate API token before making requests
- Handle rate limiting (check response headers)
- Provide clear error messages for:
  - Missing/invalid token
  - Invalid list ID
  - Network errors
  - API errors (with status codes)
  - Missing required parameters

### 7. User Experience Features

#### Interactive Mode
When `--interactive` flag is used:
1. Prompt for task title if not provided
2. Open editor for description (like git commit)
3. Show list of available lists if no default configured
4. Show priority options with visual indicators
5. Confirm before creating task

#### Success Feedback
After successful task creation, display:
- Task ID
- Direct link to task in ClickUp
- Confirmation message with task title

Example output:
```
✓ Task created successfully!
Title: "Fix login bug"
ID: abc123xyz
Link: https://app.clickup.com/t/abc123xyz
```

#### Batch Creation
Support creating multiple tasks from a file:
```bash
<cli-tool> clickup create --from-file tasks.txt
```

File format (one task per line or JSON/YAML):
```
Fix login bug | High priority | @john
Update documentation
Refactor auth module | Due: 2024-12-31
```

### 8. Task Display and Formatting

#### List View Output Format
When displaying task lists, show:
```
ID       | Title                    | Status    | Priority | Assignee     | Due Date
---------|--------------------------|-----------|----------|--------------|----------
abc123   | Fix login bug            | In Prog   | High     | @john        | Dec 25
def456   | Update documentation     | To Do     | Normal   | @sarah       | -
ghi789   | Refactor auth module     | Complete  | Low      | @mike        | Dec 20
```

#### Task Detail View
When showing individual task details:
```
Task: Fix login bug (abc123xyz)
Status: In Progress
Priority: High (2)
Assignee: John Doe (@john)
Created: Dec 15, 2024 10:30 AM
Updated: Dec 20, 2024 2:15 PM
Due: Dec 25, 2024
Time Estimate: 4h 30m
Time Spent: 2h 15m

Description:
Users cannot log in on mobile devices when using 2FA. 
Error occurs after entering verification code.

Tags: bug, mobile, urgent
Link: https://app.clickup.com/t/abc123xyz
```

#### Export Options
Support exporting task lists to different formats:
```bash
<cli-tool> clickup tasks --list <list-id> --export csv
<cli-tool> clickup tasks --list <list-id> --export json
<cli-tool> clickup tasks --list <list-id> --export markdown
```

### 9. Search and Filtering

#### Advanced Search
```bash
# Search across multiple criteria
<cli-tool> clickup search "login bug" --priority high --status "in progress"
<cli-tool> clickup search --assignee @me --due-today
<cli-tool> clickup search --tag urgent --created-this-week

# Saved searches
<cli-tool> clickup search --save "my-bugs" --assignee @me --tag bug
<cli-tool> clickup search --load "my-bugs"
```

#### Quick Filters
```bash
<cli-tool> clickup my-tasks  # Tasks assigned to me
<cli-tool> clickup overdue   # Overdue tasks I can see
<cli-tool> clickup today     # Tasks due today
<cli-tool> clickup this-week # Tasks due this week
```

### 10. Optional Enhancements

#### Templates
Support task templates for common task types:
```bash
<cli-tool> clickup create --template bug "Login fails on mobile"
```

#### Git Integration
Auto-populate task with git context:
```bash
<cli-tool> clickup create --from-git
# Creates task with current branch name, recent commits as description
```

#### Quick Actions
Shortcuts for common workflows:
```bash
<cli-tool> clickup bug "Title" # Creates with bug template
<cli-tool> clickup feature "Title" # Creates with feature template
```

#### Task Updates
Basic task management operations:
```bash
<cli-tool> clickup update <task-id> --status "in progress"
<cli-tool> clickup assign <task-id> --to @john
<cli-tool> clickup close <task-id>
<cli-tool> clickup comment <task-id> "Progress update here"
```

## Implementation Notes

1. **API Token Security**: Never log or display the full API token. Show only first/last few characters when confirming configuration.

2. **Rate Limiting**: ClickUp API has rate limits that vary by plan. Implement exponential backoff for retries.

3. **Validation**: Validate list_id exists before attempting to create task (optional but improves UX).

4. **Dependencies**: You'll likely need:
   - HTTP client library (axios, fetch, requests, etc.)
   - JSON parsing
   - Date/time handling for due dates
   - Secure credential storage

5. **Testing**: Include ability to use a test/sandbox list for development.

## Getting Started for Users

After implementation, users would:
1. Get their API token from ClickUp Settings → Apps → API Token
2. Run: `<cli-tool> clickup config set token pk_xxxxx`
3. Find their list ID from ClickUp URL or via `<cli-tool> clickup lists`
4. Run: `<cli-tool> clickup config set default-list <list-id>`
5. Start creating tasks: `<cli-tool> clickup create "My first CLI task"`

## API Documentation References
- Main docs: https://developer.clickup.com/
- Authentication: https://developer.clickup.com/docs/authentication
- Create task: https://developer.clickup.com/reference/createtask
- Get tasks: https://developer.clickup.com/reference/gettasks
- Get task: https://developer.clickup.com/reference/gettask
- API Reference: https://clickup.com/api/

## Success Criteria
- Users can create and retrieve tasks with minimal friction
- Configuration persists between sessions
- Clear error messages guide users to resolution
- Common task creation and viewing workflows require minimal typing
- Task lists display clearly with relevant information
- Filtering and search functionality works intuitively
- Integration feels native to the existing CLI tool
- Export functionality works for multiple formats
- Pagination handles large task lists gracefully