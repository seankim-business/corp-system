# Notion → GitHub 동기화

## 동기화 대상

### 승격 대상 페이지 유형

| Notion 데이터베이스 | GitHub 대상 | 조건 |
|-------------------|------------|------|
| SOPs | `/sops/{function}/` | Status = "Official" |
| Policies | `/docs/policies/` | Tag = "for-github" |
| Brand Guidelines | `/docs/brand/` | Status = "Published" |
| Skill Definitions | `/skills/{function}/` | Status = "Active" |
| Function Definitions | `/org/functions/` | 수동 승인 후 |

### 승격 제외 대상

| 유형 | 이유 |
|------|------|
| Tasks/Projects | 실행 데이터, GitHub 불필요 |
| Meeting Notes | 일시적 데이터 |
| Drafts | 미완성 |
| Personal Pages | 개인 작업 공간 |
| Confidential | 민감 정보 |

---

## 승격 조건 상세

### 필수 조건

```yaml
promotion_conditions:
  required:
    - field: "Status"
      value: "Ready for Official"

    - field: "Owner"
      condition: "not_empty"

    - field: "Reviewed By"
      condition: "count >= 1"

  optional_triggers:
    - field: "Tags"
      contains: "for-github"

    - field: "Promote to GitHub"
      value: true  # Checkbox
```

### Notion 속성 설정

```yaml
# 권장 Notion 데이터베이스 속성
notion_properties:
  Status:
    type: "select"
    options:
      - "Draft"
      - "In Review"
      - "Ready for Official"
      - "Official"  # GitHub 동기화 완료 후

  Tags:
    type: "multi_select"
    options:
      - "for-github"
      - "confidential"
      - "no-sync"

  Owner:
    type: "person"

  Reviewed By:
    type: "person"  # multi

  GitHub URL:
    type: "url"
    description: "동기화 완료 후 자동 설정"

  Last Synced:
    type: "date"
    description: "마지막 동기화 시간"

  Sync Status:
    type: "select"
    options:
      - "Not Synced"
      - "Pending"
      - "Synced"
      - "Conflict"
```

---

## 변환 규칙

### Notion Block → Markdown

| Notion Block | Markdown | 비고 |
|-------------|----------|------|
| Heading 1 | `# ` | |
| Heading 2 | `## ` | |
| Heading 3 | `### ` | |
| Paragraph | 그대로 | |
| Bulleted List | `- ` | 중첩 지원 |
| Numbered List | `1. ` | |
| To-do | `- [ ]` / `- [x]` | |
| Toggle | `<details>` | |
| Code Block | ` ``` ` | 언어 태그 보존 |
| Quote | `> ` | |
| Callout | `> **{icon}**` | 아이콘 이모지 포함 |
| Table | Markdown Table | |
| Image | `![alt](url)` | URL 또는 업로드 |
| Link | `[text](url)` | |
| Mention (Page) | `[Page Title](notion://page_id)` | |
| Mention (Person) | `@name` | 이메일로 변환 |
| Divider | `---` | |

### 속성 → Frontmatter

```yaml
# Notion 속성을 YAML frontmatter로 변환
---
schema_version: "1.0"
kind: "SOP"  # 데이터베이스 타입에서 추론

metadata:
  id: "sop-brand-campaign-brief"  # Title에서 생성
  title: "캠페인 브리프 작성"      # Title 속성
  version: "1.0.0"                 # Version 속성 또는 기본값
  status: "active"                 # Status → active 매핑

  ownership:
    function: "func-brand"         # Function 속성
    agent: "agent-brand"           # 자동 매핑
    human_owner: "jane@company.com"  # Owner → email

  tags:
    - "brand"                      # Tags 속성
    - "campaign"

  notion_source:
    page_id: "abc123..."           # 원본 추적용
    last_synced: "2025-01-25T10:30:00Z"
---
```

---

## 동기화 플로우

### 이벤트 기반 플로우

```
1. Notion Webhook 수신
   └─ Page Updated / Property Changed

2. 승격 조건 검증
   ├─ Status = "Ready for Official"?
   ├─ Owner 지정됨?
   ├─ Reviewer 있음?
   └─ no-sync 태그 없음?

3. 콘텐츠 추출
   ├─ 속성 → frontmatter
   └─ 블록 → markdown

4. 민감 정보 필터링
   ├─ 이메일 마스킹
   └─ 제외 태그 확인

5. GitHub PR 생성
   ├─ 브랜치: sync/notion-{page_id}-{timestamp}
   ├─ 파일: /sops/{function}/{slug}.md
   └─ 커밋 메시지: "sync: Update {title} from Notion"

6. PR 자동 라벨링
   ├─ "sync"
   ├─ "notion"
   └─ "{function}"

7. 리뷰어 자동 지정
   └─ CODEOWNERS 기반

8. Notion 상태 업데이트
   ├─ Sync Status → "Pending"
   └─ 알림 발송 (Slack)
```

### PR 머지 후 플로우

```
1. GitHub Action 트리거
   └─ PR merged to main

2. Notion 업데이트
   ├─ Status → "Official"
   ├─ GitHub URL → PR URL
   ├─ Last Synced → now()
   └─ Sync Status → "Synced"

3. 알림 발송
   └─ Slack: "{title}이(가) 공식 문서로 등록되었습니다"
```

---

## 역동기화 (GitHub → Notion)

### 읽기 전용 뷰

공식 문서는 Notion Hub에 읽기 전용으로 배포됩니다.

```yaml
reverse_sync:
  trigger: "PR merged to main"

  target:
    database: "Official Documents Hub"

  behavior:
    - "기존 페이지 업데이트 또는 새 페이지 생성"
    - "편집 불가 표시"
    - "GitHub 원본 링크 표시"

  properties:
    Title: "from frontmatter.title"
    Status: "Official (Read-Only)"
    GitHub URL: "https://github.com/.../blob/main/..."
    Function: "from frontmatter.ownership.function"
    Last Updated: "from git commit date"
```

### Notion Hub 페이지 형식

```
┌─────────────────────────────────────────────────────────────┐
│  📋 캠페인 브리프 작성                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ⚠️ 이 문서는 GitHub에서 관리됩니다.                          │
│  수정이 필요하면 GitHub에서 PR을 생성해주세요.                  │
│                                                             │
│  📎 GitHub 원본: [링크]                                      │
│  📅 마지막 업데이트: 2025-01-25                               │
│  👤 담당: Brand Team                                         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [문서 내용...]                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 충돌 처리

### 충돌 감지

```yaml
conflict_detection:
  # GitHub에 PR이 열려있는 상태에서 Notion 수정
  scenario_1:
    condition: "open PR exists for same page"
    action: "block sync, notify owner"

  # Notion과 GitHub이 동시에 다른 내용
  scenario_2:
    condition: "content hash mismatch"
    action: "create conflict PR, notify owner"
```

### 충돌 해결 UI

```
Slack 알림:

⚠️ 동기화 충돌 감지

문서: 캠페인 브리프 작성
Notion 버전: 2025-01-25 10:30
GitHub 버전: 2025-01-25 09:15

[Notion 버전 유지] [GitHub 버전 유지] [수동 해결]
```

---

## 설정 예시

### Notion Integration 설정

```yaml
notion_integration:
  # Notion API 설정
  api:
    version: "2022-06-28"
    auth: "${NOTION_API_KEY}"

  # 감시할 데이터베이스
  watched_databases:
    - id: "abc123..."
      name: "SOPs"
      target_dir: "/sops"
      function_property: "Function"

    - id: "def456..."
      name: "Policies"
      target_dir: "/docs/policies"

  # Webhook 설정
  webhook:
    url: "https://api.company.com/notion-webhook"
    events:
      - "page.updated"
      - "page.created"

  # 폴링 백업 (Webhook 실패 시)
  polling:
    enabled: true
    interval: "15m"
```

### GitHub Action 예시

```yaml
# .github/workflows/sync-notion.yml
name: Sync from Notion

on:
  repository_dispatch:
    types: [notion-sync]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Process Notion Webhook
        env:
          NOTION_API_KEY: ${{ secrets.NOTION_API_KEY }}
        run: |
          # 동기화 스크립트 실행

      - name: Create PR
        uses: peter-evans/create-pull-request@v5
        with:
          branch: sync/notion-${{ github.event.client_payload.page_id }}
          title: "sync: Update ${{ github.event.client_payload.title }}"
          labels: sync, notion
```
