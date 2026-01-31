/**
 * AgentActivity Model
 * Tracks AI agent execution activities
 */

export interface AgentActivity {
  id: string;
  organizationId: string;
  sessionId: string | null;
  agentType: string;
  agentName: string | null;
  category: string | null;
  status: ActivityStatus;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  errorMessage: string | null;
  metadata: ActivityMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type ActivityStatus = "running" | "completed" | "failed" | "cancelled" | "timeout";

export interface ActivityMetadata {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costCents?: number;
  accountId?: string;
  retryCount?: number;
  parentActivityId?: string;
  [key: string]: unknown;
}

export interface CreateAgentActivityInput {
  organizationId: string;
  sessionId: string;
  agentType: string;
  agentName?: string | null;
  category?: string | null;
  status?: ActivityStatus;
  inputData?: Record<string, unknown> | null;
  metadata?: ActivityMetadata;
}

export interface UpdateAgentActivityInput {
  status?: ActivityStatus;
  completedAt?: Date | null;
  durationMs?: number | null;
  outputData?: Record<string, unknown> | null;
  errorMessage?: string | null;
  metadata?: ActivityMetadata;
}

export interface AgentActivityFilters {
  organizationId?: string;
  sessionId?: string;
  agentType?: string | string[];
  category?: string | string[];
  status?: ActivityStatus | ActivityStatus[];
  startedAfter?: Date;
  startedBefore?: Date;
  minDuration?: number;
  maxDuration?: number;
}

export interface AgentActivityStats {
  totalActivities: number;
  completedActivities: number;
  failedActivities: number;
  averageDurationMs: number;
  totalDurationMs: number;
  successRate: number;
}
