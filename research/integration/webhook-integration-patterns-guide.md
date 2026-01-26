# Webhook Integration Patterns for SaaS: Comprehensive Guide

Based on research from Stripe, GitHub, Slack, and production implementations across the ecosystem, here's a complete guide to implementing secure, scalable webhook systems.

---

## Table of Contents

1. [Webhook Reception](#1-webhook-reception)
2. [Webhook Security](#2-webhook-security)
3. [Webhook Processing](#3-webhook-processing)
4. [Webhook Testing](#4-webhook-testing)
5. [Webhook Delivery (Sending)](#5-webhook-delivery-sending)
6. [Production Patterns](#6-production-patterns)

---

## 1. Webhook Reception

### 1.1 Design goals

- **Fast ACK**: provider의 재전송/타임아웃을 피하려면 수신 처리와 비즈니스 처리를 분리
- **Idempotent**: 같은 이벤트가 여러 번 들어와도 안전
- **Observable**: webhookId / eventId / requestId 기반으로 추적 가능

### 1.2 Express 수신 핸들러 (권장 패턴)

```ts
import type { Request, Response } from "express";

export async function webhookHandler(req: Request, res: Response) {
  // 1) verify signature (see section 2)
  // 2) parse event

  // 3) fast ACK
  res.status(200).json({ ok: true });

  // 4) enqueue async processing (BullMQ, etc)
  // await queue.add("webhook", { provider: "stripe", payload: req.body, headers: req.headers })
}
```

> Stripe/GitHub/Slack 모두 “빠른 2xx 응답 + async 처리”가 운영에서 일반적입니다.

---

## 2. Webhook Security

### 2.1 Signature verification

원칙:

- raw body로 서명 검증이 필요할 수 있음(예: Stripe)
- timestamp 포함 시 재생(replay) 방지

#### Stripe-style (개념)

- `t=timestamp,v1=signature` 형태
- `timestamp + '.' + rawBody`에 대해 HMAC-SHA256

#### Slack-style (개념)

- `X-Slack-Signature` + `X-Slack-Request-Timestamp`
- `v0:{ts}:{rawBody}`에 대해 HMAC
- timestamp가 너무 오래되면 거부

### 2.2 Replay 방지

- timestamp window (예: 5분)
- eventId 기반 dedupe (Redis SETNX/TTL)

### 2.3 IP allowlist (선택)

가능하면 사용하되, SaaS provider는 IP 범위가 자주 바뀌기도 하므로 signature 검증이 기본.

---

## 3. Webhook Processing

### 3.1 Idempotency & Dedupe

필수:

- provider의 event id를 저장하고 중복 처리 방지
- DB unique constraint 또는 Redis로 1차 차단

```sql
-- Example: store processed webhook events
CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT now(),
  payload JSONB NOT NULL
);
```

### 3.2 Ordering

provider가 순서를 보장하지 않을 수 있음.

- 중요한 리소스는 최신 상태를 fetch해서 “현재 상태 기반”으로 처리
- event version / created timestamp 사용

### 3.3 Retry / Dead-letter

- transient error(429/5xx)는 retry
- permanent error는 DLQ로 분리

---

## 4. Webhook Testing

- signature verification 유닛 테스트
- replay / dedupe 테스트
- provider CLI(Stripe CLI 등)로 로컬 리허설

### 실전 체크리스트

- [ ] raw body 확보(필요한 provider)
- [ ] timestamp window
- [ ] idempotency key / event id 저장
- [ ] queue 기반 async processing
- [ ] DLQ + alert

---

## 5. Webhook Delivery (Sending)

외부로 webhook을 보내는 경우(“Nubabel → 고객 시스템”) 패턴:

- endpoint 등록/검증
- 서명(HMAC) 제공
- 재시도(backoff), 지수적 증가
- per-tenant rate limit
- 실패 기록 + 재전송 UI

---

## 6. Production Patterns

### Observability

- `webhook.provider`, `webhook.event_id`, `tenant.id`를 로그/트레이스/메트릭에 태깅
- correlation id를 Slack/UI 오류에도 노출

### Backpressure

- burst 대응: queue length 기반 worker autoscaling
- DB connection pool 제한

### References

- Stripe Webhooks — https://stripe.com/docs/webhooks
- GitHub Webhooks — https://docs.github.com/en/webhooks
- Slack signing secrets — https://api.slack.com/authentication/verifying-requests-from-slack

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2026  
**Research Sources:** Stripe, GitHub, Slack documentation, BullMQ, production codebases
