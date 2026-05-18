/**
 * HGI Edge Runtime - Basic Usage Example
 * 
 * Demonstrates the intended API (not functional until Phase 2+).
 */

import { createRuntime } from '../src/core/index.js';
import type { InferenceRequest, TokenChunk, HandoffSignal } from '../src/types/index.js';

async function basicExample() {
  // Create runtime instance
  const runtime = createRuntime({
    defaultTimeoutMs: 60000,
    maxMemoryBytes: 4 * 1024 * 1024 * 1024, // 4GB
    onHandoff: (signal: HandoffSignal) => {
      console.log('Handoff requested:', signal.reason, signal.message);
      // Application would handle handoff to HGI-LOCAL-HUB here
    },
  });

  // Initialize
  await runtime.initialize();

  try {
    // Load a model (Phase 2+)
    await runtime.load('./models/tinyllama.gguf', 'llama_cpp');

    // Simple inference
    const request: InferenceRequest = {
      model: './models/tinyllama.gguf',
      input: 'What is the capital of France?',
      parameters: {
        maxTokens: 100,
        temperature: 0.7,
      },
    };

    // Synchronous inference (Phase 2+)
    const response = await runtime.infer(request);
    console.log('Response:', response.content);

    // Streaming inference (Phase 2+)
    await runtime.inferStream(request, (token: TokenChunk) => {
      process.stdout.write(token.content);
      if (token.isFinal) {
        process.stdout.write('\n');
      }
    });

    // Reset for new conversation
    await runtime.reset();

  } finally {
    // Cleanup
    await runtime.unload();
    await runtime.shutdown();
  }
}

// Run if executed directly
if (require.main === module) {
  basicExample().catch(console.error);
}

export { basicExample };
