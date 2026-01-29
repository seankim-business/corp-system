/**
 * Agent & Skill Admin API
 *
 * Provides CRUD operations for agents and skills.
 * - READ operations read directly from YAML files
 * - CREATE/UPDATE/DELETE operations create GitHub PRs
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { validate } from "../middleware/validation.middleware";
import { loadAgents, AgentConfig } from "../config/agent-loader";
import { loadSkills, SkillConfig, clearSkillCache } from "../config/skill-loader";
import { syncToGitHub, SSOTPromoteRequest, getPendingSSOTPullRequests } from "../services/github-ssot";
import { logger } from "../utils/logger";
import YAML from "yaml";

const router = Router();

// ============== Validation Schemas ==============

const agentIdParamSchema = z.object({
  id: z.string().min(1, "Agent ID is required"),
});

const skillIdParamSchema = z.object({
  id: z.string().min(1, "Skill ID is required"),
});

const createAgentSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(255),
  function: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  skills: z.array(z.string()).default([]),
  tools: z.array(z.string()).default([]),
  routing_keywords: z.array(z.string()).default([]),
  permissions: z
    .object({
      read: z.array(z.string()).default([]),
      write: z.array(z.string()).default([]),
    })
    .default({ read: [], write: [] }),
});

const updateAgentSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    function: z.string().min(1).max(100).optional(),
    description: z.string().min(1).max(1000).optional(),
    skills: z.array(z.string()).optional(),
    tools: z.array(z.string()).optional(),
    routing_keywords: z.array(z.string()).optional(),
    permissions: z
      .object({
        read: z.array(z.string()),
        write: z.array(z.string()),
      })
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const skillParameterSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().optional().default(false),
  default: z.unknown().optional(),
});

const skillOutputSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
});

const createSkillSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(255),
  description: z.string().min(1).max(1000),
  category: z.string().min(1).max(100),
  triggers: z.array(z.string()).default([]),
  parameters: z.array(skillParameterSchema).default([]),
  outputs: z.array(skillOutputSchema).default([]),
  tools_required: z.array(z.string()).default([]),
});

const updateSkillSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().min(1).max(1000).optional(),
    category: z.string().min(1).max(100).optional(),
    triggers: z.array(z.string()).optional(),
    parameters: z.array(skillParameterSchema).optional(),
    outputs: z.array(skillOutputSchema).optional(),
    tools_required: z.array(z.string()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

// ============== Agent Routes ==============

/**
 * GET /agents - List all agents
 */
router.get(
  "/agents",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (_req: Request, res: Response) => {
    try {
      const agents = loadAgents();
      const skills = loadSkills();

      // Enrich agents with skill details
      const enrichedAgents = agents.map((agent) => ({
        ...agent,
        skillDetails: agent.skills.map((skillId) => {
          const skill = skills.find((s) => s.id === skillId);
          return skill ? { id: skill.id, name: skill.name } : { id: skillId, name: skillId };
        }),
      }));

      return res.json({ agents: enrichedAgents });
    } catch (error) {
      logger.error("Failed to list agents", {}, error as Error);
      return res.status(500).json({ error: "Failed to list agents" });
    }
  },
);

/**
 * GET /agents/:id - Get a single agent
 */
router.get(
  "/agents/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const agents = loadAgents();
      const agent = agents.find((a) => a.id === id);

      if (!agent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const skills = loadSkills();
      const skillDetails = agent.skills.map((skillId) => {
        const skill = skills.find((s) => s.id === skillId);
        return skill ? { id: skill.id, name: skill.name, description: skill.description } : null;
      }).filter(Boolean);

      return res.json({ agent: { ...agent, skillDetails } });
    } catch (error) {
      logger.error("Failed to get agent", { id: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to get agent" });
    }
  },
);

/**
 * POST /agents - Create a new agent (creates GitHub PR)
 */
router.post(
  "/agents",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ body: createAgentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const agentData = req.body as z.infer<typeof createAgentSchema>;

      // Check if agent already exists
      const existingAgents = loadAgents();
      if (existingAgents.some((a) => a.id === agentData.id)) {
        return res.status(409).json({ error: "Agent with this ID already exists" });
      }

      // Format as YAML content
      const yamlContent = YAML.stringify(agentData);

      const promoteRequest: SSOTPromoteRequest = {
        resourceType: "agent",
        resourceId: agentData.id,
        title: `Add agent: ${agentData.name}`,
        body: `## Summary\n- Add new agent: **${agentData.name}** (${agentData.id})\n- Function: ${agentData.function}\n- Description: ${agentData.description}\n\nCreated via Nubabel Admin UI`,
        content: yamlContent,
      };

      const result = await syncToGitHub(organizationId, promoteRequest, req.user!.id);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to create PR" });
      }

      return res.status(201).json({
        message: "Pull request created successfully",
        pullRequest: result.pullRequest,
        agent: agentData,
      });
    } catch (error) {
      logger.error("Failed to create agent", {}, error as Error);
      return res.status(500).json({ error: "Failed to create agent" });
    }
  },
);

/**
 * PUT /agents/:id - Update an agent (creates GitHub PR)
 */
router.put(
  "/agents/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ params: agentIdParamSchema, body: updateAgentSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = req.params.id as string;
      const updates = req.body as z.infer<typeof updateAgentSchema>;

      // Get existing agent
      const existingAgents = loadAgents();
      const existingAgent = existingAgents.find((a) => a.id === id);

      if (!existingAgent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      // Merge updates
      const updatedAgent: AgentConfig = {
        ...existingAgent,
        ...updates,
        permissions: updates.permissions || existingAgent.permissions,
      };

      // Format as YAML content
      const yamlContent = YAML.stringify(updatedAgent);

      const promoteRequest: SSOTPromoteRequest = {
        resourceType: "agent",
        resourceId: id,
        title: `Update agent: ${updatedAgent.name}`,
        body: `## Summary\n- Update agent: **${updatedAgent.name}** (${id})\n\n## Changes\n${Object.keys(updates)
          .map((key) => `- ${key}`)
          .join("\n")}\n\nUpdated via Nubabel Admin UI`,
        content: yamlContent,
      };

      const result = await syncToGitHub(organizationId, promoteRequest, req.user!.id);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to create PR" });
      }

      return res.json({
        message: "Pull request created successfully",
        pullRequest: result.pullRequest,
        agent: updatedAgent,
      });
    } catch (error) {
      logger.error("Failed to update agent", { id: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to update agent" });
    }
  },
);

/**
 * DELETE /agents/:id - Delete an agent (creates GitHub PR)
 */
router.delete(
  "/agents/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ params: agentIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = req.params.id as string;

      // Verify agent exists
      const existingAgents = loadAgents();
      const existingAgent = existingAgents.find((a) => a.id === id);

      if (!existingAgent) {
        return res.status(404).json({ error: "Agent not found" });
      }

      // Create a PR that deletes the file (empty content with special flag)
      const promoteRequest: SSOTPromoteRequest = {
        resourceType: "agent",
        resourceId: id,
        title: `Delete agent: ${existingAgent.name}`,
        body: `## Summary\n- Delete agent: **${existingAgent.name}** (${id})\n\nDeleted via Nubabel Admin UI`,
        content: "# DELETED",
        metadata: { deleted: true },
      };

      const result = await syncToGitHub(organizationId, promoteRequest, req.user!.id);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to create PR" });
      }

      return res.json({
        message: "Pull request created successfully to delete agent",
        pullRequest: result.pullRequest,
      });
    } catch (error) {
      logger.error("Failed to delete agent", { id: req.params.id }, error as Error);
      return res.status(500).json({ error: "Failed to delete agent" });
    }
  },
);

// ============== Skill Routes ==============

/**
 * GET /skills - List all skills
 */
router.get(
  "/skills",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (_req: Request, res: Response) => {
    try {
      const skills = loadSkills();
      const agents = loadAgents();

      // Enrich skills with agent details (agents that use this skill)
      const enrichedSkills = skills.map((skill) => {
        const agentDetails = agents
          .filter((agent) => agent.skills.includes(skill.id))
          .map((agent) => ({ id: agent.id, name: agent.name }));
        return {
          ...skill,
          agentDetails,
        };
      });

      return res.json({ skills: enrichedSkills });
    } catch (error) {
      logger.error("Failed to list skills", {}, error as Error);
      return res.status(500).json({ error: "Failed to list skills" });
    }
  },
);

/**
 * GET /skills/:id - Get a single skill
 */
router.get(
  "/skills/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  validate({ params: skillIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const skills = loadSkills();
      const skill = skills.find((s) => s.id === id);

      if (!skill) {
        return res.status(404).json({ error: "Skill not found" });
      }

      const agents = loadAgents();
      const agentDetails = agents
        .filter((agent) => agent.skills.includes(skill.id))
        .map((agent) => ({ id: agent.id, name: agent.name, function: agent.function }));

      return res.json({ skill: { ...skill, agentDetails } });
    } catch (error) {
      logger.error("Failed to get skill", { id: req.params.id as string }, error as Error);
      return res.status(500).json({ error: "Failed to get skill" });
    }
  },
);

/**
 * POST /skills - Create a new skill (creates GitHub PR)
 */
router.post(
  "/skills",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ body: createSkillSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const skillData = req.body as z.infer<typeof createSkillSchema>;

      // Check if skill already exists
      const existingSkills = loadSkills();
      if (existingSkills.some((s) => s.id === skillData.id)) {
        return res.status(409).json({ error: "Skill with this ID already exists" });
      }

      // Format as YAML content
      const yamlContent = YAML.stringify(skillData);

      const promoteRequest: SSOTPromoteRequest = {
        resourceType: "skill",
        resourceId: skillData.id,
        title: `Add skill: ${skillData.name}`,
        body: `## Summary\n- Add new skill: **${skillData.name}** (${skillData.id})\n- Category: ${skillData.category}\n- Description: ${skillData.description}\n- Tools: ${skillData.tools_required.join(", ") || "None"}\n\nCreated via Nubabel Admin UI`,
        content: yamlContent,
      };

      const result = await syncToGitHub(organizationId, promoteRequest, req.user!.id);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to create PR" });
      }

      // Clear cache to reflect new skill
      clearSkillCache();

      return res.status(201).json({
        message: "Pull request created successfully",
        pullRequest: result.pullRequest,
        skill: skillData,
      });
    } catch (error) {
      logger.error("Failed to create skill", {}, error as Error);
      return res.status(500).json({ error: "Failed to create skill" });
    }
  },
);

/**
 * PUT /skills/:id - Update a skill (creates GitHub PR)
 */
router.put(
  "/skills/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ params: skillIdParamSchema, body: updateSkillSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = req.params.id as string;
      const updates = req.body as z.infer<typeof updateSkillSchema>;

      // Get existing skill
      const existingSkills = loadSkills();
      const existingSkill = existingSkills.find((s) => s.id === id);

      if (!existingSkill) {
        return res.status(404).json({ error: "Skill not found" });
      }

      // Merge updates
      const updatedSkill: SkillConfig = {
        ...existingSkill,
        ...updates,
      };

      // Format as YAML content
      const yamlContent = YAML.stringify(updatedSkill);

      const promoteRequest: SSOTPromoteRequest = {
        resourceType: "skill",
        resourceId: id,
        title: `Update skill: ${updatedSkill.name}`,
        body: `## Summary\n- Update skill: **${updatedSkill.name}** (${id})\n\n## Changes\n${Object.keys(updates)
          .map((key) => `- ${key}`)
          .join("\n")}\n\nUpdated via Nubabel Admin UI`,
        content: yamlContent,
      };

      const result = await syncToGitHub(organizationId, promoteRequest, req.user!.id);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to create PR" });
      }

      // Clear cache
      clearSkillCache();

      return res.json({
        message: "Pull request created successfully",
        pullRequest: result.pullRequest,
        skill: updatedSkill,
      });
    } catch (error) {
      logger.error("Failed to update skill", { id: req.params.id as string }, error as Error);
      return res.status(500).json({ error: "Failed to update skill" });
    }
  },
);

/**
 * DELETE /skills/:id - Delete a skill (creates GitHub PR)
 */
router.delete(
  "/skills/:id",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  validate({ params: skillIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const id = req.params.id as string;

      // Verify skill exists
      const existingSkills = loadSkills();
      const existingSkill = existingSkills.find((s) => s.id === id);

      if (!existingSkill) {
        return res.status(404).json({ error: "Skill not found" });
      }

      // Create a PR that deletes the file
      const promoteRequest: SSOTPromoteRequest = {
        resourceType: "skill",
        resourceId: id,
        title: `Delete skill: ${existingSkill.name}`,
        body: `## Summary\n- Delete skill: **${existingSkill.name}** (${id})\n\nDeleted via Nubabel Admin UI`,
        content: "# DELETED",
        metadata: { deleted: true },
      };

      const result = await syncToGitHub(organizationId, promoteRequest, req.user!.id);

      if (!result.success) {
        return res.status(500).json({ error: result.error || "Failed to create PR" });
      }

      // Clear cache
      clearSkillCache();

      return res.json({
        message: "Pull request created successfully to delete skill",
        pullRequest: result.pullRequest,
      });
    } catch (error) {
      logger.error("Failed to delete skill", { id: req.params.id as string }, error as Error);
      return res.status(500).json({ error: "Failed to delete skill" });
    }
  },
);

// ============== Available Tools Route ==============

/**
 * GET /tools - List all available MCP tools
 */
router.get(
  "/tools",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (_req: Request, res: Response) => {
    // Return a static list of available MCP tools
    // In a real implementation, this could be fetched from MCP registry
    const tools = [
      { id: "notion_query", name: "Notion Query", description: "Query Notion databases" },
      { id: "notion_update", name: "Notion Update", description: "Update Notion pages" },
      { id: "notify_slack", name: "Slack Notify", description: "Send Slack notifications" },
      { id: "calendar_manage", name: "Calendar Manage", description: "Manage calendar events" },
      { id: "github_pr", name: "GitHub PR", description: "Create GitHub pull requests" },
      { id: "github_issue", name: "GitHub Issue", description: "Create GitHub issues" },
      { id: "email_send", name: "Email Send", description: "Send emails" },
      { id: "drive_upload", name: "Drive Upload", description: "Upload files to Drive" },
      { id: "drive_download", name: "Drive Download", description: "Download files from Drive" },
    ];

    return res.json({ tools });
  },
);

// ============== Pending PRs Route ==============

/**
 * GET /pending-prs - List pending PRs for agent/skill changes
 *
 * Returns open pull requests with branches starting with ssot/agent or ssot/skill.
 * Requires GitHub integration to be configured for the organization.
 */
router.get(
  "/pending-prs",
  requireAuth,
  requirePermission(Permission.SETTINGS_READ),
  async (req: Request, res: Response) => {
    try {
      const { organizationId } = req.user!;
      const resourceType = req.query.type as string | undefined;

      // Filter by resource type if provided
      const types = resourceType
        ? [resourceType as "agent" | "skill"]
        : ["agent", "skill"] as const;

      const pullRequests = await getPendingSSOTPullRequests(
        organizationId,
        types[0], // Pass first type or undefined
        req.user!.id,
      );

      // Transform to a simpler format for the frontend
      const formattedPRs = pullRequests.map((pr) => ({
        number: pr.number,
        title: pr.title,
        html_url: pr.htmlUrl,
        state: pr.state,
        created_at: pr.createdAt,
        updated_at: pr.updatedAt,
        branch: pr.head.ref,
        author: pr.user?.login ?? "unknown",
        author_avatar: pr.user?.avatarUrl ?? "",
        draft: pr.draft,
        // Extract resource type and ID from branch name (ssot/agent/my-agent-123456)
        resource_type: pr.head.ref.split("/")[1] || "unknown",
        resource_id: pr.head.ref.split("/")[2]?.replace(/-\d+$/, "") || "unknown",
      }));

      return res.json({ pullRequests: formattedPRs });
    } catch (error) {
      logger.error("Failed to fetch pending PRs", {}, error as Error);
      // Return empty list on error (GitHub may not be configured)
      return res.json({ pullRequests: [] });
    }
  },
);

export default router;
