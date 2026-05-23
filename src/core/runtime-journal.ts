/**
 * Runtime Journal
 *
 * Local filesystem-based journal for runtime events, warnings,
 * health transitions, quarantine/recovery events, and lifecycle summaries.
 *
 * @module src/core/runtime-journal
 */

import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Runtime journal event
 */
export interface RuntimeJournalEvent {
  /** Unique event ID */
  id: string;
  /** Event timestamp */
  timestamp: string;
  /** Runtime identifier */
  runtimeId: string;
  /** Event type */
  eventType: RuntimeJournalEventType;
  /** Event severity */
  severity: 'info' | 'warning' | 'error';
  /** Worker ID (optional) */
  workerId?: string;
  /** Worker type (optional) */
  workerType?: string;
  /** Event message */
  message: string;
  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime journal event types
 */
export type RuntimeJournalEventType =
  | 'supervisor_tick'
  | 'warning'
  | 'worker_health_changed'
  | 'worker_quarantined'
  | 'worker_recovered'
  | 'hub_unreachable'
  | 'hub_recovered'
  | 'lifecycle_summary'
  | 'supervisor_started'
  | 'supervisor_stopped';

/**
 * Runtime journal configuration
 */
export interface RuntimeJournalConfig {
  /** Whether journal is enabled */
  enabled: boolean;
  /** Journal file path */
  path: string;
  /** Maximum events to keep in memory */
  maxEventsInMemory: number;
  /** Whether to also print to console */
  alsoPrintToConsole: boolean;
}

/**
 * Runtime journal reader options
 */
export interface RuntimeJournalReaderOptions {
  /** Number of last events to read */
  lastN?: number;
  /** Filter by severity */
  severity?: 'info' | 'warning' | 'error';
  /** Filter by worker ID */
  workerId?: string;
  /** Filter by event type */
  eventType?: RuntimeJournalEventType;
}

/**
 * Runtime journal
 */
export class RuntimeJournal {
  private _config: RuntimeJournalConfig;
  private _inMemoryEvents: RuntimeJournalEvent[] = [];
  private _eventCounter = 0;

  constructor(config: Partial<RuntimeJournalConfig> = {}) {
    this._config = {
      enabled: config.enabled ?? true,
      path: config.path ?? '.hgi-runtime/runtime-journal.jsonl',
      maxEventsInMemory: config.maxEventsInMemory ?? 1000,
      alsoPrintToConsole: config.alsoPrintToConsole ?? false,
      ...config,
    };
  }

  /**
   * Write an event to the journal
   */
  async writeEvent(event: Omit<RuntimeJournalEvent, 'id'>): Promise<void> {
    if (!this._config.enabled) {
      return;
    }

    const fullEvent: RuntimeJournalEvent = {
      id: this.generateEventId(),
      ...event,
    };

    // Add to memory
    this._inMemoryEvents.push(fullEvent);

    // Trim to max events
    if (this._inMemoryEvents.length > this._config.maxEventsInMemory) {
      this._inMemoryEvents = this._inMemoryEvents.slice(-this._config.maxEventsInMemory);
    }

    // Write to file
    try {
      await fs.mkdir(this.getDirectory(), { recursive: true });
      const line = JSON.stringify(fullEvent) + '\n';
      await fs.appendFile(this._config.path, line, 'utf-8');
    } catch (error) {
      console.error(`[Journal] Failed to write event: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Print to console if enabled
    if (this._config.alsoPrintToConsole) {
      const icon = event.severity === 'error' ? '❌' : event.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`[Journal] ${icon} [${event.eventType}] ${event.message}`);
    }
  }

  /**
   * Get in-memory events
   */
  getInMemoryEvents(): RuntimeJournalEvent[] {
    return [...this._inMemoryEvents];
  }

  /**
   * Clear in-memory events
   */
  clearInMemoryEvents(): void {
    this._inMemoryEvents = [];
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    this._eventCounter++;
    return `evt-${Date.now()}-${this._eventCounter}`;
  }

  /**
   * Get directory from path
   */
  private getDirectory(): string {
    return this._config.path.substring(0, this._config.path.lastIndexOf('/'));
  }
}

/**
 * Read runtime journal from file
 */
export async function readRuntimeJournal(
  path: string = '.hgi-runtime/runtime-journal.jsonl',
  options: RuntimeJournalReaderOptions = {}
): Promise<RuntimeJournalEvent[]> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.length > 0);
    const events: RuntimeJournalEvent[] = [];

    for (const line of lines) {
      try {
        const event = JSON.parse(line) as RuntimeJournalEvent;
        events.push(event);
      } catch (error) {
        // Skip invalid lines
        continue;
      }
    }

    // Apply filters
    let filtered = events;

    if (options.lastN) {
      filtered = filtered.slice(-options.lastN);
    }

    if (options.severity) {
      filtered = filtered.filter(e => e.severity === options.severity);
    }

    if (options.workerId) {
      filtered = filtered.filter(e => e.workerId === options.workerId);
    }

    if (options.eventType) {
      filtered = filtered.filter(e => e.eventType === options.eventType);
    }

    return filtered;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []; // File doesn't exist yet
    }
    throw error;
  }
}

/**
 * Create a runtime journal
 */
export function createRuntimeJournal(config?: Partial<RuntimeJournalConfig>): RuntimeJournal {
  return new RuntimeJournal(config);
}
