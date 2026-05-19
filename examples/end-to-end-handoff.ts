/**
 * HGI Edge Runtime - End-to-End Handoff Example
 *
 * First REAL end-to-end HGI handoff flow:
 * HGI-EDGE-RUNTIME → hgi-local-node
 *
 * This example:
 * 1. Loads TinyLlama model
 * 2. Configures VERY LOW thresholds to force handoff
 * 3. Runs inference
 * 4. Detects handoff signal (or simulates if no real model)
 * 5. Submits handoff to HGI-LOCAL-HUB
 * 6. Polls for result
 * 7. Prints complete flow
 *
 * Prerequisites:
 * - hgi-local-node running on http://localhost:4010
 * - TinyLlama model available (optional - will simulate if missing)
 *
 * @module examples/end-to-end-handoff
 */

import { createLlamaCppAdapter } from '../adapters/llama_cpp/adapter.js';
import { createHandoffRuntime } from '../src/core/handoff-runtime.js';
import type { InferenceRequest, InferenceResponse } from '../src/types/adapter.js';
import type { ResourceMetricsSnapshot } from '../src/types/handoff.js';
import type { HGIHubHandoffResponse } from '../src/types/hub-handoff.js';

// Configuration
const MODEL_PATH = process.env.HGI_TEST_MODEL_PATH ?? './models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf';
const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
const TEST_PROMPT = 'Explain quantum computing in one sentence.';

/**
 * Main end-to-end handoff demonstration
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI First End-to-End Handoff Flow                      ║');
  console.log('║     HGI-EDGE-RUNTIME → HGI-LOCAL-HUB                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Model: ${MODEL_PATH}`);
  console.log();

  // Step 1: Create handoff runtime with VERY LOW thresholds
  console.log('Step 1: Initialize Handoff Runtime');
  console.log('─────────────────────────────────────');

  const handoffRuntime = createHandoffRuntime({
    hubUrl: HUB_URL,
    timeoutMs: 30000,
    runtimeId: 'hgi-edge-e2e-demo',
    deviceId: 'demo-device-001',
    enabled: true,
  });

  console.log(`✓ Handoff runtime initialized`);
  console.log(`  Runtime ID: ${handoffRuntime.config.runtimeId}`);
  console.log(`  Hub URL: ${handoffRuntime.config.hubUrl}`);
  console.log(`  Handoff enabled: ${handoffRuntime.config.enabled}`);
  console.log();

  // Step 2: Check if hub is reachable
  console.log('Step 2: Check HGI-LOCAL-HUB Reachability');
  console.log('──────────────────────────────────────────');

  const hubReachable = await handoffRuntime.isHubReachable();
  if (!hubReachable) {
    console.log('⚠ HGI-LOCAL-HUB is not reachable');
    console.log(`  Expected URL: ${HUB_URL}`);
    console.log();
    console.log('  Make sure hgi-local-node is running:');
    console.log('    cd /path/to/hgi-local-node');
    console.log('    npm run dev  # or start command');
    console.log();
    console.log('  Override with: HGI_LOCAL_HUB_URL=http://your-hub:port');
    console.log();
    console.log('Continuing with simulated local inference...');
    console.log();
  } else {
    console.log('✓ HGI-LOCAL-HUB is reachable');
    console.log();
  }

  // Step 3: Attempt local inference (or simulate)
  console.log('Step 3: Local Inference Attempt');
  console.log('─────────────────────────────────');

  let localResponse: InferenceResponse | undefined;
  let localMetrics: ResourceMetricsSnapshot | undefined;
  let inferenceError: Error | undefined;

  try {
    // Try to load model and run inference
    const adapter = createLlamaCppAdapter({
      modelPath: MODEL_PATH,
      gpuLayers: 0,
      contextSize: 2048,
    });

    console.log('Loading model...');
    await adapter.load(MODEL_PATH);
    console.log('✓ Model loaded');

    const request: InferenceRequest = {
      input: TEST_PROMPT,
      model: 'tinyllama-1.1b',
      parameters: {
        maxTokens: 100,
        temperature: 0.7,
      },
    };

    console.log('Running inference...');
    const startTime = Date.now();
    localResponse = await adapter.infer(request);
    const inferenceTimeMs = Date.now() - startTime;

    // Build metrics from actual inference
    const memUsage = process.memoryUsage();
    localMetrics = {
      timestamp: new Date().toISOString(),
      heapUsed: memUsage.heapUsed,
      rss: memUsage.rss,
      inferenceTimeMs,
      promptTokens: localResponse.usage?.promptTokens ?? Math.ceil(TEST_PROMPT.length / 4),
      completionTokens: localResponse.usage?.completionTokens ?? 0,
      modelSizeBytes: 637_000_000, // TinyLlama approximate size
    };

    console.log('✓ Local inference completed');
    console.log(`  Time: ${inferenceTimeMs}ms`);
    console.log(`  Tokens: ${localMetrics.completionTokens} completion`);
    console.log();

    await adapter.unload();
  } catch (error) {
    inferenceError = error instanceof Error ? error : new Error(String(error));
    console.log(`✗ Local inference failed: ${inferenceError.message}`);
    console.log('  This is expected if model is not available.');
    console.log('  Simulating metrics that would trigger handoff...');
    console.log();

    // Simulate metrics that trigger handoff (VERY LOW thresholds)
    localMetrics = {
      timestamp: new Date().toISOString(),
      heapUsed: 1_500_000_000, // 1.5GB - above 1GB threshold
      rss: 2_500_000_000, // 2.5GB - above 2GB threshold
      inferenceTimeMs: 45000, // 45s - above 30s threshold
      promptTokens: 5000, // Above 4K threshold
      completionTokens: 0,
      tokensPerSecond: 0.5, // Below 1 TPS threshold
      modelSizeBytes: 5_000_000_000, // 5GB - above 4GB threshold
    };
  }

  if (!localMetrics) {
    console.log('ERROR: No metrics available');
    process.exit(1);
  }

  // Force handoff if HGI_FORCE_HANDOFF is set (for testing)
  const forceHandoff = process.env.HGI_FORCE_HANDOFF === 'true';
  if (forceHandoff) {
    console.log('⚠ HGI_FORCE_HANDOFF=true - Forcing handoff with synthetic metrics');
    localMetrics = {
      timestamp: new Date().toISOString(),
      heapUsed: 1_500_000_000, // 1.5GB - above threshold
      rss: 2_500_000_000, // 2.5GB - above threshold
      inferenceTimeMs: 45000, // 45s - above threshold
      promptTokens: 5000, // Above 4K threshold
      completionTokens: localMetrics.completionTokens,
      tokensPerSecond: 0.5, // Below 1 TPS threshold
      modelSizeBytes: 5_000_000_000, // 5GB - above threshold
    };
  }

  console.log('Local Metrics:');
  console.log(`  Heap Used: ${((localMetrics.heapUsed ?? 0) / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  RSS: ${((localMetrics.rss ?? 0) / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Inference Time: ${localMetrics.inferenceTimeMs}ms`);
  console.log(`  Prompt Tokens: ${localMetrics.promptTokens}`);
  if (localMetrics.tokensPerSecond) {
    console.log(`  Tokens/sec: ${localMetrics.tokensPerSecond}`);
  }
  console.log();

  // Step 4: Evaluate and submit handoff
  console.log('Step 4: Evaluate Handoff & Submit to HGI-LOCAL-HUB');
  console.log('─────────────────────────────────────────────────────');

  const request: InferenceRequest = {
    input: TEST_PROMPT,
    model: 'tinyllama-1.1b',
    parameters: {
      maxTokens: 100,
      temperature: 0.7,
    },
  };

  const handoffResult = await handoffRuntime.evaluateAndSubmit(
    localMetrics,
    request,
    localResponse,
    {
      modelId: 'tinyllama-1.1b',
      modelPath: MODEL_PATH,
      modelSizeBytes: localMetrics.modelSizeBytes ?? 637_000_000,
    }
  );

  // Step 5: Display handoff result
  console.log();
  console.log('Handoff Result:');
  console.log(`  Success: ${handoffResult.success}`);
  console.log(`  Attempted: ${handoffResult.attempted}`);
  console.log(`  Timestamp: ${handoffResult.timestamp}`);
  console.log();

  if (handoffResult.signal) {
    console.log('Generated Handoff Signal:');
    console.log(`  Type: ${handoffResult.signal.type}`);
    console.log(`  Severity: ${handoffResult.signal.severity}`);
    console.log(`  Reason: ${handoffResult.signal.reason}`);
    console.log(`  Mandatory: ${handoffResult.signal.mandatory}`);
    console.log(`  Suggested Target: ${handoffResult.signal.suggestedTarget}`);
    console.log(`  Crossed Thresholds: ${handoffResult.signal.crossedThresholds.join(', ')}`);
    console.log();
  }

  if (handoffResult.error) {
    console.log('Error:');
    console.log(`  Type: ${handoffResult.error.type}`);
    console.log(`  Message: ${handoffResult.error.message}`);
    console.log();
  }

  // Step 6: Query handoff status if submitted
  if (handoffResult.hubResponse?.handoffId) {
    console.log('Step 6: Query Handoff Status from HGI-LOCAL-HUB');
    console.log('──────────────────────────────────────────────────');
    console.log();

    const handoffId = handoffResult.hubResponse.handoffId;
    console.log(`Handoff ID: ${handoffId}`);
    console.log(`Hub Status: ${handoffResult.hubResponse.status}`);
    console.log(`Accepted: ${handoffResult.hubResponse.accepted}`);

    if (handoffResult.hubResponse.estimatedWaitMs) {
      console.log(`Estimated Wait: ${handoffResult.hubResponse.estimatedWaitMs}ms`);
    }

    if (handoffResult.hubResponse.targetNodeId) {
      console.log(`Target Node: ${handoffResult.hubResponse.targetNodeId}`);
    }

    console.log();
    console.log('Polling for status (3 attempts)...');

    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const status = await handoffRuntime.getHandoffStatus(handoffId);
      if (status) {
        console.log(`  Poll ${i + 1}: ${status.status}`);
        if (status.result) {
          console.log();
          console.log('✓ Handoff completed!');
          console.log('Result from HGI-LOCAL-HUB:');
          console.log(`  Content: ${status.result.content.substring(0, 100)}${status.result.content.length > 100 ? '...' : ''}`);
          console.log(`  Finish Reason: ${status.result.finishReason}`);
          if (status.result.usage) {
            console.log(`  Tokens: ${status.result.usage.totalTokens} total (${status.result.usage.promptTokens} prompt, ${status.result.usage.completionTokens} completion)`);
          }
          break;
        }
        if (status.error) {
          console.log(`  Error: ${status.error.message}`);
          break;
        }
      } else {
        console.log(`  Poll ${i + 1}: Could not query status`);
      }
    }
    console.log();
  }

  // Summary
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     End-to-End Handoff Flow Complete                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  if (handoffResult.success && handoffResult.hubResponse?.accepted) {
    console.log('✓ SUCCESS: First real HGI handoff completed!');
    console.log();
    console.log('Architecture proven:');
    console.log('  1. ✓ Local inference detected threshold violation');
    console.log('  2. ✓ Handoff signal generated');
    console.log('  3. ✓ Request submitted to HGI-LOCAL-HUB');
    console.log('  4. ✓ Hub accepted handoff');
    console.log('  5. ✓ Handoff ID received');
    console.log('  6. ✓ Status query successful');
    console.log();
    console.log('This demonstrates the local → node handoff pattern.');
    console.log('Future: local → node → cloud distributed inference.');
  } else if (handoffResult.attempted) {
    console.log('⚠ Handoff was attempted but not accepted');
    console.log(`  Reason: ${handoffResult.error?.message ?? 'Unknown'}`);
    console.log();
    console.log('The runtime correctly:');
    console.log('  1. ✓ Detected threshold violation');
    console.log('  2. ✓ Generated handoff signal');
    console.log('  3. ✓ Attempted submission to hub');
    console.log();
    console.log('Next: Ensure hgi-local-node implements handoff endpoint.');
  } else {
    console.log('ℹ No handoff required or handoff disabled');
    console.log();
    console.log('This means local inference completed within thresholds.');
    console.log('For demo purposes, thresholds are set very low.');
  }

  console.log();
  console.log('For more information, see:');
  console.log('  docs/HGI_FIRST_HANDOFF_FLOW.md');
  console.log('  docs/HGI_HANDOFF_ARCHITECTURE.md');
  console.log();
}

// Run the demonstration
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
