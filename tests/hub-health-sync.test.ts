/**
 * Hub-Aware Health Synchronization Tests
 *
 * Tests synchronization between runtime worker health and hub eligibility.
 *
 * @module tests/hub-health-sync
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createWorkerPool } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';

// Mock hub client for testing
class MockHubClient {
  private workerFound: boolean = true;
  private isStale: boolean = false;
  private eligibleCount: number = 1;

  setWorkerFound(found: boolean) {
    this.workerFound = found;
  }

  setStale(stale: boolean) {
    this.isStale = stale;
  }

  setEligibleCount(count: number) {
    this.eligibleCount = count;
  }

  async getWorkerHealthDebug(workerId: string) {
    if (!this.workerFound) {
      return {
        workerId,
        workerFound: false,
        totalQueuedHandoffs: 0,
        eligibleCount: 0,
        rejectedCount: 0,
      };
    }

    return {
      workerId,
      workerFound: true,
      workerDebug: {
        workerId,
        status: this.isStale ? 'stale' : 'online',
        capabilities: ['llm'],
        lastHeartbeatAt: new Date().toISOString(),
        heartbeatAgeMs: this.isStale ? 35000 : 100,
        isStale: this.isStale,
        workerType: 'generic',
      },
      totalQueuedHandoffs: 1,
      eligibleCount: this.eligibleCount,
      rejectedCount: this.isStale ? 1 : 0,
      handoffs: this.isStale ? [{
        handoffId: 'test-handoff',
        requestId: 'req-1',
        status: 'queued',
        requiredCapability: 'llm',
        eligible: false,
        rejectionReasons: ['capability_mismatch(need=llm,have=eva)'],
      }] : [],
    };
  }

  async sendWorkerHeartbeat() {
    return true;
  }
}

describe('Hub-Aware Health Synchronization', () => {
  let pool: ReturnType<typeof createWorkerPool>;
  let mockHubClient: MockHubClient;

  beforeEach(() => {
    pool = createWorkerPool({
      poolId: 'test-pool',
      hubUrl: 'http://localhost:4010',
      pollIntervalMs: 1000,
      enableLoadBalancing: false,
    });

    mockHubClient = new MockHubClient();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Health Synchronization', () => {
    it('should detect no mismatch when runtime online and hub eligible', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now());
      mockHubClient.setWorkerFound(true);
      mockHubClient.setStale(false);
      mockHubClient.setEligibleCount(1);

      const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      const sync = syncDiagnostics[0];

      expect(sync.runtimeStatus).toBe('online');
      expect(sync.hubStatus).toBe('online');
      expect(sync.hubEligible).toBe(true);
      expect(sync.mismatch).toBe(false);
      expect(sync.mismatchReason).toBe('');
    });

    it('should detect mismatch when runtime online but hub says stale', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now());
      mockHubClient.setWorkerFound(true);
      mockHubClient.setStale(true);
      mockHubClient.setEligibleCount(0);

      const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      const sync = syncDiagnostics[0];

      expect(sync.runtimeStatus).toBe('online');
      expect(sync.hubStatus).toBe('stale');
      expect(sync.mismatch).toBe(true);
      expect(sync.mismatchReason).toBe('Runtime says online but hub says stale');
    });

    it('should detect mismatch when runtime stale but hub says online', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now() - 35000);
      mockHubClient.setWorkerFound(true);
      mockHubClient.setStale(false);
      mockHubClient.setEligibleCount(1);

      const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      const sync = syncDiagnostics[0];

      expect(sync.runtimeStatus).toBe('stale');
      expect(sync.hubStatus).toBe('online');
      expect(sync.mismatch).toBe(true);
      expect(sync.mismatchReason).toBe('Runtime says stale but hub says online');
    });

    it('should detect mismatch when runtime offline but hub allows claimables', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now() - 65000);
      mockHubClient.setWorkerFound(true);
      mockHubClient.setStale(false);
      mockHubClient.setEligibleCount(1);

      const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      const sync = syncDiagnostics[0];

      expect(sync.runtimeStatus).toBe('offline');
      expect(sync.hubEligible).toBe(true);
      expect(sync.mismatch).toBe(true);
      expect(sync.mismatchReason).toBe('Runtime says offline but hub still allows claimables');
    });

    it('should detect mismatch when worker not found in hub', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now());
      mockHubClient.setWorkerFound(false);

      const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      const sync = syncDiagnostics[0];

      expect(sync.mismatch).toBe(true);
      expect(sync.mismatchReason).toBe('Worker not found in hub');
    });

    it('should clear mismatch after recovery', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Initial mismatch
      pool.updateWorkerHealth('test-worker-1', Date.now());
      mockHubClient.setWorkerFound(true);
      mockHubClient.setStale(true);
      mockHubClient.setEligibleCount(0);

      let syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      expect(syncDiagnostics[0].mismatch).toBe(true);

      // Recovery
      mockHubClient.setStale(false);
      mockHubClient.setEligibleCount(1);

      syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      expect(syncDiagnostics[0].mismatch).toBe(false);
    });

    it('should include hub rejection reasons in diagnostics', async () => {
      const worker = pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now());
      mockHubClient.setWorkerFound(true);
      mockHubClient.setStale(true);
      mockHubClient.setEligibleCount(0);

      const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
      const sync = syncDiagnostics[0];

      expect(sync.hubRejectionReasons).toHaveLength(1);
      expect(sync.hubRejectionReasons[0]).toContain('capability_mismatch');
    });

    it('should handle multiple workers', async () => {
      pool.addWorker('test-worker-1', mockHubClient as any, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.addWorker('test-worker-2', mockHubClient as any, {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['eva'],
      });

      pool.updateWorkerHealth('test-worker-1', Date.now());
      pool.updateWorkerHealth('test-worker-2', Date.now());
      mockHubClient.setWorkerFound(true);
      mockHubClient.setStale(false);
      mockHubClient.setEligibleCount(1);

      const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();

      expect(syncDiagnostics).toHaveLength(2);
      expect(syncDiagnostics[0].mismatch).toBe(false);
      expect(syncDiagnostics[1].mismatch).toBe(false);
    });
  });
});
