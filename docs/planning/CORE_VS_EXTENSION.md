# Nubabel Core vs Kyndof Extension 구분 가이드

**작성일**: 2026-01-25  
**목적**: Nubabel 플랫폼과 Kyndof 특수 기능을 명확히 구분

---

## 📋 기본 원칙

### Nubabel Core (범용 플랫폼)
**모든 회사가 사용할 수 있는 공통 기능**

```
✅ Nubabel Core에 포함:
- Multi-tenant 인증 시스템
- 조직/사용자 관리
- Workflow 엔진 (범용)
- MCP 통합 (Notion, Slack 등)
- AI Agent 시스템 (범용)
- Dashboard UI/UX
- Settings 관리
```

### Kyndof Extension (특수 기능)
**패션/봉제 산업에 특화된 기능**

```
✅ Kyndof Extension에 포함:
- 봉제 공정 관리 (ProductionOrder, WorkStation)
- 품질 검사 시스템 (QualityInspection)
- 3D 디자인 자산 관리 (3DAsset)
- 의류 특화 AI Agent
- 패턴 학습 시스템
```

---

## 🏗️ 아키텍처 구분

### 디렉토리 구조

```
nubabel/                          # Nubabel Core
├── src/                          # ✅ 범용 백엔드
│   ├── auth/                     # ✅ 범용 인증
│   ├── api/                      # ✅ 범용 API
│   │   ├── workflows.ts          # ✅ 범용 워크플로우
│   │   └── notion.ts             # ✅ 범용 MCP 설정
│   ├── mcp-servers/              # ✅ 범용 MCP
│   │   └── notion/               # ✅ 범용 Notion 통합
│   └── middleware/               # ✅ 범용 미들웨어
│
├── prisma/                       # ✅ 범용 스키마
│   └── schema.prisma             # ✅ Core 테이블만
│       ├── Organization          # ✅
│       ├── User                  # ✅
│       ├── Workflow              # ✅
│       ├── WorkflowExecution     # ✅
│       ├── NotionConnection      # ✅
│       └── ...
│
├── frontend/                     # ✅ 범용 프론트엔드
│   └── src/
│       ├── pages/                # ✅ 범용 페이지
│       └── components/           # ✅ 범용 컴포넌트
│
└── extensions/                   # ❌ 특수 기능 (미구현)
    └── kyndof/                   # ❌ Kyndof 특화
        ├── prisma/               # ❌ Kyndof 전용 테이블
        ├── src/                  # ❌ Kyndof 전용 로직
        └── frontend/             # ❌ Kyndof 전용 UI
```

---

## 📊 현재 상태 (2026-01-25)

### ✅ Nubabel Core 구현됨
```
Backend:
├── Multi-tenant auth (Google OAuth)          ✅
├── Organization management                   ✅
├── Workflow engine                           ✅
├── Notion MCP integration                    ✅
└── API endpoints (workflows, notion)         ✅

Frontend:
├── Login page                                ✅
├── Dashboard layout                          ✅
├── Workflows page                            ✅
├── Executions page                           ✅
├── Settings page                             ✅
└── Notion settings page                      ✅

Database (Prisma):
├── Organization                              ✅
├── User                                      ✅
├── Membership                                ✅
├── Workflow                                  ✅
├── WorkflowExecution                         ✅
├── NotionConnection                          ✅
└── ... (11 core tables total)                ✅
```

### ❌ Kyndof Extension 미구현
```
extensions/kyndof/ 디렉토리 자체가 없음

계획:
├── Phase 4 이후 구현 예정
├── Kyndof 전용 테이블 분리
├── Extension API 설계
└── Plugin 시스템 구축
```

---

## ✅ Railway 배포 수정 (2026-01-25)

### 수정 내용:
1. **서버 바인딩**: `app.listen(port)` → `app.listen(port, '0.0.0.0')`
   - Railway/Docker 환경에서 외부 접근 가능하도록 변경
2. **에러 핸들링 강화**:
   - `server.on('error')` 추가
   - `process.on('SIGTERM')` 추가 (graceful shutdown)
   - `unhandledRejection`, `uncaughtException` 핸들러 추가
3. **로깅 개선**:
   - 서버 시작 성공 시 ✅ 이모지
   - Health check URL 출력
   - 에러 발생 시 상세 로그

## 🔧 레거시 정리 필요 항목

### 1. package.json
```json
현재: "name": "kyndof-corp-system"
변경: "name": "nubabel-platform"
```

### 2. frontend/package.json
```json
현재: "name": "kyndof-corp-frontend"
변경: "name": "nubabel-frontend"
```

### 3. 환경 변수 (참고용, 실제 값은 유지)
```bash
# 도메인 예시
BASE_DOMAIN=nubabel.com              # Core 플랫폼
# kyndof.nubabel.com                 # Kyndof 조직 subdomain
# companyb.nubabel.com               # 다른 회사 subdomain
```

### 4. 문서 제목들
```
❌ 변경 필요:
- ARCHITECTURE.md: "Kyndof Corp System" → "Nubabel Platform"
- API.md: "Kyndof Corp System" → "Nubabel Platform"
- frontend/FRONTEND_README.md 등

✅ 이미 정확함:
- PROJECT_IDENTITY.md: "Nubabel"
- NUBABEL_CORE_ARCHITECTURE.md: "Nubabel"
- KYNDOF_EXTENSION_GUIDE.md: Extension으로 구분됨
```

---

## 📝 작업 시 체크리스트

### 새 기능 추가 전 질문:
1. **이 기능은 모든 회사가 사용하는가?**
   - Yes → Nubabel Core
   - No → Extension (나중에 구현)

2. **이 기능은 특정 산업에 특화되었는가?**
   - No → Nubabel Core
   - Yes → Extension (나중에 구현)

3. **이 기능은 Kyndof만 필요한가?**
   - No → Nubabel Core
   - Yes → Extension (나중에 구현)

### 예시:

| 기능 | Core? | 이유 |
|------|-------|------|
| Google OAuth 로그인 | ✅ Core | 모든 회사가 사용 |
| Workflow 실행 | ✅ Core | 범용 자동화 |
| Notion 연동 | ✅ Core | 범용 도구 연동 |
| Slack Bot | ✅ Core | 범용 커뮤니케이션 |
| 봉제 공정 관리 | ❌ Extension | Kyndof 특화 |
| 품질 검사 AI | ❌ Extension | 패션 산업 특화 |
| 3D 디자인 자산 | ❌ Extension | Kyndof 특화 |

---

## 🎯 현재 프로젝트 초점

**Phase 2 (현재)**:
- ✅ Nubabel Core 기능만 구현
- ❌ Kyndof Extension은 나중에 (Phase 4+)

**작업 범위**:
```
현재 구현 중: Nubabel Core (범용 플랫폼)
├── Week 1-2: Dashboard              ✅
├── Week 3-4: Workflow Engine        ✅
├── Week 5-8: Notion MCP             ✅ 95%
└── Week 9-12: Slack Bot             ⏳

Kyndof 특화 기능: 보류 (Phase 4 이후)
```

---

## 📚 참고 문서

- **Core 아키텍처**: [NUBABEL_CORE_ARCHITECTURE.md](../../NUBABEL_CORE_ARCHITECTURE.md)
- **Extension 가이드**: [KYNDOF_EXTENSION_GUIDE.md](../../KYNDOF_EXTENSION_GUIDE.md)
- **프로젝트 비전**: [PROJECT_IDENTITY.md](../../PROJECT_IDENTITY.md)

---

## ✅ 요약

**원칙**: 
- **Nubabel = 범용 플랫폼** (모든 회사가 사용)
- **Kyndof = Extension** (패션/봉제 특화, 나중에 구현)

**현재 작업**:
- ✅ Nubabel Core만 구현 중
- ❌ "Kyndof Corp System" 같은 레거시 이름 정리 필요
- ❌ Kyndof 특화 기능은 아직 구현 안 함

**레거시 정리**:
- package.json 이름 변경
- 문서 제목들 "Nubabel Platform"으로 통일
- 코드에서 "kyndof-corp" 참조 제거
