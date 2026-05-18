/**
 * HGI Edge Runtime - HGI-LOCAL-HUB Client Tests
 *
 * Mocked tests for hub client functionality.
 * No real HGI-LOCAL-HUB required.
 *
 * @module tests/hgi-hub-client.test
 */

import { jest } from '@jest/globals';
import { HGIHubClient, createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { HGIHubError } from '../src/types/hub-handoff.js';
import type { HGIHubHandoffRequest, HGIHubHealth, HGIHubCapabilities } from '../src/types/hub-handoff.js';

// Use jest.spyOn to mock global fetch with flexible return type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch = jest.spyOn(global, 'fetch' as any).mockImplementation(jest.fn());

// Note: These tests are temporarily skipped due to ESM fetch mocking issues
describe.skip('HGIHubClient', () => {
  let client: HGIHubClient;

  beforeEach(() => {
    client = createHGIHubClient({
      baseUrl: 'http://localhost:4010',
      timeoutMs: 5000,
      runtimeId: 'test-runtime',
    });
    mockFetch.mockReset();
  });

  describe('Constructor', () => {
    test('creates client with default config', () => {
      const defaultClient = createHGIHubClient();
      expect(defaultClient.config.baseUrl).toBe('http://localhost:4010');
      expect(defaultClient.config.timeoutMs).toBe(30000);
      expect(defaultClient.config.runtimeId).toBe('hgi-edge-runtime');
    });

    test('creates client with custom config', () => {
      const customClient = createHGIHubClient({
        baseUrl: 'http://custom:8080',
        timeoutMs: 10000,
        runtimeId: 'custom-runtime',
        deviceId: 'device-123',
      });
      expect(customClient.config.baseUrl).toBe('http://custom:8080');
      expect(customClient.config.timeoutMs).toBe(10000);
      expect(customClient.config.runtimeId).toBe('custom-runtime');
      expect(customClient.config.deviceId).toBe('device-123');
    });

    test('reads base URL from environment', () => {
      process.env.HGI_LOCAL_HUB_URL = 'http://env-hub:3000';
      const envClient = createHGIHubClient();
      expect(envClient.config.baseUrl).toBe('http://env-hub:3000');
      delete process.env.HGI_LOCAL_HUB_URL;
    });
  });

  describe('health()', () => {
    test('returns health status on success', async () => {
      const mockHealth: HGIHubHealth = {
        healthy: true,
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        availableNodes: 5,
        queueDepth: 0,
        uptimeSeconds: 3600,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockHealth,
      });

      const result = await client.health();

      expect(result.healthy).toBe(true);
      expect(result.version).toBe('1.0.0');
      expect(result.availableNodes).toBe(5);
    });

    test('throws not_found error on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      await expect(client.health()).rejects.toThrow(HGIHubError);
      await expect(client.health()).rejects.toThrow('Health endpoint not found');
    });

    test('throws network error on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.health()).rejects.toThrow(HGIHubError);
      await expect(client.health()).rejects.toThrow('Network error');
    });
  });

  describe('capabilities()', () => {
    test('returns capabilities on success', async () => {
      const mockCapabilities: HGIHubCapabilities = {
        hubId: 'hub-123',
        timestamp: new Date().toISOString(),
        capabilities: [
          { capability: 'llm', available: true, nodeCount: 5 },
          { capability: 'stt', available: false, nodeCount: 0 },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockCapabilities,
      });

      const result = await client.capabilities();

      expect(result.hubId).toBe('hub-123');
      expect(result.capabilities).toHaveLength(2);
      expect(result.capabilities[0].capability).toBe('llm');
      expect(result.capabilities[0].available).toBe(true);
    });

    test('throws not_found error on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      await expect(client.capabilities()).rejects.toThrow(HGIHubError);
      await expect(client.capabilities()).rejects.toThrow('Capabilities endpoint not found');
    });
  });

  describe('submitHandoff()', () => {
    test('returns handoff response on success', async () => {
      const mockRequest: Partial<HGIHubHandoffRequest> = {
        requestId: 'req-123',
        sourceRuntimeId: 'test-runtime',
        localModel: { modelId: 'test-model' },
        originalRequest: {
          input: 'Hello',
          model: 'test-model',
          parameters: {},
        },
        handoffSignal: {
          type: 'OOM_RISK',
          severity: 'high',
          reason: 'Memory threshold crossed',
          metrics: { timestamp: new Date().toISOString() },
          suggestedTarget: 'node',
          timestamp: new Date().toISOString(),
          mandatory: false,
          crossedThresholds: ['heapMemory'],
        },
        metrics: { timestamp: new Date().toISOString() },
        requestedCapability: 'llm',
        createdAt: new Date().toISOString(),
      };

      const mockResponse = {
        accepted: true,
        handoffId: 'handoff-456',
        status: 'pending',
        estimatedWaitMs: 1000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponse,
      });

      const result = await client.submitHandoff(mockRequest as HGIHubHandoffRequest);

      expect(result.accepted).toBe(true);
      expect(result.handoffId).toBe('handoff-456');
      expect(result.status).toBe('pending');
      expect(result.estimatedWaitMs).toBe(1000);
    });

    test('throws not_found error on 404', async () => {
      const mockRequest: Partial<HGIHubHandoffRequest> = {
        requestId: 'req-123',
        sourceRuntimeId: 'test-runtime',
        localModel: { modelId: 'test-model' },
        originalRequest: { input: 'Hello', model: 'test-model', parameters: {} },
        handoffSignal: {
          type: 'OOM_RISK',
          severity: 'high',
          reason: 'Test',
          metrics: { timestamp: new Date().toISOString() },
          suggestedTarget: 'node',
          timestamp: new Date().toISOString(),
          mandatory: false,
          crossedThresholds: [],
        },
        metrics: { timestamp: new Date().toISOString() },
        requestedCapability: 'llm',
        createdAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      await expect(client.submitHandoff(mockRequest as HGIHubHandoffRequest)).rejects.toThrow(HGIHubError);
      await expect(client.submitHandoff(mockRequest as HGIHubHandoffRequest)).rejects.toThrow('Handoff endpoint not found');
    });

    test('throws unavailable error on 503', async () => {
      const mockRequest: Partial<HGIHubHandoffRequest> = {
        requestId: 'req-123',
        sourceRuntimeId: 'test-runtime',
        localModel: { modelId: 'test-model' },
        originalRequest: { input: 'Hello', model: 'test-model', parameters: {} },
        handoffSignal: {
          type: 'OOM_RISK',
          severity: 'high',
          reason: 'Test',
          metrics: { timestamp: new Date().toISOString() },
          suggestedTarget: 'node',
          timestamp: new Date().toISOString(),
          mandatory: false,
          crossedThresholds: [],
        },
        metrics: { timestamp: new Date().toISOString() },
        requestedCapability: 'llm',
        createdAt: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ message: 'Queue full' }),
      });

      await expect(client.submitHandoff(mockRequest as HGIHubHandoffRequest)).rejects.toThrow(HGIHubError);
      await expect(client.submitHandoff(mockRequest as HGIHubHandoffRequest)).rejects.toThrow('Queue full');
    });
  });

  describe('getHandoffStatus()', () => {
    test('returns status on success', async () => {
      const mockStatus = {
        accepted: true,
        handoffId: 'handoff-456',
        status: 'in_progress',
        targetNodeId: 'node-789',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockStatus,
      });

      const result = await client.getHandoffStatus('handoff-456');

      expect(result.handoffId).toBe('handoff-456');
      expect(result.status).toBe('in_progress');
      expect(result.targetNodeId).toBe('node-789');
    });

    test('throws not_found error on 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      await expect(client.getHandoffStatus('handoff-456')).rejects.toThrow(HGIHubError);
      await expect(client.getHandoffStatus('handoff-456')).rejects.toThrow('Handoff status endpoint not found');
    });
  });

  describe('isReachable()', () => {
    test('returns true when health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ healthy: true }),
      });

      const result = await client.isReachable();
      expect(result).toBe(true);
    });

    test('returns false when health check fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.isReachable();
      expect(result).toBe(false);
    });
  });

  describe('timeout behavior', () => {
    test('aborts request on timeout', async () => {
      const slowClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 1, // Very short timeout
      });

      // Mock fetch to never resolve (simulates slow response)
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      await expect(slowClient.health()).rejects.toThrow('timed out');
    });
  });

  describe('Error types', () => {
    test('HGIHubError has correct properties', () => {
      const error = new HGIHubError('Test error', 'network', 500, new Error('Cause'));

      expect(error.message).toBe('Test error');
      expect(error.type).toBe('network');
      expect(error.statusCode).toBe(500);
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.name).toBe('HGIHubError');
    });
  });
});
