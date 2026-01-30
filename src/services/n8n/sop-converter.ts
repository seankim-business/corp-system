import { logger } from "../../utils/logger";
import type { N8nConnections, N8nNode, N8nWorkflowInput } from "./types";

export interface StepCondition {
  field: string;
  operator: "equals" | "contains" | "greater" | "less";
  value: unknown;
  nextStep: string;
}

export interface SOPStep {
  id: string;
  order: number;
  title: string;
  description: string;
  type: "action" | "decision" | "subprocess" | "wait";
  actionType?: string;
  parameters?: Record<string, unknown>;
  nextSteps?: string[];
  conditions?: StepCondition[];
}

export interface SOPTrigger {
  type: "manual" | "schedule" | "webhook" | "event";
  config: Record<string, unknown>;
}

export interface SOPDocument {
  title: string;
  description: string;
  version: string;
  author?: string;
  createdAt?: Date;
  updatedAt?: Date;
  steps: SOPStep[];
  triggers?: SOPTrigger[];
}

export interface SOPValidationResult {
  valid: boolean;
  errors: SOPValidationError[];
  warnings: SOPValidationWarning[];
}

export interface SOPValidationError {
  field: string;
  message: string;
  stepId?: string;
}

export interface SOPValidationWarning {
  field: string;
  message: string;
  stepId?: string;
}

const NODE_X_START = 250;
const NODE_X_SPACING = 300;
const NODE_Y_START = 300;
const NODE_Y_BRANCH_OFFSET = 150;

const ACTION_TYPE_MAP: Record<string, { type: string; typeVersion: number }> = {
  http_request: { type: "n8n-nodes-base.httpRequest", typeVersion: 4 },
  send_email: { type: "n8n-nodes-base.emailSend", typeVersion: 2 },
  slack_message: { type: "n8n-nodes-base.slack", typeVersion: 2 },
  set_variable: { type: "n8n-nodes-base.set", typeVersion: 3 },
  code: { type: "n8n-nodes-base.code", typeVersion: 2 },
  filter: { type: "n8n-nodes-base.filter", typeVersion: 2 },
  merge: { type: "n8n-nodes-base.merge", typeVersion: 3 },
  split: { type: "n8n-nodes-base.splitInBatches", typeVersion: 3 },
  function: { type: "n8n-nodes-base.function", typeVersion: 2 },
  webhook_response: { type: "n8n-nodes-base.respondToWebhook", typeVersion: 1 },
};

const NODE_TYPE_TO_ACTION: Record<string, string> = {
  "n8n-nodes-base.httpRequest": "http_request",
  "n8n-nodes-base.emailSend": "send_email",
  "n8n-nodes-base.slack": "slack_message",
  "n8n-nodes-base.set": "set_variable",
  "n8n-nodes-base.code": "code",
  "n8n-nodes-base.filter": "filter",
  "n8n-nodes-base.merge": "merge",
  "n8n-nodes-base.splitInBatches": "split",
  "n8n-nodes-base.function": "function",
  "n8n-nodes-base.respondToWebhook": "webhook_response",
};

export class SOPConverterService {
  async sopToWorkflow(sop: SOPDocument): Promise<N8nWorkflowInput> {
    logger.info("Converting SOP to workflow", { title: sop.title });

    const validation = this.validateSOP(sop);
    if (!validation.valid) {
      throw new Error(
        `Invalid SOP: ${validation.errors.map((e: SOPValidationError) => e.message).join(", ")}`,
      );
    }

    const nodes: N8nNode[] = [];
    const connections: N8nConnections = {};
    const nodePositions = new Map<string, [number, number]>();
    let currentX = NODE_X_START;

    if (sop.triggers && sop.triggers.length > 0) {
      const trigger = sop.triggers[0];
      const triggerNode = this.createTriggerNode(trigger, currentX);
      nodes.push(triggerNode);
      nodePositions.set("trigger", [currentX, NODE_Y_START]);
      currentX += NODE_X_SPACING;
    }

    const sortedSteps = [...sop.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      const position = this.calculateNodePosition(step, nodePositions, currentX);
      nodePositions.set(step.id, position);

      const stepNodes = this.createNodesForStep(step, position);
      nodes.push(...stepNodes);

      if (step.type !== "decision") {
        currentX = position[0] + NODE_X_SPACING;
      }
    }

    this.createConnections(sop, nodes, connections);

    const workflow: N8nWorkflowInput = {
      name: sop.title,
      nodes,
      connections,
      settings: {
        executionOrder: "v1",
        saveDataSuccessExecution: "all",
        saveDataErrorExecution: "all",
      },
      active: false,
    };

    logger.info("SOP converted to workflow", {
      title: sop.title,
      nodeCount: nodes.length,
    });

    return workflow;
  }

  async workflowToSOP(workflow: N8nWorkflowInput): Promise<SOPDocument> {
    logger.info("Converting workflow to SOP", { name: workflow.name });

    const steps: SOPStep[] = [];
    const triggers: SOPTrigger[] = [];
    let order = 1;

    const nextStepsMap = this.buildNextStepsMap(workflow.connections);

    for (const node of workflow.nodes) {
      if (this.isTriggerNode(node)) {
        triggers.push(this.nodeToTrigger(node));
        continue;
      }

      const step = this.nodeToStep(node, order, nextStepsMap);
      steps.push(step);
      order++;
    }

    this.reorderSteps(steps, workflow.connections);

    const sop: SOPDocument = {
      title: workflow.name,
      description: this.extractDescription(workflow),
      version: "1.0.0",
      createdAt: new Date(),
      updatedAt: new Date(),
      steps,
      triggers: triggers.length > 0 ? triggers : undefined,
    };

    logger.info("Workflow converted to SOP", {
      name: workflow.name,
      stepCount: steps.length,
    });

    return sop;
  }

  validateSOP(sop: SOPDocument): SOPValidationResult {
    const errors: SOPValidationError[] = [];
    const warnings: SOPValidationWarning[] = [];

    if (!sop.title || sop.title.trim() === "") {
      errors.push({ field: "title", message: "Title is required" });
    }

    if (!sop.description || sop.description.trim() === "") {
      warnings.push({ field: "description", message: "Description is recommended" });
    }

    if (!sop.version || sop.version.trim() === "") {
      warnings.push({ field: "version", message: "Version is recommended" });
    }

    if (!sop.steps || sop.steps.length === 0) {
      errors.push({ field: "steps", message: "At least one step is required" });
    }

    const stepIds = new Set<string>();
    const referencedIds = new Set<string>();

    for (const step of sop.steps || []) {
      if (!step.id) {
        errors.push({ field: "step.id", message: "Step ID is required", stepId: step.id });
      } else if (stepIds.has(step.id)) {
        errors.push({
          field: "step.id",
          message: `Duplicate step ID: ${step.id}`,
          stepId: step.id,
        });
      } else {
        stepIds.add(step.id);
      }

      if (!step.title) {
        errors.push({ field: "step.title", message: "Step title is required", stepId: step.id });
      }

      if (!step.type) {
        errors.push({ field: "step.type", message: "Step type is required", stepId: step.id });
      } else if (!["action", "decision", "subprocess", "wait"].includes(step.type)) {
        errors.push({
          field: "step.type",
          message: `Invalid step type: ${step.type}`,
          stepId: step.id,
        });
      }

      if (step.type === "decision" && (!step.conditions || step.conditions.length === 0)) {
        warnings.push({
          field: "step.conditions",
          message: "Decision step should have conditions",
          stepId: step.id,
        });
      }

      if (step.nextSteps) {
        step.nextSteps.forEach((id) => referencedIds.add(id));
      }
      if (step.conditions) {
        step.conditions.forEach((c) => referencedIds.add(c.nextStep));
      }
    }

    for (const refId of referencedIds) {
      if (!stepIds.has(refId)) {
        errors.push({
          field: "nextSteps",
          message: `Referenced step not found: ${refId}`,
        });
      }
    }

    if (sop.triggers) {
      for (const trigger of sop.triggers) {
        if (!["manual", "schedule", "webhook", "event"].includes(trigger.type)) {
          errors.push({
            field: "trigger.type",
            message: `Invalid trigger type: ${trigger.type}`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  parseMarkdownSOP(markdown: string): SOPDocument {
    logger.info("Parsing markdown SOP");

    const lines = markdown.split("\n");
    let title = "";
    let description = "";
    let version = "1.0.0";
    const steps: SOPStep[] = [];
    const triggers: SOPTrigger[] = [];

    let currentSection = "";
    let currentStep: Partial<SOPStep> | null = null;
    let currentTrigger: Partial<SOPTrigger> | null = null;
    let stepOrder = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith("# SOP:") || line.startsWith("# ")) {
        title = line.replace(/^#\s*(SOP:\s*)?/, "").trim();
        continue;
      }

      if (line.startsWith("## ")) {
        if (currentStep && currentStep.id) {
          steps.push(this.finalizeStep(currentStep, stepOrder++));
          currentStep = null;
        }

        const sectionName = line.replace("## ", "").toLowerCase();
        if (sectionName === "description") {
          currentSection = "description";
        } else if (sectionName === "trigger" || sectionName === "triggers") {
          currentSection = "trigger";
          currentTrigger = { config: {} };
        } else if (sectionName === "steps") {
          currentSection = "steps";
        } else if (sectionName.startsWith("version")) {
          version = sectionName.replace("version:", "").trim() || "1.0.0";
        }
        continue;
      }

      if (line.startsWith("### ") && currentSection === "steps") {
        if (currentStep && currentStep.id) {
          steps.push(this.finalizeStep(currentStep, stepOrder++));
        }

        const stepTitle = line.replace(/^###\s*\d*\.?\s*/, "").trim();
        const stepId = `step_${stepOrder}`;
        currentStep = {
          id: stepId,
          title: stepTitle,
          description: "",
          type: "action",
          parameters: {},
        };
        continue;
      }

      if (currentSection === "description" && line && !line.startsWith("#")) {
        description += (description ? " " : "") + line;
      }

      if (currentSection === "trigger" && line.startsWith("- ")) {
        const [key, ...valueParts] = line.replace("- ", "").split(":");
        const value = valueParts.join(":").trim();

        if (key.toLowerCase() === "type") {
          currentTrigger!.type = value.toLowerCase() as SOPTrigger["type"];
        } else if (key.toLowerCase() === "config") {
          try {
            currentTrigger!.config = JSON.parse(value);
          } catch {
            currentTrigger!.config = { raw: value };
          }
        } else {
          currentTrigger!.config = currentTrigger!.config || {};
          (currentTrigger!.config as Record<string, unknown>)[key.toLowerCase()] = value;
        }
      }

      if (currentStep && line.startsWith("- ")) {
        this.parseStepProperty(line, currentStep);
      }
    }

    if (currentStep && currentStep.id) {
      steps.push(this.finalizeStep(currentStep, stepOrder));
    }

    if (currentTrigger && currentTrigger.type) {
      triggers.push(currentTrigger as SOPTrigger);
    }

    const sop: SOPDocument = {
      title: title || "Untitled SOP",
      description: description || "",
      version,
      createdAt: new Date(),
      updatedAt: new Date(),
      steps,
      triggers: triggers.length > 0 ? triggers : undefined,
    };

    logger.info("Markdown SOP parsed", {
      title: sop.title,
      stepCount: sop.steps.length,
    });

    return sop;
  }

  sopToMarkdown(sop: SOPDocument): string {
    const lines: string[] = [];

    lines.push(`# SOP: ${sop.title}`);
    lines.push("");

    if (sop.version) {
      lines.push(`## Version: ${sop.version}`);
      lines.push("");
    }

    lines.push("## Description");
    lines.push(sop.description || "No description provided.");
    lines.push("");

    if (sop.triggers && sop.triggers.length > 0) {
      lines.push("## Trigger");
      for (const trigger of sop.triggers) {
        lines.push(`- Type: ${trigger.type}`);
        if (Object.keys(trigger.config).length > 0) {
          lines.push(`- Config: ${JSON.stringify(trigger.config)}`);
        }
      }
      lines.push("");
    }

    lines.push("## Steps");
    lines.push("");

    for (const step of sop.steps) {
      lines.push(`### ${step.order}. ${step.title}`);
      lines.push(`- Type: ${step.type}`);

      if (step.actionType) {
        lines.push(`- Action: ${step.actionType}`);
      }

      if (step.description) {
        lines.push(`- Description: ${step.description}`);
      }

      if (step.parameters && Object.keys(step.parameters).length > 0) {
        lines.push("- Parameters:");
        for (const [key, value] of Object.entries(step.parameters)) {
          lines.push(`  - ${key}: ${JSON.stringify(value)}`);
        }
      }

      if (step.type === "decision" && step.conditions) {
        for (const condition of step.conditions) {
          lines.push(
            `- Condition: ${condition.field} ${condition.operator} ${JSON.stringify(condition.value)}`,
          );
          lines.push(`  - If true: ${condition.nextStep}`);
        }
      }

      if (step.nextSteps && step.nextSteps.length > 0) {
        lines.push(`- Next: ${step.nextSteps.join(", ")}`);
      }

      lines.push("");
    }

    return lines.join("\n");
  }

  private createTriggerNode(trigger: SOPTrigger, x: number): N8nNode {
    const typeMap: Record<string, { type: string; typeVersion: number }> = {
      manual: { type: "n8n-nodes-base.manualTrigger", typeVersion: 1 },
      schedule: { type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1 },
      webhook: { type: "n8n-nodes-base.webhook", typeVersion: 2 },
      event: { type: "n8n-nodes-base.n8nTrigger", typeVersion: 1 },
    };

    const nodeType = typeMap[trigger.type] || typeMap.manual;

    return {
      id: "trigger_node",
      name: `${trigger.type.charAt(0).toUpperCase() + trigger.type.slice(1)} Trigger`,
      type: nodeType.type,
      typeVersion: nodeType.typeVersion,
      position: [x, NODE_Y_START],
      parameters: trigger.config,
    };
  }

  private calculateNodePosition(
    step: SOPStep,
    positions: Map<string, [number, number]>,
    currentX: number,
  ): [number, number] {
    if (step.type === "decision") {
      return [currentX, NODE_Y_START];
    }

    let branchIndex = 0;
    for (const [, pos] of positions) {
      if (pos[0] === currentX) {
        branchIndex++;
      }
    }

    const yOffset = branchIndex > 0 ? branchIndex * NODE_Y_BRANCH_OFFSET : 0;
    return [currentX, NODE_Y_START + yOffset];
  }

  private createNodesForStep(step: SOPStep, position: [number, number]): N8nNode[] {
    const nodes: N8nNode[] = [];
    const nodeName = this.sanitizeNodeName(step.title);

    switch (step.type) {
      case "action": {
        const actionInfo = ACTION_TYPE_MAP[step.actionType || "code"] || {
          type: "n8n-nodes-base.noOp",
          typeVersion: 1,
        };

        nodes.push({
          id: step.id,
          name: nodeName,
          type: actionInfo.type,
          typeVersion: actionInfo.typeVersion,
          position,
          parameters: step.parameters || {},
          notes: step.description,
        });
        break;
      }

      case "decision": {
        nodes.push({
          id: step.id,
          name: nodeName,
          type: "n8n-nodes-base.if",
          typeVersion: 2,
          position,
          parameters: this.buildIfNodeParameters(step.conditions || []),
          notes: step.description,
        });
        break;
      }

      case "subprocess": {
        nodes.push({
          id: step.id,
          name: nodeName,
          type: "n8n-nodes-base.executeWorkflow",
          typeVersion: 1,
          position,
          parameters: {
            workflowId: step.parameters?.workflowId || "",
            ...step.parameters,
          },
          notes: step.description,
        });
        break;
      }

      case "wait": {
        nodes.push({
          id: step.id,
          name: nodeName,
          type: "n8n-nodes-base.wait",
          typeVersion: 1,
          position,
          parameters: {
            unit: step.parameters?.unit || "seconds",
            amount: step.parameters?.duration || 1,
            ...step.parameters,
          },
          notes: step.description,
        });
        break;
      }
    }

    return nodes;
  }

  private buildIfNodeParameters(conditions: StepCondition[]): Record<string, unknown> {
    if (conditions.length === 0) {
      return {
        conditions: {
          boolean: [{ leftValue: "", rightValue: "" }],
        },
      };
    }

    const condition = conditions[0];
    const operatorMap: Record<string, string> = {
      equals: "equal",
      contains: "contains",
      greater: "larger",
      less: "smaller",
    };

    return {
      conditions: {
        string: [
          {
            value1: `={{ $json["${condition.field}"] }}`,
            operation: operatorMap[condition.operator] || "equal",
            value2: String(condition.value),
          },
        ],
      },
    };
  }

  private createConnections(sop: SOPDocument, nodes: N8nNode[], connections: N8nConnections): void {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    const triggerNode = nodes.find((n) => n.id === "trigger_node");
    const sortedSteps = [...sop.steps].sort((a, b) => a.order - b.order);

    if (triggerNode && sortedSteps.length > 0) {
      const firstStep = sortedSteps[0];
      const firstStepNode = nodeMap.get(firstStep.id);
      if (firstStepNode) {
        connections[triggerNode.name] = {
          main: [[{ node: firstStepNode.name, type: "main", index: 0 }]],
        };
      }
    }

    for (const step of sop.steps) {
      const sourceNode = nodeMap.get(step.id);
      if (!sourceNode) continue;

      if (step.type === "decision" && step.conditions) {
        const trueConnections: { node: string; type: string; index: number }[] = [];
        const falseConnections: { node: string; type: string; index: number }[] = [];

        for (const condition of step.conditions) {
          const targetNode = nodeMap.get(condition.nextStep);
          if (targetNode) {
            trueConnections.push({ node: targetNode.name, type: "main", index: 0 });
          }
        }

        if (step.nextSteps) {
          for (const nextId of step.nextSteps) {
            if (!step.conditions.some((c) => c.nextStep === nextId)) {
              const targetNode = nodeMap.get(nextId);
              if (targetNode) {
                falseConnections.push({ node: targetNode.name, type: "main", index: 0 });
              }
            }
          }
        }

        connections[sourceNode.name] = {
          main: [trueConnections, falseConnections],
        };
      } else if (step.nextSteps && step.nextSteps.length > 0) {
        const targetConnections: { node: string; type: string; index: number }[] = [];

        for (const nextId of step.nextSteps) {
          const targetNode = nodeMap.get(nextId);
          if (targetNode) {
            targetConnections.push({ node: targetNode.name, type: "main", index: 0 });
          }
        }

        if (targetConnections.length > 0) {
          connections[sourceNode.name] = {
            main: [targetConnections],
          };
        }
      }
    }
  }

  private sanitizeNodeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9\s_-]/g, "").trim();
  }

  private isTriggerNode(node: N8nNode): boolean {
    const triggerTypes = [
      "n8n-nodes-base.manualTrigger",
      "n8n-nodes-base.scheduleTrigger",
      "n8n-nodes-base.webhook",
      "n8n-nodes-base.n8nTrigger",
      "n8n-nodes-base.cronTrigger",
    ];
    return triggerTypes.some((t) => node.type.includes(t) || node.type.endsWith("Trigger"));
  }

  private nodeToTrigger(node: N8nNode): SOPTrigger {
    let type: SOPTrigger["type"] = "manual";

    if (node.type.includes("schedule") || node.type.includes("cron")) {
      type = "schedule";
    } else if (node.type.includes("webhook")) {
      type = "webhook";
    } else if (node.type.includes("n8nTrigger")) {
      type = "event";
    }

    return {
      type,
      config: node.parameters,
    };
  }

  private nodeToStep(node: N8nNode, order: number, nextStepsMap: Map<string, string[]>): SOPStep {
    let type: SOPStep["type"] = "action";
    let conditions: StepCondition[] | undefined;

    if (node.type === "n8n-nodes-base.if") {
      type = "decision";
      conditions = this.extractConditions(node);
    } else if (node.type === "n8n-nodes-base.executeWorkflow") {
      type = "subprocess";
    } else if (node.type === "n8n-nodes-base.wait") {
      type = "wait";
    }

    const actionType = NODE_TYPE_TO_ACTION[node.type];
    const nextSteps = nextStepsMap.get(node.name);

    return {
      id: node.id,
      order,
      title: node.name,
      description: node.notes || this.generateDescription(node),
      type,
      actionType,
      parameters: node.parameters,
      nextSteps,
      conditions,
    };
  }

  private extractConditions(node: N8nNode): StepCondition[] {
    const conditions: StepCondition[] = [];
    const params = node.parameters as Record<string, unknown>;

    if (params.conditions && typeof params.conditions === "object") {
      const conds = params.conditions as Record<string, unknown[]>;

      for (const [, condArray] of Object.entries(conds)) {
        if (Array.isArray(condArray)) {
          for (const cond of condArray) {
            const c = cond as Record<string, unknown>;
            const field = String(c.value1 || c.leftValue || "").replace(
              /^\{\{\s*\$json\["?|"?\]\s*\}\}$/g,
              "",
            );

            const operatorMap: Record<string, StepCondition["operator"]> = {
              equal: "equals",
              contains: "contains",
              larger: "greater",
              smaller: "less",
            };

            conditions.push({
              field,
              operator: operatorMap[String(c.operation)] || "equals",
              value: c.value2 || c.rightValue,
              nextStep: "",
            });
          }
        }
      }
    }

    return conditions;
  }

  private generateDescription(node: N8nNode): string {
    const typeDescriptions: Record<string, string> = {
      "n8n-nodes-base.httpRequest": "Makes an HTTP request",
      "n8n-nodes-base.emailSend": "Sends an email",
      "n8n-nodes-base.slack": "Sends a Slack message",
      "n8n-nodes-base.set": "Sets variables",
      "n8n-nodes-base.code": "Executes custom code",
      "n8n-nodes-base.if": "Evaluates a condition",
      "n8n-nodes-base.wait": "Waits for a specified duration",
      "n8n-nodes-base.executeWorkflow": "Executes another workflow",
    };

    return typeDescriptions[node.type] || `Executes ${node.type}`;
  }

  private buildNextStepsMap(connections: N8nConnections): Map<string, string[]> {
    const map = new Map<string, string[]>();

    for (const [sourceName, outputs] of Object.entries(connections)) {
      const nextSteps: string[] = [];

      if (outputs.main) {
        for (const branch of outputs.main) {
          if (Array.isArray(branch)) {
            for (const conn of branch) {
              if (conn.node && !nextSteps.includes(conn.node)) {
                nextSteps.push(conn.node);
              }
            }
          }
        }
      }

      if (nextSteps.length > 0) {
        map.set(sourceName, nextSteps);
      }
    }

    return map;
  }

  private reorderSteps(steps: SOPStep[], connections: N8nConnections): void {
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();

    for (const step of steps) {
      inDegree.set(step.id, 0);
      outEdges.set(step.id, []);
    }

    for (const [, outputs] of Object.entries(connections)) {
      if (outputs.main) {
        for (const branch of outputs.main) {
          if (Array.isArray(branch)) {
            for (const conn of branch) {
              const targetStep = steps.find((s) => s.title === conn.node);
              if (targetStep) {
                inDegree.set(targetStep.id, (inDegree.get(targetStep.id) || 0) + 1);
              }
            }
          }
        }
      }
    }

    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    let order = 1;
    while (queue.length > 0) {
      const id = queue.shift()!;
      const step = steps.find((s) => s.id === id);
      if (step) {
        step.order = order++;
      }

      const edges = outEdges.get(id) || [];
      for (const nextId of edges) {
        const newDegree = (inDegree.get(nextId) || 1) - 1;
        inDegree.set(nextId, newDegree);
        if (newDegree === 0) {
          queue.push(nextId);
        }
      }
    }

    steps.sort((a, b) => a.order - b.order);
  }

  private extractDescription(workflow: N8nWorkflowInput): string {
    if (workflow.staticData && typeof workflow.staticData === "object") {
      const data = workflow.staticData as Record<string, unknown>;
      if (data.description) {
        return String(data.description);
      }
    }

    const firstNode = workflow.nodes.find((n) => !this.isTriggerNode(n));
    if (firstNode?.notes) {
      return firstNode.notes;
    }

    return `Workflow: ${workflow.name}`;
  }

  private parseStepProperty(line: string, step: Partial<SOPStep>): void {
    const content = line.replace("- ", "").trim();
    const [key, ...valueParts] = content.split(":");
    const value = valueParts.join(":").trim();

    switch (key.toLowerCase()) {
      case "type":
        step.type = value.toLowerCase() as SOPStep["type"];
        break;
      case "action":
        step.actionType = value.toLowerCase();
        break;
      case "description":
        step.description = value;
        break;
      case "next":
        step.nextSteps = value.split(",").map((s) => s.trim());
        break;
      case "condition": {
        if (!step.conditions) {
          step.conditions = [];
        }
        const condMatch = value.match(/(\S+)\s*(==|!=|>|<|contains)\s*(\S+)/);
        if (condMatch) {
          const operatorMap: Record<string, StepCondition["operator"]> = {
            "==": "equals",
            contains: "contains",
            ">": "greater",
            "<": "less",
          };
          step.conditions.push({
            field: condMatch[1],
            operator: operatorMap[condMatch[2]] || "equals",
            value: condMatch[3],
            nextStep: "",
          });
        }
        break;
      }
      case "if true":
        if (step.conditions && step.conditions.length > 0) {
          step.conditions[step.conditions.length - 1].nextStep = value;
        }
        break;
      case "parameters":
        step.parameters = step.parameters || {};
        break;
      default:
        if (line.startsWith("  - ") && step.parameters) {
          const [paramKey, ...paramValueParts] = content.split(":");
          step.parameters[paramKey.trim()] = paramValueParts.join(":").trim();
        }
    }
  }

  private finalizeStep(partial: Partial<SOPStep>, order: number): SOPStep {
    return {
      id: partial.id || `step_${order}`,
      order,
      title: partial.title || `Step ${order}`,
      description: partial.description || "",
      type: partial.type || "action",
      actionType: partial.actionType,
      parameters: partial.parameters,
      nextSteps: partial.nextSteps,
      conditions: partial.conditions,
    };
  }
}

export const sopConverterService = new SOPConverterService();
