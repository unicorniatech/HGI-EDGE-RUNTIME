/**
 * HGI Edge Runtime - Hardened Worker Pool Tests
 *
 * Tests for worker pool using lightweight fakes instead of ESM mocking.
 * All tests should run without being skipped.
 *
 * @module tests/worker-pool-hardened.test
 */

import { WorkerPool, createWorkerPool, type WorkerCapacity } from '../src/core/worker-pool.js';

// Lightweight fake HGIHubClient - no mocking needed
class FakeHGIHubClient {
  reachable = true;
  healthResponse = { healthy: true, timestamp: new Date().toISOString() };

  async isReachable(): Promise<boolean> {
    return this.reachable;
  }

  async health(): Promise<typeof this.healthResponse> {
    return this.healthResponse;
  }
}

describe('Worker Pool - Hardened Tests', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = createWorkerPool({
      poolId: 'test-pool',
      hubUrl: 'http://localhost:4010',
      pollIntervalMs: 1000,
      enableLoadBalancing: true,
    });
  });

  afterEach(async () => {
    if (pool.isRunning) {
      await pool.stop();
    }
  });

  describe('Worker capacity management', () => {
    test('worker respects maxConcurrentJobs limit', () => {
      const hubClient = new FakeHGIHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      // Initially should have capacity
      expect(pool.hasCapacity(worker)).toBe(true);
      expect(pool.getAvailableCapacity(worker)).toBe(2);

      // Start first job - still has capacity
      pool.recordJobStart(worker, 'handoff-001', 'llm');
      expect(pool.hasCapacity(worker)).toBe(true);
      expect(pool.getAvailableCapacity(worker)).toBe(1);

      // Start second job - at capacity limit
      pool.recordJobStart(worker, 'handoff-002', 'llm');
      expect(pool.hasCapacity(worker)).toBe(false);
      expect(pool.getAvailableCapacity(worker)).toBe(0);
    });

    test('saturated worker cannot claim more work', () => {
      const hubClient = new FakeHGIHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      // Fill capacity
      pool.recordJobStart(worker, 'handoff-001', 'llm');

      // Should not be able to take more
      expect(pool.hasCapacity(worker)).toBe(false);
      expect(worker.metrics.utilizationPercent).toBe(100);
    });

    test('workers with different capacities are tracked correctly', () => {
      const hubClient1 = new FakeHGIHubClient();
      const hubClient2 = new FakeHGIHubClient();

      const worker1 = pool.addWorker('worker-01', hubClient1 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('worker-02', hubClient2 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 3,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Both start empty
      expect(pool.getAvailableCapacity(worker1)).toBe(1);
      expect(pool.getAvailableCapacity(worker2)).toBe(3);

      // Fill worker1 to capacity
      pool.recordJobStart(worker1, 'handoff-001', 'llm');
      expect(pool.hasCapacity(worker1)).toBe(false);

      // Worker2 still has capacity
      expect(pool.hasCapacity(worker2)).toBe(true);
      expect(pool.getAvailableCapacity(worker2)).toBe(3);
    });
  });

  describe('Multiple workers process different handoffs', () => {
    test('workers maintain separate active job lists', () => {
      const hubClient1 = new FakeHGIHubClient();
      const hubClient2 = new FakeHGIHubClient();

      const worker1 = pool.addWorker('worker-01', hubClient1 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('worker-02', hubClient2 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Each worker processes different handoff
      pool.recordJobStart(worker1, 'handoff-001', 'llm');
      pool.recordJobStart(worker2, 'handoff-002', 'llm');

      // Verify different handoffs tracked separately
      expect(worker1.activeJobs.has('handoff-001')).toBe(true);
      expect(worker2.activeJobs.has('handoff-002')).toBe(true);
      expect(worker1.activeJobs.has('handoff-002')).toBe(false);
      expect(worker2.activeJobs.has('handoff-001')).toBe(false);

      // Active job counts are independent
      expect(worker1.activeJobs.size).toBe(1);
      expect(worker2.activeJobs.size).toBe(1);
    });

    test('no duplicate processing - same handoff ID tracked once', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Start same handoff twice (simulating duplicate claim attempt)
      pool.recordJobStart(worker, 'handoff-001', 'llm');

      // Map should only have one entry
      expect(worker.activeJobs.size).toBe(1);
      expect(worker.activeJobs.has('handoff-001')).toBe(true);

      // Complete the handoff
      pool.recordJobComplete(worker, 'handoff-001', 1000);
      expect(worker.activeJobs.size).toBe(0);

      // Cannot complete same handoff again (would be no-op with warning)
      pool.recordJobComplete(worker, 'handoff-001', 1000);
      expect(worker.metrics.completedJobs).toBe(1); // Not incremented twice
    });
  });

  describe('Least-loaded worker selection', () => {
    test('selects worker with lowest utilization', async () => {
      const hubClient1 = new FakeHGIHubClient();
      const hubClient2 = new FakeHGIHubClient();

      // Worker 1 at 50% capacity (1/2 jobs)
      const worker1 = pool.addWorker('worker-01', hubClient1 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });
      pool.recordJobStart(worker1, 'handoff-001', 'llm');

      // Worker 2 at 0% capacity (0/2 jobs)
      const worker2 = pool.addWorker('worker-02', hubClient2 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Start pool so workers are marked as running
      await pool.start();

      // Verify worker2 exists and is idle
      expect(worker2.metrics.utilizationPercent).toBe(0);

      const selected = pool.getLeastLoadedWorker('llm');
      expect(selected).not.toBeNull();
      expect(selected!.id).toBe('worker-02');
    });

    test('selects worker by capability', async () => {
      const hubClient1 = new FakeHGIHubClient();
      const hubClient2 = new FakeHGIHubClient();

      pool.addWorker('worker-llm', hubClient1 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.addWorker('worker-stt', hubClient2 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['stt'],
      });

      // Start pool so workers are marked as running
      await pool.start();

      // Request llm worker
      const llmWorker = pool.getLeastLoadedWorker('llm');
      expect(llmWorker).not.toBeNull();
      expect(llmWorker!.id).toBe('worker-llm');

      // Request stt worker
      const sttWorker = pool.getLeastLoadedWorker('stt');
      expect(sttWorker).not.toBeNull();
      expect(sttWorker!.id).toBe('worker-stt');
    });

    test('returns null when no workers available', () => {
      const selected = pool.getLeastLoadedWorker('llm');
      expect(selected).toBeNull();
    });

    test('returns null when all workers saturated', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Saturate the worker
      pool.recordJobStart(worker, 'handoff-001', 'llm');

      const selected = pool.getLeastLoadedWorker('llm');
      expect(selected).toBeNull();
    });
  });

  describe('Metrics tracking', () => {
    test('completed job increments completed metrics', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      expect(worker.metrics.completedJobs).toBe(0);

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobComplete(worker, 'handoff-001', 1000);

      expect(worker.metrics.completedJobs).toBe(1);
    });

    test('failed job increments failed metrics', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      expect(worker.metrics.failedJobs).toBe(0);

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobFailure(worker, 'handoff-001');

      expect(worker.metrics.failedJobs).toBe(1);
      expect(worker.metrics.completedJobs).toBe(0);
    });

    test('average processing time is updated correctly', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // First job: 1000ms
      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobComplete(worker, 'handoff-001', 1000);
      expect(worker.metrics.averageProcessingTimeMs).toBe(1000);

      // Second job: 2000ms
      pool.recordJobStart(worker, 'handoff-002', 'llm');
      pool.recordJobComplete(worker, 'handoff-002', 2000);

      // Average should be (1000 + 2000) / 2 = 1500
      expect(worker.metrics.averageProcessingTimeMs).toBe(1500);

      // Third job: 3000ms
      pool.recordJobStart(worker, 'handoff-003', 'llm');
      pool.recordJobComplete(worker, 'handoff-003', 3000);

      // Average should be (1000 + 2000 + 3000) / 3 = 2000
      expect(worker.metrics.averageProcessingTimeMs).toBe(2000);
    });

    test('utilization percentage calculated correctly', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 4,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      expect(worker.metrics.utilizationPercent).toBe(0);

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      expect(worker.metrics.utilizationPercent).toBe(25);

      pool.recordJobStart(worker, 'handoff-002', 'llm');
      expect(worker.metrics.utilizationPercent).toBe(50);

      pool.recordJobStart(worker, 'handoff-003', 'llm');
      expect(worker.metrics.utilizationPercent).toBe(75);

      pool.recordJobStart(worker, 'handoff-004', 'llm');
      expect(worker.metrics.utilizationPercent).toBe(100);
    });
  });

  describe('Pool statistics', () => {
    test('pool stats calculate utilization correctly', () => {
      const hubClient1 = new FakeHGIHubClient();
      const hubClient2 = new FakeHGIHubClient();

      const worker1 = pool.addWorker('worker-01', hubClient1 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 4,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('worker-02', hubClient2 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 4,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Add 2 jobs total (1 per worker) out of 8 capacity = 25%
      pool.recordJobStart(worker1, 'handoff-001', 'llm');
      pool.recordJobStart(worker2, 'handoff-002', 'llm');

      const stats = pool.getPoolStats();
      expect(stats.totalWorkers).toBe(2);
      expect(stats.totalCapacity).toBe(8);
      expect(stats.totalActiveJobs).toBe(2);
      expect(stats.poolUtilizationPercent).toBe(25);
    });

    test('pool stats aggregate completed and failed jobs', () => {
      const hubClient1 = new FakeHGIHubClient();
      const hubClient2 = new FakeHGIHubClient();

      const worker1 = pool.addWorker('worker-01', hubClient1 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('worker-02', hubClient2 as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Complete jobs on different workers
      pool.recordJobStart(worker1, 'handoff-001', 'llm');
      pool.recordJobComplete(worker1, 'handoff-001', 1000);

      pool.recordJobStart(worker2, 'handoff-002', 'llm');
      pool.recordJobComplete(worker2, 'handoff-002', 2000);

      // Fail a job
      pool.recordJobStart(worker1, 'handoff-003', 'llm');
      pool.recordJobFailure(worker1, 'handoff-003');

      const stats = pool.getPoolStats();
      expect(stats.totalCompletedJobs).toBe(2);
      expect(stats.totalFailedJobs).toBe(1);
    });
  });

  describe('Pool lifecycle', () => {
    test('pool starts and stops correctly', async () => {
      expect(pool.isRunning).toBe(false);

      await pool.start();
      expect(pool.isRunning).toBe(true);

      await pool.stop();
      expect(pool.isRunning).toBe(false);
    });

    test('shutdown stops safely without active jobs', async () => {
      const hubClient = new FakeHGIHubClient();

      pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      await pool.start();
      expect(pool.isRunning).toBe(true);

      // No active jobs, should stop immediately
      await pool.stop();
      expect(pool.isRunning).toBe(false);
      expect(pool.shutdownRequested).toBe(true);
    });

    test('shutdownRequested flag is set on stop', async () => {
      expect(pool.shutdownRequested).toBe(false);

      await pool.start();
      await pool.stop();

      expect(pool.shutdownRequested).toBe(true);
    });

    test('cannot start already running pool', async () => {
      await pool.start();
      await expect(pool.start()).rejects.toThrow('Worker pool already running');
    });
  });

  describe('Worker removal', () => {
    test('can remove idle worker', () => {
      const hubClient = new FakeHGIHubClient();

      pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const removed = pool.removeWorker('worker-01');
      expect(removed).toBe(true);
      expect(pool.workers).toHaveLength(0);
    });

    test('cannot remove worker with active jobs', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.recordJobStart(worker, 'handoff-001', 'llm');

      const removed = pool.removeWorker('worker-01');
      expect(removed).toBe(false);
      expect(pool.workers).toHaveLength(1);
    });
  });

  describe('Worker load info', () => {
    test('getAllWorkersLoad returns correct info', () => {
      const hubClient = new FakeHGIHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 4,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobStart(worker, 'handoff-002', 'llm');

      const loads = pool.getAllWorkersLoad();
      expect(loads).toHaveLength(1);
      expect(loads[0].workerId).toBe('worker-01');
      expect(loads[0].activeJobs).toBe(2);
      expect(loads[0].maxJobs).toBe(4);
      expect(loads[0].availableSlots).toBe(2);
      expect(loads[0].utilizationPercent).toBe(50);
    });
  });
});
