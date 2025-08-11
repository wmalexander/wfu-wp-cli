import chalk from 'chalk';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class ClickUpValidator {
  static validateTaskTitle(title: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!title) {
      result.isValid = false;
      result.errors.push('Task title is required');
      return result;
    }
    if (title.trim().length === 0) {
      result.isValid = false;
      result.errors.push('Task title cannot be empty or only whitespace');
      return result;
    }
    if (title.length > 200) {
      result.warnings.push(
        'Task title is very long (>200 chars). Consider shortening it.'
      );
    }
    if (title.length > 500) {
      result.isValid = false;
      result.errors.push(
        'Task title is too long (>500 chars). ClickUp has title length limits.'
      );
    }
    return result;
  }
  static validatePriority(priority: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!priority) return result;
    const validPriorities = ['urgent', 'high', 'normal', 'low'];
    if (!validPriorities.includes(priority.toLowerCase())) {
      result.isValid = false;
      result.errors.push(
        `Invalid priority "${priority}". Valid options: ${validPriorities.join(', ')}`
      );
    }
    return result;
  }
  static validateDate(
    dateString: string,
    fieldName: string = 'date'
  ): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!dateString) return result;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      result.isValid = false;
      result.errors.push(
        `Invalid ${fieldName} format. Use YYYY-MM-DD format (e.g., 2024-12-31)`
      );
      return result;
    }
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (fieldName.includes('due') && date < today) {
      result.warnings.push(
        `${fieldName} is in the past. Task will be immediately overdue.`
      );
    }
    const futureLimit = new Date();
    futureLimit.setFullYear(futureLimit.getFullYear() + 10);
    if (date > futureLimit) {
      result.warnings.push(
        `${fieldName} is very far in the future (>10 years). Please verify the date.`
      );
    }
    return result;
  }
  static validateUserId(userId: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!userId) return result;
    if (typeof userId !== 'string' || userId.trim().length === 0) {
      result.isValid = false;
      result.errors.push('User ID must be a non-empty string');
      return result;
    }
    if (userId.length < 3) {
      result.warnings.push(
        'User ID seems very short. Please verify it is correct.'
      );
    }
    return result;
  }
  static validateTags(tagsString: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!tagsString) return result;
    const tags = tagsString
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (tags.length === 0) {
      result.warnings.push('No valid tags found after parsing');
      return result;
    }
    const invalidTags = tags.filter((tag) => tag.length > 100);
    if (invalidTags.length > 0) {
      result.isValid = false;
      result.errors.push(
        `Tags are too long (>100 chars): ${invalidTags.join(', ')}`
      );
    }
    if (tags.length > 20) {
      result.warnings.push(
        `Many tags specified (${tags.length}). Consider using fewer, more focused tags.`
      );
    }
    const duplicateTags = tags.filter(
      (tag, index) => tags.indexOf(tag.toLowerCase()) !== index
    );
    if (duplicateTags.length > 0) {
      result.warnings.push(`Duplicate tags found: ${duplicateTags.join(', ')}`);
    }
    return result;
  }
  static validateListId(listId: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!listId) {
      result.isValid = false;
      result.errors.push('List ID is required');
      return result;
    }
    if (typeof listId !== 'string' || listId.trim().length === 0) {
      result.isValid = false;
      result.errors.push('List ID must be a non-empty string');
      return result;
    }
    if (listId.length < 5) {
      result.warnings.push(
        'List ID seems very short. Please verify it is correct.'
      );
    }
    return result;
  }
  static validateExportFormat(format: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!format) {
      result.isValid = false;
      result.errors.push('Export format is required');
      return result;
    }
    const validFormats = ['csv', 'json', 'markdown', 'md'];
    if (!validFormats.includes(format.toLowerCase())) {
      result.isValid = false;
      result.errors.push(
        `Invalid export format "${format}". Valid options: ${validFormats.join(', ')}`
      );
    }
    return result;
  }
  static validatePageNumber(page: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    if (!page) return result;
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum)) {
      result.isValid = false;
      result.errors.push('Page number must be a valid integer');
      return result;
    }
    if (pageNum < 1) {
      result.isValid = false;
      result.errors.push('Page number must be greater than 0');
      return result;
    }
    if (pageNum > 1000) {
      result.warnings.push(
        'Very high page number requested. This may take a while to load.'
      );
    }
    return result;
  }
  static validateTaskData(taskData: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };
    const titleValidation = this.validateTaskTitle(
      taskData.name || taskData.title
    );
    result.errors.push(...titleValidation.errors);
    result.warnings.push(...titleValidation.warnings);
    if (!titleValidation.isValid) result.isValid = false;
    if (taskData.priority) {
      const priorityValidation = this.validatePriority(taskData.priority);
      result.errors.push(...priorityValidation.errors);
      result.warnings.push(...priorityValidation.warnings);
      if (!priorityValidation.isValid) result.isValid = false;
    }
    if (taskData.dueDate || taskData.due_date) {
      const dateValidation = this.validateDate(
        taskData.dueDate || taskData.due_date,
        'due date'
      );
      result.errors.push(...dateValidation.errors);
      result.warnings.push(...dateValidation.warnings);
      if (!dateValidation.isValid) result.isValid = false;
    }
    if (taskData.assignee) {
      const userValidation = this.validateUserId(taskData.assignee);
      result.errors.push(...userValidation.errors);
      result.warnings.push(...userValidation.warnings);
      if (!userValidation.isValid) result.isValid = false;
    }
    if (taskData.tags) {
      const tagsValidation = this.validateTags(
        Array.isArray(taskData.tags) ? taskData.tags.join(',') : taskData.tags
      );
      result.errors.push(...tagsValidation.errors);
      result.warnings.push(...tagsValidation.warnings);
      if (!tagsValidation.isValid) result.isValid = false;
    }
    return result;
  }
  static displayValidationResult(
    result: ValidationResult,
    context: string = ''
  ): void {
    if (result.errors.length > 0) {
      console.log(
        chalk.red.bold(`❌ Validation Errors${context ? ` (${context})` : ''}:`)
      );
      result.errors.forEach((error) => {
        console.log(chalk.red(`  • ${error}`));
      });
    }
    if (result.warnings.length > 0) {
      console.log(
        chalk.yellow.bold(
          `⚠️  Validation Warnings${context ? ` (${context})` : ''}:`
        )
      );
      result.warnings.forEach((warning) => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }
  }
  static combineValidationResults(
    results: ValidationResult[]
  ): ValidationResult {
    return {
      isValid: results.every((r) => r.isValid),
      errors: results.flatMap((r) => r.errors),
      warnings: results.flatMap((r) => r.warnings),
    };
  }
}
