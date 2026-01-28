import { withQueueConnection } from "../db/redis";
import { logger } from "../utils/logger";

/**
 * Job progress event metadata
 */
export interface JobProgressEvent {
  jobId: string;
  stage: string;
  percentage: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Emit job progress to Redis pub/sub channel
 * Channel format: job:progress:{jobId}
 *
 * @param jobId - BullMQ job ID
 * @param stage - Current processing stage (e.g., "validated", "processing", "finalizing")
 * @param percentage - Progress percentage (0-100)
 * @param metadata - Optional additional metadata
 */
export async function emitJobProgress(
  jobId: string,
  stage: string,
  percentage: number,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    const event: JobProgressEvent = {
      jobId,
      stage,
      percentage,
      timestamp: Date.now(),
      metadata,
    };

    const channel = `job:progress:${jobId}`;
    const message = JSON.stringify(event);

    await withQueueConnection(async (client) => {
      await client.publish(channel, message);
    });

    logger.debug(`Job progress emitted`, {
      jobId,
      stage,
      percentage,
      channel,
    });
  } catch (error: any) {
    logger.error(`Failed to emit job progress for ${jobId}:`, error);
    // Don't throw - progress emission should not block job processing
  }
}

/**
 * Subscribe to job progress updates
 * Useful for SSE endpoints or real-time dashboards
 *
 * @param jobId - BullMQ job ID to monitor
 * @param callback - Function called on each progress update
 * @returns Unsubscribe function
 */
export async function subscribeToJobProgress(
  jobId: string,
  callback: (event: JobProgressEvent) => void,
): Promise<() => Promise<void>> {
  const channel = `job:progress:${jobId}`;

  return withQueueConnection(async (client) => {
    const subscriber = client.duplicate();

    subscriber.on("message", (ch, message) => {
      if (ch === channel) {
        try {
          const event = JSON.parse(message) as JobProgressEvent;
          callback(event);
        } catch (error: any) {
          logger.error(`Failed to parse job progress message:`, error);
        }
      }
    });

    await subscriber.subscribe(channel);

    logger.debug(`Subscribed to job progress`, { jobId, channel });

    return async () => {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
      logger.debug(`Unsubscribed from job progress`, { jobId, channel });
    };
  });
}

/**
 * Progress stage constants for consistent naming
 */
export const PROGRESS_STAGES = {
  STARTED: "started",
  VALIDATED: "validated",
  PROCESSING: "processing",
  FINALIZING: "finalizing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

/**
 * Standard progress percentages
 */
export const PROGRESS_PERCENTAGES = {
  STARTED: 0,
  VALIDATED: 20,
  PROCESSING: 50,
  FINALIZING: 80,
  COMPLETED: 100,
} as const;
