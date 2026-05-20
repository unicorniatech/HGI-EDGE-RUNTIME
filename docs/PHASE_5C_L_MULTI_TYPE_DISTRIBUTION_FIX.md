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

### Hub Queue Issue

```
Total handoffs in queue: ~97
Old LLM handoffs from previous runs: ~90
New handoffs from current run: 8

Problem: New handoffs are positions 85-92 in queue
Claimable endpoint returns first 12: positions 1-12 (all old LLM)
```

---

## Required Next Steps

### Option 1: Clear Hub Queue (Recommended)

Restart hub daemon with clean state:
```powershell
cd C:\Users\molie\VistaDev\HGI-NODO\hgi-local-node
pnpm build
node apps/node-daemon/dist/index.js
```

This clears the in-memory queue and allows fresh validation.

### Option 2: Submit More Handoffs Per Type

Increase handoff count per type to 20+ so they appear in claimable results despite queue backlog.

### Option 3: Process All Queue Pages

Modify validation to paginate through all claimable results, not just first 12.

---

## Files Changed

| File | Change |
|------|--------|
| `examples/hub-integrated-multi-worker-validation.ts` | Removed "generic" from capabilities, added heartbeat refresh, added distribution validation |

---

## Validation Command

```powershell
npm run example:hub-integrated-multi-worker
```

### Expected Result After Hub Restart

```
✅ DISTRIBUTION VALIDATION PASSED - All worker types completed jobs

LLM: PASSED - 2 jobs completed
EVA: PASSED - 1 job completed
STT: PASSED - 1 job completed
TTS: PASSED - 1 job completed
VISION: PASSED - 1 job completed
EMERGENCY: PASSED - 1 job completed
```

---

## Honest Assessment

**What Was Fixed**:
- ✅ Capability alignment (removed "generic" over-matching)
- ✅ Heartbeat refresh during claiming
- ✅ Distribution validation assertions
- ✅ Pass/fail criteria includes distribution

**What's Blocking Success**:
- 🔄 Hub queue has 97 old LLM handoffs from previous runs
- 🔄 New handoffs are buried and not visible to claimable endpoint

**Action Required**:
Restart hgi-local-node hub to clear queue, then re-run validation.

---

**Status**: Core fixes complete. Hub queue cleanup required for full validation pass.
