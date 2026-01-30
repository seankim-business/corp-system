# Railway 배포 수정 가이드

## 문제 진단
1. **nubabel.com** → "Cannot GET /" (백엔드가 응답하고 있지만 루트 경로 없음)
2. **app.nubabel.com** → 502 Bad Gateway (백엔드 서비스 시작 실패 또는 도메인 매핑 오류)

## Railway 프로젝트 구조 (예상)

### Service 1: Backend (Node.js API)
- **빌드**: 루트 Dockerfile
- **도메인**: app.nubabel.com
- **필수 환경 변수**:
  ```
  DATABASE_URL=postgresql://... (Railway PostgreSQL에서 자동 제공)
  REDIS_URL=redis://... (Railway Redis에서 자동 제공)
  JWT_SECRET=<임의의 긴 문자열>
  BASE_URL=https://app.nubabel.com
  BASE_DOMAIN=nubabel.com
  COOKIE_DOMAIN=.nubabel.com
  NODE_ENV=production
  ```

- **선택 환경 변수** (없어도 서버 시작됨):
  ```
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  ANTHROPIC_API_KEY=...
  SLACK_BOT_TOKEN=...
  SLACK_APP_TOKEN=...
  ```

### Service 2: Landing Page
- **빌드**: landing/Dockerfile
- **도메인**: nubabel.com
- **환경 변수**:
  ```
  PORT=8080
  ```

## 즉시 수정 방법

### Railway Dashboard에서:

1. **Backend Service 환경 변수 확인**:
   - Variables 탭
   - 필수 변수들이 모두 설정되어 있는지 확인
   - 특히 `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`

2. **도메인 매핑 확인**:
   - Settings → Domains
   - Backend service: app.nubabel.com
   - Landing service: nubabel.com
   - 만약 반대로 되어 있으면 수정

3. **서비스 재시작**:
   - Backend service → Deployments → Redeploy
   - Landing service → Deployments → Redeploy

4. **로그 확인**:
   - Backend service → Deployments → 최신 deployment 클릭
   - Build 로그에서 에러 확인
   - Deploy 로그에서 시작 에러 확인

## 예상 로그 (성공 케이스)

```
=== Starting Nubabel Container ===
Environment: production
Database URL: postgresql://...

=== Running Prisma Migrations ===
✓ Prisma migrate deploy

=== Starting Node.js Server ===
✅ Server started on port 3000
✅ OpenTelemetry instrumentation started (또는 ⚠️ 경고)
✅ BullMQ workers started (또는 ⚠️ 경고)
✅ Slack Bot started (또는 ⚠️ 경고)
```

## 만약 JWT_SECRET이 없다면

Railway Shell에서:
```bash
openssl rand -base64 32
```

출력된 값을 `JWT_SECRET` 환경 변수로 설정
