# SOPs 구조 설계

## 개요

`/sops` 디렉토리는 표준 운영 절차(Standard Operating Procedures)를 관리합니다. SOP는 에이전트가 실행할 수 있으면서 사람도 읽기 쉬운 Markdown + YAML frontmatter 형식입니다.

---

## 디렉토리 구조

```
/sops
├── _schema.yml              # SOP 스키마 정의
├── _template.md             # SOP 템플릿
│
├── brand/
│   ├── campaign-brief.md
│   ├── content-production.md
│   └── asset-request.md
│
├── product/
│   ├── collection-planning.md
│   └── collection-launch.md
│
├── ops/
│   ├── incident-response.md
│   ├── customer-complaint.md
│   └── launch-preparation.md
│
├── finance/
│   ├── expense-reimbursement.md
│   ├── invoice-approval.md
│   └── budget-request.md
│
├── hr/
│   ├── onboarding.md
│   ├── leave-request.md
│   └── offboarding.md
│
└── engineering/
    ├── deployment.md
    └── code-review.md
```

---

## SOP 스키마

```yaml
# /sops/_schema.yml
$schema: "https://json-schema.org/draft/2020-12/schema"
$id: "https://company-os/schemas/sop.json"

type: object

required:
  - schema_version
  - kind
  - metadata

properties:
  schema_version:
    type: string
    const: "1.0"

  kind:
    type: string
    const: "SOP"

  metadata:
    type: object
    required:
      - id
      - title
      - version
      - status
      - ownership
    properties:
      id:
        type: string
        pattern: "^sop-[a-z]+-[a-z-]+$"
      title:
        type: string
      version:
        type: string
        pattern: "^\\d+\\.\\d+\\.\\d+$"
      status:
        type: string
        enum: [draft, active, deprecated]
      ownership:
        type: object
        required: [function, agent]
        properties:
          function:
            type: string
          agent:
            type: string
          human_owner:
            type: string
      triggers:
        type: array
        items:
          type: object
          properties:
            type:
              type: string
            pattern:
              type: string
      tags:
        type: array
        items:
          type: string
      approval_required:
        type: boolean
      estimated_duration:
        type: string
```

---

## SOP 템플릿

```markdown
---
schema_version: "1.0"
kind: "SOP"

metadata:
  id: "sop-{function}-{name}"
  title: "{SOP 제목}"
  version: "1.0.0"
  status: "active"  # draft | active | deprecated

  ownership:
    function: "func-{function}"
    agent: "agent-{function}"
    human_owner: "owner@company.com"

  triggers:
    - type: "slack_mention"
      pattern: "키워드"
    - type: "notion_status"
      database: "데이터베이스"
      status: "상태"

  tags:
    - "{function}"
    - "관련 태그"

  approval_required: true
  estimated_duration: "예상 소요 시간"
---

# {SOP 제목}

## 목적

이 SOP의 목적과 범위를 명확히 기술합니다.

## 전제 조건 (Prerequisites)

이 SOP를 실행하기 전에 충족되어야 하는 조건들:

- [ ] 조건 1
- [ ] 조건 2
- [ ] 조건 3

## 단계별 절차 (Steps)

### Step 1: {단계 제목}

**담당**: agent-{name} | human:{role}

**입력**:
- 필요한 입력 정보

**수행 작업**:
1. 세부 작업 1
2. 세부 작업 2

**출력**:
- 이 단계의 결과물

---

### Step 2: {단계 제목}

**담당**: agent-{name}

**수행 작업**:
1. 세부 작업 1
2. 세부 작업 2

> **위임**: 다른 에이전트에게 위임 가능
>
> 대상: agent-{other}
> 작업: 위임 내용

---

### Step 3: {승인이 필요한 단계}

**담당**: human:{role}

> **승인 포인트**: 사전 승인 필요
>
> 승인자: {Role/Name}
> 승인 채널: Slack DM 또는 #{channel}
> 승인 기준:
> - 기준 1
> - 기준 2

**승인 후 진행**:
- 승인 완료 시 다음 단계로
- 거절 시 Step X로 복귀

---

### Step 4: {인간만 수행하는 단계}

**담당**: human:{role}

> **에스컬레이션**: 이 단계는 반드시 인간이 수행

**수행 작업**:
- 인간이 수행해야 하는 작업

---

### Step 5: {최종 단계}

**담당**: agent-{name}

**수행 작업**:
1. 최종 작업
2. 결과 정리
3. 알림 발송

**산출물**:
- 최종 산출물 목록

## 예외 처리

| 상황 | 대응 방법 |
|------|----------|
| 예외 상황 1 | 대응 방법 |
| 예외 상황 2 | 대응 방법 |
| 타임아웃 | 에스컬레이션 대상 |

## 관련 리소스

- [관련 문서 1](doc://path/to/doc)
- [관련 SOP](sop://function/name)
- [외부 링크](https://...)

## 체크리스트

완료 전 확인 항목:

- [ ] 필수 산출물 생성 완료
- [ ] 승인 획득 완료
- [ ] 알림 발송 완료
- [ ] 상태 업데이트 완료

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.0.0 | 2025-01-01 | 최초 작성 | Name |
```

---

## SOP 예시: 캠페인 브리프 작성

```markdown
---
schema_version: "1.0"
kind: "SOP"

metadata:
  id: "sop-brand-campaign-brief"
  title: "캠페인 브리프 작성"
  version: "1.2.0"
  status: "active"

  ownership:
    function: "func-brand"
    agent: "agent-brand"
    human_owner: "jane@company.com"

  triggers:
    - type: "slack_mention"
      pattern: "캠페인 브리프"
    - type: "slack_mention"
      pattern: "마케팅 브리프"
    - type: "notion_status"
      database: "Campaign Requests"
      status: "Requested"

  tags:
    - "brand"
    - "campaign"
    - "creative"
    - "marketing"

  approval_required: true
  estimated_duration: "2시간"
---

# 캠페인 브리프 작성

## 목적

마케팅 캠페인의 방향성, 목표, 요구사항을 정리한 브리프 문서를 작성합니다. 이 브리프는 크리에이티브 팀, 외부 파트너, 그리고 관련 부서가 캠페인을 이해하고 실행하는 기준이 됩니다.

## 전제 조건 (Prerequisites)

- [ ] 캠페인 요청이 Notion 또는 Slack을 통해 접수됨
- [ ] 대략적인 예산 범위가 파악됨 (미확정 시 Finance Agent 확인 필요)
- [ ] 캠페인 일정 (론칭 희망일)이 대략 확정됨

## 단계별 절차 (Steps)

### Step 1: 요청 정보 수집

**담당**: agent-brand

**입력**:
- 캠페인 요청서 (Notion 페이지 또는 Slack 메시지)
- 요청자 정보

**수행 작업**:
1. 캠페인 요청 내용 파싱
2. 캠페인 목적 및 목표 파악
3. 타겟 오디언스 정의
4. 희망 일정 및 채널 확인
5. 기존 유사 캠페인 검색 (Notion: Past Campaigns)

**출력**:
- 요청 정보 요약 문서

---

### Step 2: 예산 확인

**담당**: agent-brand → agent-finance (위임)

> **위임**: Finance Agent에게 예산 확인 위임
>
> 대상: agent-finance
> 작업: 해당 부서/프로젝트의 가용 예산 확인
> 스킬: skill://finance/budget-check

**입력**:
- 요청 부서
- 예상 예산 범위

**출력**:
- 가용 예산 정보
- 예산 상태 (healthy/warning/over)

---

### Step 3: 브리프 초안 작성

**담당**: agent-brand

**수행 작업**:
1. 브리프 템플릿 로드 (Notion: Campaign Brief Template)
2. 수집된 정보로 각 섹션 작성:
   - 캠페인 개요
   - 목표 및 KPI
   - 타겟 오디언스
   - 핵심 메시지
   - 채널 전략
   - 예산 및 일정
   - 성공 지표
3. 브랜드 가이드라인 준수 여부 자동 검토 (skill://brand/guideline-check)
4. Notion에 Draft 상태로 저장

**출력**:
- 브리프 초안 (Notion Draft)
- 가이드라인 체크 결과

---

### Step 4: Creative Director 승인

**담당**: human:creative-director

> **승인 포인트**: 사전 승인 필요
>
> 승인자: Creative Director (jane@company.com)
> 승인 채널: Slack DM 또는 #func-brand-creative
> 타임아웃: 24시간

**승인 기준**:
- 캠페인 목표가 명확하고 측정 가능한가?
- 예산이 목표 대비 적절한가?
- 일정이 현실적인가?
- 브랜드 가이드라인을 준수하는가?
- 타겟 오디언스 정의가 구체적인가?

**승인 후 진행**:
- 승인 → Step 5로 진행
- 거절 → 피드백 반영 후 Step 3 재실행
- 타임아웃 → 백업 승인자에게 에스컬레이션

---

### Step 5: 최종 발행 및 공유

**담당**: agent-brand

**수행 작업**:
1. 승인 상태 및 승인자 정보 기록
2. Notion 페이지 상태 변경: Draft → Active
3. 관련 Slack 채널에 브리프 공유:
   - #func-brand-creative
   - #vs-{관련 value stream}
4. 참여 예정 팀원에게 DM 알림
5. 다음 단계 태스크 자동 생성 (선택)

**산출물**:
- 승인된 캠페인 브리프 (Notion Active)
- 공유 알림 완료

## 예외 처리

| 상황 | 대응 방법 |
|------|----------|
| 예산 미확정 | Finance Agent에 예산 확인 요청, 확정 시까지 Step 2 대기 |
| 승인 거절 | 피드백 내용 정리 후 Step 3부터 재시작 |
| 승인 타임아웃 | 백업 승인자(Marketing Lead)에게 에스컬레이션 |
| 긴급 캠페인 (D-7 이내) | 간소화 템플릿 사용, 승인 타임아웃 4시간으로 단축 |
| 예산 초과 경고 | Finance Lead 사전 협의 필요, Step 4에 Finance Lead 추가 |

## 관련 리소스

- [브랜드 가이드라인](doc://brand/guidelines)
- [캠페인 템플릿](notion://campaign-brief-template)
- [과거 캠페인 DB](notion://past-campaigns)
- [예산 정책](doc://finance/budget-policy)

## 체크리스트

- [ ] 캠페인 목표 명확히 정의
- [ ] 타겟 오디언스 구체화
- [ ] 예산 확인 및 승인
- [ ] 브랜드 가이드라인 검토
- [ ] Creative Director 승인
- [ ] 관련 채널 공유 완료

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.2.0 | 2025-01-15 | Finance Agent 위임 프로세스 추가 | Jane Kim |
| 1.1.0 | 2025-01-01 | 승인 타임아웃 및 에스컬레이션 규칙 추가 | Jane Kim |
| 1.0.0 | 2024-12-01 | 최초 작성 | Jane Kim |
```

---

## Human-in-the-Loop 유형

| 유형 | 표기 | 설명 | 예시 |
|------|------|------|------|
| **자동** | (없음) | 에이전트가 독립 수행 | 정보 수집, 검색 |
| **사후 알림** | `> **알림**` | 실행 후 인간에게 알림 | 태스크 생성 알림 |
| **사전 승인** | `> **승인 포인트**` | 실행 전 인간 승인 필요 | PR 머지, 외부 발송 |
| **에스컬레이션** | `> **에스컬레이션**` | 반드시 인간이 수행 | 계약 서명, 해고 |
| **위임** | `> **위임**` | 다른 에이전트에게 위임 | 예산 확인 |

---

## SOP 라이프사이클

```
Draft → Active → Deprecated
          ↓
      [수정 시]
          ↓
   PR 생성 → 승인 → Merge
```

### 상태 정의

| 상태 | 설명 | 에이전트 실행 |
|------|------|-------------|
| draft | 초안, 검토 중 | 불가 |
| active | 운영 중 | 가능 |
| deprecated | 폐기됨, 새 버전으로 대체 | 불가 (경고) |

### 버전 관리

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1 (오타 수정)
1.0.1 → 1.1.0 (단계 추가)
1.1.0 → 2.0.0 (전면 개편)
```
