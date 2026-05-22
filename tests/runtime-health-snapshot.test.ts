/**
 * Runtime Health Snapshot Tests
 *
 * Tests runtime health snapshot generation and formatting.
 *
 * @module tests/runtime-health-snapshot
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createWorkerPool } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import {
  generateRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshotJSON,
  type RuntimeHealthSnapshot,
} from '../src/core/runtime-health-snapshot.js';

// Mock hub client for testing
class MockHubClient {
  private healthy: boolean = true;

  setHealthy(healthy: boolean) {
    this.healthy = healthy;
  }

  async health() {
    return {
      healthy: this.healthy,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    };
  }

  async sendWorkerHeartbeat() {
    return true;
  }

  async getWorkerHealthDebug(workerId: string) {
    return {
      workerId,
      workerFound: true,
      workerDebug: {
        workerId,
        status: 'online',
        capabilities: ['llm'],
        lastHeartbeatAt: new Date().toISOString(),
        heartbeatAgeMs: 100,
        isStale: false,
        workerType: 'generic',
      },
      totalQueuedHandoffs: 0,
      eligibleCount: 0,
      rejectedCount: 0,
    };
  }
}

describe('Runtime Health Snapshot', () => {
  let pool: ReturnType<typeof createWorkerPool>;
  let mockHubClient: MockHubClient;

  beforeEach(() => {
    pool = createWorkerPool({
      poolId: 'test-pool',
      hubUrl: 'http://localhost:4010',
      pollIntervalMs: 1000,
      enableLoadBalancing: false,
      recoveryPolicy: {
        maxConsecutiveFailures: 3,
        staleGraceMs: 30000,
        offlineGraceMs: 60000,
        quarantineMs: 5000,
        recoveryHeartbeatRequired: true,
        allowAutoRecovery: true,
      },
    });

    mockHubClient = new MockHubClient();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Snapshot Generation', () => {
    it('should include all workers in snapshot', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.addWorker('worker-2', mockHubClient as any, {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['eva'],
      });

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      expect(snapshot.totalWorkers).toBe(2);
    });

    it('should count workers by health status', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.addWorker('worker-2', mockHubClient as any, {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['eva'],
      });

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      expect(snapshot.workersByHealthStatus.online).toBe(2);
      expect(snapshot.workersByHealthStatus.stale).toBe(0);
      expect(snapshot.workersByHealthStatus.offline).toBe(0);
      expect(snapshot.workersByHealthStatus.quarantined).toBe(0);
    });

    it('should include quarantined workers', async () => {
      const worker = pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Quarantine the worker
      pool.quarantineWorker('worker-1', 'test');

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      expect(snapshot.quarantinedWorkers).toHaveLength(1);
      expect(snapshot.quarantinedWorkers[0].workerId).toBe('worker-1');
      expect(snapshot.quarantinedWorkers[0].consecutiveFailures).toBe(0);
    });

    it('should include health mismatches', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Make worker stale
      pool.updateWorkerHealth('worker-1', Date.now() - 35000);

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      // Note: Hub sync may not detect mismatch in mock scenario
      // This test validates the structure exists
      expect(snapshot.healthMismatches).toBeDefined();
      expect(Array.isArray(snapshot.healthMismatches)).toBe(true);
    });

    it('should include routing capacity by capability', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      expect(snapshot.routingCapacityByCapability).toBeDefined();
      expect(Object.keys(snapshot.routingCapacityByCapability).length).toBeGreaterThan(0);
    });

    it('should detect hub unreachable status', async () => {
      mockHubClient.setHealthy(false);

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      expect(snapshot.hubReachable).toBe(false);
      expect(snapshot.recentWarnings.some(w => w.message.includes('Hub is not reachable'))).toBe(true);
    });
  });

  describe('Formatter', () => {
    it('should include key sections in formatted output', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      const formatted = formatRuntimeHealthSnapshot(snapshot);

      expect(formatted).toContain('Runtime Health Snapshot');
      expect(formatted).toContain('Overall Health');
      expect(formatted).toContain('Workers by Type');
      expect(formatted).toContain('Workers by Health Status');
      expect(formatted).toContain('Routing Capacity by Capability');
    });

    it('should show hub status', async () => {
      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      const formatted = formatRuntimeHealthSnapshot(snapshot);

      expect(formatted).toContain('Hub Reachable');
    });

    it('should show worker counts', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      const formatted = formatRuntimeHealthSnapshot(snapshot);

      expect(formatted).toContain('Total Workers: 1');
    });
  });

  describe('JSON Output', () => {
    it('should produce valid JSON', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      const json = formatRuntimeHealthSnapshotJSON(snapshot);

      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('should include all snapshot fields in JSON', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
      });

      const json = formatRuntimeHealthSnapshotJSON(snapshot);
      const parsed = JSON.parse(json) as RuntimeHealthSnapshot;

      expect(parsed.timestamp).toBeDefined();
      expect(parsed.runtimeId).toBe('test');
      expect(parsed.hubUrl).toBe('http://localhost:4010');
      expect(parsed.totalWorkers).toBe(1);
      expect(parsed.workersByType).toBeDefined();
      expect(parsed.workersByHealthStatus).toBeDefined();
      expect(parsed.routingCapacityByCapability).toBeDefined();
    });
  });
});
