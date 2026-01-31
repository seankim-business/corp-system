# OMC (oh-my-claudecode) 통합 가이드

## 목차

1. [개요](#개요)
2. [아키텍처](#아키텍처)
3. [설정 파일](#설정-파일)
4. [워크플로우 템플릿](#워크플로우-템플릿)
5. [Bridge 모듈 사용](#bridge-모듈-사용)
6. [빠른 시작](#빠른-시작)
7. [트러블슈팅](#트러블슈팅)

---

## 개요

### OMC (oh-my-claudecode) 란?

OMC는 Anthropic에서 개발한 **다중 에이전트 오케스트레이션 프레임워크**로, AI 에이전트들의 조율과 협업을 자동화합니다. Nubabel은 이를 조직적 작업 흐름(캠페인 런칭, 예산 검토, 분기 보고 등)과 연계하여 사용하고 있습니다.

### 도입 이유

**조직적 협업 + AI 오케스트레이션의 결합**

- **복잡한 업무 흐름 자동화**: 다단계 승인, 병렬 처리, 조건부 실행
- **계층화된 의사결정**: LOW(Haiku) → MEDIUM(Sonnet) → HIGH(Opus) 모델 자동 라우팅
- **확장 가능한 아키텍처**: 새로운 워크플로우와 에이전트 정의가 간단함
- **감사 추적 & 거버넌스**: 모든 결정과 승인 내역 기록

### 핵심 이점

| 영역 | 효과 |
|------|------|
| **효율성** | 반복적인 프로세스 자동화로 작업 시간 50% 단축 |
| **정확성** | 일관된 규칙 기반 의사결정으로 오류 최소화 |
| **확장성** | 새로운 부서/프로세스 추가 시 기존 코드 변경 불필요 |
| **추적성** | 모든 결정, 승인, 에이전트 동작 기록 |
| **유연성** | Slack 통합, 다국어 지원, 조건부 실행 |

---

## 아키텍처

### 1. 에이전트 계층 (32개 OMC 에이전트 → 8개 Nubabel 에이전트)

OMC의 32개 특화 에이전트를 Nubabel의 8개 코어 에이전트로 매핑합니다:

#### 분석 영역 (Analysis)
```
OMC: architect, architect-low, architect-medium
  ↓
Nubabel: orchestrator (전략, 아키텍처, 설계 검토)
```

#### 실행 영역 (Execution)
```
OMC: executor, executor-low, executor-high
  ↓
Nubabel: task (기능 구현, 빌드, 배포)
```

#### 검색/탐색 영역 (Search)
```
OMC: explore, explore-medium, explore-high
  ↓
Nubabel: search (코드 검색, 패턴 찾기)
```

#### 연구 영역 (Research)
```
OMC: researcher, researcher-low, researcher-high
  ↓
Nubabel: data (리서치, 데이터 분석)
```

#### 디자인 영역 (Design)
```
OMC: designer, designer-low, designer-high, writer
  ↓
Nubabel: report (UI/UX, 문서화)
```

#### QA 영역 (Quality Assurance)
```
OMC: qa-tester, qa-tester-high
  ↓
Nubabel: approval (검증, 승인)
```

#### 데이터과학 영역 (Data Science)
```
OMC: scientist, scientist-low, scientist-high
  ↓
Nubabel: data, analytics (통계, 분석, 시각화)
```

#### 추가 영역
```
OMC: security-reviewer, build-fixer, tdd-guide, code-reviewer, planner, critic, analyst, vision
  ↓
Nubabel: orchestrator, task, analytics (각 특성에 따라 매핑)
```

### 2. 3-계층 모델 라우팅

작업 복잡도에 따라 자동으로 Claude 모델이 결정됩니다:

#### LOW 계층 (Haiku)
- **용도**: 간단한 검색, 빠른 확인, 기본 조작
- **특성**: 저비용, 빠른 응답
- **예**: 문서화, 간단한 검색, 기본 QA
- **예산 권한**: < 1,000,000 KRW

#### MEDIUM 계층 (Sonnet)
- **용도**: 기능 구현, 테스트, 일반적인 분석
- **특성**: 균형잡힌 성능과 비용
- **예**: UI/UX 작업, 데이터 분석, 테스트 자동화
- **예산 권한**: 1,000,000 ~ 10,000,000 KRW

#### HIGH 계층 (Opus)
- **용도**: 복잡한 아키텍처, 전략 결정, 깊이있는 디버깅
- **특성**: 최고 성능, 고비용
- **예**: 아키텍처 설계, 캠페인 전략, 중요 의사결정
- **예산 권한**: > 10,000,000 KRW

```yaml
# delegation-rules.yaml의 예시
- pattern: "(전략|아키텍처|설계|리팩토링|복잡한|분석)"
  omc_agent: architect
  nubabel_agent: orchestrator
  tier: HIGH                    # Opus 모델 사용
  category: ultrabrain

- pattern: "(구현|개발|작성|만들어|빌드)"
  omc_agent: executor
  nubabel_agent: task
  tier: MEDIUM                  # Sonnet 모델 사용
  category: quick

- pattern: "(찾아|검색|어디|위치)"
  omc_agent: explore
  nubabel_agent: search
  tier: LOW                     # Haiku 모델 사용
  category: quick
```

### 3. 위임 카테고리 (Delegation Categories)

각 작업에 온도(temperature), 사고 예산, 프롬프트 스타일이 최적화됩니다:

| 카테고리 | 계층 | 온도 | 사고 예산 | 사용 사례 |
|---------|------|------|---------|---------|
| **ultrabrain** | HIGH | 0.3 | max | 복잡한 논리, 아키텍처, 깊이있는 디버깅 |
| **visual-engineering** | HIGH | 0.7 | high | UI/UX, 프론트엔드, 디자인 시스템 |
| **artistry** | MEDIUM | 0.9 | medium | 창의적 솔루션, 브레인스토밍 |
| **quick** | LOW | 0.1 | low | 간단한 조회, 기본 작업 |
| **writing** | MEDIUM | 0.5 | medium | 문서화, 기술 글쓰기 |

---

## 설정 파일

모든 설정 파일은 `.omc/config/` 디렉토리에 위치합니다.

### 1. delegation-rules.yaml

**목적**: 사용자 요청 → OMC 에이전트 + Nubabel 에이전트 + 계층 자동 라우팅

**구조**:
```yaml
version: "1.0"
description: "Task delegation rules based on OMC agent orchestration patterns"

categories:
  ultrabrain:
    tier: HIGH
    temperature: 0.3
    thinking_budget: max
    description: "Complex reasoning, architecture, deep debugging"

  # ... 다른 카테고리들

rules:
  - pattern: "(정규식 패턴)"
    omc_agent: "OMC 에이전트명"
    nubabel_agent: "Nubabel 에이전트명"
    tier: HIGH|MEDIUM|LOW
    category: "카테고리명"
```

**예시 - 캠페인 런칭 요청**:
```yaml
- pattern: "(캠페인|campaign).*(런칭|launch|시작)"
  omc_agent: planner
  nubabel_agent: orchestrator
  tier: HIGH
  category: artistry
```

**작동 방식**:
1. 사용자 요청: "캠페인 런칭을 시작해줘"
2. 패턴 매칭: 규칙 찾음
3. 라우팅: `orchestrator` 에이전트에 위임, `HIGH` 계층(Opus) 할당
4. 실행: Opus 모델로 캠페인 런칭 워크플로우 실행

### 2. approval-matrix.yaml

**목적**: 예산 금액, 콘텐츠 유형, 프로세스 변경에 따른 승인 권한 및 타임아웃 설정

**구조**:
```yaml
version: "1.0"

# 계층별 권한
tier_authority:
  HIGH:
    model: opus
    budget_authority: "> 10,000,000 KRW"
    approval_rights: final          # 최종 승인 권한
    escalation_target: "C-Level / Board"

  MEDIUM:
    model: sonnet
    budget_authority: "1,000,000 - 10,000,000 KRW"
    approval_rights: conditional    # 조건부 승인
    escalation_target: HIGH

  LOW:
    model: haiku
    budget_authority: "< 1,000,000 KRW"
    approval_rights: none           # 승인 권한 없음
    escalation_target: MEDIUM

# 승인 임계값
thresholds:
  expense:
    - type: self_approve
      max_amount: 1000000
      approver: self
      timeout_hours: 0              # 자동 승인

    - type: team_lead
      min_amount: 1000000
      max_amount: 5000000
      approver: team_lead
      timeout_hours: 24             # 24시간 내 승인 필요
      escalation: director          # 타임아웃 시 director로 상향
```

**승인 흐름 예시 - 예산 2,500만 원**:
```
1. 자동 생성: expense_request (2,500만 원)
2. 라우팅: "min: 10,000,000 초과" → C-Level 승인 필요
3. Slack 알림: "@c_level 예산 승인 요청"
4. 대기: 최대 72시간
5. 타임아웃: Board 상향 escalation
```

### 3. mcp-servers.yaml

**목적**: AI 에이전트가 사용할 수 있는 MCP 서버 설정

**구조**:
```yaml
version: "1.0"

servers:
  filesystem:
    enabled: true
    priority: 1
    package: "@anthropic/mcp-filesystem"
    config:
      allowed_paths:
        - "/Users/sean/Documents/Kyndof/tools/nubabel"
        - "/Users/sean/.claude"
      operations:
        - read
        - write
        - list
        - search
    use_cases:
      - file_operations
      - code_reading
      - config_management

  github:
    enabled: true
    priority: 1
    package: "@anthropic/mcp-github"
    config:
      owner: "kyndof"
      repo: "nubabel"
      permissions:
        - create_branch
        - create_pr
        - list_commits
        - search_code
    use_cases:
      - version_control
      - pr_management

  # ... 다른 서버들
```

**서버 선택 규칙**:
```yaml
selection_rules:
  browser_testing:
    priority_order:
      - chrome-devtools-mcp
      - claude-in-chrome
      - playwright-mcp
    fallback_behavior: "try_next"
```

**사용 예시**:
- **파일 작업** → `filesystem` MCP
- **GitHub 통합** → `github` MCP
- **브라우저 테스트** → `chrome-devtools-mcp` (우선), 실패 시 `claude-in-chrome`

### 4. agents/*.yml (에이전트 정의)

**목적**: 각 에이전트의 역할, 책임, 권한, 제약사항 정의

**파일 목록**:
- `orchestrator.yml` - 전략 조율자 (HIGH 계층, 읽기 전용)
- `product.yml` - 제품 관리자 (HIGH 계층, 플래너 매핑)
- `brand.yml` - 브랜드 가이드라인 (MEDIUM, 검토자)
- `finance.yml` - 재무 분석가 (MEDIUM, 데이터 중심)
- `hr.yml` - 인사담당자 (MEDIUM, 정책 집행)
- `ops.yml` - 운영 담당자 (MEDIUM, 실행)
- `_schema.yml` - 에이전트 정의 스키마

**구조 예시** (orchestrator.yml):
```yaml
name: orchestrator
description: "Strategic coordinator handling complex decisions and architecture"
tier: HIGH
category: ultrabrain

omc_mapping:
  primary: architect
  secondary:
    - architect-medium
    - planner

nubabel_mapping: orchestrator

responsibilities:
  - Strategic decision making
  - Architecture design and review
  - Cross-team coordination

constraints:
  read_only: true           # 코드 직접 수정 불가
  allowed_tools:
    - Read
    - Glob
    - Grep
    - WebSearch
  disallowed_tools:
    - Write
    - Edit
    - Bash
  max_file_changes: 0       # 파일 변경 제한 없음

escalation:
  escalate_to: c_level
  escalation_triggers:
    - "budget > 50000000"
    - "cross_department_impact"
    - "security_critical"

approval_authority:
  can_approve:
    - "technical_decisions"
    - "architecture_changes"
  requires_approval_from:
    - c_level
```

**핵심 필드**:
| 필드 | 목적 |
|------|------|
| `tier` | 사용할 Claude 모델 결정 |
| `omc_mapping` | OMC 에이전트 매핑 |
| `responsibilities` | 에이전트 역할 |
| `constraints` | 실행 제약사항 (읽기 전용 등) |
| `escalation` | 상향 조건 |
| `approval_authority` | 승인 권한 |
| `keywords` | 활성화 키워드 (한글) |

---

## 워크플로우 템플릿

워크플로우는 복잡한 다단계 프로세스를 자동화합니다. 모든 워크플로우는 `.omc/workflows/` 디렉토리에 위치합니다.

### 1. campaign-launch.yml (캠페인 런칭)

**목적**: 마케팅 캠페인 기획부터 실행까지 자동화

**트리거**:
```yaml
triggers:
  keywords:
    - 캠페인
    - 캠페인 런칭
    - campaign launch
  patterns:
    - "(캠페인|campaign).*(런칭|launch)"
```

**실행 단계**:
```
1. Planning (HIGH)
   ↓
2. Content Creation (병렬, MEDIUM)
   - Visual Assets (Designer)
   - Copy Assets (Writer)
   - Competitive Analysis (Researcher)
   ↓
3. Review (HIGH)
   ↓
4. Human Approval (48시간 대기)
   ↓
5. Execution (MEDIUM)
   ↓
6. Monitoring Setup (MEDIUM)
```

**Slack 알림**:
```
시작: ":rocket: 캠페인 런칭 워크플로우 시작: {campaign_name}"
완료: ":white_check_mark: 캠페인 런칭 완료: {campaign_name}"
실패: ":x: 캠페인 런칭 실패: {campaign_name} - {error}"
```

**사용 예**:
```
사용자: "새로운 봄 시즌 캠페인 런칭해줘. 타겟은 25-35세 여성이야."

자동 처리:
1. Planner가 캠페인 브리프 생성
2. Designer, Writer, Researcher가 병렬로 콘텐츠 제작
3. Critic이 전체 검토
4. Marketing Director에게 승인 요청
5. 승인 후 Executor가 채널별 배포 준비
6. Scientist가 KPI 모니터링 대시보드 설정
→ 자동 완료!
```

### 2. budget-review.yml (예산 검토)

**목적**: 예산 요청 분석, 컴플라이언스 확인, 금액별 자동 승인

**조건부 승인** (금액 기반):
```yaml
- condition: "amount < 1000000"
  approvers: [team_lead]
  timeout: 24h

- condition: "amount >= 1000000 AND amount < 5000000"
  approvers: [team_lead, director]
  timeout: 48h

- condition: "amount >= 5000000 AND amount < 10000000"
  approvers: [director, finance_director]
  timeout: 72h

- condition: "amount >= 10000000"
  approvers: [finance_director, c_level]
  timeout: 96h
```

**실행 단계**:
```
1. Analysis (MEDIUM) - 과거 지출 패턴, ROI 예측
2. Compliance Check (LOW) - 정책, 한도 확인
3. Impact Assessment (HIGH) - 현금흐름, 예산 영향
4. Summary (LOW) - 권고 사항 문서화
5. Conditional Approval - 금액별 자동 라우팅
6. Execution (LOW) - 예산 시스템 업데이트
```

**감사 추적**:
```yaml
audit:
  enabled: true
  log_location: ".omc/logs/budget-reviews/"
  retention_days: 365
  fields:
    - timestamp
    - requestor
    - amount
    - category
    - approvers
    - decision
    - duration
```

**사용 예**:
```
사용자: "R&D 부서 장비 구매 예산 3,500만 원 승인해줘"

자동 처리:
1. Scientist가 과거 장비 구매 비용 분석
2. Security Reviewer가 정책 확인
3. Analyst가 현금흐름 영향 평가
4. Writer가 검토 요약 생성
5. 3,500만 원 → Director + Finance Director 승인 필요
6. Slack으로 두 명께 48시간 내 승인 요청
7. 승인 후 자동으로 예산 시스템 업데이트
→ 감사 로그 자동 생성
```

### 3. quarterly-report.yml (분기 보고서)

**목적**: 재무, 운영, 시장 데이터 자동 수집 및 분기 보고서 생성

**정기 실행** (Cron 스케줄):
```yaml
schedule:
  cron: "0 9 1 1,4,7,10 *"  # 매 분기 1일 9시
  quarterly:
    Q1: "April 1"
    Q2: "July 1"
    Q3: "October 1"
    Q4: "January 1"
```

**병렬 데이터 수집**:
```
Phase 1 - Data Collection (병렬)
├─ Scientist (MEDIUM): 재무 데이터
├─ Scientist-Low (LOW): 운영 데이터
└─ Researcher (MEDIUM): 시장 데이터
  ↓
Phase 2 - Deep Analysis (HIGH): 종합 분석, 트렌드, 예측
  ↓
Phase 3 - Visualization (MEDIUM): 차트, 인포그래픽
  ↓
Phase 4 - Writing (LOW): 보고서 작성
  ↓
Phase 5 - Review (HIGH): 데이터 정확성, 논리성 검증
  ↓
Phase 6 - Sequential Approval: 부서장 → 재무이사 → 임원
  ↓
Phase 7 - Distribution: 이메일, Slack, 포털 업로드
```

**출력 형식**:
```yaml
outputs:
  formats:
    - type: pdf
      name: "Q{quarter}_{year}_Quarterly_Report.pdf"
    - type: pptx
      name: "Q{quarter}_{year}_Executive_Presentation.pptx"
    - type: xlsx
      name: "Q{quarter}_{year}_Data_Appendix.xlsx"
  destinations:
    - slack: "#reports"
    - email: "executives@company.com"
    - storage: "/reports/quarterly/{year}/"
```

**품질 게이트**:
```yaml
quality_gates:
  - gate: data_quality
    check: "Missing data < 5%"
  - gate: chart_accuracy
    check: "All charts match source data"
  - gate: executive_summary
    check: "Summary < 2 pages"
```

**사용 예**:
```
자동 트리거: 매년 4월 1일 9시

자동 처리:
1. 세 명의 Scientist가 재무/운영/시장 데이터 병렬 수집
2. Scientist-High가 전분기 대비, 전년 동기 분석 및 예측
3. Designer가 주요 지표를 시각화
4. Writer가 경영진 요약(Executive Summary) 작성
5. Critic이 데이터 정확성 및 명확성 검증
6. Department Heads → Finance Director → C-Level 순차 승인
7. 자동으로 PDF, PowerPoint, Excel 생성
8. Slack, 이메일, 사내 포털에 배포
→ 완전 자동화!
```

---

## Bridge 모듈 사용

OMC 설정을 Nubabel 애플리케이션에 통합하는 핵심 모듈입니다.

### 위치
```
src/orchestrator/omc-bridge.ts
```

### 핵심 함수

#### 1. loadOMCConfig()

OMC 설정 파일을 로드합니다 (Graceful Degradation 지원).

```typescript
import { loadOMCConfig } from './src/orchestrator/omc-bridge';

// 사용 예
const config = loadOMCConfig();

if (!config) {
  console.log('OMC not configured - using fallback');
  // OMC 없이도 작동
} else {
  console.log('Loaded delegation rules:', config.delegationRules.length);
}
```

**반환 값**:
```typescript
interface OMCConfig {
  delegationRules: OMCDelegationRule[];   // 위임 규칙
  approvalMatrix: ApprovalThreshold[];    // 승인 행렬
  agentMapping: Record<string, AgentType>; // 에이전트 매핑
}
```

#### 2. shouldDelegateToOMC(userRequest)

사용자 요청이 OMC를 통해 처리되어야 하는지 판단합니다.

```typescript
import { shouldDelegateToOMC } from './src/orchestrator/omc-bridge';

// 예: 사용자 요청 분석
const result = shouldDelegateToOMC('새로운 봄 시즌 캠페인 런칭해줘');

if (result.useOMC) {
  console.log('Routing to OMC');
  console.log('Agent:', result.omcAgent);      // 'planner'
  console.log('Tier:', result.tier);            // 'HIGH'
  console.log('Category:', result.category);    // 'artistry'
} else {
  console.log('No OMC rule matched:', result.reason);
}
```

**반환 값**:
```typescript
interface OMCRoutingResult {
  useOMC: boolean;
  omcAgent?: string;          // 'architect', 'executor', etc.
  nubabelAgent?: AgentType;   // 'orchestrator', 'task', etc.
  tier?: OMCTier;             // 'HIGH', 'MEDIUM', 'LOW'
  category?: Category;        // 'ultrabrain', 'visual-engineering', etc.
  reason: string;             // 라우팅 사유
}
```

**매칭 우선순위**:
1. 정규식 패턴 순서대로 검사
2. 첫 번째 일치하는 규칙 적용
3. 일치하는 규칙 없으면: `useOMC: false`

#### 3. getOMCAgentForNubabel(omcAgent)

OMC 에이전트에 대응하는 Nubabel 에이전트를 찾습니다.

```typescript
import { getOMCAgentForNubabel } from './src/orchestrator/omc-bridge';

// 예: OMC 에이전트명에서 Nubabel 에이전트 찾기
const nubabelAgent = getOMCAgentForNubabel('architect');
console.log(nubabelAgent); // 'orchestrator'

const taskAgent = getOMCAgentForNubabel('executor');
console.log(taskAgent); // 'task'
```

#### 4. getApprovalThreshold(requestType, amount)

승인 임계값을 조회합니다.

```typescript
import { getApprovalThreshold } from './src/orchestrator/omc-bridge';

// 예: 3,500만 원 예산 승인자 확인
const threshold = getApprovalThreshold('expense', 35000000);

console.log(threshold?.approver);       // 'director' 또는 'finance_director'
console.log(threshold?.timeoutHours);  // 48
console.log(threshold?.escalation);    // 'c_level'
```

#### 5. getAvailableOMCAgents()

사용 가능한 모든 OMC 에이전트 목록을 반환합니다.

```typescript
import { getAvailableOMCAgents } from './src/orchestrator/omc-bridge';

const agents = getAvailableOMCAgents();
console.log(agents);
// ['architect', 'executor', 'designer', 'scientist', ...]
```

### 실제 통합 예시

**Slack 봇에서 OMC 라우팅**:
```typescript
import { shouldDelegateToOMC, loadOMCConfig } from './src/orchestrator/omc-bridge';

async function handleSlackMessage(message: string) {
  const routing = shouldDelegateToOMC(message);

  if (routing.useOMC) {
    // OMC 워크플로우 실행
    const workflow = await loadWorkflow(routing.omcAgent);
    return await executeWorkflow(workflow, message);
  } else {
    // 기존 로직으로 처리
    return await handleDefault(message);
  }
}
```

**API 요청에서 승인 필요성 판단**:
```typescript
import { getApprovalThreshold } from './src/orchestrator/omc-bridge';

async function createExpenseRequest(amount: number, category: string) {
  const threshold = getApprovalThreshold('expense', amount);

  if (threshold) {
    // 승인 필요
    return {
      status: 'pending_approval',
      approver: threshold.approver,
      deadline: new Date(Date.now() + threshold.timeoutHours * 60 * 60 * 1000)
    };
  } else {
    // 자동 승인
    return { status: 'auto_approved' };
  }
}
```

### 우아한 성능 저하 (Graceful Degradation)

OMC가 설정되지 않아도 애플리케이션이 작동합니다:

```typescript
// OMC 설정 로드
const config = loadOMCConfig();

if (!config) {
  // 대안 1: 기본값 사용
  useDefaultRules();

  // 대안 2: 간단한 라우팅만 수행
  routeBasedOnKeywords();

  // 대안 3: 모든 요청을 기본 에이전트에 위임
  delegateToDefaultAgent('task');
}
```

---

## 빠른 시작

### 1. 새로운 위임 규칙 추가하기

**파일**: `.omc/config/delegation-rules.yaml`

```yaml
# 기존 규칙들...

# 새로운 규칙 추가
- pattern: "(급여|payroll|인건비)"
  omc_agent: scientist
  nubabel_agent: data
  tier: MEDIUM
  category: quick
```

**검증**:
```bash
# YAML 문법 확인
npx yaml-validate .omc/config/delegation-rules.yaml
```

### 2. 새로운 워크플로우 생성하기

**파일**: `.omc/workflows/recruitment.yml`

```yaml
name: recruitment
description: "채용 프로세스 자동화"
version: "1.0"

metadata:
  category: hr
  estimated_duration: "2-4 weeks"
  requires_approval: true
  slack_channel: "#hr"

triggers:
  keywords:
    - 채용
    - 모집
    - recruitment
    - hiring
  patterns:
    - "(채용|recruitment|hiring|모집)"

agents:
  # Phase 1: Job Description (HIGH)
  - stage: job_description
    agent: writer
    tier: MEDIUM
    task: "채용공고 작성"
    timeout: 30m
    outputs:
      - job_description

  # Phase 2: Candidate Search (MEDIUM)
  - stage: candidate_search
    agent: researcher
    tier: MEDIUM
    task: "후보자 검색 및 분석"
    timeout: 60m
    inputs:
      - job_description
    outputs:
      - candidates

  # Phase 3: Evaluation (HIGH)
  - stage: evaluation
    agent: architect
    tier: HIGH
    task: "후보자 평가"
    timeout: 45m
    inputs:
      - candidates
    outputs:
      - evaluation_report

  # Phase 4: Approval
  - stage: approval
    type: human_approval
    approvers:
      - hr_director
      - department_head
    timeout: 48h

success_criteria:
  - candidates_evaluated: true
  - approval_obtained: true

notifications:
  on_start:
    slack: "#hr"
    message: ":briefcase: 채용 프로세스 시작: {position_title}"
  on_complete:
    slack: "#hr"
    message: ":tada: 채용 프로세스 완료: {position_title}"
```

### 3. 새로운 에이전트 정의 추가하기

**파일**: `.omc/agents/legal.yml`

```yaml
name: legal
description: "법률 검토 및 컴플라이언스 담당자"
tier: HIGH
category: ultrabrain

omc_mapping:
  primary: critic
  secondary:
    - security-reviewer

nubabel_mapping: orchestrator

responsibilities:
  - Contract review
  - Compliance verification
  - Risk assessment
  - Legal documentation

constraints:
  read_only: true
  allowed_tools:
    - Read
    - Grep
    - WebSearch
  disallowed_tools:
    - Write
    - Edit
    - Bash
  max_file_changes: 0

escalation:
  escalate_to: c_level
  escalation_triggers:
    - "legal_risk_high"
    - "regulatory_issue"

approval_authority:
  can_approve:
    - "contract_review"
    - "compliance_check"
  requires_approval_from:
    - c_level

keywords:
  - 법률
  - 계약
  - 컴플라이언스
  - 규정
  - 리스크

notes: |
  Legal agent provides expert review and risk assessment.
  READ-ONLY - analyzes but does not modify.
  Escalates to C-Level for regulatory issues.
```

### 4. 설정 검증하기

```bash
# YAML 파일 문법 검증
npx yaml-validate .omc/config/delegation-rules.yaml
npx yaml-validate .omc/config/approval-matrix.yaml
npx yaml-validate .omc/agents/*.yml
npx yaml-validate .omc/workflows/*.yml

# TypeScript 통합 테스트
npm test -- omc-bridge.test.ts
```

### 5. 워크플로우 수동 테스트하기

```bash
# 특정 요청이 어떤 규칙과 매칭되는지 확인
npm run omc:debug "새로운 캠페인 런칭 준비"

# 사용 가능한 에이전트 목록
npm run omc:list-agents

# 설정 상태 확인
npm run omc:status
```

---

## 트러블슈팅

### 문제 1: 설정 파일이 로드되지 않음

**증상**: `OMC not configured - using fallback`

**원인 확인**:
```bash
# .omc/config 디렉토리 존재 확인
ls -la .omc/config/

# 필수 파일 확인
ls -la .omc/config/delegation-rules.yaml
ls -la .omc/config/approval-matrix.yaml
```

**해결 방법**:
```bash
# 올바른 위치에 설정 파일 생성
mkdir -p .omc/config
cp .omc/config.example/* .omc/config/

# YAML 문법 확인
npx yaml-validate .omc/config/delegation-rules.yaml
```

### 문제 2: 패턴이 사용자 요청과 매칭되지 않음

**증상**: 예상과 다른 에이전트가 할당됨

**디버깅**:
```bash
# 특정 요청의 라우팅 결과 확인
npm run omc:debug "사용자 요청 텍스트"

# 예시 출력:
# Pattern matching for: "사용자 요청 텍스트"
# Checking rule 1: (전략|아키텍처|설계|리팩토링) → NO MATCH
# Checking rule 2: (구현|개발|작성) → NO MATCH
# ...
# No matching rule - using default
```

**해결 방법**:
```yaml
# delegation-rules.yaml에 새 규칙 추가
- pattern: "(사용자 요청|새 패턴)"
  omc_agent: architect
  nubabel_agent: orchestrator
  tier: HIGH
  category: ultrabrain
```

### 문제 3: 승인 임계값이 적용되지 않음

**증상**: 예상과 다른 승인자에게 요청이 감

**원인 확인**:
```bash
# 승인 행렬 상태 확인
cat .omc/config/approval-matrix.yaml | grep -A 10 "thresholds:"

# 특정 금액의 승인자 확인
npm run omc:approval-check 35000000
```

**일반적인 원인**:
```yaml
# 잘못된 범위 설정
- min_amount: 1000000
  max_amount: 5000000
  # 중복 또는 간격 확인!

# 올바른 범위
- max_amount: 1000000              # 0 - 1,000,000
- min_amount: 1000000
  max_amount: 5000000              # 1,000,000 - 5,000,000
- min_amount: 5000000
  max_amount: 10000000             # 5,000,000 - 10,000,000
- min_amount: 10000000             # 10,000,000 이상
```

### 문제 4: 워크플로우가 타임아웃됨

**증상**: `Workflow exceeded maximum duration`

**원인 분석**:
```bash
# 워크플로우 실행 로그 확인
tail -f .omc/logs/workflows/*.log

# 각 단계 소요 시간 확인
npm run omc:workflow-duration campaign-launch
```

**해결 방법**:
```yaml
# workflows/campaign-launch.yml에서 타임아웃 조정
- stage: content_creation
  parallel: true
  timeout: 90m  # 60m → 90m으로 증가
  agents:
    - agent: designer
      tier: MEDIUM
      task: "비주얼 에셋 제작"
      timeout: 90m  # 함께 증가
```

### 문제 5: Slack 알림이 전송되지 않음

**증상**: 워크플로우는 진행되지만 Slack 메시지 없음

**원인 확인**:
```bash
# Slack 통합 상태 확인
npm run slack:status

# Slack 토큰 확인
echo $SLACK_BOT_TOKEN

# 채널 권한 확인
npm run slack:check-channel "#approvals"
```

**해결 방법**:
```bash
# 1. Slack 봇 토큰 설정
export SLACK_BOT_TOKEN="xoxb-your-token"

# 2. 봇이 채널에 초대되었는지 확인
# Slack 앱 → 채널 설정 → 앱 추가

# 3. 권한 확인
npm run slack:test-message "#approvals" "Test message"
```

### 문제 6: 에이전트 제약사항 오류

**증상**: `Agent lacks permission to perform this action`

**원인**:
```yaml
# orchestrator.yml - 읽기 전용 에이전트
constraints:
  read_only: true
  disallowed_tools:
    - Write
    - Edit
    - Bash
  max_file_changes: 0  # 파일 수정 금지
```

**해결 방법**:
```typescript
// 대신 다른 에이전트에 위임
if (requiresFileChange) {
  // orchestrator는 분석만
  const analysis = await orchestrator.analyze(code);

  // executor가 실제 수정
  return await executor.implement(analysis);
}
```

### 문제 7: 의존성 로드 실패

**증상**: `Cannot find module '@anthropic/mcp-...'`

**해결 방법**:
```bash
# MCP 패키지 설치
npm install @anthropic/mcp-filesystem @anthropic/mcp-github

# 또는 mcp-servers.yaml 에서 비활성화
# servers:
#   filesystem:
#     enabled: false  # 사용 불가 서버는 비활성화
```

### 문제 8: 원형 의존성 (Circular Dependency)

**증상**: `Circular dependency detected: A → B → A`

**원인**:
```yaml
# workflows/example.yml에서
- stage: review
  agent: critic
  # 다시 architect로 라우팅되는 입력
```

**해결 방법**:
```yaml
# 명확한 계층 구분
- stage: planning
  agent: planner        # HIGH tier
  outputs:
    - plan

- stage: implementation
  agent: executor       # MEDIUM tier
  inputs:
    - plan             # planner의 출력만 사용
  outputs:
    - code

- stage: review
  agent: critic        # HIGH tier
  inputs:
    - code             # executor의 출력만 사용
  # planner로 다시 돌아가지 않음
```

### 디버깅 팁

**1. 상세 로그 활성화**:
```bash
export DEBUG=omc:*
npm test
```

**2. YAML 파일 유효성 검사**:
```bash
npx yaml-validate .omc/config/*.yaml
npx yaml-validate .omc/agents/*.yml
npx yaml-validate .omc/workflows/*.yml
```

**3. 라우팅 경로 추적**:
```typescript
import { shouldDelegateToOMC } from './src/orchestrator/omc-bridge';

const result = shouldDelegateToOMC('test request');
console.log('Full routing:', JSON.stringify(result, null, 2));
```

**4. 설정 파일 내용 확인**:
```bash
cat .omc/config/delegation-rules.yaml | head -50
cat .omc/config/approval-matrix.yaml | head -50
npm run omc:status
```

---

## 참고 자료

### 핵심 파일
- **브릿지 모듈**: `/src/orchestrator/omc-bridge.ts`
- **오케스트레이터**: `/src/orchestrator/multi-agent-orchestrator.ts`
- **설정**: `/.omc/config/`
- **워크플로우**: `/.omc/workflows/`
- **에이전트 정의**: `/.omc/agents/`

### OMC 공식 문서
- [OMC GitHub Repository](https://github.com/anthropic-ai/oh-my-claudecode)
- [OMC Skills Overview](https://github.com/anthropic-ai/oh-my-claudecode#skills)
- [Agent Registry](https://github.com/anthropic-ai/oh-my-claudecode#agents)

### Nubabel 관련 문서
- [아키텍처 개요](/docs/ARCHITECTURE.md)
- [에이전트 보드](/AGENT_BOARD.md)
- [프로토콜 가이드](/AGENT_PROTOCOL.md)

### 용어 사전
- **OMC**: oh-my-claudecode - AI 에이전트 오케스트레이션 프레임워크
- **워크플로우**: 다단계 자동화 프로세스
- **위임 규칙**: 사용자 요청 → 에이전트 매핑 규칙
- **승인 행렬**: 금액, 유형별 승인 권한 및 타임아웃
- **MCP**: Model Context Protocol - AI 모델의 기능 확장
- **Escalation**: 상향 조정 (승인자, 권한 단계)
- **Tier**: LOW(Haiku)/MEDIUM(Sonnet)/HIGH(Opus) 계층
- **Category**: 작업 특성별 분류 (ultrabrain, visual-engineering 등)
- **Graceful Degradation**: OMC 미설정 시에도 기본 기능 작동

---

**문서 버전**: 1.0
**최종 업데이트**: 2026-01-31
**관리자**: Nubabel Team
