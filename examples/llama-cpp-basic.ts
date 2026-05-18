/**
 * HGI Edge Runtime - Basic Llama.cpp Example
 *
 * Demonstrates loading a model and running inference with the llama.cpp adapter.
 *
 * Usage:
 *   HGI_TEST_MODEL_PATH=./models/tinyllama.gguf npx ts-node examples/llama-cpp-basic.ts
 */

import { createLlamaCppAdapter } from '../adapters/llama_cpp/index.js';
import type { InferenceRequest } from '../src/types/index.js';

async function main(): Promise<void> {
  // Get model path from environment variable
  const modelPath = process.env.HGI_TEST_MODEL_PATH;

  if (!modelPath) {
    console.error('Error: HGI_TEST_MODEL_PATH environment variable is required');
    console.error('Example: HGI_TEST_MODEL_PATH=./models/model.gguf npx ts-node examples/llama-cpp-basic.ts');
    process.exit(1);
  }

  console.log('========================================');
  console.log('HGI Edge Runtime - Llama.cpp Example');
  console.log('========================================');
  console.log();

  const adapter = createLlamaCppAdapter({
    contextSize: 2048,
    temperature: 0.7,
    maxTokens: 100,
  });

  console.log('Backend:', adapter.capabilities.name);
  console.log('Version:', adapter.capabilities.version);
  console.log('Supported formats:', adapter.capabilities.supportedFormats.join(', '));
  console.log();

  try {
    // Load model
    console.log('Loading model:', modelPath);
    const loadStart = Date.now();
    await adapter.load(modelPath);
    const loadTime = Date.now() - loadStart;
    console.log(`Model loaded in ${loadTime}ms`);
    console.log('Status:', adapter.status.ready ? 'Ready' : 'Not ready');
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

    // Non-streaming inference
    console.log('Running inference (non-streaming)...');
    console.log('Prompt:', request.input);
    console.log();

    const inferStart = Date.now();
    const response = await adapter.infer(request);
    const inferTime = Date.now() - inferStart;

    console.log('Response:', response.content.trim());
    console.log();
    console.log('Statistics:');
    console.log('  Elapsed time:', inferTime, 'ms');
    console.log('  Backend:', response.metadata?.backend ?? 'unknown');
    console.log('  Model path:', response.metadata?.modelPath ?? modelPath);
    if (response.usage) {
      console.log('  Tokens (prompt):', response.usage.promptTokens);
      console.log('  Tokens (completion):', response.usage.completionTokens);
      console.log('  Tokens (total):', response.usage.totalTokens);
    }
    console.log();

    // Streaming inference demo
    console.log('Running inference (streaming)...');
    console.log('Prompt:', request.input);
    console.log();

    const streamStart = Date.now();
    process.stdout.write('Response: ');

    await adapter.inferStream(request, (token) => {
      process.stdout.write(token.content);
      if (token.isFinal) {
        console.log(); // newline after final token
      }
    });

    const streamTime = Date.now() - streamStart;
    console.log();
    console.log('Streaming elapsed time:', streamTime, 'ms');
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

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
