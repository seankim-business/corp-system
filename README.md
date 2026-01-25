# Kyndof Corp System - AI 기반 기업 운영 시스템

> **비전:** 회사의 구조와 프로세스를 코드가 아닌 자산으로 남기며, 디지털과 실물 세계를 연결하는 학습하는 AI 시스템

---

## 📋 목차

- [개요](#개요)
- [핵심 가치](#핵심-가치)
- [시스템 아키텍처](#시스템-아키텍처)
- [주요 기능](#주요-기능)
- [기술 스택](#기술-스택)
- [구현 로드맵](#구현-로드맵)
- [시작하기](#시작하기)

---

## 개요

Kyndof Corp System은 **OhMyOpenCode 기반 멀티 에이전트 오케스트레이션**, **RABSIC 기반 권한 관리**, **모듈화된 워크플로우 시스템**, **물리적 세계 연동**, **학습 기반 피드백 루프**를 통합한 차세대 기업 운영 플랫폼입니다.

### 한 문장 요약
Slack/Web에서 AI 에이전트에게 요청하면, 에이전트들이 협업하여 업무를 처리하고, Notion/Drive/GitHub/Slack을 동기화하며, 실물 제작까지 연동하여 학습하는 시스템.

---

## 핵심 가치

### 1. 디지털 + 실물 세계 통합
- Clo3D/Blender 디자인 → 실물 제작 → 품질 검증 → AI 학습
- 봉제/3D 프린팅 등 물리적 작업 추적 및 최적화
- 센서/카메라/작업자 대화 로그 수집 → 지속적 개선

### 2. 점진적 AI 자동화
- **현재**: Technical Designer가 100% 지시
- **1년 후**: Agent가 90% 정확한 지시, 사람이 10% 보완
- **3년 후**: Agent가 Agent에게 90% 정확도로 컨펌, 사람은 데이터 제공

### 3. 유지보수 용이성 최우선
- 플러그인 아키텍처 (YAML 설정으로 추가/제거)
- Hot Reload (재시작 없이 변경 적용)
- 표준 기술 준수 (LangChain, MCP, PostgreSQL, Redis)
- 실무자도 수정 가능 (Web UI + 모듈 빌더)

### 4. 인터페이스 독립성
- Slack, Web, API 어디서든 동일하게 사용
- 세션 연속성 (Slack 시작 → Web 이어서 작업 가능)

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                   Interface Layer                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Slack   │  │    Web   │  │ Terminal │  │   API    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Core Engine                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Orchestrator (Atlas)                                  │ │
│  │  - Command Bus (인터페이스 독립적 명령 처리)             │ │
│  │  - Session Manager (통합 세션 관리)                     │ │
│  │  - Permission Engine (RABSIC 기반)                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Multi-Agent System                                    │ │
│  │  - Prometheus (Planner)                                │ │
│  │  - Atlas (Executor)                                    │ │
│  │  - Function Agents (Brand/Ops/CS/Finance)              │ │
│  │  - Specialist Agents (Oracle/Librarian/Explore)        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Workflow Module System                                │ │
│  │  - Unified Gateway (n8n/ComfyUI/Blender/Clo3D)         │ │
│  │  - Module Registry (모듈 메타데이터)                     │ │
│  │  - Module Builder (실무자용 편집 UI)                    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Physical World Integration                            │ │
│  │  - Production Tracker (작업 추적)                       │ │
│  │  - Quality Inspector (AI 비전 검사)                     │ │
│  │  - Learning System (피드백 루프)                        │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  GitHub SSOT (Single Source of Truth)                  │ │
│  │  /registry  /org  /workflows  /automations  /docs      │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Runtime Storage                                       │ │
│  │  - PostgreSQL (세션, 실행 로그, 학습 데이터)             │ │
│  │  - Redis (캐시, 세션 핫 스토어)                          │ │
│  │  - Vector DB (지식 검색)                                │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  External Integrations (MCP Servers)                   │ │
│  │  - Notion MCP  - Drive MCP  - Slack MCP                │ │
│  │  - Figma MCP   - Email MCP  - GitHub MCP               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 주요 기능

### 🤖 멀티 에이전트 오케스트레이션 (OhMyOpenCode 기반)

**Prometheus (계획) → Atlas (실행) → Specialized Agents (전문가)**

- **계획 단계**: Prometheus가 요구사항 인터뷰 → Metis 갭 분석 → Momus 검증 → Plan 생성
- **실행 단계**: Atlas가 Plan 읽고 → Function/Specialist Agents에게 델리게이션
- **Category + Skills**: 도메인 최적화 모델 자동 선택 (visual-engineering, ultrabrain 등)
- **Background Execution**: 탐색/조사는 병렬 백그라운드로 처리

### 🔐 RABSIC 기반 권한 및 승인 시스템

**조직 구조 → Agent 권한 자동 매핑**

- **R**esponsible: 실행 책임 → Agent 실행 권한
- **A**ccountable: 최종 승인 → 승인 요청 자동 라우팅
- **B**ackup: 백업 담당 → Primary 부재 시 에스컬레이션
- **S**upport: 지원 → 협업 알림
- **I**nformed: 정보 수신 → 완료 시 자동 알림
- **C**onsulted: 사전 협의 → 실행 전 협의 요청

**컨텍스트 기반 동적 권한**: 시간/역할/데이터 범위에 따라 권한 자동 조정

### 🛠️ Self-Service Automation Builder

**실무자도 자동화 생성 가능**

1. **Business Agent** (요구사항 인터뷰)
   - "어떤 이벤트가 트리거인가요?"
   - "누구 승인이 필요한가요?" (RABSIC 자동 매핑)
   - "어떤 액션을 수행하나요?"

2. **Engineering Agent** (코드 자동 생성)
   - Spec → TypeScript 코드 변환
   - MCP 서버 스캐폴딩
   - 테스트 자동 생성
   - 배포 스크립트 생성

3. **배포 및 모니터링**
   - Registry에 자동 등록
   - Web Dashboard에 표시
   - 실행 로그 자동 수집

### 📊 SSOT 동기화 검증 시스템

**모든 도구 → GitHub로 수렴, 30분마다 검증**

- **Notion**: 프로젝트 관리 (양방향 동기화)
- **Google Drive**: 공식 문서 (Drive → GitHub)
- **Slack**: 의사결정 기록 (✅ 리액션 시 GitHub 저장)
- **Email**: 계약서 (승인 후 GitHub)
- **Figma**: 디자인 시스템 (일일 동기화)

**충돌 해결**: 자동 동기화 vs 사람 개입 요청 (Slack 알림)

### 🔔 통합 알림 및 태스크 관리

**모든 채널 알람 통합 → Notion 태스크 자동 생성**

- 중복 제거 (같은 이벤트 여러 채널에서 수신 시)
- 우선순위 기반 라우팅
- 리마인더 자동 스케줄링 (24시간 전, 4시간 전, 1시간 전)
- Notion 태스크 자동 생성 및 완료 감지

### ⏰ 일일 업무 관리 및 시간 모니터링

**전사 목표 정렬 확인 + 타임박싱 추적**

- **09:00 체크인**: 오늘 핵심 업무 1-3개 입력 → 매니저 승인
- **14:00 중간 체크**: 타임박싱 준수 여부 → 방해 요소 기록
- **18:00 체크아웃**: 완료 여부 보고 → 시간 사용 회고
- **일일 보고서**: 팀별 → 경영진 자동 전파

### 🔍 Observability & Debugging

**AI 기반 에러 진단 + One-Click Fix**

- 전체 실행 로그 및 AI 추론 과정 기록
- 에러 발생 시 AI가 자동 분석 → 근본 원인 + 수정 방법 제시
- Auto-fix 가능한 경우 원클릭 수정 → 자동 재실행
- Web Dashboard에서 실시간 모니터링

### 🧩 모듈화된 워크플로우 시스템

**n8n, ComfyUI, Blender, Clo3D를 "Workflow Module"로 추상화**

- **실무자용 Module Builder**: No-Code 인터페이스로 입력/출력 정의
- **Unified Gateway**: 모든 엔진을 동일한 API로 호출
- **여러 인터페이스 지원**: Slack/Web/MCP에서 동일하게 사용
- **자동 Tool 등록**: 모듈 생성 즉시 Agent가 사용 가능

**ComfyUI Workflow Creator Agent**: 복잡한 이미지 생성 워크플로우도 끝까지 자동 생성

### 🏭 물리적 세계 연동 (봉제 워크플로우)

**디지털 디자인 → 실물 제작 → 품질 검증 → 피드백**

- **작업 추적**: QR 스캔, 센서, 수동 확인
- **AI 품질 검사**: 사진 업로드 → 결함 감지 + 측정값 추출
- **피드백 루프**: 품질 실패 시 → 디자인 수정 제안 or 재작업 지시
- **Slack 연동**: 작업자에게 실시간 지시 및 결과 피드백

### 🎓 학습 기반 디지털-실물 피드백 시스템

**목표: Agent-to-Agent 검증 90% 정확도**

**학습 데이터 수집**:
- 사람의 수정 사항 (가장 중요!)
- 디지털 vs 실물 차이
- AI vs 사람 품질 검사 불일치
- 작업자 간 대화 (암묵지 추출)

**모델 개선**:
- 300 사이클마다 자동 재훈련
- Fine-tuning with 사람 피드백
- 정확도 87% → 90% → 95% 점진적 향상

**최종 상태**: 사람은 마지널하게 데이터를 제공하며, Agent가 대부분 자동 처리

---

## 기술 스택

### Core
- **Language**: TypeScript, Python
- **Agent Framework**: LangChain, LangGraph
- **MCP Protocol**: Model Context Protocol (표준 준수)

### Storage
- **SSOT**: GitHub (모노레포)
- **Database**: PostgreSQL (세션, 실행 로그, 학습 데이터)
- **Cache**: Redis (세션 핫 스토어)
- **Vector DB**: pgvector or Qdrant (지식 검색)

### External Integrations
- **Notion API**: 프로젝트 관리
- **Google Drive API**: 문서 관리
- **Slack API**: 커뮤니케이션
- **Figma API**: 디자인
- **GitHub API**: SSOT 관리

### Workflow Engines
- **n8n**: 자동화 워크플로우
- **ComfyUI**: 이미지 생성
- **Blender**: 3D 모델링
- **Clo3D**: 의류 디자인

### AI Models
- **Anthropic Claude**: 메인 에이전트 (Opus 4.5, Sonnet 4.5)
- **OpenAI GPT**: 전문 에이전트 (GPT-5.2)
- **Google Gemini**: 창의적 작업 (Gemini 3 Pro)
- **Local Models**: Ollama (비용 최적화)

### Frontend
- **Framework**: React + TypeScript
- **UI**: Tailwind CSS
- **State**: Zustand
- **Data Fetching**: TanStack Query

---

## 구현 로드맵

### Phase 1: Quick Wins (1-2개월)

**목표**: 핵심 가치 검증, 즉시 사용 가능한 기능 배포

**구현 우선순위**:
1. ✅ **Slack Bot + 기본 Agent** (2주)
   - Slack 인터페이스
   - 단일 Function Agent (Brand or Ops)
   - 기본 MCP 서버 (Notion, Slack)

2. ✅ **SSOT 동기화 (Notion → GitHub)** (1주)
   - Notion 프로젝트 관리 → GitHub 동기화
   - 수동 트리거 (나중에 자동화)

3. ✅ **Workflow Module 1개** (1주)
   - ComfyUI 이미지 생성 모듈
   - Slack/Web에서 실행 가능

4. ✅ **Web Dashboard MVP** (2주)
   - 실행 로그 조회
   - 모듈 관리 (On/Off)
   - SSOT 동기화 상태

**성과 측정**:
- Slack에서 Agent 호출 → Notion 업데이트 성공률 90%
- 이미지 생성 모듈 사용 횟수 주 10회+
- 사용자 만족도 설문 8/10 이상

---

### Phase 2: Core System (3-4개월)

**목표**: 멀티 에이전트 + RABSIC + 자동화 빌더

**구현 우선순위**:
1. ✅ **Multi-Agent Orchestration** (4주)
   - Prometheus (Planner)
   - Atlas (Orchestrator)
   - 3-4개 Function Agents
   - Oracle (디버깅 전문)

2. ✅ **RABSIC 권한 시스템** (3주)
   - 조직 구조 정의 (YAML)
   - Permission Engine
   - 승인 라우팅 (Slack)

3. ✅ **Automation Builder** (4주)
   - Business Agent
   - Engineering Agent
   - 자동 MCP 생성

4. ✅ **통합 알림 시스템** (2주)
   - 모든 채널 통합
   - Notion 태스크 자동 생성
   - 리마인더

5. ✅ **일일 업무 관리** (2주)
   - 체크인/체크아웃
   - 매니저 승인
   - 일일 보고서

**성과 측정**:
- 자동화 생성 성공률 80%
- 승인 프로세스 시간 50% 단축
- 사람 개입 없이 완료되는 작업 비율 30%

---

### Phase 3: Physical Integration (5-7개월)

**목표**: 디지털-실물 연동 + 학습 시스템

**구현 우선순위**:
1. ✅ **물리적 워크플로우 추적** (4주)
   - QR 스캔 시스템
   - Slack 작업 인터페이스
   - 센서 연동 (시범)

2. ✅ **AI 품질 검사** (4주)
   - 이미지 업로드 → 결함 감지
   - 측정값 자동 추출
   - 품질 Pass/Fail 판정

3. ✅ **학습 데이터 수집** (3주)
   - Production Cycle Data 스키마
   - 모든 단계 로그 수집
   - 사람 수정 사항 추적

4. ✅ **학습 모델 v1** (5주)
   - Fine-tuning 파이프라인
   - 사람 피드백 학습
   - 정확도 80% 목표

5. ✅ **Learning Dashboard** (2주)
   - 모델 정확도 추이
   - 학습 진행 상황
   - 사람 개입 필요율

**성과 측정**:
- AI 품질 검사 정확도 85%
- 재작업률 20% → 15% 감소
- 지시서 정확도 70% → 80%

---

### Phase 4: Full Automation (8-12개월)

**목표**: Agent-to-Agent 검증 90% 정확도

**구현 우선순위**:
1. ✅ **학습 모델 고도화** (지속)
   - 정확도 90% 달성
   - Agent Validator
   - 다양한 제품 카테고리 학습

2. ✅ **완전 자동화 워크플로우** (지속)
   - 사람 개입 < 10%
   - 예외 상황 자동 처리
   - Self-healing

3. ✅ **확장 및 최적화** (지속)
   - 성능 최적화
   - 비용 최적화
   - 다국어 지원

**성과 측정**:
- Agent-to-Agent 검증 정확도 90%
- 사람 개입 필요율 < 10%
- 처리 시간 50% 단축

---

## 프로젝트 진행사항 트래킹

### 방법 1: GitHub Projects

```bash
# GitHub Projects 사용
1. Issues로 각 기능 생성
2. Projects 보드에서 Kanban 관리
3. 자동화: Issue 상태 변경 → Project 열 이동
```

### 방법 2: Notion + GitHub 동기화

```bash
# Notion에서 관리, GitHub에 동기화
1. Notion "Implementation Roadmap" 데이터베이스
2. 매일 자동 GitHub Issues 동기화
3. Web Dashboard에 통합 표시
```

### 방법 3: 이 시스템 자체 사용

```bash
# Self-hosting: 이 시스템으로 자기 자신 관리
1. Daily Work Manager로 진행사항 추적
2. Value Stream UI로 단계별 진행 시각화
3. Learning Dashboard로 개선 추이 확인
```

---

## 시작하기

### Prerequisites

```bash
# Required
- Node.js 20+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose

# API Keys
- Anthropic API Key
- OpenAI API Key (optional)
- Google API Key (optional)
- Notion API Key
- Slack Bot Token
- GitHub Personal Access Token
```

### Installation

```bash
# 1. Clone repository
git clone https://github.com/kyndof/corp-system.git
cd corp-system

# 2. Install dependencies
npm install
cd core/orchestrator && npm install
cd ../permission-engine && npm install
# ... (각 패키지)

# 3. Setup environment
cp .env.example .env
# .env 파일 편집 (API Keys 입력)

# 4. Initialize database
npm run db:migrate
npm run db:seed

# 5. Start services
docker-compose up -d  # PostgreSQL, Redis
npm run dev          # All services
```

### Quick Start (Slack Bot)

```bash
# 1. Slack App 생성 및 Bot Token 획득
# 2. .env에 SLACK_BOT_TOKEN 설정
# 3. Slack Bot 시작
cd interfaces/slack
npm run dev

# 4. Slack에서 테스트
# DM 또는 채널에서:
# @bot 안녕? 오늘 할 일 알려줘
```

---

## 디렉토리 구조

```
kyndof-corp-system/
├── README.md                    # 이 문서
├── ARCHITECTURE.md              # 아키텍처 상세
├── docker-compose.yml
├── .env.example
│
├── core/                        # 핵심 엔진
│   ├── orchestrator/           # Atlas
│   ├── permission-engine/      # RABSIC
│   ├── execution-engine/
│   ├── workflow-modules/       # 모듈 시스템
│   ├── physical-workflows/     # 실물 연동
│   ├── learning-system/        # 학습 엔진
│   └── observability/
│
├── agents/                      # 에이전트 정의
│   ├── prometheus/
│   ├── atlas/
│   ├── function-agents/
│   ├── specialist-agents/
│   └── automation-agents/
│
├── mcp-servers/                # MCP 서버
│   ├── github-mcp/
│   ├── notion-mcp/
│   ├── drive-mcp/
│   └── slack-mcp/
│
├── interfaces/                  # 인터페이스
│   ├── slack/
│   ├── web/
│   └── api/
│
├── registry/                    # Plugin Registry
│   ├── org/
│   ├── agents/
│   ├── workflows/
│   ├── automations/
│   └── integrations/
│
├── runtime/                     # 실행 데이터
│   ├── executions/
│   ├── sessions/
│   └── approvals/
│
└── docs/                        # 문서
    ├── guides/
    ├── api/
    └── architecture/
```

---

## 핵심 설계 원칙

### 1. 유지보수성 최우선
- 표준 기술 사용 (LangChain, MCP, PostgreSQL)
- 선언적 YAML 설정
- Hot Reload 지원
- Web UI로 관리

### 2. 인터페이스 독립성
- Command Bus로 통합
- 세션 독립적 관리
- 어디서든 동일하게 사용

### 3. 학습하는 시스템
- 사람 피드백으로 지속 개선
- 점진적 자동화 (70% → 90% → 95%)
- 데이터 기반 의사결정

### 4. 실용주의
- Quick Wins 우선
- 기존 레퍼런스 조합
- 과도한 엔지니어링 지양

---

## 라이센스

Proprietary - Kyndof Corporation

---

## 문의

- **팀**: Kyndof Engineering
- **이메일**: engineering@kyndof.com
- **Slack**: #corp-system-dev

---

**Built with ❤️ by Kyndof Team**
