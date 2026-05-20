# Phase 5C-L: Multi-Type Claim Distribution Fix

**Date**: 2026-05-19  
**Status**: 🔄 IN PROGRESS - Core fixes applied, hub queue cleanup needed

---

## Problem Statement

Phase 5C-K proved the hub-integrated lifecycle works, but all 31 jobs were processed by the LLM worker:

| Worker Type | Jobs Completed |
|-------------|----------------|
| LLM | 31 |
| EVA | 0 |
| STT | 0 |
| TTS | 0 |
| VISION | 0 |
| EMERGENCY | 0 |

**Root Cause**: Hub queue accumulated 97+ old LLM handoffs from previous validation runs, blocking new handoffs from being claimable.

---

## Analysis

### What Was Happening

1. Validation submits 8 new handoffs (LLM, EVA, STT, TTS, Vision, Emergency, LLM, text-generation)
2. Hub already has 97 old LLM handoffs in queue
3. Claimable endpoint returns first 12-16 handoffs
4. All returned handoffs are old LLM handoffs
5. LLM worker claims the LLM handoffs
6. EVA/STT/TTS/Vision/Emergency workers see only LLM handoffs (incompatible)
7. New handoffs (EVA, STT, TTS, Vision, Emergency) are buried in queue behind old LLM handoffs

### Why Workers Couldn't Claim

Debug endpoint confirmed:
```
EVA worker sees 12 claimable handoffs:
  - All have requiredCapability: llm
  - EVA worker capabilities: eva, reasoning, analysis
  - Result: capability_mismatch for all 12
```

The EVA handoff WAS submitted successfully but is position #85 in queue (buried behind 84 old LLM handoffs).

---

## Fixes Applied

### 1. Removed "generic" Capability (Prevents Over-Matching)

**Before**:
```typescript
capabilities: ['generic', 'llm', 'text-generation']
```

**After**:
```typescript
capabilities: ['llm', 'text-generation'] // NO generic
```

Same for all worker types - removed "generic" to prevent LLM from claiming everything.

### 2. Added Heartbeat Refresh During Claiming

Added heartbeat before each worker checks claimable to prevent staleness:
```typescript
for (const worker of pool.workers) {
  // Refresh heartbeat before checking claimable
  try {
    await hubClient.sendWorkerHeartbeat(worker.id, 'online');
  } catch {
    // Ignore heartbeat errors
  }
  
  // Now check claimable...
  claimable = await hubClient.getClaimableHandoffs(worker.id);
}
```

### 3. Added Distribution Validation Assertions

```typescript
const requiredWorkerTypes = ['llm', 'eva', 'stt', 'tts', 'vision', 'emergency'];

for (const workerType of requiredWorkerTypes) {
  const stats = byType.get(workerType);
  const completed = stats?.completedJobs ?? 0;

  if (completed === 0) {
    distributionFailures.push(`${workerType} completed 0 jobs`);
    console.log(`❌ ${workerType}: FAILED - 0 jobs`);
  } else {
    console.log(`✅ ${workerType}: PASSED - ${completed} jobs`);
  }
}
```

### 4. Updated Pass/Fail Criteria

```typescript
const passed = routingAccuracy >= 80 && 
               successRate >= 80 && 
               distributionFailures.length === 0; // NEW
```

---

## Current Status

### Capability Alignment

| Worker Type | Hub Worker Type | Capabilities (Fixed) |
|-------------|-----------------|----------------------|
| LLM | llama | llm, text-generation |
| EVA | generic | eva, reasoning, analysis |
| STT | stt | stt, speech-to-text, audio-transcription |
| TTS | generic | tts, text-to-speech, speech-synthesis |
| VISION | generic | vision, image-analysis |
| EMERGENCY | generic | emergency, priority-inference, redvecinal-emergency |

### Handoff Submissions (8 total)

| Capability | Priority | Status |
|------------|----------|--------|
| llm | normal | ✅ Submitted |
| eva | high | ✅ Submitted |
| stt | normal | ✅ Submitted |
| tts | normal | ✅ Submitted |
| vision | high | ✅ Submitted |
| emergency | emergency | ✅ Submitted |
| llm | normal | ✅ Submitted |
| text-generation | normal | ✅ Submitted |

### Hub Implementation Issue - BLOCKER

**Discovery**: Hub does NOT store `requiredCapability` field from handoff payload.

**Evidence**:
- Client sends: `requiredCapability: "eva"` (or stt, tts, vision, emergency)
- Hub queue stores: Only `handoffSignal.reason` field
- Hub claimable endpoint: Looks for `requiredCapability` field (which doesn't exist)
- Result: All handoffs appear as LLM or are unmatched

**Queue State**:
```
Total handoffs: 105
Stored fields: handoffId, requestId, sourceRuntimeId, localModel, handoffSignal, queuedAt, priority, metrics
Missing: requiredCapability (not stored by hub)
```

**Root Cause**: HGI-LOCAL-HUB (hgi-local-node) does not persist the `requiredCapability` field from the handoff request payload. The hub only stores the `reason` string inside the `handoffSignal` JSON object.

**Impact**: Multi-type claim distribution cannot work until hub is updated to store and use `requiredCapability` for worker matching.

---

## Required Next Steps

### Hub-Side Fix Required

HGI-LOCAL-HUB must be updated to:
1. Accept and store `requiredCapability` field in handoff payload
2. Use `requiredCapability` for worker capability matching in claimable endpoint
3. Return `requiredCapability` in claimable and queue responses

**File to modify**: `C:\Users\molie\VistaDev\HGI-NODO\hgi-local-node/apps/node-daemon/src/routes/handoff.ts`

### Workaround (Not Recommended)

Until hub is fixed, multi-type distribution cannot be validated. The hub implementation is the blocker.

---

## Files Changed

| File | Change |
|------|--------|
| `examples/hub-integrated-multi-worker-validation.ts` | Removed "generic" from capabilities, added heartbeat refresh, added distribution validation, fixed type cast for requestedCapability |
| `src/types/hub-handoff.ts` | Added 'eva', 'emergency', 'text-generation' to HGIHubCapability type |

---

## Final Validation Results

### What Was Fixed
- ✅ Removed "generic" capability from workers (prevents over-matching)
- ✅ Added heartbeat refresh before each claim check (prevents staleness)
- ✅ Added distribution validation assertions (proves each worker type processes jobs)
- ✅ Updated pass/fail criteria to include distribution
- ✅ Fixed HGIHubCapability type to include all worker capabilities
- ✅ Fixed requestedCapability type cast in validation script

### Blocker Discovery
- ❌ HGI-LOCAL-HUB does NOT store `requiredCapability` field from handoff payload
- ❌ Hub only stores `handoffSignal.reason` (capability string inside JSON)
- ❌ Hub claimable endpoint looks for `requiredCapability` field (which doesn't exist in stored handoffs)
- ❌ Result: All handoffs appear as LLM or are unmatched, preventing multi-type distribution

### Validation Status
```
Routing Accuracy: 100.0% (3/3 correctly routed)
Processing Success Rate: 100.0% (3/3 completed)
Distribution Validation: FAILED
  - LLM: 3 completed ✅
  - EVA: 0 completed ❌
  - STT: 0 completed ❌
  - TTS: 0 completed ❌
  - VISION: 0 completed ❌
  - EMERGENCY: 0 completed ❌
```

---

## Honest Assessment

**What Was Fixed (HGI-EDGE-RUNTIME)**:
- ✅ Worker capability alignment (removed "generic" over-matching)
- ✅ Heartbeat refresh during claiming
- ✅ Distribution validation assertions
- ✅ Pass/fail criteria includes distribution
- ✅ Type system support for all worker capabilities

**What's Blocking Success (HGI-LOCAL-HUB)**:
- ❌ Hub does not persist `requiredCapability` field
- ❌ Hub claimable endpoint cannot match workers by capability
- ❌ Multi-type distribution impossible without hub fix

**Action Required**:
Update HGI-LOCAL-HUB to store and use `requiredCapability` field for worker matching.

---

**Status**: HGI-EDGE-RUNTIME fixes complete. Blocked by hub implementation.
