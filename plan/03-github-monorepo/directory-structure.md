# GitHub 모노레포 디렉토리 구조

## 전체 구조

```
company-os/
│
├── AGENTS.md                    # 에이전트 카탈로그 (루트)
├── CLAUDE.md                    # Claude Code 가이드
├── README.md                    # 리포지토리 소개
│
├── agents/                      # 에이전트 정의
│   ├── _schema.yml              # 에이전트 스키마
│   ├── orchestrator.yml
│   ├── brand.yml
│   ├── product.yml
│   ├── ops.yml
│   ├── finance.yml
│   ├── hr.yml
│   └── engineering.yml
│
├── org/                         # 조직 구조
│   ├── functions/               # 기능 조직 정의
│   │   ├── _schema.yml
│   │   ├── brand.yml
│   │   ├── product.yml
│   │   ├── ops.yml
│   │   ├── finance.yml
│   │   ├── hr.yml
│   │   └── engineering.yml
│   │
│   ├── value-streams/           # 가치 흐름 정의
│   │   ├── _schema.yml
│   │   ├── collection-launch.yml
│   │   ├── customer-support.yml
│   │   ├── employee-lifecycle.yml
│   │   └── financial-close.yml
│   │
│   └── roles/                   # 역할 정의
│       ├── _schema.yml
│       ├── product-manager.yml
│       ├── creative-director.yml
│       └── team-lead.yml
│
├── skills/                      # 에이전트 스킬 정의
│   ├── _schema.yml
│   ├── brand/
│   │   ├── brief-writing.yml
│   │   ├── content-planning.yml
│   │   └── guideline-check.yml
│   ├── product/
│   │   ├── collection-planning.yml
│   │   └── roadmap-management.yml
│   ├── ops/
│   │   ├── incident-response.yml
│   │   └── customer-inquiry.yml
│   ├── finance/
│   │   ├── budget-check.yml
│   │   └── expense-approval.yml
│   ├── hr/
│   │   ├── leave-policy.yml
│   │   └── onboarding-guide.yml
│   └── engineering/
│       ├── code-review.yml
│       └── incident-runbook.yml
│
├── sops/                        # 표준 운영 절차
│   ├── _schema.yml
│   ├── _template.md
│   ├── brand/
│   │   ├── campaign-brief.md
│   │   ├── content-production.md
│   │   └── asset-request.md
│   ├── product/
│   │   ├── collection-planning.md
│   │   └── collection-launch.md
│   ├── ops/
│   │   ├── incident-response.md
│   │   ├── customer-complaint.md
│   │   └── launch-preparation.md
│   ├── finance/
│   │   ├── expense-reimbursement.md
│   │   ├── invoice-approval.md
│   │   └── budget-request.md
│   ├── hr/
│   │   ├── onboarding.md
│   │   ├── leave-request.md
│   │   └── offboarding.md
│   └── engineering/
│       ├── deployment.md
│       └── code-review.md
│
├── docs/                        # 일반 문서
│   ├── onboarding/              # 온보딩 가이드
│   │   ├── welcome.md
│   │   ├── tools-setup.md
│   │   └── first-week.md
│   ├── policies/                # 정책
│   │   ├── expense.md
│   │   ├── leave.md
│   │   ├── remote-work.md
│   │   └── security.md
│   ├── brand/                   # 브랜드 가이드
│   │   ├── guidelines.md
│   │   ├── tone-voice.md
│   │   └── visual-identity.md
│   └── product/                 # 제품 문서
│       ├── vision.md
│       └── roadmap.md
│
├── engineering/                 # 엔지니어링 문서
│   ├── adr/                     # Architecture Decision Records
│   │   ├── 000-template.md
│   │   ├── 001-github-ssot.md
│   │   ├── 002-mcp-architecture.md
│   │   └── 003-slack-bot-strategy.md
│   ├── services/                # 서비스 문서
│   │   └── ...
│   └── runbooks/                # 운영 런북
│       ├── deployment.md
│       └── incident-response.md
│
├── mcp/                         # MCP 서버 설정
│   ├── config/
│   │   ├── server.yml           # MCP 서버 설정
│   │   ├── resources.yml        # 리소스 정의
│   │   └── tools.yml            # 툴 정의
│   └── prompts/                 # 프롬프트 템플릿
│       ├── search.md
│       └── summarize.md
│
└── .github/                     # GitHub 설정
    ├── CODEOWNERS
    ├── workflows/
    │   ├── validate-schema.yml
    │   ├── sync-notion.yml
    │   └── sync-drive.yml
    └── PULL_REQUEST_TEMPLATE.md
```

---

## 디렉토리 상세 설명

### `/agents` - 에이전트 정의

각 에이전트의 설정을 YAML 파일로 관리합니다.

```yaml
# /agents/_schema.yml
$schema: "https://json-schema.org/draft/2020-12/schema"
type: object
required:
  - schema_version
  - kind
  - metadata
  - ownership
  - capabilities
  - permissions
properties:
  schema_version:
    type: string
  kind:
    const: "Agent"
  metadata:
    type: object
    required: [id, name, description]
  ownership:
    type: object
    required: [function, human_owner]
  capabilities:
    type: object
  skills:
    type: array
  sops:
    type: object
  permissions:
    type: object
  tools:
    type: object
  delegation:
    type: object
  slack_persona:
    type: object
```

### `/org` - 조직 구조

회사의 조직 구조를 코드로 정의합니다.

**Functions**: 기능 조직
**Value Streams**: 가치 흐름
**Roles**: 역할 정의

### `/skills` - 스킬 정의

에이전트가 수행할 수 있는 능력 단위를 정의합니다.

```
/skills
  /{function}
    {skill-name}.yml
```

### `/sops` - 표준 운영 절차

에이전트와 인간이 따르는 절차서입니다.

```
/sops
  /{function}
    {sop-name}.md
```

- Markdown 형식 + YAML frontmatter
- 버전 관리 및 승인 워크플로 지원

### `/docs` - 일반 문서

SOP가 아닌 일반 참조 문서입니다.

- 온보딩 가이드
- 정책 문서
- 브랜드 가이드라인

### `/engineering` - 엔지니어링 문서

기술 관련 문서입니다.

- **ADR**: Architecture Decision Records
- **Services**: 서비스별 문서
- **Runbooks**: 운영 런북

### `/mcp` - MCP 설정

MCP 서버 설정 및 프롬프트 템플릿입니다.

---

## 파일 형식 규칙

### YAML 파일 (.yml)

구조화된 데이터 정의에 사용:
- 에이전트 정의
- 스킬 정의
- 조직 구조
- 설정 파일

```yaml
schema_version: "1.0"
kind: "Agent"

metadata:
  id: "agent-brand"
  name: "Brand Agent"
```

### Markdown 파일 (.md)

문서 형태의 콘텐츠에 사용:
- SOP
- 정책 문서
- 가이드라인
- ADR

```markdown
---
schema_version: "1.0"
kind: "SOP"
metadata:
  id: "sop-brand-campaign-brief"
---

# 캠페인 브리프 작성

## 목적
...
```

---

## 네이밍 컨벤션

### 디렉토리

| 패턴 | 예시 | 설명 |
|------|------|------|
| 소문자-케밥 | `value-streams` | 복합 단어 |
| 소문자 | `brand` | 단일 단어 |
| 밑줄 접두사 | `_schema.yml` | 메타/설정 파일 |

### 파일

| 종류 | 패턴 | 예시 |
|------|------|------|
| 에이전트 | `{name}.yml` | `brand.yml` |
| 스킬 | `{skill-name}.yml` | `brief-writing.yml` |
| SOP | `{sop-name}.md` | `campaign-brief.md` |
| 스키마 | `_schema.yml` | `_schema.yml` |
| 템플릿 | `_template.md` | `_template.md` |

### ID 패턴

| 엔티티 | 패턴 | 예시 |
|--------|------|------|
| Function | `func-{name}` | `func-brand` |
| Agent | `agent-{name}` | `agent-brand` |
| Skill | `skill-{function}-{name}` | `skill-brand-brief-writing` |
| SOP | `sop-{function}-{name}` | `sop-brand-campaign-brief` |
| ValueStream | `vs-{name}` | `vs-collection-launch` |

---

## CODEOWNERS 설정

```
# /. github/CODEOWNERS

# 전체 리포
* @company-os-admins

# 조직 구조
/org/ @hr-team @company-os-admins

# 에이전트 정의
/agents/ @engineering-team @company-os-admins

# Function별 SOP
/sops/brand/ @brand-team
/sops/product/ @product-team
/sops/ops/ @ops-team
/sops/finance/ @finance-team
/sops/hr/ @hr-team
/sops/engineering/ @engineering-team

# Function별 Skill
/skills/brand/ @brand-team
/skills/product/ @product-team
/skills/ops/ @ops-team
/skills/finance/ @finance-team
/skills/hr/ @hr-team
/skills/engineering/ @engineering-team

# 문서
/docs/policies/ @hr-team @legal-team
/docs/brand/ @brand-team

# 엔지니어링
/engineering/ @engineering-team

# MCP 설정
/mcp/ @engineering-team
```

---

## 브랜치 전략

```
main                 # 프로덕션 (SSOT)
├── develop          # 개발 통합
│   ├── feature/*    # 기능 개발
│   ├── sop/*        # SOP 추가/수정
│   └── agent/*      # 에이전트 설정 변경
└── hotfix/*         # 긴급 수정
```

### PR 규칙

| 변경 대상 | 필요 승인자 | 자동 테스트 |
|----------|------------|------------|
| `/agents/*` | Engineering Lead | 스키마 검증 |
| `/sops/*` | Function Owner | 스키마 검증 |
| `/skills/*` | Function Owner | 스키마 검증 |
| `/org/*` | HR Lead | 스키마 검증 |
| `/mcp/*` | Engineering Lead | 스키마 검증 |

---

## 스키마 검증

모든 YAML 파일은 해당 `_schema.yml`에 따라 검증됩니다.

```yaml
# .github/workflows/validate-schema.yml
name: Validate Schema

on:
  pull_request:
    paths:
      - 'agents/**'
      - 'skills/**'
      - 'org/**'
      - 'mcp/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate YAML against schema
        run: |
          # 스키마 검증 스크립트 실행
          ./scripts/validate-schema.sh
```
