/**
 * Graph Visualizer
 * Generates visualization data for the knowledge graph (vis.js / D3.js compatible)
 */

import { db } from "../../db/client";
import { logger } from "../../utils/logger";
import {
  NodeType,
  VisNode,
  VisEdge,
  VisualizationData,
  VisualizationOptions,
} from "./types";

// Default color scheme for node types
const DEFAULT_NODE_COLORS: Record<NodeType, string> = {
  person: "#4CAF50", // Green
  agent: "#2196F3", // Blue
  team: "#9C27B0", // Purple
  project: "#FF9800", // Orange
  task: "#FFEB3B", // Yellow
  document: "#795548", // Brown
  goal: "#E91E63", // Pink
  workflow: "#00BCD4", // Cyan
};

// Default edge colors by type
const DEFAULT_EDGE_COLORS: Record<string, string> = {
  works_with: "#81C784",
  works_on: "#64B5F6",
  owns: "#BA68C8",
  references: "#A1887F",
  delegates_to: "#4FC3F7",
  collaborates_with: "#7986CB",
  member_of: "#CE93D8",
  manages: "#F48FB1",
  depends_on: "#FFB74D",
  related_to: "#90A4AE",
  parent_of: "#A5D6A7",
  child_of: "#B39DDB",
  assigned_to: "#FFF176",
  created_by: "#BCAAA4",
  contributes_to: "#80DEEA",
};

// Node shapes by type
const NODE_SHAPES: Record<NodeType, string> = {
  person: "circularImage",
  agent: "hexagon",
  team: "diamond",
  project: "box",
  task: "ellipse",
  document: "square",
  goal: "star",
  workflow: "triangle",
};

export class GraphVisualizer {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Generate visualization data for vis.js / vis-network
   */
  async generateVisualization(
    options: VisualizationOptions = {}
  ): Promise<VisualizationData> {
    logger.info("Generating visualization data", {
      organizationId: this.organizationId,
      options,
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

      const colorScheme = options.colorScheme || DEFAULT_NODE_COLORS;
      const edgeColors = options.edgeColors || DEFAULT_EDGE_COLORS;

      const visNodes: VisNode[] = nodes.map((node) => {
        const type = node.type as NodeType;
        const metadata = node.metadata as Record<string, unknown> || {};

        return {
          id: node.id,
          label: options.showLabels !== false ? node.name : "",
          group: type,
          title: this.generateNodeTooltip(node),
          color: colorScheme[type] || "#90A4AE",
          size: this.calculateNodeSize(type, edges, node.id),
          shape: NODE_SHAPES[type] || "dot",
          font: {
            size: 12,
            color: "#333333",
          },
          ...((metadata.x !== undefined && metadata.y !== undefined) && {
            x: metadata.x as number,
            y: metadata.y as number,
          }),
        };
      });

      const visEdges: VisEdge[] = edges.map((edge) => ({
        id: edge.id,
        from: edge.sourceNodeId,
        to: edge.targetNodeId,
        label: options.showWeights ? edge.weight.toFixed(2) : undefined,
        title: this.generateEdgeTooltip(edge),
        color: edgeColors[edge.relationshipType] || "#90A4AE",
        width: Math.max(1, edge.weight * 3),
        dashes: this.isInferredEdge(edge),
        arrows: { to: { enabled: true } },
      }));

      return { nodes: visNodes, edges: visEdges };
    } catch (error) {
      logger.error(
        "Failed to generate visualization",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Generate visualization for a subgraph (related to a specific node)
   */
  async generateSubgraphVisualization(
    centerNodeId: string,
    depth: number = 2,
    options: VisualizationOptions = {}
  ): Promise<VisualizationData> {
    logger.info("Generating subgraph visualization", {
      organizationId: this.organizationId,
      centerNodeId,
      depth,
      options,
    });

    try {
      // Get all edges
      const allEdges = await db.knowledgeEdge.findMany({
        where: { organizationId: this.organizationId },
      });

      // Build adjacency list
      const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string }>>();
      for (const edge of allEdges) {
        if (!adjacency.has(edge.sourceNodeId)) {
          adjacency.set(edge.sourceNodeId, []);
        }
        adjacency.get(edge.sourceNodeId)!.push({
          nodeId: edge.targetNodeId,
          edgeId: edge.id,
        });

        if (!adjacency.has(edge.targetNodeId)) {
          adjacency.set(edge.targetNodeId, []);
        }
        adjacency.get(edge.targetNodeId)!.push({
          nodeId: edge.sourceNodeId,
          edgeId: edge.id,
        });
      }

      // BFS to find nodes within depth
      const nodeIds = new Set<string>([centerNodeId]);
      const edgeIds = new Set<string>();
      const queue: Array<{ id: string; currentDepth: number }> = [
        { id: centerNodeId, currentDepth: 0 },
      ];

      while (queue.length > 0) {
        const current = queue.shift()!;

        if (current.currentDepth >= depth) {
          continue;
        }

        const neighbors = adjacency.get(current.id) || [];
        for (const neighbor of neighbors) {
          edgeIds.add(neighbor.edgeId);
          if (!nodeIds.has(neighbor.nodeId)) {
            nodeIds.add(neighbor.nodeId);
            queue.push({ id: neighbor.nodeId, currentDepth: current.currentDepth + 1 });
          }
        }
      }

      // Fetch nodes and edges
      const [nodes, edges] = await Promise.all([
        db.knowledgeNode.findMany({
          where: { id: { in: Array.from(nodeIds) } },
        }),
        db.knowledgeEdge.findMany({
          where: { id: { in: Array.from(edgeIds) } },
        }),
      ]);

      const colorScheme = options.colorScheme || DEFAULT_NODE_COLORS;
      const edgeColors = options.edgeColors || DEFAULT_EDGE_COLORS;

      const visNodes: VisNode[] = nodes.map((node) => {
        const type = node.type as NodeType;
        const isCenter = node.id === centerNodeId;

        return {
          id: node.id,
          label: options.showLabels !== false ? node.name : "",
          group: type,
          title: this.generateNodeTooltip(node),
          color: isCenter
            ? { background: colorScheme[type] || "#90A4AE", border: "#000000" }
            : colorScheme[type] || "#90A4AE",
          size: isCenter
            ? this.calculateNodeSize(type, edges, node.id) * 1.5
            : this.calculateNodeSize(type, edges, node.id),
          shape: NODE_SHAPES[type] || "dot",
          font: {
            size: isCenter ? 14 : 12,
            color: "#333333",
          },
        };
      });

      const visEdges: VisEdge[] = edges.map((edge) => ({
        id: edge.id,
        from: edge.sourceNodeId,
        to: edge.targetNodeId,
        label: options.showWeights ? edge.weight.toFixed(2) : undefined,
        title: this.generateEdgeTooltip(edge),
        color: edgeColors[edge.relationshipType] || "#90A4AE",
        width: Math.max(1, edge.weight * 3),
        dashes: this.isInferredEdge(edge),
        arrows: { to: { enabled: true } },
      }));

      return { nodes: visNodes, edges: visEdges };
    } catch (error) {
      logger.error(
        "Failed to generate subgraph visualization",
        { organizationId: this.organizationId, centerNodeId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Generate visualization data filtered by node types
   */
  async generateFilteredVisualization(
    nodeTypes: NodeType[],
    options: VisualizationOptions = {}
  ): Promise<VisualizationData> {
    logger.info("Generating filtered visualization", {
      organizationId: this.organizationId,
      nodeTypes,
      options,
    });

    try {
      const nodes = await db.knowledgeNode.findMany({
        where: {
          organizationId: this.organizationId,
          type: { in: nodeTypes },
        },
      });

      const nodeIds = nodes.map((n) => n.id);

      // Get edges that connect filtered nodes
      const edges = await db.knowledgeEdge.findMany({
        where: {
          organizationId: this.organizationId,
          AND: [
            { sourceNodeId: { in: nodeIds } },
            { targetNodeId: { in: nodeIds } },
          ],
        },
      });

      const colorScheme = options.colorScheme || DEFAULT_NODE_COLORS;
      const edgeColors = options.edgeColors || DEFAULT_EDGE_COLORS;

      const visNodes: VisNode[] = nodes.map((node) => {
        const type = node.type as NodeType;

        return {
          id: node.id,
          label: options.showLabels !== false ? node.name : "",
          group: type,
          title: this.generateNodeTooltip(node),
          color: colorScheme[type] || "#90A4AE",
          size: this.calculateNodeSize(type, edges, node.id),
          shape: NODE_SHAPES[type] || "dot",
          font: {
            size: 12,
            color: "#333333",
          },
        };
      });

      const visEdges: VisEdge[] = edges.map((edge) => ({
        id: edge.id,
        from: edge.sourceNodeId,
        to: edge.targetNodeId,
        label: options.showWeights ? edge.weight.toFixed(2) : undefined,
        title: this.generateEdgeTooltip(edge),
        color: edgeColors[edge.relationshipType] || "#90A4AE",
        width: Math.max(1, edge.weight * 3),
        dashes: this.isInferredEdge(edge),
        arrows: { to: { enabled: true } },
      }));

      return { nodes: visNodes, edges: visEdges };
    } catch (error) {
      logger.error(
        "Failed to generate filtered visualization",
        { organizationId: this.organizationId, nodeTypes },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Get available node types in the graph
   */
  async getAvailableNodeTypes(): Promise<NodeType[]> {
    logger.info("Getting available node types", {
      organizationId: this.organizationId,
    });

    try {
      const nodes = await db.knowledgeNode.findMany({
        where: { organizationId: this.organizationId },
        select: { type: true },
        distinct: ["type"],
      });

      return nodes.map((n) => n.type as NodeType);
    } catch (error) {
      logger.error(
        "Failed to get available node types",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Get available edge types in the graph
   */
  async getAvailableEdgeTypes(): Promise<string[]> {
    logger.info("Getting available edge types", {
      organizationId: this.organizationId,
    });

    try {
      const edges = await db.knowledgeEdge.findMany({
        where: { organizationId: this.organizationId },
        select: { relationshipType: true },
        distinct: ["relationshipType"],
      });

      return edges.map((e) => e.relationshipType);
    } catch (error) {
      logger.error(
        "Failed to get available edge types",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Export graph data for external tools (D3.js format)
   */
  async exportForD3(): Promise<{
    nodes: Array<{ id: string; name: string; group: string; value: number }>;
    links: Array<{ source: string; target: string; value: number; type: string }>;
  }> {
    logger.info("Exporting graph data for D3", {
      organizationId: this.organizationId,
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

      // Calculate node degrees for value
      const degrees = new Map<string, number>();
      for (const node of nodes) {
        degrees.set(node.id, 0);
      }
      for (const edge of edges) {
        degrees.set(edge.sourceNodeId, (degrees.get(edge.sourceNodeId) || 0) + 1);
        degrees.set(edge.targetNodeId, (degrees.get(edge.targetNodeId) || 0) + 1);
      }

      return {
        nodes: nodes.map((node) => ({
          id: node.id,
          name: node.name,
          group: node.type,
          value: degrees.get(node.id) || 1,
        })),
        links: edges.map((edge) => ({
          source: edge.sourceNodeId,
          target: edge.targetNodeId,
          value: edge.weight,
          type: edge.relationshipType,
        })),
      };
    } catch (error) {
      logger.error(
        "Failed to export for D3",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private generateNodeTooltip(node: {
    id: string;
    type: string;
    name: string;
    description: string | null;
    metadata: unknown;
  }): string {
    const props = (node.metadata as Record<string, unknown>) || {};
    let tooltip = `<b>${node.name}</b><br>Type: ${node.type}`;

    if (node.description) {
      tooltip += `<br>${node.description}`;
    }
    if (props.role) {
      tooltip += `<br>Role: ${props.role}`;
    }
    if (props.status) {
      tooltip += `<br>Status: ${props.status}`;
    }
    if (props.email) {
      tooltip += `<br>Email: ${props.email}`;
    }

    return tooltip;
  }

  private generateEdgeTooltip(edge: {
    relationshipType: string;
    weight: number;
    metadata: unknown;
  }): string {
    const props = (edge.metadata as Record<string, unknown>) || {};
    let tooltip = `Relationship: ${edge.relationshipType}<br>Weight: ${edge.weight.toFixed(2)}`;

    if (props.inferred) {
      tooltip += `<br><i>Inferred (confidence: ${((props.confidence as number) * 100).toFixed(0)}%)</i>`;
    }
    if (props.reason) {
      tooltip += `<br>Reason: ${props.reason}`;
    }

    return tooltip;
  }

  private calculateNodeSize(
    nodeType: NodeType,
    edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
    nodeId: string
  ): number {
    const baseSizes: Record<NodeType, number> = {
      person: 15,
      agent: 18,
      team: 22,
      project: 20,
      task: 12,
      document: 12,
      goal: 18,
      workflow: 18,
    };

    const baseSize = baseSizes[nodeType] || 15;
    const degree = this.calculateNodeDegree(edges, nodeId);

    // Scale size based on connections (more connections = larger node)
    return Math.min(baseSize + degree * 2, 40);
  }

  private calculateNodeDegree(
    edges: Array<{ sourceNodeId: string; targetNodeId: string }>,
    nodeId: string
  ): number {
    return edges.filter(
      (e) => e.sourceNodeId === nodeId || e.targetNodeId === nodeId
    ).length;
  }

  private isInferredEdge(edge: { metadata: unknown }): boolean {
    const props = (edge.metadata as Record<string, unknown>) || {};
    return Boolean(props.inferred);
  }
}

/**
 * Factory function to create a GraphVisualizer
 */
export function createGraphVisualizer(organizationId: string): GraphVisualizer {
  return new GraphVisualizer(organizationId);
}
