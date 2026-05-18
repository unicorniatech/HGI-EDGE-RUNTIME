# CoreML Adapter

**Status**: Placeholder (Phase 1)
**Target Phase**: Phase 9 - Mobile Runtime (iOS/macOS)

## Purpose

Adapter for Apple CoreML framework.
Native iOS and macOS inference with hardware acceleration.

## Responsibilities

- Load CoreML models (.mlmodelc)
- Execute inference via CoreML
- Leverage Neural Engine on Apple devices
- Handle model compilation/caching

## Interface

Must implement: `IAdapter` from `src/types/adapter.ts`

## Implementation Notes

- Requires macOS/iOS development environment
- Limited LLM support in CoreML (may need conversion)
- Consider using CoreML Tools for model conversion

## TODO

- [ ] Evaluate CoreML LLM support
- [ ] Model conversion pipeline
- [ ] Implement IAdapter interface
- [ ] Model loading
- [ ] Inference execution
- [ ] Neural Engine optimization
- [ ] Tests

## Dependencies

- CoreML framework
- coremltools (Python, for conversion)

## Notes

- iOS/macOS only
- May require model conversion from other formats
- Useful for on-device iOS deployment
