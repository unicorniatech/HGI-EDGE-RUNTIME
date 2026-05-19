/**
 * HGI Edge Runtime - Hub Handoff Mapping Tests
 *
 * Tests for converting rich internal handoff requests to hub-compatible payload.
 *
 * @module tests/hub-handoff-mapping.test
 */

import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import type { HGIHubHandoffRequest } from '../src/types/hub-handoff.js';

describe('Hub Handoff Payload Mapping', () => {
  let client: ReturnType<typeof createHGIHubClient>;

  beforeEach(() => {
    client = createHGIHubClient({
      baseUrl: 'http://localhost:4010',
      runtimeId: 'test-runtime',
    });
  });

  describe('toHubHandoffPayload mapper', () => {
    test('maps rich internal request to hub-compatible payload', () => {
      const request: HGIHubHandoffRequest = {
        requestId: 'req-123',
        sourceRuntimeId: 'runtime-abc',
        localModel: { modelId: 'tinyllama-1.1b' },
        originalRequest: { model: 'tinyllama', input: 'Hello world' },
        handoffSignal: {
          type: 'HANDOFF_REQUIRED',
          severity: 'critical',
          reason: 'llm',
          metrics: { timestamp: '2024-01-01T00:00:00Z' },
          suggestedTarget: 'node',
          timestamp: '2024-01-01T00:00:00Z',
          mandatory: true,
          crossedThresholds: [],
        },
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        requestedCapability: 'llm',
        createdAt: '2024-01-01T00:00:00Z',
        priority: 50,
      };

      // Access private method via type assertion
      const payload = (client as unknown as { _toHubHandoffPayload: (r: HGIHubHandoffRequest) => Record<string, unknown> })._toHubHandoffPayload(request);

      // Required fields
      expect(payload.requestId).toBe('req-123');
      expect(payload.sourceRuntimeId).toBe('runtime-abc');
      expect(payload.originalRequest).toEqual({ model: 'tinyllama', input: 'Hello world' });

      // String conversions
      expect(typeof payload.localModel).toBe('string');
      expect(payload.localModel).toBe('tinyllama-1.1b');

      expect(typeof payload.handoffSignal).toBe('string');
      expect(payload.handoffSignal).toContain('HANDOFF_REQUIRED');

      // Optional fields
      expect(payload.requiredCapability).toBe('llm');
      expect(payload.priority).toBe('normal');
      expect(payload.metrics).toBeDefined();
    });

    test('converts localModel object to string (modelId)', () => {
      const request: HGIHubHandoffRequest = {
        requestId: 'req-456',
        sourceRuntimeId: 'runtime-def',
        localModel: { modelId: 'eva-expert-v1', modelPath: '/models/eva', modelSizeBytes: 1000000 },
        originalRequest: { model: 'eva', input: 'Analyze this' },
        handoffSignal: {
          type: 'HANDOFF_REQUIRED',
          severity: 'critical',
          reason: 'eva',
          metrics: { timestamp: '2024-01-01T00:00:00Z' },
          suggestedTarget: 'node',
          timestamp: '2024-01-01T00:00:00Z',
          mandatory: true,
          crossedThresholds: [],
        },
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        requestedCapability: 'llm',
        createdAt: '2024-01-01T00:00:00Z',
      };

      const payload = (client as unknown as { _toHubHandoffPayload: (r: HGIHubHandoffRequest) => Record<string, unknown> })._toHubHandoffPayload(request);

      expect(payload.localModel).toBe('eva-expert-v1');
    });

    test('converts handoffSignal object to JSON string', () => {
      const signal = {
        type: 'HANDOFF_REQUIRED' as const,
        severity: 'critical' as const,
        reason: 'test',
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        suggestedTarget: 'node' as const,
        timestamp: '2024-01-01T00:00:00Z',
        mandatory: true,
        crossedThresholds: [] as string[],
      };

      const request: HGIHubHandoffRequest = {
        requestId: 'req-789',
        sourceRuntimeId: 'runtime-ghi',
        localModel: { modelId: 'test-model' },
        originalRequest: { model: 'test', input: 'Test input' },
        handoffSignal: signal,
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        requestedCapability: 'llm',
        createdAt: '2024-01-01T00:00:00Z',
      };

      const payload = (client as unknown as { _toHubHandoffPayload: (r: HGIHubHandoffRequest) => Record<string, unknown> })._toHubHandoffPayload(request);

      expect(typeof payload.handoffSignal).toBe('string');
      const parsedSignal = JSON.parse(payload.handoffSignal as string);
      expect(parsedSignal.type).toBe('HANDOFF_REQUIRED');
      expect(parsedSignal.reason).toBe('test');
    });

    test('includes requiredCapability when available', () => {
      const request: HGIHubHandoffRequest = {
        requestId: 'req-abc',
        sourceRuntimeId: 'runtime-xyz',
        localModel: { modelId: 'model' },
        originalRequest: { model: 'test', input: 'test' },
        handoffSignal: {
          type: 'HANDOFF_REQUIRED',
          severity: 'critical',
          reason: 'llm',
          metrics: { timestamp: '2024-01-01T00:00:00Z' },
          suggestedTarget: 'node',
          timestamp: '2024-01-01T00:00:00Z',
          mandatory: true,
          crossedThresholds: [],
        },
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        requestedCapability: 'stt',
        createdAt: '2024-01-01T00:00:00Z',
      };

      const payload = (client as unknown as { _toHubHandoffPayload: (r: HGIHubHandoffRequest) => Record<string, unknown> })._toHubHandoffPayload(request);

      expect(payload.requiredCapability).toBe('stt');
    });

    test('includes priority when available', () => {
      const request: HGIHubHandoffRequest = {
        requestId: 'req-priority',
        sourceRuntimeId: 'runtime-prio',
        localModel: { modelId: 'model' },
        originalRequest: { model: 'test', input: 'test' },
        handoffSignal: {
          type: 'HANDOFF_REQUIRED',
          severity: 'critical',
          reason: 'emergency',
          metrics: { timestamp: '2024-01-01T00:00:00Z' },
          suggestedTarget: 'node',
          timestamp: '2024-01-01T00:00:00Z',
          mandatory: true,
          crossedThresholds: [],
        },
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        requestedCapability: 'llm',
        createdAt: '2024-01-01T00:00:00Z',
        priority: 100,
      };

      const payload = (client as unknown as { _toHubHandoffPayload: (r: HGIHubHandoffRequest) => Record<string, unknown> })._toHubHandoffPayload(request);

      expect(payload.priority).toBe('emergency');
    });

    test('omits optional fields when not provided', () => {
      const request: HGIHubHandoffRequest = {
        requestId: 'req-minimal',
        sourceRuntimeId: 'runtime-min',
        localModel: { modelId: 'minimal' },
        originalRequest: { model: 'minimal', input: 'test' },
        handoffSignal: {
          type: 'HANDOFF_REQUIRED',
          severity: 'critical',
          reason: 'test',
          metrics: { timestamp: '2024-01-01T00:00:00Z' },
          suggestedTarget: 'node',
          timestamp: '2024-01-01T00:00:00Z',
          mandatory: true,
          crossedThresholds: [],
        },
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        requestedCapability: 'llm',
        createdAt: '2024-01-01T00:00:00Z',
        // No priority, no requiredCapability will be included
      };

      const payload = (client as unknown as { _toHubHandoffPayload: (r: HGIHubHandoffRequest) => Record<string, unknown> })._toHubHandoffPayload(request);

      // requiredCapability is included because requestedCapability is present
      expect(payload.requiredCapability).toBe('llm');
      // priority is omitted because it's undefined
      expect(payload.priority).toBeUndefined();
    });

    test('payload shape contains all required fields', () => {
      const request: HGIHubHandoffRequest = {
        requestId: 'req-shape',
        sourceRuntimeId: 'runtime-shape',
        localModel: { modelId: 'shape-model' },
        originalRequest: { model: 'shape', input: 'test' },
        handoffSignal: {
          type: 'HANDOFF_REQUIRED',
          severity: 'critical',
          reason: 'test',
          metrics: { timestamp: '2024-01-01T00:00:00Z' },
          suggestedTarget: 'node',
          timestamp: '2024-01-01T00:00:00Z',
          mandatory: true,
          crossedThresholds: [],
        },
        metrics: { timestamp: '2024-01-01T00:00:00Z' },
        requestedCapability: 'llm',
        createdAt: '2024-01-01T00:00:00Z',
        priority: 75,
      };

      const payload = (client as unknown as { _toHubHandoffPayload: (r: HGIHubHandoffRequest) => Record<string, unknown> })._toHubHandoffPayload(request);
      const keys = Object.keys(payload).sort();

      expect(keys).toEqual([
        'handoffSignal',
        'localModel',
        'metrics',
        'originalRequest',
        'priority',
        'requestId',
        'requiredCapability',
        'sourceRuntimeId',
      ]);
    });
  });
});
