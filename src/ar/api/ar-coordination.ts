/**
 * AR Coordination API Routes
 *
 * Handles coordination-related operations including:
 * - Issue detection
 * - Workload rebalancing
 * - Priority optimization
 */

import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logger } from "../../utils/logger";
import { priorityOptimizerService } from "../coordination/priority-optimizer.service";
import { issueDetectorService } from "../coordination/issue-detector.service";
import { workloadRebalancerService } from "../coordination/workload-rebalancer.service";
import { requireOrganization } from "../../middleware/auth.middleware";

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const rebalanceProposalSchema = z.object({
  trigger: z.enum(['overload', 'underutilized', 'deadline_risk', 'performance_issue', 'manual', 'scheduled']).optional(),
  triggerDetails: z.record(z.unknown()).optional(),
});

const applyProposalSchema = z.object({
  proposalId: z.string(),
  partial: z.boolean().optional(),
  changeIds: z.array(z.number()).optional(),
});

// =============================================================================
// PRIORITY OPTIMIZATION ROUTES
// =============================================================================

/**
 * GET /ar/coordination/priorities
 * Get optimized task priorities for organization
 */
router.get(
  "/priorities",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;

      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const result = await priorityOptimizerService.optimizeOrganizationPriorities(orgId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/coordination/priorities/optimize
 * Trigger priority optimization
 */
router.post(
  "/priorities/optimize",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const result = await priorityOptimizerService.optimizeOrganizationPriorities(orgId);

      logger.info("Priority optimization completed via API", {
        organizationId: orgId,
        tasksOptimized: result.priorities.length,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/coordination/priorities/apply
 * Apply optimized priorities to tasks
 */
router.post(
  "/priorities/apply",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      // First get the optimized priorities
      const optimization = await priorityOptimizerService.optimizeOrganizationPriorities(orgId);

      // Then apply them
      const result = await priorityOptimizerService.applyOptimizedPriorities(
        orgId,
        optimization.priorities,
        { dryRun: req.body.dryRun }
      );

      logger.info("Priorities applied via API", {
        organizationId: orgId,
        applied: result.applied,
        skipped: result.skipped,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ISSUE DETECTION ROUTES
// =============================================================================

/**
 * GET /ar/coordination/issues
 * Detect and list current issues in the organization
 */
router.get(
  "/issues",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const result = await issueDetectorService.detectIssues(orgId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /ar/coordination/issues/summary
 * Get summary of issues by severity and category
 */
router.get(
  "/issues/summary",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const result = await issueDetectorService.detectIssues(orgId);

      // Build summary
      const summary = {
        total: result.issues.length,
        bySeverity: {
          critical: result.issues.filter(i => i.severity === 'critical').length,
          high: result.issues.filter(i => i.severity === 'high').length,
          medium: result.issues.filter(i => i.severity === 'medium').length,
          low: result.issues.filter(i => i.severity === 'low').length,
        },
        byCategory: {} as Record<string, number>,
        topIssues: result.issues.slice(0, 5),
      };

      for (const issue of result.issues) {
        summary.byCategory[issue.category] = (summary.byCategory[issue.category] || 0) + 1;
      }

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// WORKLOAD REBALANCING ROUTES
// =============================================================================

/**
 * GET /ar/coordination/workload
 * Get current workload distribution analysis
 */
router.get(
  "/workload",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const analysis = await workloadRebalancerService.analyzeWorkloadDistribution(orgId);

      res.json({
        success: true,
        data: {
          stats: {
            avgWorkload: analysis.avgWorkload,
            stdDeviation: analysis.stdDeviation,
            totalAgents: analysis.snapshots.length,
            overloaded: analysis.overloaded.length,
            underutilized: analysis.underutilized.length,
            balanced: analysis.balanced.length,
          },
          snapshots: analysis.snapshots,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/coordination/workload/rebalance
 * Generate a rebalancing proposal
 */
router.post(
  "/workload/rebalance",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const validation = rebalanceProposalSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: validation.error.format() });
        return;
      }

      const proposal = await workloadRebalancerService.generateRebalanceProposal(
        orgId,
        validation.data.trigger || 'manual',
        validation.data.triggerDetails
      );

      logger.info("Rebalance proposal generated via API", {
        organizationId: orgId,
        proposalId: proposal.id,
        changesCount: proposal.proposedChanges.length,
      });

      res.json({
        success: true,
        data: proposal,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /ar/coordination/workload/apply
 * Apply a rebalancing proposal
 */
router.post(
  "/workload/apply",
  requireOrganization,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = (req as any).organizationId || req.headers['x-organization-id'] as string;
      if (!orgId) {
        res.status(400).json({ error: "Organization ID required" });
        return;
      }

      const validation = applyProposalSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ error: validation.error.format() });
        return;
      }

      const result = await workloadRebalancerService.applyProposal(
        orgId,
        validation.data.proposalId,
        {
          partial: validation.data.partial,
          changeIds: validation.data.changeIds,
        }
      );

      logger.info("Rebalance proposal applied via API", {
        organizationId: orgId,
        proposalId: validation.data.proposalId,
        appliedChanges: result.appliedChanges,
        success: result.success,
      });

      res.json({
        success: result.success,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
