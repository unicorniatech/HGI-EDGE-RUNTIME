/**
 * Runtime Supervisor Loop
 *
 * Periodically checks health, emits snapshots, applies recovery/quarantine policy,
 * and keeps the runtime observable.
 *
 * @module src/core/runtime-supervisor
 */

import type { WorkerPool } from './worker-pool.js';
import type { HGIHubClient } from './hgi-hub-client.js';
import {
  generateRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshotJSON,
  type RuntimeHealthSnapshot,
} from './runtime-health-snapshot.js';
import {
  RuntimeJournal,
  createRuntimeJournal,
  type RuntimeJournalConfig,
  type RuntimeJournalEventType,
} from './runtime-journal.js';

/**
 * Supervisor configuration
 */
export interface RuntimeSupervisorConfig {
  /** Runtime identifier */
  runtimeId: string;
  /** Hub URL */
  hubUrl: string;
  /** Worker pool to supervise */
  pool: WorkerPool;
  /** Hub client for health checks */
  hubClient: HGIHubClient;
  /** Supervisor interval in ms */
  intervalMs: number;
  /** Whether to emit text snapshots */
  emitTextSnapshot: boolean;
  /** Whether to emit JSON snapshots */
  emitJsonSnapshot: boolean;
  /** Whether to stop on critical health mismatches */
  stopOnCriticalMismatch: boolean;
  /** Maximum warnings to store */
  maxWarnings: number;
  /** Journal configuration */
  journal?: RuntimeJournalConfig;
}

/**
 * Supervisor warning
 */
export interface SupervisorWarning {
  severity: 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
  tick: number;
}

/**
 * Runtime supervisor
 */
export class RuntimeSupervisor {
  private _config: RuntimeSupervisorConfig;
  private _running = false;
  private _interval: NodeJS.Timeout | null = null;
  private _tick = 0;
  private _lastSnapshot: RuntimeHealthSnapshot | null = null;
  private _warnings: SupervisorWarning[] = [];
  private _previousFailedJobs = 0;
  private _journal: RuntimeJournal | null = null;
  private _previousHubReachable = true;

  constructor(config: RuntimeSupervisorConfig) {
    this._config = {
      ...config,
      intervalMs: config.intervalMs ?? 5000,
      emitTextSnapshot: config.emitTextSnapshot ?? true,
      emitJsonSnapshot: config.emitJsonSnapshot ?? false,
      stopOnCriticalMismatch: config.stopOnCriticalMismatch ?? false,
      maxWarnings: config.maxWarnings ?? 100,
    };

    // Initialize journal if configured
    if (this._config.journal && this._config.journal.enabled) {
      this._journal = createRuntimeJournal(this._config.journal);
    }
  }

  /**
   * Start the supervisor loop
   */
  start(): void {
    if (this._running) {
      return; // Idempotent
    }

    this._running = true;
    this._tick = 0;
    this._warnings = [];
    this._previousFailedJobs = 0;
    this._previousHubReachable = true;

    console.log(`[Supervisor] Starting with interval ${this._config.intervalMs}ms`);
    console.log(`[Supervisor] Runtime ID: ${this._config.runtimeId}`);
    console.log();

    // Write journal event
    this.writeJournalEvent('supervisor_started', 'info', 'Supervisor started');

    // Run first tick immediately
    this.runTick();

    // Start interval
    this._interval = setInterval(() => {
      this.runTick();
    }, this._config.intervalMs);
  }

  /**
   * Stop the supervisor loop
   */
  stop(): void {
    if (!this._running) {
      return;
    }

    console.log(`[Supervisor] Stopping (tick ${this._tick})`);

    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }

    this._running = false;
    console.log(`[Supervisor] Stopped`);

    // Write journal event
    this.writeJournalEvent('supervisor_stopped', 'info', `Supervisor stopped after ${this._tick} ticks`);

    // Write lifecycle summary to journal
    if (this._lastSnapshot) {
      this.writeJournalEvent('lifecycle_summary', 'info', 'Supervisor lifecycle summary', undefined, undefined, {
        totalTicks: this._tick,
        totalWorkers: this._lastSnapshot.totalWorkers,
        totalWarnings: this._warnings.length,
        hubReachable: this._lastSnapshot.hubReachable,
        completedJobs: this._lastSnapshot.completedJobs,
        failedJobs: this._lastSnapshot.failedJobs,
      });
    }
  }

  /**
   * Check if supervisor is running
   */
  isRunning(): boolean {
    return this._running;
  }

  /**
   * Get the last snapshot
   */
  getLastSnapshot(): RuntimeHealthSnapshot | null {
    return this._lastSnapshot;
  }

  /**
   * Get warnings
   */
  getWarnings(): SupervisorWarning[] {
    return [...this._warnings];
  }

  /**
   * Run a single supervisor tick
   */
  private async runTick(): Promise<void> {
    this._tick++;

    console.log(`[Supervisor] Tick ${this._tick} at ${new Date().toISOString()}`);

    try {
      // Update worker health
      this.updateWorkerHealth();

      // Generate snapshot
      const snapshot = await generateRuntimeHealthSnapshot({
        runtimeId: this._config.runtimeId,
        hubUrl: this._config.hubUrl,
        pool: this._config.pool,
        hubClient: this._config.hubClient,
      });

      this._lastSnapshot = snapshot;

      // Check for warnings
      this.checkWarnings(snapshot);

      // Emit snapshot
      if (this._config.emitTextSnapshot) {
        console.log(formatRuntimeHealthSnapshot(snapshot));
      }

      if (this._config.emitJsonSnapshot) {
        console.log(formatRuntimeHealthSnapshotJSON(snapshot));
      }

      // Check for critical mismatch
      if (this._config.stopOnCriticalMismatch && snapshot.healthMismatches.length > 0) {
        console.error(`[Supervisor] Critical: ${snapshot.healthMismatches.length} health mismatches detected, stopping`);
        this.stop();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Supervisor] Tick ${this._tick} failed: ${errorMessage}`);
      this.addWarning('error', `Tick ${this._tick} failed: ${errorMessage}`);
    }

    console.log();
  }

  /**
   * Update worker health
   */
  private updateWorkerHealth(): void {
    const workers = this._config.pool.getAllWorkersLoad();
    const now = Date.now();

    workers.forEach(w => {
      // Update health based on heartbeat age
      this._config.pool.updateWorkerHealth(w.workerId, now);
    });
  }

  /**
   * Check for warnings
   */
  private checkWarnings(snapshot: RuntimeHealthSnapshot): void {
    // Hub unreachable
    if (!snapshot.hubReachable) {
      this.addWarning('error', 'Hub is not reachable');
      if (this._previousHubReachable) {
        this.writeJournalEvent('hub_unreachable', 'error', 'Hub became unreachable');
      }
      this._previousHubReachable = false;
    } else if (!this._previousHubReachable) {
      this.writeJournalEvent('hub_recovered', 'info', 'Hub recovered');
      this._previousHubReachable = true;
    }

    // Quarantined workers
    if (snapshot.quarantinedWorkers.length > 0) {
      this.addWarning('warning', `${snapshot.quarantinedWorkers.length} worker(s) quarantined`);
      snapshot.quarantinedWorkers.forEach(w => {
        this.writeJournalEvent('worker_quarantined', 'warning', `Worker quarantined: ${w.workerId}`, w.workerId, w.workerType, {
          consecutiveFailures: w.consecutiveFailures,
          quarantinedUntil: w.quarantinedUntil,
        });
      });
    }

    // Health mismatches
    if (snapshot.healthMismatches.length > 0) {
      this.addWarning('warning', `${snapshot.healthMismatches.length} worker(s) have health mismatches with hub`);
      snapshot.healthMismatches.forEach(m => {
        this.writeJournalEvent('worker_health_changed', 'warning', `Health mismatch: ${m.workerId}`, m.workerId, m.workerType, {
          runtimeStatus: m.runtimeStatus,
          hubStatus: m.hubStatus,
          mismatchReason: m.mismatchReason,
        });
      });
    }

    // Failed jobs increased
    if (snapshot.failedJobs > this._previousFailedJobs) {
      const increase = snapshot.failedJobs - this._previousFailedJobs;
      this.addWarning('warning', `Failed jobs increased by ${increase} (total: ${snapshot.failedJobs})`);
      this._previousFailedJobs = snapshot.failedJobs;
    }

    // Zero capacity for any capability
    Object.entries(snapshot.routingCapacityByCapability).forEach(([cap, info]) => {
      if (info.totalCapacity === 0) {
        this.addWarning('error', `Zero capacity for capability: ${cap}`);
      }
    });

    // Offline workers
    if (snapshot.workersByHealthStatus.offline > 0) {
      this.addWarning('warning', `${snapshot.workersByHealthStatus.offline} worker(s) offline`);
    }

    // Stale workers
    if (snapshot.workersByHealthStatus.stale > 0) {
      this.addWarning('info', `${snapshot.workersByHealthStatus.stale} worker(s) stale`);
    }
  }

  /**
   * Add a warning
   */
  private addWarning(severity: 'info' | 'warning' | 'error', message: string): void {
    const warning: SupervisorWarning = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      tick: this._tick,
    };

    this._warnings.push(warning);

    // Trim to max warnings
    if (this._warnings.length > this._config.maxWarnings) {
      this._warnings = this._warnings.slice(-this._config.maxWarnings);
    }

    // Write to journal
    this.writeJournalEvent('warning', severity, message);
  }

  /**
   * Write a journal event
   */
  private writeJournalEvent(
    eventType: RuntimeJournalEventType,
    severity: 'info' | 'warning' | 'error',
    message: string,
    workerId?: string,
    workerType?: string,
    metadata?: Record<string, unknown>
  ): void {
    if (!this._journal) return;

    this._journal.writeEvent({
      timestamp: new Date().toISOString(),
      runtimeId: this._config.runtimeId,
      eventType,
      severity,
      workerId,
      workerType,
      message,
      metadata,
    });
  }
}

/**
 * Create a runtime supervisor
 */
export function createRuntimeSupervisor(config: RuntimeSupervisorConfig): RuntimeSupervisor {
  return new RuntimeSupervisor(config);
}
