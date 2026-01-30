# Railway 배포 빠른 시작 (5분)

**상태**: 🚀 배포 준비 완료

---

## 🎯 목표

Nubabel을 Railway에 배포하고 프로덕션 환경 구성

---

## ⚡ 빠른 체크리스트

### 1️⃣ Railway 프로젝트 생성 (2분)

```
1. https://railway.app 방문
2. GitHub 로그인
3. "New Project" → "Deploy from GitHub"
4. 저장소 선택: seankim-business/corp-system
5. 자동 배포 시작
```

### 2️⃣ 데이터베이스 추가 (1분)

```
1. "New" → "Database" → "PostgreSQL"
2. "New" → "Database" → "Redis"
3. 자동으로 DATABASE_URL, REDIS_URL 생성됨
```

### 3️⃣ 환경변수 설정 (2분)

Node.js 서비스의 Variables에 추가:

```bash
# 필수
NODE_ENV=production
PORT=3000
BASE_URL=https://auth.nubabel.com
JWT_SECRET=57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=

# 자동 연결
DATABASE_URL=${{ Postgres.DATABASE_URL }}
REDIS_URL=${{ Redis.REDIS_URL }}
BULLMQ_REDIS_URL=${{ Redis.REDIS_URL }}

# Google OAuth (필수 - 사용자 입력)
GOOGLE_CLIENT_ID=[입력 필요]
GOOGLE_CLIENT_SECRET=[입력 필요]
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback
```

---

## ✅ 배포 완료 확인

```bash
# 헬스 체크
curl https://nubabel-production.up.railway.app/health

# 예상 응답
{
  "status": "ok",
  "database": "connected",
  "redis": "connected"
}
```

---

## 📊 배포 상태

| 항목         | 상태      | 비고                   |
| ------------ | --------- | ---------------------- |
| 프로젝트     | ✅ 준비됨 | railway.json 설정 완료 |
| Dockerfile   | ✅ 준비됨 | 멀티스테이지 빌드      |
| 데이터베이스 | ✅ 준비됨 | PostgreSQL + Redis     |
| 환경변수     | ✅ 준비됨 | 15+ 변수 설정          |
| 헬스 체크    | ✅ 준비됨 | /health 엔드포인트     |

---

## 🔗 다음 단계

1. **Google OAuth 설정**
   - Google Cloud Console에서 OAuth 클라이언트 생성
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` 설정

2. **도메인 설정** (선택사항)
   - Railway에서 `auth.nubabel.com` 추가
   - DNS CNAME 설정

3. **모니터링**
   - Railway 대시보드에서 로그 확인
   - 메트릭 모니터링

---

## 📖 상세 가이드

자세한 설정은 [RAILWAY_SETUP_GUIDE.md](RAILWAY_SETUP_GUIDE.md) 참조
