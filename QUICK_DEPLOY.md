# 🚀 Nubabel System - 빠른 배포 가이드

## 현재 상태: 배포 준비 완료 ✅

모든 코드가 완성되었고 GitHub에 푸시되어 있습니다.

**도메인**: `auth.nubabel.com` (메인), `*.nubabel.com` (테넌트)  
**GitHub**: `https://github.com/seankim-business/corp-system`

---

## Step 1: GitHub 저장소 확인 ✅

저장소가 이미 생성되어 있습니다:
- **Repository**: `https://github.com/seankim-business/corp-system`
- **Branch**: `main`
- **Status**: 최신 코드 푸시 완료

확인:
```bash
cd /Users/sean/Documents/Kyndof/tools/kyndof-corp-system
git remote -v
# origin  https://github.com/seankim-business/corp-system.git (fetch)
# origin  https://github.com/seankim-business/corp-system.git (push)
```

---

## Step 2: Railway 배포 (10분)

### 2-1. Railway 프로젝트 생성

1. https://railway.app/new 접속
2. **"Deploy from GitHub repo"** 클릭
3. GitHub 계정 인증 (Railway 앱 설치 허용)
4. 저장소 선택: `seankim-business/corp-system`
5. **"Deploy Now"** 클릭

Railway가 자동으로:
- Dockerfile 감지
- Docker 이미지 빌드
- 컨테이너 배포
- Public URL 할당

### 2-2. PostgreSQL 추가

1. Railway 대시보드에서
2. **"New"** → **"Database"** → **"PostgreSQL"** 클릭
3. 자동으로 `DATABASE_URL` 환경변수 설정됨
4. PostgreSQL이 "Running" 상태될 때까지 대기 (30초)

### 2-3. Redis 추가

1. **"New"** → **"Database"** → **"Redis"** 클릭
2. 자동으로 `REDIS_URL` 환경변수 설정됨
3. Redis가 "Running" 상태될 때까지 대기 (30초)

---

## Step 3: 환경 변수 설정 (5분)

### 3-1. JWT Secret 생성

로컬 터미널에서:
```bash
openssl rand -base64 32
```

출력 예시: `T8xK9fG2mP5nQ3rJ7vW1cZ4dE6hL0sA8bN5mK2gF9tU=`

이 값을 복사해두세요.

### 3-2. Railway에서 환경변수 설정

1. Railway 대시보드에서 **app service** (PostgreSQL/Redis 아님) 클릭
2. **"Variables"** 탭 클릭
3. **"RAW Editor"** 클릭 (또는 하나씩 추가)
4. 아래 내용 붙여넣기:

```env
NODE_ENV=production
PORT=3000

# Google OAuth - Part 4에서 업데이트할 예정
GOOGLE_CLIENT_ID=PLACEHOLDER_UPDATE_IN_PART4
GOOGLE_CLIENT_SECRET=PLACEHOLDER_UPDATE_IN_PART4
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback

# JWT - 위에서 생성한 값 붙여넣기
JWT_SECRET=YOUR_GENERATED_SECRET_HERE
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Application - 커스텀 도메인 사용
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com

# Logging
LOG_LEVEL=info
```

5. **"Save"** 클릭
6. Railway가 자동으로 재배포 시작

### 3-3. Railway URL 확인

1. **"Settings"** 탭 → **"Domains"** 섹션
2. Railway가 자동 할당한 URL 확인 (예: `kyndof-corp-production.up.railway.app`)
3. 이 URL을 복사

### 3-4. 환경변수 확인

Step 3-2에서 이미 커스텀 도메인으로 설정했으므로 별도 업데이트 불필요:
```env
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com
```

이미 올바르게 설정되어 있습니다 ✅

---

## Step 4: 배포 확인 (2분)

### 4-1. 빌드 로그 확인

1. **"Deployments"** 탭 클릭
2. 최신 배포 클릭
3. **"View Logs"** 클릭
4. 빌드 성공 확인:
   ```
   ✓ Building Docker image...
   ✓ Running migrations...
   ✓ Server listening on port 3000
   ```

### 4-2. Health Check 테스트

터미널에서:
```bash
# 기본 health check
curl https://auth.nubabel.com/health

# 응답 예시:
# {"status":"ok","timestamp":"2026-01-25T..."}

# 데이터베이스 health check
curl https://auth.nubabel.com/health/db

# Redis health check
curl https://auth.nubabel.com/health/redis
```

모두 `{"status":"ok"...}` 응답이 나오면 성공! ✅

---

## Step 5: Google OAuth 설정 (10분)

### 5-1. Google Cloud Console 설정

1. https://console.cloud.google.com/apis/credentials 접속
2. 프로젝트 선택 (또는 새로 생성)
3. **"CREATE CREDENTIALS"** → **"OAuth 2.0 Client ID"** 클릭

### 5-2. OAuth 동의 화면 설정 (처음만)

1. **"CONFIGURE CONSENT SCREEN"** 클릭
2. **User Type**: Internal (Google Workspace용) 또는 External
3. **App name**: Nubabel Authentication System
4. **User support email**: 본인 이메일
5. **Developer contact**: 본인 이메일
6. **Save and Continue**

### 5-3. OAuth Client ID 생성

1. **Application type**: Web application
2. **Name**: Nubabel Production Auth
3. **Authorized JavaScript origins**:
   ```
   https://auth.nubabel.com
   ```
4. **Authorized redirect URIs**:
   ```
   https://auth.nubabel.com/auth/google/callback
   ```
5. **CREATE** 클릭
6. **Client ID**와 **Client Secret** 복사

### 5-4. Railway에 OAuth 정보 업데이트

Railway **"Variables"** 탭에서:
```env
GOOGLE_CLIENT_ID=복사한-클라이언트-ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=복사한-클라이언트-Secret
```

저장하면 자동 재배포.

---

## Step 6: OAuth 테스트 (2분)

### 6-1. 로그인 플로우 테스트

브라우저에서:
```
https://auth.nubabel.com/auth/google
```

1. Google 로그인 페이지로 리다이렉트 ✅
2. Google 계정으로 로그인
3. 권한 승인
4. auth.nubabel.com으로 다시 리다이렉트 (JWT 쿠키 설정됨)

### 6-2. 로그인 확인

브라우저 개발자도구 (F12) → **Application** → **Cookies**:
- `jwt` 쿠키가 설정되어 있어야 함
- `HttpOnly`, `Secure` 플래그 확인

### 6-3. 현재 사용자 정보 확인

브라우저 주소창:
```
https://auth.nubabel.com/auth/me
```

응답 예시:
```json
{
  "id": "...",
  "email": "user@nubabel.com",
  "name": "사용자 이름",
  "currentOrganization": {
    "id": "...",
    "name": "Nubabel",
    "domain": "nubabel.com"
  }
}
```

**성공!** 🎉

---

## Step 7: 커스텀 도메인 설정 - auth.nubabel.com (15분)

### 7-1. Railway에 커스텀 도메인 추가

1. Railway 대시보드 → **app service** → **"Settings"** 탭
2. **"Domains"** 섹션 → **"Custom Domain"** 클릭
3. 입력: `auth.nubabel.com`
4. **"Add Domain"** 클릭
5. Railway가 CNAME 레코드 값 제공 (예: `your-app.up.railway.app`)

**이 CNAME 값을 복사하세요** - GoDaddy 설정에 필요합니다.

### 7-2. GoDaddy DNS 설정

1. https://godaddy.com 로그인
2. **My Products** → `nubabel.com` 찾기 → **DNS** 클릭
3. **Add New Record** 클릭:

**Record 1: Auth 서브도메인**
```
Type: CNAME
Name: auth
Value: <Railway에서 복사한 CNAME 값>
TTL: 600 seconds
```

4. **Save** 클릭

5. **Add New Record** 다시 클릭:

**Record 2: 와일드카드 서브도메인 (멀티테넌시용)**
```
Type: CNAME
Name: *
Value: <Railway에서 복사한 CNAME 값 (동일)>
TTL: 600 seconds
```

6. **Save** 클릭

**DNS 전파 대기**: 5-30분 (최대 48시간이지만 보통 10분 이내)

확인:
```bash
dig auth.nubabel.com
# CNAME 레코드가 Railway를 가리키는지 확인
```

### 7-3. Railway 환경변수 확인

Step 3에서 이미 설정했으므로 확인만:
```env
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback
```

이미 올바르게 설정됨 ✅

### 7-4. Google OAuth Redirect URI 확인

Google Cloud Console에서 Step 5-3에서 이미 설정했으므로 확인만:

**Authorized redirect URIs**:
```
https://auth.nubabel.com/auth/google/callback
```

이미 올바르게 설정됨 ✅

### 7-5. SSL 인증서 자동 발급 대기

Railway가 자동으로 Let's Encrypt SSL 인증서 발급 (2-5분)

**"Settings"** → **"Domains"** 섹션에서:
- `auth.nubabel.com` 옆에 녹색 체크마크 ✅
- "SSL: Active"

### 7-6. 커스텀 도메인 테스트

```bash
# Health check
curl https://auth.nubabel.com/health
# 응답: {"status":"ok",...}

# OAuth flow
open https://auth.nubabel.com/auth/google
```

**성공!** 이제 `auth.nubabel.com`으로 접속 가능합니다.

---

## Step 8: 데이터베이스 초기화 (5분)

### 8-1. Prisma Studio 열기 (Railway CLI 사용)

로컬 터미널:
```bash
cd /Users/sean/Documents/Kyndof/tools/kyndof-corp-system

# Railway CLI로 프로젝트 연결
railway link

# Prisma Studio 실행
railway run npx prisma studio
```

브라우저가 자동으로 열림 (http://localhost:5555)

### 8-2. 초기 조직 확인

**organizations** 테이블 확인:
- Nubabel 조직이 시드 데이터로 있는지 확인
- `domain: nubabel.com`
- `slug: nubabel`

없으면 Railway PostgreSQL Query 탭에서 수동 생성:
```sql
INSERT INTO organizations (id, name, slug, domain, created_at, updated_at)
VALUES (gen_random_uuid(), 'Nubabel', 'nubabel', 'nubabel.com', NOW(), NOW());
```

### 8-3. 첫 사용자 로그인

1. `https://auth.nubabel.com/auth/google` 접속
2. Google 계정으로 로그인 (@nubabel.com 이메일 권장, 없으면 아무 Google 계정)
3. 자동으로 `users`, `memberships` 테이블에 생성됨

Prisma Studio에서 확인:
- **users** 테이블: 새 사용자 추가됨
- **memberships** 테이블: 조직-사용자 연결 생성됨

---

## Step 9: 멀티테넌트 테스트 (Optional)

### 9-1. 두 번째 조직 생성

Prisma Studio에서:
```sql
INSERT INTO organizations (id, name, slug, domain, created_at, updated_at)
VALUES (gen_random_uuid(), 'ClientCo', 'clientco', 'clientco.com', NOW(), NOW());
```

### 9-2. 서브도메인 접속 테스트

**Nubabel 조직**:
```
https://nubabel.nubabel.com/auth/me
```

**ClientCo 조직**:
```
https://clientco.nubabel.com/auth/me
```

각 서브도메인에서 `currentOrganization`이 다르게 표시되어야 함.

### 9-3. 조직 전환 테스트

```bash
curl -X POST https://auth.nubabel.com/auth/switch-org \
  -H "Content-Type: application/json" \
  -d '{"organizationId":"<clientco-org-id>"}' \
  --cookie "jwt=<your-jwt-token>"
```

새 JWT 발급 → `clientco` 조직으로 전환됨.

---

## 완료! 🎉

### 배포된 구성:

✅ **Backend API**: `https://auth.nubabel.com`
✅ **Database**: Railway PostgreSQL (자동 백업)
✅ **Cache**: Railway Redis
✅ **SSL**: Let's Encrypt (자동 갱신)
✅ **Google OAuth**: 설정 완료
✅ **Multi-tenant**: 서브도메인 라우팅 (`*.nubabel.com`)

### 접속 URL:

- **Health Check**: https://auth.nubabel.com/health
- **Google Login**: https://auth.nubabel.com/auth/google
- **Current User**: https://auth.nubabel.com/auth/me
- **Nubabel Tenant**: https://nubabel.nubabel.com
- **Other Tenants**: https://{tenant}.nubabel.com

---

## 다음 단계

### 1. 프론트엔드 구현
- `frontend/` 디렉토리에 React 컴포넌트 구현
- `frontend/FRONTEND_README.md` 참고
- Login, Dashboard, Organization Switcher 컴포넌트 생성

### 2. 모니터링 설정
- Sentry 에러 트래킹 추가 (선택)
- UptimeRobot uptime 모니터링 (무료)
- Railway 메트릭스 확인 (대시보드)

### 3. 사용자 초대
- Prisma Studio에서 사용자 수동 추가
- 이메일 초대 시스템 구현 (향후)

### 4. 백업 자동화
```bash
# Railway에서 자동 일일 백업 (7일 보관)
# 수동 백업:
railway run pg_dump $DATABASE_URL > backup.sql
```

---

## 문제 해결

### Railway 빌드 실패
```bash
# 로그 확인
railway logs

# 흔한 원인:
# - Dockerfile 오류 → 로컬에서 docker build 테스트
# - 환경변수 누락 → Variables 탭 확인
```

### OAuth 리다이렉트 오류
```
redirect_uri_mismatch
```
→ Google Console에서 Redirect URI 정확히 확인

### Database 연결 오류
```bash
# DATABASE_URL 확인
railway variables

# PostgreSQL 재시작
railway restart (PostgreSQL 서비스에서)
```

### SSL 인증서 발급 안됨
- DNS 전파 완료 확인 (dig auth.nubabel.com)
- GoDaddy에서 CNAME 레코드 올바른지 재확인
- 5-10분 대기 후 재시도
- Railway에서 도메인 제거 후 다시 추가

---

## 비용

**Railway Starter Plan**: $5/month
- 512MB RAM, 1 vCPU
- PostgreSQL 1GB 포함
- Redis 포함
- SSL 인증서 무료
- 월 500시간 (충분)

**Trial**: $5 무료 크레딧 (1-2개월 사용 가능)

---

## 지원

- **Railway 문서**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **프로젝트 Issues**: GitHub Issues

---

**배포 시작하세요! 총 소요 시간: 약 40분** 🚀
