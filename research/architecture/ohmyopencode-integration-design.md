# OhMyOpenCode Integration Architecture for Nubabel

## Executive Summary (Recommendation)

A **Hybrid Microservice + Adapter** architecture best fits Nubabel's multi-tenant SaaS and OhMyOpenCode's orchestration model. OMO should run as a separate service (swappable) while Nubabel hosts a minimal **Bridge** that presents a stable interface, injects tenant context, and manages session continuity, rate limiting, and billing.

---

## 1) Goals

- Nubabel에서 “오케스트레이션”을 호출할 수 있는 **안정적인 인터페이스** 제공
- OMO(OpenCode runtime/plugin)의 실행 환경을 Nubabel 코드베이스에 직접 끌어오지 않음
- 멀티테넌트 컨텍스트(organizationId/userId) 주입, 감사/과금/레이트리밋 적용

---

## 2) Proposed Architecture: Sidecar + Bridge

### Components

1. **Nubabel Bridge** (in-process module)

- 요청 정규화/검증
- tenant context 주입
- session_id 매핑/연속성 관리
- rate limit / budget enforcement
- observability(correlation id)

2. **OMO Service (Sidecar / Separate service)**

- OpenCode runtime + OhMyOpenCode plugin이 실행되는 환경
- Nubabel Bridge가 HTTP/gRPC로 호출

### Why this works

- OMO는 “라이브러리”가 아니라 “호스트 런타임 + 플러그인”에 가까움
- Nubabel과 배포/장애 도메인을 분리 가능
- 장기적으로 OMO를 교체하거나 버전 업그레이드 시 영향 축소

---

## 3) Interface contract (Bridge ↔ OMO)

권장 최소 계약:

- `POST /delegate_task`
  - input: `{ category, load_skills, prompt, session_id?, metadata }`
  - output: `{ session_id, result, usage?, errors? }`

부가 계약:

- `GET /health`
- `GET /capabilities` (지원 카테고리/스킬/버전)

---

## 4) Session continuity

Nubabel의 Session 모델(`ses_xxx`)을 OMO의 `session_id`와 1:1로 맞추는 것이 운영상 가장 단순합니다.

권장:

- Slack thread ↔ session_id
- Web UI ↔ same session_id 재사용
- Redis(hot) + Postgres(cold)로 저장(이미 Nubabel 패턴 존재)

---

## 5) Multi-tenant security

- 모든 호출은 `organizationId` 컨텍스트를 포함
- OMO 호출 전/후에 tenant boundary를 항상 검증
- tool 실행(예: MCP credentials)은 tenant 별 secret으로 분리

---

## 6) Reliability

### Failure modes

- OMO가 느림/다운 → fallback(룰 기반 routing, “잠시 후 재시도”) 제공
- 비용 폭증 → budget limiter + graceful degradation

### Patterns

- timeouts
- retries(backoff)
- circuit breaker
- DLQ(작업 큐 사용 시)

---

## 7) Observability

- correlation id를 Bridge에서 생성 후 OMO로 전달
- OTel trace에서 `tenant.id`, `session.id`, `category`, `skills[]` 태깅
- 비용/토큰 usage를 tenant 단위로 집계

---

## 8) Deployment options

1. 같은 서비스 내 “sidecar container”
2. 별도 서비스(내부 네트워크)

초기에는 운영 단순성을 위해 (1) 또는 (2) 중 환경에 맞춰 선택.

---

## References

- Dapr sidecar pattern — https://docs.dapr.io/concepts/overview/
- Envoy proxy patterns — https://www.envoyproxy.io/

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026  
**Research Sources**: Retool, Zapier, LangGraph Cloud, Slack, GitHub Actions, Dapr, Envoy, Istio
