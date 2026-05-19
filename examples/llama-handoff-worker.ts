/**
 * HGI Local Llama Handoff Worker
 *
 * Polls handoff queue from hgi-local-node and processes
 * queued handoffs using llama.cpp local inference.
 *
 * This worker demonstrates the worker-node pattern where
 * a separate process claims and completes handoffs from the hub.
 *
 * Environment variables:
 * - HGI_LOCAL_HUB_URL: Hub URL (default: http://localhost:4010)
 * - HGI_TEST_MODEL_PATH: Path to GGUF model (required)
 * - HGI_WORKER_ID: Worker identifier (default: worker-llama-local-dev)
 * - HGI_WORKER_POLL_MS: Poll interval in ms (default: 3000)
 * - HGI_WORKER_ONCE: Process one handoff and exit (default: false)
 *
 * @module examples/llama-handoff-worker
 */

import { createLlamaCppAdapter } from '../adapters/llama_cpp/adapter.js';
import { createHGIHubClient } from '../src/core/hgi-hub-client.js';
import type { InferenceRequest } from '../src/types/adapter.js';
import { HGIHubError } from '../src/types/hub-handoff.js';

// Configuration
const HUB_URL = process.env.HGI_LOCAL_HUB_URL ?? 'http://localhost:4010';
const MODEL_PATH = process.env.HGI_TEST_MODEL_PATH;
const WORKER_ID = process.env.HGI_WORKER_ID ?? 'worker-llama-local-dev';
const POLL_MS = parseInt(process.env.HGI_WORKER_POLL_MS ?? '3000', 10);
const ONCE_MODE = process.env.HGI_WORKER_ONCE === 'true';

/**
 * Main worker loop
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI Local Llama Handoff Worker                         ║');
  console.log('║     Polls queue → Claims → Processes → Completes            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Worker ID: ${WORKER_ID}`);
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Model: ${MODEL_PATH ?? 'NOT SET'}`);
  console.log(`Poll interval: ${POLL_MS}ms`);
  console.log(`Once mode: ${ONCE_MODE}`);
  console.log();

  // Validate configuration
  if (!MODEL_PATH) {
    console.error('ERROR: HGI_TEST_MODEL_PATH is required');
    console.error('Example: HGI_TEST_MODEL_PATH=./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    process.exit(1);
  }

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

  // Load model once (worker keeps model loaded)
  console.log('Loading model...');
  const adapter = createLlamaCppAdapter({
    modelPath: MODEL_PATH,
    gpuLayers: 0,
    contextSize: 2048,
  });

  try {
    await adapter.load(MODEL_PATH);
    console.log('✓ Model loaded');
    console.log();
  } catch (error) {
    console.error(`ERROR: Failed to load model: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Worker loop
  let processedCount = 0;
  let running = true;

  console.log('Starting worker loop...');
  console.log('─────────────────────────────────────────────────────────────');
  console.log();

  while (running) {
    try {
      // Poll queue
      const queue = await hubClient.listHandoffQueue();
      const pending = queue.filter(h => h.status === 'queued');

      if (pending.length === 0) {
        if (ONCE_MODE && processedCount > 0) {
          console.log('Once mode: Processed one handoff, exiting');
          break;
        }
        process.stdout.write('.');
        await sleep(POLL_MS);
        continue;
      }

      console.log();
      console.log(`Found ${pending.length} queued handoff(s)`);

      // Take first available handoff
      const handoff = pending[0];
      console.log(`Claiming handoff: ${handoff.id}`);

      // Claim handoff
      const claimed = await hubClient.claimHandoff(handoff.id, WORKER_ID);
      if (!claimed) {
        console.log('  Handoff already claimed by another worker, continuing...');
        await sleep(POLL_MS);
        continue;
      }
      console.log('  ✓ Claimed');

      // Mark as started
      console.log('  Starting processing...');
      await hubClient.startHandoff(handoff.id);
      console.log('  ✓ Started');

      // Get handoff details to extract prompt
      const handoffDetails = await hubClient.getHandoffStatus(handoff.id);
      console.log(`  Processing with model...`);

      // Extract prompt from originalRequest
      let prompt = 'Hello'; // Default fallback
      try {
        // Parse originalRequest from handoff details
        if (handoffDetails && (handoffDetails as unknown as { originalRequest?: string }).originalRequest) {
          const originalRequestStr = (handoffDetails as unknown as { originalRequest: string }).originalRequest;
          const originalRequest = JSON.parse(originalRequestStr) as InferenceRequest;
          prompt = typeof originalRequest.input === 'string'
            ? originalRequest.input
            : JSON.stringify(originalRequest.input);
        }
      } catch (parseError) {
        console.log(`  Warning: Could not parse originalRequest, using default: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      // Run inference
      const startTime = Date.now();
      let inferenceResult: { text: string; model: string; workerId: string; metrics: Record<string, unknown> };

      try {
        const request: InferenceRequest = {
          input: prompt,
          model: 'tinyllama-1.1b',
          parameters: {
            maxTokens: 100,
            temperature: 0.7,
          },
        };

        const response = await adapter.infer(request);
        const inferenceTimeMs = Date.now() - startTime;

        inferenceResult = {
          text: response.content,
          model: MODEL_PATH.split('/').pop() ?? 'unknown',
          workerId: WORKER_ID,
          metrics: {
            inferenceTimeMs,
            promptTokens: response.usage?.promptTokens ?? 0,
            completionTokens: response.usage?.completionTokens ?? 0,
            totalTokens: response.usage?.totalTokens ?? 0,
          },
        };

        console.log(`  ✓ Inference complete (${inferenceTimeMs}ms)`);
        console.log(`    Output: ${response.content.substring(0, 80)}${response.content.length > 80 ? '...' : ''}`);

        // Complete handoff
        console.log('  Completing handoff...');
        await hubClient.completeHandoff(handoff.id, inferenceResult);
        console.log('  ✓ Completed');
        processedCount++;

      } catch (inferenceError) {
        console.error(`  ✗ Inference failed: ${inferenceError instanceof Error ? inferenceError.message : String(inferenceError)}`);

        // Mark as failed
        await hubClient.failHandoff(handoff.id, {
          message: inferenceError instanceof Error ? inferenceError.message : String(inferenceError),
          code: 'INFERENCE_ERROR',
        });
        console.log('  ✓ Marked as failed');
      }

      console.log();
      console.log(`Processed ${processedCount} handoff(s) so far`);
      console.log('─────────────────────────────────────────────────────────────');
      console.log();

      // Exit after one if in once mode
      if (ONCE_MODE) {
        running = false;
        break;
      }

    } catch (error) {
      if (error instanceof HGIHubError && error.type === 'not_found') {
        console.log('⚠ Hub endpoints not available yet, retrying...');
      } else {
        console.error(`Worker error: ${error instanceof Error ? error.message : String(error)}`);
      }
      await sleep(POLL_MS);
    }
  }

  // Cleanup
  console.log();
  console.log('Shutting down worker...');
  try {
    await adapter.unload();
    console.log('✓ Model unloaded');
  } catch {
    // Ignore unload errors
  }

  console.log();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Worker Shutdown Complete                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Total handoffs processed: ${processedCount}`);
  console.log();
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run worker
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
