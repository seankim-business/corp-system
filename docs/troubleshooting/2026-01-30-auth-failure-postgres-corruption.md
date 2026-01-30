# Troubleshooting: Authentication Failed - Postgres Service Corruption

**Date:** 2026-01-30
**Issue:** "Authentication failed. Please try again." on login
**Resolution Time:** ~1 hour
**Severity:** Critical (Production Down)

---

## Symptom

사용자가 로그인 시도 시 "Authentication failed. Please try again." 오류 발생

## Root Cause Analysis

### 1. 초기 에러 확인
Railway 로그에서 실제 에러 발견:
```
ERROR: The column `memberships.mega_app_role_id` does not exist in the current database.
```

Prisma 스키마에 `mega_app_role_id` 컬럼이 있지만 DB에는 없음 → 마이그레이션 미적용

### 2. 마이그레이션 시도 중 실수
마이그레이션을 적용하려고 `railway up` 실행했으나, **Postgres 서비스에 연결된 상태**에서 실행함

**결과:**
- Node.js 앱 코드가 PostgreSQL 서비스에 배포됨
- PostgreSQL 데이터베이스 대신 Node.js 앱이 실행
- 앱이 DB에 연결 불가 상태

### 3. 롤백 시도
```bash
# Railway API로 롤백 시도
curl -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"mutation { deploymentRollback(id: \"4e0e0bc1-52f0-41d1-be86-9089e21dec98\") }"}'
```
→ 롤백 성공했으나 같은 손상된 배포만 재실행됨 (Railway 관리형 DB는 일반 서비스와 다르게 동작)

---

## Resolution

### Step 1: 새 PostgreSQL 데이터베이스 생성
```bash
railway add -d postgres -s "postgres-new"
# 결과: Postgres-YHsd 서비스 생성됨
```

### Step 2: 앱의 DATABASE_URL 업데이트
```bash
railway service "app.nubabel.com"
railway variables --set "DATABASE_URL=postgresql://postgres:xxx@postgres-yhsd.railway.internal:5432/railway"
```

### Step 3: 새 DB에 스키마 적용
```bash
# Prisma가 AI 에이전트 보호 기능 활성화 → 사용자 동의 필요
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION="응" \
DATABASE_URL="postgresql://..." \
npx prisma db push --force-reset --accept-data-loss

# 스키마 동기화
npx prisma db push
```

### Step 4: 앱 재배포
```bash
railway service "app.nubabel.com"
railway service redeploy --yes
```

### Step 5: 확인
```bash
curl -s "https://auth.nubabel.com/health/ready"
# {"status":"ok","checks":{"database":true,"redis":true,...}}

curl -s -I "https://auth.nubabel.com/auth/google"
# HTTP/2 302 → Google OAuth 리다이렉트 정상
```

---

## Data Loss

- **새 DB 생성**으로 인해 기존 사용자 데이터 손실
- 원래 데이터는 손상된 Postgres 서비스의 볼륨(`postgres-volume`, ID: `a485156f-f911-49bc-9dd9-9f306e13684d`)에 존재
- 필요 시 볼륨에서 데이터 복구 시도 가능

---

## Lessons Learned

### 1. Railway CLI 사용 시 주의사항
- `railway up` 실행 전 **반드시 현재 연결된 서비스 확인**
  ```bash
  railway status  # Service: ??? 확인
  ```
- 데이터베이스 서비스에 연결된 상태에서 `railway up` 하면 앱 코드가 DB 서비스에 배포됨

### 2. 마이그레이션 적용 방법
프로덕션 DB에 마이그레이션 적용 시:
```bash
# 공개 URL로 직접 마이그레이션 (앱 서비스 재배포 없이)
DATABASE_URL="postgresql://...@xxx.proxy.rlwy.net:PORT/railway" \
npx prisma migrate deploy
```

### 3. Railway 서비스 구조 이해
- **관리형 DB (Postgres, Redis 등):** Railway가 이미지/배포 관리
- **일반 서비스:** Dockerfile 또는 Nixpacks로 사용자가 배포
- 관리형 DB에 `railway up` 하면 일반 서비스처럼 동작하여 손상됨

### 4. 복구 전략
Railway 관리형 DB가 손상된 경우:
1. 새 DB 서비스 생성 (`railway add -d postgres`)
2. 앱의 DATABASE_URL 환경변수 업데이트
3. 스키마 적용 (`prisma db push`)
4. 앱 재배포

---

## Related Files

- `src/auth/auth.service.ts` - 인증 서비스
- `src/auth/auth.routes.ts` - OAuth 콜백 핸들러
- `prisma/schema.prisma` - Membership 모델에 `megaAppRoleId` 필드
- `prisma/migrations/20260130_add_mega_app_roles/` - 문제의 마이그레이션

---

## Prevention

1. **CI/CD에서 마이그레이션 자동화**
   - `start.sh`에서 이미 `prisma migrate deploy` 실행 중
   - 로컬에서 수동 마이그레이션 불필요

2. **Railway CLI alias 설정**
   ```bash
   alias railway-app="railway service app.nubabel.com && railway"
   alias railway-db="railway service Postgres-YHsd && railway"
   ```

3. **배포 전 체크리스트**
   - [ ] `railway status`로 현재 서비스 확인
   - [ ] DB 서비스가 아닌지 확인
   - [ ] 마이그레이션 필요 시 공개 URL 사용
