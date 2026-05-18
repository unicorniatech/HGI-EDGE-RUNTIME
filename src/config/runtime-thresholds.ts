/**
 * HGI Edge Runtime - Runtime Thresholds Configuration
 *
 * Configurable thresholds for triggering handoff signals.
 * Tuned for mini-PC and edge device compatibility.
 *
 * @module src/config/runtime-thresholds
 */

/**
 * Runtime thresholds for handoff decision making
 */
export interface RuntimeThresholds {
  /** Maximum heap memory in MB before OOM risk handoff */
  maxMemoryMB: number;
  /** Maximum RSS memory in MB before resource pressure */
  maxRssMemoryMB: number;
  /** Maximum inference time in ms before timeout risk */
  maxInferenceTimeMs: number;
  /** Maximum prompt tokens for local inference */
  maxPromptTokens: number;
  /** Maximum context window size */
  maxContextSize: number;
  /** Minimum acceptable tokens per second */
  minTokensPerSecond: number;
  /** Maximum model file size in MB */
  maxModelSizeMB: number;
  /** Maximum consecutive slow inferences before handoff */
  maxSlowInferences: number;
  /** Threshold for "slow" inference (ms per token) */
  slowInferenceThresholdMs: number;
}

/**
 * Default thresholds optimized for edge devices
 * 
 * Conservative values suitable for:
 * - Mini PCs (8-16GB RAM)
 * - Edge devices
 * - Laptops
 */
export const DEFAULT_RUNTIME_THRESHOLDS: RuntimeThresholds = {
  // Memory thresholds (conservative for edge devices)
  maxMemoryMB: 1024,           // 1GB heap limit
  maxRssMemoryMB: 2048,        // 2GB RSS limit
  
  // Time thresholds
  maxInferenceTimeMs: 30000,   // 30 seconds max
  slowInferenceThresholdMs: 500, // 500ms per token = slow
  
  // Token limits
  maxPromptTokens: 4096,       // 4K prompt limit
  maxContextSize: 8192,        // 8K context window max
  minTokensPerSecond: 1,       // At least 1 token/sec
  
  // Model size limits
  maxModelSizeMB: 4096,        // 4GB model file max
  
  // Behavior thresholds
  maxSlowInferences: 3,        // Handoff after 3 slow calls
};

/**
 * Aggressive thresholds for resource-constrained devices
 * Suitable for:
 * - Raspberry Pi
 * - Low-end edge devices
 * - Battery-powered devices
 */
export const CONSERVATIVE_THRESHOLDS: RuntimeThresholds = {
  maxMemoryMB: 512,            // 512MB heap
  maxRssMemoryMB: 1024,        // 1GB RSS
  maxInferenceTimeMs: 15000,   // 15 seconds max
  slowInferenceThresholdMs: 1000, // 1 second per token
  maxPromptTokens: 2048,       // 2K prompt limit
  maxContextSize: 4096,        // 4K context max
  minTokensPerSecond: 0.5,     // 0.5 tokens/sec minimum
  maxModelSizeMB: 2048,        // 2GB model max
  maxSlowInferences: 2,        // Handoff after 2 slow calls
};

/**
 * Relaxed thresholds for high-end edge devices
 * Suitable for:
 * - High-end mini PCs
 * - Gaming laptops
 * - Workstations
 */
export const RELAXED_THRESHOLDS: RuntimeThresholds = {
  maxMemoryMB: 4096,           // 4GB heap
  maxRssMemoryMB: 8192,        // 8GB RSS
  maxInferenceTimeMs: 60000,   // 60 seconds max
  slowInferenceThresholdMs: 200, // 200ms per token
  maxPromptTokens: 8192,       // 8K prompt limit
  maxContextSize: 16384,       // 16K context max
  minTokensPerSecond: 2,       // 2 tokens/sec minimum
  maxModelSizeMB: 8192,        // 8GB model max
  maxSlowInferences: 5,        // Handoff after 5 slow calls
};

/**
 * Load thresholds from environment variables or use defaults
 */
export function loadThresholds(): RuntimeThresholds {
  return {
    maxMemoryMB: parseInt(process.env.HGI_MAX_MEMORY_MB ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.maxMemoryMB,
    maxRssMemoryMB: parseInt(process.env.HGI_MAX_RSS_MB ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.maxRssMemoryMB,
    maxInferenceTimeMs: parseInt(process.env.HGI_MAX_INFERENCE_MS ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.maxInferenceTimeMs,
    maxPromptTokens: parseInt(process.env.HGI_MAX_PROMPT_TOKENS ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.maxPromptTokens,
    maxContextSize: parseInt(process.env.HGI_MAX_CONTEXT ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.maxContextSize,
    minTokensPerSecond: parseFloat(process.env.HGI_MIN_TOKENS_PER_SEC ?? '') || DEFAULT_RUNTIME_THRESHOLDS.minTokensPerSecond,
    maxModelSizeMB: parseInt(process.env.HGI_MAX_MODEL_MB ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.maxModelSizeMB,
    maxSlowInferences: parseInt(process.env.HGI_MAX_SLOW_INFERENCES ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.maxSlowInferences,
    slowInferenceThresholdMs: parseInt(process.env.HGI_SLOW_THRESHOLD_MS ?? '', 10) || DEFAULT_RUNTIME_THRESHOLDS.slowInferenceThresholdMs,
  };
}

/**
 * Get a preset threshold configuration
 */
export function getThresholdPreset(preset: 'conservative' | 'default' | 'relaxed'): RuntimeThresholds {
  switch (preset) {
    case 'conservative':
      return CONSERVATIVE_THRESHOLDS;
    case 'relaxed':
      return RELAXED_THRESHOLDS;
    default:
      return DEFAULT_RUNTIME_THRESHOLDS;
  }
}
