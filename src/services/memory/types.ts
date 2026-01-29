/**
 * Memory Service Types
 */

export type MemoryScope = "global" | "organization" | "agent" | "workflow" | "conversation";
export type MemoryImportance = "low" | "medium" | "high" | "critical";
export type MemorySourceType = "manual" | "agent" | "workflow" | "system";

export type EntityType = "person" | "project" | "document" | "task" | "goal" | "decision" | "other";

export interface Memory {
  id: string;
  organizationId: string;
  scope: MemoryScope;
  scopeId?: string;
  type: MemorySourceType;
  key: string;
  value: any;
  importance: MemoryImportance;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  accessCount: number;
  lastAccessedAt?: Date;
}

export interface CreateMemoryInput {
  organizationId: string;
  scope: MemoryScope;
  scopeId?: string;
  type: MemorySourceType;
  key: string;
  value: any;
  importance?: MemoryImportance;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface UpdateMemoryInput {
  value?: any;
  importance?: MemoryImportance;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface MemorySearchOptions {
  scope?: MemoryScope;
  scopeId?: string;
  type?: MemorySourceType;
  importance?: MemoryImportance;
  keyPattern?: string;
  limit?: number;
  offset?: number;
}

export interface EntityMemory {
  id: string;
  organizationId: string;
  type: EntityType;
  name: string;
  attributes?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;
}

export interface CreateEntityInput {
  organizationId: string;
  type: EntityType;
  name: string;
  attributes?: Record<string, any>;
  metadata?: Record<string, any>;
  relationships?: Array<{
    relatedEntityId: string;
    relationship: string;
  }>;
}
