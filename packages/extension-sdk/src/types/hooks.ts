/**
 * Hook Types
 *
 * Defines the hook system for extensions to intercept platform events.
 */

import { HookContext } from "./context";

/**
 * All available hook events
 */
export type HookEvent =
  // Workflow hooks
  | "workflow:beforeExecute"
  | "workflow:afterExecute"
  | "workflow:beforeStep"
  | "workflow:afterStep"

  // Agent hooks
  | "agent:beforeMessage"
  | "agent:afterMessage"
  | "agent:beforeTool"
  | "agent:afterTool"

  // Approval hooks
  | "approval:beforeCreate"
  | "approval:afterCreate"
  | "approval:beforeRespond"
  | "approval:afterRespond"

  // User hooks
  | "user:beforeInvite"
  | "user:afterInvite"
  | "user:beforeRemove"
  | "user:afterRemove"

  // Organization hooks
  | "organization:beforeUpdate"
  | "organization:afterUpdate"

  // Integration hooks
  | "integration:beforeConnect"
  | "integration:afterConnect"
  | "integration:beforeDisconnect"
  | "integration:afterDisconnect"

  // Data hooks
  | "data:beforeSync"
  | "data:afterSync";

/**
 * Hook handler function type
 */
export type HookHandler<T = unknown> = (
  context: HookContext,
  payload: T
) => Promise<void> | void;

/**
 * Hook registration options
 */
export interface HookOptions {
  /**
   * Events to listen for
   */
  events: HookEvent[];

  /**
   * Hook timing (before or after the event)
   */
  timing: "pre" | "post";

  /**
   * Priority (lower numbers run first)
   */
  priority?: number;

  /**
   * Conditions for the hook to run
   */
  conditions?: HookConditions;
}

/**
 * Conditions that must be met for a hook to run
 */
export interface HookConditions {
  /**
   * Only run for specific organizations
   */
  organizationIds?: string[];

  /**
   * Only run for specific users
   */
  userIds?: string[];

  /**
   * Only run for specific user roles
   */
  userRoles?: string[];

  /**
   * Custom condition function
   */
  custom?: (context: HookContext) => boolean;
}

/**
 * Hook execution result
 */
export interface HookResult {
  /**
   * Whether the hook executed successfully
   */
  success: boolean;

  /**
   * Error if the hook failed
   */
  error?: Error;

  /**
   * Whether the default action was prevented
   */
  defaultPrevented: boolean;

  /**
   * Modified payload (if any)
   */
  modifiedPayload?: unknown;

  /**
   * Execution time in milliseconds
   */
  executionTime: number;
}

/**
 * Logger interface available in hooks
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Hook payloads for each event type
 */
export interface HookPayloads {
  "workflow:beforeExecute": {
    workflowId: string;
    workflowName: string;
    inputData: Record<string, unknown>;
    triggeredBy: string;
  };
  "workflow:afterExecute": {
    workflowId: string;
    workflowName: string;
    executionId: string;
    status: "completed" | "failed" | "cancelled";
    outputData: Record<string, unknown>;
    duration: number;
  };
  "workflow:beforeStep": {
    workflowId: string;
    executionId: string;
    stepId: string;
    stepName: string;
    stepType: string;
    inputData: Record<string, unknown>;
  };
  "workflow:afterStep": {
    workflowId: string;
    executionId: string;
    stepId: string;
    stepName: string;
    status: "completed" | "failed" | "skipped";
    outputData: Record<string, unknown>;
    duration: number;
  };
  "agent:beforeMessage": {
    agentId: string;
    sessionId: string;
    message: string;
    role: "user" | "assistant";
  };
  "agent:afterMessage": {
    agentId: string;
    sessionId: string;
    message: string;
    role: "user" | "assistant";
    tokensUsed: number;
  };
  "agent:beforeTool": {
    agentId: string;
    sessionId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
  };
  "agent:afterTool": {
    agentId: string;
    sessionId: string;
    toolName: string;
    toolOutput: unknown;
    duration: number;
  };
  "approval:beforeCreate": {
    type: string;
    title: string;
    description: string;
    approverId: string;
    context: Record<string, unknown>;
  };
  "approval:afterCreate": {
    approvalId: string;
    type: string;
    title: string;
    status: "pending";
  };
  "approval:beforeRespond": {
    approvalId: string;
    responderId: string;
    action: "approved" | "rejected";
    note?: string;
  };
  "approval:afterRespond": {
    approvalId: string;
    responderId: string;
    action: "approved" | "rejected";
    note?: string;
  };
  "user:beforeInvite": {
    email: string;
    role: string;
    invitedBy: string;
  };
  "user:afterInvite": {
    userId: string;
    email: string;
    role: string;
    invitedBy: string;
  };
  "user:beforeRemove": {
    userId: string;
    email: string;
    removedBy: string;
    reason?: string;
  };
  "user:afterRemove": {
    userId: string;
    email: string;
    removedBy: string;
    reason?: string;
  };
  "organization:beforeUpdate": {
    changes: Record<string, { from: unknown; to: unknown }>;
    updatedBy: string;
  };
  "organization:afterUpdate": {
    changes: Record<string, { from: unknown; to: unknown }>;
    updatedBy: string;
  };
  "integration:beforeConnect": {
    provider: string;
    config: Record<string, unknown>;
    connectedBy: string;
  };
  "integration:afterConnect": {
    provider: string;
    connectionId: string;
    connectedBy: string;
  };
  "integration:beforeDisconnect": {
    provider: string;
    connectionId: string;
    disconnectedBy: string;
  };
  "integration:afterDisconnect": {
    provider: string;
    connectionId: string;
    disconnectedBy: string;
  };
  "data:beforeSync": {
    source: string;
    destination: string;
    dataType: string;
    itemCount: number;
  };
  "data:afterSync": {
    source: string;
    destination: string;
    dataType: string;
    syncedCount: number;
    failedCount: number;
    duration: number;
  };
}

/**
 * Type-safe hook handler factory
 */
export type TypedHookHandler<E extends HookEvent> = (
  context: HookContext,
  payload: HookPayloads[E]
) => Promise<void> | void;
