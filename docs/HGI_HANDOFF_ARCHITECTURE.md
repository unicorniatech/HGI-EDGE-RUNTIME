# HGI Handoff Architecture

**Status**: Phase 3A - Implemented  
**Version**: 0.1.0  
**Date**: 2026-05-18

---

## Overview

The HGI Edge Runtime implements a **hierarchical inference architecture** where decisions flow from edge-first toward cloud-only as needed.

```
┌─────────────────────────────────────────────────────────────┐
│                    HIERARCHICAL INFERENCE                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│   │   LOCAL     │ →  │    NODE     │ →  │    CLOUD    │     │
│   │  (Device)   │    │  (Hub/Near) │    │  (Remote)   │     │
│   └─────────────┘    └─────────────┘    └─────────────┘     │
│          ↑                                                   │
│          │                                                   │
│   ┌──────┴──────┐                                            │
│   │  Handoff    │  Decision to escalate inference            │
│   │  Evaluator  │  when local resources insufficient         │
│   └─────────────┘                                            │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge-First Philosophy

**Core Principle**: Inference starts local, escalates only when necessary.

### Decision Priority

1. **LOCAL** (Priority 1) - Always preferred
   - On-device inference
   - Zero network latency
   - Full privacy
   - Works offline

2. **NODE** (Priority 2) - Nearby peers
   - HGI-LOCAL-HUB nodes
   - Red Vecinal MX participants
   - Low latency (~1-10ms)
   - Community inference

3. **CLOUD** (Priority 3) - Remote services
   - Only when local/node insufficient
   - Requires explicit consent
   - Higher latency
   - Last resort

### Why This Hierarchy?

| Level | Latency | Privacy | Sovereignty | Works Offline |
|-------|---------|---------|-------------|---------------|
| Local | ~0ms | ✓ Full | ✓ Full | ✓ Yes |
| Node | ~1-10ms | ○ Shared | ○ Community | ✗ No |
| Cloud | ~50-200ms | ✗ Leaked | ✗ None | ✗ No |

**Local-first maximizes sovereignty, privacy, and resilience.**

---

## Handoff Signals

When local inference faces resource constraints, the runtime generates a **handoff signal**.

### Signal Types

| Signal | Severity | Meaning | Action |
|--------|----------|---------|--------|
| `HANDOFF_REQUIRED` | critical | Cannot complete locally | Must escalate immediately |
| `HANDOFF_RECOMMENDED` | medium | Local struggling | Consider escalating |
| `LOCAL_ONLY` | info | Explicit local preference | Stay local (user choice) |
| `OOM_RISK` | high | Out of memory imminent | Escalate before crash |
| `TIMEOUT_RISK` | high | Inference too slow | Escalate for speed |
| `MODEL_UNAVAILABLE` | high | Model not present locally | Fetch or escalate |
| `CAPABILITY_UNSUPPORTED` | high | Feature unsupported | Escalate to capable node |
| `RESOURCE_PRESSURE` | medium | System under stress | Consider escalating |
| `PROMPT_TOO_LARGE` | high | Exceeds local capacity | Chunk or escalate |
| `INFERENCE_TOO_SLOW` | medium | Below performance threshold | Escalate for QoS |

### Signal Structure

```typescript
interface HandoffSignal {
  type: HandoffSignalType;           // Why handoff
  severity: HandoffSeverity;         // critical/high/medium/low
  reason: string;                    // Human-readable
  metrics: ResourceMetricsSnapshot;  // Data at decision time
  suggestedTarget: HandoffTarget;    // node/cloud/auto
  timestamp: string;                 // ISO 8601
  mandatory: boolean;                // Force vs advisory
  crossedThresholds: string[];       // Which limits hit
}
```

---

## Runtime Thresholds

Configurable limits for triggering handoff signals.

### Default Thresholds (Edge Devices)

```typescript
const DEFAULT_RUNTIME_THRESHOLDS = {
  maxMemoryMB: 1024,           // 1GB heap limit
  maxRssMemoryMB: 2048,        // 2GB RSS limit
  maxInferenceTimeMs: 30000,   // 30 seconds max
  maxPromptTokens: 4096,       // 4K prompt limit
  maxContextSize: 8192,        // 8K context max
  minTokensPerSecond: 1,       // At least 1 token/sec
  maxModelSizeMB: 4096,        // 4GB model max
  maxSlowInferences: 3,        // Handoff after 3 slow
};
```

### Preset Configurations

**Conservative** (Raspberry Pi, low-end):
- 512MB heap, 1GB RSS
- 15s timeout, 2K tokens max

**Default** (Mini PC, edge):
- 1GB heap, 2GB RSS  
- 30s timeout, 4K tokens max

**Relaxed** (Workstation, high-end):
- 4GB heap, 8GB RSS
- 60s timeout, 8K tokens max

### Environment Overrides

```bash
HGI_MAX_MEMORY_MB=2048           # Custom heap limit
HGI_MAX_INFERENCE_MS=60000       # Custom timeout
HGI_MAX_PROMPT_TOKENS=8192       # Custom token limit
HGI_MIN_TOKENS_PER_SEC=2         # Custom performance floor
```

---

## Handoff Evaluator

The `HandoffEvaluator` class monitors resources and produces signals.

### Usage

```typescript
import { createHandoffEvaluator } from './src/core/handoff-evaluator.js';

const evaluator = createHandoffEvaluator({
  thresholds: DEFAULT_RUNTIME_THRESHOLDS,
  debug: true,
});

const metrics = {
  timestamp: new Date().toISOString(),
  heapUsed: 500 * 1024 * 1024,  // 500MB
  rss: 1000 * 1024 * 1024,      // 1GB
  inferenceTimeMs: 5000,
  promptTokens: 1000,
  tokensPerSecond: 5,
};

const evaluation = evaluator.evaluate(metrics);

if (evaluation.shouldHandoff) {
  console.log('Handoff needed:', evaluation.signal?.reason);
}
```

### Evaluation Logic

1. **Check all thresholds** against current metrics
2. **Classify crossings** by severity (critical/high/medium)
3. **Determine if handoff needed**:
   - Any critical crossing → mandatory handoff
   - 2+ high crossings → recommended handoff
   - 3+ total crossings → recommended handoff
4. **Generate signal** with type, severity, reason

---

## Graceful Degradation

When resources are scarce, the runtime degrades gracefully:

### Degradation Chain

1. **Reduce context size** (shorter conversations)
2. **Lower precision** (Q4 → Q3 quantization)
3. **Smaller model** (7B → 3B parameters)
4. **Handoff to node** (nearby peer)
5. **Chunked processing** (split large prompts)
6. **Queue and retry** (defer to lower load)

### User Consent

Critical handoffs require explicit user consent:
- First cloud escalation
- Large model downloads
- Network usage for inference
- Data sharing with nodes

---

## Sovereignty Advantages

### Why Hierarchical Handoff?

| Aspect | Cloud-Only | HGI Handoff |
|--------|-----------|-------------|
| **Data Control** | ✗ Remote owns data | ✓ User owns data |
| **Offline Work** | ✗ Requires internet | ✓ Works offline |
| **Latency** | ~100-500ms | ~0-10ms local |
| **Cost** | ✗ Subscription fees | ✓ Community shared |
| **Privacy** | ✗ Trained on your data | ✓ Never leaves device |
| **Resilience** | ✗ Single point of failure | ✓ Distributed mesh |

### Sovereign Computing Principles

1. **User owns the compute** - Not rented from cloud
2. **User owns the data** - Never trains on your data
3. **User owns the model** - Local weights, local control
4. **Network is optional** - Core functions work offline
5. **Community is backup** - Nodes help, don't replace local

---

## Integration Points

### Phase 3B: HGI-LOCAL-HUB Connection

Future integration will add:
- Node discovery protocol
- Handoff signal transmission
- Result return handling
- Capability advertisement

### Phase 4: Red Vecinal MX

Community network integration:
- Mesh topology awareness
- Latency-optimized routing
- Trust levels per node
- Load balancing across nodes

---

## Simulation

Run the handoff simulation to see decision logic:

```bash
# Build the project
npm run build

# Run simulation
node dist/examples/handoff-simulation.js
```

**Scenarios tested**:
- Normal operation (stay local)
- High memory pressure (OOM risk)
- Slow inference (low tokens/sec)
- Huge prompt (exceeds limit)
- Timeout risk (inference too slow)
- Large model (size limit)
- Conservative thresholds (stricter)
- Relaxed thresholds (lenient)
- Multiple minor issues (cumulative)

---

## Files Added

| File | Purpose |
|------|---------|
| `src/types/handoff.ts` | Handoff signal type definitions |
| `src/config/runtime-thresholds.ts` | Threshold configuration |
| `src/core/handoff-evaluator.ts` | Handoff decision logic |
| `examples/handoff-simulation.ts` | Simulation example |
| `docs/HGI_HANDOFF_ARCHITECTURE.md` | This documentation |

---

## Next Steps

**Phase 3B**: HGI-LOCAL-HUB Integration
- Implement handoff signal transmission
- Add node discovery
- Test end-to-end handoff flow

**Phase 4**: Community Network
- Red Vecinal MX integration
- Mesh networking support
- Trust and verification

---

**Document Version**: 0.1.0  
**Last Updated**: 2026-05-18
