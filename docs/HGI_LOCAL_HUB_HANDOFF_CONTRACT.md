# HGI-LOCAL-HUB Handoff Contract

**Status**: Phase 3B - Client Contract Defined  
**Version**: 0.1.0  
**Date**: 2026-05-18

---

## Overview

This document defines the **client-side contract** for HGI Edge Runtime to communicate with **HGI-LOCAL-HUB** nodes. This is a forward-looking specification—HGI-LOCAL-HUB endpoints may not exist yet.

```
┌─────────────────────┐         ┌─────────────────────┐
│   HGI Edge Runtime  │ ───────→ │   HGI-LOCAL-HUB   │
│   (Client)          │  HTTP    │   (Server)          │
│                     │          │                     │
│ • Detects handoff   │          │ • Receives handoff  │
│ • Builds request    │          │ • Routes to nodes   │
│ • Submits to hub    │          │ • Returns result    │
└─────────────────────┘          └─────────────────────┘
```

---

## Why This Contract Exists

### The Handoff Problem

When local inference cannot complete:
1. Out of memory
2. Prompt too large
3. Model unavailable
4. Timeout risk

The runtime needs to **escalate** to a peer node.

### The Solution

A simple HTTP contract for:
- Discovering hub capabilities
- Submitting handoff requests
- Tracking handoff status
- Receiving results

---

## Proposed Endpoints

### 1. Health Check

```
GET /health
```

**Purpose**: Verify hub is operational

**Response** (200 OK):
```json
{
  "healthy": true,
  "version": "1.0.0",
  "timestamp": "2026-05-18T10:30:00Z",
  "availableNodes": 5,
  "queueDepth": 0,
  "uptimeSeconds": 3600
}
```

**Error** (503):
```json
{
  "healthy": false,
  "error": "Queue full",
  "timestamp": "2026-05-18T10:30:00Z"
}
```

---

### 2. Capabilities Query

```
GET /capabilities
```

**Purpose**: Discover what the hub supports

**Response** (200 OK):
```json
{
  "hubId": "hub-001",
  "timestamp": "2026-05-18T10:30:00Z",
  "capabilities": [
    {
      "capability": "llm",
      "available": true,
      "nodeCount": 5,
      "averageLatencyMs": 150,
      "supportedModels": ["llama-3-8b", "mistral-7b"]
    },
    {
      "capability": "stt",
      "available": false,
      "nodeCount": 0
    },
    {
      "capability": "embedding",
      "available": true,
      "nodeCount": 3
    }
  ]
}
```

**Capabilities**: `llm`, `stt`, `embedding`, `rag`, `vision`, `tts`

---

### 3. Submit Handoff

```
POST /handoff
```

**Purpose**: Submit inference request for remote execution

**Request Body**:
```json
{
  "requestId": "req-001",
  "sourceRuntimeId": "runtime-001",
  "sourceDeviceId": "device-001",
  "localModel": {
    "modelId": "tinyllama-1.1b",
    "modelPath": "./models/tinyllama.gguf",
    "modelSizeBytes": 637000000
  },
  "originalRequest": {
    "input": "What is the capital of France?",
    "model": "tinyllama-1.1b",
    "parameters": {
      "maxTokens": 100,
      "temperature": 0.7
    }
  },
  "handoffSignal": {
    "type": "OOM_RISK",
    "severity": "high",
    "reason": "Memory threshold crossed",
    "metrics": {
      "timestamp": "2026-05-18T10:30:00Z",
      "heapUsed": 1500000000,
      "rss": 2500000000
    },
    "suggestedTarget": "node",
    "timestamp": "2026-05-18T10:30:00Z",
    "mandatory": false,
    "crossedThresholds": ["heapMemory"]
  },
  "metrics": {
    "timestamp": "2026-05-18T10:30:00Z",
    "heapUsed": 1500000000,
    "inferenceTimeMs": 5000
  },
  "requestedCapability": "llm",
  "createdAt": "2026-05-18T10:30:00Z"
}
```

**Response** (202 Accepted):
```json
{
  "accepted": true,
  "handoffId": "handoff-001",
  "status": "pending",
  "targetNodeId": null,
  "estimatedWaitMs": 1000,
  "result": null,
  "error": null,
  "timestamp": "2026-05-18T10:30:01Z"
}
```

**Response** (503 Service Unavailable):
```json
{
  "accepted": false,
  "status": "rejected",
  "error": {
    "code": "QUEUE_FULL",
    "message": "All nodes busy, queue full"
  },
  "timestamp": "2026-05-18T10:30:01Z"
}
```

---

### 4. Query Handoff Status

```
GET /handoff/:id
```

**Purpose**: Check status of submitted handoff

**Response** (200 OK, in_progress):
```json
{
  "accepted": true,
  "handoffId": "handoff-001",
  "status": "in_progress",
  "targetNodeId": "node-003",
  "estimatedWaitMs": 500,
  "result": null,
  "error": null,
  "timestamp": "2026-05-18T10:30:02Z"
}
```

**Response** (200 OK, completed):
```json
{
  "accepted": true,
  "handoffId": "handoff-001",
  "status": "completed",
  "targetNodeId": "node-003",
  "estimatedWaitMs": 0,
  "result": {
    "content": "The capital of France is Paris.",
    "model": "llama-3-8b",
    "finishReason": "stop",
    "usage": {
      "promptTokens": 10,
      "completionTokens": 8,
      "totalTokens": 18
    }
  },
  "error": null,
  "timestamp": "2026-05-18T10:30:05Z"
}
```

---

## Request/Response Types

### HGIHubHandoffRequest

| Field | Type | Description |
|-------|------|-------------|
| `requestId` | string | Unique request identifier |
| `sourceRuntimeId` | string | Runtime instance ID |
| `sourceDeviceId` | string? | Optional device identifier |
| `localModel` | object | Model that was attempted locally |
| `originalRequest` | InferenceRequest | Original inference request |
| `handoffSignal` | HandoffSignal | Signal that triggered handoff |
| `metrics` | ResourceMetricsSnapshot | Metrics at handoff time |
| `requestedCapability` | HGIHubCapability | Capability needed |
| `createdAt` | string | ISO 8601 timestamp |

### HGIHubHandoffResponse

| Field | Type | Description |
|-------|------|-------------|
| `accepted` | boolean | Whether handoff was accepted |
| `handoffId` | string? | Handoff identifier for tracking |
| `status` | HGIHubHandoffStatus | Current status |
| `targetNodeId` | string? | Assigned node (if known) |
| `estimatedWaitMs` | number? | Estimated wait time |
| `result` | InferenceResponse? | Result (if completed) |
| `error` | object? | Error details (if failed) |

### HGIHubHandoffStatus

- `pending` - Waiting for node assignment
- `queued` - In queue for execution
- `assigned` - Assigned to specific node
- `in_progress` - Currently executing
- `completed` - Successfully finished
- `failed` - Execution failed
- `rejected` - Handoff rejected
- `timeout` - Exceeded time limit

---

## Client Implementation

### Usage

```typescript
import { createHGIHubClient } from 'hgi-edge-runtime';

const client = createHGIHubClient({
  baseUrl: 'http://localhost:4010',
  timeoutMs: 30000,
  runtimeId: 'my-runtime',
});

// Check health
const health = await client.health();
console.log('Hub healthy:', health.healthy);

// Query capabilities
const caps = await client.capabilities();
console.log('LLM available:', caps.capabilities.find(c => c.capability === 'llm')?.available);

// Submit handoff
const response = await client.submitHandoff({
  requestId: 'req-001',
  sourceRuntimeId: 'my-runtime',
  localModel: { modelId: 'tinyllama' },
  originalRequest: { input: 'Hello', model: 'tinyllama', parameters: {} },
  handoffSignal: { /* ... */ },
  metrics: { timestamp: new Date().toISOString() },
  requestedCapability: 'llm',
  createdAt: new Date().toISOString(),
});

console.log('Handoff ID:', response.handoffId);

// Check status
const status = await client.getHandoffStatus(response.handoffId!);
console.log('Status:', status.status);
```

### Error Handling

```typescript
import { HGIHubError } from 'hgi-edge-runtime';

try {
  await client.health();
} catch (error) {
  if (error instanceof HGIHubError) {
    switch (error.type) {
      case 'not_found':
        console.log('Endpoint not implemented yet');
        break;
      case 'timeout':
        console.log('Request timed out');
        break;
      case 'network':
        console.log('Hub not reachable');
        break;
      default:
        console.log('Error:', error.message);
    }
  }
}
```

---

## Current Status

### Implemented ✓

- [x] Type definitions (`src/types/hub-handoff.ts`)
- [x] Client implementation (`src/core/hgi-hub-client.ts`)
- [x] Mocked tests (`tests/hgi-hub-client.test.ts`)
- [x] Demo example (`examples/handoff-client-demo.ts`)
- [x] This documentation

### Not Yet Implemented

- [ ] HGI-LOCAL-HUB endpoints (`/health`, `/capabilities`, `/handoff`)
- [ ] End-to-end integration testing
- [ ] Signed handoff envelopes
- [ ] Authentication/authorization

---

## Next Required Change in HGI-LOCAL-HUB

To complete Phase 3B, HGI-LOCAL-HUB needs:

1. **Health endpoint** (`GET /health`)
   - Return hub status
   - Include version, node count

2. **Capabilities endpoint** (`GET /capabilities`)
   - List supported capabilities
   - Include node availability

3. **Handoff endpoint** (`POST /handoff`)
   - Accept handoff requests
   - Return handoff ID
   - Queue for execution

4. **Status endpoint** (`GET /handoff/:id`)
   - Query handoff status
   - Return result when complete

---

## Security Considerations

### Current (Phase 3B)

- HTTP only (assumes localhost/trusted network)
- No authentication
- No request signing

### Future (Phase 4+)

- HTTPS with mTLS
- Request signing
- Node attestation
- Capability-based access control

---

## Future: Signed Handoff Envelopes

For untrusted networks, requests should be signed:

```json
{
  "request": { /* ... */ },
  "signature": {
    "algorithm": "ed25519",
    "publicKey": "...",
    "signature": "..."
  }
}
```

This enables:
- Request authenticity verification
- Replay attack prevention
- Non-repudiation

---

## Files Created

| File | Purpose |
|------|---------|
| `src/types/hub-handoff.ts` | Type definitions |
| `src/core/hgi-hub-client.ts` | Client implementation |
| `tests/hgi-hub-client.test.ts` | Mocked tests |
| `examples/handoff-client-demo.ts` | Demo script |
| `docs/HGI_LOCAL_HUB_HANDOFF_CONTRACT.md` | This document |

---

**Document Version**: 0.1.0  
**Last Updated**: 2026-05-18
