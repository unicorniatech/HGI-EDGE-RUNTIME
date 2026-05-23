/**
 * Runtime Journal Tests
 *
 * Tests runtime journal file writing, reading, and filtering.
 *
 * @module tests/runtime-journal
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { RuntimeJournal, createRuntimeJournal, readRuntimeJournal } from '../src/core/runtime-journal.js';

const TEST_JOURNAL_PATH = '.hgi-runtime/test-runtime-journal.jsonl';

describe('Runtime Journal', () => {
  let journal: RuntimeJournal;

  beforeEach(async () => {
    // Clean up test journal file
    try {
      await fs.unlink(TEST_JOURNAL_PATH);
    } catch (error) {
      // File doesn't exist, that's fine
    }

    journal = createRuntimeJournal({
      enabled: true,
      path: TEST_JOURNAL_PATH,
      maxEventsInMemory: 10,
      alsoPrintToConsole: false,
    });
  });

  afterEach(async () => {
    // Clean up test journal file
    try {
      await fs.unlink(TEST_JOURNAL_PATH);
    } catch (error) {
      // File doesn't exist, that's fine
    }
  });

  describe('Writing Events', () => {
    it('should write JSONL event', async () => {
      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Test event',
      });

      const content = await fs.readFile(TEST_JOURNAL_PATH, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(1);
      const event = JSON.parse(lines[0]);
      expect(event.runtimeId).toBe('test');
      expect(event.eventType).toBe('supervisor_started');
      expect(event.message).toBe('Test event');
    });

    it('should append multiple events', async () => {
      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Event 1',
      });

      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'warning',
        severity: 'warning',
        message: 'Event 2',
      });

      const content = await fs.readFile(TEST_JOURNAL_PATH, 'utf-8');
      const lines = content.trim().split('\n');

      expect(lines).toHaveLength(2);
    });

    it('should create directory if missing', async () => {
      const nestedPath = '.hgi-runtime/nested/test-journal.jsonl';
      const nestedJournal = createRuntimeJournal({
        enabled: true,
        path: nestedPath,
        maxEventsInMemory: 10,
        alsoPrintToConsole: false,
      });

      await nestedJournal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Test event',
      });

      const content = await fs.readFile(nestedPath, 'utf-8');
      expect(content).toBeTruthy();

      // Clean up
      await fs.unlink(nestedPath);
      await fs.rmdir('.hgi-runtime/nested');
    });

    it('should not write when disabled', async () => {
      const disabledJournal = createRuntimeJournal({
        enabled: false,
        path: TEST_JOURNAL_PATH,
        maxEventsInMemory: 10,
        alsoPrintToConsole: false,
      });

      await disabledJournal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Test event',
      });

      // File should not exist
      await expect(fs.readFile(TEST_JOURNAL_PATH, 'utf-8')).rejects.toThrow();
    });
  });

  describe('Reading Events', () => {
    beforeEach(async () => {
      // Write some test events
      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Event 1',
      });

      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'warning',
        severity: 'warning',
        message: 'Event 2',
      });

      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'worker_quarantined',
        severity: 'error',
        message: 'Event 3',
        workerId: 'worker-1',
        workerType: 'llm',
      });
    });

    it('should read last N events', async () => {
      const events = await readRuntimeJournal(TEST_JOURNAL_PATH, { lastN: 2 });

      expect(events).toHaveLength(2);
      expect(events[0].message).toBe('Event 2');
      expect(events[1].message).toBe('Event 3');
    });

    it('should filter by severity', async () => {
      const errorEvents = await readRuntimeJournal(TEST_JOURNAL_PATH, { severity: 'error' });
      const warningEvents = await readRuntimeJournal(TEST_JOURNAL_PATH, { severity: 'warning' });
      const infoEvents = await readRuntimeJournal(TEST_JOURNAL_PATH, { severity: 'info' });

      expect(errorEvents).toHaveLength(1);
      expect(warningEvents).toHaveLength(1);
      expect(infoEvents).toHaveLength(1);
    });

    it('should filter by eventType', async () => {
      const warningEvents = await readRuntimeJournal(TEST_JOURNAL_PATH, { eventType: 'warning' });
      const quarantineEvents = await readRuntimeJournal(TEST_JOURNAL_PATH, { eventType: 'worker_quarantined' });

      expect(warningEvents).toHaveLength(1);
      expect(quarantineEvents).toHaveLength(1);
    });

    it('should filter by workerId', async () => {
      const workerEvents = await readRuntimeJournal(TEST_JOURNAL_PATH, { workerId: 'worker-1' });

      expect(workerEvents).toHaveLength(1);
      expect(workerEvents[0].workerId).toBe('worker-1');
    });

    it('should return empty array if file does not exist', async () => {
      const events = await readRuntimeJournal('.hgi-runtime/nonexistent.jsonl');
      expect(events).toHaveLength(0);
    });
  });

  describe('In-Memory Events', () => {
    it('should store events in memory', async () => {
      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Test event',
      });

      const inMemory = journal.getInMemoryEvents();
      expect(inMemory).toHaveLength(1);
      expect(inMemory[0].message).toBe('Test event');
    });

    it('should respect maxEventsInMemory', async () => {
      const limitedJournal = createRuntimeJournal({
        enabled: true,
        path: TEST_JOURNAL_PATH,
        maxEventsInMemory: 3,
        alsoPrintToConsole: false,
      });

      for (let i = 0; i < 5; i++) {
        await limitedJournal.writeEvent({
          timestamp: new Date().toISOString(),
          runtimeId: 'test',
          eventType: 'supervisor_started',
          severity: 'info',
          message: `Event ${i}`,
        });
      }

      const inMemory = limitedJournal.getInMemoryEvents();
      expect(inMemory).toHaveLength(3);
      expect(inMemory[0].message).toBe('Event 2');
      expect(inMemory[2].message).toBe('Event 4');
    });

    it('should clear in-memory events', async () => {
      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Test event',
      });

      journal.clearInMemoryEvents();
      const inMemory = journal.getInMemoryEvents();
      expect(inMemory).toHaveLength(0);
    });
  });

  describe('Event ID Generation', () => {
    it('should generate unique event IDs', async () => {
      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'supervisor_started',
        severity: 'info',
        message: 'Event 1',
      });

      await journal.writeEvent({
        timestamp: new Date().toISOString(),
        runtimeId: 'test',
        eventType: 'warning',
        severity: 'warning',
        message: 'Event 2',
      });

      const inMemory = journal.getInMemoryEvents();
      expect(inMemory[0].id).not.toBe(inMemory[1].id);
      expect(inMemory[0].id).toMatch(/^evt-\d+-\d+$/);
    });
  });
});
