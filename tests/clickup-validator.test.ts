import { ClickUpValidator } from '../src/utils/clickup-validator';

describe('ClickUpValidator', () => {
  describe('validateTaskTitle', () => {
    it('should validate correct task titles', () => {
      const result = ClickUpValidator.validateTaskTitle('Fix login bug');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty titles', () => {
      const result1 = ClickUpValidator.validateTaskTitle('');
      const result2 = ClickUpValidator.validateTaskTitle('   ');
      
      expect(result1.isValid).toBe(false);
      expect(result1.errors[0]).toContain('required');
      
      expect(result2.isValid).toBe(false);
      expect(result2.errors[0]).toContain('cannot be empty');
    });

    it('should warn about long titles', () => {
      const longTitle = 'A'.repeat(250);
      const veryLongTitle = 'A'.repeat(600);
      
      const result1 = ClickUpValidator.validateTaskTitle(longTitle);
      expect(result1.isValid).toBe(true);
      expect(result1.warnings[0]).toContain('very long');
      
      const result2 = ClickUpValidator.validateTaskTitle(veryLongTitle);
      expect(result2.isValid).toBe(false);
      expect(result2.errors[0]).toContain('too long');
    });
  });

  describe('validatePriority', () => {
    it('should validate correct priorities', () => {
      ['urgent', 'high', 'normal', 'low'].forEach(priority => {
        const result = ClickUpValidator.validatePriority(priority);
        expect(result.isValid).toBe(true);
      });
    });

    it('should handle case insensitive priorities', () => {
      const result = ClickUpValidator.validatePriority('HIGH');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid priorities', () => {
      const result = ClickUpValidator.validatePriority('invalid');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid priority');
    });

    it('should allow empty priority', () => {
      const result = ClickUpValidator.validatePriority('');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateDate', () => {
    it('should validate correct dates', () => {
      const result = ClickUpValidator.validateDate('2024-12-31');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid date formats', () => {
      const result = ClickUpValidator.validateDate('invalid-date');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid date format');
    });

    it('should warn about past due dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const pastDate = yesterday.toISOString().split('T')[0];
      
      const result = ClickUpValidator.validateDate(pastDate, 'due date');
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toContain('in the past');
    });

    it('should warn about far future dates', () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 15);
      const futureDate = farFuture.toISOString().split('T')[0];
      
      const result = ClickUpValidator.validateDate(futureDate);
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toContain('very far in the future');
    });

    it('should allow empty dates', () => {
      const result = ClickUpValidator.validateDate('');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateUserId', () => {
    it('should validate correct user IDs', () => {
      const result = ClickUpValidator.validateUserId('user123');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty user IDs when provided', () => {
      const result = ClickUpValidator.validateUserId('   ');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('non-empty string');
    });

    it('should warn about very short user IDs', () => {
      const result = ClickUpValidator.validateUserId('ab');
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toContain('very short');
    });

    it('should allow empty user ID', () => {
      const result = ClickUpValidator.validateUserId('');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateTags', () => {
    it('should validate correct tags', () => {
      const result = ClickUpValidator.validateTags('bug,urgent,frontend');
      expect(result.isValid).toBe(true);
    });

    it('should handle tags with spaces', () => {
      const result = ClickUpValidator.validateTags('bug, urgent , frontend');
      expect(result.isValid).toBe(true);
    });

    it('should reject very long tags', () => {
      const longTag = 'a'.repeat(150);
      const result = ClickUpValidator.validateTags(`bug,${longTag}`);
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('too long');
    });

    it('should warn about too many tags', () => {
      const manyTags = Array.from({ length: 25 }, (_, i) => `tag${i}`).join(',');
      const result = ClickUpValidator.validateTags(manyTags);
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toContain('Many tags');
    });

    it('should warn about duplicate tags', () => {
      const result = ClickUpValidator.validateTags('bug,urgent,BUG');
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toContain('Duplicate tags');
    });

    it('should allow empty tags', () => {
      const result = ClickUpValidator.validateTags('');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateListId', () => {
    it('should validate correct list IDs', () => {
      const result = ClickUpValidator.validateListId('list12345');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty list IDs', () => {
      const result = ClickUpValidator.validateListId('');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('required');
    });

    it('should warn about short list IDs', () => {
      const result = ClickUpValidator.validateListId('abc');
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toContain('very short');
    });
  });

  describe('validateExportFormat', () => {
    it('should validate correct export formats', () => {
      ['csv', 'json', 'markdown', 'md'].forEach(format => {
        const result = ClickUpValidator.validateExportFormat(format);
        expect(result.isValid).toBe(true);
      });
    });

    it('should handle case insensitive formats', () => {
      const result = ClickUpValidator.validateExportFormat('CSV');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid formats', () => {
      const result = ClickUpValidator.validateExportFormat('xml');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Invalid export format');
    });

    it('should reject empty formats', () => {
      const result = ClickUpValidator.validateExportFormat('');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('required');
    });
  });

  describe('validatePageNumber', () => {
    it('should validate correct page numbers', () => {
      const result = ClickUpValidator.validatePageNumber('5');
      expect(result.isValid).toBe(true);
    });

    it('should reject non-numeric page numbers', () => {
      const result = ClickUpValidator.validatePageNumber('abc');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('valid integer');
    });

    it('should reject zero or negative page numbers', () => {
      const result = ClickUpValidator.validatePageNumber('0');
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('greater than 0');
    });

    it('should warn about very high page numbers', () => {
      const result = ClickUpValidator.validatePageNumber('1500');
      expect(result.isValid).toBe(true);
      expect(result.warnings[0]).toContain('Very high page number');
    });

    it('should allow empty page numbers', () => {
      const result = ClickUpValidator.validatePageNumber('');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateTaskData', () => {
    it('should validate complete task data', () => {
      const taskData = {
        name: 'Valid Task',
        priority: 'high',
        dueDate: '2024-12-31',
        assignee: 'user123',
        tags: 'bug,urgent'
      };
      
      const result = ClickUpValidator.validateTaskData(taskData);
      expect(result.isValid).toBe(true);
    });

    it('should collect multiple validation errors', () => {
      const taskData = {
        name: '',
        priority: 'invalid',
        dueDate: 'invalid-date',
        assignee: '',
        tags: 'a'.repeat(150)
      };
      
      const result = ClickUpValidator.validateTaskData(taskData);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('combineValidationResults', () => {
    it('should combine multiple validation results', () => {
      const results = [
        { isValid: true, errors: [], warnings: ['Warning 1'] },
        { isValid: false, errors: ['Error 1'], warnings: [] },
        { isValid: true, errors: [], warnings: ['Warning 2'] }
      ];
      
      const combined = ClickUpValidator.combineValidationResults(results);
      
      expect(combined.isValid).toBe(false);
      expect(combined.errors).toEqual(['Error 1']);
      expect(combined.warnings).toEqual(['Warning 1', 'Warning 2']);
    });

    it('should return valid when all results are valid', () => {
      const results = [
        { isValid: true, errors: [], warnings: [] },
        { isValid: true, errors: [], warnings: ['Warning'] }
      ];
      
      const combined = ClickUpValidator.combineValidationResults(results);
      expect(combined.isValid).toBe(true);
    });
  });
});