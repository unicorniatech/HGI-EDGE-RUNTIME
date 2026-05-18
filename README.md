# HGI Edge Runtime

Local-first, offline-capable inference runtime for HGI edge devices.

**Status**: Phase 1 - Foundation (architecture only, no inference yet)

## Purpose

This is the clean-room runtime foundation for:
- MOLIE Mini
- EVA Mini
- HGI local inference
- local-first AI infrastructure
- HGI-LOCAL-HUB handoff

## Architecture Principles

- **Local-first**: All inference happens on-device by default
- **Offline-capable**: No network required for core operations
- **Adapter-based**: Multiple backends via standard interface
- **Sovereign**: User owns compute, data, and models
- **Backend-agnostic**: No hard dependency on any ML framework
- **Privacy-first**: No telemetry, no cloud leakage
- **Lightweight**: Runs on mini-PCs and mobile devices

## Repository Structure

```
├── src/
│   ├── types/          # TypeScript interfaces and types
│   ├── core/           # Runtime core (lifecycle, registry)
│   └── index.ts        # Main exports
├── adapters/
│   ├── llama_cpp/      # llama.cpp adapter (Phase 2)
│   ├── onnx/           # ONNX Runtime adapter (future)
│   ├── mlx/            # Apple MLX adapter (future)
│   └── coreml/         # Apple CoreML adapter (future)
├── tests/              # Test suite
├── examples/           # Usage examples
└── docs/               # Documentation
    ├── HGI_EDGE_RUNTIME_ARCHITECTURE.md
    ├── HGI_RUNTIME_ROADMAP.md
    └── HGI_RUNTIME_PRINCIPLES.md
```

## Quick Start

```bash
# Install dependencies (Phase 1: dev only, no runtime deps yet)
npm install

# Build
npm run build

# Run tests
npm test

# Lint
npm run lint
```

## Usage (Phase 2+)

```typescript
import { createRuntime } from 'hgi-edge-runtime';

const runtime = createRuntime({
  defaultTimeoutMs: 60000,
  maxMemoryBytes: 4 * 1024 * 1024 * 1024,
});

await runtime.initialize();
await runtime.load('./models/model.gguf');

const response = await runtime.infer({
  model: './models/model.gguf',
  input: 'Hello, world',
});

console.log(response.content);
```

## Roadmap

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Foundation (architecture) | **Current** |
| 2 | llama.cpp prototype | Planned |
| 3 | Local handoff signaling | Planned |
| 4 | STT/VAD (experimental) | Planned |
| 5 | Embeddings | Planned |
| 6 | RAG foundation | Planned |
| 7 | EVA Mini integration | Planned |
| 8 | MOLIE Mini integration | Planned |
| 9 | Mobile runtime | Planned |
| 10 | ARM nodes | Planned |
| 11 | Distributed inference | Future |

## Documentation

- [Architecture](docs/HGI_EDGE_RUNTIME_ARCHITECTURE.md)
- [Roadmap](docs/HGI_RUNTIME_ROADMAP.md)
- [Principles](docs/HGI_RUNTIME_PRINCIPLES.md)

## License

MIT
