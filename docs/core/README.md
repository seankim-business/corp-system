# Core Platform 문서

Nubabel Core 플랫폼의 기술 문서입니다.

## 📚 문서 목록

| 문서 | 설명 | 상태 |
|------|------|------|
| [01-architecture.md](01-architecture.md) | 시스템 전체 아키텍처 | 🚧 |
| [02-authentication.md](02-authentication.md) | 멀티테넌트 인증 시스템 | 🚧 |
| [03-database-schema.md](03-database-schema.md) | PostgreSQL + RLS 스키마 | 🚧 |
| [04-workflow-engine.md](04-workflow-engine.md) | 워크플로우 실행 엔진 | 🚧 |
| [05-notion-mcp.md](05-notion-mcp.md) | Notion MCP 통합 | 🚧 |
| **[06-ohmyopencode-integration.md](06-ohmyopencode-integration.md)** | **OhMyOpenCode delegate_task 통합** | ✅ NEW |
| **[07-slack-orchestrator-implementation.md](07-slack-orchestrator-implementation.md)** | **Slack Bot + Orchestrator 구현** | ✅ NEW |

## 🎯 Quick Start

### 처음 보시는 분
1. [01-architecture.md](01-architecture.md) - 전체 시스템 구조
2. [02-authentication.md](02-authentication.md) - 인증 흐름
3. [03-database-schema.md](03-database-schema.md) - 데이터 모델

### Phase 2 개발자 (지금!)
1. **[06-ohmyopencode-integration.md](06-ohmyopencode-integration.md)** - delegate_task API 이해
2. **[07-slack-orchestrator-implementation.md](07-slack-orchestrator-implementation.md)** - Slack Bot 구현

### Backend 개발자
1. [03-database-schema.md](03-database-schema.md)
2. [04-workflow-engine.md](04-workflow-engine.md)
3. [05-notion-mcp.md](05-notion-mcp.md)

## 📖 주요 개념

### Multi-Tenant Architecture
- Row-Level Security (RLS)로 데이터 격리
- Subdomain 기반 조직 식별 (`{tenant}.nubabel.com`)
- Google Workspace OAuth 통합

### Agent Orchestration (NEW)
- **OhMyOpenCode delegate_task**: 에이전트 실행 API
- **Category System**: 작업별 최적 모델 자동 선택 (7가지)
- **Skill System**: 도메인 전문성 주입 (3가지 + 커스텀)
- **Session Management**: Redis + PostgreSQL 세션 연속성

### Workflow System
- JSON 기반 워크플로우 정의
- Template variable interpolation (`{{input.field}}`)
- Background 실행 및 히스토리 추적

## 🔗 참조

- [Planning Docs](../planning/) - 로드맵, 스펙
- [Frontend Docs](../frontend/) - React 개발 가이드
- [Deployment Docs](../deployment/) - Railway 배포

---

**최종 업데이트**: 2026-01-25  
**문서 버전**: 1.0.0
