# 설계 원칙

## 핵심 원칙

### 1. 도메인 자산화 (Domain as Asset)

```
"기술은 바뀌어도, 우리 회사의 구조와 프로세스는 자산으로 남는다"
```

**원칙:**
- Function, Value Stream, Agent, SOP 정의가 핵심 자산
- 에이전트 엔진이 바뀌어도 도메인 모델은 그대로
- 모든 정의는 설정 파일(YAML/Markdown) 형태로 저장

**적용:**
```yaml
# 나쁜 예: 코드에 도메인 로직 하드코딩
class BrandAgent:
    def handle_campaign_brief(self):
        # 캠페인 브리프 로직이 코드에 녹아있음
        ...

# 좋은 예: 설정 파일에서 도메인 정의
# /agents/brand.yml
agent:
  id: "brand-agent"
  sops:
    - "sop://brand/campaign-brief"
  skills:
    - "skill://brand/brief-writing"
```

---

### 2. 설정 중심 설계 (Configuration-Driven)

```
"코드가 아니라 설정 파일이 시스템을 정의한다"
```

**원칙:**
- 에이전트, 스킬, SOP는 YAML/JSON으로 정의
- 런타임은 설정 파일을 읽어 동작 결정
- 새로운 에이전트 추가 = 새 YAML 파일 추가

**구조:**
```
/agents
  ├── brand.yml
  ├── ops.yml
  └── finance.yml

/skills
  ├── brand/
  │   └── campaign-brief.yml
  └── finance/
      └── budget-check.yml

/sops
  ├── brand/
  │   └── campaign-brief.md
  └── hr/
      └── onboarding.md
```

---

### 3. 표준 기술 우선 (Standard-First)

```
"많이 쓰이고 업그레이드가 잘 따라오는 기술을 선택한다"
```

**선택 기준:**
| 기준 | 설명 |
|------|------|
| 채택률 | 업계에서 널리 사용되는가? |
| 유지보수 | 활발히 개발/지원되는가? |
| 호환성 | 표준 인터페이스를 따르는가? |
| 교체 용이성 | 다른 도구로 교체하기 쉬운가? |

**기술 선택:**
```yaml
protocols:
  - MCP (Model Context Protocol)  # 에이전트-도구 연결 표준
  - OpenAPI                        # API 정의 표준

frameworks:
  priority_order:
    1: "OpenAI Agents SDK"    # 가장 표준적
    2: "LangGraph"            # 유연하고 널리 사용
    3: "CrewAI"               # 간편하지만 덜 표준적

api_style:
  - OpenAI-style function calling
```

---

### 4. Single Source of Truth (SSOT)

```
"GitHub 모노레포가 모든 공식 지식의 유일한 진실 소스"
```

**계층:**
```
┌─────────────────────────────────────────┐
│           GitHub (SSOT)                 │  ← 공식, 버전 관리
│  SOPs, 정책, 스킬, 에이전트 정의         │
└─────────────────────────────────────────┘
                    ▲
                    │ 승격
                    │
┌─────────────────────────────────────────┐
│        Notion / Drive (Working)         │  ← 작업용, 실행 UI
│  태스크, 프로젝트, 초안 문서             │
└─────────────────────────────────────────┘
```

**규칙:**
1. 에이전트는 GitHub의 문서를 기준으로 동작
2. Notion/Drive는 업무 실행 UI로만 사용
3. 안정화된 문서만 GitHub으로 승격
4. 충돌 시 GitHub이 우선

---

### 5. Human-in-the-Loop (HITL)

```
"중요한 결정에는 반드시 사람이 개입한다"
```

**승인 유형:**

| 유형 | 설명 | 예시 |
|------|------|------|
| **자동** | 에이전트가 독립 수행 | 정보 조회, 요약 |
| **사후 알림** | 실행 후 사람에게 알림 | 태스크 자동 생성 |
| **사전 승인** | 실행 전 승인 필요 | PR 생성, 외부 전송 |
| **에스컬레이션** | 반드시 사람이 수행 | 계약 서명, 해고 |

**구현 패턴:**
```yaml
sop_step:
  name: "예산 승인"
  executor: "finance-agent"
  approval:
    required: true
    threshold: "amount > 1000000"
    approvers:
      - "finance-lead"
      - "ceo"
    timeout: "24h"
    on_timeout: "escalate"
```

---

### 6. Thin Adapter 패턴

```
"외부 시스템 연동은 얇은 어댑터로 격리한다"
```

**구조:**
```
┌─────────────────────────────────────────┐
│             Agent Layer                  │
│  (도메인 로직, 기술 독립적)               │
└────────────────────┬────────────────────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   ┌─────────────┐       ┌─────────────┐
   │   Notion    │       │   Drive     │
   │   Adapter   │       │   Adapter   │
   │  (Thin)     │       │  (Thin)     │
   └──────┬──────┘       └──────┬──────┘
          │                     │
          ▼                     ▼
   ┌─────────────┐       ┌─────────────┐
   │   Notion    │       │   Google    │
   │   API       │       │   Drive API │
   └─────────────┘       └─────────────┘
```

**어댑터 책임:**
- API 호출 래핑
- 에러 핸들링
- 데이터 변환 (→ 표준 포맷)
- 인증 관리

**어댑터가 하지 않는 것:**
- 비즈니스 로직
- 도메인 규칙
- 에이전트 의사결정

---

### 7. Graceful Degradation

```
"시스템 일부가 실패해도 핵심 기능은 유지된다"
```

**전략:**

| 실패 상황 | 대응 |
|----------|------|
| Notion API 실패 | GitHub 캐시에서 조회 |
| MCP 서버 다운 | 기본 검색 fallback |
| 특정 에이전트 실패 | Orchestrator가 대체 라우팅 |
| 승인자 부재 | 에스컬레이션 또는 대기 |

**구현:**
```yaml
fallback:
  notion_unavailable:
    action: "use_github_cache"
    notify: true

  agent_error:
    retry: 3
    fallback_agent: "orchestrator"
    notify: true

  approval_timeout:
    action: "escalate_to_backup"
    notify: true
```

---

### 8. Audit Trail (감사 추적)

```
"모든 변경과 결정은 추적 가능해야 한다"
```

**로깅 대상:**

| 항목 | 저장 위치 | 보관 기간 |
|------|----------|----------|
| 에이전트 실행 로그 | 로그 시스템 | 90일 |
| 데이터 변경 이력 | Git 히스토리 | 영구 |
| 승인/거절 기록 | Slack + Git | 영구 |
| API 호출 기록 | 로그 시스템 | 30일 |

**로그 포맷:**
```json
{
  "timestamp": "2025-01-25T10:30:00Z",
  "agent": "brand-agent",
  "action": "create_pr",
  "input": {
    "sop": "sop://brand/campaign-brief",
    "changes": "..."
  },
  "output": {
    "pr_url": "https://github.com/..."
  },
  "user": "jane@company.com",
  "approval": {
    "required": true,
    "approved_by": "john@company.com",
    "approved_at": "2025-01-25T11:00:00Z"
  }
}
```

---

## 안티패턴 (피해야 할 것)

### 1. 코드 중심 도메인 정의
```
❌ 도메인 로직을 코드에 하드코딩
✅ YAML/Markdown으로 도메인 정의, 코드는 런타임만
```

### 2. 두꺼운 어댑터
```
❌ 어댑터에 비즈니스 로직 포함
✅ 어댑터는 API 래핑만, 로직은 에이전트에
```

### 3. 다중 진실 소스
```
❌ Notion도 공식, Drive도 공식, GitHub도 공식
✅ GitHub만 공식, 나머지는 작업용/캐시
```

### 4. 프레임워크 종속
```
❌ 특정 프레임워크의 기능에 깊이 의존
✅ 표준 인터페이스 사용, 프레임워크는 교체 가능하게
```

### 5. 무분별한 자동화
```
❌ 모든 것을 에이전트가 자동 처리
✅ 중요 결정은 사람 승인, 명확한 HITL 정의
```

---

## 설계 결정 기록 (ADR 요약)

### ADR-001: GitHub을 SSOT로 선택
- **결정**: GitHub 모노레포를 Single Source of Truth로 사용
- **이유**: 버전 관리, PR 기반 리뷰, 에이전트 접근 용이성
- **대안 고려**: Notion을 SSOT로 → 버전 관리 부족으로 기각

### ADR-002: 설정 기반 에이전트 정의
- **결정**: 에이전트를 YAML 파일로 정의
- **이유**: 기술 스택 변경 시에도 도메인 정의 유지
- **대안 고려**: 코드 기반 정의 → 기술 종속성 높아 기각

### ADR-003: 단일 Slack 봇 + 멀티 페르소나
- **결정**: 하나의 Slack 앱에서 여러 에이전트 페르소나 표현
- **이유**: 운영 단순화, 권한 관리 용이
- **대안 고려**: 에이전트별 별도 봇 → 관리 복잡도 높아 기각

### ADR-004: MCP 단일 서버 + 네임스페이스
- **결정**: 하나의 MCP 서버에서 네임스페이스로 리소스 분리
- **이유**: 운영 단순화, 에이전트별 접근 제어 가능
- **대안 고려**: 도메인별 별도 MCP 서버 → 복잡도 증가로 기각
