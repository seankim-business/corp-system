import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { db as prismaDb } from "../../db/client";
import { logger } from "../../utils/logger";
import { N8nConnections, N8nNode, N8nWorkflowInput } from "./types";

const anthropic = new Anthropic();
const n8nWorkflow = (prismaDb as unknown as Record<string, any>).n8nWorkflow as {
  create: (args: Record<string, unknown>) => Promise<any>;
};

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

const N8nNodeSchema: z.ZodType<N8nNode> = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  typeVersion: z.number(),
  position: z.tuple([z.number(), z.number()]),
  parameters: z.record(z.unknown()),
  credentials: z.record(z.object({ id: z.string(), name: z.string() })).optional(),
});

const N8nConnectionsSchema: z.ZodType<N8nConnections> = z.record(
  z.record(
    z.array(
      z.array(
        z.object({
          node: z.string(),
          type: z.string(),
          index: z.number(),
        }),
      ),
    ),
  ),
);

const N8nWorkflowSchema: z.ZodType<N8nWorkflowInput> = z.object({
  name: z.string(),
  nodes: z.array(N8nNodeSchema),
  connections: N8nConnectionsSchema,
  settings: z
    .object({
      executionOrder: z.enum(["v0", "v1"]).optional(),
    })
    .optional(),
});

export interface GenerationRequest {
  prompt: string;
  organizationId: string;
  userId: string;
  category?: string;
  availableCredentials?: string[];
}

export interface GenerationResult {
  success: boolean;
  workflow?: N8nWorkflowInput;
  error?: string;
  tokensUsed?: number;
}

const SYSTEM_PROMPT = `You are an expert n8n workflow automation engineer. Generate valid n8n workflow JSON from user descriptions.

RULES:
1. Output ONLY valid JSON - no markdown, no explanations
2. Use standard n8n-nodes-base node types
3. Use descriptive node names in kebab-case (e.g., "fetch-data", "send-notification")
4. Position nodes logically (left-to-right flow, ~300px horizontal spacing)
5. Include proper connections between nodes
6. Set executionOrder to "v1"
7. Do NOT include credentials or credential IDs in the output

COMMON NODE TYPES:
- n8n-nodes-base.webhook (trigger)
- n8n-nodes-base.scheduleTrigger (cron trigger)
- n8n-nodes-base.httpRequest (API calls)
- n8n-nodes-base.slack (Slack messages)
- n8n-nodes-base.notion (Notion operations)
- n8n-nodes-base.set (set/transform data)
- n8n-nodes-base.if (conditional branching)
- n8n-nodes-base.code (JavaScript code)
- n8n-nodes-base.respondToWebhook (webhook response)

WORKFLOW STRUCTURE:
{
  "name": "Workflow Name",
  "nodes": [...],
  "connections": {...},
  "settings": { "executionOrder": "v1" }
}`;

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
  private model = "claude-sonnet-4-20250514";
  private maxRetries = 2;

  constructor() {
    this.client = anthropic;
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    const { prompt, organizationId, userId, category, availableCredentials } = request;

    try {
      const userPrompt = this.buildUserPrompt(prompt, category, availableCredentials);

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      const content = response.content.find((block) => block.type === "text");
      if (!content || content.type !== "text") {
        return { success: false, error: "Unexpected response type" };
      }

      const jsonText = this.extractJson(content.text);
      const parsed = JSON.parse(jsonText);
      const validated = N8nWorkflowSchema.parse(parsed);
      const sanitized = this.stripCredentials(validated);

      logger.info("Workflow generated successfully", {
        organizationId,
        userId,
        workflowName: sanitized.name,
        nodeCount: sanitized.nodes.length,
      });

      return {
        success: true,
        workflow: sanitized,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      };
    } catch (error) {
      logger.error("Workflow generation failed", { organizationId, error });

      if (error instanceof z.ZodError) {
        return { success: false, error: `Invalid workflow structure: ${error.message}` };
      }
      if (error instanceof SyntaxError) {
        return { success: false, error: "Generated invalid JSON" };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async generateAndSave(
    request: GenerationRequest & { instanceId: string },
  ): Promise<{ workflowId?: string } & GenerationResult> {
    const result = await this.generate(request);

    if (!result.success || !result.workflow) {
      return result;
    }

    const workflow = await n8nWorkflow.create({
      data: {
        organizationId: request.organizationId,
        instanceId: request.instanceId,
        n8nWorkflowId: `generated_${Date.now()}`,
        name: result.workflow.name,
        description: `AI-generated: ${request.prompt.substring(0, 200)}`,
        category: request.category || "ai-generated",
        tags: ["ai-generated"],
        workflowJson: result.workflow as object,
        isActive: false,
        isSkill: false,
      },
    });

    return {
      ...result,
      workflowId: workflow.id,
    };
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

        const workflow = this.stripCredentials(this.parseWorkflowJson(textContent.text));
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

        const workflow = this.stripCredentials(this.parseWorkflowJson(textContent.text));
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

  private buildUserPrompt(
    prompt: string,
    category?: string,
    availableCredentials?: string[],
  ): string {
    let fullPrompt = `Create an n8n workflow for: ${prompt}`;

    if (category) {
      fullPrompt += `\n\nCategory: ${category}`;
    }

    if (availableCredentials?.length) {
      fullPrompt += `\n\nAvailable credentials: ${availableCredentials.join(", ")}`;
    }

    return fullPrompt;
  }

  private extractJson(text: string): string {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new SyntaxError("No JSON found in response");
    }
    return jsonMatch[0];
  }

  private stripCredentials(workflow: N8nWorkflowInput): N8nWorkflowInput {
    return {
      ...workflow,
      nodes: workflow.nodes.map(({ credentials, ...node }) => node),
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
      parsed.nodes = parsed.nodes.map(({ credentials, ...node }: N8nNode) => ({
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
export const workflowGenerator = workflowGeneratorService;
