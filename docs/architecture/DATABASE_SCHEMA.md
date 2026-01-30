# Database Schema - Notion IMS 기반 로버스트 설계

> **핵심**: Kyndof 실제 Notion IMS 10대 DB를 기반으로, 필드명/스키마 변경에 자동 적응하는 로버스트 시스템

---

## 목차

- [설계 원칙](#설계-원칙)
- [Notion IMS 매핑](#notion-ims-매핑)
- [로버스트 스키마 시스템](#로버스트-스키마-시스템)
- [10대 핵심 DB 스키마](#10대-핵심-db-스키마)
- [자동 마이그레이션](#자동-마이그레이션)

---

## 설계 원칙

### 1. Notion as SSOT (Single Source of Truth)

```
Notion IMS (실제 운영)
    ↓ [실시간 동기화]
Corp System PostgreSQL (로컬 캐시)
    ↓ [쿼리 최적화]
Applications (Agent, Web, API)
```

**이유**:
- Notion은 이미 Kyndof가 사용 중
- 팀원들의 Notion 사용 습관 유지
- Corp System은 Notion을 **강화**하는 역할

---

### 2. 필드명 독립적 매핑 (Semantic Mapping)

**❌ BAD: 필드명 하드코딩**
```typescript
const project = await notion.databases.query({
  database_id: 'abc123',
  filter: {
    property: 'Project Name',  // ← "프로젝트명"으로 바뀌면 깨짐
    title: { equals: 'My Project' }
  }
});
```

**✅ GOOD: 의미 기반 매핑**
```yaml
# registry/integrations/notion-schemas/projects.yml
database_id: ${NOTION_PROJECT_DB_ID}

semantic_mappings:
  - semantic_name: project_title
    possible_field_names:
      - "Project Name"
      - "프로젝트명"
      - "프로젝트 이름"
      - "Name"
    field_type: title
    required: true
  
  - semantic_name: owner
    possible_field_names:
      - "Owner"
      - "담당자"
      - "PM"
      - "책임자"
    field_type: person
    required: true

# 시스템이 자동으로 실제 필드명 찾기
auto_discover:
  enabled: true
  strategy: fuzzy_match  # 유사도 기반 매칭
  confidence_threshold: 0.8
```

---

### 3. 스키마 진화 추적 (Schema Evolution Tracking)

```typescript
// 시스템이 자동으로 스키마 변경 감지
class NotionSchemaTracker {
  async detectChanges(databaseId: string): Promise<SchemaChange[]> {
    // 1. 현재 Notion DB 스키마 조회
    const currentSchema = await this.notionClient.databases.retrieve({
      database_id: databaseId
    });
    
    // 2. 로컬 캐시와 비교
    const cachedSchema = await this.db.schemas.findOne({ databaseId });
    
    // 3. 차이 계산
    const changes = this.diff(currentSchema, cachedSchema);
    
    // 4. 변경 타입 분류
    return changes.map(c => ({
      type: this.classifyChange(c),  // field_added, field_renamed, field_deleted, field_type_changed
      oldName: c.oldName,
      newName: c.newName,
      suggestedAction: this.suggestAction(c)
    }));
  }
}
```

---

### 4. 자동 복구 (Self-Healing)

```yaml
# 스키마 변경 발생 시 자동 동작
auto_heal:
  field_renamed:
    action: update_semantic_mapping
    notify: false  # 자동 처리
  
  field_deleted:
    action: mark_as_deprecated
    notify: true   # 관리자 알림
    fallback: use_default_value
  
  field_added:
    action: discover_semantic_meaning
    notify: true
    auto_map: true  # AI가 의미 추론하여 자동 매핑
  
  field_type_changed:
    action: attempt_conversion
    notify: true
    rollback_on_fail: true
```

---

## Notion IMS 매핑

### 실제 Kyndof Notion DB 현황

| DB명 | DB ID | 상태 | 항목 수 |
|------|-------|------|---------|
| Goals | `2e04a6fb-8b06-813c-b4b7-f1d58a1c4220` | ✅ 운영 중 | 2개 |
| Tasks | `482233e4-b87c-4a5a-a4bd-35e76a60961a` | ✅ 활발 | 66개 |
| Projects | `2e04a6fb-8b06-816b-a6df-e701241fb429` | ✅ 운영 중 | - |
| Meetings | `2e04a6fb-8b06-8156-988d-eaf29ae148c9` | ✅ 운영 중 | - |
| KPIs | `2e04a6fb-8b06-8106-adf5-f241c7b9497d` | ✅ 운영 중 | - |
| Business Models | `2e04a6fb-8b06-81f2-ad07-f7499667b427` | ✅ 운영 중 | - |
| Positions | `2e34a6fb-8b06-80e0-b306-cc51967d5cdd` | ✅ 운영 중 | 1개 |
| Value Streams | (추가 필요) | 📋 계획 | - |
| Hypothesis | (추가 필요) | 📋 계획 | - |
| Strategies | (추가 필요) | 📋 계획 | - |
| Issues/Decisions | (추가 필요) | 📋 계획 | - |

---

## 로버스트 스키마 시스템

### Semantic Mapping Registry

```yaml
# registry/notion-schemas/master-mappings.yml
version: 1.0.0

# 전역 공통 필드 (모든 DB에서 일관성 유지)
global_semantic_fields:
  - semantic_name: id
    possible_names: ["ID", "id", "고유번호"]
    type: title_or_unique
    required: true
  
  - semantic_name: created_time
    possible_names: ["Created time", "생성일", "작성일"]
    type: created_time
    required: false
  
  - semantic_name: last_edited_time
    possible_names: ["Last edited time", "수정일", "최종 수정"]
    type: last_edited_time
    required: false

# RABSIC 공통 필드
rabsic_fields:
  - semantic_name: responsible
    possible_names: ["R(실행)", "R(실행 직책)", "Responsible", "담당자"]
    type: person_or_relation
    multi: true
  
  - semantic_name: accountable
    possible_names: ["A(책임)", "A(책임 직책)", "Accountable", "책임자"]
    type: person_or_relation
    multi: false  # 항상 1명
  
  - semantic_name: backup
    possible_names: ["B(백업)", "Backup", "백업"]
    type: person_or_relation
    multi: true
  
  - semantic_name: support
    possible_names: ["S(서포트)", "Support", "지원"]
    type: person_or_relation
    multi: true
  
  - semantic_name: informed
    possible_names: ["I(공유)", "Informed", "정보공유"]
    type: person_or_relation
    multi: true
  
  - semantic_name: consulted
    possible_names: ["C(협의)", "Consulted", "협의대상"]
    type: person_or_relation
    multi: true
```

---

### Database-Specific Schemas

#### 1. Goals DB

```yaml
# registry/notion-schemas/goals.yml
database_id: ${NOTION_GOALS_DB_ID}
sync_direction: bidirectional
sync_interval: 5m

semantic_mappings:
  # 필수 필드
  - semantic_name: goal_title
    possible_names: ["Goals", "목표", "Goal Name"]
    type: title
    required: true
  
  - semantic_name: status
    possible_names: ["Status", "상태", "진행상태"]
    type: status
    value_mapping:
      active: ["Active", "진행중", "In Progress"]
      completed: ["Completed", "완료", "Done"]
      on_hold: ["On Hold", "보류", "Paused"]
      cancelled: ["Cancelled", "취소"]
  
  - semantic_name: owner
    possible_names: ["Owner", "담당자", "책임자"]
    type: person
    required: true
  
  - semantic_name: owner_position
    possible_names: ["Owner Position", "담당자 직책"]
    type: relation
    target_database: positions
  
  - semantic_name: due_date
    possible_names: ["Due Date", "마감일", "목표일"]
    type: date
  
  - semantic_name: progress
    possible_names: ["Progress", "진행률", "완료율"]
    type: number
    unit: "%"
    min: 0
    max: 100
  
  # 계층 구조
  - semantic_name: parent_goal
    possible_names: ["Parent item", "상위 목표", "Parent Goal"]
    type: relation
    target_database: goals  # Self-relation
    self_reference: true
  
  - semantic_name: sub_goals
    possible_names: ["Sub-item", "하위 목표", "Sub Goals"]
    type: relation
    target_database: goals
    self_reference: true
  
  # 연결 관계
  - semantic_name: related_kpis
    possible_names: ["KPIs", "관련 KPI", "Related KPIs"]
    type: relation
    target_database: kpis
  
  - semantic_name: related_projects
    possible_names: ["Projects", "프로젝트", "Related Projects"]
    type: relation
    target_database: projects
  
  - semantic_name: related_strategies
    possible_names: ["Strategies", "전략", "Related Strategies"]
    type: relation
    target_database: strategies

# 자동 복구 규칙
auto_heal:
  field_renamed:
    action: update_mapping
    confidence_threshold: 0.85
  
  value_mapping_mismatch:
    action: fuzzy_match
    fallback: create_new_status
```

---

#### 2. Tasks DB (GTD + RABSIC + 아이젠하워)

```yaml
# registry/notion-schemas/tasks.yml
database_id: ${NOTION_TASKS_DB_ID}
sync_direction: bidirectional
sync_interval: 1m  # 태스크는 빠른 동기화

semantic_mappings:
  # 기본 필드
  - semantic_name: task_name
    possible_names: ["Name", "Task", "태스크명", "업무명"]
    type: title
    required: true
  
  - semantic_name: status
    possible_names: ["Status", "상태"]
    type: status
    value_mapping:
      todo: ["1_ToDo", "ToDo", "할 일"]
      in_progress: ["2_InProgress", "In Progress", "진행중"]
      review: ["3_Review", "Review", "검토중"]
      blocked: ["4_Blocked", "Blocked", "블록"]
      done: ["5_Done", "Done", "완료"]
  
  - semantic_name: due_date
    possible_names: ["Due Date", "마감일", "Due"]
    type: date
  
  # RABSIC 필드 (include from global)
  - semantic_name: responsible
    inherit_from: global.rabsic_fields.responsible
  
  - semantic_name: accountable
    inherit_from: global.rabsic_fields.accountable
  
  - semantic_name: backup
    inherit_from: global.rabsic_fields.backup
  
  - semantic_name: support
    inherit_from: global.rabsic_fields.support
  
  - semantic_name: informed
    inherit_from: global.rabsic_fields.informed
  
  - semantic_name: consulted
    inherit_from: global.rabsic_fields.consulted
  
  # 아이젠하워 매트릭스
  - semantic_name: urgency_score
    possible_names: ["Urgency Score", "긴급도", "긴급도 점수"]
    type: number
    min: 1
    max: 5
  
  - semantic_name: importance_score
    possible_names: ["Importance Score", "중요도", "중요도 점수"]
    type: number
    min: 1
    max: 5
  
  # 계층 구조 (Sub-task)
  - semantic_name: parent_task
    possible_names: ["Parent item", "상위 태스크"]
    type: relation
    target_database: tasks
    self_reference: true
  
  - semantic_name: sub_tasks
    possible_names: ["Sub-item", "하위 태스크"]
    type: relation
    target_database: tasks
    self_reference: true
  
  # 연결 관계
  - semantic_name: related_projects
    possible_names: ["Projects", "프로젝트"]
    type: relation
    target_database: projects
  
  - semantic_name: related_goals
    possible_names: ["Goals", "목표"]
    type: relation
    target_database: goals
  
  - semantic_name: related_meetings
    possible_names: ["Meetings", "회의"]
    type: relation
    target_database: meetings

# 계산 필드 (자동 계산)
computed_fields:
  - name: eisenhower_quadrant
    formula: |
      if (urgency_score >= 4 && importance_score >= 4) return "Q1_UrgentImportant";
      if (urgency_score < 4 && importance_score >= 4) return "Q2_NotUrgentImportant";
      if (urgency_score >= 4 && importance_score < 4) return "Q3_UrgentNotImportant";
      return "Q4_NotUrgentNotImportant";
    type: select
  
  - name: priority_score
    formula: "urgency_score * importance_score"
    type: number
```

---

#### 3. Projects DB

```yaml
# registry/notion-schemas/projects.yml
database_id: ${NOTION_PROJECTS_DB_ID}

semantic_mappings:
  - semantic_name: project_name
    possible_names: ["Project Name", "프로젝트명", "Name"]
    type: title
    required: true
  
  - semantic_name: status
    possible_names: ["Status", "상태"]
    type: status
    value_mapping:
      planning: ["Planning", "계획"]
      active: ["Active", "진행중"]
      on_hold: ["On Hold", "보류"]
      completed: ["Completed", "완료"]
      cancelled: ["Cancelled", "취소"]
  
  - semantic_name: owner
    possible_names: ["Owner", "PM", "책임자"]
    type: person
  
  - semantic_name: start_date
    possible_names: ["Start Date", "시작일"]
    type: date
  
  - semantic_name: due_date
    possible_names: ["Due Date", "마감일", "목표일"]
    type: date
  
  - semantic_name: progress
    possible_names: ["Progress", "진행률"]
    type: number
    unit: "%"
  
  - semantic_name: budget
    possible_names: ["Budget", "예산"]
    type: number
    unit: "KRW"
  
  - semantic_name: stakeholders
    possible_names: ["Key Stakeholders", "이해관계자"]
    type: person
    multi: true
  
  # 연결 관계
  - semantic_name: related_strategy
    possible_names: ["Related Strategy", "전략"]
    type: relation
    target_database: strategies
  
  - semantic_name: related_tasks
    possible_names: ["Related Tasks", "태스크", "Tasks"]
    type: relation
    target_database: tasks
  
  - semantic_name: related_value_streams
    possible_names: ["Value Streams", "가치흐름"]
    type: relation
    target_database: value_streams

# Rollup 필드 (자동 계산)
rollup_fields:
  - name: task_count
    relation_property: related_tasks
    rollup_function: count
  
  - name: completed_task_count
    relation_property: related_tasks
    rollup_function: count
    filter:
      property: status
      status: { equals: "5_Done" }
  
  - name: task_completion_rate
    formula: "completed_task_count / task_count * 100"
    type: number
    unit: "%"
```

---

#### 4. Value Streams DB

```yaml
# registry/notion-schemas/value-streams.yml
database_id: ${NOTION_VALUE_STREAMS_DB_ID}

semantic_mappings:
  - semantic_name: stream_name
    possible_names: ["Name", "가치흐름명", "Value Stream Name"]
    type: title
    required: true
  
  - semantic_name: functions
    possible_names: ["Functions", "기능", "담당 기능"]
    type: select
    options:
      - MD
      - Fashion Design
      - Marketing
      - CS
      - Sales
      - Operations
  
  - semantic_name: type
    possible_names: ["Type", "타입"]
    type: select
    options:
      - Value Stream
      - Sub-Value Stream
  
  - semantic_name: input
    possible_names: ["Input", "입력"]
    type: text
  
  - semantic_name: output
    possible_names: ["Output", "출력"]
    type: text
  
  # RABSIC (Positions Relation)
  - semantic_name: responsible_position
    possible_names: ["R(실행 직책)", "R", "Responsible Position"]
    type: relation
    target_database: positions
  
  - semantic_name: accountable_position
    possible_names: ["A(책임 직책)", "A", "Accountable Position"]
    type: relation
    target_database: positions
  
  # 연결 관계
  - semantic_name: related_kpis
    possible_names: ["KPI", "관련 KPI"]
    type: relation
    target_database: kpis
  
  - semantic_name: parent_stream
    possible_names: ["Parent Stream", "상위 흐름"]
    type: relation
    target_database: value_streams
    self_reference: true
  
  - semantic_name: sub_streams
    possible_names: ["Sub Streams", "하위 흐름"]
    type: relation
    target_database: value_streams
    self_reference: true

# 실제 2000Archives Value Streams 데이터 (참고)
initial_data:
  - name: "시장 트렌드 → 상품 컨셉"
    functions: MD
    r_position: MD-Sales
    a_position: MD-Sales
  
  - name: "상품 컨셉 → 판매 가능 상품"
    functions: Fashion Design
    r_position: Brand Lead
    a_position: MD-Sales
```

---

## 자동 마이그레이션

### Schema Evolution Engine

```typescript
// src/database/schema-evolution.ts
class SchemaEvolutionEngine {
  async evolve(databaseId: string): Promise<EvolutionResult> {
    // 1. 현재 Notion 스키마 가져오기
    const notionSchema = await this.notion.databases.retrieve({
      database_id: databaseId
    });
    
    // 2. 로컬 매핑 설정 로드
    const mappingConfig = await this.loadMappingConfig(databaseId);
    
    // 3. 각 semantic field에 대해 실제 필드 찾기
    const resolvedMappings = await Promise.all(
      mappingConfig.semantic_mappings.map(async (semantic) => {
        const actualField = await this.findActualField(
          notionSchema.properties,
          semantic
        );
        
        return {
          semantic_name: semantic.semantic_name,
          actual_field_name: actualField?.name,
          confidence: actualField?.confidence,
          status: actualField ? 'mapped' : 'missing',
        };
      })
    );
    
    // 4. 변경 사항 감지
    const changes = this.detectChanges(resolvedMappings);
    
    // 5. 자동 복구 실행
    for (const change of changes) {
      if (change.can_auto_heal) {
        await this.autoHeal(change);
      } else {
        await this.notifyAdmin(change);
      }
    }
    
    return {
      database_id: databaseId,
      resolved_mappings: resolvedMappings,
      changes,
      auto_healed: changes.filter(c => c.auto_healed).length,
      needs_manual_review: changes.filter(c => !c.auto_healed).length,
    };
  }
  
  private async findActualField(
    properties: Record<string, PropertySchema>,
    semantic: SemanticMapping
  ): Promise<{ name: string; confidence: number } | null> {
    const candidates: Array<{ name: string; score: number }> = [];
    
    // 완전 일치 우선
    for (const possibleName of semantic.possible_names) {
      if (properties[possibleName]) {
        return { name: possibleName, confidence: 1.0 };
      }
    }
    
    // 유사도 기반 매칭 (Fuzzy Match)
    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
      // 타입 일치 확인
      if (fieldSchema.type !== semantic.type) continue;
      
      // 문자열 유사도 계산
      const maxSimilarity = Math.max(
        ...semantic.possible_names.map(pn => 
          this.stringSimilarity(pn, fieldName)
        )
      );
      
      if (maxSimilarity > 0.7) {
        candidates.push({ name: fieldName, score: maxSimilarity });
      }
    }
    
    // 가장 높은 점수 반환
    if (candidates.length > 0) {
      const best = candidates.sort((a, b) => b.score - a.score)[0];
      return { name: best.name, confidence: best.score };
    }
    
    return null;
  }
  
  private stringSimilarity(s1: string, s2: string): number {
    // Levenshtein Distance 기반 유사도
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }
  
  private async autoHeal(change: SchemaChange): Promise<void> {
    const config = await this.loadMappingConfig(change.database_id);
    const autoHealRule = config.auto_heal[change.type];
    
    switch (autoHealRule.action) {
      case 'update_mapping':
        // YAML 파일 자동 업데이트
        await this.updateMappingConfig(change);
        break;
      
      case 'fuzzy_match':
        // 유사한 필드 자동 찾기 및 매핑
        const newField = await this.findSimilarField(change);
        if (newField && newField.confidence > autoHealRule.confidence_threshold) {
          await this.updateMapping(change.semantic_name, newField.name);
        }
        break;
      
      case 'mark_as_deprecated':
        // 더 이상 사용하지 않는 필드로 마킹
        await this.deprecateField(change.semantic_name);
        break;
    }
    
    // GitHub에 변경 커밋
    await this.commitToGitHub({
      path: `registry/notion-schemas/${change.database_name}.yml`,
      message: `Auto-heal: ${change.type} - ${change.semantic_name}`,
    });
  }
}
```

---

### Migration Workflow

```
1. Notion DB 스키마 변경 (사용자가 Notion에서 필드명 변경)
      ↓
2. System Detects Change (1시간마다 체크)
      ↓
3. Schema Evolution Engine 실행
      ↓
4. Auto-Heal 시도
      ├─ 성공 → YAML 자동 업데이트 → GitHub 커밋
      └─ 실패 → Slack 알림 (관리자 수동 처리 필요)
      ↓
5. PostgreSQL Schema Sync
      ↓
6. System 정상 동작 계속
```

---

## PostgreSQL 로컬 캐시 스키마

### Core Tables

```sql
-- Notion DB 메타데이터
CREATE TABLE notion_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_database_id TEXT UNIQUE NOT NULL,
  database_name TEXT NOT NULL,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  schema_version INT DEFAULT 1,
  mapping_config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notion 필드 매핑
CREATE TABLE notion_field_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID REFERENCES notion_databases(id),
  semantic_name TEXT NOT NULL,
  actual_field_name TEXT NOT NULL,
  field_type TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  last_verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(database_id, semantic_name)
);

-- 스키마 변경 로그
CREATE TABLE schema_evolution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID REFERENCES notion_databases(id),
  change_type TEXT NOT NULL,  -- field_renamed, field_deleted, field_added, field_type_changed
  old_value TEXT,
  new_value TEXT,
  auto_healed BOOLEAN DEFAULT FALSE,
  healed_at TIMESTAMP WITH TIME ZONE,
  manual_review_required BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Data Cache Tables (Notion 데이터 캐시)

```sql
-- Goals 캐시
CREATE TABLE goals_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id TEXT UNIQUE NOT NULL,
  goal_title TEXT NOT NULL,
  status TEXT,
  owner_id UUID,
  due_date DATE,
  progress INT CHECK (progress >= 0 AND progress <= 100),
  parent_goal_id UUID REFERENCES goals_cache(id),
  raw_data JSONB NOT NULL,  -- 전체 Notion 페이지 데이터 (백업)
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks 캐시
CREATE TABLE tasks_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id TEXT UNIQUE NOT NULL,
  task_name TEXT NOT NULL,
  status TEXT,
  due_date DATE,
  urgency_score INT CHECK (urgency_score >= 1 AND urgency_score <= 5),
  importance_score INT CHECK (importance_score >= 1 AND importance_score <= 5),
  eisenhower_quadrant TEXT,  -- 계산 필드
  parent_task_id UUID REFERENCES tasks_cache(id),
  raw_data JSONB NOT NULL,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RABSIC Relations (Many-to-Many)
CREATE TABLE task_rabsic (
  task_id UUID REFERENCES tasks_cache(id),
  role_type TEXT NOT NULL CHECK (role_type IN ('R', 'A', 'B', 'S', 'I', 'C')),
  person_id UUID,  -- Notion Person ID
  position_id UUID,  -- Notion Position Relation ID
  PRIMARY KEY (task_id, role_type, person_id, position_id)
);

-- Projects 캐시
CREATE TABLE projects_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notion_page_id TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  status TEXT,
  owner_id UUID,
  start_date DATE,
  due_date DATE,
  progress INT,
  budget BIGINT,
  raw_data JSONB NOT NULL,
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 구현 우선순위

### Phase 1: Core Schema System (2주)

1. ✅ Semantic Mapping YAML 정의
2. ✅ Schema Evolution Engine 구현
3. ✅ Fuzzy Matching 알고리즘
4. ✅ PostgreSQL 캐시 테이블 생성

### Phase 2: Notion Sync (3주)

1. ✅ Notion API Integration
2. ✅ Real-time Sync (Webhooks or Polling)
3. ✅ Bidirectional Sync
4. ✅ Conflict Resolution

### Phase 3: Auto-Heal (2주)

1. ✅ Auto-discovery of field changes
2. ✅ Auto-update YAML configs
3. ✅ Slack notifications
4. ✅ GitHub auto-commit

---

## 핵심 장점

### 1. 로버스트 (Robust)

- ✅ 필드명 변경 시 자동 적응
- ✅ 스키마 변경 시 자동 마이그레이션
- ✅ 0 다운타임 (변경 중에도 시스템 동작)

### 2. Notion 친화적

- ✅ Notion이 SSOT (팀원들의 습관 유지)
- ✅ Corp System은 Notion을 강화
- ✅ Notion에서의 모든 변경 자동 반영

### 3. 유지보수 용이

- ✅ YAML 설정만 수정
- ✅ 코드 변경 불필요
- ✅ 버전 관리 (GitHub)

---

**Built with ❤️ by Kyndof Team**
