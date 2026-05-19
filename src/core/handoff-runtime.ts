/**
 * HGI Edge Runtime - Handoff Runtime Integration
 *
 * Integrates handoff evaluation with HGI-LOCAL-HUB client.
 * When local inference triggers a handoff signal, this module
 * handles the submission to the hub.
 *
 * @module src/core/handoff-runtime
 */

import { HandoffEvaluator, createHandoffEvaluator } from './handoff-evaluator.js';
import { HGIHubClient, createHGIHubClient } from './hgi-hub-client.js';
import type { HandoffSignal, ResourceMetricsSnapshot } from '../types/handoff.js';
import type { InferenceRequest, InferenceResponse } from '../types/adapter.js';
import type {
  HGIHubHandoffRequest,
  HGIHubHandoffResponse,
} from '../types/hub-handoff.js';
import { HGIHubError as HGIHubErrorClass } from '../types/hub-handoff.js';

/**
 * Configuration for handoff runtime integration
 */
export interface HandoffRuntimeConfig {
  /** Hub base URL */
  hubUrl: string;
  /** Request timeout in milliseconds */
  timeoutMs: number;
  /** Runtime identifier */
  runtimeId: string;
  /** Device identifier (optional) */
  deviceId?: string;
  /** Whether to enable handoff (can be disabled for local-only mode) */
  enabled: boolean;
}

/**
 * Result of handoff attempt
 */
export interface HandoffResult {
  /** Whether handoff was successful */
  success: boolean;
  /** Whether handoff was attempted */
  attempted: boolean;
  /** Handoff signal that triggered this (if any) */
  signal?: HandoffSignal;
  /** Hub response (if handoff was submitted) */
  hubResponse?: HGIHubHandoffResponse;
  /** Error details (if handoff failed) */
  error?: {
    type: 'no_signal' | 'hub_unreachable' | 'hub_rejected' | 'timeout' | 'unknown';
    message: string;
    details?: unknown;
  };
  /** Metrics at time of evaluation */
  metrics: ResourceMetricsSnapshot;
  /** Timestamp of handoff attempt */
  timestamp: string;
}

/**
 * Local model information for handoff context
 */
export interface LocalModelInfo {
  /** Model identifier */
  modelId: string;
  /** Model file path (if local) */
  modelPath?: string;
  /** Model size in bytes */
  modelSizeBytes?: number;
}

/**
 * Handoff runtime integration
 *
 * Bridges local inference evaluation with HGI-LOCAL-HUB submission.
 */
export class HandoffRuntime {
  private _evaluator: HandoffEvaluator;
  private _hubClient: HGIHubClient;
  private _config: HandoffRuntimeConfig;

  constructor(config: Partial<HandoffRuntimeConfig> = {}) {
    this._config = {
      hubUrl: config.hubUrl ?? process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010',
      timeoutMs: config.timeoutMs ?? 30000,
      runtimeId: config.runtimeId ?? 'hgi-edge-runtime',
      deviceId: config.deviceId,
      enabled: config.enabled ?? true,
    };

    this._evaluator = createHandoffEvaluator();
    this._hubClient = createHGIHubClient({
      baseUrl: this._config.hubUrl,
      timeoutMs: this._config.timeoutMs,
      runtimeId: this._config.runtimeId,
      deviceId: this._config.deviceId,
    });
  }

  /**
   * Evaluate metrics and potentially submit handoff to hub
   *
   * @param metrics Resource metrics from local inference
   * @param request Original inference request
   * @param localResponse Local response (if partial/incomplete)
   * @param modelInfo Local model information
   * @returns Handoff result with status and hub response
   */
  async evaluateAndSubmit(
    metrics: ResourceMetricsSnapshot,
    request: InferenceRequest,
    localResponse: InferenceResponse | undefined,
    modelInfo: LocalModelInfo
  ): Promise<HandoffResult> {
    const timestamp = new Date().toISOString();

    // Evaluate if handoff is needed
    const evaluation = this._evaluator.evaluate(metrics);

    // No handoff signal - stay local
    if (!evaluation.shouldHandoff || !evaluation.signal) {
      return {
        success: true,
        attempted: false,
        signal: evaluation.signal ?? undefined,
        metrics,
        timestamp,
      };
    }

    // Handoff is disabled
    if (!this._config.enabled) {
      return {
        success: false,
        attempted: false,
        signal: evaluation.signal ?? undefined,
        metrics,
        timestamp,
        error: {
          type: 'no_signal',
          message: 'Handoff signal generated but handoff is disabled',
        },
      };
    }

    // Build handoff request
    const handoffRequest: HGIHubHandoffRequest = {
      requestId: `handoff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceRuntimeId: this._config.runtimeId,
      sourceDeviceId: this._config.deviceId,
      localModel: {
        modelId: modelInfo.modelId,
        modelPath: modelInfo.modelPath,
        modelSizeBytes: modelInfo.modelSizeBytes,
      },
      originalRequest: request,
      localResponse,
      handoffSignal: evaluation.signal,
      metrics,
      requestedCapability: 'llm',
      createdAt: timestamp,
    };

    // Serialize complex objects for hub compatibility
    // The hub expects handoffSignal, localModel, originalRequest as JSON strings
    // metrics should remain as an object
    const serializedRequest = {
      ...handoffRequest,
      handoffSignal: JSON.stringify(handoffRequest.handoffSignal),
      localModel: JSON.stringify(handoffRequest.localModel),
      originalRequest: JSON.stringify(handoffRequest.originalRequest),
      localResponse: handoffRequest.localResponse ? JSON.stringify(handoffRequest.localResponse) : undefined,
    };

    // Submit to hub
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hubResponse = await this._hubClient.submitHandoff(serializedRequest as any);

      return {
        success: hubResponse.accepted,
        attempted: true,
        signal: evaluation.signal,
        hubResponse,
        metrics,
        timestamp,
      };
    } catch (error) {
      return this._handleHubError(error, evaluation.signal, metrics, timestamp);
    }
  }

  /**
   * Check if hub is reachable
   */
  async isHubReachable(): Promise<boolean> {
    return this._hubClient.isReachable();
  }

  /**
   * Get handoff status from hub
   */
  async getHandoffStatus(handoffId: string): Promise<HGIHubHandoffResponse | undefined> {
    try {
      return await this._hubClient.getHandoffStatus(handoffId);
    } catch {
      return undefined;
    }
  }

  /**
   * Get current configuration
   */
  get config(): Readonly<HandoffRuntimeConfig> {
    return { ...this._config };
  }

  /**
   * Handle hub errors gracefully
   */
  private _handleHubError(
    error: unknown,
    signal: HandoffSignal,
    metrics: ResourceMetricsSnapshot,
    timestamp: string
  ): HandoffResult {
    if (error instanceof HGIHubErrorClass) {
      switch (error.type) {
        case 'not_found':
          return {
            success: false,
            attempted: true,
            signal,
            metrics,
            timestamp,
            error: {
              type: 'hub_rejected',
              message: 'HGI-LOCAL-HUB endpoint not found - may not implement handoff yet',
              details: error.message,
            },
          };
        case 'unavailable':
          return {
            success: false,
            attempted: true,
            signal,
            metrics,
            timestamp,
            error: {
              type: 'hub_rejected',
              message: 'HGI-LOCAL-HUB temporarily unavailable',
              details: error.message,
            },
          };
        case 'timeout':
          return {
            success: false,
            attempted: true,
            signal,
            metrics,
            timestamp,
            error: {
              type: 'timeout',
              message: 'Handoff request timed out',
              details: error.message,
            },
          };
        case 'network':
          return {
            success: false,
            attempted: true,
            signal,
            metrics,
            timestamp,
            error: {
              type: 'hub_unreachable',
              message: 'HGI-LOCAL-HUB is not reachable',
              details: error.message,
            },
          };
        default:
          return {
            success: false,
            attempted: true,
            signal,
            metrics,
            timestamp,
            error: {
              type: 'unknown',
              message: `Handoff failed: ${error.message}`,
              details: error,
            },
          };
      }
    }

    // Unknown error
    return {
      success: false,
      attempted: true,
      signal,
      metrics,
      timestamp,
      error: {
        type: 'unknown',
        message: `Unexpected error during handoff: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
      },
    };
  }
}

/**
 * Create handoff runtime integration
 */
export function createHandoffRuntime(config?: Partial<HandoffRuntimeConfig>): HandoffRuntime {
  return new HandoffRuntime(config);
}
