import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import chalk from 'chalk';
import { Config } from './config';

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
}

export class ClickUpClient {
  private api: AxiosInstance;
  private apiV3: AxiosInstance;
  private token: string | undefined;
  private rateLimitInfo: RateLimitInfo | null = null;
  private readonly BASE_URL = 'https://api.clickup.com/api/v2';
  private readonly BASE_URL_V3 = 'https://api.clickup.com/api/v3';
  private readonly MAX_RETRIES = 3;
  private readonly INITIAL_RETRY_DELAY = 1000; // 1 second

  constructor() {
    const clickupConfig = Config.getClickUpConfig();
    this.token = clickupConfig.token;
    if (!this.token) {
      throw new Error(
        'ClickUp API token not configured. Run: wfuwp clickup config set token <your-token>'
      );
    }
    this.api = axios.create({
      baseURL: this.BASE_URL,
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });
    this.apiV3 = axios.create({
      baseURL: this.BASE_URL_V3,
      headers: {
        Authorization: this.token,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
    // Add response interceptor to handle rate limiting
    this.api.interceptors.response.use(
      (response) => this.handleRateLimitHeaders(response),
      (error) => this.handleError(error)
    );
    this.apiV3.interceptors.response.use(
      (response) => this.handleRateLimitHeaders(response),
      (error) => this.handleError(error)
    );
  }

  private handleRateLimitHeaders(response: AxiosResponse): AxiosResponse {
    const headers = response.headers;
    if (headers['x-ratelimit-limit']) {
      this.rateLimitInfo = {
        limit: parseInt(headers['x-ratelimit-limit'], 10),
        remaining: parseInt(headers['x-ratelimit-remaining'], 10),
        resetTime: parseInt(headers['x-ratelimit-reset'], 10) * 1000, // Convert to milliseconds
      };

      // Warn if getting close to rate limit
      if (this.rateLimitInfo.remaining < 10) {
        console.warn(
          chalk.yellow(
            `⚠️  ClickUp API rate limit warning: ${this.rateLimitInfo.remaining} requests remaining`
          )
        );
      }
    }
    return response;
  }

  private async handleError(error: AxiosError): Promise<never> {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 401:
          throw new Error(
            'Invalid ClickUp API token. Please check your configuration.'
          );
        case 403:
          throw new Error(
            'Access forbidden. Please check your ClickUp permissions.'
          );
        case 404:
          throw new Error('Resource not found. Please check the ID or path.');
        case 429: {
          // Rate limited - extract retry after if available
          const retryAfter = error.response.headers['retry-after'];
          if (retryAfter) {
            const waitTime = parseInt(retryAfter, 10) * 1000;
            throw new Error(
              `Rate limited. Please wait ${waitTime / 1000} seconds before retrying.`
            );
          }
          throw new Error('Rate limited. Please wait before retrying.');
        }
        case 500:
        case 502:
        case 503:
        case 504:
          throw new Error(
            `ClickUp server error (${status}). Please try again later.`
          );
        default: {
          const message =
            data?.err || data?.error || data?.message || 'Unknown error';
          throw new Error(`ClickUp API error (${status}): ${message}`);
        }
      }
    } else if (error.request) {
      throw new Error(
        'No response from ClickUp API. Please check your internet connection.'
      );
    } else {
      throw new Error(`Request error: ${error.message}`);
    }
  }

  private async retryWithExponentialBackoff<T>(
    operation: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retryCount >= this.MAX_RETRIES) {
        throw error;
      }

      const isRetryableError =
        error instanceof Error &&
        (error.message.includes('Rate limited') ||
          error.message.includes('server error') ||
          error.message.includes('No response'));

      if (!isRetryableError) {
        throw error;
      }

      const delay = this.INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
      console.log(
        chalk.yellow(
          `Retrying request in ${delay / 1000} seconds... (attempt ${retryCount + 1}/${this.MAX_RETRIES})`
        )
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithExponentialBackoff(operation, retryCount + 1);
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await this.retryWithExponentialBackoff(() =>
        this.api.get('/user')
      );

      if (response.data && response.data.user) {
        const user = response.data.user;
        console.log(
          chalk.green(`✓ Connected as: ${user.username} (${user.email})`)
        );
        return true;
      }
      return false;
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Connection failed: ${error.message}`));
      }
      return false;
    }
  }

  async getUser(): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get('/user')
    );
    return response.data.user;
  }

  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  async createTask(
    listId: string,
    taskData: {
      name: string;
      description?: string;
      assignees?: string[];
      tags?: string[];
      priority?: number;
      dueDate?: number;
      parent?: string;
    }
  ): Promise<any> {
    const payload: any = {
      name: taskData.name,
      description: taskData.description,
      assignees: taskData.assignees,
      tags: taskData.tags,
      priority: taskData.priority,
      due_date: taskData.dueDate,
      parent: taskData.parent,
    };
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.post(`/list/${listId}/task`, payload)
    );
    return response.data;
  }

  async getTask(
    taskId: string,
    options: { includeSubtasks?: boolean } = {}
  ): Promise<any> {
    const params: any = {};
    if (options.includeSubtasks) {
      params.include_subtasks = true;
    }
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/task/${taskId}`, { params })
    );
    return response.data;
  }

  async updateTask(
    taskId: string,
    updates: {
      name?: string;
      description?: string;
      status?: string;
      priority?: number;
      dueDate?: number;
      assignees?: { add?: number[]; rem?: number[] };
    }
  ): Promise<any> {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined)
      payload.description = updates.description;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.dueDate !== undefined) payload.due_date = updates.dueDate;
    if (updates.assignees !== undefined) payload.assignees = updates.assignees;
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.put(`/task/${taskId}`, payload)
    );
    return response.data;
  }

  async getTasks(
    listId: string,
    options: {
      includeArchived?: boolean;
      includeClosed?: boolean;
      includeSubtasks?: boolean;
      statuses?: string[];
      assignees?: string[];
      tags?: string[];
      dueDateGt?: number;
      dueDateLt?: number;
      dateCreatedGt?: number;
      dateCreatedLt?: number;
      dateUpdatedGt?: number;
      dateUpdatedLt?: number;
      page?: number;
    } = {}
  ): Promise<any> {
    const params: any = {};
    if (options.includeArchived) params.archived = true;
    if (options.includeClosed) params.include_closed = true;
    if (options.includeSubtasks) params.subtasks = true;
    if (options.statuses && options.statuses.length > 0) {
      options.statuses.forEach((status, index) => {
        params[`statuses[${index}]`] = status;
      });
    }
    if (options.assignees && options.assignees.length > 0) {
      options.assignees.forEach((assignee, index) => {
        params[`assignees[${index}]`] = assignee;
      });
    }
    if (options.tags && options.tags.length > 0) {
      options.tags.forEach((tag, index) => {
        params[`tags[${index}]`] = tag;
      });
    }
    if (options.dueDateGt) params.due_date_gt = options.dueDateGt;
    if (options.dueDateLt) params.due_date_lt = options.dueDateLt;
    if (options.dateCreatedGt) params.date_created_gt = options.dateCreatedGt;
    if (options.dateCreatedLt) params.date_created_lt = options.dateCreatedLt;
    if (options.dateUpdatedGt) params.date_updated_gt = options.dateUpdatedGt;
    if (options.dateUpdatedLt) params.date_updated_lt = options.dateUpdatedLt;
    if (options.page) params.page = options.page;
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/list/${listId}/task`, { params })
    );
    return response.data;
  }

  async getWorkspaces(): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get('/team')
    );
    return response.data;
  }

  async getSpaces(workspaceId: string): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/team/${workspaceId}/space`, {
        params: { archived: false },
      })
    );
    return response.data;
  }

  async getFolders(spaceId: string): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/space/${spaceId}/folder`, { params: { archived: false } })
    );
    return response.data;
  }

  async getLists(folderId: string): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/folder/${folderId}/list`, { params: { archived: false } })
    );
    return response.data;
  }

  async getFolderlessLists(spaceId: string): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/space/${spaceId}/list`, { params: { archived: false } })
    );
    return response.data;
  }

  async searchTasks(
    workspaceId: string,
    query: string,
    options: {
      page?: number;
      limit?: number;
    } = {}
  ): Promise<any> {
    const params: any = {
      query: query,
    };
    if (options.page) params.page = options.page;
    if (options.limit) params.limit = Math.min(options.limit, 100); // ClickUp API limit
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/team/${workspaceId}/task`, { params })
    );
    return response.data;
  }

  async getTaskComments(
    taskId: string,
    options: {
      start?: number;
      startId?: string;
    } = {}
  ): Promise<any> {
    const params: any = {};
    if (options.start) params.start = options.start;
    if (options.startId) params.start_id = options.startId;
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/task/${taskId}/comment`, { params })
    );
    return response.data;
  }

  async getCommentReplies(commentId: string): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.get(`/comment/${commentId}/reply`)
    );
    return response.data;
  }

  async createTaskComment(
    taskId: string,
    commentData: {
      commentText: string;
      assignee?: string;
      notifyAll?: boolean;
    }
  ): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.post(`/task/${taskId}/comment`, {
        comment_text: commentData.commentText,
        assignee: commentData.assignee,
        notify_all: commentData.notifyAll,
      })
    );
    return response.data;
  }

  // Generic request method for future use
  async request<T = any>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    data?: any,
    params?: any
  ): Promise<T> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.api.request({
        method,
        url: path,
        data,
        params,
      })
    );
    return response.data;
  }

  // Docs API methods (v3)
  async searchDocs(
    workspaceId: string,
    options: { folderId?: string } = {}
  ): Promise<any> {
    const params: any = {};
    if (options.folderId) {
      params.folder_id = options.folderId;
    }
    const response = await this.retryWithExponentialBackoff(() =>
      this.apiV3.get(`/workspaces/${workspaceId}/docs`, { params })
    );
    return response.data;
  }

  async getDoc(workspaceId: string, docId: string): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.apiV3.get(`/workspaces/${workspaceId}/docs/${docId}`)
    );
    return response.data;
  }

  async createDoc(
    workspaceId: string,
    docData: { name: string; parent?: { id: string; type: number } }
  ): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.apiV3.post(`/workspaces/${workspaceId}/docs`, docData)
    );
    return response.data;
  }

  async getDocPages(workspaceId: string, docId: string): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.apiV3.get(`/workspaces/${workspaceId}/docs/${docId}/pages`)
    );
    return response.data;
  }

  async getPage(
    workspaceId: string,
    docId: string,
    pageId: string,
    contentFormat: 'text/md' | 'text/plain' = 'text/md'
  ): Promise<any> {
    const response = await this.retryWithExponentialBackoff(() =>
      this.apiV3.get(
        `/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}`,
        {
          params: { content_format: contentFormat },
        }
      )
    );
    return response.data;
  }

  async createPage(
    workspaceId: string,
    docId: string,
    pageData: { name: string; content?: string; content_format?: string }
  ): Promise<any> {
    const payload: any = { name: pageData.name };
    if (pageData.content) {
      payload.content = pageData.content;
      payload.content_format = pageData.content_format || 'text/md';
    }
    const response = await this.retryWithExponentialBackoff(() =>
      this.apiV3.post(`/workspaces/${workspaceId}/docs/${docId}/pages`, payload)
    );
    return response.data;
  }

  async updatePage(
    workspaceId: string,
    docId: string,
    pageId: string,
    updates: { content?: string; name?: string; content_format?: string }
  ): Promise<any> {
    const payload: any = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.content !== undefined) {
      payload.content = updates.content;
      payload.content_format = updates.content_format || 'text/md';
    }
    const response = await this.retryWithExponentialBackoff(() =>
      this.apiV3.put(
        `/workspaces/${workspaceId}/docs/${docId}/pages/${pageId}`,
        payload
      )
    );
    return response.data;
  }
}
