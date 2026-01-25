import { RequestAnalysis } from "./types";

/**
 * 사용자 요청 분석
 */
export async function analyzeRequest(
  userRequest: string,
): Promise<RequestAnalysis> {
  const lowercased = userRequest.toLowerCase();

  // 1. 키워드 추출
  const keywords = extractKeywords(lowercased);

  // 2. Intent 파악
  const intent = detectIntent(lowercased);

  // 3. Entity 추출
  const entities = extractEntities(lowercased);

  // 4. 멀티 에이전트 필요 여부
  const requiresMultiAgent = detectMultiAgentNeed(lowercased);

  // 5. 복잡도 평가
  const complexity = assessComplexity(lowercased, requiresMultiAgent);

  return {
    intent,
    entities,
    keywords,
    requiresMultiAgent,
    complexity,
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
  return text
    .split(" ")
    .filter((word) => !stopWords.includes(word) && word.length > 1);
}

function detectIntent(text: string): string {
  const intentPatterns: Record<string, string[]> = {
    create_task: ["생성", "만들", "추가", "작성", "create", "add"],
    update_task: ["수정", "변경", "업데이트", "update", "modify", "change"],
    delete_task: ["삭제", "제거", "delete", "remove"],
    query_data: ["조회", "확인", "보여", "알려", "show", "list", "get"],
    generate_content: [
      "생성",
      "만들",
      "콘셉트",
      "아이디어",
      "디자인",
      "generate",
      "create",
    ],
  };

  for (const [intent, patterns] of Object.entries(intentPatterns)) {
    if (patterns.some((pattern) => text.includes(pattern))) {
      return intent;
    }
  }

  return "general";
}

function extractEntities(text: string) {
  const entities: any = {};

  // Target 감지
  if (text.includes("notion") || text.includes("노션")) {
    entities.target = "notion";
  }
  if (text.includes("slack") || text.includes("슬랙")) {
    entities.target = "slack";
  }
  if (text.includes("github") || text.includes("깃허브")) {
    entities.target = "github";
  }

  // Action 감지
  if (
    text.includes("생성") ||
    text.includes("만들") ||
    text.includes("create")
  ) {
    entities.action = "create";
  }
  if (
    text.includes("수정") ||
    text.includes("업데이트") ||
    text.includes("update")
  ) {
    entities.action = "update";
  }
  if (
    text.includes("삭제") ||
    text.includes("제거") ||
    text.includes("delete")
  ) {
    entities.action = "delete";
  }
  if (text.includes("조회") || text.includes("확인") || text.includes("get")) {
    entities.action = "query";
  }

  // Object 감지
  if (
    text.includes("task") ||
    text.includes("태스크") ||
    text.includes("작업")
  ) {
    entities.object = "task";
  }
  if (
    text.includes("document") ||
    text.includes("문서") ||
    text.includes("doc")
  ) {
    entities.object = "document";
  }
  if (text.includes("workflow") || text.includes("워크플로우")) {
    entities.object = "workflow";
  }

  return entities;
}

function detectMultiAgentNeed(text: string): boolean {
  // "~하고 ~해줘" 패턴
  if (text.match(/하고.*해/) || text.match(/and.*then/)) {
    return true;
  }

  // 여러 Function 키워드 동시 포함
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
): "low" | "medium" | "high" {
  if (requiresMultiAgent) return "high";
  if (text.split(" ").length > 10) return "high";
  if (text.length > 200) return "medium";
  return "low";
}
