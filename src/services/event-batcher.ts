import { gzipSync } from "zlib";
import { logger } from "../utils/logger";

export interface BatchedEvent {
  event: string;
  data: unknown;
  timestamp: number;
}

interface EventBatcherOptions {
  batchWindowMs?: number;
  maxBatchSize?: number;
  compressionThresholdBytes?: number;
  onFlush: (orgId: string, events: BatchedEvent[]) => void;
}

interface OrgBatch {
  events: BatchedEvent[];
  timer: ReturnType<typeof setTimeout> | null;
}

interface BatcherStats {
  totalBatched: number;
  totalFlushed: number;
  avgBatchSize: number;
}

export function compressPayload(data: string, thresholdBytes = 1024): { compressed: boolean; data: string } {
  if (Buffer.byteLength(data, "utf8") <= thresholdBytes) {
    return { compressed: false, data };
  }

  const compressed = gzipSync(Buffer.from(data, "utf8"));
  return { compressed: true, data: compressed.toString("base64") };
}

export class EventBatcher {
  private readonly batchWindowMs: number;
  private readonly maxBatchSize: number;
  private readonly compressionThresholdBytes: number;
  private readonly onFlush: (orgId: string, events: BatchedEvent[]) => void;
  private readonly queues: Map<string, OrgBatch> = new Map();
  private totalBatched = 0;
  private totalFlushed = 0;
  private flushCount = 0;
  private stopped = false;

  constructor(options: EventBatcherOptions) {
    this.batchWindowMs = options.batchWindowMs ?? 100;
    this.maxBatchSize = options.maxBatchSize ?? 10;
    this.compressionThresholdBytes = options.compressionThresholdBytes ?? 1024;
    this.onFlush = options.onFlush;
  }

  addEvent(orgId: string, event: string, data: unknown): void {
    if (this.stopped) {
      logger.warn("EventBatcher: attempted to add event after shutdown", { orgId, event });
      return;
    }

    const batchedEvent: BatchedEvent = {
      event,
      data,
      timestamp: Date.now(),
    };

    let batch = this.queues.get(orgId);
    if (!batch) {
      batch = { events: [], timer: null };
      this.queues.set(orgId, batch);
    }

    batch.events.push(batchedEvent);
    this.totalBatched++;

    // Flush if max batch size reached
    if (batch.events.length >= this.maxBatchSize) {
      this.flushOrg(orgId, batch);
      return;
    }

    // Start window timer if not already running
    if (batch.timer === null) {
      batch.timer = setTimeout(() => {
        const current = this.queues.get(orgId);
        if (current && current.events.length > 0) {
          this.flushOrg(orgId, current);
        }
      }, this.batchWindowMs);
    }
  }

  flush(orgId?: string): void {
    if (orgId !== undefined) {
      const batch = this.queues.get(orgId);
      if (batch && batch.events.length > 0) {
        this.flushOrg(orgId, batch);
      }
      return;
    }

    // Flush all orgs
    for (const [id, batch] of this.queues) {
      if (batch.events.length > 0) {
        this.flushOrg(id, batch);
      }
    }
  }

  shutdown(): void {
    this.stopped = true;
    this.flush();

    // Clear any remaining timers
    for (const [, batch] of this.queues) {
      if (batch.timer !== null) {
        clearTimeout(batch.timer);
        batch.timer = null;
      }
    }

    this.queues.clear();
    logger.info("EventBatcher shut down", {
      totalBatched: this.totalBatched,
      totalFlushed: this.totalFlushed,
    });
  }

  getStats(): BatcherStats {
    return {
      totalBatched: this.totalBatched,
      totalFlushed: this.totalFlushed,
      avgBatchSize: this.flushCount > 0 ? this.totalFlushed / this.flushCount : 0,
    };
  }

  /**
   * Return compression threshold for external use (e.g., compressPayload calls).
   */
  get threshold(): number {
    return this.compressionThresholdBytes;
  }

  private flushOrg(orgId: string, batch: OrgBatch): void {
    if (batch.timer !== null) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }

    const events = batch.events.splice(0);
    this.totalFlushed += events.length;
    this.flushCount++;

    try {
      this.onFlush(orgId, events);
    } catch (err) {
      logger.error("EventBatcher flush callback failed", {
        orgId,
        eventCount: events.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const eventBatcher = new EventBatcher({
  onFlush: (orgId, events) => {
    logger.debug("EventBatcher flushed batch", {
      orgId,
      eventCount: events.length,
      events: events.map((e) => e.event),
    });
  },
});
