# Integration Layer - 외부 시스템 연동 추상화

> **모든 외부 시스템 연동은 하드코딩 없이 선언적 설정으로 관리**

---

## 목차

- [핵심 원칙](#핵심-원칙)
- [Adapter Pattern 설계](#adapter-pattern-설계)
- [선언적 Integration Definition](#선언적-integration-definition)
- [자동 마이그레이션 시스템](#자동-마이그레이션-시스템)
- [실전 예시](#실전-예시)

---

## 핵심 원칙

### 문제점: 하드코딩된 연동

```typescript
// ❌ BAD: 하드코딩
class NotionService {
  async createProject(data: ProjectData) {
    // Notion 특정 필드명에 직접 의존
    await notion.pages.create({
      parent: { database_id: 'abc123' },  // 하드코딩된 ID
      properties: {
        'Project Name': { title: [{ text: { content: data.name } }] },
        'Client': { rich_text: [{ text: { content: data.client } }] },
        'Status': { select: { name: data.status } },
      },
    });
  }
}

// 문제:
// 1. Database ID가 바뀌면 코드 수정 필요
// 2. 필드명이 바뀌면 코드 수정 필요
// 3. Notion에서 Airtable로 바꾸려면 전체 재작성
// 4. 스키마 변경 시 에러 발생
```

### 해결책: Configuration-Driven Integration

```yaml
# ✅ GOOD: 선언적 설정
# registry/integrations/notion.yml
type: integration
provider: notion
enabled: true

connection:
  apiKey: ${NOTION_API_KEY}
  
mappings:
  - entity: project
    source: internal.project
    target:
      type: database
      id: ${NOTION_PROJECT_DB_ID}  # 환경변수
    fieldMappings:
      - source: name
        target: ${NOTION_FIELD_PROJECT_NAME}  # "Project Name" 또는 "프로젝트명"
        type: title
      
      - source: client
        target: ${NOTION_FIELD_CLIENT}
        type: rich_text
      
      - source: status
        target: ${NOTION_FIELD_STATUS}
        type: select
        valueMapping:  # 값 변환
          pending: 대기중
          in_progress: 진행중
          completed: 완료

autoMigration:
  enabled: true
  checkInterval: 1h
  actions:
    - detectFieldRename
    - detectSchemaChange
    - autoAdapt
```

---

## Adapter Pattern 설계

### 1. Universal Adapter Interface

```typescript
// 모든 외부 시스템이 따라야 하는 공통 인터페이스
interface IntegrationAdapter {
  // 초기화 및 연결 확인
  connect(): Promise<void>;
  healthCheck(): Promise<boolean>;
  
  // CRUD 작업
  create(entity: string, data: Record<string, unknown>): Promise<string>;
  read(entity: string, id: string): Promise<Record<string, unknown>>;
  update(entity: string, id: string, data: Record<string, unknown>): Promise<void>;
  delete(entity: string, id: string): Promise<void>;
  query(entity: string, filter: QueryFilter): Promise<Record<string, unknown>[]>;
  
  // 스키마 관련
  getSchema(entity: string): Promise<Schema>;
  detectSchemaChange(): Promise<SchemaChange[]>;
  
  // 동기화
  sync(direction: 'pull' | 'push' | 'bidirectional'): Promise<SyncResult>;
}
```

### 2. Adapter 구현 (Notion 예시)

```typescript
class NotionAdapter implements IntegrationAdapter {
  private config: IntegrationConfig;
  private client: Client;
  private mappings: FieldMappingRegistry;
  
  constructor(config: IntegrationConfig) {
    this.config = config;
    this.client = new Client({ auth: config.connection.apiKey });
    this.mappings = new FieldMappingRegistry(config.mappings);
  }
  
  async create(entity: string, data: Record<string, unknown>): Promise<string> {
    // 1. 매핑 조회
    const mapping = this.mappings.get(entity);
    if (!mapping) {
      throw new Error(`No mapping found for entity: ${entity}`);
    }
    
    // 2. 내부 데이터 → Notion 형식 변환
    const notionData = this.transformToNotion(data, mapping);
    
    // 3. Notion API 호출
    const response = await this.client.pages.create({
      parent: { database_id: mapping.target.id },
      properties: notionData,
    });
    
    return response.id;
  }
  
  private transformToNotion(
    data: Record<string, unknown>,
    mapping: EntityMapping
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const fieldMapping of mapping.fieldMappings) {
      const sourceValue = data[fieldMapping.source];
      
      // 값 변환 (필요 시)
      const transformedValue = fieldMapping.valueMapping
        ? fieldMapping.valueMapping[String(sourceValue)]
        : sourceValue;
      
      // Notion 필드 타입에 맞게 변환
      result[fieldMapping.target] = this.toNotionField(
        transformedValue,
        fieldMapping.type
      );
    }
    
    return result;
  }
  
  private toNotionField(value: unknown, type: string): unknown {
    switch (type) {
      case 'title':
        return { title: [{ text: { content: String(value) } }] };
      case 'rich_text':
        return { rich_text: [{ text: { content: String(value) } }] };
      case 'select':
        return { select: { name: String(value) } };
      case 'number':
        return { number: Number(value) };
      case 'date':
        return { date: { start: new Date(value as string).toISOString() } };
      default:
        throw new Error(`Unknown field type: ${type}`);
    }
  }
  
  async detectSchemaChange(): Promise<SchemaChange[]> {
    const changes: SchemaChange[] = [];
    
    for (const mapping of this.config.mappings) {
      // Notion DB 스키마 조회
      const db = await this.client.databases.retrieve({
        database_id: mapping.target.id,
      });
      
      // 현재 설정과 비교
      for (const fieldMapping of mapping.fieldMappings) {
        const notionField = db.properties[fieldMapping.target];
        
        if (!notionField) {
          // 필드가 삭제되었거나 이름이 변경됨
          const renamedField = this.findRenamedField(
            db.properties,
            fieldMapping
          );
          
          if (renamedField) {
            changes.push({
              type: 'field_renamed',
              entity: mapping.entity,
              oldName: fieldMapping.target,
              newName: renamedField.name,
              suggestedAction: 'update_mapping',
            });
          } else {
            changes.push({
              type: 'field_deleted',
              entity: mapping.entity,
              fieldName: fieldMapping.target,
              suggestedAction: 'remove_mapping_or_recreate_field',
            });
          }
        }
      }
    }
    
    return changes;
  }
  
  private findRenamedField(
    properties: Record<string, unknown>,
    fieldMapping: FieldMapping
  ): { name: string } | null {
    // 타입이 같고 설명이 비슷한 필드 찾기 (휴리스틱)
    for (const [name, prop] of Object.entries(properties)) {
      if (prop.type === fieldMapping.type) {
        // 추가 검증 로직 (예: 최근 생성된 필드, 설명 유사도 등)
        return { name };
      }
    }
    return null;
  }
}
```

### 3. Adapter Registry

```typescript
class AdapterRegistry {
  private adapters: Map<string, IntegrationAdapter> = new Map();
  
  async loadAdapters(configPath: string = 'registry/integrations') {
    // 모든 integration YAML 파일 로드
    const configFiles = await glob(`${configPath}/*.yml`);
    
    for (const file of configFiles) {
      const config = await this.loadConfig(file);
      
      if (!config.enabled) continue;
      
      // Adapter 인스턴스 생성
      const adapter = this.createAdapter(config);
      
      // 연결 확인
      await adapter.connect();
      
      // 등록
      this.adapters.set(config.provider, adapter);
    }
  }
  
  private createAdapter(config: IntegrationConfig): IntegrationAdapter {
    switch (config.provider) {
      case 'notion':
        return new NotionAdapter(config);
      case 'airtable':
        return new AirtableAdapter(config);
      case 'google-sheets':
        return new GoogleSheetsAdapter(config);
      case 'slack':
        return new SlackAdapter(config);
      case 'github':
        return new GitHubAdapter(config);
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }
  
  get(provider: string): IntegrationAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`Adapter not found: ${provider}`);
    }
    return adapter;
  }
}
```

---

## 선언적 Integration Definition

### 1. Integration Config 예시들

#### Notion Integration

```yaml
# registry/integrations/notion.yml
type: integration
provider: notion
enabled: true
version: 1.0.0

connection:
  apiKey: ${NOTION_API_KEY}
  retryPolicy:
    maxRetries: 3
    backoff: exponential

mappings:
  - entity: project
    source: internal.project
    target:
      type: database
      id: ${NOTION_PROJECT_DB_ID}
    sync:
      direction: bidirectional
      interval: 5m
    fieldMappings:
      - source: id
        target: ID
        type: title
        primaryKey: true
      
      - source: name
        target: ${NOTION_FIELD_PROJECT_NAME}
        type: title
      
      - source: status
        target: Status
        type: select
        valueMapping:
          pending: 대기
          in_progress: 진행중
          completed: 완료
          cancelled: 취소
      
      - source: createdAt
        target: Created
        type: date
        readOnly: true

autoMigration:
  enabled: true
  checkInterval: 1h
  notifyOnChange: true
  actions:
    - type: field_renamed
      action: update_mapping_auto
    - type: field_deleted
      action: notify_admin
    - type: new_field
      action: ignore
```

#### Google Sheets Integration

```yaml
# registry/integrations/google-sheets.yml
type: integration
provider: google-sheets
enabled: true

connection:
  credentialsPath: ${GOOGLE_CREDENTIALS_PATH}
  scopes:
    - https://www.googleapis.com/auth/spreadsheets

mappings:
  - entity: project
    source: internal.project
    target:
      type: spreadsheet
      id: ${GOOGLE_SHEET_ID}
      sheet: Projects
      headerRow: 1
    sync:
      direction: push
      interval: 30m
    fieldMappings:
      - source: id
        target: A  # 또는 "Project ID"
        type: string
      
      - source: name
        target: B  # 또는 "Project Name"
        type: string
      
      - source: status
        target: C
        type: string
        valueMapping:
          pending: 대기
          in_progress: 진행중
          completed: 완료

autoMigration:
  enabled: true
  checkInterval: 1d
  actions:
    - type: column_renamed
      action: update_mapping_auto
    - type: column_added
      action: ignore
```

#### Slack Integration

```yaml
# registry/integrations/slack.yml
type: integration
provider: slack
enabled: true

connection:
  botToken: ${SLACK_BOT_TOKEN}
  appToken: ${SLACK_APP_TOKEN}

mappings:
  - entity: notification
    source: internal.notification
    target:
      type: channel
      id: ${SLACK_CHANNEL_ID}
    fieldMappings:
      - source: message
        target: text
        type: string
      
      - source: priority
        target: color
        type: string
        valueMapping:
          high: danger
          medium: warning
          low: good
      
      - source: attachments
        target: blocks
        type: json
        transformer: notificationToBlocks  # 커스텀 변환 함수

events:
  - type: message
    filter:
      channel: ${SLACK_CHANNEL_ID}
    handler: handleSlackMessage
  
  - type: reaction_added
    filter:
      emoji: white_check_mark
    handler: handleApproval
```

---

## 자동 마이그레이션 시스템

### 1. Schema Change Detection

```typescript
class AutoMigrationEngine {
  private registry: AdapterRegistry;
  private notificationService: NotificationService;
  
  async detectChanges(): Promise<MigrationPlan> {
    const allChanges: SchemaChange[] = [];
    
    // 모든 adapter의 스키마 변경 감지
    for (const [provider, adapter] of this.registry.entries()) {
      const changes = await adapter.detectSchemaChange();
      allChanges.push(...changes.map(c => ({ ...c, provider })));
    }
    
    // Migration Plan 생성
    return this.createMigrationPlan(allChanges);
  }
  
  private createMigrationPlan(changes: SchemaChange[]): MigrationPlan {
    const plan: MigrationPlan = {
      changes,
      actions: [],
    };
    
    for (const change of changes) {
      const config = this.getIntegrationConfig(change.provider);
      const rule = config.autoMigration.actions.find(
        a => a.type === change.type
      );
      
      if (!rule) continue;
      
      switch (rule.action) {
        case 'update_mapping_auto':
          plan.actions.push({
            type: 'auto_fix',
            change,
            action: this.generateAutoFixAction(change),
          });
          break;
        
        case 'notify_admin':
          plan.actions.push({
            type: 'manual_review',
            change,
            action: 'Send notification to admin',
          });
          break;
        
        case 'ignore':
          plan.actions.push({
            type: 'ignore',
            change,
          });
          break;
      }
    }
    
    return plan;
  }
  
  async executeMigration(plan: MigrationPlan): Promise<MigrationResult> {
    const results: MigrationActionResult[] = [];
    
    for (const action of plan.actions) {
      try {
        switch (action.type) {
          case 'auto_fix':
            await this.executeAutoFix(action);
            results.push({ action, success: true });
            break;
          
          case 'manual_review':
            await this.notifyAdmin(action);
            results.push({ action, success: true, requiresManualReview: true });
            break;
          
          case 'ignore':
            results.push({ action, success: true, ignored: true });
            break;
        }
      } catch (error) {
        results.push({ action, success: false, error });
      }
    }
    
    return { results };
  }
  
  private async executeAutoFix(action: MigrationAction): Promise<void> {
    const { change } = action;
    
    if (change.type === 'field_renamed') {
      // YAML 파일 자동 업데이트
      const configPath = `registry/integrations/${change.provider}.yml`;
      const config = await this.loadConfig(configPath);
      
      // 매핑 업데이트
      const mapping = config.mappings.find(m => m.entity === change.entity);
      const fieldMapping = mapping.fieldMappings.find(
        f => f.target === change.oldName
      );
      
      if (fieldMapping) {
        fieldMapping.target = change.newName;
        
        // 파일 저장
        await this.saveConfig(configPath, config);
        
        // GitHub에 커밋 (SSOT)
        await this.commitToGitHub({
          path: configPath,
          message: `Auto-migration: ${change.provider} field renamed ${change.oldName} → ${change.newName}`,
          changes: config,
        });
        
        // Adapter 리로드
        await this.registry.reload(change.provider);
      }
    }
  }
}
```

### 2. Migration Scheduler

```typescript
class MigrationScheduler {
  private engine: AutoMigrationEngine;
  
  start() {
    // 모든 integration의 checkInterval에 따라 스케줄링
    for (const config of this.getAllIntegrationConfigs()) {
      if (!config.autoMigration?.enabled) continue;
      
      const interval = this.parseInterval(config.autoMigration.checkInterval);
      
      setInterval(async () => {
        await this.runMigrationCheck(config.provider);
      }, interval);
    }
  }
  
  private async runMigrationCheck(provider: string): Promise<void> {
    try {
      // 변경 감지
      const plan = await this.engine.detectChanges();
      
      // 해당 provider 관련 변경만 필터링
      const providerChanges = plan.changes.filter(c => c.provider === provider);
      
      if (providerChanges.length === 0) return;
      
      // Migration 실행
      const result = await this.engine.executeMigration({
        changes: providerChanges,
        actions: plan.actions.filter(a => a.change.provider === provider),
      });
      
      // 결과 로깅
      await this.logMigrationResult(provider, result);
      
      // Slack 알림 (필요 시)
      if (result.results.some(r => r.requiresManualReview)) {
        await this.notifyManualReviewRequired(provider, result);
      }
    } catch (error) {
      console.error(`Migration check failed for ${provider}:`, error);
      await this.notifyMigrationError(provider, error);
    }
  }
}
```

---

## 실전 예시

### 시나리오 1: Notion 필드명 변경

**Before**:
```
Notion Database "Projects"
- Field: "Project Name" (title)
- Field: "Client" (rich_text)
```

**Change**:
```
관리자가 Notion에서 "Project Name" → "프로젝트명"으로 변경
```

**Auto-Migration 동작**:

```typescript
// 1시간 후 자동 감지
const changes = await notionAdapter.detectSchemaChange();
// [
//   {
//     type: 'field_renamed',
//     entity: 'project',
//     oldName: 'Project Name',
//     newName: '프로젝트명',
//   }
// ]

// Auto-fix 실행
// registry/integrations/notion.yml 자동 업데이트:
fieldMappings:
  - source: name
    target: 프로젝트명  # 자동 변경됨
    type: title

// GitHub 커밋
git commit -m "Auto-migration: notion field renamed Project Name → 프로젝트명"

// Adapter 리로드
await adapterRegistry.reload('notion');

// 시스템 정상 동작 계속
```

### 시나리오 2: Google Sheets 컬럼 순서 변경

**Before**:
```yaml
fieldMappings:
  - source: id
    target: A
  - source: name
    target: B
```

**Change**:
```
관리자가 Google Sheets에서 컬럼 A와 B 순서 변경
```

**Auto-Migration 동작**:

```typescript
// 감지
const changes = await sheetsAdapter.detectSchemaChange();
// [
//   {
//     type: 'column_reordered',
//     entity: 'project',
//     mapping: { 'A': 'B', 'B': 'A' }
//   }
// ]

// Auto-fix
fieldMappings:
  - source: id
    target: B  # 자동 변경
  - source: name
    target: A  # 자동 변경

// 알림 (선택적)
await slack.send({
  channel: '#tech-alerts',
  message: '📊 Google Sheets 컬럼 순서가 변경되어 자동으로 매핑을 업데이트했습니다.',
});
```

### 시나리오 3: Notion → Airtable 마이그레이션

**Step 1: Airtable Integration 추가**

```yaml
# registry/integrations/airtable.yml (새 파일)
type: integration
provider: airtable
enabled: false  # 처음엔 비활성

connection:
  apiKey: ${AIRTABLE_API_KEY}

mappings:
  - entity: project
    source: internal.project
    target:
      type: table
      baseId: ${AIRTABLE_BASE_ID}
      tableName: Projects
    # Notion과 동일한 fieldMappings 복사
    fieldMappings: [...]
```

**Step 2: 데이터 마이그레이션**

```typescript
// Migration Script
const notionData = await notionAdapter.query('project', {});
const airtableAdapter = adapterRegistry.get('airtable');

for (const project of notionData) {
  await airtableAdapter.create('project', project);
}
```

**Step 3: 전환**

```yaml
# registry/integrations/notion.yml
enabled: false  # Notion 비활성화

# registry/integrations/airtable.yml
enabled: true   # Airtable 활성화
```

**코드 변경 없음!** 시스템은 자동으로 Airtable을 사용하기 시작합니다.

---

## 구현 우선순위

### Phase 1: Core Adapter Framework (2주)

1. ✅ IntegrationAdapter 인터페이스 정의
2. ✅ AdapterRegistry 구현
3. ✅ NotionAdapter 구현 (MVP)
4. ✅ YAML 설정 로더

### Phase 2: Auto-Migration Engine (3주)

1. ✅ Schema Change Detection
2. ✅ Migration Plan Generator
3. ✅ Auto-Fix Executor
4. ✅ Migration Scheduler

### Phase 3: 추가 Adapters (각 1주)

1. ✅ GoogleSheetsAdapter
2. ✅ AirtableAdapter
3. ✅ SlackAdapter
4. ✅ GitHubAdapter

---

## 핵심 장점

### 1. 유지보수 용이성

- **설정 변경만으로 동작**: 코드 수정 없이 YAML 편집
- **자동 마이그레이션**: 외부 시스템 변경에 자동 대응
- **버전 관리**: GitHub에 모든 설정 변경 기록

### 2. 확장성

- **새 시스템 추가 쉬움**: Adapter 하나만 구현하면 됨
- **시스템 교체 쉬움**: 설정 파일만 변경
- **다중 시스템 지원**: 여러 시스템 동시 사용 가능

### 3. 견고성 (Robustness)

- **이름 변경에 강함**: 자동 감지 및 적용
- **스키마 변경에 강함**: 자동 마이그레이션
- **오류 복구**: 변경 실패 시 알림 및 롤백

---

**Built with ❤️ by Kyndof Team**
