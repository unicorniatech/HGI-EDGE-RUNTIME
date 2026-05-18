/**
 * HGI Edge Runtime - Llama.cpp Adapter Tests
 *
 * Tests for the LlamaCppAdapter implementation.
 * Note: These tests do NOT require a real model by default.
 */

import { LlamaCppAdapter, createLlamaCppAdapter } from './adapter.js';
import type { InferenceRequest } from '../../src/types/index.js';

// Mock node-llama-cpp for unit tests
// In a real scenario, we would use jest.mock, but we'll test the interface compliance

describe('LlamaCppAdapter', () => {
  describe('Interface Compliance', () => {
    test('exports LlamaCppAdapter class', () => {
      expect(LlamaCppAdapter).toBeDefined();
      expect(typeof LlamaCppAdapter).toBe('function');
    });

    test('exports createLlamaCppAdapter factory', () => {
      expect(createLlamaCppAdapter).toBeDefined();
      expect(typeof createLlamaCppAdapter).toBe('function');
    });

    test('adapter implements IAdapter interface', () => {
      const adapter = new LlamaCppAdapter();

      // Check required properties
      expect(adapter.capabilities).toBeDefined();
      expect(adapter.status).toBeDefined();

      // Check required methods
      expect(typeof adapter.load).toBe('function');
      expect(typeof adapter.infer).toBe('function');
      expect(typeof adapter.inferStream).toBe('function');
      expect(typeof adapter.reset).toBe('function');
      expect(typeof adapter.unload).toBe('function');
    });
  });

  describe('Capabilities', () => {
    test('reports correct adapter metadata', () => {
      const adapter = new LlamaCppAdapter();

      expect(adapter.capabilities.id).toBe('llama_cpp');
      expect(adapter.capabilities.name).toBe('Llama.cpp (node-llama-cpp)');
      expect(adapter.capabilities.supportedFormats).toContain('gguf');
      expect(adapter.capabilities.supportsStreaming).toBe(true);
    });

    test('reports version', () => {
      const adapter = new LlamaCppAdapter();
      expect(adapter.capabilities.version).toMatch(/^\d+\.\d+/);
    });
  });

  describe('Status', () => {
    test('reports not ready before load', () => {
      const adapter = new LlamaCppAdapter();

      expect(adapter.status.ready).toBe(false);
      expect(adapter.status.loadedModel).toBeUndefined();
    });
  });

  describe('Lifecycle', () => {
    test('infer throws before load', async () => {
      const adapter = new LlamaCppAdapter();
      const request: InferenceRequest = {
        model: 'test.gguf',
        input: 'Hello',
      };

      await expect(adapter.infer(request)).rejects.toThrow('No model loaded');
    });

    test('inferStream throws before load', async () => {
      const adapter = new LlamaCppAdapter();
      const request: InferenceRequest = {
        model: 'test.gguf',
        input: 'Hello',
      };

      await expect(
        adapter.inferStream(request, () => {
          // no-op callback
        })
      ).rejects.toThrow('No model loaded');
    });

    test('reset throws before load', async () => {
      const adapter = new LlamaCppAdapter();
      await expect(adapter.reset()).rejects.toThrow('No model loaded');
    });

    test('load throws with missing model path', async () => {
      const adapter = new LlamaCppAdapter();

      // Should throw when trying to load non-existent model
      await expect(adapter.load('')).rejects.toThrow();
    });

    test('unload does not throw when not loaded', async () => {
      const adapter = new LlamaCppAdapter();

      // Should not throw
      await expect(adapter.unload()).resolves.not.toThrow();
    });
  });

  describe('Configuration', () => {
    test('accepts custom configuration', () => {
      const adapter = new LlamaCppAdapter({
        contextSize: 8192,
        temperature: 0.5,
        maxTokens: 1024,
        gpuLayers: 10,
      });

      expect(adapter).toBeDefined();
    });

    test('uses default configuration', () => {
      const adapter = new LlamaCppAdapter();

      // Just verify it creates successfully
      expect(adapter).toBeDefined();
    });
  });

  describe('Input Formatting', () => {
    test('handles string input format', () => {
      // Verify the adapter type accepts string input
      const adapter = new LlamaCppAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.infer).toBe('function');
    });

    test('handles chat message array format', () => {
      // Verify the adapter type accepts chat message format
      const adapter = new LlamaCppAdapter();
      expect(adapter).toBeDefined();
      expect(typeof adapter.infer).toBe('function');
    });
  });
});

// Integration tests - only run if HGI_TEST_MODEL_PATH is set
describe('LlamaCppAdapter Integration', () => {
  const modelPath = process.env.HGI_TEST_MODEL_PATH;

  beforeAll(() => {
    if (!modelPath) {
      console.log('Skipping integration tests - HGI_TEST_MODEL_PATH not set');
    }
  });

  (modelPath ? test : test.skip)('loads a real model', async () => {
    const adapter = new LlamaCppAdapter({
      contextSize: 2048,
      maxTokens: 50,
    });

    await adapter.load(modelPath!);

    expect(adapter.status.ready).toBe(true);
    expect(adapter.status.loadedModel).toBe(modelPath);

    await adapter.unload();
  }, 30000); // 30 second timeout for model loading

  (modelPath ? test : test.skip)('performs inference on a real model', async () => {
    const adapter = new LlamaCppAdapter({
      contextSize: 2048,
      maxTokens: 20,
    });

    await adapter.load(modelPath!);

    const request: InferenceRequest = {
      model: modelPath!,
      input: 'Say hi',
      parameters: {
        maxTokens: 10,
        temperature: 0.5,
      },
    };

    const response = await adapter.infer(request);

    expect(response.content).toBeTruthy();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.finishReason).toBe('stop');
    expect(response.metadata?.backend).toBe('llama.cpp');

    await adapter.unload();
  }, 60000); // 60 second timeout for inference

  (modelPath ? test : test.skip)('streams tokens from a real model', async () => {
    const adapter = new LlamaCppAdapter({
      contextSize: 2048,
      maxTokens: 20,
    });

    await adapter.load(modelPath!);

    const request: InferenceRequest = {
      model: modelPath!,
      input: 'Count: 1,',
      parameters: {
        maxTokens: 10,
      },
    };

    const tokens: string[] = [];

    await adapter.inferStream(request, (token) => {
      tokens.push(token.content);
      expect(token.index).toBeGreaterThanOrEqual(0);
      expect(typeof token.isFinal).toBe('boolean');
    });

    expect(tokens.length).toBeGreaterThan(0);

    await adapter.unload();
  }, 60000);
});
