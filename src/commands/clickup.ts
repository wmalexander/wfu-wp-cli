import { Command } from 'commander';
import chalk from 'chalk';
import { Config } from '../utils/config';

export const clickupCommand = new Command('clickup')
  .description('Manage ClickUp tasks and integration')
  .addCommand(
    new Command('config')
      .description('Configure ClickUp settings')
      .addCommand(
        new Command('set')
          .description('Set ClickUp configuration')
          .argument(
            '<key>',
            'Configuration key (token, defaultListId, defaultWorkspaceId)'
          )
          .argument('<value>', 'Configuration value')
          .action((key: string, value: string) => {
            try {
              if (
                !['token', 'defaultListId', 'defaultWorkspaceId'].includes(key)
              ) {
                throw new Error(
                  'Invalid ClickUp config key. Valid keys: token, defaultListId, defaultWorkspaceId'
                );
              }
              Config.set(`clickup.${key}`, value);
              if (key === 'token') {
                const maskedValue = value.startsWith('pk_')
                  ? `${value.substring(0, 6)}...${value.substring(value.length - 4)}`
                  : '****';
                console.log(
                  chalk.green(`✓ Set ClickUp ${key}: ${maskedValue}`)
                );
              } else {
                console.log(chalk.green(`✓ Set ClickUp ${key}: ${value}`));
              }
            } catch (error) {
              console.error(
                chalk.red(
                  `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                )
              );
              process.exit(1);
            }
          })
      )
      .addCommand(
        new Command('show')
          .description('Show ClickUp configuration')
          .action(() => {
            try {
              const token = Config.get('clickup.token');
              const defaultListId = Config.get('clickup.defaultListId');
              const defaultWorkspaceId = Config.get(
                'clickup.defaultWorkspaceId'
              );

              console.log(chalk.blue.bold('ClickUp Configuration:'));
              if (token) {
                const maskedToken = token.startsWith('pk_')
                  ? `${token.substring(0, 6)}...${token.substring(token.length - 4)}`
                  : '****';
                console.log(`  Token: ${maskedToken}`);
              } else {
                console.log(chalk.yellow('  Token: Not configured'));
              }
              if (defaultListId) {
                console.log(`  Default List ID: ${defaultListId}`);
              } else {
                console.log(chalk.gray('  Default List ID: Not configured'));
              }
              if (defaultWorkspaceId) {
                console.log(`  Default Workspace ID: ${defaultWorkspaceId}`);
              } else {
                console.log(
                  chalk.gray('  Default Workspace ID: Not configured')
                );
              }
            } catch (error) {
              console.error(
                chalk.red(
                  `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                )
              );
              process.exit(1);
            }
          })
      )
  )
  .addCommand(
    new Command('test')
      .description('Test ClickUp API connectivity')
      .action(async () => {
        try {
          const { ClickUpClient } = await import('../utils/clickup-client');
          const client = new ClickUpClient();
          const isValid = await client.validateConnection();
          if (isValid) {
            console.log(chalk.green('✓ Successfully connected to ClickUp API'));
          } else {
            console.log(chalk.red('✗ Failed to connect to ClickUp API'));
            process.exit(1);
          }
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('create')
      .description('Create a new ClickUp task')
      .argument('[title]', 'Task title')
      .option('--list <list-id>', 'List ID to create the task in')
      .option('--description <description>', 'Task description')
      .option(
        '--priority <priority>',
        'Task priority (urgent, high, normal, low)',
        'normal'
      )
      .option('--assignee <user-id>', 'Assignee user ID')
      .option('--due <date>', 'Due date (YYYY-MM-DD format)')
      .option('--tags <tags>', 'Comma-separated tags')
      .option('--interactive', 'Use interactive mode for guided task creation')
      .action(
        async (
          title: string | undefined,
          options: {
            list?: string;
            description?: string;
            priority?: string;
            assignee?: string;
            due?: string;
            tags?: string;
            interactive?: boolean;
          }
        ) => {
          try {
            const { ClickUpClient } = await import('../utils/clickup-client');

            // Handle interactive mode
            if (options.interactive) {
              const { interactiveTaskCreation } = await import(
                '../utils/interactive-task-creation'
              );
              return await interactiveTaskCreation();
            }

            // Validate title is provided
            if (!title) {
              throw new Error(
                'Task title is required. Use --interactive for guided creation.'
              );
            }

            let listId = options.list;
            if (!listId) {
              const defaultListId = Config.get('clickup.defaultListId');
              if (!defaultListId) {
                throw new Error(
                  'No list ID provided and no default list configured. Use --list <list-id> or configure a default with: wfuwp clickup config set defaultListId <list-id>'
                );
              }
              listId = defaultListId;
            }

            // Parse and validate options
            const taskParams: any = {
              name: title,
              description: options.description,
            };

            // Handle priority
            if (options.priority) {
              const priorityMap: { [key: string]: number } = {
                urgent: 1,
                high: 2,
                normal: 3,
                low: 4,
              };
              const priority = priorityMap[options.priority.toLowerCase()];
              if (!priority) {
                throw new Error(
                  'Priority must be one of: urgent, high, normal, low'
                );
              }
              taskParams.priority = priority;
            }

            // Handle assignees
            if (options.assignee) {
              taskParams.assignees = [options.assignee];
            }

            // Handle due date
            if (options.due) {
              const dueDate = new Date(options.due);
              if (isNaN(dueDate.getTime())) {
                throw new Error(
                  'Invalid due date format. Use YYYY-MM-DD format.'
                );
              }
              taskParams.dueDate = dueDate.getTime();
            }

            // Handle tags
            if (options.tags) {
              taskParams.tags = options.tags
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0);
            }

            const client = new ClickUpClient();
            const taskData = await client.createTask(listId, taskParams);
            const task = taskData.task;

            // Enhanced success feedback
            console.log(chalk.green.bold('✓ Task created successfully!'));
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
              const dueDate = new Date(
                parseInt(task.due_date)
              ).toLocaleDateString();
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
          }
        }
      )
  )
  .addCommand(
    new Command('task')
      .description('Get details of a specific ClickUp task')
      .argument('<task-id>', 'Task ID to retrieve')
      .action(async (taskId: string) => {
        try {
          const { ClickUpClient } = await import('../utils/clickup-client');
          const client = new ClickUpClient();
          const taskData = await client.getTask(taskId);
          const task = taskData.task;
          console.log(chalk.blue.bold(`Task: ${task.name}`));
          console.log(`  ID: ${task.id}`);
          console.log(`  URL: ${task.url}`);
          console.log(`  Status: ${task.status.status}`);
          if (task.description) {
            console.log(`  Description: ${task.description}`);
          }
          if (task.assignees && task.assignees.length > 0) {
            const assigneeNames = task.assignees
              .map((a: any) => a.username)
              .join(', ');
            console.log(`  Assignees: ${assigneeNames}`);
          }
          if (task.tags && task.tags.length > 0) {
            const tagNames = task.tags.map((t: any) => t.name).join(', ');
            console.log(`  Tags: ${tagNames}`);
          }
          if (task.priority && task.priority.priority !== null) {
            const priorityMap: { [key: string]: string } = {
              '1': 'Urgent',
              '2': 'High',
              '3': 'Normal',
              '4': 'Low',
            };
            console.log(
              `  Priority: ${priorityMap[task.priority.priority] || task.priority.priority}`
            );
          }
          if (task.due_date) {
            const dueDate = new Date(
              parseInt(task.due_date)
            ).toLocaleDateString();
            console.log(`  Due Date: ${dueDate}`);
          }
          if (task.list) {
            console.log(`  List: ${task.list.name}`);
          }
          if (task.creator) {
            console.log(`  Created by: ${task.creator.username}`);
          }
          if (task.date_created) {
            const createdDate = new Date(
              parseInt(task.date_created)
            ).toLocaleDateString();
            console.log(`  Created: ${createdDate}`);
          }
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('whoami')
      .description('Get current ClickUp user information')
      .action(async () => {
        try {
          const { ClickUpClient } = await import('../utils/clickup-client');
          const client = new ClickUpClient();
          const user = await client.getUser();
          console.log(chalk.blue.bold('ClickUp User Information:'));
          console.log(`  Username: ${user.username}`);
          console.log(`  Email: ${user.email}`);
          console.log(`  ID: ${user.id}`);
          if (user.color) {
            console.log(`  Color: ${user.color}`);
          }
          if (user.profilePicture) {
            console.log(`  Profile Picture: ${user.profilePicture}`);
          }
        } catch (error) {
          console.error(
            chalk.red(
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          );
          process.exit(1);
        }
      })
  );
