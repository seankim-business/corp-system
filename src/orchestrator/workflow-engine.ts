import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { logger } from "../utils/logger";
import {
  WorkflowContext,
  WorkflowDefinition,
  WorkflowDefinitionSchema,
  WorkflowNode,
} from "./workflow-types";

const WORKFLOWS_DIR = path.resolve(__dirname, "../../config/workflows");

/**
 * WorkflowEngine - LangGraph-style state machine
 *
 * Responsibilities:
 * - Load/validate workflow definitions from YAML
 * - Manage workflow state
 * - Find next node(s) based on edges
 * - Handle START/END special nodes
 */
export class WorkflowEngine {
  private workflows: Map<string, WorkflowDefinition> = new Map();

  loadWorkflows(): void {
    if (!fs.existsSync(WORKFLOWS_DIR)) {
      logger.warn("Workflows directory not found", { dir: WORKFLOWS_DIR });
      return;
    }

    const files = fs
      .readdirSync(WORKFLOWS_DIR)
      .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

    for (const file of files) {
      const filePath = path.join(WORKFLOWS_DIR, file);
      try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        const parsed = yaml.load(fileContent);
        const workflow = WorkflowDefinitionSchema.parse(parsed);
        this.workflows.set(workflow.name, workflow);
        logger.info("Loaded workflow definition", { name: workflow.name, file });
      } catch (error) {
        logger.error("Failed to load workflow definition", { file }, error as Error);
        throw new Error(`Invalid workflow configuration in ${file}: ${(error as Error).message}`);
      }
    }
  }

  getWorkflow(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  createContext(
    workflowName: string,
    request: {
      organizationId: string;
      userId: string;
      sessionId: string;
      initialVariables?: Record<string, unknown>;
    },
  ): WorkflowContext {
    logger.debug("Creating workflow context", { workflowName });
    return {
      organizationId: request.organizationId,
      userId: request.userId,
      sessionId: request.sessionId,
      variables: request.initialVariables ?? {},
      nodeResults: {},
      currentNode: "START",
      status: "pending",
      startedAt: new Date(),
    };
  }

  getNextNodes(
    workflow: WorkflowDefinition,
    currentNodeId: string,
    context: WorkflowContext,
  ): WorkflowNode[] {
    if (currentNodeId === "END") {
      return [];
    }

    const edges = workflow.edges.filter((edge) => edge.from === currentNodeId);
    const nextNodes: WorkflowNode[] = [];

    for (const edge of edges) {
      if (edge.condition && !this.evaluateCondition(edge.condition, context)) {
        continue;
      }

      if (edge.to === "END") {
        continue;
      }

      const node = this.getNode(workflow, edge.to);
      if (!node) {
        logger.warn("Workflow edge points to missing node", {
          workflow: workflow.name,
          from: edge.from,
          to: edge.to,
        });
        continue;
      }

      nextNodes.push(node);
    }

    return nextNodes;
  }

  evaluateCondition(condition: string, context: WorkflowContext): boolean {
    try {
      const evaluator = new Function("context", `return (${condition});`);
      return Boolean(evaluator(context));
    } catch (error) {
      logger.warn("Failed to evaluate workflow condition", {
        condition,
        error: (error as Error).message,
      });
      return false;
    }
  }

  getNode(workflow: WorkflowDefinition, nodeId: string): WorkflowNode | undefined {
    return workflow.nodes.find((node) => node.id === nodeId);
  }
}
