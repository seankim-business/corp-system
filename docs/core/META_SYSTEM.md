# Meta System - 시스템을 만드는 시스템

> **핵심 개념**: YAML 정의서 → 완전히 동작하는 Multi-Agent Product 자동 생성

---

## 목차

- [개요](#개요)
- [핵심 원칙](#핵심-원칙)
- [Product Definition DSL](#product-definition-dsl)
- [자동 생성 엔진](#자동-생성-엔진)
- [기술 스택 선정](#기술-스택-선정)
- [실전 예시](#실전-예시)
- [구현 로드맵](#구현-로드맵)

---

## 개요

### 문제 정의

**기존 방식 (하드코딩)**:
```typescript
// ❌ BAD: 새 프로덕트마다 코드 작성 필요
class ResearchAgent {
  async research(topic: string) {
    const data = await this.collectData(topic);
    const classified = await this.classify(data);
    return classified;
  }
}

class ConceptAgent {
  async generateConcepts(research: Research) {
    const concepts = [];
    for (let i = 0; i < 50; i++) {
      concepts.push(await this.generate(research));
    }
    return concepts;
  }
}

// 100줄+ 코드... 그리고 다음 프로덕트에서 다시 작성
```

**문제점**:
1. 프로덕트마다 코드 재작성
2. 에이전트 간 연결 하드코딩
3. 워크플로우 변경 시 코드 수정 필요
4. 유지보수 어려움

---

### 해결책: 선언적 Product Definition

**새 방식 (YAML 기반 자동 생성)**:
```yaml
# ✅ GOOD: products/2000atelier.yml
name: 2000atelier
version: 1.0.0
description: K-POP 의상 제작 자동화

value_stream:
  - stage: research
    agent:
      type: auto-generate  # 자동 생성
      role: "K-POP 의상 리서처"
      parallel: 100
      skills:
        - web-search
        - image-analysis
    output: research_db
    auto_evolve_schema: true
  
  - stage: concept-generation
    agent:
      type: auto-generate
      role: "의상 기획자"
      parallel: 50
    input: research_db
    output: concepts
    human_selection:
      min: 3
      max: 5

deployment:
  auto: true
  platform: langgraph-cloud
```

**결과**:
- ✅ **코드 0줄** - YAML만 작성
- ✅ **에이전트 자동 생성** - 타입, 역할, 스킬 기반
- ✅ **워크플로우 자동 연결** - 입출력 매핑
- ✅ **즉시 배포** - 설정 저장 즉시 동작

---

## 핵심 원칙

### 1. Everything is YAML

모든 것을 YAML로 정의:
- Agents (역할, 모델, 스킬)
- Workflows (n8n, ComfyUI 등)
- Integrations (Notion, Slack 등)
- Database Schemas
- UI Components

### 2. Auto-Generation First

수동 코딩은 마지막 수단:
- YAML → TypeScript Agent 자동 생성
- YAML → Database Schema 자동 생성
- YAML → React UI 자동 생성
- YAML → n8n Workflow 자동 생성

### 3. Hot Reload Everything

변경 즉시 반영:
- YAML 파일 변경 감지 (File Watcher)
- 자동 검증 (JSON Schema)
- 자동 재생성
- 자동 리로드 (무중단)

### 4. Configuration over Code

설정으로 해결 가능하면 코드 금지:
- 에이전트 행동 = YAML 설정
- 워크플로우 = YAML 설정
- 통합 = YAML 설정
- 권한 = YAML 설정

---

## Product Definition DSL

### 최상위 구조

```yaml
# products/{product-name}.yml

# 메타데이터
name: string                    # 프로덕트 이름
version: semver                 # 버전
description: string             # 설명
enabled: boolean                # 활성화 여부

# 에이전트 정의
agents:
  - name: string                # 에이전트 이름
    type: string                # auto-generate | reference | custom
    role: string                # 역할 설명 (LLM이 해석)
    model: string               # claude-sonnet-4 | gpt-4 | auto
    skills: string[]            # 사용할 스킬 목록
    tools: string[]             # 사용할 도구 목록
    parallel: number            # 병렬 실행 개수
    system_prompt: string       # 추가 시스템 프롬프트

# 워크플로우 정의
workflows:
  - name: string
    engine: n8n | comfyui | blender | clo3d
    template: string            # 템플릿 경로
    parameters: object          # 파라미터 매핑

# 밸류 스트림 정의
value_stream:
  - stage: string               # 단계 이름
    agent: string | object      # 에이전트 참조 또는 인라인 정의
    input: string | string[]    # 입력 데이터
    output: string              # 출력 데이터
    parallel: boolean           # 병렬 실행 여부
    human_selection: object     # 사람 선택 필요 시
    validation: object          # 검증 규칙
    auto_features: object       # 자동화 기능

# 데이터베이스 정의
database:
  entities:
    - name: string
      fields: object[]
      auto_evolve: boolean      # 자동 스키마 진화
      indexes: string[]

# 통합 정의
integrations:
  - provider: notion | slack | github | ...
    entities: object[]          # 매핑할 엔티티
    sync: object                # 동기화 설정

# 배포 설정
deployment:
  auto: boolean                 # 자동 배포
  platform: string              # langgraph-cloud | local | k8s
  observability: object         # 모니터링 설정
```

---

### Agent 정의 방식

#### 방식 1: Auto-Generate (권장)

**시스템이 역할 설명을 읽고 에이전트를 자동 생성**

```yaml
agents:
  - name: research-agent
    type: auto-generate
    role: |
      당신은 K-POP 아티스트 의상을 리서치하는 전문가입니다.
      
      주요 업무:
      1. SNS, 뮤직비디오, 무대 영상에서 의상 데이터 수집
      2. 무드, 컬러, 실루엣 등 감성적 차원으로 자동 분류
      3. 새로운 분류 축 발견 시 DB 스키마 자동 업데이트
    
    skills:
      - web-search       # 웹 검색 능력
      - image-analysis   # 이미지 분석
      - database-ops     # DB 조작
    
    parallel: 100        # 100개 병렬 실행
    model: auto          # 시스템이 최적 모델 선택
```

**자동 생성 결과**:
```typescript
// 시스템이 자동으로 생성한 코드 (사용자는 볼 필요 없음)
class ResearchAgent {
  constructor() {
    this.model = selectBestModel('research', { priority: 'speed' });
    this.skills = loadSkills(['web-search', 'image-analysis', 'database-ops']);
    this.systemPrompt = `당신은 K-POP 아티스트...`;
  }
  
  async execute(input: unknown) {
    // 역할 설명 기반 자동 구현
    const data = await this.parallelCollect(100);
    const classified = await this.autoClassify(data);
    return classified;
  }
}
```

---

#### 방식 2: Reference (기존 에이전트 재사용)

```yaml
agents:
  - name: oracle
    type: reference
    ref: builtin.oracle  # OhMyOpenCode 내장 에이전트
```

---

#### 방식 3: Custom (완전 커스텀)

```yaml
agents:
  - name: custom-validator
    type: custom
    implementation: ./agents/custom-validator.ts
    config:
      threshold: 0.9
```

---

### Value Stream 정의

```yaml
value_stream:
  # 1단계: 리서치
  - stage: research
    agent: research-agent      # 위에서 정의한 에이전트
    input: ${user.topic}       # 사용자 입력
    output: research_db        # 출력 → 다음 단계 입력
    auto_features:
      schema_evolution: true   # DB 스키마 자동 진화
      parallel: 100            # 100개 병렬
  
  # 2단계: 기획 생성
  - stage: concept-generation
    agent:
      type: auto-generate      # 인라인 에이전트 정의
      role: "기획안 50개 생성"
      parallel: 50
    input: research_db
    output: concepts
    human_selection:           # 사람 개입
      min: 3
      max: 5
      ui: grid                 # UI 타입
  
  # 3단계: 디자인 생성
  - stage: design-generation
    agent:
      type: auto-generate
      role: "선택된 기획안당 50개 디자인 생성"
      parallel: 50
      model: gemini-3-pro      # 크리에이티브 작업
    input: ${human.selected_concepts}
    output: designs
    workflow:
      engine: comfyui
      template: fashion-design  # ComfyUI 템플릿
      auto_generate: true       # 워크플로우 자동 생성
  
  # 4단계: 디자인 검증
  - stage: design-validation
    agents:                     # 여러 에이전트 병렬
      - feasibility-agent
      - alignment-agent
      - fan-reaction-agent
    input: designs
    output: validation_reports
    aggregation: merge         # 결과 병합
```

---

### Database Auto-Evolution

```yaml
database:
  entities:
    - name: research_item
      auto_evolve: true        # 🔥 핵심 기능
      base_fields:
        - name: id
          type: uuid
        - name: image_url
          type: string
        - name: source
          type: string
      
      # 초기 분류 차원
      classification_dimensions:
        - name: mood
          type: categorical
          auto_discover_values: true
        
        - name: color_palette
          type: categorical
          auto_discover_values: true
      
      # 시스템이 새 차원 자동 추가
      evolution_rules:
        min_cluster_size: 50
        coherence_threshold: 0.7
        approval: auto           # auto | manual
```

**동작 원리**:
1. 100개 아이템 수집
2. AI가 패턴 발견 ("이 그룹은 모두 'Y2K 스타일'이네?")
3. 새 차원 자동 생성: `style_era: categorical`
4. DB 스키마 자동 마이그레이션
5. 기존 데이터 재분류
6. GitHub에 변경 커밋

---

### Workflow Auto-Generation

```yaml
workflows:
  - name: fashion-image-generation
    engine: comfyui
    auto_generate: true        # 🔥 워크플로우 자동 생성
    
    description: |
      기획안을 읽고 패션 이미지를 생성합니다.
      
      입력: 기획안 텍스트 + 레퍼런스 이미지
      출력: 고품질 패션 디자인 이미지 (1024x1024)
      
      요구사항:
      - SDXL Turbo 모델 사용
      - ControlNet으로 실루엣 유지
      - 3개 변형 생성
    
    # 시스템이 이 설명을 읽고 ComfyUI JSON 자동 생성
    # 또는 템플릿 기반
    template: base-image-generation
    parameters:
      model: ${models.sdxl_turbo}
      steps: 20
      cfg_scale: 7
```

**자동 생성 결과** (ComfyUI JSON):
```json
{
  "version": 1,
  "nodes": [
    {
      "id": "1",
      "type": "LoadImage",
      "widgets_values": ["${input.reference_image}"]
    },
    {
      "id": "2",
      "type": "CLIPTextEncode",
      "widgets_values": ["${input.concept_text}"]
    },
    {
      "id": "3",
      "type": "KSampler",
      "widgets_values": [20, 7, "${random_seed}"]
    }
  ]
}
```

---

## 자동 생성 엔진

### 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ 1. YAML Definition (products/2000atelier.yml)               │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Parser & Validator                                       │
│    - YAML → JSON                                            │
│    - JSON Schema Validation                                 │
│    - Dependency Resolution                                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Code Generator                                           │
│    ├─ Agent Generator (TypeScript)                          │
│    ├─ Workflow Generator (n8n/ComfyUI JSON)                 │
│    ├─ Database Schema Generator (SQL)                       │
│    ├─ Integration Config Generator (YAML)                   │
│    └─ UI Component Generator (React)                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Orchestrator Builder                                     │
│    - LangGraph StateGraph 생성                              │
│    - CrewAI Crew 생성 (선택)                                │
│    - OhMyOpenCode delegate_task 통합                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Deployment                                               │
│    - LangGraph Cloud 배포                                   │
│    - Web UI 자동 생성                                       │
│    - API 엔드포인트 노출                                    │
└─────────────────────────────────────────────────────────────┘
```

---

### 핵심 컴포넌트

#### 1. Agent Generator

```typescript
// src/meta/agent-generator.ts
class AgentGenerator {
  async generate(definition: AgentDefinition): Promise<AgentCode> {
    if (definition.type === 'auto-generate') {
      return this.autoGenerate(definition);
    } else if (definition.type === 'reference') {
      return this.loadReference(definition.ref);
    } else if (definition.type === 'custom') {
      return this.loadCustom(definition.implementation);
    }
  }
  
  private async autoGenerate(def: AgentDefinition): Promise<AgentCode> {
    // 1. 역할 설명 분석
    const capabilities = await this.analyzeRole(def.role);
    
    // 2. 최적 모델 선택
    const model = def.model === 'auto' 
      ? this.selectBestModel(capabilities)
      : def.model;
    
    // 3. 스킬 로딩
    const skills = await this.loadSkills(def.skills);
    
    // 4. 도구 권한 설정
    const tools = this.configureTools(def.tools);
    
    // 5. LangChain Agent 생성 코드
    return this.generateLangChainAgent({
      name: def.name,
      model,
      systemPrompt: def.role,
      skills,
      tools,
    });
  }
  
  private generateLangChainAgent(config: AgentConfig): string {
    return `
import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

export const ${config.name} = createReactAgent({
  llm: new ChatAnthropic({ 
    model: "${config.model}",
    temperature: 0.7,
  }),
  tools: [${config.tools.join(', ')}],
  systemPrompt: \`${config.systemPrompt}\`,
});
`;
  }
}
```

---

#### 2. Workflow Generator

```typescript
// src/meta/workflow-generator.ts
class WorkflowGenerator {
  async generate(
    definition: WorkflowDefinition
  ): Promise<WorkflowJSON> {
    if (definition.auto_generate) {
      return this.autoGenerate(definition);
    } else if (definition.template) {
      return this.fromTemplate(definition);
    }
  }
  
  private async autoGenerate(def: WorkflowDefinition): Promise<WorkflowJSON> {
    // AI가 설명을 읽고 워크플로우 생성
    const prompt = `
당신은 ${def.engine} 워크플로우 생성 전문가입니다.

다음 요구사항을 읽고 JSON 워크플로우를 생성하세요:
${def.description}

출력 형식: ${def.engine} JSON Schema
`;
    
    const workflowJSON = await this.llm.generate(prompt);
    
    // 검증
    await this.validate(workflowJSON, def.engine);
    
    return workflowJSON;
  }
  
  private async fromTemplate(def: WorkflowDefinition): Promise<WorkflowJSON> {
    // 템플릿 로드
    const template = await this.loadTemplate(def.template);
    
    // 파라미터 치환
    return this.substituteParameters(template, def.parameters);
  }
}
```

---

#### 3. Value Stream Orchestrator

```typescript
// src/meta/value-stream-builder.ts
class ValueStreamBuilder {
  async build(
    valueStream: ValueStreamDefinition[]
  ): Promise<StateGraph> {
    const graph = new StateGraph(this.createStateSchema(valueStream));
    
    for (const stage of valueStream) {
      // 1. 에이전트 노드 추가
      const agent = await this.agentGenerator.generate(stage.agent);
      graph.add_node(stage.stage, agent);
      
      // 2. 입출력 연결
      if (stage.input) {
        const inputStage = this.findStageByOutput(valueStream, stage.input);
        if (inputStage) {
          graph.add_edge(inputStage.stage, stage.stage);
        }
      }
      
      // 3. 사람 개입 포인트
      if (stage.human_selection) {
        graph.add_node(`${stage.stage}_human`, this.createHumanNode(stage));
        graph.add_edge(stage.stage, `${stage.stage}_human`);
      }
      
      // 4. 병렬 실행
      if (stage.parallel) {
        graph.add_node(
          `${stage.stage}_parallel`,
          this.createParallelNode(stage, agent)
        );
      }
    }
    
    return graph.compile();
  }
  
  private createParallelNode(stage: Stage, agent: Agent) {
    return async (state: State) => {
      const tasks = Array.from({ length: stage.parallel }, (_, i) => 
        agent.run({ ...state.input, seed: i })
      );
      
      const results = await Promise.all(tasks);
      
      return {
        [stage.output]: results,
      };
    };
  }
}
```

---

#### 4. Database Schema Generator

```typescript
// src/meta/database-generator.ts
class DatabaseSchemaGenerator {
  async generate(entities: EntityDefinition[]): Promise<Migration[]> {
    const migrations: Migration[] = [];
    
    for (const entity of entities) {
      // 1. 기본 테이블 생성
      migrations.push(this.createTable(entity));
      
      // 2. Auto-evolve 설정 시
      if (entity.auto_evolve) {
        migrations.push(this.createEvolutionTriggers(entity));
      }
      
      // 3. 인덱스 생성
      for (const index of entity.indexes) {
        migrations.push(this.createIndex(entity.name, index));
      }
    }
    
    return migrations;
  }
  
  private createTable(entity: EntityDefinition): Migration {
    const columns = entity.base_fields.map(f => 
      `${f.name} ${this.mapType(f.type)}`
    );
    
    // 분류 차원 컬럼 추가
    for (const dim of entity.classification_dimensions || []) {
      columns.push(`${dim.name} VARCHAR(255)`);
    }
    
    return {
      up: `CREATE TABLE ${entity.name} (${columns.join(', ')});`,
      down: `DROP TABLE ${entity.name};`,
    };
  }
  
  private createEvolutionTriggers(entity: EntityDefinition): Migration {
    // 주기적으로 패턴 분석하는 함수 생성
    return {
      up: `
CREATE OR REPLACE FUNCTION evolve_${entity.name}_schema()
RETURNS void AS $$
BEGIN
  -- AI가 새 차원 발견 시 호출
  -- ALTER TABLE ADD COLUMN 자동 실행
END;
$$ LANGUAGE plpgsql;

-- 크론잡 등록
SELECT cron.schedule('evolve_${entity.name}', '0 * * * *', 
  'SELECT evolve_${entity.name}_schema()');
      `,
      down: `SELECT cron.unschedule('evolve_${entity.name}');`,
    };
  }
}
```

---

## 기술 스택 선정

### 최종 선정 (조사 결과 기반)

| 레이어 | 기술 | 이유 |
|--------|------|------|
| **Agent 오케스트레이션** | **LangGraph** + OhMyOpenCode | - Assistants API (런타임 설정)<br>- 5가지 오케스트레이션 패턴<br>- Production-grade (Checkpointing)<br>- OhMyOpenCode delegate_task 활용 |
| **YAML 파싱** | **CrewAI 패턴** | - YAML-first 설계 참고<br>- Variable interpolation 패턴 |
| **Workflow 생성** | **n8n API** + **ComfyUI JSON** | - n8n: REST API로 워크플로우 생성<br>- ComfyUI: JSON 스키마 기반 |
| **코드 생성** | **LLM** (Claude Opus) | - 역할 설명 → TypeScript 변환<br>- 워크플로우 설명 → JSON 변환 |
| **Runtime** | **LangGraph Cloud** | - Serverless 에이전트 실행<br>- Durable execution<br>- LangSmith 모니터링 |

---

### 하이브리드 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ YAML Definition Layer                                       │
│  - CrewAI 스타일 선언적 정의                                │
│  - Variable interpolation                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Code Generation Layer                                       │
│  - Claude Opus가 YAML 읽고 코드 생성                        │
│  - TypeScript Agent (LangChain)                             │
│  - Workflow JSON (n8n/ComfyUI)                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Orchestration Layer                                         │
│  - LangGraph StateGraph                                     │
│  - OhMyOpenCode delegate_task 통합                          │
│  - Handoffs/Subagents 패턴                                  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ Execution Layer                                             │
│  - LangGraph Cloud (Production)                             │
│  - Background 실행 (OhMyOpenCode 패턴)                      │
│  - Session 관리                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 실전 예시

### Example 1: 완전 자동 생성 프로덕트

```yaml
# products/customer-support.yml
name: customer-support-system
version: 1.0.0
enabled: true

agents:
  - name: router
    type: auto-generate
    role: |
      고객 문의를 분석하여 적절한 담당자에게 라우팅합니다.
      
      분류:
      - 기술 지원 → support-agent
      - 영업 문의 → sales-agent
      - 환불 요청 → refund-agent
    
    tools:
      - classify_intent
      - transfer_to_agent
  
  - name: support-agent
    type: auto-generate
    role: "기술 지원 전문가. 제품 사용법과 문제 해결을 도와줍니다."
    tools:
      - knowledge_base_search
      - create_ticket
  
  - name: sales-agent
    type: auto-generate
    role: "영업 전문가. 제품 소개와 견적을 제공합니다."
    tools:
      - crm_lookup
      - generate_quote

value_stream:
  - stage: routing
    agent: router
    input: ${user.message}
    output: routed_agent
  
  - stage: handling
    agent: ${routed_agent}  # 동적 에이전트
    input: ${user.message}
    output: response

integrations:
  - provider: slack
    events:
      - type: message
        trigger: value_stream.routing

deployment:
  auto: true
  platform: langgraph-cloud
```

**실행**:
```bash
# YAML 저장만 하면 자동으로:
# 1. 3개 에이전트 TypeScript 생성
# 2. LangGraph StateGraph 구성
# 3. Slack 통합 설정
# 4. LangGraph Cloud 배포
# 5. API 엔드포인트 노출

$ corp-system deploy products/customer-support.yml
✅ Agents generated: router, support-agent, sales-agent
✅ StateGraph compiled
✅ Deployed to https://customer-support.langraph.cloud
✅ Slack bot connected
```

---

### Example 2: 복잡한 Value Stream

```yaml
# products/content-factory.yml
name: content-factory
version: 1.0.0

value_stream:
  # 1. 주제 리서치 (병렬 10개)
  - stage: topic-research
    agent:
      type: auto-generate
      role: "주제 심층 리서치"
      parallel: 10
    input: ${user.topic}
    output: research_data
  
  # 2. 아웃라인 생성 (병렬 20개)
  - stage: outline-generation
    agent:
      type: auto-generate
      role: "글 구조 기획"
      parallel: 20
    input: research_data
    output: outlines
    human_selection:
      min: 3
      max: 5
  
  # 3. 본문 작성 (선택된 아웃라인당)
  - stage: content-writing
    agent:
      type: auto-generate
      role: "SEO 최적화 글 작성"
      model: gpt-4o
    input: ${human.selected_outlines}
    output: drafts
  
  # 4. 이미지 생성 (ComfyUI)
  - stage: image-generation
    workflow:
      engine: comfyui
      auto_generate: true
      description: "글 내용에 맞는 헤더 이미지 생성"
    input: drafts
    output: images
  
  # 5. 최종 검수 (Oracle)
  - stage: final-review
    agent:
      type: reference
      ref: builtin.oracle
    input:
      drafts: drafts
      images: images
    output: approved_content
  
  # 6. Notion 발행
  - stage: publish
    integration:
      provider: notion
      action: create_page
      database_id: ${NOTION_CONTENT_DB}
    input: approved_content

deployment:
  auto: true
```

---

### Example 3: DB Auto-Evolution 실전

```yaml
# products/fashion-research.yml
name: fashion-research
version: 1.0.0

database:
  entities:
    - name: fashion_items
      auto_evolve: true
      
      base_fields:
        - name: id
          type: uuid
        - name: image_url
          type: string
        - name: collected_at
          type: timestamp
      
      # 초기 분류 (사람이 정의)
      classification_dimensions:
        - name: color
          type: categorical
          values: [red, blue, green, ...]
        
        - name: season
          type: categorical
          values: [spring, summer, fall, winter]
      
      # AI가 발견할 새 차원 (예측)
      evolution_rules:
        min_cluster_size: 100
        coherence_threshold: 0.8
        auto_approve: true
        notify: slack://fashion-team

# 3개월 후 자동으로 추가된 차원들:
# - silhouette: [oversized, fitted, flowing]
# - vibe: [edgy, soft, minimal, maximal]
# - cultural_ref: [y2k, 90s, futuristic, vintage]
# - texture: [smooth, rough, glossy, matte]
```

---

## 구현 로드맵

### Phase 1: MVP - YAML Parser + Basic Generation (1개월)

**목표**: YAML → LangGraph Agent 자동 생성

1. ✅ **YAML Schema 정의** (1주)
   - Product Definition JSON Schema
   - Agent Definition Schema
   - Value Stream Schema

2. ✅ **Parser 구현** (1주)
   - YAML → JSON 변환
   - 검증 (ajv)
   - 의존성 해결

3. ✅ **Agent Generator** (2주)
   - auto-generate 타입 구현
   - LangChain Agent 코드 생성
   - 테스트 (2-3개 샘플 에이전트)

4. ✅ **Value Stream Builder** (1주)
   - StateGraph 자동 생성
   - 입출력 연결
   - 로컬 실행

**마일스톤**: `products/hello-world.yml` → 동작하는 에이전트

---

### Phase 2: Workflow + Integration (2개월)

**목표**: 외부 시스템 통합 + 워크플로우 생성

1. ✅ **Workflow Generator** (3주)
   - n8n API 연동
   - ComfyUI JSON 생성
   - 템플릿 시스템

2. ✅ **Integration Layer** (3주)
   - Adapter Registry
   - Notion/Slack/GitHub 어댑터
   - 자동 동기화

3. ✅ **Human-in-Loop** (2주)
   - UI 컴포넌트 자동 생성
   - Selection 인터페이스
   - Approval 플로우

**마일스톤**: `products/content-factory.yml` → End-to-End 동작

---

### Phase 3: Auto-Evolution + Learning (3개월)

**목표**: DB 스키마 자동 진화 + 학습 루프

1. ✅ **Schema Evolution Engine** (4주)
   - 패턴 발견 (클러스터링)
   - 새 차원 자동 제안
   - DB 마이그레이션

2. ✅ **Learning System** (4주)
   - 사람 피드백 수집
   - 모델 재훈련
   - 정확도 추적

3. ✅ **Production Deployment** (4주)
   - LangGraph Cloud 배포
   - 모니터링 (LangSmith)
   - Auto-scaling

**마일스톤**: `products/2000atelier.yml` → 완전 자동화

---

### Phase 4: Advanced Features (3-6개월)

1. ✅ **UI Auto-Generation** (4주)
   - React 컴포넌트 자동 생성
   - Value Stream 시각화
   - Dashboard

2. ✅ **Multi-Product Orchestration** (4주)
   - 프로덕트 간 데이터 공유
   - Cross-product workflows

3. ✅ **Optimization** (4주)
   - 비용 최적화 (모델 선택)
   - 성능 최적화 (병렬화)
   - 캐싱

**마일스톤**: 10개+ 프로덕트 동시 운영

---

## 핵심 장점

### 1. 개발 속도 100배

**Before (하드코딩)**:
- 새 프로덕트 개발: 2-4주
- 에이전트 코드: 500-1000 줄
- 테스트 + 디버깅: 1주

**After (YAML 생성)**:
- 새 프로덕트 개발: **2-4시간**
- YAML 정의: **50-100 줄**
- 테스트: 자동화

### 2. 유지보수 용이

- **하드코딩**: 코드 수정 → 테스트 → 배포
- **YAML**: 설정 변경 → 자동 재배포 (Hot Reload)

### 3. 비개발자도 수정 가능

```yaml
# 마케터가 직접 수정 가능
agents:
  - name: content-writer
    role: "SEO 최적화 블로그 작성"  # ← 이 부분만 수정
    parallel: 20  # ← 또는 생성 개수 조정
```

### 4. 실험 속도 향상

```yaml
# A/B 테스트도 YAML로
agents:
  - name: writer-v1
    role: "간결하고 명확한 글 작성"
  
  - name: writer-v2
    role: "감성적이고 스토리텔링 중심 글 작성"
```

---

## 다음 단계

1. **즉시 시작**: YAML Schema 정의 (`schema/product-definition.json`)
2. **2주 내**: Agent Generator 프로토타입
3. **1개월 내**: 첫 프로덕트 자동 생성 성공
4. **3개월 내**: 2000Atelier 완전 자동화

---

**Built with ❤️ by Kyndof Team**
