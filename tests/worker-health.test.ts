/**
 * Worker Health Lifecycle Tests
 *
 * Tests worker health state tracking, staleness detection, and recovery.
 *
 * @module tests/worker-health
 */

import { describe, it, expect } from '@jest/globals';
import { createWorkerPool, type WorkerHealthStatus } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';

describe('Worker Health Lifecycle', () => {
  describe('Health State Tracking', () => {
    it('should initialize worker with online status', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      expect(worker.metrics.healthStatus).toBe('online');
      expect(worker.metrics.heartbeatAgeMs).toBe(0);
      expect(worker.metrics.lastHeartbeatAt).toBeNull();
    });

    it('should update worker health on heartbeat', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const heartbeatTimestamp = Date.now();
      pool.updateWorkerHealth('test-worker-1', heartbeatTimestamp);

      expect(worker.metrics.lastHeartbeatAt).toBe(heartbeatTimestamp);
      expect(worker.metrics.heartbeatAgeMs).toBeLessThan(100);
      expect(worker.metrics.healthStatus).toBe('online');
    });

    it('should mark worker as stale after 30 seconds', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const oldTimestamp = Date.now() - 35000;
      pool.updateWorkerHealth('test-worker-1', oldTimestamp);

      expect(worker.metrics.healthStatus).toBe('stale');
      expect(worker.metrics.heartbeatAgeMs).toBeGreaterThanOrEqual(35000);
    });

    it('should mark worker as offline after 60 seconds', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const oldTimestamp = Date.now() - 65000;
      pool.updateWorkerHealth('test-worker-1', oldTimestamp);

      expect(worker.metrics.healthStatus).toBe('offline');
      expect(worker.metrics.heartbeatAgeMs).toBeGreaterThanOrEqual(65000);
    });

    it('should mark worker as busy when processing jobs', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Simulate active job
      worker.activeJobs.set('handoff-1', {
        handoffId: 'handoff-1',
        startedAt: Date.now(),
        capability: 'llm',
      });

      pool.updateWorkerHealth('test-worker-1', Date.now());

      expect(worker.metrics.healthStatus).toBe('busy');
    });

    it('should recover worker status after heartbeat resumes', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Mark as stale
      pool.updateWorkerHealth('test-worker-1', Date.now() - 35000);
      expect(worker.metrics.healthStatus).toBe('stale');

      // Recover with fresh heartbeat
      pool.updateWorkerHealth('test-worker-1', Date.now());
      expect(worker.metrics.healthStatus).toBe('online');
      expect(worker.metrics.heartbeatAgeMs).toBeLessThan(100);
    });
  });

  describe('Health Diagnostics', () => {
    it('should return health diagnostics for all workers', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      pool.addWorker('test-worker-2', hubClient, {
        maxConcurrentJobs: 1,
        currentActiveJobs: 0,
        supportedCapabilities: ['eva'],
      });

      const diagnostics = pool.getWorkerHealthDiagnostics();

      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0].workerId).toBe('test-worker-1');
      expect(diagnostics[1].workerId).toBe('test-worker-2');
      expect(diagnostics[0].healthStatus).toBe('online');
      expect(diagnostics[1].healthStatus).toBe('online');
    });

    it('should include all required health fields', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      const diagnostics = pool.getWorkerHealthDiagnostics();
      const health = diagnostics[0];

      expect(health).toHaveProperty('workerId');
      expect(health).toHaveProperty('workerType');
      expect(health).toHaveProperty('lastHeartbeatAt');
      expect(health).toHaveProperty('heartbeatAgeMs');
      expect(health).toHaveProperty('healthStatus');
      expect(health).toHaveProperty('activeJobs');
      expect(health).toHaveProperty('completedJobs');
      expect(health).toHaveProperty('failedJobs');
    });
  });

  describe('Health State Transitions', () => {
    it('should transition from online to stale to offline', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Online
      pool.updateWorkerHealth('test-worker-1', Date.now());
      expect(worker.metrics.healthStatus).toBe('online');

      // Stale
      pool.updateWorkerHealth('test-worker-1', Date.now() - 35000);
      expect(worker.metrics.healthStatus).toBe('stale');

      // Offline
      pool.updateWorkerHealth('test-worker-1', Date.now() - 65000);
      expect(worker.metrics.healthStatus).toBe('offline');
    });

    it('should transition from offline back to online on recovery', () => {
      const pool = createWorkerPool({
        poolId: 'test-pool',
        hubUrl: 'http://localhost:4010',
        pollIntervalMs: 1000,
        enableLoadBalancing: false,
      });

      const hubClient = createHGIHubClient({
        baseUrl: 'http://localhost:4010',
        timeoutMs: 30000,
        runtimeId: 'test',
      });

      const worker = pool.addWorker('test-worker-1', hubClient, {
        maxConcurrentJobs: 2,
        currentActiveJobs: 0,
        supportedCapabilities: ['llm'],
      });

      // Offline
      pool.updateWorkerHealth('test-worker-1', Date.now() - 65000);
      expect(worker.metrics.healthStatus).toBe('offline');

      // Recover
      pool.updateWorkerHealth('test-worker-1', Date.now());
      expect(worker.metrics.healthStatus).toBe('online');
    });
  });
});
