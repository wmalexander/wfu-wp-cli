import { readFile } from 'fs/promises';
import chalk from 'chalk';

export interface BatchTask {
  name: string;
  description?: string;
  priority?: string;
  assignee?: string;
  dueDate?: string;
  tags?: string[];
}

export class BatchTaskCreator {
  static async parsePlainTextFile(filepath: string): Promise<BatchTask[]> {
    const content = await readFile(filepath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const tasks: BatchTask[] = [];
    for (const line of lines) {
      const task = this.parsePlainTextLine(line.trim());
      if (task) {
        tasks.push(task);
      }
    }
    return tasks;
  }
  private static parsePlainTextLine(line: string): BatchTask | null {
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      return null;
    }
    const parts = line.split('|').map((part) => part.trim());
    const task: BatchTask = {
      name: parts[0],
    };
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].toLowerCase();
      if (
        part.includes('priority') ||
        part.includes('urgent') ||
        part.includes('high') ||
        part.includes('normal') ||
        part.includes('low')
      ) {
        if (part.includes('urgent')) task.priority = 'urgent';
        else if (part.includes('high')) task.priority = 'high';
        else if (part.includes('normal')) task.priority = 'normal';
        else if (part.includes('low')) task.priority = 'low';
      } else if (part.startsWith('@')) {
        task.assignee = part.substring(1);
      } else if (part.includes('due:')) {
        const dateMatch = part.match(/due:\s*(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          task.dueDate = dateMatch[1];
        }
      } else if (part.includes('desc:')) {
        task.description = parts[i].replace(/desc:\s*/i, '');
      } else if (part.includes('tags:')) {
        const tagsStr = part.replace(/tags:\s*/, '');
        task.tags = tagsStr
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0);
      } else if (parts[i].trim().length > 0 && !task.description) {
        task.description = parts[i].trim();
      }
    }
    return task;
  }
  static async parseJsonFile(filepath: string): Promise<BatchTask[]> {
    const content = await readFile(filepath, 'utf8');
    const data = JSON.parse(content);
    if (!Array.isArray(data) && !data.tasks) {
      throw new Error(
        'JSON file must contain an array of tasks or an object with a "tasks" array property'
      );
    }
    const tasksArray = Array.isArray(data) ? data : data.tasks;
    return tasksArray.map((task: any, index: number) => {
      if (!task.name && !task.title) {
        throw new Error(
          `Task at index ${index} is missing required "name" or "title" field`
        );
      }
      return {
        name: task.name || task.title,
        description: task.description,
        priority: task.priority,
        assignee: task.assignee,
        dueDate: task.dueDate || task.due_date,
        tags: Array.isArray(task.tags)
          ? task.tags
          : task.tags
            ? task.tags.split(',').map((t: string) => t.trim())
            : undefined,
      };
    });
  }
  static async parseFile(filepath: string): Promise<BatchTask[]> {
    const extension = filepath.toLowerCase().split('.').pop();
    switch (extension) {
      case 'json':
        return await this.parseJsonFile(filepath);
      case 'txt':
      case 'md':
      case 'markdown':
        return await this.parsePlainTextFile(filepath);
      default:
        throw new Error(
          `Unsupported file format: ${extension}. Supported formats: json, txt, md, markdown`
        );
    }
  }
  static async createTasksBatch(
    client: any,
    listId: string,
    tasks: BatchTask[]
  ): Promise<{
    successful: any[];
    failed: Array<{ task: BatchTask; error: string }>;
  }> {
    if (tasks.length === 0) {
      throw new Error('No tasks to create');
    }
    const results = {
      successful: [] as any[],
      failed: [] as Array<{ task: BatchTask; error: string }>,
    };
    console.log(chalk.blue.bold(`Creating ${tasks.length} tasks...`));
    console.log('');
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const progressStr = `[${i + 1}/${tasks.length}]`;
      try {
        const taskParams: any = {
          name: task.name,
        };
        if (task.description) taskParams.description = task.description;
        if (task.priority) {
          const priorityMap: { [key: string]: number } = {
            urgent: 1,
            high: 2,
            normal: 3,
            low: 4,
          };
          taskParams.priority = priorityMap[task.priority.toLowerCase()];
        }
        if (task.assignee) taskParams.assignees = [task.assignee];
        if (task.dueDate) {
          const dueDate = new Date(task.dueDate);
          if (!isNaN(dueDate.getTime())) {
            taskParams.dueDate = dueDate.getTime();
          }
        }
        if (task.tags && task.tags.length > 0) {
          taskParams.tags = task.tags;
        }
        console.log(`${progressStr} Creating: "${task.name}"...`);
        const taskData = await client.createTask(listId, taskParams);
        results.successful.push(taskData.task);
        console.log(
          chalk.green(`${progressStr} ✓ Created: ${taskData.task.id}`)
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ task, error: errorMsg });
        console.log(chalk.red(`${progressStr} ✗ Failed: ${errorMsg}`));
      }
    }
    return results;
  }
  static displayBatchResults(results: {
    successful: any[];
    failed: Array<{ task: BatchTask; error: string }>;
  }): void {
    console.log('');
    console.log(chalk.blue.bold('Batch Creation Summary:'));
    console.log('');
    if (results.successful.length > 0) {
      console.log(
        chalk.green.bold(
          `✓ Successfully created: ${results.successful.length} tasks`
        )
      );
      results.successful.forEach((task, index) => {
        console.log(`  ${index + 1}. ${task.name} (${task.id})`);
        if (index < 3 || results.successful.length <= 5) {
          console.log(`     ${chalk.underline(task.url)}`);
        } else if (index === 3) {
          console.log(
            `     ${chalk.gray(`... and ${results.successful.length - 4} more`)}`
          );
        }
      });
      console.log('');
    }
    if (results.failed.length > 0) {
      console.log(
        chalk.red.bold(`✗ Failed to create: ${results.failed.length} tasks`)
      );
      results.failed.forEach((failure, index) => {
        console.log(`  ${index + 1}. "${failure.task.name}"`);
        console.log(`     Error: ${failure.error}`);
      });
      console.log('');
    }
    if (results.successful.length > 0 && results.failed.length === 0) {
      console.log(chalk.green('🎉 All tasks created successfully!'));
    } else if (results.successful.length > 0 && results.failed.length > 0) {
      console.log(
        chalk.yellow(
          `⚠️  ${results.successful.length} succeeded, ${results.failed.length} failed`
        )
      );
    } else {
      console.log(chalk.red('❌ No tasks were created successfully'));
    }
  }
  static generateExampleFiles(): { plainText: string; json: string } {
    const plainTextExample = `# Example task file (Plain Text Format)
# Lines starting with # are comments and will be ignored
# Format: Task Title | Additional Options

Fix login bug | High priority | @john | Due: 2024-12-31 | Tags: bug,urgent
Update documentation | Normal priority | Desc: Update API documentation with new endpoints
Refactor auth module | Low priority | @sarah | Tags: refactor,backend
Add dark mode toggle | Urgent priority | Due: 2024-12-25
Write unit tests | Tags: testing,quality

# You can also use simpler format:
Simple task without options
Another task | @mike | Due: 2024-12-20`;

    const jsonExample = `{
  "tasks": [
    {
      "name": "Fix login bug",
      "description": "Users cannot log in on mobile devices when using 2FA",
      "priority": "high",
      "assignee": "john",
      "dueDate": "2024-12-31",
      "tags": ["bug", "urgent"]
    },
    {
      "name": "Update documentation", 
      "description": "Update API documentation with new endpoints",
      "priority": "normal"
    },
    {
      "name": "Refactor auth module",
      "priority": "low",
      "assignee": "sarah",
      "tags": ["refactor", "backend"]
    },
    {
      "name": "Add dark mode toggle",
      "priority": "urgent",
      "dueDate": "2024-12-25"
    }
  ]
}`;

    return { plainText: plainTextExample, json: jsonExample };
  }
}
