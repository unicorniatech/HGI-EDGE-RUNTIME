/**
 * HGI Edge Runtime - Handoff Signal Types
 *
 * Defines handoff signals for hierarchical inference architecture.
 * Local → Node → Cloud (optional)
 *
 * @module src/types/handoff
 */

/**
 * Handoff signal types indicating why handoff is requested
 */
export type HandoffSignalType =
  | 'HANDOFF_REQUIRED'      // Must handoff - local cannot handle
  | 'HANDOFF_RECOMMENDED'   // Should handoff - local struggling
  | 'LOCAL_ONLY'            // Explicitly stay local (privacy, offline)
  | 'OOM_RISK'              // Out of memory risk detected
  | 'TIMEOUT_RISK'          // Inference timeout risk
  | 'MODEL_UNAVAILABLE'     // Model not available locally
  | 'CAPABILITY_UNSUPPORTED' // Required capability not supported
  | 'RESOURCE_PRESSURE'   // System under resource pressure
  | 'PROMPT_TOO_LARGE'      // Prompt exceeds local capacity
  | 'INFERENCE_TOO_SLOW';  // Tokens/sec below threshold

/**
 * Handoff severity levels
 */
export type HandoffSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Target for handoff
 */
export type HandoffTarget = 'local' | 'node' | 'cloud' | 'auto';

/**
 * Resource metrics snapshot at time of handoff decision
 */
export interface ResourceMetricsSnapshot {
  /** Timestamp of snapshot (ISO 8601) */
  timestamp: string;
  /** Heap memory used (bytes) */
  heapUsed?: number;
  /** RSS memory (bytes) */
  rss?: number;
  /** External memory (bytes) */
  external?: number;
  /** Total heap available (bytes) */
  heapTotal?: number;
  /** Model loading time (ms) */
  loadTimeMs?: number;
  /** Inference elapsed time (ms) */
  inferenceTimeMs?: number;
  /** Time to first token (ms, streaming only) */
  timeToFirstTokenMs?: number;
  /** Tokens per second (estimated) */
  tokensPerSecond?: number;
  /** Prompt tokens count */
  promptTokens?: number;
  /** Completion tokens count */
  completionTokens?: number;
  /** Model file size (bytes, estimated) */
  modelSizeBytes?: number;
  /** Context window size */
  contextSize?: number;
}

/**
 * Handoff signal produced by runtime when local inference should yield
 */
export interface HandoffSignal {
  /** Signal type indicating reason for handoff */
  type: HandoffSignalType;
  /** Severity level */
  severity: HandoffSeverity;
  /** Human-readable explanation */
  reason: string;
  /** Resource metrics at decision time */
  metrics: ResourceMetricsSnapshot;
  /** Suggested target for handoff */
  suggestedTarget: HandoffTarget;
  /** Timestamp when signal was generated */
  timestamp: string;
  /** Adapter that produced the signal */
  sourceAdapter?: string;
  /** Request ID for correlation */
  requestId?: string;
  /** Whether handoff is mandatory or advisory */
  mandatory: boolean;
  /** Thresholds that were crossed */
  crossedThresholds: string[];
}

/**
 * Handoff handler callback type
 */
export type HandoffHandler = (signal: HandoffSignal) => void | Promise<void>;

/**
 * Options for configuring handoff behavior
 */
export interface HandoffOptions {
  /** Whether to automatically handoff when recommended */
  autoHandoff?: boolean;
  /** Minimum severity to trigger handoff */
  minSeverity?: HandoffSeverity;
  /** Custom handler for handoff signals */
  onHandoff?: HandoffHandler;
  /** Whether to allow cloud fallback */
  allowCloud?: boolean;
  /** Whether to allow node fallback */
  allowNode?: boolean;
  /** Maximum retries locally before handoff */
  maxLocalRetries?: number;
}

/**
 * Result of handoff evaluation
 */
export interface HandoffEvaluation {
  /** Whether handoff is needed */
  shouldHandoff: boolean;
  /** Signal if handoff needed, null otherwise */
  signal: HandoffSignal | null;
  /** All thresholds checked */
  checkedThresholds: ThresholdCheck[];
}

/**
 * Individual threshold check result
 */
export interface ThresholdCheck {
  /** Threshold name */
  name: string;
  /** Threshold value */
  limit: number;
  /** Actual value measured */
  actual: number;
  /** Whether threshold was crossed */
  crossed: boolean;
  /** Severity if crossed */
  severity?: HandoffSeverity;
}
