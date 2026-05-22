/**
 * Runtime Supervisor Tests
 *
 * Tests runtime supervisor loop behavior and lifecycle.
 *
 * @module tests/runtime-supervisor
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createWorkerPool } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { createRuntimeSupervisor } from '../src/core/runtime-supervisor.js';

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

describe('Runtime Supervisor', () => {
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
    // Cleanup - ensure no running supervisors
    // (handled by individual test cleanup)
  });

  describe('Lifecycle', () => {
    it('should start supervisor', () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 1000,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();

      expect(supervisor.isRunning()).toBe(true);
    });

    it('should stop supervisor and clear interval', () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      expect(supervisor.isRunning()).toBe(true);

      supervisor.stop();
      expect(supervisor.isRunning()).toBe(false);
    });

    it('should be idempotent on start', () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 1000,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      supervisor.start(); // Should not cause issues

      expect(supervisor.isRunning()).toBe(true);
    });

    it('should be idempotent on stop', () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      supervisor.stop();
      supervisor.stop(); // Should not cause issues

      expect(supervisor.isRunning()).toBe(false);
    });

    it('should have no dangling timers after stop', async () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for at least one tick
      supervisor.stop();

      // Wait to ensure no additional ticks fire
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(supervisor.isRunning()).toBe(false);
    });
  });

  describe('Snapshot Generation', () => {
    it('should generate snapshot on tick', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for one tick
      supervisor.stop();

      const snapshot = supervisor.getLastSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot?.totalWorkers).toBe(1);
    });

    it('should store last snapshot', async () => {
      pool.addWorker('worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for one tick
      supervisor.stop();

      const snapshot1 = supervisor.getLastSnapshot();
      const snapshot2 = supervisor.getLastSnapshot();

      expect(snapshot1).toBe(snapshot2); // Same reference
    });
  });

  describe('Warning Collection', () => {
    it('should record warnings', async () => {
      mockHubClient.setHealthy(false);

      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for one tick
      supervisor.stop();

      const warnings = supervisor.getWarnings();
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.message.includes('Hub is not reachable'))).toBe(true);
    });

    it('should handle hub unreachable', async () => {
      mockHubClient.setHealthy(false);

      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 50,
      });

      supervisor.start();
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait for one tick
      supervisor.stop();

      const warnings = supervisor.getWarnings();
      expect(warnings.some(w => w.severity === 'error')).toBe(true);
    });

    it('should trim warnings to max warnings', async () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 100,
        emitTextSnapshot: false,
        emitJsonSnapshot: false,
        stopOnCriticalMismatch: false,
        maxWarnings: 5,
      });

      supervisor.start();
      await new Promise(resolve => setTimeout(resolve, 700)); // Wait for multiple ticks
      supervisor.stop();

      const warnings = supervisor.getWarnings();
      expect(warnings.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Configuration', () => {
    it('should use default config values', () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: undefined as any,
        emitTextSnapshot: undefined as any,
        emitJsonSnapshot: undefined as any,
        stopOnCriticalMismatch: undefined as any,
        maxWarnings: undefined as any,
      });

      supervisor.start();
      expect(supervisor.isRunning()).toBe(true);
      supervisor.stop();
    });

    it('should use custom config values', () => {
      const supervisor = createRuntimeSupervisor({
        runtimeId: 'test',
        hubUrl: 'http://localhost:4010',
        pool,
        hubClient: mockHubClient as any,
        intervalMs: 2000,
        emitTextSnapshot: false,
        emitJsonSnapshot: true,
        stopOnCriticalMismatch: true,
        maxWarnings: 10,
      });

      supervisor.start();
      expect(supervisor.isRunning()).toBe(true);
      supervisor.stop();
    });
  });
});
