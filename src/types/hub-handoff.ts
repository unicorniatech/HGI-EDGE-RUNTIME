/**
 * HGI Edge Runtime - HGI-LOCAL-HUB Handoff Types
 *
 * Defines the client-side contract for handoff communication
 * with HGI-LOCAL-HUB nodes. This is a forward-looking contract
 * for endpoints that may not exist yet in HGI-LOCAL-HUB.
 *
 * @module src/types/hub-handoff
 */

import type { HandoffSignal, ResourceMetricsSnapshot } from './handoff.js';
import type { InferenceRequest, InferenceResponse } from './adapter.js';

/**
 * Capability types that can be requested from HGI-LOCAL-HUB
 */
export type HGIHubCapability =
  | 'llm'           // Large language model inference
  | 'stt'           // Speech-to-text
  | 'embedding'     // Text embeddings
  | 'rag'           // Retrieval-augmented generation
  | 'vision'        // Vision/multimodal
  | 'tts';          // Text-to-speech

/**
 * Handoff request to HGI-LOCAL-HUB
 *
 * Sent when local inference determines handoff is needed.
 */
export interface HGIHubHandoffRequest {
  /** Unique request identifier */
  requestId: string;
  /** Runtime instance identifier */
  sourceRuntimeId: string;
  /** Optional device identifier */
  sourceDeviceId?: string;
  /** Local model that was attempted */
  localModel: {
    /** Model identifier or name */
    modelId: string;
    /** Model file path or URL */
    modelPath?: string;
    /** Model size in bytes if known */
    modelSizeBytes?: number;
  };
  /** Original inference request */
  originalRequest: InferenceRequest;
  /** Local response if partial/incomplete */
  localResponse?: InferenceResponse;
  /** Handoff signal that triggered this request */
  handoffSignal: HandoffSignal;
  /** Resource metrics at handoff time */
  metrics: ResourceMetricsSnapshot;
  /** Capability being requested */
  requestedCapability: HGIHubCapability;
  /** Timestamp when request was created (ISO 8601) */
  createdAt: string;
  /** Optional priority level (higher = more urgent) */
  priority?: number;
}

/**
 * Handoff status values
 */
export type HGIHubHandoffStatus =
  | 'pending'       // Waiting for node assignment
  | 'queued'        // Assigned to node, waiting for execution
  | 'assigned'      // Assigned to specific node
  | 'in_progress'   // Currently being processed
  | 'completed'     // Successfully completed
  | 'failed'        // Execution failed
  | 'rejected'      // Handoff rejected by hub
  | 'timeout';      // Exceeded time limit

/**
 * Handoff response from HGI-LOCAL-HUB
 */
export interface HGIHubHandoffResponse {
  /** Whether handoff was accepted */
  accepted: boolean;
  /** Handoff identifier for status tracking */
  handoffId?: string;
  /** Current status of handoff */
  status: HGIHubHandoffStatus;
  /** Target node identifier if assigned */
  targetNodeId?: string;
  /** Estimated wait time in milliseconds */
  estimatedWaitMs?: number;
  /** Inference result if completed */
  result?: InferenceResponse;
  /** Error details if failed/rejected */
  error?: {
    /** Error code */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error details */
    details?: Record<string, unknown>;
  };
  /** Timestamp of response (ISO 8601) */
  timestamp: string;
}

/**
 * Health status of HGI-LOCAL-HUB
 */
export interface HGIHubHealth {
  /** Whether hub is operational */
  healthy: boolean;
  /** Hub version */
  version?: string;
  /** Timestamp of health check (ISO 8601) */
  timestamp: string;
  /** Available nodes count */
  availableNodes?: number;
  /** Queue depth (requests waiting) */
  queueDepth?: number;
  /** Hub uptime in seconds */
  uptimeSeconds?: number;
}

/**
 * Capability advertisement from HGI-LOCAL-HUB
 */
export interface HGIHubCapabilityInfo {
  /** Capability type */
  capability: HGIHubCapability;
  /** Whether capability is available */
  available: boolean;
  /** Nodes supporting this capability */
  nodeCount?: number;
  /** Average latency for this capability */
  averageLatencyMs?: number;
  /** Supported models for this capability */
  supportedModels?: string[];
}

/**
 * Capabilities response from HGI-LOCAL-HUB
 */
export interface HGIHubCapabilities {
  /** Hub identifier */
  hubId: string;
  /** Timestamp of capabilities (ISO 8601) */
  timestamp: string;
  /** Available capabilities */
  capabilities: HGIHubCapabilityInfo[];
}

/**
 * Configuration for HGI hub client
 */
export interface HGIHubClientConfig {
  /** Base URL for HGI-LOCAL-HUB */
  baseUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Runtime identifier */
  runtimeId: string;
  /** Device identifier (optional) */
  deviceId?: string;
  /** API key for authentication (future) */
  apiKey?: string;
}

/**
 * Handoff client error types
 */
export type HGIHubErrorType =
  | 'network'       // Network connectivity issue
  | 'timeout'       // Request timed out
  | 'not_found'     // Endpoint not found (404)
  | 'unavailable'   // Hub not available
  | 'rejected'      // Handoff rejected
  | 'invalid'       // Invalid request/response
  | 'unknown';      // Unknown error

/**
 * Handoff client error
 */
export class HGIHubError extends Error {
  /** Error type */
  public readonly type: HGIHubErrorType;
  /** HTTP status code if applicable */
  public readonly statusCode?: number;
  /** Original error if wrapped */
  public readonly cause?: Error;

  constructor(
    message: string,
    type: HGIHubErrorType,
    statusCode?: number,
    cause?: Error
  ) {
    super(message);
    this.name = 'HGIHubError';
    this.type = type;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}
