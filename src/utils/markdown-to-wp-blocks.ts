import { marked, Token, Tokens } from 'marked';

export interface ConversionOptions {
  escapeHtml?: boolean;
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
    return tokens.map(token => this.tokenToBlock(token)).join('\n\n');
  }

  private tokenToBlock(token: Token): string {
    switch (token.type) {
      case 'heading':
        return this.headingToBlock(token as Tokens.Heading);
      
      case 'paragraph':
        return this.paragraphToBlock(token as Tokens.Paragraph);
      
      case 'list':
        return this.listToBlock(token as Tokens.List);
      
      case 'code':
        return this.codeToBlock(token as Tokens.Code);
      
      case 'blockquote':
        return this.blockquoteToBlock(token as Tokens.Blockquote);
      
      case 'hr':
        return this.separatorToBlock();
      
      case 'html':
        return this.htmlToBlock(token as Tokens.HTML);
      
      case 'space':
        return '';
      
      default:
        console.warn(`Unknown token type: ${token.type}`);
        return '';
    }
  }

  private headingToBlock(token: Tokens.Heading): string {
    const level = token.depth;
    const text = this.parseInlineTokens(token.tokens);
    
    if (level === 1) {
      return `<!-- wp:heading -->
<h1 class="wp-block-heading">${text}</h1>
<!-- /wp:heading -->`;
    } else {
      return `<!-- wp:heading {"level":${level}} -->
<h${level} class="wp-block-heading">${text}</h${level}>
<!-- /wp:heading -->`;
    }
  }

  private paragraphToBlock(token: Tokens.Paragraph): string {
    const text = this.parseInlineTokens(token.tokens);
    return `<!-- wp:paragraph -->
<p>${text}</p>
<!-- /wp:paragraph -->`;
  }

  private listToBlock(token: Tokens.List): string {
    const listItems = token.items.map(item => {
      const text = this.parseInlineTokens(item.tokens);
      return `<!-- wp:list-item -->
<li>${text}</li>
<!-- /wp:list-item -->`;
    }).join('');

    return `<!-- wp:list -->
<ul class="wp-block-list">${listItems}</ul>
<!-- /wp:list -->`;
  }

  private codeToBlock(token: Tokens.Code): string {
    const code = this.escapeHtml(token.text);
    return `<!-- wp:code -->
<pre class="wp-block-code"><code>${code}</code></pre>
<!-- /wp:code -->`;
  }

  private blockquoteToBlock(token: Tokens.Blockquote): string {
    const content = this.tokensToBlocks(token.tokens);
    return `<!-- wp:quote -->
<blockquote class="wp-block-quote">${content}</blockquote>
<!-- /wp:quote -->`;
  }

  private separatorToBlock(): string {
    return `<!-- wp:separator -->
<hr class="wp-block-separator has-alpha-channel-opacity"/>
<!-- /wp:separator -->`;
  }

  private htmlToBlock(token: Tokens.HTML): string {
    return `<!-- wp:html -->
${token.text}
<!-- /wp:html -->`;
  }

  private parseInlineTokens(tokens: Token[]): string {
    return tokens.map(token => this.inlineTokenToHtml(token)).join('');
  }

  private inlineTokenToHtml(token: Token): string {
    switch (token.type) {
      case 'text':
        return this.escapeHtml((token as Tokens.Text).text);
      
      case 'strong':
        const strongText = this.parseInlineTokens((token as Tokens.Strong).tokens);
        return `<strong>${strongText}</strong>`;
      
      case 'em':
        const emText = this.parseInlineTokens((token as Tokens.Em).tokens);
        return `<em>${emText}</em>`;
      
      case 'codespan':
        return `<code>${this.escapeHtml((token as Tokens.Codespan).text)}</code>`;
      
      case 'link':
        const linkToken = token as Tokens.Link;
        const linkText = this.parseInlineTokens(linkToken.tokens);
        const href = this.escapeHtml(linkToken.href);
        const title = linkToken.title ? ` title="${this.escapeHtml(linkToken.title)}"` : '';
        return `<a href="${href}"${title}>${linkText}</a>`;
      
      case 'image':
        const imgToken = token as Tokens.Image;
        const alt = this.escapeHtml(imgToken.text);
        const src = this.escapeHtml(imgToken.href);
        const imgTitle = imgToken.title ? ` title="${this.escapeHtml(imgToken.title)}"` : '';
        return `<img src="${src}" alt="${alt}"${imgTitle} />`;
      
      case 'br':
        return '<br />';
      
      case 'del':
        const delText = this.parseInlineTokens((token as Tokens.Del).tokens);
        return `<del>${delText}</del>`;
      
      case 'html':
        return (token as Tokens.Tag).text;
      
      default:
        console.warn(`Unknown inline token type: ${token.type}`);
        return '';
    }
  }

  private escapeHtml(text: string): string {
    if (!this.options.escapeHtml) {
      return text;
    }
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export function convertMarkdownToWpBlocks(
  markdown: string, 
  options?: ConversionOptions
): string {
  const converter = new MarkdownToWpBlocks(options);
  return converter.convert(markdown);
}