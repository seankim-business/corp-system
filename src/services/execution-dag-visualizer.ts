/**
 * Execution DAG Visualizer Service
 *
 * Tracks agent execution as a directed acyclic graph (DAG) with parent-child
 * delegation relationships, execution times, and statuses.
 *
 * Supports multiple export formats:
 * - DOT format (Graphviz)
 * - D3.js compatible JSON
 * - ASCII tree visualization
 *
 * Related: #095 - Agent execution DAG visualizer
 */

import { logger } from "../utils/logger";

export type ExecutionStatus = "pending" | "running" | "completed" | "failed";

export interface ExecutionNode {
  id: string;
  agentType: string;
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  parentId?: string;
  children: string[];
  metadata?: Record<string, unknown>;
}

export interface D3Node {
  id: string;
  agentType: string;
  status: ExecutionStatus;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface D3Link {
  source: string;
  target: string;
  type: "delegation";
}

export interface D3Graph {
  nodes: D3Node[];
  links: D3Link[];
}

/**
 * ExecutionDAGVisualizer
 *
 * Tracks agent execution flow as a DAG and provides multiple export formats
 * for visualization.
 */
export class ExecutionDAGVisualizer {
  private nodes: Map<string, ExecutionNode>;
  private rootNodes: Set<string>;

  constructor() {
    this.nodes = new Map();
    this.rootNodes = new Set();
    logger.debug("ExecutionDAGVisualizer initialized");
  }

  /**
   * Add a new execution node to the DAG
   */
  addNode(node: ExecutionNode): void {
    // Validate node
    if (!node.id || !node.agentType) {
      logger.warn("Invalid node: missing id or agentType", { node });
      throw new Error("Node must have id and agentType");
    }

    // Check for duplicate ID
    if (this.nodes.has(node.id)) {
      logger.warn("Node with this ID already exists", { nodeId: node.id });
      throw new Error(`Node with id ${node.id} already exists`);
    }

    // Initialize children array if not provided
    if (!node.children) {
      node.children = [];
    }

    this.nodes.set(node.id, { ...node });

    // Update parent's children array if parent exists
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        if (!parent.children.includes(node.id)) {
          parent.children.push(node.id);
        }
      } else {
        logger.warn("Parent node not found", {
          childId: node.id,
          parentId: node.parentId,
        });
      }
    } else {
      // No parent means this is a root node
      this.rootNodes.add(node.id);
    }

    logger.debug("Added node to DAG", {
      nodeId: node.id,
      agentType: node.agentType,
      parentId: node.parentId,
      status: node.status,
    });
  }

  /**
   * Update an existing node with partial updates
   */
  updateNode(nodeId: string, updates: Partial<ExecutionNode>): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      logger.warn("Cannot update: node not found", { nodeId });
      throw new Error(`Node with id ${nodeId} not found`);
    }

    // Prevent changing immutable fields
    const { id, agentType, parentId, ...allowedUpdates } = updates;
    if (id || agentType || parentId !== undefined) {
      logger.warn("Attempted to update immutable fields", {
        nodeId,
        updates,
      });
    }

    // Apply updates
    Object.assign(node, allowedUpdates);

    logger.debug("Updated node in DAG", {
      nodeId,
      updates: allowedUpdates,
    });
  }

  /**
   * Get the entire graph as an array of nodes
   */
  getGraph(): ExecutionNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get a specific node by ID
   */
  getNode(nodeId: string): ExecutionNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all root nodes (nodes without parents)
   */
  getRootNodes(): ExecutionNode[] {
    return Array.from(this.rootNodes).map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * Get all children of a node
   */
  getChildren(nodeId: string): ExecutionNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    return node.children.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /**
   * Clear all nodes from the DAG
   */
  clear(): void {
    this.nodes.clear();
    this.rootNodes.clear();
    logger.debug("Cleared DAG");
  }

  /**
   * Export the DAG as DOT format for Graphviz
   */
  exportAsDot(): string {
    const lines: string[] = [];
    lines.push("digraph ExecutionDAG {");
    lines.push("  rankdir=TB;");
    lines.push("  node [shape=box, style=rounded];");
    lines.push("");

    // Define nodes with styling based on status
    for (const node of this.nodes.values()) {
      const color = this.getStatusColor(node.status);
      const duration = this.calculateDuration(node);
      const durationLabel = duration ? ` (${duration}ms)` : "";
      const label = `${node.agentType}\\n${node.status}${durationLabel}`;

      lines.push(`  "${node.id}" [label="${label}", color="${color}", penwidth=2];`);
    }

    lines.push("");

    // Define edges (parent -> child relationships)
    for (const node of this.nodes.values()) {
      for (const childId of node.children) {
        lines.push(`  "${node.id}" -> "${childId}";`);
      }
    }

    lines.push("}");

    logger.debug("Exported DAG as DOT format", {
      nodeCount: this.nodes.size,
      lines: lines.length,
    });

    return lines.join("\n");
  }

  /**
   * Export the DAG as D3.js compatible JSON
   */
  exportAsD3Json(): D3Graph {
    const nodes: D3Node[] = [];
    const links: D3Link[] = [];

    // Convert nodes
    for (const node of this.nodes.values()) {
      nodes.push({
        id: node.id,
        agentType: node.agentType,
        status: node.status,
        duration: this.calculateDuration(node),
        metadata: node.metadata,
      });
    }

    // Convert edges
    for (const node of this.nodes.values()) {
      for (const childId of node.children) {
        links.push({
          source: node.id,
          target: childId,
          type: "delegation",
        });
      }
    }

    logger.debug("Exported DAG as D3 JSON", {
      nodeCount: nodes.length,
      linkCount: links.length,
    });

    return { nodes, links };
  }

  /**
   * Export the DAG as ASCII tree visualization
   */
  exportAsAsciiTree(rootId?: string): string {
    const lines: string[] = [];

    // If rootId specified, start from that node
    if (rootId) {
      const rootNode = this.nodes.get(rootId);
      if (!rootNode) {
        logger.warn("Root node not found for ASCII export", { rootId });
        return `Root node ${rootId} not found`;
      }
      this.buildAsciiTree(rootNode, "", true, lines);
    } else {
      // Otherwise, render all root nodes
      const roots = this.getRootNodes();
      if (roots.length === 0) {
        return "No nodes in graph";
      }

      roots.forEach((root, index) => {
        const isLast = index === roots.length - 1;
        this.buildAsciiTree(root, "", isLast, lines);
      });
    }

    logger.debug("Exported DAG as ASCII tree", {
      rootId,
      lines: lines.length,
    });

    return lines.join("\n");
  }

  /**
   * Get execution statistics
   */
  getStatistics(): {
    totalNodes: number;
    rootNodes: number;
    statusCounts: Record<ExecutionStatus, number>;
    avgDuration: number | null;
    maxDepth: number;
  } {
    const statusCounts: Record<ExecutionStatus, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    let totalDuration = 0;
    let completedCount = 0;

    for (const node of this.nodes.values()) {
      statusCounts[node.status]++;

      const duration = this.calculateDuration(node);
      if (duration !== undefined) {
        totalDuration += duration;
        completedCount++;
      }
    }

    const avgDuration = completedCount > 0 ? totalDuration / completedCount : null;
    const maxDepth = this.calculateMaxDepth();

    return {
      totalNodes: this.nodes.size,
      rootNodes: this.rootNodes.size,
      statusCounts,
      avgDuration,
      maxDepth,
    };
  }

  /**
   * Validate DAG structure (check for cycles)
   */
  validateDag(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) {
        errors.push(`Node ${nodeId} referenced but not found`);
        return false;
      }

      for (const childId of node.children) {
        if (!visited.has(childId)) {
          if (hasCycle(childId)) {
            return true;
          }
        } else if (recStack.has(childId)) {
          errors.push(`Cycle detected: ${nodeId} -> ${childId}`);
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    // Check each root node
    for (const rootId of this.rootNodes) {
      if (hasCycle(rootId)) {
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Private helper methods

  private calculateDuration(node: ExecutionNode): number | undefined {
    if (node.startedAt && node.completedAt) {
      return node.completedAt.getTime() - node.startedAt.getTime();
    }
    return undefined;
  }

  private getStatusColor(status: ExecutionStatus): string {
    const colors: Record<ExecutionStatus, string> = {
      pending: "gray",
      running: "blue",
      completed: "green",
      failed: "red",
    };
    return colors[status];
  }

  private buildAsciiTree(
    node: ExecutionNode,
    prefix: string,
    isLast: boolean,
    lines: string[],
  ): void {
    const connector = isLast ? "└── " : "├── ";
    const duration = this.calculateDuration(node);
    const durationStr = duration ? ` (${duration}ms)` : "";
    const statusIcon = this.getStatusIcon(node.status);

    lines.push(`${prefix}${connector}${statusIcon} ${node.agentType} [${node.status}]${durationStr}`);

    const children = this.getChildren(node.id);
    const newPrefix = prefix + (isLast ? "    " : "│   ");

    children.forEach((child, index) => {
      const childIsLast = index === children.length - 1;
      this.buildAsciiTree(child, newPrefix, childIsLast, lines);
    });
  }

  private getStatusIcon(status: ExecutionStatus): string {
    const icons: Record<ExecutionStatus, string> = {
      pending: "○",
      running: "◐",
      completed: "●",
      failed: "✗",
    };
    return icons[status];
  }

  private calculateMaxDepth(): number {
    const getDepth = (nodeId: string, currentDepth: number): number => {
      const node = this.nodes.get(nodeId);
      if (!node || node.children.length === 0) {
        return currentDepth;
      }

      const childDepths = node.children.map((childId) => getDepth(childId, currentDepth + 1));
      return Math.max(...childDepths);
    };

    if (this.rootNodes.size === 0) return 0;

    const depths = Array.from(this.rootNodes).map((rootId) => getDepth(rootId, 1));
    return Math.max(...depths);
  }
}

/**
 * Create a singleton instance for global access
 */
export const dagVisualizer = new ExecutionDAGVisualizer();
