# Kyndof Extension Development Guide

**버전**: 1.0  
**작성일**: 2026-01-25  
**대상**: Kyndof 특수 기능을 Extension으로 분리하는 방법

---

## 🎯 목적

Nubabel Core Platform은 **모든 회사가 사용할 수 있는 공통 기능**만 포함합니다.  
Kyndof 특수 니즈는 **Extension**으로 분리하여 구현합니다.

---

## 📋 Kyndof 특수 니즈 목록

### 1. 생산 관리 (Production Management)

**비즈니스 요구사항**:
- 봉제 공정 추적 (재단 → 봉제 → 검품 → 포장)
- QR 코드 기반 작업 추적
- 작업자별 생산성 모니터링
- 실시간 진행 상황 대시보드

**Core와의 차이**:
- ❌ Core: 일반적인 워크플로우 (모든 업종)
- ✅ Extension: 봉제/의류 특화 공정 (Kyndof만)

### 2. 품질 검사 AI (Quality Inspection)

**비즈니스 요구사항**:
- 사진 업로드 → AI 결함 감지
- 측정값 자동 추출 (치수, 색상 등)
- Pass/Fail 자동 판정
- 불량 패턴 분석

**Core와의 차이**:
- ❌ Core: 일반적인 파일 업로드/처리
- ✅ Extension: 의류 품질 검사 특화 (Kyndof만)

### 3. 3D 모델링 연동 (3D Integration)

**비즈니스 요구사항**:
- Clo3D 파일 연동
- Blender 렌더링 자동화
- 디지털 → 실물 매핑

**Core와의 차이**:
- ❌ Core: 일반적인 파일 관리
- ✅ Extension: 3D 디자인 도구 특화 (Kyndof만)

### 4. 학습 시스템 (Learning System)

**비즈니스 요구사항**:
- 사람 작업 패턴 학습
- 디지털 vs 실물 차이 분석
- 자동화 제안
- "Human as Training Data"

**Core와의 차이**:
- ❓ **애매함**: 이건 Core 기능이 될 수도 있음
- 현재: Kyndof Extension으로 시작
- 나중에: 일반화 가능하면 Core로 이동

### 5. Value Stream Mapping

**비즈니스 요구사항**:
- 전체 생산 프로세스 시각화
- 병목 구간 감지
- 최적화 제안

**Core와의 차이**:
- ❓ **애매함**: 일반적인 프로세스 분석은 Core 기능
- Kyndof 특화: 봉제 공정 특화 분석

---

## 🏗️ Extension 구조

### 디렉토리 구조

```
extensions/kyndof/
├── package.json
├── tsconfig.json
├── README.md
│
├── src/
│   ├── index.ts                    # Extension 진입점
│   │
│   ├── production/                 # 생산 관리
│   │   ├── production.service.ts
│   │   ├── production.routes.ts
│   │   ├── qr-tracker.ts
│   │   └── productivity.ts
│   │
│   ├── quality/                    # 품질 검사 AI
│   │   ├── quality-ai.service.ts
│   │   ├── vision-inspector.ts
│   │   ├── defect-detector.ts
│   │   └── measurement.ts
│   │
│   ├── 3d-integration/             # 3D 모델링 연동
│   │   ├── clo3d.service.ts
│   │   ├── blender.service.ts
│   │   └── file-converter.ts
│   │
│   ├── learning/                   # 학습 시스템 (장기)
│   │   ├── activity-tracker.ts
│   │   ├── pattern-detector.ts
│   │   ├── feedback-loop.ts
│   │   └── auto-suggestion.ts
│   │
│   └── hooks/                      # Core Hook 구현
│       ├── workflow-hooks.ts
│       └── agent-hooks.ts
│
├── prisma/                         # Kyndof 전용 테이블
│   ├── schema.prisma
│   └── migrations/
│
└── tests/
    └── (테스트 코드)
```

---

## 🗄️ 데이터베이스 스키마

### Kyndof Extension Tables

```prisma
// extensions/kyndof/prisma/schema.prisma

// ============================================
// PRODUCTION MANAGEMENT
// ============================================

model KyndofProductionOrder {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  orderNumber    String   @unique @map("order_number")
  productName    String   @map("product_name")
  quantity       Int
  status         String   // cutting, sewing, inspection, packaging
  startedAt      DateTime @map("started_at")
  completedAt    DateTime? @map("completed_at")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  
  workStations   KyndofWorkStation[]
  
  @@map("kyndof_production_orders")
  @@index([organizationId])
}

model KyndofWorkStation {
  id                String   @id @default(uuid()) @db.Uuid
  productionOrderId String   @map("production_order_id") @db.Uuid
  stationName       String   @map("station_name") // cutting, sewing-1, inspection
  assignedWorker    String?  @map("assigned_worker")
  startedAt         DateTime @map("started_at")
  completedAt       DateTime? @map("completed_at")
  qrCode            String?  @map("qr_code")
  notes             String?  @db.Text
  
  productionOrder   KyndofProductionOrder @relation(fields: [productionOrderId], references: [id], onDelete: Cascade)
  
  @@map("kyndof_work_stations")
  @@index([productionOrderId])
}

// ============================================
// QUALITY INSPECTION
// ============================================

model KyndofQualityInspection {
  id                String   @id @default(uuid()) @db.Uuid
  organizationId    String   @map("organization_id") @db.Uuid
  productionOrderId String   @map("production_order_id") @db.Uuid
  imageUrl          String   @map("image_url")
  aiAnalysis        Json     @map("ai_analysis") // AI 분석 결과
  defectsFound      String[] @map("defects_found") // 발견된 결함 목록
  measurements      Json?    @map("measurements") // 측정값
  passedInspection  Boolean  @map("passed_inspection")
  inspectorNotes    String?  @map("inspector_notes") @db.Text
  inspectedAt       DateTime @default(now()) @map("inspected_at")
  
  @@map("kyndof_quality_inspections")
  @@index([organizationId])
  @@index([productionOrderId])
}

// ============================================
// 3D MODELING
// ============================================

model Kyndof3DAsset {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  assetName      String   @map("asset_name")
  assetType      String   @map("asset_type") // clo3d, blender, fbx, obj
  fileUrl        String   @map("file_url")
  thumbnailUrl   String?  @map("thumbnail_url")
  metadata       Json?    @map("metadata")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  
  @@map("kyndof_3d_assets")
  @@index([organizationId])
}

// ============================================
// LEARNING SYSTEM (Phase 5+)
// ============================================

model KyndofActivityLog {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  userId         String   @map("user_id") @db.Uuid
  activityType   String   @map("activity_type") // click, type, navigate, upload
  context        Json     @map("context") // 스크린샷, 커서 위치 등
  timestamp      DateTime @default(now()) @map("timestamp")
  
  @@map("kyndof_activity_logs")
  @@index([organizationId, userId])
  @@index([timestamp])
}

model KyndofLearnedPattern {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  patternName    String   @map("pattern_name")
  patternType    String   @map("pattern_type") // workflow, shortcut, habit
  description    String   @db.Text
  confidence     Float    @default(0.5) // 0.0 ~ 1.0
  occurenceCount Int      @default(1) @map("occurence_count")
  lastSeenAt     DateTime @map("last_seen_at")
  createdAt      DateTime @default(now()) @map("created_at")
  
  @@map("kyndof_learned_patterns")
  @@index([organizationId])
  @@index([confidence])
}
```

---

## 🔌 Extension Interface 구현

### 1. Extension Entry Point

```typescript
// extensions/kyndof/src/index.ts

import { Extension, HookManager } from '@nubabel/core';
import { ProductionService } from './production/production.service';
import { QualityAIService } from './quality/quality-ai.service';

export class KyndofExtension implements Extension {
  name = 'kyndof';
  version = '1.0.0';
  
  private productionService: ProductionService;
  private qualityService: QualityAIService;
  
  async onLoad() {
    console.log('[Kyndof Extension] Loading...');
    
    this.productionService = new ProductionService();
    this.qualityService = new QualityAIService();
    
    console.log('[Kyndof Extension] Loaded successfully');
  }
  
  async onUnload() {
    console.log('[Kyndof Extension] Unloading...');
    // Cleanup
  }
  
  register(hooks: HookManager) {
    // Workflow 완료 시 생산 추적
    hooks.on('workflow.after_execute', async (workflow, result) => {
      if (workflow.type === 'production_order') {
        await this.productionService.trackProgress(workflow, result);
      }
    });
    
    // Agent 작업 후 품질 검사
    hooks.on('agent.after_task', async (agent, task, result) => {
      if (task.type === 'quality_inspection') {
        await this.qualityService.analyzeImage(result.imageUrl);
      }
    });
    
    // 사용자 활동 학습 (Phase 5)
    hooks.on('user.activity', async (activity) => {
      // TODO: Activity logging for learning
    });
  }
  
  getRoutes() {
    return [
      {
        path: '/kyndof/production',
        handler: this.productionService.routes
      },
      {
        path: '/kyndof/quality',
        handler: this.qualityService.routes
      }
    ];
  }
}

export default KyndofExtension;
```

### 2. Production Service 예시

```typescript
// extensions/kyndof/src/production/production.service.ts

import { Router } from 'express';
import { prisma } from '@nubabel/core/db';

export class ProductionService {
  routes = Router();
  
  constructor() {
    this.setupRoutes();
  }
  
  private setupRoutes() {
    // 생산 주문 목록
    this.routes.get('/', async (req, res) => {
      const { organizationId } = req.ctx;
      
      const orders = await prisma.kyndofProductionOrder.findMany({
        where: { organizationId },
        include: { workStations: true },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(orders);
    });
    
    // 생산 주문 생성
    this.routes.post('/', async (req, res) => {
      const { organizationId } = req.ctx;
      const { orderNumber, productName, quantity } = req.body;
      
      const order = await prisma.kyndofProductionOrder.create({
        data: {
          organizationId,
          orderNumber,
          productName,
          quantity,
          status: 'cutting',
          startedAt: new Date()
        }
      });
      
      res.json(order);
    });
    
    // QR 스캔 → 작업 시작/완료
    this.routes.post('/scan', async (req, res) => {
      const { qrCode, action } = req.body; // action: 'start' | 'complete'
      
      const workStation = await prisma.kyndofWorkStation.findFirst({
        where: { qrCode }
      });
      
      if (action === 'start') {
        await prisma.kyndofWorkStation.update({
          where: { id: workStation.id },
          data: { startedAt: new Date() }
        });
      } else {
        await prisma.kyndofWorkStation.update({
          where: { id: workStation.id },
          data: { completedAt: new Date() }
        });
      }
      
      res.json({ success: true });
    });
  }
  
  async trackProgress(workflow: any, result: any) {
    // Hook에서 호출: 워크플로우 완료 시 자동 추적
    console.log(`[Production] Tracking workflow: ${workflow.id}`);
    // TODO: 진행 상황 업데이트
  }
}
```

### 3. Quality AI Service 예시

```typescript
// extensions/kyndof/src/quality/quality-ai.service.ts

import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';

export class QualityAIService {
  routes = Router();
  private anthropic: Anthropic;
  
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
    this.setupRoutes();
  }
  
  private setupRoutes() {
    // 이미지 분석 요청
    this.routes.post('/inspect', async (req, res) => {
      const { imageUrl } = req.body;
      
      const analysis = await this.analyzeImage(imageUrl);
      
      res.json(analysis);
    });
  }
  
  async analyzeImage(imageUrl: string) {
    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: imageUrl
            }
          },
          {
            type: 'text',
            text: `이 의류 제품을 검사하고 다음 정보를 JSON으로 제공하세요:
            1. defects: 발견된 결함 목록 (배열)
            2. measurements: 측정값 (치수, 색상 등)
            3. passed: 검사 통과 여부 (boolean)
            4. notes: 추가 메모`
          }
        ]
      }]
    });
    
    const result = JSON.parse(message.content[0].text);
    
    // DB에 저장
    await prisma.kyndofQualityInspection.create({
      data: {
        organizationId: req.ctx.organizationId,
        productionOrderId: req.body.productionOrderId,
        imageUrl,
        aiAnalysis: result,
        defectsFound: result.defects,
        measurements: result.measurements,
        passedInspection: result.passed
      }
    });
    
    return result;
  }
}
```

---

## 🚀 개발 워크플로우

### 1. Extension 활성화

```typescript
// apps/api/src/config/extensions.ts

import { KyndofExtension } from '@nubabel/extensions-kyndof';

export const loadExtensions = async (organizationId: string) => {
  const extensions = [];
  
  // Kyndof 조직만 Extension 로드
  if (organizationId === 'kyndof-org-id') {
    extensions.push(new KyndofExtension());
  }
  
  return extensions;
};
```

### 2. Extension 로드

```typescript
// apps/api/src/index.ts

import { loadExtensions } from './config/extensions';

app.use(async (req, res, next) => {
  const { organizationId } = req.ctx;
  
  // 조직별 Extension 로드
  const extensions = await loadExtensions(organizationId);
  
  // Extension 라우트 등록
  extensions.forEach(ext => {
    const routes = ext.getRoutes();
    routes.forEach(route => {
      app.use(route.path, route.handler);
    });
  });
  
  next();
});
```

---

## 📊 구현 우선순위

### Phase 2 (Q1 2026) - Web Dashboard 완성 후
```
1. 생산 관리 기본 (UI + API)
   - 주문 목록 보기
   - 수동 상태 업데이트
   
2. QR 스캔 연동
   - 간단한 QR 생성/스캔
   - 작업 시작/완료 기록
```

### Phase 3 (Q2 2026) - AI Agent 구현 후
```
3. 품질 검사 AI
   - 이미지 업로드
   - Claude Vision 분석
   - Pass/Fail 판정

4. 자동화 워크플로우
   - 주문 생성 → QR 생성 자동화
   - 검사 실패 → 재작업 지시 자동화
```

### Phase 4-5 (Q3 2026+) - 장기
```
5. 3D 연동
   - Clo3D 파일 자동 가져오기
   - Blender 렌더링 자동화

6. 학습 시스템
   - 활동 로깅
   - 패턴 감지
   - 자동화 제안
```

---

## ✅ 체크리스트

### Extension 개발 시 확인사항

- [ ] Core 기능과 명확히 분리되는가?
- [ ] 다른 회사가 이 기능을 쓸 일이 있는가?
  - Yes → Core로 이동 고려
  - No → Extension으로 유지
- [ ] DB 테이블에 `kyndof_` prefix 사용했는가?
- [ ] Hook 시스템 사용했는가? (하드코딩 안함)
- [ ] organizationId 필터링 적용했는가?
- [ ] Extension은 Core에 의존하지만, Core는 Extension을 몰라야 함

---

## 🎯 결론

**Kyndof Extension은**:
- ✅ 봉제/의류 특화 기능만 포함
- ✅ Core Platform과 독립적으로 개발
- ✅ Hook 시스템으로 Core와 통신
- ✅ 나중에 다른 회사 Extension 참고용

**개발 순서**:
```
1. Core Platform 완성 (Phase 1-2)
2. Kyndof Extension 시작 (Phase 2-3)
3. 일반화 가능한 기능은 Core로 이동 (Phase 4)
```

---

**이 가이드는 Kyndof Extension 개발의 청사진입니다.**
