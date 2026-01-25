export type Category =
  | "visual-engineering"
  | "ultrabrain"
  | "artistry"
  | "quick"
  | "unspecified-low"
  | "unspecified-high"
  | "writing";

export type Skill =
  | "playwright"
  | "git-master"
  | "frontend-ui-ux"
  | "mcp-integration";

export interface OrchestrationRequest {
  userRequest: string;
  sessionId: string;
  organizationId: string;
  userId: string;
}

export interface OrchestrationResult {
  output: string;
  status: "success" | "failed";
  metadata: {
    category: Category;
    skills: Skill[];
    duration: number;
    model: string;
    sessionId: string;
  };
}

export interface RequestAnalysis {
  intent: string;
  entities: {
    target?: string;
    action?: string;
    object?: string;
  };
  keywords: string[];
  requiresMultiAgent: boolean;
  complexity: "low" | "medium" | "high";
}

export interface Session {
  id: string;
  userId: string;
  organizationId: string;
  source: "slack" | "web" | "terminal" | "api";
  state: Record<string, any>;
  history: any[];
  metadata: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
}

export interface DelegateTaskResult {
  status: "pending" | "running" | "success" | "failed";
  output: string;
  metadata: {
    model: string;
    tokens?: number;
    duration: number;
    session_id: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface MCPConnection {
  id: string;
  organizationId: string;
  provider: string;
  name: string;
  config: Record<string, any>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
