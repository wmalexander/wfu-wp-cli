# ClickUp API Integration Specification for CLI Tool

## Overview
Add ClickUp task creation functionality to the existing CLI tool, allowing users to create tasks directly from the command line without leaving their development workflow.

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

# Search/list tasks
<cli-tool> clickup tasks --list <list-id> [--status open]
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

### 8. Optional Enhancements

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
- API Reference: https://clickup.com/api/

## Success Criteria
- Users can create tasks with minimal friction
- Configuration persists between sessions
- Clear error messages guide users to resolution
- Common task creation workflows require minimal typing
- Integration feels native to the existing CLI tool