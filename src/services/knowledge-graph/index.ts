/**
 * Knowledge Graph Service
 * Main entry point for the knowledge graph system
 */

export * from "./types";
export { GraphBuilder, createGraphBuilder } from "./graph-builder";
export { GraphQueryEngine, createGraphQueryEngine } from "./query-engine";
export { RelationshipExtractor, createRelationshipExtractor } from "./relationship-extractor";
export { GraphVisualizer, createGraphVisualizer } from "./visualizer";

import { GraphBuilder } from "./graph-builder";
import { GraphQueryEngine } from "./query-engine";
import { GraphVisualizer } from "./visualizer";
import { logger } from "../../utils/logger";
import type {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  GraphStats,
  VisualizationData,
  VisualizationOptions,
  NaturalLanguageQueryResult,
  PathResult,
  RelatedNodesResult,
  NodeType,
  EdgeType,
} from "./types";

/**
 * Unified Knowledge Graph Service
 * Provides a single interface for all knowledge graph operations
 */
export class KnowledgeGraphService {
  private organizationId: string;
  private builder: GraphBuilder;
  private queryEngine: GraphQueryEngine;
  private visualizer: GraphVisualizer;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.builder = new GraphBuilder(organizationId);
    this.queryEngine = new GraphQueryEngine(organizationId);
    this.visualizer = new GraphVisualizer(organizationId);
  }

  // ============================================================================
  // Graph Building
  // ============================================================================

  /**
   * Build or rebuild the knowledge graph from organizational data
   */
  async buildGraph(): Promise<KnowledgeGraph> {
    logger.info("Building knowledge graph", { organizationId: this.organizationId });
    return this.builder.buildGraph();
  }

  /**
   * Get the current knowledge graph
   */
  async getGraph(): Promise<KnowledgeGraph> {
    return this.builder.getGraph();
  }

  /**
   * Clear all graph data
   */
  async clearGraph(): Promise<void> {
    await this.builder.clearGraph();
  }

  // ============================================================================
  // Node Operations
  // ============================================================================

  /**
   * Add a node to the graph
   */
  async addNode(input: {
    type: NodeType;
    label: string;
    externalId?: string;
    properties?: Record<string, unknown>;
  }): Promise<GraphNode> {
    return this.builder.addNode(input);
  }

  /**
   * Update a node
   */
  async updateNode(
    nodeId: string,
    input: { label?: string; properties?: Record<string, unknown> }
  ): Promise<GraphNode> {
    return this.builder.updateNode(nodeId, input);
  }

  /**
   * Delete a node
   */
  async deleteNode(nodeId: string): Promise<void> {
    await this.builder.deleteNode(nodeId);
  }

  // ============================================================================
  // Edge Operations
  // ============================================================================

  /**
   * Add an edge to the graph
   */
  async addEdge(input: {
    sourceId: string;
    targetId: string;
    type: EdgeType | string;
    weight?: number;
    properties?: Record<string, unknown>;
  }): Promise<GraphEdge> {
    return this.builder.addEdge(input);
  }

  /**
   * Update an edge
   */
  async updateEdge(
    edgeId: string,
    input: { weight?: number; properties?: Record<string, unknown> }
  ): Promise<GraphEdge> {
    return this.builder.updateEdge(edgeId, input);
  }

  /**
   * Delete an edge
   */
  async deleteEdge(edgeId: string): Promise<void> {
    await this.builder.deleteEdge(edgeId);
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Find shortest path between two nodes
   */
  async findPath(
    fromId: string,
    toId: string,
    options?: { maxDepth?: number; edgeTypes?: string[]; weighted?: boolean }
  ): Promise<PathResult> {
    return this.queryEngine.findPath(fromId, toId, options);
  }

  /**
   * Find related nodes within a certain depth
   */
  async findRelated(
    nodeId: string,
    depth?: number,
    options?: { nodeTypes?: NodeType[]; edgeTypes?: string[]; limit?: number }
  ): Promise<RelatedNodesResult> {
    return this.queryEngine.findRelated(nodeId, depth, options);
  }

  /**
   * Find nodes by relationship type
   */
  async findByRelationship(
    type: EdgeType | string,
    options?: { limit?: number }
  ): Promise<Array<{ node: GraphNode; related: GraphNode[] }>> {
    return this.queryEngine.findByRelationship(type, options);
  }

  /**
   * Search nodes by label
   */
  async searchNodes(
    searchTerm: string,
    options?: { nodeTypes?: NodeType[]; limit?: number }
  ): Promise<GraphNode[]> {
    return this.queryEngine.searchNodes(searchTerm, options);
  }

  /**
   * Natural language query
   */
  async query(question: string): Promise<NaturalLanguageQueryResult> {
    return this.queryEngine.query(question);
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<GraphStats> {
    return this.queryEngine.getStats();
  }

  /**
   * Get node centrality metrics
   */
  async getNodeCentrality(limit?: number): Promise<Array<{ nodeId: string; degree: number }>> {
    return this.queryEngine.getNodeCentrality(limit);
  }

  /**
   * Find semantically similar nodes using embeddings
   */
  async findSimilar(
    text: string,
    options?: { nodeTypes?: NodeType[]; limit?: number; threshold?: number }
  ): Promise<Array<{ node: GraphNode; similarity: number }>> {
    return this.queryEngine.findSimilar(text, options);
  }

  /**
   * Perform DFS traversal from a starting node
   */
  async dfs(
    startNodeId: string,
    options?: { maxDepth?: number; nodeTypes?: NodeType[]; edgeTypes?: string[] }
  ): Promise<GraphNode[]> {
    return this.queryEngine.dfs(startNodeId, options);
  }

  // ============================================================================
  // Visualization Operations
  // ============================================================================

  /**
   * Generate visualization data for the full graph
   */
  async getVisualization(options?: VisualizationOptions): Promise<VisualizationData> {
    return this.visualizer.generateVisualization(options);
  }

  /**
   * Generate visualization for a subgraph around a node
   */
  async getSubgraphVisualization(
    centerNodeId: string,
    depth?: number,
    options?: VisualizationOptions
  ): Promise<VisualizationData> {
    return this.visualizer.generateSubgraphVisualization(centerNodeId, depth, options);
  }

  /**
   * Generate filtered visualization by node types
   */
  async getFilteredVisualization(
    nodeTypes: NodeType[],
    options?: VisualizationOptions
  ): Promise<VisualizationData> {
    return this.visualizer.generateFilteredVisualization(nodeTypes, options);
  }

  /**
   * Export graph data for D3.js
   */
  async exportForD3(): Promise<{
    nodes: Array<{ id: string; name: string; group: string; value: number }>;
    links: Array<{ source: string; target: string; value: number; type: string }>;
  }> {
    return this.visualizer.exportForD3();
  }

  /**
   * Get available node types
   */
  async getAvailableNodeTypes(): Promise<NodeType[]> {
    return this.visualizer.getAvailableNodeTypes();
  }

  /**
   * Get available edge types
   */
  async getAvailableEdgeTypes(): Promise<string[]> {
    return this.visualizer.getAvailableEdgeTypes();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

const serviceInstances = new Map<string, KnowledgeGraphService>();

/**
 * Get or create a KnowledgeGraphService instance for an organization
 */
export function getKnowledgeGraphService(organizationId: string): KnowledgeGraphService {
  if (!serviceInstances.has(organizationId)) {
    serviceInstances.set(organizationId, new KnowledgeGraphService(organizationId));
  }
  return serviceInstances.get(organizationId)!;
}

/**
 * Create a new KnowledgeGraphService instance
 */
export function createKnowledgeGraphService(organizationId: string): KnowledgeGraphService {
  return new KnowledgeGraphService(organizationId);
}
