/**
 * HGI Worker Pool - Multi-Worker Coordination and Load Balancing
 *
 * Manages multiple workers with:
 * - Capacity limits per worker
 * - Runtime metrics tracking
 * - Load-based selection
 * - Safe concurrent processing
 *
 * @module src/core/worker-pool
 */

import type { HGIHubClient } from './hgi-hub-client.js';
import type {
  WorkerCapabilityContract,
  WorkerType,
} from '../types/worker-capability.js';

/**
 * Worker capacity configuration
 */
export interface WorkerCapacity {
  /** Maximum concurrent jobs this worker can handle */
  maxConcurrentJobs: number;
  /** Current active jobs */
  currentActiveJobs: number;
  /** Capabilities this worker supports */
  supportedCapabilities: string[];
}

/**
 * Worker health status
 */
export type WorkerHealthStatus = 'online' | 'stale' | 'offline' | 'busy' | 'quarantined';

/**
 * Worker runtime metrics
 */
export interface WorkerMetrics {
  /** Total jobs completed */
  completedJobs: number;
  /** Total jobs failed */
  failedJobs: number;
  /** Average processing time in ms */
  averageProcessingTimeMs: number;
  /** Last activity timestamp */
  lastActivityAt: number | null;
  /** Current load percentage (0-100) */
  utilizationPercent: number;
  /** Total processing time accumulated */
  totalProcessingTimeMs: number;
  /** Last heartbeat timestamp */
  lastHeartbeatAt: number | null;
  /** Current health status */
  healthStatus: WorkerHealthStatus;
  /** Heartbeat age in ms */
  heartbeatAgeMs: number;
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Last failure timestamp */
  lastFailureAt: number | null;
  /** Quarantined until timestamp */
  quarantinedUntil: number | null;
  /** Recovery attempts */
  recoveryAttempts: number;
  /** Last recovery timestamp */
  lastRecoveryAt: number | null;
}

/**
 * Active job tracking
 */
interface ActiveJob {
  handoffId: string;
  startedAt: number;
  capability: string;
}

/**
 * Worker instance in the pool
 */
export interface PoolWorker {
  /** Unique worker identifier */
  id: string;
  /** Worker capacity limits */
  capacity: WorkerCapacity;
  /** Runtime metrics */
  metrics: WorkerMetrics;
  /** Currently processing jobs */
  activeJobs: Map<string, ActiveJob>;
  /** Hub client for this worker */
  hubClient: HGIHubClient;
  /** Whether worker is running */
  isRunning: boolean;
  /** Last poll timestamp */
  lastPollAt: number | null;
  /** Optional capability contract for this worker */
  contract?: WorkerCapabilityContract;
  /** Worker type from contract */
  workerType?: WorkerType;
}

/**
 * Worker pool configuration
 */
export interface WorkerPoolConfig {
  /** Pool identifier */
  poolId: string;
  /** Hub URL */
  hubUrl: string;
  /** Poll interval in ms */
  pollIntervalMs: number;
  /** Enable load balancing */
  enableLoadBalancing: boolean;
  /** Worker recovery policy */
  recoveryPolicy?: WorkerRecoveryPolicy;
}

/**
 * Worker recovery policy
 */
export interface WorkerRecoveryPolicy {
  /** Maximum consecutive failures before quarantine */
  maxConsecutiveFailures: number;
  /** Grace period for stale workers before quarantine (ms) */
  staleGraceMs: number;
  /** Grace period for offline workers before quarantine (ms) */
  offlineGraceMs: number;
  /** Quarantine duration (ms) */
  quarantineMs: number;
  /** Whether heartbeat is required for recovery */
  recoveryHeartbeatRequired: boolean;
  /** Whether to allow auto-recovery */
  allowAutoRecovery: boolean;
}

/**
 * Load information for selection
 */
export interface WorkerLoadInfo {
  workerId: string;
  activeJobs: number;
  maxJobs: number;
  availableSlots: number;
  utilizationPercent: number;
  lastActivityAt: number | null;
}

/**
 * Worker pool manager
 */
export class WorkerPool {
  private _workers: Map<string, PoolWorker> = new Map();
  private _config: WorkerPoolConfig;
  private _running = false;
  private _shutdownRequested = false;

  constructor(config: WorkerPoolConfig) {
    this._config = {
      ...config,
      pollIntervalMs: config.pollIntervalMs ?? 3000,
      enableLoadBalancing: config.enableLoadBalancing ?? true,
    };
  }

  /**
   * Add a worker to the pool
   */
  addWorker(workerId: string, hubClient: HGIHubClient, capacity: WorkerCapacity): PoolWorker {
    if (this._workers.has(workerId)) {
      throw new Error(`Worker ${workerId} already exists in pool`);
    }

    const worker: PoolWorker = {
      id: workerId,
      hubClient,
      capacity: {
        maxConcurrentJobs: capacity.maxConcurrentJobs ?? 1,
        currentActiveJobs: 0,
        supportedCapabilities: capacity.supportedCapabilities ?? ['llm'],
      },
      metrics: {
        completedJobs: 0,
        failedJobs: 0,
        averageProcessingTimeMs: 0,
        lastActivityAt: null,
        utilizationPercent: 0,
        totalProcessingTimeMs: 0,
        lastHeartbeatAt: null,
        healthStatus: 'online',
        heartbeatAgeMs: 0,
        consecutiveFailures: 0,
        lastFailureAt: null,
        quarantinedUntil: null,
        recoveryAttempts: 0,
        lastRecoveryAt: null,
      },
      activeJobs: new Map(),
      isRunning: false,
      lastPollAt: null,
    };

    this._workers.set(workerId, worker);
    return worker;
  }

  /**
   * Add a worker with capability contract to the pool
   */
  addWorkerWithContract(
    contract: WorkerCapabilityContract,
    hubClient: HGIHubClient
  ): PoolWorker {
    if (this._workers.has(contract.id)) {
      throw new Error(`Worker ${contract.id} already exists in pool`);
    }

    const worker: PoolWorker = {
      id: contract.id,
      hubClient,
      capacity: {
        maxConcurrentJobs: contract.maxConcurrentJobs,
        currentActiveJobs: 0,
        supportedCapabilities: contract.capabilities,
      },
      metrics: {
        completedJobs: 0,
        failedJobs: 0,
        averageProcessingTimeMs: 0,
        lastActivityAt: null,
        utilizationPercent: 0,
        totalProcessingTimeMs: 0,
        lastHeartbeatAt: null,
        healthStatus: 'online',
        heartbeatAgeMs: 0,
        consecutiveFailures: 0,
        lastFailureAt: null,
        quarantinedUntil: null,
        recoveryAttempts: 0,
        lastRecoveryAt: null,
      },
      activeJobs: new Map(),
      isRunning: false,
      lastPollAt: null,
      contract,
      workerType: contract.workerType,
    };

    this._workers.set(contract.id, worker);
    return worker;
  }

  /**
   * Remove a worker from the pool
   */
  removeWorker(workerId: string): boolean {
    const worker = this._workers.get(workerId);
    if (!worker) return false;

    // Wait for active jobs to complete
    if (worker.activeJobs.size > 0) {
      console.log(`Worker ${workerId} has ${worker.activeJobs.size} active jobs, waiting...`);
      return false;
    }

    worker.isRunning = false;
    this._workers.delete(workerId);
    return true;
  }

  /**
   * Check if worker has capacity for new job
   */
  hasCapacity(worker: PoolWorker): boolean {
    return worker.activeJobs.size < worker.capacity.maxConcurrentJobs;
  }

  /**
   * Get available capacity for a worker
   */
  getAvailableCapacity(worker: PoolWorker): number {
    return worker.capacity.maxConcurrentJobs - worker.activeJobs.size;
  }

  /**
   * Record job start
   */
  recordJobStart(worker: PoolWorker, handoffId: string, capability: string): void {
    worker.activeJobs.set(handoffId, {
      handoffId,
      startedAt: Date.now(),
      capability,
    });
    worker.capacity.currentActiveJobs = worker.activeJobs.size;
    worker.metrics.lastActivityAt = Date.now();
    this._updateUtilization(worker);
  }

  /**
   * Record job completion
   */
  recordJobComplete(worker: PoolWorker, handoffId: string, processingTimeMs: number): void {
    const job = worker.activeJobs.get(handoffId);
    if (!job) {
      console.warn(`Job ${handoffId} not found in worker ${worker.id} active jobs`);
      return;
    }

    worker.activeJobs.delete(handoffId);
    worker.capacity.currentActiveJobs = worker.activeJobs.size;
    worker.metrics.completedJobs++;
    worker.metrics.totalProcessingTimeMs += processingTimeMs;

    // Update average processing time
    const totalJobs = worker.metrics.completedJobs + worker.metrics.failedJobs;
    worker.metrics.averageProcessingTimeMs = worker.metrics.totalProcessingTimeMs / totalJobs;

    worker.metrics.lastActivityAt = Date.now();
    this._updateUtilization(worker);
  }

  /**
   * Record job failure
   */
  recordJobFailure(worker: PoolWorker, handoffId: string): void {
    worker.activeJobs.delete(handoffId);
    worker.capacity.currentActiveJobs = worker.activeJobs.size;
    worker.metrics.failedJobs++;
    worker.metrics.lastActivityAt = Date.now();
    this._updateUtilization(worker);
  }

  /**
   * Update utilization percentage
   */
  private _updateUtilization(worker: PoolWorker): void {
    const utilization = (worker.activeJobs.size / worker.capacity.maxConcurrentJobs) * 100;
    worker.metrics.utilizationPercent = Math.round(utilization);
  }

  /**
   * Get least loaded worker (for load balancing)
   */
  getLeastLoadedWorker(capability?: string): PoolWorker | null {
    const availableWorkers = Array.from(this._workers.values()).filter(w => {
      if (!w.isRunning) return false;
      if (!this.hasCapacity(w)) return false;
      if (capability && !w.capacity.supportedCapabilities.includes(capability)) return false;
      return true;
    });

    if (availableWorkers.length === 0) return null;

    // Sort by utilization (lowest first), then by active jobs
    availableWorkers.sort((a, b) => {
      const utilDiff = a.metrics.utilizationPercent - b.metrics.utilizationPercent;
      if (utilDiff !== 0) return utilDiff;
      return a.activeJobs.size - b.activeJobs.size;
    });

    return availableWorkers[0];
  }

  /**
   * Get all workers with their load info
   */
  getAllWorkersLoad(): WorkerLoadInfo[] {
    return Array.from(this._workers.values()).map(w => ({
      workerId: w.id,
      activeJobs: w.activeJobs.size,
      maxJobs: w.capacity.maxConcurrentJobs,
      availableSlots: this.getAvailableCapacity(w),
      utilizationPercent: w.metrics.utilizationPercent,
      lastActivityAt: w.metrics.lastActivityAt,
    }));
  }

  /**
   * Get pool-wide statistics
   */
  getPoolStats(): {
    totalWorkers: number;
    activeWorkers: number;
    totalActiveJobs: number;
    totalCapacity: number;
    poolUtilizationPercent: number;
    totalCompletedJobs: number;
    totalFailedJobs: number;
  } {
    const workers = Array.from(this._workers.values());
    const activeWorkers = workers.filter(w => w.isRunning);
    const totalActiveJobs = workers.reduce((sum, w) => sum + w.activeJobs.size, 0);
    const totalCapacity = workers.reduce((sum, w) => sum + w.capacity.maxConcurrentJobs, 0);
    const totalCompletedJobs = workers.reduce((sum, w) => sum + w.metrics.completedJobs, 0);
    const totalFailedJobs = workers.reduce((sum, w) => sum + w.metrics.failedJobs, 0);

    return {
      totalWorkers: workers.length,
      activeWorkers: activeWorkers.length,
      totalActiveJobs,
      totalCapacity,
      poolUtilizationPercent: totalCapacity > 0 ? Math.round((totalActiveJobs / totalCapacity) * 100) : 0,
      totalCompletedJobs,
      totalFailedJobs,
    };
  }

  /**
   * Get pool statistics by worker type
   */
  getPoolStatsByWorkerType(): Map<WorkerType, { count: number; activeJobs: number; completedJobs: number; failedJobs: number }> {
    const byType = new Map<WorkerType, { count: number; activeJobs: number; completedJobs: number; failedJobs: number }>();

    for (const worker of this._workers.values()) {
      const type = worker.workerType ?? 'generic';
      const existing = byType.get(type);

      if (existing) {
        existing.count++;
        existing.activeJobs += worker.activeJobs.size;
        existing.completedJobs += worker.metrics.completedJobs;
        existing.failedJobs += worker.metrics.failedJobs;
      } else {
        byType.set(type, {
          count: 1,
          activeJobs: worker.activeJobs.size,
          completedJobs: worker.metrics.completedJobs,
          failedJobs: worker.metrics.failedJobs,
        });
      }
    }

    return byType;
  }

  /**
   * Get pool statistics by capability
   */
  getPoolStatsByCapability(): Map<string, { workerCount: number; activeJobs: number; capacity: number; utilizationPercent: number }> {
    const byCapability = new Map<string, { workerCount: number; activeJobs: number; capacity: number; utilizationPercent: number }>();

    for (const worker of this._workers.values()) {
      for (const capability of worker.capacity.supportedCapabilities) {
        const existing = byCapability.get(capability);

        if (existing) {
          existing.workerCount++;
          existing.activeJobs += worker.activeJobs.size;
          existing.capacity += worker.capacity.maxConcurrentJobs;
        } else {
          byCapability.set(capability, {
            workerCount: 1,
            activeJobs: worker.activeJobs.size,
            capacity: worker.capacity.maxConcurrentJobs,
            utilizationPercent: worker.metrics.utilizationPercent,
          });
        }
      }
    }

    // Recalculate utilization for each capability
    for (const stats of byCapability.values()) {
      stats.utilizationPercent = stats.capacity > 0
        ? Math.round((stats.activeJobs / stats.capacity) * 100)
        : 0;
    }

    return byCapability;
  }

  /**
   * Route handoff to best worker by capability
   * Returns null if no suitable worker found
   */
  routeHandoff(requiredCapability: string, preferredWorkerType?: WorkerType): { worker: PoolWorker; routingDecision: string } | null {
    // Get all workers that support this capability and have capacity
    const eligibleWorkers = Array.from(this._workers.values()).filter(w => {
      if (!w.isRunning) return false;
      if (!this.hasCapacity(w)) return false;
      if (!w.capacity.supportedCapabilities.includes(requiredCapability)) return false;
      return true;
    });

    if (eligibleWorkers.length === 0) {
      return null;
    }

    // If preferred worker type specified, try to find match
    if (preferredWorkerType) {
      const preferredWorkers = eligibleWorkers.filter(w => w.workerType === preferredWorkerType);
      if (preferredWorkers.length > 0) {
        // Sort by utilization and pick least loaded
        preferredWorkers.sort((a, b) => a.metrics.utilizationPercent - b.metrics.utilizationPercent);
        return {
          worker: preferredWorkers[0],
          routingDecision: `type-preferred:${preferredWorkerType}`,
        };
      }
    }

    // Fall back to least loaded eligible worker
    eligibleWorkers.sort((a, b) => a.metrics.utilizationPercent - b.metrics.utilizationPercent);
    return {
      worker: eligibleWorkers[0],
      routingDecision: 'least-loaded',
    };
  }

  /**
   * Start the worker pool
   */
  async start(): Promise<void> {
    if (this._running) {
      throw new Error('Worker pool already running');
    }

    this._running = true;
    this._shutdownRequested = false;

    console.log(`Worker pool ${this._config.poolId} started with ${this._workers.size} workers`);

    // Mark all workers as running
    for (const worker of this._workers.values()) {
      worker.isRunning = true;
    }
  }

  /**
   * Stop the worker pool gracefully
   */
  async stop(): Promise<void> {
    console.log(`Stopping worker pool ${this._config.poolId}...`);
    this._shutdownRequested = true;
    this._running = false;

    // Mark all workers as not running
    for (const worker of this._workers.values()) {
      worker.isRunning = false;
    }

    // Wait for active jobs to complete (with timeout)
    const timeoutMs = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const activeJobs = this.getPoolStats().totalActiveJobs;
      if (activeJobs === 0) break;

      console.log(`Waiting for ${activeJobs} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const remainingJobs = this.getPoolStats().totalActiveJobs;
    if (remainingJobs > 0) {
      console.warn(`Pool stopped with ${remainingJobs} jobs still active`);
    }

    console.log('Worker pool stopped');
  }

  /**
   * Check if pool is running
   */
  get isRunning(): boolean {
    return this._running;
  }

  /**
   * Check if shutdown requested
   */
  get shutdownRequested(): boolean {
    return this._shutdownRequested;
  }

  /**
   * Get all workers
   */
  get workers(): PoolWorker[] {
    return Array.from(this._workers.values());
  }

  /**
   * Update worker health status based on heartbeat
   */
  updateWorkerHealth(workerId: string, heartbeatTimestamp: number): void {
    const worker = this._workers.get(workerId);
    if (!worker) return;

    worker.metrics.lastHeartbeatAt = heartbeatTimestamp;
    const now = Date.now();
    worker.metrics.heartbeatAgeMs = now - heartbeatTimestamp;

    // Determine health status based on heartbeat age
    if (worker.activeJobs.size > 0) {
      worker.metrics.healthStatus = 'busy';
    } else if (worker.metrics.heartbeatAgeMs > 60000) {
      worker.metrics.healthStatus = 'offline';
    } else if (worker.metrics.heartbeatAgeMs > 30000) {
      worker.metrics.healthStatus = 'stale';
    } else {
      worker.metrics.healthStatus = 'online';
    }
  }

  /**
   * Get worker health diagnostics
   */
  getWorkerHealthDiagnostics(): Array<{
    workerId: string;
    workerType: string;
    lastHeartbeatAt: number | null;
    heartbeatAgeMs: number;
    healthStatus: WorkerHealthStatus;
    activeJobs: number;
    completedJobs: number;
    failedJobs: number;
  }> {
    return Array.from(this._workers.values()).map(worker => ({
      workerId: worker.id,
      workerType: worker.workerType ?? 'generic',
      lastHeartbeatAt: worker.metrics.lastHeartbeatAt,
      heartbeatAgeMs: worker.metrics.heartbeatAgeMs,
      healthStatus: worker.metrics.healthStatus,
      activeJobs: worker.activeJobs.size,
      completedJobs: worker.metrics.completedJobs,
      failedJobs: worker.metrics.failedJobs,
    }));
  }

  /**
   * Get synchronized health diagnostics comparing runtime and hub
   */
  async getSynchronizedHealthDiagnostics(): Promise<Array<{
    workerId: string;
    workerType: string;
    runtimeStatus: WorkerHealthStatus;
    hubStatus: string;
    hubEligible: boolean;
    heartbeatAgeMs: number;
    hubRejectionReasons: string[];
    mismatch: boolean;
    mismatchReason: string;
  }>> {
    const diagnostics: Array<{
      workerId: string;
      workerType: string;
      runtimeStatus: WorkerHealthStatus;
      hubStatus: string;
      hubEligible: boolean;
      heartbeatAgeMs: number;
      hubRejectionReasons: string[];
      mismatch: boolean;
      mismatchReason: string;
    }> = [];

    for (const worker of this._workers.values()) {
      const hubDebug = await worker.hubClient.getWorkerHealthDebug(worker.id);
      
      const runtimeStatus = worker.metrics.healthStatus;
      const hubStatus = hubDebug.workerDebug?.status ?? 'unknown';
      const hubEligible = hubDebug.workerFound && (hubDebug.eligibleCount > 0 || hubDebug.totalQueuedHandoffs === 0);
      const hubRejectionReasons = hubDebug.handoffs
        ?.filter(h => !h.eligible)
        .flatMap(h => h.rejectionReasons) ?? [];

      // Detect mismatches
      let mismatch = false;
      let mismatchReason = '';

      if (!hubDebug.workerFound) {
        mismatch = true;
        mismatchReason = 'Worker not found in hub';
      } else if (runtimeStatus === 'online' && hubDebug.workerDebug?.isStale) {
        mismatch = true;
        mismatchReason = 'Runtime says online but hub says stale';
      } else if (runtimeStatus === 'stale' && !hubDebug.workerDebug?.isStale && hubDebug.workerDebug?.status === 'online') {
        mismatch = true;
        mismatchReason = 'Runtime says stale but hub says online';
      } else if (runtimeStatus === 'offline' && hubEligible) {
        mismatch = true;
        mismatchReason = 'Runtime says offline but hub still allows claimables';
      }

      diagnostics.push({
        workerId: worker.id,
        workerType: worker.workerType ?? 'generic',
        runtimeStatus,
        hubStatus,
        hubEligible,
        heartbeatAgeMs: worker.metrics.heartbeatAgeMs,
        hubRejectionReasons,
        mismatch,
        mismatchReason,
      });
    }

    return diagnostics;
  }

  /**
   * Record a worker failure
   */
  recordWorkerFailure(workerId: string): void {
    const worker = this._workers.get(workerId);
    if (!worker) return;

    worker.metrics.consecutiveFailures++;
    worker.metrics.lastFailureAt = Date.now();

    // Check if worker should be quarantined
    const policy = this._config.recoveryPolicy;
    if (policy && worker.metrics.consecutiveFailures >= policy.maxConsecutiveFailures) {
      this.quarantineWorker(workerId, 'max_consecutive_failures');
    }
  }

  /**
   * Record a worker success (resets consecutive failures)
   */
  recordWorkerSuccess(workerId: string): void {
    const worker = this._workers.get(workerId);
    if (!worker) return;

    worker.metrics.consecutiveFailures = 0;
    worker.metrics.lastFailureAt = null;
  }

  /**
   * Quarantine a worker
   */
  quarantineWorker(workerId: string, reason: string): void {
    const worker = this._workers.get(workerId);
    if (!worker) return;

    const policy = this._config.recoveryPolicy;
    if (!policy) return;

    worker.metrics.quarantinedUntil = Date.now() + policy.quarantineMs;
    worker.metrics.healthStatus = 'quarantined' as WorkerHealthStatus;
  }

  /**
   * Attempt to recover a quarantined worker
   */
  async attemptWorkerRecovery(workerId: string): Promise<boolean> {
    const worker = this._workers.get(workerId);
    if (!worker) return false;

    const policy = this._config.recoveryPolicy;
    if (!policy || !policy.allowAutoRecovery) return false;

    // Check if quarantine has expired
    if (worker.metrics.quarantinedUntil && Date.now() < worker.metrics.quarantinedUntil) {
      return false; // Still quarantined
    }

    // Check if heartbeat is required
    if (policy.recoveryHeartbeatRequired) {
      const now = Date.now();
      if (!worker.metrics.lastHeartbeatAt || (now - worker.metrics.lastHeartbeatAt) > 5000) {
        return false; // No recent heartbeat
      }
    }

    // Recover the worker
    worker.metrics.quarantinedUntil = null;
    worker.metrics.consecutiveFailures = 0;
    worker.metrics.lastFailureAt = null;
    worker.metrics.recoveryAttempts++;
    worker.metrics.lastRecoveryAt = Date.now();
    worker.metrics.healthStatus = 'online';

    return true;
  }

  /**
   * Check if a worker is eligible for claiming
   */
  isWorkerEligible(workerId: string): { eligible: boolean; skipReason?: string } {
    const worker = this._workers.get(workerId);
    if (!worker) {
      return { eligible: false, skipReason: 'Worker not found' };
    }

    // Check quarantine
    if (worker.metrics.quarantinedUntil && Date.now() < worker.metrics.quarantinedUntil) {
      return { eligible: false, skipReason: 'Quarantined' };
    }

    // Check health status
    const policy = this._config.recoveryPolicy;
    const now = Date.now();

    if (worker.metrics.healthStatus === 'offline') {
      return { eligible: false, skipReason: 'Offline' };
    }

    if (worker.metrics.healthStatus === 'stale' && policy) {
      const staleDuration = worker.metrics.heartbeatAgeMs;
      if (staleDuration > policy.staleGraceMs) {
        return { eligible: false, skipReason: 'Stale beyond grace period' };
      }
    }

    // Check capacity
    if (worker.activeJobs.size >= worker.capacity.maxConcurrentJobs) {
      return { eligible: false, skipReason: 'Saturated' };
    }

    return { eligible: true };
  }

  /**
   * Get extended worker diagnostics including quarantine/recovery info
   */
  getExtendedWorkerDiagnostics(): Array<{
    workerId: string;
    workerType: string;
    healthStatus: WorkerHealthStatus;
    consecutiveFailures: number;
    lastFailureAt: number | null;
    quarantined: boolean;
    quarantinedUntil: number | null;
    recoveryAttempts: number;
    lastRecoveryAt: number | null;
    skipReason?: string;
  }> {
    return Array.from(this._workers.values()).map(worker => {
      const eligibility = this.isWorkerEligible(worker.id);
      return {
        workerId: worker.id,
        workerType: worker.workerType ?? 'generic',
        healthStatus: worker.metrics.healthStatus,
        consecutiveFailures: worker.metrics.consecutiveFailures,
        lastFailureAt: worker.metrics.lastFailureAt,
        quarantined: worker.metrics.quarantinedUntil !== null && Date.now() < worker.metrics.quarantinedUntil,
        quarantinedUntil: worker.metrics.quarantinedUntil,
        recoveryAttempts: worker.metrics.recoveryAttempts,
        lastRecoveryAt: worker.metrics.lastRecoveryAt,
        skipReason: eligibility.eligible ? undefined : eligibility.skipReason,
      };
    });
  }
}

/**
 * Create a worker pool
 */
export function createWorkerPool(config: WorkerPoolConfig): WorkerPool {
  return new WorkerPool(config);
}
