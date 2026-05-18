# HGI Llama.cpp Adapter Usage Guide

**Status**: Phase 2B - Minimal Implementation Complete  
**Backend**: node-llama-cpp v3.18.1

---

## Overview

The Llama.cpp Adapter provides local GGUF model inference using the `node-llama-cpp` library. This adapter implements the `IAdapter` interface and supports:

- GGUF format models (Q4_K_M, Q5, Q8, FP16, FP32)
- CPU and GPU (CUDA/Metal/Vulkan) inference
- Token streaming
- Model quantization detection

---

## Installation

### Prerequisites

- Node.js 18+ (already configured in project)
- Windows x86_64 (current development target)
- Optional: CUDA Toolkit 11.8+ for GPU support

### Install Dependency

```bash
npm install node-llama-cpp
```

**Note**: First install downloads prebuilt binaries (~30-100MB). This may take several minutes.

---

## Model Setup

### Download a Test Model

**Recommended for testing**: TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf

```bash
# Create models directory
mkdir models

# Download from Hugging Face (using curl or browser)
# Via browser: https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF
# Download: tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Place in models/ directory
```

**Model Specifications**:
- **Name**: TinyLlama 1.1B Chat
- **Format**: GGUF Q4_K_M
- **Size**: ~600MB
- **Quantization**: 4-bit (good speed/quality balance)
- **Context**: 2048 tokens
- **Use case**: Testing, development, lightweight inference

### Alternative Models

| Model | Size | Use Case |
|-------|------|----------|
| TinyLlama-1.1B-Q4_K_M | ~600MB | Testing, development |
| Phi-2-Q4_K_M | ~1.6GB | Better quality, still small |
| Llama-2-7B-Q4_K_M | ~3.8GB | Production quality |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HGI_TEST_MODEL_PATH` | Yes (for examples) | Path to GGUF model file |
| `CUDA_VISIBLE_DEVICES` | No | GPU device selection |

---

## Running the Example

### Basic Usage

```bash
# Set model path (PowerShell)
$env:HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"

# Run basic example
npm run example:llama

# Run streaming example
npm run example:llama:stream
```

**Note**: Project uses ESM (`"type": "module"`). Run compiled JS from `dist/`, not TS directly.

### Expected Output

```
========================================
HGI Edge Runtime - Llama.cpp Example
========================================

Backend: Llama.cpp (node-llama-cpp)
Version: 3.18.1
Supported formats: gguf

Loading model: ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
Model loaded in 2500ms
Status: Ready

Running inference (non-streaming)...
Prompt: Say hello from HGI Edge Runtime in one sentence.

Response: Hello from HGI Edge Runtime! I'm running locally on your machine.

Statistics:
  Elapsed time: 850 ms
  Backend: llama.cpp
  Model path: ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
  Tokens (prompt): 12
  Tokens (completion): 18
  Tokens (total): 30

Running inference (streaming)...
Prompt: Say hello from HGI Edge Runtime in one sentence.

Response: Hello from HGI Edge Runtime! I'm running locally on your machine.

Streaming elapsed time: 820 ms

Unloading model...
Done!
```

---

## API Usage

### Basic Inference

```typescript
import { createLlamaCppAdapter } from './adapters/llama_cpp/index.js';

const adapter = createLlamaCppAdapter({
  contextSize: 2048,
  temperature: 0.7,
  maxTokens: 512,
  gpuLayers: 0, // 0 = CPU only, increase for GPU offloading
});

await adapter.load('./models/model.gguf');

const response = await adapter.infer({
  model: './models/model.gguf',
  input: 'Hello, world!',
  parameters: {
    maxTokens: 100,
    temperature: 0.7,
  },
});

console.log(response.content);
await adapter.unload();
```

### Streaming Inference

```typescript
await adapter.inferStream(
  {
    model: './models/model.gguf',
    input: 'Count to 5:',
  },
  (token) => {
    process.stdout.write(token.content);
    if (token.isFinal) {
      console.log(); // newline
    }
  }
);
```

---

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `contextSize` | 4096 | Context window size (tokens) |
| `temperature` | 0.7 | Sampling temperature |
| `maxTokens` | 512 | Maximum tokens to generate |
| `gpuLayers` | 0 | GPU layers to offload (0 = CPU only) |
| `batchSize` | 512 | Batch size for prompt processing |
| `threads` | auto | Number of CPU threads |

---

## Windows-Specific Notes

### Prebuilt Binaries

- node-llama-cpp downloads Windows x64 binaries automatically
- No CMake or Visual Studio required for basic usage
- First run may take 2-5 minutes for binary download

### GPU Support

**CUDA**:
1. Install CUDA Toolkit 11.8 or 12.x
2. Set `gpuLayers` to offload layers to GPU
3. Monitor with `nvidia-smi`

**Vulkan** (Alternative):
- May work on AMD/Intel GPUs
- Less tested than CUDA path

### Common Issues

**Issue**: "Cannot find module 'node-llama-cpp'"  
**Fix**: Run `npm install node-llama-cpp`

**Issue**: Binary download fails  
**Fix**: Check internet connection, or manually download from GitHub releases

**Issue**: Out of memory  
**Fix**: Reduce `contextSize` or use smaller model (Q4_K_M instead of Q8)

---

## Testing

### Unit Tests (No Model Required)

```bash
npm test
```

Tests validate:
- Adapter interface compliance
- Lifecycle methods
- Error handling
- Configuration options

### Integration Tests (Requires Model)

```bash
# Set model path
set HGI_TEST_MODEL_PATH=./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

# Run all tests (includes integration)
npm test
```

Integration tests skip automatically if `HGI_TEST_MODEL_PATH` is not set.

---

## Git Ignore

**IMPORTANT**: Never commit model files!

The `models/` directory is already in `.gitignore`:

```gitignore
# Runtime
models/
*.gguf
*.bin
*.onnx
*.mlmodel
```

---

## Known Limitations

### Phase 2B Limitations

1. **No grammar support** - JSON schema validation not implemented yet
2. **No embedding generation** - Text embeddings not supported
3. **Basic chat formatting** - Simple concatenation, not native chat templates
4. **Estimated token counts** - Actual token counts from llama.cpp not exposed
5. **No automatic quantization detection** - Must know model quantization manually

### Planned for Phase 2C

- Grammar/JSON mode support
- Embedding generation
- Better chat template support
- Memory usage reporting
- Handoff signal integration (OOM detection)

---

## Performance Tips

### CPU Optimization

```typescript
const adapter = createLlamaCppAdapter({
  threads: 8, // Match your CPU cores
  batchSize: 512, // Increase for faster prompt processing
});
```

### GPU Optimization

```typescript
const adapter = createLlamaCppAdapter({
  gpuLayers: 33, // Offload all layers for 7B models
  contextSize: 4096,
});
```

### Memory Management

- Use Q4_K_M quantization for balance of speed/quality
- Reduce `contextSize` if OOM errors occur
- Call `unload()` when done to free VRAM

---

## Next Steps

1. **Test with real model**: Download TinyLlama and run example
2. **Verify streaming**: Check token-by-token generation
3. **Profile performance**: Measure tokens/second on your hardware
4. **Phase 2C**: Add advanced features (grammar, embeddings)

---

## Streaming Example

```bash
$env:HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
npm run example:llama:stream
```

**Output**:
```
========================================
HGI Edge Runtime - Llama.cpp Streaming
========================================

Backend: Llama.cpp (node-llama-cpp)
Version: 3.18.1

Loading model: ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
Model loaded in 1952ms
Status: Ready
Memory used: 18 MB

Running streaming inference...
Prompt: Say hello from HGI Edge Runtime in one sentence.

Response:
---------
HGI Edge Runtime greets you.
---------

Statistics:
  Time to first token: 544ms
  Total streaming time: 2197 ms
  Backend: llama.cpp
  Tokens (total): 19
  Time to first token (reported): 280 ms
  Model load time: 1952 ms
  Memory (heap): 27 MB
  Memory (RSS): 904 MB
```

## Metrics Available

| Metric | Description | Availability |
|--------|-------------|--------------|
| `loadTimeMs` | Model loading time | Always |
| `elapsedMs` | Total inference time | Always |
| `timeToFirstTokenMs` | Time until first token | Streaming only |
| `promptTokens` | Estimated prompt tokens | Always |
| `completionTokens` | Estimated completion tokens | Always |
| `memoryUsage` | Node.js heap/rss | Always |

## Windows ESM Notes

This project uses ES Modules (`"type": "module"`) for compatibility with `node-llama-cpp`.

**Running examples**:
```powershell
# Build first
npm run build

# Run compiled JS (not TS)
$env:HGI_TEST_MODEL_PATH="./models/model.gguf"
node dist/examples/llama-cpp-basic.js
```

**Common issues**:
- Use `node dist/...` not `npx ts-node` (ESM compatibility)
- Set env vars with `$env:` in PowerShell
- Use forward slashes in paths

## Known Limitations

1. **Token display in streaming**: May show token IDs during streaming, but final text is correct
2. **Estimated token counts**: Uses 4 chars/token approximation, not exact tokenizer
3. **No grammar support**: JSON schema validation not yet implemented
4. **No embeddings**: Text embeddings not supported in this phase
5. **Session per inference**: Each call creates/disposes session (proper cleanup)

## Exact Commands Used Successfully

```powershell
# 1. Build
npm run build

# 2. Basic inference
$env:HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
node dist/examples/llama-cpp-basic.js

# 3. Streaming inference
$env:HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
node dist/examples/llama-cpp-stream.js

# 4. Tests
$env:NODE_OPTIONS="--experimental-vm-modules"
npm test
```

**Document Version**: 0.2.0  
**Last Updated**: 2026-05-18
