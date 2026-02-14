export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Source[];
  isLoading?: boolean;
}

export interface Source {
  path: string;
  score: number;
  snippet: string;
}

export interface ChatResponse {
  response: string;
  sources: Source[];
  sessionId: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  server: {
    port: number;
    mcpServerUrl: string;
  };
  rag: {
    ready: boolean;
    repoRoot?: string;
    modelName?: string;
    error?: string;
    indexing?: {
      filesDiscovered: number;
      chunksTotal: number;
      chunksEmbedded: number;
    };
  };
  chat: {
    name: string;
    ready: boolean;
  };
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}
