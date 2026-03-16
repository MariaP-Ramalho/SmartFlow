import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface ClickUpTaskData {
  name: string;
  description?: string;
  priority?: number;
  tags?: string[];
  status?: string;
  custom_fields?: Array<{ id: string; value: any }>;
}

export interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: { status: string };
  priority: { id: string } | null;
  tags: Array<{ name: string }>;
  url: string;
  [key: string]: any;
}

export interface GetTasksOptions {
  statuses?: string[];
  page?: number;
}

@Injectable()
export class ClickUpClient {
  private readonly logger = new Logger(ClickUpClient.name);
  private readonly http: AxiosInstance;
  private readonly teamId: string;
  private readonly defaultListId: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('clickup.apiKey');
    this.teamId = this.config.get<string>('clickup.teamId', '');
    this.defaultListId = this.config.get<string>('clickup.listId', '');

    this.http = axios.create({
      baseURL: 'https://api.clickup.com/api/v2',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async createTask(
    listId: string | undefined,
    data: ClickUpTaskData,
  ): Promise<ClickUpTask> {
    const targetList = listId || this.defaultListId;
    try {
      const response = await this.http.post<ClickUpTask>(
        `/list/${targetList}/task`,
        data,
      );
      this.logger.log(`Created ClickUp task ${response.data.id} in list ${targetList}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'createTask');
    }
  }

  async getTask(taskId: string): Promise<ClickUpTask> {
    try {
      const response = await this.http.get<ClickUpTask>(`/task/${taskId}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'getTask');
    }
  }

  async updateTask(
    taskId: string,
    data: Partial<ClickUpTaskData>,
  ): Promise<ClickUpTask> {
    try {
      const response = await this.http.put<ClickUpTask>(
        `/task/${taskId}`,
        data,
      );
      this.logger.log(`Updated ClickUp task ${taskId}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'updateTask');
    }
  }

  async updateTaskStatus(taskId: string, status: string): Promise<ClickUpTask> {
    return this.updateTask(taskId, { status });
  }

  async addComment(
    taskId: string,
    commentText: string,
  ): Promise<any> {
    try {
      const response = await this.http.post(`/task/${taskId}/comment`, {
        comment_text: commentText,
      });
      this.logger.log(`Added comment to ClickUp task ${taskId}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'addComment');
    }
  }

  async getTasks(
    listId?: string,
    options?: GetTasksOptions,
  ): Promise<{ tasks: ClickUpTask[] }> {
    const targetList = listId || this.defaultListId;
    try {
      const params: Record<string, any> = {};
      if (options?.statuses) {
        options.statuses.forEach((s) => {
          params['statuses[]'] = params['statuses[]']
            ? ([] as string[]).concat(params['statuses[]'], s)
            : s;
        });
      }
      if (options?.page !== undefined) {
        params.page = options.page;
      }

      const response = await this.http.get<{ tasks: ClickUpTask[] }>(
        `/list/${targetList}/task`,
        { params },
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'getTasks');
    }
  }

  async addTag(taskId: string, tagName: string): Promise<any> {
    try {
      const response = await this.http.post(
        `/task/${taskId}/tag/${tagName}`,
        {},
      );
      this.logger.log(`Added tag "${tagName}" to ClickUp task ${taskId}`);
      return response.data;
    } catch (error) {
      this.handleError(error, 'addTag');
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    try {
      await this.http.delete(`/task/${taskId}`);
      this.logger.log(`Deleted ClickUp task ${taskId}`);
    } catch (error) {
      this.handleError(error, 'deleteTask');
    }
  }

  private handleError(error: unknown, method: string): never {
    if (error instanceof AxiosError) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message =
        error.response?.data?.err || error.response?.data?.error || error.message;
      this.logger.error(
        `ClickUp API error in ${method}: ${status} - ${message}`,
      );
      throw new HttpException(
        `ClickUp API error: ${message}`,
        status,
      );
    }
    this.logger.error(`Unexpected error in ${method}: ${error}`);
    throw new HttpException(
      'Unexpected ClickUp API error',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
