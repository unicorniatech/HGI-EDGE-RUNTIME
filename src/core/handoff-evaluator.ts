/**
 * HGI Edge Runtime - Handoff Evaluator
 *
 * Evaluates resource metrics against thresholds to determine
 * when local inference should handoff to HGI-LOCAL-HUB.
 *
 * @module src/core/handoff-evaluator
 */

import type {
  HandoffSignal,
  HandoffSignalType,
  HandoffSeverity,
  HandoffTarget,
  ResourceMetricsSnapshot,
  HandoffEvaluation,
  ThresholdCheck,
} from '../types/handoff.js';
import type { RuntimeThresholds } from '../config/runtime-thresholds.js';
import { DEFAULT_RUNTIME_THRESHOLDS } from '../config/runtime-thresholds.js';

/**
 * Handoff evaluator configuration
 */
export interface EvaluatorConfig {
  /** Thresholds to evaluate against */
  thresholds: RuntimeThresholds;
  /** Adapter identifier */
  adapterId?: string;
  /** Whether to enable debug logging */
  debug?: boolean;
}

/**
 * Default evaluator configuration
 */
export const DEFAULT_EVALUATOR_CONFIG: EvaluatorConfig = {
  thresholds: DEFAULT_RUNTIME_THRESHOLDS,
  debug: false,
};

/**
 * Handoff evaluator class
 * 
 * Determines whether local inference should handoff based on:
 * - Memory usage (heap, RSS)
 * - Inference time
 * - Token throughput
 * - Model size
 * - Prompt size
 */
export class HandoffEvaluator {
  private _config: EvaluatorConfig;
  private _slowInferenceCount: number = 0;

  constructor(config: Partial<EvaluatorConfig> = {}) {
    this._config = {
      ...DEFAULT_EVALUATOR_CONFIG,
      ...config,
      thresholds: config.thresholds ?? DEFAULT_EVALUATOR_CONFIG.thresholds,
    };
  }

  /**
   * Evaluate metrics and determine if handoff is needed
   */
  evaluate(metrics: ResourceMetricsSnapshot): HandoffEvaluation {
    const thresholdChecks: ThresholdCheck[] = [];
    const crossedThresholds: string[] = [];

    // Check memory thresholds
    if (metrics.heapUsed !== undefined) {
      const heapMB = metrics.heapUsed / (1024 * 1024);
      const heapCheck: ThresholdCheck = {
        name: 'heapMemory',
        limit: this._config.thresholds.maxMemoryMB,
        actual: heapMB,
        crossed: heapMB > this._config.thresholds.maxMemoryMB,
        severity: heapMB > this._config.thresholds.maxMemoryMB * 1.5 ? 'critical' : 'high',
      };
      thresholdChecks.push(heapCheck);
      if (heapCheck.crossed) crossedThresholds.push('heapMemory');
    }

    if (metrics.rss !== undefined) {
      const rssMB = metrics.rss / (1024 * 1024);
      const rssCheck: ThresholdCheck = {
        name: 'rssMemory',
        limit: this._config.thresholds.maxRssMemoryMB,
        actual: rssMB,
        crossed: rssMB > this._config.thresholds.maxRssMemoryMB,
        severity: rssMB > this._config.thresholds.maxRssMemoryMB * 1.5 ? 'critical' : 'high',
      };
      thresholdChecks.push(rssCheck);
      if (rssCheck.crossed) crossedThresholds.push('rssMemory');
    }

    // Check inference time
    if (metrics.inferenceTimeMs !== undefined) {
      const timeCheck: ThresholdCheck = {
        name: 'inferenceTime',
        limit: this._config.thresholds.maxInferenceTimeMs,
        actual: metrics.inferenceTimeMs,
        crossed: metrics.inferenceTimeMs > this._config.thresholds.maxInferenceTimeMs,
        severity: metrics.inferenceTimeMs > this._config.thresholds.maxInferenceTimeMs * 2 ? 'critical' : 'high',
      };
      thresholdChecks.push(timeCheck);
      if (timeCheck.crossed) crossedThresholds.push('inferenceTime');
    }

    // Check prompt tokens
    if (metrics.promptTokens !== undefined) {
      const promptCheck: ThresholdCheck = {
        name: 'promptTokens',
        limit: this._config.thresholds.maxPromptTokens,
        actual: metrics.promptTokens,
        crossed: metrics.promptTokens > this._config.thresholds.maxPromptTokens,
        severity: metrics.promptTokens > this._config.thresholds.maxPromptTokens * 1.5 ? 'critical' : 'high',
      };
      thresholdChecks.push(promptCheck);
      if (promptCheck.crossed) crossedThresholds.push('promptTokens');
    }

    // Check context size
    if (metrics.contextSize !== undefined) {
      const contextCheck: ThresholdCheck = {
        name: 'contextSize',
        limit: this._config.thresholds.maxContextSize,
        actual: metrics.contextSize,
        crossed: metrics.contextSize > this._config.thresholds.maxContextSize,
        severity: 'high',
      };
      thresholdChecks.push(contextCheck);
      if (contextCheck.crossed) crossedThresholds.push('contextSize');
    }

    // Check model size
    if (metrics.modelSizeBytes !== undefined) {
      const modelSizeMB = metrics.modelSizeBytes / (1024 * 1024);
      const modelCheck: ThresholdCheck = {
        name: 'modelSize',
        limit: this._config.thresholds.maxModelSizeMB,
        actual: modelSizeMB,
        crossed: modelSizeMB > this._config.thresholds.maxModelSizeMB,
        severity: modelSizeMB > this._config.thresholds.maxModelSizeMB * 2 ? 'critical' : 'high',
      };
      thresholdChecks.push(modelCheck);
      if (modelCheck.crossed) crossedThresholds.push('modelSize');
    }

    // Check tokens per second (slow inference detection)
    if (metrics.tokensPerSecond !== undefined && metrics.tokensPerSecond > 0) {
      const tpsCheck: ThresholdCheck = {
        name: 'tokensPerSecond',
        limit: this._config.thresholds.minTokensPerSecond,
        actual: metrics.tokensPerSecond,
        crossed: metrics.tokensPerSecond < this._config.thresholds.minTokensPerSecond,
        severity: 'medium',
      };
      thresholdChecks.push(tpsCheck);
      if (tpsCheck.crossed) {
        crossedThresholds.push('tokensPerSecond');
        this._slowInferenceCount++;
      } else {
        this._slowInferenceCount = Math.max(0, this._slowInferenceCount - 1);
      }
    }

    // Check consecutive slow inferences
    if (this._slowInferenceCount >= this._config.thresholds.maxSlowInferences) {
      const slowCheck: ThresholdCheck = {
        name: 'consecutiveSlowInferences',
        limit: this._config.thresholds.maxSlowInferences,
        actual: this._slowInferenceCount,
        crossed: true,
        severity: 'high',
      };
      thresholdChecks.push(slowCheck);
      crossedThresholds.push('consecutiveSlowInferences');
      this._slowInferenceCount = 0; // Reset after triggering handoff
    }

    // Determine if handoff is needed
    const criticalCrossed = thresholdChecks.filter(t => t.crossed && t.severity === 'critical').length;
    const highCrossed = thresholdChecks.filter(t => t.crossed && t.severity === 'high').length;
    const mediumCrossed = thresholdChecks.filter(t => t.crossed && t.severity === 'medium').length;

    // Handoff triggers on:
    // - Any critical threshold crossed
    // - Any single high severity threshold (memory, time, prompt size)
    // - 2+ medium severity thresholds
    // - 3+ total threshold crossings (cumulative)
    const shouldHandoff = criticalCrossed > 0 || highCrossed > 0 || (mediumCrossed >= 2 && crossedThresholds.length >= 2) || crossedThresholds.length >= 3;

    if (this._config.debug) {
      console.log('[HandoffEvaluator] Thresholds checked:', thresholdChecks.length);
      console.log('[HandoffEvaluator] Crossed thresholds:', crossedThresholds);
      console.log('[HandoffEvaluator] Should handoff:', shouldHandoff);
    }

    // Generate signal if handoff needed
    const signal: HandoffSignal | null = shouldHandoff
      ? this._generateSignal(metrics, crossedThresholds, thresholdChecks)
      : null;

    return {
      shouldHandoff,
      signal,
      checkedThresholds: thresholdChecks,
    };
  }

  /**
   * Generate handoff signal based on crossed thresholds
   */
  private _generateSignal(
    metrics: ResourceMetricsSnapshot,
    crossedThresholds: string[],
    allChecks: ThresholdCheck[]
  ): HandoffSignal {
    // Determine signal type
    let type: HandoffSignalType = 'HANDOFF_RECOMMENDED';
    let severity: HandoffSeverity = 'medium';
    let mandatory = false;

    // Check for critical conditions
    const criticalChecks = allChecks.filter(t => t.crossed && t.severity === 'critical');
    if (criticalChecks.length > 0) {
      type = 'HANDOFF_REQUIRED';
      severity = 'critical';
      mandatory = true;
    } else if (crossedThresholds.includes('heapMemory') || crossedThresholds.includes('rssMemory')) {
      type = 'OOM_RISK';
      severity = 'high';
    } else if (crossedThresholds.includes('inferenceTime')) {
      type = 'TIMEOUT_RISK';
      severity = 'high';
    } else if (crossedThresholds.includes('promptTokens')) {
      type = 'PROMPT_TOO_LARGE';
      severity = 'high';
    } else if (crossedThresholds.includes('modelSize')) {
      type = 'MODEL_UNAVAILABLE';
      severity = 'high';
    } else if (crossedThresholds.includes('tokensPerSecond') || crossedThresholds.includes('consecutiveSlowInferences')) {
      type = 'INFERENCE_TOO_SLOW';
      severity = 'medium';
    }

    // Generate human-readable reason
    const reason = this._generateReason(crossedThresholds, criticalChecks);

    // Determine target (start with node, escalate to cloud if critical)
    let suggestedTarget: HandoffTarget = 'node';
    if (severity === 'critical') {
      suggestedTarget = 'auto'; // Let HGI-LOCAL-HUB decide node vs cloud
    }

    return {
      type,
      severity,
      reason,
      metrics,
      suggestedTarget,
      timestamp: new Date().toISOString(),
      sourceAdapter: this._config.adapterId,
      mandatory,
      crossedThresholds,
    };
  }

  /**
   * Generate human-readable reason for handoff
   */
  private _generateReason(crossedThresholds: string[], criticalChecks: ThresholdCheck[]): string {
    if (criticalChecks.length > 0) {
      const critical = criticalChecks[0];
      return `Critical threshold crossed: ${critical.name} (${Math.round(critical.actual)} > ${critical.limit})`;
    }

    if (crossedThresholds.length === 1) {
      return `Threshold crossed: ${crossedThresholds[0]}`;
    }

    return `Multiple thresholds crossed: ${crossedThresholds.join(', ')}`;
  }

  /**
   * Reset internal state (e.g., slow inference counter)
   */
  reset(): void {
    this._slowInferenceCount = 0;
  }

  /**
   * Get current configuration
   */
  get config(): EvaluatorConfig {
    return { ...this._config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EvaluatorConfig>): void {
    this._config = {
      ...this._config,
      ...config,
    };
  }
}

/**
 * Create a handoff evaluator with default or custom configuration
 */
export function createHandoffEvaluator(config?: Partial<EvaluatorConfig>): HandoffEvaluator {
  return new HandoffEvaluator(config);
}
