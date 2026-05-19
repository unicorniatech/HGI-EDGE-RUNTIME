# HGI Local Llama Handoff Worker

**Phase**: 4B - Worker Node Implementation  
**Status**: Active Development  
**Date**: 2026-05-18

---

## Overview

The HGI Local Llama Handoff Worker is a standalone worker process that:

1. **Polls** the hgi-local-node handoff queue
2. **Claims** available handoff requests
3. **Processes** them using local llama.cpp inference
4. **Completes** handoffs with generated results

This demonstrates the **worker-node pattern** for distributed HGI inference.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    hgi-local-node                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Queue     │───→│  Worker A   │    │  Worker B   │     │
│  │  (queued)   │    │  (claimed)  │    │  (claimed)  │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         ↑                                                    │
│   POST /handoff                                              │
│         │                                                    │
│  ┌─────────────┐                                             │
│  │   Runtime   │                                             │
│  │  (submits)  │                                             │
│  └─────────────┘                                             │
└─────────────────────────────────────────────────────────────┘

Worker Pattern:
- GET /handoff/queue    → Poll for work
- POST /handoff/:id/claim → Reserve handoff
- POST /handoff/:id/start → Mark processing
- POST /handoff/:id/complete → Return result
```

### Why Workers Are Separate

**Separation of concerns**:
- **hgi-local-node**: Queue management, routing, API
- **Worker**: Actual inference execution

**Benefits**:
- Multiple workers can process from same queue
- Workers can be on different machines
- Workers can use different hardware (CPU/GPU)
- Workers can be added/removed dynamically
- Hub stays lightweight

---

## Running the Worker

### Prerequisites

1. **hgi-local-node running**:
   ```bash
   cd /path/to/hgi-local-node
   npm run dev
   ```

2. **TinyLlama model available**:
   ```
   ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
   ```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HGI_LOCAL_HUB_URL` | `http://localhost:4010` | Hub API endpoint |
| `HGI_TEST_MODEL_PATH` | *required* | Path to GGUF model |
| `HGI_WORKER_ID` | `worker-llama-local-dev` | Worker identifier |
| `HGI_WORKER_POLL_MS` | `3000` | Queue poll interval (ms) |
| `HGI_WORKER_ONCE` | `false` | Process one handoff and exit |

### Run Worker (Continuous Mode)

```bash
# Set environment
export HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
export HGI_LOCAL_HUB_URL="http://localhost:4010"
export HGI_WORKER_ID="my-worker-001"

# Run worker
npm run worker:llama
```

### Run Worker (Once Mode - for testing)

```bash
# PowerShell
$env:HGI_LOCAL_HUB_URL="http://localhost:4010"
$env:HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
$env:HGI_WORKER_ONCE="true"
npm run worker:llama
```

---

## Submitting a Handoff

### Using the End-to-End Example

```bash
# Terminal 1: Start worker
npm run worker:llama

# Terminal 2: Submit handoff
$env:HGI_LOCAL_HUB_URL="http://localhost:4010"
$env:HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
$env:HGI_FORCE_HANDOFF="true"
npm run example:e2e
```

### Using curl

```bash
# Submit handoff
curl -X POST http://localhost:4010/handoff \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "test-001",
    "sourceRuntimeId": "test-runtime",
    "originalRequest": "{\"input\":\"Explain quantum computing\"}",
    "localModel": "{\"modelId\":\"tinyllama\"}",
    "handoffSignal": "{\"type\":\"OOM_RISK\"}",
    "metrics": {"heapUsed":1000000},
    "requestedCapability": "llm",
    "createdAt": "2026-05-18T00:00:00Z"
  }'

# Check queue
curl http://localhost:4010/handoff/queue

# Check handoff status
curl http://localhost:4010/handoff/{handoffId}
```

---

## Worker Flow

```
┌─────────────┐
│    Start    │
└──────┬──────┘
       ↓
┌─────────────┐     ✗      ┌─────────────┐
│ Load Model  │───────────→│    Exit     │
│  (once)     │            │   (error)   │
└──────┬──────┘            └─────────────┘
       ✓
       ↓
┌─────────────────────────────────────────┐
│           Worker Loop                   │
│  ┌───────────────────────────────────┐  │
│  │  1. GET /handoff/queue           │  │
│  │     ↓                            │  │
│  │  2. Filter 'queued'              │  │
│  │     ↓                            │  │
│  │  3. POST /handoff/:id/claim      │  │
│  │     ↓                            │  │
│  │  4. POST /handoff/:id/start      │  │
│  │     ↓                            │  │
│  │  5. Run llama.cpp inference      │  │
│  │     ↓                            │  │
│  │  6. POST /handoff/:id/complete   │  │
│  │     (or /fail on error)          │  │
│  └───────────────────────────────────┘  │
│              ↓                           │
│         Sleep (poll interval)            │
│              ↓                           │
│         Continue loop                    │
└─────────────────────────────────────────┘
```

---

## Current Limitations

| Feature | Status | Notes |
|---------|--------|-------|
| Queue polling | ✓ Working | 3-second interval |
| Handoff claiming | ✓ Working | With conflict detection |
| Inference | ✓ Working | llama.cpp adapter |
| Result completion | ✓ Working | Returns generated text |
| Multiple workers | ⚠ Basic | No load balancing yet |
| Worker heartbeats | ✗ Not implemented | Would improve reliability |
| Auto-retry | ✗ Not implemented | Manual retry on failure |
| GPU support | ⚠ Depends on model | llama.cpp handles this |

### Known Issues

1. **Prompt extraction**: Currently parses `originalRequest` from handoff. If format changes, extraction may fail (falls back to default "Hello").

2. **Model reloading**: Worker keeps model loaded. If model file changes, worker must restart.

3. **No graceful shutdown**: SIGINT handling is basic. In-flight handoffs may be lost.

---

## API Methods Added

### HGIHubClient Extensions

```typescript
// List queued handoffs
await hubClient.listHandoffQueue();

// Claim a handoff for this worker
await hubClient.claimHandoff(handoffId, workerId);

// Mark as started (processing)
await hubClient.startHandoff(handoffId);

// Complete with result
await hubClient.completeHandoff(handoffId, {
  text: "Generated content...",
  model: "tinyllama-1.1b",
  workerId: "worker-001",
  metrics: { inferenceTimeMs: 1234 }
});

// Mark as failed
await hubClient.failHandoff(handoffId, {
  message: "Out of memory",
  code: "OOM_ERROR"
});
```

---

## Testing

### Unit Tests (Mocked)

```bash
npm test
```

Tests cover:
- Worker claims queued handoff
- Worker starts processing
- Worker completes with result
- Worker fails on inference error
- Worker exits cleanly in once mode

### Live Test

```bash
# 1. Start hub
cd /path/to/hgi-local-node && npm run dev

# 2. Start worker (Terminal 1)
$env:HGI_TEST_MODEL_PATH="./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
$env:HGI_WORKER_ONCE="true"
npm run worker:llama

# 3. Submit handoff (Terminal 2)
$env:HGI_FORCE_HANDOFF="true"
npm run example:e2e

# 4. Verify result
curl http://localhost:4010/handoff/{handoffId}
```

---

## Future Enhancements

### Phase 4C+ Roadmap

| Feature | Priority | Description |
|---------|----------|-------------|
| Worker heartbeats | High | Notify hub worker is alive |
| Load balancing | Medium | Distribute across workers |
| GPU detection | Medium | Auto-detect CUDA/Metal |
| Model hot-swap | Low | Change model without restart |
| Batch processing | Low | Process multiple handoffs |
| Metrics export | Low | Prometheus/OpenTelemetry |

---

## Troubleshooting

### Worker can't connect to hub

```
ERROR: Hub not reachable at http://localhost:4010
```

**Solution**: Ensure hgi-local-node is running.

### Model fails to load

```
ERROR: Failed to load model: ENOENT
```

**Solution**: Check `HGI_TEST_MODEL_PATH` points to valid GGUF file.

### Handoff queue empty

```
............
```

**Solution**: Submit a handoff first using the e2e example or curl.

### Claim conflicts

```
Handoff already claimed by another worker
```

**Normal**: Multiple workers race to claim. This worker will try next handoff.

---

## Files

| File | Purpose |
|------|---------|
| `examples/llama-handoff-worker.ts` | Worker implementation |
| `src/core/hgi-hub-client.ts` | Extended with queue methods |
| `docs/HGI_LLAMA_HANDOFF_WORKER.md` | This documentation |

---

**Version**: 0.1.0  
**Last Updated**: 2026-05-18
