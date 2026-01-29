/**
 * Extension Context Types
 *
 * Provides context information and utilities to extensions during execution.
 */

import { Logger } from "./hooks";

/**
 * API Client interface for external service integrations
 */
export interface APIClient {
  get<T>(path: string, params?: Record<string, unknown>): Promise<T>;
  post<T>(path: string, data?: unknown): Promise<T>;
  put<T>(path: string, data?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
  query<T>(options: Record<string, unknown>): Promise<T>;
}

/**
 * Extension-scoped storage interface
 */
export interface ExtensionStorage {
  /**
   * Get a value from storage
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in storage
   */
  set<T>(key: string, value: T, options?: StorageOptions): Promise<void>;

  /**
   * Delete a value from storage
   */
  delete(key: string): Promise<void>;

  /**
   * List keys in storage
   */
  list(prefix?: string): Promise<string[]>;

  /**
   * Check if a key exists
   */
  has(key: string): Promise<boolean>;
}

export interface StorageOptions {
  /**
   * Time-to-live in seconds
   */
  ttl?: number;

  /**
   * Whether to encrypt the value
   */
  encrypted?: boolean;
}

/**
 * Base extension context available to all extension components
 */
export interface ExtensionContext {
  /**
   * Organization information
   */
  organizationId: string;
  organizationName: string;

  /**
   * Current user information
   */
  userId: string;
  userEmail: string;
  userRole: string;

  /**
   * Extension configuration (from manifest)
   */
  config: Record<string, unknown>;

  /**
   * Extension metadata
   */
  extensionId: string;
  extensionVersion: string;

  /**
   * Get an API client for an external service
   */
  getAPI(name: "notion" | "drive" | "github" | "slack" | "calendar"): APIClient;

  /**
   * Logger instance
   */
  log: Logger;

  /**
   * Extension-scoped storage
   */
  storage: ExtensionStorage;

  /**
   * Emit an event that other extensions or the platform can listen to
   */
  emit(event: string, data: unknown): Promise<void>;

  /**
   * Get a secret from the extension's secrets store
   */
  getSecret(key: string): Promise<string | null>;
}

/**
 * Context for tool execution
 */
export interface ToolContext extends ExtensionContext {
  /**
   * Name of the tool being executed
   */
  toolName: string;

  /**
   * Unique execution ID
   */
  executionId: string;

  /**
   * Abort signal for cancellation
   */
  signal: AbortSignal;

  /**
   * Request metadata
   */
  metadata: {
    startTime: Date;
    timeout: number;
    retryCount: number;
  };

  /**
   * Report progress during long-running operations
   */
  reportProgress(percent: number, message?: string): Promise<void>;
}

/**
 * Context for hook execution
 */
export interface HookContext extends ExtensionContext {
  /**
   * Name of the hook being executed
   */
  hookName: string;

  /**
   * The payload that triggered the hook
   */
  payload: unknown;

  /**
   * Hook execution timestamp
   */
  timestamp: Date;

  /**
   * Modify the payload (for pre-hooks)
   */
  modifyPayload(newPayload: unknown): void;

  /**
   * Prevent the default action (for pre-hooks)
   */
  preventDefault(): void;

  /**
   * Check if default was prevented
   */
  isDefaultPrevented(): boolean;

  /**
   * Get the modified payload
   */
  getModifiedPayload(): unknown;
}

/**
 * Context for UI components
 */
export interface ComponentContext extends ExtensionContext {
  /**
   * Component name
   */
  componentName: string;

  /**
   * Component props passed from the platform
   */
  props: Record<string, unknown>;

  /**
   * Navigate to another page
   */
  navigate(path: string): void;

  /**
   * Show a notification
   */
  notify(message: string, type?: "info" | "success" | "warning" | "error"): void;

  /**
   * Open a modal
   */
  openModal(componentId: string, props?: Record<string, unknown>): void;

  /**
   * Close the current modal
   */
  closeModal(): void;
}

/**
 * Context for workflow steps
 */
export interface WorkflowContext extends ExtensionContext {
  /**
   * Workflow execution ID
   */
  workflowExecutionId: string;

  /**
   * Current step ID
   */
  stepId: string;

  /**
   * Input from previous steps
   */
  inputs: Record<string, unknown>;

  /**
   * Set output for next steps
   */
  setOutput(key: string, value: unknown): void;

  /**
   * Skip remaining steps
   */
  skipRemaining(reason?: string): void;

  /**
   * Request human approval
   */
  requestApproval(options: ApprovalRequest): Promise<ApprovalResult>;
}

export interface ApprovalRequest {
  title: string;
  description: string;
  approvers: string[];
  timeout?: number;
}

export interface ApprovalResult {
  approved: boolean;
  approverId?: string;
  note?: string;
}
