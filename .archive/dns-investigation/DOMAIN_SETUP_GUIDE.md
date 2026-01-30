# 도메인 설정 가이드 (nubabel.com + app.nubabel.com)

Railway + Cloudflare 환경에서 nubabel.com과 app.nubabel.com을 설정하는 가이드입니다.

---

## 📋 목표

- `nubabel.com` → Landing Page (정적 HTML)
- `app.nubabel.com` → Web App (React + Express API)

---

## 🏗️ 아키텍처

```
Cloudflare DNS
    ↓
Railway Services
    ├── Service #1: Landing Page (landing/)
    │   └── Domain: nubabel.com
    └── Service #2: Main App (백엔드 + 프론트엔드)
        └── Domain: app.nubabel.com
```

---

## 1단계: Railway 프로젝트 설정

### 1-1. Landing Page 서비스 생성

1. **Railway 대시보드** 접속: https://railway.app
2. **프로젝트 선택** (기존 프로젝트)
3. **New Service** 클릭
4. **GitHub Repository 연결**
5. **설정**:
   - **Service Name**: `nubabel-landing`
   - **Root Directory**: `landing/`
   - **Build Command**: (자동 - Dockerfile 사용)
   - **Start Command**: `nginx -g 'daemon off;'`

### 1-2. Main App 서비스 설정

기존 서비스를 사용하거나 새로 생성:

1. **Service Name**: `nubabel-app`
2. **Root Directory**: `/` (프로젝트 루트)
3. **Build Command**: (자동 - Dockerfile 사용)
4. **Start Command**: `node dist/index.js`

**중요**: 최신 Dockerfile이 프론트엔드도 함께 빌드합니다 (이미 수정 완료 ✅)

---

## 2단계: Railway에서 Custom Domain 추가

### Service #1: Landing Page (nubabel.com)

1. **Railway 대시보드** → `nubabel-landing` 서비스 선택
2. **Settings** → **Domains** → **Custom Domain** 클릭
3. **도메인 입력**: `nubabel.com`
4. **CNAME 레코드 정보 복사** (다음 형식):
   ```
   CNAME 레코드
   Name: @
   Target: your-service-name.up.railway.app
   ```

### Service #2: Main App (app.nubabel.com)

1. **Railway 대시보드** → `nubabel-app` 서비스 선택
2. **Settings** → **Domains** → **Custom Domain** 클릭
3. **도메인 입력**: `app.nubabel.com`
4. **CNAME 레코드 정보 복사**:
   ```
   CNAME 레코드
   Name: app
   Target: your-app-service.up.railway.app
   ```

**참고**: Railway는 다음 2가지 DNS 설정 방법을 제공합니다:

- **CNAME 레코드** (권장)
- **A 레코드** (IP 주소)

Cloudflare를 사용 중이므로 **CNAME 레코드**를 추천합니다.

---

## 3단계: Cloudflare DNS 설정

### 3-1. Cloudflare 대시보드 접속

1. https://dash.cloudflare.com 접속
2. **nubabel.com** 도메인 선택
3. 좌측 메뉴에서 **DNS** → **Records** 클릭

### 3-2. DNS 레코드 추가

#### ① nubabel.com (Landing Page)

**CNAME 레코드 추가**:

| Type  | Name | Target                                | Proxy status | TTL  |
| ----- | ---- | ------------------------------------- | ------------ | ---- |
| CNAME | @    | `your-landing-service.up.railway.app` | 🔶 Proxied   | Auto |

**또는 A 레코드 (Railway가 IP를 제공한 경우)**:

| Type | Name | IPv4 address | Proxy status | TTL  |
| ---- | ---- | ------------ | ------------ | ---- |
| A    | @    | `Railway IP` | 🔶 Proxied   | Auto |

#### ② app.nubabel.com (Main App)

**CNAME 레코드 추가**:

| Type  | Name | Target                            | Proxy status | TTL  |
| ----- | ---- | --------------------------------- | ------------ | ---- |
| CNAME | app  | `your-app-service.up.railway.app` | 🔶 Proxied   | Auto |

**또는 A 레코드**:

| Type | Name | IPv4 address | Proxy status | TTL  |
| ---- | ---- | ------------ | ------------ | ---- |
| A    | app  | `Railway IP` | 🔶 Proxied   | Auto |

### 3-3. Proxy Status 설정

Cloudflare의 **Proxy status**를 **🔶 Proxied** (주황색 구름)로 설정하면:

- ✅ Cloudflare CDN 활성화
- ✅ DDoS 보호
- ✅ 무료 SSL 인증서
- ✅ 캐싱 및 성능 최적화

**DNS Only** (회색 구름)로 설정하면:

- Railway의 SSL 인증서 사용
- Cloudflare CDN 비활성화

**권장**: **Proxied** 사용 (CDN + 보안)

---

## 4단계: SSL/TLS 설정 (Cloudflare)

### 4-1. Cloudflare SSL/TLS 모드 설정

1. Cloudflare 대시보드 → **nubabel.com** 선택
2. 좌측 메뉴 → **SSL/TLS** 클릭
3. **Encryption mode** 선택:

**권장**: **Full (strict)**

| 모드              | 설명                                         | Railway 호환 |
| ----------------- | -------------------------------------------- | ------------ |
| Off               | SSL 비활성화 (비권장)                        | ❌           |
| Flexible          | Cloudflare ↔ 사용자만 SSL                    | ❌           |
| Full              | Cloudflare ↔ Railway도 SSL (자체 서명 허용)  | ✅           |
| **Full (strict)** | Cloudflare ↔ Railway도 SSL (유효한 인증서만) | ✅ 권장      |

**Full (strict)** 선택 이유:

- Railway는 자동으로 Let's Encrypt SSL 인증서 발급
- End-to-end 암호화 보장

### 4-2. Always Use HTTPS 활성화

1. **SSL/TLS** → **Edge Certificates**
2. **Always Use HTTPS**: **ON** 설정
3. 모든 HTTP 요청이 HTTPS로 자동 리다이렉트됩니다

---

## 5단계: Railway 환경변수 설정

### Main App 서비스 환경변수

Railway 대시보드 → `nubabel-app` → **Variables** → 다음 추가:

```bash
# Node 환경
NODE_ENV=production

# 도메인 설정
BASE_URL=https://app.nubabel.com

# 데이터베이스
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Google OAuth (이미 설정되어 있을 것)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://app.nubabel.com/auth/google/callback

# JWT Secret
JWT_SECRET=...
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=https://app.nubabel.com

# (Optional) Slack Bot
SLACK_BOT_TOKEN=...
SLACK_APP_TOKEN=...
SLACK_SIGNING_SECRET=...
```

**중요**: `BASE_URL`과 `GOOGLE_REDIRECT_URI`를 `app.nubabel.com`으로 변경해야 합니다.

### Landing Page 서비스

별도 환경변수 불필요 (정적 HTML만 서빙)

---

## 6단계: 배포 및 검증

### 6-1. 코드 배포

```bash
# 변경사항 커밋
git add .
git commit -m "Add multi-stage frontend build to Dockerfile"
git push origin main
```

Railway가 자동으로 배포를 시작합니다.

### 6-2. DNS 전파 확인 (5-10분 소요)

```bash
# nubabel.com DNS 확인
dig nubabel.com

# app.nubabel.com DNS 확인
dig app.nubabel.com

# 또는 nslookup
nslookup nubabel.com
nslookup app.nubabel.com
```

**예상 결과**:

```
nubabel.com.        300     IN      CNAME   your-landing.up.railway.app.
app.nubabel.com.    300     IN      CNAME   your-app.up.railway.app.
```

### 6-3. 브라우저 테스트

1. **Landing Page**: https://nubabel.com
   - Nginx가 `landing/index.html` 서빙
   - 정적 HTML 페이지 확인

2. **Main App**: https://app.nubabel.com
   - React 앱 로딩 확인
   - Google OAuth 로그인 테스트
   - `/api/health` 엔드포인트 확인

### 6-4. SSL 인증서 확인

브라우저 주소창의 **🔒 자물쇠 아이콘** 클릭:

- **Cloudflare 인증서** 확인 (Cloudflare CDN 사용 시)
- **유효 기간** 확인

---

## 7단계: Google OAuth Redirect URI 업데이트

Google Cloud Console에서 Redirect URI 업데이트 필요:

1. **Google Cloud Console** 접속: https://console.cloud.google.com
2. **APIs & Services** → **Credentials**
3. **OAuth 2.0 Client ID** 선택
4. **Authorized redirect URIs** 섹션에 추가:
   ```
   https://app.nubabel.com/auth/google/callback
   ```
5. **Save** 클릭

**기존 URI는 유지**하고 새로운 URI를 추가하세요 (로컬/스테이징 환경 사용 가능).

---

## 🔍 트러블슈팅

### 문제 1: DNS가 전파되지 않음 (24-48시간 소요)

**해결책**:

```bash
# DNS 캐시 초기화 (macOS)
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Windows
ipconfig /flushdns

# Linux
sudo systemd-resolve --flush-caches
```

### 문제 2: "Too many redirects" 오류

**원인**: Cloudflare SSL 모드가 Flexible일 때 발생

**해결책**:

1. Cloudflare → **SSL/TLS** → **Full (strict)** 선택
2. Railway에서 HTTPS 활성화 확인

### 문제 3: app.nubabel.com에서 404 Not Found

**원인**: Express 서버에서 SPA fallback이 동작하지 않음

**해결책**:

```bash
# Railway 로그 확인
railway logs

# src/index.ts의 386-399라인 확인 (이미 수정 완료 ✅)
```

### 문제 4: CORS 오류

**원인**: `BASE_URL`과 `CORS_ORIGIN`이 올바르지 않음

**해결책**:
Railway 환경변수 확인:

```bash
BASE_URL=https://app.nubabel.com
CORS_ORIGIN=https://app.nubabel.com
```

### 문제 5: Google OAuth 실패

**원인**: Redirect URI가 업데이트되지 않음

**해결책**:

1. Google Cloud Console에서 Redirect URI 추가
2. Railway 환경변수 `GOOGLE_REDIRECT_URI` 업데이트

---

## 📊 배포 완료 체크리스트

### Railway 설정

- [ ] Landing Page 서비스 생성 (`landing/`)
- [ ] Main App 서비스 설정 (프로젝트 루트)
- [ ] Custom Domain 추가 (`nubabel.com`, `app.nubabel.com`)
- [ ] 환경변수 설정 (`BASE_URL`, `GOOGLE_REDIRECT_URI`)

### Cloudflare DNS

- [ ] `nubabel.com` CNAME/A 레코드 추가
- [ ] `app.nubabel.com` CNAME/A 레코드 추가
- [ ] Proxy status: Proxied (🔶)
- [ ] SSL/TLS: Full (strict)
- [ ] Always Use HTTPS: ON

### Google OAuth

- [ ] Redirect URI 추가 (`https://app.nubabel.com/auth/google/callback`)

### 검증

- [ ] DNS 전파 확인 (`dig`, `nslookup`)
- [ ] Landing Page 접속 테스트 (https://nubabel.com)
- [ ] Main App 접속 테스트 (https://app.nubabel.com)
- [ ] Google OAuth 로그인 테스트
- [ ] API 엔드포인트 테스트 (`/api/health`)

---

## 📝 참고 자료

- **Railway Docs**: https://docs.railway.app/guides/public-networking#custom-domains
- **Cloudflare DNS**: https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
- **Cloudflare SSL**: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/

---

## 🚀 다음 단계

배포 완료 후:

1. **모니터링 설정**: Railway 로그, Sentry, OpenTelemetry
2. **성능 최적화**: Cloudflare CDN 캐싱 규칙 설정
3. **백업 설정**: PostgreSQL 자동 백업
4. **CI/CD 파이프라인**: GitHub Actions + Railway

---

**작성일**: 2026-01-26
**작성자**: Nubabel Engineering
**버전**: 1.0.0
