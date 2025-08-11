import { BatchTaskCreator } from '../src/utils/batch-task-creator';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';

describe('BatchTaskCreator', () => {
  const testFiles: string[] = [];

  afterEach(async () => {
    for (const file of testFiles) {
      if (existsSync(file)) {
        await unlink(file);
      }
    }
    testFiles.length = 0;
  });

  describe('parsePlainTextFile', () => {
    it('should parse simple task list from plain text file', async () => {
      const content = `Task 1
Task 2 | High priority
Task 3 | @john | Due: 2024-12-31
# This is a comment
Task 4 | Tags: bug,feature | Desc: Test description`;
      
      const filename = 'test-tasks.txt';
      testFiles.push(filename);
      await writeFile(filename, content);
      
      const tasks = await BatchTaskCreator.parsePlainTextFile(filename);
      
      expect(tasks).toHaveLength(4);
      expect(tasks[0]).toEqual({ name: 'Task 1' });
      expect(tasks[1]).toEqual({ name: 'Task 2', priority: 'high' });
      expect(tasks[2]).toEqual({ name: 'Task 3', assignee: 'john', dueDate: '2024-12-31' });
      expect(tasks[3]).toEqual({
        name: 'Task 4',
        tags: ['bug', 'feature'],
        description: 'Test description'
      });
    });

    it('should skip comments and empty lines', async () => {
      const content = `# Comment
Task 1
// Another comment

Task 2`;
      
      const filename = 'test-tasks-comments.txt';
      testFiles.push(filename);
      await writeFile(filename, content);
      
      const tasks = await BatchTaskCreator.parsePlainTextFile(filename);
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].name).toBe('Task 1');
      expect(tasks[1].name).toBe('Task 2');
    });
  });

  describe('parseJsonFile', () => {
    it('should parse tasks from JSON file with tasks array', async () => {
      const data = {
        tasks: [
          {
            name: 'JSON Task 1',
            priority: 'high',
            assignee: 'john'
          },
          {
            title: 'JSON Task 2',
            description: 'Test description',
            due_date: '2024-12-31',
            tags: ['test', 'json']
          }
        ]
      };
      
      const filename = 'test-tasks.json';
      testFiles.push(filename);
      await writeFile(filename, JSON.stringify(data));
      
      const tasks = await BatchTaskCreator.parseJsonFile(filename);
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0]).toEqual({
        name: 'JSON Task 1',
        priority: 'high',
        assignee: 'john',
        description: undefined,
        dueDate: undefined,
        tags: undefined
      });
      expect(tasks[1]).toEqual({
        name: 'JSON Task 2',
        description: 'Test description',
        dueDate: '2024-12-31',
        tags: ['test', 'json'],
        priority: undefined,
        assignee: undefined
      });
    });

    it('should parse tasks from JSON file with direct array', async () => {
      const data = [
        { name: 'Direct Array Task 1' },
        { name: 'Direct Array Task 2', priority: 'urgent' }
      ];
      
      const filename = 'test-tasks-array.json';
      testFiles.push(filename);
      await writeFile(filename, JSON.stringify(data));
      
      const tasks = await BatchTaskCreator.parseJsonFile(filename);
      
      expect(tasks).toHaveLength(2);
      expect(tasks[0].name).toBe('Direct Array Task 1');
      expect(tasks[1].priority).toBe('urgent');
    });

    it('should handle tags as string and split them', async () => {
      const data = {
        tasks: [
          { name: 'Task with string tags', tags: 'tag1, tag2, tag3' }
        ]
      };
      
      const filename = 'test-tasks-string-tags.json';
      testFiles.push(filename);
      await writeFile(filename, JSON.stringify(data));
      
      const tasks = await BatchTaskCreator.parseJsonFile(filename);
      
      expect(tasks[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should throw error for invalid JSON structure', async () => {
      const data = { invalid: 'structure' };
      
      const filename = 'test-invalid.json';
      testFiles.push(filename);
      await writeFile(filename, JSON.stringify(data));
      
      await expect(BatchTaskCreator.parseJsonFile(filename))
        .rejects.toThrow('JSON file must contain an array of tasks');
    });

    it('should throw error for tasks without name or title', async () => {
      const data = {
        tasks: [
          { description: 'Task without name' }
        ]
      };
      
      const filename = 'test-no-name.json';
      testFiles.push(filename);
      await writeFile(filename, JSON.stringify(data));
      
      await expect(BatchTaskCreator.parseJsonFile(filename))
        .rejects.toThrow('Task at index 0 is missing required "name" or "title" field');
    });
  });

  describe('parseFile', () => {
    it('should route to correct parser based on file extension', async () => {
      const txtContent = 'Text Task 1';
      const jsonContent = JSON.stringify({ tasks: [{ name: 'JSON Task 1' }] });
      
      const txtFile = 'test.txt';
      const jsonFile = 'test.json';
      testFiles.push(txtFile, jsonFile);
      
      await writeFile(txtFile, txtContent);
      await writeFile(jsonFile, jsonContent);
      
      const txtTasks = await BatchTaskCreator.parseFile(txtFile);
      const jsonTasks = await BatchTaskCreator.parseFile(jsonFile);
      
      expect(txtTasks[0].name).toBe('Text Task 1');
      expect(jsonTasks[0].name).toBe('JSON Task 1');
    });

    it('should throw error for unsupported file extension', async () => {
      await expect(BatchTaskCreator.parseFile('test.xml'))
        .rejects.toThrow('Unsupported file format: xml');
    });
  });

  describe('createTasksBatch', () => {
    const mockClient = {
      createTask: jest.fn()
    };

    beforeEach(() => {
      mockClient.createTask.mockReset();
    });

    it('should create tasks successfully', async () => {
      const tasks = [
        { name: 'Task 1', priority: 'high' },
        { name: 'Task 2', assignee: 'john' }
      ];

      mockClient.createTask
        .mockResolvedValueOnce({ task: { id: 'task1', name: 'Task 1' } })
        .mockResolvedValueOnce({ task: { id: 'task2', name: 'Task 2' } });

      const results = await BatchTaskCreator.createTasksBatch(mockClient, 'list123', tasks);

      expect(results.successful).toHaveLength(2);
      expect(results.failed).toHaveLength(0);
      expect(mockClient.createTask).toHaveBeenCalledTimes(2);
      expect(mockClient.createTask).toHaveBeenCalledWith('list123', {
        name: 'Task 1',
        priority: 2
      });
    });

    it('should handle task creation failures', async () => {
      const tasks = [
        { name: 'Task 1' },
        { name: 'Task 2' }
      ];

      mockClient.createTask
        .mockResolvedValueOnce({ task: { id: 'task1', name: 'Task 1' } })
        .mockRejectedValueOnce(new Error('API Error'));

      const results = await BatchTaskCreator.createTasksBatch(mockClient, 'list123', tasks);

      expect(results.successful).toHaveLength(1);
      expect(results.failed).toHaveLength(1);
      expect(results.failed[0].error).toBe('API Error');
    });

    it('should throw error for empty task list', async () => {
      await expect(BatchTaskCreator.createTasksBatch(mockClient, 'list123', []))
        .rejects.toThrow('No tasks to create');
    });

    it('should convert priority strings to numbers', async () => {
      const tasks = [
        { name: 'Urgent Task', priority: 'urgent' },
        { name: 'High Task', priority: 'high' },
        { name: 'Normal Task', priority: 'normal' },
        { name: 'Low Task', priority: 'low' }
      ];

      mockClient.createTask.mockResolvedValue({ task: { id: 'test', name: 'test' } });

      await BatchTaskCreator.createTasksBatch(mockClient, 'list123', tasks);

      expect(mockClient.createTask).toHaveBeenCalledWith('list123', { name: 'Urgent Task', priority: 1 });
      expect(mockClient.createTask).toHaveBeenCalledWith('list123', { name: 'High Task', priority: 2 });
      expect(mockClient.createTask).toHaveBeenCalledWith('list123', { name: 'Normal Task', priority: 3 });
      expect(mockClient.createTask).toHaveBeenCalledWith('list123', { name: 'Low Task', priority: 4 });
    });
  });

  describe('generateExampleFiles', () => {
    it('should generate example files with proper format', () => {
      const examples = BatchTaskCreator.generateExampleFiles();
      
      expect(examples.plainText).toContain('Fix login bug');
      expect(examples.plainText).toContain('High priority');
      expect(examples.plainText).toContain('@john');
      expect(examples.plainText).toContain('Due: 2024-12-31');
      
      const jsonData = JSON.parse(examples.json);
      expect(jsonData.tasks).toBeDefined();
      expect(jsonData.tasks).toHaveLength(4);
      expect(jsonData.tasks[0].name).toBe('Fix login bug');
      expect(jsonData.tasks[0].priority).toBe('high');
    });
  });
});