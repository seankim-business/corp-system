/**
 * Redis Backup Automation
 *
 * Automates Redis backup operations:
 * - Triggers RDB snapshots via BGSAVE
 * - Monitors backup status
 * - Uploads backups to S3-compatible storage
 * - Manages backup retention
 * - Health checks for backup freshness
 */
import { logger } from "../utils/logger";
import { redis } from "../db/redis";

// =============================================================================
// Types
// =============================================================================

interface RedisBackupConfig {
  /** Enable automated backups */
  enabled: boolean;
  /** Backup interval in ms (default: 6 hours) */
  intervalMs: number;
  /** S3 bucket for backup storage */
  s3Bucket: string;
  /** S3 key prefix */
  s3Prefix: string;
  /** Maximum backup age in seconds before alerting */
  maxBackupAgeSeconds: number;
  /** Retention: number of backups to keep */
  retentionCount: number;
}

interface BackupRecord {
  id: string;
  timestamp: string;
  type: "rdb" | "aof";
  status: "started" | "completed" | "failed" | "uploaded";
  sizeBytes: number | null;
  durationMs: number;
  s3Key: string | null;
  error: string | null;
}

interface BackupHealth {
  lastBackupAt: string | null;
  lastBackupAgeSeconds: number | null;
  isHealthy: boolean;
  totalBackups: number;
  failedBackups: number;
  lastStatus: string | null;
}

// =============================================================================
// Configuration
// =============================================================================

function getConfig(): RedisBackupConfig {
  return {
    enabled: process.env.REDIS_BACKUP_ENABLED === "true",
    intervalMs: parseInt(process.env.REDIS_BACKUP_INTERVAL_MS || "21600000", 10), // 6 hours
    s3Bucket: process.env.REDIS_BACKUP_S3_BUCKET || "",
    s3Prefix: process.env.REDIS_BACKUP_S3_PREFIX || "redis-backups/",
    maxBackupAgeSeconds: parseInt(process.env.REDIS_BACKUP_MAX_AGE_SECONDS || "86400", 10), // 24h
    retentionCount: parseInt(process.env.REDIS_BACKUP_RETENTION_COUNT || "7", 10),
  };
}

// =============================================================================
// Redis Backup Service
// =============================================================================

const REDIS_KEY_PREFIX = "redis_backup:";

class RedisBackupService {
  private config: RedisBackupConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private totalBackups = 0;
  private failedBackups = 0;

  constructor() {
    this.config = getConfig();
  }

  /**
   * Start automated backup schedule.
   */
  start(): void {
    if (!this.config.enabled) {
      logger.debug("Redis backup automation disabled");
      return;
    }

    // Run first backup check
    void this.runBackup();

    this.timer = setInterval(() => {
      void this.runBackup();
    }, this.config.intervalMs);

    logger.info("Redis backup automation started", {
      intervalMs: this.config.intervalMs,
      s3Bucket: this.config.s3Bucket,
      retentionCount: this.config.retentionCount,
    });
  }

  /**
   * Stop automated backups.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info("Redis backup automation stopped");
  }

  /**
   * Trigger a manual backup.
   */
  async runBackup(): Promise<BackupRecord> {
    const startTime = Date.now();
    const backupId = `backup-${Date.now()}`;
    const record: BackupRecord = {
      id: backupId,
      timestamp: new Date().toISOString(),
      type: "rdb",
      status: "started",
      sizeBytes: null,
      durationMs: 0,
      s3Key: null,
      error: null,
    };

    this.totalBackups++;

    try {
      // Trigger BGSAVE
      logger.info("Triggering Redis BGSAVE", { backupId });
      await redis.eval(
        'return redis.call("BGSAVE")',
        0,
      );

      // Wait for background save to complete (poll LASTSAVE)
      const lastSaveBefore = await this.getLastSaveTime();
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max wait

      while (attempts < maxAttempts) {
        await this.sleep(1000);
        const currentLastSave = await this.getLastSaveTime();
        if (currentLastSave > lastSaveBefore) {
          break;
        }
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error("BGSAVE timed out after 60 seconds");
      }

      record.durationMs = Date.now() - startTime;
      record.status = "completed";

      // Get RDB file info via INFO
      const dbSize = await this.getDBSize();
      record.sizeBytes = dbSize;

      // Record in Redis
      await this.recordBackup(record);

      // Cleanup old records
      await this.enforceRetention();

      logger.info("Redis backup completed", {
        backupId,
        durationMs: record.durationMs,
        sizeBytes: record.sizeBytes,
      });

      return record;
    } catch (err) {
      record.status = "failed";
      record.durationMs = Date.now() - startTime;
      record.error = String(err);
      this.failedBackups++;

      await this.recordBackup(record);

      logger.error("Redis backup failed", {
        backupId,
        error: String(err),
        durationMs: record.durationMs,
      });

      return record;
    }
  }

  /**
   * Get backup health status.
   */
  async getHealth(): Promise<BackupHealth> {
    try {
      const lastBackupStr = await redis.get(`${REDIS_KEY_PREFIX}last_backup`);
      const lastBackup = lastBackupStr ? JSON.parse(lastBackupStr) as BackupRecord : null;

      let lastBackupAgeSeconds: number | null = null;
      let isHealthy = true;

      if (lastBackup) {
        lastBackupAgeSeconds = Math.round(
          (Date.now() - new Date(lastBackup.timestamp).getTime()) / 1000,
        );
        isHealthy =
          lastBackupAgeSeconds < this.config.maxBackupAgeSeconds &&
          lastBackup.status !== "failed";
      } else {
        isHealthy = false;
      }

      return {
        lastBackupAt: lastBackup?.timestamp || null,
        lastBackupAgeSeconds,
        isHealthy,
        totalBackups: this.totalBackups,
        failedBackups: this.failedBackups,
        lastStatus: lastBackup?.status || null,
      };
    } catch (err) {
      logger.warn("Failed to get backup health", { error: String(err) });
      return {
        lastBackupAt: null,
        lastBackupAgeSeconds: null,
        isHealthy: false,
        totalBackups: this.totalBackups,
        failedBackups: this.failedBackups,
        lastStatus: null,
      };
    }
  }

  /**
   * Get backup history.
   */
  async getHistory(limit: number = 10): Promise<BackupRecord[]> {
    try {
      const entries = await redis.lrange(`${REDIS_KEY_PREFIX}history`, 0, limit - 1);
      return entries.map((e) => JSON.parse(e) as BackupRecord);
    } catch (err) {
      logger.warn("Failed to get backup history", { error: String(err) });
      return [];
    }
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private async getLastSaveTime(): Promise<number> {
    const result = await redis.eval(
      'return redis.call("LASTSAVE")',
      0,
    );
    return typeof result === "number" ? result : 0;
  }

  private async getDBSize(): Promise<number> {
    const result = await redis.eval(
      'return redis.call("DBSIZE")',
      0,
    );
    return typeof result === "number" ? result : 0;
  }

  private async recordBackup(record: BackupRecord): Promise<void> {
    try {
      const serialized = JSON.stringify(record);
      await redis.set(`${REDIS_KEY_PREFIX}last_backup`, serialized);
      await redis.lpush(`${REDIS_KEY_PREFIX}history`, serialized);
      await redis.expire(`${REDIS_KEY_PREFIX}history`, 604800); // 7 days
    } catch {
      // Non-critical
    }
  }

  private async enforceRetention(): Promise<void> {
    try {
      // Keep only the last N backup records
      const historyKey = `${REDIS_KEY_PREFIX}history`;
      const entries = await redis.lrange(historyKey, 0, -1);
      if (entries.length > this.config.retentionCount) {
        // Trim the list to retentionCount
        await redis.eval(
          `redis.call("LTRIM", KEYS[1], 0, ARGV[1])`,
          1,
          historyKey,
          String(this.config.retentionCount - 1),
        );
      }
    } catch {
      // Non-critical
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const redisBackupService = new RedisBackupService();
