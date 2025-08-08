# WordPress Documentation Publisher CLI Tool Plan

## Overview
Add a new `publish` command to the existing `wfuwp` CLI that automatically publishes documentation files from `wp-docs/` to a WordPress site using the REST API.

## Current State Analysis
- 7 documentation files in `wp-docs/` (both `.md` and `.html` versions)
- Existing `md2wpblock` command converts Markdown to WordPress block HTML
- Robust configuration system that can be extended for WordPress API credentials
- Clean command pattern architecture suitable for new publish command

## WordPress API Capabilities
- WordPress REST API supports creating and updating posts/pages programmatically
- Application Passwords (built into WordPress Core since 5.6) provide secure authentication
- Full Gutenberg block editor support
- Complete control over post status, categories, tags, featured images, etc.

## Implementation Steps

### 1. Configuration Extension
Extend existing config system to include WordPress API settings:
- WordPress site URL
- Application Password credentials (username + app password)
- Default post/page settings (status, author, categories)
- File mapping preferences (which docs go to which posts/pages)

### 2. WordPress API Client Utility
Create `src/utils/wordpress-api.ts` with:
- REST API client with Application Password authentication
- Methods for creating/updating posts and pages
- Error handling and retry logic
- Support for Gutenberg block content

### 3. New Publish Command
Create `src/commands/publish.ts` with functionality to:
- Process all files in `wp-docs/` or specific files
- Convert Markdown to WordPress blocks (using existing `md2wpblock` utility)
- Create or update WordPress posts/pages via REST API
- Track published content with metadata file
- Support dry-run mode for testing

### 4. Features to Include
- **Batch publishing**: Process all documentation files at once
- **Individual file publishing**: Target specific files
- **Update detection**: Only publish changed files
- **Content mapping**: Map documentation files to specific WordPress posts/pages
- **Category/tag management**: Auto-assign categories based on file names
- **Draft/publish modes**: Option to publish as drafts first

## Configuration Setup Examples
```bash
# Add WordPress credentials
wfuwp config set wordpress.url https://your-site.com
wfuwp config set wordpress.username your-username
wfuwp config set wordpress.app_password your-app-password

# Configure publishing defaults
wfuwp config set wordpress.default_status publish
wfuwp config set wordpress.default_author 1
```

## Usage Examples
```bash
# Publish all documentation
wfuwp publish

# Publish specific file
wfuwp publish wp-docs/config.md

# Dry run to preview changes
wfuwp publish --dry-run

# Publish as drafts
wfuwp publish --status draft

# Update specific WordPress post
wfuwp publish wp-docs/migrate.md --post-id 123

# Publish to specific category
wfuwp publish --category "Documentation"
```

## Technical Architecture

### Configuration Schema Extension
```typescript
interface ConfigData {
  // ... existing config ...
  wordpress?: {
    url?: string;
    username?: string;
    appPassword?: string; // encrypted
    defaultStatus?: 'draft' | 'publish' | 'private';
    defaultAuthor?: number;
    defaultCategory?: string;
    mappings?: {
      [filename: string]: {
        postId?: number;
        postType?: 'post' | 'page';
        category?: string;
        tags?: string[];
      };
    };
  };
}
```

### WordPress API Client Interface
```typescript
interface WordPressApiClient {
  createPost(content: string, options: PostOptions): Promise<PostResponse>;
  updatePost(id: number, content: string, options: PostOptions): Promise<PostResponse>;
  getPost(id: number): Promise<PostResponse>;
  listPosts(filters?: PostFilters): Promise<PostResponse[]>;
}
```

## Dependencies
- **axios**: HTTP client for WordPress REST API requests
- **existing utilities**: Leverage current configuration and `md2wpblock` systems
- **authentication**: WordPress Application Passwords (no additional plugins required)

## Security Considerations
- Store WordPress credentials encrypted using existing config encryption
- Use HTTPS for all API requests
- Implement rate limiting to avoid overwhelming WordPress site
- Validate all user inputs before sending to API

## Error Handling
- Network connectivity issues
- WordPress authentication failures
- API rate limiting responses
- Content validation errors
- Partial failure recovery (continue with remaining files)

## Benefits
- **Automation**: Eliminates manual copy-paste documentation publishing
- **Consistency**: Ensures all documentation follows same format and structure
- **Version Control**: Track which documentation versions are published
- **Efficiency**: Batch process multiple files at once
- **Safety**: Dry-run mode prevents accidental publications
- **Integration**: Seamless integration with existing CLI workflow

## Future Enhancements
- **Webhook integration**: Trigger publishes on git commits
- **Template support**: Custom WordPress page templates
- **Media handling**: Automatic upload and linking of images
- **SEO optimization**: Meta descriptions, featured images, etc.
- **Multi-site support**: Publish to multiple WordPress sites
- **Scheduling**: Delayed publishing with cron-like functionality

## Testing Strategy
- Unit tests for WordPress API client
- Integration tests with test WordPress site
- Dry-run validation tests
- Configuration validation tests
- Error handling scenario tests

## Implementation Priority
1. **Phase 1**: Basic publish command with single file support
2. **Phase 2**: Batch processing and update detection
3. **Phase 3**: Advanced features (categories, tags, mappings)
4. **Phase 4**: Enhanced error handling and recovery
5. **Phase 5**: Future enhancements based on usage feedback

This plan provides a comprehensive roadmap for implementing WordPress documentation publishing functionality within the existing `wfuwp` CLI architecture.