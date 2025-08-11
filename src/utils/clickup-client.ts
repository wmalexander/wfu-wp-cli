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
  private token: string | undefined;
  private rateLimitInfo: RateLimitInfo | null = null;
  private readonly BASE_URL = 'https://api.clickup.com/api/v2';
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

    // Add response interceptor to handle rate limiting
    this.api.interceptors.response.use(
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
}
