/**
 * ClaudeAccount Model
 * Represents a Claude API account with circuit breaker state
 */

export interface ClaudeAccount {
  id: string;
  organizationId: string;
  name: string;
  status: AccountStatus;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
  circuitOpensAt: Date | null;
  lastFailureAt: Date | null;
  lastFailureReason: string | null;
  lastSuccessAt: Date | null;
  metadata: AccountMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export type AccountStatus =
  | "active" // Circuit closed, account is healthy
  | "half_open" // Circuit testing, limited requests allowed
  | "open" // Circuit open, account is failing
  | "disabled"; // Manually disabled

export interface AccountMetadata {
  apiKeyHash?: string;
  tags?: string[];
  priority?: number;
  maxTokensPerRequest?: number;
  dailyQuotaLimit?: number;
  monthlyQuotaLimit?: number;
  notes?: string;
  [key: string]: unknown;
}

export interface CreateClaudeAccountInput {
  organizationId: string;
  name: string;
  status?: AccountStatus;
  metadata?: AccountMetadata;
}

export interface UpdateClaudeAccountInput {
  name?: string;
  status?: AccountStatus;
  consecutiveFailures?: number;
  halfOpenSuccesses?: number;
  circuitOpensAt?: Date | null;
  lastFailureAt?: Date | null;
  lastFailureReason?: string | null;
  lastSuccessAt?: Date | null;
  metadata?: AccountMetadata;
}

export interface ClaudeAccountFilters {
  organizationId?: string;
  status?: AccountStatus | AccountStatus[];
  tags?: string[];
  minPriority?: number;
  excludeIds?: string[];
}
