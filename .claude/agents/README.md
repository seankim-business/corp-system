# Nubabel QA Agent System

이 디렉터리에는 Nubabel 플랫폼을 위한 멀티 레벨 QA 에이전트 시스템이 정의되어 있습니다.

## 에이전트 계층 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                    nubabel-qa-architect (Top)                   │
│         전체 QA 오케스트레이션, 플로우 배분, 결과 취합              │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│ flow-planner  │    │ spec-aligner  │    │ chrome-tester │
│ 플로우 목록화    │    │ 기획vs구현 diff │    │ WebUI 테스트   │
└───────────────┘    └───────────────┘    └───────┬───────┘
                                                  │
┌───────────────┐    ┌───────────────┐    ┌───────▼───────┐
│slack-simulator│    │    fixer      │    │ Sub-sub       │
│ Slack 테스트   │    │  버그 수정     │    │ - auth-tester │
└───────┬───────┘    └───────────────┘    │ - approval    │
        │                                 └───────────────┘
┌───────▼───────┐    ┌───────────────┐    ┌───────────────┐
│ Sub-sub       │    │ test-builder  │    │ build-monitor │
│ - slack-tester│    │  테스트 작성    │    │  배포 감시     │
└───────────────┘    └───────────────┘    └───────────────┘

                     ┌───────────────┐
                     │ risk-reporter │
                     │  리스크 리포트  │
                     └───────────────┘
```

## 에이전트 목록

### 상위 레벨 (Orchestrator)
| 에이전트 | 파일 | 역할 |
|---------|------|-----|
| QA Architect | `nubabel-qa-architect.md` | 전체 QA 조율, 서브에이전트 배분, 결과 취합 |

### 서브 레벨 (Specialists)
| 에이전트 | 파일 | 역할 |
|---------|------|-----|
| Flow Planner | `nubabel-flow-planner.md` | 유저 플로우 식별, 우선순위 결정 |
| Spec Aligner | `nubabel-spec-aligner.md` | 기획 vs 구현 Gap 분석 |
| Chrome Tester | `nubabel-chrome-tester.md` | WebUI E2E 테스트 (Claude in Chrome) |
| Slack Simulator | `nubabel-slack-simulator.md` | @Nubabel Slack 테스트 |
| Fixer | `nubabel-fixer.md` | 버그 수정 + 검증 |
| Test Builder | `nubabel-test-builder.md` | 테스트 코드 작성 |
| Build Monitor | `nubabel-build-monitor.md` | Railway 배포/빌드 감시 |
| Risk Reporter | `nubabel-risk-reporter.md` | 리스크 매트릭스 생성 |

### 서브서브 레벨 (Flow Specialists)
| 에이전트 | 파일 | 역할 |
|---------|------|-----|
| Auth Tester | `nubabel-flow-auth-tester.md` | Auth 플로우 전문 테스트 |
| Slack Tester | `nubabel-flow-slack-tester.md` | Slack 플로우 전문 테스트 |
| Approval Tester | `nubabel-flow-approval-tester.md` | Approval 플로우 전문 테스트 |

## 사용 방법

### 1. 전체 플랫폼 QA (권장)

```
nubabel-qa-architect 에게:
"app.nubabel.com 전체를 기획 기반으로 QA/QC 해줘.
안 되는 부분은 알아서 고치고, ralph ultrawork 모드로 끝까지 해줘."
```

### 2. 특정 플로우만 QA

```
nubabel-qa-architect 에게:
"Auth + Dashboard 플로우만 ultraqa 모드로 검증해줘.
Slack과 WebUI 양쪽 다 테스트하고, 문제 있으면 바로 수정해."
```

### 3. 위험한 플로우 우선 QA

```
nubabel-qa-architect 에게:
"테스트 없이 추가된 기능 전체를 플로우별로 나눠서,
가장 위험한 3개 플로우부터 잡아줘. yolo 모드로."
```

### 4. 배포 후 검증

```
nubabel-qa-architect 에게:
"Railway 배포 직후야. 핵심 플로우(Auth, Dashboard, Slack mention)만
빠르게 sanity check 해줘."
```

### 5. 특정 버그 수정 + 검증

```
nubabel-fixer 에게:
"BUG-001: 로그인 후 Dashboard에서 TypeError 발생.
reproduction: /login → OAuth 완료 → Dashboard에서 user.name 에러.
수정하고 관련 테스트 추가해줘."
```

## 모드 키워드

| 키워드 | 효과 |
|-------|-----|
| `ralph` | 완료될 때까지 멈추지 않음 (persistence) |
| `ultrawork` | 최대 병렬 실행 (parallelism) |
| `ultraqa` | 테스트 → 수정 → 재테스트 반복 |
| `yolo` | 최소 사람 개입 (위험 작업 제외) |
| `autopilot` | 전체 자동화 |

**조합 예시**: `ralph ultrawork` = 끝까지 + 병렬로

## Deep QA 원칙 (모든 에이전트에 적용)

1. **Width + Depth**: 해피 패스만 테스트하지 않음. 엣지 케이스, 에러 케이스, 느린 네트워크, 중복 클릭 등 포함.

2. **Consistency Check**: WebUI, Slack, 로그, DB 간 데이터 정합성 교차 검증.

3. **Root Cause Focus**: 증상 → 직접 원인 → 근본 원인 순으로 파고들어 수정.

4. **Endless Skepticism**: "아마 괜찮을 거야" 금지. 증거 없으면 추가 검증.

5. **Pre-Edit Observation**: 코드 수정 전 현재 상태 다각도 관찰.

6. **Post-Edit Verification**: 수정 후 해피 + 엣지 케이스 + 관련 플로우 재검증.

7. **Honest Reporting**: 테스트한 것, 안 한 것, 남은 리스크 솔직히 보고.

## 템플릿

새 에이전트 추가 시 `template.md`를 참고하세요.

## 디렉터리 구조

```
.claude/agents/
├── README.md                          # 이 파일
├── template.md                        # 에이전트 정의 템플릿
├── nubabel-qa-architect.md            # 상위 오케스트레이터
├── nubabel-flow-planner.md            # 서브: 플로우 계획
├── nubabel-spec-aligner.md            # 서브: 스펙 정렬
├── nubabel-chrome-tester.md           # 서브: Chrome 테스트
├── nubabel-slack-simulator.md         # 서브: Slack 테스트
├── nubabel-fixer.md                   # 서브: 버그 수정
├── nubabel-test-builder.md            # 서브: 테스트 작성
├── nubabel-build-monitor.md           # 서브: 빌드 모니터
├── nubabel-risk-reporter.md           # 서브: 리스크 리포트
├── nubabel-flow-auth-tester.md        # 서브서브: Auth 전문
├── nubabel-flow-slack-tester.md       # 서브서브: Slack 전문
└── nubabel-flow-approval-tester.md    # 서브서브: Approval 전문
```

## 주의사항

- **테스트 채널만 사용**: Slack은 `#it-test` 채널에서만 테스트
- **위험 작업은 HOLD**: 데이터 삭제, 결제, 프로덕션 DB 수정 등은 사람 승인 필요
- **증거 기반 완료**: 모든 "완료" 주장은 스크린샷/로그/테스트 결과 필수
