# Nubabel 문서 구조

문서가 모듈화되어 있습니다. 각 폴더별로 상세 문서가 있습니다.

## 📂 문서 구조

```
docs/
├── README.md                    (이 파일)
├── planning/                    기획 문서
│   ├── 01-project-identity.md
│   ├── 02-roadmap.md
│   └── 03-extension-strategy.md
│
├── core/                        Core Platform 문서
│   ├── 01-architecture.md
│   ├── 02-authentication.md
│   ├── 03-database-schema.md
│   ├── 04-workflow-engine.md
│   └── 05-agent-system.md
│
├── frontend/                    Frontend 문서
│   ├── 01-setup.md
│   ├── 02-components.md
│   ├── 03-routing.md
│   └── 04-state-management.md
│
├── extensions/                  Extension 개발 문서
│   ├── 01-overview.md
│   ├── 02-kyndof-spec.md
│   └── 03-development-guide.md
│
└── deployment/                  배포 문서
    ├── 01-railway.md
    ├── 02-godaddy-dns.md
    └── 03-google-oauth.md
```

## 🎯 시작 가이드

### 처음 보시는 분
1. `/docs/planning/01-project-identity.md` - 프로젝트 정체성
2. `/docs/planning/02-roadmap.md` - 로드맵
3. `/docs/core/01-architecture.md` - 아키텍처

### Frontend 개발자
1. `/docs/frontend/01-setup.md` - 개발 환경 셋업
2. `/docs/frontend/02-components.md` - 컴포넌트 구조

### Backend 개발자
1. `/docs/core/01-architecture.md` - Core 아키텍처
2. `/docs/core/03-database-schema.md` - DB 스키마

### Extension 개발자
1. `/docs/extensions/01-overview.md` - Extension 개요
2. `/docs/extensions/03-development-guide.md` - 개발 가이드

### DevOps
1. `/docs/deployment/01-railway.md` - Railway 배포
2. `/docs/deployment/02-godaddy-dns.md` - DNS 설정

## 📝 문서 작성 원칙

1. **한 파일 = 한 주제**
   - 1개 파일은 300줄 이내로 제한
   - 너무 길면 분리

2. **번호 체계**
   - `01-`, `02-` 순서로 읽기 권장 순서 표시

3. **상호 참조**
   - 다른 문서 참조 시 상대 경로 사용
   - 예: `참조: [인증 시스템](../core/02-authentication.md)`

4. **코드 예시**
   - 실제 동작하는 코드만 포함
   - 의사코드는 명확히 표시

## 🔄 기존 문서 마이그레이션

기존 루트의 긴 문서들을 분리 중입니다:

- ~~`PROJECT_IDENTITY.md`~~ → `docs/planning/01-project-identity.md`
- ~~`NUBABEL_CORE_ARCHITECTURE.md`~~ → `docs/core/01-architecture.md`
- ~~`KYNDOF_EXTENSION_GUIDE.md`~~ → `docs/extensions/02-kyndof-spec.md`
- ~~`RAILWAY_DEPLOYMENT.md`~~ → `docs/deployment/01-railway.md`

## 📌 빠른 링크

| 문서 | 설명 | 상태 |
|------|------|------|
| [Project Identity](planning/01-project-identity.md) | 프로젝트 정체성 | ✅ |
| [Roadmap](planning/02-roadmap.md) | 단계별 로드맵 | ✅ |
| [Core Architecture](core/01-architecture.md) | 코어 아키텍처 | ✅ |
| [Database Schema](core/03-database-schema.md) | DB 스키마 | ✅ |
| [Frontend Setup](frontend/01-setup.md) | 프론트 셋업 | 🚧 |
| [Railway Deploy](deployment/01-railway.md) | Railway 배포 | ✅ |
