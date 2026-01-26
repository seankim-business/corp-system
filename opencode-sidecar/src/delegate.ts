import Anthropic from "@anthropic-ai/sdk";
import { DelegateTaskRequest, DelegateTaskResponse, Category } from "./types";
import { CATEGORY_MODEL_MAP, MODEL_COSTS_PER_1K, SKILL_SYSTEM_PROMPTS } from "./constants";

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

function buildSystemPrompt(skills: string[]): string {
  const basePrompt = "You are a helpful AI assistant. Respond concisely and accurately.";

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

export async function delegateTask(request: DelegateTaskRequest): Promise<DelegateTaskResponse> {
  const startTime = Date.now();
  const model = CATEGORY_MODEL_MAP[request.category] || "claude-3-5-sonnet-20241022";
  const systemPrompt = buildSystemPrompt(request.load_skills);

  try {
    const client = getAnthropicClient();

    console.log(`[${request.session_id}] Executing AI request`, {
      model,
      category: request.category,
      skills: request.load_skills,
      organizationId: request.organizationId,
      userId: request.userId,
    });

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: request.prompt,
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

    console.log(`[${request.session_id}] AI execution completed`, {
      model,
      inputTokens,
      outputTokens,
      cost: cost.toFixed(6),
      duration,
      status: "success",
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

    console.error(`[${request.session_id}] AI execution failed`, {
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
