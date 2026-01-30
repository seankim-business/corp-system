/**
 * Agent Profiles API
 * REST endpoints for managing agents with orchestration capabilities
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { agentProfileService } from "../services/agent-profile";
import { requireAuth } from "../middleware/auth.middleware";
import { validate, uuidParamSchema } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["permanent", "temporary", "contractor"]),
  role: z.string().min(1),
  managerId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  skills: z.array(z.string()).optional(),
  displayName: z.string().max(255).optional(),
  avatar: z.string().optional(),
  position: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  permissionLevel: z.enum(["owner", "admin", "member", "viewer", "restricted"]).optional(),
  claudeMdContent: z.string().optional(),
  mcpConfigJson: z.record(z.unknown()).optional(),
  toolAllowlist: z.array(z.string()).optional(),
  toolDenylist: z.array(z.string()).optional(),
  preferredModel: z.string().max(50).optional(),
  maxTokenBudget: z.number().int().positive().optional(),
  maxConcurrency: z.number().int().min(1).max(10).optional(),
});

const updateAgentSchema = createAgentSchema.partial();

const reassignManagerSchema = z.object({
  newManagerId: z.string().uuid().nullable(),
});

const updateClaudeMdSchema = z.object({
  content: z.string(),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/agents - Create a new agent
 */
router.post(
  "/",
  requireAuth,
  validate({ body: createAgentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const data = req.body;

      const agent = await agentProfileService.createAgent(organizationId, data);

      logger.info("Agent created via API", { agentId: agent.id, organizationId });

      return res.status(201).json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error(
        "Failed to create agent",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to create agent",
      });
    }
  },
);

/**
 * GET /api/v1/agents - List all agents in organization
 */
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const agents = await agentProfileService.getOrgAgents(organizationId);

    return res.json({
      success: true,
      data: agents,
    });
  } catch (error) {
    logger.error(
      "Failed to list agents",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );

    return res.status(500).json({
      success: false,
      error: "Failed to list agents",
    });
  }
});

/**
 * GET /api/v1/agents/org-chart - Get organization chart
 */
router.get("/org-chart", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;

    const orgChart = await agentProfileService.getOrgChart(organizationId);

    return res.json({
      success: true,
      data: orgChart,
    });
  } catch (error) {
    logger.error(
      "Failed to get org chart",
      {},
      error instanceof Error ? error : new Error(String(error)),
    );

    return res.status(500).json({
      success: false,
      error: "Failed to get org chart",
    });
  }
});

/**
 * GET /api/v1/agents/:id - Get agent details
 */
router.get(
  "/:id",
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { organizationId } = req.user!;

      const agent = await agentProfileService.getAgent(id);

      if (!agent) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      // Verify org access
      if (agent.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      return res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error(
        "Failed to get agent",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to get agent",
      });
    }
  },
);

/**
 * PUT /api/v1/agents/:id - Update agent
 */
router.put(
  "/:id",
  requireAuth,
  validate({ params: uuidParamSchema, body: updateAgentSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { organizationId } = req.user!;
      const data = req.body;

      // Verify agent exists and belongs to org
      const existing = await agentProfileService.getAgent(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      if (existing.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      const agent = await agentProfileService.updateAgent(id, data);

      logger.info("Agent updated via API", { agentId: id });

      return res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error(
        "Failed to update agent",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to update agent",
      });
    }
  },
);

/**
 * DELETE /api/v1/agents/:id - Archive agent
 */
router.delete(
  "/:id",
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { organizationId } = req.user!;

      // Verify agent exists and belongs to org
      const existing = await agentProfileService.getAgent(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      if (existing.organizationId !== organizationId) {
        return res.status(403).json({
          success: false,
          error: "Access denied",
        });
      }

      await agentProfileService.archiveAgent(id);

      logger.info("Agent archived via API", { agentId: id });

      return res.json({
        success: true,
        message: "Agent archived",
      });
    } catch (error) {
      logger.error(
        "Failed to archive agent",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to archive agent",
      });
    }
  },
);

/**
 * GET /api/v1/agents/:id/subordinates - Get agent's direct reports
 */
router.get(
  "/:id/subordinates",
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);

      const subordinates = await agentProfileService.getSubordinates(id);

      return res.json({
        success: true,
        data: subordinates,
      });
    } catch (error) {
      logger.error(
        "Failed to get subordinates",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to get subordinates",
      });
    }
  },
);

/**
 * POST /api/v1/agents/:id/reassign - Reassign agent's manager
 */
router.post(
  "/:id/reassign",
  requireAuth,
  validate({ params: uuidParamSchema, body: reassignManagerSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { newManagerId } = req.body;

      const agent = await agentProfileService.reassignManager(id, newManagerId);

      logger.info("Agent manager reassigned", { agentId: id, newManagerId });

      return res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("subordinate")) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      logger.error(
        "Failed to reassign manager",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to reassign manager",
      });
    }
  },
);

/**
 * GET /api/v1/agents/:id/config - Get effective agent configuration
 */
router.get(
  "/:id/config",
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);

      const [claudeMd, mcpConfig] = await Promise.all([
        agentProfileService.generateClaudeMd(id),
        agentProfileService.generateMCPConfig(id),
      ]);

      return res.json({
        success: true,
        data: {
          claudeMd,
          mcpConfig,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Agent not found") {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      logger.error(
        "Failed to get agent config",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to get agent config",
      });
    }
  },
);

/**
 * PUT /api/v1/agents/:id/claude-md - Update agent's CLAUDE.md content
 */
router.put(
  "/:id/claude-md",
  requireAuth,
  validate({ params: uuidParamSchema, body: updateClaudeMdSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const { content } = req.body;

      const agent = await agentProfileService.updateAgent(id, {
        claudeMdContent: content,
      });

      logger.info("Agent CLAUDE.md updated", { agentId: id });

      return res.json({
        success: true,
        data: agent,
      });
    } catch (error) {
      logger.error(
        "Failed to update CLAUDE.md",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to update CLAUDE.md",
      });
    }
  },
);

/**
 * GET /api/v1/agents/:id/permissions - Get effective permissions
 */
router.get(
  "/:id/permissions",
  requireAuth,
  validate({ params: uuidParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);

      const permissions = await agentProfileService.resolveEffectivePermissions(id);

      return res.json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Agent not found") {
        return res.status(404).json({
          success: false,
          error: "Agent not found",
        });
      }

      logger.error(
        "Failed to get permissions",
        {},
        error instanceof Error ? error : new Error(String(error)),
      );

      return res.status(500).json({
        success: false,
        error: "Failed to get permissions",
      });
    }
  },
);

export default router;
