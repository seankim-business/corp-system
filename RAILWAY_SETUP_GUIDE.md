# Railway 배포 설정 가이드 (Nubabel Production)

**작성일**: 2026-01-26  
**상태**: 🚀 배포 준비 완료  
**예상 시간**: 40-50분

---

## 📋 개요

이 가이드는 Nubabel 프로젝트를 Railway에 배포하기 위한 단계별 지침입니다.

### 배포 구성

```
┌─────────────────────────────────────────┐
│     Railway Project: nubabel-prod       │
├─────────────────────────────────────────┤
│ ✅ PostgreSQL Database                  │
│ ✅ Redis Cache                          │
│ ✅ Node.js Application (Docker)         │
│ ✅ Environment Variables                │
│ ✅ Health Checks                        │
└─────────────────────────────────────────┘
```

---

## 🔑 필수 정보

### 생성된 시크릿

```
JWT_SECRET: 57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
```

### 필요한 정보 (사용자 제공)

- [ ] `GOOGLE_CLIENT_ID` - Google OAuth 클라이언트 ID
- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth 클라이언트 시크릿
- [ ] `ANTHROPIC_API_KEY` - Anthropic API 키 (선택사항)
- [ ] `SLACK_BOT_TOKEN` - Slack Bot 토큰 (선택사항)
- [ ] `SLACK_APP_TOKEN` - Slack App 토큰 (선택사항)
- [ ] `SLACK_SIGNING_SECRET` - Slack 서명 시크릿 (선택사항)

---

## 🚀 STEP 1: Railway 프로젝트 생성

### 1.1 Railway 접속

1. https://railway.app 방문
2. GitHub 계정으로 로그인 (또는 이메일 가입)
3. 대시보드에서 **"New Project"** 클릭

### 1.2 프로젝트 생성 방법 선택

**옵션 A: GitHub 저장소 연결 (권장)**

```
1. "New Project" → "Deploy from GitHub"
2. GitHub 저장소 선택: seankim-business/corp-system
3. 자동으로 Dockerfile 감지
4. 배포 시작
```

**옵션 B: Empty Project 생성**

```
1. "New Project" → "Empty Project"
2. 프로젝트 이름: "nubabel-production"
3. 나중에 GitHub 연결
```

### 1.3 프로젝트 이름 설정

```
프로젝트 이름: nubabel-production
```

**스크린샷**: 프로젝트 생성 완료 후 대시보드 URL 기록

---

## 🗄️ STEP 2: PostgreSQL 데이터베이스 추가

### 2.1 데이터베이스 추가

1. Railway 프로젝트 대시보드 열기
2. **"New"** 버튼 클릭
3. **"Database"** → **"PostgreSQL"** 선택
4. 자동으로 생성됨

### 2.2 연결 정보 확인

생성 후 다음 정보가 자동으로 설정됩니다:

```
환경변수: DATABASE_URL
형식: postgresql://user:password@host:port/database
```

**확인 방법**:

1. PostgreSQL 서비스 클릭
2. **"Variables"** 탭 열기
3. `DATABASE_URL` 복사 (마스킹됨)

**기록**:

```
DATABASE_URL: postgresql://[MASKED]
상태: ✅ 자동 생성됨
```

---

## 🔴 STEP 3: Redis 캐시 추가

### 3.1 Redis 추가

1. Railway 프로젝트 대시보드
2. **"New"** 버튼 클릭
3. **"Database"** → **"Redis"** 선택
4. 자동으로 생성됨

### 3.2 연결 정보 확인

생성 후 다음 정보가 자동으로 설정됩니다:

```
환경변수: REDIS_URL
형식: redis://default:password@host:port
```

**확인 방법**:

1. Redis 서비스 클릭
2. **"Variables"** 탭 열기
3. `REDIS_URL` 복사 (마스킹됨)

**기록**:

```
REDIS_URL: redis://[MASKED]
상태: ✅ 자동 생성됨
```

---

## ⚙️ STEP 4: 환경변수 설정

### 4.1 Node.js 애플리케이션 서비스 추가

1. Railway 프로젝트 대시보드
2. **"New"** 버튼 클릭
3. **"Service"** → **"GitHub Repo"** 선택 (또는 Docker 이미지)
4. 저장소 선택: `seankim-business/corp-system`

### 4.2 환경변수 설정

Node.js 서비스의 **"Variables"** 탭에서 다음 환경변수 추가:

#### 필수 환경변수

```bash
# 기본 설정
NODE_ENV=production
PORT=3000
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com

# 데이터베이스 (자동 생성됨 - 확인만)
DATABASE_URL=${{ Postgres.DATABASE_URL }}
REDIS_URL=${{ Redis.REDIS_URL }}
BULLMQ_REDIS_URL=${{ Redis.REDIS_URL }}

# JWT 설정
JWT_SECRET=57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# 로깅
LOG_LEVEL=warn
```

#### Google OAuth 설정 (필수)

```bash
GOOGLE_CLIENT_ID=[사용자 입력 필요]
GOOGLE_CLIENT_SECRET=[사용자 입력 필요]
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback
```

#### Slack Bot 설정 (선택사항)

```bash
SLACK_BOT_TOKEN=[선택사항]
SLACK_APP_TOKEN=[선택사항]
SLACK_SIGNING_SECRET=[선택사항]
SLACK_SOCKET_MODE=true
SLACK_LOG_LEVEL=WARN

QUEUE_SLACK_CONCURRENCY=10
QUEUE_ORCHESTRATION_CONCURRENCY=5
QUEUE_NOTIFICATION_CONCURRENCY=20
```

#### AI 설정 (선택사항)

```bash
ANTHROPIC_API_KEY=[선택사항]
OHMYOPENCODE_API_URL=https://api.ohmyopencode.com/v1
OHMYOPENCODE_API_KEY=[선택사항]
```

#### 모니터링 (선택사항)

```bash
SENTRY_DSN=[선택사항]
```

### 4.3 환경변수 입력 방법

**Railway UI에서**:

1. Node.js 서비스 클릭
2. **"Variables"** 탭 열기
3. **"Add Variable"** 클릭
4. 각 환경변수 입력:
   - Key: `NODE_ENV`
   - Value: `production`
5. **"Save"** 클릭

**또는 Raw Editor 사용**:

```
NODE_ENV=production
PORT=3000
BASE_URL=https://auth.nubabel.com
...
```

---

## 🔨 STEP 5: 배포 설정 확인

### 5.1 빌드 설정

Railway는 자동으로 Dockerfile을 감지합니다.

**확인 사항**:

1. Node.js 서비스 클릭
2. **"Settings"** 탭 열기
3. **"Build"** 섹션 확인:

```
Builder: Dockerfile
Dockerfile Path: ./Dockerfile
Build Command: (자동)
```

### 5.2 시작 명령 확인

```
Start Command: node dist/index.js
```

**또는 Dockerfile의 CMD 사용** (권장):

```
Dockerfile의 CMD가 자동으로 실행됨
```

### 5.3 헬스 체크 설정

Dockerfile에 이미 설정됨:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
```

**확인**:

1. Node.js 서비스 → **"Settings"**
2. **"Health Check"** 섹션:
   - Path: `/health`
   - Interval: 30s
   - Timeout: 5s

---

## 🚀 STEP 6: 배포 시작

### 6.1 배포 트리거

**옵션 A: 자동 배포 (권장)**

```
GitHub 저장소에 push → 자동으로 배포 시작
```

**옵션 B: 수동 배포**

1. Node.js 서비스 클릭
2. **"Deploy"** 버튼 클릭
3. 배포 시작

### 6.2 배포 진행 상황 모니터링

1. **"Deployments"** 탭 열기
2. 최신 배포 클릭
3. 로그 확인:

```
✅ Building Docker image...
✅ Pushing to registry...
✅ Deploying...
✅ Running migrations...
✅ Server started on port 3000
```

### 6.3 배포 완료 확인

```
상태: ✅ Running
URL: https://nubabel-production.up.railway.app
```

---

## ✅ STEP 7: 배포 후 검증

### 7.1 헬스 체크

```bash
curl https://nubabel-production.up.railway.app/health
```

**예상 응답**:

```json
{
  "status": "ok",
  "timestamp": "2026-01-26T12:00:00Z",
  "database": "connected",
  "redis": "connected"
}
```

### 7.2 데이터베이스 마이그레이션 확인

배포 로그에서 확인:

```
=== Running Prisma Migrations ===
✅ Migrations completed successfully
```

### 7.3 API 테스트

```bash
# 인증 엔드포인트 테스트
curl https://nubabel-production.up.railway.app/auth/google

# 워크플로우 API 테스트
curl -H "Authorization: Bearer <token>" \
  https://nubabel-production.up.railway.app/api/workflows
```

---

## 🔗 STEP 8: 커스텀 도메인 설정 (선택사항)

### 8.1 Railway에서 도메인 연결

1. Node.js 서비스 클릭
2. **"Settings"** → **"Domains"**
3. **"Add Domain"** 클릭
4. 도메인 입력: `auth.nubabel.com`

### 8.2 DNS 설정

Railway가 제공하는 CNAME 레코드를 DNS 제공자에 추가:

```
CNAME: auth.nubabel.com → [Railway CNAME]
```

### 8.3 SSL 인증서

Railway가 자동으로 Let's Encrypt 인증서 발급

---

## 📊 STEP 9: 모니터링 설정

### 9.1 로그 확인

1. Node.js 서비스 클릭
2. **"Logs"** 탭 열기
3. 실시간 로그 확인

### 9.2 메트릭 확인

1. **"Metrics"** 탭 열기
2. CPU, 메모리, 네트워크 사용량 확인

### 9.3 알림 설정 (선택사항)

1. 프로젝트 설정 → **"Alerts"**
2. 알림 규칙 추가:
   - CPU > 80%
   - 메모리 > 90%
   - 배포 실패

---

## 🔐 STEP 10: 보안 설정

### 10.1 환경변수 보안

✅ Railway는 자동으로 환경변수 암호화

### 10.2 데이터베이스 접근 제한

1. PostgreSQL 서비스 → **"Settings"**
2. **"Public Networking"** 비활성화 (기본값)
3. Railway 내부 네트워크만 접근 가능

### 10.3 Redis 접근 제한

1. Redis 서비스 → **"Settings"**
2. **"Public Networking"** 비활성화 (기본값)

---

## 📋 배포 체크리스트

### 프로젝트 생성

- [ ] Railway 프로젝트 생성: `nubabel-production`
- [ ] GitHub 저장소 연결 (또는 Docker 이미지)

### 데이터베이스

- [ ] PostgreSQL 추가
- [ ] `DATABASE_URL` 확인
- [ ] Redis 추가
- [ ] `REDIS_URL` 확인

### 환경변수

- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `BASE_URL=https://auth.nubabel.com`
- [ ] `JWT_SECRET` 설정
- [ ] `GOOGLE_CLIENT_ID` 설정
- [ ] `GOOGLE_CLIENT_SECRET` 설정
- [ ] `DATABASE_URL` 연결
- [ ] `REDIS_URL` 연결

### 배포

- [ ] Dockerfile 확인
- [ ] 빌드 명령 확인
- [ ] 시작 명령 확인
- [ ] 헬스 체크 설정

### 검증

- [ ] 배포 완료
- [ ] 헬스 체크 통과
- [ ] 데이터베이스 마이그레이션 완료
- [ ] API 응답 확인

### 도메인 (선택사항)

- [ ] 커스텀 도메인 추가
- [ ] DNS CNAME 설정
- [ ] SSL 인증서 확인

---

## 🆘 문제 해결

### 배포 실패

**증상**: 배포 중 오류 발생

**해결**:

1. 배포 로그 확인
2. 환경변수 확인
3. Dockerfile 문법 확인
4. 의존성 설치 확인

```bash
# 로컬에서 테스트
docker build -t nubabel:test .
docker run -e NODE_ENV=production nubabel:test
```

### 데이터베이스 연결 실패

**증상**: `Error: connect ECONNREFUSED`

**해결**:

1. `DATABASE_URL` 확인
2. PostgreSQL 서비스 상태 확인
3. 마이그레이션 로그 확인

```bash
# 로컬에서 테스트
DATABASE_URL="postgresql://..." npx prisma db push
```

### 헬스 체크 실패

**증상**: 서비스가 계속 재시작됨

**해결**:

1. `/health` 엔드포인트 확인
2. 포트 설정 확인 (PORT=3000)
3. 서버 로그 확인

```bash
curl http://localhost:3000/health
```

### 메모리 부족

**증상**: 서비스 자동 재시작

**해결**:

1. Railway 대시보드에서 메모리 증설
2. 메모리 누수 확인
3. 동시 연결 수 제한

---

## 📞 지원

### Railway 문서

- [Railway Docs](https://docs.railway.app/)
- [Railway CLI](https://docs.railway.app/cli/quick-start)
- [Railway Support](https://railway.app/support)

### Nubabel 문서

- [DEPLOYMENT.md](DEPLOYMENT.md) - 배포 개요
- [ARCHITECTURE.md](ARCHITECTURE.md) - 시스템 아키텍처
- [README.md](README.md) - 프로젝트 개요

---

## 📝 다음 단계

배포 완료 후:

1. **Google OAuth 설정**
   - Google Cloud Console에서 OAuth 클라이언트 생성
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정

2. **Slack Bot 설정** (선택사항)
   - Slack App 생성
   - Bot 토큰 설정
   - Socket Mode 활성화

3. **모니터링 설정**
   - Sentry 연결 (에러 추적)
   - OpenTelemetry 설정 (성능 모니터링)

4. **도메인 설정**
   - `auth.nubabel.com` DNS 설정
   - SSL 인증서 확인

5. **프로덕션 테스트**
   - 사용자 인증 테스트
   - 워크플로우 실행 테스트
   - API 엔드포인트 테스트

---

## 📊 배포 후 상태

```
┌─────────────────────────────────────────┐
│     Railway Project: nubabel-prod       │
├─────────────────────────────────────────┤
│ ✅ PostgreSQL Database                  │
│    └─ DATABASE_URL: [MASKED]            │
│ ✅ Redis Cache                          │
│    └─ REDIS_URL: [MASKED]               │
│ ✅ Node.js Application                  │
│    └─ URL: https://nubabel-prod.up...   │
│ ✅ Environment Variables                │
│    └─ 15+ 환경변수 설정됨               │
│ ✅ Health Checks                        │
│    └─ /health 엔드포인트 활성화         │
│ ✅ Auto-scaling                         │
│    └─ 1 replica (필요시 증설)           │
└─────────────────────────────────────────┘
```

---

**배포 준비 완료! 🚀**

이 가이드를 따라 Railway에 배포하면 프로덕션 환경이 완성됩니다.
