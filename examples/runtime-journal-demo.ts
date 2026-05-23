/**
 * Runtime Journal Demo
 *
 * Demonstrates the local runtime journal for persisting events,
 * warnings, health transitions, and lifecycle summaries.
 *
 * Usage:
 *   npm run example:runtime-journal-demo
 *
 * @module examples/runtime-journal-demo
 */

import { createWorkerPool } from '../src/core/worker-pool.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { createRuntimeSupervisor } from '../src/core/runtime-supervisor.js';
import { readRuntimeJournal, createRuntimeJournal } from '../src/core/runtime-journal.js';

const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
const RUNTIME_ID = 'runtime-journal-demo';
const JOURNAL_PATH = '.hgi-runtime/runtime-journal.jsonl';

async function main() {
  console.log('Runtime Journal Demo');
  console.log('='.repeat(60));
  console.log();
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Runtime ID: ${RUNTIME_ID}`);
  console.log(`Journal Path: ${JOURNAL_PATH}`);
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
    poolId: 'journal-demo-pool',
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

  // Create supervisor with journal enabled
  const supervisor = createRuntimeSupervisor({
    runtimeId: RUNTIME_ID,
    hubUrl: HUB_URL,
    pool,
    hubClient,
    intervalMs: 2000,
    emitTextSnapshot: false,
    emitJsonSnapshot: false,
    stopOnCriticalMismatch: false,
    maxWarnings: 50,
    journal: {
      enabled: true,
      path: JOURNAL_PATH,
      maxEventsInMemory: 100,
      alsoPrintToConsole: true,
    },
  });

  // Start supervisor
  console.log('Starting supervisor with journal enabled...');
  supervisor.start();
  console.log();

  // Run for a few ticks
  console.log('Running for 6 seconds (3 ticks)...');
  console.log();
  await new Promise(resolve => setTimeout(resolve, 6000));

  // Stop supervisor
  console.log('Stopping supervisor...');
  supervisor.stop();
  console.log();

  // Read journal
  console.log('━'.repeat(60));
  console.log('Reading Journal');
  console.log('━'.repeat(60));
  console.log();

  const events = await readRuntimeJournal(JOURNAL_PATH);
  console.log(`Total events in journal: ${events.length}`);
  console.log();

  // Print last 5 events
  console.log('Last 5 events:');
  const last5 = events.slice(-5);
  last5.forEach(e => {
    const icon = e.severity === 'error' ? '❌' : e.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`  ${icon} [${e.eventType}] ${e.message}`);
    console.log(`     ID: ${e.id}`);
    console.log(`     Timestamp: ${e.timestamp}`);
    if (e.workerId) {
      console.log(`     Worker: ${e.workerId} (${e.workerType})`);
    }
    if (e.metadata) {
      console.log(`     Metadata: ${JSON.stringify(e.metadata)}`);
    }
    console.log();
  });

  // Filter by severity
  console.log('━'.repeat(60));
  console.log('Filtering by Severity');
  console.log('━'.repeat(60));
  console.log();

  const errorEvents = await readRuntimeJournal(JOURNAL_PATH, { severity: 'error' });
  const warningEvents = await readRuntimeJournal(JOURNAL_PATH, { severity: 'warning' });
  const infoEvents = await readRuntimeJournal(JOURNAL_PATH, { severity: 'info' });

  console.log(`Error events: ${errorEvents.length}`);
  console.log(`Warning events: ${warningEvents.length}`);
  console.log(`Info events: ${infoEvents.length}`);
  console.log();

  // Filter by event type
  console.log('━'.repeat(60));
  console.log('Filtering by Event Type');
  console.log('━'.repeat(60));
  console.log();

  const lifecycleEvents = await readRuntimeJournal(JOURNAL_PATH, { eventType: 'lifecycle_summary' });
  const warningJournalEvents = await readRuntimeJournal(JOURNAL_PATH, { eventType: 'warning' });

  console.log(`Lifecycle summary events: ${lifecycleEvents.length}`);
  console.log(`Warning events: ${warningJournalEvents.length}`);
  console.log();

  // Print summary
  console.log('━'.repeat(60));
  console.log('Journal Summary');
  console.log('━'.repeat(60));
  console.log();

  console.log(`Journal file: ${JOURNAL_PATH}`);
  console.log(`Total events: ${events.length}`);
  console.log(`Event types: ${[...new Set(events.map(e => e.eventType))].join(', ')}`);
  console.log();

  console.log('Demo complete');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
