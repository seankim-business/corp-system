# Slack Bot + Orchestrator 구현 명세

> **Phase 2 Week 9-12**: Slack 자연어 → Orchestrator → delegate_task → Notion MCP

---

## 목차

- [아키텍처 개요](#아키텍처-개요)
- [디렉토리 구조](#디렉토리-구조)
- [Slack Bot 구현](#slack-bot-구현)
- [Orchestrator 구현](#orchestrator-구현)
- [Category Selector](#category-selector)
- [Skill Selector](#skill-selector)
- [Session Manager](#session-manager)
- [Notion 동기화](#notion-동기화)
- [에러 처리](#에러-처리)
- [로깅 및 모니터링](#로깅-및-모니터링)

---

## 아키텍처 개요

### 데이터 플로우

```
┌────────────────────────────────────────────────────────────────┐
│ Slack User                                                     │
│ "@company-os Notion에서 진행 중인 task를 완료 처리해줘"         │
└─────────────────┬──────────────────────────────────────────────┘
                  │ (1) app_mention event
                  ▼
┌────────────────────────────────────────────────────────────────┐
│ Slack Bot (src/api/slack.ts)                                   │
│ ├─ Event 수신                                                  │
│ ├─ 사용자 인증 (Slack user → Nubabel user)                     │
│ ├─ 조직 식별 (Slack workspace → Nubabel organization)          │
│ └─ Session 생성/복원                                           │
└─────────────────┬──────────────────────────────────────────────┘
                  │ (2) orchestrate() 호출
                  ▼
┌────────────────────────────────────────────────────────────────┐
│ Orchestrator (src/orchestrator/index.ts)                       │
│ ├─ Request Analyzer: 의도 파악                                 │
│ ├─ Category Selector: category 선택                            │
│ ├─ Skill Selector: load_skills 선택                            │
│ └─ Multi-Agent Detector: 복합 요청 감지                        │
└─────────────────┬──────────────────────────────────────────────┘
                  │ (3) delegate_task() 호출
                  ▼
┌────────────────────────────────────────────────────────────────┐
│ OhMyOpenCode delegate_task                                     │
│ ├─ Sisyphus-Junior 에이전트 실행                                │
│ ├─ Skill 로드 (nubabel-workflow → Notion MCP)                  │
│ └─ LLM 호출 및 도구 실행                                        │
└─────────────────┬──────────────────────────────────────────────┘
                  │ (4) Notion MCP 호출
                  ▼
┌────────────────────────────────────────────────────────────────┐
│ Notion MCP (src/mcp-servers/notion/)                           │
│ ├─ notion_get_tasks()                                          │
│ ├─ notion_update_task()                                        │
│ └─ 결과 반환                                                    │
└─────────────────┬──────────────────────────────────────────────┘
                  │ (5) 결과 반환 (역방향)
                  ▼
┌────────────────────────────────────────────────────────────────┐
│ Slack Bot                                                      │
│ ├─ 결과 포맷팅 (페르소나별)                                     │
│ ├─ Slack 메시지 전송                                           │
│ └─ Execution 히스토리 저장                                      │
└────────────────────────────────────────────────────────────────┘
```

---

## 디렉토리 구조

```
src/
├── api/
│   ├── slack.ts                    # ✨ NEW: Slack Bot entry point
│   ├── workflows.ts                # 기존
│   └── notion.ts                   # 기존
│
├── orchestrator/                   # ✨ NEW: Orchestrator 모듈
│   ├── index.ts                    # 메인 orchestrate 함수
│   ├── request-analyzer.ts         # 의도 분석
│   ├── category-selector.ts        # Category 선택
│   ├── skill-selector.ts           # Skill 선택
│   ├── multi-agent.ts              # 멀티 에이전트 협업
│   ├── session-manager.ts          # Session 생성/관리
│   └── types.ts                    # 타입 정의
│
├── services/                       # ✨ NEW: 비즈니스 로직
│   ├── slack-service.ts            # Slack API 호출
│   └── notion-sync-service.ts      # Notion 동기화
│
├── middleware/
│   ├── tenant.middleware.ts        # 기존
│   └── auth.middleware.ts          # 기존
│
└── mcp-servers/
    └── notion/                     # 기존
        ├── index.ts
        └── tools/
```

---

## Slack Bot 구현

### src/api/slack.ts

```typescript
import { App, LogLevel } from "@slack/bolt";
import { orchestrate } from "../orchestrator";
import {
  createSession,
  getSessionBySlackThread,
} from "../orchestrator/session-manager";
import { getUserBySlackId } from "../services/slack-service";
import { prisma } from "../db/client";

// Slack App 초기화
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true, // Socket Mode 사용 (Railway에서 WebSocket 지원)
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel.INFO,
});

// @company-os 멘션 처리
app.event("app_mention", async ({ event, say, client }) => {
  try {
    const { user, text, channel, thread_ts, ts } = event;

    // 1. 사용자 인증
    const nubabelUser = await getUserBySlackId(user);
    if (!nubabelUser) {
      await say({
        text: "❌ Nubabel 사용자를 찾을 수 없습니다. 먼저 로그인해주세요.",
        thread_ts: thread_ts || ts,
      });
      return;
    }

    // 2. 조직 식별 (Slack workspace → Nubabel organization)
    const slackWorkspace = await client.team.info();
    const organization = await prisma.organization.findFirst({
      where: {
        slack_workspace_id: slackWorkspace.team?.id,
      },
    });

    if (!organization) {
      await say({
        text: "❌ 조직을 찾을 수 없습니다.",
        thread_ts: thread_ts || ts,
      });
      return;
    }

    // 3. Session 생성 또는 복원
    let session = await getSessionBySlackThread(channel, thread_ts || ts);
    if (!session) {
      session = await createSession({
        userId: nubabelUser.id,
        organizationId: organization.id,
        source: "slack",
        metadata: {
          slackChannelId: channel,
          slackThreadTs: thread_ts || ts,
          slackUserId: user,
        },
      });
    }

    // 4. "@company-os" 제거 및 정제
    const cleanedText = text
      .replace(/<@[A-Z0-9]+>/g, "") // 멘션 제거
      .trim();

    // 5. 입력 상태 표시
    await client.chat.postMessage({
      channel,
      thread_ts: thread_ts || ts,
      text: "🤔 분석 중...",
    });

    // 6. Orchestrator 호출
    const result = await orchestrate({
      userRequest: cleanedText,
      sessionId: session.id,
      organizationId: organization.id,
      userId: nubabelUser.id,
    });

    // 7. 결과 전송
    await say({
      text: formatResponse(result),
      thread_ts: thread_ts || ts,
    });
  } catch (error) {
    console.error("Slack Bot Error:", error);
    await say({
      text: `❌ 오류 발생: ${error.message}`,
      thread_ts: event.thread_ts || event.ts,
    });
  }
});

// DM 처리
app.message(async ({ message, say }) => {
  // @ts-ignore
  if (message.channel_type === "im") {
    await say("안녕하세요! 채널에서 @company-os를 멘션해주세요.");
  }
});

// 응답 포맷팅 (페르소나별)
function formatResponse(result: OrchestrationResult): string {
  const persona = result.metadata.category;
  const emoji = getPersonaEmoji(persona);

  return `${emoji} *[${persona}]* ${result.output}`;
}

function getPersonaEmoji(category: string): string {
  const emojiMap: Record<string, string> = {
    "visual-engineering": "🎨",
    ultrabrain: "🧠",
    artistry: "✨",
    quick: "⚡",
    writing: "📝",
    "unspecified-low": "🤖",
    "unspecified-high": "🚀",
  };
  return emojiMap[category] || "🤖";
}

// 서버 시작
export async function startSlackBot() {
  await app.start();
  console.log("⚡️ Slack Bot is running!");
}
```

### src/services/slack-service.ts

```typescript
import { prisma } from "../db/client";
import { WebClient } from "@slack/web-api";

const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

/**
 * Slack user ID로 Nubabel 사용자 조회
 */
export async function getUserBySlackId(slackUserId: string) {
  // 1. Slack user 정보 가져오기
  const slackUser = await slackClient.users.info({ user: slackUserId });
  const email = slackUser.user?.profile?.email;

  if (!email) {
    throw new Error("Slack 사용자의 이메일을 찾을 수 없습니다.");
  }

  // 2. Nubabel 사용자 찾기
  const user = await prisma.user.findUnique({
    where: { email },
  });

  return user;
}

/**
 * Slack workspace ID로 Nubabel 조직 조회
 */
export async function getOrganizationBySlackWorkspace(workspaceId: string) {
  return prisma.organization.findFirst({
    where: {
      slack_workspace_id: workspaceId,
    },
  });
}
```

---

## Orchestrator 구현

### src/orchestrator/index.ts

```typescript
import { delegate_task } from "@ohmyopencode/core";
import { analyzeRequest } from "./request-analyzer";
import { selectCategory } from "./category-selector";
import { selectSkills } from "./skill-selector";
import { detectMultiAgent } from "./multi-agent";
import { OrchestrationRequest, OrchestrationResult } from "./types";
import { prisma } from "../db/client";

/**
 * 메인 orchestration 함수
 */
export async function orchestrate(
  request: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const { userRequest, sessionId, organizationId, userId } = request;

  try {
    // 1. 요청 분석
    const analysis = await analyzeRequest(userRequest);

    // 2. 멀티 에이전트 필요 여부 확인
    if (analysis.requiresMultiAgent) {
      return orchestrateMulti(request, analysis);
    }

    // 3. Category 선택
    const category = selectCategory(userRequest, analysis);

    // 4. Skill 선택
    const skills = selectSkills(userRequest, analysis);

    // 5. delegate_task 호출
    const startTime = Date.now();
    const result = await delegate_task({
      category,
      load_skills: skills,
      prompt: userRequest,
      session_id: sessionId,
    });
    const duration = Date.now() - startTime;

    // 6. Execution 히스토리 저장
    await saveExecution({
      organizationId,
      userId,
      sessionId,
      category,
      skills,
      prompt: userRequest,
      result: result.output,
      status: result.status,
      duration,
      metadata: result.metadata,
    });

    // 7. 결과 반환
    return {
      output: result.output,
      status: result.status,
      metadata: {
        category,
        skills,
        duration,
        model: result.metadata.model,
        sessionId,
      },
    };
  } catch (error) {
    console.error("Orchestration Error:", error);

    // 에러도 히스토리에 저장
    await saveExecution({
      organizationId,
      userId,
      sessionId,
      category: "error",
      skills: [],
      prompt: userRequest,
      result: error.message,
      status: "failed",
      duration: 0,
      metadata: { error: error.stack },
    });

    throw error;
  }
}

/**
 * Execution 히스토리 저장
 */
async function saveExecution(data: any) {
  await prisma.workflowExecution.create({
    data: {
      organization_id: data.organizationId,
      user_id: data.userId,
      workflow_id: null, // Slack에서 직접 실행한 경우 null
      status: data.status,
      input_data: { prompt: data.prompt },
      output_data: { result: data.result },
      started_at: new Date(Date.now() - data.duration),
      completed_at: new Date(),
      metadata: {
        source: "slack",
        session_id: data.sessionId,
        category: data.category,
        skills: data.skills,
        ...data.metadata,
      },
    },
  });
}
```

---

## Request Analyzer

### src/orchestrator/request-analyzer.ts

```typescript
/**
 * 사용자 요청 분석
 */
export interface RequestAnalysis {
  intent: string; // 'create_task' | 'update_task' | 'query_data' | 'generate_content'
  entities: {
    target?: string; // 'notion' | 'slack' | 'github'
    action?: string; // 'create' | 'update' | 'delete' | 'query'
    object?: string; // 'task' | 'document' | 'workflow'
  };
  keywords: string[];
  requiresMultiAgent: boolean;
  complexity: "low" | "medium" | "high";
}

export async function analyzeRequest(
  userRequest: string,
): Promise<RequestAnalysis> {
  const lowercased = userRequest.toLowerCase();

  // 1. 키워드 추출
  const keywords = extractKeywords(lowercased);

  // 2. Intent 파악
  const intent = detectIntent(lowercased, keywords);

  // 3. Entity 추출
  const entities = extractEntities(lowercased);

  // 4. 멀티 에이전트 필요 여부
  const requiresMultiAgent = detectMultiAgentNeed(lowercased, keywords);

  // 5. 복잡도 평가
  const complexity = assessComplexity(lowercased, keywords, requiresMultiAgent);

  return {
    intent,
    entities,
    keywords,
    requiresMultiAgent,
    complexity,
  };
}

function extractKeywords(text: string): string[] {
  const stopWords = ["를", "을", "에", "에서", "해줘", "해주세요", "하세요"];
  return text
    .split(" ")
    .filter((word) => !stopWords.includes(word) && word.length > 1);
}

function detectIntent(text: string, keywords: string[]): string {
  const intentPatterns = {
    create_task: ["생성", "만들", "추가", "작성"],
    update_task: ["수정", "변경", "업데이트"],
    delete_task: ["삭제", "제거"],
    query_data: ["조회", "확인", "보여", "알려"],
    generate_content: ["생성", "만들", "콘셉트", "아이디어", "디자인"],
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

  // Action 감지
  if (text.includes("생성") || text.includes("만들")) {
    entities.action = "create";
  }
  if (text.includes("수정") || text.includes("업데이트")) {
    entities.action = "update";
  }

  // Object 감지
  if (
    text.includes("task") ||
    text.includes("태스크") ||
    text.includes("작업")
  ) {
    entities.object = "task";
  }

  return entities;
}

function detectMultiAgentNeed(text: string, keywords: string[]): boolean {
  // "~하고 ~해줘" 패턴
  if (text.match(/하고.*해/)) {
    return true;
  }

  // 여러 Function 키워드 동시 포함
  const functionKeywords = ["디자인", "예산", "리서치", "콘텐츠", "분석"];
  const matchedFunctions = functionKeywords.filter((kw) => text.includes(kw));
  if (matchedFunctions.length >= 2) {
    return true;
  }

  return false;
}

function assessComplexity(
  text: string,
  keywords: string[],
  requiresMultiAgent: boolean,
): "low" | "medium" | "high" {
  if (requiresMultiAgent) return "high";
  if (keywords.length > 10) return "high";
  if (text.length > 200) return "medium";
  return "low";
}
```

---

## Category Selector

### src/orchestrator/category-selector.ts

```typescript
import { RequestAnalysis } from "./request-analyzer";

export type Category =
  | "visual-engineering"
  | "ultrabrain"
  | "artistry"
  | "quick"
  | "unspecified-low"
  | "unspecified-high"
  | "writing";

/**
 * Category 선택 로직
 */
export function selectCategory(
  userRequest: string,
  analysis: RequestAnalysis,
): Category {
  const text = userRequest.toLowerCase();

  // 1. 키워드 기반 매칭
  const categoryKeywords: Record<Category, string[]> = {
    "visual-engineering": [
      "디자인",
      "UI",
      "UX",
      "프론트엔드",
      "frontend",
      "React",
      "Vue",
      "컴포넌트",
      "CSS",
      "스타일",
      "레이아웃",
      "애니메이션",
    ],
    ultrabrain: [
      "아키텍처",
      "최적화",
      "설계",
      "전략",
      "복잡한",
      "분석",
      "리팩토링",
      "성능",
      "architecture",
      "optimization",
    ],
    artistry: [
      "창의적",
      "아이디어",
      "콘셉트",
      "브랜드",
      "캠페인",
      "콘텐츠",
      "크리에이티브",
      "기획",
      "스토리",
      "creative",
      "concept",
    ],
    quick: [
      "업데이트",
      "수정",
      "변경",
      "간단한",
      "빠른",
      "quick",
      "simple",
      "오타",
      "제목",
      "rename",
      "fix typo",
    ],
    writing: [
      "문서",
      "작성",
      "SOP",
      "가이드",
      "설명",
      "매뉴얼",
      "documentation",
      "guide",
      "README",
    ],
    "unspecified-low": [],
    "unspecified-high": [],
  };

  // 키워드 매칭 점수 계산
  const scores: Record<Category, number> = {
    "visual-engineering": 0,
    ultrabrain: 0,
    artistry: 0,
    quick: 0,
    writing: 0,
    "unspecified-low": 0,
    "unspecified-high": 0,
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        scores[category as Category] += 1;
      }
    }
  }

  // 최고 점수 category 선택
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore > 0) {
    const winner = Object.entries(scores).find(
      ([_, score]) => score === maxScore,
    );
    if (winner) {
      return winner[0] as Category;
    }
  }

  // 2. 복잡도 기반 fallback
  if (analysis.complexity === "low") {
    return "quick";
  } else if (analysis.complexity === "high") {
    return "unspecified-high";
  } else {
    return "unspecified-low";
  }
}
```

---

## Skill Selector

### src/orchestrator/skill-selector.ts

```typescript
import { RequestAnalysis } from "./request-analyzer";

export type Skill =
  | "playwright"
  | "git-master"
  | "frontend-ui-ux"
  | "nubabel-workflow";

/**
 * Skill 선택 로직
 */
export function selectSkills(
  userRequest: string,
  analysis: RequestAnalysis,
): Skill[] {
  const text = userRequest.toLowerCase();
  const skills: Skill[] = [];

  // 1. Notion 관련 → nubabel-workflow
  if (
    analysis.entities.target === "notion" ||
    text.includes("notion") ||
    text.includes("노션") ||
    text.includes("task") ||
    text.includes("태스크")
  ) {
    skills.push("nubabel-workflow");
  }

  // 2. 브라우저/스크린샷 → playwright
  if (
    text.includes("스크린샷") ||
    text.includes("screenshot") ||
    text.includes("브라우저") ||
    text.includes("웹페이지") ||
    text.includes("캡처")
  ) {
    skills.push("playwright");
  }

  // 3. Git 관련 → git-master
  if (
    text.includes("커밋") ||
    text.includes("commit") ||
    text.includes("git") ||
    text.includes("push") ||
    text.includes("리베이스") ||
    text.includes("rebase")
  ) {
    skills.push("git-master");
  }

  // 4. UI/디자인 → frontend-ui-ux
  if (
    text.includes("디자인") ||
    text.includes("UI") ||
    text.includes("UX") ||
    text.includes("프론트엔드") ||
    text.includes("컴포넌트") ||
    text.includes("스타일")
  ) {
    skills.push("frontend-ui-ux");
  }

  return skills;
}
```

---

## Session Manager

### src/orchestrator/session-manager.ts

```typescript
import { prisma } from "../db/client";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export interface Session {
  id: string;
  userId: string;
  organizationId: string;
  source: "slack" | "web" | "terminal" | "api";
  state: Record<string, any>;
  history: any[];
  metadata: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * 세션 생성
 */
export async function createSession(params: {
  userId: string;
  organizationId: string;
  source: Session["source"];
  metadata?: Record<string, any>;
}): Promise<Session> {
  const session: Session = {
    id: `ses_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: params.userId,
    organizationId: params.organizationId,
    source: params.source,
    state: {},
    history: [],
    metadata: params.metadata || {},
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1시간
  };

  // Redis에 저장 (Hot)
  await redis.setex(
    `session:${session.id}`,
    3600, // TTL: 1시간
    JSON.stringify(session),
  );

  // PostgreSQL에 저장 (Cold)
  await prisma.session.create({
    data: {
      id: session.id,
      user_id: params.userId,
      organization_id: params.organizationId,
      source: params.source,
      state: session.state,
      history: session.history,
      metadata: session.metadata,
      expires_at: session.expiresAt,
    },
  });

  return session;
}

/**
 * 세션 조회
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  // 1. Redis에서 조회 (빠름)
  const cached = await redis.get(`session:${sessionId}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // 2. PostgreSQL에서 조회 (느림)
  const dbSession = await prisma.session.findUnique({
    where: { id: sessionId },
  });

  if (!dbSession) {
    return null;
  }

  const session: Session = {
    id: dbSession.id,
    userId: dbSession.user_id,
    organizationId: dbSession.organization_id,
    source: dbSession.source as Session["source"],
    state: dbSession.state as Record<string, any>,
    history: dbSession.history as any[],
    metadata: dbSession.metadata as Record<string, any>,
    createdAt: dbSession.created_at,
    expiresAt: dbSession.expires_at,
  };

  // Redis에 다시 캐시
  await redis.setex(`session:${sessionId}`, 3600, JSON.stringify(session));

  return session;
}

/**
 * Slack 스레드로 세션 조회
 */
export async function getSessionBySlackThread(
  channelId: string,
  threadTs: string,
): Promise<Session | null> {
  const dbSession = await prisma.session.findFirst({
    where: {
      source: "slack",
      metadata: {
        path: ["slackThreadTs"],
        equals: threadTs,
      },
    },
    orderBy: { created_at: "desc" },
  });

  if (!dbSession) {
    return null;
  }

  return getSession(dbSession.id);
}
```

---

## Notion 동기화

### src/services/notion-sync-service.ts

```typescript
import { OrchestrationResult } from "../orchestrator/types";
import { notionMCP } from "../mcp-servers/notion";

/**
 * Orchestration 결과를 Notion에 동기화
 */
export async function syncOrchestrationToNotion(
  result: OrchestrationResult,
  organizationId: string,
) {
  try {
    // Notion connection 확인
    const connection = await prisma.notionConnection.findUnique({
      where: { organization_id: organizationId },
    });

    if (!connection) {
      console.log("Notion connection not found. Skipping sync.");
      return;
    }

    // Task 생성
    await notionMCP.createTask({
      title: `[자동화] ${result.metadata.category}`,
      description: result.output,
      status: result.status === "success" ? "completed" : "failed",
      assignee: null,
      due_date: null,
      metadata: {
        session_id: result.metadata.sessionId,
        model: result.metadata.model,
        duration: result.metadata.duration,
        skills: result.metadata.skills.join(", "),
      },
    });

    console.log("✅ Synced to Notion:", result.metadata.sessionId);
  } catch (error) {
    console.error("Notion sync failed:", error);
    // 동기화 실패는 무시 (중요하지 않음)
  }
}
```

---

## 에러 처리

### src/orchestrator/error-handler.ts

```typescript
export class OrchestrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any,
  ) {
    super(message);
    this.name = "OrchestrationError";
  }
}

export function handleOrchestrationError(error: any): string {
  // delegate_task 에러
  if (error.name === "DelegateTaskError") {
    return `🚨 에이전트 실행 실패: ${error.message}`;
  }

  // Notion MCP 에러
  if (error.message?.includes("Notion")) {
    return `🚨 Notion 연동 실패: ${error.message}. Notion API 키를 확인해주세요.`;
  }

  // 세션 에러
  if (error.code === "SESSION_NOT_FOUND") {
    return "🚨 세션을 찾을 수 없습니다. 다시 시도해주세요.";
  }

  // 일반 에러
  return `🚨 오류 발생: ${error.message}`;
}
```

---

## 로깅 및 모니터링

### src/orchestrator/logger.ts

```typescript
import winston from "winston";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.File({ filename: "logs/orchestrator.log" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

export function logOrchestration(event: string, data: any) {
  logger.info(event, {
    timestamp: new Date().toISOString(),
    ...data,
  });
}
```

### 모니터링 메트릭

```typescript
// src/orchestrator/metrics.ts

interface Metric {
  category: string;
  duration: number;
  status: "success" | "failed";
  timestamp: Date;
}

const metrics: Metric[] = [];

export function recordMetric(metric: Metric) {
  metrics.push(metric);

  // LangSmith 또는 다른 모니터링 도구로 전송
  // await langsmith.log(metric);
}

export function getMetrics() {
  return {
    total: metrics.length,
    success: metrics.filter((m) => m.status === "success").length,
    failed: metrics.filter((m) => m.status === "failed").length,
    avgDuration:
      metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length,
  };
}
```

---

## 다음 단계

1. **Slack App 생성** (Slack Developer Portal)
2. **환경 변수 설정** (`.env`)
3. **PostgreSQL 마이그레이션** (`npx prisma migrate dev`)
4. **Redis 설정** (Railway)
5. **nubabel-workflow Skill 작성** (`.opencode/skills/`)
6. **Slack Bot 실행** (`npm run start:slack`)
7. **테스트** (Slack에서 `@company-os 테스트` 전송)

---

**작성일**: 2026-01-25  
**작성자**: Sisyphus  
**버전**: 1.0.0
