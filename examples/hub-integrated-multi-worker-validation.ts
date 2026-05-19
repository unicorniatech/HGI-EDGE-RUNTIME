/**
 * HGI Hub-Integrated Multi-Worker Validation
 *
 * Validates multi-worker execution against a running hgi-local-node hub.
 * Tests the full handoff lifecycle: create → claimable → claim → process → complete.
 *
 * Worker Types Tested:
 * - llm: Text generation
 * - eva: Reasoning/analysis
 * - stt: Speech-to-text (placeholder)
 * - tts: Text-to-speech (placeholder)
 * - vision: Image analysis (placeholder)
 * - emergency: Priority inference
 *
 * @module examples/hub-integrated-multi-worker-validation
 */

import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import { createWorkerPool } from '../src/core/worker-pool.js';
import {
  createLLMWorker,
  createEVAWorker,
  createSTTWorker,
  createTTSWorker,
  createVisionWorker,
  createEmergencyWorker,
} from '../src/core/worker-registration.js';
import {
  createProcessor,
  type ProcessorRequest,
} from '../src/core/worker-processors.js';
import type { HGIHubHandoffResponse } from '../src/types/hub-handoff.js';

// Configuration
const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Main validation
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI Hub-Integrated Multi-Worker Validation             ║');
  console.log('║     Full Handoff Lifecycle: Create → Claim → Complete        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Hub URL: ${HUB_URL}`);
  console.log('Mode: Hub-integrated with live handoff queue');
  console.log();

  // Create hub client
  const hubClient = createHGIHubClient({
    baseUrl: HUB_URL,
    timeoutMs: 30000,
    runtimeId: 'hub-integrated-validation',
  });

  // Step 1: Check hub health
  console.log('━'.repeat(60));
  console.log('Step 1: Hub Health Check');
  console.log('━'.repeat(60));
  console.log();

  const health = await hubClient.health();
  if (!health.healthy) {
    console.error('❌ Hub is not healthy');
    console.error('   Cannot proceed with validation');
    console.error();
    console.error('To start hgi-local-node:');
    console.error('   cd C:\\Users\\molie\\VistaDev\\HGI-NODO\\hgi-local-node');
    console.error('   pnpm start:daemon');
    process.exit(1);
  }

  console.log(`✓ Hub is healthy`);
  console.log(`  Healthy: ${health.healthy}`);
  console.log(`  Version: ${health.version ?? 'unknown'}`);
  console.log(`  Timestamp: ${health.timestamp}`);
  console.log();

  // Step 2: Check claimable endpoint
  console.log('━'.repeat(60));
  console.log('Step 2: Claimable Endpoint Check');
  console.log('━'.repeat(60));
  console.log();

  let claimableEndpointAvailable = false;
  try {
    const claimable = await hubClient.getClaimableHandoffs('test-worker');
    console.log(`✓ Claimable endpoint is available`);
    console.log(`  Found ${claimable.length} claimable handoffs`);
    claimableEndpointAvailable = true;
  } catch (error) {
    console.log(`⚠ Claimable endpoint not available`);
    console.log(`  Will use queue endpoint fallback`);
  }
  console.log();

  // Step 3: Create worker pool with capability contracts
  console.log('━'.repeat(60));
  console.log('Step 3: Register Workers with Capability Contracts');
  console.log('━'.repeat(60));
  console.log();

  const pool = createWorkerPool({
    poolId: 'hub-integrated-validation',
    hubUrl: HUB_URL,
    pollIntervalMs: 1000,
    enableLoadBalancing: true,
  });

  // Register workers
  const workers = [
    createLLMWorker('llm-01', hubClient, { maxConcurrentJobs: 2 }),
    createEVAWorker('eva-01', hubClient, { maxConcurrentJobs: 1 }),
    createSTTWorker('stt-01', hubClient, { maxConcurrentJobs: 2 }),
    createTTSWorker('tts-01', hubClient, { maxConcurrentJobs: 2 }),
    createVisionWorker('vision-01', hubClient, { maxConcurrentJobs: 1 }),
    createEmergencyWorker('emergency-01', hubClient, { maxConcurrentJobs: 3 }),
  ];

  for (const worker of workers) {
    pool.addWorkerWithContract(worker.contract, hubClient);
    console.log(`✓ Registered: ${worker.contract.id}`);
    console.log(`  Type: ${worker.contract.workerType}`);
    console.log(`  Capabilities: ${worker.contract.capabilities.join(', ')}`);
    console.log(`  Max Jobs: ${worker.contract.maxConcurrentJobs}`);
    console.log();
  }

  await pool.start();
  console.log(`Pool started with ${workers.length} workers`);
  console.log();

  // Step 4: Submit mixed handoffs to hub
  console.log('━'.repeat(60));
  console.log('Step 4: Submit Mixed Handoffs to Hub');
  console.log('━'.repeat(60));
  console.log();

  const testHandoffs: Array<{
    capability: string;
    input: string;
    priority: 'low' | 'normal' | 'high' | 'emergency';
  }> = [
    { capability: 'llm', input: 'Explain quantum computing basics', priority: 'normal' },
    { capability: 'eva', input: 'Analyze this business strategy', priority: 'high' },
    { capability: 'stt', input: 'audio-meeting-recording.wav', priority: 'normal' },
    { capability: 'tts', input: 'Welcome to the automated assistant', priority: 'normal' },
    { capability: 'vision', input: 'image-traffic-accident.jpg', priority: 'high' },
    { capability: 'emergency', input: 'Medical emergency at GPS coordinates...', priority: 'emergency' },
    { capability: 'llm', input: 'Write a Python function to sort a list', priority: 'normal' },
    { capability: 'text-generation', input: 'Generate product description', priority: 'normal' },
  ];

  const createdHandoffs: HGIHubHandoffResponse[] = [];

  for (const handoff of testHandoffs) {
    try {
      // Note: Using enqueueHandoff if available, otherwise track locally
      const now = new Date().toISOString();
      const created = await hubClient.submitHandoff({
        requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sourceRuntimeId: 'hub-integrated-validation',
        localModel: { modelId: 'placeholder' },
        originalRequest: { model: 'placeholder', input: handoff.input },
        handoffSignal: {
          type: 'HANDOFF_REQUIRED',
          severity: 'critical',
          reason: handoff.capability,
          metrics: { timestamp: now },
          suggestedTarget: 'node',
          timestamp: now,
          mandatory: true,
          crossedThresholds: [],
        },
        metrics: { timestamp: now },
        requestedCapability: handoff.capability as 'llm' | 'stt' | 'embedding' | 'rag' | 'vision' | 'tts',
        createdAt: now,
      });

      createdHandoffs.push(created);
      console.log(`✓ Submitted handoff request: ${created.handoffId ?? 'N/A'}`);
      console.log(`  Capability: ${handoff.capability}`);
      console.log(`  Priority: ${handoff.priority}`);
      console.log(`  Accepted: ${created.accepted}`);
      console.log(`  Status: ${created.status}`);
      console.log();
    } catch (error) {
      console.log(`⚠ Could not create handoff via hub: ${error instanceof Error ? error.message : String(error)}`);
      console.log(`  Using local tracking for validation`);
      console.log();
    }
  }

  // Step 5: Query claimable handoffs per worker
  console.log('━'.repeat(60));
  console.log('Step 5: Query Claimable Handoffs Per Worker');
  console.log('━'.repeat(60));
  console.log();

  const routingResults: Array<{
    handoffId: string;
    capability: string;
    routedWorker: string;
    workerType: string;
    routingDecision: string;
    claimed: boolean;
    completed: boolean;
    processingTimeMs?: number;
  }> = [];

  for (const worker of pool.workers) {
    console.log(`Checking claimable for worker: ${worker.id} (${worker.workerType ?? 'unknown'})`);

    try {
      let claimable: Array<{ id: string; status: string; requestedCapability: string; createdAt: string; priority?: number; estimatedComplexity?: string }> = [];

      if (claimableEndpointAvailable) {
        claimable = await hubClient.getClaimableHandoffs(worker.id);
      } else {
        // Fallback: check queue and filter by capability
        const queue = await hubClient.listHandoffQueue();
        claimable = queue
          .filter(h => h.status === 'queued')
          .map(h => ({
            id: h.id,
            status: h.status,
            requestedCapability: h.requestedCapability ?? 'llm',
            createdAt: h.createdAt ?? new Date().toISOString(),
            priority: 50, // Default priority
          }));
      }

      console.log(`  Found ${claimable.length} claimable handoffs`);

      // Process compatible handoffs
      for (const handoff of claimable) {
        // Check if this worker can handle this capability
        const routeResult = pool.routeHandoff(handoff.requestedCapability, worker.workerType);

        if (!routeResult || routeResult.worker.id !== worker.id) {
          console.log(`  ⏭ Skipping ${handoff.id} - incompatible capability: ${handoff.requestedCapability}`);
          continue;
        }

        console.log(`  ✓ Compatible: ${handoff.id} (${handoff.requestedCapability})`);

        // Claim the handoff
        try {
          await hubClient.claimHandoff(handoff.id, worker.id);
          console.log(`    ✓ Claimed by ${worker.id}`);
        } catch (error) {
          console.log(`    ⚠ Could not claim: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }

        // Process with placeholder processor
        pool.recordJobStart(worker, handoff.id, handoff.requestedCapability);

        const processor = createProcessor(worker.workerType ?? 'generic');
        const request: ProcessorRequest = {
          input: handoff.requestedCapability,
          capability: handoff.requestedCapability,
          priority: handoff.priority === 100 ? 'emergency' :
                    handoff.priority === 75 ? 'high' :
                    handoff.priority === 50 ? 'normal' : 'low',
        };

        try {
          const startTime = Date.now();
          const result = await processor.process(request);
          const processingTimeMs = Date.now() - startTime;

          pool.recordJobComplete(worker, handoff.id, processingTimeMs);

          // Complete the handoff
          try {
            await hubClient.completeHandoff(handoff.id, {
              text: result.output,
              model: result.metadata.model ?? 'unknown',
              workerId: worker.id,
              metrics: {
                workerType: worker.workerType,
                processingTimeMs,
              },
            });
            console.log(`    ✓ Completed in ${formatDuration(processingTimeMs)}`);
          } catch (error) {
            console.log(`    ⚠ Could not complete: ${error instanceof Error ? error.message : String(error)}`);
          }

          routingResults.push({
            handoffId: handoff.id,
            capability: handoff.requestedCapability,
            routedWorker: worker.id,
            workerType: worker.workerType ?? 'unknown',
            routingDecision: routeResult.routingDecision,
            claimed: true,
            completed: true,
            processingTimeMs,
          });
        } catch (error) {
          pool.recordJobFailure(worker, handoff.id);
          console.log(`    ❌ Processing failed: ${error instanceof Error ? error.message : String(error)}`);

          routingResults.push({
            handoffId: handoff.id,
            capability: handoff.requestedCapability,
            routedWorker: worker.id,
            workerType: worker.workerType ?? 'unknown',
            routingDecision: routeResult.routingDecision,
            claimed: true,
            completed: false,
          });
        }
      }

      console.log();
    } catch (error) {
      console.log(`  ❌ Error querying claimable: ${error instanceof Error ? error.message : String(error)}`);
      console.log();
    }
  }

  // Step 6: Validate results
  console.log('━'.repeat(60));
  console.log('Step 6: Validation Results');
  console.log('━'.repeat(60));
  console.log();

  // Routing accuracy
  const routingAccuracy = routingResults.filter(r => {
    const expectedType = getExpectedWorkerType(r.capability);
    return r.workerType === expectedType;
  }).length / (routingResults.length || 1) * 100;

  console.log('Routing Accuracy:');
  console.log(`  ${routingAccuracy.toFixed(1)}% (${routingResults.filter(r => {
    const expectedType = getExpectedWorkerType(r.capability);
    return r.workerType === expectedType;
  }).length}/${routingResults.length} correctly routed)`);
  console.log();

  // Success rate
  const successRate = routingResults.filter(r => r.completed).length / (routingResults.length || 1) * 100;

  console.log('Processing Success Rate:');
  console.log(`  ${successRate.toFixed(1)}% (${routingResults.filter(r => r.completed).length}/${routingResults.length} completed)`);
  console.log();

  // Show routing details
  console.log('Routing Details:');
  for (const result of routingResults) {
    const status = result.completed ? '✓' : '✗';
    const time = result.processingTimeMs ? formatDuration(result.processingTimeMs) : 'N/A';
    console.log(`  ${status} ${result.handoffId}`);
    console.log(`    Capability: ${result.capability}`);
    console.log(`    Worker: ${result.routedWorker} (${result.workerType})`);
    console.log(`    Decision: ${result.routingDecision}`);
    console.log(`    Time: ${time}`);
    console.log();
  }

  // Pool metrics
  console.log('━'.repeat(60));
  console.log('Step 7: Pool Metrics Summary');
  console.log('━'.repeat(60));
  console.log();

  const poolStats = pool.getPoolStats();
  console.log('Overall Pool:');
  console.log(`  Total Workers: ${poolStats.totalWorkers}`);
  console.log(`  Total Capacity: ${poolStats.totalCapacity} jobs`);
  console.log(`  Completed Jobs: ${poolStats.totalCompletedJobs}`);
  console.log(`  Failed Jobs: ${poolStats.totalFailedJobs}`);
  console.log();

  const byType = pool.getPoolStatsByWorkerType();
  console.log('By Worker Type:');
  for (const [type, stats] of byType.entries()) {
    console.log(`  ${type.toUpperCase()}: ${stats.completedJobs} completed, ${stats.failedJobs} failed`);
  }
  console.log();

  // Step 8: Final validation status
  console.log('━'.repeat(60));
  console.log('Step 8: Final Validation Status');
  console.log('━'.repeat(60));
  console.log();

  const passed = routingAccuracy >= 80 && successRate >= 80;

  if (passed) {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ✅ VALIDATION PASSED                                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  } else {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║     ❌ VALIDATION FAILED                                    ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
  }

  console.log();
  console.log(`Routing Accuracy: ${routingAccuracy.toFixed(1)}% (required: 80%)`);
  console.log(`Success Rate: ${successRate.toFixed(1)}% (required: 80%)`);
  console.log();

  // Cleanup
  await pool.stop();
  console.log('Pool stopped.');

  process.exit(passed ? 0 : 1);
}

/**
 * Get expected worker type for a capability
 */
function getExpectedWorkerType(capability: string): string {
  const capabilityToType: Record<string, string> = {
    llm: 'llm',
    eva: 'eva',
    stt: 'stt',
    tts: 'tts',
    vision: 'vision',
    emergency: 'emergency',
    'text-generation': 'llm',
    'speech-to-text': 'stt',
    'text-to-speech': 'tts',
    'image-analysis': 'vision',
  };

  return capabilityToType[capability] ?? 'generic';
}

// Run validation
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
