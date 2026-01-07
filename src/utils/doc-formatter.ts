import chalk from 'chalk';

export interface DocData {
  id: string;
  name: string;
  date_created?: string;
  date_updated?: string;
  creator?: {
    id: string;
    username: string;
    email: string;
  };
  workspace?: {
    id: string;
    name: string;
  };
  parent?: {
    id: string;
    type: number;
  };
  pages?: PageData[];
}

export interface PageData {
  id: string;
  name: string;
  date_created?: string;
  date_updated?: string;
  content?: string;
  orderindex?: number;
  pages?: PageData[];
}

export class DocFormatter {
  static formatDate(timestamp?: string | number): string {
    if (!timestamp) return chalk.gray('-');
    const date = new Date(
      typeof timestamp === 'string' ? parseInt(timestamp) : timestamp
    );
    if (isNaN(date.getTime())) return chalk.gray('-');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  static formatDocList(docs: DocData[]): void {
    if (docs.length === 0) {
      console.log(chalk.gray('No docs found.'));
      return;
    }
    const header = `${chalk.bold('ID'.padEnd(12))} | ${chalk.bold('Name'.padEnd(40))} | ${chalk.bold('Updated'.padEnd(14))} | ${chalk.bold('Creator'.padEnd(15))}`;
    const separator = '-'.repeat(90);
    console.log(header);
    console.log(separator);
    docs.forEach((doc) => {
      const id = this.truncateText(doc.id, 12).padEnd(12);
      const name = this.truncateText(doc.name, 40).padEnd(40);
      const updated = this.formatDate(doc.date_updated).padEnd(24);
      const creator = doc.creator
        ? this.truncateText(`@${doc.creator.username}`, 15).padEnd(15)
        : chalk.gray('-').padEnd(15);
      console.log(`${id} | ${name} | ${updated} | ${creator}`);
    });
    console.log('');
    console.log(
      chalk.gray(`Showing ${docs.length} doc${docs.length === 1 ? '' : 's'}`)
    );
  }

  static formatDocDetails(doc: DocData): void {
    console.log(chalk.blue.bold(`Doc: ${doc.name}`));
    console.log('');
    console.log(`${chalk.cyan('ID:')} ${doc.id}`);
    if (doc.creator) {
      console.log(
        `${chalk.cyan('Creator:')} @${doc.creator.username} (${doc.creator.email})`
      );
    }
    if (doc.date_created) {
      console.log(
        `${chalk.cyan('Created:')} ${this.formatDate(doc.date_created)}`
      );
    }
    if (doc.date_updated) {
      console.log(
        `${chalk.cyan('Updated:')} ${this.formatDate(doc.date_updated)}`
      );
    }
    if (doc.workspace) {
      console.log(
        `${chalk.cyan('Workspace:')} ${doc.workspace.name} (${doc.workspace.id})`
      );
    }
  }

  static formatPages(pages: PageData[], indent = 0): void {
    if (!pages || pages.length === 0) {
      if (indent === 0) {
        console.log(chalk.gray('No pages found.'));
      }
      return;
    }
    const prefix = '  '.repeat(indent);
    pages.forEach((page, index) => {
      const bullet = indent === 0 ? `${index + 1}.` : '└─';
      console.log(
        `${prefix}${bullet} ${chalk.white(page.name)} ${chalk.gray(`(${page.id})`)}`
      );
      if (page.pages && page.pages.length > 0) {
        this.formatPages(page.pages, indent + 1);
      }
    });
  }

  static formatPageContent(page: PageData): void {
    console.log(chalk.blue.bold(`Page: ${page.name}`));
    console.log('');
    console.log(`${chalk.cyan('ID:')} ${page.id}`);
    if (page.date_created) {
      console.log(
        `${chalk.cyan('Created:')} ${this.formatDate(page.date_created)}`
      );
    }
    if (page.date_updated) {
      console.log(
        `${chalk.cyan('Updated:')} ${this.formatDate(page.date_updated)}`
      );
    }
    if (page.content) {
      console.log('');
      console.log(chalk.cyan('Content:'));
      console.log('-'.repeat(40));
      console.log(page.content);
    }
  }
}
