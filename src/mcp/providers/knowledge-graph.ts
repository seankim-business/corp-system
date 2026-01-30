/**
 * Knowledge Graph MCP Provider
 *
 * Provides MCP tools for managing and querying the organizational knowledge graph.
 * Agents can query relationships, search nodes, add/modify graph data, and visualize connections.
 */

import { MCPTool, CallContext, ToolCallResult } from "../types";
import { getKnowledgeGraphService } from "../../services/knowledge-graph";
import { logger } from "../../utils/logger";
import type { NodeType, EdgeType } from "../../services/knowledge-graph/types";

const TOOLS: MCPTool[] = [
  {
    name: "kg__query",
    description: "Natural language query on the knowledge graph. Ask questions like 'Who works with Sean?' or 'What projects is the marketing team working on?'",
    inputSchema: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "Natural language question to query the knowledge graph",
        },
      },
      required: ["question"],
    },
    outputSchema: {
      type: "object",
      properties: {
        answer: { type: "string" },
        nodes: { type: "array", items: { type: "object" } },
        confidence: { type: "number" },
      },
    },
    provider: "knowledge-graph",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "kg__search",
    description: "Search for nodes in the knowledge graph by text label. Supports filtering by node type.",
    inputSchema: {
      type: "object",
      properties: {
        searchTerm: {
          type: "string",
          description: "Text to search for in node labels",
        },
        nodeTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["person", "project", "document", "agent", "team", "task", "goal", "workflow"],
          },
          description: "Filter by node types (optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default 20)",
        },
      },
      required: ["searchTerm"],
    },
    outputSchema: {
      type: "object",
      properties: {
        nodes: {
          type: "array",
          items: { type: "object" },
        },
      },
    },
    provider: "knowledge-graph",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "kg__add_node",
    description: "Add a new node to the knowledge graph. Node types: person, project, document, agent, team, task, goal, workflow.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["person", "project", "document", "agent", "team", "task", "goal", "workflow"],
          description: "Type of the node",
        },
        label: {
          type: "string",
          description: "Display label for the node",
        },
        externalId: {
          type: "string",
          description: "Optional external reference ID (e.g., user ID, project ID)",
        },
        properties: {
          type: "object",
          description: "Additional properties as key-value pairs",
        },
      },
      required: ["type", "label"],
    },
    outputSchema: {
      type: "object",
      properties: {
        node: { type: "object" },
      },
    },
    provider: "knowledge-graph",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "kg__add_edge",
    description: "Add a relationship (edge) between two nodes in the knowledge graph. Edge types: works_with, works_on, owns, references, delegates_to, collaborates_with, member_of, manages, depends_on, related_to, parent_of, child_of, assigned_to, created_by, contributes_to.",
    inputSchema: {
      type: "object",
      properties: {
        sourceId: {
          type: "string",
          description: "ID of the source node",
        },
        targetId: {
          type: "string",
          description: "ID of the target node",
        },
        type: {
          type: "string",
          enum: [
            "works_with",
            "works_on",
            "owns",
            "references",
            "delegates_to",
            "collaborates_with",
            "member_of",
            "manages",
            "depends_on",
            "related_to",
            "parent_of",
            "child_of",
            "assigned_to",
            "created_by",
            "contributes_to",
          ],
          description: "Type of relationship",
        },
        weight: {
          type: "number",
          description: "Relationship weight/strength (optional, default 1.0)",
        },
        properties: {
          type: "object",
          description: "Additional properties as key-value pairs",
        },
      },
      required: ["sourceId", "targetId", "type"],
    },
    outputSchema: {
      type: "object",
      properties: {
        edge: { type: "object" },
      },
    },
    provider: "knowledge-graph",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
  {
    name: "kg__find_path",
    description: "Find the shortest path between two nodes in the knowledge graph. Useful for understanding how entities are connected.",
    inputSchema: {
      type: "object",
      properties: {
        fromId: {
          type: "string",
          description: "Starting node ID",
        },
        toId: {
          type: "string",
          description: "Ending node ID",
        },
        maxDepth: {
          type: "number",
          description: "Maximum path length to search (optional, default 5)",
        },
        edgeTypes: {
          type: "array",
          items: { type: "string" },
          description: "Filter by specific edge types (optional)",
        },
        weighted: {
          type: "boolean",
          description: "Use edge weights for shortest path calculation (optional, default false)",
        },
      },
      required: ["fromId", "toId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        path: {
          type: "array",
          items: { type: "object" },
        },
        length: { type: "number" },
        found: { type: "boolean" },
      },
    },
    provider: "knowledge-graph",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "kg__find_related",
    description: "Find all nodes related to a given node within a specified depth. Useful for discovering connections and context.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "Node ID to find related nodes for",
        },
        depth: {
          type: "number",
          description: "How many hops away to search (default 2)",
        },
        nodeTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["person", "project", "document", "agent", "team", "task", "goal", "workflow"],
          },
          description: "Filter results by node types (optional)",
        },
        edgeTypes: {
          type: "array",
          items: { type: "string" },
          description: "Filter by specific edge types (optional)",
        },
        limit: {
          type: "number",
          description: "Maximum number of related nodes to return (optional)",
        },
      },
      required: ["nodeId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        centerNode: { type: "object" },
        relatedNodes: {
          type: "array",
          items: { type: "object" },
        },
        totalCount: { type: "number" },
      },
    },
    provider: "knowledge-graph",
    requiresAuth: false,
    permissions: { allowedAgents: ["all"] },
  },
  {
    name: "kg__delete_node",
    description: "Delete a node from the knowledge graph. All edges connected to this node will also be removed.",
    inputSchema: {
      type: "object",
      properties: {
        nodeId: {
          type: "string",
          description: "ID of the node to delete",
        },
      },
      required: ["nodeId"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
      },
    },
    provider: "knowledge-graph",
    requiresAuth: false,
    permissions: {
      allowedAgents: ["all"],
      requiresApproval: {
        condition: "always",
        approver: "admin",
      },
    },
  },
];

// ============================================================================
// Type Definitions
// ============================================================================

interface QueryArgs {
  question: string;
}

interface SearchArgs {
  searchTerm: string;
  nodeTypes?: NodeType[];
  limit?: number;
}

interface AddNodeArgs {
  type: NodeType;
  label: string;
  externalId?: string;
  properties?: Record<string, unknown>;
}

interface AddEdgeArgs {
  sourceId: string;
  targetId: string;
  type: EdgeType | string;
  weight?: number;
  properties?: Record<string, unknown>;
}

interface FindPathArgs {
  fromId: string;
  toId: string;
  maxDepth?: number;
  edgeTypes?: string[];
  weighted?: boolean;
}

interface FindRelatedArgs {
  nodeId: string;
  depth?: number;
  nodeTypes?: NodeType[];
  edgeTypes?: string[];
  limit?: number;
}

interface DeleteNodeArgs {
  nodeId: string;
}

// ============================================================================
// Provider Implementation
// ============================================================================

export function createKnowledgeGraphProvider() {
  return {
    name: "knowledge-graph",

    getTools(): MCPTool[] {
      return TOOLS;
    },

    async executeTool(
      toolName: string,
      args: Record<string, unknown>,
      context: CallContext,
    ): Promise<ToolCallResult> {
      const startTime = Date.now();

      try {
        const service = getKnowledgeGraphService(context.organizationId);
        let result: unknown;
        const actualToolName = toolName.replace("kg__", "");

        switch (actualToolName) {
          case "query":
            result = await executeQuery(service, args as any);
            break;
          case "search":
            result = await executeSearch(service, args as any);
            break;
          case "add_node":
            result = await executeAddNode(service, args as any);
            break;
          case "add_edge":
            result = await executeAddEdge(service, args as any);
            break;
          case "find_path":
            result = await executeFindPath(service, args as any);
            break;
          case "find_related":
            result = await executeFindRelated(service, args as any);
            break;
          case "delete_node":
            result = await executeDeleteNode(service, args as any);
            break;
          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          success: true,
          data: result,
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      } catch (error) {
        logger.error(
          "Knowledge Graph tool execution failed",
          { toolName, organizationId: context.organizationId },
          error as Error,
        );
        return {
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: (error as Error).message,
          },
          metadata: {
            duration: Date.now() - startTime,
            cached: false,
          },
        };
      }
    },
  };
}

// ============================================================================
// Tool Execution Functions
// ============================================================================

async function executeQuery(
  service: ReturnType<typeof getKnowledgeGraphService>,
  args: QueryArgs,
) {
  const { question } = args;
  return service.query(question);
}

async function executeSearch(
  service: ReturnType<typeof getKnowledgeGraphService>,
  args: SearchArgs,
) {
  const { searchTerm, nodeTypes, limit = 20 } = args;
  const nodes = await service.searchNodes(searchTerm, { nodeTypes, limit });
  return { nodes };
}

async function executeAddNode(
  service: ReturnType<typeof getKnowledgeGraphService>,
  args: AddNodeArgs,
) {
  const { type, label, externalId, properties } = args;
  const node = await service.addNode({ type, label, externalId, properties });

  logger.info("Knowledge graph node added via MCP", {
    nodeId: node.id,
    type,
    label,
  });

  return { node };
}

async function executeAddEdge(
  service: ReturnType<typeof getKnowledgeGraphService>,
  args: AddEdgeArgs,
) {
  const { sourceId, targetId, type, weight, properties } = args;
  const edge = await service.addEdge({ sourceId, targetId, type, weight, properties });

  logger.info("Knowledge graph edge added via MCP", {
    edgeId: edge.id,
    type,
    sourceId,
    targetId,
  });

  return { edge };
}

async function executeFindPath(
  service: ReturnType<typeof getKnowledgeGraphService>,
  args: FindPathArgs,
) {
  const { fromId, toId, maxDepth, edgeTypes, weighted } = args;
  return service.findPath(fromId, toId, { maxDepth, edgeTypes, weighted });
}

async function executeFindRelated(
  service: ReturnType<typeof getKnowledgeGraphService>,
  args: FindRelatedArgs,
) {
  const { nodeId, depth = 2, nodeTypes, edgeTypes, limit } = args;
  return service.findRelated(nodeId, depth, { nodeTypes, edgeTypes, limit });
}

async function executeDeleteNode(
  service: ReturnType<typeof getKnowledgeGraphService>,
  args: DeleteNodeArgs,
) {
  const { nodeId } = args;
  await service.deleteNode(nodeId);

  logger.info("Knowledge graph node deleted via MCP", {
    nodeId,
  });

  return { success: true };
}
