# Autonomous QA/QC Protocol (YOLO MODE)

> **Purpose**: 사용자 승인 없이 자율적으로 QA/QC 수행하는 프로토콜
> **Last Updated**: 2026-01-30

---

## YOLO MODE Activation

YOLO MODE는 다음 키워드로 활성화:

- `yolo`, `YOLO`
- `autopilot`
- `자율`, `알아서`
- `승인 없이`, `확인 없이`

**활성화 시**: 사용자 승인 대기 없이 QA/QC 자동 수행

---

## QA/QC Channels

### 1. Browser Testing (Claude in Chrome - MUST USE)

> **MANDATORY**: 브라우저 테스트는 무조건 Claude in Chrome 먼저 사용

**Claude in Chrome 사용 (기본)**:

- 유저의 실제 Chrome 프로필 사용
- 로그인 상태, 쿠키, 세션 유지
- 모든 브라우저 테스트에 사용

**Playwright MCP 사용 조건**:

- Claude in Chrome 사용 불가능할 때만
- 또는 명시적으로 격리 환경 요청 시

**Test Targets:**
| URL | Purpose |
|-----|---------|
| `https://app.nubabel.com` | Dashboard (로그인 필요) |
| `https://auth.nubabel.com` | Auth 플로우 테스트 |
| `http://localhost:3000` | Local dev |

### 2. Slack Bot Testing (#it-test)

**Channel**: `#it-test`
**Bot**: `@Nubabel`

**Test Commands:**

```
@Nubabel help
@Nubabel 오늘 할 일 알려줘
@Nubabel create task: Test task from QA
@Nubabel status
```

**How to Test:**

- Agent는 직접 Slack API 호출 불가
- 대신 curl로 webhook 또는 user에게 테스트 요청 지시

### 3. Railway Build Monitoring

```bash
# Project status
railway status

# View logs (실시간)
railway logs --tail 100

# Check deployments
railway deployment list

# Trigger redeploy
railway up

# Environment variables
railway variables
```

**Health Check:**

```bash
curl -s https://auth.nubabel.com/api/health | jq
```

### 4. Local Testing

```bash
# Unit tests
npm run test

# E2E tests (Playwright)
npm run test:e2e

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

---

## Autonomous Workflow Triggers

Agent는 다음 상황에서 **자율적으로** 워크플로우 활성화 가능:

| Situation              | Auto-Trigger       |
| ---------------------- | ------------------ |
| 복잡한 멀티파일 작업   | `ultrawork`        |
| 완료까지 반복 필요     | `ralph`            |
| 계획 필요한 큰 작업    | `ralplan`          |
| 처음부터 끝까지 자동화 | `autopilot`        |
| QA 실패 시 재시도      | `ralph` + 자동 fix |

---

## QA Checklist (자동 수행)

### Pre-Deploy

- [ ] `npm run typecheck` - 타입 에러 없음
- [ ] `npm run lint` - 린트 에러 없음
- [ ] `npm run test` - 유닛 테스트 통과
- [ ] `npm run build` - 빌드 성공

### Post-Deploy

- [ ] `railway logs` - 에러 로그 없음
- [ ] Health check 응답 200
- [ ] Browser test - 주요 페이지 로드 확인
- [ ] Slack bot - 기본 응답 확인 (#it-test)

### Regression

- [ ] 기존 기능 영향 없음
- [ ] 새 기능 정상 동작

---

## Error Recovery (자동)

| Error Type     | Auto-Recovery               |
| -------------- | --------------------------- |
| Type error     | `build-fixer` agent 호출    |
| Test failure   | 원인 분석 → 자동 fix 시도   |
| Build failure  | 로그 분석 → 자동 fix 시도   |
| Deploy failure | **ralph 모드로 끝까지 fix** |

**Max Retry**: 3회 (일반 에러)
**Deploy Failure**: **무제한 - 고칠 때까지 계속**
**Retry 초과 시**: User에게 escalate (deploy 제외)

---

## Railway 배포 실패 자동 복구 (MANDATORY)

> **Railway 배포 실패 시 → ralph 모드 자동 활성화 → 고칠 때까지 계속**

### 복구 프로세스

```
Railway Deploy Failed
       ↓
1. railway logs --tail 100 (에러 로그 수집)
       ↓
2. 에러 분석 (build error? runtime error? env missing?)
       ↓
3. delegate_task로 fix 위임:
   - Build error → build-fixer agent
   - Type error → executor + typecheck
   - Runtime error → architect 분석 → executor fix
   - Env missing → 환경변수 확인/추가
       ↓
4. 다시 railway up
       ↓
5. 실패? → 3번으로 돌아가기 (ralph 모드)
       ↓
6. 성공할 때까지 반복
```

### Delegation Prompt Template (배포 실패 시)

```
TASK: Railway 배포 실패 수정 (MUST FIX - 성공할 때까지)

ERROR LOG:
{railway logs 출력}

REQUIREMENTS:
1. 에러 원인 분석
2. 코드 수정
3. npm run typecheck 통과 확인
4. npm run build 통과 확인
5. 수정 완료 보고

MUST DO:
- 에러 근본 원인 해결 (workaround 금지)
- 모든 타입 에러 해결
- 빌드 성공 확인

MUST NOT DO:
- @ts-ignore 사용 금지
- any 타입 사용 금지
- 테스트 삭제 금지

MODE: ralph (성공할 때까지 계속)
```

### 자동 명령어

```bash
# 1. 로그 확인
railway logs --tail 100

# 2. 로컬 빌드 테스트
npm run typecheck && npm run build

# 3. 재배포
railway up

# 4. 상태 확인
railway status
```

---

## Slack #it-test Integration

```
Channel: #it-test
Purpose: QA/QC 자동 테스트 전용
Bot: @Nubabel

사용 시나리오:
1. 새 기능 배포 후 → #it-test에서 @Nubabel 테스트
2. 버그 수정 후 → 관련 명령어 테스트
3. 정기 health check → 매일 자동 실행 (예정)
```

---

## Commands Quick Reference

```bash
# Railway (Project: Nubabel-Production, Service: app.nubabel.com)
railway status                    # 프로젝트 상태
railway logs --tail 50           # 최근 로그
railway up                        # 재배포
railway deployment list           # 배포 이력
railway variables                 # 환경변수 확인

# Testing
npm run test                      # 유닛 테스트 (Jest)
npm run test:e2e                  # E2E 테스트 (Playwright)
npm run test:e2e:headed           # E2E 브라우저 표시
npm run test:e2e:ui               # Playwright UI 모드
npm run typecheck                 # 타입 체크
npm run lint                      # ESLint
npm run build                     # 빌드

# Health Checks
curl -s https://auth.nubabel.com/api/health | jq
curl -s https://auth.nubabel.com/health | jq

# Deployment Scripts
./scripts/railway-deploy.sh       # 전체 배포
./scripts/verify-railway-domain.sh # 도메인 검증
```

---

## Production URLs

| Service        | URL                                                   | Purpose          |
| -------------- | ----------------------------------------------------- | ---------------- |
| Main API       | `https://auth.nubabel.com`                            | Backend + Auth   |
| Frontend       | `https://app.nubabel.com`                             | React Dashboard  |
| Railway Direct | `https://inspiring-courage-production.up.railway.app` | Railway 기본 URL |

---

## Browser Testing Methods

### Claude in Chrome (MUST USE FIRST)

> **무조건 Claude in Chrome 먼저 사용**

**모든 브라우저 테스트:**

- 로그인/인증 페이지
- 유저 세션 테스트
- OAuth 플로우
- Dashboard UI
- 모든 웹 페이지 검증

**인증/연동 작업 (Chrome 프로필 필수):**

- Claude Max 연동 설정
- Slack 워크스페이스 연동
- Notion 연동
- Google OAuth 인증
- GitHub 연동
- 기타 모든 로그인 필요 서비스

> **유저의 Chrome 프로필에 이미 로그인된 세션을 활용**
> 별도 로그인 없이 기존 인증 정보 사용

**장점:**

- 유저 프로필 유지 (로그인 상태)
- 실제 쿠키/세션 사용
- 확장 프로그램 포함
- 기존 인증 세션 재활용

### Playwright MCP (Claude in Chrome 불가 시에만)

**사용 조건:**

- Claude in Chrome 사용 불가능
- 또는 명시적으로 격리 환경 요청

```typescript
// Playwright는 Claude in Chrome 사용 불가 시에만
skill_mcp(
  (mcp_name = "playwright"),
  (tool_name = "browser_navigate"),
  (arguments = { url: "https://auth.nubabel.com/api/health" }),
);
```

---

## YOLO MODE Rules

1. **자동 실행**: QA 체크리스트 자동 수행
2. **자동 수정**: 실패 시 자동 fix 시도 (3회까지)
3. **자동 보고**: 결과만 요약해서 user에게 보고
4. **Escalate**: 3회 실패 또는 critical error 시 user 개입 요청
