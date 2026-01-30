import Anthropic from "@anthropic-ai/sdk";
import { Category } from "./types";
import { logger } from "../utils/logger";
import { getOrganizationApiKey } from "../api/organization-settings";

/**
 * LLM-based routing fallback for when keyword matching
 * is not confident enough to categorize a user request.
 *
 * Uses a fast/cheap model to classify the request into
 * one of the defined Category types with a confidence score.
 */

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  quick: "Simple questions, lookups, quick operations",
  writing: "Documentation, content creation, text work",
  artistry: "Creative solutions, brainstorming",
  "visual-engineering": "UI/UX, frontend, design systems",
  ultrabrain: "Complex reasoning, architecture, deep debugging",
  "unspecified-low": "General low-complexity tasks",
  "unspecified-high": "General high-complexity tasks",
};

const VALID_CATEGORIES: Category[] = [
  "quick",
  "writing",
  "artistry",
  "visual-engineering",
  "ultrabrain",
  "unspecified-low",
  "unspecified-high",
];

const CLASSIFICATION_SYSTEM_PROMPT = `You are a request classifier. Your job is to categorize a user request into exactly one of the following categories:

${Object.entries(CATEGORY_DESCRIPTIONS)
  .map(([cat, desc]) => `- "${cat}": ${desc}`)
  .join("\n")}

Respond with ONLY a JSON object in this exact format (no markdown, no code fences, no extra text):
{"category": "<category_name>", "confidence": <0.0_to_1.0>, "reasoning": "<brief_explanation>"}

Rules:
- "confidence" must be a number between 0.0 and 1.0
- Choose "unspecified-low" if the request is vague but seems simple
- Choose "unspecified-high" if the request is vague but seems complex
- Be precise with the category name - it must match one of the listed categories exactly`;

const CLASSIFICATION_MODEL = "claude-3-5-haiku-20241022";

export interface ClassificationResult {
  category: Category;
  confidence: number;
  reasoning: string;
}

const DEFAULT_RESULT: ClassificationResult = {
  category: "unspecified-low",
  confidence: 0.1,
  reasoning: "Failed to classify request; defaulting to unspecified-low",
};

function isValidCategory(value: string): value is Category {
  return VALID_CATEGORIES.includes(value as Category);
}

function parseClassificationResponse(text: string): ClassificationResult | null {
  try {
    // Strip potential markdown code fences
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed: unknown = JSON.parse(cleaned);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    const obj = parsed as Record<string, unknown>;

    const category = obj.category;
    const confidence = obj.confidence;
    const reasoning = obj.reasoning;

    if (typeof category !== "string" || !isValidCategory(category)) {
      logger.warn("LLM router returned invalid category", {
        category: String(category),
      });
      return null;
    }

    if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
      logger.warn("LLM router returned invalid confidence", {
        confidence: String(confidence),
      });
      return null;
    }

    const reasoningStr =
      typeof reasoning === "string" ? reasoning : "No reasoning provided";

    return {
      category,
      confidence,
      reasoning: reasoningStr,
    };
  } catch (_error: unknown) {
    logger.warn("Failed to parse LLM classification response", {
      responseText: text.slice(0, 200),
    });
    return null;
  }
}

async function getAnthropicClientForOrg(
  organizationId: string,
): Promise<Anthropic> {
  const apiKey = await getOrganizationApiKey(
    organizationId,
    "anthropicApiKey",
  );

  if (!apiKey) {
    const envKey = process.env.ANTHROPIC_API_KEY;
    if (!envKey) {
      throw new Error(
        "No Anthropic API key available. Configure one in organization settings or set ANTHROPIC_API_KEY.",
      );
    }
    return new Anthropic({ apiKey: envKey });
  }

  return new Anthropic({ apiKey });
}

/**
 * Classify a user request into a Category using an LLM call.
 *
 * This is intended as a fallback when keyword-based matching
 * does not produce a confident result. It uses a fast/cheap
 * model (Haiku) to keep latency and cost low.
 *
 * @param userRequest - The raw user request string to classify
 * @param organizationId - The organization ID for API key lookup
 * @returns A classification result with category, confidence, and reasoning
 */
export async function classifyWithLLM(
  userRequest: string,
  organizationId: string,
): Promise<ClassificationResult> {
  if (!userRequest.trim()) {
    logger.warn("LLM router received empty request");
    return { ...DEFAULT_RESULT, reasoning: "Empty request" };
  }

  try {
    const client = await getAnthropicClientForOrg(organizationId);

    logger.debug("LLM router classifying request", {
      organizationId,
      requestLength: userRequest.length,
      model: CLASSIFICATION_MODEL,
    });

    const response = await client.messages.create({
      model: CLASSIFICATION_MODEL,
      max_tokens: 256,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: userRequest,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("LLM router received no text in response");
      return DEFAULT_RESULT;
    }

    const result = parseClassificationResponse(textBlock.text);
    if (!result) {
      logger.warn("LLM router could not parse response", {
        rawResponse: textBlock.text.slice(0, 200),
      });
      return DEFAULT_RESULT;
    }

    logger.info("LLM router classified request", {
      organizationId,
      category: result.category,
      confidence: result.confidence,
    });

    return result;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    logger.error("LLM router classification failed", {
      organizationId,
      error: message,
    });

    return {
      ...DEFAULT_RESULT,
      reasoning: `Classification error: ${message}`,
    };
  }
}
