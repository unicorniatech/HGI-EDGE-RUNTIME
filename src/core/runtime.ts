/**
 * HGI Edge Runtime - Core Runtime
 * 
 * Minimal runtime lifecycle implementation.
 * Phase 1: Skeleton only. No actual inference.
 */

import type {
  IAdapter,
  InferenceRequest,
  InferenceResponse,
  TokenCallback,
  HandoffHandler,
} from '../types/index.js';

/**
 * Runtime configuration options.
 */
export interface RuntimeConfig {
  /** Handler for handoff signals */
  onHandoff?: HandoffHandler;
  /** Default timeout for inference (ms) */
  defaultTimeoutMs?: number;
  /** Maximum memory to use (bytes) */
  maxMemoryBytes?: number;
  /** Whether to cache adapters between requests */
  cacheAdapters?: boolean;
}

/**
 * Core runtime for HGI Edge inference.
 * 
 * TODO (Phase 2+):
 * - Integrate with IRuntimeRegistry for adapter selection
 * - Implement actual inference delegation to adapters
 * - Add handoff signal detection and routing
 * - Add memory monitoring
 * - Add adapter caching
 */
export class HGIRuntime {
  private _config: RuntimeConfig;
  private _currentAdapter: IAdapter | null = null;
  private _isInitialized = false;

  constructor(config: RuntimeConfig = {}) {
    this._config = {
      defaultTimeoutMs: 30000,
      cacheAdapters: false,
      ...config,
    };
  }

  /**
   * Initialize the runtime.
   * Phase 1: No-op skeleton.
   */
  async initialize(): Promise<void> {
    // TODO: Initialize registry, warm up caches
    this._isInitialized = true;
    console.log('[HGIRuntime] Initialized (skeleton)');
  }

  /**
   * Load a model via appropriate adapter.
   * Phase 1: No-op skeleton.
   */
  async load(modelPath: string, _adapterId?: string): Promise<void> {
    this.ensureInitialized();
    // TODO: Select adapter, load model
    console.log(`[HGIRuntime] load() called: ${modelPath} (skeleton)`);
  }

  /**
   * Synchronous inference.
   * Phase 1: Throws "not implemented".
   */
  async infer(_request: InferenceRequest): Promise<InferenceResponse> {
    this.ensureInitialized();
    // TODO: Delegate to loaded adapter
    throw new Error('infer() not implemented (Phase 1 skeleton)');
  }

  /**
   * Streaming inference.
   * Phase 1: Throws "not implemented".
   */
  async inferStream(
    _request: InferenceRequest,
    _callback: TokenCallback
  ): Promise<InferenceResponse> {
    this.ensureInitialized();
    // TODO: Delegate to loaded adapter with streaming
    throw new Error('inferStream() not implemented (Phase 1 skeleton)');
  }

  /**
   * Reset current adapter state.
   * Phase 1: No-op skeleton.
   */
  async reset(): Promise<void> {
    this.ensureInitialized();
    // TODO: Reset loaded adapter
    console.log('[HGIRuntime] reset() called (skeleton)');
  }

  /**
   * Unload current model and adapter.
   * Phase 1: No-op skeleton.
   */
  async unload(): Promise<void> {
    this.ensureInitialized();
    // TODO: Unload adapter, release resources
    this._currentAdapter = null;
    console.log('[HGIRuntime] unload() called (skeleton)');
  }

  /**
   * Shutdown the runtime.
   * Phase 1: No-op skeleton.
   */
  async shutdown(): Promise<void> {
    await this.unload();
    this._isInitialized = false;
    console.log('[HGIRuntime] Shutdown complete (skeleton)');
  }

  private ensureInitialized(): void {
    if (!this._isInitialized) {
      throw new Error('Runtime not initialized. Call initialize() first.');
    }
  }
}

/**
 * Create a configured runtime instance.
 */
export function createRuntime(config?: RuntimeConfig): HGIRuntime {
  return new HGIRuntime(config);
}
