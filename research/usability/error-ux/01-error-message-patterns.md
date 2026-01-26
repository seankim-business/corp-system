# Error Message UX Patterns (Developer Tools/SaaS)

> **Purpose**: 제품/Slack/AI 통합에서 발생하는 에러를 사용자에게 “복구 가능하게” 전달하기 위한 UX + 템플릿.
>
> **Context**: Nubabel (AI APIs + Slack + MCP integrations)

---

## Table of Contents

1. [Principles](#principles)
2. [Network errors](#network-errors)
3. [Authentication errors](#authentication-errors)
4. [Rate limits (429)](#rate-limits-429)
5. [Partial failures](#partial-failures)
6. [Correlation IDs](#correlation-ids)
7. [Slack error messaging patterns](#slack-error-messaging-patterns)
8. [Copywriting checklist](#copywriting-checklist)
9. [References](#references)

---

## Principles

에러 메시지는 최소한 아래 3가지를 답해야 합니다:

1. 무엇이 일어났는가
2. 왜 일어났는가(가능한 범위에서)
3. 사용자가 지금 무엇을 하면 되는가

핵심 원칙(요약):

- Source 가까이 표시(필드/행/컴포넌트)
- 사람 말로, 짧고 구체적으로
- 복구 동작 제공(재시도/설정 확인/지원 연결)
- 사용자 입력/상태는 보존

---

## Network errors

### 템플릿: 연결 문제

**Title**: Connection issue

**Body**: We couldn’t connect to the server. This might be temporary.

**Actions**:

- Retry (primary)
- Work offline / Save draft (secondary, 가능하면)

**Note**: Your work is saved.

### 운영 패턴

- 자동 재시도: exponential backoff + jitter
- 사용자는 상태를 볼 수 있어야 함(“Retrying in 10s”)

---

## Authentication errors

### 세션 만료

**Title**: Session ended

**Body**: For your security, you’ve been signed out. Please sign in again.

**Action**: Sign in again

### OAuth 실패

- 실패 사유(권한 거부/리다이렉트 오류/정책 차단)를 분류해서 메시지
- “다시 시도” + “관리자에게 문의” 경로 제공

---

## Rate limits (429)

429는 가능한 “언제 다시 되나”를 알려야 합니다.

### 템플릿: 제한 도달

**Title**: Slow down

**Body**: Too many requests. Try again in **{retryAfter}s**.

**Actions**:

- Retry in {retryAfter}s (countdown)
- View usage (optional)

### 재시도 알고리즘(예시)

```js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retryWithBackoff(fn, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = err?.status === 429 || err?.status >= 500;
      if (!retryable || i === maxRetries - 1) throw err;
      const base = Math.min(1000 * 2 ** i, 30_000);
      const jitter = Math.random() * 1000;
      await sleep(base + jitter);
    }
  }
}
```

---

## Partial failures

Batch 작업에서는 “요약 + 상세”가 기본.

### 템플릿

**Title**: Partially completed

**Body**: {succeeded} of {total} succeeded. {failed} failed.

**Actions**:

- Retry failed items (primary)
- Download error report
- Continue

---

## Correlation IDs

지원/디버깅을 위해 사용자에게 노출 가능한 reference id를 제공합니다.

### 템플릿

**Title**: Something went wrong

**Body**: Please try again. If it continues, contact support with this reference.

**Reference**: `corr_abc123`

**Actions**: Retry / Contact support / Copy reference

---

## Slack error messaging patterns

### 기본 포맷

```
🔴 *Integration Error*

*What happened:*
Failed to sync with Notion

*Next steps:*
• We’ll retry automatically in 5 minutes
• You can retry now

*Reference:* `corr_abc123`
```

Block Kit에서는 header/section/context/actions로 구성하고, CTA는 1~2개로 제한.

---

## Copywriting checklist

- [ ] 제목은 3~5단어로 스캔 가능
- [ ] 원인/영향/다음 행동이 명확
- [ ] 사용자를 탓하지 않음
- [ ] 가능한 경우 자동 복구 + 진행 상태 제공
- [ ] correlation/request id 제공

---

## References

- NN/g error message guidelines — https://www.nngroup.com/articles/error-message-guidelines/
- Atlassian writing guidelines — https://atlassian.design/content/writing-guidelines/writing-error-messages/
- PatternFly UX writing — https://www.patternfly.org/ux-writing/error-messages
- MDN 429 — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429
- Slack messaging — https://slack.dev/messaging/

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026
