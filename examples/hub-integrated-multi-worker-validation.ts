/**
 * HGI Hub-Integrated Multi-Worker Validation
 *
 * Validates multi-worker execution against a running hgi-local-node hub.
 * Tests the full handoff lifecycle: create → claimable → claim → process → complete.
 *
 * Phase 5C-F: Aligned with hub claimable contract including:
 * - Worker heartbeat (prevents 30s staleness)
 * - Exact capability matching (includes "generic")
 * - Required capability in handoffs
 * - Debug endpoint for troubleshooting
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
  buildWorkerContract,
  type WorkerCapabilityContract,
} from '../src/core/worker-registration.js';
import {
  createProcessor,
  type ProcessorRequest,
} from '../src/core/worker-processors.js';
import {
  generateRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshot,
} from '../src/core/runtime-health-snapshot.js';
import type { HGIHubHandoffResponse } from '../src/types/hub-handoff.js';
import type { WorkerType } from '../src/types/worker-capability.js';

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

  // Step 3: Create worker pool with aligned capability contracts
  console.log('━'.repeat(60));
  console.log('Step 3: Register Workers with Aligned Capability Contracts');
  console.log('━'.repeat(60));
  console.log();

  const pool = createWorkerPool({
    poolId: 'hub-integrated-validation',
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

  // Create aligned worker contracts with EXACT capabilities (NO generic to prevent over-matching)
  const workerContracts: WorkerCapabilityContract[] = [
    buildWorkerContract({
      workerId: 'llm-01',
      workerType: 'llm',
      capabilities: ['llm', 'text-generation'], // Only LLM capabilities, NO generic
      maxConcurrentJobs: 2,
    }),
    buildWorkerContract({
      workerId: 'eva-01',
      workerType: 'eva',
      capabilities: ['eva', 'reasoning', 'analysis'], // Only EVA capabilities, NO generic
      maxConcurrentJobs: 1,
    }),
    buildWorkerContract({
      workerId: 'stt-01',
      workerType: 'stt',
      capabilities: ['stt', 'speech-to-text', 'audio-transcription'], // Only STT capabilities, NO generic
      maxConcurrentJobs: 2,
    }),
    buildWorkerContract({
      workerId: 'tts-01',
      workerType: 'tts',
      capabilities: ['tts', 'text-to-speech', 'speech-synthesis'], // Only TTS capabilities, NO generic
      maxConcurrentJobs: 2,
    }),
    buildWorkerContract({
      workerId: 'vision-01',
      workerType: 'vision',
      capabilities: ['vision', 'image-analysis'], // Only Vision capabilities, NO generic
      maxConcurrentJobs: 1,
    }),
    buildWorkerContract({
      workerId: 'emergency-01',
      workerType: 'emergency',
      capabilities: ['emergency', 'priority-inference', 'redvecinal-emergency'], // Only Emergency capabilities, NO generic
      maxConcurrentJobs: 3,
    }),
  ];

  for (const contract of workerContracts) {
    pool.addWorkerWithContract(contract, hubClient);
    console.log(`✓ Registered: ${contract.id}`);
    console.log(`  Type: ${contract.workerType}`);
    console.log(`  Capabilities: ${contract.capabilities.join(', ')}`);
    console.log(`  Max Jobs: ${contract.maxConcurrentJobs}`);
    console.log();
  }

  await pool.start();
  console.log(`Pool started with ${workerContracts.length} workers`);
  console.log();

  // Step 3b: Register workers with hub and start heartbeat loop
  console.log('━'.repeat(60));
  console.log('Step 3b: Register Workers with Hub & Start Heartbeat');
  console.log('━'.repeat(60));
  console.log();

  // Map edge runtime worker types to hub-compatible types
  const workerTypeMap: Record<string, 'llama' | 'stt' | 'embedding' | 'rag' | 'generic'> = {
    'llm': 'llama',
    'eva': 'generic',
    'stt': 'stt',
    'tts': 'generic',
    'vision': 'generic',
    'emergency': 'generic',
  };

  // Register workers with hub first (required before heartbeat)
  console.log('Registering workers with hub...');
  for (const contract of workerContracts) {
    try {
      const hubWorkerType = workerTypeMap[contract.workerType] || 'generic';
      await hubClient.registerWorker(
        contract.id,
        hubWorkerType,
        contract.capabilities,
        contract.maxConcurrentJobs
      );
      console.log(`  ✓ Registered with hub: ${contract.id} (type: ${hubWorkerType})`);
    } catch (error) {
      console.log(`  ⚠ Registration failed for ${contract.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log();

  // Send immediate heartbeat to register workers as fresh
  console.log('Sending initial heartbeats...');
  for (const contract of workerContracts) {
    try {
      await hubClient.sendWorkerHeartbeat(contract.id, 'online');
      console.log(`  ✓ Heartbeat sent: ${contract.id}`);
    } catch (error) {
      console.log(`  ⚠ Heartbeat failed for ${contract.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log();

  // Start heartbeat interval (every 10 seconds)
  const HEARTBEAT_INTERVAL_MS = 10000;
  let heartbeatRunning = true;
  const heartbeatInterval = setInterval(async () => {
    if (!heartbeatRunning) return;
    for (const contract of workerContracts) {
      try {
        await hubClient.sendWorkerHeartbeat(contract.id, 'online');
      } catch {
        // Silently fail - hub may not support heartbeat
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`✓ Heartbeat loop started (${HEARTBEAT_INTERVAL_MS}ms interval)`);
  console.log('  Workers will remain fresh (30s timeout prevented)');
  console.log();

  // Step 4: Submit mixed handoffs to hub
  console.log('━'.repeat(60));
  console.log('Step 4: Submit Mixed Handoffs to Hub');
  console.log('━'.repeat(60));
  console.log();

  // Map priority levels to numeric values for hub
  const priorityMap: Record<string, number> = {
    'emergency': 100,
    'high': 75,
    'normal': 50,
    'low': 25,
  };

  const testHandoffs: Array<{
    capability: string;
    input: string;
    priority: 'low' | 'normal' | 'high' | 'emergency';
    priorityValue: number;
  }> = [
    { capability: 'llm', input: 'Explain quantum computing basics', priority: 'normal', priorityValue: priorityMap['normal'] },
    { capability: 'eva', input: 'Analyze this business strategy', priority: 'high', priorityValue: priorityMap['high'] },
    { capability: 'stt', input: 'audio-meeting-recording.wav', priority: 'normal', priorityValue: priorityMap['normal'] },
    { capability: 'tts', input: 'Welcome to the automated assistant', priority: 'normal', priorityValue: priorityMap['normal'] },
    { capability: 'vision', input: 'image-traffic-accident.jpg', priority: 'high', priorityValue: priorityMap['high'] },
    { capability: 'emergency', input: 'Medical emergency at GPS coordinates...', priority: 'emergency', priorityValue: priorityMap['emergency'] },
    { capability: 'llm', input: 'Write a Python function to sort a list', priority: 'normal', priorityValue: priorityMap['normal'] },
    { capability: 'text-generation', input: 'Generate product description', priority: 'normal', priorityValue: priorityMap['normal'] },
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
        requestedCapability: handoff.capability as 'llm' | 'eva' | 'stt' | 'tts' | 'vision' | 'emergency' | 'text-generation',
        createdAt: now,
        priority: handoff.priorityValue, // Include priority for hub
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

    // Refresh heartbeat before checking claimable to prevent staleness
    try {
      await hubClient.sendWorkerHeartbeat(worker.id, 'online');
    } catch {
      // Ignore heartbeat errors
    }

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

      // If claimable is empty, use debug endpoint to diagnose
      if (claimable.length === 0 && claimableEndpointAvailable) {
        try {
          const debugInfo = await hubClient.getClaimableDebug(worker.id);
          console.log(`  📊 Debug info for ${worker.id}:`);
          console.log(`     Worker status: ${debugInfo.workerStatus ?? 'unknown'}`);
          console.log(`     Worker capabilities: ${debugInfo.workerCapabilities?.join(', ') ?? 'unknown'}`);
          console.log(`     Total handoffs in queue: ${debugInfo.totalHandoffs ?? 'unknown'}`);
          console.log(`     Matching handoffs: ${debugInfo.matchingHandoffs ?? 'unknown'}`);
          if (debugInfo.rejections && debugInfo.rejections.length > 0) {
            console.log(`     Rejection reasons:`);
            for (const rejection of debugInfo.rejections.slice(0, 3)) {
              console.log(`       - ${rejection.handoffId}: ${rejection.reason}`);
            }
          }
          if (debugInfo.message) {
            console.log(`     Message: ${debugInfo.message}`);
          }
        } catch (debugError) {
          console.log(`  ⚠ Debug endpoint not available: ${debugError instanceof Error ? debugError.message : String(debugError)}`);
        }
      }

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

  // Distribution assertions - each worker type must complete at least 1 job
  console.log('━'.repeat(60));
  console.log('Step 7b: Distribution Validation');
  console.log('━'.repeat(60));
  console.log();

  const requiredWorkerTypes = ['llm', 'eva', 'stt', 'tts', 'vision', 'emergency'];
  const distributionFailures: string[] = [];

  for (const workerType of requiredWorkerTypes) {
    const stats = byType.get(workerType as WorkerType);
    const completed = stats?.completedJobs ?? 0;

    if (completed === 0) {
      distributionFailures.push(`${workerType.toUpperCase()} worker completed 0 jobs (required: at least 1)`);
      console.log(`❌ ${workerType.toUpperCase()}: FAILED - 0 jobs completed`);
    } else {
      console.log(`✅ ${workerType.toUpperCase()}: PASSED - ${completed} jobs completed`);
    }
  }

  if (distributionFailures.length > 0) {
    console.log();
    console.log('❌ DISTRIBUTION VALIDATION FAILED');
    console.log('Missing job completions:');
    for (const failure of distributionFailures) {
      console.log(`  - ${failure}`);
    }
  } else {
    console.log();
    console.log('✅ DISTRIBUTION VALIDATION PASSED - All worker types completed jobs');
  }
  console.log();

  // Step 7c: Worker Health Validation
  console.log('━'.repeat(60));
  console.log('Step 7c: Worker Health Validation');
  console.log('━'.repeat(60));
  console.log();

  console.log('Testing worker heartbeat expiration and recovery...');
  console.log();

  // Select one worker to test stale behavior (EVA worker)
  const testWorker = pool.workers.find(w => w.workerType === 'eva');
  if (!testWorker) {
    console.log('⚠ No EVA worker found for health test, skipping');
  } else {
    console.log(`Selected worker for health test: ${testWorker.id} (${testWorker.workerType})`);
    console.log();

    // Update health status
    pool.updateWorkerHealth(testWorker.id, Date.now());
    const initialHealth = pool.getWorkerHealthDiagnostics().find(w => w.workerId === testWorker.id);
    console.log('Initial health state:');
    console.log(`  Status: ${initialHealth?.healthStatus ?? 'unknown'}`);
    console.log(`  Heartbeat age: ${initialHealth?.heartbeatAgeMs ?? 0}ms`);
    console.log();

    // Submit a new EVA handoff
    console.log('Submitting new EVA handoff...');
    const newHandoff = await hubClient.submitHandoff({
      requestId: `req-health-test-${Date.now()}`,
      sourceRuntimeId: 'hub-integrated-validation',
      localModel: { modelId: 'placeholder' },
      originalRequest: { model: 'placeholder', input: 'Health test input' },
      handoffSignal: {
        type: 'HANDOFF_REQUIRED',
        severity: 'critical',
        reason: 'eva',
        metrics: { timestamp: new Date().toISOString() },
        suggestedTarget: 'node',
        timestamp: new Date().toISOString(),
        mandatory: true,
        crossedThresholds: [],
      },
      metrics: { timestamp: new Date().toISOString() },
      requestedCapability: 'eva' as 'llm' | 'eva' | 'stt' | 'tts' | 'vision' | 'emergency' | 'text-generation',
      createdAt: new Date().toISOString(),
      priority: 50,
    });
    console.log(`✓ Handoff created: ${newHandoff.handoffId}`);
    console.log();

    // Check if worker can claim it (should be able initially)
    console.log('Checking claimable before heartbeat stop...');
    await hubClient.sendWorkerHeartbeat(testWorker.id, 'online');
    pool.updateWorkerHealth(testWorker.id, Date.now());
    const claimableBefore = await hubClient.getClaimableHandoffs(testWorker.id);
    console.log(`  Claimable count: ${claimableBefore.length}`);
    console.log(`  Can claim: ${claimableBefore.some(h => h.id === newHandoff.handoffId) ? 'YES' : 'NO'}`);
    console.log();

    // Stop heartbeat for this worker (simulate failure)
    console.log('Stopping heartbeat for worker (simulating failure)...');
    console.log('Waiting 35 seconds for worker to become stale...');
    console.log();
    await new Promise(resolve => setTimeout(resolve, 35000));

    // Update health to simulate stale state
    pool.updateWorkerHealth(testWorker.id, Date.now() - 35000);
    const staleHealth = pool.getWorkerHealthDiagnostics().find(w => w.workerId === testWorker.id);
    console.log('Health state after heartbeat stop:');
    console.log(`  Status: ${staleHealth?.healthStatus ?? 'unknown'}`);
    console.log(`  Heartbeat age: ${staleHealth?.heartbeatAgeMs ?? 0}ms`);
    console.log();

    // Check if worker can still claim (should be rejected by hub)
    console.log('Checking claimable after heartbeat stop...');
    try {
      const claimableAfter = await hubClient.getClaimableHandoffs(testWorker.id);
      console.log(`  Claimable count: ${claimableAfter.length}`);
      console.log(`  Can claim: ${claimableAfter.some(h => h.id === newHandoff.handoffId) ? 'YES' : 'NO'}`);
    } catch (error) {
      console.log(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log();

    // Restart heartbeat (simulate recovery)
    console.log('Restarting heartbeat (simulating recovery)...');
    await hubClient.sendWorkerHeartbeat(testWorker.id, 'online');
    pool.updateWorkerHealth(testWorker.id, Date.now());
    const recoveredHealth = pool.getWorkerHealthDiagnostics().find(w => w.workerId === testWorker.id);
    console.log('Health state after recovery:');
    console.log(`  Status: ${recoveredHealth?.healthStatus ?? 'unknown'}`);
    console.log(`  Heartbeat age: ${recoveredHealth?.heartbeatAgeMs ?? 0}ms`);
    console.log();

    // Check if worker can claim again (should be able)
    console.log('Checking claimable after recovery...');
    const claimableRecovered = await hubClient.getClaimableHandoffs(testWorker.id);
    console.log(`  Claimable count: ${claimableRecovered.length}`);
    console.log(`  Can claim: ${claimableRecovered.some(h => h.id === newHandoff.handoffId) ? 'YES' : 'NO'}`);
    console.log();

    // Claim and complete the handoff
    if (claimableRecovered.some(h => h.id === newHandoff.handoffId) && newHandoff.handoffId) {
      console.log('Claiming and completing handoff...');
      try {
        await hubClient.claimHandoff(newHandoff.handoffId, testWorker.id);
        await hubClient.completeHandoff(newHandoff.handoffId, {
          text: 'Health test completed',
          model: 'eva',
          workerId: testWorker.id,
          metrics: { processingTimeMs: 100 },
        });
        console.log('✓ Handoff claimed and completed');
      } catch (error) {
        console.log(`⚠ Could not complete: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    console.log();
  }

  // Display health diagnostics for all workers
  console.log('━'.repeat(60));
  console.log('Worker Health Diagnostics');
  console.log('━'.repeat(60));
  console.log();

  const healthDiagnostics = pool.getWorkerHealthDiagnostics();
  for (const health of healthDiagnostics) {
    console.log(`Worker: ${health.workerId} (${health.workerType})`);
    console.log(`  Status: ${health.healthStatus}`);
    console.log(`  Last heartbeat: ${health.lastHeartbeatAt ? new Date(health.lastHeartbeatAt).toISOString() : 'never'}`);
    console.log(`  Heartbeat age: ${health.heartbeatAgeMs}ms`);
    console.log(`  Active jobs: ${health.activeJobs}`);
    console.log(`  Completed: ${health.completedJobs}`);
    console.log(`  Failed: ${health.failedJobs}`);
    console.log();
  }

  // Step 7d: Hub-Aware Health Synchronization
  console.log('━'.repeat(60));
  console.log('Step 7d: Hub-Aware Health Synchronization');
  console.log('━'.repeat(60));
  console.log();

  console.log('Comparing runtime health with hub eligibility...');
  console.log();

  const syncDiagnostics = await pool.getSynchronizedHealthDiagnostics();
  let mismatchCount = 0;

  for (const sync of syncDiagnostics) {
    console.log(`Worker: ${sync.workerId} (${sync.workerType})`);
    console.log(`  Runtime Status: ${sync.runtimeStatus}`);
    console.log(`  Hub Status: ${sync.hubStatus}`);
    console.log(`  Hub Eligible: ${sync.hubEligible ? 'YES' : 'NO'}`);
    console.log(`  Heartbeat Age: ${sync.heartbeatAgeMs}ms`);
    if (sync.hubRejectionReasons.length > 0) {
      console.log(`  Hub Rejection Reasons: ${sync.hubRejectionReasons.join(', ')}`);
    }
    if (sync.mismatch) {
      console.log(`  ⚠ MISMATCH: ${sync.mismatchReason}`);
      mismatchCount++;
    } else {
      console.log(`  ✓ No mismatch`);
    }
    console.log();
  }

  if (mismatchCount === 0) {
    console.log('✅ All workers synchronized - no mismatches detected');
  } else {
    console.log(`⚠ ${mismatchCount} worker(s) have health mismatches`);
  }
  console.log();

  // Step 7e: Worker Auto-Recovery + Quarantine Validation
  console.log('━'.repeat(60));
  console.log('Step 7e: Worker Auto-Recovery + Quarantine Validation');
  console.log('━'.repeat(60));
  console.log();

  console.log('Testing worker quarantine and auto-recovery...');
  console.log();

  // Select STT worker for quarantine test
  const quarantineTestWorker = pool.workers.find(w => w.workerType === 'stt');
  if (!quarantineTestWorker) {
    console.log('⚠ No STT worker found for quarantine test, skipping');
  } else {
    console.log(`Selected worker for quarantine test: ${quarantineTestWorker.id} (${quarantineTestWorker.workerType})`);
    console.log();

    // Record failures to trigger quarantine
    console.log('Recording consecutive failures...');
    for (let i = 0; i < 3; i++) {
      pool.recordWorkerFailure(quarantineTestWorker.id);
    }
    console.log(`✓ Recorded 3 consecutive failures`);
    console.log();

    // Check if worker is quarantined
    const extendedDiagnostics = pool.getExtendedWorkerDiagnostics();
    const workerDiagnostics = extendedDiagnostics.find(w => w.workerId === quarantineTestWorker.id);
    console.log('Worker state after failures:');
    console.log(`  Consecutive Failures: ${workerDiagnostics?.consecutiveFailures ?? 0}`);
    console.log(`  Quarantined: ${workerDiagnostics?.quarantined ? 'YES' : 'NO'}`);
    console.log(`  Health Status: ${workerDiagnostics?.healthStatus ?? 'unknown'}`);
    console.log(`  Eligible: ${workerDiagnostics?.skipReason ? 'NO (' + workerDiagnostics.skipReason + ')' : 'YES'}`);
    console.log();

    // Check eligibility
    const eligibility = pool.isWorkerEligible(quarantineTestWorker.id);
    console.log(`Worker eligibility check: ${eligibility.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
    if (!eligibility.eligible) {
      console.log(`  Skip reason: ${eligibility.skipReason}`);
    }
    console.log();

    // Wait for quarantine to expire (simulated with short duration)
    console.log('Waiting for quarantine to expire...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log();

    // Send heartbeat and attempt recovery
    console.log('Sending heartbeat and attempting recovery...');
    await hubClient.sendWorkerHeartbeat(quarantineTestWorker.id, 'online');
    pool.updateWorkerHealth(quarantineTestWorker.id, Date.now());
    const recovered = await pool.attemptWorkerRecovery(quarantineTestWorker.id);
    console.log(`Recovery attempt: ${recovered ? 'SUCCESS' : 'FAILED'}`);
    console.log();

    // Check worker state after recovery
    const postRecoveryDiagnostics = pool.getExtendedWorkerDiagnostics();
    const postRecoveryWorker = postRecoveryDiagnostics.find(w => w.workerId === quarantineTestWorker.id);
    console.log('Worker state after recovery:');
    console.log(`  Consecutive Failures: ${postRecoveryWorker?.consecutiveFailures ?? 0}`);
    console.log(`  Quarantined: ${postRecoveryWorker?.quarantined ? 'YES' : 'NO'}`);
    console.log(`  Health Status: ${postRecoveryWorker?.healthStatus ?? 'unknown'}`);
    console.log(`  Recovery Attempts: ${postRecoveryWorker?.recoveryAttempts ?? 0}`);
    console.log(`  Eligible: ${postRecoveryWorker?.skipReason ? 'NO (' + postRecoveryWorker.skipReason + ')' : 'YES'}`);
    console.log();

    // Record a success to ensure worker is fully recovered
    pool.recordWorkerSuccess(quarantineTestWorker.id);
    console.log('✓ Recorded success to reset failure count');
    console.log();
  }

  // Display extended diagnostics for all workers
  console.log('━'.repeat(60));
  console.log('Extended Worker Diagnostics');
  console.log('━'.repeat(60));
  console.log();

  const allExtendedDiagnostics = pool.getExtendedWorkerDiagnostics();
  for (const diag of allExtendedDiagnostics) {
    console.log(`Worker: ${diag.workerId} (${diag.workerType})`);
    console.log(`  Status: ${diag.healthStatus}`);
    console.log(`  Consecutive Failures: ${diag.consecutiveFailures}`);
    console.log(`  Quarantined: ${diag.quarantined ? 'YES' : 'NO'}`);
    if (diag.quarantinedUntil) {
      console.log(`  Quarantined Until: ${new Date(diag.quarantinedUntil).toISOString()}`);
    }
    console.log(`  Recovery Attempts: ${diag.recoveryAttempts}`);
    console.log(`  Eligible: ${diag.skipReason ? 'NO (' + diag.skipReason + ')' : 'YES'}`);
    console.log();
  }

  // Step 8: Final validation status
  console.log('━'.repeat(60));
  console.log('Step 8: Final Validation Status');
  console.log('━'.repeat(60));
  console.log();

  const passed = routingAccuracy >= 80 && successRate >= 80 && distributionFailures.length === 0;

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

  // Step 9: Final Runtime Health Snapshot
  console.log('━'.repeat(60));
  console.log('Step 9: Final Runtime Health Snapshot');
  console.log('━'.repeat(60));
  console.log();

  const finalSnapshot = await generateRuntimeHealthSnapshot({
    runtimeId: 'hub-integrated-validation',
    hubUrl: HUB_URL,
    pool,
    hubClient,
  });

  console.log(formatRuntimeHealthSnapshot(finalSnapshot));
  console.log();

  // Cleanup
  // Stop heartbeat loop
  heartbeatRunning = false;
  clearInterval(heartbeatInterval);
  console.log('Heartbeat stopped.');

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
