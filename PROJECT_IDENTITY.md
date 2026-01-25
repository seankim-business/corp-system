# Nubabel - 프로젝트 정체성 정의

**작성일**: 2026-01-25  
**버전**: 1.0

---

## 📌 핵심 정의

### Nubabel이란?

**Nubabel**은 **멀티테넌트 B2B SaaS AI 워크플로우 프레임워크**입니다.

```
회사들이 각자의 업무 프로세스를 AI Agent로 자동화할 수 있는 플랫폼
- 처음엔 Kyndof 사내 시스템으로 시작
- 점진적으로 다른 회사에도 판매 가능한 제품으로 발전
- 각 회사는 독립된 데이터와 커스텀 워크플로우를 가짐
```

---

## 🏢 회사 vs 제품

| 항목 | 이름 | 설명 |
|------|------|------|
| **회사** | Kyndof | 패션 테크 회사 (봉제/3D프린팅 등) |
| **제품** | Nubabel | AI 워크플로우 자동화 플랫폼 |
| **고객** | Kyndof (내부) → 외부 B2B 확장 | 처음엔 자체 사용, 나중에 판매 |

**비유**:
- Slack(회사)이 만든 Slack(제품)
- Notion(회사)이 만든 Notion(제품)
- Kyndof(회사)가 만든 Nubabel(제품)

---

## 🎯 제품 전략

### Phase 1: Internal Tool (현재 ~ 6개월)
```
Kyndof만 사용하는 사내 시스템
├── 멀티테넌트 아키텍처 (나중 확장 대비)
├── Kyndof 특수 니즈 구현 (봉제/3D프린팅 등)
└── 프레임워크 기반 설계 (재사용 가능)

목표: Kyndof 업무 50% 자동화
```

### Phase 2: Framework Evolution (6개월 ~ 1년)
```
Kyndof 특수 니즈를 분리
├── Core Platform (공통 기능)
│   ├── Multi-Agent Orchestration
│   ├── Workflow Module System
│   ├── RABSIC Permission Engine
│   └── MCP Integration (Notion/Slack/Drive)
│
└── Kyndof Extensions (특수 기능)
    ├── Physical Production Tracking
    ├── Quality Inspection AI
    └── Learning Feedback Loop

목표: 프레임워크 80% 완성
```

### Phase 3: B2B SaaS (1년 ~ 2년)
```
외부 회사에 판매
├── 다른 회사도 사용 가능한 일반화된 플랫폼
├── 회사별 커스텀 워크플로우 지원
└── Self-service Automation Builder

목표: 첫 외부 고객 3개 확보
```

---

## 🏗️ 아키텍처 전략

### 레이어 분리

```
┌─────────────────────────────────────────────────┐
│ Nubabel Core Platform (모든 회사 공통)           │
│ ├── Authentication & Authorization              │
│ ├── Multi-Agent Orchestration                   │
│ ├── Workflow Module System                      │
│ ├── MCP Server Integration                      │
│ └── Web Dashboard                                │
└─────────────────────────────────────────────────┘
                      ▲
                      │
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼──────────┐    ┌───────────▼──────────┐
│ Kyndof Extensions│    │ Company B Extensions │
│ - 봉제 워크플로우 │    │ - 특수 니즈 1        │
│ - 3D프린팅 연동   │    │ - 특수 니즈 2        │
│ - 품질 검사 AI    │    │ - ...                │
└──────────────────┘    └──────────────────────┘
```

### 데이터 분리 전략

**1. 공통 테이블 (모든 회사 공유 스키마)**
```sql
-- Core Platform
organizations          -- 회사 정보
users                  -- 사용자
memberships           -- 조직-사용자 관계
workspace_domains     -- Google Workspace 도메인
sessions              -- 세션
agents                -- AI Agent 정의
workflows             -- 워크플로우 템플릿
```

**2. 회사별 테이블 (tenant_id로 격리)**
```sql
-- Kyndof-specific (tenant_id = kyndof_org_id)
kyndof_production_orders    -- 생산 주문
kyndof_quality_inspections  -- 품질 검사
kyndof_fabric_inventory     -- 원단 재고

-- Company B-specific (tenant_id = companyb_org_id)
companyb_custom_data_1
companyb_custom_data_2
```

**3. PostgreSQL RLS (Row-Level Security)**
```sql
-- 모든 테이블에 자동 필터링
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON workflows
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## 📍 현재 위치

### ✅ 완성된 것 (Phase 1 - 10%)

```
Core Platform Foundation
├── Multi-tenant Authentication ✅
│   ├── Google Workspace OAuth
│   ├── JWT Session Management
│   └── Organization Switching
│
├── Database Architecture ✅
│   ├── Prisma Schema (9 tables)
│   ├── Row-Level Security
│   └── Multi-tenant Isolation
│
└── Deployment Configuration ✅
    ├── Docker + Railway
    ├── PostgreSQL + Redis
    └── Custom Domain (auth.nubabel.com)
```

### 🚧 다음 우선순위 (Phase 1 - 보이는 것부터)

```
1. Web Dashboard (2-3주)
   ├── Login Page (Google OAuth)
   ├── Organization Dashboard
   ├── User Management
   └── Basic Settings

2. First Automation (4-5주)
   ├── Simple Workflow Engine
   ├── Notion MCP Integration
   ├── Slack Bot Interface
   └── Manual Trigger (버튼 클릭)

3. Agent System MVP (6-8주)
   ├── Single Function Agent
   ├── Task Execution Framework
   ├── Execution Log Viewer
   └── Success/Failure Handling
```

### 📅 장기 로드맵 (나중에 추가)

```
Phase 2-3 (6개월 이후)
├── Multi-Agent Orchestration (Prometheus/Atlas)
├── Self-Service Automation Builder
├── "Human as Training Data" System
└── Kyndof Extensions (봉제/3D프린팅)
```

---

## 🎨 브랜딩 가이드라인

### 이름 사용법

| 컨텍스트 | 사용할 이름 | 예시 |
|----------|-------------|------|
| 제품명 | **Nubabel** | "Nubabel로 업무를 자동화하세요" |
| 도메인 | `nubabel.com` | `https://auth.nubabel.com` |
| 코드/파일명 | `nubabel-*` | `nubabel-core`, `nubabel-agent` |
| Git Repo | `nubabel-platform` | (현재는 `corp-system`) |
| 회사명 (내부) | Kyndof | "Kyndof가 개발한 Nubabel" |
| 마케팅 | Nubabel by Kyndof | "AI-powered workflow automation" |

### 로고/비주얼 (미정)
- 주 컬러: TBD
- 폰트: TBD
- 로고: TBD

---

## 🚀 개발 원칙

### 1. Framework-First Thinking

**나쁜 예시**:
```typescript
// Kyndof 특수 로직이 Core에 섞임
if (company === 'kyndof') {
  await trackProductionOrder();
}
```

**좋은 예시**:
```typescript
// Core Platform (공통)
class WorkflowEngine {
  async execute(workflow: Workflow) {
    await this.pluginManager.runHooks('before_execute', workflow);
    // ...
  }
}

// Kyndof Extension (분리)
class KyndofProductionPlugin implements Plugin {
  onBeforeExecute(workflow: Workflow) {
    if (workflow.type === 'production_order') {
      await this.trackProductionOrder();
    }
  }
}
```

### 2. Multi-Tenant by Default

모든 기능은 처음부터 멀티테넌트를 고려:
- DB 쿼리에 항상 `tenant_id` 조건
- 파일 저장 시 조직별 디렉토리
- 캐시 키에 조직 ID 포함

### 3. Progressive Enhancement

**보이는 것부터 구현 → 점진적 고도화**

```
Week 1-2:   로그인 + 대시보드 (수동)
Week 3-4:   워크플로우 수동 실행
Week 5-8:   간단한 자동화 (스케줄, 트리거)
Month 3-6:  AI Agent 추가
Month 6-12: 학습 시스템
Year 2:     "Human as Training Data"
```

---

## 📝 문서 정리 계획

### 삭제/통합할 문서
- [ ] `ARCHITECTURE.md` → `NUBABEL_ARCHITECTURE.md` (Core만)
- [ ] `README.md` → Nubabel 중심으로 전면 개편
- [ ] Kyndof 특수 내용 → `KYNDOF_EXTENSIONS.md`로 분리

### 새로 작성할 문서
- [ ] `NUBABEL_VISION.md` - 제품 비전
- [ ] `FRAMEWORK_DESIGN.md` - 확장 가능한 설계
- [ ] `TENANT_SEPARATION_GUIDE.md` - 멀티테넌트 개발 가이드
- [ ] `EXTENSION_DEVELOPMENT.md` - 회사별 커스터마이징 방법

---

## 💬 FAQ

### Q: Kyndof 관련 코드는 어디에?
A: 별도 디렉토리로 분리 예정
```
/core/                  # Nubabel Core Platform
/extensions/kyndof/     # Kyndof-specific features
/extensions/template/   # 다른 회사용 템플릿
```

### Q: 다른 회사가 사용할 때 Kyndof 기능이 보이나요?
A: 아니요. Extension은 조직별로 활성화됩니다.
```typescript
const enabledExtensions = await getExtensionsForTenant(tenantId);
// Kyndof → ['production-tracking', 'quality-ai']
// Company B → ['custom-crm', 'inventory-mgmt']
```

### Q: 지금 "Human as Training Data"를 구현하나요?
A: 아니요. **장기 비전**입니다. Phase 3 이후 (1-2년 후)
- 지금: 수동 + 간단한 자동화
- 6개월 후: AI Agent 추가
- 1년 후: 학습 시스템 시작
- 2년 후: 완전 자동화

### Q: 봉제/3D프린팅은 언제?
A: Kyndof Extension으로 **Web Dashboard 완성 후** 구현
1. Core Platform 먼저 (3개월)
2. 그 다음 Kyndof Extensions (3개월)

---

## ✅ Action Items

### 즉시 (이번 주)
- [x] PROJECT_IDENTITY.md 작성 (이 문서)
- [ ] README.md 전면 개편
- [ ] ARCHITECTURE.md → Core 중심으로 재작성
- [ ] 디렉토리 구조 재설계 제안

### 단기 (이번 달)
- [ ] Railway 배포
- [ ] Web Dashboard 개발 시작
- [ ] Kyndof Extension 분리 계획 수립

### 중기 (3개월)
- [ ] 첫 외부 회사 PoC 준비
- [ ] Extension Marketplace 설계

---

**이 문서는 Nubabel 프로젝트의 North Star입니다.**  
모든 의사결정은 이 정의를 기준으로 합니다.
