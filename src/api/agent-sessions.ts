/**
 * Agent Sessions API
 *
 * Provides endpoints for viewing and controlling active agent sessions.
 * Supports intervention actions: pause, resume, cancel, and send message.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { logger } from "../utils/logger";
import {
  getActiveSession,
  getActiveSessions,
  updateSessionState,
  removeSession,
  emitAgentEvent,
  emitWorkflowState,
} from "../services/agent-events";

const router = Router();

// Validation schemas
const sessionIdParamSchema = z.object({
  id: z.string().uuid("Invalid session ID"),
});

const sendMessageSchema = z.object({
  message: z.string().min(1, "Message is required").max(2000),
  targetAgentId: z.string().optional(),
});

const approvalResponseSchema = z.object({
  approved: z.boolean(),
  note: z.string().max(1000).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ApprovalResponseInput = z.infer<typeof approvalResponseSchema>;

/**
 * GET /api/agent/sessions
 * List all active agent sessions for the organization
 */
router.get("/sessions", requireAuth, async (req: Request, res: Response) => {
  try {
    const { organizationId } = req.user!;
    const sessions = getActiveSessions(organizationId);

    return res.json({
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        status: s.status,
        currentAgentId: s.currentAgentId,
        nodeCount: s.nodes.length,
        completedNodes: s.nodes.filter((n) => n.status === "completed").length,
        startedAt: s.startedAt,
        updatedAt: s.updatedAt,
      })),
      total: sessions.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to list agent sessions", { error: message });
    return res.status(500).json({ error: "Failed to list agent sessions" });
  }
});

/**
 * GET /api/agent/sessions/:id
 * Get detailed information about a specific session
 */
router.get(
  "/sessions/:id",
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const session = getActiveSession(id);

      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      return res.json({ session });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to get agent session", { error: message });
      return res.status(500).json({ error: "Failed to get agent session" });
    }
  },
);

/**
 * POST /api/agent/sessions/:id/pause
 * Pause an active session
 */
router.post(
  "/sessions/:id/pause",
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { organizationId, id: odId, displayName } = req.user!;
      const userId = odId as string;

      const session = getActiveSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status !== "running") {
        return res.status(400).json({
          error: `Cannot pause session with status: ${session.status}`,
        });
      }

      const updated = updateSessionState(id, { status: "paused" });

      emitAgentEvent(organizationId, {
        type: "session_paused",
        agentId: "system",
        agentName: "System",
        sessionId: id,
        data: {
          message: `Session paused by ${displayName || "user"}`,
        },
      });

      if (updated) {
        emitWorkflowState(organizationId, updated);
      }

      logger.info("Agent session paused", { sessionId: id, userId });

      return res.json({
        success: true,
        session: updated,
        message: "Session paused successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to pause agent session", { error: message });
      return res.status(500).json({ error: "Failed to pause session" });
    }
  },
);

/**
 * POST /api/agent/sessions/:id/resume
 * Resume a paused session
 */
router.post(
  "/sessions/:id/resume",
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { organizationId, id: odId, displayName } = req.user!;
      const userId = odId as string;

      const session = getActiveSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status !== "paused") {
        return res.status(400).json({
          error: `Cannot resume session with status: ${session.status}`,
        });
      }

      const updated = updateSessionState(id, { status: "running" });

      emitAgentEvent(organizationId, {
        type: "session_resumed",
        agentId: "system",
        agentName: "System",
        sessionId: id,
        data: {
          message: `Session resumed by ${displayName || "user"}`,
        },
      });

      if (updated) {
        emitWorkflowState(organizationId, updated);
      }

      logger.info("Agent session resumed", { sessionId: id, userId });

      return res.json({
        success: true,
        session: updated,
        message: "Session resumed successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to resume agent session", { error: message });
      return res.status(500).json({ error: "Failed to resume session" });
    }
  },
);

/**
 * POST /api/agent/sessions/:id/cancel
 * Cancel an active or paused session
 */
router.post(
  "/sessions/:id/cancel",
  requireAuth,
  validate({ params: sessionIdParamSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { organizationId, id: odId, displayName } = req.user!;
      const userId = odId as string;

      const session = getActiveSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status === "completed" || session.status === "cancelled") {
        return res.status(400).json({
          error: `Cannot cancel session with status: ${session.status}`,
        });
      }

      const updated = updateSessionState(id, { status: "cancelled" });

      emitAgentEvent(organizationId, {
        type: "session_cancelled",
        agentId: "system",
        agentName: "System",
        sessionId: id,
        data: {
          message: `Session cancelled by ${displayName || "user"}`,
        },
      });

      if (updated) {
        emitWorkflowState(organizationId, updated);
      }

      setTimeout(() => removeSession(id), 5000);

      logger.info("Agent session cancelled", { sessionId: id, userId });

      return res.json({
        success: true,
        session: updated,
        message: "Session cancelled successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to cancel agent session", { error: message });
      return res.status(500).json({ error: "Failed to cancel session" });
    }
  },
);

/**
 * POST /api/agent/sessions/:id/message
 * Send a message to agents in a session
 */
router.post(
  "/sessions/:id/message",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: sendMessageSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { message, targetAgentId } = req.body as SendMessageInput;
      const { organizationId, id: odId, displayName } = req.user!;
      const userId = odId as string;

      const session = getActiveSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      if (session.status !== "running" && session.status !== "paused") {
        return res.status(400).json({
          error: `Cannot send message to session with status: ${session.status}`,
        });
      }

      emitAgentEvent(organizationId, {
        type: "agent_message",
        agentId: "user",
        agentName: displayName || "User",
        sessionId: id,
        data: {
          message,
          targetAgent: targetAgentId || session.currentAgentId,
        },
      });

      logger.info("User message sent to agent session", {
        sessionId: id,
        userId,
        targetAgentId,
      });

      return res.json({
        success: true,
        message: "Message sent successfully",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to send message to agent session", { error: message });
      return res.status(500).json({ error: "Failed to send message" });
    }
  },
);

/**
 * POST /api/agent/sessions/:id/approval
 * Respond to an approval request in a session
 */
router.post(
  "/sessions/:id/approval",
  requireAuth,
  validate({ params: sessionIdParamSchema, body: approvalResponseSchema }),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { approved, note } = req.body as ApprovalResponseInput;
      const { organizationId, id: odId, displayName } = req.user!;
      const userId = odId as string;

      const session = getActiveSession(id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      emitAgentEvent(organizationId, {
        type: approved ? "approval_granted" : "approval_denied",
        agentId: "user",
        agentName: displayName || "User",
        sessionId: id,
        data: {
          message: note || (approved ? "Approved" : "Denied"),
        },
      });

      logger.info("Approval response sent", {
        sessionId: id,
        userId,
        approved,
      });

      return res.json({
        success: true,
        message: `Request ${approved ? "approved" : "denied"} successfully`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to respond to approval", { error: message });
      return res.status(500).json({ error: "Failed to respond to approval" });
    }
  },
);

export default router;
