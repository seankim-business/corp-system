# 🚀 Nubabel 배포 준비 완료!

**생성 날짜**: 2026-01-26  
**상태**: ✅ 모든 자동화 스크립트 준비 완료

---

## 📊 배포 준비 현황

### ✅ 완료된 작업

| 항목 | 상태 | 위치 |
|------|------|------|
| JWT Secret 생성 | ✅ 완료 | `.env.production` |
| Railway 배포 스크립트 | ✅ 완료 | `scripts/railway-deploy.sh` |
| Google OAuth 스크립트 | ✅ 완료 | `scripts/setup-google-oauth.sh` |
| Slack Bot 스크립트 | ✅ 완료 | `scripts/setup-slack-bot.sh` |
| GoDaddy DNS 스크립트 | ✅ 완료 | `scripts/setup-godaddy-dns.sh` |
| 통합 배포 스크립트 | ✅ 완료 | `scripts/deploy-all.sh` |

---

## 🚀 배포 시작하기

### 방법 1: 원클릭 배포 (권장)

모든 단계를 한 번에 실행:

```bash
cd /Users/sean/Documents/Kyndof/tools/nubabel
./scripts/deploy-all.sh
```

이 스크립트는 다음을 수행합니다:
1. Railway 프로젝트 생성
2. PostgreSQL + Redis 추가
3. 환경변수 설정
4. 애플리케이션 배포
5. Google OAuth 설정 (대화형)
6. Slack Bot 설정 (선택)
7. DNS 구성

**예상 소요 시간**: 30-40분

---

### 방법 2: 단계별 수동 배포

각 단계를 개별적으로 실행:

#### 1단계: Railway 배포

```bash
./scripts/railway-deploy.sh
```

- Railway 프로젝트 생성
- PostgreSQL + Redis 프로비저닝
- 환경변수 설정
- 애플리케이션 배포

**소요 시간**: 15-20분

#### 2단계: Google OAuth 설정

```bash
./scripts/setup-google-oauth.sh
```

- Google Cloud Console에서 OAuth 자격증명 생성
- Railway 환경변수에 자동 저장

**소요 시간**: 10분

#### 3단계: Slack Bot 설정 (선택)

```bash
./scripts/setup-slack-bot.sh
```

- Slack App 생성
- Bot 토큰 생성
- Railway 환경변수에 자동 저장

**소요 시간**: 10분

#### 4단계: DNS 설정

```bash
./scripts/setup-godaddy-dns.sh
```

- Railway 커스텀 도메인 설정
- GoDaddy DNS CNAME 레코드 추가
- DNS 전파 확인

**소요 시간**: 5-10분 (+ DNS 전파 대기)

---

## 📋 사전 준비사항

### 필수

- [x] Railway 계정 (GitHub 계정으로 로그인 가능)
- [x] Google Cloud Platform 계정
- [x] GoDaddy 계정 (nubabel.com 도메인 소유)
- [x] Railway CLI 설치됨 (`/Users/sean/.npm-global/bin/railway`)

### 선택 (Slack Bot 사용 시)

- [ ] Slack 워크스페이스 관리자 권한

---

## 🔑 생성된 시크릿

### JWT Secret

```
453KHA79UDFz2CUj2xIPzOPay+HAi/QErWQLw4G2Tls=
```

✅ 이미 `.env.production`에 저장됨

### 아직 필요한 시크릿

다음은 배포 과정에서 생성됩니다:

- `DATABASE_URL` - Railway가 자동 생성
- `REDIS_URL` - Railway가 자동 생성
- `GOOGLE_CLIENT_ID` - Google OAuth 스크립트에서 입력
- `GOOGLE_CLIENT_SECRET` - Google OAuth 스크립트에서 입력
- `SLACK_BOT_TOKEN` - Slack Bot 스크립트에서 입력 (선택)
- `SLACK_APP_TOKEN` - Slack Bot 스크립트에서 입력 (선택)
- `SLACK_SIGNING_SECRET` - Slack Bot 스크립트에서 입력 (선택)

### 추가로 필요한 시크릿 (수동 추가)

배포 후 Railway 대시보드에서 수동으로 추가:

```bash
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
```

---

## 📊 예상 배포 결과

### 배포 후 상태

```
✅ Node.js Application: Running
✅ PostgreSQL Database: Running (16GB storage)
✅ Redis Cache: Running (512MB memory)
✅ Health Check: Passing (/health/ready)
```

### 접속 URL

- **Production**: https://auth.nubabel.com
- **Railway Dashboard**: https://railway.app/project/[your-project-id]
- **Railway URL**: https://nubabel-production.up.railway.app

---

## 🔍 배포 후 검증

### 1. Health Check

```bash
curl https://auth.nubabel.com/health/ready
```

예상 응답:
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "bullmq": "ok"
  }
}
```

### 2. Google OAuth 테스트

브라우저에서:
```
https://auth.nubabel.com
```

- "Login with Google" 버튼 표시 확인
- 로그인 플로우 테스트

### 3. Slack Bot 테스트 (설정한 경우)

Slack 워크스페이스에서:
```
@Nubabel Bot hello
```

봇이 응답하는지 확인

---

## 🐛 문제 해결

### Railway 로그 확인

```bash
railway logs
```

### 환경변수 확인

```bash
railway variables
```

### 재배포

```bash
railway up
```

### 데이터베이스 마이그레이션 수동 실행

```bash
railway run npx prisma migrate deploy
```

---

## 📚 추가 문서

- **상세 배포 가이드**: `RAILWAY_SETUP_GUIDE.md`
- **환경변수 참조**: `RAILWAY_ENV_REFERENCE.md`
- **배포 체크리스트**: `RAILWAY_DEPLOYMENT_CHECKLIST.md`
- **빠른 시작**: `RAILWAY_QUICK_START.md`

---

## 🎯 다음 단계

배포 완료 후:

1. **프로덕션 테스트**: 로그인, 워크플로우 실행 테스트
2. **모니터링 설정**: Sentry DSN 추가
3. **알림 설정**: Railway Slack/Discord 웹훅
4. **백업 설정**: PostgreSQL 자동 백업 활성화
5. **스케일링**: 트래픽 증가 시 replica 추가

---

## ✅ 배포 준비 완료!

모든 스크립트와 문서가 준비되었습니다.

**지금 바로 배포를 시작하세요:**

```bash
cd /Users/sean/Documents/Kyndof/tools/nubabel
./scripts/deploy-all.sh
```

**Happy Deploying! 🚀**

---

**생성 시각**: 2026-01-26  
**Ralph Loop**: 3/100  
**Status**: ✅ ALL SCRIPTS READY
