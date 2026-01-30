# Railway 배포 체크리스트

**프로젝트**: Nubabel Production  
**배포 날짜**: 2026-01-26  
**상태**: 🚀 배포 준비 완료

---

## 📋 배포 전 준비

### 프로젝트 설정

- [x] Dockerfile 작성 (멀티스테이지 빌드)
- [x] railway.json 설정
- [x] package.json 설정
- [x] tsconfig.json 설정
- [x] .env.production 템플릿 작성
- [x] 헬스 체크 엔드포인트 구현

### 코드 준비

- [x] TypeScript 컴파일 설정
- [x] Prisma 마이그레이션 설정
- [x] 환경변수 검증
- [x] 에러 핸들링
- [x] 로깅 설정

### 문서 준비

- [x] RAILWAY_SETUP_GUIDE.md 작성
- [x] RAILWAY_QUICK_START.md 작성
- [x] 이 체크리스트 작성

---

## 🚀 배포 단계별 체크리스트

### STEP 1: Railway 프로젝트 생성

**담당자**: [사용자]  
**예상 시간**: 5분

- [ ] Railway 계정 생성/로그인
- [ ] "New Project" 클릭
- [ ] GitHub 저장소 연결 또는 Empty Project 생성
- [ ] 프로젝트 이름: `nubabel-production`
- [ ] 프로젝트 URL 기록: `https://railway.app/project/[PROJECT_ID]`

**완료 증거**:

- 스크린샷: Railway 대시보드
- 프로젝트 URL

---

### STEP 2: PostgreSQL 데이터베이스 추가

**담당자**: [사용자]  
**예상 시간**: 3분

- [ ] Railway 프로젝트 대시보드 열기
- [ ] "New" 버튼 클릭
- [ ] "Database" → "PostgreSQL" 선택
- [ ] 자동으로 생성됨 (약 1-2분)
- [ ] PostgreSQL 서비스 클릭
- [ ] "Variables" 탭에서 `DATABASE_URL` 확인
- [ ] `DATABASE_URL` 값 기록 (마스킹됨)

**완료 증거**:

- 스크린샷: PostgreSQL 서비스 Variables
- DATABASE_URL 확인

**기록**:

```
DATABASE_URL: postgresql://[MASKED]
생성 시간: [시간]
상태: ✅ 활성화
```

---

### STEP 3: Redis 캐시 추가

**담당자**: [사용자]  
**예상 시간**: 3분

- [ ] Railway 프로젝트 대시보드 열기
- [ ] "New" 버튼 클릭
- [ ] "Database" → "Redis" 선택
- [ ] 자동으로 생성됨 (약 1-2분)
- [ ] Redis 서비스 클릭
- [ ] "Variables" 탭에서 `REDIS_URL` 확인
- [ ] `REDIS_URL` 값 기록 (마스킹됨)

**완료 증거**:

- 스크린샷: Redis 서비스 Variables
- REDIS_URL 확인

**기록**:

```
REDIS_URL: redis://[MASKED]
생성 시간: [시간]
상태: ✅ 활성화
```

---

### STEP 4: Node.js 애플리케이션 서비스 추가

**담당자**: [사용자]  
**예상 시간**: 2분

- [ ] Railway 프로젝트 대시보드 열기
- [ ] "New" 버튼 클릭
- [ ] "Service" → "GitHub Repo" 선택
- [ ] 저장소 선택: `seankim-business/corp-system`
- [ ] 자동으로 Dockerfile 감지
- [ ] 배포 시작 (약 5-10분)

**완료 증거**:

- 스크린샷: Node.js 서비스 생성
- 배포 시작 확인

---

### STEP 5: 환경변수 설정

**담당자**: [사용자]  
**예상 시간**: 5분

#### 5.1 기본 환경변수

- [ ] Node.js 서비스 클릭
- [ ] "Variables" 탭 열기
- [ ] 다음 환경변수 추가:

```
NODE_ENV = production
PORT = 3000
BASE_URL = https://auth.nubabel.com
BASE_DOMAIN = nubabel.com
COOKIE_DOMAIN = .nubabel.com
LOG_LEVEL = warn
```

#### 5.2 데이터베이스 연결

- [ ] 다음 환경변수 추가:

```
DATABASE_URL = ${{ Postgres.DATABASE_URL }}
REDIS_URL = ${{ Redis.REDIS_URL }}
BULLMQ_REDIS_URL = ${{ Redis.REDIS_URL }}
```

#### 5.3 JWT 설정

- [ ] 다음 환경변수 추가:

```
JWT_SECRET = 57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
JWT_EXPIRES_IN = 7d
JWT_REFRESH_EXPIRES_IN = 30d
```

#### 5.4 Google OAuth 설정 (필수)

- [ ] Google Cloud Console에서 OAuth 클라이언트 생성
- [ ] `GOOGLE_CLIENT_ID` 입력
- [ ] `GOOGLE_CLIENT_SECRET` 입력
- [ ] `GOOGLE_REDIRECT_URI` 설정:

```
GOOGLE_REDIRECT_URI = https://auth.nubabel.com/auth/google/callback
```

#### 5.5 Slack Bot 설정 (선택사항)

- [ ] Slack App 생성 (필요시)
- [ ] `SLACK_BOT_TOKEN` 입력 (선택사항)
- [ ] `SLACK_APP_TOKEN` 입력 (선택사항)
- [ ] `SLACK_SIGNING_SECRET` 입력 (선택사항)
- [ ] 다음 환경변수 추가:

```
SLACK_SOCKET_MODE = true
SLACK_LOG_LEVEL = WARN
QUEUE_SLACK_CONCURRENCY = 10
QUEUE_ORCHESTRATION_CONCURRENCY = 5
QUEUE_NOTIFICATION_CONCURRENCY = 20
```

#### 5.6 AI 설정 (선택사항)

- [ ] `ANTHROPIC_API_KEY` 입력 (선택사항)
- [ ] `OHMYOPENCODE_API_URL` 설정:

```
OHMYOPENCODE_API_URL = https://api.ohmyopencode.com/v1
```

**완료 증거**:

- 스크린샷: 모든 환경변수 설정 완료
- 환경변수 목록 확인

**기록**:

```
설정된 환경변수: 15+
필수 환경변수: ✅ 완료
선택사항: [상태]
```

---

### STEP 6: 빌드 및 배포 설정 확인

**담당자**: [사용자]  
**예상 시간**: 2분

- [ ] Node.js 서비스 클릭
- [ ] "Settings" 탭 열기
- [ ] "Build" 섹션 확인:
  - [ ] Builder: `Dockerfile`
  - [ ] Dockerfile Path: `./Dockerfile`
- [ ] "Deploy" 섹션 확인:
  - [ ] Start Command: `node dist/index.js` (또는 Dockerfile CMD 사용)
- [ ] "Health Check" 섹션 확인:
  - [ ] Path: `/health`
  - [ ] Interval: `30s`
  - [ ] Timeout: `5s`

**완료 증거**:

- 스크린샷: Build 설정
- 스크린샷: Deploy 설정
- 스크린샷: Health Check 설정

---

### STEP 7: 배포 시작 및 모니터링

**담당자**: [사용자]  
**예상 시간**: 10-15분

#### 7.1 배포 트리거

- [ ] GitHub에 push (자동 배포) 또는
- [ ] Node.js 서비스에서 "Deploy" 버튼 클릭 (수동 배포)

#### 7.2 배포 진행 상황 모니터링

- [ ] "Deployments" 탭 열기
- [ ] 최신 배포 클릭
- [ ] 로그 확인:
  - [ ] `Building Docker image...` ✅
  - [ ] `Pushing to registry...` ✅
  - [ ] `Deploying...` ✅
  - [ ] `Running migrations...` ✅
  - [ ] `Server started on port 3000` ✅

#### 7.3 배포 완료 확인

- [ ] 상태: `Running` (녹색)
- [ ] 배포 시간 기록: [시간]
- [ ] 서비스 URL 기록: `https://nubabel-production.up.railway.app`

**완료 증거**:

- 스크린샷: 배포 로그 (성공)
- 스크린샷: 서비스 상태 (Running)
- 서비스 URL

**기록**:

```
배포 시작: [시간]
배포 완료: [시간]
소요 시간: [분]
상태: ✅ Running
URL: https://nubabel-production.up.railway.app
```

---

### STEP 8: 배포 후 검증

**담당자**: [사용자]  
**예상 시간**: 5분

#### 8.1 헬스 체크

```bash
curl https://nubabel-production.up.railway.app/health
```

- [ ] 응답 상태: `200 OK`
- [ ] 응답 본문:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-01-26T12:00:00Z",
    "database": "connected",
    "redis": "connected"
  }
  ```

#### 8.2 데이터베이스 마이그레이션 확인

- [ ] 배포 로그에서 확인:
  ```
  === Running Prisma Migrations ===
  ✅ Migrations completed successfully
  ```

#### 8.3 API 테스트

```bash
# 인증 엔드포인트 테스트
curl https://nubabel-production.up.railway.app/auth/google

# 워크플로우 API 테스트 (인증 필요)
curl -H "Authorization: Bearer <token>" \
  https://nubabel-production.up.railway.app/api/workflows
```

- [ ] 인증 엔드포인트 응답 확인
- [ ] API 응답 확인

**완료 증거**:

- 스크린샷: 헬스 체크 응답
- 스크린샷: 마이그레이션 로그
- API 테스트 결과

**기록**:

```
헬스 체크: ✅ 통과
데이터베이스: ✅ 연결됨
Redis: ✅ 연결됨
마이그레이션: ✅ 완료
API: ✅ 응답 확인
```

---

### STEP 9: 커스텀 도메인 설정 (선택사항)

**담당자**: [사용자]  
**예상 시간**: 5분

#### 9.1 Railway에서 도메인 추가

- [ ] Node.js 서비스 클릭
- [ ] "Settings" → "Domains"
- [ ] "Add Domain" 클릭
- [ ] 도메인 입력: `auth.nubabel.com`
- [ ] Railway가 제공하는 CNAME 기록

#### 9.2 DNS 설정

- [ ] DNS 제공자 (예: Route 53, Cloudflare) 접속
- [ ] CNAME 레코드 추가:
  ```
  Name: auth.nubabel.com
  Type: CNAME
  Value: [Railway CNAME]
  ```
- [ ] DNS 전파 대기 (5-30분)

#### 9.3 SSL 인증서 확인

- [ ] Railway가 자동으로 Let's Encrypt 인증서 발급
- [ ] `https://auth.nubabel.com` 접속 확인

**완료 증거**:

- 스크린샷: Railway 도메인 설정
- 스크린샷: DNS CNAME 레코드
- 스크린샷: HTTPS 접속 확인

**기록**:

```
도메인: auth.nubabel.com
CNAME: [Railway CNAME]
SSL: ✅ 자동 발급
상태: ✅ 활성화
```

---

### STEP 10: 모니터링 및 알림 설정

**담당자**: [사용자]  
**예상 시간**: 5분

#### 10.1 로그 모니터링

- [ ] Node.js 서비스 클릭
- [ ] "Logs" 탭 열기
- [ ] 실시간 로그 확인

#### 10.2 메트릭 모니터링

- [ ] "Metrics" 탭 열기
- [ ] CPU 사용량 확인
- [ ] 메모리 사용량 확인
- [ ] 네트워크 사용량 확인

#### 10.3 알림 설정 (선택사항)

- [ ] 프로젝트 설정 → "Alerts"
- [ ] 알림 규칙 추가:
  - [ ] CPU > 80%
  - [ ] 메모리 > 90%
  - [ ] 배포 실패
  - [ ] 서비스 다운

**완료 증거**:

- 스크린샷: 로그 확인
- 스크린샷: 메트릭 확인
- 스크린샷: 알림 설정 (선택사항)

---

## 📊 배포 완료 요약

### 배포 상태

| 항목           | 상태 | 비고               |
| -------------- | ---- | ------------------ |
| 프로젝트 생성  | ✅   | nubabel-production |
| PostgreSQL     | ✅   | DATABASE_URL 설정  |
| Redis          | ✅   | REDIS_URL 설정     |
| Node.js 서비스 | ✅   | Docker 배포        |
| 환경변수       | ✅   | 15+ 변수 설정      |
| 빌드           | ✅   | Dockerfile 사용    |
| 배포           | ✅   | Running 상태       |
| 헬스 체크      | ✅   | /health 통과       |
| 마이그레이션   | ✅   | 완료               |
| 도메인         | ⏳   | 선택사항           |
| 모니터링       | ⏳   | 선택사항           |

### 배포 정보

```
프로젝트: nubabel-production
URL: https://nubabel-production.up.railway.app
도메인: https://auth.nubabel.com (설정 후)
배포 날짜: 2026-01-26
배포 시간: [시간]
상태: ✅ 프로덕션 준비 완료
```

---

## 🔗 다음 단계

### 즉시 필요

1. **Google OAuth 설정**
   - [ ] Google Cloud Console에서 OAuth 클라이언트 생성
   - [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정
   - [ ] 테스트 사용자 추가

2. **프로덕션 테스트**
   - [ ] 사용자 인증 테스트
   - [ ] 워크플로우 실행 테스트
   - [ ] API 엔드포인트 테스트

### 선택사항

3. **Slack Bot 설정**
   - [ ] Slack App 생성
   - [ ] Bot 토큰 설정
   - [ ] Socket Mode 활성화

4. **모니터링 설정**
   - [ ] Sentry 연결 (에러 추적)
   - [ ] OpenTelemetry 설정 (성능 모니터링)

5. **도메인 설정**
   - [ ] `auth.nubabel.com` DNS 설정
   - [ ] SSL 인증서 확인

---

## 📞 문제 해결

### 배포 실패

**증상**: 배포 중 오류 발생

**해결**:

1. 배포 로그 확인
2. 환경변수 확인
3. Dockerfile 문법 확인
4. 의존성 설치 확인

**참조**: [RAILWAY_SETUP_GUIDE.md](RAILWAY_SETUP_GUIDE.md#-문제-해결)

### 데이터베이스 연결 실패

**증상**: `Error: connect ECONNREFUSED`

**해결**:

1. `DATABASE_URL` 확인
2. PostgreSQL 서비스 상태 확인
3. 마이그레이션 로그 확인

### 헬스 체크 실패

**증상**: 서비스가 계속 재시작됨

**해결**:

1. `/health` 엔드포인트 확인
2. 포트 설정 확인 (PORT=3000)
3. 서버 로그 확인

---

## 📝 서명

**배포 담당자**: ******\_\_\_\_******  
**배포 완료 날짜**: ******\_\_\_\_******  
**검증 담당자**: ******\_\_\_\_******  
**검증 완료 날짜**: ******\_\_\_\_******

---

**배포 준비 완료! 🚀**
