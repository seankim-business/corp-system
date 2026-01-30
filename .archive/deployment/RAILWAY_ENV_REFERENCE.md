# Railway 환경변수 참조 가이드

**프로젝트**: Nubabel Production  
**버전**: 1.0  
**마지막 업데이트**: 2026-01-26

---

## 📋 환경변수 목록

### 필수 환경변수 (반드시 설정)

#### 기본 설정

| 변수            | 값                         | 설명                          |
| --------------- | -------------------------- | ----------------------------- |
| `NODE_ENV`      | `production`               | Node.js 환경                  |
| `PORT`          | `3000`                     | 서버 포트                     |
| `BASE_URL`      | `https://auth.nubabel.com` | 애플리케이션 기본 URL         |
| `BASE_DOMAIN`   | `nubabel.com`              | 기본 도메인                   |
| `COOKIE_DOMAIN` | `.nubabel.com`             | 쿠키 도메인 (서브도메인 공유) |

#### 데이터베이스

| 변수               | 값                             | 설명                       |
| ------------------ | ------------------------------ | -------------------------- |
| `DATABASE_URL`     | `${{ Postgres.DATABASE_URL }}` | PostgreSQL 연결 URL (자동) |
| `REDIS_URL`        | `${{ Redis.REDIS_URL }}`       | Redis 연결 URL (자동)      |
| `BULLMQ_REDIS_URL` | `${{ Redis.REDIS_URL }}`       | BullMQ Redis URL (자동)    |

#### JWT 인증

| 변수                     | 값                                             | 설명                    |
| ------------------------ | ---------------------------------------------- | ----------------------- |
| `JWT_SECRET`             | `57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=` | JWT 서명 시크릿         |
| `JWT_EXPIRES_IN`         | `7d`                                           | JWT 만료 시간           |
| `JWT_REFRESH_EXPIRES_IN` | `30d`                                          | 리프레시 토큰 만료 시간 |

#### Google OAuth (필수)

| 변수                   | 값                                              | 설명                           |
| ---------------------- | ----------------------------------------------- | ------------------------------ |
| `GOOGLE_CLIENT_ID`     | `[사용자 입력]`                                 | Google OAuth 클라이언트 ID     |
| `GOOGLE_CLIENT_SECRET` | `[사용자 입력]`                                 | Google OAuth 클라이언트 시크릿 |
| `GOOGLE_REDIRECT_URI`  | `https://auth.nubabel.com/auth/google/callback` | OAuth 콜백 URL                 |

---

### 선택사항 환경변수

#### 로깅

| 변수        | 값     | 설명                                 |
| ----------- | ------ | ------------------------------------ |
| `LOG_LEVEL` | `warn` | 로그 레벨 (debug, info, warn, error) |

#### Slack Bot (선택사항)

| 변수                   | 값         | 설명                         |
| ---------------------- | ---------- | ---------------------------- |
| `SLACK_BOT_TOKEN`      | `xoxb-...` | Slack Bot 토큰               |
| `SLACK_APP_TOKEN`      | `xapp-...` | Slack App 토큰 (Socket Mode) |
| `SLACK_SIGNING_SECRET` | `[시크릿]` | Slack 서명 시크릿            |
| `SLACK_SOCKET_MODE`    | `true`     | Socket Mode 활성화           |
| `SLACK_LOG_LEVEL`      | `WARN`     | Slack 로그 레벨              |

#### 큐 설정 (Slack Bot 사용 시)

| 변수                              | 값   | 설명                     |
| --------------------------------- | ---- | ------------------------ |
| `QUEUE_SLACK_CONCURRENCY`         | `10` | Slack 큐 동시성          |
| `QUEUE_ORCHESTRATION_CONCURRENCY` | `5`  | 오케스트레이션 큐 동시성 |
| `QUEUE_NOTIFICATION_CONCURRENCY`  | `20` | 알림 큐 동시성           |

#### AI 서비스 (선택사항)

| 변수                   | 값                                | 설명                 |
| ---------------------- | --------------------------------- | -------------------- |
| `ANTHROPIC_API_KEY`    | `sk-...`                          | Anthropic API 키     |
| `OHMYOPENCODE_API_URL` | `https://api.ohmyopencode.com/v1` | OhMyOpenCode API URL |
| `OHMYOPENCODE_API_KEY` | `[API 키]`                        | OhMyOpenCode API 키  |

#### 모니터링 (선택사항)

| 변수         | 값            | 설명                 |
| ------------ | ------------- | -------------------- |
| `SENTRY_DSN` | `https://...` | Sentry 에러 추적 DSN |

---

## 🔧 Railway에서 환경변수 설정 방법

### 방법 1: UI를 통한 설정 (권장)

```
1. Node.js 서비스 클릭
2. "Variables" 탭 열기
3. "Add Variable" 클릭
4. Key와 Value 입력
5. "Save" 클릭
```

### 방법 2: Raw Editor 사용

```
1. Node.js 서비스 → "Variables"
2. "Raw Editor" 클릭
3. 다음 형식으로 입력:

NODE_ENV=production
PORT=3000
BASE_URL=https://auth.nubabel.com
...

4. "Save" 클릭
```

### 방법 3: 자동 연결 (데이터베이스)

Railway는 자동으로 데이터베이스 환경변수를 생성합니다:

```
DATABASE_URL=${{ Postgres.DATABASE_URL }}
REDIS_URL=${{ Redis.REDIS_URL }}
```

---

## 📝 설정 템플릿

### 최소 설정 (필수만)

```bash
# 기본
NODE_ENV=production
PORT=3000
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com

# 데이터베이스
DATABASE_URL=${{ Postgres.DATABASE_URL }}
REDIS_URL=${{ Redis.REDIS_URL }}
BULLMQ_REDIS_URL=${{ Redis.REDIS_URL }}

# JWT
JWT_SECRET=57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth
GOOGLE_CLIENT_ID=[입력 필요]
GOOGLE_CLIENT_SECRET=[입력 필요]
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback

# 로깅
LOG_LEVEL=warn
```

### 전체 설정 (모든 기능)

```bash
# 기본
NODE_ENV=production
PORT=3000
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com

# 데이터베이스
DATABASE_URL=${{ Postgres.DATABASE_URL }}
REDIS_URL=${{ Redis.REDIS_URL }}
BULLMQ_REDIS_URL=${{ Redis.REDIS_URL }}

# JWT
JWT_SECRET=57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Google OAuth
GOOGLE_CLIENT_ID=[입력 필요]
GOOGLE_CLIENT_SECRET=[입력 필요]
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback

# Slack Bot
SLACK_BOT_TOKEN=xoxb-[입력 필요]
SLACK_APP_TOKEN=xapp-[입력 필요]
SLACK_SIGNING_SECRET=[입력 필요]
SLACK_SOCKET_MODE=true
SLACK_LOG_LEVEL=WARN

# 큐 설정
QUEUE_SLACK_CONCURRENCY=10
QUEUE_ORCHESTRATION_CONCURRENCY=5
QUEUE_NOTIFICATION_CONCURRENCY=20

# AI 서비스
ANTHROPIC_API_KEY=sk-[입력 필요]
OHMYOPENCODE_API_URL=https://api.ohmyopencode.com/v1
OHMYOPENCODE_API_KEY=[입력 필요]

# 모니터링
SENTRY_DSN=https://[입력 필요]

# 로깅
LOG_LEVEL=warn
```

---

## 🔐 보안 주의사항

### 시크릿 관리

✅ **안전한 방법**:

- Railway의 Variables 섹션에 입력 (자동 암호화)
- 환경변수는 마스킹되어 표시됨
- 로그에 시크릿이 노출되지 않음

❌ **위험한 방법**:

- 코드에 하드코딩
- Git에 커밋
- 로그에 출력
- 이메일로 전송

### 시크릿 생성

**JWT_SECRET 생성**:

```bash
openssl rand -base64 32
# 출력: 57zvUXddDGcimZWrPahW0qziywAcczYScq4x9z8wYj0=
```

**Google OAuth 시크릿**:

1. Google Cloud Console 방문
2. OAuth 2.0 클라이언트 생성
3. 클라이언트 ID와 시크릿 복사

**Slack 토큰**:

1. Slack App 생성
2. Bot Token 복사
3. App Token 복사 (Socket Mode)

---

## ✅ 검증 체크리스트

### 배포 전 확인

- [ ] `NODE_ENV=production` 설정
- [ ] `DATABASE_URL` 자동 연결 확인
- [ ] `REDIS_URL` 자동 연결 확인
- [ ] `JWT_SECRET` 설정
- [ ] `GOOGLE_CLIENT_ID` 설정
- [ ] `GOOGLE_CLIENT_SECRET` 설정
- [ ] `GOOGLE_REDIRECT_URI` 설정

### 배포 후 확인

- [ ] 헬스 체크 통과
- [ ] 데이터베이스 연결 확인
- [ ] Redis 연결 확인
- [ ] 인증 엔드포인트 작동
- [ ] 로그 레벨 확인

---

## 🔗 관련 문서

- [RAILWAY_SETUP_GUIDE.md](RAILWAY_SETUP_GUIDE.md) - 상세 설정 가이드
- [RAILWAY_QUICK_START.md](RAILWAY_QUICK_START.md) - 빠른 시작
- [RAILWAY_DEPLOYMENT_CHECKLIST.md](RAILWAY_DEPLOYMENT_CHECKLIST.md) - 배포 체크리스트
- [.env.production](.env.production) - 환경변수 템플릿

---

## 📞 문제 해결

### 환경변수가 적용되지 않음

**증상**: 환경변수 설정 후에도 이전 값 사용

**해결**:

1. 변수 저장 확인
2. 서비스 재배포
3. 캐시 초기화

### 데이터베이스 연결 실패

**증상**: `DATABASE_URL` 설정했지만 연결 실패

**해결**:

1. `${{ Postgres.DATABASE_URL }}` 형식 확인
2. PostgreSQL 서비스 상태 확인
3. 네트워크 연결 확인

### 시크릿 노출

**증상**: 로그에 시크릿이 보임

**해결**:

1. 시크릿 재생성
2. 로그 필터링 설정
3. Sentry에서 민감한 데이터 마스킹

---

**환경변수 설정 완료! ✅**
