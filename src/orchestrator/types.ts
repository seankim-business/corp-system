export type Category =
  | "visual-engineering"
  | "ultrabrain"
  | "artistry"
  | "quick"
  | "unspecified-low"
  | "unspecified-high"
  | "writing";

// Legacy skill union - deprecated, use SkillId instead
/** @deprecated Use SkillId from extension-registry instead */
export type LegacySkill = "playwright" | "git-master" | "frontend-ui-ux" | "mcp-integration";

// Branded type for type-safe skill identifiers
export type SkillId = string & { readonly __brand: unique symbol };

// Combined type for backward compatibility
export type Skill = LegacySkill | SkillId;

// Type guard to check if a skill is a legacy built-in skill
export function isLegacySkill(id: string): id is LegacySkill {
  return ['playwright', 'git-master', 'frontend-ui-ux', 'mcp-integration'].includes(id);
}

// Type guard to validate skill ID format
export function isValidSkillId(id: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(id);
}

// Convert string to SkillId (use after validation)
export function toSkillId(id: string): SkillId {
  if (!isValidSkillId(id)) {
    throw new Error(`Invalid skill ID format: ${id}`);
  }
  return id as SkillId;
}

// Safe conversion without validation
export function asSkillId(id: string): SkillId {
  return id as SkillId;
}

export interface OrchestrationRequest {
  userRequest: string;
  sessionId: string;
  organizationId: string;
  userId: string;
}

export interface OrchestrationResult {
  output: string;
  status: "success" | "failed" | "pending" | "rate_limited";
  metadata: {
    category: Category;
    skills: Skill[];
    duration: number;
    model: string;
    sessionId: string;
    approvalId?: string;
    approvalType?: string;
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
  namespace: string;
  name: string;
  config: Record<string, any>;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}
