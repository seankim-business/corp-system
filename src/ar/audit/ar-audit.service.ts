/**
 * AR Audit Logging Service
 *
 * Provides comprehensive audit logging for all AR operations using the existing AuditLog model:
 * - Assignment changes
 * - Approval decisions
 * - Structure modifications
 * - Meta-agent actions
 * - Configuration changes
 */

import { db as prisma } from "../../db/client";
import { logger } from "../../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export type ARAuditAction =
  // Assignment actions
  | 'ar.assignment.create'
  | 'ar.assignment.update'
  | 'ar.assignment.delete'
  | 'ar.assignment.status_change'
  // Department actions
  | 'ar.department.create'
  | 'ar.department.update'
  | 'ar.department.delete'
  | 'ar.department.restructure'
  // Position actions
  | 'ar.position.create'
  | 'ar.position.update'
  | 'ar.position.delete'
  // Approval actions
  | 'ar.approval.request'
  | 'ar.approval.approve'
  | 'ar.approval.reject'
  | 'ar.approval.escalate'
  | 'ar.approval.timeout'
  // Coordination actions
  | 'ar.coordination.rebalance'
  | 'ar.coordination.priority_change'
  | 'ar.coordination.issue_detect'
  // Meta-agent actions
  | 'ar.meta_agent.ops_check'
  | 'ar.meta_agent.analysis'
  | 'ar.meta_agent.coaching'
  | 'ar.meta_agent.recommendation'
  // Template actions
  | 'ar.template.apply'
  | 'ar.template.create'
  | 'ar.template.update'
  // System actions
  | 'ar.system.config_change'
  | 'ar.system.error';

export type ARAuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ARAuditEntry {
  id: string;
  organizationId: string;
  action: ARAuditAction;
  severity: ARAuditSeverity;
  actorType: 'user' | 'agent' | 'system';
  actorId: string;
  actorName: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  description: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

export interface AuditQueryOptions {
  organizationId: string;
  action?: ARAuditAction | ARAuditAction[];
  actorId?: string;
  targetId?: string;
  severity?: ARAuditSeverity | ARAuditSeverity[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ARAuditService {
  /**
   * Log an audit entry using the existing AuditLog model
   */
  async log(entry: Omit<ARAuditEntry, 'id' | 'timestamp'>): Promise<ARAuditEntry> {
    const auditEntry: ARAuditEntry = {
      ...entry,
      id: `ar-audit-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: new Date(),
    };

    try {
      // Store in database using existing AuditLog model
      // AR-specific data goes in the details JSON field
      await prisma.auditLog.create({
        data: {
          organizationId: auditEntry.organizationId,
          action: auditEntry.action,
          userId: auditEntry.actorType === 'user' ? auditEntry.actorId : null,
          resourceType: auditEntry.targetType || 'ar_operation',
          resourceId: auditEntry.targetId,
          details: JSON.parse(JSON.stringify({
            // AR-specific fields stored in details JSON
            severity: auditEntry.severity,
            actorType: auditEntry.actorType,
            actorId: auditEntry.actorId,
            actorName: auditEntry.actorName,
            targetName: auditEntry.targetName,
            description: auditEntry.description,
            changes: auditEntry.changes,
            metadata: auditEntry.metadata,
          })),
          ipAddress: auditEntry.ipAddress,
          userAgent: auditEntry.userAgent,
          success: auditEntry.severity !== 'error' && auditEntry.severity !== 'critical',
          errorMessage: auditEntry.severity === 'error' || auditEntry.severity === 'critical'
            ? auditEntry.description
            : null,
        },
      });

      // Also log to structured logger for monitoring
      logger.info("AR Audit", {
        auditId: auditEntry.id,
        action: auditEntry.action,
        severity: auditEntry.severity,
        actor: `${auditEntry.actorType}:${auditEntry.actorId}`,
        target: auditEntry.targetId ? `${auditEntry.targetType}:${auditEntry.targetId}` : null,
        description: auditEntry.description,
      });

      return auditEntry;
    } catch (error) {
      // If DB write fails, still log to file
      logger.error("Failed to write AR audit to database", {
        error: error instanceof Error ? error.message : String(error),
        entry: auditEntry,
      });

      // Log to file anyway
      logger.info("AR Audit (fallback)", auditEntry);

      return auditEntry;
    }
  }

  /**
   * Query audit logs for AR operations
   */
  async query(options: AuditQueryOptions): Promise<{
    entries: ARAuditEntry[];
    total: number;
    hasMore: boolean;
  }> {
    const where: Record<string, unknown> = {
      organizationId: options.organizationId,
      // Filter to only AR actions (prefixed with 'ar.')
      action: options.action
        ? Array.isArray(options.action)
          ? { in: options.action }
          : options.action
        : { startsWith: 'ar.' },
    };

    if (options.targetId) {
      where.resourceId = options.targetId;
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        (where.createdAt as Record<string, Date>).gte = options.startDate;
      }
      if (options.endDate) {
        (where.createdAt as Record<string, Date>).lte = options.endDate;
      }
    }

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Transform DB entries to ARAuditEntry format
    const arEntries: ARAuditEntry[] = entries.map((e) => {
      const details = (e.details || {}) as Record<string, unknown>;
      return {
        id: e.id,
        organizationId: e.organizationId,
        action: e.action as ARAuditAction,
        severity: (details.severity as ARAuditSeverity) || 'info',
        actorType: (details.actorType as 'user' | 'agent' | 'system') || 'system',
        actorId: (details.actorId as string) || e.userId || 'unknown',
        actorName: (details.actorName as string) || 'Unknown',
        targetType: e.resourceType || undefined,
        targetId: e.resourceId || undefined,
        targetName: (details.targetName as string) || undefined,
        description: (details.description as string) || '',
        changes: details.changes as Record<string, { before: unknown; after: unknown }> | undefined,
        metadata: details.metadata as Record<string, unknown> | undefined,
        ipAddress: e.ipAddress || undefined,
        userAgent: e.userAgent || undefined,
        timestamp: e.createdAt,
      };
    });

    // Apply actor/severity filters in memory (not supported in DB query directly)
    let filteredEntries = arEntries;

    if (options.actorId) {
      filteredEntries = filteredEntries.filter(e => e.actorId === options.actorId);
    }

    if (options.severity) {
      const severities = Array.isArray(options.severity) ? options.severity : [options.severity];
      filteredEntries = filteredEntries.filter(e => severities.includes(e.severity));
    }

    return {
      entries: filteredEntries,
      total,
      hasMore: offset + entries.length < total,
    };
  }

  /**
   * Get audit trail for a specific entity
   */
  async getEntityHistory(
    organizationId: string,
    targetType: string,
    targetId: string,
    limit: number = 100
  ): Promise<ARAuditEntry[]> {
    const result = await this.query({
      organizationId,
      targetId,
      limit,
    });

    return result.entries.filter(e => e.targetType === targetType);
  }

  /**
   * Get recent actions by an actor
   */
  async getActorHistory(
    organizationId: string,
    actorId: string,
    limit: number = 50
  ): Promise<ARAuditEntry[]> {
    const result = await this.query({
      organizationId,
      actorId,
      limit,
    });

    return result.entries;
  }

  /**
   * Get critical events in a time period
   */
  async getCriticalEvents(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ARAuditEntry[]> {
    const result = await this.query({
      organizationId,
      severity: ['critical', 'error'],
      startDate,
      endDate,
      limit: 1000,
    });

    return result.entries;
  }

  /**
   * Generate audit summary report
   */
  async generateSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    period: { start: Date; end: Date };
    totalEntries: number;
    bySeverity: Record<string, number>;
    byAction: Record<string, number>;
    byActor: Array<{ actorId: string; actorName: string; count: number }>;
    topTargets: Array<{ targetId: string; targetType: string; count: number }>;
  }> {
    const result = await this.query({
      organizationId,
      startDate,
      endDate,
      limit: 10000,
    });

    const entries = result.entries;

    // Count by severity
    const bySeverity: Record<string, number> = {};
    for (const entry of entries) {
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
    }

    // Count by action
    const byAction: Record<string, number> = {};
    for (const entry of entries) {
      byAction[entry.action] = (byAction[entry.action] || 0) + 1;
    }

    // Count by actor
    const actorCounts = new Map<string, { actorName: string; count: number }>();
    for (const entry of entries) {
      const existing = actorCounts.get(entry.actorId);
      if (existing) {
        existing.count++;
      } else {
        actorCounts.set(entry.actorId, { actorName: entry.actorName, count: 1 });
      }
    }
    const byActor = Array.from(actorCounts.entries())
      .map(([actorId, data]) => ({ actorId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Count by target
    const targetCounts = new Map<string, { targetType: string; count: number }>();
    for (const entry of entries) {
      if (entry.targetId) {
        const existing = targetCounts.get(entry.targetId);
        if (existing) {
          existing.count++;
        } else {
          targetCounts.set(entry.targetId, {
            targetType: entry.targetType || 'unknown',
            count: 1,
          });
        }
      }
    }
    const topTargets = Array.from(targetCounts.entries())
      .map(([targetId, data]) => ({ targetId, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      period: { start: startDate, end: endDate },
      totalEntries: entries.length,
      bySeverity,
      byAction,
      byActor,
      topTargets,
    };
  }

  // ===========================================================================
  // CONVENIENCE METHODS
  // ===========================================================================

  /**
   * Log assignment change
   */
  async logAssignmentChange(
    organizationId: string,
    actionType: 'create' | 'update' | 'delete' | 'status_change',
    actorType: 'user' | 'agent' | 'system',
    actorId: string,
    actorName: string,
    assignmentId: string,
    agentName: string,
    changes?: Record<string, { before: unknown; after: unknown }>
  ): Promise<ARAuditEntry> {
    return this.log({
      organizationId,
      action: `ar.assignment.${actionType}` as ARAuditAction,
      severity: 'info',
      actorType,
      actorId,
      actorName,
      targetType: 'assignment',
      targetId: assignmentId,
      targetName: agentName,
      description: `Assignment ${actionType}: ${agentName}`,
      changes,
    });
  }

  /**
   * Log approval action
   */
  async logApprovalAction(
    organizationId: string,
    actionType: 'request' | 'approve' | 'reject' | 'escalate' | 'timeout',
    actorType: 'user' | 'agent' | 'system',
    actorId: string,
    actorName: string,
    requestId: string,
    requestTitle: string,
    metadata?: Record<string, unknown>
  ): Promise<ARAuditEntry> {
    const severityMap: Record<string, ARAuditSeverity> = {
      request: 'info',
      approve: 'info',
      reject: 'warning',
      escalate: 'warning',
      timeout: 'warning',
    };

    return this.log({
      organizationId,
      action: `ar.approval.${actionType}` as ARAuditAction,
      severity: severityMap[actionType] || 'info',
      actorType,
      actorId,
      actorName,
      targetType: 'approval_request',
      targetId: requestId,
      targetName: requestTitle,
      description: `Approval ${actionType}: ${requestTitle}`,
      metadata,
    });
  }

  /**
   * Log meta-agent action
   */
  async logMetaAgentAction(
    organizationId: string,
    agentType: 'ops' | 'analyst' | 'coach',
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<ARAuditEntry> {
    const actionMap: Record<string, ARAuditAction> = {
      ops: 'ar.meta_agent.ops_check',
      analyst: 'ar.meta_agent.analysis',
      coach: 'ar.meta_agent.coaching',
    };

    return this.log({
      organizationId,
      action: actionMap[agentType] || 'ar.meta_agent.ops_check',
      severity: 'info',
      actorType: 'agent',
      actorId: `ar-${agentType}`,
      actorName: `AR ${agentType.charAt(0).toUpperCase() + agentType.slice(1)}`,
      description,
      metadata,
    });
  }

  /**
   * Log system error
   */
  async logError(
    organizationId: string,
    error: Error,
    context?: Record<string, unknown>
  ): Promise<ARAuditEntry> {
    return this.log({
      organizationId,
      action: 'ar.system.error',
      severity: 'error',
      actorType: 'system',
      actorId: 'system',
      actorName: 'System',
      description: error.message,
      metadata: {
        errorName: error.name,
        stack: error.stack,
        ...context,
      },
    });
  }
}

// Export singleton
export const arAuditService = new ARAuditService();
