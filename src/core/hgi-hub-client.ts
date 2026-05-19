/**
 * HGI Edge Runtime - HGI-LOCAL-HUB Client
 *
 * Client for communicating with HGI-LOCAL-HUB nodes.
 * Implements handoff submission, health checks, and capability queries.
 *
 * Note: This is a forward-looking client. HGI-LOCAL-HUB endpoints
 * may not exist yet. The client handles 404s gracefully.
 *
 * @module src/core/hgi-hub-client
 */

import type {
  HGIHubClientConfig,
  HGIHubHandoffRequest,
  HGIHubHandoffResponse,
  HGIHubHealth,
  HGIHubCapabilities,
  HGIHubErrorType,
  HGIHubCapabilityInfo,
} from '../types/hub-handoff.js';
import { HGIHubError } from '../types/hub-handoff.js';
import type { InferenceResponse } from '../types/adapter.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:4010',
  timeoutMs: 30000,
  runtimeId: 'hgi-edge-runtime',
};

/**
 * HGI-LOCAL-HUB client
 *
 * Communicates with hub for handoff operations.
 * Handles missing endpoints gracefully.
 */
export class HGIHubClient {
  private _config: HGIHubClientConfig;
  private _abortControllers: Set<AbortController> = new Set();

  constructor(config: Partial<HGIHubClientConfig> = {}) {
    this._config = {
      baseUrl: config.baseUrl ?? process.env.HGI_LOCAL_HUB_URL ?? DEFAULT_CONFIG.baseUrl,
      timeoutMs: config.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
      runtimeId: config.runtimeId ?? DEFAULT_CONFIG.runtimeId,
      deviceId: config.deviceId,
      apiKey: config.apiKey,
    };
  }

  /**
   * Check hub health
   *
   * Endpoint: GET /health
   */
  async health(): Promise<HGIHubHealth> {
    try {
      const response = await this._fetch('/health', { method: 'GET' });

      if (response.status === 404) {
        throw new HGIHubError(
          'Health endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Health check failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        healthy: true,
        timestamp: new Date().toISOString(),
        ...data,
      } as HGIHubHealth;
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }

      // Network or other errors
      throw new HGIHubError(
        `Health check failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Query hub capabilities
   *
   * Endpoint: GET /capabilities
   */
  async capabilities(): Promise<HGIHubCapabilities> {
    try {
      const response = await this._fetch('/capabilities', { method: 'GET' });

      if (response.status === 404) {
        throw new HGIHubError(
          'Capabilities endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Capabilities query failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        hubId: (data.hubId as string) ?? 'unknown',
        timestamp: new Date().toISOString(),
        capabilities: (data.capabilities as HGIHubCapabilityInfo[]) ?? [],
      };
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }

      throw new HGIHubError(
        `Capabilities query failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Submit handoff request to hub
   *
   * Endpoint: POST /handoff
   */
  async submitHandoff(request: HGIHubHandoffRequest): Promise<HGIHubHandoffResponse> {
    try {
      const response = await this._fetch('/handoff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (response.status === 404) {
        throw new HGIHubError(
          'Handoff endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (response.status === 503) {
        // Hub is available but can't accept handoff
        const error = await response.json().catch(() => ({ message: 'Service unavailable' })) as { message: string };
        throw new HGIHubError(
          error.message ?? 'Hub temporarily unavailable',
          'unavailable',
          503
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Handoff submission failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      const data = await response.json() as Record<string, unknown>;
      return {
        accepted: (data.accepted as boolean) ?? true,
        handoffId: data.handoffId as string | undefined,
        status: (data.status as HGIHubHandoffResponse['status']) ?? 'pending',
        targetNodeId: data.targetNodeId as string | undefined,
        estimatedWaitMs: data.estimatedWaitMs as number | undefined,
        result: data.result as InferenceResponse | undefined,
        error: data.error as HGIHubHandoffResponse['error'] | undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }

      throw new HGIHubError(
        `Handoff submission failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get handoff status
   *
   * Endpoint: GET /handoff/:id
   */
  async getHandoffStatus(handoffId: string): Promise<HGIHubHandoffResponse> {
    try {
      const response = await this._fetch(`/handoff/${encodeURIComponent(handoffId)}`, {
        method: 'GET',
      });

      if (response.status === 404) {
        throw new HGIHubError(
          'Handoff status endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Status query failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }
      const data = await response.json() as Record<string, unknown>;
      return {
        accepted: (data.accepted as boolean) ?? true,
        handoffId: (data.handoffId as string) ?? handoffId,
        status: (data.status as HGIHubHandoffResponse['status']) ?? 'unknown',
        targetNodeId: data.targetNodeId as string | undefined,
        estimatedWaitMs: data.estimatedWaitMs as number | undefined,
        result: data.result as InferenceResponse | undefined,
        error: data.error as HGIHubHandoffResponse['error'] | undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }

      throw new HGIHubError(
        `Status query failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * List handoff queue
   *
   * Endpoint: GET /handoff/queue
   * Returns queued handoffs available for workers
   */
  async listHandoffQueue(): Promise<Array<{ id: string; status: string; requestedCapability: string; createdAt: string }>> {
    try {
      const response = await this._fetch('/handoff/queue', { method: 'GET' });

      if (response.status === 404) {
        throw new HGIHubError(
          'Handoff queue endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Queue query failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      const data = await response.json() as { queue?: Array<{ handoffId: string; status?: string; requestedCapability?: string; queuedAt: string }> };
      // Map hub's queue format to our format
      return (data.queue ?? []).map(item => ({
        id: item.handoffId,
        status: item.status ?? 'queued', // Default to queued since they're in the queue
        requestedCapability: item.requestedCapability ?? 'llm',
        createdAt: item.queuedAt,
      }));
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }
      throw new HGIHubError(
        `Queue query failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Get claimable handoffs for this worker (intelligent selection)
   *
   * Endpoint: GET /handoff/claimable?workerId=...
   * Returns handoffs that are compatible with this worker's capabilities,
   * ordered by priority (highest first).
   */
  async getClaimableHandoffs(workerId: string): Promise<Array<{
    id: string;
    status: string;
    requestedCapability: string;
    createdAt: string;
    priority?: number;
    estimatedComplexity?: string;
  }>> {
    try {
      const response = await this._fetch(`/handoff/claimable?workerId=${encodeURIComponent(workerId)}`, { method: 'GET' });

      if (response.status === 404) {
        throw new HGIHubError(
          'Claimable endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Claimable query failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      const data = await response.json() as {
        claimable?: Array<{
          handoffId: string;
          status?: string;
          requestedCapability?: string;
          queuedAt: string;
          priority?: number;
          estimatedComplexity?: string;
        }>;
        workerId?: string;
        workerCapabilities?: string[];
        count?: number;
      };

      // Map hub's claimable format to our format
      return (data.claimable ?? []).map(item => ({
        id: item.handoffId,
        status: item.status ?? 'queued',
        requestedCapability: item.requestedCapability ?? 'llm',
        createdAt: item.queuedAt,
        priority: item.priority,
        estimatedComplexity: item.estimatedComplexity,
      }));
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }
      throw new HGIHubError(
        `Claimable query failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Claim a handoff for processing
   *
   * Endpoint: POST /handoff/:id/claim
   */
  async claimHandoff(handoffId: string, workerId: string): Promise<boolean> {
    try {
      const response = await this._fetch(`/handoff/${encodeURIComponent(handoffId)}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workerId }),
      });

      if (response.status === 404) {
        throw new HGIHubError(
          'Handoff claim endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (response.status === 409) {
        // Handoff already claimed by another worker
        return false;
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Claim failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }
      throw new HGIHubError(
        `Claim failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Mark handoff as started
   *
   * Endpoint: POST /handoff/:id/start
   */
  async startHandoff(handoffId: string): Promise<boolean> {
    try {
      const response = await this._fetch(`/handoff/${encodeURIComponent(handoffId)}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 404) {
        throw new HGIHubError(
          'Handoff start endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Start failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }
      throw new HGIHubError(
        `Start failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Complete handoff with result
   *
   * Endpoint: POST /handoff/:id/complete
   */
  async completeHandoff(
    handoffId: string,
    result: { text: string; model: string; workerId: string; metrics?: Record<string, unknown> }
  ): Promise<boolean> {
    try {
      const response = await this._fetch(`/handoff/${encodeURIComponent(handoffId)}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ result }),
      });

      if (response.status === 404) {
        throw new HGIHubError(
          'Handoff complete endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Complete failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      return true;
    } catch (error) {
      if (error instanceof HGIHubError) {
        throw error;
      }
      throw new HGIHubError(
        `Complete failed: ${error instanceof Error ? error.message : String(error)}`,
        'network',
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Mark handoff as failed
   *
   * Endpoint: POST /handoff/:id/fail
   */
  async failHandoff(handoffId: string, error: { message: string; code?: string }): Promise<boolean> {
    try {
      const response = await this._fetch(`/handoff/${encodeURIComponent(handoffId)}/fail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error }),
      });

      if (response.status === 404) {
        throw new HGIHubError(
          'Handoff fail endpoint not found (404) - HGI-LOCAL-HUB may not implement this yet',
          'not_found',
          404
        );
      }

      if (!response.ok) {
        throw new HGIHubError(
          `Fail call failed: ${response.status} ${response.statusText}`,
          this._statusToErrorType(response.status),
          response.status
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HGIHubError) {
        throw err;
      }
      throw new HGIHubError(
        `Fail call failed: ${err instanceof Error ? err.message : String(err)}`,
        'network',
        undefined,
        err instanceof Error ? err : undefined
      );
    }
  }

  /**
   * Check if hub is reachable
   *
   * Returns true if health check succeeds, false otherwise
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.health();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current configuration
   */
  get config(): Readonly<HGIHubClientConfig> {
    return { ...this._config };
  }

  /**
   * Abort all pending requests
   */
  abortAll(): void {
    for (const controller of this._abortControllers) {
      controller.abort();
    }
    this._abortControllers.clear();
  }

  /**
   * Internal fetch with timeout and abort support
   */
  private async _fetch(
    path: string,
    init: RequestInit = {}
  ): Promise<Response> {
    const controller = new AbortController();
    this._abortControllers.add(controller);

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this._config.timeoutMs);

    try {
      const url = new URL(path, this._config.baseUrl).toString();
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      return response;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HGIHubError(
          `Request timed out after ${this._config.timeoutMs}ms`,
          'timeout'
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
      this._abortControllers.delete(controller);
    }
  }

  /**
   * Convert HTTP status to error type
   */
  private _statusToErrorType(status: number): HGIHubErrorType {
    switch (status) {
      case 404:
        return 'not_found';
      case 408:
      case 504:
        return 'timeout';
      case 503:
        return 'unavailable';
      case 400:
      case 422:
        return 'invalid';
      default:
        return 'unknown';
    }
  }
}

/**
 * Create HGI-LOCAL-HUB client
 */
export function createHGIHubClient(config?: Partial<HGIHubClientConfig>): HGIHubClient {
  return new HGIHubClient(config);
}
