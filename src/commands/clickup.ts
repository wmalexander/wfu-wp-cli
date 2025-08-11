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
          const { TaskFormatter } = await import('../utils/task-formatter');
          const client = new ClickUpClient();
          const taskData = await client.getTask(taskId);
          const task = taskData.task;
          TaskFormatter.formatTaskDetails(task);
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
  )
  .addCommand(
    new Command('tasks')
      .description('List tasks from a ClickUp list with filtering options')
      .option('--list <list-id>', 'List ID to get tasks from')
      .option('--status <statuses>', 'Filter by comma-separated status names')
      .option('--assignee <assignees>', 'Filter by comma-separated user IDs')
      .option('--tag <tags>', 'Filter by comma-separated tag names')
      .option(
        '--priority <priority>',
        'Filter by priority (urgent, high, normal, low)'
      )
      .option('--due-before <date>', 'Show tasks due before date (YYYY-MM-DD)')
      .option('--due-after <date>', 'Show tasks due after date (YYYY-MM-DD)')
      .option(
        '--created-before <date>',
        'Show tasks created before date (YYYY-MM-DD)'
      )
      .option(
        '--created-after <date>',
        'Show tasks created after date (YYYY-MM-DD)'
      )
      .option(
        '--updated-before <date>',
        'Show tasks updated before date (YYYY-MM-DD)'
      )
      .option(
        '--updated-after <date>',
        'Show tasks updated after date (YYYY-MM-DD)'
      )
      .option('--include-closed', 'Include closed/completed tasks')
      .option('--include-archived', 'Include archived tasks')
      .option('--page <number>', 'Page number for pagination (default: 1)')
      .option('--my-tasks', 'Quick filter: Show only tasks assigned to me')
      .option('--overdue', 'Quick filter: Show only overdue tasks')
      .option('--due-today', 'Quick filter: Show tasks due today')
      .option('--due-this-week', 'Quick filter: Show tasks due this week')
      .option('--urgent', 'Quick filter: Show only urgent priority tasks')
      .option(
        '--high-priority',
        'Quick filter: Show urgent and high priority tasks'
      )
      .option('--recent', 'Quick filter: Show tasks updated in last 7 days')
      .action(
        async (options: {
          list?: string;
          status?: string;
          assignee?: string;
          tag?: string;
          priority?: string;
          dueBefore?: string;
          dueAfter?: string;
          createdBefore?: string;
          createdAfter?: string;
          updatedBefore?: string;
          updatedAfter?: string;
          includeClosed?: boolean;
          includeArchived?: boolean;
          page?: string;
          myTasks?: boolean;
          overdue?: boolean;
          dueToday?: boolean;
          dueThisWeek?: boolean;
          urgent?: boolean;
          highPriority?: boolean;
          recent?: boolean;
        }) => {
          try {
            const { ClickUpClient } = await import('../utils/clickup-client');
            const { TaskFormatter } = await import('../utils/task-formatter');
            const client = new ClickUpClient();
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
            if (options.myTasks && !options.assignee) {
              try {
                const user = await client.getUser();
                options.assignee = user.id;
              } catch (error) {
                throw new Error(
                  'Could not get current user ID for --my-tasks filter'
                );
              }
            }
            const now = new Date();
            const today = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            );
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const weekFromNow = new Date(today);
            weekFromNow.setDate(weekFromNow.getDate() + 7);
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (options.overdue && !options.dueBefore) {
              options.dueBefore = today.toISOString().split('T')[0];
            }
            if (options.dueToday && !options.dueBefore && !options.dueAfter) {
              options.dueAfter = today.toISOString().split('T')[0];
              options.dueBefore = tomorrow.toISOString().split('T')[0];
            }
            if (options.dueThisWeek && !options.dueBefore) {
              options.dueBefore = weekFromNow.toISOString().split('T')[0];
              if (!options.dueAfter) {
                options.dueAfter = today.toISOString().split('T')[0];
              }
            }
            if (options.urgent && !options.priority) {
              options.priority = 'urgent';
            }
            if (options.recent && !options.updatedAfter) {
              options.updatedAfter = weekAgo.toISOString().split('T')[0];
            }
            const parseDate = (dateStr: string): number => {
              const date = new Date(dateStr);
              if (isNaN(date.getTime())) {
                throw new Error(
                  `Invalid date format: ${dateStr}. Use YYYY-MM-DD format.`
                );
              }
              return date.getTime();
            };
            const filterOptions: any = {
              includeClosed: options.includeClosed,
              includeArchived: options.includeArchived,
            };
            if (options.status) {
              filterOptions.statuses = options.status
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            }
            if (options.assignee) {
              filterOptions.assignees = options.assignee
                .split(',')
                .map((a) => a.trim())
                .filter((a) => a.length > 0);
            }
            if (options.tag) {
              filterOptions.tags = options.tag
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
            }
            if (options.dueBefore) {
              filterOptions.dueDateLt = parseDate(options.dueBefore);
            }
            if (options.dueAfter) {
              filterOptions.dueDateGt = parseDate(options.dueAfter);
            }
            if (options.createdBefore) {
              filterOptions.dateCreatedLt = parseDate(options.createdBefore);
            }
            if (options.createdAfter) {
              filterOptions.dateCreatedGt = parseDate(options.createdAfter);
            }
            if (options.updatedBefore) {
              filterOptions.dateUpdatedLt = parseDate(options.updatedBefore);
            }
            if (options.updatedAfter) {
              filterOptions.dateUpdatedGt = parseDate(options.updatedAfter);
            }
            if (options.page) {
              const pageNum = parseInt(options.page, 10);
              if (isNaN(pageNum) || pageNum < 1) {
                throw new Error('Page number must be a positive integer');
              }
              filterOptions.page = pageNum;
            }
            const response = await client.getTasks(listId, filterOptions);
            let tasks = response.tasks || [];
            if (options.priority) {
              const priorityMap: { [key: string]: string } = {
                urgent: '1',
                high: '2',
                normal: '3',
                low: '4',
              };
              const targetPriority =
                priorityMap[options.priority.toLowerCase()];
              if (!targetPriority) {
                throw new Error(
                  'Priority must be one of: urgent, high, normal, low'
                );
              }
              tasks = tasks.filter(
                (task: any) =>
                  task.priority && task.priority.priority === targetPriority
              );
            }
            if (options.highPriority) {
              tasks = tasks.filter(
                (task: any) =>
                  task.priority &&
                  (task.priority.priority === '1' ||
                    task.priority.priority === '2')
              );
            }
            if (tasks.length === 0) {
              console.log(
                chalk.yellow('No tasks found matching the specified criteria.')
              );
              return;
            }
            console.log(
              chalk.blue.bold(`Tasks from List (Page ${options.page || '1'}):`)
            );
            console.log('');
            TaskFormatter.formatTaskList(tasks);
            if (filterOptions.page) {
              console.log('');
              console.log(
                chalk.gray(
                  `Use --page ${(filterOptions.page || 1) + 1} to see more tasks`
                )
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
        }
      )
  )
  .addCommand(
    new Command('lists')
      .description('List available ClickUp lists and workspace navigation')
      .option(
        '--workspace <workspace-id>',
        'Show lists from specific workspace'
      )
      .option('--space <space-id>', 'Show lists from specific space')
      .option('--folder <folder-id>', 'Show lists from specific folder')
      .option('--all', 'Show full workspace hierarchy')
      .action(
        async (options: {
          workspace?: string;
          space?: string;
          folder?: string;
          all?: boolean;
        }) => {
          try {
            const { ClickUpClient } = await import('../utils/clickup-client');
            const client = new ClickUpClient();
            if (options.folder) {
              const listsData = await client.getLists(options.folder);
              const lists = listsData.lists || [];
              if (lists.length === 0) {
                console.log(chalk.yellow('No lists found in this folder.'));
                return;
              }
              console.log(chalk.blue.bold('Lists in Folder:'));
              console.log('');
              lists.forEach((list: any) => {
                console.log(
                  `  ${chalk.cyan(list.id)} - ${chalk.white(list.name)}`
                );
                if (list.task_count !== undefined) {
                  console.log(`    ${chalk.gray(`${list.task_count} tasks`)}`);
                }
              });
              return;
            }
            if (options.space) {
              console.log(chalk.blue.bold('Space Structure and Lists:'));
              console.log('');
              const foldersData = await client.getFolders(options.space);
              const folders = foldersData.folders || [];
              if (folders.length > 0) {
                console.log(chalk.yellow.bold('📁 Folders:'));
                for (const folder of folders) {
                  console.log(
                    `  ${chalk.cyan(folder.id)} - ${chalk.white(folder.name)}`
                  );
                  try {
                    const listsData = await client.getLists(folder.id);
                    const lists = listsData.lists || [];
                    lists.forEach((list: any) => {
                      console.log(
                        `    └─ ${chalk.green(list.id)} - ${chalk.white(list.name)} ${chalk.gray(`(${list.task_count || 0} tasks)`)}`
                      );
                    });
                  } catch (error) {
                    console.log(`    └─ ${chalk.red('Error loading lists')}`);
                  }
                }
                console.log('');
              }
              const folderlessListsData = await client.getFolderlessLists(
                options.space
              );
              const folderlessLists = folderlessListsData.lists || [];
              if (folderlessLists.length > 0) {
                console.log(chalk.green.bold('📝 Lists (no folder):'));
                folderlessLists.forEach((list: any) => {
                  console.log(
                    `  ${chalk.green(list.id)} - ${chalk.white(list.name)} ${chalk.gray(`(${list.task_count || 0} tasks)`)}`
                  );
                });
              }
              return;
            }
            if (options.workspace) {
              console.log(chalk.blue.bold('Workspace Structure:'));
              console.log('');
              const spacesData = await client.getSpaces(options.workspace);
              const spaces = spacesData.spaces || [];
              if (spaces.length === 0) {
                console.log(chalk.yellow('No spaces found in this workspace.'));
                return;
              }
              for (const space of spaces) {
                console.log(
                  `${chalk.magenta.bold('🏢 Space:')} ${chalk.cyan(space.id)} - ${chalk.white(space.name)}`
                );
                console.log('');
                try {
                  const foldersData = await client.getFolders(space.id);
                  const folders = foldersData.folders || [];
                  if (folders.length > 0) {
                    console.log('  📁 Folders:');
                    for (const folder of folders) {
                      console.log(
                        `    ${chalk.cyan(folder.id)} - ${chalk.white(folder.name)}`
                      );
                      if (options.all) {
                        try {
                          const listsData = await client.getLists(folder.id);
                          const lists = listsData.lists || [];
                          lists.forEach((list: any) => {
                            console.log(
                              `      └─ ${chalk.green(list.id)} - ${chalk.white(list.name)}`
                            );
                          });
                        } catch (error) {
                          console.log(
                            `      └─ ${chalk.red('Error loading lists')}`
                          );
                        }
                      }
                    }
                  }
                  const folderlessListsData = await client.getFolderlessLists(
                    space.id
                  );
                  const folderlessLists = folderlessListsData.lists || [];
                  if (folderlessLists.length > 0) {
                    console.log('  📝 Lists (no folder):');
                    folderlessLists.forEach((list: any) => {
                      console.log(
                        `    ${chalk.green(list.id)} - ${chalk.white(list.name)}`
                      );
                    });
                  }
                } catch (error) {
                  console.log(`  ${chalk.red('Error loading space contents')}`);
                }
                console.log('');
              }
              return;
            }
            const workspacesData = await client.getWorkspaces();
            const workspaces = workspacesData.teams || [];
            if (workspaces.length === 0) {
              console.log(chalk.yellow('No workspaces found.'));
              return;
            }
            console.log(chalk.blue.bold('Available Workspaces:'));
            console.log('');
            workspaces.forEach((workspace: any) => {
              console.log(
                `${chalk.magenta.bold('🏢 Workspace:')} ${chalk.cyan(workspace.id)} - ${chalk.white(workspace.name)}`
              );
              if (workspace.members && workspace.members.length > 0) {
                console.log(
                  `   ${chalk.gray(`${workspace.members.length} members`)}`
                );
              }
            });
            console.log('');
            console.log(
              chalk.gray(
                'Use --workspace <id> to explore spaces and lists in a workspace'
              )
            );
            console.log(
              chalk.gray('Use --all with --workspace to see complete hierarchy')
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
    new Command('search')
      .description('Search tasks across ClickUp workspace')
      .argument('<query>', 'Search query')
      .option('--workspace <workspace-id>', 'Workspace to search in')
      .option('--page <number>', 'Page number for pagination (default: 1)')
      .option('--limit <number>', 'Number of results per page (max: 100)')
      .action(
        async (
          query: string,
          options: {
            workspace?: string;
            page?: string;
            limit?: string;
          }
        ) => {
          try {
            const { ClickUpClient } = await import('../utils/clickup-client');
            const { TaskFormatter } = await import('../utils/task-formatter');
            const client = new ClickUpClient();
            let workspaceId = options.workspace;
            if (!workspaceId) {
              const defaultWorkspaceId = Config.get(
                'clickup.defaultWorkspaceId'
              );
              if (!defaultWorkspaceId) {
                throw new Error(
                  'No workspace ID provided and no default workspace configured. Use --workspace <workspace-id> or configure a default with: wfuwp clickup config set defaultWorkspaceId <workspace-id>'
                );
              }
              workspaceId = defaultWorkspaceId;
            }
            const searchOptions: any = {};
            if (options.page) {
              const pageNum = parseInt(options.page, 10);
              if (isNaN(pageNum) || pageNum < 1) {
                throw new Error('Page number must be a positive integer');
              }
              searchOptions.page = pageNum;
            }
            if (options.limit) {
              const limitNum = parseInt(options.limit, 10);
              if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                throw new Error('Limit must be between 1 and 100');
              }
              searchOptions.limit = limitNum;
            }
            const response = await client.searchTasks(
              workspaceId,
              query,
              searchOptions
            );
            const tasks = response.tasks || [];
            if (tasks.length === 0) {
              console.log(chalk.yellow(`No tasks found matching "${query}".`));
              return;
            }
            console.log(
              chalk.blue.bold(
                `Search Results for "${query}" (Page ${options.page || '1'}):`
              )
            );
            console.log('');
            TaskFormatter.formatTaskList(tasks);
            if (searchOptions.page) {
              console.log('');
              console.log(
                chalk.gray(
                  `Use --page ${(searchOptions.page || 1) + 1} to see more results`
                )
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
        }
      )
  );
