# Phase 2 Week 9-12: Slack Bot + Orchestrator 기술 명세

> **최종 업데이트**: 2026-01-26 00:15  
> **작성자**: Sisyphus  
> **상태**: ✅ 완료 - 구현 완료

---

## 📋 Executive Summary

### 목표

Slack 자연어 메시지를 받아 OhMyOpenCode `delegate_task`로 에이전트를 실행하고, 범용 MCP 시스템으로 다양한 생산성 도구와 연동하는 전체 플로우 구현.

### 핵심 결정 사항

| 항목                        | 선택                            | 이유                                                 |
| --------------------------- | ------------------------------- | ---------------------------------------------------- |
| **Agent 오케스트레이션**    | OhMyOpenCode `delegate_task`    | 이미 사용 중, 간단한 API, Category/Skill 시스템 내장 |
| **Workflow 오케스트레이션** | LangGraph (향후)                | 복잡한 멀티 에이전트 시 사용, Phase 3                |
| **Slack 통합**              | @slack/bolt (Socket Mode)       | Railway WebSocket 지원, 간단한 설정                  |
| **Session 관리**            | Redis (hot) + PostgreSQL (cold) | 빠른 접근 + 영구 저장                                |
| **우선순위**                | Slack Bot 먼저 → Orchestrator   | 가시적 성과 우선                                     |

---

## 🏗️ 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│ Slack User                                                      │
│ "@company-os Linear에서 진행 중인 task를 완료 처리해줘"          │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ src/api/slack.ts (Slack Bot)                                    │
│ ├─ app_mention event 수신                                       │
│ ├─ Slack user → Nubabel user 매핑                               │
│ ├─ Session 생성/복원 (Redis + PostgreSQL)                       │
│ └─ orchestrate() 호출                                           │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ src/orchestrator/index.ts (Orchestrator)                        │
│ ├─ Request Analyzer: 의도 파악 (intent, entities)               │
│ ├─ Category Selector: 7가지 category 중 선택                    │
│ ├─ Skill Selector: 필요한 skills 선택                           │
│ └─ Multi-Agent Detector: 복합 요청 감지                         │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ OhMyOpenCode delegate_task                                      │
│ {                                                                │
│   category: 'quick',                                             │
│   load_skills: ['mcp-integration'],                              │
│   prompt: '...',                                                 │
│   session_id: 'ses_abc123',                                      │
│   context: { availableMCPs: [{provider: 'linear', ...}] }        │
│ }                                                                │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ Sisyphus-Junior (OhMyOpenCode Agent)                            │
│ ├─ mcp-integration skill 로드                                   │
│ ├─ availableMCPs에서 Linear 감지                                │
│ ├─ LLM 호출 (category별 최적 모델)                              │
│ └─ linear_get_issues(), linear_update_issue() 실행              │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ MCP Registry (PostgreSQL: mcp_connections)                      │
│ ├─ 연결된 MCP 조회 (Linear, Notion, Jira, etc.)                 │
│ ├─ Provider별 설정 로드                                          │
│ └─ 동적으로 MCP 서버 실행                                        │
└─────────────────┬───────────────────────────────────────────────┘
                  │ (결과 역방향 전달)
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ Slack Bot                                                       │
│ ├─ 결과 포맷팅 (페르소나별 emoji)                                │
│ ├─ Slack 메시지 전송                                            │
│ └─ Execution 히스토리 저장 (PostgreSQL)                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📂 디렉토리 구조

```
src/
├── api/
│   ├── slack.ts                    # ✨ NEW: Slack Bot entry point
│   │   ├─ app.event('app_mention')
│   │   ├─ getUserBySlackId()
│   │   ├─ createSession()
│   │   └─ orchestrate() 호출
│   ├── workflows.ts                # 기존
│   └── notion.ts                   # 기존
│
├── orchestrator/                   # ✨ NEW: Orchestrator 모듈
│   ├── index.ts                    # orchestrate() 메인 함수
│   ├── request-analyzer.ts         # analyzeRequest()
│   ├── category-selector.ts        # selectCategory()
│   ├── skill-selector.ts           # selectSkills()
│   ├── multi-agent.ts              # orchestrateMulti()
│   ├── session-manager.ts          # createSession(), getSession()
│   └── types.ts                    # TypeScript 타입
│
├── services/                       # ✨ NEW: 비즈니스 로직
│   ├── slack-service.ts            # getUserBySlackId()
│   └── mcp-registry.ts             # getActiveMCPConnections()
│
└── mcp-servers/
    └── notion/                     # 기존
        └── ...
```

---

## 🔑 핵심 컴포넌트

### 1. OhMyOpenCode delegate_task API

```typescript
import { delegate_task } from '@ohmyopencode/core';

const result = await delegate_task({
  // 필수: 작업 유형 (7가지 내장)
  category: 'visual-engineering' | 'ultrabrain' | 'artistry' | 'quick' |
            'unspecified-low' | 'unspecified-high' | 'writing',

  // 필수: 작업 설명
  prompt: string,

  // 필수: 스킬 로드 (빈 배열 가능)
  load_skills: ['playwright' | 'git-master' | 'frontend-ui-ux' | 'mcp-integration'],

  // 선택: 세션 ID
  session_id?: string,

  // 선택: 비동기 실행
  run_in_background?: boolean
});
```

**Category 시스템**:
| Category | 모델 | 온도 | 용도 |
|----------|------|------|------|
| visual-engineering | gemini-3-pro | 0.7 | Frontend, UI/UX |
| ultrabrain | gpt-5.2-codex | xhigh | 복잡한 아키텍처 |
| artistry | gemini-3-pro | max | 창의적 작업 |
| quick | claude-haiku-4-5 | 0.3 | 간단한 작업 |
| writing | gemini-3-flash | 0.6 | 문서 작성 |

**Skill 시스템**:

- `playwright`: 브라우저 자동화
- `git-master`: Git 전문가
- `frontend-ui-ux`: UI/UX 디자이너
- `mcp-integration`: 범용 MCP 통합 전문가 (커스텀 - Linear, Notion, Jira, Asana 등)

---

### 2. Slack Bot (src/api/slack.ts)

**주요 기능**:

1. `@company-os` 멘션 수신
2. Slack user → Nubabel user 매핑
3. Session 생성/복원
4. Orchestrator 호출
5. 결과 포맷팅 및 전송

**코드 예시**:

```typescript
app.event("app_mention", async ({ event, say }) => {
  const { user, text, channel, thread_ts } = event;

  // 1. 사용자 인증
  const nubabelUser = await getUserBySlackId(user);

  // 2. Session 생성
  const session = await createSession({
    userId: nubabelUser.id,
    source: "slack",
    metadata: { channel, thread_ts },
  });

  // 3. Orchestrator 호출
  const result = await orchestrate({
    userRequest: text,
    sessionId: session.id,
  });

  // 4. 결과 전송
  await say({
    text: formatResponse(result),
    thread_ts,
  });
});
```

---

### 3. Orchestrator (src/orchestrator/index.ts)

**책임**:

1. 사용자 요청 분석
2. Category 선택
3. Skill 선택
4. `delegate_task` 호출
5. Execution 히스토리 저장

**코드 예시**:

```typescript
export async function orchestrate(request: OrchestrationRequest) {
  // 1. 요청 분석
  const analysis = await analyzeRequest(request.userRequest);

  // 2. Category 선택
  const category = selectCategory(request.userRequest, analysis);

  // 3. Skill 선택
  const skills = selectSkills(request.userRequest, analysis);

  // 4. delegate_task 호출
  const result = await delegate_task({
    category,
    load_skills: skills,
    prompt: request.userRequest,
    session_id: request.sessionId,
  });

  // 5. 히스토리 저장
  await saveExecution({
    organizationId: request.organizationId,
    userId: request.userId,
    category,
    skills,
    result,
  });

  return result;
}
```

---

### 4. Request Analyzer

**입력**: `"Linear에서 진행 중인 이슈를 완료 처리해줘"`

**출력**:

```typescript
{
  intent: 'update_issue',
  entities: {
    target: 'linear',
    action: 'update',
    object: 'issue'
  },
  keywords: ['linear', '진행', '이슈', '완료', '처리'],
  requiresMultiAgent: false,
  complexity: 'low'
}
```

---

### 5. Category Selector

**로직**:

```typescript
function selectCategory(userRequest: string, analysis: RequestAnalysis) {
  const keywords = {
    "visual-engineering": ["디자인", "UI", "UX", "프론트엔드"],
    ultrabrain: ["아키텍처", "최적화", "복잡한"],
    artistry: ["창의적", "아이디어", "콘셉트"],
    quick: ["업데이트", "수정", "간단한"],
    writing: ["문서", "SOP", "가이드"],
  };

  // 키워드 매칭 점수 계산
  for (const [category, words] of Object.entries(keywords)) {
    if (words.some((word) => userRequest.includes(word))) {
      return category;
    }
  }

  // Fallback: 복잡도 기반
  return analysis.complexity === "low" ? "quick" : "unspecified-low";
}
```

---

### 6. Skill Selector

**로직**:

```typescript
function selectSkills(userRequest: string, analysis: RequestAnalysis) {
  const skills = [];

  // MCP 도구 관련 → mcp-integration
  const mcpTools = ["notion", "linear", "jira", "asana", "airtable"];
  if (mcpTools.some((tool) => userRequest.toLowerCase().includes(tool))) {
    skills.push("mcp-integration");
  }

  // 브라우저 → playwright
  if (userRequest.includes("스크린샷") || userRequest.includes("브라우저")) {
    skills.push("playwright");
  }

  // Git → git-master
  if (userRequest.includes("커밋") || userRequest.includes("git")) {
    skills.push("git-master");
  }

  // UI/디자인 → frontend-ui-ux
  if (userRequest.includes("디자인") || userRequest.includes("UI")) {
    skills.push("frontend-ui-ux");
  }

  return skills;
}
```

---

### 7. Session Manager

**Redis (Hot)**:

- TTL: 3600초 (1시간)
- 빠른 접근

**PostgreSQL (Cold)**:

- 영구 저장
- 히스토리 추적

**Schema**:

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  source VARCHAR(50) NOT NULL,  -- 'slack' | 'web' | 'terminal'
  state JSONB DEFAULT '{}',
  history JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);
```

---

### 8. mcp-integration Skill

**정의 파일**: `.opencode/skills/mcp-integration/SKILL.md`

````markdown
---
name: mcp-integration
description: 범용 MCP (Model Context Protocol) 통합 전문 스킬
---

# MCP Integration Skill

당신은 범용 MCP (Model Context Protocol) 통합 전문가입니다.

## 지원 MCP 도구

사용자가 연결한 MCP 도구들이 `context.availableMCPs`에 제공됩니다:

```typescript
context.availableMCPs = [
  { provider: "linear", name: "Linear Production", enabled: true },
  { provider: "notion", name: "Notion Workspace", enabled: true },
  { provider: "jira", name: "Jira Cloud", enabled: true },
];
```
````

## 동작 방식

1. **연결 확인**: 요청된 도구가 `availableMCPs`에 있는지 확인
2. **도구 없으면**: 사용자에게 Settings에서 연결하라고 안내
3. **도구 있으면**: 해당 MCP 도구 사용 (동적으로 로드됨)

## 예시

- Linear: `linear_get_issues()`, `linear_update_issue()`
- Notion: `notion_get_tasks()`, `notion_update_task()`
- Jira: `jira_get_issues()`, `jira_transition_issue()`

```

---

## 📊 데이터 플로우 예시

### Scenario: "Linear에서 진행 중인 이슈를 완료 처리해줘"

```

1. Slack User
   └─ "@company-os Linear에서 진행 중인 이슈를 완료 처리해줘"

2. Slack Bot (src/api/slack.ts)
   ├─ event.text: "Notion에서 진행 중인 task를 완료 처리해줘"
   ├─ getUserBySlackId(event.user) → nubabelUser
   ├─ createSession({ userId, source: 'slack' }) → session
   └─ orchestrate({ userRequest, sessionId })

3. Orchestrator (src/orchestrator/index.ts)
   ├─ analyzeRequest()
   │ └─ { intent: 'update_task', entities: { target: 'notion' } }
   ├─ selectCategory() → 'quick'
   ├─ selectSkills() → ['nubabel-workflow']
   └─ delegate_task({
   category: 'quick',
   load_skills: ['nubabel-workflow'],
   prompt: "Notion에서 진행 중인 task를 완료 처리해줘",
   session_id: session.id
   })

4. OhMyOpenCode delegate_task
   ├─ Sisyphus-Junior 에이전트 실행
   ├─ Model: claude-haiku-4-5 (quick category)
   ├─ nubabel-workflow skill 로드 → Notion MCP 서버 실행
   └─ System Prompt: "당신은 Nubabel 워크플로우 전문가입니다..."

5. Sisyphus-Junior 추론
   ├─ "Notion에서 진행 중인 task를 조회해야겠다"
   ├─ Tool: notion_get_tasks({ status: "in_progress" })
   ├─ 결과: [{ id: "task_123", title: "구현 작업", status: "in_progress" }]
   ├─ "첫 번째 task를 완료 처리하자"
   └─ Tool: notion_update_task({ taskId: "task_123", status: "completed" })

6. Notion MCP
   ├─ Notion API 호출: PATCH /v1/pages/task_123
   └─ 응답: { status: "completed", updated_at: "2026-01-25T..." }

7. Orchestrator
   ├─ 결과 수신: "✅ Task '구현 작업'을 완료 처리했습니다."
   ├─ saveExecution() → PostgreSQL workflow_executions 테이블
   └─ return result

8. Slack Bot
   ├─ formatResponse() → "⚡ _[quick]_ ✅ Task '구현 작업'을 완료 처리했습니다."
   └─ say({ text, thread_ts })

9. Slack User
   └─ Slack 메시지 수신: "⚡ _[quick]_ ✅ Task '구현 작업'을 완료 처리했습니다."

````

---

## 🧪 테스트 시나리오

### 1. 단순 Task 업데이트

**입력**: `"@company-os Notion task 제목 수정"`

**기대 결과**:

- Category: `quick`
- Skills: `['nubabel-workflow']`
- Model: `claude-haiku-4-5`
- Notion MCP: `notion_update_task()` 호출
- 응답: `"⚡ *[quick]* ✅ Task 제목을 수정했습니다."`

---

### 2. UI 구현 요청

**입력**: `"@company-os Notion 디자인 요구사항을 프론트엔드로 구현"`

**기대 결과**:

- Category: `visual-engineering`
- Skills: `['nubabel-workflow', 'frontend-ui-ux']`
- Model: `gemini-3-pro`
- 작업: Notion 조회 → React 컴포넌트 생성
- 응답: `"🎨 *[visual-engineering]* ✅ 컴포넌트를 구현했습니다."`

---

### 3. 복합 요청 (멀티 에이전트)

**입력**: `"@company-os 캠페인 아이디어 10개 생성하고 예산도 검토해줘"`

**기대 결과**:

- Multi-Agent 감지: `true`
- 병렬 실행:
  1. Category: `artistry`, Prompt: "캠페인 아이디어 10개 생성"
  2. Category: `unspecified-low`, Prompt: "예산 검토"
- 결과 병합
- 응답: `"✨ *[artistry]* 아이디어 10개 생성 완료\n🤖 *[unspecified-low]* 예산 검토 완료"`

---

## 🚀 구현 순서 (4주)

### Week 9: Slack Bot 기본 설정

- [ ] Slack App 생성 (Developer Portal)
- [ ] Bot Token Scopes 설정 (`app_mentions:read`, `chat:write`)
- [ ] Socket Mode 활성화
- [ ] `src/api/slack.ts` 구현
- [ ] 테스트: `@company-os 테스트` → 응답 확인

### Week 10: Orchestrator 구현

- [ ] `src/orchestrator/index.ts` 구현
- [ ] `request-analyzer.ts` 구현
- [ ] `category-selector.ts` 구현
- [ ] `skill-selector.ts` 구현
- [ ] 테스트: 각 category별 delegate_task 호출

### Week 11: nubabel-workflow Skill + Session 관리

- [ ] `.opencode/skills/nubabel-workflow/SKILL.md` 작성
- [ ] Notion MCP 연동 테스트
- [ ] `session-manager.ts` 구현 (Redis + PostgreSQL)
- [ ] Session 연속성 테스트 (후속 요청)

### Week 12: 멀티 에이전트 + 통합 테스트

- [ ] `multi-agent.ts` 구현
- [ ] 병렬 실행 테스트
- [ ] E2E 테스트 (Slack → Notion 전체 플로우)
- [ ] Execution 히스토리 확인
- [ ] Phase 2 완료 🎉

---

## 📦 배포 체크리스트

### 환경 변수

```bash
# .env

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# OhMyOpenCode
OPENCODE_API_KEY=...

# Session 관리
REDIS_URL=redis://...
DATABASE_URL=postgresql://...

# Notion MCP
NOTION_API_KEY=...
````

### Railway 설정

- [ ] Redis 추가
- [ ] 환경 변수 설정
- [ ] Socket Mode 포트 열기
- [ ] Health check 설정

### 검증

- [ ] Slack에서 `@company-os 테스트` → 응답 확인
- [ ] Notion task 생성 확인
- [ ] Session 연속성 확인
- [ ] Execution 히스토리 확인

---

## 📚 참조 문서

**핵심**:

1. **[OhMyOpenCode 통합 설계](../core/06-ohmyopencode-integration.md)** - delegate_task API, Category/Skill
2. **[Slack + Orchestrator 구현](../core/07-slack-orchestrator-implementation.md)** - 상세 코드

**설계**: 3. [Slack Bot 전략](../../plan/07-slack-ux/bot-strategy.md) 4. [Orchestrator 설계](../../plan/06-multi-agent/orchestrator.md) 5. [Agent Catalog](../../plan/06-multi-agent/agent-catalog-schema.md)

**OhMyOpenCode 공식 문서**: 6. [Orchestration Guide](../../oh-my-opencode/docs/orchestration-guide.md) 7. [Category & Skill Guide](../../oh-my-opencode/docs/category-skill-guide.md)

---

## ✅ 성공 기준

### Phase 2 Week 9-12 완료 기준

- [ ] Slack에서 `@company-os` 멘션으로 명령 가능
- [ ] Orchestrator가 요청을 분석해 적절한 category 선택
- [ ] `delegate_task`가 정상 호출되고 결과 반환
- [ ] Notion MCP로 task 생성/수정 가능
- [ ] Session 연속성 유지 (후속 요청 컨텍스트 보존)
- [ ] Execution 히스토리 PostgreSQL에 저장
- [ ] 멀티 에이전트 협업 (순차/병렬) 동작

---

**작성일**: 2026-01-25  
**최종 검토**: Sisyphus  
**버전**: 1.0.0  
**상태**: ✅ 구현 준비 완료
