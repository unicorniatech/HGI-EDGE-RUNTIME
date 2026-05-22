/**
 * HGI Edge Runtime - Core Exports
 */

export { HGIRuntime, createRuntime, type RuntimeConfig } from './runtime.js';
export { HandoffEvaluator, createHandoffEvaluator, type EvaluatorConfig } from './handoff-evaluator.js';
export { HGIHubClient, createHGIHubClient } from './hgi-hub-client.js';
export { HandoffRuntime, createHandoffRuntime, type HandoffRuntimeConfig, type HandoffResult, type LocalModelInfo } from './handoff-runtime.js';
export { WorkerPool, createWorkerPool, type WorkerPoolConfig, type PoolWorker, type WorkerCapacity, type WorkerMetrics, type WorkerLoadInfo, type WorkerHealthStatus } from './worker-pool.js';
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
