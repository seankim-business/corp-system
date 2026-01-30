/**
 * Automated Backup Strategy for Nubabel
 *
 * Provides pg_dump-based PostgreSQL backups with S3-compatible storage,
 * retention policies, WAL archiving for point-in-time recovery,
 * on-demand backup triggers, and backup verification via temp-db restore.
 */
import { execFile } from "child_process";
import { createReadStream, createWriteStream, statSync, unlinkSync, existsSync } from "fs";
import { pipeline } from "stream/promises";
import { createGzip, createGunzip } from "zlib";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { logger } from "../../src/utils/logger";
import { redis } from "../../src/db/redis";

// =============================================================================
// Types
// =============================================================================

export type BackupType = "full" | "schema" | "data";
export type BackupTier = "daily" | "weekly" | "monthly";
export type BackupStatus = "pending" | "in_progress" | "completed" | "failed" | "verified";

export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface S3Config {
  bucket: string;
  region: string;
  accessKey: string;
  secretKey: string;
  endpoint: string | null;
}

export interface WALArchiveConfig {
  enabled: boolean;
  archiveCommand: string;
  restoreCommand: string;
  archivePath: string;
}

export interface BackupRecord {
  id: string;
  timestamp: string;
  type: BackupType;
  tier: BackupTier;
  sizeBytes: number;
  s3Key: string;
  status: BackupStatus;
  durationMs: number;
  checksum: string;
  verifiedAt: string | null;
}

export interface BackupStrategyConfig {
  s3: S3Config;
  retention: RetentionPolicy;
  wal: WALArchiveConfig;
  databaseUrl: string;
  pgDumpPath: string;
  pgRestorePath: string;
  psqlPath: string;
  compressionEnabled: boolean;
  maxConcurrentBackups: number;
  verificationEnabled: boolean;
}

export interface BackupResult {
  success: boolean;
  record: BackupRecord | null;
  error: string | null;
}

export interface VerificationResult {
  success: boolean;
  backupId: string;
  tableCount: number;
  rowSample: number;
  durationMs: number;
  error: string | null;
}

// =============================================================================
// Configuration from Environment
// =============================================================================

function getBackupConfig(): BackupStrategyConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for backup configuration");
  }

  return {
    s3: {
      bucket: process.env.BACKUP_S3_BUCKET || "",
      region: process.env.BACKUP_S3_REGION || "us-east-1",
      accessKey: process.env.BACKUP_S3_ACCESS_KEY || "",
      secretKey: process.env.BACKUP_S3_SECRET_KEY || "",
      endpoint: process.env.BACKUP_S3_ENDPOINT || null,
    },
    retention: {
      daily: 7,
      weekly: 4,
      monthly: 12,
    },
    wal: {
      enabled: process.env.BACKUP_WAL_ENABLED === "true",
      archiveCommand:
        process.env.BACKUP_WAL_ARCHIVE_CMD ||
        "test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f",
      restoreCommand:
        process.env.BACKUP_WAL_RESTORE_CMD ||
        "cp /var/lib/postgresql/wal_archive/%f %p",
      archivePath: process.env.BACKUP_WAL_ARCHIVE_PATH || "/var/lib/postgresql/wal_archive",
    },
    databaseUrl,
    pgDumpPath: process.env.PG_DUMP_PATH || "pg_dump",
    pgRestorePath: process.env.PG_RESTORE_PATH || "pg_restore",
    psqlPath: process.env.PSQL_PATH || "psql",
    compressionEnabled: process.env.BACKUP_COMPRESSION !== "false",
    maxConcurrentBackups: parseInt(process.env.BACKUP_MAX_CONCURRENT || "1", 10),
    verificationEnabled: process.env.BACKUP_VERIFICATION !== "false",
  };
}

// =============================================================================
// Redis Keys
// =============================================================================

const REDIS_KEYS = {
  BACKUP_LOCK: "backup:lock",
  BACKUP_HISTORY: "backup:history",
  BACKUP_LATEST: "backup:latest",
  BACKUP_RUNNING: "backup:running",
  BACKUP_STATS: "backup:stats",
} as const;

// =============================================================================
// Helpers
// =============================================================================

function parseDatabaseUrl(url: string): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, ""),
    user: parsed.username,
    password: parsed.password,
  };
}

function execFileAsync(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env: { ...process.env, ...options.env },
        timeout: options.timeout || 3600000, // 1 hour default
        maxBuffer: 50 * 1024 * 1024, // 50MB
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function determineBackupTier(date: Date): BackupTier {
  const dayOfMonth = date.getDate();
  const dayOfWeek = date.getDay();

  if (dayOfMonth === 1) {
    return "monthly";
  }
  if (dayOfWeek === 0) {
    return "weekly";
  }
  return "daily";
}

function formatS3Key(record: { timestamp: string; tier: BackupTier; type: BackupType; id: string }): string {
  const date = new Date(record.timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const ext = "sql.gz";
  return `backups/${record.tier}/${year}/${month}/${day}/${record.type}-${record.id}.${ext}`;
}

async function computeFileChecksum(filePath: string): Promise<string> {
  const { createHash } = await import("crypto");
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

// =============================================================================
// S3 Client (native fetch, S3-compatible)
// =============================================================================

class S3Client {
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = config;
  }

  private getBaseUrl(): string {
    if (this.config.endpoint) {
      return this.config.endpoint.replace(/\/$/, "");
    }
    return `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com`;
  }

  private async signRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    payloadHash: string,
  ): Promise<Record<string, string>> {
    const { createHmac, createHash } = await import("crypto");

    const now = new Date();
    const dateStamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 8);
    const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const region = this.config.region;
    const service = "s3";
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

    headers["x-amz-date"] = amzDate;
    headers["x-amz-content-sha256"] = payloadHash;

    const signedHeaderKeys = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();
    const signedHeaders = signedHeaderKeys.join(";");

    const canonicalHeadersNormalized = signedHeaderKeys
      .map((k) => {
        const originalKey = Object.keys(headers).find((h) => h.toLowerCase() === k);
        return `${k}:${headers[originalKey!]?.trim() || ""}`;
      })
      .join("\n");

    const canonicalRequest = [
      method,
      path,
      "",
      canonicalHeadersNormalized + "\n",
      signedHeaders,
      payloadHash,
    ].join("\n");

    const canonicalRequestHash = createHash("sha256").update(canonicalRequest).digest("hex");

    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join("\n");

    const kDate = createHmac("sha256", `AWS4${this.config.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac("sha256", kDate).update(region).digest();
    const kService = createHmac("sha256", kRegion).update(service).digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();

    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

    headers["Authorization"] =
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return headers;
  }

  async upload(key: string, filePath: string): Promise<void> {
    const { createHash } = await import("crypto");
    const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath);
      stream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });

    const payloadHash = createHash("sha256").update(fileBuffer).digest("hex");

    const baseUrl = this.getBaseUrl();
    const pathPrefix = this.config.endpoint ? `/${this.config.bucket}` : "";
    const objectPath = `${pathPrefix}/${key}`;
    const url = `${baseUrl}/${key}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(fileBuffer.length),
      Host: new URL(baseUrl).host,
    };

    const signedHeaders = await this.signRequest("PUT", objectPath, headers, payloadHash);

    const response = await fetch(url, {
      method: "PUT",
      headers: signedHeaders,
      body: new Uint8Array(fileBuffer),
      signal: AbortSignal.timeout(600000), // 10 min upload timeout
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`S3 upload failed: ${response.status} ${response.statusText} - ${body}`);
    }

    logger.info("Backup uploaded to S3", { key, sizeBytes: fileBuffer.length });
  }

  async download(key: string, destPath: string): Promise<void> {
    const { createHash } = await import("crypto");

    const baseUrl = this.getBaseUrl();
    const pathPrefix = this.config.endpoint ? `/${this.config.bucket}` : "";
    const objectPath = `${pathPrefix}/${key}`;
    const url = `${baseUrl}/${key}`;

    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      Host: new URL(baseUrl).host,
    };

    const signedHeaders = await this.signRequest("GET", objectPath, headers, payloadHash);

    const response = await fetch(url, {
      method: "GET",
      headers: signedHeaders,
      signal: AbortSignal.timeout(600000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`S3 download failed: ${response.status} ${response.statusText} - ${body}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(destPath);
      ws.on("finish", resolve);
      ws.on("error", reject);
      ws.write(buffer);
      ws.end();
    });

    logger.info("Backup downloaded from S3", { key, destPath });
  }

  async delete(key: string): Promise<void> {
    const { createHash } = await import("crypto");

    const baseUrl = this.getBaseUrl();
    const pathPrefix = this.config.endpoint ? `/${this.config.bucket}` : "";
    const objectPath = `${pathPrefix}/${key}`;
    const url = `${baseUrl}/${key}`;

    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      Host: new URL(baseUrl).host,
    };

    const signedHeaders = await this.signRequest("DELETE", objectPath, headers, payloadHash);

    const response = await fetch(url, {
      method: "DELETE",
      headers: signedHeaders,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new Error(`S3 delete failed: ${response.status} ${response.statusText} - ${body}`);
    }

    logger.debug("Backup deleted from S3", { key });
  }

  async listObjects(prefix: string): Promise<Array<{ key: string; lastModified: string; size: number }>> {
    const { createHash } = await import("crypto");

    const baseUrl = this.getBaseUrl();
    const pathPrefix = this.config.endpoint ? `/${this.config.bucket}` : "";
    const objectPath = `${pathPrefix}/?list-type=2&prefix=${encodeURIComponent(prefix)}`;
    const url = `${baseUrl}/?list-type=2&prefix=${encodeURIComponent(prefix)}`;

    const payloadHash = createHash("sha256").update("").digest("hex");

    const headers: Record<string, string> = {
      Host: new URL(baseUrl).host,
    };

    const signedHeaders = await this.signRequest("GET", objectPath, headers, payloadHash);

    const response = await fetch(url, {
      method: "GET",
      headers: signedHeaders,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`S3 list failed: ${response.status} ${response.statusText} - ${body}`);
    }

    const xml = await response.text();
    const objects: Array<{ key: string; lastModified: string; size: number }> = [];

    const contentMatches = xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g);
    for (const match of contentMatches) {
      const content = match[1];
      const keyMatch = content.match(/<Key>(.*?)<\/Key>/);
      const modifiedMatch = content.match(/<LastModified>(.*?)<\/LastModified>/);
      const sizeMatch = content.match(/<Size>(.*?)<\/Size>/);

      if (keyMatch) {
        objects.push({
          key: keyMatch[1],
          lastModified: modifiedMatch?.[1] || "",
          size: sizeMatch ? parseInt(sizeMatch[1], 10) : 0,
        });
      }
    }

    return objects;
  }
}

// =============================================================================
// Backup Manager
// =============================================================================

class BackupManager {
  private config: BackupStrategyConfig;
  private s3: S3Client;
  private activeBackups: number = 0;

  constructor() {
    this.config = getBackupConfig();
    this.s3 = new S3Client(this.config.s3);
  }

  // ---------------------------------------------------------------------------
  // Core Backup Operations
  // ---------------------------------------------------------------------------

  async createBackup(
    type: BackupType = "full",
    tierOverride?: BackupTier,
  ): Promise<BackupResult> {
    const backupId = randomUUID();
    const now = new Date();
    const tier = tierOverride || determineBackupTier(now);

    // Concurrency guard
    if (this.activeBackups >= this.config.maxConcurrentBackups) {
      logger.warn("Maximum concurrent backups reached", {
        active: this.activeBackups,
        max: this.config.maxConcurrentBackups,
      });
      return { success: false, record: null, error: "Maximum concurrent backups exceeded" };
    }

    // Acquire distributed lock
    const lockAcquired = await this.acquireLock(backupId);
    if (!lockAcquired) {
      logger.warn("Backup lock already held, another backup may be in progress");
      return { success: false, record: null, error: "Backup lock already held" };
    }

    this.activeBackups++;
    const startTime = Date.now();

    const record: BackupRecord = {
      id: backupId,
      timestamp: now.toISOString(),
      type,
      tier,
      sizeBytes: 0,
      s3Key: "",
      status: "in_progress",
      durationMs: 0,
      checksum: "",
      verifiedAt: null,
    };

    try {
      logger.info("Starting backup", { id: backupId, type, tier });
      await redis.set(REDIS_KEYS.BACKUP_RUNNING, JSON.stringify(record), 7200); // 2hr TTL

      // Step 1: Run pg_dump
      const dumpPath = await this.runPgDump(backupId, type);

      // Step 2: Compress
      const compressedPath = this.config.compressionEnabled
        ? await this.compressFile(dumpPath)
        : dumpPath;

      // Step 3: Compute checksum
      const checksum = await computeFileChecksum(compressedPath);

      // Step 4: Get file size
      const stat = statSync(compressedPath);

      // Step 5: Upload to S3
      record.s3Key = formatS3Key(record);
      await this.s3.upload(record.s3Key, compressedPath);

      // Step 6: Update record
      record.sizeBytes = stat.size;
      record.checksum = checksum;
      record.durationMs = Date.now() - startTime;
      record.status = "completed";

      // Step 7: Save metadata
      await this.saveBackupRecord(record);

      // Step 8: Cleanup local temp files
      this.cleanupTempFile(dumpPath);
      if (compressedPath !== dumpPath) {
        this.cleanupTempFile(compressedPath);
      }

      // Step 9: Optional verification
      if (this.config.verificationEnabled && type === "full") {
        const verification = await this.verifyBackup(record);
        if (verification.success) {
          record.status = "verified";
          record.verifiedAt = new Date().toISOString();
          await this.saveBackupRecord(record);
        } else {
          logger.warn("Backup verification failed", {
            id: backupId,
            error: verification.error,
          });
        }
      }

      logger.info("Backup completed", {
        id: backupId,
        type,
        tier,
        sizeBytes: record.sizeBytes,
        durationMs: record.durationMs,
        status: record.status,
      });

      // Step 10: Update stats
      await this.updateStats(record);

      return { success: true, record, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      record.status = "failed";
      record.durationMs = Date.now() - startTime;

      logger.error("Backup failed", {
        id: backupId,
        type,
        tier,
        error: errorMessage,
      });

      await this.saveBackupRecord(record);

      return { success: false, record, error: errorMessage };
    } finally {
      this.activeBackups--;
      await this.releaseLock(backupId);
      await redis.del(REDIS_KEYS.BACKUP_RUNNING);
    }
  }

  async triggerOnDemand(type: BackupType = "full"): Promise<BackupResult> {
    logger.info("On-demand backup triggered", { type });
    return this.createBackup(type, "daily");
  }

  // ---------------------------------------------------------------------------
  // pg_dump Execution
  // ---------------------------------------------------------------------------

  private async runPgDump(backupId: string, type: BackupType): Promise<string> {
    const db = parseDatabaseUrl(this.config.databaseUrl);
    const outputPath = join(tmpdir(), `nubabel-backup-${backupId}.sql`);

    const args: string[] = [
      "-h", db.host,
      "-p", db.port,
      "-U", db.user,
      "-d", db.database,
      "--no-password",
      "-f", outputPath,
    ];

    switch (type) {
      case "full":
        args.push("--format=plain");
        break;
      case "schema":
        args.push("--schema-only", "--format=plain");
        break;
      case "data":
        args.push("--data-only", "--format=plain");
        break;
    }

    logger.debug("Running pg_dump", {
      backupId,
      type,
      host: db.host,
      database: db.database,
    });

    await execFileAsync(this.config.pgDumpPath, args, {
      env: { PGPASSWORD: db.password },
      timeout: 3600000, // 1 hour
    });

    logger.debug("pg_dump completed", { backupId, outputPath });
    return outputPath;
  }

  // ---------------------------------------------------------------------------
  // Compression
  // ---------------------------------------------------------------------------

  private async compressFile(inputPath: string): Promise<string> {
    const outputPath = `${inputPath}.gz`;
    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);
    const gzip = createGzip({ level: 6 });

    await pipeline(input, gzip, output);
    logger.debug("File compressed", { inputPath, outputPath });
    return outputPath;
  }

  // ---------------------------------------------------------------------------
  // Backup Verification (restore to temp DB and check)
  // ---------------------------------------------------------------------------

  async verifyBackup(record: BackupRecord): Promise<VerificationResult> {
    const startTime = Date.now();
    const tempDbName = `nubabel_verify_${record.id.replace(/-/g, "_").slice(0, 20)}`;
    const db = parseDatabaseUrl(this.config.databaseUrl);
    const pgEnv = { PGPASSWORD: db.password };
    const downloadPath = join(tmpdir(), `nubabel-verify-${record.id}.sql.gz`);
    const sqlPath = join(tmpdir(), `nubabel-verify-${record.id}.sql`);

    try {
      logger.info("Starting backup verification", { backupId: record.id, tempDb: tempDbName });

      // Step 1: Download from S3
      await this.s3.download(record.s3Key, downloadPath);

      // Step 2: Decompress
      const input = createReadStream(downloadPath);
      const output = createWriteStream(sqlPath);
      const gunzip = createGunzip();
      await pipeline(input, gunzip, output);

      // Step 3: Create temporary database
      await execFileAsync(this.config.psqlPath, [
        "-h", db.host,
        "-p", db.port,
        "-U", db.user,
        "-d", "postgres",
        "--no-password",
        "-c", `CREATE DATABASE ${tempDbName};`,
      ], { env: pgEnv });

      // Step 4: Restore backup into temp database
      await execFileAsync(this.config.psqlPath, [
        "-h", db.host,
        "-p", db.port,
        "-U", db.user,
        "-d", tempDbName,
        "--no-password",
        "-f", sqlPath,
      ], { env: pgEnv, timeout: 1800000 }); // 30 min

      // Step 5: Run validation queries
      const tableCountResult = await execFileAsync(this.config.psqlPath, [
        "-h", db.host,
        "-p", db.port,
        "-U", db.user,
        "-d", tempDbName,
        "--no-password",
        "-t", "-c",
        "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';",
      ], { env: pgEnv });

      const tableCount = parseInt(tableCountResult.stdout.trim(), 10) || 0;

      const rowSampleResult = await execFileAsync(this.config.psqlPath, [
        "-h", db.host,
        "-p", db.port,
        "-U", db.user,
        "-d", tempDbName,
        "--no-password",
        "-t", "-c",
        `SELECT COALESCE(SUM(n_live_tup), 0) FROM pg_stat_user_tables;`,
      ], { env: pgEnv });

      const rowSample = parseInt(rowSampleResult.stdout.trim(), 10) || 0;

      const durationMs = Date.now() - startTime;

      logger.info("Backup verification passed", {
        backupId: record.id,
        tableCount,
        rowSample,
        durationMs,
      });

      return {
        success: tableCount > 0,
        backupId: record.id,
        tableCount,
        rowSample,
        durationMs,
        error: tableCount === 0 ? "No tables found in restored database" : null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Backup verification failed", {
        backupId: record.id,
        error: errorMessage,
      });
      return {
        success: false,
        backupId: record.id,
        tableCount: 0,
        rowSample: 0,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    } finally {
      // Cleanup: drop temp database
      try {
        await execFileAsync(this.config.psqlPath, [
          "-h", db.host,
          "-p", db.port,
          "-U", db.user,
          "-d", "postgres",
          "--no-password",
          "-c", `DROP DATABASE IF EXISTS ${tempDbName};`,
        ], { env: pgEnv });
      } catch (dropErr) {
        logger.warn("Failed to drop verification database", {
          tempDb: tempDbName,
          error: dropErr instanceof Error ? dropErr.message : String(dropErr),
        });
      }

      // Cleanup temp files
      this.cleanupTempFile(downloadPath);
      this.cleanupTempFile(sqlPath);
    }
  }

  // ---------------------------------------------------------------------------
  // Retention Policy Enforcement
  // ---------------------------------------------------------------------------

  async enforceRetention(): Promise<{ deleted: number; errors: number }> {
    logger.info("Enforcing backup retention policies", { retention: this.config.retention });

    let deleted = 0;
    let errors = 0;

    const tiers: BackupTier[] = ["daily", "weekly", "monthly"];

    for (const tier of tiers) {
      try {
        const maxAgeDays = this.getMaxAgeDays(tier);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

        const objects = await this.s3.listObjects(`backups/${tier}/`);

        for (const obj of objects) {
          const objDate = new Date(obj.lastModified);
          if (objDate < cutoffDate) {
            try {
              await this.s3.delete(obj.key);
              deleted++;
              logger.debug("Deleted expired backup", { key: obj.key, tier, age: obj.lastModified });
            } catch (deleteErr) {
              errors++;
              logger.error("Failed to delete expired backup", {
                key: obj.key,
                error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
              });
            }
          }
        }
      } catch (tierErr) {
        errors++;
        logger.error("Failed to enforce retention for tier", {
          tier,
          error: tierErr instanceof Error ? tierErr.message : String(tierErr),
        });
      }
    }

    logger.info("Retention enforcement completed", { deleted, errors });
    return { deleted, errors };
  }

  private getMaxAgeDays(tier: BackupTier): number {
    switch (tier) {
      case "daily":
        return this.config.retention.daily;
      case "weekly":
        return this.config.retention.weekly * 7;
      case "monthly":
        return this.config.retention.monthly * 30;
    }
  }

  // ---------------------------------------------------------------------------
  // WAL Archiving (Point-in-Time Recovery)
  // ---------------------------------------------------------------------------

  getWALArchiveConfig(): WALArchiveConfig {
    return { ...this.config.wal };
  }

  getPostgresqlConfSnippet(): string {
    if (!this.config.wal.enabled) {
      return "# WAL archiving is disabled";
    }

    return [
      "# === Nubabel Backup WAL Archiving ===",
      "wal_level = replica",
      "archive_mode = on",
      `archive_command = '${this.config.wal.archiveCommand}'`,
      "max_wal_senders = 3",
      "wal_keep_size = 1024  # MB",
      "",
      "# Point-in-time recovery settings",
      `# restore_command = '${this.config.wal.restoreCommand}'`,
      "# recovery_target_time = '2024-01-01 12:00:00 UTC'  # set as needed",
    ].join("\n");
  }

  async generateRecoveryConf(targetTime: string): Promise<string> {
    logger.info("Generating recovery configuration", { targetTime });
    return [
      "# Nubabel Point-in-Time Recovery Configuration",
      `restore_command = '${this.config.wal.restoreCommand}'`,
      `recovery_target_time = '${targetTime}'`,
      "recovery_target_action = 'promote'",
    ].join("\n");
  }

  // ---------------------------------------------------------------------------
  // Scheduled Backup Execution
  // ---------------------------------------------------------------------------

  async runScheduledBackup(): Promise<BackupResult> {
    const now = new Date();
    const tier = determineBackupTier(now);

    logger.info("Running scheduled backup", { tier, timestamp: now.toISOString() });

    const result = await this.createBackup("full", tier);

    // Enforce retention after each scheduled backup
    if (result.success) {
      try {
        await this.enforceRetention();
      } catch (retentionErr) {
        logger.error("Retention enforcement failed after backup", {
          error: retentionErr instanceof Error ? retentionErr.message : String(retentionErr),
        });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Status and History
  // ---------------------------------------------------------------------------

  async getBackupHistory(limit: number = 20): Promise<BackupRecord[]> {
    const historyJson = await redis.get(REDIS_KEYS.BACKUP_HISTORY);
    if (!historyJson) return [];

    const history: BackupRecord[] = JSON.parse(historyJson);
    return history.slice(0, limit);
  }

  async getLatestBackup(): Promise<BackupRecord | null> {
    const latestJson = await redis.get(REDIS_KEYS.BACKUP_LATEST);
    if (!latestJson) return null;
    return JSON.parse(latestJson);
  }

  async getRunningBackup(): Promise<BackupRecord | null> {
    const runningJson = await redis.get(REDIS_KEYS.BACKUP_RUNNING);
    if (!runningJson) return null;
    return JSON.parse(runningJson);
  }

  async getStats(): Promise<Record<string, string>> {
    const statsJson = await redis.get(REDIS_KEYS.BACKUP_STATS);
    if (!statsJson) {
      return {
        totalBackups: "0",
        totalSizeBytes: "0",
        lastSuccessful: "never",
        lastFailed: "never",
        averageDurationMs: "0",
      };
    }
    return JSON.parse(statsJson);
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private async acquireLock(backupId: string): Promise<boolean> {
    const existing = await redis.get(REDIS_KEYS.BACKUP_LOCK);
    if (existing) return false;
    return redis.set(REDIS_KEYS.BACKUP_LOCK, backupId, 7200); // 2hr TTL
  }

  private async releaseLock(backupId: string): Promise<void> {
    const current = await redis.get(REDIS_KEYS.BACKUP_LOCK);
    if (current === backupId) {
      await redis.del(REDIS_KEYS.BACKUP_LOCK);
    }
  }

  private async saveBackupRecord(record: BackupRecord): Promise<void> {
    // Update latest
    await redis.set(REDIS_KEYS.BACKUP_LATEST, JSON.stringify(record));

    // Append to history (keep last 100)
    const historyJson = await redis.get(REDIS_KEYS.BACKUP_HISTORY);
    const history: BackupRecord[] = historyJson ? JSON.parse(historyJson) : [];

    const existingIndex = history.findIndex((r) => r.id === record.id);
    if (existingIndex >= 0) {
      history[existingIndex] = record;
    } else {
      history.unshift(record);
    }

    const trimmed = history.slice(0, 100);
    await redis.set(REDIS_KEYS.BACKUP_HISTORY, JSON.stringify(trimmed));
  }

  private async updateStats(record: BackupRecord): Promise<void> {
    const statsJson = await redis.get(REDIS_KEYS.BACKUP_STATS);
    const stats = statsJson
      ? JSON.parse(statsJson)
      : { totalBackups: 0, totalSizeBytes: 0, lastSuccessful: "never", lastFailed: "never", totalDurationMs: 0 };

    stats.totalBackups = (parseInt(stats.totalBackups, 10) || 0) + 1;
    stats.totalSizeBytes = (parseInt(stats.totalSizeBytes, 10) || 0) + record.sizeBytes;
    stats.totalDurationMs = (parseInt(stats.totalDurationMs, 10) || 0) + record.durationMs;
    stats.averageDurationMs = String(
      Math.round(parseInt(stats.totalDurationMs, 10) / parseInt(stats.totalBackups, 10)),
    );

    if (record.status === "completed" || record.status === "verified") {
      stats.lastSuccessful = record.timestamp;
    } else if (record.status === "failed") {
      stats.lastFailed = record.timestamp;
    }

    await redis.set(REDIS_KEYS.BACKUP_STATS, JSON.stringify(stats));
  }

  private cleanupTempFile(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (err) {
      logger.warn("Failed to cleanup temp file", {
        path: filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const backupManager = new BackupManager();
