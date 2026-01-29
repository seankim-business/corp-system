import { Extension } from '../extension-registry';

export interface ExecutionContext {
  organizationId: string;
  agentId?: string;
  sessionId?: string;
  userId?: string;
  mcpConnections: Map<string, unknown>;
}

export interface SkillInput {
  parameters: Record<string, unknown>;
  context: Record<string, unknown>;
}

export interface SkillOutput {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
  metadata: {
    executionTimeMs: number;
    tokensUsed?: number;
  };
}

export interface ExecutorConfig {
  timeoutMs: number;
  memoryLimitMB: number;
}

export interface SkillExecutor {
  execute(
    skill: Extension,
    input: SkillInput,
    context: ExecutionContext
  ): Promise<SkillOutput>;

  canExecute(skill: Extension): boolean;
}
