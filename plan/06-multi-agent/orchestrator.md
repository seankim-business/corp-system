# 오케스트레이터 설계

## 역할

Orchestrator는 멀티 에이전트 시스템의 중앙 조정자입니다.

```
사용자 요청 → Orchestrator → 적절한 Agent(s) → 결과 취합 → 사용자 응답
```

---

## 핵심 기능

### 1. 요청 분석 및 라우팅

```yaml
routing:
  process:
    1. 사용자 메시지 분석
    2. 의도(Intent) 파악
    3. 필요한 에이전트 식별
    4. 컨텍스트 구성
    5. 에이전트에 위임

  routing_rules:
    - pattern: "캠페인|브리프|콘텐츠|브랜드"
      agent: "agent-brand"

    - pattern: "예산|비용|정산|재무"
      agent: "agent-finance"

    - pattern: "휴가|채용|온보딩|인사"
      agent: "agent-hr"

    - pattern: "제품|기획|로드맵"
      agent: "agent-product"

    - pattern: "운영|배송|CS|고객"
      agent: "agent-ops"
```

### 2. 멀티 에이전트 워크플로

```yaml
workflow_patterns:
  # 순차 실행
  sequential:
    - step: 1
      agent: "agent-product"
      task: "기획 정보 수집"
    - step: 2
      agent: "agent-brand"
      task: "브리프 작성"
    - step: 3
      agent: "agent-finance"
      task: "예산 검토"

  # 병렬 실행
  parallel:
    - agent: "agent-brand"
      task: "콘텐츠 준비"
    - agent: "agent-ops"
      task: "물류 준비"
    # 둘 다 완료 후 다음 단계

  # 조건부 분기
  conditional:
    - if: "예산 > 1000만원"
      then:
        agent: "agent-finance"
        task: "상세 예산 검토"
      else:
        agent: "agent-brand"
        task: "바로 진행"
```

### 3. 컨텍스트 관리

```yaml
context_management:
  session_context:
    - user_id
    - channel_id
    - thread_ts
    - conversation_history

  task_context:
    - current_objective
    - participating_agents
    - completed_steps
    - pending_steps

  shared_context:
    - 에이전트 간 공유 데이터
    - 중간 결과물
    - 메모/노트
```

### 4. 승인 포인트 관리

```yaml
approval_management:
  detect:
    - SOP에 정의된 승인 포인트
    - 도구 사용 시 approval_required 확인
    - 금액/권한 기반 자동 판단

  flow:
    1. 승인 필요 감지
    2. request_approval 도구 호출
    3. 승인자에게 알림
    4. 응답 대기
    5. 승인/거절에 따라 진행

  timeout_handling:
    - 타임아웃 시 fallback_approver에게 에스컬레이션
    - 2차 타임아웃 시 작업 보류 및 알림
```

---

## 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Orchestrator                                  │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                     Request Analyzer                             │  │
│   │  • 의도 파악                                                     │  │
│   │  • 엔티티 추출                                                   │  │
│   │  • 요청 분류                                                     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                      Router                                      │  │
│   │  • 에이전트 선택                                                 │  │
│   │  • 워크플로 결정                                                 │  │
│   │  • 컨텍스트 구성                                                 │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                    ┌───────────────┼───────────────┐                   │
│                    ▼               ▼               ▼                   │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                  Agent Executor                                  │  │
│   │  • 에이전트 호출                                                 │  │
│   │  • 결과 수집                                                     │  │
│   │  • 에러 처리                                                     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                  State Manager                                   │  │
│   │  • 세션 상태                                                     │  │
│   │  • 워크플로 상태                                                 │  │
│   │  • 히스토리                                                      │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                    │                                    │
│                                    ▼                                    │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                  Response Composer                               │  │
│   │  • 결과 취합                                                     │  │
│   │  • 응답 구성                                                     │  │
│   │  • 포맷팅                                                        │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 워크플로 정의 (LangGraph)

```yaml
# 워크플로 그래프 정의
workflow_graph:
  name: "multi_agent_workflow"

  nodes:
    - id: "analyze"
      type: "function"
      function: "analyze_request"

    - id: "route"
      type: "router"
      routes:
        brand: "execute_brand"
        finance: "execute_finance"
        multi: "execute_multi"

    - id: "execute_brand"
      type: "agent"
      agent: "agent-brand"

    - id: "execute_finance"
      type: "agent"
      agent: "agent-finance"

    - id: "execute_multi"
      type: "parallel"
      agents: ["agent-brand", "agent-finance"]

    - id: "check_approval"
      type: "condition"
      condition: "requires_approval"
      true_branch: "wait_approval"
      false_branch: "compose"

    - id: "wait_approval"
      type: "human"
      action: "request_approval"

    - id: "compose"
      type: "function"
      function: "compose_response"

  edges:
    - from: "START"
      to: "analyze"
    - from: "analyze"
      to: "route"
    - from: "execute_brand"
      to: "check_approval"
    - from: "execute_finance"
      to: "check_approval"
    - from: "execute_multi"
      to: "check_approval"
    - from: "wait_approval"
      to: "compose"
    - from: "compose"
      to: "END"
```

---

## 라우팅 로직

### 1차 라우팅 (키워드 기반)

```yaml
keyword_routing:
  rules:
    - keywords: ["캠페인", "브리프", "콘텐츠", "에셋", "브랜드", "크리에이티브"]
      agent: "agent-brand"
      confidence: 0.8

    - keywords: ["예산", "비용", "정산", "인보이스", "결제"]
      agent: "agent-finance"
      confidence: 0.8

    - keywords: ["휴가", "연차", "채용", "온보딩", "인사"]
      agent: "agent-hr"
      confidence: 0.8

    - keywords: ["기획", "로드맵", "제품", "컬렉션"]
      agent: "agent-product"
      confidence: 0.8

    - keywords: ["배송", "CS", "고객", "운영", "인시던트"]
      agent: "agent-ops"
      confidence: 0.8
```

### 2차 라우팅 (스킬 매칭)

```yaml
skill_matching:
  process:
    1. 모든 스킬의 triggers.questions 검색
    2. 사용자 질문과 유사도 계산
    3. 최고 점수 스킬 선택
    4. 해당 스킬을 가진 에이전트 선택

  example:
    user_query: "캠페인 브리프 작성해줘"
    matched_skill: "skill://brand/brief-writing"
    matched_agent: "agent-brand"
    confidence: 0.95
```

### 3차 라우팅 (멀티 에이전트)

```yaml
multi_agent_detection:
  triggers:
    - "~하고 ~해줘" (복합 요청)
    - 여러 Function 키워드 동시 포함
    - Value Stream 관련 요청

  example:
    user_query: "캠페인 브리프 작성하고 예산도 확인해줘"
    detected_agents:
      - agent: "agent-brand"
        task: "캠페인 브리프 작성"
      - agent: "agent-finance"
        task: "예산 확인"
    execution: "sequential"  # 또는 "parallel"
```

---

## 에러 처리

```yaml
error_handling:
  agent_error:
    - retry: 3
    - fallback_agent: null  # 대체 에이전트 없으면 에러 반환
    - notify_owner: true

  timeout:
    - default: "5m"
    - action: "cancel_and_notify"

  no_route:
    - action: "ask_clarification"
    - message: "요청을 이해하지 못했습니다. 좀 더 구체적으로 말씀해주세요."

  permission_denied:
    - action: "explain_limitation"
    - suggest_alternative: true
```

---

## 모니터링

```yaml
metrics:
  - name: "orchestrator_requests_total"
    type: "counter"
    labels: ["status", "routed_agent"]

  - name: "orchestrator_routing_duration_seconds"
    type: "histogram"

  - name: "orchestrator_workflow_duration_seconds"
    type: "histogram"
    labels: ["workflow_type"]

  - name: "orchestrator_agent_calls_total"
    type: "counter"
    labels: ["agent_id", "status"]

logging:
  level: "info"
  include:
    - request_id
    - user_id
    - routed_agents
    - execution_time
    - outcome
```
