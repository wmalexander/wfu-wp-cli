import chalk from 'chalk';
import readline from 'readline';
import { Config } from './config';
import { ClickUpClient } from './clickup-client';

interface InteractiveTaskData {
  title: string;
  description?: string;
  listId: string;
  priority?: number;
  assignee?: string;
  dueDate?: number;
  tags?: string[];
}

export async function interactiveTaskCreation(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log(chalk.blue.bold('📝 Interactive Task Creation'));
    console.log(chalk.gray('Press Ctrl+C to cancel at any time\n'));

    const taskData: InteractiveTaskData = {} as InteractiveTaskData;

    // Get task title
    taskData.title = await prompt(rl, chalk.cyan('Task title: '), true);
    if (!taskData.title.trim()) {
      throw new Error('Task title cannot be empty');
    }

    // Get task description
    const description = await prompt(
      rl,
      chalk.cyan('Description (optional): '),
      false
    );
    if (description.trim()) {
      taskData.description = description;
    }

    // Get list ID
    const defaultListId = Config.get('clickup.defaultListId');
    if (defaultListId) {
      console.log(chalk.gray(`Default list ID: ${defaultListId}`));
      const useDefault = await prompt(
        rl,
        chalk.cyan('Use default list? (y/n): '),
        false
      );
      if (
        useDefault.toLowerCase() === 'y' ||
        useDefault.toLowerCase() === 'yes' ||
        useDefault === ''
      ) {
        taskData.listId = defaultListId;
      } else {
        taskData.listId = await prompt(rl, chalk.cyan('List ID: '), true);
      }
    } else {
      taskData.listId = await prompt(rl, chalk.cyan('List ID: '), true);
    }

    // Get priority
    console.log(chalk.gray('\nPriority options:'));
    console.log(`  ${chalk.red('1')} - Urgent`);
    console.log(`  ${chalk.yellow('2')} - High`);
    console.log(`  ${chalk.blue('3')} - Normal`);
    console.log(`  ${chalk.gray('4')} - Low`);

    const priorityInput = await prompt(
      rl,
      chalk.cyan('Priority (1-4, default: 3): '),
      false
    );
    if (priorityInput.trim()) {
      const priority = parseInt(priorityInput);
      if (priority >= 1 && priority <= 4) {
        taskData.priority = priority;
      } else {
        console.log(chalk.yellow('Invalid priority, using Normal (3)'));
        taskData.priority = 3;
      }
    } else {
      taskData.priority = 3;
    }

    // Get assignee
    const assignee = await prompt(
      rl,
      chalk.cyan('Assignee user ID (optional): '),
      false
    );
    if (assignee.trim()) {
      taskData.assignee = assignee;
    }

    // Get due date
    const dueDate = await prompt(
      rl,
      chalk.cyan('Due date (YYYY-MM-DD, optional): '),
      false
    );
    if (dueDate.trim()) {
      const parsed = new Date(dueDate);
      if (!isNaN(parsed.getTime())) {
        taskData.dueDate = parsed.getTime();
      } else {
        console.log(chalk.yellow('Invalid date format, skipping due date'));
      }
    }

    // Get tags
    const tags = await prompt(
      rl,
      chalk.cyan('Tags (comma-separated, optional): '),
      false
    );
    if (tags.trim()) {
      taskData.tags = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }

    // Confirmation
    console.log(chalk.blue.bold('\n📋 Task Summary:'));
    console.log(`  ${chalk.cyan('Title:')} ${taskData.title}`);
    if (taskData.description) {
      console.log(`  ${chalk.cyan('Description:')} ${taskData.description}`);
    }
    console.log(`  ${chalk.cyan('List ID:')} ${taskData.listId}`);
    if (taskData.priority) {
      const priorityNames = { 1: 'Urgent', 2: 'High', 3: 'Normal', 4: 'Low' };
      console.log(
        `  ${chalk.cyan('Priority:')} ${priorityNames[taskData.priority as keyof typeof priorityNames]}`
      );
    }
    if (taskData.assignee) {
      console.log(`  ${chalk.cyan('Assignee:')} ${taskData.assignee}`);
    }
    if (taskData.dueDate) {
      console.log(
        `  ${chalk.cyan('Due Date:')} ${new Date(taskData.dueDate).toLocaleDateString()}`
      );
    }
    if (taskData.tags && taskData.tags.length > 0) {
      console.log(`  ${chalk.cyan('Tags:')} ${taskData.tags.join(', ')}`);
    }

    const confirm = await prompt(
      rl,
      chalk.green('\nCreate this task? (y/n): '),
      true
    );
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log(chalk.yellow('Task creation cancelled.'));
      return;
    }

    // Create the task
    console.log(chalk.gray('\nCreating task...'));
    const client = new ClickUpClient();

    const createTaskData = {
      name: taskData.title,
      description: taskData.description,
      priority: taskData.priority,
      assignees: taskData.assignee ? [taskData.assignee] : undefined,
      dueDate: taskData.dueDate,
      tags: taskData.tags,
    };

    const taskData_result = await client.createTask(
      taskData.listId,
      createTaskData
    );
    const task = taskData_result.task;

    // Enhanced success feedback
    console.log(chalk.green.bold('\n✓ Task created successfully!'));
    console.log('');
    console.log(chalk.blue.bold('Task Details:'));
    console.log(`  ${chalk.cyan('Title:')} ${task.name}`);
    console.log(`  ${chalk.cyan('ID:')} ${task.id}`);
    console.log(`  ${chalk.cyan('URL:')} ${chalk.underline(task.url)}`);
    console.log(`  ${chalk.cyan('Status:')} ${task.status.status}`);

    if (task.priority && task.priority.priority !== null) {
      const priorityMap: { [key: string]: string } = {
        '1': chalk.red('Urgent'),
        '2': chalk.yellow('High'),
        '3': chalk.blue('Normal'),
        '4': chalk.gray('Low'),
      };
      console.log(
        `  ${chalk.cyan('Priority:')} ${priorityMap[task.priority.priority] || task.priority.priority}`
      );
    }

    if (task.assignees && task.assignees.length > 0) {
      const assigneeNames = task.assignees
        .map((a: any) => `@${a.username}`)
        .join(', ');
      console.log(`  ${chalk.cyan('Assignees:')} ${assigneeNames}`);
    }

    if (task.tags && task.tags.length > 0) {
      const tagNames = task.tags
        .map((t: any) => chalk.magenta(`#${t.name}`))
        .join(', ');
      console.log(`  ${chalk.cyan('Tags:')} ${tagNames}`);
    }

    if (task.due_date) {
      const dueDate = new Date(parseInt(task.due_date)).toLocaleDateString();
      console.log(`  ${chalk.cyan('Due Date:')} ${dueDate}`);
    }

    if (task.list) {
      console.log(`  ${chalk.cyan('List:')} ${task.list.name}`);
    }

    console.log('');
    console.log(
      chalk.green(
        `🎉 Your task is ready! View it at: ${chalk.underline(task.url)}`
      )
    );
  } catch (error) {
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
    process.exit(1);
  } finally {
    rl.close();
  }
}

function prompt(
  rl: readline.Interface,
  question: string,
  required: boolean
): Promise<string> {
  return new Promise((resolve) => {
    const askQuestion = () => {
      rl.question(question, (answer) => {
        if (required && !answer.trim()) {
          console.log(chalk.red('This field is required.'));
          askQuestion();
        } else {
          resolve(answer);
        }
      });
    };
    askQuestion();
  });
}
