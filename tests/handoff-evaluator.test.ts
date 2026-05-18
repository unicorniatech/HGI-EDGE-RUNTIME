/**
 * HGI Edge Runtime - Handoff Evaluator Tests
 *
 * Tests for threshold crossing detection and handoff signal generation.
 * No real networking required.
 *
 * @module src/core/handoff-evaluator.test
 */

import { HandoffEvaluator, createHandoffEvaluator } from '../src/core/handoff-evaluator.js';
import { DEFAULT_RUNTIME_THRESHOLDS, CONSERVATIVE_THRESHOLDS, RELAXED_THRESHOLDS } from '../src/config/runtime-thresholds.js';
import type { ResourceMetricsSnapshot } from '../src/types/handoff.js';

describe('HandoffEvaluator', () => {
  describe('Basic Functionality', () => {
    test('creates evaluator with default thresholds', () => {
      const evaluator = createHandoffEvaluator();
      expect(evaluator).toBeInstanceOf(HandoffEvaluator);
      expect(evaluator.config.thresholds.maxMemoryMB).toBe(1024);
    });

    test('creates evaluator with custom thresholds', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxMemoryMB: 512 },
      });
      expect(evaluator.config.thresholds.maxMemoryMB).toBe(512);
    });

    test('reset clears slow inference counter', () => {
      const evaluator = createHandoffEvaluator();
      
      // Trigger slow inference detection
      evaluator.evaluate({
        timestamp: new Date().toISOString(),
        tokensPerSecond: 0.5, // Below 1 tps threshold
      });
      
      evaluator.reset();
      // Should not trigger handoff after reset
      const result = evaluator.evaluate({
        timestamp: new Date().toISOString(),
        tokensPerSecond: 0.5,
      });
      expect(result.shouldHandoff).toBe(false);
    });
  });

  describe('Memory Thresholds', () => {
    test('detects heap memory threshold crossing', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxMemoryMB: 1000 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        heapUsed: 1500 * 1024 * 1024, // 1.5 GB
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(true);
      expect(result.signal?.type).toBe('OOM_RISK');
      expect(result.signal?.severity).toBe('high');
    });

    test('detects critical memory pressure', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxMemoryMB: 1000 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        heapUsed: 2000 * 1024 * 1024, // 2.0 GB (150% of limit)
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(true);
      expect(result.signal?.severity).toBe('critical');
      expect(result.signal?.mandatory).toBe(true);
    });

    test('detects RSS memory threshold', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxRssMemoryMB: 2000 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        rss: 2500 * 1024 * 1024, // 2.5 GB
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(true);
      expect(result.checkedThresholds).toContainEqual(
        expect.objectContaining({
          name: 'rssMemory',
          crossed: true,
        })
      );
    });

    test('allows operation within memory limits', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxMemoryMB: 1000 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        heapUsed: 500 * 1024 * 1024, // 500 MB (within limit)
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(false);
      expect(result.signal).toBeNull();
    });
  });

  describe('Time Thresholds', () => {
    test('detects timeout risk', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxInferenceTimeMs: 30000 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        inferenceTimeMs: 40000, // 40 seconds (above 30s limit)
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(true);
      expect(result.signal?.type).toBe('TIMEOUT_RISK');
    });

    test('detects critical timeout (2x limit)', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxInferenceTimeMs: 10000 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        inferenceTimeMs: 25000, // 25 seconds (2.5x limit)
      };

      const result = evaluator.evaluate(metrics);

      expect(result.signal?.severity).toBe('critical');
      expect(result.signal?.mandatory).toBe(true);
    });

    test('allows fast inference', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxInferenceTimeMs: 30000 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        inferenceTimeMs: 2000, // 2 seconds
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(false);
    });
  });

  describe('Token Thresholds', () => {
    test('detects large prompt', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxPromptTokens: 4096 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        promptTokens: 6000,
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(true);
      expect(result.signal?.type).toBe('PROMPT_TOO_LARGE');
    });

    test('detects context size limit', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxContextSize: 8192 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        contextSize: 16384,
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(true);
      expect(result.checkedThresholds).toContainEqual(
        expect.objectContaining({
          name: 'contextSize',
          crossed: true,
        })
      );
    });

    test('allows normal prompt size', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxPromptTokens: 4096 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        promptTokens: 1000,
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(false);
    });
  });

  describe('Model Size Thresholds', () => {
    test('detects large model', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxModelSizeMB: 4096 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        modelSizeBytes: 8 * 1024 * 1024 * 1024, // 8GB
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(true);
      expect(result.signal?.severity).toBe('high');
    });

    test('allows small model', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxModelSizeMB: 4096 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        modelSizeBytes: 600 * 1024 * 1024, // 600MB
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(false);
    });
  });

  describe('Performance Thresholds', () => {
    test('detects slow inference (low tokens/sec)', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, minTokensPerSecond: 1 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        tokensPerSecond: 0.5,
      };

      const result = evaluator.evaluate(metrics);

      expect(result.shouldHandoff).toBe(false); // First occurrence doesn't trigger
      expect(result.checkedThresholds).toContainEqual(
        expect.objectContaining({
          name: 'tokensPerSecond',
          crossed: true,
        })
      );
    });

    test('triggers handoff after consecutive slow inferences', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: {
          ...DEFAULT_RUNTIME_THRESHOLDS,
          minTokensPerSecond: 1,
          maxSlowInferences: 3,
        },
      });

      // Simulate 3 consecutive slow inferences
      for (let i = 0; i < 3; i++) {
        const result = evaluator.evaluate({
          timestamp: new Date().toISOString(),
          tokensPerSecond: 0.5,
        });

        if (i < 2) {
          expect(result.shouldHandoff).toBe(false);
        } else {
          expect(result.shouldHandoff).toBe(true);
          expect(result.signal?.type).toBe('INFERENCE_TOO_SLOW');
        }
      }
    });
  });

  describe('Cumulative Threshold Crossing', () => {
    test('triggers handoff on multiple minor threshold crossings', () => {
      const evaluator = createHandoffEvaluator();

      // Multiple medium severity issues that actually cross thresholds
      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        heapUsed: 1500 * 1024 * 1024,   // Above 1GB limit (high severity)
        rss: 2500 * 1024 * 1024,       // Above 2GB limit (high severity)
        inferenceTimeMs: 35000,        // Above 30s limit (high severity)
        promptTokens: 5000,            // Above 4K limit (high severity)
        tokensPerSecond: 0.8,          // Below 1 tps (medium severity)
        modelSizeBytes: 5 * 1024 * 1024 * 1024, // Above 4GB (high severity)
      };

      const result = evaluator.evaluate(metrics);

      // Should trigger due to multiple high severity crossings
      expect(result.shouldHandoff).toBe(true);
      expect(result.signal?.crossedThresholds.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Threshold Presets', () => {
    test('conservative preset triggers earlier', () => {
      const conservative = createHandoffEvaluator({
        thresholds: CONSERVATIVE_THRESHOLDS,
      });
      const default_ = createHandoffEvaluator({
        thresholds: DEFAULT_RUNTIME_THRESHOLDS,
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        heapUsed: 600 * 1024 * 1024, // 600MB
        promptTokens: 2500,
      };

      const conservativeResult = conservative.evaluate(metrics);
      const defaultResult = default_.evaluate(metrics);

      // Conservative should trigger (600 > 512MB, 2500 > 2048 tokens)
      expect(conservativeResult.shouldHandoff).toBe(true);
      // Default should not trigger (600 < 1024MB, 2500 < 4096 tokens)
      expect(defaultResult.shouldHandoff).toBe(false);
    });

    test('relaxed preset allows higher usage', () => {
      const relaxed = createHandoffEvaluator({
        thresholds: RELAXED_THRESHOLDS,
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        heapUsed: 2000 * 1024 * 1024, // 2GB (below 4GB relaxed limit)
        promptTokens: 6000,           // Below 8K relaxed limit
        inferenceTimeMs: 40000,       // Below 60s relaxed limit
      };

      const result = relaxed.evaluate(metrics);

      expect(result.shouldHandoff).toBe(false);
    });
  });

  describe('Signal Structure', () => {
    test('signal includes all required fields', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxMemoryMB: 500 },
      });

      const metrics: ResourceMetricsSnapshot = {
        timestamp: new Date().toISOString(),
        heapUsed: 800 * 1024 * 1024,
      };

      const result = evaluator.evaluate(metrics);

      expect(result.signal).toBeDefined();
      expect(result.signal).toMatchObject({
        type: expect.any(String),
        severity: expect.any(String),
        reason: expect.any(String),
        metrics: expect.any(Object),
        suggestedTarget: expect.any(String),
        timestamp: expect.any(String),
        mandatory: expect.any(Boolean),
        crossedThresholds: expect.any(Array),
      });
    });

    test('timestamp is ISO 8601 format', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxMemoryMB: 500 },
      });

      const result = evaluator.evaluate({
        timestamp: new Date().toISOString(),
        heapUsed: 800 * 1024 * 1024,
      });

      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(result.signal?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Edge Cases', () => {
    test('handles missing metrics gracefully', () => {
      const evaluator = createHandoffEvaluator();

      const result = evaluator.evaluate({
        timestamp: new Date().toISOString(),
        // No metrics provided
      });

      // Should not crash, should not handoff without evidence
      expect(result.shouldHandoff).toBe(false);
      expect(result.signal).toBeNull();
    });

    test('handles zero values', () => {
      const evaluator = createHandoffEvaluator();

      const result = evaluator.evaluate({
        timestamp: new Date().toISOString(),
        heapUsed: 0,
        inferenceTimeMs: 0,
        tokensPerSecond: 0,
      });

      expect(result.shouldHandoff).toBe(false);
    });

    test('handles exact threshold boundary', () => {
      const evaluator = createHandoffEvaluator({
        thresholds: { ...DEFAULT_RUNTIME_THRESHOLDS, maxMemoryMB: 1000 },
      });

      const result = evaluator.evaluate({
        timestamp: new Date().toISOString(),
        heapUsed: 1000 * 1024 * 1024, // Exactly at limit
      });

      // Should not handoff at exact limit (crossed means > limit)
      expect(result.shouldHandoff).toBe(false);
    });
  });
});
