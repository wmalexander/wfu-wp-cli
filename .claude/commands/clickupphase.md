# ClickUp Phase Development

## Instructions for Claude

When this command is invoked, follow this structured workflow to implement the next phase of ClickUp integration:

### 1. Review Current Status

First, check the current development status:
- Review GitHub issue #3 using `gh issue view 3 --comments` to understand which phases are complete
- Check current git branch with `git branch --show-current`
- Check for uncommitted changes with `git status`

### 2. Setup Feature Branch

Ensure you're on the correct branch:
- If not on `feature/clickup-integration`, switch to it
- If branch doesn't exist, create it from main
- Pull latest changes from origin

### 3. Identify Next Phase

Based on the GitHub issue status, determine which phase to work on next:

**Phase 1: Core Infrastructure & Authentication**
- Create `src/commands/clickup.ts` with base command structure
- Extend `src/utils/config.ts` to support ClickUp API token storage (encrypted)
- Create `src/utils/clickup-client.ts` HTTP client with rate limiting
- Add basic error handling and API connectivity validation

**Phase 2: Basic Task Management**
- `clickup create` command with required parameters (title, list)
- `clickup task <id>` command for single task retrieval
- `clickup whoami` for user verification and getting user ID
- Basic success feedback with ClickUp task links

**Phase 3: Enhanced Task Features**
- Add optional parameters to `create` command (description, priority, assignee, due date, tags)
- Implement `--interactive` mode for guided task creation
- Enhanced success feedback with formatted output
- Input validation and error handling improvements

**Phase 4: Advanced Querying & Display**
- `clickup tasks` command with comprehensive filtering
- Paginated task listing with proper table formatting
- Detailed task view with all metadata
- Query parameter support (status, assignee, tags, date ranges)

**Phase 5: Workspace & List Management**
- `clickup lists` command for workspace/folder discovery
- Quick filter shortcuts for common queries
- Basic search functionality across tasks
- Workspace navigation and list browsing

**Phase 6: Export & Advanced Features**
- Export functionality (CSV, JSON, Markdown formats)
- Batch task creation from files
- Comprehensive error handling and validation
- Full test coverage for all commands

### 4. Implement Phase Deliverables

For the identified phase:
1. Review the specifications in `project-planning/clickup-api.md`
2. Review the development plan in `PHASE_DEVELOPMENT_PLAN.md`
3. Implement all deliverables for the phase
4. Follow existing code patterns (no blank lines in functions, guard clauses, etc.)
5. Add appropriate error handling
6. Write tests for new functionality

### 5. Quality Assurance

Run all quality checks:
- `npm run build` - TypeScript compilation must pass
- `npm run lint` - Linting must pass
- `npm test` - All tests must pass
- Manual testing of new functionality

### 6. Commit Changes

Create a structured commit with this format:
```
feat(clickup): implement phase N - [Phase Name]

- [Specific deliverable 1]
- [Specific deliverable 2]
- [Specific deliverable 3]

Phase N of 6 complete for ClickUp integration.
Addresses: #3

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 7. Update GitHub Issue

Post a comment on issue #3 with this format:
```markdown
## Phase N Complete ✅

**Completed Deliverables:**
- [x] Deliverable 1 - brief note
- [x] Deliverable 2 - brief note
- [x] Deliverable 3 - brief note

**Implementation Notes:**
- Any important discoveries or decisions
- Changes from original plan
- Known issues or limitations

**Testing Status:**
- [x] Manual testing complete
- [x] Unit tests passing
- [x] Integration with existing features verified

**Next Phase:** Phase N+1 - [Next phase name]
**Branch Status:** All changes committed to `feature/clickup-integration`
```

### 8. Verify Phase Completion

Ensure all these are true before considering the phase complete:
- [ ] All deliverables implemented
- [ ] Code compiles without errors
- [ ] Linting passes
- [ ] Tests pass
- [ ] Changes committed to feature branch
- [ ] GitHub issue updated with status
- [ ] No existing functionality broken

## Important Notes

- Each phase must be FULLY complete before moving to the next
- Use the TodoWrite tool to track progress through the phase
- Reference the ClickUp API documentation at https://developer.clickup.com/ as needed
- Never log full API tokens (only show first/last 4 characters)
- Follow the existing project patterns and conventions
- If blocked, document the issue in the GitHub issue before proceeding

## Start Development

Begin by reviewing the current status and implementing the next incomplete phase!