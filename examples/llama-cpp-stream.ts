/**
 * HGI Edge Runtime - Llama.cpp Streaming Example
 *
 * Demonstrates streaming inference with token-by-token output.
 *
 * Usage:
 *   $env:HGI_TEST_MODEL_PATH="./models/tinyllama.gguf"; npx ts-node examples/llama-cpp-stream.ts
 */

import { createLlamaCppAdapter } from '../adapters/llama_cpp/index.js';
import type { InferenceRequest, TokenChunk } from '../src/types/index.js';

async function main(): Promise<void> {
  const modelPath = process.env.HGI_TEST_MODEL_PATH;

  if (!modelPath) {
    console.error('Error: HGI_TEST_MODEL_PATH environment variable is required');
    console.error('Example: $env:HGI_TEST_MODEL_PATH="./models/model.gguf" npx ts-node examples/llama-cpp-stream.ts');
    process.exit(1);
  }

  console.log('========================================');
  console.log('HGI Edge Runtime - Llama.cpp Streaming');
  console.log('========================================');
  console.log();

  const adapter = createLlamaCppAdapter({
    contextSize: 2048,
    temperature: 0.7,
    maxTokens: 100,
  });

  console.log('Backend:', adapter.capabilities.name);
  console.log('Version:', adapter.capabilities.version);
  console.log();

  try {
    // Load model
    console.log('Loading model:', modelPath);
    const loadStart = Date.now();
    await adapter.load(modelPath);
    const loadTime = Date.now() - loadStart;
    console.log(`Model loaded in ${loadTime}ms`);
    console.log('Status:', adapter.status.ready ? 'Ready' : 'Not ready');
    if (adapter.status.memoryUsed) {
      console.log('Memory used:', Math.round(adapter.status.memoryUsed / 1024 / 1024), 'MB');
    }
    console.log();

    // Prepare inference request
    const request: InferenceRequest = {
      model: modelPath,
      input: 'Say hello from HGI Edge Runtime in one sentence.',
      parameters: {
        maxTokens: 50,
        temperature: 0.7,
      },
    };

    // Streaming inference
    console.log('Running streaming inference...');
    console.log('Prompt:', request.input);
    console.log();
    console.log('Response:');
    console.log('---------');

    const tokens: string[] = [];
    let timeToFirstToken: number | undefined;
    const streamStart = Date.now();

    const response = await adapter.inferStream(request, (chunk: TokenChunk) => {
      if (!chunk.isFinal) {
        tokens.push(chunk.content);
        process.stdout.write(chunk.content);

        // Track time to first token
        if (tokens.length === 1) {
          timeToFirstToken = Date.now() - streamStart;
        }
      }
    });

    const streamTime = Date.now() - streamStart;
    console.log(); // newline after response
    console.log('---------');
    console.log();

    // Print statistics
    console.log('Statistics:');
    console.log('  Time to first token:', timeToFirstToken ? `${timeToFirstToken}ms` : 'N/A');
    console.log('  Total streaming time:', streamTime, 'ms');
    console.log('  Backend:', response.metadata?.backend ?? 'unknown');
    console.log('  Model path:', response.metadata?.modelPath ?? modelPath);
    if (response.usage) {
      console.log('  Tokens (prompt):', response.usage.promptTokens);
      console.log('  Tokens (completion):', response.usage.completionTokens);
      console.log('  Tokens (total):', response.usage.totalTokens);
    }
    if (response.metadata?.timeToFirstTokenMs) {
      console.log('  Time to first token (reported):', response.metadata.timeToFirstTokenMs, 'ms');
    }
    if (response.metadata?.loadTimeMs) {
      console.log('  Model load time:', response.metadata.loadTimeMs, 'ms');
    }
    if (response.metadata?.memoryUsage) {
      const mem = response.metadata.memoryUsage as { heapUsed?: number; rss?: number };
      if (mem.heapUsed) {
        console.log('  Memory (heap):', Math.round(mem.heapUsed / 1024 / 1024), 'MB');
      }
      if (mem.rss) {
        console.log('  Memory (RSS):', Math.round(mem.rss / 1024 / 1024), 'MB');
      }
    }
    console.log();

    // Print full response text
    console.log('Full response text:');
    console.log(response.content.trim());
    console.log();

    // Cleanup
    console.log('Unloading model...');
    await adapter.unload();
    console.log('Done!');

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { main };
