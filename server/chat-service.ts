/**
 * Local LLM Chat Service using HuggingFace Transformers
 * 
 * Uses a locally downloaded model to generate responses based on
 * context retrieved from the RAG server.
 */

import { pipeline, TextGenerationPipeline, env } from '@huggingface/transformers';
import path from 'node:path';

// Configure cache directory
const cacheDir = process.env.TRANSFORMERS_CACHE || path.join(process.cwd(), '.cache', 'transformers');
env.cacheDir = cacheDir;
env.allowLocalModels = true;
env.allowRemoteModels = true;

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatContext {
  query: string;
  ragResults: Array<{
    path: string;
    score: number;
    snippet: string;
  }>;
}

// Model options - models with ONNX support for Transformers.js
// Note: Only models converted to ONNX format work with @huggingface/transformers
const MODEL_OPTIONS = {
  // Qwen 0.5B - ONNX version available
  'qwen-0.5b': 'onnx-community/Qwen2.5-0.5B-Instruct',
  // Qwen 1.5B - ONNX version (recommended)
  'qwen-1.5b': 'onnx-community/Qwen2.5-1.5B-Instruct',
  // Qwen 3B - ONNX version, needs more RAM
  'qwen-3b': 'onnx-community/Qwen2.5-3B-Instruct',
  // Qwen 4B - ONNX version, best performance but requires more resources
  'qwen-4b': 'onnx-community/Qwen3-4B-Instruct-2507-ONNX',
  // SmolLM - Tiny but functional (legacy)
  'smollm': 'HuggingFaceTB/SmolLM-135M-Instruct',
  // SmolLM2 360M - Smarter than original SmolLM, ONNX available
  'smollm2-360m': 'HuggingFaceTB/SmolLM2-360M-Instruct',
  // SmolLM2 1.7B - Much smarter, ONNX available
  'smollm2': 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
  // TinyLlama - Good balance of size and capability
  'tinyllama': 'TinyLlama/TinyLlama-1.1B-Chat-v1.0',
  // Phi-3.5 mini - ONNX version
  'phi-3.5': 'onnx-community/Phi-3.5-mini-instruct',
  // Phi-2 - Microsoft's small model (legacy)
  'phi-2': 'microsoft/phi-2',
} as const;

type ModelKey = keyof typeof MODEL_OPTIONS;

export class ChatService {
  private generator: TextGenerationPipeline | null = null;
  private modelName: string;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  constructor(modelKey: ModelKey) {
    this.modelName = MODEL_OPTIONS[modelKey];
    console.log(`ChatService configured with model: ${this.modelName}`);
  }

  /**
   * Initialize the text generation pipeline
   */
  async initialize(): Promise<void> {
    if (this.generator) return;
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    console.log(`Initializing chat model: ${this.modelName}...`);
    console.log(`Cache directory: ${cacheDir}`);

    this.initPromise = (async () => {
      try {
        this.generator = await pipeline('text-generation', this.modelName, {
          dtype: 'q4', // Use 4-bit quantized model (more widely available than q8)
        }) as TextGenerationPipeline;
        
        console.log('Chat model initialized successfully');
      } catch (error) {
        console.error('Failed to initialize chat model:', error);
        // Fallback to a simpler approach - template-based responses
        console.log('Falling back to template-based responses');
        this.generator = null;
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Check if the model is ready
   */
  isReady(): boolean {
    return this.generator !== null || !this.isInitializing;
  }

  /**
   * Generate a response based on user query and RAG context
   */
  async generateResponse(
    userQuery: string,
    context: ChatContext,
    conversationHistory: ChatMessage[] = []
  ): Promise<string> {
    // Build context from RAG results
    const ragContext = this.buildRagContext(context.ragResults);
    
    // If model failed to load, use template-based response
    if (!this.generator) {
      console.log('Using template-based response');
      return this.generateTemplateResponse(userQuery, context.ragResults);
    }

    try {
      // Build the prompt
      const systemPrompt = `You are a helpful AI assistant that answers questions about a codebase. 
Use the following context from the codebase to answer the user's question.
If the context doesn't contain relevant information, say so.
Be concise and helpful.

Context from codebase:
${ragContext}`;

      // Build conversation with context
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-6), // Keep last 6 messages for context
        { role: 'user', content: userQuery }
      ];

      // Format for the model
      const prompt = this.formatPrompt(messages);
      console.log('Generating response with local model...');

      // Generate response with timeout
      const timeoutMs = 60000; // 60 second timeout
      const generatePromise = this.generator(prompt, {
        max_new_tokens: 256, // Reduced for faster response
        temperature: 0.7,
        do_sample: true,
        top_p: 0.95,
        repetition_penalty: 1.1,
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Generation timeout')), timeoutMs)
      );

      const output = await Promise.race([generatePromise, timeoutPromise]) as Record<string, unknown>;
      console.log('Generation complete');

      // Extract generated text
      const generatedText = Array.isArray(output) 
        ? (output[0] as Record<string, unknown>)?.generated_text || ''
        : (output as Record<string, unknown>)?.generated_text || '';

      // Clean up the response (remove the prompt from output)
      let response = generatedText.substring(prompt.length).trim();
      
      // If response is empty, use template
      if (!response) {
        console.log('Empty response from model, using template');
        return this.generateTemplateResponse(userQuery, context.ragResults);
      }

      return response;
    } catch (error) {
      console.error('Error generating response:', error);
      return this.generateTemplateResponse(userQuery, context.ragResults);
    }
  }

  /**
   * Build context string from RAG results
   */
  private buildRagContext(ragResults: Array<{ path: string; score: number; snippet: string }>): string {
    if (ragResults.length === 0) {
      return 'No relevant context found in the codebase.';
    }

    return ragResults
      .map((result) => {
        return `--- File: ${result.path} (relevance: ${(result.score * 100).toFixed(1)}%) ---
${result.snippet}`;
      })
      .join('\n\n');
  }

  /**
   * Format messages into a prompt string
   */
  private formatPrompt(messages: ChatMessage[]): string {
    return messages
      .map(msg => {
        switch (msg.role) {
          case 'system':
            return `<|system|>\n${msg.content}</s>`;
          case 'user':
            return `<|user|>\n${msg.content}</s>`;
          case 'assistant':
            return `<|assistant|>\n${msg.content}</s>`;
          default:
            return msg.content;
        }
      })
      .join('\n') + '\n<|assistant|>\n';
  }

  /**
   * Generate a template-based response when the model is unavailable
   */
  private generateTemplateResponse(
    query: string,
    ragResults: Array<{ path: string; score: number; snippet: string }>
  ): string {
    if (ragResults.length === 0) {
      return `I searched the indexed codebase but couldn't find any relevant information for your query: "${query}". 

This could mean:
- The topic isn't covered in the indexed files
- Try rephrasing your question with different keywords
- Check if the relevant files are included in the index`;
    }

    const topResults = ragResults.slice(0, 3);
    let response = `Based on the indexed codebase, here's what I found related to your query:\n\n`;

    topResults.forEach((result, index) => {
      response += `**${index + 1}. ${result.path}** (${(result.score * 100).toFixed(1)}% match)\n`;
      response += `\`\`\`\n${result.snippet.substring(0, 500)}${result.snippet.length > 500 ? '...' : ''}\n\`\`\`\n\n`;
    });

    if (ragResults.length > 3) {
      response += `\n*Found ${ragResults.length} total matches. Showing top 3.*`;
    }

    return response;
  }

  /**
   * Get model info
   */
  getModelInfo(): { name: string; ready: boolean } {
    return {
      name: this.modelName,
      ready: this.isReady()
    };
  }
}

// Export a singleton instance
export const chatService = new ChatService(
  (process.env.CHAT_MODEL as ModelKey) || 'qwen-4b'
);
