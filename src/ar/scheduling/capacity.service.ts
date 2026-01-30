/**
 * AR Scheduling - Capacity Service
 *
 * Manages agent capacity tracking, including task limits, token usage,
 * and capacity scoring for load balancing.
 */

import { db } from '../../db/client';
import { ARError } from '../errors';

export interface AgentCapacity {
  id: string;
  agentId: string;
  date: Date;
  maxTasks: number;
  currentTasks: number;
  maxTokens: number;
  usedTokens: number;
  capacityScore: number;
  blockedReasons: Array<{ reason: string; severity: string }>;
}

export class CapacityService {
  /**
   * Get agent capacity for a specific date
   */
  async getAgentCapacity(agentId: string, date: Date): Promise<AgentCapacity> {
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { organizationId: true },
    });

    if (!agent?.organizationId) {
      throw new ARError('AGENT_NOT_FOUND', `Agent ${agentId} not found`);
    }

    // Try to find existing capacity record
    const dateStr = new Date(date.toISOString().split('T')[0]);
    let capacity = await db.agentCapacity.findFirst({
      where: {
        agentId,
        date: dateStr,
      },
    });

    // Create default capacity if none exists
    if (!capacity) {
      capacity = await db.agentCapacity.create({
        data: {
          organizationId: agent.organizationId,
          agentId,
          date: dateStr,
          maxTasks: 10,
          currentTasks: 0,
          maxTokens: 100000,
          usedTokens: 0,
          capacityScore: 100,
          blockedReasons: [],
        },
      });
    }

    return {
      id: capacity.id,
      agentId: capacity.agentId,
      date: capacity.date,
      maxTasks: capacity.maxTasks,
      currentTasks: capacity.currentTasks,
      maxTokens: capacity.maxTokens,
      usedTokens: capacity.usedTokens,
      capacityScore: Number(capacity.capacityScore),
      blockedReasons: (capacity.blockedReasons as any) || [],
    };
  }

  /**
   * Update agent capacity
   */
  async updateCapacity(
    agentId: string,
    date: Date,
    updates: Partial<AgentCapacity>,
  ): Promise<void> {
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { organizationId: true },
    });

    if (!agent?.organizationId) {
      throw new ARError('AGENT_NOT_FOUND', `Agent ${agentId} not found`);
    }

    const dateStr = new Date(date.toISOString().split('T')[0]);

    // Calculate new capacity score if task/token values are updated
    const currentCapacity = await this.getAgentCapacity(agentId, date);
    const newCurrentTasks = updates.currentTasks ?? currentCapacity.currentTasks;
    const newMaxTasks = updates.maxTasks ?? currentCapacity.maxTasks;
    const newUsedTokens = updates.usedTokens ?? currentCapacity.usedTokens;
    const newMaxTokens = updates.maxTokens ?? currentCapacity.maxTokens;

    const capacityScore = this.calculateCapacity(
      newCurrentTasks,
      newMaxTasks,
      newUsedTokens,
      newMaxTokens,
      (updates.blockedReasons as any) || currentCapacity.blockedReasons,
    );

    await db.agentCapacity.upsert({
      where: {
        organizationId_agentId_date: {
          organizationId: agent.organizationId,
          agentId,
          date: dateStr,
        },
      },
      create: {
        organizationId: agent.organizationId,
        agentId,
        date: dateStr,
        maxTasks: newMaxTasks,
        currentTasks: newCurrentTasks,
        maxTokens: newMaxTokens,
        usedTokens: newUsedTokens,
        capacityScore,
        blockedReasons: (updates.blockedReasons as any) || [],
      },
      update: {
        ...(updates.maxTasks !== undefined && { maxTasks: updates.maxTasks }),
        ...(updates.currentTasks !== undefined && {
          currentTasks: updates.currentTasks,
        }),
        ...(updates.maxTokens !== undefined && { maxTokens: updates.maxTokens }),
        ...(updates.usedTokens !== undefined && { usedTokens: updates.usedTokens }),
        ...(updates.blockedReasons !== undefined && {
          blockedReasons: updates.blockedReasons as any,
        }),
        capacityScore,
      },
    });
  }

  /**
   * Calculate capacity score (0-100) based on current load
   */
  async calculateCapacityScore(agentId: string, date: Date): Promise<number> {
    const capacity = await this.getAgentCapacity(agentId, date);

    return this.calculateCapacity(
      capacity.currentTasks,
      capacity.maxTasks,
      capacity.usedTokens,
      capacity.maxTokens,
      capacity.blockedReasons,
    );
  }

  /**
   * Get all overloaded agents (capacity score < 20) in an organization
   */
  async getOverloadedAgents(organizationId: string): Promise<AgentCapacity[]> {
    const today = new Date(new Date().toISOString().split('T')[0]);

    const capacities = await db.agentCapacity.findMany({
      where: {
        organizationId,
        date: today,
        capacityScore: {
          lt: 20,
        },
      },
      orderBy: {
        capacityScore: 'asc',
      },
    });

    return capacities.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      date: c.date,
      maxTasks: c.maxTasks,
      currentTasks: c.currentTasks,
      maxTokens: c.maxTokens,
      usedTokens: c.usedTokens,
      capacityScore: Number(c.capacityScore),
      blockedReasons: (c.blockedReasons as any) || [],
    }));
  }

  /**
   * Internal: Calculate capacity score
   */
  private calculateCapacity(
    currentTasks: number,
    maxTasks: number,
    usedTokens: number,
    maxTokens: number,
    blockedReasons: Array<{ reason: string; severity: string }>,
  ): number {
    // Task capacity (0-50 points)
    const taskCapacity =
      maxTasks > 0 ? ((maxTasks - currentTasks) / maxTasks) * 50 : 0;

    // Token capacity (0-50 points)
    const tokenCapacity =
      maxTokens > 0 ? ((maxTokens - usedTokens) / maxTokens) * 50 : 0;

    let score = taskCapacity + tokenCapacity;

    // Apply penalties for blocked reasons
    for (const block of blockedReasons) {
      if (block.severity === 'critical') {
        score -= 50;
      } else if (block.severity === 'high') {
        score -= 25;
      } else if (block.severity === 'medium') {
        score -= 10;
      }
    }

    // Clamp to 0-100
    return Math.max(0, Math.min(100, score));
  }
}
