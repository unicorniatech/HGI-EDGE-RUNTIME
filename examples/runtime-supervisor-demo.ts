/**
 * Runtime Supervisor Demo
 *
 * Demonstrates the runtime supervisor loop with periodic health checks,
 * snapshot generation, and warning collection.
 *
 * Usage:
 *   npm run example:runtime-supervisor-demo
 *   HGI_SUPERVISOR_INTERVAL_MS=2000 npm run example:runtime-supervisor-demo
 *   HGI_SUPERVISOR_DURATION_MS=10000 npm run example:runtime-supervisor-demo
 *   HGI_SUPERVISOR_JSON=true npm run example:runtime-supervisor-demo
 *
 * @module examples/runtime-supervisor-demo
 */

import { createWorkerPool } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { createRuntimeSupervisor } from '../src/core/runtime-supervisor.js';

const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
const RUNTIME_ID = 'runtime-supervisor-demo';
const INTERVAL_MS = parseInt(process.env.HGI_SUPERVISOR_INTERVAL_MS ?? '3000', 10);
const DURATION_MS = parseInt(process.env.HGI_SUPERVISOR_DURATION_MS ?? '10000', 10);
const OUTPUT_JSON = process.env.HGI_SUPERVISOR_JSON === 'true';

async function main() {
  console.log('Runtime Supervisor Demo');
  console.log('='.repeat(60));
  console.log();
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Runtime ID: ${RUNTIME_ID}`);
  console.log(`Interval: ${INTERVAL_MS}ms`);
  console.log(`Duration: ${DURATION_MS}ms`);
  console.log(`JSON Output: ${OUTPUT_JSON ? 'YES' : 'NO'}`);
  console.log();

  // Create hub client
  const hubClient = createHGIHubClient({
    baseUrl: HUB_URL,
    timeoutMs: 30000,
    runtimeId: RUNTIME_ID,
  });

  // Check hub health
  console.log('Checking hub health...');
  try {
    const health = await hubClient.health();
    if (!health.healthy) {
      console.error('❌ Hub is not healthy');
      console.error('   Cannot proceed with demo');
      process.exit(1);
    }
    console.log('✓ Hub is healthy');
  } catch (error) {
    console.error('❌ Failed to connect to hub');
    console.error(`   ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  console.log();

  // Create worker pool with recovery policy
  const pool = createWorkerPool({
    poolId: 'supervisor-demo-pool',
    hubUrl: HUB_URL,
    pollIntervalMs: 1000,
    enableLoadBalancing: true,
    recoveryPolicy: {
      maxConsecutiveFailures: 3,
      staleGraceMs: 30000,
      offlineGraceMs: 60000,
      quarantineMs: 5000,
      recoveryHeartbeatRequired: true,
      allowAutoRecovery: true,
    },
  });

  // Note: In a real scenario, workers would be registered here.
  // For this demo, we'll run the supervisor with an empty pool to show the structure.

  // Create supervisor
  const supervisor = createRuntimeSupervisor({
    runtimeId: RUNTIME_ID,
    hubUrl: HUB_URL,
    pool,
    hubClient,
    intervalMs: INTERVAL_MS,
    emitTextSnapshot: !OUTPUT_JSON,
    emitJsonSnapshot: OUTPUT_JSON,
    stopOnCriticalMismatch: false,
    maxWarnings: 50,
  });

  // Start supervisor
  console.log('Starting supervisor...');
  supervisor.start();
  console.log();

  // Run for specified duration
  console.log(`Running for ${DURATION_MS}ms...`);
  console.log();

  await new Promise(resolve => setTimeout(resolve, DURATION_MS));

  // Stop supervisor
  console.log('Stopping supervisor...');
  supervisor.stop();
  console.log();

  // Print summary
  console.log('━'.repeat(60));
  console.log('Supervisor Summary');
  console.log('━'.repeat(60));
  console.log();

  const lastSnapshot = supervisor.getLastSnapshot();
  const warnings = supervisor.getWarnings();

  console.log(`Total Ticks: ${supervisor.isRunning() ? 'Running' : 'Stopped'}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log();

  if (warnings.length > 0) {
    console.log('Warnings:');
    warnings.forEach(w => {
      const icon = w.severity === 'error' ? '❌' : w.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} [${w.severity.toUpperCase()}] Tick ${w.tick}: ${w.message}`);
      console.log(`     ${w.timestamp}`);
    });
    console.log();
  }

  if (lastSnapshot) {
    console.log('Last Snapshot:');
    console.log(`  Timestamp: ${lastSnapshot.timestamp}`);
    console.log(`  Hub Reachable: ${lastSnapshot.hubReachable ? 'YES' : 'NO'}`);
    console.log(`  Total Workers: ${lastSnapshot.totalWorkers}`);
    console.log(`  Active Jobs: ${lastSnapshot.activeJobs}`);
    console.log(`  Completed Jobs: ${lastSnapshot.completedJobs}`);
    console.log(`  Failed Jobs: ${lastSnapshot.failedJobs}`);
    console.log();
  }

  console.log('Demo complete');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
