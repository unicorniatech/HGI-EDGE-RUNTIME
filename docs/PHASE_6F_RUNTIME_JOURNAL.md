# Phase 6F: Supervisor Event Log / Local Runtime Journal

**Date**: 2026-05-22  
**Status**: ✅ PASSED

---

## Objective

Add a lightweight local runtime journal so supervisor warnings, health transitions, quarantine/recovery events, and lifecycle summaries can be persisted locally for debugging.

---

## Hub Configuration

**Hub Commit**: 7ce3a6a (hgi-local-node)  
**Hub State**: Running and healthy

---

## Runtime Configuration

**Runtime Commit**: 71056fd + journal additions

---

## Journal Purpose

The runtime journal provides persistent local logging for:
- Supervisor lifecycle events (start, stop)
- Warnings and errors
- Worker health transitions
- Quarantine and recovery events
- Hub reachability changes
- Lifecycle summaries

---

## Event Schema

### RuntimeJournalEvent

```typescript
interface RuntimeJournalEvent {
  id: string;
  timestamp: string;
  runtimeId: string;
  eventType: RuntimeJournalEventType;
  severity: 'info' | 'warning' | 'error';
  workerId?: string;
  workerType?: string;
  message: string;
  metadata?: Record<string, unknown>;
}
```

### Event Types

- `supervisor_tick` - Supervisor tick event (optional/low-noise)
- `warning` - Warning event
- `worker_health_changed` - Worker health status changed
- `worker_quarantined` - Worker entered quarantine
- `worker_recovered` - Worker recovered from quarantine
- `hub_unreachable` - Hub became unreachable
- `hub_recovered` - Hub recovered
- `lifecycle_summary` - Supervisor lifecycle summary
- `supervisor_started` - Supervisor started
- `supervisor_stopped` - Supervisor stopped

---

## File Location

**Default Path**: `.hgi-runtime/runtime-journal.jsonl`

**Format**: JSONL (one JSON object per line)

**Directory Creation**: Automatically created if missing

---

## Journal Configuration

### RuntimeJournalConfig

```typescript
interface RuntimeJournalConfig {
  enabled: boolean;              // Default: true
  path: string;                  // Default: '.hgi-runtime/runtime-journal.jsonl'
  maxEventsInMemory: number;     // Default: 1000
  alsoPrintToConsole: boolean;   // Default: false
}
```

### Supervisor Integration

```typescript
const supervisor = createRuntimeSupervisor({
  runtimeId: 'my-runtime',
  hubUrl: 'http://localhost:4010',
  pool,
  hubClient,
  intervalMs: 5000,
  emitTextSnapshot: true,
  emitJsonSnapshot: false,
  stopOnCriticalMismatch: false,
  maxWarnings: 100,
  journal: {
    enabled: true,
    path: '.hgi-runtime/runtime-journal.jsonl',
    maxEventsInMemory: 100,
    alsoPrintToConsole: false,
  },
});
```

---

## Sample JSONL

```jsonl
{"id":"evt-1716432000000-1","timestamp":"2026-05-22T23:00:00.000Z","runtimeId":"runtime-journal-demo","eventType":"supervisor_started","severity":"info","message":"Supervisor started"}
{"id":"evt-1716432000000-2","timestamp":"2026-05-22T23:00:00.000Z","runtimeId":"runtime-journal-demo","eventType":"warning","severity":"warning","message":"1 worker(s) stale"}
{"id":"evt-1716432002000-3","timestamp":"2026-05-22T23:00:02.000Z","runtimeId":"runtime-journal-demo","eventType":"supervisor_tick","severity":"info","message":"Supervisor tick 1"}
{"id":"evt-1716432004000-4","timestamp":"2026-05-22T23:00:04.000Z","runtimeId":"runtime-journal-demo","eventType":"supervisor_tick","severity":"info","message":"Supervisor tick 2"}
{"id":"evt-1716432006000-5","timestamp":"2026-05-22T23:00:06.000Z","runtimeId":"runtime-journal-demo","eventType":"supervisor_stopped","severity":"info","message":"Supervisor stopped after 3 ticks"}
{"id":"evt-1716432006000-6","timestamp":"2026-05-22T23:00:06.000Z","runtimeId":"runtime-journal-demo","eventType":"lifecycle_summary","severity":"info","message":"Supervisor lifecycle summary","metadata":{"totalTicks":3,"totalWorkers":0,"totalWarnings":1,"hubReachable":true,"completedJobs":0,"failedJobs":0}}
```

---

## Reader Usage

### Read All Events

```typescript
import { readRuntimeJournal } from './src/core/runtime-journal.js';

const events = await readRuntimeJournal('.hgi-runtime/runtime-journal.jsonl');
console.log(`Total events: ${events.length}`);
```

### Read Last N Events

```typescript
const last5 = await readRuntimeJournal('.hgi-runtime/runtime-journal.jsonl', { lastN: 5 });
```

### Filter by Severity

```typescript
const errors = await readRuntimeJournal('.hgi-runtime/runtime-journal.jsonl', { severity: 'error' });
const warnings = await readRuntimeJournal('.hgi-runtime/runtime-journal.jsonl', { severity: 'warning' });
```

### Filter by Event Type

```typescript
const lifecycleEvents = await readRuntimeJournal('.hgi-runtime/runtime-journal.jsonl', { eventType: 'lifecycle_summary' });
```

### Filter by Worker ID

```typescript
const workerEvents = await readRuntimeJournal('.hgi-runtime/runtime-journal.jsonl', { workerId: 'worker-1' });
```

---

## Supervisor Journal Events

The supervisor automatically writes journal events for:

- **Start**: `supervisor_started` event when supervisor starts
- **Stop**: `supervisor_stopped` event when supervisor stops
- **Warnings**: `warning` event for each warning
- **Hub Unreachable**: `hub_unreachable` event when hub becomes unreachable
- **Hub Recovered**: `hub_recovered` event when hub recovers
- **Quarantined Workers**: `worker_quarantined` event for each quarantined worker with metadata
- **Health Mismatches**: `worker_health_changed` event for each health mismatch with metadata
- **Lifecycle Summary**: `lifecycle_summary` event on stop with total ticks, workers, warnings, jobs

---

## Files Changed

| File | Change |
|------|--------|
| `src/core/runtime-journal.ts` | New file with RuntimeJournal class, reader, types |
| `src/core/runtime-supervisor.ts` | Added journal config, integration, event writing |
| `src/core/index.ts` | Exported RuntimeJournal, createRuntimeJournal, readRuntimeJournal, types |
| `examples/runtime-journal-demo.ts` | New CLI demo for journal |
| `tests/runtime-journal.test.ts` | New journal tests (13 tests) |
| `package.json` | Added `example:runtime-journal-demo` script |
| `docs/PHASE_6F_RUNTIME_JOURNAL.md` | Documentation |

---

## Test Results

### Unit Tests

```powershell
npm test
```

**Result**: ✅ 187 passed, 103 skipped (13 new journal tests added)

### Journal Test Coverage

- ✅ Writes JSONL event
- ✅ Appends multiple events
- ✅ Creates directory if missing
- ✅ Does not write when disabled
- ✅ Reads last N events
- ✅ Filters by severity
- ✅ Filters by eventType
- ✅ Filters by workerId
- ✅ Returns empty array if file does not exist
- ✅ Stores events in memory
- ✅ Respects maxEventsInMemory
- ✅ Clears in-memory events
- ✅ Generates unique event IDs

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
**Result**: ✅ 187 passed, 103 skipped

### Journal Demo
```powershell
npm run example:runtime-journal-demo
```
**Result**: ✅ Passed

### Supervisor Demo
```powershell
npm run example:runtime-supervisor-demo
```
**Result**: ✅ Passed

---

## Commit & Push

**Commit Message**: `feat: add local runtime journal`  
**Commit Hash**: TBD  
**Push Result**: TBD

---

## Summary

**Phase 6F Status**: ✅ PASSED

Local runtime journal is now implemented and validated:
1. ✅ Runtime journal type created
2. ✅ Filesystem journal writer implemented
3. ✅ Integrated with RuntimeSupervisor
4. ✅ Journal reader helper added
5. ✅ Runtime journal demo CLI created
6. ✅ Unit tests for journal writing and reading
7. ✅ Writes JSONL events
8. ✅ Reads and filters events
9. ✅ Respects maxEventsInMemory
10. ✅ Creates directory if missing

**Key Implementation**:
- Created `RuntimeJournal` class with JSONL file writing
- Implemented `readRuntimeJournal()` with filtering by lastN, severity, eventType, workerId
- Integrated journal into `RuntimeSupervisor` for lifecycle, warnings, hub, quarantine, and recovery events
- Added journal configuration to supervisor with enable/disable control
- Created CLI example `runtime-journal-demo.ts` demonstrating journal writing and reading
- Created comprehensive unit tests for writing, reading, filtering, and in-memory management
- Default journal path: `.hgi-runtime/runtime-journal.jsonl`

**Observation**: The runtime journal provides persistent local logging without external dependencies. It uses JSONL format for easy parsing and filtering. The supervisor automatically writes important events while avoiding excessive spam from tick events. The journal can be disabled entirely or configured to also print to console for debugging.
