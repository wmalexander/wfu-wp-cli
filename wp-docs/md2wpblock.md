# md2wpblock - Convert Markdown to WordPress Block HTML

Convert Markdown files to WordPress block editor HTML format for easy publishing. Supports both single files and batch processing of directories.

## Overview

The md2wpblock command converts Markdown files into WordPress block editor (Gutenberg) HTML format, making it easy to publish documentation and content to WordPress sites. The converted HTML is optimized for WordPress's block-based editor.

## Usage

```bash
wfuwp md2wpblock <path> [options]
```

## Parameters

- `<path>` - Path to Markdown file or directory containing Markdown files

## Examples

### Single File Conversion
```bash
# Convert a single Markdown file
wfuwp md2wpblock document.md

# Convert with custom output name
wfuwp md2wpblock README.md -o readme.html

# Convert with specific output directory
wfuwp md2wpblock guide.md -o wp-content/guide.html
```

### Directory Processing
```bash
# Convert all .md files in a directory
wfuwp md2wpblock wp-docs/

# Process subdirectories recursively
wfuwp md2wpblock documentation/ --recursive

# Convert with detailed progress
wfuwp md2wpblock docs/ --verbose
```

### Preview and Testing
```bash
# Preview changes without creating files (dry run)
wfuwp md2wpblock directory/ --dry-run

# Show detailed processing information
wfuwp md2wpblock file.md --verbose --dry-run
```

## Options

- `-o, --output <path>` - Custom output file or directory path
- `--dry-run` - Preview conversion without creating files
- `--verbose` - Show detailed progress and file information
- `--recursive` - Process subdirectories when converting directories

## Output Behavior

### Single File
- **Default**: Creates `.html` file in same directory as source
- **Custom output**: Uses specified output path
- **Example**: `document.md` → `document.html`

### Directory Processing
- **Default**: Creates `.html` files alongside `.md` files
- **Preserves structure**: Maintains directory hierarchy
- **Batch processing**: Converts all `.md` files found

## WordPress Block Format

### Generated HTML Structure
The tool converts Markdown to WordPress-compatible block HTML:

```html
<!-- wp:heading -->
<h2>Your Heading</h2>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Your paragraph content with <strong>formatting</strong>.</p>
<!-- /wp:paragraph -->

<!-- wp:list -->
<ul><li>List item 1</li><li>List item 2</li></ul>
<!-- /wp:list -->

<!-- wp:code -->
<pre class="wp-block-code"><code>code example</code></pre>
<!-- /wp:code -->
```

### Supported Markdown Elements

- **Headers** (H1-H6) → WordPress heading blocks
- **Paragraphs** → WordPress paragraph blocks  
- **Lists** (ordered/unordered) → WordPress list blocks
- **Code blocks** → WordPress code blocks
- **Inline code** → Inline code formatting
- **Bold/italic** → WordPress text formatting
- **Links** → Proper link formatting
- **Images** → WordPress image blocks
- **Blockquotes** → WordPress quote blocks

## File Management

### Output File Naming
```bash
# Single file
document.md → document.html

# Custom output
document.md -o custom.html → custom.html

# Directory processing  
docs/guide.md → docs/guide.html
docs/api.md → docs/api.html
```

### Directory Structure Preservation
```bash
# Input structure
wp-docs/
├── README.md
├── commands/
│   ├── migrate.md
│   └── config.md

# Output structure (after processing)
wp-docs/
├── README.md
├── README.html          # Generated
├── commands/
│   ├── migrate.md
│   ├── migrate.html     # Generated
│   ├── config.md
│   └── config.html      # Generated
```

## WordPress Integration

### Publishing Workflow
1. **Convert documentation**:
   ```bash
   wfuwp md2wpblock wp-docs/
   ```

2. **Copy HTML content**:
   - Open generated `.html` file
   - Copy the HTML content

3. **Paste into WordPress**:
   - Create new post/page in WordPress
   - Switch to "Code editor" view
   - Paste the HTML content
   - Switch back to "Visual editor" to see blocks

### Block Editor Compatibility
- Generated HTML is fully compatible with WordPress 5.0+ block editor
- Blocks appear properly formatted in the visual editor
- Can be edited using standard WordPress block controls
- Maintains formatting when switching between visual and code editors

## Common Use Cases

### Documentation Publishing
```bash
# Convert project documentation for WordPress
wfuwp md2wpblock docs/ --verbose

# Process README files
wfuwp md2wpblock README.md -o wp-readme.html
```

### Batch Content Creation
```bash
# Convert all markdown files in current directory
wfuwp md2wpblock . --recursive

# Preview before conversion
wfuwp md2wpblock articles/ --dry-run --verbose
```

### Automated Workflows
```bash
#!/bin/bash
# Update documentation workflow
echo "Converting documentation to WordPress format..."
wfuwp md2wpblock wp-docs/ --verbose

echo "Upload the following files to WordPress:"
find wp-docs/ -name "*.html" -type f
```

## Quality Assurance

### Dry Run Validation
```bash
# Check what will be converted
wfuwp md2wpblock docs/ --dry-run
```

### Output Verification
```bash
# Convert with detailed logging
wfuwp md2wpblock file.md --verbose

# Check generated file
cat file.html
```

## Error Handling

### File Access Issues
- **Permission errors**: Checks read/write permissions
- **Missing files**: Validates input file existence
- **Output path issues**: Creates necessary directories

### Conversion Issues  
- **Invalid Markdown**: Provides feedback on parsing problems
- **Large files**: Handles large documents efficiently
- **Character encoding**: Preserves UTF-8 encoding

## Advanced Features

### Recursive Processing
```bash
# Process entire directory tree
wfuwp md2wpblock content/ --recursive --verbose
```

### Custom Output Locations
```bash
# Organize output files
wfuwp md2wpblock source.md -o ../wordpress-content/formatted.html
```

### Automation Integration
```bash
# Git hook for automatic conversion
#!/bin/bash
if git diff --name-only | grep -q "\.md$"; then
    echo "Markdown files changed, converting..."
    wfuwp md2wpblock wp-docs/ --verbose
fi
```

## Troubleshooting

### No Output Generated
```bash
# Check input file exists
ls -la source.md

# Verify file has content
wc -l source.md

# Test with verbose output
wfuwp md2wpblock source.md --verbose
```

### WordPress Block Issues
- Ensure WordPress site is using block editor (Gutenberg)
- Check that custom blocks/plugins don't conflict
- Test with simple content first

### File Permission Problems
```bash
# Check directory permissions
ls -la wp-docs/

# Fix permissions if needed
chmod 755 wp-docs/
chmod 644 wp-docs/*.md
```

### Large File Processing
- Break large files into smaller sections
- Use `--verbose` to monitor progress
- Consider processing files individually for very large documents

For detailed help: `wfuwp md2wpblock --help`