import { Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

const MCP_PROTOCOL_VERSION = '2025-03-26';
const CLIENT_INFO = { name: 'resolve-agent', version: '1.0.0' };

export interface McpQueryResult {
  rows: Record<string, any>[];
  rowCount: number;
}

export class McpClient {
  private readonly logger = new Logger(McpClient.name);
  private readonly http: AxiosInstance;
  private sessionId: string | null = null;
  private requestId = 0;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {
    this.http = axios.create({
      baseURL: url,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Bearer ${token}`,
      },
      timeout: 30000,
      responseType: 'text',
      transformResponse: [(data) => data],
    });
  }

  private nextId(): number {
    return ++this.requestId;
  }

  async initialize(): Promise<void> {
    const body = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: CLIENT_INFO,
      },
    };

    try {
      const response = await this.http.post('', body);
      const sessionHeader = response.headers['mcp-session-id'];
      if (sessionHeader) {
        this.sessionId = sessionHeader;
      }

      this.parseJsonRpcFromSse(response.data);
      this.logger.log(`MCP initialized. Session: ${this.sessionId ? this.sessionId.slice(0, 12) + '...' : 'none'}`);

      await this.sendNotification('notifications/initialized');
    } catch (err) {
      this.logger.error(`MCP initialize failed: ${err instanceof Error ? err.message : err}`);
      throw err;
    }
  }

  private async sendNotification(method: string): Promise<void> {
    const body = { jsonrpc: '2.0', method };
    const headers: Record<string, string> = {};
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    try {
      await this.http.post('', body, { headers });
    } catch {
      // notifications are fire-and-forget
    }
  }

  async executeSelectQuery(sql: string): Promise<McpQueryResult> {
    if (!this.sessionId) {
      await this.initialize();
    }

    return this.callToolWithRetry('execute_select_query', { sql_query: sql });
  }

  private async callToolWithRetry(
    toolName: string,
    args: Record<string, any>,
    retried = false,
  ): Promise<McpQueryResult> {
    const body = {
      jsonrpc: '2.0',
      id: this.nextId(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    const headers: Record<string, string> = {};
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;

    try {
      const response = await this.http.post('', body, { headers });
      const newSession = response.headers['mcp-session-id'];
      if (newSession) this.sessionId = newSession;

      const result = this.parseJsonRpcFromSse(response.data);

      if (result?.error) {
        const errMsg = result.error.message || JSON.stringify(result.error);
        if (!retried && /session|not initialized/i.test(errMsg)) {
          this.logger.warn('MCP session expired, re-initializing...');
          this.sessionId = null;
          await this.initialize();
          return this.callToolWithRetry(toolName, args, true);
        }
        throw new Error(`MCP tool error: ${errMsg}`);
      }

      if (result?.result?.isError) {
        const errText = result.result.content?.[0]?.text || 'Unknown MCP tool error';
        this.logger.error(`MCP tool returned error: ${errText}`);
        throw new Error(`MCP tool error: ${errText}`);
      }

      return this.extractQueryResult(result?.result);
    } catch (err) {
      if (!retried && axios.isAxiosError(err) && (err.response?.status === 401 || err.response?.status === 404)) {
        this.logger.warn(`MCP request failed (${err.response?.status}), re-initializing...`);
        this.sessionId = null;
        await this.initialize();
        return this.callToolWithRetry(toolName, args, true);
      }
      throw err;
    }
  }

  private parseJsonRpcFromSse(raw: string): any {
    if (!raw) return null;

    const trimmed = raw.trim();

    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch {}
    }

    const lines = trimmed.split('\n');
    let lastData: string | null = null;

    for (const line of lines) {
      const trimLine = line.trim();
      if (trimLine.startsWith('data:')) {
        lastData = trimLine.slice(5).trim();
      }
    }

    if (lastData) {
      try {
        return JSON.parse(lastData);
      } catch {}
    }

    return null;
  }

  private extractQueryResult(result: any): McpQueryResult {
    if (!result) return { rows: [], rowCount: 0 };

    if (result.content && Array.isArray(result.content)) {
      for (const item of result.content) {
        if (item.type === 'text' && item.text) {
          try {
            const parsed = JSON.parse(item.text);
            if (Array.isArray(parsed)) return { rows: parsed, rowCount: parsed.length };
            if (parsed.rows) return { rows: parsed.rows, rowCount: parsed.rows.length };
            return { rows: [parsed], rowCount: 1 };
          } catch {
            return { rows: [], rowCount: 0 };
          }
        }
      }
    }

    if (Array.isArray(result)) return { rows: result, rowCount: result.length };
    if (result.rows) return { rows: result.rows, rowCount: result.rows.length };

    return { rows: [], rowCount: 0 };
  }

  get hasSession(): boolean {
    return this.sessionId !== null;
  }

  static escapeValue(val: any): string {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (val instanceof Date) return `'${val.toISOString()}'`;
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
  }
}
