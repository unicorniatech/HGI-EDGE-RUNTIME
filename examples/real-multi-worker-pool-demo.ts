/**
 * HGI Real Multi-Worker Pool Execution Demo
 *
 * Demonstrates capability-aware routing and execution across multiple
 * worker types in a coordinated pool:
 * - LLM workers for text generation
 * - EVA workers for reasoning
 * - STT workers for speech-to-text (placeholder)
 * - TTS workers for text-to-speech (placeholder)
 * - Vision workers for image analysis (placeholder)
 * - Emergency workers for priority inference
 *
 * This demo shows:
 * - Worker registration with capability contracts
 * - Capability-aware handoff routing
 * - Load balancing across worker types
 * - Metrics collection by type and capability
 * - Placeholder processors simulating real work
 *
 * Environment variables:
 * - HGI_LOCAL_HUB_URL: Hub URL (default: http://localhost:4010)
 *
 * @module examples/real-multi-worker-pool-demo
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
  formatDiagnostics,
  generateCoordinationDiagnostics,
} from '../src/core/worker-registration.js';
import {
  createProcessor,
  type ProcessorRequest,
} from '../src/core/worker-processors.js';
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
 * Main demo
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI Real Multi-Worker Pool Execution Demo              ║');
  console.log('║     Capability-Aware Routing & Execution                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Hub URL: ${HUB_URL}`);
  console.log('Mode: Local-only coordination with placeholder processors');
  console.log();

  // Create worker pool
  const pool = createWorkerPool({
    poolId: 'multi-worker-demo',
    hubUrl: HUB_URL,
    pollIntervalMs: 1000,
    enableLoadBalancing: true,
  });

  // Create hub client for worker registration
  const hubClient = createHGIHubClient({
    baseUrl: HUB_URL,
    timeoutMs: 30000,
    runtimeId: 'multi-worker-demo',
  });

  // Check hub connection
  console.log('Checking hub connection...');
  const reachable = await hubClient.isReachable();
  if (!reachable) {
    console.log('⚠ Hub not reachable - running in standalone mode');
    console.log();
  } else {
    console.log('✓ Hub connected');
    console.log();
  }

  // Register workers with capability contracts
  console.log('Registering workers with capability contracts...');
  console.log();

  // 1. LLM Workers (2 instances for load balancing demo)
  console.log('1. Registering LLM Workers (2 instances)');
  const llmWorker1 = createLLMWorker('llama-main-01', hubClient, {
    modelName: 'tinyllama-1.1b',
    maxConcurrentJobs: 2,
  });
  const llmWorker2 = createLLMWorker('llama-main-02', hubClient, {
    modelName: 'tinyllama-1.1b',
    maxConcurrentJobs: 2,
  });
  pool.addWorkerWithContract(llmWorker1.contract, hubClient);
  pool.addWorkerWithContract(llmWorker2.contract, hubClient);
  console.log(`   ✓ ${llmWorker1.contract.id}`);
  console.log(`   ✓ ${llmWorker2.contract.id}`);
  console.log();

  // 2. EVA Worker (Reasoning)
  console.log('2. Registering EVA Worker (Reasoning)');
  const evaWorker = createEVAWorker('eva-reasoner-01', hubClient, {
    modelName: 'eva-expert-v1',
    maxConcurrentJobs: 1,
  });
  pool.addWorkerWithContract(evaWorker.contract, hubClient);
  console.log(`   ✓ ${evaWorker.contract.id}`);
  console.log();

  // 3. STT Worker (Speech-to-Text placeholder)
  console.log('3. Registering STT Worker (Speech-to-Text)');
  const sttWorker = createSTTWorker('stt-transcriber-01', hubClient, {
    modelName: 'whisper-base',
    maxConcurrentJobs: 3,
  });
  pool.addWorkerWithContract(sttWorker.contract, hubClient);
  console.log(`   ✓ ${sttWorker.contract.id}`);
  console.log();

  // 4. TTS Worker (Text-to-Speech placeholder)
  console.log('4. Registering TTS Worker (Text-to-Speech)');
  const ttsWorker = createTTSWorker('tts-synthesizer-01', hubClient, {
    modelName: 'coqui-tts',
    maxConcurrentJobs: 2,
  });
  pool.addWorkerWithContract(ttsWorker.contract, hubClient);
  console.log(`   ✓ ${ttsWorker.contract.id}`);
  console.log();

  // 5. Vision Worker (Image Analysis placeholder)
  console.log('5. Registering Vision Worker (Image Analysis)');
  const visionWorker = createVisionWorker('vision-analyzer-01', hubClient, {
    modelName: 'clip-vision',
    maxConcurrentJobs: 1,
  });
  pool.addWorkerWithContract(visionWorker.contract, hubClient);
  console.log(`   ✓ ${visionWorker.contract.id}`);
  console.log();

  // 6. Emergency Worker (RedVecinal Priority)
  console.log('6. Registering Emergency Worker (Priority Inference)');
  const emergencyWorker = createEmergencyWorker('emergency-priority-01', hubClient, {
    modelName: 'emergency-v1',
    maxConcurrentJobs: 3,
  });
  pool.addWorkerWithContract(emergencyWorker.contract, hubClient);
  console.log(`   ✓ ${emergencyWorker.contract.id}`);
  console.log();

  // Show initial coordination diagnostics
  console.log('━'.repeat(60));
  console.log('Initial Worker Pool Status');
  console.log('━'.repeat(60));
  console.log();

  const contracts = [
    llmWorker1.contract,
    llmWorker2.contract,
    evaWorker.contract,
    sttWorker.contract,
    ttsWorker.contract,
    visionWorker.contract,
    emergencyWorker.contract,
  ];

  const diagnostics = generateCoordinationDiagnostics(contracts);
  console.log(formatDiagnostics(diagnostics));
  console.log();

  // Start the pool
  await pool.start();
  console.log('Pool started. Ready for handoff routing.');
  console.log();

  // Simulate handoff routing scenarios
  console.log('━'.repeat(60));
  console.log('Simulating Capability-Aware Handoff Routing');
  console.log('━'.repeat(60));
  console.log();

  // Define test handoffs with different capability requirements
  const testHandoffs: Array<{
    id: string;
    capability: string;
    preferredType?: WorkerType;
    input: string;
    priority?: 'low' | 'normal' | 'high' | 'emergency';
  }> = [
    { id: 'handoff-001', capability: 'llm', input: 'Explain quantum computing', priority: 'normal' },
    { id: 'handoff-002', capability: 'eva', input: 'Analyze this business scenario', priority: 'high' },
    { id: 'handoff-003', capability: 'stt', input: 'audio-file-meeting.wav', priority: 'normal' },
    { id: 'handoff-004', capability: 'tts', input: 'Welcome to the automated system', priority: 'normal' },
    { id: 'handoff-005', capability: 'vision', input: 'image-accident-scene.jpg', priority: 'high' },
    { id: 'handoff-006', capability: 'emergency', input: 'Medical emergency at coordinates...', priority: 'emergency' },
    { id: 'handoff-007', capability: 'llm', input: 'Write a poem about AI', priority: 'low' },
    { id: 'handoff-008', capability: 'text-generation', input: 'Generate code for sorting', priority: 'normal' },
  ];

  // Process each handoff
  for (const handoff of testHandoffs) {
    console.log(`\nProcessing: ${handoff.id}`);
    console.log(`  Required Capability: ${handoff.capability}`);
    console.log(`  Preferred Type: ${handoff.preferredType ?? 'any'}`);
    console.log(`  Priority: ${handoff.priority ?? 'normal'}`);

    // Route to best worker
    const routeResult = pool.routeHandoff(handoff.capability, handoff.preferredType);

    if (!routeResult) {
      console.log(`  ❌ No eligible worker found for capability: ${handoff.capability}`);
      continue;
    }

    const { worker, routingDecision } = routeResult;

    console.log(`  ✓ Routed to: ${worker.id} (${worker.workerType ?? 'unknown'})`);
    console.log(`  Routing Decision: ${routingDecision}`);

    // Start job
    pool.recordJobStart(worker, handoff.id, handoff.capability);

    // Create processor and process
    const processor = createProcessor(worker.workerType ?? 'generic');
    const request: ProcessorRequest = {
      input: handoff.input,
      capability: handoff.capability,
      priority: handoff.priority,
    };

    try {
      const result = await processor.process(request);

      // Complete job
      pool.recordJobComplete(worker, handoff.id, result.processingTimeMs);

      console.log(`  ✓ Completed in ${formatDuration(result.processingTimeMs)}`);
      console.log(`  Output: ${result.output.substring(0, 100)}...`);
    } catch (error) {
      pool.recordJobFailure(worker, handoff.id);
      console.log(`  ❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Show final pool statistics
  console.log('\n' + '━'.repeat(60));
  console.log('Final Pool Statistics by Worker Type');
  console.log('━'.repeat(60));
  console.log();

  const statsByType = pool.getPoolStatsByWorkerType();
  for (const [type, stats] of statsByType.entries()) {
    console.log(`${type.toUpperCase()}:`);
    console.log(`  Workers:   ${stats.count}`);
    console.log(`  Active:    ${stats.activeJobs} jobs`);
    console.log(`  Completed: ${stats.completedJobs} jobs`);
    console.log(`  Failed:    ${stats.failedJobs} jobs`);
    const successRate = stats.completedJobs + stats.failedJobs > 0
      ? (stats.completedJobs / (stats.completedJobs + stats.failedJobs) * 100).toFixed(1)
      : '100.0';
    console.log(`  Success:   ${successRate}%`);
    console.log();
  }

  console.log('━'.repeat(60));
  console.log('Final Pool Statistics by Capability');
  console.log('━'.repeat(60));
  console.log();

  const statsByCap = pool.getPoolStatsByCapability();
  for (const [cap, stats] of statsByCap.entries()) {
    const bar = '█'.repeat(Math.round(stats.utilizationPercent / 10)) + '░'.repeat(10 - Math.round(stats.utilizationPercent / 10));
    console.log(`${cap.padEnd(20)} ${bar} ${stats.utilizationPercent.toString().padStart(3)}% | ${stats.activeJobs}/${stats.capacity} jobs`);
  }
  console.log();

  // Overall pool stats
  console.log('━'.repeat(60));
  console.log('Overall Pool Summary');
  console.log('━'.repeat(60));
  const poolStats = pool.getPoolStats();
  console.log(`Total Workers:     ${poolStats.totalWorkers}`);
  console.log(`Active Workers:    ${poolStats.activeWorkers}`);
  console.log(`Total Capacity:    ${poolStats.totalCapacity} concurrent jobs`);
  console.log(`Total Active:      ${poolStats.totalActiveJobs} jobs`);
  console.log(`Pool Utilization:  ${poolStats.poolUtilizationPercent}%`);
  console.log(`Completed Jobs:    ${poolStats.totalCompletedJobs}`);
  console.log(`Failed Jobs:       ${poolStats.totalFailedJobs}`);
  console.log();

  // Stop the pool
  console.log('Stopping pool...');
  await pool.stop();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Multi-Worker Pool Execution Demo Complete              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Key Results:');
  console.log('  ✓ Multiple worker types registered with capability contracts');
  console.log('  ✓ Capability-aware routing worked (llm→llm, eva→eva, etc.)');
  console.log('  ✓ Load balancing across worker instances');
  console.log('  ✓ Placeholder processors simulated real work');
  console.log('  ✓ Metrics collected by type and capability');
  console.log();
  console.log('Next Steps:');
  console.log('  • Replace placeholder processors with real model adapters');
  console.log('  • Connect to live hgi-local-node for handoff queue');
  console.log('  • Add worker heartbeat and health monitoring');
  console.log('  • Implement dynamic worker scaling');
  console.log();
}

// Run demo
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
