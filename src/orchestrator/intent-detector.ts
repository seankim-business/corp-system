import { logger } from "../utils/logger";
import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IntentAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "search"
  | "analyze"
  | "summarize"
  | "schedule"
  | "notify"
  | "unknown";

export interface Intent {
  action: IntentAction;
  target: string;
  confidence: number;
}

export interface ExtractedEntities {
  providers: string[];
  fileNames: string[];
  urls: string[];
  dates: string[];
  projectNames: string[];
  userMentions: string[];
}

export interface RequestAnalysisResult {
  intent: Intent;
  entities: ExtractedEntities;
}

// ---------------------------------------------------------------------------
// LLM-based Classification Cache
// ---------------------------------------------------------------------------

interface CachedClassification {
  intent: Intent;
  timestamp: number;
}

const classificationCache = new Map<string, CachedClassification>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Action keyword maps (English + Korean)
// ---------------------------------------------------------------------------

interface ActionPattern {
  action: IntentAction;
  keywords: string[];
  /** Base confidence when a keyword from this group matches. */
  confidence: number;
}

const ACTION_PATTERNS: ActionPattern[] = [
  {
    action: "create",
    keywords: [
      // English
      "create",
      "make",
      "new",
      "add",
      "build",
      "generate",
      "write",
      "draft",
      "compose",
      "register",
      "set up",
      "setup",
      "init",
      "initialize",
      // Korean
      "만들어",
      "만들",
      "생성",
      "추가",
      "작성",
      "등록",
      "초기화",
      "세팅",
      "작업 생성",
    ],
    confidence: 0.85,
  },
  {
    action: "read",
    keywords: [
      // English
      "find",
      "show",
      "list",
      "get",
      "display",
      "view",
      "look up",
      "lookup",
      "fetch",
      "retrieve",
      "open",
      "check",
      "see",
      // Korean
      "찾아",
      "보여",
      "조회",
      "확인",
      "열어",
      "가져",
      "리스트",
      "목록",
      "일정 확인",
    ],
    confidence: 0.80,
  },
  {
    action: "search",
    keywords: [
      // English
      "search",
      "query",
      "filter",
      "where",
      "which",
      "locate",
      "look for",
      // Korean
      "검색",
      "탐색",
      "찾기",
      "필터",
      "검색해",
    ],
    confidence: 0.85,
  },
  {
    action: "update",
    keywords: [
      // English
      "update",
      "modify",
      "change",
      "edit",
      "rename",
      "fix",
      "patch",
      "revise",
      "adjust",
      "alter",
      // Korean
      "수정",
      "변경",
      "편집",
      "업데이트",
      "고쳐",
      "바꿔",
      "갱신",
    ],
    confidence: 0.85,
  },
  {
    action: "delete",
    keywords: [
      // English
      "delete",
      "remove",
      "destroy",
      "drop",
      "purge",
      "clear",
      "erase",
      "trash",
      // Korean
      "삭제",
      "제거",
      "지워",
      "없애",
      "비워",
    ],
    confidence: 0.90,
  },
  {
    action: "analyze",
    keywords: [
      // English
      "analyze",
      "analyse",
      "investigate",
      "examine",
      "inspect",
      "diagnose",
      "debug",
      "audit",
      "review",
      "evaluate",
      "assess",
      // Korean
      "분석",
      "조사",
      "검토",
      "진단",
      "디버그",
      "평가",
    ],
    confidence: 0.85,
  },
  {
    action: "summarize",
    keywords: [
      // English
      "summarize",
      "summarise",
      "summary",
      "overview",
      "brief",
      "recap",
      "digest",
      "tldr",
      "tl;dr",
      // Korean
      "요약",
      "정리",
      "간추려",
      "브리핑",
    ],
    confidence: 0.85,
  },
  {
    action: "schedule",
    keywords: [
      // English
      "schedule",
      "book",
      "reserve",
      "plan",
      "calendar",
      "appointment",
      "meeting",
      "event",
      "remind",
      "reminder",
      "set time",
      // Korean
      "일정",
      "예약",
      "스케줄",
      "캘린더",
      "미팅",
      "회의",
      "알림",
      "리마인더",
    ],
    confidence: 0.85,
  },
  {
    action: "notify",
    keywords: [
      // English
      "notify",
      "alert",
      "send",
      "message",
      "ping",
      "broadcast",
      "announce",
      "email",
      "dm",
      "slack",
      // Korean
      "알려",
      "알림",
      "전송",
      "보내",
      "메시지",
      "공지",
      "통보",
      "메시지 보내",
    ],
    confidence: 0.80,
  },
];

// ---------------------------------------------------------------------------
// LLM Classification System Prompt
// ---------------------------------------------------------------------------

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classifier. Analyze the user request and classify it into ONE of these actions:
- create: Creating/making/adding new items
- read: Viewing/checking/getting existing items
- update: Modifying/editing/changing existing items
- delete: Removing/deleting items
- search: Searching/filtering/querying for items
- analyze: Analyzing/investigating/examining data
- summarize: Summarizing/briefing content
- schedule: Scheduling/planning/booking events
- notify: Sending messages/notifications/alerts
- unknown: Cannot determine intent

Also identify the TARGET (what entity is being acted upon).

Respond ONLY with JSON in this exact format (no markdown, no code fences):
{"action": "<action_name>", "target": "<target_entity>", "confidence": <0.0_to_1.0>, "reasoning": "<brief_explanation>"}

Rules:
- action must be one of: create, read, update, delete, search, analyze, summarize, schedule, notify, unknown
- confidence must be 0.0 to 1.0
- target should be specific (e.g., "task", "document", "user") or "unknown"
- reasoning should briefly explain why you chose this classification`;

const LLM_MODEL = "claude-3-5-haiku-20241022";

// ---------------------------------------------------------------------------
// Target keyword map (the entity being acted upon)
// ---------------------------------------------------------------------------

interface TargetPattern {
  target: string;
  keywords: string[];
}

const TARGET_PATTERNS: TargetPattern[] = [
  {
    target: "task",
    keywords: [
      "task",
      "tasks",
      "태스크",
      "작업",
      "todo",
      "to-do",
      "ticket",
      "티켓",
      "item",
      "할일",
      "할 일",
    ],
  },
  {
    target: "issue",
    keywords: ["issue", "issues", "이슈", "bug", "버그", "defect", "결함", "problem", "문제"],
  },
  {
    target: "document",
    keywords: [
      "document",
      "documents",
      "doc",
      "docs",
      "문서",
      "page",
      "pages",
      "페이지",
      "wiki",
      "위키",
      "note",
      "notes",
      "노트",
      "file",
      "파일",
    ],
  },
  {
    target: "event",
    keywords: [
      "event",
      "events",
      "이벤트",
      "meeting",
      "meetings",
      "미팅",
      "회의",
      "appointment",
      "예약",
      "calendar",
      "캘린더",
      "일정",
    ],
  },
  {
    target: "pull request",
    keywords: [
      "pull request",
      "pull requests",
      "pr",
      "prs",
      "풀 리퀘스트",
      "풀리퀘스트",
      "merge request",
      "mr",
    ],
  },
  {
    target: "project",
    keywords: ["project", "projects", "프로젝트", "repo", "repository", "레포", "저장소"],
  },
  {
    target: "workflow",
    keywords: ["workflow", "workflows", "워크플로우", "pipeline", "파이프라인", "automation", "자동화"],
  },
  {
    target: "report",
    keywords: [
      "report",
      "reports",
      "리포트",
      "보고서",
      "dashboard",
      "대시보드",
      "analytics",
      "분석",
      "통계",
      "stats",
      "statistics",
    ],
  },
  {
    target: "message",
    keywords: ["message", "messages", "메시지", "notification", "notifications", "알림", "공지"],
  },
  {
    target: "user",
    keywords: [
      "user",
      "users",
      "유저",
      "사용자",
      "member",
      "members",
      "멤버",
      "team",
      "teams",
      "팀",
    ],
  },
];

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

interface ProviderPattern {
  provider: string;
  keywords: string[];
}

const PROVIDER_PATTERNS: ProviderPattern[] = [
  { provider: "notion", keywords: ["notion", "노션"] },
  { provider: "linear", keywords: ["linear", "리니어"] },
  { provider: "github", keywords: ["github", "깃허브", "깃헙"] },
  { provider: "google-drive", keywords: ["google drive", "drive", "드라이브", "구글 드라이브"] },
  {
    provider: "google-calendar",
    keywords: ["google calendar", "calendar", "캘린더", "구글 캘린더"],
  },
];

// ---------------------------------------------------------------------------
// Regex helpers
// ---------------------------------------------------------------------------

/** Standard URL pattern. */
const URL_REGEX =
  /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/g;

/** File-path pattern: word characters with at least one dot for the extension, optionally preceded by path segments. */
const FILE_NAME_REGEX = /(?:[\w-]+\/)*[\w-]+\.\w{1,10}/g;

/** @mention pattern: @username (alphanumeric, underscores, hyphens). */
const USER_MENTION_REGEX = /@([\w-]{2,})/g;

/** ISO date pattern (YYYY-MM-DD). */
const ISO_DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b/g;

/** Relative date patterns in English. */
const RELATIVE_DATE_EN: { regex: RegExp; label: string }[] = [
  { regex: /\btoday\b/i, label: "today" },
  { regex: /\btomorrow\b/i, label: "tomorrow" },
  { regex: /\byesterday\b/i, label: "yesterday" },
  { regex: /\bnext\s+week\b/i, label: "next week" },
  { regex: /\bthis\s+week\b/i, label: "this week" },
  { regex: /\blast\s+week\b/i, label: "last week" },
  { regex: /\bnext\s+month\b/i, label: "next month" },
  { regex: /\bthis\s+month\b/i, label: "this month" },
  { regex: /\blast\s+month\b/i, label: "last month" },
  { regex: /\bnext\s+monday\b/i, label: "next monday" },
  { regex: /\bnext\s+tuesday\b/i, label: "next tuesday" },
  { regex: /\bnext\s+wednesday\b/i, label: "next wednesday" },
  { regex: /\bnext\s+thursday\b/i, label: "next thursday" },
  { regex: /\bnext\s+friday\b/i, label: "next friday" },
  { regex: /\bin\s+\d+\s+days?\b/i, label: "in N days" },
  { regex: /\bin\s+\d+\s+weeks?\b/i, label: "in N weeks" },
  { regex: /\bin\s+\d+\s+months?\b/i, label: "in N months" },
  { regex: /\bend\s+of\s+(?:the\s+)?(?:week|month|quarter|year)\b/i, label: "end of period" },
];

/** Relative date patterns in Korean. */
const RELATIVE_DATE_KO: { regex: RegExp; label: string }[] = [
  { regex: /오늘/, label: "오늘" },
  { regex: /내일/, label: "내일" },
  { regex: /어제/, label: "어제" },
  { regex: /모레/, label: "모레" },
  { regex: /다음\s*주/, label: "다음주" },
  { regex: /이번\s*주/, label: "이번주" },
  { regex: /지난\s*주/, label: "지난주" },
  { regex: /다음\s*달/, label: "다음달" },
  { regex: /이번\s*달/, label: "이번달" },
  { regex: /지난\s*달/, label: "지난달" },
  { regex: /다음\s*월요일/, label: "다음 월요일" },
  { regex: /다음\s*화요일/, label: "다음 화요일" },
  { regex: /다음\s*수요일/, label: "다음 수요일" },
  { regex: /다음\s*목요일/, label: "다음 목요일" },
  { regex: /다음\s*금요일/, label: "다음 금요일" },
];

/** Project name patterns: "project X", "repo X", or Korean equivalents. */
const PROJECT_NAME_PATTERNS: RegExp[] = [
  /(?:project|repo|repository)\s+["']?([A-Za-z][\w./-]{1,64})["']?/i,
  /(?:프로젝트|레포|저장소)\s+["']?([A-Za-z가-힣][\w가-힣./-]{1,64})["']?/,
  // org/repo GitHub-style
  /\b([A-Za-z][\w-]+\/[A-Za-z][\w.-]+)\b/,
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Classify intent using LLM when pattern matching confidence is low.
 * Uses caching to avoid redundant API calls.
 */
async function classifyWithLLM(request: string): Promise<Intent> {
  // Check cache first
  const cacheKey = request.toLowerCase().trim();
  const cached = classificationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug("Intent classification cache hit", { request: request.slice(0, 50) });
    return cached.intent;
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.warn("No Anthropic API key for LLM classification, using pattern result");
      return { action: "unknown", target: "unknown", confidence: 0.1 };
    }

    const client = new Anthropic({ apiKey });

    logger.debug("Classifying intent with LLM", {
      requestLength: request.length,
      model: LLM_MODEL,
    });

    const response = await client.messages.create({
      model: LLM_MODEL,
      max_tokens: 256,
      system: INTENT_CLASSIFICATION_PROMPT,
      messages: [{ role: "user", content: request }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("LLM intent classification: no text in response");
      return { action: "unknown", target: "unknown", confidence: 0.1 };
    }

    // Parse JSON response
    const cleaned = textBlock.text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    const parsed = JSON.parse(cleaned) as {
      action: string;
      target: string;
      confidence: number;
      reasoning?: string;
    };

    // Validate action is valid IntentAction
    const validActions: IntentAction[] = [
      "create",
      "read",
      "update",
      "delete",
      "search",
      "analyze",
      "summarize",
      "schedule",
      "notify",
      "unknown",
    ];

    const action: IntentAction = validActions.includes(parsed.action as IntentAction)
      ? (parsed.action as IntentAction)
      : "unknown";

    const intent: Intent = {
      action,
      target: parsed.target || "unknown",
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
    };

    logger.info("LLM intent classification complete", {
      action: intent.action,
      target: intent.target,
      confidence: intent.confidence,
      reasoning: parsed.reasoning,
    });

    // Cache the result
    classificationCache.set(cacheKey, {
      intent,
      timestamp: Date.now(),
    });

    return intent;
  } catch (error) {
    logger.error("LLM intent classification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { action: "unknown", target: "unknown", confidence: 0.1 };
  }
}

/**
 * Detect the primary intent (action + target) from a user request string.
 * Uses keyword matching with support for both Korean and English.
 * Falls back to LLM classification when confidence < 0.7.
 */
export async function detectIntent(request: string): Promise<Intent> {
  const text = request.toLowerCase();

  // --- Detect action ---
  let bestAction: IntentAction = "unknown";
  let bestActionConfidence = 0;
  let matchedActionKeyword = "";

  for (const pattern of ACTION_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (text.includes(keyword)) {
        // Longer keyword matches are more specific and thus higher confidence.
        const lengthBonus = Math.min(keyword.length * 0.01, 0.1);
        const candidateConfidence = pattern.confidence + lengthBonus;

        if (candidateConfidence > bestActionConfidence) {
          bestAction = pattern.action;
          bestActionConfidence = candidateConfidence;
          matchedActionKeyword = keyword;
        }
      }
    }
  }

  // --- Detect target ---
  let bestTarget = "";
  let bestTargetScore = 0;

  for (const pattern of TARGET_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (text.includes(keyword)) {
        // Prefer longer / more specific keyword matches.
        const score = keyword.length;
        if (score > bestTargetScore) {
          bestTarget = pattern.target;
          bestTargetScore = score;
        }
      }
    }
  }

  // If no target was detected but we have an action, try to infer target from
  // the word immediately following the matched action keyword.
  if (!bestTarget && matchedActionKeyword) {
    const idx = text.indexOf(matchedActionKeyword);
    if (idx !== -1) {
      const afterKeyword = text.slice(idx + matchedActionKeyword.length).trim();
      const nextWord = afterKeyword.split(/[\s,.:;!?]+/)[0];
      if (nextWord && nextWord.length > 1) {
        bestTarget = nextWord;
      }
    }
  }

  // Compute final confidence: reduced if target or action is missing.
  let finalConfidence = bestActionConfidence;
  if (bestAction === "unknown") {
    finalConfidence = 0.1;
  } else if (!bestTarget) {
    finalConfidence = Math.max(finalConfidence - 0.15, 0.1);
  }

  // Cap at 0.95
  finalConfidence = Math.min(finalConfidence, 0.95);
  // Round to 2 decimal places for readability
  finalConfidence = Math.round(finalConfidence * 100) / 100;

  logger.debug("Intent detected by pattern matching", {
    action: bestAction,
    target: bestTarget || "unknown",
    confidence: finalConfidence,
    matchedKeyword: matchedActionKeyword || "none",
  });

  const patternResult: Intent = {
    action: bestAction,
    target: bestTarget || "unknown",
    confidence: finalConfidence,
  };

  // LLM fallback when confidence is low
  if (finalConfidence < 0.7) {
    logger.info("Pattern confidence below threshold, using LLM fallback", {
      patternConfidence: finalConfidence,
    });
    return await classifyWithLLM(request);
  }

  return patternResult;
}

/**
 * Extract structured entities from a user request using regex-based extraction.
 * Supports both Korean and English patterns.
 */
export function extractEntities(request: string): ExtractedEntities {
  const text = request;
  const textLower = request.toLowerCase();

  // --- Providers ---
  const providers: string[] = [];
  for (const pattern of PROVIDER_PATTERNS) {
    for (const keyword of pattern.keywords) {
      if (textLower.includes(keyword)) {
        if (!providers.includes(pattern.provider)) {
          providers.push(pattern.provider);
        }
        break; // One keyword match per provider is sufficient
      }
    }
  }

  // --- URLs ---
  const urls: string[] = [];
  const urlMatches = text.match(URL_REGEX);
  if (urlMatches) {
    for (const url of urlMatches) {
      if (!urls.includes(url)) {
        urls.push(url);
      }
    }
  }

  // --- File names ---
  // Extract file names but filter out URLs (which also match the file pattern).
  const fileNames: string[] = [];
  const fileMatches = text.match(FILE_NAME_REGEX);
  if (fileMatches) {
    for (const fileName of fileMatches) {
      // Skip if the match is part of a URL already captured.
      const isPartOfUrl = urls.some((u) => u.includes(fileName));
      if (!isPartOfUrl && !fileNames.includes(fileName)) {
        fileNames.push(fileName);
      }
    }
  }

  // --- Dates ---
  const dates: string[] = [];

  // ISO dates
  const isoMatches = text.match(ISO_DATE_REGEX);
  if (isoMatches) {
    for (const d of isoMatches) {
      if (!dates.includes(d)) {
        dates.push(d);
      }
    }
  }

  // Relative dates (English)
  for (const { regex, label } of RELATIVE_DATE_EN) {
    if (regex.test(text)) {
      if (!dates.includes(label)) {
        dates.push(label);
      }
    }
  }

  // Relative dates (Korean)
  for (const { regex, label } of RELATIVE_DATE_KO) {
    if (regex.test(text)) {
      if (!dates.includes(label)) {
        dates.push(label);
      }
    }
  }

  // --- Project names ---
  const projectNames: string[] = [];
  for (const pattern of PROJECT_NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 1 && !projectNames.includes(name)) {
        projectNames.push(name);
      }
    }
  }

  // --- User mentions ---
  const userMentions: string[] = [];
  let mentionMatch: RegExpExecArray | null;
  // Reset lastIndex for the global regex
  USER_MENTION_REGEX.lastIndex = 0;
  while ((mentionMatch = USER_MENTION_REGEX.exec(text)) !== null) {
    const username = mentionMatch[1];
    if (!userMentions.includes(username)) {
      userMentions.push(username);
    }
  }

  logger.debug("Entities extracted", {
    providerCount: providers.length,
    urlCount: urls.length,
    fileNameCount: fileNames.length,
    dateCount: dates.length,
    projectNameCount: projectNames.length,
    mentionCount: userMentions.length,
  });

  return {
    providers,
    fileNames,
    urls,
    dates,
    projectNames,
    userMentions,
  };
}

/**
 * Combined analysis: detect intent and extract entities from a user request.
 */
export async function analyzeRequest(request: string): Promise<RequestAnalysisResult> {
  const intent = await detectIntent(request);
  const entities = extractEntities(request);

  logger.debug("Request analysis complete", {
    action: intent.action,
    target: intent.target,
    confidence: intent.confidence,
    providers: entities.providers,
  });

  return { intent, entities };
}
