import { z } from "zod";

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  enum?: string[];
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
}

export interface ApprovalRequirement {
  condition: string;
  approver: string;
}

export interface ToolPermissions {
  allowedAgents: string[];
  requiresApproval?: ApprovalRequirement;
}

export interface MCPTool {
  name: string;
  provider: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  requiresAuth: boolean;
  permissions: ToolPermissions;
}

export interface CallContext {
  agentId: string;
  userId: string;
  organizationId: string;
  sessionId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  metadata: {
    duration: number;
    cached: boolean;
    approvalId?: string;
  };
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresApproval: boolean;
  approvalRequirement?: ApprovalRequirement;
}

export interface ToolApprovalRequest {
  id: string;
  toolName: string;
  agentId: string;
  userId: string;
  organizationId: string;
  args: unknown;
  condition: string;
  approver: string;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
  responseNote?: string;
}

export const ToolPermissionYAMLSchema = z.object({
  allowed_agents: z.array(z.string()),
  requires_approval: z
    .object({
      condition: z.string(),
      approver: z.string(),
    })
    .optional(),
});

export const ToolPermissionsFileSchema = z.object({
  tool_permissions: z.record(z.string(), ToolPermissionYAMLSchema),
});

export type ToolPermissionYAML = z.infer<typeof ToolPermissionYAMLSchema>;
export type ToolPermissionsFile = z.infer<typeof ToolPermissionsFileSchema>;

export const MCPErrorCodes = {
  TOOL_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  TOOL_EXECUTION_ERROR: -32603,
  PERMISSION_DENIED: -32604,
  APPROVAL_TIMEOUT: -32605,
  APPROVAL_REJECTED: -32606,
  APPROVAL_PENDING: -32607,
} as const;

export type MCPErrorCode = (typeof MCPErrorCodes)[keyof typeof MCPErrorCodes];

export class MCPError extends Error {
  constructor(
    public code: MCPErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MCPError";
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
