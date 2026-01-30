/**
 * Graph Query Engine
 * Provides query capabilities for the knowledge graph including BFS/DFS traversal and similarity search
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import { getEmbeddingService } from "../rag/embeddings";
import {
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  GraphQueryOptions,
  PathQueryOptions,
  PathResult,
  RelatedNodesResult,
  NaturalLanguageQueryResult,
  GraphStats,
  NodeCentrality,
} from "./types";

export class GraphQueryEngine {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Find shortest path between two nodes using BFS
   */
  async findPath(
    fromId: string,
    toId: string,
    options: PathQueryOptions = {}
  ): Promise<PathResult> {
    logger.info("Finding path between nodes", {
      organizationId: this.organizationId,
      fromId,
      toId,
      options,
    });

    try {
      const maxDepth = options.maxDepth || 10;
      const edgeTypes = options.edgeTypes;

      // Get all nodes and edges for the organization
      const [allNodes, allEdges] = await Promise.all([
        db.knowledgeNode.findMany({
          where: { organizationId: this.organizationId },
        }),
        db.knowledgeEdge.findMany({
          where: {
            organizationId: this.organizationId,
            ...(edgeTypes && { relationshipType: { in: edgeTypes } }),
          },
        }),
      ]);

      // Build adjacency list
      const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string; weight: number }>>();
      for (const edge of allEdges) {
        // Add forward direction
        if (!adjacency.has(edge.sourceNodeId)) {
          adjacency.set(edge.sourceNodeId, []);
        }
        adjacency.get(edge.sourceNodeId)!.push({
          nodeId: edge.targetNodeId,
          edgeId: edge.id,
          weight: edge.weight,
        });

        // Add reverse direction (undirected graph for path finding)
        if (!adjacency.has(edge.targetNodeId)) {
          adjacency.set(edge.targetNodeId, []);
        }
        adjacency.get(edge.targetNodeId)!.push({
          nodeId: edge.sourceNodeId,
          edgeId: edge.id,
          weight: edge.weight,
        });
      }

      // BFS/Dijkstra for path finding
      interface QueueItem {
        nodeId: string;
        path: string[];
        edgeIds: string[];
        distance: number;
      }

      const visited = new Set<string>();
      const queue: QueueItem[] = [{ nodeId: fromId, path: [fromId], edgeIds: [], distance: 0 }];

      while (queue.length > 0) {
        // Sort by distance for weighted path finding
        if (options.weighted) {
          queue.sort((a, b) => a.distance - b.distance);
        }

        const current = queue.shift()!;

        if (current.nodeId === toId) {
          // Found the path
          const pathNodes = current.path
            .map((id) => allNodes.find((n) => n.id === id))
            .filter(Boolean)
            .map((n) => this.dbNodeToGraphNode(n!));

          const pathEdges = current.edgeIds
            .map((id) => allEdges.find((e) => e.id === id))
            .filter(Boolean)
            .map((e) => this.dbEdgeToGraphEdge(e!));

          return {
            path: pathNodes,
            edges: pathEdges,
            distance: options.weighted ? current.distance : current.path.length - 1,
            found: true,
          };
        }

        if (visited.has(current.nodeId)) {
          continue;
        }
        visited.add(current.nodeId);

        if (current.path.length > maxDepth) {
          continue;
        }

        const neighbors = adjacency.get(current.nodeId) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.nodeId)) {
            queue.push({
              nodeId: neighbor.nodeId,
              path: [...current.path, neighbor.nodeId],
              edgeIds: [...current.edgeIds, neighbor.edgeId],
              distance: current.distance + (options.weighted ? neighbor.weight : 1),
            });
          }
        }
      }

      // No path found
      return { path: [], edges: [], distance: -1, found: false };
    } catch (error) {
      logger.error(
        "Failed to find path",
        { organizationId: this.organizationId, fromId, toId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Find related nodes within a certain depth using BFS
   */
  async findRelated(
    nodeId: string,
    depth: number = 2,
    options: GraphQueryOptions = {}
  ): Promise<RelatedNodesResult> {
    logger.info("Finding related nodes", {
      organizationId: this.organizationId,
      nodeId,
      depth,
      options,
    });

    try {
      // Get the starting node
      const startNode = await db.knowledgeNode.findFirst({
        where: { id: nodeId, organizationId: this.organizationId },
      });

      if (!startNode) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // Get all edges
      const allEdges = await db.knowledgeEdge.findMany({
        where: {
          organizationId: this.organizationId,
          ...(options.edgeTypes && { relationshipType: { in: options.edgeTypes } }),
        },
      });

      // Build adjacency list
      const adjacency = new Map<string, Array<{ nodeId: string; edge: typeof allEdges[0] }>>();
      for (const edge of allEdges) {
        if (!adjacency.has(edge.sourceNodeId)) {
          adjacency.set(edge.sourceNodeId, []);
        }
        adjacency.get(edge.sourceNodeId)!.push({ nodeId: edge.targetNodeId, edge });

        if (!adjacency.has(edge.targetNodeId)) {
          adjacency.set(edge.targetNodeId, []);
        }
        adjacency.get(edge.targetNodeId)!.push({ nodeId: edge.sourceNodeId, edge });
      }

      // BFS to find related nodes
      const related: Array<{ nodeId: string; edgeId: string; depth: number }> = [];
      const visited = new Set<string>([nodeId]);
      const queue: Array<{ id: string; currentDepth: number }> = [{ id: nodeId, currentDepth: 0 }];

      while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.currentDepth >= depth) {
          continue;
        }

        const neighbors = adjacency.get(current.id) || [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.nodeId)) {
            visited.add(neighbor.nodeId);
            related.push({
              nodeId: neighbor.nodeId,
              edgeId: neighbor.edge.id,
              depth: current.currentDepth + 1,
            });
            queue.push({ id: neighbor.nodeId, currentDepth: current.currentDepth + 1 });
          }
        }
      }

      // Apply limit
      const limitedRelated = options.limit ? related.slice(0, options.limit) : related;

      // Fetch full node and edge data
      const relatedNodeIds = limitedRelated.map((r) => r.nodeId);
      const relatedEdgeIds = limitedRelated.map((r) => r.edgeId);

      const [relatedNodes, relatedEdges] = await Promise.all([
        db.knowledgeNode.findMany({
          where: {
            id: { in: relatedNodeIds },
            ...(options.nodeTypes && { type: { in: options.nodeTypes } }),
          },
        }),
        db.knowledgeEdge.findMany({
          where: { id: { in: relatedEdgeIds } },
        }),
      ]);

      // Build result
      const nodeMap = new Map(relatedNodes.map((n) => [n.id, n]));
      const edgeMap = new Map(relatedEdges.map((e) => [e.id, e]));

      return {
        node: this.dbNodeToGraphNode(startNode),
        related: limitedRelated
          .filter((r) => nodeMap.has(r.nodeId) && edgeMap.has(r.edgeId))
          .map((r) => ({
            node: this.dbNodeToGraphNode(nodeMap.get(r.nodeId)!),
            edge: this.dbEdgeToGraphEdge(edgeMap.get(r.edgeId)!),
            depth: r.depth,
          })),
      };
    } catch (error) {
      logger.error(
        "Failed to find related nodes",
        { organizationId: this.organizationId, nodeId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Find nodes by relationship type
   */
  async findByRelationship(
    type: string,
    options: GraphQueryOptions = {}
  ): Promise<Array<{ node: GraphNode; related: GraphNode[] }>> {
    logger.info("Finding nodes by relationship", {
      organizationId: this.organizationId,
      type,
      options,
    });

    try {
      // Get all edges of this type
      const edges = await db.knowledgeEdge.findMany({
        where: {
          organizationId: this.organizationId,
          relationshipType: type,
        },
        take: options.limit || 100,
      });

      // Get all unique node IDs
      const nodeIds = new Set<string>();
      for (const edge of edges) {
        nodeIds.add(edge.sourceNodeId);
        nodeIds.add(edge.targetNodeId);
      }

      // Fetch all nodes
      const nodes = await db.knowledgeNode.findMany({
        where: {
          id: { in: Array.from(nodeIds) },
          ...(options.nodeTypes && { type: { in: options.nodeTypes } }),
        },
      });

      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      // Group by source node
      const result = new Map<string, { node: GraphNode; related: GraphNode[] }>();

      for (const edge of edges) {
        const sourceNode = nodeMap.get(edge.sourceNodeId);
        const targetNode = nodeMap.get(edge.targetNodeId);

        if (!sourceNode || !targetNode) continue;

        if (!result.has(edge.sourceNodeId)) {
          result.set(edge.sourceNodeId, {
            node: this.dbNodeToGraphNode(sourceNode),
            related: [],
          });
        }

        result.get(edge.sourceNodeId)!.related.push(this.dbNodeToGraphNode(targetNode));
      }

      return Array.from(result.values());
    } catch (error) {
      logger.error(
        "Failed to find by relationship",
        { organizationId: this.organizationId, type },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Search nodes by label or properties with optional semantic search
   */
  async searchNodes(
    searchTerm: string,
    options: GraphQueryOptions = {}
  ): Promise<GraphNode[]> {
    logger.info("Searching nodes", {
      organizationId: this.organizationId,
      searchTerm,
      options,
    });

    try {
      // Text-based search
      const nodes = await db.knowledgeNode.findMany({
        where: {
          organizationId: this.organizationId,
          ...(options.nodeTypes && { type: { in: options.nodeTypes } }),
          OR: [
            { name: { contains: searchTerm, mode: "insensitive" } },
            { description: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
        take: options.limit || 50,
      });

      return nodes.map((n) => this.dbNodeToGraphNode(n));
    } catch (error) {
      logger.error(
        "Failed to search nodes",
        { organizationId: this.organizationId, searchTerm },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Semantic similarity search using embeddings
   */
  async findSimilar(
    text: string,
    options: { nodeTypes?: NodeType[]; limit?: number; threshold?: number } = {}
  ): Promise<Array<{ node: GraphNode; similarity: number }>> {
    logger.info("Finding similar nodes", {
      organizationId: this.organizationId,
      text: text.substring(0, 50),
      options,
    });

    try {
      const embeddingService = getEmbeddingService();
      const queryEmbedding = await embeddingService.embed(text);

      // Get all nodes with embeddings - fetch all and filter in memory
      // Prisma doesn't support NOT NULL filter on Json fields directly
      const allNodes = await db.knowledgeNode.findMany({
        where: {
          organizationId: this.organizationId,
          ...(options.nodeTypes && { type: { in: options.nodeTypes } }),
        },
      });

      // Filter to only nodes with embeddings
      const nodes = allNodes.filter((node) => node.embedding !== null);

      // Calculate cosine similarity for each node
      const threshold = options.threshold ?? 0.5;
      const results: Array<{ node: GraphNode; similarity: number }> = [];

      for (const node of nodes) {
        const nodeEmbedding = node.embedding as number[] | null;
        if (!nodeEmbedding) continue;

        const similarity = this.cosineSimilarity(queryEmbedding, nodeEmbedding);
        if (similarity >= threshold) {
          results.push({
            node: this.dbNodeToGraphNode(node),
            similarity,
          });
        }
      }

      // Sort by similarity descending and limit
      results.sort((a, b) => b.similarity - a.similarity);
      return results.slice(0, options.limit || 10);
    } catch (error) {
      logger.error(
        "Failed to find similar nodes",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Natural language query (simple keyword-based implementation)
   */
  async query(question: string): Promise<NaturalLanguageQueryResult> {
    logger.info("Processing natural language query", {
      organizationId: this.organizationId,
      question,
    });

    try {
      // Parse question for keywords
      const keywords = question
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .filter((w) => !["the", "and", "for", "are", "what", "who", "how", "where", "when"].includes(w));

      // Search for matching nodes
      const matchingNodes: GraphNode[] = [];
      for (const keyword of keywords.slice(0, 3)) {
        const nodes = await this.searchNodes(keyword, { limit: 5 });
        matchingNodes.push(...nodes);
      }

      // Deduplicate
      const uniqueNodes = Array.from(
        new Map(matchingNodes.map((n) => [n.id, n])).values()
      );

      // Get edges between matching nodes
      const nodeIds = uniqueNodes.map((n) => n.id);
      const edges = await db.knowledgeEdge.findMany({
        where: {
          organizationId: this.organizationId,
          AND: [
            { sourceNodeId: { in: nodeIds } },
            { targetNodeId: { in: nodeIds } },
          ],
        },
      });

      // Generate a simple answer
      let answer = "No relevant information found.";
      let confidence = 0;

      if (uniqueNodes.length > 0) {
        const nodeLabels = uniqueNodes.slice(0, 5).map((n) => n.label);
        answer = `Found ${uniqueNodes.length} related items: ${nodeLabels.join(", ")}`;
        confidence = Math.min(1, uniqueNodes.length / 10);
      }

      return {
        answer,
        nodes: uniqueNodes.slice(0, 10),
        edges: edges.map((e) => this.dbEdgeToGraphEdge(e)),
        confidence,
        interpretation: `Searched for keywords: ${keywords.join(", ")}`,
      };
    } catch (error) {
      logger.error(
        "Failed to process query",
        { organizationId: this.organizationId, question },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Get graph statistics
   */
  async getStats(): Promise<GraphStats> {
    logger.info("Getting graph statistics", {
      organizationId: this.organizationId,
    });

    try {
      const [nodes, edges] = await Promise.all([
        db.knowledgeNode.findMany({
          where: { organizationId: this.organizationId },
          select: { id: true, type: true },
        }),
        db.knowledgeEdge.findMany({
          where: { organizationId: this.organizationId },
          select: { id: true, sourceNodeId: true, targetNodeId: true, relationshipType: true },
        }),
      ]);

      // Count nodes by type
      const nodesByType: Record<NodeType, number> = {
        person: 0,
        project: 0,
        document: 0,
        agent: 0,
        team: 0,
        task: 0,
        goal: 0,
        workflow: 0,
      };
      for (const node of nodes) {
        const type = node.type as NodeType;
        if (type in nodesByType) {
          nodesByType[type]++;
        }
      }

      // Count edges by type
      const edgesByType: Record<string, number> = {};
      for (const edge of edges) {
        edgesByType[edge.relationshipType] = (edgesByType[edge.relationshipType] || 0) + 1;
      }

      // Calculate graph density
      const nodeCount = nodes.length;
      const edgeCount = edges.length;
      const maxEdges = nodeCount * (nodeCount - 1) / 2;
      const density = maxEdges > 0 ? edgeCount / maxEdges : 0;

      // Calculate average degree
      const averageDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

      // Count connected components using union-find
      const components = this.countComponents(nodes.map((n) => n.id), edges);

      return {
        nodeCount,
        edgeCount,
        density,
        averageDegree,
        nodesByType,
        edgesByType,
        components,
      };
    } catch (error) {
      logger.error(
        "Failed to get graph stats",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Calculate node centrality (degree centrality)
   */
  async getNodeCentrality(limit: number = 10): Promise<NodeCentrality[]> {
    logger.info("Calculating node centrality", {
      organizationId: this.organizationId,
      limit,
    });

    try {
      const [nodes, edges] = await Promise.all([
        db.knowledgeNode.findMany({
          where: { organizationId: this.organizationId },
        }),
        db.knowledgeEdge.findMany({
          where: { organizationId: this.organizationId },
        }),
      ]);

      // Calculate degree for each node
      const degrees = new Map<string, number>();
      for (const node of nodes) {
        degrees.set(node.id, 0);
      }

      for (const edge of edges) {
        degrees.set(edge.sourceNodeId, (degrees.get(edge.sourceNodeId) || 0) + 1);
        degrees.set(edge.targetNodeId, (degrees.get(edge.targetNodeId) || 0) + 1);
      }

      // Sort by degree and return top nodes
      const sorted = Array.from(degrees.entries())
        .map(([nodeId, degree]) => ({ nodeId, degree }))
        .sort((a, b) => b.degree - a.degree)
        .slice(0, limit);

      return sorted;
    } catch (error) {
      logger.error(
        "Failed to calculate centrality",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Perform DFS traversal from a starting node
   */
  async dfs(
    startNodeId: string,
    options: { maxDepth?: number; nodeTypes?: NodeType[]; edgeTypes?: string[] } = {}
  ): Promise<GraphNode[]> {
    logger.info("Performing DFS traversal", {
      organizationId: this.organizationId,
      startNodeId,
      options,
    });

    try {
      const maxDepth = options.maxDepth || 10;

      // Get all edges
      const allEdges = await db.knowledgeEdge.findMany({
        where: {
          organizationId: this.organizationId,
          ...(options.edgeTypes && { relationshipType: { in: options.edgeTypes } }),
        },
      });

      // Build adjacency list
      const adjacency = new Map<string, string[]>();
      for (const edge of allEdges) {
        if (!adjacency.has(edge.sourceNodeId)) {
          adjacency.set(edge.sourceNodeId, []);
        }
        adjacency.get(edge.sourceNodeId)!.push(edge.targetNodeId);

        if (!adjacency.has(edge.targetNodeId)) {
          adjacency.set(edge.targetNodeId, []);
        }
        adjacency.get(edge.targetNodeId)!.push(edge.sourceNodeId);
      }

      // DFS
      const visited = new Set<string>();
      const result: string[] = [];

      const dfsRecursive = (nodeId: string, depth: number) => {
        if (visited.has(nodeId) || depth > maxDepth) {
          return;
        }
        visited.add(nodeId);
        result.push(nodeId);

        const neighbors = adjacency.get(nodeId) || [];
        for (const neighbor of neighbors) {
          dfsRecursive(neighbor, depth + 1);
        }
      };

      dfsRecursive(startNodeId, 0);

      // Fetch full node data
      const nodes = await db.knowledgeNode.findMany({
        where: {
          id: { in: result },
          ...(options.nodeTypes && { type: { in: options.nodeTypes } }),
        },
      });

      // Maintain DFS order
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      return result
        .filter((id) => nodeMap.has(id))
        .map((id) => this.dbNodeToGraphNode(nodeMap.get(id)!));
    } catch (error) {
      logger.error(
        "Failed to perform DFS",
        { organizationId: this.organizationId, startNodeId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  private countComponents(
    nodeIds: string[],
    edges: Array<{ sourceNodeId: string; targetNodeId: string }>
  ): number {
    // Union-Find implementation
    const parent = new Map<string, string>();
    const rank = new Map<string, number>();

    const find = (x: string): string => {
      if (!parent.has(x)) {
        parent.set(x, x);
        rank.set(x, 0);
      }
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    };

    const union = (x: string, y: string) => {
      const rootX = find(x);
      const rootY = find(y);

      if (rootX !== rootY) {
        const rankX = rank.get(rootX) || 0;
        const rankY = rank.get(rootY) || 0;

        if (rankX < rankY) {
          parent.set(rootX, rootY);
        } else if (rankX > rankY) {
          parent.set(rootY, rootX);
        } else {
          parent.set(rootY, rootX);
          rank.set(rootX, rankX + 1);
        }
      }
    };

    // Initialize all nodes
    for (const nodeId of nodeIds) {
      find(nodeId);
    }

    // Union connected nodes
    for (const edge of edges) {
      union(edge.sourceNodeId, edge.targetNodeId);
    }

    // Count unique roots
    const roots = new Set<string>();
    for (const nodeId of nodeIds) {
      roots.add(find(nodeId));
    }

    return roots.size;
  }

  private dbNodeToGraphNode(dbNode: {
    id: string;
    organizationId: string;
    type: string;
    name: string;
    description: string | null;
    metadata: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): GraphNode {
    const metadata = (dbNode.metadata as Record<string, unknown>) || {};
    return {
      id: dbNode.id,
      type: dbNode.type as NodeType,
      label: dbNode.name,
      properties: {
        description: dbNode.description,
        ...metadata,
      },
      createdAt: dbNode.createdAt,
      updatedAt: dbNode.updatedAt,
    };
  }

  private dbEdgeToGraphEdge(dbEdge: {
    id: string;
    organizationId: string;
    sourceNodeId: string;
    targetNodeId: string;
    relationshipType: string;
    weight: number;
    metadata: unknown;
    createdAt: Date;
  }): GraphEdge {
    const metadata = (dbEdge.metadata as Record<string, unknown>) || {};
    return {
      id: dbEdge.id,
      source: dbEdge.sourceNodeId,
      target: dbEdge.targetNodeId,
      type: dbEdge.relationshipType as EdgeType,
      weight: dbEdge.weight,
      properties: metadata,
      createdAt: dbEdge.createdAt,
    };
  }
}

/**
 * Factory function to create a GraphQueryEngine
 */
export function createGraphQueryEngine(organizationId: string): GraphQueryEngine {
  return new GraphQueryEngine(organizationId);
}
