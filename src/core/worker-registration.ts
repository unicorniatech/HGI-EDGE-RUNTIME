/**
 * HGI Worker Registration Builder
 *
 * Builds normalized worker registration payloads with stable IDs,
 * proper defaults, and local-only enforcement.
 *
 * @module src/core/worker-registration
 */

import type { HGIHubClient } from './hgi-hub-client.js';
import type {
  WorkerCapabilityContract,
  WorkerRegistrationPayload,
  WorkerType,
  RuntimeTag,
  LocalCoordinationDiagnostics,
  CapabilityCapacity,
  CapabilityJobStats,
} from '../types/worker-capability.js';

// Re-export types for convenience
export type {
  WorkerCapabilityContract,
  WorkerRegistrationPayload,
  WorkerType,
  RuntimeTag,
  LocalCoordinationDiagnostics,
  CapabilityCapacity,
  CapabilityJobStats,
} from '../types/worker-capability.js';
import {
  isValidWorkerType,
  getDefaultCapabilities,
  getDefaultPriorityBias,
  getDefaultIO,
} from '../types/worker-capability.js';

// Re-export utility functions
export { isValidWorkerType } from '../types/worker-capability.js';

/**
 * Options for building a worker registration
 */
export interface WorkerRegistrationOptions {
  /** Worker type specialization */
  workerType: WorkerType;

  /** Base worker ID (will be normalized) */
  workerId: string;

  /** Optional model name */
  modelName?: string;

  /** Optional model family */
  modelFamily?: string;

  /** Override default capabilities */
  capabilities?: string[];

  /** Override default input types */
  inputTypes?: ('text' | 'audio' | 'image' | 'video' | 'binary' | 'json')[];

  /** Override default output types */
  outputTypes?: ('text' | 'audio' | 'image' | 'binary' | 'json' | 'stream')[];

  /** Maximum concurrent jobs (default: 1) */
  maxConcurrentJobs?: number;

  /** Override default priority bias */
  priorityBias?: number;

  /** Additional runtime tags */
  runtimeTags?: RuntimeTag[];

  /** Allow cloud fallback (default: false = local-only) */
  localOnly?: boolean;

  /** Worker version */
  version?: string;

  /** Hub client instance */
  hubClient: HGIHubClient;
}

/**
 * Build a normalized worker capability contract
 */
export function buildWorkerContract(
  options: Omit<WorkerRegistrationOptions, 'hubClient'>
): WorkerCapabilityContract {
  // Validate worker type
  if (!isValidWorkerType(options.workerType)) {
    throw new Error(`Invalid worker type: ${options.workerType}`);
  }

  const workerType = options.workerType;

  // Get defaults
  const defaultCapabilities = getDefaultCapabilities(workerType);
  const defaultIO = getDefaultIO(workerType);
  const defaultPriorityBias = getDefaultPriorityBias(workerType);

  // Normalize worker ID (ensure stable, readable ID)
  const normalizedId = normalizeWorkerId(options.workerId, workerType);

  // Build contract with defaults and overrides
  const contract: WorkerCapabilityContract = {
    id: normalizedId,
    workerType,
    capabilities: options.capabilities ?? defaultCapabilities,
    modelName: options.modelName,
    modelFamily: options.modelFamily,
    inputTypes: options.inputTypes ?? defaultIO.inputs,
    outputTypes: options.outputTypes ?? defaultIO.outputs,
    maxConcurrentJobs: options.maxConcurrentJobs ?? 1,
    priorityBias: options.priorityBias ?? defaultPriorityBias,
    runtimeTags: options.runtimeTags ?? ['local-llm'],
    localOnly: options.localOnly ?? true, // Default to local-only
    registeredAt: new Date().toISOString(),
    version: options.version ?? '1.0.0',
  };

  return contract;
}

/**
 * Build a complete worker registration payload
 */
export function buildWorkerRegistration(
  options: WorkerRegistrationOptions
): WorkerRegistrationPayload {
  const contract = buildWorkerContract(options);

  return {
    contract,
    hubClient: options.hubClient as unknown,
  };
}

/**
 * Normalize worker ID to stable format
 *
 * Format: {type}-{instance}-{random}
 * Example: llama-01-a7x9, eva-02-b3m2
 */
function normalizeWorkerId(baseId: string, workerType: WorkerType): string {
  // If already properly formatted, return as-is
  if (baseId.match(new RegExp(`^${workerType}-\\d+-[a-z0-9]{4}$`, 'i'))) {
    return baseId.toLowerCase();
  }

  // Clean base ID
  const clean = baseId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Add random suffix for stability
  const randomSuffix = Math.random().toString(36).substring(2, 6);

  return `${workerType}-${clean}-${randomSuffix}`;
}

/**
 * Create a standard LLM worker registration
 */
export function createLLMWorker(
  workerId: string,
  hubClient: HGIHubClient,
  options?: {
    modelName?: string;
    maxConcurrentJobs?: number;
    priorityBias?: number;
  }
): WorkerRegistrationPayload {
  return buildWorkerRegistration({
    workerType: 'llm',
    workerId,
    hubClient,
    modelName: options?.modelName,
    maxConcurrentJobs: options?.maxConcurrentJobs ?? 1,
    priorityBias: options?.priorityBias,
    runtimeTags: ['local-llm', 'edge-optimized'],
  });
}

/**
 * Create a standard EVA worker registration
 */
export function createEVAWorker(
  workerId: string,
  hubClient: HGIHubClient,
  options?: {
    modelName?: string;
    maxConcurrentJobs?: number;
    priorityBias?: number;
  }
): WorkerRegistrationPayload {
  return buildWorkerRegistration({
    workerType: 'eva',
    workerId,
    hubClient,
    modelName: options?.modelName,
    maxConcurrentJobs: options?.maxConcurrentJobs ?? 1,
    priorityBias: options?.priorityBias ?? 75, // EVA gets higher priority
    runtimeTags: ['local-llm', 'edge-optimized'],
  });
}

/**
 * Create a standard STT worker registration
 */
export function createSTTWorker(
  workerId: string,
  hubClient: HGIHubClient,
  options?: {
    modelName?: string;
    maxConcurrentJobs?: number;
  }
): WorkerRegistrationPayload {
  return buildWorkerRegistration({
    workerType: 'stt',
    workerId,
    hubClient,
    modelName: options?.modelName,
    maxConcurrentJobs: options?.maxConcurrentJobs ?? 2, // STT can handle more concurrency
    runtimeTags: ['realtime', 'edge-optimized'],
  });
}

/**
 * Create a standard TTS worker registration
 */
export function createTTSWorker(
  workerId: string,
  hubClient: HGIHubClient,
  options?: {
    modelName?: string;
    maxConcurrentJobs?: number;
  }
): WorkerRegistrationPayload {
  return buildWorkerRegistration({
    workerType: 'tts',
    workerId,
    hubClient,
    modelName: options?.modelName,
    maxConcurrentJobs: options?.maxConcurrentJobs ?? 2,
    runtimeTags: ['realtime', 'edge-optimized'],
  });
}

/**
 * Create a standard Vision worker registration
 */
export function createVisionWorker(
  workerId: string,
  hubClient: HGIHubClient,
  options?: {
    modelName?: string;
    maxConcurrentJobs?: number;
  }
): WorkerRegistrationPayload {
  return buildWorkerRegistration({
    workerType: 'vision',
    workerId,
    hubClient,
    modelName: options?.modelName,
    maxConcurrentJobs: options?.maxConcurrentJobs ?? 1,
    runtimeTags: ['edge-optimized'],
  });
}

/**
 * Create an emergency (RedVecinal) worker registration
 */
export function createEmergencyWorker(
  workerId: string,
  hubClient: HGIHubClient,
  options?: {
    modelName?: string;
    maxConcurrentJobs?: number;
  }
): WorkerRegistrationPayload {
  return buildWorkerRegistration({
    workerType: 'emergency',
    workerId,
    hubClient,
    modelName: options?.modelName,
    maxConcurrentJobs: options?.maxConcurrentJobs ?? 3, // Emergency can handle more
    priorityBias: 100, // Highest priority
    runtimeTags: ['emergency-priority', 'local-llm'],
  });
}

/**
 * Create a generic worker registration
 */
export function createGenericWorker(
  workerId: string,
  hubClient: HGIHubClient,
  options?: {
    capabilities?: string[];
    maxConcurrentJobs?: number;
  }
): WorkerRegistrationPayload {
  return buildWorkerRegistration({
    workerType: 'generic',
    workerId,
    hubClient,
    capabilities: options?.capabilities,
    maxConcurrentJobs: options?.maxConcurrentJobs ?? 1,
    runtimeTags: ['local-llm'],
  });
}

/**
 * Compute capacity information by capability
 *
 * Aggregates across multiple worker contracts
 */
export function computeCapacityByCapability(
  contracts: WorkerCapabilityContract[]
): CapabilityCapacity[] {
  const byCapability = new Map<string, CapabilityCapacity>();

  for (const contract of contracts) {
    for (const capability of contract.capabilities) {
      const existing = byCapability.get(capability);

      if (existing) {
        existing.workerCount++;
        existing.totalCapacity += contract.maxConcurrentJobs;
        existing.workers.push(contract.id);
      } else {
        byCapability.set(capability, {
          capability,
          workerCount: 1,
          totalCapacity: contract.maxConcurrentJobs,
          activeJobs: 0, // Will be updated by pool
          availableSlots: contract.maxConcurrentJobs,
          utilizationPercent: 0,
          workers: [contract.id],
        });
      }
    }
  }

  return Array.from(byCapability.values());
}

/**
 * Generate local coordination diagnostics
 */
export function generateCoordinationDiagnostics(
  contracts: WorkerCapabilityContract[]
): LocalCoordinationDiagnostics {
  const now = new Date().toISOString();

  // Count workers by type
  const workersByType: Record<WorkerType, number> = {
    llm: 0,
    eva: 0,
    stt: 0,
    tts: 0,
    vision: 0,
    emergency: 0,
    generic: 0,
  };

  let localOnlyWorkers = 0;
  let cloudFallbackWorkers = 0;

  for (const contract of contracts) {
    (workersByType[contract.workerType] as number)++;

    if (contract.localOnly) {
      localOnlyWorkers++;
    } else {
      cloudFallbackWorkers++;
    }
  }

  // Get capacity by capability
  const capacityByCapability = computeCapacityByCapability(contracts);

  // Build job stats (without actual job data, this is template)
  const jobStatsByCapability: CapabilityJobStats[] = capacityByCapability.map(cap => ({
    capability: cap.capability,
    completedJobs: 0,
    failedJobs: 0,
    successRate: 1,
    averageProcessingTimeMs: 0,
  }));

  return {
    timestamp: now,
    totalWorkers: contracts.length,
    workersByType,
    workerIds: contracts.map(c => c.id),
    capacityByCapability,
    jobStatsByCapability,
    localOnlyWorkers,
    cloudFallbackWorkers,
  };
}

/**
 * Format diagnostics for display
 */
export function formatDiagnostics(diagnostics: LocalCoordinationDiagnostics): string {
  const lines: string[] = [];

  lines.push('╔════════════════════════════════════════════════════════════╗');
  lines.push('║     Local Worker Coordination Diagnostics                  ║');
  lines.push('╚════════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Timestamp: ${diagnostics.timestamp}`);
  lines.push(`Total Workers: ${diagnostics.totalWorkers}`);
  lines.push(`Local-Only: ${diagnostics.localOnlyWorkers} | Cloud Fallback: ${diagnostics.cloudFallbackWorkers}`);
  lines.push('');

  lines.push('Workers by Type:');
  for (const [type, count] of Object.entries(diagnostics.workersByType)) {
    if (count > 0) {
      lines.push(`  ${type.padEnd(10)} ${count} worker(s)`);
    }
  }
  lines.push('');

  lines.push('Registered Workers:');
  for (const workerId of diagnostics.workerIds) {
    lines.push(`  • ${workerId}`);
  }
  lines.push('');

  lines.push('Capacity by Capability:');
  for (const cap of diagnostics.capacityByCapability) {
    const bar = '█'.repeat(Math.round(cap.utilizationPercent / 10)) + '░'.repeat(10 - Math.round(cap.utilizationPercent / 10));
    lines.push(`  ${cap.capability.padEnd(20)} ${bar} ${cap.utilizationPercent.toString().padStart(3)}% | ${cap.activeJobs}/${cap.totalCapacity} jobs`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Validate a worker contract
 */
export function validateWorkerContract(contract: WorkerCapabilityContract): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!contract.id || contract.id.length === 0) {
    errors.push('Worker ID is required');
  }

  if (!isValidWorkerType(contract.workerType)) {
    errors.push(`Invalid worker type: ${contract.workerType}`);
  }

  if (!contract.capabilities || contract.capabilities.length === 0) {
    errors.push('At least one capability is required');
  }

  if (contract.maxConcurrentJobs < 1) {
    errors.push('maxConcurrentJobs must be at least 1');
  }

  if (!contract.inputTypes || contract.inputTypes.length === 0) {
    errors.push('At least one input type is required');
  }

  if (!contract.outputTypes || contract.outputTypes.length === 0) {
    errors.push('At least one output type is required');
  }

  return { valid: errors.length === 0, errors };
}
