import { RequestAnalysis } from "./types";
import * as chrono from "chrono-node";
import { format, isValid } from "date-fns";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// LLM Configuration
// ---------------------------------------------------------------------------

const LLM_CONFIDENCE_THRESHOLD = 0.8; // Use LLM when regex confidence < this
const LLM_MODEL = "claude-3-5-haiku-20241022";
const LLM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// LLM Classification Cache
interface CachedLLMClassification {
  intent: string;
  category: IntentClassification["category"];
  confidence: number;
  target?: string;
  timestamp: number;
}

const llmClassificationCache = new Map<string, CachedLLMClassification>();

// Track LLM usage for cost monitoring
export interface LLMUsageMetrics {
  llmCallCount: number;
  cacheHits: number;
  lastCallTimestamp?: number;
}

const llmUsageMetrics: LLMUsageMetrics = {
  llmCallCount: 0,
  cacheHits: 0,
};

export function getLLMUsageMetrics(): LLMUsageMetrics {
  return { ...llmUsageMetrics };
}

export function resetLLMUsageMetrics(): void {
  llmUsageMetrics.llmCallCount = 0;
  llmUsageMetrics.cacheHits = 0;
  llmUsageMetrics.lastCallTimestamp = undefined;
}

export interface ExtractedEntity {
  type: string;
  value: string;
  confidence: number;
  position?: number;
}

export interface EnhancedRequestAnalysis extends RequestAnalysis {
  intentConfidence?: number;
  extractedEntities?: {
    target?: ExtractedEntity;
    action?: ExtractedEntity;
    object?: ExtractedEntity;
    assignee?: ExtractedEntity;
    dueDate?: ExtractedEntity;
    priority?: ExtractedEntity;
    project?: ExtractedEntity;
  };
  ambiguity?: {
    isAmbiguous: boolean;
    clarifyingQuestions?: string[];
    ambiguousTerms?: string[];
  };
  followUp?: {
    isFollowUp: boolean;
    relatedTo?: string;
  };
  /** Indicates whether LLM was used for intent classification */
  llmUsed?: boolean;
  /** Low confidence flag to trigger clarification */
  needsClarification?: boolean;
}

export interface IntentClassification {
  intent: string;
  confidence: number;
  category: "task_creation" | "search" | "report" | "approval" | "general_query" | "unknown";
}

// ---------------------------------------------------------------------------
// LLM Intent Classification System Prompt (Korean + English support)
// ---------------------------------------------------------------------------

const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for a task management assistant that supports both Korean and English.

Classify the user request into ONE of these categories:
- task_creation: Creating/making/adding new tasks, items, issues (생성, 만들, 추가, create, add, make)
- search: Viewing/checking/finding/listing existing items (조회, 확인, 보여, 찾, 검색, show, list, find, search)
- report: Generating reports/summaries/analytics (리포트, 보고서, 분석, 통계, 요약, report, summary, analytics)
- approval: Approving/rejecting/confirming items (승인, 거절, 거부, 수락, approve, reject, confirm)
- general_query: General questions or conversation
- unknown: Cannot determine intent

Also identify:
- target: The platform/service (notion, slack, github, linear, jira, asana, airtable, google, calendar, etc.) or "unknown"
- action: The action verb (create, read, update, delete, search, etc.)

Output ONLY valid JSON (no markdown, no code fences):
{"intent": "<category>", "target": "<platform>", "action": "<verb>", "confidence": <0.0-1.0>, "reasoning": "<brief explanation>"}

Rules:
- intent must be one of: task_creation, search, report, approval, general_query, unknown
- confidence between 0.0 and 1.0
- Support both Korean and English inputs
- For ambiguous inputs like "그거 해줘" (do that), return unknown with low confidence`;

// ---------------------------------------------------------------------------
// LLM Classification Function
// ---------------------------------------------------------------------------

interface LLMClassificationResult extends IntentClassification {
  target?: string;
  action?: string;
  reasoning?: string;
}

/**
 * Classify intent using LLM when pattern matching confidence is low.
 * Uses caching to avoid redundant API calls.
 */
async function classifyIntentWithLLM(request: string): Promise<LLMClassificationResult> {
  // Check cache first
  const cacheKey = request.toLowerCase().trim();
  const cached = llmClassificationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < LLM_CACHE_TTL_MS) {
    llmUsageMetrics.cacheHits++;
    logger.debug("LLM intent classification cache hit", { request: request.slice(0, 50) });
    return {
      intent: cached.intent,
      category: cached.category,
      confidence: cached.confidence,
      target: cached.target,
    };
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn("No Anthropic API key for LLM classification, returning unknown");
      return {
        intent: "unknown",
        category: "unknown",
        confidence: 0.1,
      };
    }

    const client = new Anthropic({ apiKey });

    logger.debug("Classifying intent with LLM", {
      requestLength: request.length,
      model: LLM_MODEL,
    });

    llmUsageMetrics.llmCallCount++;
    llmUsageMetrics.lastCallTimestamp = Date.now();

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 256,
      system: INTENT_CLASSIFICATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: request }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("LLM intent classification: no text in response");
      return {
        intent: "unknown",
        category: "unknown",
        confidence: 0.1,
      };
    }

    // Parse JSON response (handle potential markdown wrapping)
    const cleaned = textBlock.text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as {
      intent: string;
      target?: string;
      action?: string;
      confidence: number;
      reasoning?: string;
    };

    // Validate category is valid
    const validCategories: IntentClassification["category"][] = [
      "task_creation",
      "search",
      "report",
      "approval",
      "general_query",
      "unknown",
    ];

    const category: IntentClassification["category"] = validCategories.includes(
      parsed.intent as IntentClassification["category"]
    )
      ? (parsed.intent as IntentClassification["category"])
      : "unknown";

    // Map category to legacy intent names for backward compatibility
    const categoryToIntent: Record<string, string> = {
      task_creation: "create_task",
      search: "query_data",
      report: "generate_content",
      approval: "update_task",
      general_query: "general",
      unknown: "unknown",
    };

    const result: LLMClassificationResult = {
      intent: categoryToIntent[category] || "unknown",
      category,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      target: parsed.target,
      action: parsed.action,
      reasoning: parsed.reasoning,
    };

    logger.info("LLM intent classification complete", {
      intent: result.intent,
      category: result.category,
      confidence: result.confidence,
      target: result.target,
      reasoning: result.reasoning,
    });

    // Cache the result
    llmClassificationCache.set(cacheKey, {
      intent: result.intent,
      category: result.category,
      confidence: result.confidence,
      target: result.target,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    logger.error("LLM intent classification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      intent: "unknown",
      category: "unknown",
      confidence: 0.1,
    };
  }
}

/**
 * Combine regex-based and LLM-based classification results.
 * Uses weighted averaging based on confidence scores.
 */
function combineClassifications(
  regexResult: IntentClassification,
  llmResult: LLMClassificationResult
): IntentClassification & { target?: string } {
  // If they agree, boost confidence
  if (regexResult.intent === llmResult.intent) {
    return {
      intent: regexResult.intent,
      category: regexResult.category,
      confidence: Math.min((regexResult.confidence + llmResult.confidence) / 2 + 0.1, 0.95),
      target: llmResult.target,
    };
  }

  // If they disagree, use the higher confidence result
  if (llmResult.confidence > regexResult.confidence) {
    return {
      intent: llmResult.intent,
      category: llmResult.category,
      confidence: llmResult.confidence,
      target: llmResult.target,
    };
  }

  return regexResult;
}

export async function analyzeRequest(
  userRequest: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
): Promise<RequestAnalysis> {
  const lowercased = userRequest.toLowerCase();

  const keywords = extractKeywords(lowercased);
  const { intent } = detectIntentWithConfidence(lowercased, context);
  const entities = extractEntities(lowercased, context);
  const requiresMultiAgent = detectMultiAgentNeed(lowercased);
  const complexity = assessComplexity(lowercased, requiresMultiAgent, context);

  return {
    intent,
    entities,
    keywords,
    requiresMultiAgent,
    complexity,
  };
}

/**
 * Analyze request with explicit LLM fallback control.
 * This is the recommended function for production use.
 *
 * @example
 * // High-confidence requests skip LLM (fast path)
 * const result = await analyzeRequestWithLLMFallback("노션에 새 태스크 만들어줘");
 * // Expected: { intent: "create_task", target: "notion", confidence: 0.95, llmUsed: false }
 *
 * // Ambiguous requests use LLM
 * const result = await analyzeRequestWithLLMFallback("그거 해줘");
 * // Expected: { intent: "unknown", needsClarification: true, llmUsed: true }
 */
export async function analyzeRequestWithLLMFallback(
  request: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
): Promise<EnhancedRequestAnalysis> {
  // Step 1: Try regex-based classification
  const regexResult = classifyIntent(request.toLowerCase(), context);

  // Step 2: If high confidence, return immediately (fast path)
  if (regexResult.confidence >= LLM_CONFIDENCE_THRESHOLD) {
    logger.debug("High regex confidence, skipping LLM", {
      confidence: regexResult.confidence,
      intent: regexResult.intent,
    });

    const lowercased = request.toLowerCase();
    const entities = extractEntities(lowercased, context);
    const extractedEntities = extractEntitiesEnhanced(request);
    const keywords = extractKeywords(lowercased);
    const requiresMultiAgent = detectMultiAgentNeed(lowercased);
    const complexity = assessComplexity(lowercased, requiresMultiAgent, context);
    const ambiguity = detectAmbiguity(request, extractedEntities);
    const followUp = detectFollowUp(request, context);

    return {
      intent: regexResult.intent,
      entities,
      keywords,
      requiresMultiAgent,
      complexity,
      intentConfidence: regexResult.confidence,
      extractedEntities,
      ambiguity,
      followUp,
      llmUsed: false,
      needsClarification: false,
    };
  }

  // Step 3: LLM fallback for ambiguous requests
  logger.info("Using LLM fallback for low-confidence request", {
    regexConfidence: regexResult.confidence,
    request: request.slice(0, 50),
  });

  const llmResult = await classifyIntentWithLLM(request);

  // Step 4: Combine scores
  const combined = combineClassifications(regexResult, llmResult);

  const lowercased = request.toLowerCase();
  const entities = extractEntities(lowercased, context);

  // Override target from LLM if detected
  if (combined.target && !entities.target) {
    entities.target = combined.target;
  }

  const extractedEntities = extractEntitiesEnhanced(request);
  const keywords = extractKeywords(lowercased);
  const requiresMultiAgent = detectMultiAgentNeed(lowercased);
  const complexity = assessComplexity(lowercased, requiresMultiAgent, context);
  const ambiguity = detectAmbiguity(request, extractedEntities);
  const followUp = detectFollowUp(request, context);

  // Determine if clarification is needed
  const needsClarification = combined.confidence < 0.5 ||
    (combined.intent === "unknown" && combined.confidence < 0.7);

  return {
    intent: combined.intent,
    entities,
    keywords,
    requiresMultiAgent,
    complexity,
    intentConfidence: combined.confidence,
    extractedEntities,
    ambiguity,
    followUp,
    llmUsed: true,
    needsClarification,
  };
}

/**
 * Analyze request with LLM fallback for intent classification.
 * Uses regex-based classification first, falls back to LLM when confidence < threshold.
 * @param userRequest - The user's request text
 * @param context - Optional conversation context
 * @param options - Optional configuration for LLM fallback
 */
export async function analyzeRequestEnhanced(
  userRequest: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
  options?: {
    enableLLMFallback?: boolean;
    confidenceThreshold?: number;
  },
): Promise<EnhancedRequestAnalysis> {
  const lowercased = userRequest.toLowerCase();
  const enableLLM = options?.enableLLMFallback !== false; // Default: enabled
  const confidenceThreshold = options?.confidenceThreshold ?? LLM_CONFIDENCE_THRESHOLD;

  const keywords = extractKeywords(lowercased);

  // Step 1: Try regex-based classification
  const regexResult = classifyIntent(lowercased, context);
  let finalIntent = regexResult.intent;
  let finalConfidence = regexResult.confidence;
  let llmUsed = false;
  let llmTarget: string | undefined;

  // Step 2: LLM fallback when confidence is below threshold
  if (enableLLM && regexResult.confidence < confidenceThreshold) {
    logger.info("Regex confidence below threshold, using LLM fallback", {
      regexConfidence: regexResult.confidence,
      threshold: confidenceThreshold,
      request: userRequest.slice(0, 50),
    });

    const llmResult = await classifyIntentWithLLM(userRequest);
    llmUsed = true;

    // Step 3: Combine classifications
    const combined = combineClassifications(regexResult, llmResult);
    finalIntent = combined.intent;
    finalConfidence = combined.confidence;
    llmTarget = combined.target;

    logger.debug("Combined classification result", {
      regexIntent: regexResult.intent,
      regexConfidence: regexResult.confidence,
      llmIntent: llmResult.intent,
      llmConfidence: llmResult.confidence,
      finalIntent,
      finalConfidence,
    });
  }

  const entities = extractEntities(lowercased, context);

  // Override target from LLM if detected and not present in regex
  if (llmTarget && !entities.target) {
    entities.target = llmTarget;
  }

  const extractedEntities = extractEntitiesEnhanced(userRequest);
  const requiresMultiAgent = detectMultiAgentNeed(lowercased);
  const complexity = assessComplexity(lowercased, requiresMultiAgent, context);
  const ambiguity = detectAmbiguity(userRequest, extractedEntities);
  const followUp = detectFollowUp(userRequest, context);

  // Determine if clarification is needed (low confidence even after LLM)
  const needsClarification = finalConfidence < 0.5 ||
    (finalIntent === "unknown" && finalConfidence < 0.7);

  return {
    intent: finalIntent,
    entities,
    keywords,
    requiresMultiAgent,
    complexity,
    intentConfidence: finalConfidence,
    extractedEntities,
    ambiguity,
    followUp,
    llmUsed,
    needsClarification,
  };
}

function extractKeywords(text: string): string[] {
  const stopWords = [
    "를",
    "을",
    "에",
    "에서",
    "해줘",
    "해주세요",
    "하세요",
    "가",
    "이",
    "은",
    "는",
  ];
  return text.split(" ").filter((word) => !stopWords.includes(word) && word.length > 1);
}

function detectIntentWithConfidence(
  text: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
): { intent: string; confidence: number } {
  const classification = classifyIntent(text, context);
  return { intent: classification.intent, confidence: classification.confidence };
}

function classifyIntent(
  text: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
): IntentClassification {
  // Check for follow-up context first
  if (context?.previousMessages && context.previousMessages.length > 0) {
    const lastMessage = context.previousMessages[context.previousMessages.length - 1];

    if (lastMessage.role === "assistant") {
      if (lastMessage.content.includes("생성했습니다") || lastMessage.content.includes("created")) {
        if (text.includes("확인") || text.includes("보여")) {
          return { intent: "query_data", confidence: 0.9, category: "search" };
        }
        if (text.includes("수정") || text.includes("변경")) {
          return { intent: "update_task", confidence: 0.85, category: "task_creation" };
        }
      }
    }
  }

  // Task creation patterns
  const taskCreationPatterns = [
    /\b(create|add|make|new|assign|allocate|schedule)\s+(task|job|work|assignment)/i,
    /\b(create|add|make)\s+\w+\s+(for|to)\s+@?\w+/i,
    /\b(create task for|assign to|allocate to)\s+/i,
    /(생성|만들|추가|작성|할당)\s+(태스크|작업|이슈)/,
  ];

  // Search/query patterns
  const searchPatterns = [
    /\b(search|find|look for|show|list|get|retrieve|query|what|where|which)\b/i,
    /\b(show|list|display)\s+(my|all|the)\s+(tasks|work|items|requests)/i,
    /\b(what'?s|what is)\s+(on|in)\s+(my|the)\s+(plate|list|queue)/i,
    /(조회|확인|보여|찾|검색|알려|리스트)/,
  ];

  // Report/analytics patterns
  const reportPatterns = [
    /\b(generate|create|make|show|display)\s+(report|summary|overview|analytics|stats|statistics)/i,
    /\b(report|analytics|summary)\s+(on|about|for)\s+/i,
    /\b(how many|count|total|statistics)\s+/i,
    /(리포트|보고서|분석|통계|요약)/,
  ];

  // Approval/decision patterns
  const approvalPatterns = [
    /\b(approve|reject|deny|accept|decline|confirm|validate)\s+/i,
    /\b(approve|reject)\s+(this|that|the|request|proposal|change)/i,
    /\b(do you|should i|can i)\s+(approve|reject)/i,
    /(승인|거절|거부|수락|확인)/,
  ];

  // Score each category
  const scores = {
    task_creation: scorePatterns(text, taskCreationPatterns),
    search: scorePatterns(text, searchPatterns),
    report: scorePatterns(text, reportPatterns),
    approval: scorePatterns(text, approvalPatterns),
  };

  // Find best match
  let bestCategory: keyof typeof scores = "search";
  let bestScore = scores.search;

  for (const [category, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as keyof typeof scores;
    }
  }

  // Map category to legacy intent names for backward compatibility
  const categoryToIntent: Record<string, string> = {
    task_creation: "create_task",
    search: "query_data",
    report: "generate_content",
    approval: "update_task",
  };

  const confidence = Math.min(bestScore, 0.95);
  const intent = categoryToIntent[bestCategory] || "general";

  return {
    intent,
    confidence: confidence > 0.3 ? confidence : 0.3,
    category: bestScore > 0.3 ? (bestCategory as any) : "general_query",
  };
}

function scorePatterns(text: string, patterns: RegExp[]): number {
  let score = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      score += 0.4;
    }
  }
  return Math.min(score, 1.0);
}

function extractEntities(
  text: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
) {
  const entities: any = {};

  if (context?.sessionMetadata) {
    if (context.sessionMetadata.lastTarget) {
      entities.contextTarget = context.sessionMetadata.lastTarget;
    }
    if (context.sessionMetadata.lastObject) {
      entities.contextObject = context.sessionMetadata.lastObject;
    }
  }

  if (text.includes("notion") || text.includes("노션")) {
    entities.target = "notion";
  }
  if (text.includes("slack") || text.includes("슬랙")) {
    entities.target = "slack";
  }
  if (text.includes("github") || text.includes("깃허브")) {
    entities.target = "github";
  }
  if (text.includes("linear") || text.includes("리니어")) {
    entities.target = "linear";
  }
  if (text.includes("jira") || text.includes("지라")) {
    entities.target = "jira";
  }
  if (text.includes("asana") || text.includes("아사나")) {
    entities.target = "asana";
  }
  if (text.includes("airtable") || text.includes("에어테이블")) {
    entities.target = "airtable";
  }

  if (text.includes("생성") || text.includes("만들") || text.includes("create")) {
    entities.action = "create";
  }
  if (text.includes("수정") || text.includes("업데이트") || text.includes("update")) {
    entities.action = "update";
  }
  if (text.includes("삭제") || text.includes("제거") || text.includes("delete")) {
    entities.action = "delete";
  }
  if (text.includes("조회") || text.includes("확인") || text.includes("get")) {
    entities.action = "query";
  }

  if (
    text.includes("task") ||
    text.includes("태스크") ||
    text.includes("작업") ||
    text.includes("이슈") ||
    text.includes("issue")
  ) {
    entities.object = "task";
  }
  if (text.includes("document") || text.includes("문서") || text.includes("doc")) {
    entities.object = "document";
  }
  if (text.includes("workflow") || text.includes("워크플로우")) {
    entities.object = "workflow";
  }
  if (text.includes("page") || text.includes("페이지")) {
    entities.object = "page";
  }

  return entities;
}

function extractEntitiesEnhanced(text: string): {
  target?: ExtractedEntity;
  action?: ExtractedEntity;
  object?: ExtractedEntity;
  assignee?: ExtractedEntity;
  dueDate?: ExtractedEntity;
  priority?: ExtractedEntity;
  project?: ExtractedEntity;
} {
  const entities: any = {};

  const targetPatterns = [
    { regex: /\b(notion|노션)\b/i, value: "notion", confidence: 0.9 },
    { regex: /\b(slack|슬랙)\b/i, value: "slack", confidence: 0.9 },
    { regex: /\b(github|깃허브|깃헙)\b/i, value: "github", confidence: 0.9 },
    { regex: /\b(linear|리니어)\b/i, value: "linear", confidence: 0.9 },
    { regex: /\b(jira|지라)\b/i, value: "jira", confidence: 0.9 },
    { regex: /\b(asana|아사나)\b/i, value: "asana", confidence: 0.9 },
    { regex: /\b(airtable|에어테이블)\b/i, value: "airtable", confidence: 0.9 },
  ];

  for (const pattern of targetPatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      entities.target = {
        type: "target",
        value: pattern.value,
        confidence: pattern.confidence,
        position: match.index,
      };
      break;
    }
  }

  const actionPatterns = [
    { regex: /\b(생성|만들|추가|작성|create|add)\b/i, value: "create", confidence: 0.85 },
    { regex: /\b(수정|변경|업데이트|update|modify|change)\b/i, value: "update", confidence: 0.85 },
    { regex: /\b(삭제|제거|delete|remove)\b/i, value: "delete", confidence: 0.85 },
    {
      regex: /\b(조회|확인|보여|알려|show|list|get|find|search)\b/i,
      value: "query",
      confidence: 0.85,
    },
    { regex: /\b(approve|reject|승인|거절)\b/i, value: "approve", confidence: 0.85 },
  ];

  for (const pattern of actionPatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      entities.action = {
        type: "action",
        value: pattern.value,
        confidence: pattern.confidence,
        position: match.index,
      };
      break;
    }
  }

  const objectPatterns = [
    { regex: /\b(task|tasks|태스크|작업|이슈|issue)\b/i, value: "task", confidence: 0.9 },
    { regex: /\b(document|documents|문서|doc|docs)\b/i, value: "document", confidence: 0.9 },
    { regex: /\b(workflow|workflows|워크플로우)\b/i, value: "workflow", confidence: 0.9 },
    { regex: /\b(page|pages|페이지)\b/i, value: "page", confidence: 0.9 },
    { regex: /\b(request|requests|요청)\b/i, value: "request", confidence: 0.9 },
  ];

  for (const pattern of objectPatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      entities.object = {
        type: "object",
        value: pattern.value,
        confidence: pattern.confidence,
        position: match.index,
      };
      break;
    }
  }

  const assigneeMatch = text.match(/@(\w+)/);
  if (assigneeMatch) {
    entities.assignee = {
      type: "assignee",
      value: assigneeMatch[1],
      confidence: 0.95,
      position: assigneeMatch.index,
    };
  } else {
    const userPatterns = [
      /(?:for|to|assign to|allocate to)\s+(\w+)/i,
      /(?:user|person|team)\s+(\w+)/i,
    ];
    for (const pattern of userPatterns) {
      const match = text.match(pattern);
      if (match) {
        entities.assignee = {
          type: "assignee",
          value: match[1],
          confidence: 0.7,
          position: match.index,
        };
        break;
      }
    }
  }

  const projectPatterns = [
    /(?:project|in|for)\s+["']?([A-Z][A-Za-z0-9\s-]+)["']?/,
    /\b(project|프로젝트)\s+(\w+)/i,
  ];

  for (const pattern of projectPatterns) {
    const match = text.match(pattern);
    if (match) {
      const projectName = match[match.length - 1];
      if (projectName && projectName.length > 1) {
        entities.project = {
          type: "project",
          value: projectName,
          confidence: 0.75,
          position: match.index,
        };
        break;
      }
    }
  }

  try {
    const parsed = chrono.parse(text, new Date(), { forwardDate: true });
    if (parsed.length > 0) {
      const dateMatch = parsed[0];
      const parsedDate = dateMatch.start.date();

      if (isValid(parsedDate)) {
        entities.dueDate = {
          type: "dueDate",
          value: format(parsedDate, "yyyy-MM-dd"),
          confidence: dateMatch.start.isCertain("day") ? 0.9 : 0.6,
          position: dateMatch.index,
        };
      }
    }
  } catch (error) {
    void error;
  }

  const priorityPatterns = [
    { regex: /\b(긴급|urgent|critical|high|asap|immediately)\b/i, value: "high", confidence: 0.9 },
    { regex: /\b(보통|normal|medium|regular)\b/i, value: "medium", confidence: 0.85 },
    { regex: /\b(낮음|low|whenever|eventually)\b/i, value: "low", confidence: 0.85 },
  ];

  for (const pattern of priorityPatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      entities.priority = {
        type: "priority",
        value: pattern.value,
        confidence: pattern.confidence,
        position: match.index,
      };
      break;
    }
  }

  return entities;
}

function detectMultiAgentNeed(text: string): boolean {
  if (
    text.match(/하고.*(해|보내|전송|작성|저장|만들|추가|수정|변경|업데이트|삭제|조회)/) ||
    text.match(/and.*then/)
  ) {
    return true;
  }

  const providerKeywords: Array<[string, string[]]> = [
    ["notion", ["notion", "노션"]],
    ["slack", ["slack", "슬랙"]],
    ["github", ["github", "깃허브", "깃헙"]],
    ["linear", ["linear", "리니어"]],
    ["jira", ["jira", "지라"]],
    ["asana", ["asana", "아사나"]],
    ["airtable", ["airtable", "에어테이블"]],
  ];

  const mentioned = new Set<string>();
  for (const [provider, keywords] of providerKeywords) {
    if (keywords.some((k) => text.includes(k))) {
      mentioned.add(provider);
    }
  }

  if (mentioned.size >= 2) {
    return true;
  }

  const functionKeywords = [
    "디자인",
    "예산",
    "리서치",
    "콘텐츠",
    "분석",
    "design",
    "budget",
    "research",
  ];
  const matchedFunctions = functionKeywords.filter((kw) => text.includes(kw));
  if (matchedFunctions.length >= 2) {
    return true;
  }

  return false;
}

function assessComplexity(
  text: string,
  requiresMultiAgent: boolean,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
): "low" | "medium" | "high" {
  if (requiresMultiAgent) return "high";

  if (context?.previousMessages && context.previousMessages.length > 5) {
    return "medium";
  }

  if (text.split(" ").length > 10) return "high";
  if (text.length > 200) return "medium";
  return "low";
}

function detectAmbiguity(
  text: string,
  entities: any,
): { isAmbiguous: boolean; clarifyingQuestions?: string[]; ambiguousTerms?: string[] } {
  const ambiguousTerms: string[] = [];
  const clarifyingQuestions: string[] = [];

  if (!entities.assignee && /\b(for|to|assign|allocate)\b/i.test(text)) {
    ambiguousTerms.push("assignee");
    clarifyingQuestions.push("Who should this be assigned to?");
  }

  if (!entities.dueDate && /\b(by|before|until|deadline|when)\b/i.test(text)) {
    ambiguousTerms.push("dueDate");
    clarifyingQuestions.push("When is the deadline?");
  }

  if (!entities.priority && /\b(priority|urgent|important|asap)\b/i.test(text)) {
    ambiguousTerms.push("priority");
    clarifyingQuestions.push("What priority level should this have?");
  }

  if (!entities.project && /\b(project|in|for)\b/i.test(text)) {
    ambiguousTerms.push("project");
    clarifyingQuestions.push("Which project is this for?");
  }

  const pronounPatterns = /\b(it|this|that|them|those)\b/i;
  if (pronounPatterns.test(text) && !entities.object) {
    ambiguousTerms.push("referent");
    clarifyingQuestions.push("What are you referring to?");
  }

  return {
    isAmbiguous: ambiguousTerms.length > 0,
    ambiguousTerms: ambiguousTerms.length > 0 ? ambiguousTerms : undefined,
    clarifyingQuestions: clarifyingQuestions.length > 0 ? clarifyingQuestions : undefined,
  };
}

function detectFollowUp(
  text: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
): { isFollowUp: boolean; relatedTo?: string } {
  if (!context?.previousMessages || context.previousMessages.length === 0) {
    return { isFollowUp: false };
  }

  const followUpPatterns = [
    /\b(also|additionally|and|plus|furthermore|moreover)\b/i,
    /\b(same|similar|like|as before)\b/i,
    /\b(update|modify|change|adjust)\s+(it|that|the previous)/i,
    /\b(what about|how about|what if)\b/i,
  ];

  const isFollowUp = followUpPatterns.some((pattern) => pattern.test(text));

  if (isFollowUp) {
    const lastMessage = context.previousMessages[context.previousMessages.length - 1];
    const relatedTo = extractMainTopicFromMessage(lastMessage.content);
    return { isFollowUp: true, relatedTo };
  }

  return { isFollowUp: false };
}

function extractMainTopicFromMessage(message: string): string {
  const topicPatterns = [/created?\s+(\w+)/i, /task.*?(\w+)/i, /about\s+(\w+)/i];

  for (const pattern of topicPatterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return "previous request";
}
