/**
 * UsageRecord Model (Request Log)
 * Tracks API usage for billing and analytics
 */

export interface UsageRecord {
  id: string;
  organizationId: string;
  sessionId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  category: string | null;
  agentId: string | null;
  metadata: UsageMetadata | null;
  createdAt: Date;
}

export interface UsageMetadata {
  accountId?: string;
  endpoint?: string;
  requestDurationMs?: number;
  cacheHit?: boolean;
  errorCode?: string;
  retryCount?: number;
  [key: string]: unknown;
}

export interface CreateUsageRecordInput {
  organizationId: string;
  sessionId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  category?: string | null;
  agentId?: string | null;
  metadata?: UsageMetadata | null;
}

export interface UsageRecordFilters {
  organizationId?: string;
  sessionId?: string;
  model?: string | string[];
  category?: string | string[];
  agentId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  minCost?: number;
  maxCost?: number;
}

export interface UsageStats {
  totalRecords: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostCents: number;
  averageCostCents: number;
  modelBreakdown: Record<
    string,
    {
      count: number;
      inputTokens: number;
      outputTokens: number;
      costCents: number;
    }
  >;
}
