/**
 * Resource Registry Provider Types
 * Defines interfaces for external resource provider adapters
 */

import { ResourceProviderType, InternalResourceType } from "@prisma/client";

// ============================================================================
// External Resource Types
// ============================================================================

/**
 * Field definition from external resource
 */
export interface ExternalField {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "datetime" | "select" | "multi_select" | "relation" | "formula" | "unknown";
  required: boolean;
  options?: string[]; // For select/multi_select types
  description?: string;
}

/**
 * Schema detected from external resource
 */
export interface ExternalResourceSchema {
  resourceId: string;
  resourceName: string;
  fields: ExternalField[];
  sampleData?: Record<string, unknown>[];
  metadata?: Record<string, unknown>;
}

/**
 * Paginated list of resources from provider
 */
export interface ResourceList {
  resources: ExternalResourceInfo[];
  hasMore: boolean;
  cursor?: string;
}

/**
 * Basic info about an external resource
 */
export interface ExternalResourceInfo {
  id: string;
  name: string;
  type: string; // Provider-specific type (e.g., "database" for Notion)
  url?: string;
  lastModified?: Date;
}

/**
 * Record from external resource
 */
export interface ExternalRecord {
  id: string;
  data: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
  url?: string;
}

/**
 * Paginated list of records
 */
export interface RecordList {
  records: ExternalRecord[];
  hasMore: boolean;
  cursor?: string;
  totalCount?: number;
}

// ============================================================================
// Field Mapping Types
// ============================================================================

/**
 * Mapping between external and internal fields
 */
export interface FieldMapping {
  externalField: string;
  internalField: string;
  transform?: "none" | "uppercase" | "lowercase" | "trim" | "date_parse" | "number_parse" | "boolean_parse";
  defaultValue?: unknown;
}

/**
 * Field mapping suggestion from AI
 */
export interface FieldMappingSuggestion {
  externalField: string;
  internalField: string;
  confidence: number; // 0-1
  reason: string;
}

// ============================================================================
// Schema Detection Types
// ============================================================================

/**
 * Suggestion for resource type based on AI analysis
 */
export interface SchemaSuggestion {
  type: InternalResourceType;
  customTypeName?: string; // If type is 'custom'
  confidence: number; // 0-1
  reason: string;
  fieldMappings: FieldMappingSuggestion[];
}

/**
 * Result of schema detection
 */
export interface SchemaDetectionResult {
  resourceId: string;
  provider: ResourceProviderType;
  schema: ExternalResourceSchema;
  suggestions: SchemaSuggestion[];
}

// ============================================================================
// Provider Context
// ============================================================================

/**
 * Context passed to provider methods
 */
export interface ProviderContext {
  organizationId: string;
  connectionId: string;
  credentials: Record<string, unknown>; // Decrypted credentials
  connectionUrl?: string;
}

/**
 * Options for listing resources
 */
export interface ListResourcesOptions {
  cursor?: string;
  limit?: number;
  filter?: Record<string, unknown>;
}

/**
 * Options for fetching records
 */
export interface FetchRecordsOptions {
  cursor?: string;
  limit?: number;
  filter?: Record<string, unknown>;
  sorts?: Array<{ field: string; direction: "asc" | "desc" }>;
  modifiedSince?: Date;
}

// ============================================================================
// Provider Adapter Interface
// ============================================================================

/**
 * Interface that all resource provider adapters must implement
 */
export interface ResourceProviderAdapter {
  /**
   * Provider type identifier
   */
  readonly providerType: ResourceProviderType;

  /**
   * Human-readable name for the provider
   */
  readonly displayName: string;

  /**
   * Validate that the connection credentials are valid
   */
  validateConnection(ctx: ProviderContext): Promise<boolean>;

  /**
   * Detect the schema of an external resource
   */
  detectSchema(ctx: ProviderContext, resourceId: string): Promise<ExternalResourceSchema>;

  /**
   * List available resources from the provider
   */
  listResources(ctx: ProviderContext, options?: ListResourcesOptions): Promise<ResourceList>;

  /**
   * Fetch records from a specific resource
   */
  fetchRecords(ctx: ProviderContext, resourceId: string, options?: FetchRecordsOptions): Promise<RecordList>;

  /**
   * Create a new record in the external resource
   */
  createRecord(ctx: ProviderContext, resourceId: string, data: Record<string, unknown>): Promise<ExternalRecord>;

  /**
   * Update an existing record in the external resource
   */
  updateRecord(ctx: ProviderContext, resourceId: string, recordId: string, data: Record<string, unknown>): Promise<ExternalRecord>;

  /**
   * Delete a record from the external resource
   */
  deleteRecord?(ctx: ProviderContext, resourceId: string, recordId: string): Promise<void>;

  /**
   * Parse a URL to extract resource information
   * Returns null if URL doesn't match this provider
   */
  parseResourceUrl?(url: string): { resourceId: string; type?: string } | null;
}

// ============================================================================
// Sync Types
// ============================================================================

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsDeleted: number;
  recordsFailed: number;
  errors: SyncError[];
  durationMs: number;
}

/**
 * Error during sync
 */
export interface SyncError {
  recordId?: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Sync options
 */
export interface SyncOptions {
  fullSync?: boolean; // If true, sync all records; otherwise incremental
  dryRun?: boolean; // If true, don't actually make changes
  batchSize?: number;
}
