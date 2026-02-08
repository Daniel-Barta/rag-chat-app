# RAG Chat Application

A ChatGPT-like web interface for querying your codebase using the MCP RAG Server. Built with Angular and Express, using local AI models via HuggingFace Transformers.

## Features

- 🔍 **Semantic Search**: Query your indexed codebase using natural language
- 💬 **ChatGPT-like UI**: Familiar chat interface with conversation history
- 🤖 **Local AI**: Uses HuggingFace Transformers for response generation (no API keys needed)
- 📄 **Source Attribution**: See which files were used to generate each response
- 🌙 **Dark Theme**: Modern dark UI optimized for developers
- 💾 **Persistent History**: Conversations are saved in localStorage

## Architecture

```
rag-chat-app/
├── server/                 # Express backend
│   ├── index.ts           # Main server entry point
│   ├── mcp-client.ts      # MCP protocol client
│   └── chat-service.ts    # Local LLM chat service
├── client/                 # Angular frontend
│   └── src/
│       ├── app/
│       │   ├── components/
│       │   │   ├── chat/       # Main chat interface
│       │   │   ├── sidebar/    # Conversation list
│       │   │   ├── message/    # Chat message display
│       │   │   └── sources-panel/  # Source code viewer
│       │   ├── services/       # API services
│       │   └── models/         # TypeScript interfaces
│       └── styles.scss         # Global styles
└── package.json
```

## Prerequisites

- Node.js 20+
- Running MCP RAG Server (parent project) on HTTP transport
- ~2GB disk space for AI model download (first run)

## Setup

### 1. Start the RAG MCP Server (parent project)

First, ensure the MCP RAG server is running with HTTP transport:

```powershell
# From the parent mcp-rag-server directory
$env:REPO_ROOT="C:\path\to\your-codebase"
$env:MCP_TRANSPORT="http"
npm start
```

Wait for the indexing to complete (check http://localhost:3000/health for `ready: true`).

### 2. Install Dependencies

```powershell
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

Or use the combined command:
```powershell
npm run install:all
```

### 3. Configure Environment

Copy the example environment file and customize:

```powershell
copy .env.example .env
```

Edit `.env` if needed:
```
PORT=4000
MCP_SERVER_URL=http://localhost:3000/mcp
```

### 4. Build and Run

```powershell
# Build both server and client
npm run build

# Start the server
npm start
```

Open http://localhost:4000 in your browser.

## Development

For development with hot reload:

```powershell
# Terminal 1: Start the Express server in watch mode
npm run dev:server

# Terminal 2: Start Angular dev server
npm run dev:client
```

The Angular dev server runs on http://localhost:4200 with proxy to the Express server.

Or run both concurrently:
```powershell
npm run start:dev
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server and RAG status |
| `/api/chat` | POST | Send a chat message |
| `/api/chat/init` | POST | Pre-initialize chat model |
| `/api/chat/history/:sessionId` | DELETE | Clear conversation history |
| `/api/rag/query` | POST | Direct RAG search |
| `/api/rag/read-file` | POST | Read file content |
| `/api/rag/list-files` | POST | List indexed files |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 4000 | Express server port |
| `MCP_SERVER_URL` | http://localhost:3000/mcp | MCP RAG server URL |
| `CHAT_MODEL` | smollm | Chat model key (smollm, qwen-0.5b, tinyllama) |
| `TRANSFORMERS_CACHE` | .cache/transformers | Model cache directory |

### Available Chat Models

The app supports several local models via HuggingFace Transformers:

- `smollm` - SmolLM 135M (default, fastest, ~300MB)
- `qwen-0.5b` - Qwen 2.5 0.5B Instruct (~1GB)
- `tinyllama` - TinyLlama 1.1B Chat (~2GB)

Set via `CHAT_MODEL` environment variable:
```powershell
$env:CHAT_MODEL="qwen-0.5b"
npm start
```

## Troubleshooting

### "RAG server indexing..." message won't change

Ensure the MCP RAG server is:
1. Running with `MCP_TRANSPORT=http`
2. Has completed indexing (check `/health` endpoint)

### Model download fails

- Check your internet connection
- Ensure sufficient disk space (~2GB for larger models)
- Try setting `TRANSFORMERS_CACHE` to a path with write permissions

### Slow responses

The first query may be slow as the model initializes. Subsequent queries will be faster. For faster responses, use the `smollm` model (default).

## License

MIT
