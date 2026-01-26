import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";
import { Category } from "./types";
import { trackUsage } from "../services/cost-tracker";

export interface AIExecutionParams {
  category: Category;
  skills: string[];
  prompt: string;
  sessionId: string;
  organizationId: string;
  userId: string;
  context?: Record<string, unknown>;
}

export interface AIExecutionResult {
  output: string;
  status: "success" | "failed";
  metadata: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    duration: number;
    cost: number;
    error?: string;
  };
}

const CATEGORY_MODEL_MAP: Record<Category, string> = {
  quick: "claude-3-5-haiku-20241022",
  writing: "claude-3-5-haiku-20241022",
  "unspecified-low": "claude-3-5-haiku-20241022",
  artistry: "claude-3-5-sonnet-20241022",
  "visual-engineering": "claude-3-5-sonnet-20241022",
  "unspecified-high": "claude-3-5-sonnet-20241022",
  ultrabrain: "claude-3-5-sonnet-20241022",
};

const MODEL_COSTS_PER_1K: Record<string, { input: number; output: number }> = {
  "claude-3-5-haiku-20241022": { input: 0.001, output: 0.005 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-3-opus-20240229": { input: 0.015, output: 0.075 },
};

const SKILL_SYSTEM_PROMPTS: Record<string, string> = {
  "mcp-integration": `You are an AI assistant specialized in integrating with external tools and services via MCP (Model Context Protocol).
You can help users interact with:
- Notion: Create, read, update, delete tasks and pages
- Linear: Manage issues and projects
- GitHub: Work with repositories, issues, and pull requests
- Other MCP-enabled services

When a user asks to interact with these tools, provide clear instructions and execute the requested operations.`,

  playwright: `You are an expert in browser automation using Playwright.
You can help users with:
- Writing Playwright test scripts
- Automating browser interactions
- Web scraping and data extraction
- Screenshot capture and visual testing
- Handling dynamic content and SPAs

Provide executable Playwright code when appropriate.`,

  "git-master": `You are a Git expert who helps with version control operations.
You can assist with:
- Commit strategies and atomic commits
- Branch management and merging
- Rebasing and history management
- Resolving merge conflicts
- Git workflow best practices

Provide clear git commands and explanations.`,

  "frontend-ui-ux": `You are a senior frontend developer with strong design sensibilities.
You specialize in:
- React, Vue, Angular component development
- CSS/Tailwind styling and responsive design
- Accessibility (a11y) best practices
- Animation and interaction design
- Component architecture and state management

Provide production-ready code with modern best practices.`,
};

function buildSystemPrompt(skills: string[]): string {
  const basePrompt = `You are a helpful AI assistant. Respond concisely and accurately.`;

  if (skills.length === 0) {
    return basePrompt;
  }

  const skillPrompts = skills
    .filter((skill) => SKILL_SYSTEM_PROMPTS[skill])
    .map((skill) => SKILL_SYSTEM_PROMPTS[skill])
    .join("\n\n---\n\n");

  if (!skillPrompts) {
    return basePrompt;
  }

  return `${skillPrompts}\n\n---\n\nRemember to be helpful, accurate, and concise.`;
}

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS_PER_1K[model] || { input: 0.003, output: 0.015 };
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

export async function executeWithAI(params: AIExecutionParams): Promise<AIExecutionResult> {
  const startTime = Date.now();
  const model = CATEGORY_MODEL_MAP[params.category] || "claude-3-5-sonnet-20241022";
  const systemPrompt = buildSystemPrompt(params.skills);

  try {
    const client = getAnthropicClient();

    logger.info("Executing AI request", {
      model,
      category: params.category,
      skills: params.skills,
      sessionId: params.sessionId,
    });

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: params.prompt,
        },
      ],
    });

    const duration = Date.now() - startTime;
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const cost = calculateCost(model, inputTokens, outputTokens);

    let output = "";
    for (const block of response.content) {
      if (block.type === "text") {
        output += block.text;
      }
    }

    await trackUsage({
      organizationId: params.organizationId,
      userId: params.userId,
      sessionId: params.sessionId,
      model,
      inputTokens,
      outputTokens,
      cost,
      category: params.category,
    }).catch((err: Error) => logger.warn("Failed to track usage", { error: err.message }));

    logger.info("AI execution completed", {
      model,
      inputTokens,
      outputTokens,
      cost: cost.toFixed(6),
      duration,
    });

    return {
      output,
      status: "success",
      metadata: {
        model,
        inputTokens,
        outputTokens,
        duration,
        cost,
      },
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error("AI execution failed", {
      model,
      error: errorMessage,
      duration,
    });

    return {
      output: `AI execution failed: ${errorMessage}`,
      status: "failed",
      metadata: {
        model,
        inputTokens: 0,
        outputTokens: 0,
        duration,
        cost: 0,
        error: errorMessage,
      },
    };
  }
}
