# Multi-Tenant SaaS Onboarding Flow Patterns (Web + Slack)

> **Purpose**: 멀티테넌트 SaaS에서 onboarding(첫 실행/empty state/integration setup/초대/권한)을 설계하는 실전 패턴.
>
> **Context**: Nubabel — Web Dashboard + Slack Bot(Primary), multi-tenant org model

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [First-run: Time-to-Value & “Aha moment”](#first-run-time-to-value--aha-moment)
3. [Empty states](#empty-states)
4. [Integrations setup (Slack-first)](#integrations-setup-slack-first)
5. [Invites & roles (Admin vs Member)](#invites--roles-admin-vs-member)
6. [Progressive setup](#progressive-setup)
7. [In-product guidance](#in-product-guidance)
8. [Slack-first onboarding specifics](#slack-first-onboarding-specifics)
9. [Metrics & optimization](#metrics--optimization)
10. [Nubabel-specific recommended flow](#nubabel-specific-recommended-flow)
11. [References](#references)

---

## Executive Summary

핵심은 “가입 → 첫 가치(activation)까지”의 시간을 최소화하는 것입니다.

Nubabel처럼 **Slack이 핵심 인터페이스**인 제품은:

- Web에서는 **설정/권한/통합 관리**
- Slack에서는 **일상 사용/명령/피드백 루프**

를 분리하고, onboarding에서 이를 명확히 안내하는 것이 중요합니다.

---

## First-run: Time-to-Value & “Aha moment”

### 원칙

- 체크리스트는 **3~5개**가 적절 (너무 길면 이탈)
- 사용자의 목표(페르소나)에 따라 onboarding을 **분기**
- “설정 완료”가 아니라 “첫 가치”를 빠르게 보여줘야 함

### Nubabel first-run 체크리스트(예시)

1. Workspace 생성/확인 (org)
2. Slack 연결(OAuth)
3. Bot을 특정 채널에 추가
4. 첫 명령 실행 (`@nubabel help` → 샘플 workflow)
5. 결과 확인(스레드에서 status update)

---

## Empty states

Empty state는 기능 설명이 아니라 “다음 행동”으로 이어져야 합니다.

### 3가지 가이드라인

1. 시스템 상태를 명확히
2. 사용자가 무엇을 기대해야 하는지 교육
3. 즉시 행동 가능한 CTA 제공

### Nubabel 빈 상태 패턴(예)

- Workflows 없음 → `Create workflow` 버튼 + 샘플 템플릿
- Integrations 없음 → `Connect Slack` + 권한/스코프 설명
- Activity feed 비어있음 → “Slack에서 @mention 하면 여기에 기록됩니다”

---

## Integrations setup (Slack-first)

### 권장 setup 흐름

1. OAuth로 Slack 연결
2. 기본 채널 선택(또는 설치/추가 가이드)
3. 테스트 이벤트(“hello” 메시지)로 연결 확인
4. 알림/권한 옵션 설정

### Setup 중 메시지 설계

- 왜 이 권한이 필요한지(최소 권한)
- 실패 시 해결책(권한 부족/채널 접근 불가/워크스페이스 정책)

---

## Invites & roles (Admin vs Member)

### 초대(invite) 플로우 권장

- 7일 만료 토큰
- 재초대/취소 가능
- 이메일 매칭 자동 가입(가능하다면)

### 역할 패턴

- Workspace Admin: 통합/멤버 관리/보안 설정
- Member: 실행/조회 중심
- Guest(옵션): 제한된 리소스만

---

## Progressive setup

“처음부터 모든 설정”은 실패합니다.

### 단계화

- Day 1: 필수(로그인/Slack 연결/첫 실행)
- Week 1: 설정(알림/추가 통합/팀 구조)
- Ongoing: 고급 기능(analytics, advanced workflows)

---

## In-product guidance

### Guidance 도구

- Tour: 4 steps 이하
- Checklist: 3~5 items
- Tooltip/hotspot: 문맥 기반
- Resource center: 언제든 접근

---

## Slack-first onboarding specifics

### 권장 채널 템플릿

```
📌 PINNED: Welcome to Nubabel

✅ Next steps
1) Connect Slack
2) Add bot to channel
3) Run your first command

💬 Norms
- Thread per topic
- Mention @nubabel to trigger
```

### Slack에서 “학습”을 돕는 패턴

- `/help` 또는 `@bot help`는 항상 작동
- 실패 시 “무엇을 할 수 있는지”를 함께 보여주기
- 긴 작업은 “진행 중” 이벤트를 반복적으로 제공

---

## Metrics & optimization

추천 지표:

- Time-to-Value (TTV)
- Activation rate
- Checklist completion rate
- Day 1/7/30 retention
- Onboarding 관련 support ticket volume

---

## Nubabel-specific recommended flow

```
Signup/Web
  → Create org
  → Connect Slack
  → Add bot to channel
  → First command
  → See result in thread + dashboard log
```

---

## References

- Nielsen Norman Group: Empty states guidelines — https://www.nngroup.com/articles/empty-state-interface-design/
- Chameleon: SaaS onboarding principles — https://www.chameleon.io/blog/saas-onboarding
- WorkOS: B2B user management — https://workos.com/blog/user-management-for-b2b-saas
- Slack: App design / onboarding — https://docs.slack.dev/

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026
