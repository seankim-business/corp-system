/**
 * V1 API - Agent Endpoints
 *
 * Public API endpoints for agent management and execution.
 */

import { Router, Request, Response } from "express";
import { apiKeyAuth } from "../middleware/api-key-auth";
import { agentRegistry } from "../../../orchestrator/agent-registry";
import { delegateTask } from "../../../orchestrator/delegate-task";
import { logger } from "../../../utils/logger";
import { webhookService } from "../../../services/public-webhooks";
// @ts-ignore
import { v4 as uuidv4 } from "uuid";

const router = Router();

/**
 * GET /agents
 * List available agents
 */
router.get("/", apiKeyAuth(["agents:read"]), async (_req: Request, res: Response) => {
  try {
    const agents = agentRegistry.getAllAgents();

    const data = agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      emoji: agent.emoji,
      category: agent.category,
      capabilities: agent.capabilities.map((c) => ({
        name: c.name,
        description: c.description,
      })),
      canDelegateTo: agent.canDelegateTo,
      maxConcurrentTasks: agent.maxConcurrentTasks,
      timeoutMs: agent.timeoutMs,
    }));

    return res.json({
      data,
      meta: {
        total: data.length,
      },
    });
  } catch (error) {
    logger.error("Failed to list agents", { error });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to list agents",
    });
  }
});

/**
 * GET /agents/:id
 * Get a specific agent
 */
router.get("/:id", apiKeyAuth(["agents:read"]), async (req: Request, res: Response) => {
  try {
    const agentId = req.params.id;
    const agent = agentRegistry.getAgent(agentId as any);

    if (!agent) {
      return res.status(404).json({
        error: "not_found",
        message: `Agent '${agentId}' not found`,
      });
    }

    return res.json({
      data: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        emoji: agent.emoji,
        category: agent.category,
        skills: agent.skills,
        capabilities: agent.capabilities.map((c) => ({
          name: c.name,
          description: c.description,
          tools: c.tools,
          mcpProviders: c.mcpProviders,
        })),
        canDelegateTo: agent.canDelegateTo,
        maxConcurrentTasks: agent.maxConcurrentTasks,
        timeoutMs: agent.timeoutMs,
      },
    });
  } catch (error) {
    logger.error("Failed to get agent", { error, agentId: req.params.id });
    return res.status(500).json({
      error: "internal_error",
      message: "Failed to get agent",
    });
  }
});

/**
 * POST /agents/:id/execute
 * Execute an agent with a message
 */
router.post(
  "/:id/execute",
  apiKeyAuth(["agents:execute"]),
  async (req: Request, res: Response) => {
    try {
      const agentId = req.params.id;
      const { message, sessionId, context } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({
          error: "validation_error",
          message: "message is required and must be a string",
        });
      }

      const agent = agentRegistry.getAgent(agentId as any);
      if (!agent) {
        return res.status(404).json({
          error: "not_found",
          message: `Agent '${agentId}' not found`,
        });
      }

      const organizationId = req.apiOrganizationId!;
      const executionSessionId = sessionId || `api_${uuidv4()}`;

      // Emit webhook event for execution start
      webhookService.emit(organizationId, "agent.execution.started", {
        agentId,
        sessionId: executionSessionId,
        message: message.substring(0, 100), // Truncate for webhook
        apiKeyId: req.apiKey?.id,
      }).catch((err) => logger.error("Failed to emit webhook", { error: err }));

      const startTime = Date.now();

      const result = await delegateTask({
        category: agent.category,
        load_skills: agent.skills,
        prompt: `${agent.systemPrompt}\n\n---\n\nUser Request: ${message}`,
        session_id: executionSessionId,
        organizationId,
        context: {
          ...context,
          source: "api",
          apiKeyId: req.apiKey?.id,
        },
      });

      const duration = Date.now() - startTime;

      // Emit webhook event for execution completion
      const webhookEvent = result.status === "success"
        ? "agent.execution.completed"
        : "agent.execution.failed";

      webhookService.emit(organizationId, webhookEvent, {
        agentId,
        sessionId: executionSessionId,
        status: result.status,
        duration,
        apiKeyId: req.apiKey?.id,
      }).catch((err) => logger.error("Failed to emit webhook", { error: err }));

      return res.status(201).json({
        data: {
          id: executionSessionId,
          agentId,
          status: result.status,
          output: result.output,
          metadata: {
            model: result.metadata.model,
            duration,
            inputTokens: result.metadata.inputTokens,
            outputTokens: result.metadata.outputTokens,
          },
        },
      });
    } catch (error) {
      logger.error("Failed to execute agent", { error, agentId: req.params.id });
      return res.status(500).json({
        error: "execution_error",
        message: "Agent execution failed",
      });
    }
  },
);

export default router;
