/**
 * MCP Client for RAG Server
 *
 * This module provides a client to communicate with the MCP RAG server
 * using the HTTP transport protocol.
 */

// uuid import removed - was unused

export interface RagQueryResult {
  path: string;
  score: number;
  snippet: string;
  totalLines?: number;
  fileSize?: number;
}

export interface MCPResponse {
  jsonrpc: string;
  id: number | string;
  result?: MCPToolResult;
  error?: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
}

export interface MCPToolResult {
  content?: Array<{ type: string; text: string }>;
  [key: string]: unknown;
}

export interface HealthStatus {
  version: string;
  repoRoot: string;
  modelName: string;
  transport: string;
  ready: boolean;
  startedAt: string;
  indexing: {
    filesDiscovered: number;
    chunksTotal: number;
    chunksEmbedded: number;
  };
}

export class MCPClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private requestId = 0;
  private initialized = false;

  constructor(mcpServerUrl: string) {
    this.baseUrl = mcpServerUrl.replace(/\/mcp\/?$/, '');
  }

  /**
   * Parse SSE response to extract JSON data
   */
  private parseSSEResponse(text: string): MCPResponse | null {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data) {
          try {
            return JSON.parse(data);
          } catch {
            continue;
          }
        }
      }
    }
    return null;
  }

  /**
   * Parse response - handles both JSON and SSE formats
   */
  private async parseResponse(response: Response): Promise<MCPResponse> {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (
      contentType.includes('text/event-stream') ||
      text.startsWith('event:') ||
      text.startsWith('data:')
    ) {
      const parsed = this.parseSSEResponse(text);
      if (parsed) {
        return parsed;
      }
      throw new Error(`Failed to parse SSE response: ${text.substring(0, 200)}`);
    }

    // Regular JSON response
    return JSON.parse(text);
  }

  /**
   * Check if the RAG server is healthy and ready
   */
  async checkHealth(): Promise<HealthStatus> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Initialize MCP session
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.sessionId) {
      return;
    }

    const initRequest = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'rag-chat-app',
          version: '1.0.0',
        },
      },
    };

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP initialization failed: ${response.status} - ${errorText}`);
    }

    // Get session ID from response headers
    this.sessionId = response.headers.get('mcp-session-id');
    if (!this.sessionId) {
      throw new Error('No session ID returned from MCP server');
    }

    const result: MCPResponse = await this.parseResponse(response);
    if (result.error) {
      throw new Error(`MCP initialization error: ${result.error.message}`);
    }

    // Send initialized notification
    await this.sendNotification('notifications/initialized', {});

    this.initialized = true;
    console.log(`MCP session initialized: ${this.sessionId}`);
  }

  /**
   * Send a notification (no response expected)
   */
  private async sendNotification(method: string, params: Record<string, unknown>): Promise<void> {
    if (!this.sessionId) {
      throw new Error('MCP session not initialized');
    }

    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': this.sessionId,
      },
      body: JSON.stringify(notification),
    });
  }

  /**
   * Call an MCP tool
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult | undefined> {
    await this.initialize();

    if (!this.sessionId) {
      throw new Error('MCP session not initialized');
    }

    const request = {
      jsonrpc: '2.0',
      id: this.getNextId(),
      method: 'tools/call',
      params: {
        name,
        arguments: args,
      },
    };

    const response = await fetch(`${this.baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': this.sessionId,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MCP tool call failed: ${response.status} - ${errorText}`);
    }

    const result: MCPResponse = await this.parseResponse(response);
    if (result.error) {
      throw new Error(`MCP tool error: ${result.error.message}`);
    }

    return result.result;
  }

  /**
   * Query the RAG server for relevant documents
   */
  async ragQuery(query: string, topK: number = 5): Promise<RagQueryResult[]> {
    const result = await this.callTool('rag_query', { query, top_k: topK });

    // Parse the content from the result
    if (result?.content?.[0]?.text) {
      try {
        return JSON.parse(result.content[0].text);
      } catch {
        console.error('Failed to parse RAG query result:', result.content[0].text);
        return [];
      }
    }
    return [];
  }

  /**
   * Read a file from the indexed repository
   */
  async readFile(path: string, startLine?: number, endLine?: number): Promise<string> {
    const args: Record<string, unknown> = { path };
    if (startLine !== undefined) args.startLine = startLine;
    if (endLine !== undefined) args.endLine = endLine;

    const result = await this.callTool('read_file', args);

    if (result?.content?.[0]?.text) {
      return result.content[0].text;
    }
    return '';
  }

  /**
   * List files in a directory
   */
  async listFiles(dir?: string, recursive?: boolean, maxDepth?: number): Promise<string[]> {
    const args: Record<string, unknown> = {};
    if (dir !== undefined) args.dir = dir;
    if (recursive !== undefined) args.recursive = recursive;
    if (maxDepth !== undefined) args.maxDepth = maxDepth;

    const result = await this.callTool('list_files', args);

    if (result?.content?.[0]?.text) {
      try {
        return JSON.parse(result.content[0].text);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Close the MCP session
   */
  async close(): Promise<void> {
    if (!this.sessionId) return;

    try {
      await fetch(`${this.baseUrl}/mcp`, {
        method: 'DELETE',
        headers: {
          'mcp-session-id': this.sessionId,
        },
      });
    } catch (error) {
      console.error('Error closing MCP session:', error);
    }

    this.sessionId = null;
    this.initialized = false;
  }

  private getNextId(): number {
    return ++this.requestId;
  }
}
