# Server-Sent Events (SSE) Patterns for Multi-Tenant SaaS + AI Streaming

> **Purpose**: SSE를 사용해 실시간 업데이트/AI 스트리밍을 안정적으로 제공하기 위한 구현 패턴 정리 (Node/Express 중심)
>
> **Context**: Nubabel (multi-tenant SaaS) + Slack/웹 대시보드 + 장시간 작업(BullMQ) 결과 스트리밍

---

## Table of Contents

1. [When to use SSE (vs WebSocket)](#when-to-use-sse-vs-websocket)
2. [Protocol & Headers](#protocol--headers)
3. [Minimal Node/Express Implementation](#minimal-nodeexpress-implementation)
4. [Reconnection & Resumability (Last-Event-ID)](#reconnection--resumability-last-event-id)
5. [Authentication Strategies](#authentication-strategies)
6. [Load Balancers / Proxies](#load-balancers--proxies)
7. [Scaling in Multi-Tenant SaaS](#scaling-in-multi-tenant-saas)
8. [AI/LLM Streaming Patterns](#aillm-streaming-patterns)
9. [Backpressure & Flow Control](#backpressure--flow-control)
10. [Checklist](#checklist)
11. [References](#references)

---

## When to use SSE (vs WebSocket)

SSE는 **서버 → 클라이언트 단방향 스트림**이 필요한 경우에 적합합니다.

✅ SSE가 좋은 경우

- 진행 상황/로그/상태 업데이트를 지속적으로 푸시
- AI 토큰 스트리밍(클라이언트가 서버로 메시지를 실시간으로 보내야 하는 요구가 크지 않음)
- 인프라 단순화(프록시/로드밸런서에서 WebSocket보다 운영 부담이 낮음)

⚠️ WebSocket이 필요한 경우

- 양방향(low-latency) 상호작용이 핵심
- 클라이언트 → 서버 이벤트가 높은 빈도로 발생

---

## Protocol & Headers

### Required basics

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`

SSE 이벤트 포맷은 `data:`/`event:`/`id:`/`retry:` 필드를 사용하며, **빈 줄(\n\n)** 로 이벤트를 구분합니다.

```text
id: 42
event: token
data: {"t":"Hello"}

```

Heartbeat는 주석 라인(`:`)로 전송할 수 있습니다.

```text
: ping

```

---

## Minimal Node/Express Implementation

```ts
import type { Request, Response } from "express";

export function sseHandler(req: Request, res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Nginx buffering 방지
  res.setHeader("X-Accel-Buffering", "no");

  res.flushHeaders?.();

  const send = (event: { id?: string; event?: string; data: unknown }) => {
    if (event.id) res.write(`id: ${event.id}\n`);
    if (event.event) res.write(`event: ${event.event}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  };

  // heartbeat (15~30s 권장)
  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 25_000);

  // example
  send({ event: "ready", data: { ok: true } });

  req.on("close", () => {
    clearInterval(heartbeat);
    res.end();
  });
}
```

---

## Reconnection & Resumability (Last-Event-ID)

브라우저 `EventSource`는 연결이 끊기면 자동 재연결합니다. 서버가 이벤트에 `id:`를 설정하면, 재연결 시 클라이언트가 `Last-Event-ID`를 전송하여 **중단 지점부터 재개**할 수 있습니다(서버가 이벤트 저장소를 갖고 있다는 전제).

권장 패턴:

- 이벤트마다 monotonic `id` 부여 (job id + sequence 등)
- 짧은 TTL의 이벤트 저장소(예: Redis Stream/List)로 최근 N개의 이벤트를 보관
- 재연결 시 `Last-Event-ID` 이후 이벤트 재전송

---

## Authentication Strategies

### 문제: native EventSource는 커스텀 헤더(Authorization)를 못 넣는다

대안:

1. **Cookie 기반 인증** (권장 for web dashboard)

- `httpOnly + Secure + SameSite` 쿠키
- 동일 사이트 요청 + `withCredentials`

2. **fetch 기반 SSE client 사용**

- `@microsoft/fetch-event-source` 같은 라이브러리는 헤더 지정 가능

3. **Query string token**

- 가능한 피하고, 써야 한다면 **단기 토큰 + 로그/리퍼러 노출 주의**

---

## Load Balancers / Proxies

운영에서 가장 흔한 문제는 “중간 프록시가 버퍼링해서 실시간이 깨지는 것”입니다.

- Nginx: `proxy_buffering off;` + `X-Accel-Buffering: no`
- Idle timeout이 짧은 LB: heartbeat 주기적으로 전송
- 응답 압축/캐싱 비활성화(특히 `text/event-stream`)

---

## Scaling in Multi-Tenant SaaS

SSE 커넥션은 서버 리소스를 점유합니다. 멀티 인스턴스에서 안정적으로 동작하려면:

- tenant 단위 connection limit / rate limit
- cross-instance fan-out: Redis Pub/Sub(간단) 또는 Redis Streams(재전송/리플레이에 유리)
- tenant routing: `tenant.id`를 span/log/metric에도 태깅

---

## AI/LLM Streaming Patterns

권장 이벤트 타입:

- `event: token` → `{ token, index }`
- `event: progress` → `{ step, pct }`
- `event: done` → `{ ok: true }`
- `event: error` → `{ message, retryable, correlationId }`

완료 시그널은 명시적으로 보내고, 클라이언트는 `done`을 받으면 연결 종료/정리.

---

## Backpressure & Flow Control

Node는 `res.write()`가 `false`를 반환할 수 있습니다(버퍼가 찼음). 대량 토큰 스트림 시:

- `res.write()` 반환값 확인
- `drain` 이벤트를 기다려서 재개
- 이벤트 batching(예: 50ms 단위로 묶기)로 write call 수를 줄이기

---

## Checklist

- [ ] `Content-Type: text/event-stream` 설정
- [ ] proxy buffering 비활성화(Nginx 등)
- [ ] heartbeat(15~30s)
- [ ] `id:` 제공 + `Last-Event-ID` 기반 재연결 설계
- [ ] 인증 전략 선택(EventSource 제한 고려)
- [ ] tenant 단위 rate limit / connection limit
- [ ] 멀티 인스턴스 fan-out (Redis)
- [ ] close 이벤트에서 리소스 정리

---

## References

- MDN: Using Server-Sent Events — https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- WHATWG HTML Standard (SSE) — https://html.spec.whatwg.org/multipage/server-sent-events.html
- @microsoft/fetch-event-source — https://www.npmjs.com/package/@microsoft/fetch-event-source

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026
