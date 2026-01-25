# Nubabel 로드맵

**전략**: 보이는 것 우선 → 점진적 고도화

---

## 🎯 전체 타임라인

```
Jan 2026  Phase 1: Foundation ✅
  ↓
Q1 2026   Phase 2: Visible Features (지금!)
  ↓
Q2 2026   Phase 3: Intelligence
  ↓
Q3-Q4     Phase 4: Framework
  ↓
2027+     Phase 5: Learning
```

---

## Phase 1: Foundation ✅ (완료)

**기간**: 2026년 1월  
**목표**: 멀티테넌트 인프라 구축

### 완성된 것
- ✅ Multi-tenant 인증 (Google Workspace OAuth)
- ✅ Database schema with RLS
- ✅ Docker deployment configuration
- ✅ Railway 배포 준비 완료

### 성과
- 완성도: **100%**
- 배포만 하면 바로 사용 가능

**다음**: Railway 수동 배포 (진행 중)

---

## Phase 2: Visible Features 🎯 (현재 - Q1 2026)

**기간**: 3개월 (2-4월)  
**목표**: 사용자가 볼 수 있는 UI/UX 완성

### Week 1-2: Web Dashboard
```
목표: 로그인 + 기본 대시보드
├── 로그인 페이지 (Google OAuth UI)
├── 대시보드 레이아웃
├── 조직 전환기
└── 설정 페이지
```

**결과물**:
- 사용자가 로그인해서 대시보드 볼 수 있음
- 조직 전환 가능
- 프로필 설정 가능

### Week 3-4: 첫 번째 워크플로우 (수동)
```
목표: 워크플로우 수동 실행
├── 워크플로우 목록 보기
├── 워크플로우 상세 보기
├── 수동 실행 버튼
└── 실행 로그 보기
```

**결과물**:
- 사용자가 버튼 클릭으로 워크플로우 실행
- 실행 결과 확인 가능

### Week 5-8: Notion 연동
```
목표: Notion MCP로 데이터 읽기/쓰기
├── Notion MCP 서버 구현
├── Task 목록 가져오기
├── Task 생성/수정
└── Dashboard에 표시
```

**결과물**:
- Nubabel에서 Notion task 관리 가능
- 양방향 동기화

### Week 9-12: Slack Bot
```
목표: Slack에서 워크플로우 실행
├── Slack Bot 설정
├── 자연어 명령 파싱
├── 워크플로우 트리거
└── 결과 메시지 전송
```

**결과물**:
- Slack에서 "@nubabel 태스크 생성" 가능
- 자동화 시작점

**Phase 2 성공 기준**:
- [ ] 로그인 → 대시보드 → 워크플로우 실행 → 결과 확인
- [ ] Notion에서 task 보임
- [ ] Slack에서 명령 가능

상세: [phase-2-spec.md](phase-2-spec.md)

---

## Phase 3: Intelligence (Q2 2026)

**기간**: 3개월 (5-7월)  
**목표**: 간단한 AI Agent 추가

### Month 1: Agent MVP
```
단일 Function Agent
├── Task 정의 (JSON)
├── Agent 실행
├── 결과 반환
└── 로그 저장
```

**예시**:
```json
{
  "task": "Create Notion task",
  "input": { "title": "New feature", "assignee": "Sean" },
  "agent": "notion-agent"
}
```

### Month 2: Background Execution
```
Background Job Queue
├── Task 큐에 추가
├── Worker로 비동기 실행
├── 진행 상황 추적
└── 완료/실패 알림
```

### Month 3: Error Handling
```
Retry & Recovery
├── 실패 시 재시도
├── 에러 로깅
├── 사용자 알림
└── 수동 개입 옵션
```

**Phase 3 성공 기준**:
- [ ] Agent가 자동으로 Notion task 생성
- [ ] 실패 시 재시도
- [ ] 로그에서 전체 과정 추적 가능

상세: [phase-3-spec.md](phase-3-spec.md)

---

## Phase 4: Framework (Q3-Q4 2026)

**기간**: 6개월 (8월-12월)  
**목표**: Extension 시스템 완성 + 첫 외부 고객

### Q3: Extension System
```
Plugin Architecture
├── Hook 시스템 구현
├── Extension 로더
├── Kyndof Extension 분리
└── Extension Marketplace UI
```

### Q4: External Customer
```
첫 외부 고객 준비
├── 일반화된 기능만 Core에
├── 커스터마이징 가이드
├── Self-service onboarding
└── 첫 고객 3개 확보
```

**Phase 4 성공 기준**:
- [ ] Kyndof 특수 기능이 Extension으로 분리됨
- [ ] 다른 회사가 자기 Extension 만들 수 있음
- [ ] 첫 외부 고객 3개 사용 시작

상세: [phase-4-spec.md](phase-4-spec.md)

---

## Phase 5: Learning (2027+)

**기간**: 장기 (1년 이상)  
**목표**: "Human as Training Data" 실현

### Step 1: Activity Tracking
```
사용자 행동 기록
├── Screen recording (옵션)
├── Click/Keyboard 이벤트
├── Navigation 패턴
└── Context 저장
```

### Step 2: Pattern Detection
```
패턴 감지
├── 반복 작업 발견
├── 워크플로우 추천
├── 자동화 제안
└── 사용자 승인
```

### Step 3: Learning Loop
```
지속적 학습
├── 사람 피드백 수집
├── 모델 재훈련
├── 정확도 향상
└── 자동화율 증가
```

**Phase 5 성공 기준**:
- [ ] 사용자 작업 패턴 자동 감지
- [ ] 자동화 제안 정확도 80%+
- [ ] 사람 개입 < 20%

상세: [phase-5-spec.md](phase-5-spec.md)

---

## 🎯 현재 위치

```
━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░ 10%

Phase 1: ████████████████████ 100% ✅
Phase 2: ░░░░░░░░░░░░░░░░░░░░   0% 🎯
Phase 3: ░░░░░░░░░░░░░░░░░░░░   0%
Phase 4: ░░░░░░░░░░░░░░░░░░░░   0%
Phase 5: ░░░░░░░░░░░░░░░░░░░░   0%
```

**지금**: Phase 2 Web Dashboard 개발 시작

---

## 📊 마일스톤

| 시기 | 마일스톤 | 설명 |
|------|----------|------|
| 1월 | MVP 완성 | 인증 + DB |
| 3월 | Dashboard 완성 | UI/UX 사용 가능 |
| 4월 | Notion 연동 | 첫 실제 자동화 |
| 7월 | AI Agent | 간단한 지능 추가 |
| 12월 | Extension System | 외부 판매 준비 |
| 2027 | Learning | 장기 비전 시작 |

---

## 🚀 다음 단계

**즉시**:
1. Railway 배포 완료
2. Frontend 개발 환경 셋업
3. Phase 2 Week 1 시작

**참조**:
- [Phase 2 상세 스펙](phase-2-spec.md)
- [Frontend 셋업](../frontend/01-setup.md)
- [Deployment 가이드](../deployment/01-railway.md)
