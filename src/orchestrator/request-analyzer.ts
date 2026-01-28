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
}

export interface IntentClassification {
  intent: string;
  confidence: number;
  category: "task_creation" | "search" | "report" | "approval" | "general_query" | "unknown";
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
  const ambiguity = detectAmbiguity(userRequest, extractedEntities);
  const followUp = detectFollowUp(userRequest, context);

  return {
    intent,
    entities,
    keywords,
    requiresMultiAgent,
    complexity,
    intentConfidence,
    extractedEntities,
    ambiguity,
    followUp,
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
    /(create|add|make|new|assign|allocate|schedule)\s+(task|job|work|assignment)/i,
    /(create|add|make).*?(task|job|work).*?(for|to)/i,  // More flexible for mixed language
    /(create task for|assign to|allocate to)\s+/i,
    /(생성|만들|추가|작성|할당).*?(태스크|작업|이슈)/,  // More flexible Korean pattern
    /(새|신규)\s+(태스크|작업|이슈)/,  // "new task" pattern
  ];

  // Search/query patterns
  const searchPatterns = [
    /(search|find|look for|show|list|get|retrieve|query|what|where|which)/i,
    /(show|list|display)\s+(my|all|the)\s+(tasks|work|items|requests)/i,
    /(what'?s|what is)\s+(on|in)\s+(my|the)\s+(plate|list|queue)/i,
    /(조회|보여|찾|검색|알려|리스트)/,  // Removed 확인 as it conflicts with approval patterns
  ];

  // Report/analytics patterns
  const reportPatterns = [
    /(generate|create|make|show|display)\s+(report|summary|overview|analytics|stats|statistics)/i,
    /(report|analytics|summary)\s+(on|about|for)\s+/i,
    /(how many|count|total|statistics)\s+/i,
    /(리포트|보고서|분석|통계|요약)/,
  ];

  // Approval/decision patterns (including updates)
  const approvalPatterns = [
    /(approve|reject|deny|accept|decline|confirm|validate)\s+/i,
    /(approve|reject)\s+(this|that|the|request|proposal|change)/i,
    /(do you|should i|can i)\s+(approve|reject)/i,
    /(승인|거절|거부|수락)/,  // Removed 확인 to reduce conflicts
    /(태스크|작업|상태).*?(업데이트|변경|수정)/,  // Flexible update pattern
    /(업데이트|변경|수정).*?(태스크|작업|상태)/,  // Reverse order
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
    { regex: /(notion|노션)/i, value: "notion", confidence: 0.9 },
    { regex: /(slack|슬랙)/i, value: "slack", confidence: 0.9 },
    { regex: /(github|깃허브|깃헙)/i, value: "github", confidence: 0.9 },
    { regex: /(linear|리니어)/i, value: "linear", confidence: 0.9 },
    { regex: /(jira|지라)/i, value: "jira", confidence: 0.9 },
    { regex: /(asana|아사나)/i, value: "asana", confidence: 0.9 },
    { regex: /(airtable|에어테이블)/i, value: "airtable", confidence: 0.9 },
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
    { regex: /(생성|만들|추가|작성|create|add)/i, value: "create", confidence: 0.85 },
    { regex: /(수정|변경|업데이트|update|modify|change)/i, value: "update", confidence: 0.85 },
    { regex: /(삭제|제거|delete|remove)/i, value: "delete", confidence: 0.85 },
    {
      regex: /(조회|확인|보여|알려|show|list|get|find|search)/i,
      value: "query",
      confidence: 0.85,
    },
    { regex: /(approve|reject|승인|거절)/i, value: "approve", confidence: 0.85 },
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
    { regex: /(task|tasks|태스크|작업|이슈|issue)/i, value: "task", confidence: 0.9 },
    { regex: /(document|documents|문서|doc|docs)/i, value: "document", confidence: 0.9 },
    { regex: /(workflow|workflows|워크플로우)/i, value: "workflow", confidence: 0.9 },
    { regex: /(page|pages|페이지)/i, value: "page", confidence: 0.9 },
    { regex: /(request|requests|요청)/i, value: "request", confidence: 0.9 },
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
    /(project|프로젝트)\s+(\w+)/i,
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

  // Korean date patterns
  const koreanDatePatterns = [
    { regex: /(오늘|today)/i, days: 0 },
    { regex: /(내일|tomorrow)/i, days: 1 },
    { regex: /(모레)/i, days: 2 },
    { regex: /(\d+)일\s*후/i, daysFromMatch: true },
    { regex: /이번\s*주/i, days: 7 },
    { regex: /다음\s*주/i, days: 7 },
  ];

  let dateFound = false;
  for (const pattern of koreanDatePatterns) {
    const match = text.match(pattern.regex);
    if (match) {
      const today = new Date();
      let daysToAdd = 0;

      if (pattern.daysFromMatch && match[1]) {
        daysToAdd = parseInt(match[1], 10);
      } else {
        daysToAdd = pattern.days || 0;
      }

      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + daysToAdd);

      entities.dueDate = {
        type: "dueDate",
        value: format(futureDate, "yyyy-MM-dd"),
        confidence: 0.85,
        position: match.index,
      };
      dateFound = true;
      break;
    }
  }

  // Fallback to chrono-node for English dates
  if (!dateFound) {
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
  }

  const priorityPatterns = [
    { regex: /(긴급|urgent|critical|high|asap|immediately)/i, value: "high", confidence: 0.9 },
    { regex: /(보통|normal|medium|regular)/i, value: "medium", confidence: 0.85 },
    { regex: /(낮음|low|whenever|eventually)/i, value: "low", confidence: 0.85 },
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
    /(also|additionally|and|plus|furthermore|moreover)/i,
    /(same|similar|like|as before)/i,
    /(update|modify|change|adjust|수정|변경)\s+(it|that|the previous|해|해줘)/i,
    /(what about|how about|what if)/i,
    /(수정|변경|추가|더)해줘?/i,  // Korean follow-up patterns
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
