# Research Index (Nubabel)

> 목적: `research/` 문서를 **빠르게 탐색**하고, “리서치 → 구현/문서” 연결을 한눈에 보기 위한 인덱스

## Quick Start (Reading Order)

1. **Executive Summary**: [`RESEARCH_COMPLETE.md`](./RESEARCH_COMPLETE.md)
2. **Architecture**
   - [`architecture/00-current-architecture-analysis.md`](./architecture/00-current-architecture-analysis.md)
   - [`architecture/01-synthesis-and-decisions.md`](./architecture/01-synthesis-and-decisions.md)
3. **Technical Deep Dive (01 → 09)**: [`technical-deep-dive/`](./technical-deep-dive/)
4. **Domain Guides (as needed)**: `integration/`, `performance/`, `production/`, `security/`, `usability/`

## Directory Index

### Root

- [`README.md`](./README.md) — research 목적/구조
- [`RESEARCH_COMPLETE.md`](./RESEARCH_COMPLETE.md) — 전체 요약
- [`ACTIVE_RESEARCH_TRACKING.md`](./ACTIVE_RESEARCH_TRACKING.md) — 백로그/진행 추적 (planned doc 경로 포함 가능)
- [`COMPREHENSIVE_RESEARCH_PLAN.md`](./COMPREHENSIVE_RESEARCH_PLAN.md) — 200-task 로드맵
- [`NAMING_CONVENTIONS_SUMMARY.md`](./NAMING_CONVENTIONS_SUMMARY.md)
- [`RECOMMENDED_DELIVERABLES.md`](./RECOMMENDED_DELIVERABLES.md)

### Architecture

- [`architecture/00-current-architecture-analysis.md`](./architecture/00-current-architecture-analysis.md)
- [`architecture/01-synthesis-and-decisions.md`](./architecture/01-synthesis-and-decisions.md)
- [`architecture/ohmyopencode-integration-blueprint.md`](./architecture/ohmyopencode-integration-blueprint.md)
- [`architecture/ohmyopencode-integration-design.md`](./architecture/ohmyopencode-integration-design.md)

### Technical Deep Dive

1. [`technical-deep-dive/01-orchestrator-architecture.md`](./technical-deep-dive/01-orchestrator-architecture.md)
2. [`technical-deep-dive/02-category-system-deep-dive.md`](./technical-deep-dive/02-category-system-deep-dive.md)
3. [`technical-deep-dive/03-skill-system-architecture.md`](./technical-deep-dive/03-skill-system-architecture.md)
4. [`technical-deep-dive/04-slack-integration-patterns.md`](./technical-deep-dive/04-slack-integration-patterns.md)
5. [`technical-deep-dive/05-mcp-sdk-production-patterns.md`](./technical-deep-dive/05-mcp-sdk-production-patterns.md)
6. [`technical-deep-dive/06-langgraph-vs-custom-router.md`](./technical-deep-dive/06-langgraph-vs-custom-router.md)
7. [`technical-deep-dive/07-redis-production-config.md`](./technical-deep-dive/07-redis-production-config.md)
8. [`technical-deep-dive/08-ai-error-handling-guide.md`](./technical-deep-dive/08-ai-error-handling-guide.md)
9. [`technical-deep-dive/09-multi-tenant-security-checklist.md`](./technical-deep-dive/09-multi-tenant-security-checklist.md)

### Integration

- [`integration/webhook-integration-patterns-guide.md`](./integration/webhook-integration-patterns-guide.md)
- [`integration/real-time/01-sse-patterns.md`](./integration/real-time/01-sse-patterns.md)

### Performance

- [`performance/autoscaling-implementation-guide.md`](./performance/autoscaling-implementation-guide.md)
- [`performance/database-sharding-partitioning-guide.md`](./performance/database-sharding-partitioning-guide.md)
- [`performance/load-testing/01-tools-and-patterns.md`](./performance/load-testing/01-tools-and-patterns.md)
- [`performance/optimization/01-database-query-optimization.md`](./performance/optimization/01-database-query-optimization.md)

### Production

- [`production/cloud-cost-optimization-guide.md`](./production/cloud-cost-optimization-guide.md)
- [`production/incident-response-postmortem-playbook.md`](./production/incident-response-postmortem-playbook.md)
- [`production/soc2-compliance-roadmap.md`](./production/soc2-compliance-roadmap.md)
- [`production/monitoring/01-apm-patterns.md`](./production/monitoring/01-apm-patterns.md)
- [`production/deployment/01-zero-downtime-deployment.md`](./production/deployment/01-zero-downtime-deployment.md)
- [`production/compliance/01-gdpr-compliance.md`](./production/compliance/01-gdpr-compliance.md)

### Security

- [`security/api-security-patterns-guide.md`](./security/api-security-patterns-guide.md)
- [`security/session-security-comprehensive-guide.md`](./security/session-security-comprehensive-guide.md)
- [`security/authentication/01-oauth-2.1-security.md`](./security/authentication/01-oauth-2.1-security.md)

### Usability

- [`usability/ai-analytics-visualization-summary.md`](./usability/ai-analytics-visualization-summary.md)
- [`usability/data-visualization-dashboard-guide.md`](./usability/data-visualization-dashboard-guide.md)
- [`usability/feature-flags-advanced-patterns.md`](./usability/feature-flags-advanced-patterns.md)
- [`usability/slack-bot-patterns/01-conversation-design.md`](./usability/slack-bot-patterns/01-conversation-design.md)
- [`usability/onboarding/01-saas-onboarding-flows.md`](./usability/onboarding/01-saas-onboarding-flows.md)
- [`usability/error-ux/01-error-message-patterns.md`](./usability/error-ux/01-error-message-patterns.md)

## Research → Implementation / Docs Mapping

### Mapped References (confirmed in repo)

- **Slack integration patterns** → `docs/BULLMQ_SETUP.md`
  - Reference: [`docs/BULLMQ_SETUP.md`](../docs/BULLMQ_SETUP.md) links to [`technical-deep-dive/04-slack-integration-patterns.md`](./technical-deep-dive/04-slack-integration-patterns.md)

- **Architecture decisions** → `IMPLEMENTATION_TASKS.md`
  - Reference: [`IMPLEMENTATION_TASKS.md`](../IMPLEMENTATION_TASKS.md) cites [`architecture/01-synthesis-and-decisions.md`](./architecture/01-synthesis-and-decisions.md)

### Recommended “Where used” links (to add over time)

- `technical-deep-dive/01-orchestrator-architecture.md` → `src/orchestrator/*` + `docs/core/07-slack-orchestrator-implementation.md`
- `technical-deep-dive/05-mcp-sdk-production-patterns.md` → `src/services/mcp-registry.ts` + `docs/core/06-ohmyopencode-integration.md`

---

**Last Updated**: 2026-01-26
