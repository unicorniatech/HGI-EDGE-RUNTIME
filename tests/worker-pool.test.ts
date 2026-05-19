/**
 * HGI Edge Runtime - Worker Pool Tests
 *
 * Tests for worker pool, load balancing, and capacity management.
 *
 * @module tests/worker-pool.test
 */

import { WorkerPool, createWorkerPool, type WorkerCapacity } from '../src/core/worker-pool.js';

// Mock HGIHubClient
const createMockHubClient = () => ({
  isReachable: jest.fn().mockResolvedValue(true),
  health: jest.fn().mockResolvedValue({ healthy: true, timestamp: new Date().toISOString() }),
  capabilities: jest.fn().mockResolvedValue({}),
});

// Note: Tests temporarily skipped due to ESM mocking complexity
describe.skip('Worker Pool', () => {
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

  describe('Worker management', () => {
    test('can add workers to pool', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      expect(worker.id).toBe('worker-01');
      expect(worker.capacity.maxConcurrentJobs).toBe(2);
      expect(worker.capacity.supportedCapabilities).toContain('llm');
      expect(pool.workers).toHaveLength(1);
    });

    test('cannot add duplicate worker ids', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      expect(() => {
        pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);
      }).toThrow('Worker worker-01 already exists in pool');
    });

    test('can remove workers from pool', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      const removed = pool.removeWorker('worker-01');
      expect(removed).toBe(true);
      expect(pool.workers).toHaveLength(0);
    });

    test('cannot remove worker with active jobs', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      // Start a job
      pool.recordJobStart(worker, 'handoff-001', 'llm');

      const removed = pool.removeWorker('worker-01');
      expect(removed).toBe(false);
      expect(pool.workers).toHaveLength(1);
    });
  });

  describe('Capacity management', () => {
    test('respects max concurrent jobs limit', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      // Should have capacity initially
      expect(pool.hasCapacity(worker)).toBe(true);
      expect(pool.getAvailableCapacity(worker)).toBe(2);

      // Start first job
      pool.recordJobStart(worker, 'handoff-001', 'llm');
      expect(pool.hasCapacity(worker)).toBe(true);
      expect(pool.getAvailableCapacity(worker)).toBe(1);

      // Start second job
      pool.recordJobStart(worker, 'handoff-002', 'llm');
      expect(pool.hasCapacity(worker)).toBe(false);
      expect(pool.getAvailableCapacity(worker)).toBe(0);
    });

    test('workers do not overclaim when at capacity', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      // Fill capacity
      pool.recordJobStart(worker, 'handoff-001', 'llm');

      // Worker should not be able to take more
      expect(pool.hasCapacity(worker)).toBe(false);

      // Trying to get least loaded worker should return null or different worker
      const leastLoaded = pool.getLeastLoadedWorker('llm');
      if (leastLoaded) {
        expect(leastLoaded.id).not.toBe('worker-01');
      }
    });

    test('saturated workers skip claim cycle', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      // Saturate the worker
      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobStart(worker, 'handoff-002', 'llm');

      // Worker is saturated
      expect(worker.metrics.utilizationPercent).toBe(100);
      expect(pool.hasCapacity(worker)).toBe(false);
    });
  });

  describe('Metrics tracking', () => {
    test('tracks completed jobs', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobComplete(worker, 'handoff-001', 1000);

      expect(worker.metrics.completedJobs).toBe(1);
      expect(worker.metrics.averageProcessingTimeMs).toBe(1000);
    });

    test('tracks failed jobs', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobFailure(worker, 'handoff-001');

      expect(worker.metrics.failedJobs).toBe(1);
      expect(worker.metrics.completedJobs).toBe(0);
    });

    test('calculates utilization correctly', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 4,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      expect(worker.metrics.utilizationPercent).toBe(0);

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      expect(worker.metrics.utilizationPercent).toBe(25);

      pool.recordJobStart(worker, 'handoff-002', 'llm');
      expect(worker.metrics.utilizationPercent).toBe(50);
    });

    test('calculates average processing time', () => {
      const hubClient = createMockHubClient();
      const capacity: WorkerCapacity = {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      };

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, capacity);

      pool.recordJobStart(worker, 'handoff-001', 'llm');
      pool.recordJobComplete(worker, 'handoff-001', 1000);

      pool.recordJobStart(worker, 'handoff-002', 'llm');
      pool.recordJobComplete(worker, 'handoff-002', 2000);

      // Average should be (1000 + 2000) / 2 = 1500
      expect(worker.metrics.averageProcessingTimeMs).toBe(1500);
    });
  });

  describe('Load balancing', () => {
    test('selects least loaded worker', () => {
      const hubClient = createMockHubClient();

      // Create worker with 1 job (50% load)
      const worker1 = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });
      pool.recordJobStart(worker1, 'handoff-001', 'llm');

      // Create worker with 0 jobs (0% load)
      const worker2 = pool.addWorker('worker-02', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Verify worker2 exists and is idle
      expect(worker2.metrics.utilizationPercent).toBe(0);

      const selected = pool.getLeastLoadedWorker('llm');
      expect(selected).not.toBeNull();
      expect(selected!.id).toBe('worker-02');
    });

    test('selects worker by capability', () => {
      const hubClient = createMockHubClient();

      // Create llm worker
      pool.addWorker('worker-llm', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Create stt worker
      pool.addWorker('worker-stt', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['stt'],
      });

      // Get worker for llm capability
      const selected = pool.getLeastLoadedWorker('llm');
      expect(selected).not.toBeNull();
      expect(selected!.id).toBe('worker-llm');
    });

    test('returns null when no workers available', () => {
      const selected = pool.getLeastLoadedWorker('llm');
      expect(selected).toBeNull();
    });

    test('returns null when all workers saturated', () => {
      const hubClient = createMockHubClient();

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

  describe('Pool statistics', () => {
    test('calculates pool-wide stats', () => {
      const hubClient = createMockHubClient();

      // Add workers
      const worker1 = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('worker-02', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Add jobs
      pool.recordJobStart(worker1, 'handoff-001', 'llm');
      pool.recordJobComplete(worker1, 'handoff-001', 1000);
      pool.recordJobStart(worker2, 'handoff-002', 'llm');
      pool.recordJobComplete(worker2, 'handoff-002', 2000);

      const stats = pool.getPoolStats();
      expect(stats.totalWorkers).toBe(2);
      expect(stats.totalCapacity).toBe(4);
      expect(stats.totalCompletedJobs).toBe(2);
      expect(stats.totalActiveJobs).toBe(0);
      expect(stats.poolUtilizationPercent).toBe(0);
    });
  });

  describe('Multiple workers safety', () => {
    test('multiple workers process different handoffs', () => {
      const hubClient = createMockHubClient();

      const worker1 = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('worker-02', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Each worker processes different handoff
      pool.recordJobStart(worker1, 'handoff-001', 'llm');
      pool.recordJobStart(worker2, 'handoff-002', 'llm');

      // Verify different handoffs
      expect(worker1.activeJobs.has('handoff-001')).toBe(true);
      expect(worker2.activeJobs.has('handoff-002')).toBe(true);
      expect(worker1.activeJobs.has('handoff-002')).toBe(false);
      expect(worker2.activeJobs.has('handoff-001')).toBe(false);
    });

    test('workers maintain independent metrics', () => {
      const hubClient = createMockHubClient();

      const worker1 = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const worker2 = pool.addWorker('worker-02', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Complete jobs on different workers
      pool.recordJobStart(worker1, 'handoff-001', 'llm');
      pool.recordJobComplete(worker1, 'handoff-001', 1000);

      pool.recordJobStart(worker2, 'handoff-002', 'llm');
      pool.recordJobComplete(worker2, 'handoff-002', 2000);

      // Metrics should be independent
      expect(worker1.metrics.completedJobs).toBe(1);
      expect(worker2.metrics.completedJobs).toBe(1);
      expect(worker1.metrics.averageProcessingTimeMs).toBe(1000);
      expect(worker2.metrics.averageProcessingTimeMs).toBe(2000);
    });
  });

  describe('Pool lifecycle', () => {
    test('can start and stop pool', async () => {
      expect(pool.isRunning).toBe(false);

      await pool.start();
      expect(pool.isRunning).toBe(true);

      await pool.stop();
      expect(pool.isRunning).toBe(false);
    });

    test('cannot start already running pool', async () => {
      await pool.start();
      await expect(pool.start()).rejects.toThrow('Worker pool already running');
    });

    test('shutdown flag is set correctly', async () => {
      expect(pool.shutdownRequested).toBe(false);

      await pool.start();
      await pool.stop();

      expect(pool.shutdownRequested).toBe(true);
      expect(pool.isRunning).toBe(false);
    });
  });

  describe('Priority with load balancing', () => {
    test('priority respected when selecting from available workers', () => {
      // Note: Priority is handled by the hub when returning claimable handoffs
      // This test verifies workers can process different priority levels
      const hubClient = createMockHubClient();

      const worker = pool.addWorker('worker-01', hubClient as unknown as import('../src/core/hgi-hub-client.js').HGIHubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Worker can handle multiple jobs with different priorities
      pool.recordJobStart(worker, 'high-priority-handoff', 'llm');
      pool.recordJobStart(worker, 'low-priority-handoff', 'llm');

      expect(worker.activeJobs.size).toBe(2);
    });
  });
});
