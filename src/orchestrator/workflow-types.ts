import { z } from "zod";

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

export type NodeResult = z.infer<typeof NodeResultSchema>;
export type WorkflowContext = z.infer<typeof WorkflowContextSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
