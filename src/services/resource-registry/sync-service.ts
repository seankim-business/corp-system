/**
 * Resource Sync Service
 * Handles synchronization between external resources and internal system
 */

import { ResourceMapping, ResourceLinkedRecord, ResourceSyncLog, Prisma } from "@prisma/client";
import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";
import { decrypt } from "../../utils/encryption";
import { getProvider, ProviderContext, SyncResult, SyncOptions, ExternalRecord } from "./providers";

// ============================================================================
// Sync Service
// ============================================================================

export class SyncService {
  /**
   * Sync a single mapping (pull records from external source)
   */
  async syncMapping(
    mappingId: string,
    triggeredBy: string,
    options?: SyncOptions
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const syncLog = await this.createSyncLog(mappingId, "pull", triggeredBy);

    try {
      // Get mapping with connection
      const mapping = await prisma.resourceMapping.findUnique({
        where: { id: mappingId },
        include: { connection: true },
      });

      if (!mapping || !mapping.connection) {
        throw new Error(`Mapping ${mappingId} not found`);
      }

      // Get provider
      const provider = getProvider(mapping.connection.providerType);
      if (!provider) {
        throw new Error(`Provider ${mapping.connection.providerType} not found`);
      }

      // Build context
      const ctx: ProviderContext = {
        organizationId: mapping.organizationId,
        connectionId: mapping.connectionId,
        credentials: this.decryptCredentials(mapping.connection.credentials),
        connectionUrl: mapping.connection.connectionUrl || undefined,
      };

      // Fetch records from external source
      const result: SyncResult = {
        success: true,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        recordsFailed: 0,
        errors: [],
        durationMs: 0,
      };

      let cursor: string | undefined;
      const batchSize = options?.batchSize || 100;
      const existingRecords = new Map<string, ResourceLinkedRecord>();

      // Load existing linked records
      const existing = await prisma.resourceLinkedRecord.findMany({
        where: { mappingId },
      });
      for (const record of existing) {
        existingRecords.set(record.externalRecordId, record);
      }

      // Fetch and process records in batches
      do {
        const recordList = await provider.fetchRecords(ctx, mapping.externalResourceId, {
          cursor,
          limit: batchSize,
          modifiedSince: options?.fullSync ? undefined : mapping.lastSyncAt || undefined,
        });

        for (const externalRecord of recordList.records) {
          try {
            await this.processRecord(mapping, externalRecord, existingRecords, result, options);
            result.recordsProcessed++;
          } catch (error) {
            result.recordsFailed++;
            result.errors.push({
              recordId: externalRecord.id,
              message: error instanceof Error ? error.message : String(error),
            });
            logger.error("Failed to process record", {
              mappingId,
              recordId: externalRecord.id,
              error,
            });
          }
        }

        cursor = recordList.cursor;
      } while (cursor);

      // Update mapping last sync time
      await prisma.resourceMapping.update({
        where: { id: mappingId },
        data: {
          lastSyncAt: new Date(),
          syncError: null,
        },
      });

      result.durationMs = Date.now() - startTime;
      await this.completeSyncLog(syncLog.id, "completed", result);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update mapping with error
      await prisma.resourceMapping.update({
        where: { id: mappingId },
        data: { syncError: errorMessage },
      });

      const result: SyncResult = {
        success: false,
        recordsProcessed: 0,
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        recordsFailed: 0,
        errors: [{ message: errorMessage }],
        durationMs: Date.now() - startTime,
      };

      await this.completeSyncLog(syncLog.id, "failed", result, errorMessage);

      throw error;
    }
  }

  /**
   * Sync all active mappings for a connection
   */
  async syncConnection(connectionId: string, triggeredBy: string): Promise<SyncResult[]> {
    const mappings = await prisma.resourceMapping.findMany({
      where: { connectionId, isActive: true },
    });

    const results: SyncResult[] = [];
    for (const mapping of mappings) {
      try {
        const result = await this.syncMapping(mapping.id, triggeredBy);
        results.push(result);
      } catch (error) {
        logger.error("Failed to sync mapping", { mappingId: mapping.id, error });
        results.push({
          success: false,
          recordsProcessed: 0,
          recordsCreated: 0,
          recordsUpdated: 0,
          recordsDeleted: 0,
          recordsFailed: 0,
          errors: [{ message: error instanceof Error ? error.message : String(error) }],
          durationMs: 0,
        });
      }
    }

    return results;
  }

  /**
   * Get sync history for a mapping
   */
  async getSyncHistory(
    mappingId: string,
    limit = 20
  ): Promise<ResourceSyncLog[]> {
    return prisma.resourceSyncLog.findMany({
      where: { mappingId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Get linked records for a mapping
   */
  async getLinkedRecords(
    mappingId: string,
    options?: { cursor?: string; limit?: number; status?: string }
  ): Promise<{ records: ResourceLinkedRecord[]; hasMore: boolean; cursor?: string }> {
    const limit = options?.limit || 50;
    const where: { mappingId: string; syncStatus?: string; id?: { gt: string } } = { mappingId };

    if (options?.status) {
      where.syncStatus = options.status;
    }
    if (options?.cursor) {
      where.id = { gt: options.cursor };
    }

    const records = await prisma.resourceLinkedRecord.findMany({
      where,
      take: limit + 1,
      orderBy: { id: "asc" },
    });

    const hasMore = records.length > limit;
    if (hasMore) {
      records.pop();
    }

    return {
      records,
      hasMore,
      cursor: records.length > 0 ? records[records.length - 1].id : undefined,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async processRecord(
    mapping: ResourceMapping,
    externalRecord: ExternalRecord,
    existingRecords: Map<string, ResourceLinkedRecord>,
    result: SyncResult,
    options?: SyncOptions
  ): Promise<void> {
    const existing = existingRecords.get(externalRecord.id);

    // Apply field mappings to transform data
    const transformedData = this.applyFieldMappings(
      externalRecord.data,
      mapping.fieldMappings as Record<string, string>
    );

    if (options?.dryRun) {
      // Just count what would happen
      if (existing) {
        result.recordsUpdated++;
      } else {
        result.recordsCreated++;
      }
      return;
    }

    if (existing) {
      // Update existing linked record
      await prisma.resourceLinkedRecord.update({
        where: { id: existing.id },
        data: {
          cachedData: transformedData as Prisma.InputJsonValue,
          lastFetchedAt: new Date(),
          lastSyncAt: new Date(),
          syncStatus: "synced",
          syncError: null,
        },
      });
      result.recordsUpdated++;
    } else {
      // Create new linked record
      await prisma.resourceLinkedRecord.create({
        data: {
          organizationId: mapping.organizationId,
          mappingId: mapping.id,
          externalRecordId: externalRecord.id,
          cachedData: transformedData as Prisma.InputJsonValue,
          lastFetchedAt: new Date(),
          lastSyncAt: new Date(),
          syncStatus: "synced",
        },
      });
      result.recordsCreated++;
    }
  }

  private applyFieldMappings(
    data: Record<string, unknown>,
    mappings: Record<string, string>
  ): Record<string, unknown> {
    if (!mappings || Object.keys(mappings).length === 0) {
      return data;
    }

    const transformed: Record<string, unknown> = {};

    // Keep original data
    for (const [key, value] of Object.entries(data)) {
      transformed[key] = value;
    }

    // Apply mappings (external field -> internal field)
    for (const [externalField, internalField] of Object.entries(mappings)) {
      if (externalField in data) {
        transformed[internalField] = data[externalField];
      }
    }

    return transformed;
  }

  private decryptCredentials(encrypted: unknown): Record<string, unknown> {
    if (typeof encrypted !== "object" || encrypted === null) {
      return {};
    }

    const creds = encrypted as Record<string, unknown>;
    const decrypted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(creds)) {
      if (typeof value === "string" && value.startsWith("encrypted:")) {
        try {
          decrypted[key] = decrypt(value.replace("encrypted:", ""));
        } catch {
          decrypted[key] = value;
        }
      } else {
        decrypted[key] = value;
      }
    }

    return decrypted;
  }

  private async createSyncLog(
    mappingId: string,
    operation: string,
    triggeredBy: string
  ): Promise<ResourceSyncLog> {
    const mapping = await prisma.resourceMapping.findUnique({
      where: { id: mappingId },
      select: { organizationId: true, connectionId: true },
    });

    if (!mapping) {
      throw new Error(`Mapping ${mappingId} not found`);
    }

    return prisma.resourceSyncLog.create({
      data: {
        organizationId: mapping.organizationId,
        connectionId: mapping.connectionId,
        mappingId,
        operation,
        status: "started",
        triggeredBy,
        startedAt: new Date(),
      },
    });
  }

  private async completeSyncLog(
    logId: string,
    status: string,
    result: SyncResult,
    errorMessage?: string
  ): Promise<void> {
    await prisma.resourceSyncLog.update({
      where: { id: logId },
      data: {
        status,
        completedAt: new Date(),
        durationMs: result.durationMs,
        recordsProcessed: result.recordsProcessed,
        recordsCreated: result.recordsCreated,
        recordsUpdated: result.recordsUpdated,
        recordsDeleted: result.recordsDeleted,
        recordsFailed: result.recordsFailed,
        errorMessage,
        errorDetails: result.errors.length > 0 ? (result.errors as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  }
}

export const syncService = new SyncService();
