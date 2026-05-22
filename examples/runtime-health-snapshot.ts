/**
 * Runtime Health Snapshot CLI
 *
 * Generates and displays a runtime health snapshot showing worker status,
 * hub synchronization, quarantine state, routing capacity, and lifecycle metrics.
 *
 * Usage:
 *   npm run example:runtime-health-snapshot
 *   HGI_HEALTH_JSON=true npm run example:runtime-health-snapshot
 *
 * @module examples/runtime-health-snapshot
 */

import { createWorkerPool } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import {
  generateRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshotJSON,
} from '../src/core/runtime-health-snapshot.js';

const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
const RUNTIME_ID = 'runtime-health-snapshot';
const OUTPUT_JSON = process.env.HGI_HEALTH_JSON === 'true';

async function main() {
  console.log('Runtime Health Snapshot');
  console.log('='.repeat(60));
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
      console.error('   Cannot proceed with snapshot');
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
    poolId: 'health-snapshot-pool',
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
  // For this snapshot CLI, we'll just show the pool state as-is.
  // If you want to see actual worker data, run the full validation script instead.

  console.log('Generating runtime health snapshot...');
  console.log();

  // Generate snapshot
  const snapshot = await generateRuntimeHealthSnapshot({
    runtimeId: RUNTIME_ID,
    hubUrl: HUB_URL,
    pool,
    hubClient,
  });

  // Output based on format preference
  if (OUTPUT_JSON) {
    console.log(formatRuntimeHealthSnapshotJSON(snapshot));
  } else {
    console.log(formatRuntimeHealthSnapshot(snapshot));
  }

  console.log();
  console.log('Snapshot complete');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
