/**
 * TypeScript type definitions for OpenCode Sidecar
 * Must match Nubabel's orchestrator types exactly
 */

export type Category =
  | "visual-engineering"
  | "ultrabrain"
  | "artistry"
  | "quick"
  | "writing"
  | "unspecified-low"
  | "unspecified-high";

export type Skill = "playwright" | "git-master" | "frontend-ui-ux" | "mcp-integration";

export interface DelegateTaskRequest {
  category: Category;
  load_skills: Skill[];
  prompt: string;
  session_id: string;
  organizationId?: string;
  userId?: string;
  context?: Record<string, unknown>;
  callbacks?: {
    sessionUpdate: string;
    mcpInvoke: string;
    progress: string;
  };
}

export interface DelegateTaskResponse {
  output: string;
  status: "success" | "failed";
  metadata: {
    model: string;
    duration?: number;
    inputTokens?: number;
    outputTokens?: number;
    cost?: number;
    error?: string;
    opencodeSessionId?: string;
    nubabelSessionId?: string;
  };
}

export interface ValidationError {
  field: string;
  message: string;
}
