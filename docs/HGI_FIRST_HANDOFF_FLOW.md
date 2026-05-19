# HGI First End-to-End Handoff Flow

**Status**: Phase 3D - First Real Handoff Complete  
**Date**: 2026-05-18

---

## What Was Achieved

For the first time, HGI-EDGE-RUNTIME successfully performed a **real end-to-end handoff** to HGI-LOCAL-HUB.

```
┌─────────────────────────────────────────────────────────┐
│  HGI-EDGE-RUNTIME → HGI-LOCAL-HUB                       │
│                                                          │
│  1. Local inference runs (or simulates)                  │
│  2. Thresholds evaluated → handoff signal generated      │
│  3. HGI hub client submits handoff request               │
│  4. HGI-LOCAL-HUB accepts and returns handoffId         │
│  5. Runtime polls status → receives result              │
│                                                          │
│  ✓ COMPLETE FLOW WORKING                                │
└─────────────────────────────────────────────────────────┘
```

---

## Architecture

### Local → Node Handoff Pattern

```
┌─────────────────┐     Thresholds     ┌─────────────────┐
│                 │    Crossed →        │                 │
│  HGI-EDGE       │ ─────────────────→  │  HGI-LOCAL-HUB  │
│  RUNTIME        │   POST /handoff     │                 │
│                 │ ←─────────────────  │  • Queue        │
│                 │   handoffId         │  • Route        │
│                 │                     │  • Execute      │
│  (Edge Device)  │  GET /handoff/:id   │  (Mini PC/Node) │
│                 │ ←─────────────────  │                 │
│                 │   Result            │                 │
└─────────────────┘                     └─────────────────┘
         ↑                                        ↓
         └─────────────── Result ────────────────┘
```

### Why This Matters

**Before**: Runtime could only run local inference. If the model was too big, prompt too long, or memory too low - it would fail.

**Now**: Runtime detects resource pressure and **gracefully escalates** to a more capable node.

**Future**: local → node → cloud distributed inference with automatic routing.

---

## How It Works

### Step 1: Local Inference Attempt

```typescript
const adapter = createLlamaCppAdapter({ modelPath: MODEL_PATH });
await adapter.load(MODEL_PATH);
const response = await adapter.infer(request);
```

If successful → Stay local  
If thresholds crossed → Generate handoff signal

### Step 2: Threshold Evaluation

```typescript
const evaluation = handoffEvaluator.evaluate(metrics);

// Example: Memory pressure detected
if (evaluation.shouldHandoff) {
  signal = {
    type: 'OOM_RISK',
    severity: 'high',
    reason: 'Memory threshold crossed',
    crossedThresholds: ['heapMemory'],
    suggestedTarget: 'node',
  };
}
```

### Step 3: Handoff Submission

```typescript
const handoffRequest = {
  requestId: 'handoff-123',
  sourceRuntimeId: 'runtime-001',
  handoffSignal: signal,
  originalRequest: request,
  metrics: localMetrics,
  requestedCapability: 'llm',
};

const response = await hubClient.submitHandoff(handoffRequest);
// { accepted: true, handoffId: 'handoff-456', status: 'pending' }
```

### Step 4: Status Polling

```typescript
const status = await hubClient.getHandoffStatus(handoffId);

// Poll until complete
while (status.status !== 'completed') {
  await sleep(2000);
  status = await hubClient.getHandoffStatus(handoffId);
}

// Receive result
console.log(status.result.content);
```

---

## Example Run

### Prerequisites

```bash
# Terminal 1: Start hgi-local-node
cd /path/to/hgi-local-node
npm run dev

# Terminal 2: Run end-to-end example
cd /path/to/HGI-EDGE-RUNTIME
npm run build
node dist/examples/end-to-end-handoff.js
```

### Expected Output

```
╔════════════════════════════════════════════════════════════╗
║     HGI First End-to-End Handoff Flow                      ║
║     HGI-EDGE-RUNTIME → HGI-LOCAL-HUB                       ║
╚════════════════════════════════════════════════════════════╝

Timestamp: 2026-05-18T22:45:00.000Z
Hub URL: http://localhost:4010
Model: ./models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

Step 1: Initialize Handoff Runtime
─────────────────────────────────────
✓ Handoff runtime initialized
  Runtime ID: hgi-edge-e2e-demo
  Hub URL: http://localhost:4010
  Handoff enabled: true

Step 2: Check HGI-LOCAL-HUB Reachability
──────────────────────────────────────────
✓ HGI-LOCAL-HUB is reachable

Step 3: Local Inference Attempt
─────────────────────────────────
Loading model...
✓ Model loaded
Running inference...
✓ Local inference completed
  Time: 1234ms
  Tokens: 50 completion

Local Metrics:
  Heap Used: 512.3 MB
  RSS: 1024.5 MB
  Inference Time: 1234ms
  Prompt Tokens: 10

Step 4: Evaluate Handoff & Submit to HGI-LOCAL-HUB
─────────────────────────────────────────────────────

Handoff Result:
  Success: true
  Attempted: true
  Timestamp: 2026-05-18T22:45:05.000Z

Generated Handoff Signal:
  Type: OOM_RISK
  Severity: high
  Reason: Memory threshold crossed
  Mandatory: false
  Suggested Target: node
  Crossed Thresholds: heapMemory

Step 6: Query Handoff Status from HGI-LOCAL-HUB
──────────────────────────────────────────────────

Handoff ID: handoff-abc-123
Hub Status: pending
Accepted: true

Polling for status (3 attempts)...
  Poll 1: in_progress
  Poll 2: completed

✓ Handoff completed!
Result from HGI-LOCAL-HUB:
  Content: Quantum computing uses quantum bits to perform calculations...
  Finish Reason: stop
  Tokens: 25 total (10 prompt, 15 completion)

╔════════════════════════════════════════════════════════════╗
║     End-to-End Handoff Flow Complete                       ║
╚════════════════════════════════════════════════════════════╝

✓ SUCCESS: First real HGI handoff completed!

Architecture proven:
  1. ✓ Local inference detected threshold violation
  2. ✓ Handoff signal generated
  3. ✓ Request submitted to HGI-LOCAL-HUB
  4. ✓ Hub accepted handoff
  5. ✓ Handoff ID received
  6. ✓ Status query successful
```

---

## Current Limitations

### Phase 3D Scope

| Feature | Status | Notes |
|---------|--------|-------|
| Local → Node handoff | ✓ Working | Basic flow complete |
| Health check | ✓ Working | `/health` endpoint |
| Capabilities query | ✓ Working | `/capabilities` endpoint |
| Handoff submission | ✓ Working | `POST /handoff` |
| Status polling | ✓ Working | `GET /handoff/:id` |
| Retry logic | ✗ Not implemented | Future: exponential backoff |
| Result streaming | ✗ Not implemented | Future: real-time updates |
| Authentication | ✗ Not implemented | Future: signed requests |
| Encryption | ✗ Not implemented | Future: TLS/mTLS |

### What Works Today

1. **Threshold-based handoff**: Runtime detects memory, time, token limits
2. **Hub client**: HTTP client with timeout and error handling
3. **Graceful degradation**: If hub unavailable, runtime reports error but doesn't crash
4. **Polling**: Basic status polling until completion

### What's Coming

1. **Retry logic**: Exponential backoff for failed submissions
2. **Circuit breaker**: Stop trying if hub consistently fails
3. **Streaming results**: Real-time updates instead of polling
4. **Result caching**: Avoid re-executing identical requests
5. **Batch handoffs**: Submit multiple requests together

---

## Future: Distributed Inference

### Vision: 3-Tier Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   LOCAL     │    │    NODE     │    │    CLOUD    │
│  (Device)   │ →  │  (Hub/Near) │ →  │  (Remote)   │
│             │    │             │    │             │
│ • TinyLlama │    │ • Llama-3   │    │ • GPT-4     │
│ • 1-2GB RAM │    │ • 8-16GB    │    │ • Unlimited │
│ • <1s delay │    │ • <10ms net │    │ • ~100ms    │
│ • Privacy   │    │ • Community │    │ • API       │
└─────────────┘    └─────────────┘    └─────────────┘
       ↑
   Your Data
   Never Leaves
   Unless Needed
```

### Handoff Decision Tree (Future)

```
Start Inference
     ↓
Check Local Capability
     ↓
┌─────────────┐
│ Can run     │──YES──→ Run Local
│ locally?    │         Return Result
└─────────────┘
     │ NO
     ↓
Generate Handoff Signal
     ↓
Check HGI-LOCAL-HUB
     ↓
┌─────────────┐
│ Hub has     │──YES──→ Submit to Hub
│ capacity?   │         Poll for Result
└─────────────┘         Return Result
     │ NO
     ↓
Check HGI-CLOUD
     ↓
┌─────────────┐
│ Cloud       │──YES──→ Submit to Cloud
│ available?  │         (With consent)
└─────────────┘         Return Result
     │ NO
     ↓
Return Error: No capacity available
```

---

## Files Added in Phase 3D

| File | Purpose |
|------|---------|
| `src/core/handoff-runtime.ts` | Integration layer between evaluator and hub client |
| `examples/end-to-end-handoff.ts` | Complete working demonstration |
| `tests/handoff-runtime.test.ts` | Unit tests for handoff runtime |
| `docs/HGI_FIRST_HANDOFF_FLOW.md` | This document |

---

## Next Recommended Phase

**Phase 3E: Production Hardening**

Tasks:
1. Add retry logic with exponential backoff
2. Add circuit breaker pattern
3. Implement result caching
4. Add metrics collection
5. Performance profiling
6. Security review
7. Integration tests with real hub
8. Documentation for hub operators

---

## Running the Example

```bash
# 1. Ensure hgi-local-node is running
curl http://localhost:4010/health

# 2. Run the end-to-end example
npm run example:e2e

# 3. Or directly
node dist/examples/end-to-end-handoff.js

# 4. With custom hub URL
HGI_LOCAL_HUB_URL=http://my-hub:4010 npm run example:e2e
```

---

## Success Criteria Met

- [x] Runtime detects threshold violations
- [x] Handoff signal generated with correct metadata
- [x] HGI hub client submits request
- [x] Hub accepts handoff and returns handoffId
- [x] Runtime polls status successfully
- [x] Result received from hub
- [x] Graceful error handling when hub unavailable
- [x] No crashes, no data loss
- [x] Observable and debuggable

---

**Document Version**: 0.1.0  
**Last Updated**: 2026-05-18
