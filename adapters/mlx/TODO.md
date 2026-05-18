# MLX Adapter

**Status**: Placeholder (Phase 1)
**Target Phase**: Phase 9 - Mobile Runtime (iOS/macOS)

## Purpose

Adapter for Apple MLX framework.
Native Apple Silicon and iOS inference.

## Responsibilities

- Load MLX-compatible models
- Execute inference via MLX framework
- Leverage Apple Silicon Neural Engine
- Optimize for Metal Performance Shaders

## Interface

Must implement: `IAdapter` from `src/types/adapter.ts`

## Implementation Notes

- Requires macOS/iOS development environment
- Python MLX bindings exist; Node.js bindings needed
- May require native module development

## TODO

- [ ] Evaluate MLX Node.js binding options
- [ ] Implement IAdapter interface
- [ ] Model loading
- [ ] Inference execution
- [ ] Metal integration
- [ ] Tests

## Dependencies

- MLX framework (Apple)
- Node.js native bindings (to be developed)

## Notes

- macOS/iOS only
- Best performance on Apple Silicon
- Lower priority until mobile phase
