# Google Drive → GitHub 동기화

## 동기화 대상

### Drive 폴더 구조

```
Company Drive/
├── Official/                    # ← 동기화 대상
│   ├── Policies/
│   │   ├── [OFFICIAL] Expense Policy.gdoc
│   │   └── [OFFICIAL] Remote Work Policy.gdoc
│   ├── Templates/
│   │   ├── [OFFICIAL] Budget Template.gsheet
│   │   └── [OFFICIAL] Report Template.gdoc
│   └── Reference/
│       └── [OFFICIAL] Org Chart.gsheet
│
├── Working/                     # ← 동기화 안 함
│   ├── Finance/
│   ├── HR/
│   └── Operations/
│
└── Confidential/               # ← 동기화 안 함
    └── ...
```

### 승격 대상

| 조건 | 설명 |
|------|------|
| 폴더 위치 | `Official/` 폴더 하위 |
| 파일명 접두사 | `[OFFICIAL]` 포함 |
| 파일 유형 | Google Docs, Google Sheets |
| 편집 권한 | "댓글만 가능" 또는 "보기 전용" |

### 승격 제외

| 조건 | 이유 |
|------|------|
| 편집 중인 파일 | 아직 확정 안 됨 |
| Confidential 폴더 | 민감 정보 |
| 개인 폴더 | 개인 작업 공간 |
| 바이너리 파일 | 변환 불가 |

---

## 파일 유형별 변환

### Google Docs → Markdown

```yaml
google_docs_conversion:
  supported_elements:
    - headings → # ## ###
    - paragraphs → plain text
    - lists → - or 1.
    - tables → markdown table
    - links → [text](url)
    - images → ![alt](url)  # Drive 링크 유지

  unsupported_elements:
    - drawings → [Drawing - see original]
    - embedded sheets → [Embedded Sheet - see original]
    - comments → 제외 (또는 footnote로)

  metadata:
    - title → frontmatter.title
    - last_modified → frontmatter.last_updated
    - owner → frontmatter.owner
```

### Google Sheets → 데이터 형식

#### 정책/참조 데이터

```yaml
sheets_to_markdown:
  type: "reference_table"
  output: "markdown table"

  example:
    input: |
      | Category | Limit | Approval |
      |----------|-------|----------|
      | Travel   | 500K  | Manager  |
      | Equipment| 1M    | Director |

    output: |
      ## 비용 승인 기준

      | 카테고리 | 한도 | 승인자 |
      |----------|------|--------|
      | 출장 | 50만원 | 팀장 |
      | 장비 | 100만원 | 디렉터 |
```

#### 템플릿 데이터

```yaml
sheets_to_yaml:
  type: "template"
  output: "YAML or CSV"

  example:
    input: "Budget Template.gsheet"
    output: "/templates/budget-template.yml"
```

#### 복잡한 스프레드시트

```yaml
sheets_reference:
  type: "complex_data"
  output: "link only"

  example:
    markdown: |
      ## 조직도

      > 📊 전체 조직도는 [Google Sheets 원본](https://docs.google.com/spreadsheets/d/xxx)을 참조하세요.
      > 마지막 업데이트: 2025-01-25
```

---

## 동기화 플로우

### 이벤트 기반 플로우

```
1. Drive API Watch 트리거
   └─ 파일 이동/이름 변경/수정

2. 승격 조건 검증
   ├─ Official/ 폴더 내 위치?
   ├─ [OFFICIAL] 접두사?
   └─ 편집 잠금 상태?

3. 파일 다운로드 및 변환
   ├─ Google Docs → Markdown
   └─ Google Sheets → Markdown/YAML

4. 메타데이터 추출
   ├─ 파일명 → title
   ├─ 수정자 → owner
   └─ 수정일 → last_updated

5. Frontmatter 생성
   └─ 스키마에 맞게 구성

6. GitHub PR 생성
   ├─ 브랜치: sync/drive-{file_id}-{timestamp}
   └─ 파일: /{target_dir}/{slug}.md

7. Drive 속성 업데이트
   └─ Description에 GitHub URL 추가
```

### 수동 트리거

복잡한 스프레드시트나 특수 케이스는 수동 트리거:

```bash
# Slack 명령어
/sync-drive https://docs.google.com/spreadsheets/d/xxx

# 또는 GitHub Action 수동 실행
gh workflow run sync-drive.yml -f file_id=xxx
```

---

## 파일 매핑

### 폴더 → 디렉토리 매핑

```yaml
folder_mapping:
  "Official/Policies":
    github_dir: "/docs/policies"
    file_type: "markdown"

  "Official/Templates":
    github_dir: "/templates"
    file_type: "yaml"  # 또는 csv

  "Official/Reference":
    github_dir: "/docs/reference"
    file_type: "markdown"

  "Official/Brand":
    github_dir: "/docs/brand"
    file_type: "markdown"
```

### 파일명 규칙

```yaml
filename_conversion:
  input: "[OFFICIAL] Expense Policy.gdoc"
  output: "expense-policy.md"

  rules:
    - remove_prefix: "[OFFICIAL]"
    - lowercase: true
    - replace_spaces: "-"
    - add_extension: ".md"
```

---

## 권한 및 인증

### 서비스 계정 설정

```yaml
drive_auth:
  type: "service_account"
  credentials: "${GOOGLE_SERVICE_ACCOUNT_KEY}"

  scopes:
    - "https://www.googleapis.com/auth/drive.readonly"
    - "https://www.googleapis.com/auth/drive.metadata.readonly"

  # 서비스 계정에 Official 폴더 공유 필요
  shared_folders:
    - "Official"
```

### 접근 제어

```yaml
access_control:
  # 서비스 계정이 접근 가능한 폴더만 동기화
  # Confidential 폴더는 공유하지 않음으로써 자동 제외

  additional_filters:
    - exclude_if: "file.owners[0].emailAddress ends with @personal.com"
    - exclude_if: "file.name starts with [DRAFT]"
```

---

## Frontmatter 생성

### Google Docs

```yaml
---
schema_version: "1.0"
kind: "Policy"

metadata:
  id: "policy-expense"
  title: "비용 정산 정책"
  version: "1.0.0"
  status: "active"

  ownership:
    function: "func-finance"
    human_owner: "finance-lead@company.com"

  source:
    type: "google_docs"
    file_id: "1abc..."
    url: "https://docs.google.com/document/d/1abc..."
    last_synced: "2025-01-25T10:30:00Z"

  tags:
    - "finance"
    - "policy"
---
```

### Google Sheets

```yaml
---
schema_version: "1.0"
kind: "Reference"

metadata:
  id: "ref-approval-limits"
  title: "승인 한도표"
  version: "1.0.0"

  source:
    type: "google_sheets"
    file_id: "1xyz..."
    url: "https://docs.google.com/spreadsheets/d/1xyz..."
    sheet_name: "승인한도"
    last_synced: "2025-01-25T10:30:00Z"
---
```

---

## 역동기화

### Drive → GitHub만 (단방향)

```
Drive는 수정 UI로 사용
       ↓
Official 폴더로 이동 시 GitHub 동기화
       ↓
GitHub이 SSOT가 됨
       ↓
Drive 원본은 "Archived" 폴더로 이동 (선택)
```

### 이유

- Drive 문서는 실시간 협업이 핵심 가치
- GitHub에서 역으로 Drive를 수정하면 충돌 발생
- 공식화된 문서는 GitHub에서 PR로 관리

---

## 설정 예시

### GitHub Action

```yaml
# .github/workflows/sync-drive.yml
name: Sync from Google Drive

on:
  schedule:
    - cron: '0 */6 * * *'  # 6시간마다

  repository_dispatch:
    types: [drive-sync]

  workflow_dispatch:
    inputs:
      file_id:
        description: 'Specific file ID to sync'
        required: false

jobs:
  sync:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Google Auth
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GOOGLE_SA_KEY }}

      - name: Sync Drive Files
        run: |
          # Drive 동기화 스크립트 실행

      - name: Create PR if changes
        uses: peter-evans/create-pull-request@v5
        with:
          branch: sync/drive-${{ github.run_id }}
          title: "sync: Update from Google Drive"
          labels: sync, drive
```

### 폴더 감시 설정

```yaml
# Drive Watch 설정
drive_watch:
  channel_id: "company-os-sync"
  folder_id: "Official 폴더 ID"
  webhook_url: "https://api.company.com/drive-webhook"
  expiration: "7 days"  # 주기적 갱신 필요
```
