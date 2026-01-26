# OAuth 2.1 Security Patterns for Multi-Tenant SaaS

> **Purpose**: 멀티테넌트 SaaS에서 OAuth 2.1(및 OAuth2 보안 BCP)을 안전하게 적용하기 위한 체크리스트/패턴
>
> **Context**: Nubabel (Google Workspace 연동 + API integrations)

---

## Table of Contents

1. [Core requirements](#core-requirements)
2. [PKCE (mandatory)](#pkce-mandatory)
3. [Redirect URI security](#redirect-uri-security)
4. [Token security](#token-security)
5. [Refresh tokens](#refresh-tokens)
6. [Sender-constrained tokens (mTLS/DPoP)](#sender-constrained-tokens-mtlsdpop)
7. [Multi-tenant isolation](#multi-tenant-isolation)
8. [Google Workspace considerations](#google-workspace-considerations)
9. [Checklists](#checklists)
10. [References](#references)

---

## Core requirements

- **Implicit Grant 금지** (authorization code + PKCE로 통일)
- **ROPC(Resource Owner Password) 금지**
- 토큰을 URL query로 전달하지 않기
- TLS 강제

---

## PKCE (mandatory)

OAuth 2.1에서는 Authorization Code Flow에 **PKCE를 필수**로 적용하는 것이 표준 방향입니다.

- [ ] `code_challenge_method=S256`만 허용
- [ ] `code_verifier`는 43~128 chars, CSPRNG 기반 생성
- [ ] downgrade 방지: `code_challenge`가 없으면 token request의 `code_verifier` 거부(또는 반대로 강제)

---

## Redirect URI security

- [ ] redirect URI는 **정확 일치(exact string match)**
- [ ] wildcard/pattern 금지
- [ ] authorization 단계와 token 교환 단계에서 모두 검증
- [ ] open redirector 금지

---

## Token security

### Access token

- [ ] 짧은 TTL(예: <= 1h)
- [ ] audience 제한(aud)
- [ ] 최소 scope
- [ ] 로그/URL/에러 메시지에 토큰 노출 금지

### Storage

- Web: **httpOnly + Secure cookie** 또는 BFF 패턴(서버 저장)
- SPA: localStorage 저장 금지(가능하면 BFF)
- Server: DB 저장 시 암호화(키 관리 포함)

---

## Refresh tokens

- [ ] public client(브라우저/모바일)에서는 **refresh token rotation**
- [ ] refresh token 재사용 감지 시 세션 전체 revoke(탈취 신호)
- [ ] refresh token은 장기 보관 대상이므로 저장/암호화/감사 로깅 강화

---

## Sender-constrained tokens (mTLS/DPoP)

Bearer token은 탈취되면 재사용(replay)됩니다. mTLS/DPoP로 토큰을 “소유 증명” 기반으로 제한하면 replay 위험을 크게 낮출 수 있습니다.

- mTLS: 클라이언트 인증서에 토큰 바인딩
- DPoP: 요청마다 proof를 보내는 방식(키 쌍 기반)

---

## Multi-tenant isolation

- [ ] tenant 식별자(organizationId)를 token claim 또는 서버 세션 컨텍스트에 포함
- [ ] 모든 resource server에서 tenant context 검증
- [ ] 가능하면 **tenant 별 OAuth client/secret 분리**
- [ ] 비밀/키는 tenant 별로 분리 저장 + 접근 감사

---

## Google Workspace considerations

Google Workspace Domain-Wide Delegation(DWD) 등을 사용할 경우, 잘못 구성하면 tenant 간 권한 확장이 발생할 수 있습니다.

- [ ] tenant 별 service account 분리 (공유 금지)
- [ ] scope 최소화
- [ ] 가능하면 service account key 지양(Workload Identity 등)

---

## Checklists

### Authorization Server

- [ ] PKCE(S256) 강제
- [ ] redirect URI exact match
- [ ] refresh token rotation
- [ ] OAuth metadata(RFC 8414)

### Client

- [ ] PKCE 사용
- [ ] state/nonce 처리
- [ ] token 저장 안전

### Resource Server

- [ ] signature/exp/aud/scope 검증
- [ ] tenant isolation 강제

---

## References

- OAuth 2.0 Security Best Current Practice (RFC 9700) — https://www.rfc-editor.org/rfc/rfc9700
- PKCE (RFC 7636) — https://www.rfc-editor.org/rfc/rfc7636
- OAuth 2.1 draft — https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/
- DPoP (RFC 9449) — https://www.rfc-editor.org/rfc/rfc9449
- Mutual TLS client auth (RFC 8705) — https://www.rfc-editor.org/rfc/rfc8705

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026
