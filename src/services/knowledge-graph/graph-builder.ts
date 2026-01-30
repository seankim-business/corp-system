/**
 * Graph Builder
 * Builds and manages the knowledge graph from organizational data
 */

import { db } from "../../db/client";
import { Prisma } from "@prisma/client";
import { logger } from "../../utils/logger";
import { RelationshipExtractor } from "./relationship-extractor";
import {
  KnowledgeGraph,
  GraphNode,
  GraphEdge,
  NodeType,
  EdgeType,
  CreateNodeInput,
  CreateEdgeInput,
  UpdateNodeInput,
  UpdateEdgeInput,
  InferredRelationship,
} from "./types";

export class GraphBuilder {
  private organizationId: string;
  private extractor: RelationshipExtractor;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
    this.extractor = new RelationshipExtractor(organizationId);
  }

  /**
   * Build the complete knowledge graph from organizational data
   */
  async buildGraph(): Promise<KnowledgeGraph> {
    logger.info("Building knowledge graph", {
      organizationId: this.organizationId,
    });

    try {
      // Extract entities and relationships from organizational data
      const extractionResult = await this.extractor.extract();

      // Create nodes from extracted entities
      for (const entity of extractionResult.entities) {
        await this.upsertNode({
          type: entity.type,
          label: entity.label,
          externalId: entity.id,
          properties: entity.properties,
        });
      }

      // Create edges from extracted relationships
      for (const rel of extractionResult.relationships) {
        // Find source and target nodes by external ID
        const sourceNode = await db.knowledgeNode.findFirst({
          where: {
            organizationId: this.organizationId,
            metadata: {
              path: ["externalId"],
              equals: rel.sourceId,
            },
          },
        });

        const targetNode = await db.knowledgeNode.findFirst({
          where: {
            organizationId: this.organizationId,
            metadata: {
              path: ["externalId"],
              equals: rel.targetId,
            },
          },
        });

        if (sourceNode && targetNode) {
          await this.upsertEdge({
            sourceId: sourceNode.id,
            targetId: targetNode.id,
            type: rel.relationshipType,
            weight: rel.weight,
            properties: rel.metadata || {},
          });
        }
      }

      // Infer additional relationships
      const inferred = await this.inferRelationships();
      for (const rel of inferred) {
        await this.upsertEdge({
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          type: rel.type,
          weight: rel.weight,
          properties: {
            inferred: true,
            confidence: rel.confidence,
            reason: rel.reason,
          },
        });
      }

      return this.getGraph();
    } catch (error) {
      logger.error(
        "Failed to build knowledge graph",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Get the current knowledge graph from database
   */
  async getGraph(): Promise<KnowledgeGraph> {
    try {
      const [nodes, edges] = await Promise.all([
        db.knowledgeNode.findMany({
          where: { organizationId: this.organizationId },
          orderBy: { createdAt: "desc" },
        }),
        db.knowledgeEdge.findMany({
          where: { organizationId: this.organizationId },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return {
        nodes: nodes.map(this.dbNodeToGraphNode),
        edges: edges.map(this.dbEdgeToGraphEdge),
        metadata: {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          lastUpdated: new Date(),
        },
      };
    } catch (error) {
      logger.error(
        "Failed to get knowledge graph",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Add a new node to the graph
   */
  async addNode(input: CreateNodeInput): Promise<GraphNode> {
    logger.info("Adding knowledge graph node", {
      organizationId: this.organizationId,
      type: input.type,
      label: input.label,
    });

    try {
      const dbNode = await db.knowledgeNode.create({
        data: {
          organizationId: this.organizationId,
          type: input.type,
          name: input.label,
          description: input.properties?.description as string | undefined,
          metadata: {
            ...input.properties,
            externalId: input.externalId,
          } as Prisma.InputJsonValue,
        },
      });

      return this.dbNodeToGraphNode(dbNode);
    } catch (error) {
      logger.error(
        "Failed to add knowledge graph node",
        { organizationId: this.organizationId, input },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Upsert a node (create or update if exists)
   */
  async upsertNode(input: CreateNodeInput): Promise<GraphNode> {
    logger.info("Upserting knowledge graph node", {
      organizationId: this.organizationId,
      type: input.type,
      label: input.label,
      externalId: input.externalId,
    });

    try {
      // Try to find existing node by externalId
      if (input.externalId) {
        const existing = await db.knowledgeNode.findFirst({
          where: {
            organizationId: this.organizationId,
            metadata: {
              path: ["externalId"],
              equals: input.externalId,
            },
          },
        });

        if (existing) {
          return this.updateNode(existing.id, {
            label: input.label,
            properties: input.properties,
          });
        }
      }

      // Create new node
      return this.addNode(input);
    } catch (error) {
      logger.error(
        "Failed to upsert knowledge graph node",
        { organizationId: this.organizationId, input },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Update an existing node
   */
  async updateNode(nodeId: string, input: UpdateNodeInput): Promise<GraphNode> {
    logger.info("Updating knowledge graph node", {
      organizationId: this.organizationId,
      nodeId,
    });

    try {
      const existing = await db.knowledgeNode.findFirst({
        where: {
          id: nodeId,
          organizationId: this.organizationId,
        },
      });

      if (!existing) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      const existingMetadata = existing.metadata as Record<string, unknown> || {};

      const dbNode = await db.knowledgeNode.update({
        where: { id: nodeId },
        data: {
          ...(input.label && { name: input.label }),
          ...(input.properties && {
            metadata: {
              ...existingMetadata,
              ...input.properties,
            } as Prisma.InputJsonValue,
          }),
        },
      });

      return this.dbNodeToGraphNode(dbNode);
    } catch (error) {
      logger.error(
        "Failed to update knowledge graph node",
        { organizationId: this.organizationId, nodeId, input },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Delete a node and its edges
   */
  async deleteNode(nodeId: string): Promise<void> {
    logger.info("Deleting knowledge graph node", {
      organizationId: this.organizationId,
      nodeId,
    });

    try {
      // Verify node belongs to organization
      const existing = await db.knowledgeNode.findFirst({
        where: {
          id: nodeId,
          organizationId: this.organizationId,
        },
      });

      if (!existing) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // Delete edges first (cascade should handle this, but be explicit)
      await db.knowledgeEdge.deleteMany({
        where: {
          OR: [{ sourceNodeId: nodeId }, { targetNodeId: nodeId }],
        },
      });

      // Delete the node
      await db.knowledgeNode.delete({
        where: { id: nodeId },
      });
    } catch (error) {
      logger.error(
        "Failed to delete knowledge graph node",
        { organizationId: this.organizationId, nodeId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Add a new edge to the graph
   */
  async addEdge(input: CreateEdgeInput): Promise<GraphEdge> {
    logger.info("Adding knowledge graph edge", {
      organizationId: this.organizationId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
    });

    try {
      // Verify both nodes exist and belong to organization
      const [source, target] = await Promise.all([
        db.knowledgeNode.findFirst({
          where: { id: input.sourceId, organizationId: this.organizationId },
        }),
        db.knowledgeNode.findFirst({
          where: { id: input.targetId, organizationId: this.organizationId },
        }),
      ]);

      if (!source) {
        throw new Error(`Source node not found: ${input.sourceId}`);
      }
      if (!target) {
        throw new Error(`Target node not found: ${input.targetId}`);
      }

      const dbEdge = await db.knowledgeEdge.create({
        data: {
          organizationId: this.organizationId,
          sourceNodeId: input.sourceId,
          targetNodeId: input.targetId,
          relationshipType: input.type,
          weight: input.weight ?? 1.0,
          metadata: (input.properties || {}) as Prisma.InputJsonValue,
        },
      });

      return this.dbEdgeToGraphEdge(dbEdge);
    } catch (error) {
      logger.error(
        "Failed to add knowledge graph edge",
        { organizationId: this.organizationId, input },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Upsert an edge (create or update if exists)
   */
  async upsertEdge(input: CreateEdgeInput): Promise<GraphEdge> {
    logger.info("Upserting knowledge graph edge", {
      organizationId: this.organizationId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
    });

    try {
      // Check if edge already exists
      const existing = await db.knowledgeEdge.findFirst({
        where: {
          organizationId: this.organizationId,
          sourceNodeId: input.sourceId,
          targetNodeId: input.targetId,
          relationshipType: input.type,
        },
      });

      if (existing) {
        return this.updateEdge(existing.id, {
          weight: input.weight,
          properties: input.properties,
        });
      }

      return this.addEdge(input);
    } catch (error) {
      logger.error(
        "Failed to upsert knowledge graph edge",
        { organizationId: this.organizationId, input },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Update an existing edge
   */
  async updateEdge(edgeId: string, input: UpdateEdgeInput): Promise<GraphEdge> {
    logger.info("Updating knowledge graph edge", {
      organizationId: this.organizationId,
      edgeId,
    });

    try {
      const existing = await db.knowledgeEdge.findFirst({
        where: {
          id: edgeId,
          organizationId: this.organizationId,
        },
      });

      if (!existing) {
        throw new Error(`Edge not found: ${edgeId}`);
      }

      const existingMetadata = existing.metadata as Record<string, unknown> || {};

      const dbEdge = await db.knowledgeEdge.update({
        where: { id: edgeId },
        data: {
          ...(input.weight !== undefined && { weight: input.weight }),
          ...(input.properties && {
            metadata: {
              ...existingMetadata,
              ...input.properties,
            } as Prisma.InputJsonValue,
          }),
        },
      });

      return this.dbEdgeToGraphEdge(dbEdge);
    } catch (error) {
      logger.error(
        "Failed to update knowledge graph edge",
        { organizationId: this.organizationId, edgeId, input },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Delete an edge
   */
  async deleteEdge(edgeId: string): Promise<void> {
    logger.info("Deleting knowledge graph edge", {
      organizationId: this.organizationId,
      edgeId,
    });

    try {
      const existing = await db.knowledgeEdge.findFirst({
        where: {
          id: edgeId,
          organizationId: this.organizationId,
        },
      });

      if (!existing) {
        throw new Error(`Edge not found: ${edgeId}`);
      }

      await db.knowledgeEdge.delete({
        where: { id: edgeId },
      });
    } catch (error) {
      logger.error(
        "Failed to delete knowledge graph edge",
        { organizationId: this.organizationId, edgeId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Infer relationships from activity patterns and collaboration
   */
  async inferRelationships(): Promise<InferredRelationship[]> {
    logger.info("Inferring knowledge graph relationships", {
      organizationId: this.organizationId,
    });

    const inferred: InferredRelationship[] = [];

    try {
      // Get all nodes
      const nodes = await db.knowledgeNode.findMany({
        where: { organizationId: this.organizationId },
      });

      // Infer relationships based on shared properties
      const nodesByType = new Map<string, typeof nodes>();
      for (const node of nodes) {
        const existing = nodesByType.get(node.type) || [];
        existing.push(node);
        nodesByType.set(node.type, existing);
      }

      // Infer person-project relationships from shared tags/categories
      const persons = nodesByType.get("person") || [];
      const projects = nodesByType.get("project") || [];

      for (const person of persons) {
        const personMeta = person.metadata as Record<string, unknown> || {};
        const personTags = (personMeta.tags as string[]) || [];

        for (const project of projects) {
          const projectMeta = project.metadata as Record<string, unknown> || {};
          const projectTags = (projectMeta.tags as string[]) || [];

          // Check for overlapping tags
          const sharedTags = personTags.filter((t) => projectTags.includes(t));
          if (sharedTags.length > 0) {
            inferred.push({
              sourceId: person.id,
              targetId: project.id,
              type: "contributes_to",
              weight: Math.min(1.0, sharedTags.length * 0.2),
              confidence: 0.6,
              reason: `Shared tags: ${sharedTags.join(", ")}`,
            });
          }
        }
      }

      // Infer agent collaboration from shared execution patterns
      const agents = nodesByType.get("agent") || [];
      for (let i = 0; i < agents.length; i++) {
        for (let j = i + 1; j < agents.length; j++) {
          const agent1 = agents[i];
          const agent2 = agents[j];

          const meta1 = agent1.metadata as Record<string, unknown> || {};
          const meta2 = agent2.metadata as Record<string, unknown> || {};

          // Check if agents share a team
          if (meta1.teamId && meta1.teamId === meta2.teamId) {
            inferred.push({
              sourceId: agent1.id,
              targetId: agent2.id,
              type: "collaborates_with",
              weight: 0.8,
              confidence: 0.9,
              reason: "Same team membership",
            });
          }
        }
      }

      logger.info("Inferred relationships", {
        organizationId: this.organizationId,
        count: inferred.length,
      });

      return inferred;
    } catch (error) {
      logger.error(
        "Failed to infer relationships",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      return [];
    }
  }

  /**
   * Clear all graph data for the organization
   */
  async clearGraph(): Promise<void> {
    logger.info("Clearing knowledge graph", {
      organizationId: this.organizationId,
    });

    try {
      // Delete edges first (foreign key constraint)
      await db.knowledgeEdge.deleteMany({
        where: { organizationId: this.organizationId },
      });

      // Delete nodes
      await db.knowledgeNode.deleteMany({
        where: { organizationId: this.organizationId },
      });

      // Delete clusters
      await db.knowledgeCluster.deleteMany({
        where: { organizationId: this.organizationId },
      });

      logger.info("Knowledge graph cleared", {
        organizationId: this.organizationId,
      });
    } catch (error) {
      logger.error(
        "Failed to clear knowledge graph",
        { organizationId: this.organizationId },
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  // ============================================================================
  // Conversion Methods
  // ============================================================================

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
    const metadata = dbNode.metadata as Record<string, unknown> || {};
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
    const metadata = dbEdge.metadata as Record<string, unknown> || {};
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
 * Factory function to create a GraphBuilder
 */
export function createGraphBuilder(organizationId: string): GraphBuilder {
  return new GraphBuilder(organizationId);
}
