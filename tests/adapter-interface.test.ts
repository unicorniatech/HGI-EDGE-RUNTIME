/**
 * HGI Edge Runtime - Adapter Interface Tests
 * 
 * Phase 1: Test that types compile and interfaces are valid.
 * Phase 2+: Add functional tests.
 */

import type { IAdapter, InferenceRequest, AdapterCapabilities, TokenCallback } from '../src/types/index.js';

// ============================================================================
// Mock Adapter for Testing Interface Compliance
// ============================================================================

class MockAdapter implements IAdapter {
  readonly capabilities: AdapterCapabilities = {
    id: 'mock',
    name: 'Mock Adapter',
    supportedFormats: ['mock'],
    supportedPrecisions: ['fp32'],
    supportedHardware: ['cpu'],
    supportsStreaming: true,
    supportsBatching: false,
    handlesChatTemplate: false,
    version: '0.1.0',
  };

  status = {
    ready: false,
  };

  async load(_modelPath: string): Promise<void> {
    this.status = { ready: true };
  }

  async infer(_request: InferenceRequest) {
    return {
      content: 'mock response',
      usage: {
        promptTokens: 10,
        completionTokens: 2,
        totalTokens: 12,
      },
      finishReason: 'stop' as const,
    };
  }

  async inferStream(_request: InferenceRequest, callback: TokenCallback) {
    await callback({ content: 'mock', index: 0, isFinal: true });
    return {
      content: 'mock',
      usage: {
        promptTokens: 10,
        completionTokens: 1,
        totalTokens: 11,
      },
      finishReason: 'stop' as const,
    };
  }

  async reset(): Promise<void> {
    // No-op
  }

  async unload(): Promise<void> {
    this.status = { ready: false };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('Adapter Interface', () => {
  test('MockAdapter implements IAdapter', () => {
    const adapter = new MockAdapter();
    
    // Verify interface compliance at compile-time (TypeScript)
    // At runtime, just verify methods exist
    expect(adapter.capabilities).toBeDefined();
    expect(adapter.status).toBeDefined();
    expect(typeof adapter.load).toBe('function');
    expect(typeof adapter.infer).toBe('function');
    expect(typeof adapter.inferStream).toBe('function');
    expect(typeof adapter.reset).toBe('function');
    expect(typeof adapter.unload).toBe('function');
  });

  test('MockAdapter lifecycle', async () => {
    const adapter = new MockAdapter();
    
    expect(adapter.status.ready).toBe(false);
    
    await adapter.load('test-model');
    expect(adapter.status.ready).toBe(true);
    
    const response = await adapter.infer({
      model: 'test',
      input: 'Hello',
    });
    expect(response.content).toBe('mock response');
    
    await adapter.unload();
    expect(adapter.status.ready).toBe(false);
  });

  test('MockAdapter streaming', async () => {
    const adapter = new MockAdapter();
    await adapter.load('test-model');
    
    const tokens: string[] = [];
    
    await adapter.inferStream(
      { model: 'test', input: 'Hello' },
      (chunk) => {
        tokens.push(chunk.content);
      }
    );
    
    expect(tokens.length).toBeGreaterThan(0);
    
    await adapter.unload();
  });
});

describe('Type Definitions', () => {
  test('InferenceRequest structure is valid', () => {
    const request: InferenceRequest = {
      model: 'test-model',
      input: 'test input',
      parameters: {
        maxTokens: 100,
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
      },
    };
    
    expect(request.model).toBe('test-model');
    expect(request.input).toBe('test input');
    expect(request.parameters?.maxTokens).toBe(100);
  });

  test('ChatMessage array input is valid', () => {
    const request: InferenceRequest = {
      model: 'test-model',
      input: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ],
    };
    
    expect(Array.isArray(request.input)).toBe(true);
  });
});
