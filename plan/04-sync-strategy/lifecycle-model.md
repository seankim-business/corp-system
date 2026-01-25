# 문서 라이프사이클 모델

## 개요

문서가 초안(Draft)에서 공식(Official)으로 승격되는 전체 라이프사이클을 정의합니다.

---

## 라이프사이클 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   NOTION/DRIVE (Working Area)                                           │
│                                                                         │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐                        │
│   │  Draft  │ ───▶ │  Review │ ───▶ │  Ready  │                        │
│   │         │      │         │      │   for   │                        │
│   │         │      │         │      │Official │                        │
│   └─────────┘      └─────────┘      └────┬────┘                        │
│        │                │                 │                             │
│        │ 폐기           │ 수정 요청       │ 승격 조건 충족              │
│        ▼                ▼                 ▼                             │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐                        │
│   │Archived │      │Revision │      │ Pending │                        │
│   │         │      │ Needed  │      │  Sync   │                        │
│   └─────────┘      └─────────┘      └────┬────┘                        │
│                                          │                              │
└──────────────────────────────────────────┼──────────────────────────────┘
                                           │
                                           │ PR 생성
                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   GITHUB (SSOT)                                                         │
│                                                                         │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐                        │
│   │   PR    │ ───▶ │Approved │ ───▶ │Official │                        │
│   │ Created │      │         │      │(Merged) │                        │
│   └─────────┘      └─────────┘      └────┬────┘                        │
│        │                                  │                             │
│        │ 거절                             │ 업데이트 필요              │
│        ▼                                  ▼                             │
│   ┌─────────┐                       ┌─────────┐                        │
│   │Rejected │                       │  Update │ ──────────────┐        │
│   │(Closed) │                       │ Required│               │        │
│   └────┬────┘                       └─────────┘               │        │
│        │                                                       │        │
└────────┼───────────────────────────────────────────────────────┼────────┘
         │                                                       │
         │ 피드백 반영                                           │ 새 PR
         ▼                                                       ▼
    Notion으로 돌아가서 수정                              GitHub에서 직접 수정
```

---

## 상태 정의

### Notion/Drive 상태

| 상태 | 설명 | 에이전트 참조 | 편집 가능 |
|------|------|-------------|----------|
| **Draft** | 초안 작성 중 | 불가 | O |
| **In Review** | 팀 리뷰 진행 중 | 불가 | O (리뷰어) |
| **Ready for Official** | 승격 준비 완료 | 불가 | X |
| **Pending Sync** | 동기화 대기 중 | 불가 | X |
| **Official** | GitHub에 동기화 완료 | 가능 | X (읽기 전용) |
| **Revision Needed** | 수정 요청됨 | 불가 | O |
| **Archived** | 폐기됨 | 불가 | X |

### GitHub 상태

| 상태 | 설명 | 에이전트 참조 |
|------|------|-------------|
| **PR Open** | PR 생성됨, 리뷰 대기 | 불가 |
| **PR Approved** | 승인됨, 머지 대기 | 불가 |
| **Merged (Active)** | 머지됨, 운영 중 | 가능 |
| **Deprecated** | 폐기 예정 | 가능 (경고 표시) |
| **Archived** | 완전 폐기 | 불가 |

---

## 상태 전이

### Draft → In Review

```yaml
transition:
  from: "Draft"
  to: "In Review"

  trigger:
    - manual: "작성자가 리뷰 요청"
    - automatic: "완성도 체크리스트 100% 충족"

  conditions:
    - required_fields_filled: true
    - owner_assigned: true

  actions:
    - notify_reviewers
    - lock_structure  # 구조 변경 제한

  reversible: true
```

### In Review → Ready for Official

```yaml
transition:
  from: "In Review"
  to: "Ready for Official"

  trigger:
    - approval_count: ">= 1"
    - no_open_comments: true

  conditions:
    - all_suggestions_resolved: true
    - owner_final_approval: true

  actions:
    - add_tag: "for-github"
    - lock_content
    - notify_owner: "승격 준비 완료"

  reversible: true  # Revision Needed로 돌아갈 수 있음
```

### Ready for Official → Pending Sync

```yaml
transition:
  from: "Ready for Official"
  to: "Pending Sync"

  trigger:
    - automatic: "승격 조건 충족 감지"
    - manual: "관리자 수동 트리거"

  conditions:
    - status: "Ready for Official"
    - tag_includes: "for-github"
    - minimum_age: "7 days since draft"

  actions:
    - start_sync_process
    - create_github_pr

  reversible: false  # 동기화 시작 후 취소 불가
```

### Pending Sync → Official

```yaml
transition:
  from: "Pending Sync"
  to: "Official"

  trigger:
    - github_pr_merged: true

  conditions:
    - pr_approved: true
    - ci_passed: true

  actions:
    - update_notion_status: "Official"
    - add_github_url: "PR URL"
    - update_last_synced: "now()"
    - make_read_only: true
    - notify_stakeholders: "공식 문서로 등록되었습니다"

  reversible: false
```

---

## 업데이트 플로우

### 공식 문서 수정이 필요할 때

```
방법 1: GitHub에서 직접 수정
─────────────────────────────
1. GitHub에서 파일 수정 또는 브랜치 생성
2. PR 생성
3. 리뷰 및 승인
4. 머지
5. Notion Hub 자동 업데이트 (읽기 전용 뷰)

방법 2: Notion에서 새 버전 생성
──────────────────────────────
1. Official 문서 복제
2. 복제본을 Draft로 설정
3. 수정 작업
4. 리뷰 및 승인
5. Ready for Official
6. GitHub PR 생성 (기존 파일 업데이트)
7. 머지 후 기존 Official 문서를 새 버전으로 교체
```

### 버전 관리

```yaml
versioning:
  schema: "SemVer"  # MAJOR.MINOR.PATCH

  rules:
    patch:
      - "오타 수정"
      - "문구 개선"
      - "링크 수정"

    minor:
      - "단계 추가"
      - "예외 케이스 추가"
      - "관련 리소스 추가"

    major:
      - "프로세스 전면 개편"
      - "승인 흐름 변경"
      - "담당 Function 변경"

  changelog:
    location: "문서 하단 '변경 이력' 섹션"
    format: |
      | 버전 | 날짜 | 변경 내용 | 작성자 |
```

---

## 폐기 플로우

### Deprecation

```yaml
deprecation:
  trigger:
    - manual: "Owner가 폐기 요청"
    - automatic: "대체 문서가 Official로 승격"

  process:
    1. GitHub에서 status → deprecated 변경
    2. deprecation_notice 추가:
       "⚠️ 이 문서는 폐기 예정입니다. 대체 문서: [링크]"
    3. Notion에 deprecation 표시
    4. 30일 유예 기간
    5. 유예 기간 후 Archived로 이동

  exceptions:
    - "활발히 참조되는 경우 유예 기간 연장"
    - "법적 보관 필요 문서는 Archived에서도 유지"
```

### 완전 삭제

```yaml
archival:
  conditions:
    - deprecated_for: ">= 30 days"
    - no_recent_references: true
    - owner_approval: true

  actions:
    - move_to: "/archived/{year}/"
    - update_notion: "Archived"
    - retain_git_history: true  # 완전 삭제 아님
```

---

## 역할별 권한

### 라이프사이클 권한 매트릭스

| 역할 | Draft→Review | Review→Ready | Ready→Sync | Deprecate |
|------|-------------|--------------|------------|-----------|
| 작성자 | ✅ | ❌ | ❌ | ❌ |
| 리뷰어 | ❌ | ✅ | ❌ | ❌ |
| Function Owner | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ |

---

## 자동화 규칙

### Notion Automation

```yaml
notion_automations:
  - name: "Draft 7일 경과 알림"
    trigger:
      type: "schedule"
      condition: "Status = Draft AND created_time < 7 days ago"
    action:
      - notify_owner: "초안 작성 후 7일이 경과했습니다. 리뷰를 진행해주세요."

  - name: "리뷰 완료 시 상태 변경"
    trigger:
      type: "property_change"
      condition: "Reviewed By가 1명 이상 추가됨"
    action:
      - update_status: "In Review"

  - name: "승인 완료 시 태그 추가"
    trigger:
      type: "property_change"
      condition: "All required approvals completed"
    action:
      - add_tag: "for-github"
      - update_status: "Ready for Official"
```

### GitHub Actions

```yaml
github_automations:
  - name: "PR 자동 라벨링"
    trigger: "PR created from sync/"
    action:
      - add_labels: ["sync", "auto-generated"]

  - name: "머지 후 Notion 업데이트"
    trigger: "PR merged to main"
    action:
      - update_notion_status: "Official"
      - add_github_url
      - notify_slack

  - name: "Deprecated 문서 정리"
    trigger: "schedule: monthly"
    action:
      - find_deprecated_over_30_days
      - create_archival_pr
```

---

## 모니터링

### 라이프사이클 메트릭

| 메트릭 | 설명 | 목표 |
|--------|------|------|
| Draft→Official 소요 시간 | 평균 승격 소요 시간 | < 14일 |
| 리뷰 대기 시간 | 리뷰 요청 후 첫 리뷰까지 | < 2일 |
| PR 머지 시간 | PR 생성 후 머지까지 | < 3일 |
| Deprecated 문서 수 | 폐기 예정 문서 | 최소화 |
| Orphan 문서 수 | 연결 끊긴 문서 | 0 |

### 대시보드

```
┌─────────────────────────────────────────────────────────────┐
│              Document Lifecycle Dashboard                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Status Distribution:                                       │
│  ████████████ Draft (15)                                   │
│  ██████ In Review (8)                                      │
│  ██ Ready (3)                                              │
│  ████████████████████████████ Official (42)                │
│  ██ Deprecated (2)                                         │
│                                                             │
│  Average Time to Official: 12 days                         │
│  Documents Awaiting Review: 5                               │
│  Pending PRs: 2                                             │
│                                                             │
│  Recent Activity:                                           │
│  • sop-brand-brief → Official (2h ago)                     │
│  • policy-expense → In Review (1d ago)                     │
│  • sop-hr-leave → Deprecated (3d ago)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
