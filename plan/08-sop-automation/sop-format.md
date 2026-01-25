# SOP 포맷 설계

## 설계 원칙

```
1. 기계 판독 가능 (Machine-Readable)
   → 에이전트가 파싱하고 실행 가능

2. 인간 가독성 (Human-Readable)
   → 사람도 쉽게 읽고 이해

3. 버전 관리 (Versionable)
   → Git에서 변경 이력 추적

4. 표준화 (Standardized)
   → 일관된 구조로 품질 보장
```

---

## SOP 문서 구조

### 전체 템플릿

```markdown
---
schema_version: "1.0"
kind: "SOP"

metadata:
  id: "sop-{function}-{name}"
  title: "{SOP 제목}"
  version: "{major}.{minor}.{patch}"
  status: "{draft|active|deprecated}"

ownership:
  function: "func-{function}"
  agent: "agent-{function}"
  human_owner: "{email}"

triggers:
  - type: "{trigger_type}"
    pattern: "{pattern}"

tags:
  - "{tag1}"
  - "{tag2}"

approval_required: {true|false}
estimated_duration: "{duration}"
---

# {SOP 제목}

## 목적

{이 SOP의 목적과 범위}

## 전제 조건 (Prerequisites)

{SOP 실행 전 충족 조건}

- [ ] 조건 1
- [ ] 조건 2

## 단계별 절차 (Steps)

### Step 1: {단계 제목}

**담당**: {agent-name | human:role}

**입력**:
{필요한 입력}

**수행 작업**:
{수행할 작업}

**출력**:
{결과물}

---

### Step N: {단계 제목}

{...}

## 예외 처리

| 상황 | 대응 방법 |
|------|----------|
| {상황1} | {대응1} |

## 관련 리소스

- [{리소스명}]({uri})

## 체크리스트

- [ ] 체크항목 1
- [ ] 체크항목 2

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
```

---

## Frontmatter 스키마

### 필수 필드

```yaml
schema_version: "1.0"      # 스키마 버전 (고정)
kind: "SOP"                # 문서 종류 (고정)

metadata:
  id: string               # 고유 ID (sop-{function}-{name})
  title: string            # 제목
  version: string          # SemVer (1.0.0)
  status: enum             # draft | active | deprecated

ownership:
  function: string         # 소유 Function ID
  agent: string            # 실행 담당 에이전트 ID
  human_owner: string      # 인간 책임자 이메일
```

### 선택 필드

```yaml
triggers:                  # 트리거 조건
  - type: string           # slack_mention | notion_status | schedule | manual
    pattern: string        # 트리거 패턴

tags:                      # 태그 목록
  - string

approval_required: boolean # 승인 필요 여부 (기본: false)
estimated_duration: string # 예상 소요 시간 (예: "2시간")

dependencies:              # 의존 SOP
  - sop_id: string
    type: enum             # requires | recommended

related_skills:            # 관련 스킬
  - string                 # skill:// URI

metrics:                   # 성과 지표
  - name: string
    type: enum             # count | duration | percentage
    target: string
```

---

## 단계(Step) 형식

### 기본 구조

```markdown
### Step {N}: {단계 제목}

**담당**: {executor}

**입력**:
{inputs}

**수행 작업**:
{actions}

**출력**:
{outputs}
```

### 담당자 표기

| 표기 | 의미 | 예시 |
|------|------|------|
| `agent-{name}` | 에이전트가 수행 | `agent-brand` |
| `human:{role}` | 특정 역할의 인간이 수행 | `human:creative-director` |
| `human` | 인간이 수행 (역할 무관) | `human` |

### 위임 표기

```markdown
> **위임**: 다른 에이전트에게 위임
>
> 대상: agent-{name}
> 작업: {task_description}
> 스킬: skill://{path}
```

### 승인 포인트 표기

```markdown
> **승인 포인트**: 사전 승인 필요
>
> 승인자: {role} ({email})
> 승인 채널: {channel}
> 타임아웃: {timeout}
> 승인 기준:
> - {criterion_1}
> - {criterion_2}
```

### 에스컬레이션 표기

```markdown
> **에스컬레이션**: 이 단계는 반드시 인간이 수행
>
> 담당: {role}
> 사유: {reason}
```

### 알림 표기

```markdown
> **알림**: 완료 후 알림
>
> 대상: {channel_or_person}
> 내용: {notification_content}
```

---

## 예외 처리 형식

```markdown
## 예외 처리

| 상황 | 대응 방법 | 에스컬레이션 |
|------|----------|-------------|
| {상황 설명} | {대응 절차} | {에스컬레이션 대상} |
```

### 예시

```markdown
## 예외 처리

| 상황 | 대응 방법 | 에스컬레이션 |
|------|----------|-------------|
| 예산 미확정 | Finance Agent에 확인 요청 후 대기 | 24시간 초과 시 Finance Lead |
| 승인 거절 | 피드백 반영 후 Step 2부터 재시작 | 2회 거절 시 Owner |
| 긴급 요청 | 간소화 템플릿 사용 | Marketing Lead 사전 승인 |
| 시스템 오류 | 재시도 3회 후 수동 처리 | Engineering Team |
```

---

## 관련 리소스 형식

```markdown
## 관련 리소스

- [브랜드 가이드라인](doc://brand/guidelines)
- [캠페인 템플릿](notion://campaign-template)
- [예산 정책](doc://finance/budget-policy)
- [과거 캠페인 DB](notion://past-campaigns)
```

### URI 스키마

| 스키마 | 용도 | 예시 |
|--------|------|------|
| `doc://` | GitHub 문서 | `doc://brand/guidelines` |
| `sop://` | 다른 SOP | `sop://finance/budget-check` |
| `skill://` | 스킬 정의 | `skill://brand/brief-writing` |
| `notion://` | Notion 페이지 | `notion://campaign-template` |
| `drive://` | Drive 파일 | `drive://finance/2025-budget` |
| `https://` | 외부 링크 | `https://figma.com/...` |

---

## 변경 이력 형식

```markdown
## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.2.0 | 2025-01-15 | Finance 연동 추가 | jane@company.com |
| 1.1.1 | 2025-01-10 | 오타 수정 | bot |
| 1.1.0 | 2025-01-05 | 승인 프로세스 추가 | jane@company.com |
| 1.0.0 | 2025-01-01 | 최초 작성 | jane@company.com |
```

---

## 에이전트 파싱 규칙

### Frontmatter 파싱

```yaml
parsing_rules:
  frontmatter:
    format: "YAML"
    delimiter: "---"
    required_fields:
      - "metadata.id"
      - "metadata.title"
      - "metadata.status"
      - "ownership.function"
      - "ownership.agent"
```

### Step 파싱

```yaml
parsing_rules:
  steps:
    heading_pattern: "### Step \\d+:"
    extract:
      - field: "담당"
        pattern: "\\*\\*담당\\*\\*: (.+)"
      - field: "입력"
        pattern: "\\*\\*입력\\*\\*:\\n([\\s\\S]+?)(?=\\*\\*수행)"
      - field: "수행 작업"
        pattern: "\\*\\*수행 작업\\*\\*:\\n([\\s\\S]+?)(?=\\*\\*출력)"
      - field: "출력"
        pattern: "\\*\\*출력\\*\\*:\\n([\\s\\S]+?)(?=---|$)"
```

### 특수 블록 파싱

```yaml
parsing_rules:
  special_blocks:
    approval_point:
      pattern: "> \\*\\*승인 포인트\\*\\*"
      extract:
        - "승인자"
        - "타임아웃"
        - "승인 기준"

    delegation:
      pattern: "> \\*\\*위임\\*\\*"
      extract:
        - "대상"
        - "작업"
        - "스킬"

    escalation:
      pattern: "> \\*\\*에스컬레이션\\*\\*"
      extract:
        - "담당"
        - "사유"
```

---

## 검증 규칙

```yaml
validation_rules:
  frontmatter:
    - "metadata.id는 'sop-' 접두사로 시작"
    - "metadata.version은 SemVer 형식"
    - "metadata.status는 draft/active/deprecated 중 하나"
    - "ownership.function은 유효한 Function ID"
    - "ownership.agent는 유효한 Agent ID"

  content:
    - "최소 하나의 Step 포함"
    - "모든 Step에 담당자 명시"
    - "approval_required=true면 최소 하나의 승인 포인트"
    - "예외 처리 섹션 포함"
    - "변경 이력 포함"

  references:
    - "관련 리소스 URI가 유효한 형식"
    - "참조된 SOP/Skill이 존재"
```
