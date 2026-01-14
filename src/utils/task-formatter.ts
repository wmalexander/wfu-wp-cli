import chalk from 'chalk';

export interface TaskData {
  id: string;
  name: string;
  status: {
    status: string;
    color?: string;
  };
  priority?: {
    priority: string | null;
  };
  assignees?: Array<{
    id: string;
    username: string;
    email: string;
  }>;
  due_date?: string;
  date_created?: string;
  date_updated?: string;
  description?: string;
  tags?: Array<{
    name: string;
  }>;
  list?: {
    name: string;
  };
  creator?: {
    username: string;
  };
  url?: string;
}

export class TaskFormatter {
  static formatPriority(priority: string | null): string {
    if (!priority || priority === 'null') return chalk.gray('-');
    const priorityMap: { [key: string]: string } = {
      '1': chalk.red('Urgent'),
      '2': chalk.yellow('High'),
      '3': chalk.blue('Normal'),
      '4': chalk.gray('Low'),
    };
    return priorityMap[priority] || chalk.gray(priority);
  }

  static formatDate(timestamp?: string): string {
    if (!timestamp) return chalk.gray('-');
    const date = new Date(parseInt(timestamp));
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  static formatStatus(status: string): string {
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('complete') || lowerStatus.includes('done')) {
      return chalk.green(status);
    }
    if (lowerStatus.includes('progress') || lowerStatus.includes('doing')) {
      return chalk.yellow(status);
    }
    if (lowerStatus.includes('todo') || lowerStatus.includes('open')) {
      return chalk.cyan(status);
    }
    return chalk.gray(status);
  }

  static formatAssignees(assignees?: Array<{ username: string }>): string {
    if (!assignees || assignees.length === 0) return chalk.gray('-');
    return assignees.map((a) => chalk.magenta(`@${a.username}`)).join(', ');
  }

  static formatTags(tags?: Array<{ name: string }>): string {
    if (!tags || tags.length === 0) return chalk.gray('-');
    return tags.map((t) => chalk.blue(`#${t.name}`)).join(', ');
  }

  static truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  static formatTaskList(tasks: TaskData[]): void {
    if (tasks.length === 0) {
      console.log(chalk.gray('No tasks found.'));
      return;
    }
    const header = `${chalk.bold('ID'.padEnd(10))} | ${chalk.bold('Title'.padEnd(30))} | ${chalk.bold('Status'.padEnd(12))} | ${chalk.bold('Priority'.padEnd(8))} | ${chalk.bold('Assignee'.padEnd(12))} | ${chalk.bold('Due Date'.padEnd(12))}`;
    const separator = '-'.repeat(90);
    console.log(header);
    console.log(separator);
    let totalCount = 0;
    let subtaskCount = 0;
    tasks.forEach((task: any) => {
      totalCount++;
      const id = this.truncateText(task.id, 10).padEnd(10);
      const title = this.truncateText(task.name, 30).padEnd(30);
      const status = this.formatStatus(task.status.status).padEnd(22); // Account for ANSI color codes
      const priority = this.formatPriority(
        task.priority?.priority || null
      ).padEnd(18); // Account for ANSI codes
      const assignee = this.truncateText(
        task.assignees && task.assignees.length > 0
          ? `@${task.assignees[0].username}`
          : '-',
        12
      ).padEnd(12);
      const dueDate = this.formatDate(task.due_date).padEnd(22); // Account for ANSI codes
      console.log(
        `${id} | ${title} | ${status} | ${priority} | ${assignee} | ${dueDate}`
      );
      // Display subtasks if present (indented)
      if (task.subtasks && task.subtasks.length > 0) {
        task.subtasks.forEach((subtask: any) => {
          subtaskCount++;
          const subId = this.truncateText(subtask.id, 8).padEnd(10);
          const subTitle = this.truncateText(`↳ ${subtask.name}`, 30).padEnd(
            30
          );
          const subStatus = this.formatStatus(
            subtask.status?.status || '-'
          ).padEnd(22);
          const subPriority = this.formatPriority(
            subtask.priority?.priority || null
          ).padEnd(18);
          const subAssignee = this.truncateText(
            subtask.assignees && subtask.assignees.length > 0
              ? `@${subtask.assignees[0].username}`
              : '-',
            12
          ).padEnd(12);
          const subDueDate = this.formatDate(subtask.due_date).padEnd(22);
          console.log(
            chalk.gray(`${subId}`) +
              ` | ${chalk.gray(subTitle)} | ${subStatus} | ${subPriority} | ${subAssignee} | ${subDueDate}`
          );
        });
      }
    });
    console.log('');
    if (subtaskCount > 0) {
      console.log(
        chalk.gray(
          `Showing ${totalCount} task${totalCount === 1 ? '' : 's'} with ${subtaskCount} subtask${subtaskCount === 1 ? '' : 's'}`
        )
      );
    } else {
      console.log(
        chalk.gray(`Showing ${totalCount} task${totalCount === 1 ? '' : 's'}`)
      );
    }
  }

  static formatTaskDetails(task: TaskData): void {
    console.log(chalk.blue.bold(`Task: ${task.name} (${task.id})`));
    console.log('');
    console.log(
      `${chalk.cyan('Status:')} ${this.formatStatus(task.status.status)}`
    );
    if (
      task.priority &&
      task.priority.priority !== null &&
      task.priority.priority !== 'null'
    ) {
      console.log(
        `${chalk.cyan('Priority:')} ${this.formatPriority(task.priority.priority)}`
      );
    }
    if (task.assignees && task.assignees.length > 0) {
      console.log(
        `${chalk.cyan('Assignees:')} ${this.formatAssignees(task.assignees)}`
      );
    }
    if (task.creator) {
      console.log(`${chalk.cyan('Created by:')} @${task.creator.username}`);
    }
    if (task.date_created) {
      console.log(
        `${chalk.cyan('Created:')} ${this.formatDate(task.date_created)}`
      );
    }
    if (task.date_updated) {
      console.log(
        `${chalk.cyan('Updated:')} ${this.formatDate(task.date_updated)}`
      );
    }
    if (task.due_date) {
      console.log(
        `${chalk.cyan('Due Date:')} ${this.formatDate(task.due_date)}`
      );
    }
    if (task.list) {
      console.log(`${chalk.cyan('List:')} ${task.list.name}`);
    }
    if (task.description) {
      console.log('');
      console.log(chalk.cyan('Description:'));
      console.log(task.description);
    }
    if (task.tags && task.tags.length > 0) {
      console.log('');
      console.log(`${chalk.cyan('Tags:')} ${this.formatTags(task.tags)}`);
    }
    if (task.url) {
      console.log('');
      console.log(`${chalk.cyan('Link:')} ${chalk.underline(task.url)}`);
    }
  }
}
