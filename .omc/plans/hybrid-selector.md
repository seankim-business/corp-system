# Hybrid Category/Skill Selector - Implementation Plan

## Reference
- Specification: `.omc/autopilot/spec.md`

## Design Decisions

- **Confidence Weighting**: 60% category / 40% skill (configurable via HYBRID_CATEGORY_WEIGHT env var)
- **Cross-validation**: Always runs; threshold only affects override decision
- **Feature Flag**: USE_HYBRID_SELECTOR for gradual rollout

## Tasks

### TASK 1: Define Hybrid Selection Interfaces
- **File**: `src/orchestrator/types.ts`
- **Action**: MODIFY
- **Dependencies**: none
- **Description**: Add HybridSelection, UnifiedKeyword, SkillCombination, CategorySkillConflict interfaces

### TASK 2: Create Hybrid Selector - Core Structure
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: CREATE
- **Dependencies**: 1
- **Description**: Create module with UNIFIED_KEYWORDS registry, SKILL_COMBINATIONS, CATEGORY_SKILL_CONFLICTS

### TASK 3: Implement Fast-Path Keyword Selection
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 2
- **Description**: Implement selectHybridKeywordFast() with single-pass keyword scan

### TASK 4: Implement Combination Detection
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 3
- **Description**: Detect skill combinations and apply confidence boosts

### TASK 5: Implement Conflict Detection
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 4
- **Description**: Detect category-skill conflicts and apply resolution strategies

### TASK 6: Implement LLM Fallback
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 5
- **Description**: Implement selectHybridWithLLM() for low-confidence cases

### TASK 7: Implement Main selectHybrid Function
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 6
- **Description**: Main entry point combining keyword-fast with LLM fallback

### TASK 8: Add Budget-Aware Selection
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 7
- **Description**: Implement selectHybridWithBudget() wrapper

### TASK 9: Add Caching Layer
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 8
- **Description**: Redis caching with 24hr TTL

### TASK 10: Integrate into Orchestrator
- **File**: `src/orchestrator/index.ts`
- **Action**: MODIFY
- **Dependencies**: 9
- **Description**: Replace separate selection calls with hybrid selector

### TASK 11: Add Feature Flag
- **File**: `src/orchestrator/index.ts`
- **Action**: MODIFY
- **Dependencies**: 10
- **Description**: USE_HYBRID_SELECTOR env var for gradual rollout

### TASK 12: Create Unit Tests
- **File**: `src/__tests__/orchestrator/hybrid-selector.test.ts`
- **Action**: CREATE
- **Dependencies**: 9
- **Description**: Unit tests for all hybrid selector functions

### TASK 13: Add Observability
- **File**: `src/orchestrator/hybrid-selector.ts`
- **Action**: MODIFY
- **Dependencies**: 11
- **Description**: Logging, metrics, OpenTelemetry spans

## Acceptance Criteria

- [ ] Fast-path keyword selection completes in <10ms
- [ ] LLM fallback triggers when confidence < 0.7
- [ ] Skill combinations boost confidence correctly
- [ ] Category-skill conflicts are detected and resolved
- [ ] Budget constraints are respected
- [ ] Cache reduces redundant computation
- [ ] Feature flag enables gradual rollout
- [ ] All tests pass

---

**PLANNING_COMPLETE**
