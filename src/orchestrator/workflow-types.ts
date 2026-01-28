import { z } from "zod";

export type WorkflowStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "success"
  | "cancelled";

export interface PendingApproval {
  approvalId: string;
  nodeId: string;
  reason: string;
  requestedAt: Date;
  expiresAt: Date;
}

export interface WorkflowContext {
  executionId: string;
  workflowName: string;
  organizationId: string;
  userId: string;
  sessionId: string;
  variables: Record<string, unknown>;
  nodeResults: Map<string, WorkflowStepResult>;
  currentNode: string;
  status: WorkflowStatus;
  startedAt: Date;
  completedAt?: Date;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  history: WorkflowHistoryEntry[];
  error?: { code: string; message: string };
  pendingApproval?: PendingApproval;
}

export interface NodeResult {
  nodeId: string;
  status: "pending" | "running" | "success" | "failed" | "skipped" | "waiting";
  output?: unknown;
  error?: string;
  duration?: number;
}

export interface WorkflowStepResult {
  nodeId: string;
  status: "pending" | "running" | "success" | "failed" | "skipped" | "waiting";
  output: unknown;
  duration: number;
  error?: { code: string; message: string };
  metadata?: Record<string, unknown>;
}

export interface WorkflowHistoryEntry {
  nodeId: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  output?: unknown;
  error?: string;
}

export interface WorkflowExecutionOptions {
  input?: Record<string, unknown>;
  dryRun?: boolean;
  resumeFromNode?: string;
  contextOverrides?: Partial<WorkflowContext>;
}

export interface WorkflowExecutionResult {
  executionId: string;
  workflowName: string;
  status: WorkflowStatus;
  output?: Record<string, unknown>;
  duration: number;
  stats: {
    totalNodes: number;
    executedNodes: number;
    successNodes: number;
    failedNodes: number;
    skippedNodes: number;
  };
  history: WorkflowHistoryEntry[];
  error?: { code: string; message: string };
  pendingApproval?: {
    id: string;
    executionId: string;
    nodeId: string;
    organizationId: string;
    requestedBy: string;
    type: string;
    reason: string;
    contextData: Record<string, unknown>;
    status: string;
    createdAt: Date;
    expiresAt: Date;
  };
}

export interface ParallelExecutionResult {
  results: WorkflowStepResult[];
  allSucceeded: boolean;
  duration: number;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
}

export interface WorkflowNode {
  id: string;
  type: "agent" | "condition" | "parallel" | "human_approval" | "function";
  agentId?: string;
  condition?: string;
  parallelAgents?: string[];
  approvalType?: string;
  timeout?: number;
  description?: string;
  handler?: (context: WorkflowContext) => Promise<WorkflowStepResult>;
  function?: string;
  retry?: RetryConfig;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface WorkflowDefinition {
  name: string;
  version?: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  defaultTimeout?: number;
}

export const NodeResultSchema = z.object({
  nodeId: z.string(),
  status: z.enum(["pending", "running", "success", "failed", "skipped"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  duration: z.number().optional(),
});

export const WorkflowContextSchema = z.object({
  organizationId: z.string(),
  userId: z.string(),
  sessionId: z.string(),
  variables: z.record(z.unknown()),
  nodeResults: z.record(NodeResultSchema),
  currentNode: z.string(),
  status: z.enum(["pending", "running", "waiting_approval", "completed", "failed"]),
  startedAt: z.date(),
  completedAt: z.date().optional(),
});

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["agent", "condition", "parallel", "human_approval"]),
  agentId: z.string().optional(),
  condition: z.string().optional(),
  parallelAgents: z.array(z.string()).optional(),
  approvalType: z.string().optional(),
  timeout: z.number().optional(),
});

export const WorkflowEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  condition: z.string().optional(),
});

export const WorkflowDefinitionSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  defaultTimeout: z.number().optional(),
});
