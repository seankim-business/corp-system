# Nubabel - 디렉토리 구조 재설계 제안

**버전**: 1.0  
**작성일**: 2026-01-25  
**목적**: Core Platform과 Extension 분리

---

## 🎯 재설계 목표

### 현재 문제점
```
현재 구조:
/src/          ← Core와 특수 기능이 섞여있음
/prisma/       ← 모든 테이블이 하나의 schema에
/frontend/     ← 일반 기능인지 킨도프 전용인지 불명확
```

### 해결 방안
```
명확한 분리:
/packages/core/           ← Nubabel Core Platform (공통)
/packages/extensions/     ← 회사별 Extension
/apps/web-dashboard/      ← Core Dashboard (공통 UI)
/apps/kyndof-dashboard/   ← Kyndof 전용 UI (필요시)
```

---

## 📂 제안하는 새 구조

### Monorepo 구조 (권장)

```
nubabel/                              # Root
│
├── package.json                       # Workspace 설정 (pnpm/yarn)
├── turbo.json                         # Turborepo 설정 (선택)
├── tsconfig.base.json                 # 공통 TypeScript 설정
├── .env.example
├── docker-compose.yml
│
├── docs/                              # 문서
│   ├── PROJECT_IDENTITY.md
│   ├── README.md
│   ├── NUBABEL_CORE_ARCHITECTURE.md
│   ├── RAILWAY_DEPLOYMENT.md
│   └── EXTENSION_DEVELOPMENT.md
│
├── packages/                          # 공유 패키지
│   │
│   ├── core/                          # ⭐ Nubabel Core Platform
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── auth/                  # 인증 시스템
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── auth.routes.ts
│   │   │   │   └── oauth/
│   │   │   │       └── google.strategy.ts
│   │   │   │
│   │   │   ├── workflow/              # 워크플로우 엔진 (Phase 2)
│   │   │   │   ├── engine.ts
│   │   │   │   ├── executor.ts
│   │   │   │   └── scheduler.ts
│   │   │   │
│   │   │   ├── agent/                 # AI Agent 시스템 (Phase 3)
│   │   │   │   ├── agent-registry.ts
│   │   │   │   ├── task-delegator.ts
│   │   │   │   └── background-queue.ts
│   │   │   │
│   │   │   ├── plugin/                # Extension 시스템
│   │   │   │   ├── plugin-manager.ts
│   │   │   │   ├── hook-system.ts
│   │   │   │   └── event-bus.ts
│   │   │   │
│   │   │   ├── middleware/            # Express 미들웨어
│   │   │   │   ├── tenant-resolver.ts
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   └── permission.middleware.ts
│   │   │   │
│   │   │   ├── db/                    # 데이터베이스
│   │   │   │   ├── client.ts          # Prisma client
│   │   │   │   └── types.ts
│   │   │   │
│   │   │   └── index.ts               # Core Platform export
│   │   │
│   │   └── prisma/                    # Core 스키마만
│   │       ├── schema.prisma          # Core tables
│   │       └── migrations/
│   │
│   ├── ui/                            # 공유 UI 컴포넌트
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   └── Modal.tsx
│   │   │   └── hooks/
│   │   │       ├── useAuth.ts
│   │   │       └── useOrganization.ts
│   │   └── tailwind.config.js
│   │
│   └── shared/                        # 공통 유틸리티
│       ├── package.json
│       └── src/
│           ├── types/                 # 공통 타입
│           ├── utils/                 # 유틸 함수
│           └── constants/             # 상수
│
├── extensions/                        # 회사별 Extension
│   │
│   ├── kyndof/                        # ⭐ Kyndof Extension
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts               # Extension 진입점
│   │   │   │
│   │   │   ├── production/            # 생산 관리
│   │   │   │   ├── production.service.ts
│   │   │   │   ├── production.routes.ts
│   │   │   │   └── tracking.ts
│   │   │   │
│   │   │   ├── quality/               # 품질 검사 AI
│   │   │   │   ├── quality-ai.service.ts
│   │   │   │   ├── vision-inspector.ts
│   │   │   │   └── defect-detector.ts
│   │   │   │
│   │   │   ├── learning/              # 학습 시스템 (장기)
│   │   │   │   ├── activity-tracker.ts
│   │   │   │   ├── pattern-detector.ts
│   │   │   │   └── feedback-loop.ts
│   │   │   │
│   │   │   └── hooks/                 # Core Hook 구현
│   │   │       ├── workflow-hooks.ts
│   │   │       └── agent-hooks.ts
│   │   │
│   │   └── prisma/                    # Kyndof 전용 테이블
│   │       ├── schema.prisma
│   │       └── migrations/
│   │
│   └── template/                      # 다른 회사용 템플릿
│       ├── README.md                  # Extension 개발 가이드
│       ├── package.json
│       └── src/
│           └── index.ts               # 최소 구현 예시
│
└── apps/                              # 애플리케이션
    │
    ├── api/                           # ⭐ Main API Server
    │   ├── package.json
    │   ├── Dockerfile
    │   ├── src/
    │   │   ├── index.ts               # Express server
    │   │   ├── routes/
    │   │   │   ├── auth.routes.ts
    │   │   │   ├── workflow.routes.ts
    │   │   │   └── agent.routes.ts
    │   │   └── config/
    │   │       ├── env.ts
    │   │       └── extensions.ts      # 활성화된 Extension 목록
    │   └── prisma/
    │       └── schema.prisma          # Core + Extensions 통합
    │
    ├── web-dashboard/                 # ⭐ Web Dashboard (Core UI)
    │   ├── package.json
    │   ├── vite.config.ts
    │   ├── src/
    │   │   ├── main.tsx
    │   │   ├── App.tsx
    │   │   ├── pages/
    │   │   │   ├── LoginPage.tsx
    │   │   │   ├── DashboardPage.tsx
    │   │   │   ├── WorkflowPage.tsx
    │   │   │   └── SettingsPage.tsx
    │   │   ├── components/
    │   │   │   └── (페이지별 컴포넌트)
    │   │   ├── api/
    │   │   │   └── client.ts          # API 호출
    │   │   └── stores/
    │   │       ├── authStore.ts
    │   │       └── orgStore.ts
    │   └── tailwind.config.js
    │
    └── slack-bot/                     # Slack Bot (Phase 2)
        ├── package.json
        └── src/
            └── index.ts
```

---

## 🔄 마이그레이션 계획

### Phase 1: 현재 구조 유지하며 점진적 분리

```bash
# 1단계: Core만 packages/core로 이동
mkdir -p packages/core/src
mv src/auth packages/core/src/
mv src/middleware packages/core/src/
mv src/db packages/core/src/

# 2단계: API 서버 apps/api로 분리
mkdir -p apps/api/src
mv src/index.ts apps/api/src/

# 3단계: Frontend → web-dashboard
mv frontend apps/web-dashboard

# 4단계: Kyndof 전용 → extensions/kyndof
mkdir -p extensions/kyndof/src
# (아직 특수 기능 없으므로 나중에)
```

### Phase 2: Monorepo 설정 (선택)

```json
// package.json (root)
{
  "name": "nubabel",
  "private": true,
  "workspaces": [
    "packages/*",
    "extensions/*",
    "apps/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test"
  }
}
```

---

## 📦 패키지 의존성

### 의존성 그래프

```
apps/api
  ├─ depends on → packages/core
  └─ depends on → extensions/kyndof (if enabled)

apps/web-dashboard
  ├─ depends on → packages/ui
  └─ depends on → packages/shared

extensions/kyndof
  └─ depends on → packages/core (hooks, types)

packages/core
  └─ no dependencies (self-contained)
```

### Extension 활성화 설정

```typescript
// apps/api/src/config/extensions.ts
export const enabledExtensions = {
  kyndof: process.env.KYNDOF_EXTENSION === 'true',
  template: process.env.TEMPLATE_EXTENSION === 'true'
};

// 조직별 활성화
export const organizationExtensions = {
  'kyndof-org-id': ['kyndof'],
  'companyb-org-id': ['template']
};
```

---

## 🗄️ 데이터베이스 통합

### Prisma Schema 통합 방식

#### Option 1: 통합 스키마 (권장)

```prisma
// apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// CORE PLATFORM TABLES
// ============================================
model Organization {
  id String @id @default(uuid())
  // ... core fields
}

// ============================================
// KYNDOF EXTENSION TABLES
// ============================================
model KyndofProductionOrder {
  id             String @id @default(uuid())
  organizationId String @map("organization_id")
  // ... kyndof-specific fields
  
  @@map("kyndof_production_orders")
}
```

#### Option 2: 스키마 분리 + 병합 스크립트

```bash
# Build 시 자동 병합
npm run db:merge-schemas
  → packages/core/prisma/schema.prisma
  + extensions/kyndof/prisma/schema.prisma
  = apps/api/prisma/schema.prisma (generated)
```

---

## 🚀 개발 워크플로우

### 로컬 개발

```bash
# 1. 전체 설치
pnpm install

# 2. 개발 서버 실행 (모든 앱)
pnpm dev

# 3. 특정 앱만
pnpm --filter @nubabel/api dev
pnpm --filter @nubabel/web-dashboard dev

# 4. 빌드
pnpm build
```

### Extension 개발

```bash
# 1. 새 Extension 생성
pnpm create-extension my-company

# 2. Extension 개발
cd extensions/my-company
pnpm dev

# 3. Core에 등록
# apps/api/src/config/extensions.ts 수정
```

---

## 🎯 장단점 비교

### Monorepo 장점
✅ 코드 공유 쉬움  
✅ 의존성 관리 통합  
✅ 전체 빌드/테스트 일괄 처리  
✅ Extension 개발 편리  

### Monorepo 단점
❌ 초기 설정 복잡  
❌ CI/CD 설정 어려움 (캐싱 필요)  
❌ 프로젝트 크기 커짐  

### 현재 구조 유지 (단순)
✅ 간단함  
✅ 빠른 시작  
❌ Extension 분리 어려움  
❌ 코드 재사용 불편  

---

## 📊 권장 사항

### 지금 (Phase 1-2): 현재 구조 유지

```
이유:
- 아직 Extension 기능 없음
- Core만 개발 중
- Monorepo 오버엔지니어링

액션:
- 현재 구조에서 계속 개발
- packages/core 분리만 고려 (선택)
```

### 나중 (Phase 3-4): Monorepo 전환

```
시기:
- Kyndof Extension 구현 시작할 때
- 두 번째 회사 추가될 때

이유:
- Extension 분리 필요
- 코드 공유 증가
- 여러 앱 관리 필요
```

---

## 🔄 단계별 마이그레이션

### Step 1: Core 분리 (선택)

```bash
# packages/core/ 생성
mkdir -p packages/core/src

# 공통 코드 이동
mv src/auth packages/core/src/
mv src/middleware packages/core/src/
mv src/db packages/core/src/

# package.json 생성
cd packages/core
npm init -y
```

### Step 2: API 서버 분리

```bash
# apps/api/ 생성
mkdir -p apps/api/src

# 서버 코드 이동
mv src/index.ts apps/api/src/
mv src/routes apps/api/src/
```

### Step 3: Frontend → web-dashboard

```bash
mv frontend apps/web-dashboard
```

### Step 4: Extension 준비

```bash
mkdir -p extensions/kyndof/src
mkdir -p extensions/template/src
```

---

## 📝 체크리스트

### 지금 할 것
- [x] 문서 작성 (이 파일)
- [ ] 팀과 구조 논의
- [ ] 마이그레이션 시기 결정

### Phase 2 시작 시
- [ ] Monorepo 전환 여부 결정
- [ ] packages/core 분리
- [ ] apps/api 분리

### Phase 3 시작 시
- [ ] extensions/kyndof 생성
- [ ] Plugin 시스템 구현
- [ ] Extension 로딩 구현

---

## 🎯 결론

**현재 (Phase 1-2)**: 
```
현재 구조 유지 ✅
- 단순함
- 빠른 개발
```

**나중 (Phase 3+)**:
```
Monorepo 전환 고려 📋
- Extension 시작할 때
- 외부 회사 추가될 때
```

**점진적 마이그레이션**:
```
1. Core 분리 (선택)
2. API 분리 (선택)
3. Monorepo 전환 (Extension 필요시)
```

---

**이 문서는 제안서입니다. 실제 구조 변경은 필요시 진행하세요.**
