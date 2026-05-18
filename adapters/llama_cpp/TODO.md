# llama.cpp Adapter

**Status**: Placeholder (Phase 1)
**Target Phase**: Phase 2 - Llama.cpp Prototype

## Purpose

Adapter for llama.cpp-based inference.
Supports GGUF format models.

## Responsibilities

- Load GGUF models via llama.cpp bindings
- Execute inference with llama.cpp backend
- Handle token streaming via llama.cpp callbacks
- Manage llama.cpp context/kv-cache
- Report memory usage from llama.cpp

## Interface

Must implement: `IAdapter` from `src/types/adapter.ts`

## Implementation Options

1. **Node-llama-cpp**: TypeScript bindings (if compatible)
2. **llama-node**: Alternative bindings
3. **Direct FFI**: Custom bindings to llama.dll
4. **Subprocess**: Spawn llama.cpp CLI (fallback)

## TODO (Phase 2)

- [ ] Evaluate binding options
- [ ] Implement IAdapter interface
- [ ] Model loading (GGUF)
- [ ] Synchronous inference
- [ ] Streaming inference
- [ ] Context management
- [ ] Memory reporting
- [ ] Error handling
- [ ] Tests

## Dependencies

- llama.cpp binary or library
- Node.js FFI bindings (TBD)

## Notes

- Primary target for Windows x86_64
- GPU support via CUDA optional
- Quantization handled by model (GGUF already quantized)
