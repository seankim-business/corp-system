# Login Redirect Bug Analysis and Fix Plan

## Context

### Original Request
로그인 후 /dashboard로 URL이 잠깐 바뀌었다가 다시 /login으로 리다이렉트되는 문제 분석 및 수정

### Research Findings

#### Authentication Flow Analysis

**정상 흐름:**
1. `LoginPage` -> `/auth/google` 클릭
2. `/auth/google` -> Google OAuth 페이지로 리다이렉트 (PKCE 세션 Redis 저장)
3. Google OAuth 완료 -> `/auth/google/callback` 콜백
4. 콜백에서 세션 쿠키 설정 -> `${BASE_URL}/dashboard`로 리다이렉트
5. `ProtectedRoute`에서 `fetchUser()` -> `GET /auth/me` 호출
6. 사용자 확인 -> 대시보드 렌더링

**문제 증상:**
- URL이 `/dashboard`로 바뀐 후 다시 `/login`으로 리다이렉트됨
- 이는 `ProtectedRoute`에서 `user`가 `null`이라는 의미

#### Root Cause Analysis

코드 분석 결과, 다음 문제점들이 식별됨:

**1. 크로스-서브도메인 쿠키 전송 문제 (PRIMARY SUSPECT)**
```typescript
// auth.routes.ts:119-125
res.cookie("session", result.sessionToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 1 * 60 * 60 * 1000,
  domain: process.env.COOKIE_DOMAIN,  // ".nubabel.com"
});
```

환경 변수에서:
- `BASE_URL="https://auth.nubabel.com"` (인증 서버)
- `COOKIE_DOMAIN=".nubabel.com"` (와일드카드)

문제: 콜백이 `auth.nubabel.com`에서 처리되고 `BASE_URL/dashboard`로 리다이렉트하면
`auth.nubabel.com/dashboard`로 가게 됨. 프론트엔드가 `app.nubabel.com`에서 실행된다면
쿠키가 설정되지 않은 상태로 리다이렉트됨.

**2. hasCheckedAuth 플래그의 경쟁 조건**
```typescript
// authStore.ts:62-65
fetchUser: async () => {
  if (get().hasCheckedAuth) return;  // 이미 체크했으면 스킵
  set({ isLoading: true, hasCheckedAuth: true });
```

문제: `hasCheckedAuth`가 `true`로 설정된 후 API 호출이 실패해도 다시 시도하지 않음.
새로고침 없이는 복구 불가능.

**3. IP/User-Agent 검증 미스매치**
```typescript
// auth.middleware.ts:26 - x-forwarded-for 미사용
const currentIp = req.ip || req.socket.remoteAddress;

// vs auth.routes.ts:14-20 - x-forwarded-for 사용
function extractIpAddress(req: Request): string | undefined {
  const xForwardedFor = req.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress;
}
```

문제: OAuth 콜백 시점과 대시보드 접근 시점의 IP 추출 로직이 다름.
세션 생성 시 `x-forwarded-for`에서 추출한 IP와 검증 시 `req.ip`가 불일치.

**4. FRONTEND_URL vs BASE_URL 혼동 (PRIMARY FIX NEEDED)**
```typescript
// auth.routes.ts:135 - FRONTEND_URL 미사용 (유일하게 수정 필요)
const redirectUrl = `${process.env.BASE_URL}/dashboard`;
return res.redirect(redirectUrl);

// auth.routes.ts:71-72, 93-94 - 이미 수정됨
const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || "https://nubabel.com";
```

## Work Objectives

### Core Objective
로그인 후 대시보드로 성공적으로 리다이렉트되고 인증 상태가 유지되도록 수정

### Deliverables
1. OAuth 콜백 후 올바른 프론트엔드 URL로 리다이렉트 (line 135)
2. IP 추출 로직 통일 (공유 유틸리티)
3. authStore의 경쟁 조건 해결 (force 파라미터)
4. 필요시 디버깅 로그 추가

### Definition of Done
- [ ] 로그인 -> 대시보드 흐름이 정상 동작
- [ ] 새로고침 후에도 로그인 상태 유지
- [ ] 여러 서브도메인에서 쿠키가 공유됨
- [ ] 콘솔에 인증 관련 에러 없음

## Guardrails

### Must Have
- 기존 인증 보안 수준 유지
- 하위 호환성 (기존 세션 무효화 없음)
- 프로덕션과 개발 환경 모두에서 동작

### Must NOT Have
- 보안 취약점 도입 (CSRF, XSS 등)
- 하드코딩된 URL
- 로컬 개발 환경 동작 깨짐

## Task Flow

```
[1. OAuth 리다이렉트 URL 수정 (line 135)]
        |
        v
[2. 검증: 로그인 테스트]
        |
    문제 지속?
   /          \
  No          Yes
   |            |
   v            v
[완료]    [3. IP 추출 유틸리티 통일]
                |
                v
          [4. authStore force 파라미터]
                |
                v
          [5. 디버깅 로그 추가]
```

## Detailed TODOs

### TODO 1: OAuth 리다이렉트 URL 수정 (PRIMARY FIX)
**File:** `src/auth/auth.routes.ts`
**Priority:** HIGH - 첫 번째로 시도

**Changes:**
```typescript
// 변경 전 (line 135)
const redirectUrl = `${process.env.BASE_URL}/dashboard`;

// 변경 후
const redirectUrl = `${process.env.FRONTEND_URL || process.env.BASE_URL}/dashboard`;
```

**Note:** lines 71-72, 93-94는 이미 동일한 패턴이 적용되어 있음.

**Acceptance Criteria:**
- OAuth 콜백 후 올바른 프론트엔드 URL로 리다이렉트
- 로그인 후 `/dashboard`에서 `/login`으로 리다이렉트되지 않음

---

### TODO 2: 검증 - 로그인 플로우 테스트
**Type:** Manual verification

**Test Steps:**
1. 로그인 페이지에서 Google OAuth 시작
2. Google 인증 완료
3. `/dashboard`로 리다이렉트 확인
4. 새로고침 후에도 로그인 상태 유지 확인

**If Fixed:** 완료
**If Still Broken:** TODO 3-5 진행

---

### TODO 3: IP 추출 유틸리티 통일
**File:** `src/utils/ip-extractor.ts` (NEW), `src/auth/auth.routes.ts`, `src/middleware/auth.middleware.ts`
**Priority:** MEDIUM - TODO 2에서 문제 지속 시

**Changes:**
1. 공유 유틸리티 생성:
```typescript
// src/utils/ip-extractor.ts
import { Request } from "express";

export function extractIpAddress(req: Request): string | undefined {
  const xForwardedFor = req.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress;
}
```

2. `auth.routes.ts`에서 import 경로 수정
3. `auth.middleware.ts` line 26 수정:
```typescript
// 변경 전
const currentIp = req.ip || req.socket.remoteAddress;

// 변경 후
import { extractIpAddress } from "../utils/ip-extractor";
// ...
const currentIp = extractIpAddress(req);
```

**Rationale:** 세션 생성 시와 검증 시 동일한 IP 추출 로직 사용

**Acceptance Criteria:**
- IP 미스매치 에러 발생하지 않음
- 프록시/로드밸런서 환경에서 정상 동작

---

### TODO 4: authStore 경쟁 조건 해결
**File:** `frontend/src/stores/authStore.ts`
**Priority:** MEDIUM - TODO 2에서 문제 지속 시

**선택한 옵션:** Option A (force 파라미터)

**Rationale:**
- Option B (에러 시 `hasCheckedAuth: false`)는 쿠키가 진짜 없을 때 무한 재시도 루프 발생 가능
- Option A는 명시적으로 재시도가 필요한 경우에만 `force=true` 전달

**Changes:**
```typescript
// 변경 전 (line 62-65)
fetchUser: async () => {
  if (get().hasCheckedAuth) return;
  set({ isLoading: true, hasCheckedAuth: true });

// 변경 후
fetchUser: async (force = false) => {
  if (get().hasCheckedAuth && !force) return;
  set({ isLoading: true, hasCheckedAuth: true });
```

**Interface 업데이트 (line 49):**
```typescript
// 변경 전
fetchUser: () => Promise<void>;

// 변경 후
fetchUser: (force?: boolean) => Promise<void>;
```

**Acceptance Criteria:**
- `fetchUser(true)`로 강제 새로고침 가능
- 일반 호출 시 기존 동작 유지

---

### TODO 5: 디버깅 로그 추가 (필요시)
**Files:** `src/auth/auth.routes.ts`, `src/middleware/auth.middleware.ts`, `frontend/src/components/ProtectedRoute.tsx`
**Priority:** LOW - 문제 진단이 어려운 경우에만

**Changes (Backend):**
```typescript
// auth.routes.ts - 쿠키 설정 직후
logger.info("Setting session cookie", {
  domain: process.env.COOKIE_DOMAIN,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  redirectTo: redirectUrl,
});

// auth.middleware.ts - 쿠키 수신 여부
logger.debug("Auth middleware: cookie check", {
  hasCookie: !!req.cookies.session,
  hasAuthHeader: !!req.headers.authorization,
});
```

**Changes (Frontend):**
```typescript
// ProtectedRoute.tsx
useEffect(() => {
  console.log("[ProtectedRoute] Auth state:", {
    hasUser: !!user,
    isLoading,
    hasCheckedAuth
  });
  fetchUser();
}, [fetchUser]);
```

**Acceptance Criteria:**
- 전체 인증 흐름을 로그로 추적 가능

---

### TODO 6: Frontend API Client 검증 완료
**File:** `frontend/src/api/client.ts`
**Status:** VERIFIED - 변경 불필요

**Current Code (line 15-21):**
```typescript
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,  // ✓ 크로스 도메인 쿠키 전송 활성화
  headers: {
    "Content-Type": "application/json",
  },
});
```

**Confirmation:** `withCredentials: true` 설정으로 CORS 요청 시 쿠키 포함됨.

---

### TODO 7: 환경 변수 정리 및 문서화
**File:** `.env.example`
**Priority:** LOW

**Changes:**
```env
# Authentication URLs
AUTH_URL="https://auth.nubabel.com"      # 인증 서버 URL (BASE_URL 대체)
FRONTEND_URL="https://app.nubabel.com"   # 프론트엔드 URL (리다이렉트 대상)
COOKIE_DOMAIN=".nubabel.com"             # 쿠키 공유 도메인

# Legacy (deprecated, use AUTH_URL instead)
# BASE_URL="https://auth.nubabel.com"
```

**Acceptance Criteria:**
- .env.example에 모든 필요한 변수 문서화

## Commit Strategy

1. **fix(auth): use FRONTEND_URL for OAuth redirect**
   - TODO 1 완료
   - 단일 라인 수정으로 문제 해결 시도

2. **fix(auth): unify IP extraction logic** (필요시)
   - TODO 3 완료
   - IP 미스매치 문제 해결

3. **fix(auth): add force parameter to fetchUser** (필요시)
   - TODO 4 완료
   - authStore 경쟁 조건 해결

4. **chore(auth): add debug logging** (필요시)
   - TODO 5 완료
   - 진단용 로그 추가

## Success Criteria

### Functional
- [ ] 로그인 버튼 클릭 -> Google OAuth -> 대시보드 표시 (리다이렉트 루프 없음)
- [ ] 대시보드에서 새로고침 -> 로그인 상태 유지
- [ ] 로그아웃 후 /dashboard 접근 -> /login으로 리다이렉트

### Technical
- [ ] 브라우저 개발자 도구 Network 탭에서 `/auth/me` 요청 성공 (200)
- [ ] 브라우저 개발자 도구 Application > Cookies에서 session 쿠키 확인
- [ ] 콘솔에 인증 관련 에러 없음

### Performance
- [ ] 로그인 -> 대시보드 전환 시간 < 3초

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 기존 세션 무효화 | High | 하위 호환성 유지, 점진적 마이그레이션 |
| 보안 취약점 도입 | High | 코드 리뷰, 보안 테스트 |
| 개발 환경 깨짐 | Medium | 로컬 테스트 우선 |

## Investigation Priority (Updated)

**수정된 순서:**
1. **line 135 단일 수정** (TODO 1) -> 가장 가능성 높은 원인
2. **검증** (TODO 2) -> 수정 후 테스트
3. 문제 지속 시:
   - **IP 추출 통일** (TODO 3) -> 프록시 환경 문제
   - **authStore force 파라미터** (TODO 4) -> 경쟁 조건
   - **디버깅 로그** (TODO 5) -> 정확한 실패 지점 파악
