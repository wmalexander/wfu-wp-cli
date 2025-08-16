import { marked } from 'marked';

type Token = any;

export interface ConversionOptions {
  escapeHtml?: boolean;
}

export function convertMarkdownToWpBlocks(
  markdown: string,
  options: ConversionOptions = {}
): string {
  const converter = new MarkdownToWpBlocks(options);
  return converter.convert(markdown);
}

export class MarkdownToWpBlocks {
  private options: ConversionOptions;

  constructor(options: ConversionOptions = {}) {
    this.options = {
      escapeHtml: false,
      ...options,
    };
  }

  convert(markdown: string): string {
    const tokens = marked.lexer(markdown);
    return this.tokensToBlocks(tokens);
  }

  private tokensToBlocks(tokens: Token[]): string {
    return tokens.map((token) => this.tokenToBlock(token)).join('\n\n');
  }

  private tokenToBlock(token: Token): string {
    switch (token.type) {
      case 'heading':
        return this.headingToBlock(token as any);

      case 'paragraph':
        return this.paragraphToBlock(token as any);

      case 'list':
        return this.listToBlock(token as any);

      case 'code':
        return this.codeToBlock(token as any);

      case 'blockquote':
        return this.blockquoteToBlock(token as any);

      case 'hr':
        return this.separatorToBlock();

      case 'html':
        return this.htmlToBlock(token as any);

      case 'table':
        return this.tableToBlock(token as any);

      case 'space':
        return '';

      default:
        return '';
    }
  }

  private headingToBlock(token: any): string {
    const level = token.depth;
    const text = this.processTextToken(token.tokens);
    return `<!-- wp:heading {"level":${level}} -->\n<h${level}>${text}</h${level}>\n<!-- /wp:heading -->`;
  }

  private paragraphToBlock(token: any): string {
    const text = this.processTextToken(token.tokens);
    return `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`;
  }

  private listToBlock(token: any): string {
    const tag = token.ordered ? 'ol' : 'ul';
    const blockName = token.ordered ? 'wp:list' : 'wp:list';
    const items = token.items
      .map((item: any) => this.listItemToHTML(item))
      .join('');

    return `<!-- ${blockName}${token.ordered ? ' {"ordered":true}' : ''} -->\n<${tag}>${items}</${tag}>\n<!-- /${blockName} -->`;
  }

  private listItemToHTML(item: any): string {
    const content = item.tokens
      ? this.processTextToken(item.tokens)
      : item.text;
    return `<li>${content}</li>`;
  }

  private codeToBlock(token: any): string {
    const code = this.escapeHtml(token.text);
    const lang = token.lang || '';

    return `<!-- wp:code${lang ? ` {"language":"${lang}"}` : ''} -->\n<pre class="wp-block-code"><code>${code}</code></pre>\n<!-- /wp:code -->`;
  }

  private blockquoteToBlock(token: any): string {
    const content = token.tokens
      .map((t: Token) => {
        if (t.type === 'paragraph') {
          return this.processTextToken((t as any).tokens);
        }
        return '';
      })
      .filter(Boolean)
      .join('</p>\n<p>');

    return `<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>${content}</p></blockquote>\n<!-- /wp:quote -->`;
  }

  private separatorToBlock(): string {
    return `<!-- wp:separator -->\n<hr class="wp-block-separator"/>\n<!-- /wp:separator -->`;
  }

  private htmlToBlock(token: any): string {
    // For raw HTML, we'll wrap it in a custom HTML block
    return `<!-- wp:html -->\n${token.text}\n<!-- /wp:html -->`;
  }

  private tableToBlock(token: any): string {
    const headers = token.header
      .map((cell: any) => {
        const text = cell.tokens
          ? this.processTextToken(cell.tokens)
          : cell.text;
        return `<th>${text}</th>`;
      })
      .join('');

    const rows = token.rows
      .map((row: any[]) => {
        const cells = row
          .map((cell: any) => {
            const text = cell.tokens
              ? this.processTextToken(cell.tokens)
              : cell.text;
            return `<td>${text}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');

    const tableHTML = `<table class="wp-block-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    return `<!-- wp:table -->\n<figure class="wp-block-table">${tableHTML}</figure>\n<!-- /wp:table -->`;
  }

  private processTextToken(tokens: Token[]): string {
    return tokens
      .map((token) => {
        switch (token.type) {
          case 'text':
            return this.options.escapeHtml
              ? this.escapeHtml((token as any).text)
              : (token as any).text;

          case 'strong':
            return `<strong>${this.processTextToken((token as any).tokens)}</strong>`;

          case 'em':
            return `<em>${this.processTextToken((token as any).tokens)}</em>`;

          case 'link':
            const linkToken = token as any;
            const linkText = this.processTextToken(linkToken.tokens);
            return `<a href="${linkToken.href}"${
              linkToken.title ? ` title="${linkToken.title}"` : ''
            }>${linkText}</a>`;

          case 'codespan':
            return `<code>${this.escapeHtml((token as any).text)}</code>`;

          case 'br':
            return '<br>';

          case 'del':
            return `<del>${this.processTextToken((token as any).tokens)}</del>`;

          case 'escape':
            return (token as any).text;

          case 'image':
            const imgToken = token as any;
            return `<img src="${imgToken.href}" alt="${imgToken.text}"${
              imgToken.title ? ` title="${imgToken.title}"` : ''
            }>`;

          default:
            return '';
        }
      })
      .join('');
  }

  private processToken(token: Token): string {
    if (token.type === 'paragraph' && (token as any).tokens) {
      return this.processTextToken((token as any).tokens);
    }
    if (token.type === 'heading' && (token as any).tokens) {
      return this.processTextToken((token as any).tokens);
    }
    if (token.type === 'code' && (token as any).text) {
      return (token as any).text;
    }
    if (token.type === 'list' && (token as any).items) {
      return (token as any).items
        .map((item: any) => `<li>${this.processToken(item)}</li>`)
        .join('');
    }
    if (token.type === 'list_item' && (token as any).tokens) {
      return this.processTextToken((token as any).tokens);
    }
    if (token.type === 'text') {
      return (token as any).text;
    }
    return '';
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
