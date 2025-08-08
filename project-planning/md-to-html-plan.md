# Markdown to WordPress Block HTML Converter - Implementation Plan

## Project Overview

This document outlines the implementation plan for adding a new `md2wpblock` command to the WFU WordPress CLI tool. The command converts Markdown files to WordPress block editor HTML format, supporting both single file and directory processing modes.

## Requirements

### Functional Requirements
1. **Single File Mode**: Convert a single `.md` or `.markdown` file to WordPress block HTML
2. **Directory Mode**: Process all Markdown files in a directory
3. **Output**: Generate `.html` files in the same directory as source files
4. **WordPress Compatibility**: Output must be compatible with WordPress block editor
5. **Markdown Support**: Support standard Markdown syntax (headings, paragraphs, lists, code, links, etc.)

### Non-Functional Requirements
- Follow existing CLI patterns and conventions
- Provide comprehensive error handling
- Include dry-run and verbose modes
- Maintain good test coverage
- Use TypeScript for type safety

## Technical Architecture

### Dependencies
- **marked**: Markdown parsing library
- **@types/marked**: TypeScript definitions for marked

### Core Components

#### 1. Conversion Engine (`src/utils/markdown-to-wp-blocks.ts`)
- **Purpose**: Core logic for converting Markdown AST to WordPress blocks
- **Key Features**:
  - Parse Markdown using `marked` library
  - Map Markdown elements to WordPress block format
  - Handle inline elements (bold, italic, code, links)
  - Support HTML escaping option

#### 2. Command Implementation (`src/commands/md2wpblock.ts`)
- **Purpose**: CLI command interface and file processing logic
- **Key Features**:
  - Single file and directory processing
  - Command-line options (dry-run, verbose, custom output)
  - Error handling and user feedback
  - File validation and path resolution

#### 3. CLI Integration (`src/index.ts`)
- **Purpose**: Register command with main CLI program
- **Changes**: Add import and command registration

## WordPress Block Mapping

### Block Format Structure
WordPress blocks use HTML comments to define block boundaries:
```html
<!-- wp:block-type {"attributes":"value"} -->
<html-content>
<!-- /wp:block-type -->
```

### Markdown to Block Mapping

| Markdown Element | WordPress Block | Implementation |
|------------------|-----------------|----------------|
| `# Heading` | `wp:heading` | `<h1 class="wp-block-heading">` |
| `## Heading` | `wp:heading {"level":2}` | `<h2 class="wp-block-heading">` |
| Paragraph | `wp:paragraph` | `<p>content</p>` |
| `- List item` | `wp:list` + `wp:list-item` | `<ul class="wp-block-list"><li>` |
| ``` code ``` | `wp:code` | `<pre class="wp-block-code"><code>` |
| `> Quote` | `wp:quote` | `<blockquote class="wp-block-quote">` |
| `---` | `wp:separator` | `<hr class="wp-block-separator">` |
| HTML | `wp:html` | Raw HTML content |

### Inline Elements
- **Bold**: `**text**` → `<strong>text</strong>`
- **Italic**: `*text*` → `<em>text</em>`
- **Code**: `` `code` `` → `<code>code</code>`
- **Links**: `[text](url)` → `<a href="url">text</a>`
- **Images**: `![alt](src)` → `<img src="src" alt="alt">`

## Command Interface

### Usage Syntax
```bash
wfuwp md2wpblock <path> [options]
```

### Arguments
- `<path>`: Path to Markdown file or directory

### Options
- `-o, --output <filename>`: Custom output filename (single file mode only)
- `--dry-run`: Preview operations without creating files
- `-v, --verbose`: Show detailed output
- `--escape-html`: Escape HTML entities in output

### Usage Examples
```bash
# Convert single file
wfuwp md2wpblock document.md

# Convert all MD files in directory  
wfuwp md2wpblock wp-docs/

# Custom output name
wfuwp md2wpblock file.md -o custom.html

# Preview mode
wfuwp md2wpblock directory/ --dry-run

# Verbose output
wfuwp md2wpblock file.md --verbose

# Escape HTML entities
wfuwp md2wpblock file.md --escape-html
```

## Implementation Details

### File Processing Logic

#### Single File Mode
1. Validate input file exists and is Markdown
2. Determine output path (custom or default)
3. Read Markdown content
4. Convert to WordPress blocks
5. Write HTML output
6. Provide user feedback

#### Directory Mode
1. Validate directory exists
2. Scan for `.md` and `.markdown` files
3. Process each file individually
4. Report success/failure counts
5. Handle partial failures gracefully

### Error Handling
- File not found errors
- Invalid file type errors
- Permission errors
- Conversion errors
- Partial directory processing failures

### Output Formatting
- Clean, readable WordPress block HTML
- Proper indentation and spacing
- Valid HTML structure
- WordPress-compatible attributes

## Testing Strategy

### Unit Tests (`tests/utils/markdown-to-wp-blocks.test.ts`)
- Test each Markdown element conversion
- Test inline element handling
- Test complex document structures
- Test configuration options
- Test edge cases and error conditions

### Integration Tests (`tests/commands/md2wpblock.test.ts`)
- Test CLI command execution
- Test file and directory processing
- Test command-line options
- Test error scenarios
- Test output file generation

### Test Fixtures (`tests/fixtures/`)
- Sample Markdown files for testing
- Expected HTML output files
- Edge case test files

## File Structure

```
src/
├── commands/
│   └── md2wpblock.ts          # CLI command implementation
├── utils/
│   └── markdown-to-wp-blocks.ts  # Core conversion engine
└── index.ts                   # Updated with new command

tests/
├── commands/
│   └── md2wpblock.test.ts     # Command integration tests
├── utils/
│   └── markdown-to-wp-blocks.test.ts  # Engine unit tests
└── fixtures/
    ├── sample.md              # Test input file
    └── test-temp/             # Temp directory for tests

project-planning/
└── md-to-html-plan.md         # This document
```

## Development Workflow

### Implementation Steps
1. ✅ Add dependencies (`marked`, `@types/marked`)
2. ✅ Create conversion engine utility
3. ✅ Create command implementation
4. ✅ Register command in main CLI
5. ✅ Create comprehensive unit tests
6. ✅ Create integration tests
7. ✅ Create planning documentation

### Testing & Validation
1. Run unit tests: `npm test utils/markdown-to-wp-blocks`
2. Run integration tests: `npm test commands/md2wpblock`
3. Build project: `npm run build`
4. Manual testing with sample files
5. Test with actual WordPress import

### Documentation Updates
- Update main CLI help text
- Add command to README
- Update documentation if needed

## Future Enhancements

### Potential Features
1. **Custom Block Support**: Support for custom WordPress blocks
2. **Metadata Extraction**: Extract frontmatter for WordPress metadata
3. **Image Processing**: Automatic image optimization and upload
4. **Batch Processing**: Process multiple directories
5. **Template Support**: Custom WordPress block templates
6. **Preview Mode**: HTML preview before conversion
7. **Validation**: Validate WordPress block HTML output

### WordPress Integration
1. **Direct Import**: Direct import to WordPress via API
2. **Post Creation**: Create WordPress posts from Markdown
3. **Media Handling**: Upload and link media files
4. **Category/Tag Support**: Support for WordPress taxonomies

## Success Criteria

### Functional Success
- [x] Successfully convert standard Markdown elements
- [x] Generate valid WordPress block HTML
- [x] Process single files and directories
- [x] Provide appropriate user feedback
- [x] Handle errors gracefully

### Technical Success
- [x] Follow existing code patterns
- [x] Maintain type safety with TypeScript
- [x] Achieve good test coverage
- [x] Integrate cleanly with existing CLI
- [x] Follow WordPress block standards

### User Experience Success
- [x] Intuitive command interface
- [x] Clear help documentation
- [x] Helpful error messages
- [x] Progress feedback for directory operations
- [x] Consistent with other CLI commands

## Conclusion

The `md2wpblock` command successfully extends the WFU WordPress CLI tool with markdown-to-HTML conversion capabilities. The implementation follows established patterns, provides comprehensive functionality, and maintains high code quality through testing and documentation.

The modular architecture allows for future enhancements while the current implementation meets all specified requirements for converting Markdown files to WordPress block editor HTML format.