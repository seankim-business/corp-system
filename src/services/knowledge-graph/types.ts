/**
 * Knowledge Graph Types
 * Defines the data structures for the knowledge graph system
 */

// ============================================================================
// Core Graph Types
// ============================================================================

export type NodeType = 'person' | 'project' | 'document' | 'agent' | 'team' | 'task' | 'goal' | 'workflow';

export type EdgeType =
  | 'works_with'      // Person-Person relationship
  | 'works_on'        // Person/Agent works on Project/Task
  | 'owns'            // Person/Agent owns Project/Task
  | 'references'      // Document references another
  | 'delegates_to'    // Agent delegates to another
  | 'collaborates_with' // Agent collaborates with agent
  | 'member_of'       // Person/Agent is member of Team
  | 'manages'         // Person/Agent manages Team/Agent
  | 'depends_on'      // Project/Task depends on another
  | 'related_to'      // Generic relationship
  | 'parent_of'       // Hierarchical relationship
  | 'child_of'        // Hierarchical relationship
  | 'assigned_to'     // Task assigned to Person/Agent
  | 'created_by'      // Document/Project created by Person/Agent
  | 'contributes_to'; // Person/Agent contributes to Project

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType | string;
  weight: number;
  properties: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata?: {
    nodeCount: number;
    edgeCount: number;
    lastUpdated?: Date;
  };
}

// ============================================================================
// Database Models (Prisma mapped)
// ============================================================================

export interface DbGraphNode {
  id: string;
  organizationId: string;
  nodeType: NodeType;
  externalId: string | null;
  label: string;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbGraphEdge {
  id: string;
  organizationId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: EdgeType | string;
  weight: number;
  properties: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Query Types
// ============================================================================

export interface GraphQueryOptions {
  nodeTypes?: NodeType[];
  edgeTypes?: (EdgeType | string)[];
  maxDepth?: number;
  limit?: number;
  includeProperties?: boolean;
}

export interface PathQueryOptions {
  maxDepth?: number;
  edgeTypes?: (EdgeType | string)[];
  weighted?: boolean;
}

export interface QueryResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalNodes: number;
  totalEdges: number;
  queryTime?: number;
}

export interface PathResult {
  path: GraphNode[];
  edges: GraphEdge[];
  distance: number;
  found: boolean;
}

export interface RelatedNodesResult {
  node: GraphNode;
  related: Array<{
    node: GraphNode;
    edge: GraphEdge;
    depth: number;
  }>;
}

export interface NaturalLanguageQueryResult {
  answer: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  confidence: number;
  interpretation: string;
}

// ============================================================================
// Builder Types
// ============================================================================

export interface CreateNodeInput {
  type: NodeType;
  label: string;
  externalId?: string;
  properties?: Record<string, unknown>;
}

export interface CreateEdgeInput {
  sourceId: string;
  targetId: string;
  type: EdgeType | string;
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface UpdateNodeInput {
  label?: string;
  properties?: Record<string, unknown>;
}

export interface UpdateEdgeInput {
  weight?: number;
  properties?: Record<string, unknown>;
}

export interface InferredRelationship {
  sourceId: string;
  targetId: string;
  type: EdgeType | string;
  weight: number;
  confidence: number;
  reason: string;
}

// ============================================================================
// Visualization Types
// ============================================================================

export interface VisNode {
  id: string;
  label: string;
  group: NodeType;
  title?: string;
  color?: string | { background: string; border: string };
  size?: number;
  shape?: string;
  font?: { size?: number; color?: string };
  x?: number;
  y?: number;
}

export interface VisEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  title?: string;
  color?: string | { color: string; highlight: string };
  width?: number;
  dashes?: boolean;
  arrows?: string | { to: { enabled: boolean } };
}

export interface VisualizationData {
  nodes: VisNode[];
  edges: VisEdge[];
}

export interface VisualizationOptions {
  colorScheme?: Record<NodeType, string>;
  edgeColors?: Record<string, string>;
  showLabels?: boolean;
  showWeights?: boolean;
  physics?: boolean;
  hierarchical?: boolean;
}

// ============================================================================
// Analytics Types
// ============================================================================

export interface NodeCentrality {
  nodeId: string;
  degree: number;
  betweenness?: number;
  closeness?: number;
  pageRank?: number;
}

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  density: number;
  averageDegree: number;
  nodesByType: Record<NodeType, number>;
  edgesByType: Record<string, number>;
  components: number;
  diameter?: number;
}

export interface ClusterInfo {
  id: string;
  nodes: string[];
  center?: string;
  density: number;
}

// ============================================================================
// Event Types
// ============================================================================

export type GraphEventType =
  | 'node_created'
  | 'node_updated'
  | 'node_deleted'
  | 'edge_created'
  | 'edge_updated'
  | 'edge_deleted'
  | 'graph_rebuilt';

export interface GraphEvent {
  type: GraphEventType;
  organizationId: string;
  timestamp: Date;
  nodeId?: string;
  edgeId?: string;
  changes?: Record<string, unknown>;
}

// ============================================================================
// Extraction Types
// ============================================================================

export interface ExtractedEntity {
  type: NodeType;
  id: string;
  label: string;
  properties: Record<string, unknown>;
  source: 'agent' | 'member' | 'team' | 'project' | 'task' | 'goal' | 'workflow' | 'document';
}

export interface ExtractedRelationship {
  sourceId: string;
  sourceType: NodeType;
  targetId: string;
  targetType: NodeType;
  relationshipType: EdgeType | string;
  weight: number;
  metadata?: Record<string, unknown>;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  errors?: string[];
}
