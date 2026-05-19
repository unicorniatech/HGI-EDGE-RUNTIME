/**
 * HGI Local Worker Coordination Demo
 *
 * Demonstrates the worker capability contract and local coordination
 * for multiple specialized workers:
 * - LLM (Llama) - text generation
 * - EVA - reasoning/expert system
 * - STT - speech-to-text (placeholder)
 * - TTS - text-to-speech (placeholder)
 * - Vision - image analysis (placeholder)
 *
 * This demo only shows registration/capability/coordination.
 * No real STT/TTS/Vision implementation yet.
 *
 * Environment variables:
 * - HGI_LOCAL_HUB_URL: Hub URL (default: http://localhost:4010)
 *
 * @module examples/local-worker-coordination-demo
 */

import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import {
  createLLMWorker,
  createEVAWorker,
  createSTTWorker,
  createTTSWorker,
  createVisionWorker,
  generateCoordinationDiagnostics,
  formatDiagnostics,
  computeCapacityByCapability,
  type WorkerCapabilityContract,
} from '../src/core/worker-registration.js';

// Configuration
const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';

/**
 * Main demo
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI Local Worker Coordination Demo                     ║');
  console.log('║     Multi-Worker Capability Contract Demo                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Hub URL: ${HUB_URL}`);
  console.log('Mode: Local-only coordination (no cloud)');
  console.log();

  // Check hub connection
  const hubClient = createHGIHubClient({
    baseUrl: HUB_URL,
    timeoutMs: 30000,
    runtimeId: 'coordination-demo',
  });

  console.log('Checking hub connection...');
  const reachable = await hubClient.isReachable();
  if (!reachable) {
    console.log('⚠ Hub not reachable - running in standalone mode');
    console.log('  (Workers will be registered locally only)');
    console.log();
  } else {
    console.log('✓ Hub connected');
    console.log();
  }

  // Create sample worker registrations
  console.log('Registering sample workers...');
  console.log();

  const contracts: WorkerCapabilityContract[] = [];

  // 1. LLM Worker (Llama)
  console.log('1. LLM Worker (Llama)');
  const llmWorker = createLLMWorker('llama-main', hubClient, {
    modelName: 'tinyllama-1.1b-chat',
    maxConcurrentJobs: 2,
  });
  contracts.push(llmWorker.contract);
  printWorkerSummary(llmWorker.contract);

  // 2. EVA Worker (Reasoning/Expert)
  console.log('2. EVA Worker (Expert/Reasoning)');
  const evaWorker = createEVAWorker('eva-reasoner', hubClient, {
    modelName: 'eva-expert-v1',
    maxConcurrentJobs: 1,
  });
  contracts.push(evaWorker.contract);
  printWorkerSummary(evaWorker.contract);

  // 3. STT Worker (Placeholder)
  console.log('3. STT Worker (Speech-to-Text) - Placeholder');
  const sttWorker = createSTTWorker('stt-transcriber', hubClient, {
    modelName: 'whisper-base',
    maxConcurrentJobs: 3,
  });
  contracts.push(sttWorker.contract);
  printWorkerSummary(sttWorker.contract);

  // 4. TTS Worker (Placeholder)
  console.log('4. TTS Worker (Text-to-Speech) - Placeholder');
  const ttsWorker = createTTSWorker('tts-synthesizer', hubClient, {
    modelName: 'coqui-tts',
    maxConcurrentJobs: 2,
  });
  contracts.push(ttsWorker.contract);
  printWorkerSummary(ttsWorker.contract);

  // 5. Vision Worker (Placeholder)
  console.log('5. Vision Worker (Image Analysis) - Placeholder');
  const visionWorker = createVisionWorker('vision-analyzer', hubClient, {
    modelName: 'clip-vision',
    maxConcurrentJobs: 1,
  });
  contracts.push(visionWorker.contract);
  printWorkerSummary(visionWorker.contract);

  console.log();
  console.log('━'.repeat(60));
  console.log('Sample Workers Registered: 5');
  console.log('━'.repeat(60));
  console.log();

  // Show local coordination diagnostics
  console.log('Generating Local Coordination Diagnostics...');
  console.log();

  const diagnostics = generateCoordinationDiagnostics(contracts);
  console.log(formatDiagnostics(diagnostics));

  // Show capacity by capability
  console.log('Capacity Analysis by Capability:');
  console.log();

  const capacities = computeCapacityByCapability(contracts);
  for (const cap of capacities) {
    const utilization = (cap.activeJobs / cap.totalCapacity) * 100;
    console.log(`  ${cap.capability}:`);
    console.log(`    Workers:     ${cap.workerCount}`);
    console.log(`    Capacity:    ${cap.totalCapacity} concurrent jobs`);
    console.log(`    Active:      ${cap.activeJobs} jobs`);
    console.log(`    Available:   ${cap.availableSlots} slots`);
    console.log(`    Utilization: ${utilization.toFixed(1)}%`);
    console.log();
  }

  // Summary
  console.log('━'.repeat(60));
  console.log('Summary');
  console.log('━'.repeat(60));
  console.log(`Total registered workers: ${contracts.length}`);
  console.log(`Local-only workers: ${diagnostics.localOnlyWorkers}`);
  console.log(`Unique capabilities: ${capacities.length}`);
  console.log();

  // Worker type breakdown
  console.log('Worker Type Breakdown:');
  for (const [type, count] of Object.entries(diagnostics.workersByType)) {
    if (count > 0) {
      console.log(`  ${type.padEnd(10)} ${count} worker(s)`);
    }
  }
  console.log();

  // Capability coverage
  console.log('Capability Coverage:');
  const capabilityNames = capacities.map(c => c.capability).sort();
  for (const cap of capabilityNames) {
    console.log(`  ✓ ${cap}`);
  }
  console.log();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Local Coordination Demo Complete                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Key Points:');
  console.log('  • All workers default to localOnly=true');
  console.log('  • Each worker type has default capabilities');
  console.log('  • Priority bias varies by worker type');
  console.log('  • Max concurrent jobs is configurable per worker');
  console.log('  • Input/output types are typed and validated');
  console.log();
  console.log('Next Steps:');
  console.log('  • Implement real STT/TTS/Vision adapters');
  console.log('  • Connect workers to actual inference backends');
  console.log('  • Run multi-worker pool with load balancing');
  console.log();
}

/**
 * Print a worker summary
 */
function printWorkerSummary(contract: WorkerCapabilityContract): void {
  console.log(`  ID:           ${contract.id}`);
  console.log(`  Type:         ${contract.workerType}`);
  console.log(`  Model:        ${contract.modelName ?? 'N/A'}`);
  console.log(`  Capabilities: ${contract.capabilities.join(', ')}`);
  console.log(`  Input:        ${contract.inputTypes.join(', ')}`);
  console.log(`  Output:       ${contract.outputTypes.join(', ')}`);
  console.log(`  Max Jobs:     ${contract.maxConcurrentJobs}`);
  console.log(`  Priority:     ${contract.priorityBias ?? 50}`);
  console.log(`  Local-Only:   ${contract.localOnly ? 'Yes' : 'No'}`);
  console.log(`  Tags:         ${contract.runtimeTags?.join(', ') ?? 'none'}`);
  console.log();
}

// Run demo
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
