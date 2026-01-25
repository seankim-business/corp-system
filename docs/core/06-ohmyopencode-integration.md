# OhMyOpenCode 통합 설계

> **핵심**: Nubabel의 Orchestrator가 OhMyOpenCode의 `delegate_task`를 호출하여 범용 MCP 통합 기반 멀티 에이전트 오케스트레이션 구현

---

## 📋 업데이트 (2026-01-25 23:30)

**중요한 변경사항**:

- ❌ ~~Notion 전용 시스템~~
- ✅ **범용 MCP 통합 시스템**으로 재설계
- 지원: Notion, Linear, Jira, Asana, Airtable, Monday, ClickUp, Todoist 등 모든 MCP 서버

---

## 개요

### 범용 MCP 통합 시스템

**설계 원칙**:

1. **도구 중립적**: 특정 도구에 종속되지 않음
2. **플러그인 방식**: 새로운 도구 추가 시 코드 변경 불필요
3. **동적 감지**: 연결된 MCP를 런타임에 감지
4. **우아한 실패**: 도구가 없어도 가이드 제공

### 지원하는 도구들

| 카테고리               | 도구들                                        |
| ---------------------- | --------------------------------------------- |
| **Task Management**    | Notion, Linear, Asana, Jira, Todoist, ClickUp |
| **Project Management** | Notion, Linear, Monday, Basecamp              |
| **Documentation**      | Notion, Confluence, Google Docs, Coda         |
| **Spreadsheets**       | Airtable, Google Sheets, Notion databases     |
| **Communication**      | Slack, Discord, Microsoft Teams               |

---

## delegate_task API

### 기본 호출

```typescript
import { delegate_task } from "@ohmyopencode/core";

const result = await delegate_task({
  category: "quick",
  load_skills: ["mcp-integration"], // ← 범용 스킬!
  prompt: "Create a task in Linear",
  session_id: sessionId,
  context: {
    availableMCPs: [
      { provider: "linear", name: "Linear Production", enabled: true },
      { provider: "notion", name: "Notion Workspace", enabled: true },
    ],
  },
});
```

### Context 전달

Orchestrator는 **사용 가능한 MCP 목록**을 context로 전달:

```typescript
const mcpConnections = await getActiveMCPConnections(organizationId);

const context = {
  availableMCPs: mcpConnections.map((conn) => ({
    provider: conn.provider, // 'linear', 'notion', 'jira' 등
    name: conn.name,
    enabled: conn.enabled,
  })),
};
```

---

## Category 시스템 (동일)

7가지 내장 Category는 그대로 유지됩니다.

---

## Skill 시스템 (업데이트)

### mcp-integration Skill

**변경 전**: `nubabel-workflow` (Notion 전용)  
**변경 후**: `mcp-integration` (모든 MCP 지원)

**파일**: `.opencode/skills/mcp-integration/SKILL.md`

```markdown
---
name: mcp-integration
description: Generic MCP integration skill for ANY productivity tool
---

# MCP Integration Skill

You can work with ANY productivity tool that has an MCP server.

## How to Use

1. **Detect the tool** the user is asking about
2. **Check available MCP connections** for that tool
3. **Use the appropriate MCP tools** to fulfill the request
4. **Handle errors gracefully** if the tool isn't connected

## Examples

**User**: "Create a task in Linear"
**You**:

1. Check if Linear MCP is connected (from context.availableMCPs)
2. If yes: Use `linear_create_task()` tool
3. If no: Guide user to connect Linear

**User**: "Update my Jira ticket"
**You**:

1. Check if Jira MCP is connected
2. If yes: Use `jira_update_issue()` tool
3. If no: Suggest connecting Jira

## Error Handling

If a tool isn't connected:
\`\`\`
❌ Linear is not connected yet.

To connect Linear:

1. Go to Settings → Integrations
2. Click "Connect Linear"
3. Provide your API key

Would you like me to help with something else?
\`\`\`
```

---

## MCPConnection 모델

### Prisma 스키마

```prisma
model MCPConnection {
  id             String   @id @default(uuid())
  organizationId String
  provider       String   // 'linear', 'notion', 'jira', 'asana' 등
  name           String   // 사용자 친화적 이름
  config         Json     // Provider별 설정 (API keys, tokens)
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])

  @@index([organizationId])
  @@index([provider])
}
```

### MCP Registry 서비스

```typescript
// src/services/mcp-registry.ts

export async function getActiveMCPConnections(
  organizationId: string,
): Promise<MCPConnection[]> {
  return await prisma.mCPConnection.findMany({
    where: {
      organizationId,
      enabled: true,
    },
  });
}

export async function createMCPConnection(params: {
  organizationId: string;
  provider: string;
  name: string;
  config: Record<string, any>;
}): Promise<MCPConnection> {
  return await prisma.mCPConnection.create({
    data: {
      organizationId: params.organizationId,
      provider: params.provider,
      name: params.name,
      config: params.config,
      enabled: true,
    },
  });
}
```

---

## Orchestrator 통합

### 실행 흐름

```
User: "Create a task in Linear"
  ↓
Orchestrator:
1. analyzeRequest() → { target: 'linear', action: 'create', object: 'task' }
2. selectCategory() → 'quick'
3. selectSkills() → ['mcp-integration']  ← 범용 스킬
4. getActiveMCPConnections() → [{ provider: 'linear', ... }]
5. delegate_task() with context
  ↓
Sisyphus-Junior:
1. Load mcp-integration skill
2. Check context.availableMCPs
3. Find Linear is connected
4. Use linear_create_task() tool
5. Return result
  ↓
User: ✅ Task created in Linear!
```

### 구현 예시

```typescript
// src/orchestrator/index.ts

export async function orchestrate(request: OrchestrationRequest) {
  const analysis = await analyzeRequest(request.userRequest);
  const category = selectCategory(request.userRequest, analysis);
  const skills = selectSkills(request.userRequest); // ['mcp-integration']

  // ← 핵심: 사용 가능한 MCP 목록 조회
  const mcpConnections = await getActiveMCPConnections(request.organizationId);

  const context = {
    availableMCPs: mcpConnections.map((conn) => ({
      provider: conn.provider,
      name: conn.name,
      enabled: conn.enabled,
    })),
  };

  const result = await delegate_task({
    category,
    load_skills: skills,
    prompt: request.userRequest,
    session_id: request.sessionId,
    context, // ← MCP 정보 전달
  });

  return result;
}
```

---

## 사용 예시

### 시나리오 1: Linear 작업 생성

**사용자**: "Create a task in Linear: Implement OAuth"

**시스템 동작**:

1. Orchestrator가 Linear MCP 연결 확인
2. `mcp-integration` 스킬 로드
3. Sisyphus-Junior가 `linear_create_task()` 호출
4. 결과: "✅ Task created in Linear: Implement OAuth"

### 시나리오 2: 도구가 없는 경우

**사용자**: "Create a task in Jira"

**시스템 동작**:

1. Orchestrator가 Jira MCP 연결 확인 → 없음
2. Sisyphus-Junior가 우아하게 처리:

```
❌ Jira is not connected yet.

To connect Jira:
1. Go to Settings → Integrations
2. Click "Connect Jira"
3. Provide your:
   - Jira domain (yourcompany.atlassian.net)
   - API token
   - Email address

Would you like me to help with something else in the meantime?
```

### 시나리오 3: 여러 도구 동시 사용

**사용자**: "Create a task in Notion and sync it to Linear"

**시스템 동작**:

1. 멀티 에이전트 감지
2. 병렬 실행:
   - Agent 1: Notion task 생성
   - Agent 2: Linear issue 생성
3. 결과 병합

---

## 세션 관리 (Enhanced)

### Session 모델 확장

```prisma
model Session {
  id             String   @id
  userId         String
  organizationId String
  tokenHash      String?  // JWT 세션용
  source         String?  // 'slack', 'web', 'terminal' (Orchestrator용)
  state          Json     @default("{}")  // Orchestrator 상태
  history        Json     @default("[]")  // 대화 히스토리
  metadata       Json     @default("{}")  // 추가 데이터
  expiresAt      DateTime
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

**이중 목적**:

1. JWT 인증 세션 (tokenHash 사용)
2. Orchestrator 대화 세션 (source, state, history 사용)

---

## 다음 단계

### 통합 체크리스트

- [x] Prisma 스키마에 MCPConnection 추가
- [x] mcp-integration 스킬 작성
- [x] MCP Registry 서비스 구현
- [x] Orchestrator에 context 전달 로직 추가
- [x] Slack Bot 통합
- [ ] Settings UI에서 MCP 연결 관리
- [ ] 각 MCP별 설정 템플릿 (Linear, Jira, etc.)
- [ ] 테스트 시나리오 작성

---

**작성일**: 2026-01-25 23:30  
**작성자**: Sisyphus  
**버전**: 2.0.0 (범용 MCP 통합)
