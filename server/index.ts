/**
 * Express Server Entry Point
 *
 * Main server that:
 * - Serves the Angular frontend
 * - Provides API endpoints for chat functionality
 * - Connects to MCP RAG server for document retrieval
 * - Uses local LLM for response generation
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MCPClient } from './mcp-client.js';
import { chatService, ChatMessage } from './chat-service.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000/mcp';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from Angular build
const clientDistPath = path.join(
  __dirname,
  '..',
  '..',
  'client',
  'dist',
  'rag-chat-client',
  'browser',
);
app.use(express.static(clientDistPath));

// Initialize MCP client
const mcpClient = new MCPClient(MCP_SERVER_URL);

// Store conversation history per session (simple in-memory store)
const conversationStore = new Map<string, ChatMessage[]>();

// API Routes

/**
 * Health check endpoint
 */
app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const mcpHealth = await mcpClient.checkHealth();
    const chatInfo = chatService.getModelInfo();

    res.json({
      status: 'ok',
      server: {
        port: PORT,
        mcpServerUrl: MCP_SERVER_URL,
      },
      rag: mcpHealth,
      chat: chatInfo,
    });
  } catch (error) {
    res.json({
      status: 'degraded',
      server: {
        port: PORT,
        mcpServerUrl: MCP_SERVER_URL,
      },
      rag: { ready: false, error: (error as Error).message },
      chat: chatService.getModelInfo(),
    });
  }
});

/**
 * Initialize chat model (can be called to pre-warm)
 */
app.post('/api/chat/init', async (_req: Request, res: Response) => {
  try {
    await chatService.initialize();
    res.json({ success: true, model: chatService.getModelInfo() });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * Chat endpoint - main conversation API
 */
interface ChatRequest {
  message: string;
  sessionId?: string;
  topK?: number;
}

app.post('/api/chat', async (req: Request<{}, {}, ChatRequest>, res: Response) => {
  try {
    const { message, sessionId = 'default', topK = 5 } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Get or create conversation history
    let history = conversationStore.get(sessionId) || [];

    // Query RAG server for relevant context
    console.log(`Querying RAG for: "${message.substring(0, 50)}..."`);
    const ragResults = await mcpClient.ragQuery(message, topK);
    console.log(`Found ${ragResults.length} relevant results`);

    // Initialize chat service if needed
    await chatService.initialize();

    // Generate response
    const response = await chatService.generateResponse(
      message,
      { query: message, ragResults },
      history,
    );

    // Update conversation history
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: response });

    // Keep only last 20 messages
    if (history.length > 20) {
      history = history.slice(-20);
    }
    conversationStore.set(sessionId, history);

    res.json({
      response,
      sources: ragResults.map((r) => ({
        path: r.path,
        score: r.score,
        snippet: r.snippet.substring(0, 200),
      })),
      sessionId,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * RAG query endpoint - direct access to search
 */
interface RagQueryRequest {
  query: string;
  topK?: number;
}

app.post('/api/rag/query', async (req: Request<{}, {}, RagQueryRequest>, res: Response) => {
  try {
    const { query, topK = 5 } = req.body;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query is required' });
      return;
    }

    const results = await mcpClient.ragQuery(query, topK);
    res.json({ results });
  } catch (error) {
    console.error('RAG query error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Read file endpoint
 */
interface ReadFileRequest {
  path: string;
  startLine?: number;
  endLine?: number;
}

app.post('/api/rag/read-file', async (req: Request<{}, {}, ReadFileRequest>, res: Response) => {
  try {
    const { path: filePath, startLine, endLine } = req.body;

    if (!filePath || typeof filePath !== 'string') {
      res.status(400).json({ error: 'Path is required' });
      return;
    }

    const content = await mcpClient.readFile(filePath, startLine, endLine);
    res.json({ content, path: filePath });
  } catch (error) {
    console.error('Read file error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * List files endpoint
 */
interface ListFilesRequest {
  dir?: string;
  recursive?: boolean;
  maxDepth?: number;
}

app.post('/api/rag/list-files', async (req: Request<{}, {}, ListFilesRequest>, res: Response) => {
  try {
    const { dir, recursive, maxDepth } = req.body;
    const files = await mcpClient.listFiles(dir, recursive, maxDepth);
    res.json({ files });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * Clear conversation history
 */
app.delete('/api/chat/history/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  conversationStore.delete(sessionId as string);
  res.json({ success: true });
});

// Serve Angular app for all other routes (SPA support)
// Express 5 uses path-to-regexp v8 which requires named parameters
app.get('/{*splat}', (_req: Request, res: Response) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Error handling middleware
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              RAG Chat Application Server                   ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT.toString().padEnd(22)}║
║  MCP RAG Server:    ${MCP_SERVER_URL.padEnd(39)}║
╚════════════════════════════════════════════════════════════╝
  `);

  // Pre-initialize chat service in background
  chatService.initialize().catch((err) => {
    console.warn('Chat service initialization warning:', err.message);
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await mcpClient.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await mcpClient.close();
  process.exit(0);
});
