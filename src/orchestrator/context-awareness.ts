import { db as prisma } from "../db/client";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";
import { Category } from "./types";

export interface ConversationContext {
  sessionId: string;
  recentMessages: ConversationMessage[];
  dominantCategory?: Category;
  topicContinuity: number; // 0-1, how related current request is to recent context
  threadDepth: number;
  entities: string[]; // referenced entities across conversation
  lastAssistantResponse?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  category?: Category;
}

const CACHE_KEY_PREFIX = "context:session:";
const CACHE_TTL_SECONDS = 300;

const VALID_CATEGORIES: Set<string> = new Set<string>([
  "visual-engineering",
  "ultrabrain",
  "artistry",
  "quick",
  "unspecified-low",
  "unspecified-high",
  "writing",
]);

// Patterns for entity extraction
const FILE_NAME_PATTERN = /\b[\w-]+\.\w{1,10}\b/g;
const CAMEL_CASE_PATTERN = /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g;
const PASCAL_CASE_PATTERN = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g;

function isValidCategory(value: string): value is Category {
  return VALID_CATEGORIES.has(value);
}

/**
 * Extract notable entities from text: file names, camelCase identifiers, PascalCase components.
 */
function extractEntities(text: string): string[] {
  const entities = new Set<string>();

  const fileMatches = text.match(FILE_NAME_PATTERN);
  if (fileMatches) {
    for (const match of fileMatches) {
      // Filter out common non-entity patterns (e.g., version numbers like 1.0)
      if (!/^\d/.test(match)) {
        entities.add(match);
      }
    }
  }

  const camelMatches = text.match(CAMEL_CASE_PATTERN);
  if (camelMatches) {
    for (const match of camelMatches) {
      entities.add(match);
    }
  }

  const pascalMatches = text.match(PASCAL_CASE_PATTERN);
  if (pascalMatches) {
    for (const match of pascalMatches) {
      entities.add(match);
    }
  }

  return Array.from(entities);
}

/**
 * Tokenize text into lowercase words, filtering out short/common tokens.
 */
function tokenize(text: string): Set<string> {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
    "before", "after", "above", "below", "between", "out", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "each", "every", "both", "few", "more",
    "most", "other", "some", "such", "no", "not", "only", "own", "same",
    "so", "than", "too", "very", "just", "because", "but", "and", "or",
    "if", "while", "about", "up", "it", "its", "this", "that", "these",
    "those", "i", "me", "my", "we", "our", "you", "your", "he", "she",
    "they", "them", "what", "which", "who", "whom", "please", "thanks",
  ]);

  const words = text.toLowerCase().split(/[\s\W]+/).filter(Boolean);
  const tokens = new Set<string>();

  for (const word of words) {
    if (word.length >= 3 && !stopWords.has(word)) {
      tokens.add(word);
    }
  }

  return tokens;
}

/**
 * Compute Jaccard similarity between two sets.
 */
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  if (unionSize === 0) {
    return 0;
  }

  return intersectionSize / unionSize;
}

/**
 * Determine the most frequent category from a list of messages.
 */
function computeDominantCategory(messages: ConversationMessage[]): Category | undefined {
  const categoryCounts = new Map<Category, number>();

  for (const msg of messages) {
    if (msg.category) {
      const count = categoryCounts.get(msg.category) || 0;
      categoryCounts.set(msg.category, count + 1);
    }
  }

  if (categoryCounts.size === 0) {
    return undefined;
  }

  let dominant: Category | undefined;
  let maxCount = 0;

  for (const [category, count] of categoryCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = category;
    }
  }

  return dominant;
}

/**
 * Retrieve conversation context for a session, with Redis caching.
 *
 * Checks Redis first for a cached context. If not cached, queries the
 * OrchestratorExecution table for recent executions in the session, builds
 * ConversationMessage records from their inputData/outputData, computes
 * dominant category, extracts entities, and caches the result for 300s.
 */
export async function getConversationContext(
  sessionId: string,
  maxMessages: number = 5,
): Promise<ConversationContext> {
  logger.debug("Getting conversation context", { sessionId, maxMessages });

  // Check Redis cache first
  const cacheKey = `${CACHE_KEY_PREFIX}${sessionId}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug("Conversation context cache hit", { sessionId });
      const parsed = JSON.parse(cached) as ConversationContext;
      // Restore Date objects from serialized strings
      parsed.recentMessages = parsed.recentMessages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
      return parsed;
    }
  } catch (err) {
    logger.debug("Failed to read context cache, proceeding to DB", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.debug("Conversation context cache miss, querying DB", { sessionId });

  // Query recent executions for this session
  let executions: Array<{
    category: string;
    inputData: unknown;
    outputData: unknown;
    createdAt: Date;
  }> = [];

  try {
    executions = await prisma.orchestratorExecution.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
      take: maxMessages,
      select: {
        category: true,
        inputData: true,
        outputData: true,
        createdAt: true,
      },
    });
  } catch (err) {
    logger.debug("Failed to query orchestrator executions", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Build ConversationMessage array from execution records
  const recentMessages: ConversationMessage[] = [];

  // Reverse so oldest first for chronological order
  for (const exec of [...executions].reverse()) {
    const category = isValidCategory(exec.category) ? exec.category : undefined;
    const input = exec.inputData as Record<string, unknown> | null;
    const output = exec.outputData as Record<string, unknown> | null;

    if (input && typeof input.prompt === "string") {
      recentMessages.push({
        role: "user",
        content: input.prompt,
        timestamp: exec.createdAt,
        category,
      });
    }

    if (output && typeof output.result === "string") {
      recentMessages.push({
        role: "assistant",
        content: output.result,
        timestamp: exec.createdAt,
        category,
      });
    }
  }

  // Compute dominant category
  const dominantCategory = computeDominantCategory(recentMessages);

  // Extract entities from all messages
  const allEntities = new Set<string>();
  for (const msg of recentMessages) {
    const msgEntities = extractEntities(msg.content);
    for (const entity of msgEntities) {
      allEntities.add(entity);
    }
  }
  const entities = Array.from(allEntities);

  // Find last assistant response
  let lastAssistantResponse: string | undefined;
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    if (recentMessages[i].role === "assistant") {
      lastAssistantResponse = recentMessages[i].content;
      break;
    }
  }

  const context: ConversationContext = {
    sessionId,
    recentMessages,
    dominantCategory,
    topicContinuity: 0, // Will be computed by caller via computeTopicContinuity
    threadDepth: recentMessages.length,
    entities,
    lastAssistantResponse,
  };

  // Cache in Redis
  try {
    await redis.set(cacheKey, JSON.stringify(context), CACHE_TTL_SECONDS);
    logger.debug("Conversation context cached", { sessionId, messageCount: recentMessages.length });
  } catch (err) {
    logger.debug("Failed to cache conversation context", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return context;
}

/**
 * Compute how related the current request is to the existing conversation context.
 *
 * Uses Jaccard similarity on tokenized content, with bonuses for shared entities
 * and matching category patterns. Returns a value clamped to [0, 1].
 */
export function computeTopicContinuity(
  currentRequest: string,
  context: ConversationContext,
): number {
  if (context.recentMessages.length === 0) {
    logger.debug("No recent messages for topic continuity", { sessionId: context.sessionId });
    return 0;
  }

  // Tokenize the current request
  const currentTokens = tokenize(currentRequest);
  if (currentTokens.size === 0) {
    return 0;
  }

  // Combine tokens from all recent messages
  const contextTokens = new Set<string>();
  for (const msg of context.recentMessages) {
    const msgTokens = tokenize(msg.content);
    for (const token of msgTokens) {
      contextTokens.add(token);
    }
  }

  // Base score: Jaccard similarity
  let score = jaccardSimilarity(currentTokens, contextTokens);

  // Bonus: +0.2 if current request references entities from context
  if (context.entities.length > 0) {
    const requestLower = currentRequest.toLowerCase();
    const referencesEntity = context.entities.some(
      (entity) => requestLower.includes(entity.toLowerCase()),
    );
    if (referencesEntity) {
      score += 0.2;
    }
  }

  // Bonus: +0.1 if same category pattern
  if (context.dominantCategory) {
    const requestEntities = extractEntities(currentRequest);
    const requestTokens = tokenize(currentRequest);

    // Check if request tokens suggest the same category
    const categoryHints: Record<Category, string[]> = {
      "visual-engineering": ["ui", "component", "style", "design", "layout", "css", "frontend"],
      "ultrabrain": ["architecture", "refactor", "debug", "optimize", "complex", "system"],
      "artistry": ["creative", "brainstorm", "idea", "explore", "suggest"],
      "quick": ["check", "status", "list", "show", "get", "what"],
      "unspecified-low": [],
      "unspecified-high": [],
      "writing": ["document", "write", "readme", "explain", "describe", "doc"],
    };

    const hints = categoryHints[context.dominantCategory];
    if (hints.length > 0) {
      const matchesCategory = hints.some(
        (hint) => requestTokens.has(hint) || requestEntities.some(
          (e) => e.toLowerCase().includes(hint),
        ),
      );
      if (matchesCategory) {
        score += 0.1;
      }
    }
  }

  // Clamp to [0, 1]
  const clamped = Math.min(1, Math.max(0, score));

  logger.debug("Topic continuity computed", {
    sessionId: context.sessionId,
    score: clamped,
    currentTokenCount: currentTokens.size,
    contextEntityCount: context.entities.length,
    dominantCategory: context.dominantCategory,
  });

  return clamped;
}

/**
 * Enrich a user request with conversation context when topic continuity is high.
 *
 * If topicContinuity > 0.5 and entities are present, prepends context metadata
 * to the request string. Otherwise returns the original request unmodified.
 */
export function enrichRequestWithContext(
  userRequest: string,
  context: ConversationContext,
): string {
  if (context.topicContinuity <= 0.5 || context.entities.length === 0) {
    logger.debug("Request not enriched (low continuity or no entities)", {
      sessionId: context.sessionId,
      topicContinuity: context.topicContinuity,
      entityCount: context.entities.length,
    });
    return userRequest;
  }

  const entityList = context.entities.slice(0, 10).join(", ");
  const enriched = `[Context: Continuing discussion about ${entityList}. Previous category: ${context.dominantCategory}]\n${userRequest}`;

  logger.debug("Request enriched with context", {
    sessionId: context.sessionId,
    topicContinuity: context.topicContinuity,
    entityCount: context.entities.length,
    dominantCategory: context.dominantCategory,
  });

  return enriched;
}

/**
 * Invalidate the Redis cache for a session's conversation context.
 */
export async function invalidateContextCache(sessionId: string): Promise<void> {
  const cacheKey = `${CACHE_KEY_PREFIX}${sessionId}`;
  logger.debug("Invalidating context cache", { sessionId });

  try {
    await redis.del(cacheKey);
    logger.debug("Context cache invalidated", { sessionId });
  } catch (err) {
    logger.debug("Failed to invalidate context cache", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
