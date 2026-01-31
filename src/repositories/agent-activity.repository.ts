import { db } from "../db/client";
import type {
  AgentActivity,
  CreateAgentActivityInput,
  UpdateAgentActivityInput,
  AgentActivityFilters,
  AgentActivityStats,
} from "../models/agent-activity.model";
import type { Prisma } from "@prisma/client";

export class AgentActivityRepository {
  async findById(id: string): Promise<AgentActivity | null> {
    const result = await db.agentActivity.findUnique({
      where: { id },
    });
    return result as AgentActivity | null;
  }

  async findBySessionId(sessionId: string): Promise<AgentActivity[]> {
    const result = await db.agentActivity.findMany({
      where: { sessionId },
      orderBy: { startedAt: "asc" },
    });
    return result as AgentActivity[];
  }

  async findByOrganization(organizationId: string, limit: number = 100): Promise<AgentActivity[]> {
    const result = await db.agentActivity.findMany({
      where: { organizationId },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return result as AgentActivity[];
  }

  async findRunning(organizationId: string): Promise<AgentActivity[]> {
    const result = await db.agentActivity.findMany({
      where: {
        organizationId,
        status: "running",
      },
      orderBy: { startedAt: "asc" },
    });
    return result as AgentActivity[];
  }

  async findMany(filters: AgentActivityFilters): Promise<AgentActivity[]> {
    const where: Prisma.AgentActivityWhereInput = {};

    if (filters.organizationId) {
      where.organizationId = filters.organizationId;
    }

    if (filters.sessionId) {
      where.sessionId = filters.sessionId;
    }

    if (filters.agentType) {
      const typeArray = Array.isArray(filters.agentType) ? filters.agentType : [filters.agentType];
      where.agentType = { in: typeArray };
    }

    if (filters.category) {
      const categoryArray = Array.isArray(filters.category) ? filters.category : [filters.category];
      where.category = { in: categoryArray };
    }

    if (filters.status) {
      const statusArray = Array.isArray(filters.status) ? filters.status : [filters.status];
      where.status = { in: statusArray };
    }

    if (filters.startedAfter) {
      where.startedAt = { gte: filters.startedAfter };
    }

    if (filters.startedBefore) {
      where.startedAt = { ...where.startedAt as object, lte: filters.startedBefore };
    }

    if (filters.minDuration !== undefined) {
      where.durationMs = { gte: filters.minDuration };
    }

    if (filters.maxDuration !== undefined) {
      where.durationMs = { ...where.durationMs as object, lte: filters.maxDuration };
    }

    const result = await db.agentActivity.findMany({
      where,
      orderBy: { startedAt: "desc" },
    });
    return result as AgentActivity[];
  }

  async create(input: CreateAgentActivityInput): Promise<AgentActivity> {
    const result = await db.agentActivity.create({
      data: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        agentType: input.agentType,
        agentName: input.agentName ?? null,
        category: input.category ?? null,
        status: input.status ?? "running",
        inputData: (input.inputData ?? null) as Prisma.InputJsonValue,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return result as AgentActivity;
  }

  async update(id: string, input: UpdateAgentActivityInput): Promise<AgentActivity> {
    const data: Prisma.AgentActivityUpdateInput = {};

    if (input.status) {
      data.status = input.status;
    }

    if (input.completedAt !== undefined) {
      data.completedAt = input.completedAt;
    }

    if (input.durationMs !== undefined) {
      data.durationMs = input.durationMs;
    }

    if (input.outputData !== undefined) {
      data.outputData = input.outputData as Prisma.InputJsonValue;
    }

    if (input.errorMessage !== undefined) {
      data.errorMessage = input.errorMessage;
    }

    if (input.metadata) {
      data.metadata = input.metadata as Prisma.InputJsonValue;
    }

    const result = await db.agentActivity.update({
      where: { id },
      data,
    });
    return result as AgentActivity;
  }

  async complete(id: string, outputData?: Record<string, unknown>): Promise<AgentActivity> {
    const activity = await this.findById(id);
    if (!activity) {
      throw new Error(`Activity ${id} not found`);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - activity.startedAt.getTime();

    return this.update(id, {
      status: "completed",
      completedAt,
      durationMs,
      outputData,
    });
  }

  async fail(id: string, errorMessage: string): Promise<AgentActivity> {
    const activity = await this.findById(id);
    if (!activity) {
      throw new Error(`Activity ${id} not found`);
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - activity.startedAt.getTime();

    return this.update(id, {
      status: "failed",
      completedAt,
      durationMs,
      errorMessage,
    });
  }

  async delete(id: string): Promise<void> {
    await db.agentActivity.delete({
      where: { id },
    });
  }

  async deleteOld(daysOld: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db.agentActivity.deleteMany({
      where: {
        startedAt: { lte: cutoffDate },
      },
    });

    return result.count;
  }

  async getStats(filters: AgentActivityFilters): Promise<AgentActivityStats> {
    const activities = await this.findMany(filters);

    const totalActivities = activities.length;
    const completedActivities = activities.filter((a) => a.status === "completed").length;
    const failedActivities = activities.filter((a) => a.status === "failed").length;

    const completedWithDuration = activities.filter(
      (a) => a.status === "completed" && a.durationMs !== null,
    );

    const totalDurationMs = completedWithDuration.reduce((sum, a) => sum + (a.durationMs ?? 0), 0);

    const averageDurationMs =
      completedWithDuration.length > 0 ? totalDurationMs / completedWithDuration.length : 0;

    const successRate = totalActivities > 0 ? completedActivities / totalActivities : 0;

    return {
      totalActivities,
      completedActivities,
      failedActivities,
      averageDurationMs: Math.round(averageDurationMs),
      totalDurationMs,
      successRate,
    };
  }

  async getAgentTypeBreakdown(
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, number>> {
    const activities = await db.agentActivity.findMany({
      where: {
        organizationId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        agentType: true,
      },
    });

    const breakdown: Record<string, number> = {};
    for (const activity of activities) {
      breakdown[activity.agentType] = (breakdown[activity.agentType] ?? 0) + 1;
    }

    return breakdown;
  }
}

export const agentActivityRepository = new AgentActivityRepository();
