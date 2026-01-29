/**
 * Memory Service Types
 *
 * Defines types for long-term conversation memory system
 */

export type MemoryScope = 'user' | 'team' | 'organization' | 'project';
export type MemoryType = 'fact' | 'preference' | 'decision' | 'context';
export type MemoryImportance = 'low' | 'medium' | 'high' | 'critical';
export type MemorySourceType = 'extracted' | 'explicit' | 'inferred';

export interface Memory {
  id: string;
  organizationId: string;

  // Scope
  scope: MemoryScope;
  scopeId: string;  // userId, teamId, orgId, or projectId

  // Memory content
  type: MemoryType;
  key: string;
  value: string;

  // Importance
  importance: MemoryImportance;

  // Source
  sourceType: MemorySourceType;
  sourceId?: string; // conversationId or sessionId

  // Lifecycle
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;
  expiresAt?: Date;
}

export interface CreateMemoryInput {
  organizationId: string;
  scope: MemoryScope;
  scopeId: string;
  type: MemoryType;
  key: string;
  value: string;
  importance?: MemoryImportance;
  sourceType?: MemorySourceType;
  sourceId?: string;
  expiresAt?: Date;
}

export interface UpdateMemoryInput {
  value?: string;
  importance?: MemoryImportance;
  expiresAt?: Date | null;
}

export interface MemorySearchOptions {
  limit?: number;
  types?: MemoryType[];
  importance?: MemoryImportance[];
  includeExpired?: boolean;
}

export type EntityType = 'person' | 'project' | 'company' | 'product';

export interface EntityRelationship {
  relatedEntityId: string;
  relationship: string;
}

export interface EntityMemory {
  id: string;
  organizationId: string;
  entityType: EntityType;
  entityName: string;
  attributes: Record<string, string>;
  relationships: EntityRelationship[];
  notes: string[];
  lastMentioned: Date;
  mentionCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEntityInput {
  organizationId: string;
  entityType: EntityType;
  entityName: string;
  attributes?: Record<string, string>;
  relationships?: EntityRelationship[];
  notes?: string[];
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
}

export interface ExtractionResult {
  facts: { key: string; value: string; importance: MemoryImportance }[];
  preferences: { key: string; value: string }[];
  entities: { type: EntityType; name: string; attributes: Record<string, string> }[];
  decisions: { description: string; context: string }[];
}

export interface ContextOptimizationResult {
  memories: Memory[];
  entities: EntityMemory[];
  recentContext: string;
  totalTokens: number;
}
