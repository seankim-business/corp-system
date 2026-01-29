/**
 * Agent Events Service
 *
 * Provides typed event emission for agent collaboration activity.
 * Events are broadcast via SSE to connected clients.
 */

import { sseManager } from "../api/sse";
import { logger } from "../utils/logger";

export type AgentEventType =
  | "agent_started"
  | "agent_completed"
  | "agent_message"
  | "tool_called"
  | "tool_completed"
  | "approval_requested"
  | "approval_granted"
  | "approval_denied"
  | "workflow_step"
  | "session_paused"
  | "session_resumed"
  | "session_cancelled"
  | "error";

export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  agentName: string;
  sessionId: string;
  timestamp: Date;
  data: {
    message?: string;
    toolName?: string;
    toolArgs?: unknown;
    toolResult?: unknown;
    targetAgent?: string;
    progress?: number;
    stepIndex?: number;
    totalSteps?: number;
    status?: "pending" | "active" | "completed" | "failed" | "paused";
    error?: string;
    approvalId?: string;
    approvalType?: string;
  };
}

export interface WorkflowNode {
  agentId: string;
  agentName: string;
  status: "pending" | "active" | "completed" | "failed" | "paused";
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
}

export interface WorkflowState {
  sessionId: string;
  title: string;
  status: "running" | "paused" | "completed" | "failed" | "cancelled";
  nodes: WorkflowNode[];
  edges: Array<{ from: string; to: string }>;
  currentAgentId?: string;
  startedAt: Date;
  updatedAt: Date;
}

// In-memory session state (would be Redis in production)
const activeSessions = new Map<string, WorkflowState>();

export function getActiveSession(sessionId: string): WorkflowState | undefined {
  return activeSessions.get(sessionId);
}

export function getActiveSessions(_organizationId: string): WorkflowState[] {
  // In real implementation, filter by org from Redis
  return Array.from(activeSessions.values());
}

export function updateSessionState(
  sessionId: string,
  update: Partial<WorkflowState>
): WorkflowState | undefined {
  const session = activeSessions.get(sessionId);
  if (!session) return undefined;

  const updated = { ...session, ...update, updatedAt: new Date() };
  activeSessions.set(sessionId, updated);
  return updated;
}

export function createSession(
  sessionId: string,
  title: string,
  nodes: WorkflowNode[],
  edges: Array<{ from: string; to: string }>
): WorkflowState {
  const session: WorkflowState = {
    sessionId,
    title,
    status: "running",
    nodes,
    edges,
    startedAt: new Date(),
    updatedAt: new Date(),
  };
  activeSessions.set(sessionId, session);
  return session;
}

export function removeSession(sessionId: string): boolean {
  return activeSessions.delete(sessionId);
}

/**
 * Emit an agent event to all connected clients in the organization
 */
export function emitAgentEvent(
  organizationId: string,
  event: Omit<AgentEvent, "timestamp">
): void {
  const fullEvent: AgentEvent = {
    ...event,
    timestamp: new Date(),
  };

  // Update session state based on event type
  const session = activeSessions.get(event.sessionId);
  if (session) {
    switch (event.type) {
      case "agent_started":
        session.currentAgentId = event.agentId;
        session.nodes = session.nodes.map((n) =>
          n.agentId === event.agentId ? { ...n, status: "active", startedAt: new Date() } : n
        );
        break;

      case "agent_completed":
        session.nodes = session.nodes.map((n) =>
          n.agentId === event.agentId
            ? { ...n, status: "completed", completedAt: new Date(), progress: 100 }
            : n
        );
        break;

      case "workflow_step":
        if (event.data.progress !== undefined) {
          session.nodes = session.nodes.map((n) =>
            n.agentId === event.agentId ? { ...n, progress: event.data.progress } : n
          );
        }
        break;

      case "session_paused":
        session.status = "paused";
        session.nodes = session.nodes.map((n) =>
          n.status === "active" ? { ...n, status: "paused" } : n
        );
        break;

      case "session_resumed":
        session.status = "running";
        session.nodes = session.nodes.map((n) =>
          n.status === "paused" ? { ...n, status: "active" } : n
        );
        break;

      case "session_cancelled":
        session.status = "cancelled";
        break;

      case "error":
        session.nodes = session.nodes.map((n) =>
          n.agentId === event.agentId ? { ...n, status: "failed" } : n
        );
        break;
    }
    session.updatedAt = new Date();
  }

  // Emit via SSE
  const clientCount = sseManager.sendToOrganization(
    organizationId,
    `agent:${event.type}`,
    fullEvent
  );

  logger.debug("Agent event emitted", {
    type: event.type,
    agentId: event.agentId,
    sessionId: event.sessionId,
    clientCount,
  });
}

/**
 * Emit workflow state update to clients
 */
export function emitWorkflowState(organizationId: string, session: WorkflowState): void {
  sseManager.sendToOrganization(organizationId, "workflow:state", session);
}

/**
 * Helper to emit agent started event
 */
export function emitAgentStarted(
  organizationId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  message?: string
): void {
  emitAgentEvent(organizationId, {
    type: "agent_started",
    agentId,
    agentName,
    sessionId,
    data: { message, status: "active" },
  });
}

/**
 * Helper to emit agent completed event
 */
export function emitAgentCompleted(
  organizationId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  message?: string
): void {
  emitAgentEvent(organizationId, {
    type: "agent_completed",
    agentId,
    agentName,
    sessionId,
    data: { message, status: "completed" },
  });
}

/**
 * Helper to emit agent-to-agent message
 */
export function emitAgentMessage(
  organizationId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  targetAgent: string,
  message: string
): void {
  emitAgentEvent(organizationId, {
    type: "agent_message",
    agentId,
    agentName,
    sessionId,
    data: { message, targetAgent },
  });
}

/**
 * Helper to emit tool called event
 */
export function emitToolCalled(
  organizationId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  toolName: string,
  toolArgs?: unknown
): void {
  emitAgentEvent(organizationId, {
    type: "tool_called",
    agentId,
    agentName,
    sessionId,
    data: { toolName, toolArgs },
  });
}

/**
 * Helper to emit tool completed event
 */
export function emitToolCompleted(
  organizationId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  toolName: string,
  toolResult?: unknown
): void {
  emitAgentEvent(organizationId, {
    type: "tool_completed",
    agentId,
    agentName,
    sessionId,
    data: { toolName, toolResult },
  });
}

/**
 * Helper to emit approval request
 */
export function emitApprovalRequested(
  organizationId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  approvalId: string,
  approvalType: string,
  message: string
): void {
  emitAgentEvent(organizationId, {
    type: "approval_requested",
    agentId,
    agentName,
    sessionId,
    data: { approvalId, approvalType, message },
  });
}

/**
 * Helper to emit workflow progress
 */
export function emitWorkflowProgress(
  organizationId: string,
  sessionId: string,
  agentId: string,
  agentName: string,
  stepIndex: number,
  totalSteps: number,
  message?: string
): void {
  const progress = Math.round((stepIndex / totalSteps) * 100);
  emitAgentEvent(organizationId, {
    type: "workflow_step",
    agentId,
    agentName,
    sessionId,
    data: { stepIndex, totalSteps, progress, message },
  });
}
