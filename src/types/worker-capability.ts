/**
 * HGI Worker Capability Contract
 *
 * Defines the typed contract for worker capabilities in the local
 * distributed inference system. Supports specialized workers:
 * - LLM / MOLIE (text generation)
 * - EVA (reasoning/expert)
 * - STT (speech-to-text)
 * - TTS (text-to-speech)
 * - Vision (image analysis)
 * - Emergency (RedVecinal priority)
 * - Generic (fallback)
 *
 * All workers default to local-only execution (no cloud required).
 *
 * @module src/types/worker-capability
 */

/**
 * Supported worker types for specialized inference
 */
export type WorkerType =
  | 'llm'
  | 'eva'
  | 'stt'
  | 'tts'
  | 'vision'
  | 'emergency'
  | 'generic';

/**
 * Input data types a worker can accept
 */
export type InputType =
  | 'text'
  | 'audio'
  | 'image'
  | 'video'
  | 'binary'
  | 'json';

/**
 * Output data types a worker can produce
 */
export type OutputType =
  | 'text'
  | 'audio'
  | 'image'
  | 'binary'
  | 'json'
  | 'stream';

/**
 * Runtime tags for worker categorization
 */
export type RuntimeTag =
  | 'local-llm'
  | 'cloud-fallback'
  | 'gpu-accelerated'
  | 'cpu-only'
  | 'edge-optimized'
  | 'batch-capable'
  | 'realtime'
  | 'emergency-priority';

/**
 * Worker capability contract
 *
 * Defines what a worker can do and its operational constraints.
 */
export interface WorkerCapabilityContract {
  /** Unique worker identifier */
  id: string;

  /** Worker specialization type */
  workerType: WorkerType;

  /** Capabilities this worker advertises (e.g., ['llm', 'text-generation']) */
  capabilities: string[];

  /** Optional model name (e.g., 'tinyllama-1.1b') */
  modelName?: string;

  /** Optional model family (e.g., 'llama', 'whisper', 'eva') */
  modelFamily?: string;

  /** Input types this worker can process */
  inputTypes: InputType[];

  /** Output types this worker can produce */
  outputTypes: OutputType[];

  /** Maximum concurrent jobs this worker can handle */
  maxConcurrentJobs: number;

  /** Priority bias for job selection (higher = preferred for high-priority work) */
  priorityBias?: number;

  /** Runtime tags for additional categorization */
  runtimeTags?: RuntimeTag[];

  /** Whether this worker operates in local-only mode (no cloud dependency) */
  localOnly: boolean;

  /** Registration timestamp */
  registeredAt: string;

  /** Optional worker version */
  version?: string;
}

/**
 * Worker registration payload
 *
 * Used when registering a worker with the hub or pool.
 */
export interface WorkerRegistrationPayload {
  /** Worker capability contract */
  contract: WorkerCapabilityContract;

  /** Hub client instance (for pool integration) */
  hubClient: unknown;

  /** Optional initial metrics */
  initialMetrics?: {
    completedJobs?: number;
    failedJobs?: number;
    averageProcessingTimeMs?: number;
  };
}

/**
 * Aggregate capacity information by capability
 */
export interface CapabilityCapacity {
  /** Capability name */
  capability: string;

  /** Total workers with this capability */
  workerCount: number;

  /** Total max concurrent jobs across all workers */
  totalCapacity: number;

  /** Currently active jobs */
  activeJobs: number;

  /** Available slots (totalCapacity - activeJobs) */
  availableSlots: number;

  /** Utilization percentage */
  utilizationPercent: number;

  /** Workers providing this capability */
  workers: string[];
}

/**
 * Aggregate job counts by capability
 */
export interface CapabilityJobStats {
  /** Capability name */
  capability: string;

  /** Total completed jobs across all workers */
  completedJobs: number;

  /** Total failed jobs across all workers */
  failedJobs: number;

  /** Success rate (0-1) */
  successRate: number;

  /** Average processing time in ms */
  averageProcessingTimeMs: number;
}

/**
 * Local coordination diagnostics summary
 */
export interface LocalCoordinationDiagnostics {
  /** Timestamp of diagnostics snapshot */
  timestamp: string;

  /** Total workers registered */
  totalWorkers: number;

  /** Workers by type */
  workersByType: Record<WorkerType, number>;

  /** All registered worker IDs */
  workerIds: string[];

  /** Capacity information by capability */
  capacityByCapability: CapabilityCapacity[];

  /** Job statistics by capability */
  jobStatsByCapability: CapabilityJobStats[];

  /** Local-only worker count */
  localOnlyWorkers: number;

  /** Workers with cloud fallback enabled */
  cloudFallbackWorkers: number;
}

/**
 * Default priority bias values by worker type
 */
export const DEFAULT_PRIORITY_BIAS: Record<WorkerType, number> = {
  emergency: 100,
  eva: 75,
  llm: 50,
  vision: 40,
  stt: 30,
  tts: 30,
  generic: 10,
};

/**
 * Default capabilities by worker type
 */
export const DEFAULT_CAPABILITIES_BY_TYPE: Record<WorkerType, string[]> = {
  llm: ['llm', 'text-generation', 'chat', 'completion'],
  eva: ['eva', 'reasoning', 'expert', 'analysis'],
  stt: ['stt', 'speech-to-text', 'audio-transcription'],
  tts: ['tts', 'text-to-speech', 'audio-generation'],
  vision: ['vision', 'image-analysis', 'object-detection', 'ocr'],
  emergency: ['emergency', 'priority-inference', 'redvecinal'],
  generic: ['generic', 'inference'],
};

/**
 * Default input/output types by worker type
 */
export const DEFAULT_IO_BY_TYPE: Record<WorkerType, { inputs: InputType[]; outputs: OutputType[] }> = {
  llm: { inputs: ['text', 'json'], outputs: ['text', 'json'] },
  eva: { inputs: ['text', 'json'], outputs: ['text', 'json'] },
  stt: { inputs: ['audio', 'binary'], outputs: ['text', 'json'] },
  tts: { inputs: ['text', 'json'], outputs: ['audio', 'binary'] },
  vision: { inputs: ['image', 'binary'], outputs: ['text', 'json'] },
  emergency: { inputs: ['text', 'audio', 'image', 'json'], outputs: ['text', 'json'] },
  generic: { inputs: ['text', 'json', 'binary'], outputs: ['text', 'json', 'binary'] },
};

/**
 * Validate worker type
 */
export function isValidWorkerType(type: string): type is WorkerType {
  return ['llm', 'eva', 'stt', 'tts', 'vision', 'emergency', 'generic'].includes(type);
}

/**
 * Get default capabilities for a worker type
 */
export function getDefaultCapabilities(workerType: WorkerType): string[] {
  return [...DEFAULT_CAPABILITIES_BY_TYPE[workerType]];
}

/**
 * Get default priority bias for a worker type
 */
export function getDefaultPriorityBias(workerType: WorkerType): number {
  return DEFAULT_PRIORITY_BIAS[workerType];
}

/**
 * Get default input/output types for a worker type
 */
export function getDefaultIO(workerType: WorkerType): { inputs: InputType[]; outputs: OutputType[] } {
  return { ...DEFAULT_IO_BY_TYPE[workerType] };
}
