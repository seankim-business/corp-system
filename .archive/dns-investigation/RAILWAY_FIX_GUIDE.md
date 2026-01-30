# Railway 502 에러 수정 가이드

## 현재 상황
- ✅ nubabel.com: GoDaddy Website Builder (Railway 아님)
- ⚠️ app.nubabel.com: React 프론트엔드만 제공 (백엔드 API 없음)
- ❌ 백엔드 API: 배포 안 됨 또는 도메인 매핑 안 됨

## Railway Dashboard에서 수정 필요

### 1단계: 서비스 확인
https://railway.app → 프로젝트 선택

**확인사항**:
- 서비스가 1개인가 2개인가?
- 각 서비스의 이름은?

### 2단계-A: 서비스가 1개인 경우
현재 서비스가 정적 파일만 제공 중

**해결책**:
1. Service Settings → Build 섹션
2. Builder: `DOCKERFILE` 선택
3. Dockerfile Path: `Dockerfile` 입력
4. Root Directory: `/` (루트)
5. Deploy 다시 실행

### 2단계-B: 서비스가 2개인 경우 (frontend, backend)
도메인 매핑이 잘못됨

**해결책**:
1. Backend 서비스 선택
2. Settings → Domains
3. "Generate Domain" 또는 "Custom Domain" 클릭
4. app.nubabel.com 추가
5. Frontend 서비스에서 app.nubabel.com 제거

### 3단계: 환경 변수 확인
Backend 서비스 → Variables 탭

**필수 환경 변수** (없으면 추가):
```
DATABASE_URL=postgresql://... (Railway PostgreSQL 플러그인이 자동 제공)
REDIS_URL=redis://... (Railway Redis 플러그인이 자동 제공)
JWT_SECRET=<아래 명령어로 생성>
NODE_ENV=production
BASE_URL=https://app.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com
PORT=3000
```

**JWT_SECRET 생성** (Railway Shell 또는 로컬 터미널):
```bash
openssl rand -base64 32
```
출력된 값을 복사해서 JWT_SECRET에 설정

### 4단계: 재배포
1. Deployments 탭
2. "Redeploy" 버튼 클릭
3. 빌드 로그 확인

**예상 로그 (성공 시)**:
```
Building Dockerfile...
Step 1/20 : FROM node:20-alpine AS builder
...
Successfully built xxxxx
Deploying...
✅ Deployment successful
```

### 5단계: 확인
배포 완료 후 (3-5분):

```bash
# 백엔드 헬스체크
curl https://app.nubabel.com/health
# 예상: {"status":"ok","timestamp":"..."}

# API 엔드포인트
curl https://app.nubabel.com/api/workflows
# 예상: {"error":"Unauthorized"} (401) - 정상!

# 프론트엔드
curl https://app.nubabel.com/
# 예상: React 앱 HTML
```

## 문제 해결

### 빌드 실패 시
로그에서 에러 확인:
- `POSTGRES_PASSWORD is required` → DATABASE_URL 확인
- `Cannot find module` → Dockerfile 문제 (github 이슈 올리기)
- `Port already in use` → 재시작 필요

### 502 여전히 발생 시
1. Deployment 로그에서 "Server started on port 3000" 확인
2. 없으면: 환경 변수 누락 (특히 DATABASE_URL, REDIS_URL)
3. 있으면: 도메인 매핑 확인 (Settings → Domains)

## 최종 체크리스트
- [ ] Railway 프로젝트에 backend 서비스 존재
- [ ] Dockerfile로 빌드 설정됨
- [ ] app.nubabel.com이 backend 서비스에 매핑됨
- [ ] DATABASE_URL, REDIS_URL, JWT_SECRET 환경 변수 설정됨
- [ ] 배포 로그에서 "Server started" 확인
- [ ] curl https://app.nubabel.com/health → JSON 응답

## 연락처
문제가 계속되면 Railway 로그 스크린샷과 함께 문의
