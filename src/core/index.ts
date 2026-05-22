/**
 * HGI Edge Runtime - Core Exports
 */

export { HGIRuntime, createRuntime, type RuntimeConfig } from './runtime.js';
export { HandoffEvaluator, createHandoffEvaluator, type EvaluatorConfig } from './handoff-evaluator.js';
export { HGIHubClient, createHGIHubClient } from './hgi-hub-client.js';
export { HandoffRuntime, createHandoffRuntime, type HandoffRuntimeConfig, type HandoffResult, type LocalModelInfo } from './handoff-runtime.js';
export { WorkerPool, createWorkerPool, type WorkerPoolConfig, type PoolWorker, type WorkerCapacity, type WorkerMetrics, type WorkerLoadInfo, type WorkerHealthStatus, type WorkerRecoveryPolicy } from './worker-pool.js';
export {
  generateRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshot,
  formatRuntimeHealthSnapshotJSON,
  type RuntimeHealthSnapshot,
} from './runtime-health-snapshot.js';
export {
  RuntimeSupervisor,
  createRuntimeSupervisor,
  type RuntimeSupervisorConfig,
  type SupervisorWarning,
} from './runtime-supervisor.js';
export {
  buildWorkerContract,
  buildWorkerRegistration,
  createLLMWorker,
  createEVAWorker,
  createSTTWorker,
  createTTSWorker,
  createVisionWorker,
  createEmergencyWorker,
  createGenericWorker,
  computeCapacityByCapability,
  generateCoordinationDiagnostics,
  formatDiagnostics,
  validateWorkerContract,
  type WorkerRegistrationOptions,
} from './worker-registration.js';
export {
  LLMProcessor,
  EVAProcessor,
  STTProcessor,
  TTSProcessor,
  VisionProcessor,
  EmergencyProcessor,
  GenericProcessor,
  createProcessor,
  getAvailableProcessorTypes,
  type ProcessorResult,
  type ProcessorRequest,
  type WorkerProcessor,
} from './worker-processors.js';
