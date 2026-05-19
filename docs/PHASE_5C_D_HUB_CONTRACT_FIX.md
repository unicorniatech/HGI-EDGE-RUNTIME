# Phase 5C-D: Hub Handoff API Contract Fix

**Date**: 2026-05-19  
**Commit**: (pending)  
**Status**: ✅ PARTIAL SUCCESS - Handoff Submission Fixed

---

## Executive Summary

Successfully fixed the API incompatibility between HGI-EDGE-RUNTIME and hgi-local-node. The handoff submission endpoint now accepts requests correctly.

**Key Achievement**: Handoff submission 100% successful (10/10 accepted)  
**Remaining Issue**: Claimable endpoint returns 0 handoffs for all workers (hub-side filtering)

---

## Problem Identified

### Before Fix
HGI-EDGE-RUNTIME was sending rich object types that hgi-local-node couldn't parse:

```typescript
// Outgoing payload (BEFORE - caused 400 Bad Request)
{
  requestId: "req-123",
  sourceRuntimeId: "runtime-abc",
  localModel: { modelId: "tinyllama-1.1b" },  // ❌ Object, hub expects string
  originalRequest: { model: "tinyllama", input: "Hello" },
  handoffSignal: {                                // ❌ Object, hub expects string
    type: "HANDOFF_REQUIRED",
    severity: "critical",
    reason: "llm",
    ...
  },
  metrics: { timestamp: "2024-01-01T00:00:00Z" },
  requestedCapability: "llm",
  createdAt: "2024-01-01T00:00:00Z"
}
```

**Result**: `400 Bad Request` on all submissions

---

## Solution Implemented

### After Fix
Added `_toHubHandoffPayload()` mapper in `HGIHubClient` that converts rich internal types to hub-compatible strings:

```typescript
// Outgoing payload (AFTER - accepted by hub)
{
  requestId: "req-123",
  sourceRuntimeId: "runtime-abc",
  localModel: "tinyllama-1.1b",     // ✅ String (extracted from object)
  originalRequest: { model: "tinyllama", input: "Hello" },
  handoffSignal: "{\"type\":\"HANDOFF_REQUIRED\",...}",  // ✅ JSON string
  metrics: { timestamp: "2024-01-01T00:00:00Z" },
  requiredCapability: "llm",        // ✅ Mapped from requestedCapability
  priority: 50,                     // ✅ Included when available
  createdAt: "2024-01-01T00:00:00Z"
}
```

**Result**: `200 OK` - Handoffs accepted and queued

---

## Implementation Details

### Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `src/core/hgi-hub-client.ts` | Added `_toHubHandoffPayload()` mapper, improved 400 error logging | +45 |
| `src/types/hub-handoff.ts` | Added `priority` field to `HGIHubHandoffRequest` | +2 |

### Mapper Logic

```typescript
private _toHubHandoffPayload(request: HGIHubHandoffRequest): Record<string, unknown> {
  // Convert localModel object to string (modelId)
  const localModelStr = typeof request.localModel === 'string'
    ? request.localModel
    : request.localModel?.modelId ?? 'unknown';

  // Convert handoffSignal object to JSON string
  const handoffSignalStr = typeof request.handoffSignal === 'string'
    ? request.handoffSignal
    : JSON.stringify(request.handoffSignal);

  // Build hub-compatible payload
  const payload: Record<string, unknown> = {
    requestId: request.requestId,
    sourceRuntimeId: request.sourceRuntimeId,
    localModel: localModelStr,
    originalRequest: request.originalRequest,
    handoffSignal: handoffSignalStr,
  };

  // Add optional fields
  if (request.metrics) payload.metrics = request.metrics;
  if (request.requestedCapability) payload.requiredCapability = request.requestedCapability;
  if (request.priority !== undefined) payload.priority = request.priority;

  return payload;
}
```

### Error Logging Improvement

When `400 Bad Request` occurs, the client now logs:
```
❌ Handoff submission rejected (400 Bad Request):
   Response: {"message":"validation error","errors":["..."]}
   Outgoing payload shape: requestId, sourceRuntimeId, localModel, ...
   Payload: {full JSON payload}
```

---

## Validation Results

### Hub Health Check
| Endpoint | Status | Result |
|----------|--------|--------|
| GET /health | ✅ 200 | `{"status":"ok"}` |
| GET /handoff/claimable | ✅ 200 | `[]` |
| POST /handoff | ✅ 200 | Accepted |

### Handoff Submission Results

| # | Capability | Priority | Result | Status |
|---|------------|----------|--------|--------|
| 1 | llm | normal | ✅ Accepted | queued |
| 2 | eva | high | ✅ Accepted | queued |
| 3 | stt | normal | ✅ Accepted | queued |
| 4 | tts | normal | ✅ Accepted | queued |
| 5 | vision | high | ✅ Accepted | queued |
| 6 | emergency | emergency | ✅ Accepted | queued |
| 7 | llm | normal | ✅ Accepted | queued |
| 8 | text-generation | normal | ✅ Accepted | queued |
| 9 | llm | normal | ✅ Accepted | queued |
| 10 | text-generation | normal | ✅ Accepted | queued |

**Submission Success Rate**: 100% (10/10)

### Workers Registered

| Worker Type | Worker ID | Capabilities | Max Jobs |
|-------------|-----------|--------------|----------|
| llm | llm-llm-01-t17x | llm, text-generation, chat, completion | 2 |
| eva | eva-eva-01-3wfh | eva, reasoning, expert, analysis | 1 |
| stt | stt-stt-01-ujuy | stt, speech-to-text, audio-transcription | 2 |
| tts | tts-tts-01-03et | tts, text-to-speech, audio-generation | 2 |
| vision | vision-vision-01-ohie | vision, image-analysis, object-detection, ocr | 1 |
| emergency | emergency-emergency-01-vrq5 | emergency, priority-inference, redvecinal | 3 |

### Claimable Query Results

| Worker | Capabilities | Claimable Found |
|--------|--------------|-----------------|
| llm | llm, text-generation, chat, completion | 0 ❌ |
| eva | eva, reasoning, expert, analysis | 0 ❌ |
| stt | stt, speech-to-text, audio-transcription | 0 ❌ |
| tts | tts, text-to-speech, audio-generation | 0 ❌ |
| vision | vision, image-analysis, object-detection, ocr | 0 ❌ |
| emergency | emergency, priority-inference, redvecinal | 0 ❌ |

**Claim Success Rate**: 0% (0/0 - none available)

---

## Metrics Summary

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Handoff Submission | 100% | 100% (10/10) | ✅ PASS |
| Hub Health Check | 200 OK | 200 OK | ✅ PASS |
| Workers Registered | 6 | 6 | ✅ PASS |
| Routing Accuracy | 80% | 0% (0/0) | ⚠️ N/A |
| Processing Success | 80% | 0% (0/0) | ⚠️ N/A |
| Claim/Complete | Working | Not tested | ⚠️ Blocked |

---

## Issues Found

### Issue #1: Claimable Endpoint Returns Empty (MEDIUM)
**Status**: ⚠️ Investigation needed  
**Description**: Handoffs submit successfully and are queued, but the `/handoff/claimable` endpoint returns 0 handoffs for all workers.  
**Possible Causes**:
1. Hub capability filtering doesn't match worker capabilities
2. Handoffs in "queued" state aren't yet "claimable"
3. Worker capability contract format mismatch

**Evidence**:
- Handoffs submit: ✅
- Handoffs in queue: ✅ (submitted 10)
- Claimable query: `[]` (empty for all workers)

**Next Steps**:
1. Check hub's capability matching logic
2. Verify worker capability format matches hub expectations
3. Test with explicit capability compatibility check

### Issue #2: Full Lifecycle Not Validated
**Status**: ⚠️ Expected  
**Description**: Since claimable returns empty, claim → process → complete lifecycle couldn't be validated.  
**Impact**: Core submission working, but end-to-end flow incomplete.  
**Resolution**: Depends on Issue #1 resolution.

---

## Conclusion

### Phase 5C-D Status: ✅ SUCCESS (Partial)

**API Contract Fix**: ✅ COMPLETE  
- HGI-EDGE-RUNTIME now correctly formats handoff payloads for hgi-local-node
- 100% submission success rate achieved
- Rich internal types preserved, mapped to hub-compatible format

**Full Integration**: ⚠️ PENDING  
- Submission → Queue: ✅ Working
- Queue → Claimable: ⚠️ Not filtering correctly
- Full lifecycle: ⚠️ Blocked

### Success Criteria Met

| Criteria | Status |
|----------|--------|
| Map rich types to hub contract | ✅ PASS |
| localModel → string | ✅ PASS |
| handoffSignal → JSON string | ✅ PASS |
| requiredCapability included | ✅ PASS |
| priority included | ✅ PASS |
| Handoffs submit successfully | ✅ PASS (10/10) |
| Improve 400 error logging | ✅ PASS |

### Next Steps

1. **Investigate claimable filtering** - Why doesn't hub return compatible handoffs?
2. **Test manual claim** - Try claiming a handoff by ID directly
3. **Verify capability format** - Check if hub expects different capability strings
4. **Full lifecycle test** - Once claimable works, verify complete flow

---

## Commands Run

```bash
# Start hub
cd C:\Users\molie\VistaDev\HGI-NODO\hgi-local-node
pnpm start:daemon

# Run validation
$env:HGI_LOCAL_HUB_URL="http://localhost:4010"
npm run example:hub-integrated-multi-worker

# Results:
# - Hub Health: ✅
# - Submission: ✅ 10/10 accepted
# - Claimable: ⚠️ 0 found for all workers
```

---

## Files Changed

| File | Purpose | Lines |
|------|---------|-------|
| `src/core/hgi-hub-client.ts` | Add payload mapper, improve error logging | +45 |
| `src/types/hub-handoff.ts` | Add priority field | +2 |
| `tests/hub-handoff-mapping.test.ts` | Test mapper functionality | ~200 |
| `docs/PHASE_5C_D_HUB_CONTRACT_FIX.md` | This document | ~250 |

---

**Implemented By**: Cascade  
**Date**: 2026-05-19  
**API Fix**: ✅ Complete  
**Full Integration**: ⚠️ Pending claimable fix
