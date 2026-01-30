/**
 * Hook Event Type Definitions
 *
 * Defines all hook events for the extension/workflow lifecycle.
 * Events use Zod schemas for runtime validation.
 */

import { z } from 'zod';
import { Extension } from '../extension-registry';
import { ExecutionContext, SkillInput, SkillOutput } from '../skill-runtime/types';

// ---------------------------------------------------------------------------
// Hook Event Names
// ---------------------------------------------------------------------------

export const HookEventNames = {
  // Extension lifecycle
  EXTENSION_BEFORE_LOAD: 'extension.beforeLoad',
  EXTENSION_AFTER_LOAD: 'extension.afterLoad',
  EXTENSION_BEFORE_UNLOAD: 'extension.beforeUnload',
  EXTENSION_AFTER_UNLOAD: 'extension.afterUnload',
  EXTENSION_ERROR: 'extension.error',

  // Workflow lifecycle
  WORKFLOW_BEFORE_EXECUTE: 'workflow.beforeExecute',
  WORKFLOW_AFTER_EXECUTE: 'workflow.afterExecute',
  WORKFLOW_STEP_START: 'workflow.stepStart',
  WORKFLOW_STEP_COMPLETE: 'workflow.stepComplete',
  WORKFLOW_ERROR: 'workflow.error',

  // Agent lifecycle
  AGENT_BEFORE_TASK: 'agent.beforeTask',
  AGENT_AFTER_TASK: 'agent.afterTask',
  AGENT_MESSAGE: 'agent.message',
  AGENT_ERROR: 'agent.error',

  // MCP lifecycle
  MCP_BEFORE_CALL: 'mcp.beforeCall',
  MCP_AFTER_CALL: 'mcp.afterCall',
  MCP_ERROR: 'mcp.error',

  // Skill lifecycle
  SKILL_BEFORE_EXECUTE: 'skill.beforeExecute',
  SKILL_AFTER_EXECUTE: 'skill.afterExecute',
  SKILL_ERROR: 'skill.error',

  // Session lifecycle
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_COMPLETED: 'session.completed',
  SESSION_CANCELLED: 'session.cancelled',
} as const;

export type HookEventName = typeof HookEventNames[keyof typeof HookEventNames];

// ---------------------------------------------------------------------------
// Zod Schemas for Event Payloads
// ---------------------------------------------------------------------------

export const ExtensionPayloadSchema = z.object({
  extension: z.custom<Extension>(),
  organizationId: z.string().optional(),
  timestamp: z.date(),
});

export const ExtensionErrorPayloadSchema = ExtensionPayloadSchema.extend({
  error: z.instanceof(Error),
  phase: z.enum(['load', 'unload', 'execute']),
});

export const WorkflowContextSchema = z.object({
  workflowId: z.string(),
  workflowName: z.string(),
  sessionId: z.string(),
  organizationId: z.string(),
  userId: z.string().optional(),
  variables: z.record(z.unknown()).optional(),
});

export const WorkflowPayloadSchema = z.object({
  workflow: WorkflowContextSchema,
  context: z.custom<ExecutionContext>(),
  timestamp: z.date(),
});

export const WorkflowResultPayloadSchema = WorkflowPayloadSchema.extend({
  result: z.object({
    success: z.boolean(),
    output: z.unknown().optional(),
    error: z.string().optional(),
    durationMs: z.number(),
  }),
});

export const WorkflowStepPayloadSchema = WorkflowPayloadSchema.extend({
  step: z.object({
    index: z.number(),
    total: z.number(),
    name: z.string(),
    agentId: z.string().optional(),
  }),
});

export const AgentTaskPayloadSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  task: z.object({
    id: z.string(),
    description: z.string(),
    input: z.unknown().optional(),
  }),
  sessionId: z.string(),
  organizationId: z.string(),
  timestamp: z.date(),
});

export const AgentTaskResultPayloadSchema = AgentTaskPayloadSchema.extend({
  result: z.object({
    success: z.boolean(),
    output: z.unknown().optional(),
    error: z.string().optional(),
    durationMs: z.number(),
    tokensUsed: z.number().optional(),
  }),
});

export const MCPCallPayloadSchema = z.object({
  provider: z.string(),
  toolName: z.string(),
  args: z.record(z.unknown()),
  connectionId: z.string().optional(),
  organizationId: z.string(),
  sessionId: z.string().optional(),
  timestamp: z.date(),
});

export const MCPResultPayloadSchema = MCPCallPayloadSchema.extend({
  result: z.object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().optional(),
    durationMs: z.number(),
  }),
});

export const SkillExecutePayloadSchema = z.object({
  skill: z.custom<Extension>(),
  input: z.custom<SkillInput>(),
  context: z.custom<ExecutionContext>(),
  timestamp: z.date(),
});

export const SkillResultPayloadSchema = SkillExecutePayloadSchema.extend({
  output: z.custom<SkillOutput>(),
});

export const SessionPayloadSchema = z.object({
  sessionId: z.string(),
  organizationId: z.string(),
  userId: z.string().optional(),
  status: z.enum(['created', 'running', 'paused', 'completed', 'cancelled', 'failed']),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.date(),
});

// ---------------------------------------------------------------------------
// TypeScript Types derived from Zod schemas
// ---------------------------------------------------------------------------

export type ExtensionPayload = z.infer<typeof ExtensionPayloadSchema>;
export type ExtensionErrorPayload = z.infer<typeof ExtensionErrorPayloadSchema>;
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
export type WorkflowPayload = z.infer<typeof WorkflowPayloadSchema>;
export type WorkflowResultPayload = z.infer<typeof WorkflowResultPayloadSchema>;
export type WorkflowStepPayload = z.infer<typeof WorkflowStepPayloadSchema>;
export type AgentTaskPayload = z.infer<typeof AgentTaskPayloadSchema>;
export type AgentTaskResultPayload = z.infer<typeof AgentTaskResultPayloadSchema>;
export type MCPCallPayload = z.infer<typeof MCPCallPayloadSchema>;
export type MCPResultPayload = z.infer<typeof MCPResultPayloadSchema>;
export type SkillExecutePayload = z.infer<typeof SkillExecutePayloadSchema>;
export type SkillResultPayload = z.infer<typeof SkillResultPayloadSchema>;
export type SessionPayload = z.infer<typeof SessionPayloadSchema>;

// ---------------------------------------------------------------------------
// Event to Payload mapping
// ---------------------------------------------------------------------------

export interface HookEventPayloads {
  // Extension events
  [HookEventNames.EXTENSION_BEFORE_LOAD]: ExtensionPayload;
  [HookEventNames.EXTENSION_AFTER_LOAD]: ExtensionPayload;
  [HookEventNames.EXTENSION_BEFORE_UNLOAD]: ExtensionPayload;
  [HookEventNames.EXTENSION_AFTER_UNLOAD]: ExtensionPayload;
  [HookEventNames.EXTENSION_ERROR]: ExtensionErrorPayload;

  // Workflow events
  [HookEventNames.WORKFLOW_BEFORE_EXECUTE]: WorkflowPayload;
  [HookEventNames.WORKFLOW_AFTER_EXECUTE]: WorkflowResultPayload;
  [HookEventNames.WORKFLOW_STEP_START]: WorkflowStepPayload;
  [HookEventNames.WORKFLOW_STEP_COMPLETE]: WorkflowStepPayload;
  [HookEventNames.WORKFLOW_ERROR]: WorkflowPayload & { error: Error };

  // Agent events
  [HookEventNames.AGENT_BEFORE_TASK]: AgentTaskPayload;
  [HookEventNames.AGENT_AFTER_TASK]: AgentTaskResultPayload;
  [HookEventNames.AGENT_MESSAGE]: AgentTaskPayload & { message: string; targetAgent?: string };
  [HookEventNames.AGENT_ERROR]: AgentTaskPayload & { error: Error };

  // MCP events
  [HookEventNames.MCP_BEFORE_CALL]: MCPCallPayload;
  [HookEventNames.MCP_AFTER_CALL]: MCPResultPayload;
  [HookEventNames.MCP_ERROR]: MCPCallPayload & { error: Error };

  // Skill events
  [HookEventNames.SKILL_BEFORE_EXECUTE]: SkillExecutePayload;
  [HookEventNames.SKILL_AFTER_EXECUTE]: SkillResultPayload;
  [HookEventNames.SKILL_ERROR]: SkillExecutePayload & { error: Error };

  // Session events
  [HookEventNames.SESSION_CREATED]: SessionPayload;
  [HookEventNames.SESSION_UPDATED]: SessionPayload;
  [HookEventNames.SESSION_COMPLETED]: SessionPayload;
  [HookEventNames.SESSION_CANCELLED]: SessionPayload;
}

// ---------------------------------------------------------------------------
// Handler Types
// ---------------------------------------------------------------------------

/**
 * Priority levels for hook handlers.
 * Lower numbers execute first.
 */
export enum HookPriority {
  HIGHEST = 0,
  HIGH = 25,
  NORMAL = 50,
  LOW = 75,
  LOWEST = 100,
}

/**
 * Hook handler function type with typed payload.
 */
export type HookHandler<T extends HookEventName> = (
  payload: HookEventPayloads[T]
) => Promise<void> | void;

/**
 * Generic hook handler for untyped access.
 */
export type GenericHookHandler = (payload: unknown) => Promise<void> | void;

/**
 * Registered hook handler with metadata.
 */
export interface RegisteredHandler<T extends HookEventName = HookEventName> {
  id: string;
  event: T;
  handler: HookHandler<T>;
  priority: HookPriority;
  extensionId?: string;
  once: boolean;
  timeoutMs: number;
  createdAt: Date;
}

/**
 * Options for registering a hook handler.
 */
export interface HookRegistrationOptions {
  priority?: HookPriority;
  extensionId?: string;
  once?: boolean;
  timeoutMs?: number;
}

/**
 * Hook execution result for a single handler.
 */
export interface HookExecutionResult {
  handlerId: string;
  success: boolean;
  error?: Error;
  durationMs: number;
}

/**
 * Aggregated hook emission result.
 */
export interface HookEmitResult {
  event: HookEventName;
  handlersExecuted: number;
  results: HookExecutionResult[];
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Extension Manifest Hook Registration
// ---------------------------------------------------------------------------

export const ManifestHookSchema = z.object({
  event: z.string(),
  handler: z.string(), // Function name or code reference
  priority: z.nativeEnum(HookPriority).optional(),
  timeoutMs: z.number().positive().optional(),
});

export type ManifestHook = z.infer<typeof ManifestHookSchema>;

/**
 * Extension manifest hooks section.
 */
export interface ExtensionHooksManifest {
  hooks?: ManifestHook[];
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const eventSchemas: Partial<Record<HookEventName, z.ZodSchema>> = {
  [HookEventNames.EXTENSION_BEFORE_LOAD]: ExtensionPayloadSchema,
  [HookEventNames.EXTENSION_AFTER_LOAD]: ExtensionPayloadSchema,
  [HookEventNames.EXTENSION_BEFORE_UNLOAD]: ExtensionPayloadSchema,
  [HookEventNames.EXTENSION_AFTER_UNLOAD]: ExtensionPayloadSchema,
  [HookEventNames.EXTENSION_ERROR]: ExtensionErrorPayloadSchema,
  [HookEventNames.WORKFLOW_BEFORE_EXECUTE]: WorkflowPayloadSchema,
  [HookEventNames.WORKFLOW_AFTER_EXECUTE]: WorkflowResultPayloadSchema,
  [HookEventNames.WORKFLOW_STEP_START]: WorkflowStepPayloadSchema,
  [HookEventNames.WORKFLOW_STEP_COMPLETE]: WorkflowStepPayloadSchema,
  [HookEventNames.AGENT_BEFORE_TASK]: AgentTaskPayloadSchema,
  [HookEventNames.AGENT_AFTER_TASK]: AgentTaskResultPayloadSchema,
  [HookEventNames.MCP_BEFORE_CALL]: MCPCallPayloadSchema,
  [HookEventNames.MCP_AFTER_CALL]: MCPResultPayloadSchema,
  [HookEventNames.SKILL_BEFORE_EXECUTE]: SkillExecutePayloadSchema,
  [HookEventNames.SKILL_AFTER_EXECUTE]: SkillResultPayloadSchema,
  [HookEventNames.SESSION_CREATED]: SessionPayloadSchema,
  [HookEventNames.SESSION_UPDATED]: SessionPayloadSchema,
  [HookEventNames.SESSION_COMPLETED]: SessionPayloadSchema,
  [HookEventNames.SESSION_CANCELLED]: SessionPayloadSchema,
};

/**
 * Validates a payload against its event schema.
 * Returns validation result with parsed data or error.
 */
export function validatePayload<T extends HookEventName>(
  event: T,
  payload: unknown
): { success: true; data: HookEventPayloads[T] } | { success: false; error: z.ZodError } {
  const schema = eventSchemas[event];
  if (!schema) {
    // No schema defined, pass through
    return { success: true, data: payload as HookEventPayloads[T] };
  }

  const result = schema.safeParse(payload);
  if (result.success) {
    return { success: true, data: result.data as HookEventPayloads[T] };
  }
  return { success: false, error: result.error };
}

/**
 * List of all available hook event names.
 */
export const ALL_HOOK_EVENTS: HookEventName[] = Object.values(HookEventNames);

/**
 * Check if a string is a valid hook event name.
 */
export function isValidHookEvent(event: string): event is HookEventName {
  return ALL_HOOK_EVENTS.includes(event as HookEventName);
}
