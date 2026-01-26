import { RequestAnalysis } from "./types";
import * as chrono from "chrono-node";
import { format, isValid } from "date-fns";

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
  };
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

export async function analyzeRequestEnhanced(
  userRequest: string,
  context?: {
    previousMessages?: Array<{ role: string; content: string }>;
    sessionMetadata?: Record<string, any>;
  },
): Promise<EnhancedRequestAnalysis> {
  const lowercased = userRequest.toLowerCase();

  const keywords = extractKeywords(lowercased);
  const { intent, confidence: intentConfidence } = detectIntentWithConfidence(lowercased, context);
  const entities = extractEntities(lowercased, context);
  const extractedEntities = extractEntitiesEnhanced(userRequest);
  const requiresMultiAgent = detectMultiAgentNeed(lowercased);
  const complexity = assessComplexity(lowercased, requiresMultiAgent, context);

  return {
    intent,
    entities,
    keywords,
    requiresMultiAgent,
    complexity,
    intentConfidence,
    extractedEntities,
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
  const intentPatterns: Record<string, string[]> = {
    create_task: ["생성", "만들", "추가", "작성", "create", "add"],
    update_task: [
      "수정",
      "변경",
      "업데이트",
      "완료",
      "update",
      "modify",
      "change",
      "complete",
      "done",
      "finish",
    ],
    delete_task: ["삭제", "제거", "delete", "remove"],
    query_data: ["조회", "확인", "보여", "알려", "show", "list", "get"],
    generate_content: ["콘셉트", "아이디어", "디자인", "generate", "design"],
  };

  if (context?.previousMessages && context.previousMessages.length > 0) {
    const lastMessage = context.previousMessages[context.previousMessages.length - 1];

    if (
      lastMessage.role === "assistant" &&
      (lastMessage.content.includes("생성했습니다") || lastMessage.content.includes("created"))
    ) {
      if (text.includes("확인") || text.includes("보여")) {
        return { intent: "query_data", confidence: 0.9 };
      }
      if (text.includes("수정") || text.includes("변경")) {
        return { intent: "update_task", confidence: 0.85 };
      }
    }
  }

  let bestMatch: { intent: string; confidence: number; matchCount: number } = {
    intent: "general",
    confidence: 0.3,
    matchCount: 0,
  };

  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    const matchedPatterns = patterns.filter((pattern) => text.includes(pattern));
    const matchCount = matchedPatterns.length;

    if (matchCount > 0) {
      let confidence = 0.6;
      if (matchCount >= 2) confidence = 0.9;
      else if (matchCount === 1) confidence = 0.7;

      if (matchCount > bestMatch.matchCount) {
        bestMatch = { intent, confidence, matchCount };
      }
    }
  }

  return { intent: bestMatch.intent, confidence: bestMatch.confidence };
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
} {
  const entities: any = {};

  const targetPatterns = [
    { regex: /\b(notion|노션)\b/i, value: "notion", confidence: 0.9 },
    { regex: /\b(slack|슬랙)\b/i, value: "slack", confidence: 0.9 },
    { regex: /\b(github|깃허브|깃헙)\b/i, value: "github", confidence: 0.9 },
    { regex: /\b(linear|리니어)\b/i, value: "linear", confidence: 0.9 },
    { regex: /\b(jira|지라)\b/i, value: "jira", confidence: 0.9 },
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
    { regex: /\b(조회|확인|보여|알려|show|list|get|find)\b/i, value: "query", confidence: 0.85 },
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

  const assigneeMatch = text.match(/@(\w+)/);
  if (assigneeMatch) {
    entities.assignee = {
      type: "assignee",
      value: assigneeMatch[1],
      confidence: 0.95,
      position: assigneeMatch.index,
    };
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
    { regex: /\b(긴급|urgent|critical|high)\b/i, value: "high", confidence: 0.9 },
    { regex: /\b(보통|normal|medium)\b/i, value: "medium", confidence: 0.85 },
    { regex: /\b(낮음|low)\b/i, value: "low", confidence: 0.85 },
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
