# Recommended Deliverables - File Names & Locations

> **목적**: Missing research documents를 위한 권장 파일명 및 위치  
> **범위**: 15+ 새로운 문서  
> **상태**: Recommendations (Ready for Implementation)

---

## 📋 Quick Reference: Recommended File Names

### Priority 1: Technical Deep-Dive Continuation (10-15)

**Location**: `research/technical-deep-dive/`

```
10-monitoring-observability-guide.md
11-deployment-cicd-guide.md
12-load-testing-performance-guide.md
13-authentication-authorization-guide.md
14-data-security-encryption-guide.md
15-error-handling-recovery-guide.md
```

**Naming Pattern**: `NN-descriptive-title-guide.md`

- Zero-padded 2-digit number (10-15)
- Hyphenated kebab-case
- Consistent `-guide` suffix
- 3-5 word descriptive title

---

### Priority 2: Architecture Patterns (02-05)

**Location**: `research/architecture/`

```
02-event-driven-architecture-patterns.md
03-agent-orchestration-patterns.md
04-session-management-patterns.md
05-commercial-platform-analysis.md
```

**Naming Pattern**: `NN-descriptive-title-SUFFIX.md`

- Zero-padded 2-digit number (02-05)
- Hyphenated kebab-case
- Suffix: `-patterns` or `-analysis`
- 3-5 word descriptive title

**Note**: Existing files use descriptive names without numbering. These recommendations add numbering for consistency with technical-deep-dive folder.

---

### Priority 3: Usability Research (New Docs)

**Location**: `research/usability/`

```
slack-bot-interaction-design.md
dashboard-ux-patterns.md
cross-interface-continuity.md
developer-experience-guide.md
```

**Naming Pattern**: `descriptive-title-SUFFIX.md`

- Hyphenated kebab-case
- Suffix: `-design`, `-patterns`, `-guide`
- 3-5 word descriptive title
- No numbering (follows existing usability/ pattern)

---

### Priority 4: New Category Folders

**Locations**: `research/monitoring/`, `research/deployment/`, `research/testing/`, `research/compliance/`

#### monitoring/

```
metrics-collection-guide.md
alerting-strategies-guide.md
observability-dashboard-guide.md
```

#### deployment/

```
railway-deployment-guide.md
docker-optimization-guide.md
cicd-pipeline-guide.md
```

#### testing/

```
unit-testing-guide.md
integration-testing-guide.md
e2e-testing-guide.md
```

#### compliance/

```
gdpr-compliance-guide.md
soc2-audit-guide.md
data-retention-policy.md
```

**Naming Pattern**: `descriptive-title-SUFFIX.md`

- Hyphenated kebab-case
- Suffix: `-guide`, `-policy`, `-audit`
- 3-5 word descriptive title
- No numbering (new folders follow descriptive pattern)

---

## 📊 Complete Recommended Structure

```
research/
├── README.md                              # ✅ Exists
├── RESEARCH_COMPLETE.md                   # ✅ Exists
├── COMPREHENSIVE_RESEARCH_PLAN.md         # ✅ Exists
├── ACTIVE_RESEARCH_TRACKING.md            # ✅ Exists
├── NAMING_CONVENTIONS_SUMMARY.md          # ✅ NEW (this analysis)
├── RECOMMENDED_DELIVERABLES.md            # ✅ NEW (this file)
│
├── architecture/                          # ✅ Exists (4 docs)
│   ├── 00-current-architecture-analysis.md
│   ├── 01-synthesis-and-decisions.md
│   ├── 02-event-driven-architecture-patterns.md          # 🆕 RECOMMENDED
│   ├── 03-agent-orchestration-patterns.md                # 🆕 RECOMMENDED
│   ├── 04-session-management-patterns.md                 # 🆕 RECOMMENDED
│   ├── 05-commercial-platform-analysis.md                # 🆕 RECOMMENDED
│   ├── ohmyopencode-integration-blueprint.md
│   └── ohmyopencode-integration-design.md
│
├── technical-deep-dive/                   # ✅ Exists (9 docs)
│   ├── 01-orchestrator-architecture.md
│   ├── 02-category-system-deep-dive.md
│   ├── 03-skill-system-architecture.md
│   ├── 04-slack-integration-patterns.md
│   ├── 05-mcp-sdk-production-patterns.md
│   ├── 06-langgraph-vs-custom-router.md
│   ├── 07-redis-production-config.md
│   ├── 08-ai-error-handling-guide.md
│   ├── 09-multi-tenant-security-checklist.md
│   ├── 10-monitoring-observability-guide.md              # 🆕 RECOMMENDED
│   ├── 11-deployment-cicd-guide.md                       # 🆕 RECOMMENDED
│   ├── 12-load-testing-performance-guide.md              # 🆕 RECOMMENDED
│   ├── 13-authentication-authorization-guide.md          # 🆕 RECOMMENDED
│   ├── 14-data-security-encryption-guide.md              # 🆕 RECOMMENDED
│   └── 15-error-handling-recovery-guide.md               # 🆕 RECOMMENDED
│
├── security/                              # ✅ Exists (2 docs)
│   ├── api-security-patterns-guide.md
│   └── session-security-comprehensive-guide.md
│
├── integration/                           # ✅ Exists (1 doc)
│   └── webhook-integration-patterns-guide.md
│
├── performance/                           # ✅ Exists (2 docs)
│   ├── autoscaling-implementation-guide.md
│   └── database-sharding-partitioning-guide.md
│
├── production/                            # ✅ Exists (3 docs)
│   ├── cloud-cost-optimization-guide.md
│   ├── incident-response-postmortem-playbook.md
│   └── soc2-compliance-roadmap.md
│
├── usability/                             # ✅ Exists (3 docs)
│   ├── ai-analytics-visualization-summary.md
│   ├── data-visualization-dashboard-guide.md
│   ├── feature-flags-advanced-patterns.md
│   ├── slack-bot-interaction-design.md                   # 🆕 RECOMMENDED
│   ├── dashboard-ux-patterns.md                          # 🆕 RECOMMENDED
│   ├── cross-interface-continuity.md                     # 🆕 RECOMMENDED
│   └── developer-experience-guide.md                     # 🆕 RECOMMENDED
│
├── monitoring/                            # 🆕 NEW FOLDER
│   ├── metrics-collection-guide.md
│   ├── alerting-strategies-guide.md
│   └── observability-dashboard-guide.md
│
├── deployment/                            # 🆕 NEW FOLDER
│   ├── railway-deployment-guide.md
│   ├── docker-optimization-guide.md
│   └── cicd-pipeline-guide.md
│
├── testing/                               # 🆕 NEW FOLDER
│   ├── unit-testing-guide.md
│   ├── integration-testing-guide.md
│   └── e2e-testing-guide.md
│
└── compliance/                            # 🆕 NEW FOLDER
    ├── gdpr-compliance-guide.md
    ├── soc2-audit-guide.md
    └── data-retention-policy.md
```

---

## 📈 Summary Statistics

### Current State

- **Total Documents**: 28
- **Total Folders**: 7
- **Numbered Docs**: 9 (technical-deep-dive only)
- **Descriptive Docs**: 19

### Recommended State

- **Total Documents**: 43+ (15 new)
- **Total Folders**: 11 (4 new)
- **Numbered Docs**: 19 (10 new in technical-deep-dive)
- **Descriptive Docs**: 24+ (5 new in usability)

### Growth by Category

| Category             | Current | Recommended | New      |
| -------------------- | ------- | ----------- | -------- |
| architecture/        | 4       | 8           | +4       |
| technical-deep-dive/ | 9       | 15          | +6       |
| security/            | 2       | 2           | -        |
| integration/         | 1       | 1           | -        |
| performance/         | 2       | 2           | -        |
| production/          | 3       | 3           | -        |
| usability/           | 3       | 7           | +4       |
| monitoring/          | -       | 3           | +3 (new) |
| deployment/          | -       | 3           | +3 (new) |
| testing/             | -       | 3           | +3 (new) |
| compliance/          | -       | 3           | +3 (new) |
| **TOTAL**            | **28**  | **50+**     | **+22**  |

---

## 🎯 Naming Rules Summary

### Rule 1: Folder Names

- ✅ Lowercase
- ✅ Hyphenated (kebab-case)
- ✅ Singular form
- ✅ Descriptive (1-3 words)

**Examples**: `architecture/`, `technical-deep-dive/`, `monitoring/`, `deployment/`

### Rule 2: File Names (Numbered)

- ✅ Zero-padded 2-digit number (01-99)
- ✅ Hyphenated kebab-case
- ✅ Descriptive title (3-5 words)
- ✅ Consistent suffix (`-guide`, `-patterns`, `-checklist`)

**Format**: `NN-descriptive-title-SUFFIX.md`  
**Examples**: `10-monitoring-observability-guide.md`, `02-event-driven-architecture-patterns.md`

### Rule 3: File Names (Descriptive)

- ✅ Hyphenated kebab-case
- ✅ Descriptive title (3-5 words)
- ✅ Consistent suffix (`-guide`, `-patterns`, `-design`, `-policy`)
- ❌ No numbering

**Format**: `descriptive-title-SUFFIX.md`  
**Examples**: `slack-bot-interaction-design.md`, `gdpr-compliance-guide.md`

### Rule 4: Root-Level Files

- ✅ UPPERCASE
- ✅ Hyphenated or underscored
- ✅ Descriptive (2-4 words)

**Format**: `UPPERCASE_DESCRIPTIVE.md`  
**Examples**: `RESEARCH_COMPLETE.md`, `NAMING_CONVENTIONS_SUMMARY.md`

---

## 📝 Metadata Template

### Header (All Documents)

```markdown
# Document Title

> **작성일**: YYYY-MM-DD  
> **목적**: [Brief description in Korean]  
> **범위**: [Scope/coverage]  
> **상태**: [Draft/Complete/Final]

---
```

### Footer (All Documents)

```markdown
---

**작성일**: YYYY-MM-DD  
**작성자**: [Author/Agent Name]  
**버전**: X.Y.Z ([Status])  
**다음 업데이트**: YYYY-MM-DD
```

---

## ✅ Implementation Checklist

### Phase 1: Documentation (This Session)

- [x] Create NAMING_CONVENTIONS_SUMMARY.md
- [x] Create RECOMMENDED_DELIVERABLES.md
- [ ] Update README.md with new structure
- [ ] Create IMPLEMENTATION_ROADMAP.md

### Phase 2: Create Missing Docs (Week 1)

- [ ] Create 6 technical-deep-dive docs (10-15)
- [ ] Create 4 architecture docs (02-05)
- [ ] Create 4 usability docs
- [ ] Standardize metadata headers/footers

### Phase 3: Create New Folders (Week 2)

- [ ] Create monitoring/ folder + 3 docs
- [ ] Create deployment/ folder + 3 docs
- [ ] Create testing/ folder + 3 docs
- [ ] Create compliance/ folder + 3 docs

### Phase 4: Maintenance (Ongoing)

- [ ] Update README.md with complete index
- [ ] Add cross-reference links
- [ ] Set up automated validation
- [ ] Create documentation style guide

---

## 🔗 Related Documents

- **NAMING_CONVENTIONS_SUMMARY.md** - Detailed analysis of current conventions
- **README.md** - Research overview (needs update)
- **COMPREHENSIVE_RESEARCH_PLAN.md** - Extended research plan (200 tasks)
- **RESEARCH_COMPLETE.md** - Phase 2 Week 9-12 findings

---

**작성일**: 2026-01-26  
**작성자**: Sisyphus (Analysis Agent)  
**버전**: 1.0.0 (FINAL - Recommendations)  
**다음 업데이트**: After implementation of Phase 1
