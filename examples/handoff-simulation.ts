/**
 * HGI Edge Runtime - Handoff Simulation Example
 *
 * Demonstrates handoff signal generation for various scenarios.
 * No real networking - only local decision simulation.
 *
 * Usage:
 *   npx ts-node examples/handoff-simulation.ts
 */

import { createHandoffEvaluator } from '../src/core/handoff-evaluator.js';
import type { ResourceMetricsSnapshot } from '../src/types/handoff.js';
import { CONSERVATIVE_THRESHOLDS, RELAXED_THRESHOLDS } from '../src/config/runtime-thresholds.js';

/**
 * Simulate a scenario and print results
 */
async function simulateScenario(
  name: string,
  metrics: Partial<ResourceMetricsSnapshot>,
  thresholds: 'default' | 'conservative' | 'relaxed' = 'default'
): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario: ${name}`);
  console.log('='.repeat(60));

  const thresholdConfig = thresholds === 'conservative'
    ? CONSERVATIVE_THRESHOLDS
    : thresholds === 'relaxed'
      ? RELAXED_THRESHOLDS
      : undefined;

  const evaluator = createHandoffEvaluator({
    thresholds: thresholdConfig,
    debug: true,
  });

  const fullMetrics: ResourceMetricsSnapshot = {
    timestamp: new Date().toISOString(),
    heapUsed: metrics.heapUsed ?? 100 * 1024 * 1024, // 100MB default
    rss: metrics.rss ?? 200 * 1024 * 1024,
    inferenceTimeMs: metrics.inferenceTimeMs ?? 1000,
    promptTokens: metrics.promptTokens ?? 100,
    completionTokens: metrics.completionTokens ?? 50,
    tokensPerSecond: metrics.tokensPerSecond,
    modelSizeBytes: metrics.modelSizeBytes,
    contextSize: metrics.contextSize ?? 2048,
    ...metrics,
  };

  const evaluation = evaluator.evaluate(fullMetrics);

  console.log('\nMetrics:');
  if (fullMetrics.heapUsed) {
    console.log(`  Heap: ${(fullMetrics.heapUsed / 1024 / 1024).toFixed(1)} MB`);
  }
  if (fullMetrics.rss) {
    console.log(`  RSS: ${(fullMetrics.rss / 1024 / 1024).toFixed(1)} MB`);
  }
  if (fullMetrics.inferenceTimeMs) {
    console.log(`  Inference time: ${fullMetrics.inferenceTimeMs} ms`);
  }
  if (fullMetrics.promptTokens) {
    console.log(`  Prompt tokens: ${fullMetrics.promptTokens}`);
  }
  if (fullMetrics.tokensPerSecond) {
    console.log(`  Tokens/sec: ${fullMetrics.tokensPerSecond.toFixed(2)}`);
  }
  if (fullMetrics.modelSizeBytes) {
    console.log(`  Model size: ${(fullMetrics.modelSizeBytes / 1024 / 1024).toFixed(0)} MB`);
  }

  console.log('\nThreshold Checks:');
  evaluation.checkedThresholds.forEach(check => {
    const status = check.crossed ? '❌ CROSSED' : '✓ OK';
    const severity = check.severity ? `[${check.severity}]` : '';
    console.log(`  ${status} ${check.name}: ${check.actual.toFixed(1)} / ${check.limit} ${severity}`);
  });

  console.log(`\nDecision: ${evaluation.shouldHandoff ? '🔀 HANDOFF RECOMMENDED' : '✅ STAY LOCAL'}`);

  if (evaluation.signal) {
    console.log('\nHandoff Signal:');
    console.log(`  Type: ${evaluation.signal.type}`);
    console.log(`  Severity: ${evaluation.signal.severity}`);
    console.log(`  Reason: ${evaluation.signal.reason}`);
    console.log(`  Target: ${evaluation.signal.suggestedTarget}`);
    console.log(`  Mandatory: ${evaluation.signal.mandatory ? 'YES' : 'No'}`);
    console.log(`  Crossed thresholds: ${evaluation.signal.crossedThresholds.join(', ')}`);
  }
}

/**
 * Main simulation
 */
async function main(): Promise<void> {
  console.log('========================================');
  console.log('HGI Edge Runtime - Handoff Simulation');
  console.log('========================================');
  console.log();

  // Scenario 1: Normal operation (should stay local)
  await simulateScenario(
    'Normal operation - within all thresholds',
    {
      heapUsed: 200 * 1024 * 1024,      // 200 MB heap
      rss: 400 * 1024 * 1024,           // 400 MB RSS
      inferenceTimeMs: 2000,            // 2 seconds
      promptTokens: 500,                // 500 tokens
      completionTokens: 100,
      tokensPerSecond: 10,              // 10 tokens/sec
      contextSize: 2048,
    }
  );

  // Scenario 2: High memory pressure (OOM risk)
  await simulateScenario(
    'High memory pressure - OOM risk',
    {
      heapUsed: 1500 * 1024 * 1024,     // 1.5 GB heap (above 1GB limit)
      rss: 2500 * 1024 * 1024,          // 2.5 GB RSS (above 2GB limit)
      inferenceTimeMs: 3000,
      promptTokens: 500,
    }
  );

  // Scenario 3: Slow inference (should track consecutive)
  await simulateScenario(
    'Slow inference - low tokens/sec',
    {
      heapUsed: 300 * 1024 * 1024,
      inferenceTimeMs: 10000,           // 10 seconds
      promptTokens: 100,
      completionTokens: 10,             // Only 10 tokens in 10 seconds
      tokensPerSecond: 1,               // 1 token/sec (below threshold)
    }
  );

  // Scenario 4: Huge prompt
  await simulateScenario(
    'Huge prompt - exceeds token limit',
    {
      heapUsed: 400 * 1024 * 1024,
      inferenceTimeMs: 5000,
      promptTokens: 10000,              // 10K tokens (above 4K limit)
      contextSize: 16384,
    }
  );

  // Scenario 5: Timeout risk
  await simulateScenario(
    'Timeout risk - inference too slow',
    {
      heapUsed: 300 * 1024 * 1024,
      inferenceTimeMs: 60000,           // 60 seconds (above 30s limit)
      promptTokens: 500,
    }
  );

  // Scenario 6: Large model
  await simulateScenario(
    'Large model - exceeds size limit',
    {
      heapUsed: 500 * 1024 * 1024,
      inferenceTimeMs: 2000,
      promptTokens: 500,
      modelSizeBytes: 8 * 1024 * 1024 * 1024, // 8GB model (above 4GB limit)
    }
  );

  // Scenario 7: Conservative thresholds (stricter limits)
  await simulateScenario(
    'Conservative thresholds - normal usage triggers handoff',
    {
      heapUsed: 600 * 1024 * 1024,      // 600 MB (above 512MB conservative limit)
      rss: 800 * 1024 * 1024,
      inferenceTimeMs: 2000,
      promptTokens: 2500,               // Above 2K conservative limit
    },
    'conservative'
  );

  // Scenario 8: Relaxed thresholds (more lenient)
  await simulateScenario(
    'Relaxed thresholds - high usage still OK',
    {
      heapUsed: 2000 * 1024 * 1024,     // 2GB (below 4GB relaxed limit)
      rss: 4000 * 1024 * 1024,
      inferenceTimeMs: 40000,           // 40s (below 60s relaxed limit)
      promptTokens: 6000,               // Below 8K relaxed limit
    },
    'relaxed'
  );

  // Scenario 9: Multiple minor issues (cumulative threshold crossing)
  await simulateScenario(
    'Multiple minor issues - cumulative crossing',
    {
      heapUsed: 900 * 1024 * 1024,      // Close to limit
      rss: 1800 * 1024 * 1024,         // Close to limit
      inferenceTimeMs: 25000,           // Close to limit
      promptTokens: 3500,               // Close to limit
      tokensPerSecond: 0.8,             // Below 1 tps
      modelSizeBytes: 3.5 * 1024 * 1024 * 1024, // Close to 4GB limit
    }
  );

  console.log('\n' + '='.repeat(60));
  console.log('Simulation complete');
  console.log('='.repeat(60));
  console.log();
  console.log('Key takeaways:');
  console.log('  • Memory thresholds trigger OOM_RISK signals');
  console.log('  • Slow inference is tracked cumulatively');
  console.log('  • Threshold presets (conservative/relaxed) change behavior');
  console.log('  • Multiple threshold crossings can trigger handoff');
  console.log('  • Critical severity = mandatory handoff');
  console.log();
}

// Run the simulation
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main, simulateScenario };
