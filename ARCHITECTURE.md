# Kyndof Corp System - Architecture Documentation

> **상세 아키텍처 설계 문서**

---

## 목차

- [개요](#개요)
- [아키텍처 원칙](#아키텍처-원칙)
- [시스템 레이어](#시스템-레이어)
- [핵심 컴포넌트](#핵심-컴포넌트)
- [데이터 흐름](#데이터-흐름)
- [확장성 및 성능](#확장성-및-성능)
- [보안 및 권한](#보안-및-권한)
- [모니터링 및 관찰성](#모니터링-및-관찰성)

---

## 개요

Kyndof Corp System은 **레이어드 아키텍처**와 **플러그인 아키텍처**를 결합하여 확장 가능하고 유지보수하기 쉬운 기업 운영 시스템을 제공합니다.

### 핵심 설계 목표

1. **인터페이스 독립성**: Slack, Web, Terminal, API 어디서든 동일하게 동작
2. **확장 가능성**: 플러그인으로 기능 추가/제거 가능
3. **유지보수성**: 표준 기술, YAML 설정, Hot Reload
4. **학습 능력**: 사람 피드백으로 지속적 개선
5. **실물 세계 연동**: 디지털 ↔ 물리적 세계 통합

---

## 아키텍처 원칙

### 1. 계층 분리 (Layered Architecture)

```
┌─────────────────────────────────────────────┐
│   Interface Layer (Slack/Web/Terminal/API) │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   Application Layer (Orchestrator/Agents)  │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   Domain Layer (Business Logic)            │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│   Infrastructure Layer (DB/MCP/Storage)    │
└─────────────────────────────────────────────┘
```

**각 레이어는 상위 레이어에만 의존하며, 하위 레이어는 상위 레이어를 알지 못합니다.**

### 2. Command Bus Pattern

**모든 인터페이스에서 동일한 Command를 사용**하여 비즈니스 로직을 호출합니다.

```typescript
// 어떤 인터페이스든 동일한 명령 객체 사용
interface Command {
  type: string;           // 'execute_automation', 'create_task', 'approve_request'
  payload: unknown;       // 명령 데이터
  context: {
    userId: string;
    sessionId: string;
    source: 'slack' | 'web' | 'terminal' | 'api';
  };
}

// Command Bus가 처리
class CommandBus {
  async execute(command: Command): Promise<Result> {
    // 1. Permission Check (RABSIC)
    // 2. Route to Handler
    // 3. Execute
    // 4. Return Result
  }
}
```

### 3. Plugin Architecture

**모든 기능은 플러그인으로 등록**되며, YAML 설정으로 관리됩니다.

```yaml
# registry/agents/brand-agent.yml
type: agent
name: brand-agent
version: 1.0.0
category: function-agent
enabled: true
config:
  model: claude-sonnet-4.5
  skills:
    - content-creation
    - brand-guidelines
```

### 4. Event-Driven Architecture

**도메인 이벤트**를 통해 느슨하게 결합된 컴포넌트들이 통신합니다.

```typescript
// 도메인 이벤트
interface DomainEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  payload: unknown;
}

// 이벤트 발행
eventBus.publish({
  eventType: 'AUTOMATION_COMPLETED',
  payload: { automationId, result }
});

// 이벤트 구독
eventBus.subscribe('AUTOMATION_COMPLETED', async (event) => {
  await notificationService.notify(event);
  await ssotSyncService.syncToGitHub(event);
});
```

---

## 시스템 레이어

### Layer 1: Interface Layer

**역할**: 사용자와 시스템 간 상호작용 처리

```
┌──────────────────────────────────────────────────────────┐
│ Slack Interface                                          │
│  - Slack Bolt App                                        │
│  - Event Handlers (message, reaction, button)           │
│  - Session Management (ephemeral state)                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Web Interface                                            │
│  - React + TypeScript                                    │
│  - WebSocket (실시간 업데이트)                            │
│  - REST API Client                                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Terminal Interface                                       │
│  - OhMyOpenCode CLI                                      │
│  - Interactive Shell                                     │
│  - Session Continuity                                    │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ API Interface                                            │
│  - REST API (공개)                                        │
│  - GraphQL (내부)                                        │
│  - Webhook Endpoints                                     │
└──────────────────────────────────────────────────────────┘
```

**공통 책임**:
- 입력 파싱 및 검증
- Command 생성
- 결과 포맷팅 및 응답

### Layer 2: Application Layer

**역할**: 비즈니스 로직 오케스트레이션

```
┌──────────────────────────────────────────────────────────┐
│ Command Bus                                              │
│  - Command Routing                                       │
│  - Handler Registration                                  │
│  - Middleware (Logging, Validation)                      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Orchestrator (Atlas)                                     │
│  - Multi-Agent Coordination                              │
│  - Task Delegation                                       │
│  - Background Execution Management                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Permission Engine (RABSIC)                               │
│  - Authorization Check                                   │
│  - Approval Routing                                      │
│  - Context-based Permission                              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Session Manager                                          │
│  - Session Creation/Restoration                          │
│  - Cross-Interface Session                               │
│  - State Persistence                                     │
└──────────────────────────────────────────────────────────┘
```

### Layer 3: Domain Layer

**역할**: 핵심 비즈니스 로직

```
┌──────────────────────────────────────────────────────────┐
│ Multi-Agent System                                       │
│  - Prometheus (Planner)                                  │
│  - Atlas (Executor)                                      │
│  - Function Agents (Brand/Ops/CS/Finance)                │
│  - Specialist Agents (Oracle/Librarian/Explore)          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Workflow Module System                                   │
│  - Unified Gateway (n8n/ComfyUI/Blender/Clo3D)           │
│  - Module Registry                                       │
│  - Module Builder                                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Physical World Integration                               │
│  - Production Tracker                                    │
│  - Quality Inspector                                     │
│  - Learning System                                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ Automation Builder                                       │
│  - Business Agent (Interview)                            │
│  - Engineering Agent (Code Generation)                   │
│  - Deployment Pipeline                                   │
└──────────────────────────────────────────────────────────┘
```

### Layer 4: Infrastructure Layer

**역할**: 외부 시스템 및 데이터 접근

```
┌──────────────────────────────────────────────────────────┐
│ Storage                                                  │
│  - PostgreSQL (sessions, logs, learning data)            │
│  - Redis (cache, hot sessions)                           │
│  - Vector DB (knowledge search)                          │
│  - GitHub (SSOT)                                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ MCP Servers                                              │
│  - Notion MCP (project management)                       │
│  - Drive MCP (documents)                                 │
│  - Slack MCP (communication)                             │
│  - Figma MCP (design)                                    │
│  - GitHub MCP (SSOT)                                     │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ External Workflow Engines                                │
│  - n8n (automation workflows)                            │
│  - ComfyUI (image generation)                            │
│  - Blender (3D modeling)                                 │
│  - Clo3D (garment design)                                │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ AI Model Providers                                       │
│  - Anthropic (Claude Opus/Sonnet)                        │
│  - OpenAI (GPT-5.2)                                      │
│  - Google (Gemini 3 Pro)                                 │
│  - Ollama (local models)                                 │
└──────────────────────────────────────────────────────────┘
```

---

## 핵심 컴포넌트

### 1. Orchestrator (Atlas)

**책임**: 멀티 에이전트 조정 및 작업 실행

```typescript
class Atlas {
  async orchestrate(plan: Plan, context: ExecutionContext): Promise<Result> {
    // 1. Plan 파싱
    const steps = this.parsePlan(plan);
    
    // 2. 각 단계별 실행
    for (const step of steps) {
      // 2.1 Agent 선택 (Category + Skills)
      const agent = await this.selectAgent(step);
      
      // 2.2 Delegation (Background or Sync)
      const result = step.background 
        ? await this.delegateBackground(agent, step)
        : await this.delegateSync(agent, step);
      
      // 2.3 결과 검증
      if (!this.validate(result, step.expectedOutcome)) {
        await this.handleFailure(step, result);
      }
      
      // 2.4 Session 저장 (재사용을 위해)
      await this.saveSession(agent.sessionId, result);
    }
    
    // 3. 최종 결과 조합
    return this.aggregateResults(steps);
  }
  
  private async selectAgent(step: Step): Promise<Agent> {
    // Category 기반 모델 선택
    const model = this.getModelForCategory(step.category);
    
    // Skills 로딩
    const skills = await this.loadSkills(step.requiredSkills);
    
    return new Agent({ model, skills });
  }
}
```

### 2. Permission Engine (RABSIC)

**책임**: 조직 구조 기반 권한 관리

```typescript
class PermissionEngine {
  async checkPermission(
    user: User, 
    action: Action, 
    context: Context
  ): Promise<PermissionResult> {
    // 1. 조직 구조에서 사용자 역할 조회
    const roles = await this.getRoles(user, context);
    
    // 2. RABSIC 매트릭스 확인
    const rabsic = await this.getRabsicMatrix(action.domain);
    
    // 3. 권한 확인
    for (const role of roles) {
      // Responsible: 실행 권한
      if (rabsic.responsible.includes(role)) {
        return { allowed: true, requiresApproval: false };
      }
      
      // Accountable: 승인 필요
      if (rabsic.accountable.includes(role)) {
        return { allowed: true, requiresApproval: true };
      }
    }
    
    // 4. Backup 체크 (Primary 부재 시)
    if (await this.isPrimaryAbsent(rabsic.responsible)) {
      if (rabsic.backup.includes(user.role)) {
        return { allowed: true, requiresApproval: false };
      }
    }
    
    return { allowed: false };
  }
  
  async routeApproval(request: ApprovalRequest): Promise<void> {
    // Accountable 역할자에게 승인 요청 라우팅
    const approvers = await this.getAccountable(request.domain);
    await this.notificationService.sendApprovalRequest(approvers, request);
  }
}
```

### 3. Session Manager

**책임**: 인터페이스 독립적 세션 관리

```typescript
class SessionManager {
  async createSession(context: SessionContext): Promise<Session> {
    const session = {
      sessionId: generateId(),
      userId: context.userId,
      source: context.source, // 'slack' | 'web' | 'terminal' | 'api'
      state: {},
      history: [],
      createdAt: new Date(),
    };
    
    // Redis (hot) + PostgreSQL (cold)
    await this.redis.set(`session:${session.sessionId}`, session, 'EX', 3600);
    await this.db.sessions.create(session);
    
    return session;
  }
  
  async restoreSession(sessionId: string): Promise<Session> {
    // Redis 먼저 확인
    let session = await this.redis.get(`session:${sessionId}`);
    
    if (!session) {
      // PostgreSQL에서 복원
      session = await this.db.sessions.findOne({ sessionId });
      
      // Redis에 다시 캐싱
      await this.redis.set(`session:${sessionId}`, session, 'EX', 3600);
    }
    
    return session;
  }
  
  async switchInterface(
    sessionId: string, 
    newSource: 'slack' | 'web' | 'terminal' | 'api'
  ): Promise<void> {
    // 세션 유지한 채 인터페이스만 변경
    const session = await this.restoreSession(sessionId);
    session.source = newSource;
    await this.saveSession(session);
  }
}
```

### 4. Workflow Module System

**책임**: 외부 워크플로우 엔진 통합

```typescript
class WorkflowModuleSystem {
  private gateways: Map<string, WorkflowGateway> = new Map([
    ['n8n', new N8nGateway()],
    ['comfyui', new ComfyUIGateway()],
    ['blender', new BlenderGateway()],
    ['clo3d', new Clo3DGateway()],
  ]);
  
  async executeModule(module: WorkflowModule, input: unknown): Promise<unknown> {
    // 1. 모듈 유효성 확인
    this.validateModule(module);
    
    // 2. Gateway 선택
    const gateway = this.gateways.get(module.engine);
    
    // 3. 실행
    const result = await gateway.execute({
      workflowId: module.workflowId,
      input: input,
    });
    
    // 4. 결과 변환 (표준 형식으로)
    return this.transformResult(result, module.outputSchema);
  }
  
  async registerModule(definition: ModuleDefinition): Promise<void> {
    // 1. YAML 파싱
    const module = this.parseYaml(definition);
    
    // 2. 스키마 검증
    this.validateSchema(module);
    
    // 3. Registry 등록
    await this.registry.register(module);
    
    // 4. MCP Tool로 자동 등록 (Agent가 사용 가능하도록)
    await this.mcpServer.registerTool({
      name: module.name,
      description: module.description,
      inputSchema: module.inputSchema,
      handler: (input) => this.executeModule(module, input),
    });
    
    // 5. Hot Reload 트리거
    this.eventBus.publish({ eventType: 'MODULE_REGISTERED', payload: module });
  }
}
```

### 5. Physical World Integration

**책임**: 디지털-실물 연동

```typescript
class PhysicalWorldIntegration {
  async trackProduction(workOrder: WorkOrder): Promise<ProductionCycle> {
    const cycle = await this.db.productionCycles.create({
      workOrderId: workOrder.id,
      status: 'in_progress',
      steps: [],
    });
    
    // 각 단계 추적
    for (const step of workOrder.steps) {
      const stepResult = await this.executePhysicalStep(step, cycle);
      cycle.steps.push(stepResult);
      
      // 품질 검사
      if (step.requiresQualityCheck) {
        const qcResult = await this.qualityInspector.inspect(stepResult);
        
        if (!qcResult.passed) {
          // 학습 데이터 수집
          await this.learningSystem.recordFailure({
            cycle,
            step,
            qcResult,
            digitalSpec: step.spec,
            physicalResult: stepResult.measurements,
          });
          
          // 재작업 or 디자인 수정
          await this.handleQualityFailure(cycle, step, qcResult);
        }
      }
    }
    
    return cycle;
  }
  
  async qualityInspect(image: Buffer): Promise<QualityCheckResult> {
    // AI Vision으로 결함 감지
    const defects = await this.visionModel.detectDefects(image);
    
    // 측정값 추출
    const measurements = await this.visionModel.extractMeasurements(image);
    
    // 품질 기준과 비교
    const passed = this.checkQualityStandards(defects, measurements);
    
    return { passed, defects, measurements };
  }
}
```

### 6. Learning System

**책임**: 사람 피드백으로 지속적 개선

```typescript
class LearningSystem {
  async recordHumanFeedback(feedback: HumanFeedback): Promise<void> {
    // 1. 피드백 저장
    await this.db.learningData.create({
      type: feedback.type, // 'correction' | 'approval' | 'rejection'
      context: feedback.context,
      agentOutput: feedback.agentOutput,
      humanCorrection: feedback.humanCorrection,
      timestamp: new Date(),
    });
    
    // 2. 300 사이클마다 재훈련 트리거
    const totalFeedback = await this.db.learningData.count();
    if (totalFeedback % 300 === 0) {
      await this.triggerRetraining();
    }
  }
  
  async triggerRetraining(): Promise<void> {
    // 1. 학습 데이터 준비
    const trainingData = await this.prepareTrainingData();
    
    // 2. Fine-tuning
    const newModel = await this.fineTune({
      baseModel: this.currentModel,
      trainingData,
      epochs: 3,
    });
    
    // 3. 검증
    const accuracy = await this.validateModel(newModel);
    
    // 4. 정확도 향상 시에만 배포
    if (accuracy > this.currentAccuracy) {
      await this.deployModel(newModel);
      this.currentAccuracy = accuracy;
      
      // Dashboard 업데이트
      await this.updateDashboard({
        accuracy,
        improvementRate: accuracy - this.currentAccuracy,
        timestamp: new Date(),
      });
    }
  }
  
  private async prepareTrainingData(): Promise<TrainingDataset> {
    // 사람의 수정 사항을 학습 데이터로 변환
    const corrections = await this.db.learningData.find({
      type: 'correction',
    });
    
    return corrections.map(c => ({
      input: c.context + c.agentOutput,
      expectedOutput: c.humanCorrection,
      weight: this.calculateWeight(c), // 최근 피드백에 더 높은 가중치
    }));
  }
}
```

---

## 데이터 흐름

### 1. 일반적인 요청 처리 흐름

```
User (Slack)
  │
  ├─ "오늘 출시할 제품 이미지 생성해줘"
  │
  ▼
Slack Interface
  │
  ├─ Parse Input
  ├─ Create Command: { type: 'generate_image', payload: {...} }
  │
  ▼
Command Bus
  │
  ├─ Middleware: Logging
  ├─ Permission Check (RABSIC)
  │   └─ User has 'Responsible' role for 'brand-content' → OK
  │
  ▼
Orchestrator (Atlas)
  │
  ├─ Select Agent: Brand Agent (category: 'visual-engineering')
  ├─ Load Skills: ['content-creation', 'brand-guidelines']
  ├─ Delegate to ComfyUI Workflow Creator Agent
  │
  ▼
ComfyUI Workflow Creator Agent
  │
  ├─ Generate ComfyUI Workflow JSON
  ├─ Return to Atlas
  │
  ▼
Workflow Module System
  │
  ├─ Execute ComfyUI Workflow
  ├─ Monitor Progress
  │
  ▼
Result
  │
  ├─ Save to GitHub SSOT (/outputs/product-images/)
  ├─ Sync to Notion (update task)
  ├─ Notify via Slack
  │
  ▼
User receives image + confirmation
```

### 2. 승인 요청 흐름

```
User (실무자)
  │
  ├─ "10만원 광고비 집행 승인 요청"
  │
  ▼
Command Bus
  │
  ├─ Permission Check
  │   └─ User is 'Responsible' but action requires 'Accountable' approval
  │
  ▼
Permission Engine
  │
  ├─ Find 'Accountable' for 'marketing-budget'
  │   └─ Result: Marketing Manager
  ├─ Create Approval Request
  │
  ▼
Notification Service
  │
  ├─ Send to Marketing Manager (Slack DM)
  ├─ Include: Context, Amount, Requester, Approve/Reject buttons
  │
  ▼
Marketing Manager
  │
  ├─ Clicks "Approve"
  │
  ▼
Command Bus
  │
  ├─ Execute Original Command (광고비 집행)
  ├─ Notify Requester (승인 완료)
  ├─ Sync to GitHub SSOT (approval log)
```

### 3. 물리적 작업 추적 흐름

```
Digital Design (Clo3D)
  │
  ├─ Technical Designer 완성
  │
  ▼
Production Tracker
  │
  ├─ Work Order 생성
  ├─ QR 코드 생성 및 출력
  │
  ▼
Production Floor
  │
  ├─ 작업자 QR 스캔 → "재단 시작"
  ├─ Slack Bot: "재단 가이드: ..."
  │
  ├─ 작업자 QR 스캔 → "재단 완료" + 사진 업로드
  │
  ▼
Quality Inspector (AI)
  │
  ├─ 사진 분석
  ├─ 결함 감지: None
  ├─ 측정값: 길이 50.2cm (기준: 50.0±0.5cm) → PASS
  │
  ▼
Next Step
  │
  ├─ Slack Bot: "봉제 시작 가능"
  ├─ 작업자 QR 스캔 → "봉제 시작"
  │
  ... (반복)
  
  ▼
Final QC
  │
  ├─ AI 검사 결과: FAIL (스티치 불균일)
  │
  ▼
Learning System
  │
  ├─ Record: Digital Spec vs Physical Result
  ├─ Technical Designer 수정: "스티치 간격 3mm → 2.5mm"
  ├─ Learning Data: (spec_3mm, result_uneven) → correction_2.5mm
  │
  ▼
재작업 지시
  │
  ├─ Slack Bot: "스티치 재작업 필요 (2.5mm 간격)"
```

### 4. 학습 사이클 흐름

```
Production Cycles (1-300)
  │
  ├─ Collect Human Corrections
  ├─ Collect Digital vs Physical Gaps
  ├─ Collect AI vs Human QC Disagreements
  │
  ▼
300th Cycle Reached
  │
  ├─ Trigger Retraining
  │
  ▼
Learning System
  │
  ├─ Prepare Training Data
  │   └─ Weight: Recent (high) → Old (low)
  ├─ Fine-tune Model
  │   └─ Base: Current Model
  │   └─ Data: 300 cycles of feedback
  │
  ▼
Model Validation
  │
  ├─ Test on held-out data
  ├─ Accuracy: 87% → 89% (improved!)
  │
  ▼
Deploy New Model
  │
  ├─ Update Quality Inspector
  ├─ Update Production Advisor
  │
  ▼
Dashboard Update
  │
  ├─ "정확도 87% → 89% (300 사이클 학습 완료)"
  ├─ "다음 재훈련: 600 사이클"
```

---

## 확장성 및 성능

### 1. 수평 확장 (Horizontal Scaling)

**Stateless Components**는 수평 확장 가능:

```
┌─────────────────────────────────────────────┐
│         Load Balancer (Nginx)               │
└──────────────┬──────────────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
    ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐
│ App 1   │ │ App 2   │ │ App 3   │
│ (Node)  │ │ (Node)  │ │ (Node)  │
└─────────┘ └─────────┘ └─────────┘
    │          │          │
    └──────────┼──────────┘
               │
    ┌──────────┴──────────┐
    │                     │
    ▼                     ▼
┌─────────┐         ┌─────────┐
│ Redis   │         │ PostgreSQL
│ (Session)         │ (Data)
└─────────┘         └─────────┘
```

### 2. Background Job Processing

**긴 작업은 Background Queue로 처리**:

```typescript
// BullMQ 사용
const queue = new Queue('workflow-execution', {
  connection: redis,
});

// Producer
await queue.add('execute-comfyui', {
  workflowId: 'product-image-gen',
  input: {...},
});

// Worker (여러 인스턴스로 확장 가능)
const worker = new Worker('workflow-execution', async (job) => {
  const result = await workflowModule.execute(job.data);
  return result;
}, { connection: redis });
```

### 3. Caching Strategy

**다층 캐싱**으로 성능 최적화:

```
┌─────────────────────────────────────────────┐
│ L1: In-Memory Cache (Node process)         │
│  - Agent Skills (rarely change)             │
│  - RABSIC Matrix (rarely change)            │
│  TTL: 1 hour                                │
└─────────────────────────────────────────────┘
               │ (miss)
               ▼
┌─────────────────────────────────────────────┐
│ L2: Redis (shared across instances)        │
│  - Session State                            │
│  - User Permissions                         │
│  TTL: 10 minutes                            │
└─────────────────────────────────────────────┘
               │ (miss)
               ▼
┌─────────────────────────────────────────────┐
│ L3: PostgreSQL (source of truth)           │
│  - All data                                 │
└─────────────────────────────────────────────┘
```

### 4. Database Optimization

**읽기 성능 최적화**:

```sql
-- 세션 조회 (가장 빈번)
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_id ON sessions(session_id);

-- 실행 로그 조회
CREATE INDEX idx_executions_timestamp ON executions(timestamp DESC);
CREATE INDEX idx_executions_user_id ON executions(user_id);

-- 학습 데이터 조회
CREATE INDEX idx_learning_data_type ON learning_data(type);
CREATE INDEX idx_learning_data_timestamp ON learning_data(timestamp DESC);

-- 파티셔닝 (시계열 데이터)
CREATE TABLE executions (
  -- ...
) PARTITION BY RANGE (timestamp);

CREATE TABLE executions_2026_01 PARTITION OF executions
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

---

## 보안 및 권한

### 1. 인증 (Authentication)

**각 인터페이스별 인증 방식**:

```typescript
// Slack: Slack OAuth
const slackAuth = async (event) => {
  const userId = event.user;
  const user = await getUserFromSlack(userId);
  return user;
};

// Web: JWT
const webAuth = async (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  const payload = jwt.verify(token, SECRET);
  return payload.user;
};

// API: API Key
const apiAuth = async (req) => {
  const apiKey = req.headers['x-api-key'];
  const user = await getUserByApiKey(apiKey);
  return user;
};
```

### 2. 권한 (Authorization)

**RABSIC 기반 세밀한 권한 제어**:

```yaml
# registry/org/marketing.yml
domain: marketing
roles:
  - name: Marketing Manager
    rabsic:
      - action: create-campaign
        responsible: true
        accountable: true
      - action: approve-budget
        accountable: true
      - action: execute-ads
        consulted: true
  
  - name: Marketing Specialist
    rabsic:
      - action: create-campaign
        responsible: true
      - action: execute-ads
        responsible: true
      - action: approve-budget
        informed: true
```

### 3. 데이터 암호화

**민감 데이터는 암호화**:

```typescript
// At Rest: PostgreSQL Column Encryption
const encrypted = encrypt(sensitiveData, ENCRYPTION_KEY);
await db.secrets.create({ data: encrypted });

// In Transit: TLS/SSL
const httpsServer = https.createServer({
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem'),
}, app);
```

### 4. Audit Logging

**모든 중요 액션은 감사 로그 기록**:

```typescript
await auditLog.record({
  userId: user.id,
  action: 'APPROVE_REQUEST',
  resource: 'budget-request-123',
  timestamp: new Date(),
  metadata: {
    amount: 100000,
    approved: true,
  },
});
```

---

## 모니터링 및 관찰성

### 1. Structured Logging

**표준 로그 형식**:

```typescript
logger.info({
  eventType: 'AGENT_EXECUTION_COMPLETED',
  agentType: 'brand-agent',
  sessionId: 'ses_abc123',
  duration: 2340, // ms
  success: true,
  metadata: {
    model: 'claude-sonnet-4.5',
    tokensUsed: 1234,
  },
});
```

### 2. Metrics

**핵심 메트릭 수집**:

```typescript
// Prometheus Metrics
const executionDuration = new Histogram({
  name: 'agent_execution_duration_seconds',
  help: 'Agent execution duration',
  labelNames: ['agent_type', 'success'],
});

const activeAgents = new Gauge({
  name: 'active_agents_count',
  help: 'Number of active agents',
});

const learningAccuracy = new Gauge({
  name: 'learning_model_accuracy',
  help: 'Current model accuracy',
});
```

### 3. Tracing

**분산 추적 (OpenTelemetry)**:

```typescript
const tracer = trace.getTracer('kyndof-corp-system');

const span = tracer.startSpan('execute-automation', {
  attributes: {
    'automation.id': automationId,
    'user.id': userId,
  },
});

// ... execution ...

span.end();
```

### 4. Dashboards

**Grafana 대시보드**:

```
┌─────────────────────────────────────────────┐
│ Kyndof Corp System - Operations Dashboard  │
├─────────────────────────────────────────────┤
│                                             │
│ ┌─────────────┐  ┌─────────────┐           │
│ │ Active      │  │ Avg Response│           │
│ │ Sessions    │  │ Time        │           │
│ │ 42          │  │ 1.2s        │           │
│ └─────────────┘  └─────────────┘           │
│                                             │
│ ┌───────────────────────────────────────┐  │
│ │ Agent Execution Success Rate          │  │
│ │ [████████████████████░░] 95%          │  │
│ └───────────────────────────────────────┘  │
│                                             │
│ ┌───────────────────────────────────────┐  │
│ │ Learning Model Accuracy Trend         │  │
│ │     90% ┤              ╱╲              │  │
│ │     85% ┤          ╱╲╱  ╲             │  │
│ │     80% ┤      ╱╲╱        ╲            │  │
│ │         └─────────────────────         │  │
│ └───────────────────────────────────────┘  │
│                                             │
│ ┌───────────────────────────────────────┐  │
│ │ Recent Errors                          │  │
│ │ • ComfyUI timeout (2 occurrences)      │  │
│ │ • Permission denied (1 occurrence)     │  │
│ └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 배포 아키텍처

### Development

```
┌─────────────────────────────────────────────┐
│ Local Development                           │
│                                             │
│ ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│ │ App     │  │ PostgreSQL │ Redis   │     │
│ │ (npm    │  │ (Docker) │  │ (Docker)│     │
│ │ run dev)│  │          │  │         │     │
│ └─────────┘  └─────────┘  └─────────┘     │
└─────────────────────────────────────────────┘
```

### Production

```
┌─────────────────────────────────────────────────────────┐
│ Kubernetes Cluster                                      │
│                                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Ingress (Nginx)                                   │  │
│ │  - TLS Termination                                │  │
│ │  - Rate Limiting                                  │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ App Pods (3 replicas)                             │  │
│ │  - Auto-scaling based on CPU/Memory               │  │
│ │  - Rolling Updates                                │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Background Worker Pods (2 replicas)               │  │
│ │  - Process queues (BullMQ)                        │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ Redis (StatefulSet)                               │  │
│ │  - Persistent Volume                              │  │
│ └───────────────────────────────────────────────────┘  │
│                                                         │
│ ┌───────────────────────────────────────────────────┐  │
│ │ PostgreSQL (Managed Service - AWS RDS)            │  │
│ │  - Multi-AZ                                       │  │
│ │  - Automated Backups                              │  │
│ └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 다음 단계

1. **데이터베이스 스키마 설계** → `DATABASE_SCHEMA.md`
2. **API 명세서 작성** → `API.md`
3. **개발 환경 설정 가이드** → `DEVELOPMENT.md`
4. **배포 가이드** → `DEPLOYMENT.md`

---

**Built with ❤️ by Kyndof Team**
