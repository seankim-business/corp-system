/**
 * Agent Hierarchy API
 *
 * Provides endpoints for managing and querying agent organizational structure.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db/client";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";

const router = Router();

// ============== Validation Schemas ==============

const agentIdParamSchema = z.object({
  id: z.string().min(1, "Agent ID is required"),
});

const updateManagerSchema = z.object({
  managerId: z.string().nullable(),
});

// ============== Helper Types ==============

interface AgentNode {
  id: string;
  name: string;
  role: string;
  type: string;
  managerId: string | null;
  organizationId: string;
  skillsCount: number;
  subordinates: AgentNode[];
}

interface AgentBasic {
  id: string;
  name: string;
  role: string;
  type: string;
  managerId: string | null;
  organizationId: string;
  skillsCount: number;
}

type AgentWithCount = {
  id: string;
  name: string;
  role: string;
  type: string;
  managerId: string | null;
  organizationId: string;
  _count: {
    agentSkills: number;
  };
};

// ============== Helper Functions ==============

/**
 * Build a nested tree structure from flat agent list
 */
function buildHierarchyTree(agents: AgentBasic[]): AgentNode[] {
  const agentMap = new Map<string, AgentNode>();
  const roots: AgentNode[] = [];

  // Create node map
  agents.forEach((agent) => {
    agentMap.set(agent.id, {
      ...agent,
      subordinates: [],
    });
  });

  // Build tree
  agents.forEach((agent) => {
    const node = agentMap.get(agent.id)!;

    if (agent.managerId) {
      const parent = agentMap.get(agent.managerId);
      if (parent) {
        parent.subordinates.push(node);
      } else {
        // Parent not found in current org, treat as root
        roots.push(node);
      }
    } else {
      // No manager, this is a root node
      roots.push(node);
    }
  });

  return roots;
}

/**
 * Get reporting chain from agent to top
 */
async function getReportingChain(agentId: string, organizationId: string): Promise<AgentBasic[]> {
  const chain: AgentBasic[] = [];
  let currentId: string | null = agentId;

  while (currentId) {
    const agentResult: AgentWithCount | null = await db.agent.findFirst({
      where: {
        id: currentId,
        organizationId,
      },
      select: {
        id: true,
        name: true,
        role: true,
        type: true,
        managerId: true,
        organizationId: true,
        _count: {
          select: {
            agentSkills: true,
          },
        },
      },
    });

    if (!agentResult) break;

    chain.push({
      id: agentResult.id,
      name: agentResult.name,
      role: agentResult.role,
      type: agentResult.type,
      managerId: agentResult.managerId,
      organizationId: agentResult.organizationId,
      skillsCount: agentResult._count.agentSkills,
    });

    currentId = agentResult.managerId;

    // Prevent infinite loops
    if (chain.length > 50) {
      logger.error("Circular reference detected in agent hierarchy", { agentId, organizationId });
      break;
    }
  }

  return chain;
}

/**
 * Check if updating managerId would create a circular reference
 */
async function wouldCreateCircularReference(
  agentId: string,
  newManagerId: string,
  organizationId: string,
): Promise<boolean> {
  // If trying to set self as manager
  if (agentId === newManagerId) {
    return true;
  }

  // Check if new manager is a subordinate of this agent
  const managerChain = await getReportingChain(newManagerId, organizationId);
  return managerChain.some((agent) => agent.id === agentId);
}

// ============== Routes ==============

/**
 * GET /hierarchy - Get full organization tree of agents
 */
router.get(
  "/hierarchy",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;

      const agents = await db.agent.findMany({
        where: { organizationId },
        select: {
          id: true,
          name: true,
          role: true,
          type: true,
          managerId: true,
          organizationId: true,
          _count: {
            select: {
              agentSkills: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      const agentBasics: AgentBasic[] = agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        type: agent.type,
        managerId: agent.managerId,
        organizationId: agent.organizationId,
        skillsCount: agent._count.agentSkills,
      }));

      const tree = buildHierarchyTree(agentBasics);

      return res.json({
        tree,
        totalAgents: agents.length,
      });
    } catch (error) {
      logger.error("Failed to get agent hierarchy", {}, error as Error);
      return res.status(500).json({ error: "Failed to get agent hierarchy" });
    }
  },
);

/**
 * GET /:id/subordinates - Get direct reports for an agent
 */
router.get(
  "/:id/subordinates",
  requireAuth,
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = req.params.id as string;

      // Verify agent exists and belongs to organization
      const agent = await db.agent.findFirst({
        where: {
          id: agentId,
          organizationId,
        },
      });

      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const subordinates = await db.agent.findMany({
        where: {
          managerId: agentId,
          organizationId,
        },
        select: {
          id: true,
          name: true,
          role: true,
          type: true,
          managerId: true,
          organizationId: true,
          _count: {
            select: {
              agentSkills: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      const subordinatesList: AgentBasic[] = subordinates.map((sub) => ({
        id: sub.id,
        name: sub.name,
        role: sub.role,
        type: sub.type,
        managerId: sub.managerId,
        organizationId: sub.organizationId,
        skillsCount: sub._count.agentSkills,
      }));

      return res.json({
        agentId,
        agentName: agent.name,
        subordinates: subordinatesList,
        count: subordinates.length,
      });
    } catch (error) {
      logger.error("Failed to get agent subordinates", { agentId: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to get agent subordinates" });
    }
  },
);

/**
 * GET /:id/chain - Get reporting chain to top
 */
router.get(
  "/:id/chain",
  requireAuth,
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = req.params.id as string;

      // Verify agent exists and belongs to organization
      const agent = await db.agent.findFirst({
        where: {
          id: agentId,
          organizationId,
        },
      });

      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const chain = await getReportingChain(agentId, organizationId);

      return res.json({
        agentId,
        agentName: agent.name,
        chain,
        depth: chain.length,
      });
    } catch (error) {
      logger.error("Failed to get agent reporting chain", { agentId: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to get agent reporting chain" });
    }
  },
);

/**
 * PUT /:id/manager - Update manager relationship
 */
router.put(
  "/:id/manager",
  requireAuth,
  validate({ params: agentIdParamSchema, body: updateManagerSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentId = req.params.id as string;
      const { managerId } = req.body as z.infer<typeof updateManagerSchema>;

      // Verify agent exists and belongs to organization
      const agent = await db.agent.findFirst({
        where: {
          id: agentId,
          organizationId,
        },
      });

      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      // If setting a manager, validate it
      if (managerId) {
        // Verify manager exists and belongs to same organization
        const manager = await db.agent.findFirst({
          where: {
            id: managerId,
            organizationId,
          },
        });

        if (!manager) {
          return res.status(404).json({ error: "Manager agent not found" });
        }

        // Check for circular references
        const isCircular = await wouldCreateCircularReference(agentId, managerId, organizationId);
        if (isCircular) {
          return res.status(400).json({
            error: "Cannot set manager: would create circular reference",
          });
        }
      }

      // Update the manager relationship
      const updatedAgent = await db.agent.update({
        where: { id: agentId },
        data: { managerId },
        select: {
          id: true,
          name: true,
          role: true,
          type: true,
          managerId: true,
          organizationId: true,
          _count: {
            select: {
              agentSkills: true,
            },
          },
        },
      });

      logger.info("Agent manager updated", {
        agentId,
        agentName: agent.name,
        newManagerId: managerId,
      });

      return res.json({
        message: "Manager relationship updated successfully",
        agent: {
          id: updatedAgent.id,
          name: updatedAgent.name,
          role: updatedAgent.role,
          type: updatedAgent.type,
          managerId: updatedAgent.managerId,
          organizationId: updatedAgent.organizationId,
          skillsCount: updatedAgent._count.agentSkills,
        },
      });
    } catch (error) {
      logger.error("Failed to update agent manager", { agentId: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to update agent manager" });
    }
  },
);

export default router;
