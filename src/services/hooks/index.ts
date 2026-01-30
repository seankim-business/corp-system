/**
 * Hook System Exports
 *
 * Central hook management for extension lifecycle, workflow execution,
 * agent tasks, and MCP calls.
 */

// Core manager and utilities
export {
  HookManager,
  getHookManager,
  onHook,
  onceHook,
  offHook,
  emitHook,
} from './hook-manager';

// Type definitions
export {
  // Event names
  HookEventNames,
  HookEventName,
  ALL_HOOK_EVENTS,
  isValidHookEvent,

  // Payload types
  ExtensionPayload,
  ExtensionErrorPayload,
  WorkflowContext,
  WorkflowPayload,
  WorkflowResultPayload,
  WorkflowStepPayload,
  AgentTaskPayload,
  AgentTaskResultPayload,
  MCPCallPayload,
  MCPResultPayload,
  SkillExecutePayload,
  SkillResultPayload,
  SessionPayload,
  HookEventPayloads,

  // Handler types
  HookPriority,
  HookHandler,
  GenericHookHandler,
  RegisteredHandler,
  HookRegistrationOptions,
  HookExecutionResult,
  HookEmitResult,

  // Manifest types
  ManifestHook,
  ExtensionHooksManifest,

  // Zod schemas for external validation
  ExtensionPayloadSchema,
  ExtensionErrorPayloadSchema,
  WorkflowContextSchema,
  WorkflowPayloadSchema,
  WorkflowResultPayloadSchema,
  WorkflowStepPayloadSchema,
  AgentTaskPayloadSchema,
  AgentTaskResultPayloadSchema,
  MCPCallPayloadSchema,
  MCPResultPayloadSchema,
  SkillExecutePayloadSchema,
  SkillResultPayloadSchema,
  SessionPayloadSchema,
  ManifestHookSchema,

  // Validation utility
  validatePayload,
} from './types';

// Singleton instance for convenience
import { HookManager } from './hook-manager';

/**
 * Global hook manager instance.
 * Use this for direct access to the singleton.
 */
export const hookManager = HookManager.getInstance();
