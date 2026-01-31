import { db } from "../db/client";
import type {
  QuotaAlert,
  CreateQuotaAlertInput,
  QuotaAlertFilters,
} from "../models/quota-alert.model";
import type { Prisma } from "@prisma/client";

export class QuotaAlertRepository {
  async findById(id: string): Promise<QuotaAlert | null> {
    return db.quotaAlert.findUnique({
      where: { id },
    }) as Promise<QuotaAlert | null>;
  }

  async findByAccountId(accountId: string): Promise<QuotaAlert[]> {
    return db.quotaAlert.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    }) as Promise<QuotaAlert[]>;
  }

  async findUnresolved(accountId: string): Promise<QuotaAlert[]> {
    return db.quotaAlert.findMany({
      where: {
        accountId,
        resolvedAt: null,
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    }) as Promise<QuotaAlert[]>;
  }

  async findMany(filters: QuotaAlertFilters): Promise<QuotaAlert[]> {
    const where: Prisma.QuotaAlertWhereInput = {};

    if (filters.accountId) {
      where.accountId = filters.accountId;
    }

    if (filters.type) {
      const typeArray = Array.isArray(filters.type) ? filters.type : [filters.type];
      where.type = { in: typeArray };
    }

    if (filters.severity) {
      const severityArray = Array.isArray(filters.severity) ? filters.severity : [filters.severity];
      where.severity = { in: severityArray };
    }

    if (filters.quotaType) {
      where.quotaType = filters.quotaType;
    }

    if (filters.resolved !== undefined) {
      where.resolvedAt = filters.resolved ? { not: null } : null;
    }

    if (filters.createdAfter) {
      where.createdAt = { gte: filters.createdAfter };
    }

    if (filters.createdBefore) {
      where.createdAt = { ...(where.createdAt as object), lte: filters.createdBefore };
    }

    return db.quotaAlert.findMany({
      where,
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    }) as Promise<QuotaAlert[]>;
  }

  async create(input: CreateQuotaAlertInput): Promise<QuotaAlert> {
    return db.quotaAlert.create({
      data: {
        account: {
          connect: { id: input.accountId },
        },
        type: input.type,
        severity: input.severity,
        message: input.message,
        currentValue: input.currentValue,
        limit: input.limit,
        percentage: input.percentage,
        quotaType: input.quotaType,
      },
    }) as Promise<QuotaAlert>;
  }

  async resolve(id: string): Promise<QuotaAlert> {
    return db.quotaAlert.update({
      where: { id },
      data: { resolvedAt: new Date() },
    }) as Promise<QuotaAlert>;
  }

  async resolveByAccountId(accountId: string): Promise<number> {
    const result = await db.quotaAlert.updateMany({
      where: {
        accountId,
        resolvedAt: null,
      },
      data: { resolvedAt: new Date() },
    });

    return result.count;
  }

  async delete(id: string): Promise<void> {
    await db.quotaAlert.delete({
      where: { id },
    });
  }

  async deleteOldResolved(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db.quotaAlert.deleteMany({
      where: {
        resolvedAt: { not: null, lte: cutoffDate },
      },
    });

    return result.count;
  }

  async getCriticalAlertCount(accountId: string): Promise<number> {
    return db.quotaAlert.count({
      where: {
        accountId,
        severity: "critical",
        resolvedAt: null,
      },
    });
  }
}

export const quotaAlertRepository = new QuotaAlertRepository();
