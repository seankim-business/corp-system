import { logger } from "../../utils/logger";
import { N8nConnections, N8nNode, N8nWorkflowInput } from "./types";

interface SOPStep {
  id: string;
  order: number;
  title: string;
  description: string;
  type: "action" | "approval" | "notification" | "condition";
  config?: {
    tool?: string;
    action?: string;
    approvers?: string[];
    notifyChannels?: string[];
    condition?: string;
  };
}

const SOP_METADATA_KEY = "sopMetadata";

export class SOPConverter {
  private nodeIdCounter = 0;

  sopToN8n(sopSteps: SOPStep[], workflowName: string): N8nWorkflowInput {
    logger.info("Converting SOP steps to n8n workflow", {
      workflowName,
      stepCount: sopSteps.length,
    });
    this.nodeIdCounter = 0;
    const nodes: N8nNode[] = [];
    const connections: N8nConnections = {};

    const triggerNode = this.createTriggerNode();
    nodes.push(triggerNode);

    let previousNodeName = triggerNode.name;
    const usedNodeNames = new Set<string>([triggerNode.name]);

    const sortedSteps = [...sopSteps].sort((a, b) => a.order - b.order);
    for (const step of sortedSteps) {
      const node = this.stepToNode(step, nodes.length, usedNodeNames);
      nodes.push(node);

      if (!connections[previousNodeName]) {
        connections[previousNodeName] = { main: [[]] };
      }
      connections[previousNodeName].main[0].push({
        node: node.name,
        type: "main",
        index: 0,
      });

      previousNodeName = node.name;
    }

    const respondNode = this.createRespondNode(nodes.length);
    nodes.push(respondNode);

    if (!connections[previousNodeName]) {
      connections[previousNodeName] = { main: [[]] };
    }
    connections[previousNodeName].main[0].push({
      node: respondNode.name,
      type: "main",
      index: 0,
    });

    return {
      name: workflowName,
      nodes,
      connections,
      settings: { executionOrder: "v1" },
    };
  }

  n8nToSop(workflowJson: N8nWorkflowInput): SOPStep[] {
    logger.info("Converting n8n workflow to SOP steps", {
      workflowName: workflowJson.name,
      nodeCount: workflowJson.nodes.length,
    });
    const steps: SOPStep[] = [];
    const { nodes, connections } = workflowJson;

    const nodeOrder = this.getNodeExecutionOrder(nodes, connections);

    let order = 1;
    for (const nodeName of nodeOrder) {
      const node = nodes.find((n) => n.name === nodeName);
      if (!node) continue;

      if (this.isTriggerNode(node) || this.isResponseNode(node)) {
        continue;
      }

      const step = this.nodeToStep(node, order);
      if (step) {
        steps.push(step);
        order++;
      }
    }

    return steps;
  }

  private createTriggerNode(): N8nNode {
    return {
      id: this.generateId(),
      name: "trigger-webhook",
      type: "n8n-nodes-base.webhook",
      typeVersion: 1,
      position: [250, 300],
      parameters: {
        httpMethod: "POST",
        path: "sop-trigger",
        responseMode: "responseNode",
      },
    };
  }

  private createRespondNode(index: number): N8nNode {
    return {
      id: this.generateId(),
      name: "respond-success",
      type: "n8n-nodes-base.respondToWebhook",
      typeVersion: 1,
      position: [250 + index * 300, 300],
      parameters: {
        respondWith: "json",
        responseBody: '={{ { "success": true, "message": "SOP completed" } }}',
      },
    };
  }

  private stepToNode(step: SOPStep, index: number, usedNodeNames: Set<string>): N8nNode {
    const basePosition: [number, number] = [250 + index * 300, 300];
    const baseName = this.sanitizeNodeName(step.title) || `step-${step.order}`;
    const nodeName = this.ensureUniqueNodeName(baseName, usedNodeNames);

    switch (step.type) {
      case "action":
        return this.attachSopMetadata(this.createActionNode(step, nodeName, basePosition), step);
      case "approval":
        return this.attachSopMetadata(this.createApprovalNode(step, nodeName, basePosition), step);
      case "notification":
        return this.attachSopMetadata(
          this.createNotificationNode(step, nodeName, basePosition),
          step,
        );
      case "condition":
        return this.attachSopMetadata(this.createConditionNode(step, nodeName, basePosition), step);
      default:
        return this.attachSopMetadata(this.createSetNode(step, nodeName, basePosition), step);
    }
  }

  private createActionNode(step: SOPStep, name: string, position: [number, number]): N8nNode {
    return {
      id: this.generateId(),
      name,
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 3,
      position,
      parameters: {
        method: "POST",
        url: step.config?.action || '={{ $json.actionUrl || "https://api.example.com/action" }}',
        options: {},
      },
    };
  }

  private createApprovalNode(step: SOPStep, name: string, position: [number, number]): N8nNode {
    return {
      id: this.generateId(),
      name,
      type: "n8n-nodes-base.wait",
      typeVersion: 1,
      position,
      parameters: {
        resume: "webhook",
        options: {
          webhookSuffix: `approval-${step.id}`,
        },
      },
    };
  }

  private createNotificationNode(step: SOPStep, name: string, position: [number, number]): N8nNode {
    return {
      id: this.generateId(),
      name,
      type: "n8n-nodes-base.slack",
      typeVersion: 2,
      position,
      parameters: {
        operation: "sendMessage",
        channel: step.config?.notifyChannels?.[0] || "#general",
        text: step.description,
      },
    };
  }

  private createConditionNode(step: SOPStep, name: string, position: [number, number]): N8nNode {
    return {
      id: this.generateId(),
      name,
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position,
      parameters: {
        conditions: {
          string: [
            {
              value1: step.config?.condition || "={{ $json.condition }}",
              value2: "true",
            },
          ],
        },
      },
    };
  }

  private createSetNode(step: SOPStep, name: string, position: [number, number]): N8nNode {
    return {
      id: this.generateId(),
      name,
      type: "n8n-nodes-base.set",
      typeVersion: 1,
      position,
      parameters: {
        values: {
          string: [
            {
              name: "step",
              value: step.title,
            },
          ],
        },
      },
    };
  }

  private nodeToStep(node: N8nNode, order: number): SOPStep | null {
    const metadata = this.getSopMetadata(node);
    const derivedType = this.mapNodeTypeToStepType(node.type);
    const config = metadata?.config ?? this.extractConfigFromNode(node);

    const baseStep: SOPStep = {
      id: metadata?.id || node.id,
      order,
      title: metadata?.title || this.humanizeNodeName(node.name),
      description: metadata?.description || node.notes || `Step: ${node.name}`,
      type: metadata?.type || derivedType,
      config,
    };

    return baseStep;
  }

  private getNodeExecutionOrder(nodes: N8nNode[], connections: N8nConnections): string[] {
    const order: string[] = [];
    const visited = new Set<string>();

    const triggerNode = nodes.find((n) => this.isTriggerNode(n));
    if (!triggerNode) {
      logger.warn("No trigger node found; returning nodes in declared order.");
      return nodes.map((n) => n.name);
    }

    const traverse = (nodeName: string) => {
      if (visited.has(nodeName)) return;
      visited.add(nodeName);
      order.push(nodeName);

      const nodeConnections = connections[nodeName]?.main || [];
      const hasBranchOutputs =
        nodeConnections.length > 1 && nodeConnections.slice(1).some((output) => output.length > 0);
      const firstOutput = nodeConnections[0] || [];

      if (hasBranchOutputs || firstOutput.length > 1) {
        logger.warn("Branching detected; only the first path will be converted.", {
          node: nodeName,
          outputs: nodeConnections.length,
          firstOutputConnections: firstOutput.length,
        });
      }

      const nextConnection = firstOutput[0];
      if (nextConnection) {
        traverse(nextConnection.node);
      }
    };

    traverse(triggerNode.name);
    return order;
  }

  private isTriggerNode(node: N8nNode): boolean {
    return node.type.includes("Trigger") || node.type === "n8n-nodes-base.webhook";
  }

  private isResponseNode(node: N8nNode): boolean {
    return node.type === "n8n-nodes-base.respondToWebhook";
  }

  private generateId(): string {
    return `node_${++this.nodeIdCounter}_${Date.now()}`;
  }

  private sanitizeNodeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private humanizeNodeName(name: string): string {
    return name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private ensureUniqueNodeName(baseName: string, usedNodeNames: Set<string>): string {
    const normalizedBase = baseName || "step";
    if (!usedNodeNames.has(normalizedBase)) {
      usedNodeNames.add(normalizedBase);
      return normalizedBase;
    }

    let suffix = 1;
    let candidate = `${normalizedBase}-${suffix}`;
    while (usedNodeNames.has(candidate)) {
      suffix += 1;
      candidate = `${normalizedBase}-${suffix}`;
    }

    usedNodeNames.add(candidate);
    return candidate;
  }

  private attachSopMetadata(node: N8nNode, step: SOPStep): N8nNode {
    return {
      ...node,
      notes: step.description,
      parameters: {
        ...node.parameters,
        [SOP_METADATA_KEY]: {
          id: step.id,
          order: step.order,
          title: step.title,
          description: step.description,
          type: step.type,
          config: step.config || {},
        },
      },
    };
  }

  private getSopMetadata(node: N8nNode): SOPStep | null {
    const metadata = (node.parameters as Record<string, unknown> | undefined)?.[SOP_METADATA_KEY];
    if (!metadata || typeof metadata !== "object") {
      return null;
    }

    return metadata as SOPStep;
  }

  private mapNodeTypeToStepType(nodeType: string): SOPStep["type"] {
    switch (nodeType) {
      case "n8n-nodes-base.wait":
        return "approval";
      case "n8n-nodes-base.slack":
      case "n8n-nodes-base.email":
        return "notification";
      case "n8n-nodes-base.if":
      case "n8n-nodes-base.switch":
        return "condition";
      default:
        return "action";
    }
  }

  private extractConfigFromNode(node: N8nNode): SOPStep["config"] | undefined {
    const parameters = node.parameters as Record<string, unknown> | undefined;

    switch (node.type) {
      case "n8n-nodes-base.httpRequest": {
        const url = parameters?.url;
        return {
          tool: "httpRequest",
          action: typeof url === "string" ? url : undefined,
        };
      }
      case "n8n-nodes-base.slack": {
        const channel = parameters?.channel;
        return {
          notifyChannels: typeof channel === "string" ? [channel] : undefined,
        };
      }
      case "n8n-nodes-base.if": {
        const conditions = parameters?.conditions as
          | { string?: Array<{ value1?: string; value2?: string }> }
          | undefined;
        const condition = conditions?.string?.[0]?.value1;
        return {
          condition: typeof condition === "string" ? condition : undefined,
        };
      }
      default:
        return undefined;
    }
  }
}

export const sopConverter = new SOPConverter();
