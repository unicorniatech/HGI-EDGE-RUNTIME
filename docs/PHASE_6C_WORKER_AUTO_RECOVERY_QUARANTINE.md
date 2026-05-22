# Phase 6C: Worker Auto-Recovery + Quarantine Policy

**Date**: 2026-05-22  
**Status**: ✅ PASSED

---

## Objective

Add local worker auto-recovery policy and quarantine behavior for unhealthy or repeatedly failing workers.

---

## Hub Configuration

**Hub Commit**: 7ce3a6a (hgi-local-node)  
**Hub State**: Running and healthy

---

## Runtime Configuration

**Runtime Commit**: 5053997 + auto-recovery/quarantine additions

---

## Recovery Policy

### Policy Types

Added `WorkerRecoveryPolicy` interface with configurable parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxConsecutiveFailures` | 3 | Maximum consecutive failures before quarantine |
| `staleGraceMs` | 30000 | Grace period for stale workers before quarantine (ms) |
| `offlineGraceMs` | 60000 | Grace period for offline workers before quarantine (ms) |
| `quarantineMs` | 5000 | Quarantine duration (ms) |
| `recoveryHeartbeatRequired` | true | Whether heartbeat is required for recovery |
| `allowAutoRecovery` | true | Whether to allow auto-recovery |

### Failure State Tracking

Per-worker metrics added:
- `consecutiveFailures`: Count of consecutive failures
- `lastFailureAt`: Timestamp of last failure
- `quarantinedUntil`: Timestamp when quarantine expires
- `recoveryAttempts`: Number of recovery attempts
- `lastRecoveryAt`: Timestamp of last recovery

---

## Quarantine Behavior

### Quarantine Conditions

Worker is quarantined when:
- Consecutive failures exceed `maxConsecutiveFailures`
- Worker stays stale beyond `staleGraceMs`
- Worker stays offline beyond `offlineGraceMs`

### Quarantine Effects

- Worker marked with `quarantined` health status
- Worker prevented from claiming new handoffs
- Diagnostics remain visible
- Worker is not deleted from pool

---

## Auto-Recovery Behavior

### Recovery Conditions

Worker recovers when:
- Quarantine period has expired
- Heartbeat is received (if `recoveryHeartbeatRequired` is true)
- Auto-recovery is enabled in policy

### Recovery Actions

- Clear quarantine status
- Reset consecutive failures to 0
- Set health status to `online`
- Increment recovery attempts
- Allow claiming again

---

## Routing Integration

### Worker Eligibility Check

`isWorkerEligible()` method skips workers that are:
- Quarantined
- Offline
- Stale beyond grace period
- Saturated (at max capacity)

### Skip Reasons

Diagnostics include skip reason when worker is not eligible:
- `Quarantined`
- `Offline`
- `Stale beyond grace period`
- `Saturated`

---

## Validation Results

### Quarantine Validation

**Test Worker**: STT worker (stt-stt-01-8sd3)

| Phase | Consecutive Failures | Quarantined | Health Status | Eligible |
|-------|---------------------|-------------|--------------|----------|
| Initial | 0 | NO | online | YES |
| After 3 failures | 3 | YES | quarantined | NO |
| After recovery | 0 | NO | online | YES |

**Result**: ✅ Worker entered quarantine after max failures, was skipped for claiming, recovered after quarantine + heartbeat

### Recovery Validation

- ✅ Worker recovered after quarantine expired
- ✅ Heartbeat required for recovery
- ✅ Failure count reset after recovery
- ✅ Worker became eligible again
- ✅ Other workers continued processing during quarantine

### Extended Diagnostics

All workers after validation:

| Worker ID | Type | Status | Failures | Quarantined | Recovery Attempts | Eligible |
|-----------|------|--------|----------|-------------|-------------------|----------|
| llm-llm-01-33k4 | llm | online | 0 | NO | 0 | YES |
| eva-eva-01-your | eva | online | 0 | NO | 0 | YES |
| stt-stt-01-8sd3 | stt | online | 0 | NO | 1 | YES |
| tts-tts-01-7dym | tts | online | 0 | NO | 0 | YES |
| vision-vision-01-o8am | vision | online | 0 | NO | 0 | YES |
| emergency-emergency-01-4ff3 | emergency | online | 0 | NO | 0 | YES |

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/worker-pool.ts` | Added `WorkerRecoveryPolicy` interface, failure state tracking to `WorkerMetrics`, quarantine/recovery methods, eligibility check, extended diagnostics |
| `examples/hub-integrated-multi-worker-validation.ts` | Added Step 7e: Worker Auto-Recovery + Quarantine Validation |
| `tests/worker-quarantine.test.ts` | New test file with quarantine/recovery tests (12 tests) |
| `docs/PHASE_6C_WORKER_AUTO_RECOVERY_QUARANTINE.md` | Documentation |

---

## Test Results

### Unit Tests

```powershell
npm test
```

**Result**: ✅ 145 passed, 103 skipped (12 new quarantine/recovery tests added)

### Quarantine/Recovery Test Coverage

- ✅ Worker enters quarantine after max failures
- ✅ Quarantined worker is skipped
- ✅ Healthy worker continues processing
- ✅ Quarantine expires
- ✅ Heartbeat after quarantine recovers worker
- ✅ Failure count resets after recovery
- ✅ Diagnostics show skip reason
- ✅ Worker not quarantined before max failures
- ✅ Recovery fails before quarantine expires
- ✅ Recovery fails without heartbeat if required
- ✅ Failure count resets on success
- ✅ Offline workers are skipped
- ✅ Stale workers beyond grace period are skipped
- ✅ Saturated workers are skipped
- ✅ Default policy behavior works
- ✅ Custom policy values are respected

---

## Validation Checks

### Lint
```powershell
npm run lint
```
**Result**: ✅ Passed (with expected warnings for any types)

### Build
```powershell
npm run build
```
**Result**: ✅ Passed

### Test
```powershell
npm test
```
**Result**: ✅ 145 passed, 103 skipped

### Example
```powershell
npm run example:hub-integrated-multi-worker
```
**Result**: ✅ Passed

---

## Commit & Push

**Commit Message**: `feat: add worker auto recovery quarantine policy`  
**Commit Hash**: TBD  
**Push Result**: TBD

---

## Summary

**Phase 6C Status**: ✅ PASSED

Worker auto-recovery and quarantine policy is now implemented and validated:
1. ✅ Worker recovery policy types defined
2. ✅ Failure state tracking implemented
3. ✅ Quarantine behavior added
4. ✅ Auto-recovery behavior added
5. ✅ Routing integration (skip unhealthy workers)
6. ✅ Quarantine/recovery diagnostics exposed
7. ✅ Auto-recovery + quarantine validation scenario
8. ✅ Unit tests for quarantine/recovery
9. ✅ Worker enters quarantine after max failures
10. ✅ Worker recovers after quarantine + heartbeat
11. ✅ Other workers continue processing during quarantine

**Key Implementation**:
- Added `WorkerRecoveryPolicy` interface with configurable thresholds
- Extended `WorkerMetrics` with failure state tracking (consecutiveFailures, lastFailureAt, quarantinedUntil, recoveryAttempts, lastRecoveryAt)
- Implemented `recordWorkerFailure()`, `recordWorkerSuccess()`, `quarantineWorker()`, `attemptWorkerRecovery()` methods
- Added `isWorkerEligible()` to check worker eligibility with skip reasons
- Added `getExtendedWorkerDiagnostics()` to expose quarantine/recovery info
- Added `quarantined` to `WorkerHealthStatus` type
- Added Step 7e to validation script to test quarantine and recovery
- Created comprehensive unit tests for all quarantine/recovery scenarios

**Observation**: The quarantine policy provides automatic protection against repeatedly failing workers while allowing them to recover after a cooldown period. This prevents unhealthy workers from blocking the system while maintaining the ability to recover without manual intervention.
