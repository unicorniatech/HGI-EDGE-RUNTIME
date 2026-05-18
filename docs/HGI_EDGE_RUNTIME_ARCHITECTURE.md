# HGI Edge Runtime Architecture

## Overview

The HGI Edge Runtime is a local-first, offline-capable inference runtime designed for sovereign AI execution on edge devices. It serves as the foundation for MOLIE Mini, EVA Mini, and HGI local inference workloads.

## Core Philosophy

- **Local-first**: All inference happens on-device by default
- **Offline-capable**: No network required for core operations
- **Sovereign**: User owns their compute and data
- **Backend-agnostic**: Adapter-based architecture supports multiple inference backends
- **Privacy-first**: No telemetry, no cloud leakage
- **Lightweight**: Runs on mini-PCs, mobile devices, and ARM nodes

## Runtime Layers

```
┌─────────────────────────────────────────┐
│           Application Layer             │
│    (MOLIE Mini / EVA Mini / CLI)       │
├─────────────────────────────────────────┤
│           Handoff Layer (future)        │
│    (HGI-LOCAL-HUB integration)         │
├─────────────────────────────────────────┤
│           Runtime Core                  │
│    (lifecycle, registry, scheduler)    │
├─────────────────────────────────────────┤
│           Adapter Layer                 │
│    (llama.cpp / ONNX / MLX / CoreML)   │
├─────────────────────────────────────────┤
│           Hardware Abstraction          │
│    (CPU / GPU / NPU / TPU)             │
└─────────────────────────────────────────┘
```

## Adapter Registry Concept

The runtime uses a registry-based adapter system:

- **Adapters are plugins**: Each backend (llama.cpp, ONNX, etc.) implements a standard interface
- **Runtime-agnostic**: Core runtime knows nothing about specific backends
- **Dynamic loading**: Adapters loaded on-demand based on model requirements
- **Capability negotiation**: Adapters advertise supported ops, precision, memory limits
- **Graceful fallback**: If adapter fails, runtime can try alternatives or signal handoff

### Registry Flow

```
1. Request specifies: model format, preferred backend, constraints
2. Registry queries adapters for compatibility
3. Best-match adapter selected and initialized
4. Adapter loaded into memory
5. Inference executed
6. Adapter can be cached or unloaded
```

## Inference Lifecycle

### Single Inference (`infer()`)

```
load(model) → validate(inputs) → execute → return(result) → [optional: unload]
```

### Streaming Inference (`inferStream()`)

```
load(model) → validate(inputs) → execute → tokenCallback(token) → ... → finish → [optional: unload]
```

### Lifecycle Methods

- **load()**: Initialize adapter, load model weights, warm up cache
- **infer()**: Synchronous inference, returns complete result
- **inferStream()**: Streaming inference, yields tokens via callback
- **reset()**: Clear internal state, keep model loaded
- **unload()**: Release memory, cleanup adapter

## Handoff Concept

When local resources are insufficient:

1. **Detection**: Adapter reports OOM, timeout, or unsupported operation
2. **Signal**: Runtime raises handoff event with request context
3. **Decision**: Application layer decides (queue, reject, or escalate to HGI-LOCAL-HUB)
4. **Graceful**: In-progress work checkpointed if possible

**Note**: HGI-LOCAL-HUB integration is NOT part of this runtime. The runtime only signals handoff conditions; the application handles the actual handoff.

## Local-Only Philosophy

- No cloud APIs in core runtime
- No network calls for inference
- No external model downloads (user-managed models only)
- No telemetry or analytics
- No automatic updates

## Future Integration Boundaries

### EVA Mini Integration
- EVA Mini will consume this runtime as a library
- EVA handles conversation state, persona, orchestration
- Runtime provides inference primitives only

### MOLIE Mini Integration
- MOLIE Mini uses runtime for local LLM execution
- MOLIE manages model selection, prompting, context windows
- Runtime remains model-agnostic

### HGI-LOCAL-HUB Handoff
- Runtime signals when local execution impossible
- Actual handoff logic lives in application layer
- Runtime remains hub-agnostic

## Adapter Interface (Summary)

See `src/types/adapter.ts` for full interface definition.

Key concepts:
- `IAdapter`: Core interface all adapters implement
- `InferenceRequest`: Standardized input format
- `InferenceResponse`: Standardized output format
- `TokenCallback`: Streaming token handler
- `AdapterCapabilities`: What the adapter can do

## Security Considerations

- Sandboxed adapter execution
- Model validation before loading
- Memory limits enforced
- No arbitrary code execution from models

## Performance Considerations

- Zero-copy where possible
- Memory-mapped model weights
- Adapter pooling for repeated use
- Quantization handled at adapter level

---

**Document Version**: 0.1.0  
**Last Updated**: 2026-05-18  
**Status**: Draft
