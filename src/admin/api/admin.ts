/**
 * Admin API Routes
 *
 * Platform administration endpoints for managing organizations,
 * users, metrics, and system health.
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import {
  requireAdminAuth,
  requireAdminPermission,
  logAdminAction,
} from "../middleware/admin-auth";
import { adminMetricsService } from "../services/metrics";
import { adminOrganizationsService } from "../services/organizations";
import { adminUsersService } from "../services/users";
import { adminRevenueService } from "../services/revenue";
import { adminSystemHealthService } from "../services/system-health";
import { adminSupportService } from "../services/support";
import { logger } from "../../utils/logger";

const router = Router();

// Apply auth middleware to all admin routes
router.use(requireAuth);
router.use(requireAdminAuth);

// ============================================================================
// METRICS
// ============================================================================

/**
 * GET /admin/metrics
 * Get platform-wide metrics
 */
router.get("/metrics", async (_req: Request, res: Response) => {
  try {
    const metrics = await adminMetricsService.getMetrics();
    return res.json(metrics);
  } catch (error) {
    logger.error("Failed to get metrics", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get metrics" });
  }
});

/**
 * GET /admin/metrics/history
 * Get historical metrics
 */
router.get("/metrics/history", async (req: Request, res: Response) => {
  try {
    const days = Number(req.query.days) || 30;
    const history = await adminMetricsService.getMetricsHistory(days);
    return res.json(history);
  } catch (error) {
    logger.error("Failed to get metrics history", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get metrics history" });
  }
});

/**
 * GET /admin/metrics/revenue
 * Get revenue-specific metrics
 */
router.get(
  "/metrics/revenue",
  requireAdminPermission("view:revenue"),
  async (_req: Request, res: Response) => {
    try {
      const [metrics, distribution, topOrgs] = await Promise.all([
        adminRevenueService.getRevenueMetrics(),
        adminRevenueService.getPlanDistribution(),
        adminRevenueService.getTopOrganizationsBySpend(10),
      ]);

      return res.json({
        metrics,
        planDistribution: distribution,
        topOrganizations: topOrgs,
      });
    } catch (error) {
      logger.error("Failed to get revenue metrics", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get revenue metrics" });
    }
  },
);

// ============================================================================
// ORGANIZATIONS
// ============================================================================

/**
 * GET /admin/organizations
 * List all organizations
 */
router.get("/organizations", async (req: Request, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string,
      plan: req.query.plan as string,
      status: req.query.status as string,
      sortBy: req.query.sortBy as "name" | "createdAt" | "memberCount" | "monthlySpend",
      sortOrder: req.query.sortOrder as "asc" | "desc",
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    };

    const result = await adminOrganizationsService.listOrganizations(filters);
    return res.json(result);
  } catch (error) {
    logger.error("Failed to list organizations", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to list organizations" });
  }
});

/**
 * GET /admin/organizations/:id
 * Get organization details
 */
router.get("/organizations/:id", async (req: Request, res: Response) => {
  try {
    const orgId = String(req.params.id);
    const details = await adminMetricsService.getOrganizationDetails(orgId);
    return res.json(details);
  } catch (error) {
    logger.error("Failed to get organization", {
      error: error instanceof Error ? error.message : String(error),
      orgId: req.params.id,
    });
    return res.status(500).json({ error: "Failed to get organization" });
  }
});

/**
 * GET /admin/organizations/:id/activity
 * Get organization activity log
 */
router.get("/organizations/:id/activity", async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const activity = await adminOrganizationsService.getActivityLog(String(req.params.id), {
      limit,
      offset,
    });
    return res.json(activity);
  } catch (error) {
    logger.error("Failed to get organization activity", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get organization activity" });
  }
});

/**
 * POST /admin/organizations/:id/impersonate
 * Start impersonating an organization
 */
router.post(
  "/organizations/:id/impersonate",
  requireAdminPermission("impersonate"),
  async (req: Request, res: Response) => {
    try {
      const orgId = req.params.id;
      const adminId = req.adminUser!.id;

      await logAdminAction(adminId, "start_impersonation", { organizationId: orgId });

      // Return impersonation token/header instruction
      return res.json({
        success: true,
        message: "Use X-Impersonate-Org header with organization ID",
        organizationId: orgId,
      });
    } catch (error) {
      logger.error("Failed to start impersonation", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to start impersonation" });
    }
  },
);

/**
 * POST /admin/organizations/:id/suspend
 * Suspend an organization
 */
router.post(
  "/organizations/:id/suspend",
  requireAdminPermission("suspend:organizations"),
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "Suspension reason is required" });
      }

      await adminOrganizationsService.suspendOrganization(
        String(req.params.id),
        req.adminUser!.id,
        reason,
      );

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to suspend organization", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to suspend organization" });
    }
  },
);

/**
 * POST /admin/organizations/:id/reactivate
 * Reactivate a suspended organization
 */
router.post(
  "/organizations/:id/reactivate",
  requireAdminPermission("suspend:organizations"),
  async (req: Request, res: Response) => {
    try {
      await adminOrganizationsService.reactivateOrganization(
        String(req.params.id),
        req.adminUser!.id,
      );

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to reactivate organization", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to reactivate organization" });
    }
  },
);

/**
 * PUT /admin/organizations/:id/plan
 * Update organization plan
 */
router.put(
  "/organizations/:id/plan",
  requireAdminPermission("manage:organizations"),
  async (req: Request, res: Response) => {
    try {
      const { plan } = req.body;
      if (!plan) {
        return res.status(400).json({ error: "Plan is required" });
      }

      await adminOrganizationsService.updatePlan(String(req.params.id), req.adminUser!.id, plan);

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to update plan", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to update plan" });
    }
  },
);

// ============================================================================
// USERS
// ============================================================================

/**
 * GET /admin/users
 * List all users
 */
router.get("/users", async (req: Request, res: Response) => {
  try {
    const filters = {
      search: req.query.search as string,
      emailVerified: req.query.emailVerified === "true" ? true : req.query.emailVerified === "false" ? false : undefined,
      hasGoogleAuth: req.query.hasGoogleAuth === "true" ? true : req.query.hasGoogleAuth === "false" ? false : undefined,
      sortBy: req.query.sortBy as "email" | "createdAt" | "displayName",
      sortOrder: req.query.sortOrder as "asc" | "desc",
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 20,
    };

    const result = await adminUsersService.listUsers(filters);
    return res.json(result);
  } catch (error) {
    logger.error("Failed to list users", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to list users" });
  }
});

/**
 * GET /admin/users/:id
 * Get user details
 */
router.get("/users/:id", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.id);
    const details = await adminUsersService.getUserDetails(userId);
    return res.json(details);
  } catch (error) {
    logger.error("Failed to get user", {
      error: error instanceof Error ? error.message : String(error),
      userId: req.params.id,
    });
    return res.status(500).json({ error: "Failed to get user" });
  }
});

/**
 * POST /admin/users/:id/disable
 * Disable a user account
 */
router.post(
  "/users/:id/disable",
  requireAdminPermission("manage:users"),
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "Reason is required" });
      }

      await adminUsersService.disableUser(String(req.params.id), req.adminUser!.id, reason);

      return res.json({ success: true });
    } catch (error) {
      logger.error("Failed to disable user", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to disable user" });
    }
  },
);

/**
 * POST /admin/users/:id/reset-password
 * Initiate password reset for user
 */
router.post(
  "/users/:id/reset-password",
  requireAdminPermission("manage:users"),
  async (req: Request, res: Response) => {
    try {
      const result = await adminUsersService.initiatePasswordReset(
        String(req.params.id),
        req.adminUser!.id,
      );

      return res.json(result);
    } catch (error) {
      logger.error("Failed to initiate password reset", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to initiate password reset" });
    }
  },
);

// ============================================================================
// SYSTEM
// ============================================================================

/**
 * GET /admin/system/health
 * Get system health status
 */
router.get(
  "/system/health",
  requireAdminPermission("view:system"),
  async (_req: Request, res: Response) => {
    try {
      const health = await adminSystemHealthService.getHealth();
      return res.json(health);
    } catch (error) {
      logger.error("Failed to get system health", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get system health" });
    }
  },
);

/**
 * GET /admin/system/logs
 * Get system logs
 */
router.get(
  "/system/logs",
  requireAdminPermission("view:system"),
  async (req: Request, res: Response) => {
    try {
      const options = {
        level: req.query.level as string,
        component: req.query.component as string,
        search: req.query.search as string,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 100,
      };

      const logs = await adminSystemHealthService.getLogs(options);
      return res.json(logs);
    } catch (error) {
      logger.error("Failed to get system logs", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get system logs" });
    }
  },
);

/**
 * GET /admin/system/performance
 * Get performance metrics
 */
router.get(
  "/system/performance",
  requireAdminPermission("view:system"),
  async (_req: Request, res: Response) => {
    try {
      const metrics = await adminSystemHealthService.getPerformanceMetrics();
      return res.json(metrics);
    } catch (error) {
      logger.error("Failed to get performance metrics", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get performance metrics" });
    }
  },
);

// ============================================================================
// SUPPORT
// ============================================================================

/**
 * GET /admin/support/tickets
 * List support tickets
 */
router.get(
  "/support/tickets",
  requireAdminPermission("view:support"),
  async (req: Request, res: Response) => {
    try {
      const filters = {
        status: req.query.status as "open" | "in_progress" | "waiting" | "resolved" | "closed",
        priority: req.query.priority as "low" | "medium" | "high" | "urgent",
        category: req.query.category as string,
        assignedTo: req.query.assignedTo as string,
        organizationId: req.query.organizationId as string,
        search: req.query.search as string,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
      };

      const result = await adminSupportService.listTickets(filters);
      return res.json(result);
    } catch (error) {
      logger.error("Failed to list tickets", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to list tickets" });
    }
  },
);

/**
 * GET /admin/support/tickets/:id
 * Get ticket details
 */
router.get(
  "/support/tickets/:id",
  requireAdminPermission("view:support"),
  async (req: Request, res: Response) => {
    try {
      const ticket = await adminSupportService.getTicket(String(req.params.id));
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      return res.json(ticket);
    } catch (error) {
      logger.error("Failed to get ticket", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get ticket" });
    }
  },
);

/**
 * PUT /admin/support/tickets/:id/status
 * Update ticket status
 */
router.put(
  "/support/tickets/:id/status",
  requireAdminPermission("manage:support"),
  async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const ticket = await adminSupportService.updateTicketStatus(
        String(req.params.id),
        status,
        req.adminUser!.id,
      );
      return res.json(ticket);
    } catch (error) {
      logger.error("Failed to update ticket status", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to update ticket status" });
    }
  },
);

/**
 * POST /admin/support/tickets/:id/assign
 * Assign ticket to admin
 */
router.post(
  "/support/tickets/:id/assign",
  requireAdminPermission("manage:support"),
  async (req: Request, res: Response) => {
    try {
      const { assigneeId } = req.body;
      const ticket = await adminSupportService.assignTicket(
        String(req.params.id),
        assigneeId,
        req.adminUser!.id,
      );
      return res.json(ticket);
    } catch (error) {
      logger.error("Failed to assign ticket", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to assign ticket" });
    }
  },
);

/**
 * POST /admin/support/tickets/:id/messages
 * Add message to ticket
 */
router.post(
  "/support/tickets/:id/messages",
  requireAdminPermission("manage:support"),
  async (req: Request, res: Response) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ error: "Message content is required" });
      }

      const message = await adminSupportService.addMessage(
        String(req.params.id),
        req.adminUser!.id,
        req.adminUser!.displayName,
        "admin",
        content,
      );
      return res.json(message);
    } catch (error) {
      logger.error("Failed to add message", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to add message" });
    }
  },
);

/**
 * GET /admin/support/stats
 * Get support statistics
 */
router.get(
  "/support/stats",
  requireAdminPermission("view:support"),
  async (_req: Request, res: Response) => {
    try {
      const stats = await adminSupportService.getStats();
      return res.json(stats);
    } catch (error) {
      logger.error("Failed to get support stats", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Failed to get support stats" });
    }
  },
);

export default router;
