import { TaskExporter } from '../src/utils/task-exporter';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

describe('TaskExporter', () => {
  const mockTasks = [
    {
      id: 'task1',
      name: 'Test Task 1',
      status: { status: 'open' },
      priority: { priority: '2' },
      assignees: [{ username: 'john' }],
      tags: [{ name: 'urgent' }, { name: 'bug' }],
      due_date: '1703980800000',
      date_created: '1703894400000',
      date_updated: '1703980800000',
      description: 'Test description',
      url: 'https://app.clickup.com/t/task1',
      list: { name: 'Test List' },
      folder: { name: 'Test Folder' },
      space: { name: 'Test Space' },
      time_estimate: '14400000',
      time_spent: '7200000'
    },
    {
      id: 'task2',
      name: 'Test Task 2',
      status: { status: 'in progress' },
      priority: null,
      assignees: [],
      tags: [],
      due_date: null,
      date_created: '1703894400000',
      date_updated: '1703980800000',
      description: '',
      url: 'https://app.clickup.com/t/task2',
      list: { name: 'Test List' },
      folder: null,
      space: { name: 'Test Space' },
      time_estimate: null,
      time_spent: null
    }
  ];

  afterEach(async () => {
    const testFiles = [
      'test-export.csv',
      'test-export.json',
      'test-export.md'
    ];
    
    for (const file of testFiles) {
      if (existsSync(file)) {
        await unlink(file);
      }
    }
  });

  describe('prepareTaskForExport', () => {
    it('should correctly format task data for export', () => {
      const result = TaskExporter.prepareTaskForExport(mockTasks[0]);
      
      expect(result.id).toBe('task1');
      expect(result.name).toBe('Test Task 1');
      expect(result.status).toBe('open');
      expect(result.priority).toBe('High');
      expect(result.assignees).toBe('@john');
      expect(result.tags).toBe('#urgent, #bug');
      expect(result.description).toBe('Test description');
      expect(result.url).toBe('https://app.clickup.com/t/task1');
      expect(result.list).toBe('Test List');
      expect(result.folder).toBe('Test Folder');
      expect(result.space).toBe('Test Space');
      expect(result.timeEstimate).toBe('4h');
      expect(result.timeSpent).toBe('2h');
    });

    it('should handle tasks with missing data', () => {
      const result = TaskExporter.prepareTaskForExport(mockTasks[1]);
      
      expect(result.priority).toBe('None');
      expect(result.assignees).toBe('');
      expect(result.tags).toBe('');
      expect(result.dueDate).toBe('');
      expect(result.folder).toBe('');
      expect(result.timeEstimate).toBe('');
      expect(result.timeSpent).toBe('');
    });
  });

  describe('exportToCsv', () => {
    it('should export tasks to CSV format', async () => {
      const filename = await TaskExporter.exportToCsv(mockTasks, 'test-export.csv');
      
      expect(filename).toBe('test-export.csv');
      expect(existsSync(filename)).toBe(true);
      
      const content = await readFile(filename, 'utf8');
      expect(content).toContain('ID,Title,Status,Priority');
      expect(content).toContain('task1,Test Task 1,open,High');
      expect(content).toContain('task2,Test Task 2,in progress,None');
    });

    it('should handle CSV field escaping', async () => {
      const taskWithCommas = {
        ...mockTasks[0],
        name: 'Task, with commas',
        description: 'Description with "quotes" and, commas'
      };
      
      const filename = await TaskExporter.exportToCsv([taskWithCommas], 'test-export.csv');
      const content = await readFile(filename, 'utf8');
      
      expect(content).toContain('"Task, with commas"');
      expect(content).toContain('"Description with ""quotes"" and, commas"');
    });
  });

  describe('exportToJson', () => {
    it('should export tasks to JSON format', async () => {
      const filename = await TaskExporter.exportToJson(mockTasks, 'test-export.json');
      
      expect(filename).toBe('test-export.json');
      expect(existsSync(filename)).toBe(true);
      
      const content = await readFile(filename, 'utf8');
      const data = JSON.parse(content);
      
      expect(data.taskCount).toBe(2);
      expect(data.tasks).toHaveLength(2);
      expect(data.tasks[0].id).toBe('task1');
      expect(data.exportDate).toBeDefined();
    });
  });

  describe('exportToMarkdown', () => {
    it('should export tasks to Markdown format', async () => {
      const filename = await TaskExporter.exportToMarkdown(mockTasks, 'test-export.md');
      
      expect(filename).toBe('test-export.md');
      expect(existsSync(filename)).toBe(true);
      
      const content = await readFile(filename, 'utf8');
      expect(content).toContain('# ClickUp Tasks Export');
      expect(content).toContain('### 1. Test Task 1');
      expect(content).toContain('**Priority:** High');
      expect(content).toContain('[View Task](https://app.clickup.com/t/task1)');
    });
  });

  describe('exportTasks', () => {
    it('should export to correct format based on format parameter', async () => {
      await expect(TaskExporter.exportTasks(mockTasks, 'csv', 'test-export.csv')).resolves.toBe('test-export.csv');
      await expect(TaskExporter.exportTasks(mockTasks, 'json', 'test-export.json')).resolves.toBe('test-export.json');
      await expect(TaskExporter.exportTasks(mockTasks, 'markdown', 'test-export.md')).resolves.toBe('test-export.md');
    });

    it('should throw error for unsupported format', async () => {
      await expect(TaskExporter.exportTasks(mockTasks, 'xml')).rejects.toThrow('Unsupported export format');
    });

    it('should throw error for empty task list', async () => {
      await expect(TaskExporter.exportTasks([], 'csv')).rejects.toThrow('No tasks to export');
    });

    it('should generate default filename when none provided', async () => {
      const filename = await TaskExporter.exportTasks(mockTasks, 'csv');
      expect(filename).toMatch(/clickup_tasks_\d{4}-\d{2}-\d{2}\.csv/);
      
      if (existsSync(filename)) {
        await unlink(filename);
      }
    });
  });
});