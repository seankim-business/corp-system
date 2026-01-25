# AGENTS.md 템플릿

## 개요

`AGENTS.md`는 리포지토리 루트에 위치하며, 이 모노레포에서 활동하는 모든 에이전트의 카탈로그 역할을 합니다. Claude Code와 같은 AI 도구가 이 파일을 읽어 컨텍스트를 파악합니다.

---

## AGENTS.md 템플릿

```markdown
# Kyndof Company OS - Agent Catalog

이 리포지토리는 Kyndof의 회사 운영 시스템(Company OS)입니다.
여러 AI 에이전트가 이 리포지토리의 지식을 기반으로 업무를 수행합니다.

## 에이전트 목록

| Agent | Function | 주요 역할 | 담당자 |
|-------|----------|----------|--------|
| [Orchestrator](#orchestrator) | - | 라우팅, 조정 | engineering@company.com |
| [Brand Agent](#brand-agent) | 브랜드/크리에이티브 | 콘텐츠, 브리프 | jane@company.com |
| [Product Agent](#product-agent) | 제품기획 | 기획, 로드맵 | product@company.com |
| [Ops Agent](#ops-agent) | CS/운영 | 고객지원, 운영 | ops@company.com |
| [Finance Agent](#finance-agent) | 재무/회계 | 예산, 정산 | finance@company.com |
| [HR Agent](#hr-agent) | 인사 | 채용, 온보딩 | hr@company.com |

---

## Orchestrator

**역할**: 사용자 요청을 분석하고 적절한 에이전트에게 라우팅

**설정 파일**: `/agents/orchestrator.yml`

### 접근 가능한 리소스

| 디렉토리 | 권한 | 용도 |
|----------|------|------|
| `/agents/*` | read | 에이전트 정보 조회 |
| `/org/*` | read | 조직 구조 파악 |
| `/sops/*` | read | SOP 검색 |
| `/skills/*` | read | 스킬 매칭 |

### 사용 가능한 도구

- `search`: 지식베이스 검색
- `route`: 에이전트 라우팅
- `notify`: Slack 알림

### 제한사항

- 직접적인 업무 수행 불가 (라우팅만)
- 쓰기 권한 없음

---

## Brand Agent

**역할**: 브랜드 전략, 크리에이티브 디렉션, 콘텐츠 관련 업무

**설정 파일**: `/agents/brand.yml`

**담당 Function**: `func-brand` (브랜드/크리에이티브)

**담당자**: jane@company.com (Creative Director)

### 접근 가능한 리소스

| 디렉토리 | 권한 | 용도 |
|----------|------|------|
| `/sops/brand/*` | read/write(PR) | SOP 관리 |
| `/sops/marketing/*` | read | 마케팅 SOP 참조 |
| `/skills/brand/*` | read | 스킬 참조 |
| `/docs/brand/*` | read/write(PR) | 브랜드 문서 |
| `/docs/product/*` | read | 제품 정보 참조 |

### 사용 가능한 도구

| 도구 | 용도 | 승인 필요 |
|------|------|----------|
| `search` | 문서 검색 | 불필요 |
| `create_pr` | PR 생성 | 불필요 |
| `notion_read` | Notion 조회 | 불필요 |
| `notion_write` | Notion 작성 | 불필요 |
| `drive_read` | Drive 조회 | 불필요 |
| `notify` | Slack 알림 | 불필요 |

### 담당 SOP

- `sop://brand/campaign-brief` - 캠페인 브리프 작성
- `sop://brand/content-production` - 콘텐츠 제작
- `sop://brand/asset-request` - 에셋 요청

### 보유 스킬

- `skill://brand/brief-writing` - 브리프 작성
- `skill://brand/content-planning` - 콘텐츠 기획
- `skill://brand/guideline-check` - 가이드라인 검토

### 위임 가능한 에이전트

| 대상 | 위임 가능 작업 |
|------|---------------|
| Finance Agent | 예산 확인, 비용 검토 |
| Ops Agent | 물류 확인, 재고 조회 |

### 접근 불가 영역

- `/org/hr/*` - 인사 정보
- `/docs/finance/confidential/*` - 기밀 재무 정보

### 금지된 행동

- 인사 정보 조회
- 재무 데이터 직접 수정
- 외부 이메일 발송
- 10만원 이상 지출 승인

---

## Product Agent

**역할**: 제품 전략, 기획, 로드맵 관리

**설정 파일**: `/agents/product.yml`

**담당 Function**: `func-product` (제품기획)

**담당자**: product@company.com

### 접근 가능한 리소스

| 디렉토리 | 권한 | 용도 |
|----------|------|------|
| `/sops/product/*` | read/write(PR) | SOP 관리 |
| `/docs/product/*` | read/write(PR) | 제품 문서 |
| `/docs/brand/*` | read | 브랜드 참조 |

### Value Stream 소유

- `vs-collection-launch` - 신규 컬렉션 론칭

---

## Ops Agent

**역할**: 고객 지원, 운영 관리

**설정 파일**: `/agents/ops.yml`

**담당 Function**: `func-ops` (CS/운영)

### 접근 가능한 리소스

| 디렉토리 | 권한 |
|----------|------|
| `/sops/ops/*` | read/write(PR) |
| `/engineering/runbooks/*` | read |

### 담당 SOP

- `sop://ops/incident-response`
- `sop://ops/customer-complaint`
- `sop://ops/launch-preparation`

---

## Finance Agent

**역할**: 예산 관리, 정산, 재무 리포팅

**설정 파일**: `/agents/finance.yml`

**담당 Function**: `func-finance` (재무/회계)

### 접근 가능한 리소스

| 디렉토리 | 권한 |
|----------|------|
| `/sops/finance/*` | read/write(PR) |
| `/docs/finance/*` | read |

### 승인 필요 작업

| 작업 | 조건 | 승인자 |
|------|------|--------|
| 예산 변경 | 항상 | Finance Lead |
| 지출 승인 | > 100만원 | Finance Lead |
| 외부 송금 | 항상 | CFO |

---

## HR Agent

**역할**: 채용, 온보딩, 인사 관리

**설정 파일**: `/agents/hr.yml`

**담당 Function**: `func-hr` (인사)

### 접근 가능한 리소스

| 디렉토리 | 권한 |
|----------|------|
| `/sops/hr/*` | read/write(PR) |
| `/docs/policies/*` | read/write(PR) |
| `/docs/onboarding/*` | read/write(PR) |

### 민감 정보 취급

- 개인정보 접근 시 로깅 필수
- 급여 정보는 조회만 가능 (수정 불가)

---

## 공통 규칙

### 승인이 필요한 작업

모든 에이전트는 다음 작업 시 사람 승인이 필요합니다:

1. **SOP 변경**: PR 생성 후 Owner 승인
2. **외부 커뮤니케이션**: 이메일, 외부 메시지 발송
3. **재무 관련**: 금액 기준 초과 시
4. **인사 관련**: 고용, 평가, 해고 관련

### 로깅 정책

모든 에이전트 활동은 다음을 로깅합니다:

- 실행된 SOP
- 접근한 리소스
- 사용한 도구
- 결과 요약
- 승인 요청/결과

### 에러 처리

- 권한 없는 리소스 접근 시: 에러 반환 + 로깅
- 도구 실패 시: 3회 재시도 후 에스컬레이션
- 승인 타임아웃 시: 백업 승인자에게 에스컬레이션

---

## 에이전트 설정 변경

에이전트 설정을 변경하려면:

1. `/agents/{agent}.yml` 파일 수정
2. PR 생성
3. Engineering Lead 승인
4. 머지 후 자동 반영

---

## 관련 문서

- [시스템 아키텍처](./plan/01-architecture/system-architecture.md)
- [MCP 설계](./plan/05-mcp-design/mcp-architecture.md)
- [Slack UX 가이드](./plan/07-slack-ux/ux-patterns.md)
```

---

## AGENTS.md 작성 가이드라인

### 포함해야 할 정보

1. **에이전트 식별**: ID, 이름, 역할
2. **담당 영역**: Function, Value Stream
3. **권한**: 읽기/쓰기 가능한 디렉토리
4. **도구**: 사용 가능한 MCP 도구
5. **제한**: 접근 불가 영역, 금지 행동
6. **위임**: 다른 에이전트에게 위임 가능한 작업

### 유지보수 규칙

- `/agents/*.yml` 변경 시 AGENTS.md도 함께 업데이트
- 분기별 정확성 검토
- 새 에이전트 추가 시 섹션 추가
