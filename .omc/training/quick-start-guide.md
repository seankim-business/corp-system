# OMC 통합 빠른 시작 가이드

> oh-my-claudecode 에이전트 오케스트레이션 패턴을 Nubabel에서 활용하기 위한 가이드

---

## 목차
1. [개요](#개요)
2. [기본 개념](#기본-개념)
3. [일상 업무에서 활용하기](#일상-업무에서-활용하기)
4. [워크플로우 사용법](#워크플로우-사용법)
5. [자주 묻는 질문](#자주-묻는-질문)

---

## 개요

### OMC란?
oh-my-claudecode(OMC)는 AI 에이전트를 조직화하고 협업시키는 오케스트레이션 시스템입니다.

### 핵심 원칙
- **Conductor, not performer**: 직접 일하지 않고 적절한 에이전트에게 위임
- **3-티어 모델 라우팅**: 작업 복잡도에 따라 적절한 AI 모델 선택
- **비침습적 통합**: 기존 시스템 변경 없이 `.omc/` 디렉토리에서만 동작

---

## 기본 개념

### 에이전트 티어

| 티어 | 모델 | 용도 | 예시 |
|------|------|------|------|
| **HIGH** | Opus | 전략적 결정, 복잡한 분석 | 아키텍처 설계, 예산 승인 |
| **MEDIUM** | Sonnet | 실행, 전문 작업 | 기능 구현, 데이터 분석 |
| **LOW** | Haiku | 빠른 조회, 단순 작업 | 파일 검색, 문서 작성 |

### 주요 에이전트

| 에이전트 | 역할 | 티어 |
|----------|------|------|
| `planner` | 전략 계획, 프로젝트 설계 | HIGH |
| `architect` | 기술 분석, 아키텍처 검토 | HIGH |
| `critic` | 품질 검토, 피드백 제공 | HIGH |
| `executor` | 기능 구현, 작업 실행 | MEDIUM |
| `scientist` | 데이터 분석, 리서치 | MEDIUM |
| `designer` | UI/UX, 비주얼 디자인 | MEDIUM |
| `writer` | 문서화, 콘텐츠 작성 | LOW |
| `explore` | 파일 탐색, 검색 | LOW |

### 위임 카테고리

| 카테고리 | 설명 | 예시 |
|----------|------|------|
| `ultrabrain` | 복잡한 추론, 전략적 분석 | "아키텍처 설계해줘" |
| `visual-engineering` | UI/UX, 프론트엔드 | "버튼 디자인해줘" |
| `artistry` | 창의적 작업 | "캠페인 아이디어 내줘" |
| `quick` | 단순 조회, 빠른 작업 | "파일 찾아줘" |
| `writing` | 문서화, 글쓰기 | "README 작성해줘" |

---

## 일상 업무에서 활용하기

### 자동 라우팅 키워드

다음 키워드가 포함된 요청은 자동으로 적절한 에이전트로 라우팅됩니다:

```
전략 / 아키텍처 / 설계 → architect (HIGH)
계획 / 프로젝트 / 로드맵 → planner (HIGH)
검토 / 리뷰 / 평가 → critic (HIGH)
캠페인 / 마케팅 → planner (HIGH)
구현 / 개발 / 빌드 → executor (MEDIUM)
데이터 / 분석 / 통계 → scientist (MEDIUM)
UI / UX / 디자인 → designer (MEDIUM)
문서화 / README → writer (LOW)
찾아 / 검색 / 어디 → explore (LOW)
```

### 사용 예시

```
"전략적 아키텍처 설계해줘"
→ architect (HIGH) 에이전트가 처리

"예산 검토 요청"
→ critic (HIGH) 에이전트가 처리

"캠페인 런칭 시작해줘"
→ planner (HIGH) 에이전트가 처리
→ campaign-launch 워크플로우 트리거 가능
```

---

## 워크플로우 사용법

### 사용 가능한 워크플로우

#### 1. 캠페인 런칭 (`campaign-launch.yml`)
```
트리거: "캠페인 런칭", "마케팅 캠페인"
단계: 계획 → 콘텐츠 생성(병렬) → 검토 → 승인 → 실행 → 모니터링
소요시간: 2-4시간
```

#### 2. 예산 검토 (`budget-review.yml`)
```
트리거: "예산 검토", "비용 승인"
단계: 분석 → 규정 확인 → 영향 평가 → 요약 → 승인 → 처리
승인 체계:
  - < 100만원: 자동 승인
  - 100만~500만원: 팀장 승인 (24시간)
  - 500만~1000만원: 디렉터 승인 (48시간)
  - > 1000만원: C-Level 승인 (72시간)
```

#### 3. 분기 보고서 (`quarterly-report.yml`)
```
트리거: "분기 보고서", "Q1/Q2/Q3/Q4 리포트"
단계: 데이터 수집(병렬) → 분석 → 시각화 → 작성 → 검토 → 승인 → 배포
출력: PDF, PPTX, XLSX
```

### 워크플로우 실행 확인

```bash
# 워크플로우 목록 확인
ls .omc/workflows/

# 워크플로우 상태 확인 (활성화된 경우)
cat .omc/state/workflow-state.json
```

---

## 자주 묻는 질문

### Q: OMC 설정을 비활성화하려면?
```bash
# 설정 폴더 이름 변경 (비활성화)
mv .omc/config .omc/config.disabled

# 다시 활성화
mv .omc/config.disabled .omc/config
```

### Q: 새 에이전트를 추가하려면?
`.omc/agents/` 디렉토리에 YAML 파일 생성:
```yaml
name: my-agent
description: "내 에이전트 설명"
tier: MEDIUM
category: quick
omc_mapping:
  primary: executor
nubabel_mapping: task
responsibilities:
  - 첫 번째 책임
  - 두 번째 책임
```

### Q: 새 위임 규칙을 추가하려면?
`.omc/config/delegation-rules.yaml`에 규칙 추가:
```yaml
- pattern: "(내 패턴|my pattern)"
  omc_agent: executor
  nubabel_agent: task
  tier: MEDIUM
  category: quick
```

### Q: 승인 임계값을 변경하려면?
`.omc/config/approval-matrix.yaml`에서 `thresholds` 섹션 수정.

### Q: 에러가 발생하면?
1. 로그 확인: `.omc/logs/`
2. 설정 검증:
   ```bash
   node -e "const yaml = require('yaml'); console.log(yaml.parse(require('fs').readFileSync('.omc/config/delegation-rules.yaml', 'utf8')))"
   ```
3. 브릿지 모듈 테스트:
   ```bash
   npx tsx -e "import { loadOMCConfig } from './src/orchestrator/omc-bridge'; console.log(loadOMCConfig())"
   ```

---

## 다음 단계

- [전체 문서](../docs/OMC_INTEGRATION.md) 읽기
- [워크플로우 템플릿](.omc/workflows/) 살펴보기
- [에이전트 정의](.omc/agents/) 커스터마이징

---

*문의: #it-support 채널 또는 engineering@nubabel.com*
