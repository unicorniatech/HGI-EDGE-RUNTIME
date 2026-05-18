# llama.cpp Adapter

**Status**: Phase 2B - Implementation Ready
**Target**: Windows x86_64 with node-llama-cpp

## Selected Approach

**Primary**: `node-llama-cpp` npm package  
**Fallback**: llama.cpp CLI subprocess (if needed)  

See: `docs/HGI_LLAMA_CPP_ADAPTER_FEASIBILITY.md` for full evaluation

## Purpose

Adapter for llama.cpp-based inference using native Node.js bindings.
Supports GGUF format models via node-llama-cpp.

## Responsibilities

- Load GGUF models via node-llama-cpp
- Execute inference with llama.cpp backend
- Handle token streaming via node-llama-cpp events
- Report memory usage
- Signal handoff conditions (OOM, timeout)

## Interface

Must implement: `IAdapter` from `src/types/adapter.ts`

## Phase 2B Implementation Plan

### Step 1: Install Dependency
```bash
npm install node-llama-cpp
```

### Step 2: Download Test Model
- **Model**: `TinyLlama-1.1B-Chat-v1.0-Q4_K_M.gguf`
- **Size**: ~600MB
- **Source**: Hugging Face (TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)
- **Place in**: `models/` directory (gitignored)

### Step 3: Implement Adapter
Create: `adapters/llama_cpp/adapter.ts`

```typescript
// Key implementation points:
// - Use LlamaModel from node-llama-cpp
// - Wrap in IAdapter interface
// - Map inferStream to model's token events
// - Track memory via node-llama-cpp APIs
```

### Step 4: Create Tests
Create: `adapters/llama_cpp/adapter.test.ts`
- Test model loading
- Test basic inference
- Test streaming

## TODO (Phase 2B)

- [ ] Install `node-llama-cpp` dependency
- [ ] Download TinyLlama test model
- [ ] Create `adapter.ts` implementing IAdapter
- [ ] Implement `load()` with model path
- [ ] Implement `infer()` for basic completion
- [ ] Implement `inferStream()` with token callback
- [ ] Add error handling for common failures
- [ ] Create basic test suite
- [ ] Document any Windows-specific setup

## TODO (Phase 2C - Future)

- [ ] GPU (CUDA) support detection
- [ ] Memory limit enforcement
- [ ] Handoff signal integration (OOM, timeout)
- [ ] Model quantization info reporting
- [ ] Context window management
- [ ] Grammar/JSON mode support

## Dependencies

```json
{
  "dependencies": {
    "node-llama-cpp": "^3.18.1"
  }
}
```

## Development Notes

- node-llama-cpp downloads prebuilt binaries automatically
- First install may take time (binary download)
- CMake only needed if building from source
- Keep model files in `models/` (gitignored)
- Use Q4_K_M quantization for testing (good speed/quality balance)

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Binary download fails | Use CLI subprocess fallback |
| Build issues | Document CMake requirements |
| Model too big | Use TinyLlama (600MB), not 7B models |
| Windows quirks | Test thoroughly, document workarounds |
