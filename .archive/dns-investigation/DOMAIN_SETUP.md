# 🌐 Kawaii 도메인 설정 가이드

## 도메인: kawaii.{TLD}

GoDaddy에서 새 도메인을 구매하여 Kyndof Corp System 전용으로 사용합니다.

---

## Step 1: GoDaddy 도메인 구매

### 도메인 추천 순위:

1. **kawaii.com** (최고 선호)
2. **kawaii.io** (tech startup 느낌)
3. **kawaii.app** (앱 전용 TLD)
4. **kawaii.co** (간결)
5. **kawaii.cloud** (클라우드 서비스)

### 구매 절차:

1. https://www.godaddy.com 접속
2. 검색: `kawaii`
3. 사용 가능한 TLD 확인
4. 구매 (1년 $10-30 예상)
5. **Privacy Protection** 추가 권장 ($10/년)

---

## Step 2: 도메인 구조 계획

### 메인 도메인: `kawaii.{TLD}`

```
kawaii.com              → 메인 랜딩 페이지 (향후)
auth.kawaii.com         → 인증 API 엔드포인트
*.kawaii.com            → 테넌트 서브도메인 (와일드카드)

예시:
- kyndof.kawaii.com     → Kyndof 조직
- clientco.kawaii.com   → ClientCo 조직
- demo.kawaii.com       → 데모 조직
```

### DNS 레코드 구조:

| Type  | Name | Value                    | 용도               |
|-------|------|--------------------------|--------------------|
| A     | @    | Railway IP (향후)         | kawaii.com         |
| CNAME | auth | Railway domain           | auth.kawaii.com    |
| CNAME | *    | Railway domain           | *.kawaii.com       |

---

## Step 3: GoDaddy DNS 설정

### 3-1. GoDaddy DNS 관리 접속

1. GoDaddy 로그인
2. **My Products** → 도메인 선택
3. **DNS** → **Manage DNS** 클릭

### 3-2. Railway 배포 후 돌아올 곳

Railway 배포가 완료되면:
1. Railway에서 제공하는 CNAME 값 복사
2. GoDaddy DNS에 추가:

```
Type: CNAME
Name: auth
Value: {railway-provided-value}
TTL: 600
```

```
Type: CNAME
Name: *
Value: {railway-provided-value}
TTL: 600
```

---

## Step 4: 코드 업데이트 (도메인 구매 후)

### 4-1. 환경 변수 업데이트

`.env.example` 및 Railway Variables:

```env
# Application
BASE_URL=https://auth.kawaii.com
BASE_DOMAIN=kawaii.com
COOKIE_DOMAIN=.kawaii.com

# Google OAuth
GOOGLE_REDIRECT_URI=https://auth.kawaii.com/auth/google/callback

# Railway에서 자동 설정되는 값
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
```

### 4-2. Nginx 설정 업데이트

`nginx.conf`:
```nginx
server_name ~^(?<subdomain>.+)\.kawaii\.com$ auth.kawaii.com *.kawaii.com;
```

### 4-3. Prisma Seed 데이터 업데이트

`prisma/migrations/001_initial_schema.sql`:
```sql
INSERT INTO organizations (id, name, slug, domain, ...)
VALUES (
  gen_random_uuid(),
  'Kyndof',
  'kyndof',
  'kawaii.com',  -- 업데이트
  ...
);
```

---

## Step 5: Railway 배포 설정

### 5-1. Railway Custom Domain 추가

1. Railway 대시보드 → **Settings** → **Domains**
2. **Custom Domain** 클릭
3. 입력: `auth.kawaii.com`
4. Railway가 CNAME 값 제공 (예: `xyz.railway.app`)

### 5-2. GoDaddy DNS에 추가

GoDaddy DNS:
```
Type: CNAME
Name: auth
Value: xyz.railway.app (Railway에서 제공한 값)
TTL: 600
```

### 5-3. 와일드카드 서브도메인 추가

GoDaddy DNS:
```
Type: CNAME
Name: *
Value: xyz.railway.app (동일한 값)
TTL: 600
```

### 5-4. DNS 전파 확인 (5-30분)

```bash
# auth.kawaii.com 확인
dig auth.kawaii.com

# 와일드카드 확인
dig kyndof.kawaii.com
dig clientco.kawaii.com
```

모두 Railway IP를 가리켜야 함.

### 5-5. SSL 인증서 자동 발급

Railway가 Let's Encrypt SSL 자동 발급 (5-10분)

Railway Settings → Domains에서:
- ✅ `auth.kawaii.com` - SSL Active

---

## Step 6: Google OAuth 업데이트

### Google Cloud Console 설정

1. https://console.cloud.google.com/apis/credentials
2. OAuth 2.0 Client ID 편집
3. **Authorized redirect URIs** 업데이트:

```
https://auth.kawaii.com/auth/google/callback
https://*.kawaii.com/auth/google/callback
```

4. **Save**

---

## Step 7: 최종 테스트

### 7-1. Health Check

```bash
curl https://auth.kawaii.com/health
# {"status":"ok","timestamp":"..."}

curl https://auth.kawaii.com/health/db
# {"status":"ok","service":"database"}

curl https://auth.kawaii.com/health/redis
# {"status":"ok","service":"redis"}
```

### 7-2. Google OAuth Flow

```bash
# 브라우저에서
open https://auth.kawaii.com/auth/google
```

1. Google 로그인 페이지 리다이렉트 ✅
2. 권한 승인 ✅
3. `auth.kawaii.com`으로 콜백 ✅
4. JWT 쿠키 설정됨 ✅

### 7-3. 멀티테넌트 테스트

```bash
# Kyndof 조직
curl https://kyndof.kawaii.com/auth/me

# 다른 조직
curl https://clientco.kawaii.com/auth/me
```

각 서브도메인에서 다른 조직 데이터 반환되어야 함.

---

## 도메인별 예상 비용

| TLD        | 1년 비용 (GoDaddy) | 갱신 비용 |
|------------|--------------------|-----------|
| .com       | $20-30            | $20-30    |
| .io        | $40-60            | $40-60    |
| .app       | $15-25            | $15-25    |
| .co        | $30-40            | $30-40    |
| .cloud     | $10-20            | $20-30    |

**추천**: `.com` (가장 신뢰성 높음) 또는 `.app` (저렴하고 tech 느낌)

---

## 빠른 체크리스트

### 도메인 구매 후:
- [ ] GoDaddy에서 kawaii.{TLD} 구매
- [ ] Railway 배포 완료
- [ ] Railway Custom Domain 추가 (`auth.kawaii.com`)
- [ ] GoDaddy DNS에 CNAME 레코드 추가 (auth, *)
- [ ] DNS 전파 확인 (`dig auth.kawaii.com`)
- [ ] Railway SSL 인증서 발급 확인
- [ ] 코드에서 도메인 업데이트 (환경 변수, nginx.conf)
- [ ] Google OAuth Redirect URI 업데이트
- [ ] Health check 테스트
- [ ] Google OAuth 플로우 테스트
- [ ] 멀티테넌트 서브도메인 테스트

---

## Railway 빌드 문제 해결

현재 Railway가 `plan/` 디렉토리를 보고 있는 문제:

### 해결 방법:

1. **Railway 대시보드** → **Settings** → **Build & Deploy**
2. **Root Directory** 확인 → 비어있어야 함 (또는 `/`)
3. **Watch Paths** 확인 → 비어있거나 `**/*`

또는:

**nixpacks.toml 추가** (Railway 빌드 설정 명시):

```toml
[phases.setup]
nixPkgs = ["nodejs-20_x"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npm run build"]

[start]
cmd = "node dist/index.js"
```

하지만 Dockerfile이 이미 있으므로:

**railway.toml 추가** (Dockerfile 강제):

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
numReplicas = 1
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

---

## 다음 단계

1. **지금**: GoDaddy에서 kawaii.{TLD} 도메인 구매
2. **구매 후**: 여기로 돌아와서 도메인 알려주세요
3. **즉시 진행**: 
   - 코드 업데이트 (도메인 변경)
   - Railway 빌드 문제 해결
   - Git push
   - Railway 배포
   - DNS 설정
   - 테스트

---

**도메인 구매하고 알려주시면 바로 배포 진행하겠습니다!** 🚀
