/**
 * HGI Claimable Worker Demo
 *
 * Demonstrates the intelligent claimable handoff flow where the hub
 * selects compatible handoffs for the worker based on capabilities.
 *
 * This shows the new worker-hub interaction pattern:
 * 1. Worker asks hub: "What can I claim?"
 * 2. Hub responds with compatible, prioritized handoffs
 * 3. Worker claims and processes the best match
 *
 * Environment variables:
 * - HGI_LOCAL_HUB_URL: Hub URL (default: http://localhost:4010)
 * - HGI_WORKER_ID: Worker identifier (default: demo-worker-001)
 *
 * @module examples/claimable-worker-demo
 */

import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { HGIHubError } from '../src/types/hub-handoff.js';

// Configuration
const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
const WORKER_ID = process.env.HGI_WORKER_ID ?? 'demo-worker-001';

// Worker capabilities (what this worker can handle)
const WORKER_CAPABILITIES = ['llm', 'local-llm', 'tinyllama'];

/**
 * Demo the claimable handoff flow
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI Claimable Handoff Worker Demo                      ║');
  console.log('║     Intelligent Hub-Worker Matching                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Worker ID: ${WORKER_ID}`);
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Worker capabilities: ${WORKER_CAPABILITIES.join(', ')}`);
  console.log();

  // Create hub client
  const hubClient = createHGIHubClient({
    baseUrl: HUB_URL,
    timeoutMs: 30000,
    runtimeId: WORKER_ID,
  });

  // Check hub reachability
  console.log('Checking hub connection...');
  const reachable = await hubClient.isReachable();
  if (!reachable) {
    console.error(`ERROR: Hub not reachable at ${HUB_URL}`);
    console.error('Make sure hgi-local-node is running');
    process.exit(1);
  }
  console.log('✓ Hub connected');
  console.log();

  // Query claimable handoffs
  console.log('Querying claimable handoffs from hub...');
  console.log('This asks the hub: "What handoffs can I handle?"');
  console.log();

  try {
    const claimable = await hubClient.getClaimableHandoffs(WORKER_ID);

    console.log('━'.repeat(60));
    console.log('Hub Response: Claimable Handoffs');
    console.log('━'.repeat(60));
    console.log(`  Worker ID:          ${WORKER_ID}`);
    console.log(`  Worker capabilities: ${WORKER_CAPABILITIES.join(', ')}`);
    console.log(`  Claimable count:     ${claimable.length}`);
    console.log();

    if (claimable.length === 0) {
      console.log('  No claimable handoffs available.');
      console.log('  The hub may have no queued handoffs, or none match');
      console.log('  this worker\'s capabilities.');
      console.log();
      console.log('  To create handoffs, run:');
      console.log('    npm run example:e2e');
      console.log();
    } else {
      console.log('  Claimable handoffs (sorted by priority):');
      console.log();

      claimable.forEach((handoff, index) => {
        console.log(`  ${index + 1}. Handoff ${handoff.id}`);
        console.log(`     Priority:     ${handoff.priority ?? 'default'}`);
        console.log(`     Capability:   ${handoff.requestedCapability}`);
        console.log(`     Complexity:   ${handoff.estimatedComplexity ?? 'unknown'}`);
        console.log(`     Created:      ${handoff.createdAt}`);
        console.log();
      });

      // Show the recommended handoff (first one)
      const recommended = claimable[0];
      console.log('━'.repeat(60));
      console.log('Recommended Handoff (Highest Priority)');
      console.log('━'.repeat(60));
      console.log(`  ID:           ${recommended.id}`);
      console.log(`  Priority:     ${recommended.priority ?? 'default'}`);
      console.log(`  Capability:   ${recommended.requestedCapability}`);
      console.log(`  Complexity:   ${recommended.estimatedComplexity ?? 'unknown'}`);
      console.log();
      console.log('  This is the handoff the worker should claim and process.');
      console.log();
    }

    console.log('━'.repeat(60));
    console.log();

  } catch (error) {
    if (error instanceof HGIHubError && error.type === 'not_found') {
      console.log('⚠ Claimable endpoint not available (404)');
      console.log('  The hub may not support intelligent worker selection yet.');
      console.log('  Falling back to queue endpoint...');
      console.log();

      // Fallback to queue
      const queue = await hubClient.listHandoffQueue();
      const pending = queue.filter(h => h.status === 'queued');

      console.log(`Found ${pending.length} handoff(s) in queue (fallback mode)`);
      console.log();

      if (pending.length > 0) {
        console.log('  First available handoff:');
        console.log(`    ID:         ${pending[0].id}`);
        console.log(`    Capability: ${pending[0].requestedCapability}`);
        console.log(`    Created:    ${pending[0].createdAt}`);
        console.log();
        console.log('  Note: In fallback mode, the worker picks handoffs');
        console.log('  manually without hub-assisted intelligent matching.');
      }
    } else {
      console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  console.log();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Demo Complete                                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Next steps:');
  console.log('  1. Submit handoffs: npm run example:e2e');
  console.log('  2. Run worker:      npm run worker:llama');
  console.log('  3. Watch worker use intelligent claimable endpoint');
  console.log();
}

// Run demo
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
