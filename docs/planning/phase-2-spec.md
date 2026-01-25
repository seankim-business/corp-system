# Phase 2 상세 스펙: Visible Features

**기간**: 3개월 (2026년 2-4월)  
**목표**: 사용자가 실제로 볼 수 있고 사용할 수 있는 UI/UX 완성

---

## 📅 전체 스케줄

```
Week  1-2:  Web Dashboard
Week  3-4:  첫 워크플로우 (수동 실행)
Week  5-8:  Notion MCP 연동
Week  9-12: Slack Bot
```

---

## Week 1-2: Web Dashboard

### 목표
로그인부터 대시보드까지 기본 UI 완성

### 상세 Task

#### Day 1-2: 로그인 페이지
```
파일:
- src/pages/LoginPage.tsx
- src/components/common/GoogleButton.tsx

기능:
- Google OAuth 버튼
- 로딩 상태 표시
- 에러 메시지 표시
- 로그인 성공 → Dashboard redirect

디자인:
- 중앙 정렬 카드
- Nubabel 로고
- "Sign in with Google" 버튼 (Google 스타일)
```

#### Day 3-4: Dashboard Layout
```
파일:
- src/components/layout/Header.tsx
- src/components/layout/Sidebar.tsx
- src/pages/DashboardPage.tsx

기능:
- 상단 헤더 (로고, 사용자 정보, 로그아웃)
- 좌측 사이드바 (네비게이션)
- 메인 컨텐츠 영역

사이드바 메뉴:
├── Dashboard (홈)
├── Workflows (워크플로우 목록)
├── Executions (실행 이력)
└── Settings (설정)
```

#### Day 5-6: 조직 전환기
```
파일:
- src/components/OrganizationSwitcher.tsx
- src/stores/orgStore.ts

기능:
- 현재 조직 표시
- 드롭다운으로 조직 목록
- 조직 선택 → API 호출 → 새 JWT
- 페이지 리로드

API:
POST /auth/switch-org
  Body: { organizationId: string }
  Response: { success: true, newToken: string }
```

#### Day 7-10: 설정 페이지
```
파일:
- src/pages/SettingsPage.tsx

섹션:
1. 프로필 (Profile)
   - 이름
   - 이메일 (readonly)
   - 아바타

2. 조직 설정 (Organization)
   - 조직 이름
   - 도메인
   - 멤버 목록 (readonly)

3. 보안 (Security)
   - 세션 관리
   - 로그아웃 all devices
```

### 성공 기준
- [ ] 로그인 → Dashboard 진입
- [ ] 조직 전환 동작
- [ ] 설정 페이지 저장 가능
- [ ] 모바일 반응형 동작

### 예상 시간
- Frontend 개발: 8일
- 테스트 & 버그 수정: 2일

---

## Week 3-4: 첫 워크플로우 (수동 실행)

### 목표
워크플로우 목록 보기 + 수동 실행 + 로그 확인

### Backend 추가 필요

#### Workflow Table
```sql
workflows
├── id
├── organization_id
├── name
├── description
├── config (jsonb)
├── enabled (boolean)
├── created_at
└── updated_at

workflow_executions
├── id
├── workflow_id
├── status (pending, running, success, failed)
├── input_data (jsonb)
├── output_data (jsonb)
├── error_message (text)
├── started_at
├── completed_at
└── created_at
```

#### API Endpoints
```typescript
GET    /api/workflows
POST   /api/workflows
GET    /api/workflows/:id
PUT    /api/workflows/:id
DELETE /api/workflows/:id

POST   /api/workflows/:id/execute
GET    /api/workflows/:id/executions
GET    /api/executions/:id
```

### Frontend Pages

#### Day 1-3: Workflow 목록
```
파일:
- src/pages/WorkflowsPage.tsx
- src/components/WorkflowCard.tsx

기능:
- 워크플로우 카드 그리드
- 각 카드: 이름, 설명, 상태, 실행 버튼
- 필터 (All, Enabled, Disabled)
- 정렬 (최신순, 이름순)
```

#### Day 4-6: Workflow 상세 + 실행
```
파일:
- src/pages/WorkflowDetailPage.tsx
- src/components/ExecuteWorkflowModal.tsx

기능:
- Workflow 정보 표시
- 실행 버튼 → Modal
- Input form (JSON editor)
- 실행 → Loading → 결과

실행 Flow:
1. 버튼 클릭
2. Modal 열림
3. Input 입력 (optional)
4. Execute 클릭
5. Loading spinner
6. 결과 표시 (성공/실패)
7. Execution 목록으로 이동
```

#### Day 7-10: Execution 목록 + 상세
```
파일:
- src/pages/ExecutionsPage.tsx
- src/pages/ExecutionDetailPage.tsx

기능:
- 실행 이력 테이블
- 각 row: Workflow 이름, 상태, 시작 시간, 소요 시간
- 상태별 아이콘 (✓ ✗ ⏳)
- 클릭 → 상세 페이지

상세 페이지:
- Input data (JSON)
- Output data (JSON)
- Error message (if failed)
- Timeline (시작 → 완료)
- Retry 버튼 (if failed)
```

### 성공 기준
- [ ] Workflow 목록 보기
- [ ] 버튼 클릭으로 실행
- [ ] 실행 결과 확인 가능
- [ ] 실패 시 에러 메시지 표시

### 예상 시간
- Backend API: 4일
- Frontend: 6일
- 통합 테스트: 2일

---

## Week 5-8: Notion MCP 연동

### 목표
Notion 데이터베이스와 실시간 연동

### MCP Server 구현

#### 파일 구조
```
src/mcp-servers/notion/
├── index.ts              # MCP server entry
├── client.ts             # Notion API client
├── tools/
│   ├── getTasks.ts
│   ├── createTask.ts
│   ├── updateTask.ts
│   └── deleteTask.ts
└── types.ts
```

#### MCP Tools
```typescript
1. notion_get_tasks
   Input: { databaseId?: string, filter?: object }
   Output: Task[]

2. notion_create_task
   Input: { title: string, assignee?: string, dueDate?: string }
   Output: Task

3. notion_update_task
   Input: { taskId: string, updates: object }
   Output: Task

4. notion_delete_task
   Input: { taskId: string }
   Output: { success: boolean }
```

### Workflow 예시

#### "Create Notion Task" Workflow
```json
{
  "name": "Create Notion Task",
  "description": "Notion에 새 task 생성",
  "config": {
    "steps": [
      {
        "type": "mcp_call",
        "mcp": "notion",
        "tool": "notion_create_task",
        "input": {
          "title": "{{input.title}}",
          "assignee": "{{input.assignee}}"
        }
      }
    ]
  }
}
```

### Frontend 추가

#### Notion Settings Page
```
파일:
- src/pages/settings/NotionSettingsPage.tsx

기능:
- Notion API Key 입력
- Database ID 입력
- 연결 테스트 버튼
- 연동된 DB 목록
```

### 성공 기준
- [x] Notion API Key 저장 ✅
- [x] Workflow에서 Notion task 생성 ✅
- [x] NotionSettingsPage 구현 ✅
- [x] Database 목록 조회 기능 ✅
- [ ] Frontend 라우팅 추가 (App.tsx에 /settings/notion 경로)
- [ ] End-to-end 테스트

### 실제 구현 내용 (2026-01-25 완료)

#### Backend 구현 완료
```
src/
├── mcp-servers/notion/
│   ├── index.ts              # ✅ MCP entry point
│   ├── client.ts             # ✅ Notion SDK wrapper
│   ├── tools/
│   │   ├── getTasks.ts      # ✅ notion_get_tasks
│   │   ├── createTask.ts    # ✅ notion_create_task
│   │   ├── updateTask.ts    # ✅ notion_update_task
│   │   └── deleteTask.ts    # ✅ notion_delete_task
│   └── types.ts              # ✅ TypeScript definitions
├── api/
│   ├── workflows.ts          # ✅ MCP 호출 지원 추가
│   └── notion.ts             # ✅ NEW: 6개 엔드포인트
└── index.ts                  # ✅ Notion routes 추가
```

#### API Endpoints 구현
```
POST   /api/notion/connection     # ✅ Create connection
GET    /api/notion/connection     # ✅ Get connection
PUT    /api/notion/connection     # ✅ Update connection
DELETE /api/notion/connection     # ✅ Delete connection
GET    /api/notion/databases      # ✅ List databases
POST   /api/notion/test           # ✅ Test API key
```

#### Prisma Schema 업데이트
```prisma
model NotionConnection {
  id                String   @id @default(uuid())
  organizationId    String   @unique
  apiKey            String
  defaultDatabaseId String?
  createdAt         DateTime
  updatedAt         DateTime
}
```

#### Workflow 실행 엔진 업데이트
- ✅ `workflow.config.steps[]` 처리 로직
- ✅ `{{input.field}}` 템플릿 변수 치환
- ✅ `type: "mcp_call"` + `mcp: "notion"` 지원
- ✅ NotionConnection 자동 조회 및 API Key 주입

#### Frontend 구현 완료
```
frontend/src/pages/
└── NotionSettingsPage.tsx    # ✅ NEW
    ├── API Key 입력/저장
    ├── Connection 테스트
    ├── Database 목록 표시
    └── Default database 선택
```

### 예상 vs 실제 시간
- MCP Server: 8일 예상 → 1일 완료 ✅
- Frontend: 6일 예상 → 1일 완료 ✅
- 통합 & 테스트: 2일 예상 → 진행 중

---

## Week 9-12: Slack Bot

### 목표
Slack에서 자연어로 워크플로우 실행

### Slack App 설정

#### 1. Slack App 생성
```
OAuth Scopes:
- chat:write
- commands
- app_mentions:read

Event Subscriptions:
- app_mention
```

#### 2. Slash Command
```
/nubabel [command]

Examples:
/nubabel create task "Fix bug" assigned to Sean
/nubabel list workflows
/nubabel run "Create Notion Task"
```

#### 3. Mention
```
@Nubabel create task "New feature"
```

### Backend Implementation

#### 파일 구조
```
src/slack/
├── index.ts              # Slack Bot entry
├── handler.ts            # Event handler
├── parser.ts             # Natural language parser
├── commands/
│   ├── createTask.ts
│   ├── listWorkflows.ts
│   └── runWorkflow.ts
└── types.ts
```

#### Command Flow
```
1. Slack event 수신
   ↓
2. 자연어 파싱 (LLM)
   ↓
3. Command → Workflow 매핑
   ↓
4. Workflow 실행
   ↓
5. 결과 → Slack 메시지
```

### Natural Language Parsing

#### LLM Prompt
```
User said: "create task Fix bug assigned to Sean"

Extract:
- Command: create_task
- Parameters:
  - title: "Fix bug"
  - assignee: "Sean"

Return JSON:
{
  "command": "create_task",
  "params": { ... }
}
```

### 성공 기준
- [ ] Slack에서 `/nubabel` 명령 동작
- [ ] `@Nubabel mention` 응답
- [ ] 자연어 → Workflow 실행
- [ ] 결과 메시지 전송

### 예상 시간
- Slack App 설정: 2일
- Backend: 8일
- 테스트: 2일

---

## 🎯 Phase 2 완료 기준

### 사용자 시나리오

```
Sean이 회사에 출근했다.
  ↓
1. 브라우저로 auth.nubabel.com 접속
2. "Sign in with Google" 클릭
3. Google 로그인
4. Dashboard 진입
  ↓
5. Workflows 클릭 → 목록 확인
6. "Create Notion Task" 선택
7. "Implement dashboard" 입력
8. Execute 클릭
  ↓
9. ✓ Success! Notion에 task 생성됨
10. Executions에서 로그 확인
  ↓
11. Slack 열기
12. "@Nubabel create task Fix bug"
13. ✓ "Task created!" 메시지 받음
14. Notion 확인 → task 있음
```

### 기술적 검증

- [ ] Frontend: 모든 페이지 동작
- [ ] Backend: 모든 API 응답
- [ ] MCP: Notion 연동 성공
- [ ] Slack: Bot 응답
- [ ] Database: 데이터 저장 확인
- [ ] 에러 처리: 실패 시 적절한 메시지

### 성능 목표

- 페이지 로딩: < 2초
- API 응답: < 500ms
- Workflow 실행: < 5초
- Slack Bot 응답: < 3초

---

## 📊 리소스

### 개발 인력
- Frontend: 1명 full-time
- Backend: 1명 full-time
- (또는 Full-stack 1명)

### 예상 공수
- 총 60일 (12주 x 5일)
- 실제 개발: 50일
- 버퍼: 10일 (테스트, 버그 수정)

---

## 🚧 리스크

| 리스크 | 확률 | 대응 |
|--------|------|------|
| Notion API 변경 | 낮음 | 공식 SDK 사용 |
| Slack API rate limit | 중간 | Queue 시스템 |
| LLM 파싱 오류 | 높음 | Fallback to 구조화된 명령 |
| 일정 지연 | 중간 | MVP 범위 축소 |

---

## 📚 참조

- [Frontend 셋업](../frontend/01-setup.md)
- [API 문서](../core/04-api-spec.md)
- [Notion MCP 가이드](../core/05-mcp-notion.md)
- [Slack Bot 가이드](../core/06-slack-bot.md)
