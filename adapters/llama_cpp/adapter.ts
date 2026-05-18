/**
 * HGI Edge Runtime - Llama.cpp Adapter
 *
 * Implementation using node-llama-cpp for GGUF model inference.
 *
 * @module adapters/llama_cpp/adapter
 */

import {
  getLlama,
  LlamaChatSession,
} from 'node-llama-cpp';
import type {
  LlamaModel,
  LlamaContext,
  LlamaModelOptions,
} from 'node-llama-cpp';
import type {
  IAdapter,
  InferenceRequest,
  InferenceResponse,
  TokenCallback,
  AdapterCapabilities,
  AdapterStatus,
  TokenChunk,
} from '../../src/types/index.js';

/**
 * Configuration options for LlamaCppAdapter
 */
export interface LlamaCppAdapterConfig {
  /** Path to GGUF model file */
  modelPath?: string;
  /** Context window size (default: 4096) */
  contextSize?: number;
  /** Temperature for sampling (default: 0.7) */
  temperature?: number;
  /** Maximum tokens to generate (default: 512) */
  maxTokens?: number;
  /** GPU layers to offload (default: 0 = CPU only) */
  gpuLayers?: number;
  /** Batch size for prompt processing (default: 512) */
  batchSize?: number;
  /** Number of threads (default: auto) */
  threads?: number;
}

/**
 * Llama.cpp adapter implementing IAdapter interface
 */
export class LlamaCppAdapter implements IAdapter {
  readonly capabilities: AdapterCapabilities = {
    id: 'llama_cpp',
    name: 'Llama.cpp (node-llama-cpp)',
    supportedFormats: ['gguf'],
    supportedPrecisions: ['q4_0', 'q4_1', 'q5_0', 'q5_1', 'q8_0', 'fp16', 'fp32'],
    supportedHardware: ['cpu', 'cuda', 'metal', 'vulkan'],
    supportsStreaming: true,
    supportsBatching: false,
    handlesChatTemplate: true,
    version: '3.18.1',
  };

  private _config: LlamaCppAdapterConfig;
  private _model: LlamaModel | null = null;
  private _context: LlamaContext | null = null;
  private _session: LlamaChatSession | null = null;
  private _loadedModelPath: string | null = null;

  /**
   * Create a new LlamaCppAdapter instance
   */
  constructor(config: LlamaCppAdapterConfig = {}) {
    this._config = {
      contextSize: 4096,
      temperature: 0.7,
      maxTokens: 512,
      gpuLayers: 0,
      batchSize: 512,
      ...config,
    };
  }

  /**
   * Get current adapter status
   */
  get status(): AdapterStatus {
    return {
      ready: this._model !== null && this._context !== null,
      memoryUsed: undefined, // TODO: Add memory tracking
      loadedModel: this._loadedModelPath ?? undefined,
      lastError: undefined,
    };
  }

  /**
   * Load a GGUF model from the specified path
   */
  async load(modelPath: string, options?: Record<string, unknown>): Promise<void> {
    if (this._model) {
      throw new Error('Model already loaded. Call unload() first.');
    }

    const mergedConfig = { ...this._config, ...options };

    try {
      // Get llama instance and load model
      const llama = await getLlama();

      const modelOptions: LlamaModelOptions = {
        modelPath,
        gpuLayers: mergedConfig.gpuLayers ?? 0,
      };

      this._model = await llama.loadModel(modelOptions);

      if (!this._model) {
        throw new Error('Model load returned null');
      }

      this._context = await this._model.createContext({
        contextSize: mergedConfig.contextSize ?? 4096,
        batchSize: mergedConfig.batchSize ?? 512,
        threads: mergedConfig.threads,
      });

      this._loadedModelPath = modelPath;
    } catch (error) {
      this._model = null;
      this._context = null;
      throw new Error(
        `Failed to load model from ${modelPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Perform synchronous inference
   */
  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    this._ensureLoaded();

    const prompt = this._formatPrompt(request.input);
    const maxTokens = request.parameters?.maxTokens ?? this._config.maxTokens ?? 512;
    const temperature = request.parameters?.temperature ?? this._config.temperature ?? 0.7;

    try {
      // Create a new session for this inference
      this._session = new LlamaChatSession({
        contextSequence: this._context!.getSequence(),
      });

      const startTime = Date.now();

      const response = await this._session.prompt(prompt, {
        maxTokens,
        temperature,
        topP: request.parameters?.topP ?? 0.9,
        topK: request.parameters?.topK ?? 40,
      });

      const elapsedMs = Date.now() - startTime;

      // Estimate token counts (node-llama-cpp doesn't always expose this directly)
      const promptTokens = this._estimateTokenCount(prompt);
      const completionTokens = this._estimateTokenCount(response);

      return {
        content: response,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        finishReason: 'stop',
        appliedParameters: {
          maxTokens,
          temperature,
          topP: request.parameters?.topP ?? 0.9,
          topK: request.parameters?.topK ?? 40,
        },
        metadata: {
          elapsedMs,
          backend: 'llama.cpp',
          modelPath: this._loadedModelPath,
        },
      };
    } catch (error) {
      throw new Error(
        `Inference failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Perform streaming inference with token callbacks
   */
  async inferStream(
    request: InferenceRequest,
    callback: TokenCallback
  ): Promise<InferenceResponse> {
    this._ensureLoaded();

    const prompt = this._formatPrompt(request.input);
    const maxTokens = request.parameters?.maxTokens ?? this._config.maxTokens ?? 512;
    const temperature = request.parameters?.temperature ?? this._config.temperature ?? 0.7;

    try {
      // Create a new session for this inference
      this._session = new LlamaChatSession({
        contextSequence: this._context!.getSequence(),
      });

      const startTime = Date.now();
      let tokenIndex = 0;

      const response = await this._session.prompt(prompt, {
        maxTokens,
        temperature,
        topP: request.parameters?.topP ?? 0.9,
        topK: request.parameters?.topK ?? 40,
        onToken: (token) => {
          // node-llama-cpp passes token as string or token object
          const tokenText = typeof token === 'string' ? token : String(token);

          const chunk: TokenChunk = {
            content: tokenText,
            index: tokenIndex++,
            isFinal: false,
          };

          callback(chunk);
        },
      });

      const elapsedMs = Date.now() - startTime;

      // Send final token
      await callback({
        content: '',
        index: tokenIndex,
        isFinal: true,
      });

      // Estimate token counts
      const promptTokens = this._estimateTokenCount(prompt);
      const completionTokens = this._estimateTokenCount(response);

      return {
        content: response,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
        finishReason: 'stop',
        appliedParameters: {
          maxTokens,
          temperature,
          topP: request.parameters?.topP ?? 0.9,
          topK: request.parameters?.topK ?? 40,
        },
        metadata: {
          elapsedMs,
          backend: 'llama.cpp',
          modelPath: this._loadedModelPath,
        },
      };
    } catch (error) {
      throw new Error(
        `Streaming inference failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Reset the adapter state (clear context but keep model loaded)
   */
  async reset(): Promise<void> {
    this._ensureLoaded();

    // Clear the session but keep context
    this._session = null;

    // Reset context to clear KV cache
    if (this._context) {
      await this._context.dispose();
      this._context = await this._model!.createContext({
        contextSize: this._config.contextSize ?? 4096,
        batchSize: this._config.batchSize ?? 512,
        threads: this._config.threads,
      });
    }
  }

  /**
   * Unload the model and release all resources
   */
  async unload(): Promise<void> {
    this._session = null;

    if (this._context) {
      await this._context.dispose();
      this._context = null;
    }

    if (this._model) {
      await this._model.dispose();
      this._model = null;
    }

    this._loadedModelPath = null;
  }

  /**
   * Ensure model is loaded before operations
   */
  private _ensureLoaded(): void {
    if (!this._model || !this._context) {
      throw new Error('No model loaded. Call load() first.');
    }
  }

  /**
   * Format input prompt from string or chat messages
   */
  private _formatPrompt(input: string | { role: string; content: string }[]): string {
    if (typeof input === 'string') {
      return input;
    }

    // Convert chat messages to a simple prompt format
    // Note: node-llama-cpp has chat format support, but we'll use simple concatenation for now
    return input
      .map((msg) => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        return `${role}: ${msg.content}`;
      })
      .join('\n\n');
  }

  /**
   * Roughly estimate token count (4 chars per token approximation)
   */
  private _estimateTokenCount(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Factory function to create a LlamaCppAdapter instance
 */
export function createLlamaCppAdapter(config?: LlamaCppAdapterConfig): LlamaCppAdapter {
  return new LlamaCppAdapter(config);
}
