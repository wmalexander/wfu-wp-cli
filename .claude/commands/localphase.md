# Local Development Phase Management

## Instructions for Claude

When this command is invoked, follow this structured workflow to implement the next phase of Local Development Environment Management:

### 1. Review Current Status

First, check the current development status:
- Review GitHub issue #4 using `gh issue view 4 --comments` to understand which phases are complete
- Check current git branch with `git branch --show-current`
- Check for uncommitted changes with `git status`

### 2. Setup Feature Branch

Ensure you're on the correct branch:
- If not on `feature/local-development`, switch to it
- If branch doesn't exist, create it from main
- Pull latest changes from origin

### 3. Identify Next Phase

Based on the GitHub issue status, determine which phase to work on next:

**Phase 1: Core Infrastructure & Command Setup**
- Create `src/commands/local.ts` with base command structure
- Add `local` command to main CLI index (`src/index.ts`)
- Create foundational utilities for hosts management and DDEV operations
- Basic help text and command structure

**Phase 2: Domain Management (`local domain`)**
- Implement `local domain add/remove/list/reset` subcommands
- Create `src/utils/local-hosts-manager.ts` for local dev hosts management
- Separate section markers from existing spoof/unspoof functionality
- Domain validation, error handling, and comprehensive testing

**Phase 3: Environment Status & Detection (`local status`)**
- Create `src/utils/ddev-manager.ts` for DDEV operations
- Implement DDEV environment detection and validation
- Docker dependency checking and version validation
- Status reporting with health checks and diagnostics

**Phase 4: Installation & Setup (`local install`)**
- Create `src/utils/local-installer.ts` for dependency management
- Automated installation of Docker, DDEV, mkcert
- Repository cloning and initial setup workflow
- Database download and import from S3

**Phase 5: Environment Control (`local start/stop/restart`)**
- DDEV lifecycle management commands
- Service verification and health monitoring
- Integration with status checking from Phase 3
- Clear feedback and error recovery

**Phase 6: Content Management (`local refresh/reset`)**
- Database refresh from production S3 bucket
- Full environment reset with confirmation prompts
- Backup current state before major operations
- Build operations (composer update, cache clearing)

**Phase 7: Configuration & Polish (`local config`)**
- Extend existing Config system for local environment settings
- Interactive setup wizard for first-time users
- Advanced configuration options and validation
- Integration with existing configuration system

**Phase 8: Documentation & Testing**
- Create comprehensive `wp-docs/local.md` and `wp-docs/local.html`
- Complete test coverage in `tests/local.test.ts`
- Cross-platform compatibility testing
- Update main README.md with local command overview

### 4. Implement Phase Deliverables

For the identified phase:
1. Follow existing code patterns (no blank lines in functions, guard clauses, etc.)
2. Use TypeScript with proper type definitions
3. Add comprehensive error handling with clear messages
4. Follow the existing CLI command structure (Commander.js patterns)
5. Write tests for new functionality
6. Use existing utilities where possible (Config class, etc.)

### 5. Quality Assurance

Run all quality checks:
- `npm run build` - TypeScript compilation must pass
- `npm run lint` - Linting must pass
- `npm test` - All tests must pass
- Manual testing of new functionality

### 6. Commit Changes

Create a structured commit with this format:
```
feat(local): implement phase N - [Phase Name]

- [Specific deliverable 1]
- [Specific deliverable 2]
- [Specific deliverable 3]

Phase N of 8 complete for Local Development Environment Management.
Addresses: #4

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### 7. Update GitHub Issue

Post a comment on issue #4 with this format:
```markdown
## Phase N Complete ✅

**Completed Deliverables:**
- [x] Deliverable 1 - brief note
- [x] Deliverable 2 - brief note
- [x] Deliverable 3 - brief note

**Implementation Notes:**
- Any important discoveries or decisions
- Changes from original plan
- Known limitations or considerations

**Testing Status:**
- [x] Manual testing complete
- [x] Unit tests passing
- [x] Integration with existing features verified

**Next Phase:** Phase N+1 - [Next phase name]
**Branch Status:** All changes committed to `feature/local-development`
```

### 8. Verify Phase Completion

Ensure all these are true before considering the phase complete:
- [ ] All deliverables implemented according to specifications
- [ ] Code compiles without errors
- [ ] Linting passes without warnings
- [ ] Tests pass including new test coverage
- [ ] Changes committed to feature branch
- [ ] GitHub issue updated with completion status
- [ ] No existing functionality broken

## Important Notes

- Each phase must be FULLY complete before moving to the next
- Use the TodoWrite tool to track progress through each phase
- Follow the existing project patterns and conventions
- Build upon the existing codebase (spoof/unspoof, Config system, etc.)
- Ensure cross-platform compatibility (macOS, Linux, Windows/WSL)
- If blocked, document the issue in the GitHub issue comments
- Test all functionality manually before marking phase complete

## Integration with Existing Features

- **Hosts Management**: Build on existing spoof/unspoof with separate markers
- **Configuration**: Extend existing Config class for local settings
- **CLI Structure**: Follow Commander.js patterns from other commands
- **Error Handling**: Use consistent error patterns and chalk formatting
- **Testing**: Follow existing test patterns and Jest configuration

## Start Development

Begin by reviewing the current status and implementing the next incomplete phase!