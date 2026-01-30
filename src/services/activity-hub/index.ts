/**
 * Activity Hub Service
 * Central event emitter for agent activity events
 * Lightweight event bus for inter-service communication
 */

import { EventEmitter } from "events";
import { logger } from "../../utils/logger";

// ============================================================================
// Types
// ============================================================================

export type ActivityEventType =
  | "execution:start"
  | "execution:progress"
  | "execution:complete"
  | "execution:failed"
  | "tool:call"
  | "tool:complete"
  | "delegation:start"
  | "delegation:complete"
  | "escalation:triggered";

export interface ActivityEvent {
  type: ActivityEventType;
  executionId: string;
  agentId: string;
  agentName: string;
  organizationId: string;
  timestamp: Date;
  data: Record<string, unknown>;
}

// ============================================================================
// Activity Hub
// ============================================================================

class ActivityHub extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Support many listeners
  }

  /**
   * Emit an activity event
   */
  emitActivity(event: Omit<ActivityEvent, "timestamp">): void {
    const fullEvent: ActivityEvent = {
      ...event,
      timestamp: new Date(),
    };

    this.emit(event.type, fullEvent);
    this.emit("*", fullEvent); // Wildcard listener

    logger.debug("Activity event emitted", {
      type: event.type,
      executionId: event.executionId,
      agentName: event.agentName,
    });
  }

  /**
   * Emit execution start event
   */
  emitExecutionStart(
    executionId: string,
    agentId: string,
    agentName: string,
    organizationId: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "execution:start",
      executionId,
      agentId,
      agentName,
      organizationId,
      data,
    });
  }

  /**
   * Emit execution progress event
   */
  emitExecutionProgress(
    executionId: string,
    agentId: string,
    agentName: string,
    organizationId: string,
    progress: number,
    currentAction: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "execution:progress",
      executionId,
      agentId,
      agentName,
      organizationId,
      data: { progress, currentAction, ...data },
    });
  }

  /**
   * Emit execution complete event
   */
  emitExecutionComplete(
    executionId: string,
    agentId: string,
    agentName: string,
    organizationId: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "execution:complete",
      executionId,
      agentId,
      agentName,
      organizationId,
      data,
    });
  }

  /**
   * Emit execution failed event
   */
  emitExecutionFailed(
    executionId: string,
    agentId: string,
    agentName: string,
    organizationId: string,
    error: string,
    errorType?: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "execution:failed",
      executionId,
      agentId,
      agentName,
      organizationId,
      data: { error, errorType, ...data },
    });
  }

  /**
   * Emit tool call event
   */
  emitToolCall(
    executionId: string,
    agentId: string,
    agentName: string,
    organizationId: string,
    toolName: string,
    toolArgs?: unknown,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "tool:call",
      executionId,
      agentId,
      agentName,
      organizationId,
      data: { toolName, toolArgs, ...data },
    });
  }

  /**
   * Emit tool complete event
   */
  emitToolComplete(
    executionId: string,
    agentId: string,
    agentName: string,
    organizationId: string,
    toolName: string,
    toolResult?: unknown,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "tool:complete",
      executionId,
      agentId,
      agentName,
      organizationId,
      data: { toolName, toolResult, ...data },
    });
  }

  /**
   * Emit delegation start event
   */
  emitDelegationStart(
    executionId: string,
    fromAgentId: string,
    fromAgentName: string,
    toAgentId: string,
    toAgentName: string,
    organizationId: string,
    taskDescription: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "delegation:start",
      executionId,
      agentId: fromAgentId,
      agentName: fromAgentName,
      organizationId,
      data: { toAgentId, toAgentName, taskDescription, ...data },
    });
  }

  /**
   * Emit delegation complete event
   */
  emitDelegationComplete(
    executionId: string,
    fromAgentId: string,
    fromAgentName: string,
    toAgentId: string,
    toAgentName: string,
    organizationId: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "delegation:complete",
      executionId,
      agentId: fromAgentId,
      agentName: fromAgentName,
      organizationId,
      data: { toAgentId, toAgentName, ...data },
    });
  }

  /**
   * Emit escalation triggered event
   */
  emitEscalation(
    executionId: string,
    fromAgentId: string,
    fromAgentName: string,
    toManagerId: string,
    toManagerName: string,
    organizationId: string,
    reason: string,
    data: Record<string, unknown> = {}
  ): void {
    this.emitActivity({
      type: "escalation:triggered",
      executionId,
      agentId: fromAgentId,
      agentName: fromAgentName,
      organizationId,
      data: { toManagerId, toManagerName, reason, ...data },
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const activityHub = new ActivityHub();
export default activityHub;
