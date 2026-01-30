# Railway 수동 배포 가이드 (단계별)

**프로젝트**: Nubabel Production  
**작성일**: 2026-01-26  
**상태**: 🚀 수동 배포 준비 완료

---

## ⚠️ 중요 사항

Playwright 브라우저 자동화가 macOS에서 작동하지 않아, 이 가이드는 **수동 배포**를 위한 단계별 지침입니다.

각 단계를 정확히 따라하면 약 40-50분 내에 배포가 완료됩니다.

---

## 🚀 STEP 1: Railway 로그인

### 1.1 Railway 웹사이트 접속

1. 브라우저에서 **https://railway.app** 방문
2. 우측 상단의 **"Login"** 버튼 클릭

### 1.2 GitHub로 로그인

1. **"Continue with GitHub"** 클릭
2. GitHub 계정으로 로그인
3. Railway 앱 권한 승인

**예상 결과**: Railway 대시보드 표시

---

## 📋 STEP 2: 새 프로젝트 생성

### 2.1 프로젝트 생성 페이지

1. 대시보드에서 **"New Project"** 버튼 클릭
2. **"Empty Project"** 선택 (또는 "Deploy from GitHub")

### 2.2 프로젝트 이름 설정

```
프로젝트 이름: nubabel-production
```

1. 프로젝트 이름 입력 필드에 `nubabel-production` 입력
2. **"Create"** 또는 **"Deploy"** 버튼 클릭

**예상 결과**: 새 프로젝트 대시보드 표시

**스크린샷 촬영**: 프로젝트 생성 완료 화면

---

## 🗄️ STEP 3: PostgreSQL 데이터베이스 추가

### 3.1 데이터베이스 추가

1. 프로젝트 대시보드에서 **"New"** 버튼 클릭
2. **"Database"** 섹션에서 **"PostgreSQL"** 선택
3. 자동으로 생성 시작 (약 1-2분 소요)

### 3.2 생성 완료 대기

```
상태: Creating...
↓
상태: Running (녹색)
```

생성이 완료될 때까지 대기합니다.

### 3.3 DATABASE_URL 확인

1. PostgreSQL 서비스 클릭
2. **"Variables"** 탭 열기
3. `DATABASE_URL` 찾기

**형식**:

```
postgresql://user:password@host:port/database
```

### 3.4 DATABASE_URL 기록

```
DATABASE_URL: postgresql://[MASKED]
상태: ✅ 생성됨
```

**스크린샷 촬영**: PostgreSQL Variables 탭

---

## 🔴 STEP 4: Redis 캐시 추가

### 4.1 Redis 추가

1. 프로젝트 대시보드에서 **"New"** 버튼 클릭
2. **"Database"** 섹션에서 **"Redis"** 선택
3. 자동으로 생성 시작 (약 1-2분 소요)

### 4.2 생성 완료 대기

```
상태: Creating...
↓
상태: Running (녹색)
```

생성이 완료될 때까지 대기합니다.

### 4.3 REDIS_URL 확인

1. Redis 서비스 클릭
2. **"Variables"** 탭 열기
3. `REDIS_URL` 찾기

**형식**:

```
redis://default:password@host:port
```

### 4.4 REDIS_URL 기록

```
REDIS_URL: redis://[MASKED]
상태: ✅ 생성됨
```

**스크린샷 촬영**: Redis Variables 탭

---

## ⚙️ STEP 5: Node.js 애플리케이션 서비스 추가

### 5.1 서비스 추가

1. 프로젝트 대시보드에서 **"New"** 버튼 클릭
2. **"Service"** 섹션에서 **"GitHub Repo"** 선택

### 5.2 저장소 선택

1. GitHub 저장소 검색: `corp-system` 또는 `nubabel`
2. 저장소 선택: `seankim-business/corp-system`
3. **"Deploy"** 클릭

### 5.3 배포 시작

```
상태: Building...
↓
상태: Deploying...
↓
상태: Running (녹색)
```

배포가 시작됩니다 (약 5-10분 소요).

**스크린샷 촬영**: 서비스 생성 완료 화면

---

## 🔧 STEP 6: 환경변수 설정

### 6.1 Node.js 서비스 선택

1. 프로젝트 대시보드에서 Node.js 서비스 클릭
2. **"Variables"** 탭 열기

### 6.2 필수 환경변수 추가

다음 환경변수들을 추가합니다:

#### 기본 설정

```
NODE_ENV = production
PORT = 3000
BASE_URL = https://auth.nubabel.com
BASE_DOMAIN = nubabel.com
COOKIE_DOMAIN = .nubabel.com
LOG_LEVEL = warn
```

#### 데이터베이스 연결

```
DATABASE_URL = ${{ Postgres.DATABASE_URL }}
REDIS_URL = ${{ Redis.REDIS_URL }}
BULLMQ_REDIS_URL = ${{ Redis.REDIS_URL }}
```

#### JWT 설정

```
JWT_SECRET = 57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
JWT_EXPIRES_IN = 7d
JWT_REFRESH_EXPIRES_IN = 30d
```

#### Google OAuth (필수)

```
GOOGLE_CLIENT_ID = [사용자 입력 필요]
GOOGLE_CLIENT_SECRET = [사용자 입력 필요]
GOOGLE_REDIRECT_URI = https://auth.nubabel.com/auth/google/callback
```

### 6.3 환경변수 입력 방법

**UI를 통한 입력**:

1. **"Add Variable"** 클릭
2. Key 입력: `NODE_ENV`
3. Value 입력: `production`
4. **"Save"** 클릭
5. 반복

**또는 Raw Editor 사용**:

1. **"Raw Editor"** 클릭
2. 다음 형식으로 입력:

```
NODE_ENV=production
PORT=3000
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com
LOG_LEVEL=warn
DATABASE_URL=${{ Postgres.DATABASE_URL }}
REDIS_URL=${{ Redis.REDIS_URL }}
BULLMQ_REDIS_URL=${{ Redis.REDIS_URL }}
JWT_SECRET=57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d
GOOGLE_CLIENT_ID=[입력 필요]
GOOGLE_CLIENT_SECRET=[입력 필요]
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback
```

3. **"Save"** 클릭

**스크린샷 촬영**: 모든 환경변수 설정 완료 화면

---

## 🔨 STEP 7: 빌드 설정 확인

### 7.1 Settings 탭 열기

1. Node.js 서비스 클릭
2. **"Settings"** 탭 열기

### 7.2 빌드 설정 확인

```
Builder: Dockerfile
Dockerfile Path: ./Dockerfile
```

**확인 사항**:

- [ ] Builder가 "Dockerfile"로 설정됨
- [ ] Dockerfile Path가 "./Dockerfile"로 설정됨

### 7.3 시작 명령 확인

```
Start Command: node dist/index.js
```

또는 Dockerfile의 CMD가 자동으로 실행됨.

### 7.4 헬스 체크 설정

```
Health Check Path: /health
Interval: 30s
Timeout: 5s
```

**스크린샷 촬영**: Build 설정 화면

---

## 🚀 STEP 8: 배포 시작

### 8.1 배포 트리거

**옵션 A: 자동 배포 (권장)**

```
GitHub 저장소에 push
↓
Railway 자동 감지
↓
배포 시작
```

**옵션 B: 수동 배포**

1. Node.js 서비스 클릭
2. **"Deploy"** 버튼 클릭
3. 배포 시작

### 8.2 배포 진행 상황 모니터링

1. **"Deployments"** 탭 열기
2. 최신 배포 클릭
3. 로그 확인

**예상 로그**:

```
=== Building Docker image ===
✅ Building...

=== Pushing to registry ===
✅ Pushing...

=== Deploying ===
✅ Deploying...

=== Running Prisma Migrations ===
✅ Migrations completed successfully

=== Starting Node.js Server ===
✅ Server started on port 3000
```

### 8.3 배포 완료 확인

```
상태: Running (녹색)
```

**스크린샷 촬영**: 배포 로그 (성공)

---

## ✅ STEP 9: 배포 후 검증

### 9.1 헬스 체크

배포 완료 후, 터미널에서 실행:

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

### 9.2 배포 URL 확인

1. Node.js 서비스 클릭
2. **"Settings"** → **"Domains"** 확인
3. 자동 생성된 URL 기록:

```
https://nubabel-production.up.railway.app
```

**스크린샷 촬영**: 헬스 체크 응답

---

## 🔗 STEP 10: 커스텀 도메인 설정 (선택사항)

### 10.1 도메인 추가

1. Node.js 서비스 클릭
2. **"Settings"** → **"Domains"**
3. **"Add Domain"** 클릭
4. 도메인 입력: `auth.nubabel.com`

### 10.2 DNS 설정

Railway가 제공하는 CNAME 레코드를 DNS 제공자에 추가:

```
Name: auth.nubabel.com
Type: CNAME
Value: [Railway CNAME]
```

### 10.3 SSL 인증서

Railway가 자동으로 Let's Encrypt 인증서 발급

---

## 📊 배포 완료 체크리스트

### 프로젝트 생성

- [ ] Railway 프로젝트 생성: `nubabel-production`
- [ ] 프로젝트 URL 기록

### 데이터베이스

- [ ] PostgreSQL 추가
- [ ] `DATABASE_URL` 확인 및 기록
- [ ] Redis 추가
- [ ] `REDIS_URL` 확인 및 기록

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

---

## 📝 배포 정보 기록

### 프로젝트 정보

```
프로젝트 이름: nubabel-production
프로젝트 URL: https://railway.app/project/[PROJECT_ID]
배포 URL: https://nubabel-production.up.railway.app
커스텀 도메인: https://auth.nubabel.com (설정 후)
```

### 데이터베이스 정보

```
PostgreSQL:
- DATABASE_URL: postgresql://[MASKED]
- 상태: ✅ Running

Redis:
- REDIS_URL: redis://[MASKED]
- 상태: ✅ Running
```

### 배포 정보

```
배포 시작: [시간]
배포 완료: [시간]
소요 시간: [분]
상태: ✅ Running
```

---

## 🔗 다음 단계

### 즉시 필요 (배포 후 1-2시간)

1. **Google OAuth 설정**
   - Google Cloud Console에서 OAuth 2.0 클라이언트 생성
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정

2. **프로덕션 테스트**
   - 사용자 인증 테스트
   - 워크플로우 실행 테스트
   - API 엔드포인트 테스트

### 선택사항 (배포 후 1-2일)

3. **Slack Bot 설정**
4. **모니터링 설정**
5. **도메인 설정**

---

## 📞 문제 해결

### 배포 실패

**증상**: 배포 중 오류 발생

**해결**:

1. 배포 로그 확인
2. 환경변수 확인
3. Dockerfile 문법 확인

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

**배포 준비 완료! 🚀**

이 가이드를 따라 Railway에 배포하면 프로덕션 환경이 완성됩니다.
