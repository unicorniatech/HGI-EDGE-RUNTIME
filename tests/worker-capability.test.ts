/**
 * HGI Edge Runtime - Worker Capability Contract Tests
 *
 * Tests for worker capability contracts, registration builders,
 * and local coordination diagnostics.
 *
 * @module tests/worker-capability.test
 */

import {
  buildWorkerContract,
  createLLMWorker,
  createEVAWorker,
  createSTTWorker,
  createTTSWorker,
  createVisionWorker,
  createEmergencyWorker,
  createGenericWorker,
  computeCapacityByCapability,
  generateCoordinationDiagnostics,
  validateWorkerContract,
  isValidWorkerType,
} from '../src/core/worker-registration.js';
import type { HGIHubClient } from '../src/core/hgi-hub-client.js';

// Mock Hub Client
const createMockHubClient = (): HGIHubClient =>
  ({ isReachable: async () => true }) as unknown as HGIHubClient;

describe('Worker Capability Contract', () => {
  describe('Worker type validation', () => {
    test('validates correct worker types', () => {
      expect(isValidWorkerType('llm')).toBe(true);
      expect(isValidWorkerType('eva')).toBe(true);
      expect(isValidWorkerType('stt')).toBe(true);
      expect(isValidWorkerType('tts')).toBe(true);
      expect(isValidWorkerType('vision')).toBe(true);
      expect(isValidWorkerType('emergency')).toBe(true);
      expect(isValidWorkerType('generic')).toBe(true);
    });

    test('rejects invalid worker types', () => {
      expect(isValidWorkerType('invalid')).toBe(false);
      expect(isValidWorkerType('cloud')).toBe(false);
      expect(isValidWorkerType('')).toBe(false);
    });
  });

  describe('LLM worker contract', () => {
    test('builds valid llm worker contract', () => {
      const contract = buildWorkerContract({
        workerType: 'llm',
        workerId: 'llama-test',
        modelName: 'tinyllama-1.1b',
        maxConcurrentJobs: 2,
      });

      expect(contract.id).toMatch(/^llm-llama-test-/);
      expect(contract.workerType).toBe('llm');
      expect(contract.modelName).toBe('tinyllama-1.1b');
      expect(contract.capabilities).toContain('llm');
      expect(contract.capabilities).toContain('text-generation');
      expect(contract.inputTypes).toContain('text');
      expect(contract.outputTypes).toContain('text');
      expect(contract.maxConcurrentJobs).toBe(2);
    });

    test('createLLMWorker creates valid registration', () => {
      const hubClient = createMockHubClient();
      const registration = createLLMWorker('llama-main', hubClient, {
        modelName: 'tinyllama',
        maxConcurrentJobs: 2,
      });

      expect(registration.contract.workerType).toBe('llm');
      expect(registration.contract.modelName).toBe('tinyllama');
      expect(registration.contract.localOnly).toBe(true);
      expect(registration.contract.runtimeTags).toContain('local-llm');
    });
  });

  describe('EVA worker contract', () => {
    test('builds valid eva worker contract', () => {
      const contract = buildWorkerContract({
        workerType: 'eva',
        workerId: 'eva-test',
        modelName: 'eva-expert',
        maxConcurrentJobs: 1,
      });

      expect(contract.workerType).toBe('eva');
      expect(contract.capabilities).toContain('eva');
      expect(contract.capabilities).toContain('reasoning');
    });

    test('createEVAWorker has higher priority bias', () => {
      const hubClient = createMockHubClient();
      const registration = createEVAWorker('eva-reasoner', hubClient);

      expect(registration.contract.workerType).toBe('eva');
      expect(registration.contract.priorityBias).toBe(75);
    });
  });

  describe('Placeholder workers (STT, TTS, Vision)', () => {
    test('createSTTWorker builds valid placeholder', () => {
      const hubClient = createMockHubClient();
      const registration = createSTTWorker('stt-test', hubClient);

      expect(registration.contract.workerType).toBe('stt');
      expect(registration.contract.capabilities).toContain('stt');
      expect(registration.contract.capabilities).toContain('speech-to-text');
      expect(registration.contract.inputTypes).toContain('audio');
      expect(registration.contract.outputTypes).toContain('text');
    });

    test('createTTSWorker builds valid placeholder', () => {
      const hubClient = createMockHubClient();
      const registration = createTTSWorker('tts-test', hubClient);

      expect(registration.contract.workerType).toBe('tts');
      expect(registration.contract.capabilities).toContain('tts');
      expect(registration.contract.inputTypes).toContain('text');
      expect(registration.contract.outputTypes).toContain('audio');
    });

    test('createVisionWorker builds valid placeholder', () => {
      const hubClient = createMockHubClient();
      const registration = createVisionWorker('vision-test', hubClient);

      expect(registration.contract.workerType).toBe('vision');
      expect(registration.contract.capabilities).toContain('vision');
      expect(registration.contract.inputTypes).toContain('image');
      expect(registration.contract.outputTypes).toContain('text');
    });
  });

  describe('Emergency worker', () => {
    test('createEmergencyWorker has highest priority', () => {
      const hubClient = createMockHubClient();
      const registration = createEmergencyWorker('emergency-test', hubClient);

      expect(registration.contract.workerType).toBe('emergency');
      expect(registration.contract.priorityBias).toBe(100);
      expect(registration.contract.runtimeTags).toContain('emergency-priority');
    });
  });

  describe('Local-only defaults', () => {
    test('defaults localOnly to true', () => {
      const contract = buildWorkerContract({
        workerType: 'llm',
        workerId: 'test',
      });

      expect(contract.localOnly).toBe(true);
    });

    test('can override localOnly to false', () => {
      const contract = buildWorkerContract({
        workerType: 'llm',
        workerId: 'test',
        localOnly: false,
      });

      expect(contract.localOnly).toBe(false);
    });

    test('all creator functions default to localOnly=true', () => {
      const hubClient = createMockHubClient();

      const llm = createLLMWorker('llm', hubClient);
      const eva = createEVAWorker('eva', hubClient);
      const stt = createSTTWorker('stt', hubClient);
      const tts = createTTSWorker('tts', hubClient);
      const vision = createVisionWorker('vision', hubClient);
      const emergency = createEmergencyWorker('emergency', hubClient);
      const generic = createGenericWorker('generic', hubClient);

      expect(llm.contract.localOnly).toBe(true);
      expect(eva.contract.localOnly).toBe(true);
      expect(stt.contract.localOnly).toBe(true);
      expect(tts.contract.localOnly).toBe(true);
      expect(vision.contract.localOnly).toBe(true);
      expect(emergency.contract.localOnly).toBe(true);
      expect(generic.contract.localOnly).toBe(true);
    });
  });

  describe('Invalid worker type handling', () => {
    test('throws on invalid worker type', () => {
      expect(() => {
        buildWorkerContract({
          workerType: 'invalid' as unknown as import('../src/types/worker-capability.js').WorkerType,
          workerId: 'test',
        });
      }).toThrow('Invalid worker type: invalid');
    });
  });

  describe('Capacity by capability', () => {
    test('computes capacity for single capability', () => {
      const hubClient = createMockHubClient();
      const llmWorker = createLLMWorker('llm', hubClient, { maxConcurrentJobs: 2 });

      const capacities = computeCapacityByCapability([llmWorker.contract]);

      const llmCap = capacities.find(c => c.capability === 'llm');
      expect(llmCap).toBeDefined();
      expect(llmCap!.workerCount).toBe(1);
      expect(llmCap!.totalCapacity).toBe(2);
    });

    test('aggregates capacity across multiple workers', () => {
      const hubClient = createMockHubClient();
      const llm1 = createLLMWorker('llm1', hubClient, { maxConcurrentJobs: 2 });
      const llm2 = createLLMWorker('llm2', hubClient, { maxConcurrentJobs: 3 });

      const capacities = computeCapacityByCapability([
        llm1.contract,
        llm2.contract,
      ]);

      const llmCap = capacities.find(c => c.capability === 'llm');
      expect(llmCap!.workerCount).toBe(2);
      expect(llmCap!.totalCapacity).toBe(5); // 2 + 3
    });

    test('tracks which workers provide each capability', () => {
      const hubClient = createMockHubClient();
      const llm = createLLMWorker('llm', hubClient);

      const capacities = computeCapacityByCapability([llm.contract]);

      const llmCap = capacities.find(c => c.capability === 'llm');
      expect(llmCap!.workers).toContain(llm.contract.id);
    });
  });

  describe('Local coordination diagnostics', () => {
    test('generates diagnostics for multiple workers', () => {
      const hubClient = createMockHubClient();
      const llm = createLLMWorker('llm', hubClient);
      const eva = createEVAWorker('eva', hubClient);
      const stt = createSTTWorker('stt', hubClient);

      const diagnostics = generateCoordinationDiagnostics([
        llm.contract,
        eva.contract,
        stt.contract,
      ]);

      expect(diagnostics.totalWorkers).toBe(3);
      expect(diagnostics.workersByType.llm).toBe(1);
      expect(diagnostics.workersByType.eva).toBe(1);
      expect(diagnostics.workersByType.stt).toBe(1);
      expect(diagnostics.workerIds).toHaveLength(3);
    });

    test('counts localOnly workers correctly', () => {
      const hubClient = createMockHubClient();
      const llm = createLLMWorker('llm', hubClient);
      const eva = createEVAWorker('eva', hubClient);

      const diagnostics = generateCoordinationDiagnostics([
        llm.contract,
        eva.contract,
      ]);

      expect(diagnostics.localOnlyWorkers).toBe(2);
      expect(diagnostics.cloudFallbackWorkers).toBe(0);
    });

    test('includes timestamp', () => {
      const hubClient = createMockHubClient();
      const llm = createLLMWorker('llm', hubClient);

      const diagnostics = generateCoordinationDiagnostics([llm.contract]);

      expect(diagnostics.timestamp).toBeDefined();
      expect(new Date(diagnostics.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Contract validation', () => {
    test('validates valid contract', () => {
      const hubClient = createMockHubClient();
      const registration = createLLMWorker('llm', hubClient);

      const result = validateWorkerContract(registration.contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects missing worker ID', () => {
      const result = validateWorkerContract({
        id: '',
        workerType: 'llm',
        capabilities: ['llm'],
        inputTypes: ['text'],
        outputTypes: ['text'],
        maxConcurrentJobs: 1,
        localOnly: true,
        registeredAt: new Date().toISOString(),
      } as import('../src/types/worker-capability.js').WorkerCapabilityContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Worker ID is required');
    });

    test('detects missing capabilities', () => {
      const result = validateWorkerContract({
        id: 'test',
        workerType: 'llm',
        capabilities: [],
        inputTypes: ['text'],
        outputTypes: ['text'],
        maxConcurrentJobs: 1,
        localOnly: true,
        registeredAt: new Date().toISOString(),
      } as import('../src/types/worker-capability.js').WorkerCapabilityContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one capability is required');
    });

    test('detects invalid maxConcurrentJobs', () => {
      const result = validateWorkerContract({
        id: 'test',
        workerType: 'llm',
        capabilities: ['llm'],
        inputTypes: ['text'],
        outputTypes: ['text'],
        maxConcurrentJobs: 0,
        localOnly: true,
        registeredAt: new Date().toISOString(),
      } as import('../src/types/worker-capability.js').WorkerCapabilityContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('maxConcurrentJobs must be at least 1');
    });

    test('detects invalid worker type', () => {
      const result = validateWorkerContract({
        id: 'test',
        workerType: 'invalid' as unknown as import('../src/types/worker-capability.js').WorkerType,
        capabilities: ['llm'],
        inputTypes: ['text'],
        outputTypes: ['text'],
        maxConcurrentJobs: 1,
        localOnly: true,
        registeredAt: new Date().toISOString(),
      } as import('../src/types/worker-capability.js').WorkerCapabilityContract);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid worker type: invalid');
    });
  });

  describe('Worker ID normalization', () => {
    test('normalizes worker ID with type prefix', () => {
      const contract = buildWorkerContract({
        workerType: 'llm',
        workerId: 'my-worker',
      });

      expect(contract.id).toMatch(/^llm-my-worker-[a-z0-9]{4}$/);
    });

    test('cleans special characters from worker ID', () => {
      const contract = buildWorkerContract({
        workerType: 'llm',
        workerId: 'my_worker@123!',
      });

      // Special chars should be replaced with hyphens
      expect(contract.id).not.toContain('@');
      expect(contract.id).not.toContain('!');
      expect(contract.id.startsWith('llm-my-worker-123')).toBe(true);
    });
  });
});
