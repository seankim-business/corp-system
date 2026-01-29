import { getRedisConnection } from "../db/redis";
import { logger } from "../utils/logger";
import { metrics } from "../utils/metrics";
import { WorkflowContext } from "./workflow-types";

export interface Checkpoint {
  workflowId: string;
  workflowName: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  completedSteps: string[];
  currentStep: string;
  state: Record<string, unknown>;
  nodeResults: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface CheckpointSummary {
  workflowId: string;
  workflowName: string;
  sessionId: string;
  currentStep: string;
  completedSteps: number;
  createdAt: Date;
  updatedAt: Date;
}

const CHECKPOINT_PREFIX = "workflow:checkpoint:";
const CHECKPOINT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const CHECKPOINT_INDEX_KEY = "workflow:checkpoints:index";

export class CheckpointManager {
  private redis: ReturnType<typeof getRedisConnection> | null = null;

  private getRedis() {
    if (!this.redis) {
      this.redis = getRedisConnection();
    }
    return this.redis;
  }

  private getCheckpointKey(sessionId: string): string {
    return `${CHECKPOINT_PREFIX}${sessionId}`;
  }

  async save(checkpoint: Omit<Checkpoint, "createdAt" | "updatedAt" | "version">): Promise<void> {
    const redis = this.getRedis();
    const key = this.getCheckpointKey(checkpoint.sessionId);

    try {
      // Get existing checkpoint to determine version
      const existing = await this.load(checkpoint.sessionId);
      const version = existing ? existing.version + 1 : 1;

      const fullCheckpoint: Checkpoint = {
        ...checkpoint,
        createdAt: existing?.createdAt || new Date(),
        updatedAt: new Date(),
        version,
      };

      const serialized = JSON.stringify(fullCheckpoint, (_key, value) => {
        if (value instanceof Date) {
          return { __type: "Date", value: value.toISOString() };
        }
        return value;
      });

      // Save checkpoint with TTL
      await redis.setex(key, CHECKPOINT_TTL_SECONDS, serialized);

      // Add to index for listing
      await redis.zadd(
        CHECKPOINT_INDEX_KEY,
        fullCheckpoint.updatedAt.getTime(),
        checkpoint.sessionId,
      );

      logger.info("Checkpoint saved", {
        sessionId: checkpoint.sessionId,
        workflowId: checkpoint.workflowId,
        currentStep: checkpoint.currentStep,
        completedSteps: checkpoint.completedSteps.length,
        version,
      });

      metrics.increment("checkpoint.saved", {
        workflowName: checkpoint.workflowName,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to save checkpoint", {
        sessionId: checkpoint.sessionId,
        error: message,
      });

      metrics.increment("checkpoint.save_failed", {
        workflowName: checkpoint.workflowName,
      });

      throw error;
    }
  }

  async load(sessionId: string): Promise<Checkpoint | null> {
    const redis = this.getRedis();
    const key = this.getCheckpointKey(sessionId);

    try {
      const data = await redis.get(key);

      if (!data) {
        logger.debug("No checkpoint found", { sessionId });
        return null;
      }

      const checkpoint = JSON.parse(data, (_key, value) => {
        if (value && typeof value === "object" && value.__type === "Date") {
          return new Date(value.value);
        }
        return value;
      }) as Checkpoint;

      logger.debug("Checkpoint loaded", {
        sessionId,
        workflowId: checkpoint.workflowId,
        currentStep: checkpoint.currentStep,
        completedSteps: checkpoint.completedSteps.length,
        version: checkpoint.version,
      });

      metrics.increment("checkpoint.loaded", {
        workflowName: checkpoint.workflowName,
      });

      return checkpoint;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to load checkpoint", {
        sessionId,
        error: message,
      });

      metrics.increment("checkpoint.load_failed");
      return null;
    }
  }

  async delete(sessionId: string): Promise<boolean> {
    const redis = this.getRedis();
    const key = this.getCheckpointKey(sessionId);

    try {
      const deleted = await redis.del(key);
      await redis.zrem(CHECKPOINT_INDEX_KEY, sessionId);

      logger.info("Checkpoint deleted", { sessionId, deleted: deleted > 0 });

      metrics.increment("checkpoint.deleted");

      return deleted > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to delete checkpoint", {
        sessionId,
        error: message,
      });
      return false;
    }
  }

  async list(limit = 100): Promise<CheckpointSummary[]> {
    const redis = this.getRedis();

    try {
      // Get most recent checkpoints from index
      const sessionIds = await redis.zrevrange(CHECKPOINT_INDEX_KEY, 0, limit - 1);

      if (sessionIds.length === 0) {
        return [];
      }

      const summaries = await Promise.all(
        sessionIds.map(async (sessionId: string) => {
          const checkpoint = await this.load(sessionId);
          if (!checkpoint) return null;

          return {
            workflowId: checkpoint.workflowId,
            workflowName: checkpoint.workflowName,
            sessionId: checkpoint.sessionId,
            currentStep: checkpoint.currentStep,
            completedSteps: checkpoint.completedSteps.length,
            createdAt: checkpoint.createdAt,
            updatedAt: checkpoint.updatedAt,
          } as CheckpointSummary;
        }),
      );

      return summaries.filter((s: CheckpointSummary | null): s is CheckpointSummary => s !== null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to list checkpoints", { error: message });
      return [];
    }
  }

  async cleanup(olderThan: Date): Promise<number> {
    const redis = this.getRedis();
    const cutoffTimestamp = olderThan.getTime();

    try {
      // Find old checkpoints from index
      const oldSessionIds = await redis.zrangebyscore(
        CHECKPOINT_INDEX_KEY,
        "-inf",
        cutoffTimestamp,
      );

      if (oldSessionIds.length === 0) {
        logger.info("No old checkpoints to cleanup");
        return 0;
      }

      const keys = oldSessionIds.map((id: string) => this.getCheckpointKey(id));
      const deleted = await redis.del(...keys);

      // Remove from index
      await redis.zremrangebyscore(CHECKPOINT_INDEX_KEY, "-inf", cutoffTimestamp);

      logger.info("Checkpoints cleaned up", {
        deleted,
        olderThan: olderThan.toISOString(),
      });

      metrics.increment("checkpoint.cleanup", { count: String(deleted) });

      return deleted;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to cleanup checkpoints", {
        olderThan: olderThan.toISOString(),
        error: message,
      });
      return 0;
    }
  }

  createFromContext(
    workflowId: string,
    workflowName: string,
    context: WorkflowContext,
    completedSteps: string[],
  ): Omit<Checkpoint, "createdAt" | "updatedAt" | "version"> {
    return {
      workflowId,
      workflowName,
      sessionId: context.sessionId,
      organizationId: context.organizationId,
      userId: context.userId,
      completedSteps,
      currentStep: context.currentNode || "",
      state: { ...context.variables },
      nodeResults: { ...context.nodeResults },
    };
  }

  restoreToContext(checkpoint: Checkpoint, context: WorkflowContext): void {
    context.variables = { ...checkpoint.state };
    context.nodeResults = checkpoint.nodeResults as Record<string, any>;
    context.currentNode = checkpoint.currentStep;
  }
}

export const checkpointManager = new CheckpointManager();
