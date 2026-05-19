/**
 * HGI Worker Pool Demo
 *
 * Demonstrates multi-worker coordination and load balancing.
 * Simulates multiple workers processing handoffs from the queue.
 *
 * Environment variables:
 * - HGI_LOCAL_HUB_URL: Hub URL (default: http://localhost:4010)
 * - HGI_WORKER_COUNT: Number of workers to spawn (default: 3)
 * - HGI_MAX_JOBS_PER_WORKER: Max concurrent jobs per worker (default: 2)
 *
 * @module examples/worker-pool-demo
 */

import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { createWorkerPool, type WorkerCapacity } from '../src/core/worker-pool.js';

// Configuration
const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
const WORKER_COUNT = parseInt(process.env.HGI_WORKER_COUNT ?? '3', 10);
const MAX_JOBS_PER_WORKER = parseInt(process.env.HGI_MAX_JOBS_PER_WORKER ?? '2', 10);

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Main demo
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI Worker Pool Demo                                   ║');
  console.log('║     Multi-Worker Coordination & Load Balancing             ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Workers: ${WORKER_COUNT}`);
  console.log(`Max jobs per worker: ${MAX_JOBS_PER_WORKER}`);
  console.log();

  // Check hub connection
  const hubClient = createHGIHubClient({
    baseUrl: HUB_URL,
    timeoutMs: 30000,
    runtimeId: 'pool-demo',
  });

  console.log('Checking hub connection...');
  const reachable = await hubClient.isReachable();
  if (!reachable) {
    console.error('✗ Hub not reachable. Start hgi-local-node first:');
    console.error('  cd /path/to/hgi-local-node && npm run dev');
    process.exit(1);
  }
  console.log('✓ Hub connected');
  console.log();

  // Create worker pool
  const pool = createWorkerPool({
    poolId: 'demo-pool',
    hubUrl: HUB_URL,
    pollIntervalMs: 3000,
    enableLoadBalancing: true,
  });

  // Add workers to pool
  console.log('Creating workers...');
  for (let i = 1; i <= WORKER_COUNT; i++) {
    const workerId = `worker-${i.toString().padStart(2, '0')}`;
    const workerClient = createHGIHubClient({
      baseUrl: HUB_URL,
      timeoutMs: 30000,
      runtimeId: workerId,
    });

    const capacity: WorkerCapacity = {
      maxConcurrentJobs: MAX_JOBS_PER_WORKER,
      currentActiveJobs: 0,
      supportedCapabilities: ['llm', 'local-llm', 'tinyllama'],
    };

    pool.addWorker(workerId, workerClient, capacity);
    console.log(`  ✓ ${workerId} (max ${MAX_JOBS_PER_WORKER} jobs)`);
  }
  console.log();

  // Print initial pool status
  printPoolStatus(pool);
  console.log();

  // Start pool
  await pool.start();
  console.log('Pool started. Workers are ready to claim handoffs.');
  console.log();

  // Simulate processing for a fixed duration
  const DEMO_DURATION_MS = 30000; // 30 seconds
  console.log(`Running for ${formatDuration(DEMO_DURATION_MS)}...`);
  console.log('Press Ctrl+C to stop early');
  console.log();

  // Status update interval
  const statusInterval = setInterval(() => {
    printPoolStatus(pool);
  }, 5000);

  // Wait for demo duration
  await new Promise(resolve => setTimeout(resolve, DEMO_DURATION_MS));

  // Stop status updates
  clearInterval(statusInterval);

  // Stop pool
  console.log();
  console.log('Stopping pool...');
  await pool.stop();

  // Final summary
  console.log();
  printFinalSummary(pool);
}

/**
 * Print pool status
 */
function printPoolStatus(pool: ReturnType<typeof createWorkerPool>): void {
  const stats = pool.getPoolStats();
  const workers = pool.getAllWorkersLoad();

  console.log('━'.repeat(70));
  console.log(`Pool: ${stats.totalWorkers} workers | Active: ${stats.activeWorkers} | Utilization: ${stats.poolUtilizationPercent}%`);
  console.log(`Jobs: ${stats.totalActiveJobs} active | ${stats.totalCompletedJobs} completed | ${stats.totalFailedJobs} failed`);
  console.log();
  console.log('Worker Load:');

  workers.forEach(w => {
    const bar = '█'.repeat(Math.round(w.utilizationPercent / 10)) + '░'.repeat(10 - Math.round(w.utilizationPercent / 10));
    const lastActivity = w.lastActivityAt ? formatDuration(Date.now() - w.lastActivityAt) + ' ago' : 'never';
    console.log(`  ${w.workerId.padEnd(10)} ${bar} ${w.utilizationPercent.toString().padStart(3)}% | ${w.activeJobs}/${w.maxJobs} jobs | Last: ${lastActivity}`);
  });

  console.log('━'.repeat(70));
}

/**
 * Print final summary
 */
function printFinalSummary(pool: ReturnType<typeof createWorkerPool>): void {
  const stats = pool.getPoolStats();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Worker Pool Demo Complete                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Pool Statistics:');
  console.log(`  Workers:           ${stats.totalWorkers}`);
  console.log(`  Total capacity:    ${stats.totalCapacity} concurrent jobs`);
  console.log(`  Final utilization: ${stats.poolUtilizationPercent}%`);
  console.log();
  console.log('Job Statistics:');
  console.log(`  Completed: ${stats.totalCompletedJobs}`);
  console.log(`  Failed:    ${stats.totalFailedJobs}`);
  console.log(`  Success rate: ${stats.totalCompletedJobs + stats.totalFailedJobs > 0
    ? Math.round((stats.totalCompletedJobs / (stats.totalCompletedJobs + stats.totalFailedJobs)) * 100)
    : 0}%`);
  console.log();
  console.log('Per-Worker Metrics:');

  pool.workers.forEach(w => {
    const avgTime = w.metrics.averageProcessingTimeMs > 0
      ? formatDuration(w.metrics.averageProcessingTimeMs)
      : 'N/A';
    console.log(`  ${w.id}:`);
    console.log(`    Completed: ${w.metrics.completedJobs}`);
    console.log(`    Failed:    ${w.metrics.failedJobs}`);
    console.log(`    Avg time:  ${avgTime}`);
    console.log(`    Final util: ${w.metrics.utilizationPercent}%`);
  });

  console.log();
}

// Run demo
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
