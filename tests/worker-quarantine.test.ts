/**
 * Worker Auto-Recovery + Quarantine Tests
 *
 * Tests worker quarantine behavior and auto-recovery.
 *
 * @module tests/worker-quarantine
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createWorkerPool } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';

// Mock hub client for testing
class MockHubClient {
  async sendWorkerHeartbeat() {
    return true;
  }
}

describe('Worker Auto-Recovery + Quarantine', () => {
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
        quarantineMs: 200, // Short duration for testing
        recoveryHeartbeatRequired: true,
        allowAutoRecovery: true,
      },
    });

    mockHubClient = new MockHubClient();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Quarantine Behavior', () => {
    it('should enter quarantine after max consecutive failures', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Record failures up to max
      pool.recordWorkerFailure('test-worker-1');
      pool.recordWorkerFailure('test-worker-1');
      pool.recordWorkerFailure('test-worker-1');

      const diagnostics = pool.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.consecutiveFailures).toBe(3);
      expect(workerDiag?.quarantined).toBe(true);
      expect(workerDiag?.healthStatus).toBe('quarantined');
    });

    it('should skip quarantined worker for claiming', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Quarantine the worker
      pool.quarantineWorker('test-worker-1', 'test');

      const eligibility = pool.isWorkerEligible('test-worker-1');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.skipReason).toBe('Quarantined');
    });

    it('should allow healthy worker to continue processing', () => {
      const worker1 = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('test-worker-2', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Quarantine worker1
      pool.quarantineWorker('test-worker-1', 'test');

      const eligibility1 = pool.isWorkerEligible('test-worker-1');
      const eligibility2 = pool.isWorkerEligible('test-worker-2');

      expect(eligibility1.eligible).toBe(false);
      expect(eligibility2.eligible).toBe(true);
    });

    it('should not quarantine before max failures', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Record failures below max
      pool.recordWorkerFailure('test-worker-1');
      pool.recordWorkerFailure('test-worker-1');

      const diagnostics = pool.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.consecutiveFailures).toBe(2);
      expect(workerDiag?.quarantined).toBe(false);
    });
  });

  describe('Recovery Behavior', () => {
    it('should recover worker after quarantine expires with heartbeat', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Quarantine with short duration
      pool.quarantineWorker('test-worker-1', 'test');

      // Wait for quarantine to expire
      await new Promise(resolve => setTimeout(resolve, 250));

      // Send heartbeat
      pool.updateWorkerHealth('test-worker-1', Date.now());

      // Attempt recovery
      const recovered = await pool.attemptWorkerRecovery('test-worker-1');

      expect(recovered).toBe(true);

      const diagnostics = pool.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.quarantined).toBe(false);
      expect(workerDiag?.healthStatus).toBe('online');
      expect(workerDiag?.consecutiveFailures).toBe(0);
      expect(workerDiag?.recoveryAttempts).toBe(1);
    });

    it('should not recover before quarantine expires', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Quarantine with long duration
      pool.quarantineWorker('test-worker-1', 'test');

      // Send heartbeat immediately
      pool.updateWorkerHealth('test-worker-1', Date.now());

      // Attempt recovery
      const recovered = await pool.attemptWorkerRecovery('test-worker-1');

      expect(recovered).toBe(false);
    });

    it('should not recover without heartbeat if required', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Quarantine with short duration
      pool.quarantineWorker('test-worker-1', 'test');

      // Wait for quarantine to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      // Do NOT send heartbeat
      // Attempt recovery
      const recovered = await pool.attemptWorkerRecovery('test-worker-1');

      expect(recovered).toBe(false);
    });

    it('should reset failure count after recovery', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Record failures
      pool.recordWorkerFailure('test-worker-1');
      pool.recordWorkerFailure('test-worker-1');
      pool.recordWorkerFailure('test-worker-1');

      // Quarantine
      pool.quarantineWorker('test-worker-1', 'test');

      // Wait and recover
      await new Promise(resolve => setTimeout(resolve, 250));
      pool.updateWorkerHealth('test-worker-1', Date.now());
      await pool.attemptWorkerRecovery('test-worker-1');

      const diagnostics = pool.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.consecutiveFailures).toBe(0);
      expect(workerDiag?.lastFailureAt).toBeNull();
    });

    it('should reset failure count on success', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Record failures
      pool.recordWorkerFailure('test-worker-1');
      pool.recordWorkerFailure('test-worker-1');

      // Record success
      pool.recordWorkerSuccess('test-worker-1');

      const diagnostics = pool.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.consecutiveFailures).toBe(0);
      expect(workerDiag?.lastFailureAt).toBeNull();
    });
  });

  describe('Eligibility Checks', () => {
    it('should skip offline workers', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now() - 65000);

      const eligibility = pool.isWorkerEligible('test-worker-1');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.skipReason).toBe('Offline');
    });

    it('should skip stale workers beyond grace period', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now() - 35000);

      const eligibility = pool.isWorkerEligible('test-worker-1');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.skipReason).toBe('Stale beyond grace period');
    });

    it('should skip saturated workers', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Simulate active job
      worker.activeJobs.set('handoff-1', {
        handoffId: 'handoff-1',
        startedAt: Date.now(),
        capability: 'llm',
      });

      const eligibility = pool.isWorkerEligible('test-worker-1');

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.skipReason).toBe('Saturated');
    });

    it('should show skip reason in diagnostics', () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.quarantineWorker('test-worker-1', 'test');

      const diagnostics = pool.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.skipReason).toBe('Quarantined');
    });
  });

  describe('Policy Configuration', () => {
    it('should use default policy if not provided', () => {
      const poolNoPolicy = createWorkerPool({
        poolId: 'test-pool-no-policy',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const worker = poolNoPolicy.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Record failures - should not quarantine without policy
      poolNoPolicy.recordWorkerFailure('test-worker-1');
      poolNoPolicy.recordWorkerFailure('test-worker-1');
      poolNoPolicy.recordWorkerFailure('test-worker-1');

      const diagnostics = poolNoPolicy.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.consecutiveFailures).toBe(3);
      expect(workerDiag?.quarantined).toBe(false);
    });

    it('should respect custom policy values', () => {
      const poolCustom = createWorkerPool({
        poolId: 'test-pool-custom',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
        recoveryPolicy: {
          maxConsecutiveFailures: 5,
          staleGraceMs: 60000,
          offlineGraceMs: 120000,
          quarantineMs: 10000,
          recoveryHeartbeatRequired: false,
          allowAutoRecovery: true,
        },
      });

      const worker = poolCustom.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Record 4 failures (below custom max of 5)
      for (let i = 0; i < 4; i++) {
        poolCustom.recordWorkerFailure('test-worker-1');
      }

      const diagnostics = poolCustom.getExtendedWorkerDiagnostics();
      const workerDiag = diagnostics.find(w => w.workerId === 'test-worker-1');

      expect(workerDiag?.consecutiveFailures).toBe(4);
      expect(workerDiag?.quarantined).toBe(false);
    });
  });
});
