import { db } from "../db/client";
import type {
  UsageRecord,
  CreateUsageRecordInput,
  UsageRecordFilters,
  UsageStats,
} from "../models/usage-record.model";
import type { Prisma } from "@prisma/client";

export class UsageRecordRepository {
  async findById(id: string): Promise<UsageRecord | null> {
    return db.usageRecord.findUnique({
      where: { id },
    }) as Promise<UsageRecord | null>;
  }

  async findByOrganization(organizationId: string, limit: number = 100): Promise<UsageRecord[]> {
    return db.usageRecord.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }) as Promise<UsageRecord[]>;
  }

  async findBySessionId(sessionId: string): Promise<UsageRecord[]> {
    return db.usageRecord.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    }) as Promise<UsageRecord[]>;
  }

  async findMany(filters: UsageRecordFilters): Promise<UsageRecord[]> {
    const where: Prisma.UsageRecordWhereInput = {};

    if (filters.organizationId) {
      where.organizationId = filters.organizationId;
    }

    if (filters.sessionId) {
      where.sessionId = filters.sessionId;
    }

    if (filters.model) {
      const modelArray = Array.isArray(filters.model) ? filters.model : [filters.model];
      where.model = { in: modelArray };
    }

    if (filters.category) {
      const categoryArray = Array.isArray(filters.category) ? filters.category : [filters.category];
      where.category = { in: categoryArray };
    }

    if (filters.agentId) {
      where.agentId = filters.agentId;
    }

    if (filters.createdAfter) {
      where.createdAt = { gte: filters.createdAfter };
    }

    if (filters.createdBefore) {
      where.createdAt = { ...(where.createdAt as object), lte: filters.createdBefore };
    }

    if (filters.minCost !== undefined) {
      where.costCents = { gte: filters.minCost };
    }

    if (filters.maxCost !== undefined) {
      where.costCents = { ...(where.costCents as object), lte: filters.maxCost };
    }

    return db.usageRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
    }) as Promise<UsageRecord[]>;
  }

  async create(input: CreateUsageRecordInput): Promise<UsageRecord> {
    return db.usageRecord.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId ?? null,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costCents: input.costCents,
        category: input.category ?? null,
        agentId: input.agentId ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    }) as Promise<UsageRecord>;
  }

  async delete(id: string): Promise<void> {
    await db.usageRecord.delete({
      where: { id },
    });
  }

  async deleteOld(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db.usageRecord.deleteMany({
      where: {
        createdAt: { lte: cutoffDate },
      },
    });

    return result.count;
  }

  async getStats(filters: UsageRecordFilters): Promise<UsageStats> {
    const records = await this.findMany(filters);

    const totalRecords = records.length;
    const totalInputTokens = records.reduce((sum, r) => sum + r.inputTokens, 0);
    const totalOutputTokens = records.reduce((sum, r) => sum + r.outputTokens, 0);
    const totalCostCents = records.reduce((sum, r) => sum + r.costCents, 0);
    const averageCostCents = totalRecords > 0 ? totalCostCents / totalRecords : 0;

    const modelBreakdown: Record<
      string,
      {
        count: number;
        inputTokens: number;
        outputTokens: number;
        costCents: number;
      }
    > = {};

    for (const record of records) {
      if (!modelBreakdown[record.model]) {
        modelBreakdown[record.model] = {
          count: 0,
          inputTokens: 0,
          outputTokens: 0,
          costCents: 0,
        };
      }

      const breakdown = modelBreakdown[record.model];
      breakdown.count++;
      breakdown.inputTokens += record.inputTokens;
      breakdown.outputTokens += record.outputTokens;
      breakdown.costCents += record.costCents;
    }

    return {
      totalRecords,
      totalInputTokens,
      totalOutputTokens,
      totalCostCents,
      averageCostCents: Math.round(averageCostCents),
      modelBreakdown,
    };
  }

  async getTotalCostForPeriod(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const result = await db.usageRecord.aggregate({
      where: {
        organizationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        costCents: true,
      },
    });

    return result._sum.costCents ?? 0;
  }

  async getTokenUsageForPeriod(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ inputTokens: number; outputTokens: number }> {
    const result = await db.usageRecord.aggregate({
      where: {
        organizationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        inputTokens: true,
        outputTokens: true,
      },
    });

    return {
      inputTokens: result._sum.inputTokens ?? 0,
      outputTokens: result._sum.outputTokens ?? 0,
    };
  }

  async getTopModels(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 10,
  ): Promise<Array<{ model: string; count: number; costCents: number }>> {
    const records = await db.usageRecord.findMany({
      where: {
        organizationId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        model: true,
        costCents: true,
      },
    });

    const modelStats: Record<string, { count: number; costCents: number }> = {};

    for (const record of records) {
      if (!modelStats[record.model]) {
        modelStats[record.model] = { count: 0, costCents: 0 };
      }
      modelStats[record.model].count++;
      modelStats[record.model].costCents += record.costCents;
    }

    return Object.entries(modelStats)
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.costCents - a.costCents)
      .slice(0, limit);
  }
}

export const usageRecordRepository = new UsageRecordRepository();
