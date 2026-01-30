import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../../utils/logger";
import { N8nWorkflowInput, N8nNode } from "./types";

export interface GenerateOptions {
  category?: string;
  complexity?: "simple" | "medium" | "complex";
  preferredNodes?: string[];
  maxNodes?: number;
}

export interface NodeSuggestion {
  type: string;
  name: string;
  description: string;
  category: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const WORKFLOW_GENERATION_SYSTEM_PROMPT = `You are an n8n workflow generator. Generate valid n8n workflow JSON based on user requirements.

N8n workflow structure:
- nodes: Array of node objects with id, name, type, typeVersion, position, parameters
- connections: Object mapping node outputs to inputs
- settings: Optional workflow settings

Common node types:
- n8n-nodes-base.httpRequest: Make HTTP requests
- n8n-nodes-base.slack: Slack operations
- n8n-nodes-base.if: Conditional logic
- n8n-nodes-base.set: Set values
- n8n-nodes-base.code: Execute JavaScript
- n8n-nodes-base.webhook: Receive webhooks (trigger)
- n8n-nodes-base.scheduleTrigger: Scheduled execution (trigger)

Rules:
1. Every workflow needs at least one trigger node (webhook or schedule)
2. Node IDs should be unique UUIDs
3. Position should be [x, y] coordinates, space nodes 200px apart
4. Return ONLY valid JSON, no markdown

Example workflow structure:
{
  "name": "Example Workflow",
  "nodes": [
    {
      "id": "uuid-here",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0],
      "parameters": {
        "path": "webhook-path",
        "httpMethod": "POST"
      }
    },
    {
      "id": "uuid-here-2",
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [200, 0],
      "parameters": {
        "method": "GET",
        "url": "https://api.example.com"
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "HTTP Request", "type": "main", "index": 0 }]]
    }
  },
  "settings": {
    "executionOrder": "v1"
  }
}`;

const NODE_SUGGESTIONS_PROMPT = `You are an n8n workflow expert. Given a description of what the user wants to accomplish, suggest the most relevant n8n nodes.

Return a JSON array of node suggestions with the following structure:
[
  {
    "type": "n8n-nodes-base.nodeName",
    "name": "Display Name",
    "description": "Brief description of what this node does",
    "category": "trigger|action|transform|utility"
  }
]

Common nodes by category:
- Triggers: webhook, scheduleTrigger, emailTrigger
- Actions: httpRequest, slack, email, googleSheets
- Transform: set, function, code, merge
- Logic: if, switch, splitInBatches
- Utility: wait, noOp, stickyNote

Return ONLY valid JSON array, no markdown.`;

export class WorkflowGeneratorService {
  private client: Anthropic;
  private model = "claude-3-5-sonnet-20241022";
  private maxRetries = 2;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.client = new Anthropic({ apiKey });
  }

  async generateWorkflow(prompt: string, options?: GenerateOptions): Promise<N8nWorkflowInput> {
    const userPrompt = this.buildGenerationPrompt(prompt, options);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: WORKFLOW_GENERATION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
        });

        const textContent = response.content.find((c) => c.type === "text");
        if (!textContent || textContent.type !== "text") {
          throw new Error("No text response from Claude");
        }

        const workflow = this.parseWorkflowJson(textContent.text);
        const validation = this.validateGeneratedWorkflow(workflow);

        if (!validation.valid) {
          throw new Error(
            `Invalid workflow: ${validation.errors.map((e) => e.message).join(", ")}`,
          );
        }

        logger.info("Workflow generated successfully", {
          name: workflow.name,
          nodeCount: workflow.nodes.length,
          attempt,
        });

        return workflow;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Workflow generation attempt ${attempt + 1} failed`, {
          error: lastError.message,
        });

        if (attempt < this.maxRetries) {
          continue;
        }
      }
    }

    logger.error("Workflow generation failed after retries", {
      error: lastError?.message,
    });
    throw lastError || new Error("Failed to generate workflow");
  }

  async refineWorkflow(
    workflowJson: N8nWorkflowInput,
    feedback: string,
  ): Promise<N8nWorkflowInput> {
    const userPrompt = `Here is an existing n8n workflow:
${JSON.stringify(workflowJson, null, 2)}

User feedback for refinement:
${feedback}

Please modify the workflow based on the feedback and return the complete updated workflow JSON. Keep the same structure but apply the requested changes.`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: WORKFLOW_GENERATION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: userPrompt,
            },
          ],
        });

        const textContent = response.content.find((c) => c.type === "text");
        if (!textContent || textContent.type !== "text") {
          throw new Error("No text response from Claude");
        }

        const workflow = this.parseWorkflowJson(textContent.text);
        const validation = this.validateGeneratedWorkflow(workflow);

        if (!validation.valid) {
          throw new Error(
            `Invalid workflow: ${validation.errors.map((e) => e.message).join(", ")}`,
          );
        }

        logger.info("Workflow refined successfully", {
          name: workflow.name,
          nodeCount: workflow.nodes.length,
        });

        return workflow;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Workflow refinement attempt ${attempt + 1} failed`, {
          error: lastError.message,
        });

        if (attempt < this.maxRetries) {
          continue;
        }
      }
    }

    logger.error("Workflow refinement failed after retries", {
      error: lastError?.message,
    });
    throw lastError || new Error("Failed to refine workflow");
  }

  async suggestNodes(description: string): Promise<NodeSuggestion[]> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: NODE_SUGGESTIONS_PROMPT,
        messages: [
          {
            role: "user",
            content: `Suggest n8n nodes for the following use case:\n${description}`,
          },
        ],
      });

      const textContent = response.content.find((c) => c.type === "text");
      if (!textContent || textContent.type !== "text") {
        throw new Error("No text response from Claude");
      }

      const suggestions = this.parseJsonResponse<NodeSuggestion[]>(textContent.text);

      logger.info("Node suggestions generated", {
        count: suggestions.length,
      });

      return suggestions;
    } catch (error) {
      logger.error("Failed to suggest nodes", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  validateGeneratedWorkflow(workflow: N8nWorkflowInput): ValidationResult {
    const errors: ValidationError[] = [];

    if (!workflow.name || typeof workflow.name !== "string") {
      errors.push({ field: "name", message: "Workflow name is required" });
    }

    if (!Array.isArray(workflow.nodes)) {
      errors.push({ field: "nodes", message: "Nodes must be an array" });
    } else {
      if (workflow.nodes.length === 0) {
        errors.push({
          field: "nodes",
          message: "Workflow must have at least one node",
        });
      }

      const hasTrigger = workflow.nodes.some(
        (node) =>
          node.type.includes("Trigger") ||
          node.type.includes("webhook") ||
          node.type === "n8n-nodes-base.webhook",
      );

      if (!hasTrigger) {
        errors.push({
          field: "nodes",
          message: "Workflow must have at least one trigger node",
        });
      }

      const nodeIds = new Set<string>();
      const nodeNames = new Set<string>();

      for (const node of workflow.nodes) {
        if (!node.id) {
          errors.push({
            field: `nodes.${node.name}.id`,
            message: "Node ID is required",
          });
        } else if (nodeIds.has(node.id)) {
          errors.push({
            field: `nodes.${node.name}.id`,
            message: "Duplicate node ID",
          });
        } else {
          nodeIds.add(node.id);
        }

        if (!node.name) {
          errors.push({
            field: "nodes.name",
            message: "Node name is required",
          });
        } else {
          nodeNames.add(node.name);
        }

        if (!node.type || typeof node.type !== "string") {
          errors.push({
            field: `nodes.${node.name}.type`,
            message: "Node type must be a valid string",
          });
        }

        if (!Array.isArray(node.position) || node.position.length !== 2) {
          errors.push({
            field: `nodes.${node.name}.position`,
            message: "Node position must be [x, y] coordinates",
          });
        }
      }

      if (workflow.connections) {
        for (const [sourceName, outputs] of Object.entries(workflow.connections)) {
          if (!nodeNames.has(sourceName)) {
            errors.push({
              field: `connections.${sourceName}`,
              message: `Connection references non-existent node: ${sourceName}`,
            });
          }

          if (outputs.main) {
            for (const connectionGroup of outputs.main) {
              for (const conn of connectionGroup) {
                if (!nodeNames.has(conn.node)) {
                  errors.push({
                    field: `connections.${sourceName}`,
                    message: `Connection targets non-existent node: ${conn.node}`,
                  });
                }
              }
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private buildGenerationPrompt(prompt: string, options?: GenerateOptions): string {
    let fullPrompt = `Generate an n8n workflow for the following requirement:\n${prompt}`;

    if (options?.category) {
      fullPrompt += `\n\nCategory: ${options.category}`;
    }

    if (options?.complexity) {
      const complexityGuide = {
        simple: "Keep the workflow simple with 2-4 nodes",
        medium: "Create a moderate workflow with 4-8 nodes",
        complex: "Create a comprehensive workflow with detailed logic",
      };
      fullPrompt += `\n\nComplexity: ${complexityGuide[options.complexity]}`;
    }

    if (options?.preferredNodes && options.preferredNodes.length > 0) {
      fullPrompt += `\n\nPreferred nodes to use: ${options.preferredNodes.join(", ")}`;
    }

    if (options?.maxNodes) {
      fullPrompt += `\n\nMaximum nodes: ${options.maxNodes}`;
    }

    fullPrompt += `\n\nGenerate unique UUIDs for each node ID. Return ONLY the JSON workflow, no explanations.`;

    return fullPrompt;
  }

  private parseWorkflowJson(text: string): N8nWorkflowInput {
    let cleanedText = text.trim();

    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }

    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }

    cleanedText = cleanedText.trim();

    const parsed = JSON.parse(cleanedText);

    if (parsed.nodes) {
      parsed.nodes = parsed.nodes.map((node: N8nNode) => ({
        ...node,
        id: node.id || uuidv4(),
        typeVersion: node.typeVersion || 1,
        parameters: node.parameters || {},
      }));
    }

    return parsed as N8nWorkflowInput;
  }

  private parseJsonResponse<T>(text: string): T {
    let cleanedText = text.trim();

    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }

    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }

    return JSON.parse(cleanedText.trim()) as T;
  }
}

export const workflowGeneratorService = new WorkflowGeneratorService();
