import { MarkdownToWpBlocks, convertMarkdownToWpBlocks } from '../../src/utils/markdown-to-wp-blocks';

describe('MarkdownToWpBlocks', () => {
  let converter: MarkdownToWpBlocks;

  beforeEach(() => {
    converter = new MarkdownToWpBlocks();
  });

  describe('headings', () => {
    it('should convert H1 heading', () => {
      const result = converter.convert('# Main Title');
      expect(result).toContain('<!-- wp:heading -->');
      expect(result).toContain('<h1 class="wp-block-heading">Main Title</h1>');
      expect(result).toContain('<!-- /wp:heading -->');
    });

    it('should convert H2 heading with level attribute', () => {
      const result = converter.convert('## Subtitle');
      expect(result).toContain('<!-- wp:heading {"level":2} -->');
      expect(result).toContain('<h2 class="wp-block-heading">Subtitle</h2>');
      expect(result).toContain('<!-- /wp:heading -->');
    });

    it('should convert H3 heading', () => {
      const result = converter.convert('### Section');
      expect(result).toContain('<!-- wp:heading {"level":3} -->');
      expect(result).toContain('<h3 class="wp-block-heading">Section</h3>');
    });
  });

  describe('paragraphs', () => {
    it('should convert simple paragraph', () => {
      const result = converter.convert('This is a simple paragraph.');
      expect(result).toContain('<!-- wp:paragraph -->');
      expect(result).toContain('<p>This is a simple paragraph.</p>');
      expect(result).toContain('<!-- /wp:paragraph -->');
    });

    it('should handle paragraphs with inline formatting', () => {
      const result = converter.convert('This has **bold** and *italic* text.');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
    });

    it('should handle paragraphs with inline code', () => {
      const result = converter.convert('Use `npm install` to install.');
      expect(result).toContain('<code>npm install</code>');
    });

    it('should handle paragraphs with links', () => {
      const result = converter.convert('Visit [example](https://example.com) for more.');
      expect(result).toContain('<a href="https://example.com">example</a>');
    });
  });

  describe('lists', () => {
    it('should convert unordered list', () => {
      const markdown = `- First item
- Second item
- Third item`;
      
      const result = converter.convert(markdown);
      expect(result).toContain('<!-- wp:list -->');
      expect(result).toContain('<ul class="wp-block-list">');
      expect(result).toContain('<!-- wp:list-item -->');
      expect(result).toContain('<li>First item</li>');
      expect(result).toContain('<li>Second item</li>');
      expect(result).toContain('<li>Third item</li>');
      expect(result).toContain('<!-- /wp:list-item -->');
      expect(result).toContain('</ul>');
      expect(result).toContain('<!-- /wp:list -->');
    });

    it('should handle list items with formatting', () => {
      const markdown = `- **Bold** item
- Item with \`code\`
- [Link](https://example.com) item`;
      
      const result = converter.convert(markdown);
      expect(result).toContain('<strong>Bold</strong>');
      expect(result).toContain('<code>code</code>');
      expect(result).toContain('<a href="https://example.com">Link</a>');
    });
  });

  describe('code blocks', () => {
    it('should convert fenced code block', () => {
      const markdown = '```bash\necho "hello world"\n```';
      const result = converter.convert(markdown);
      
      expect(result).toContain('<!-- wp:code -->');
      expect(result).toContain('<pre class="wp-block-code"><code>echo "hello world"</code></pre>');
      expect(result).toContain('<!-- /wp:code -->');
    });

    it('should convert indented code block', () => {
      const markdown = '    echo "indented code"';
      const result = converter.convert(markdown);
      
      expect(result).toContain('<!-- wp:code -->');
      expect(result).toContain('echo "indented code"');
    });
  });

  describe('blockquotes', () => {
    it('should convert blockquote', () => {
      const result = converter.convert('> This is a quote');
      expect(result).toContain('<!-- wp:quote -->');
      expect(result).toContain('<blockquote class="wp-block-quote">');
      expect(result).toContain('This is a quote');
      expect(result).toContain('</blockquote>');
      expect(result).toContain('<!-- /wp:quote -->');
    });
  });

  describe('horizontal rules', () => {
    it('should convert horizontal rule', () => {
      const result = converter.convert('---');
      expect(result).toContain('<!-- wp:separator -->');
      expect(result).toContain('<hr class="wp-block-separator has-alpha-channel-opacity"/>');
      expect(result).toContain('<!-- /wp:separator -->');
    });
  });

  describe('HTML escaping', () => {
    it('should not escape HTML by default', () => {
      const converter = new MarkdownToWpBlocks({ escapeHtml: false });
      const result = converter.convert('Text with <em>HTML</em> tags');
      expect(result).toContain('<em>HTML</em>');
    });

    it('should escape HTML when option is enabled', () => {
      const converter = new MarkdownToWpBlocks({ escapeHtml: true });
      const result = converter.convert('Text with <em>HTML</em> tags');
      expect(result).toContain('&lt;em&gt;HTML&lt;/em&gt;');
    });
  });

  describe('complex documents', () => {
    it('should handle document with multiple block types', () => {
      const markdown = `# Main Title

This is a paragraph with **bold** text.

## Section

- List item 1
- List item 2

\`\`\`javascript
console.log('code');
\`\`\`

> Quote text

---

Final paragraph.`;

      const result = converter.convert(markdown);
      
      // Should contain all block types
      expect(result).toContain('<!-- wp:heading -->');
      expect(result).toContain('<!-- wp:paragraph -->');
      expect(result).toContain('<!-- wp:list -->');
      expect(result).toContain('<!-- wp:code -->');
      expect(result).toContain('<!-- wp:quote -->');
      expect(result).toContain('<!-- wp:separator -->');
      
      // Should have proper content
      expect(result).toContain('Main Title');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('console.log');
      expect(result).toContain('Quote text');
      expect(result).toContain('Final paragraph');
    });
  });

  describe('convenience function', () => {
    it('should work with convertMarkdownToWpBlocks function', () => {
      const result = convertMarkdownToWpBlocks('# Test');
      expect(result).toContain('<!-- wp:heading -->');
      expect(result).toContain('<h1 class="wp-block-heading">Test</h1>');
    });

    it('should accept options in convenience function', () => {
      const result = convertMarkdownToWpBlocks('Text with <tags>', { escapeHtml: true });
      expect(result).toContain('&lt;tags&gt;');
    });
  });
});