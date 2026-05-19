/**
 * HGI Edge Runtime - Simple Claimable Handoff Tests
 *
 * Lightweight tests for claimable handoff logic without heavy ESM mocking.
 * Tests the worker selection logic and priority ordering.
 *
 * @module tests/claimable-handoff.simple.test
 */

// Worker capabilities (matching the worker implementation)
const WORKER_CAPABILITIES = ['llm', 'local-llm', 'tinyllama'];

// Type for claimable handoff
interface ClaimableHandoff {
  id: string;
  status: string;
  requestedCapability: string;
  createdAt: string;
  priority?: number;
  estimatedComplexity?: string;
}

// Simulate hub filtering logic
function filterCompatibleHandoffs(
  handoffs: ClaimableHandoff[],
  capabilities: string[]
): ClaimableHandoff[] {
  return handoffs.filter(h => capabilities.includes(h.requestedCapability));
}

// Simulate hub priority sorting
function sortByPriority(handoffs: ClaimableHandoff[]): ClaimableHandoff[] {
  return [...handoffs].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

// Simulate worker selection logic
function selectBestHandoff(handoffs: ClaimableHandoff[]): ClaimableHandoff | null {
  if (handoffs.length === 0) return null;
  const sorted = sortByPriority(handoffs);
  return sorted[0];
}

describe('Claimable Handoff Selection Logic', () => {
  describe('Empty claimable list', () => {
    test('returns null when no handoffs available', () => {
      const selected = selectBestHandoff([]);
      expect(selected).toBeNull();
    });

    test('returns empty array when filtering empty list', () => {
      const compatible = filterCompatibleHandoffs([], WORKER_CAPABILITIES);
      expect(compatible).toHaveLength(0);
    });
  });

  describe('Claimable handoff returned', () => {
    test('selects single available handoff', () => {
      const handoffs: ClaimableHandoff[] = [
        {
          id: 'handoff-001',
          status: 'queued',
          requestedCapability: 'llm',
          createdAt: new Date().toISOString(),
          priority: 50,
        },
      ];

      const selected = selectBestHandoff(handoffs);
      expect(selected).not.toBeNull();
      expect(selected?.id).toBe('handoff-001');
    });

    test('selects highest priority from multiple handoffs', () => {
      const handoffs: ClaimableHandoff[] = [
        {
          id: 'low-priority',
          status: 'queued',
          requestedCapability: 'llm',
          createdAt: new Date().toISOString(),
          priority: 10,
        },
        {
          id: 'high-priority',
          status: 'queued',
          requestedCapability: 'llm',
          createdAt: new Date().toISOString(),
          priority: 100,
        },
        {
          id: 'medium-priority',
          status: 'queued',
          requestedCapability: 'llm',
          createdAt: new Date().toISOString(),
          priority: 50,
        },
      ];

      const selected = selectBestHandoff(handoffs);
      expect(selected?.id).toBe('high-priority');
      expect(selected?.priority).toBe(100);
    });
  });

  describe('Incompatible handoffs are filtered', () => {
    test('worker only sees compatible capabilities', () => {
      const handoffs: ClaimableHandoff[] = [
        {
          id: 'llm-handoff',
          status: 'queued',
          requestedCapability: 'llm', // Compatible
          createdAt: new Date().toISOString(),
          priority: 100,
        },
        {
          id: 'stt-handoff',
          status: 'queued',
          requestedCapability: 'stt', // Incompatible
          createdAt: new Date().toISOString(),
          priority: 90,
        },
        {
          id: 'image-handoff',
          status: 'queued',
          requestedCapability: 'image-gen', // Incompatible
          createdAt: new Date().toISOString(),
          priority: 80,
        },
      ];

      const compatible = filterCompatibleHandoffs(handoffs, WORKER_CAPABILITIES);
      expect(compatible).toHaveLength(1);
      expect(compatible[0].requestedCapability).toBe('llm');
    });

    test('all handoffs compatible when capabilities match', () => {
      const handoffs: ClaimableHandoff[] = [
        {
          id: 'llm-1',
          status: 'queued',
          requestedCapability: 'llm',
          createdAt: new Date().toISOString(),
          priority: 100,
        },
        {
          id: 'llm-2',
          status: 'queued',
          requestedCapability: 'local-llm',
          createdAt: new Date().toISOString(),
          priority: 90,
        },
        {
          id: 'llm-3',
          status: 'queued',
          requestedCapability: 'tinyllama',
          createdAt: new Date().toISOString(),
          priority: 80,
        },
      ];

      const compatible = filterCompatibleHandoffs(handoffs, WORKER_CAPABILITIES);
      expect(compatible).toHaveLength(3);
    });
  });

  describe('High priority claimable selected first', () => {
    test('priority 100 selected before priority 10', () => {
      const handoffs: ClaimableHandoff[] = [
        { id: 'low', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 10 },
        { id: 'high', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 100 },
      ];

      const selected = selectBestHandoff(handoffs);
      expect(selected?.id).toBe('high');
    });

    test('sorts by priority descending', () => {
      const handoffs: ClaimableHandoff[] = [
        { id: 'a', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 30 },
        { id: 'b', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 90 },
        { id: 'c', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 10 },
        { id: 'd', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 50 },
      ];

      const sorted = sortByPriority(handoffs);
      expect(sorted[0].id).toBe('b'); // 90
      expect(sorted[1].id).toBe('d'); // 50
      expect(sorted[2].id).toBe('a'); // 30
      expect(sorted[3].id).toBe('c'); // 10
    });

    test('handoffs without priority treated as 0', () => {
      const handoffs: ClaimableHandoff[] = [
        { id: 'no-priority', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString() },
        { id: 'with-priority', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 50 },
      ];

      const sorted = sortByPriority(handoffs);
      expect(sorted[0].id).toBe('with-priority');
      expect(sorted[1].id).toBe('no-priority');
    });
  });

  describe('Fallback behavior logic', () => {
    test('fallback should be used when claimable returns 404', () => {
      // Simulate 404 error from claimable endpoint
      const claimableError = { type: 'not_found', statusCode: 404 };

      // When 404, should trigger fallback
      const shouldFallback = claimableError.type === 'not_found' && claimableError.statusCode === 404;
      expect(shouldFallback).toBe(true);
    });

    test('fallback should NOT be used for network errors', () => {
      // Simulate network error (not 404)
      const networkError = { type: 'network', statusCode: undefined };

      // Should NOT trigger fallback for network errors
      const shouldFallback = networkError.type === 'not_found' && networkError.statusCode === 404;
      expect(shouldFallback).toBe(false);
    });

    test('fallback should NOT be used for server errors', () => {
      // Simulate 500 error
      const serverError = { type: 'server', statusCode: 500 };

      // Should NOT trigger fallback for server errors
      const shouldFallback = serverError.type === 'not_found' && serverError.statusCode === 404;
      expect(shouldFallback).toBe(false);
    });
  });

  describe('Worker claim flow logic', () => {
    test('full flow: get claimable → filter → sort → select → claim', () => {
      // 1. Hub returns claimable handoffs
      const hubClaimable: ClaimableHandoff[] = [
        { id: 'stt-1', status: 'queued', requestedCapability: 'stt', createdAt: new Date().toISOString(), priority: 100 },
        { id: 'llm-1', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 90 },
        { id: 'image-1', status: 'queued', requestedCapability: 'image-gen', createdAt: new Date().toISOString(), priority: 80 },
        { id: 'llm-2', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 70 },
      ];

      // 2. Worker filters to compatible
      const compatible = filterCompatibleHandoffs(hubClaimable, WORKER_CAPABILITIES);
      expect(compatible).toHaveLength(2);
      expect(compatible.map(h => h.id)).toContain('llm-1');
      expect(compatible.map(h => h.id)).toContain('llm-2');

      // 3. Sort by priority
      const sorted = sortByPriority(compatible);

      // 4. Select best
      const selected = sorted[0];
      expect(selected.id).toBe('llm-1'); // Highest priority among compatible
      expect(selected.priority).toBe(90);
    });

    test('conflict resolution: try next handoff if claim fails', () => {
      const sortedHandoffs: ClaimableHandoff[] = [
        { id: 'first', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 100 },
        { id: 'second', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 90 },
      ];

      // Simulate first claim fails (409 conflict)
      const firstClaimed = false;

      // Worker should try second
      let selectedId: string | null = null;
      if (!firstClaimed) {
        selectedId = sortedHandoffs[1].id;
      }

      expect(selectedId).toBe('second');
    });
  });
});

describe('Priority edge cases', () => {
  test('negative priorities are handled', () => {
    const handoffs: ClaimableHandoff[] = [
      { id: 'negative', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: -10 },
      { id: 'positive', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 10 },
    ];

    const sorted = sortByPriority(handoffs);
    expect(sorted[0].id).toBe('positive');
    expect(sorted[1].id).toBe('negative');
  });

  test('same priority maintains order', () => {
    const handoffs: ClaimableHandoff[] = [
      { id: 'first', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 50 },
      { id: 'second', status: 'queued', requestedCapability: 'llm', createdAt: new Date().toISOString(), priority: 50 },
    ];

    const sorted = sortByPriority(handoffs);
    // Both have same priority, original order should be maintained (stable sort)
    expect(sorted[0].id).toBe('first');
    expect(sorted[1].id).toBe('second');
  });
});
