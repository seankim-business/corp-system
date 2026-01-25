# 멀티 에이전트 프레임워크 비교

## 평가 기준

우리의 요구사항:

1. **설정 기반 정의**: 코드가 아닌 YAML/JSON으로 에이전트 정의
2. **표준 준수**: MCP, OpenAI-style tools 지원
3. **유지보수 용이**: 엔지니어 리소스가 적음
4. **교체 가능**: 향후 다른 프레임워크로 전환 용이
5. **Human-in-the-Loop**: 명시적 승인 포인트 지원

---

## 후보 프레임워크

### 1. OpenAI Agents SDK (Swarm 후속)

```yaml
pros:
  - OpenAI 공식, 산업 표준
  - 단순하고 직관적인 API
  - Function calling 네이티브 지원
  - 활발한 업데이트

cons:
  - OpenAI 모델에 최적화 (Claude 사용 시 조정 필요)
  - 상대적으로 새로움

fit_for_us:
  standard_compliance: "★★★★★"
  config_driven: "★★★☆☆"
  maintenance: "★★★★☆"
  replaceability: "★★★★★"
  hitl_support: "★★★★☆"
```

### 2. LangGraph

```yaml
pros:
  - 유연한 그래프 기반 워크플로
  - 상태 관리 우수
  - 조건부 분기/반복 지원
  - LangChain 생태계
  - 모델 독립적

cons:
  - 학습 곡선
  - 복잡한 설정
  - 오버엔지니어링 가능성

fit_for_us:
  standard_compliance: "★★★★☆"
  config_driven: "★★★★☆"
  maintenance: "★★★☆☆"
  replaceability: "★★★★☆"
  hitl_support: "★★★★★"
```

### 3. CrewAI

```yaml
pros:
  - 역할 기반 에이전트 정의
  - YAML 설정 지원
  - 간단한 시작
  - 위임/협업 내장

cons:
  - 상대적으로 덜 표준적
  - 커스터마이징 제한
  - 커뮤니티 규모

fit_for_us:
  standard_compliance: "★★★☆☆"
  config_driven: "★★★★★"
  maintenance: "★★★★☆"
  replaceability: "★★★☆☆"
  hitl_support: "★★★☆☆"
```

### 4. Anthropic Claude Agent SDK

```yaml
pros:
  - Claude 네이티브
  - MCP 완벽 지원
  - 공식 지원

cons:
  - Anthropic 모델 전용
  - 상대적으로 새로움

fit_for_us:
  standard_compliance: "★★★★★"
  config_driven: "★★★★☆"
  maintenance: "★★★★★"
  replaceability: "★★★☆☆"
  hitl_support: "★★★★★"
```

### 5. Vertex AI Agent Builder

```yaml
pros:
  - Google Cloud 통합
  - 엔터프라이즈 기능
  - 관리형 서비스

cons:
  - 벤더 락인
  - 비용
  - 유연성 제한

fit_for_us:
  standard_compliance: "★★★☆☆"
  config_driven: "★★★★☆"
  maintenance: "★★★★★"
  replaceability: "★★☆☆☆"
  hitl_support: "★★★★☆"
```

---

## 비교 매트릭스

| 기준 | OpenAI SDK | LangGraph | CrewAI | Claude SDK | Vertex AI |
|------|:----------:|:---------:|:------:|:----------:|:---------:|
| 표준 준수 | ★★★★★ | ★★★★☆ | ★★★☆☆ | ★★★★★ | ★★★☆☆ |
| 설정 기반 | ★★★☆☆ | ★★★★☆ | ★★★★★ | ★★★★☆ | ★★★★☆ |
| 유지보수 | ★★★★☆ | ★★★☆☆ | ★★★★☆ | ★★★★★ | ★★★★★ |
| 교체 용이 | ★★★★★ | ★★★★☆ | ★★★☆☆ | ★★★☆☆ | ★★☆☆☆ |
| HITL | ★★★★☆ | ★★★★★ | ★★★☆☆ | ★★★★★ | ★★★★☆ |
| MCP 지원 | ★★★☆☆ | ★★★☆☆ | ★★☆☆☆ | ★★★★★ | ★★☆☆☆ |
| 모델 독립 | ★★★☆☆ | ★★★★★ | ★★★★☆ | ★★☆☆☆ | ★★★☆☆ |

---

## 추천

### 1차 선택: Anthropic Claude Agent SDK + LangGraph

```yaml
recommendation:
  primary: "Claude Agent SDK"
  reason:
    - "Claude 사용 시 네이티브 최적화"
    - "MCP 완벽 지원"
    - "Anthropic 공식 지원"

  secondary: "LangGraph (워크플로 레이어)"
  reason:
    - "복잡한 멀티 에이전트 오케스트레이션"
    - "조건부 분기/상태 관리"
    - "모델 독립적 워크플로 정의"

  architecture:
    └── LangGraph (Workflow Orchestration)
         ├── Claude Agent SDK (Agent Execution)
         │    └── MCP (Tool/Resource Access)
         └── State Management
```

### 대안: OpenAI Agents SDK + Thin Adapter

```yaml
alternative:
  primary: "OpenAI Agents SDK"
  reason:
    - "더 넓은 산업 표준"
    - "향후 모델 교체 용이"

  adaptation:
    - "Claude 호환 어댑터 구현"
    - "MCP 연동 레이어 추가"
```

---

## 하이브리드 아키텍처

### 설계 원칙

```
"에이전트 정의는 프레임워크 독립적으로,
 실행 엔진만 교체 가능하게"
```

### 구조

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Domain Layer (프레임워크 독립)                         │
│                                                                         │
│   /agents/*.yml    /skills/*.yml    /sops/*.md    /org/*.yml           │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    Agent Definition Schema                       │  │
│   │              (YAML - 프레임워크 중립적 포맷)                       │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 로드
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Adapter Layer (교체 가능)                             │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │                    Agent Loader                                  │  │
│   │          (YAML → 프레임워크별 에이전트 객체 변환)                   │  │
│   └─────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│   구현 옵션:                                                            │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │
│   │ Claude SDK  │  │ LangGraph   │  │ OpenAI SDK  │                    │
│   │ Loader      │  │ Loader      │  │ Loader      │                    │
│   └─────────────┘  └─────────────┘  └─────────────┘                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 실행
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Execution Layer (선택된 프레임워크)                    │
│                                                                         │
│   현재: Claude Agent SDK + LangGraph                                    │
│   향후: 다른 프레임워크로 교체 가능                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 마이그레이션 전략

### 프레임워크 교체 시

```yaml
migration_steps:
  1. 새 프레임워크용 Loader 구현
     - YAML 스키마 → 새 프레임워크 객체 변환

  2. 어댑터 테스트
     - 기존 에이전트 정의로 새 런타임 테스트

  3. 점진적 전환
     - 에이전트 하나씩 새 런타임으로 이전

  4. 완전 전환
     - 기존 Loader 제거

preserved:
  - "/agents/*.yml - 에이전트 정의"
  - "/skills/*.yml - 스킬 정의"
  - "/sops/*.md - SOP 문서"
  - "MCP 서버 - 도구/리소스"

replaced:
  - "Agent Loader 구현"
  - "Orchestrator 런타임"
```

---

## 결론

### 선택: Claude Agent SDK + LangGraph

```yaml
final_decision:
  agent_runtime: "Claude Agent SDK"
  workflow_orchestration: "LangGraph"
  tool_protocol: "MCP"

  rationale:
    - "Claude 사용 시 최적의 성능"
    - "MCP 네이티브 지원"
    - "복잡한 워크플로는 LangGraph로 처리"
    - "YAML 기반 에이전트 정의로 교체 용이성 확보"

  trade_offs:
    - "Claude 모델에 다소 종속적"
    - "LangGraph 학습 필요"

  mitigation:
    - "에이전트 정의를 프레임워크 독립적 YAML로 유지"
    - "Adapter 패턴으로 런타임 교체 가능하게 설계"
```
