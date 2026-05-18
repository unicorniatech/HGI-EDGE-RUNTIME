# ONNX Adapter

**Status**: Placeholder (Phase 1)
**Target Phase**: Future (post llama.cpp)

## Purpose

Adapter for ONNX Runtime inference.
Supports ONNX format models.

## Responsibilities

- Load ONNX models
- Execute inference via ONNX Runtime
- Handle execution providers (CPU, CUDA, DirectML, etc.)
- Manage input/output tensor formatting

## Interface

Must implement: `IAdapter` from `src/types/adapter.ts`

## Implementation Notes

- Use `onnxruntime-node` package
- Support multiple execution providers
- Handle tensor shape validation

## TODO

- [ ] Implement IAdapter interface
- [ ] Model loading (ONNX)
- [ ] Inference execution
- [ ] Execution provider selection
- [ ] Tests

## Dependencies

- onnxruntime-node

## Notes

- Good for Windows GPU support (DirectML)
- Standard format for many exported models
- Less common for LLMs than GGUF, but useful for other models
