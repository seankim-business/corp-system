/**
 * Spawn Tree Visualizer
 *
 * Provides visualization and metrics for agent spawn hierarchies.
 * Generates ASCII tree representations for debugging agent orchestration.
 */

import { db as prisma } from "../db/client";
import { logger } from "../utils/logger";

export interface SpawnTreeNode {
  executionId: string;
  agentType: string;
  task: string;
  status: string;
  depth: number;
  duration?: number;
  tokensUsed?: number;
  children: SpawnTreeNode[];
}

export interface TreeMetrics {
  totalNodes: number;
  maxDepth: number;
  totalDuration: number;
  totalTokens: number;
  successRate: number;
  agentTypeCounts: Record<string, number>;
  depthDistribution: Record<number, number>;
}

/**
 * Build a spawn tree from database records
 *
 * @param rootExecutionId - The root execution ID
 * @returns Tree structure with nested children
 */
export async function visualizeSpawnTree(rootExecutionId: string): Promise<SpawnTreeNode> {
  logger.debug("Building spawn tree", { rootExecutionId });

  // Fetch all executions in the tree
  const executions = await prisma.orchestratorExecution.findMany({
    where: {
      OR: [
        { id: rootExecutionId },
        {
          metadata: {
            path: ["rootExecutionId"],
            equals: rootExecutionId,
          },
        },
      ],
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (executions.length === 0) {
    throw new Error(`No execution found with ID: ${rootExecutionId}`);
  }

  // Build a map of execution ID to node
  const nodeMap = new Map<string, SpawnTreeNode>();

  for (const exec of executions) {
    const metadata = (exec.metadata || {}) as Record<string, unknown>;
    const inputData = (exec.inputData || {}) as Record<string, unknown>;

    const node: SpawnTreeNode = {
      executionId: exec.id,
      agentType: (inputData.agentType as string) || "orchestrator",
      task: (inputData.task as string) || "Root execution",
      status: exec.status,
      depth: (metadata.depth as number) || 0,
      duration: exec.duration || undefined,
      tokensUsed: undefined, // Will be populated in E2-T2
      children: [],
    };

    nodeMap.set(exec.id, node);
  }

  // Build the tree structure by linking parents to children
  let rootNode: SpawnTreeNode | undefined;

  for (const exec of executions) {
    const node = nodeMap.get(exec.id)!;
    const metadata = (exec.metadata || {}) as Record<string, unknown>;
    const parentExecutionId = metadata.parentExecutionId as string | undefined;

    if (!parentExecutionId || parentExecutionId === exec.id) {
      // This is the root node
      rootNode = node;
    } else {
      // Add to parent's children
      const parentNode = nodeMap.get(parentExecutionId);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        logger.warn("Parent execution not found in tree", {
          childId: exec.id,
          parentId: parentExecutionId,
        });
      }
    }
  }

  if (!rootNode) {
    throw new Error(`Root node not found for execution: ${rootExecutionId}`);
  }

  logger.debug("Spawn tree built successfully", {
    rootExecutionId,
    totalNodes: nodeMap.size,
  });

  return rootNode;
}

/**
 * Format a spawn tree as an ASCII tree diagram
 *
 * @param tree - The tree to format
 * @returns ASCII representation
 */
export function formatSpawnTreeForLogs(tree: SpawnTreeNode): string {
  const lines: string[] = [];

  function formatNode(node: SpawnTreeNode, prefix: string, isLast: boolean): void {
    // Format the node line
    let line = prefix;
    line += isLast ? "└── " : "├── ";
    line += `[${node.agentType}] ${truncateTask(node.task)}`;

    // Add duration if available
    if (node.duration !== undefined) {
      line += ` (${formatDuration(node.duration)}`;

      // Add tokens if available
      if (node.tokensUsed !== undefined) {
        line += `, ${node.tokensUsed} tokens`;
      }

      line += ")";
    }

    // Add status indicator
    if (node.status !== "success") {
      line += ` [${node.status.toUpperCase()}]`;
    }

    lines.push(line);

    // Process children
    const childPrefix = prefix + (isLast ? "    " : "│   ");
    const childCount = node.children.length;

    node.children.forEach((child, index) => {
      const isLastChild = index === childCount - 1;
      formatNode(child, childPrefix, isLastChild);
    });
  }

  // Start with root node
  let rootLine = `[${tree.agentType}] ${truncateTask(tree.task)}`;
  if (tree.duration !== undefined) {
    rootLine += ` (${formatDuration(tree.duration)}`;
    if (tree.tokensUsed !== undefined) {
      rootLine += `, ${tree.tokensUsed} tokens`;
    }
    rootLine += ")";
  }
  if (tree.status !== "success") {
    rootLine += ` [${tree.status.toUpperCase()}]`;
  }
  lines.push(rootLine);

  // Process children
  const childCount = tree.children.length;
  tree.children.forEach((child, index) => {
    const isLast = index === childCount - 1;
    formatNode(child, "", isLast);
  });

  return lines.join("\n");
}

/**
 * Calculate metrics for a spawn tree
 *
 * @param tree - The tree to analyze
 * @returns Aggregate metrics
 */
export function getSpawnTreeMetrics(tree: SpawnTreeNode): TreeMetrics {
  const metrics: TreeMetrics = {
    totalNodes: 0,
    maxDepth: 0,
    totalDuration: 0,
    totalTokens: 0,
    successRate: 0,
    agentTypeCounts: {},
    depthDistribution: {},
  };

  let successCount = 0;

  function traverse(node: SpawnTreeNode): void {
    metrics.totalNodes++;

    // Update max depth
    metrics.maxDepth = Math.max(metrics.maxDepth, node.depth);

    // Update depth distribution
    metrics.depthDistribution[node.depth] = (metrics.depthDistribution[node.depth] || 0) + 1;

    // Update agent type counts
    metrics.agentTypeCounts[node.agentType] = (metrics.agentTypeCounts[node.agentType] || 0) + 1;

    // Accumulate duration
    if (node.duration !== undefined) {
      metrics.totalDuration += node.duration;
    }

    // Accumulate tokens
    if (node.tokensUsed !== undefined) {
      metrics.totalTokens += node.tokensUsed;
    }

    // Track success
    if (node.status === "success") {
      successCount++;
    }

    // Traverse children
    for (const child of node.children) {
      traverse(child);
    }
  }

  traverse(tree);

  // Calculate success rate
  metrics.successRate = metrics.totalNodes > 0 ? successCount / metrics.totalNodes : 0;

  return metrics;
}

/**
 * Log a spawn tree with metrics
 *
 * @param rootExecutionId - The root execution ID
 */
export async function logSpawnTree(rootExecutionId: string): Promise<void> {
  try {
    const tree = await visualizeSpawnTree(rootExecutionId);
    const treeString = formatSpawnTreeForLogs(tree);
    const metrics = getSpawnTreeMetrics(tree);

    logger.info("Spawn tree visualization", {
      rootExecutionId,
      tree: "\n" + treeString,
      metrics,
    });
  } catch (error) {
    logger.error(
      "Failed to log spawn tree",
      { rootExecutionId },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

/**
 * Get a summary of spawn tree for embedding in execution results
 *
 * @param rootExecutionId - The root execution ID
 * @returns Summary string
 */
export async function getSpawnTreeSummary(rootExecutionId: string): Promise<string> {
  try {
    const tree = await visualizeSpawnTree(rootExecutionId);
    const metrics = getSpawnTreeMetrics(tree);

    const summary = [
      `Execution Tree Summary:`,
      `  Total Agents: ${metrics.totalNodes}`,
      `  Max Depth: ${metrics.maxDepth}`,
      `  Total Duration: ${formatDuration(metrics.totalDuration)}`,
      `  Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`,
    ];

    if (Object.keys(metrics.agentTypeCounts).length > 0) {
      summary.push(`  Agent Types:`);
      for (const [agentType, count] of Object.entries(metrics.agentTypeCounts)) {
        summary.push(`    - ${agentType}: ${count}`);
      }
    }

    return summary.join("\n");
  } catch (error) {
    logger.warn("Failed to generate spawn tree summary", {
      rootExecutionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return "Spawn tree summary unavailable";
  }
}

/**
 * Truncate task description for display
 */
function truncateTask(task: string, maxLength: number = 60): string {
  if (task.length <= maxLength) {
    return task;
  }
  return task.substring(0, maxLength - 3) + "...";
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}
