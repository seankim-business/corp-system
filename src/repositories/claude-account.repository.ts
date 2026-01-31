import { db } from "../db/client";
import type {
  ClaudeAccount,
  CreateClaudeAccountInput,
  UpdateClaudeAccountInput,
  ClaudeAccountFilters,
  AccountStatus,
  AccountMetadata,
} from "../models/claude-account.model";
import type { Prisma } from "@prisma/client";

export class ClaudeAccountRepository {
  async findById(id: string): Promise<ClaudeAccount | null> {
    const result = await db.claudeAccount.findUnique({
      where: { id },
    });
    return result as ClaudeAccount | null;
  }

  async findByOrganizationAndName(
    organizationId: string,
    name: string,
  ): Promise<ClaudeAccount | null> {
    const result = await db.claudeAccount.findUnique({
      where: {
        organizationId_name: {
          organizationId,
          name,
        },
      },
    });
    return result as ClaudeAccount | null;
  }

  async findByStatus(
    organizationId: string,
    status: AccountStatus | AccountStatus[],
  ): Promise<ClaudeAccount[]> {
    const statusArray = Array.isArray(status) ? status : [status];

    const result = await db.claudeAccount.findMany({
      where: {
        organizationId,
        status: { in: statusArray },
      },
      orderBy: [{ status: "asc" }, { lastSuccessAt: "desc" }],
    });
    return result as ClaudeAccount[];
  }

  async findActive(organizationId: string): Promise<ClaudeAccount[]> {
    return this.findByStatus(organizationId, "active");
  }

  async findByTags(organizationId: string, tags: string[]): Promise<ClaudeAccount[]> {
    const result = await db.claudeAccount.findMany({
      where: {
        organizationId,
        status: "active",
        metadata: {
          path: ["tags"],
          array_contains: tags,
        } as Prisma.JsonFilter,
      },
      orderBy: { lastSuccessAt: "desc" },
    });
    return result as ClaudeAccount[];
  }

  async findMany(filters: ClaudeAccountFilters): Promise<ClaudeAccount[]> {
    const where: Prisma.ClaudeAccountWhereInput = {};

    if (filters.organizationId) {
      where.organizationId = filters.organizationId;
    }

    if (filters.status) {
      const statusArray = Array.isArray(filters.status) ? filters.status : [filters.status];
      where.status = { in: statusArray };
    }

    if (filters.tags && filters.tags.length > 0) {
      where.metadata = {
        path: ["tags"],
        array_contains: filters.tags,
      } as Prisma.JsonFilter;
    }

    if (filters.excludeIds && filters.excludeIds.length > 0) {
      where.id = { notIn: filters.excludeIds };
    }

    const result = await db.claudeAccount.findMany({
      where,
      orderBy: [{ status: "asc" }, { lastSuccessAt: "desc" }],
    });
    return result as ClaudeAccount[];
  }

  async findAvailable(
    organizationId: string,
    estimatedTokens: number,
  ): Promise<ClaudeAccount | null> {
    const accounts = await db.claudeAccount.findMany({
      where: {
        organizationId,
        status: { in: ["active", "half_open"] },
        OR: [{ circuitOpensAt: null }, { circuitOpensAt: { lte: new Date() } }],
      },
      orderBy: [{ consecutiveFailures: "asc" }, { lastSuccessAt: "desc" }],
    });

    for (const account of accounts) {
      const metadata = account.metadata as Record<string, unknown>;
      const maxTokens = metadata.maxTokensPerRequest as number | undefined;

      if (!maxTokens || estimatedTokens <= maxTokens) {
        return account as ClaudeAccount;
      }
    }

    return null;
  }

  async create(input: CreateClaudeAccountInput): Promise<ClaudeAccount> {
    const result = await db.claudeAccount.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        status: input.status ?? "active",
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return result as ClaudeAccount;
  }

  async update(id: string, input: UpdateClaudeAccountInput): Promise<ClaudeAccount> {
    const data: Prisma.ClaudeAccountUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.status !== undefined) data.status = input.status;
    if (input.consecutiveFailures !== undefined) data.consecutiveFailures = input.consecutiveFailures;
    if (input.halfOpenSuccesses !== undefined) data.halfOpenSuccesses = input.halfOpenSuccesses;
    if (input.circuitOpensAt !== undefined) data.circuitOpensAt = input.circuitOpensAt;
    if (input.lastFailureAt !== undefined) data.lastFailureAt = input.lastFailureAt;
    if (input.lastFailureReason !== undefined) data.lastFailureReason = input.lastFailureReason;
    if (input.lastSuccessAt !== undefined) data.lastSuccessAt = input.lastSuccessAt;
    if (input.metadata !== undefined) data.metadata = input.metadata as Prisma.InputJsonValue;

    const result = await db.claudeAccount.update({
      where: { id },
      data,
    });
    return result as ClaudeAccount;
  }

  async delete(id: string): Promise<void> {
    await db.claudeAccount.delete({
      where: { id },
    });
  }

  async incrementUsage(
    id: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<ClaudeAccount> {
    const account = await this.findById(id);
    if (!account) {
      throw new Error(`Account ${id} not found`);
    }

    const metadata = account.metadata as Record<string, unknown>;
    const currentDailyTokens = (metadata.currentDailyTokens as number) ?? 0;
    const currentMonthlyTokens = (metadata.currentMonthlyTokens as number) ?? 0;

    return this.update(id, {
      metadata: {
        ...metadata,
        currentDailyTokens: currentDailyTokens + inputTokens + outputTokens,
        currentMonthlyTokens: currentMonthlyTokens + inputTokens + outputTokens,
        lastRequestAt: new Date().toISOString(),
      } as AccountMetadata,
    });
  }

  async resetSlidingWindow(id: string, windowType: "daily" | "monthly"): Promise<ClaudeAccount> {
    const account = await this.findById(id);
    if (!account) {
      throw new Error(`Account ${id} not found`);
    }

    const metadata = account.metadata as Record<string, unknown>;
    const updates: Record<string, unknown> = { ...metadata };

    if (windowType === "daily") {
      updates.currentDailyTokens = 0;
      updates.dailyResetAt = new Date().toISOString();
    } else {
      updates.currentMonthlyTokens = 0;
      updates.monthlyResetAt = new Date().toISOString();
    }

    return this.update(id, { metadata: updates as AccountMetadata });
  }

  async recordFailure(id: string, reason: string): Promise<ClaudeAccount> {
    const account = await this.findById(id);
    if (!account) {
      throw new Error(`Account ${id} not found`);
    }

    const consecutiveFailures = account.consecutiveFailures + 1;
    const updates: UpdateClaudeAccountInput = {
      consecutiveFailures,
      lastFailureAt: new Date(),
      lastFailureReason: reason,
    };

    if (consecutiveFailures >= 5) {
      updates.status = "open";
      updates.circuitOpensAt = new Date(Date.now() + 60000);
    }

    return this.update(id, updates);
  }

  async recordSuccess(id: string): Promise<ClaudeAccount> {
    const account = await this.findById(id);
    if (!account) {
      throw new Error(`Account ${id} not found`);
    }

    const updates: UpdateClaudeAccountInput = {
      consecutiveFailures: 0,
      lastSuccessAt: new Date(),
      lastFailureReason: null,
    };

    if (account.status === "half_open") {
      const halfOpenSuccesses = account.halfOpenSuccesses + 1;
      if (halfOpenSuccesses >= 2) {
        updates.status = "active";
        updates.halfOpenSuccesses = 0;
        updates.circuitOpensAt = null;
      } else {
        updates.halfOpenSuccesses = halfOpenSuccesses;
      }
    } else if (account.status === "open") {
      updates.status = "half_open";
      updates.halfOpenSuccesses = 1;
    }

    return this.update(id, updates);
  }

  async transitionToHalfOpen(id: string): Promise<ClaudeAccount> {
    return this.update(id, {
      status: "half_open",
      halfOpenSuccesses: 0,
    });
  }

  async getHealthyAccountCount(organizationId: string): Promise<number> {
    return db.claudeAccount.count({
      where: {
        organizationId,
        status: { in: ["active", "half_open"] },
      },
    });
  }
}

export const claudeAccountRepository = new ClaudeAccountRepository();
