/**
 * Knowledge Graph API Routes
 * REST endpoints for knowledge graph operations
 */

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/require-permission";
import { Permission } from "../auth/rbac";
import { logger } from "../utils/logger";
import {
  getKnowledgeGraphService,
  NodeType,
  EdgeType,
} from "../services/knowledge-graph";

const router = Router();

// ============================================================================
// Graph Operations
// ============================================================================

/**
 * GET /api/knowledge-graph
 * Get the full knowledge graph
 */
router.get(
  "/knowledge-graph",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const graph = await service.getGraph();

      return res.json(graph);
    } catch (error) {
      logger.error("Failed to get knowledge graph", { error });
      return res.status(500).json({ error: "Failed to get knowledge graph" });
    }
  }
);

/**
 * POST /api/knowledge-graph/build
 * Build or rebuild the knowledge graph
 */
router.post(
  "/knowledge-graph/build",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const graph = await service.buildGraph();

      return res.json({
        message: "Knowledge graph built successfully",
        nodeCount: graph.metadata?.nodeCount,
        edgeCount: graph.metadata?.edgeCount,
      });
    } catch (error) {
      logger.error("Failed to build knowledge graph", { error });
      return res.status(500).json({ error: "Failed to build knowledge graph" });
    }
  }
);

/**
 * DELETE /api/knowledge-graph
 * Clear the knowledge graph
 */
router.delete(
  "/knowledge-graph",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      await service.clearGraph();

      return res.json({ message: "Knowledge graph cleared successfully" });
    } catch (error) {
      logger.error("Failed to clear knowledge graph", { error });
      return res.status(500).json({ error: "Failed to clear knowledge graph" });
    }
  }
);

/**
 * GET /api/knowledge-graph/stats
 * Get graph statistics
 */
router.get(
  "/knowledge-graph/stats",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const stats = await service.getStats();

      return res.json(stats);
    } catch (error) {
      logger.error("Failed to get graph stats", { error });
      return res.status(500).json({ error: "Failed to get graph statistics" });
    }
  }
);

// ============================================================================
// Node Operations
// ============================================================================

/**
 * POST /api/knowledge-graph/nodes
 * Add a new node
 */
router.post(
  "/knowledge-graph/nodes",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { type, label, externalId, properties } = req.body;

      if (!type || !label) {
        return res.status(400).json({ error: "Type and label are required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const node = await service.addNode({
        type: type as NodeType,
        label,
        externalId,
        properties,
      });

      return res.status(201).json(node);
    } catch (error) {
      logger.error("Failed to add node", { error });
      return res.status(500).json({ error: "Failed to add node" });
    }
  }
);

/**
 * PATCH /api/knowledge-graph/nodes/:nodeId
 * Update a node
 */
router.patch(
  "/knowledge-graph/nodes/:nodeId",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const nodeId = req.params.nodeId as string;
      const { label, properties } = req.body;

      const service = getKnowledgeGraphService(organizationId);
      const node = await service.updateNode(nodeId, { label, properties });

      return res.json(node);
    } catch (error) {
      logger.error("Failed to update node", { error });
      return res.status(500).json({ error: "Failed to update node" });
    }
  }
);

/**
 * DELETE /api/knowledge-graph/nodes/:nodeId
 * Delete a node
 */
router.delete(
  "/knowledge-graph/nodes/:nodeId",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const nodeId = req.params.nodeId as string;

      const service = getKnowledgeGraphService(organizationId);
      await service.deleteNode(nodeId);

      return res.json({ message: "Node deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete node", { error });
      return res.status(500).json({ error: "Failed to delete node" });
    }
  }
);

// ============================================================================
// Edge Operations
// ============================================================================

/**
 * POST /api/knowledge-graph/edges
 * Add a new edge
 */
router.post(
  "/knowledge-graph/edges",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { sourceId, targetId, type, weight, properties } = req.body;

      if (!sourceId || !targetId || !type) {
        return res.status(400).json({ error: "sourceId, targetId, and type are required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const edge = await service.addEdge({
        sourceId,
        targetId,
        type: type as EdgeType,
        weight,
        properties,
      });

      return res.status(201).json(edge);
    } catch (error) {
      logger.error("Failed to add edge", { error });
      return res.status(500).json({ error: "Failed to add edge" });
    }
  }
);

/**
 * PATCH /api/knowledge-graph/edges/:edgeId
 * Update an edge
 */
router.patch(
  "/knowledge-graph/edges/:edgeId",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const edgeId = req.params.edgeId as string;
      const { weight, properties } = req.body;

      const service = getKnowledgeGraphService(organizationId);
      const edge = await service.updateEdge(edgeId, { weight, properties });

      return res.json(edge);
    } catch (error) {
      logger.error("Failed to update edge", { error });
      return res.status(500).json({ error: "Failed to update edge" });
    }
  }
);

/**
 * DELETE /api/knowledge-graph/edges/:edgeId
 * Delete an edge
 */
router.delete(
  "/knowledge-graph/edges/:edgeId",
  requireAuth,
  requirePermission(Permission.SETTINGS_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const edgeId = req.params.edgeId as string;

      const service = getKnowledgeGraphService(organizationId);
      await service.deleteEdge(edgeId);

      return res.json({ message: "Edge deleted successfully" });
    } catch (error) {
      logger.error("Failed to delete edge", { error });
      return res.status(500).json({ error: "Failed to delete edge" });
    }
  }
);

// ============================================================================
// Query Operations
// ============================================================================

/**
 * GET /api/knowledge-graph/path
 * Find shortest path between two nodes
 */
router.get(
  "/knowledge-graph/path",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { fromId, toId, maxDepth, edgeTypes, weighted } = req.query;

      if (!fromId || !toId) {
        return res.status(400).json({ error: "fromId and toId are required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const result = await service.findPath(fromId as string, toId as string, {
        maxDepth: maxDepth ? parseInt(maxDepth as string, 10) : undefined,
        edgeTypes: edgeTypes ? (edgeTypes as string).split(",") : undefined,
        weighted: weighted === "true",
      });

      return res.json(result);
    } catch (error) {
      logger.error("Failed to find path", { error });
      return res.status(500).json({ error: "Failed to find path" });
    }
  }
);

/**
 * GET /api/knowledge-graph/related/:nodeId
 * Find related nodes
 */
router.get(
  "/knowledge-graph/related/:nodeId",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const nodeId = req.params.nodeId as string;
      const { depth, nodeTypes, edgeTypes, limit } = req.query;

      const service = getKnowledgeGraphService(organizationId);
      const result = await service.findRelated(
        nodeId,
        depth ? parseInt(depth as string, 10) : 2,
        {
          nodeTypes: nodeTypes ? ((nodeTypes as string).split(",") as NodeType[]) : undefined,
          edgeTypes: edgeTypes ? (edgeTypes as string).split(",") : undefined,
          limit: limit ? parseInt(limit as string, 10) : undefined,
        }
      );

      return res.json(result);
    } catch (error) {
      logger.error("Failed to find related nodes", { error });
      return res.status(500).json({ error: "Failed to find related nodes" });
    }
  }
);

/**
 * GET /api/knowledge-graph/relationships/:type
 * Find nodes by relationship type
 */
router.get(
  "/knowledge-graph/relationships/:type",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { type } = req.params;
      const { limit } = req.query;

      const service = getKnowledgeGraphService(organizationId);
      const result = await service.findByRelationship(type as EdgeType, {
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      return res.json(result);
    } catch (error) {
      logger.error("Failed to find by relationship", { error });
      return res.status(500).json({ error: "Failed to find by relationship" });
    }
  }
);

/**
 * GET /api/knowledge-graph/search
 * Search nodes by label
 */
router.get(
  "/knowledge-graph/search",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { q, nodeTypes, limit } = req.query;

      if (!q) {
        return res.status(400).json({ error: "Search query (q) is required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const nodes = await service.searchNodes(q as string, {
        nodeTypes: nodeTypes ? ((nodeTypes as string).split(",") as NodeType[]) : undefined,
        limit: limit ? parseInt(limit as string, 10) : 50,
      });

      return res.json({ nodes, count: nodes.length });
    } catch (error) {
      logger.error("Failed to search nodes", { error });
      return res.status(500).json({ error: "Failed to search nodes" });
    }
  }
);

/**
 * POST /api/knowledge-graph/query
 * Natural language query
 */
router.post(
  "/knowledge-graph/query",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { question } = req.body;

      if (!question) {
        return res.status(400).json({ error: "Question is required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const result = await service.query(question);

      return res.json(result);
    } catch (error) {
      logger.error("Failed to process query", { error });
      return res.status(500).json({ error: "Failed to process query" });
    }
  }
);

// ============================================================================
// Visualization Operations
// ============================================================================

/**
 * GET /api/knowledge-graph/visualization
 * Get visualization data for the full graph
 */
router.get(
  "/knowledge-graph/visualization",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { showLabels, showWeights, physics, hierarchical } = req.query;

      const service = getKnowledgeGraphService(organizationId);
      const data = await service.getVisualization({
        showLabels: showLabels !== "false",
        showWeights: showWeights === "true",
        physics: physics !== "false",
        hierarchical: hierarchical === "true",
      });

      return res.json(data);
    } catch (error) {
      logger.error("Failed to get visualization", { error });
      return res.status(500).json({ error: "Failed to get visualization" });
    }
  }
);

/**
 * GET /api/knowledge-graph/visualization/subgraph/:nodeId
 * Get visualization data for a subgraph
 */
router.get(
  "/knowledge-graph/visualization/subgraph/:nodeId",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const nodeId = req.params.nodeId as string;
      const { depth, showLabels, showWeights } = req.query;

      const service = getKnowledgeGraphService(organizationId);
      const data = await service.getSubgraphVisualization(
        nodeId,
        depth ? parseInt(depth as string, 10) : 2,
        {
          showLabels: showLabels !== "false",
          showWeights: showWeights === "true",
        }
      );

      return res.json(data);
    } catch (error) {
      logger.error("Failed to get subgraph visualization", { error });
      return res.status(500).json({ error: "Failed to get subgraph visualization" });
    }
  }
);

/**
 * GET /api/knowledge-graph/visualization/filtered
 * Get filtered visualization by node types
 */
router.get(
  "/knowledge-graph/visualization/filtered",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const { nodeTypes, showLabels, showWeights } = req.query;

      if (!nodeTypes) {
        return res.status(400).json({ error: "nodeTypes is required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const data = await service.getFilteredVisualization(
        (nodeTypes as string).split(",") as NodeType[],
        {
          showLabels: showLabels !== "false",
          showWeights: showWeights === "true",
        }
      );

      return res.json(data);
    } catch (error) {
      logger.error("Failed to get filtered visualization", { error });
      return res.status(500).json({ error: "Failed to get filtered visualization" });
    }
  }
);

/**
 * GET /api/knowledge-graph/export/d3
 * Export graph data for D3.js
 */
router.get(
  "/knowledge-graph/export/d3",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const data = await service.exportForD3();

      return res.json(data);
    } catch (error) {
      logger.error("Failed to export for D3", { error });
      return res.status(500).json({ error: "Failed to export for D3" });
    }
  }
);

/**
 * GET /api/knowledge-graph/types
 * Get available node and edge types
 */
router.get(
  "/knowledge-graph/types",
  requireAuth,
  requirePermission(Permission.EXECUTION_READ),
  async (req: Request, res: Response) => {
    try {
      const organizationId = req.user?.organizationId;
      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const service = getKnowledgeGraphService(organizationId);
      const [nodeTypes, edgeTypes] = await Promise.all([
        service.getAvailableNodeTypes(),
        service.getAvailableEdgeTypes(),
      ]);

      return res.json({ nodeTypes, edgeTypes });
    } catch (error) {
      logger.error("Failed to get types", { error });
      return res.status(500).json({ error: "Failed to get types" });
    }
  }
);

export default router;
