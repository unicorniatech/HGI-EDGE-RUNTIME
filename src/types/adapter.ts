/**
 * HGI Edge Runtime - Adapter Type Definitions
 * 
 * Core interfaces for adapter-based inference architecture.
 * Backend-agnostic. Implementation-specific details belong in adapters.
 */

// ============================================================================
// Token Streaming Types
// ============================================================================

/**
 * Callback for streaming token generation.
 * Called for each token as it is generated.
 */
export type TokenCallback = (token: TokenChunk) => void | Promise<void>;

/**
 * Single token chunk from streaming inference.
 */
export interface TokenChunk {
  /** Token text content */
  content: string;
  /** Token index in sequence (0-based) */
  index: number;
  /** Whether this is the final token */
  isFinal: boolean;
  /** Optional metadata from adapter */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Inference Request/Response Types
// ============================================================================

/**
 * Standard inference request.
 * All fields are suggestions; adapters may support subsets.
 */
export interface InferenceRequest {
  /** Model identifier (path or name) */
  model: string;
  /** Input prompt or messages */
  input: string | ChatMessage[];
  /** Generation parameters */
  parameters?: GenerationParameters;
  /** Adapter-specific options */
  adapterOptions?: Record<string, unknown>;
}

/**
 * Chat message format for conversational models.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Generation parameters for inference.
 */
export interface GenerationParameters {
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0.0 = deterministic, 1.0 = creative) */
  temperature?: number;
  /** Top-p nucleus sampling */
  topP?: number;
  /** Top-k sampling */
  topK?: number;
  /** Presence penalty */
  presencePenalty?: number;
  /** Frequency penalty */
  frequencyPenalty?: number;
  /** Stop sequences */
  stopSequences?: string[];
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Standard inference response.
 */
export interface InferenceResponse {
  /** Generated text content */
  content: string;
  /** Usage statistics */
  usage?: TokenUsage;
  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'timeout' | 'error';
  /** Generation parameters that were used */
  appliedParameters?: GenerationParameters;
  /** Adapter-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Token usage statistics.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ============================================================================
// Handoff Signal Types
// ============================================================================

/**
 * Reasons for requesting handoff to external system.
 */
export type HandoffReason =
  | 'oom'           // Out of memory
  | 'timeout'       // Inference would exceed time limit
  | 'unsupported'   // Model/operation not supported
  | 'unavailable'   // Required adapter unavailable
  | 'queued'        // Local queue full
  | 'error';        // Unrecoverable error

/**
 * Handoff signal raised when local execution cannot proceed.
 */
export interface HandoffSignal {
  /** Why handoff is requested */
  reason: HandoffReason;
  /** Human-readable explanation */
  message: string;
  /** Original request that triggered handoff */
  originalRequest: InferenceRequest;
  /** Whether in-progress work can be checkpointed */
  canCheckpoint: boolean;
  /** Optional checkpoint data if canCheckpoint=true */
  checkpointData?: unknown;
}

/**
 * Handler for handoff signals.
 * Implemented by application layer, not runtime.
 */
export type HandoffHandler = (signal: HandoffSignal) => void | Promise<void>;

// ============================================================================
// Adapter Capability Types
// ============================================================================

/**
 * Precision formats supported by adapter.
 */
export type Precision = 'fp32' | 'fp16' | 'bf16' | 'int8' | 'int4' | 'q4_0' | 'q4_1' | 'q5_0' | 'q5_1' | 'q8_0';

/**
 * Hardware targets supported by adapter.
 */
export type HardwareTarget = 'cpu' | 'cuda' | 'rocm' | 'metal' | 'opencl' | 'directml' | 'coreml' | 'npu';

/**
 * Adapter capability advertisement.
 */
export interface AdapterCapabilities {
  /** Adapter identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Supported model formats (e.g., 'gguf', 'onnx', 'safetensors') */
  supportedFormats: string[];
  /** Supported precision formats */
  supportedPrecisions: Precision[];
  /** Supported hardware targets */
  supportedHardware: HardwareTarget[];
  /** Maximum model size (bytes) this adapter can handle */
  maxModelSize?: number;
  /** Whether streaming is supported */
  supportsStreaming: boolean;
  /** Whether batch inference is supported */
  supportsBatching: boolean;
  /** Whether chat template is handled internally */
  handlesChatTemplate: boolean;
  /** Adapter version */
  version: string;
}

/**
 * Adapter health status.
 */
export interface AdapterStatus {
  /** Whether adapter is ready for inference */
  ready: boolean;
  /** Current memory usage (bytes) */
  memoryUsed?: number;
  /** Loaded model identifier */
  loadedModel?: string;
  /** Last error if not ready */
  lastError?: string;
}

// ============================================================================
// Core Adapter Interface
// ============================================================================

/**
 * All inference adapters must implement this interface.
 * 
 * Lifecycle:
 *   1. Adapter instantiated
 *   2. load() called with model
 *   3. infer() / inferStream() called as needed
 *   4. reset() called between sessions if needed
 *  5. unload() called when done
 */
export interface IAdapter {
  /** Static capabilities (does not change after instantiation) */
  readonly capabilities: AdapterCapabilities;
  
  /** Dynamic status (changes based on load/usage) */
  readonly status: AdapterStatus;
  
  /**
   * Load a model into the adapter.
   * @param modelPath Path to model file(s)
   * @param options Adapter-specific loading options
   * @throws Error if model cannot be loaded
   */
  load(modelPath: string, options?: Record<string, unknown>): Promise<void>;
  
  /**
   * Synchronous inference.
   * Returns complete result after generation finishes.
   * @param request Inference request
   * @returns Inference response
   * @throws Error or HandoffSignal if inference fails
   */
  infer(request: InferenceRequest): Promise<InferenceResponse>;
  
  /**
   * Streaming inference.
   * Yields tokens via callback as they are generated.
   * @param request Inference request
   * @param callback Called for each token
   * @returns Final inference response (includes full content)
   * @throws Error or HandoffSignal if inference fails
   */
  inferStream(
    request: InferenceRequest,
    callback: TokenCallback
  ): Promise<InferenceResponse>;
  
  /**
   * Reset adapter internal state.
   * Keeps model loaded but clears context/kv-cache.
   */
  reset(): Promise<void>;
  
  /**
   * Unload model and release resources.
   * Adapter returns to initial state.
   */
  unload(): Promise<void>;
}

// ============================================================================
// Runtime Registry Types (Future)
// ============================================================================

/**
 * Request for the runtime to select and execute inference.
 */
export interface RuntimeInferenceRequest extends InferenceRequest {
  /** Preferred adapter (optional) */
  preferredAdapter?: string;
  /** Constraints for adapter selection */
  constraints?: AdapterConstraints;
}

/**
 * Constraints for adapter selection.
 */
export interface AdapterConstraints {
  /** Required hardware target */
  hardware?: HardwareTarget;
  /** Maximum memory to use (bytes) */
  maxMemory?: number;
  /** Required precision */
  precision?: Precision;
  /** Timeout for inference (ms) */
  timeoutMs?: number;
  /** Whether streaming is required */
  requireStreaming?: boolean;
}

/**
 * Runtime registry interface.
 * Manages adapter discovery, selection, and lifecycle.
 */
export interface IRuntimeRegistry {
  /** Register an adapter factory */
  registerAdapter(factory: AdapterFactory): void;
  
  /** Get all registered adapter capabilities */
  listAdapters(): AdapterCapabilities[];
  
  /** Find best adapter for request */
  selectAdapter(
    request: RuntimeInferenceRequest
  ): AdapterCapabilities | null;
  
  /** Get or create adapter instance */
  acquireAdapter(adapterId: string): Promise<IAdapter>;
  
  /** Release adapter instance */
  releaseAdapter(adapter: IAdapter): Promise<void>;
}

/**
 * Factory function for creating adapter instances.
 */
export type AdapterFactory = () => IAdapter;
