import { writeFile } from 'fs/promises';
import chalk from 'chalk';

export interface ExportTask {
  id: string;
  name: string;
  status: string;
  priority: string;
  assignees: string;
  tags: string;
  dueDate: string;
  createdDate: string;
  updatedDate: string;
  description: string;
  url: string;
  list: string;
  folder: string;
  space: string;
  timeEstimate: string;
  timeSpent: string;
}

export class TaskExporter {
  static prepareTaskForExport(task: any): ExportTask {
    const getPriorityName = (priority: any): string => {
      if (!priority || priority.priority === null) return 'None';
      const priorityMap: { [key: string]: string } = {
        '1': 'Urgent',
        '2': 'High',
        '3': 'Normal',
        '4': 'Low',
      };
      return priorityMap[priority.priority] || priority.priority;
    };
    const formatTime = (milliseconds: string | number | null): string => {
      if (!milliseconds || milliseconds === '0') return '';
      const ms =
        typeof milliseconds === 'string'
          ? parseInt(milliseconds)
          : milliseconds;
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
      }
      return `${minutes}m`;
    };
    const formatDate = (timestamp: string | number | null): string => {
      if (!timestamp) return '';
      const date = new Date(
        typeof timestamp === 'string' ? parseInt(timestamp) : timestamp
      );
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };
    return {
      id: task.id || '',
      name: task.name || '',
      status: task.status?.status || '',
      priority: getPriorityName(task.priority),
      assignees:
        task.assignees?.map((a: any) => `@${a.username}`).join(', ') || '',
      tags: task.tags?.map((t: any) => `#${t.name}`).join(', ') || '',
      dueDate: task.due_date ? formatDate(task.due_date) : '',
      createdDate: task.date_created ? formatDate(task.date_created) : '',
      updatedDate: task.date_updated ? formatDate(task.date_updated) : '',
      description: task.description || '',
      url: task.url || '',
      list: task.list?.name || '',
      folder: task.folder?.name || '',
      space: task.space?.name || '',
      timeEstimate: formatTime(task.time_estimate),
      timeSpent: formatTime(task.time_spent),
    };
  }
  static async exportToCsv(tasks: any[], filename?: string): Promise<string> {
    const exportTasks = tasks.map((task) => this.prepareTaskForExport(task));
    const headers = [
      'ID',
      'Title',
      'Status',
      'Priority',
      'Assignees',
      'Tags',
      'Due Date',
      'Created Date',
      'Updated Date',
      'Description',
      'URL',
      'List',
      'Folder',
      'Space',
      'Time Estimate',
      'Time Spent',
    ];
    const escapeField = (field: string): string => {
      if (field.includes(',') || field.includes('"') || field.includes('\n')) {
        return `"${field.replace(/"/g, '""')}"`;
      }
      return field;
    };
    const csvContent = [
      headers.join(','),
      ...exportTasks.map((task) =>
        [
          escapeField(task.id),
          escapeField(task.name),
          escapeField(task.status),
          escapeField(task.priority),
          escapeField(task.assignees),
          escapeField(task.tags),
          escapeField(task.dueDate),
          escapeField(task.createdDate),
          escapeField(task.updatedDate),
          escapeField(task.description),
          escapeField(task.url),
          escapeField(task.list),
          escapeField(task.folder),
          escapeField(task.space),
          escapeField(task.timeEstimate),
          escapeField(task.timeSpent),
        ].join(',')
      ),
    ].join('\n');
    const outputFile =
      filename || `clickup_tasks_${new Date().toISOString().split('T')[0]}.csv`;
    await writeFile(outputFile, csvContent, 'utf8');
    return outputFile;
  }
  static async exportToJson(tasks: any[], filename?: string): Promise<string> {
    const exportTasks = tasks.map((task) => this.prepareTaskForExport(task));
    const jsonContent = JSON.stringify(
      {
        exportDate: new Date().toISOString(),
        taskCount: exportTasks.length,
        tasks: exportTasks,
      },
      null,
      2
    );
    const outputFile =
      filename ||
      `clickup_tasks_${new Date().toISOString().split('T')[0]}.json`;
    await writeFile(outputFile, jsonContent, 'utf8');
    return outputFile;
  }
  static async exportToMarkdown(
    tasks: any[],
    filename?: string
  ): Promise<string> {
    const exportTasks = tasks.map((task) => this.prepareTaskForExport(task));
    const lines = [
      '# ClickUp Tasks Export',
      '',
      `**Export Date:** ${new Date().toLocaleDateString()}`,
      `**Total Tasks:** ${exportTasks.length}`,
      '',
      '## Tasks',
      '',
    ];
    exportTasks.forEach((task, index) => {
      lines.push(`### ${index + 1}. ${task.name}`);
      lines.push('');
      lines.push(`**ID:** ${task.id}`);
      lines.push(`**Status:** ${task.status}`);
      if (task.priority !== 'None')
        lines.push(`**Priority:** ${task.priority}`);
      if (task.assignees) lines.push(`**Assignees:** ${task.assignees}`);
      if (task.tags) lines.push(`**Tags:** ${task.tags}`);
      if (task.dueDate) lines.push(`**Due Date:** ${task.dueDate}`);
      if (task.timeEstimate)
        lines.push(`**Time Estimate:** ${task.timeEstimate}`);
      if (task.timeSpent) lines.push(`**Time Spent:** ${task.timeSpent}`);
      lines.push(`**List:** ${task.list}`);
      if (task.folder) lines.push(`**Folder:** ${task.folder}`);
      if (task.space) lines.push(`**Space:** ${task.space}`);
      lines.push(`**Created:** ${task.createdDate}`);
      lines.push(`**Updated:** ${task.updatedDate}`);
      if (task.description) {
        lines.push('');
        lines.push('**Description:**');
        lines.push(task.description);
      }
      lines.push(`**URL:** [View Task](${task.url})`);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    const markdownContent = lines.join('\n');
    const outputFile =
      filename || `clickup_tasks_${new Date().toISOString().split('T')[0]}.md`;
    await writeFile(outputFile, markdownContent, 'utf8');
    return outputFile;
  }
  static async exportTasks(
    tasks: any[],
    format: string,
    filename?: string
  ): Promise<string> {
    if (tasks.length === 0) {
      throw new Error('No tasks to export');
    }
    switch (format.toLowerCase()) {
      case 'csv':
        return await this.exportToCsv(tasks, filename);
      case 'json':
        return await this.exportToJson(tasks, filename);
      case 'markdown':
      case 'md':
        return await this.exportToMarkdown(tasks, filename);
      default:
        throw new Error(
          'Unsupported export format. Use: csv, json, or markdown'
        );
    }
  }
  static displayExportSuccess(
    filename: string,
    taskCount: number,
    format: string
  ): void {
    console.log('');
    console.log(chalk.green.bold('✓ Export completed successfully!'));
    console.log('');
    console.log(`  ${chalk.cyan('File:')} ${filename}`);
    console.log(`  ${chalk.cyan('Format:')} ${format.toUpperCase()}`);
    console.log(`  ${chalk.cyan('Tasks:')} ${taskCount}`);
    console.log(`  ${chalk.cyan('Size:')} ${this.getFileSizeString(filename)}`);
    console.log('');
    console.log(chalk.gray(`Export saved to: ${filename}`));
  }
  private static getFileSizeString(filename: string): string {
    try {
      const fs = require('fs');
      const stats = fs.statSync(filename);
      const bytes = stats.size;
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    } catch {
      return 'Unknown';
    }
  }
}
