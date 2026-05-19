/**
 * HGI Local Llama Handoff Worker (Hardened)
 *
 * Polls handoff queue from hgi-local-node and processes
 * queued handoffs using llama.cpp local inference.
 *
 * Enhanced with safety features for long-running sessions:
 * - Worker heartbeat and stats logging
 * - Graceful shutdown handling
 * - Inference timeout protection
 * - Max jobs limit
 * - Calm idle behavior
 *
 * Environment variables:
 * - HGI_LOCAL_HUB_URL: Hub URL (default: http://localhost:4010)
 * - HGI_TEST_MODEL_PATH: Path to GGUF model (required)
 * - HGI_WORKER_ID: Worker identifier (default: worker-llama-local-dev)
 * - HGI_WORKER_POLL_MS: Poll interval in ms (default: 3000)
 * - HGI_WORKER_ONCE: Process one handoff and exit (default: false)
 * - HGI_WORKER_MAX_JOBS: Max jobs to process before exit (default: unlimited)
 * - HGI_WORKER_INFERENCE_TIMEOUT_MS: Inference timeout (default: 60000)
 * - HGI_WORKER_IDLE_LOG_INTERVAL: Log idle status every N polls (default: 10)
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
const MAX_JOBS = parseInt(process.env.HGI_WORKER_MAX_JOBS ?? '0', 10) || undefined;
const INFERENCE_TIMEOUT_MS = parseInt(process.env.HGI_WORKER_INFERENCE_TIMEOUT_MS ?? '60000', 10);
const IDLE_LOG_INTERVAL = parseInt(process.env.HGI_WORKER_IDLE_LOG_INTERVAL ?? '10', 10);

// Worker stats
interface WorkerStats {
  startTime: number;
  processedCount: number;
  failedCount: number;
  lastPollAt: number | null;
  lastCompletedAt: number | null;
  idlePollCount: number;
}

const stats: WorkerStats = {
  startTime: Date.now(),
  processedCount: 0,
  failedCount: 0,
  lastPollAt: null,
  lastCompletedAt: null,
  idlePollCount: 0,
};

let running = true;
let shutdownRequested = false;

/**
 * Format uptime in human-readable format
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Get memory usage stats
 */
function getMemoryStats(): { heapUsedMB: number; rssMB: number } {
  const mem = process.memoryUsage();
  return {
    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    rssMB: Math.round(mem.rss / 1024 / 1024),
  };
}

/**
 * Log worker heartbeat/status
 */
function logHeartbeat(): void {
  const uptime = Date.now() - stats.startTime;
  const mem = getMemoryStats();

  console.log();
  console.log('━'.repeat(60));
  console.log('Worker Heartbeat');
  console.log('━'.repeat(60));
  console.log(`  Worker ID:    ${WORKER_ID}`);
  console.log(`  Uptime:         ${formatUptime(uptime)}`);
  console.log(`  Model loaded:   ${MODEL_PATH?.split('/').pop() ?? 'unknown'}`);
  console.log(`  Processed:      ${stats.processedCount}`);
  console.log(`  Failed:         ${stats.failedCount}`);
  console.log(`  Memory:         ${mem.heapUsedMB}MB heap / ${mem.rssMB}MB rss`);
  console.log(`  Last poll:      ${stats.lastPollAt ? new Date(stats.lastPollAt).toISOString() : 'never'}`);
  console.log(`  Last completed: ${stats.lastCompletedAt ? new Date(stats.lastCompletedAt).toISOString() : 'never'}`);

  if (MAX_JOBS) {
    console.log(`  Progress:       ${stats.processedCount}/${MAX_JOBS} jobs`);
  }
  console.log('━'.repeat(60));
}

/**
 * Log idle status (calm, not spam)
 */
function logIdleStatus(): void {
  stats.idlePollCount++;

  // Only log every N idle polls to avoid spam
  if (stats.idlePollCount % IDLE_LOG_INTERVAL === 0) {
    const uptime = Date.now() - stats.startTime;
    const mem = getMemoryStats();
    console.log(`[${new Date().toISOString()}] Idle... uptime: ${formatUptime(uptime)}, polls: ${stats.idlePollCount}, processed: ${stats.processedCount}, memory: ${mem.rssMB}MB`);
  }
}

/**
 * Run inference with timeout
 */
async function runInferenceWithTimeout(
  adapter: ReturnType<typeof createLlamaCppAdapter>,
  request: InferenceRequest,
  timeoutMs: number
): Promise<{ content: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Inference timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    adapter.infer(request)
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Print final summary
 */
function printSummary(): void {
  const uptime = Date.now() - stats.startTime;
  const mem = getMemoryStats();

  console.log();
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Worker Session Summary                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Worker ID:      ${WORKER_ID}`);
  console.log(`  Total uptime:   ${formatUptime(uptime)}`);
  console.log(`  Jobs processed: ${stats.processedCount}`);
  console.log(`  Jobs failed:    ${stats.failedCount}`);
  console.log(`  Success rate:   ${stats.processedCount + stats.failedCount > 0
    ? Math.round((stats.processedCount / (stats.processedCount + stats.failedCount)) * 100)
    : 0}%`);
  console.log(`  Final memory:   ${mem.heapUsedMB}MB heap / ${mem.rssMB}MB rss`);

  if (shutdownRequested) {
    console.log(`  Shutdown:       Graceful (signal received)`);
  } else if (MAX_JOBS && stats.processedCount >= MAX_JOBS) {
    console.log(`  Shutdown:       Max jobs reached (${MAX_JOBS})`);
  } else if (ONCE_MODE && stats.processedCount > 0) {
    console.log(`  Shutdown:       Once mode completed`);
  } else {
    console.log(`  Shutdown:       Normal exit`);
  }
  console.log();
}

/**
 * Setup graceful shutdown handlers
 */
function setupShutdownHandlers(): void {
  const shutdown = (signal: string) => {
    if (shutdownRequested) {
      console.log(`\n${signal} received again, forcing exit...`);
      process.exit(1);
    }

    shutdownRequested = true;
    console.log(`\n${signal} received, initiating graceful shutdown...`);
    running = false;

    // Give some time for cleanup
    setTimeout(() => {
      console.log('Shutdown timeout exceeded, exiting...');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Also handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    shutdown('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    shutdown('UNHANDLED_REJECTION');
  });
}

/**
 * Main worker loop
 */
async function main(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     HGI Local Llama Handoff Worker (Hardened)              ║');
  console.log('║     Polls queue → Claims → Processes → Completes            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Worker ID: ${WORKER_ID}`);
  console.log(`Hub URL: ${HUB_URL}`);
  console.log(`Model: ${MODEL_PATH ?? 'NOT SET'}`);
  console.log(`Poll interval: ${POLL_MS}ms`);
  console.log(`Once mode: ${ONCE_MODE}`);
  console.log(`Max jobs: ${MAX_JOBS ?? 'unlimited'}`);
  console.log(`Inference timeout: ${INFERENCE_TIMEOUT_MS}ms`);
  console.log();

  // Validate configuration
  if (!MODEL_PATH) {
    console.error('ERROR: HGI_TEST_MODEL_PATH is required');
    console.error('Example: HGI_TEST_MODEL_PATH=./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf');
    process.exit(1);
  }

  // Setup shutdown handlers early
  setupShutdownHandlers();

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

  // Print initial heartbeat
  logHeartbeat();

  console.log('Starting worker loop...');
  console.log('─────────────────────────────────────────────────────────────');
  console.log();

  // Main worker loop
  while (running) {
    // Check if max jobs reached
    if (MAX_JOBS && stats.processedCount >= MAX_JOBS) {
      console.log(`Max jobs reached (${MAX_JOBS}), exiting...`);
      break;
    }

    // Check if shutdown requested
    if (shutdownRequested) {
      console.log('Shutdown requested, stopping worker loop...');
      break;
    }

    try {
      // Poll queue
      stats.lastPollAt = Date.now();
      const queue = await hubClient.listHandoffQueue();
      const pending = queue.filter(h => h.status === 'queued');

      if (pending.length === 0) {
        // Idle behavior
        logIdleStatus();

        if (ONCE_MODE && stats.processedCount > 0) {
          console.log('Once mode: Processed one handoff, exiting');
          break;
        }

        await sleep(POLL_MS);
        continue;
      }

      // Reset idle counter when work found
      stats.idlePollCount = 0;

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

      // Run inference with timeout
      const inferenceStart = Date.now();

      try {
        const request: InferenceRequest = {
          input: prompt,
          model: 'tinyllama-1.1b',
          parameters: {
            maxTokens: 100,
            temperature: 0.7,
          },
        };

        const response = await runInferenceWithTimeout(adapter, request, INFERENCE_TIMEOUT_MS);
        const inferenceTimeMs = Date.now() - inferenceStart;

        const inferenceResult = {
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

        stats.processedCount++;
        stats.lastCompletedAt = Date.now();

      } catch (inferenceError) {
        const errorMessage = inferenceError instanceof Error ? inferenceError.message : String(inferenceError);
        console.error(`  ✗ Inference failed: ${errorMessage}`);

        // Mark as failed
        await hubClient.failHandoff(handoff.id, {
          message: errorMessage,
          code: inferenceError instanceof Error && inferenceError.message.includes('timeout')
            ? 'INFERENCE_TIMEOUT'
            : 'INFERENCE_ERROR',
        });
        console.log('  ✓ Marked as failed');

        stats.failedCount++;
      }

      console.log();
      console.log(`Processed ${stats.processedCount} handoff(s) so far (${stats.failedCount} failed)`);
      console.log('─────────────────────────────────────────────────────────────');
      console.log();

      // Periodic heartbeat every 5 jobs
      if (stats.processedCount % 5 === 0) {
        logHeartbeat();
      }

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

  // Print final summary
  printSummary();

  // Cleanup
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
