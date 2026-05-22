/**
 * Runtime Health Snapshot
 *
 * Provides a comprehensive snapshot of runtime health including worker status,
 * hub synchronization, quarantine state, routing capacity, and lifecycle metrics.
 *
 * @module src/core/runtime-health-snapshot
 */

import type { WorkerPool } from './worker-pool.js';
import type { WorkerHealthStatus } from './worker-pool.js';
import type { HGIHubClient } from './hgi-hub-client.js';

/**
 * Runtime health snapshot
 */
export interface RuntimeHealthSnapshot {
  /** Snapshot timestamp */
  timestamp: string;
  /** Runtime identifier */
  runtimeId: string;
  /** Hub URL */
  hubUrl: string;
  /** Hub reachable status */
  hubReachable: boolean;
  /** Total workers */
  totalWorkers: number;
  /** Workers grouped by type */
  workersByType: Record<string, number>;
  /** Workers grouped by health status */
  workersByHealthStatus: Record<WorkerHealthStatus, number>;
  /** Total capacity (max concurrent jobs) */
  totalCapacity: number;
  /** Active jobs */
  activeJobs: number;
  /** Completed jobs */
  completedJobs: number;
  /** Failed jobs */
  failedJobs: number;
  /** Quarantined workers */
  quarantinedWorkers: Array<{
    workerId: string;
    workerType: string;
    quarantinedUntil: string | null;
    consecutiveFailures: number;
  }>;
  /** Health mismatches between runtime and hub */
  healthMismatches: Array<{
    workerId: string;
    workerType: string;
    runtimeStatus: WorkerHealthStatus;
    hubStatus: string;
    mismatchReason: string;
  }>;
  /** Routing capacity by capability */
  routingCapacityByCapability: Record<string, {
    totalWorkers: number;
    totalCapacity: number;
    activeJobs: number;
    availableCapacity: number;
  }>;
  /** Recent warnings */
  recentWarnings: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    timestamp: string;
  }>;
}

/**
 * Generate runtime health snapshot
 */
export async function generateRuntimeHealthSnapshot(params: {
  runtimeId: string;
  hubUrl: string;
  pool: WorkerPool;
  hubClient: HGIHubClient;
}): Promise<RuntimeHealthSnapshot> {
  const { runtimeId, hubUrl, pool, hubClient } = params;
  const timestamp = new Date().toISOString();

  // Check hub reachability
  let hubReachable = false;
  try {
    const health = await hubClient.health();
    hubReachable = health.healthy;
  } catch (error) {
    hubReachable = false;
  }

  // Get pool stats
  const poolStats = pool.getPoolStats();
  const workers = pool.getAllWorkersLoad();

  // Group workers by type
  const workersByType: Record<string, number> = {};
  workers.forEach(w => {
    const type = w.workerType ?? 'generic';
    workersByType[type] = (workersByType[type] ?? 0) + 1;
  });

  // Group workers by health status
  const workersByHealthStatus: Record<WorkerHealthStatus, number> = {
    online: 0,
    stale: 0,
    offline: 0,
    busy: 0,
    quarantined: 0,
  };

  const extendedDiagnostics = pool.getExtendedWorkerDiagnostics();
  extendedDiagnostics.forEach(d => {
    workersByHealthStatus[d.healthStatus] = (workersByHealthStatus[d.healthStatus] ?? 0) + 1;
  });

  // Get quarantined workers
  const quarantinedWorkers = extendedDiagnostics
    .filter(d => d.quarantined)
    .map(d => ({
      workerId: d.workerId,
      workerType: d.workerType,
      quarantinedUntil: d.quarantinedUntil ? new Date(d.quarantinedUntil).toISOString() : null,
      consecutiveFailures: d.consecutiveFailures,
    }));

  // Get health mismatches
  const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
  const healthMismatches = syncDiagnostics
    .filter(d => d.mismatch)
    .map(d => ({
      workerId: d.workerId,
      workerType: d.workerType,
      runtimeStatus: d.runtimeStatus,
      hubStatus: d.hubStatus,
      mismatchReason: d.mismatchReason,
    }));

  // Get routing capacity by capability
  const routingCapacityByCapability: Record<string, {
    totalWorkers: number;
    totalCapacity: number;
    activeJobs: number;
    availableCapacity: number;
  }> = {};

  extendedDiagnostics.forEach(d => {
    // Get worker load info to find capacity
    const workerLoad = workers.find(w => w.workerId === d.workerId);
    if (!workerLoad) return;

    // Use extended diagnostics to get worker type
    const workerType = d.workerType;

    // Estimate capacity from load info
    const maxJobs = workerLoad.maxJobs;
    const activeJobs = workerLoad.activeJobs;
    const availableSlots = workerLoad.availableSlots;

    // Since we don't have direct access to supportedCapabilities from public methods,
    // we'll use a default capability based on worker type
    const capabilities = [workerType ?? 'generic'];

    capabilities.forEach((cap: string) => {
      if (!routingCapacityByCapability[cap]) {
        routingCapacityByCapability[cap] = {
          totalWorkers: 0,
          totalCapacity: 0,
          activeJobs: 0,
          availableCapacity: 0,
        };
      }
      routingCapacityByCapability[cap].totalWorkers++;
      routingCapacityByCapability[cap].totalCapacity += maxJobs;
      routingCapacityByCapability[cap].activeJobs += activeJobs;
      routingCapacityByCapability[cap].availableCapacity += availableSlots;
    });
  });

  // Generate warnings
  const recentWarnings: Array<{
    severity: 'info' | 'warning' | 'error';
    message: string;
    timestamp: string;
  }> = [];

  if (!hubReachable) {
    recentWarnings.push({
      severity: 'error',
      message: 'Hub is not reachable',
      timestamp,
    });
  }

  if (quarantinedWorkers.length > 0) {
    recentWarnings.push({
      severity: 'warning',
      message: `${quarantinedWorkers.length} worker(s) quarantined`,
      timestamp,
    });
  }

  if (healthMismatches.length > 0) {
    recentWarnings.push({
      severity: 'warning',
      message: `${healthMismatches.length} worker(s) have health mismatches with hub`,
      timestamp,
    });
  }

  if (workersByHealthStatus.offline > 0) {
    recentWarnings.push({
      severity: 'warning',
      message: `${workersByHealthStatus.offline} worker(s) offline`,
      timestamp,
    });
  }

  if (workersByHealthStatus.stale > 0) {
    recentWarnings.push({
      severity: 'info',
      message: `${workersByHealthStatus.stale} worker(s) stale`,
      timestamp,
    });
  }

  return {
    timestamp,
    runtimeId,
    hubUrl,
    hubReachable,
    totalWorkers: poolStats.totalWorkers,
    workersByType,
    workersByHealthStatus,
    totalCapacity: poolStats.totalCapacity,
    activeJobs: poolStats.totalActiveJobs,
    completedJobs: poolStats.totalCompletedJobs,
    failedJobs: poolStats.totalFailedJobs,
    quarantinedWorkers,
    healthMismatches,
    routingCapacityByCapability,
    recentWarnings,
  };
}

/**
 * Format runtime health snapshot as human-readable text
 */
export function formatRuntimeHealthSnapshot(snapshot: RuntimeHealthSnapshot): string {
  const lines: string[] = [];

  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║     Runtime Health Snapshot                               ║');
  lines.push('╚════════════════════════════════════════════════════════════╝');
  lines.push();
  lines.push(`Timestamp: ${snapshot.timestamp}`);
  lines.push(`Runtime ID: ${snapshot.runtimeId}`);
  lines.push(`Hub URL: ${snapshot.hubUrl}`);
  lines.push(`Hub Reachable: ${snapshot.hubReachable ? '✅ YES' : '❌ NO'}`);
  lines.push();

  // Overall health
  lines.push('━'.repeat(60));
  lines.push('Overall Health');
  lines.push('━'.repeat(60));
  lines.push();
  lines.push(`Total Workers: ${snapshot.totalWorkers}`);
  lines.push(`Total Capacity: ${snapshot.totalCapacity} concurrent jobs`);
  lines.push(`Active Jobs: ${snapshot.activeJobs}`);
  lines.push(`Completed Jobs: ${snapshot.completedJobs}`);
  lines.push(`Failed Jobs: ${snapshot.failedJobs}`);
  lines.push();

  // Workers by type
  lines.push('━'.repeat(60));
  lines.push('Workers by Type');
  lines.push('━'.repeat(60));
  lines.push();
  Object.entries(snapshot.workersByType).forEach(([type, count]) => {
    lines.push(`  ${type}: ${count}`);
  });
  lines.push();

  // Workers by health status
  lines.push('━'.repeat(60));
  lines.push('Workers by Health Status');
  lines.push('━'.repeat(60));
  lines.push();
  Object.entries(snapshot.workersByHealthStatus).forEach(([status, count]) => {
    if (count > 0) {
      const icon = status === 'online' ? '✅' : status === 'quarantined' ? '🔒' : status === 'offline' ? '❌' : '⚠️';
      lines.push(`  ${icon} ${status}: ${count}`);
    }
  });
  lines.push();

  // Routing capacity by capability
  lines.push('━'.repeat(60));
  lines.push('Routing Capacity by Capability');
  lines.push('━'.repeat(60));
  lines.push();
  Object.entries(snapshot.routingCapacityByCapability).forEach(([cap, info]) => {
    lines.push(`  ${cap}:`);
    lines.push(`    Workers: ${info.totalWorkers}`);
    lines.push(`    Capacity: ${info.totalCapacity}`);
    lines.push(`    Active: ${info.activeJobs}`);
    lines.push(`    Available: ${info.availableCapacity}`);
  });
  lines.push();

  // Quarantined workers
  if (snapshot.quarantinedWorkers.length > 0) {
    lines.push('━'.repeat(60));
    lines.push('Quarantined Workers');
    lines.push('━'.repeat(60));
    lines.push();
    snapshot.quarantinedWorkers.forEach(w => {
      lines.push(`  ${w.workerId} (${w.workerType})`);
      lines.push(`    Failures: ${w.consecutiveFailures}`);
      lines.push(`    Until: ${w.quarantinedUntil ?? 'unknown'}`);
    });
    lines.push();
  }

  // Health mismatches
  if (snapshot.healthMismatches.length > 0) {
    lines.push('━'.repeat(60));
    lines.push('Health Mismatches');
    lines.push('━'.repeat(60));
    lines.push();
    snapshot.healthMismatches.forEach(m => {
      lines.push(`  ${m.workerId} (${m.workerType})`);
      lines.push(`    Runtime: ${m.runtimeStatus}`);
      lines.push(`    Hub: ${m.hubStatus}`);
      lines.push(`    Reason: ${m.mismatchReason}`);
    });
    lines.push();
  }

  // Warnings
  if (snapshot.recentWarnings.length > 0) {
    lines.push('━'.repeat(60));
    lines.push('Warnings');
    lines.push('━'.repeat(60));
    lines.push();
    snapshot.recentWarnings.forEach(w => {
      const icon = w.severity === 'error' ? '❌' : w.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`  ${icon} [${w.severity.toUpperCase()}] ${w.message}`);
    });
    lines.push();
  }

  return lines.join('\n');
}

/**
 * Format runtime health snapshot as JSON
 */
export function formatRuntimeHealthSnapshotJSON(snapshot: RuntimeHealthSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
