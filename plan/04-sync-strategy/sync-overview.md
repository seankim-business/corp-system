# 동기화 전략 개요

## 원칙

```
GitHub = Single Source of Truth (SSOT)
Notion/Drive = Working Copy (업무 실행 UI)
```

GitHub에 있는 것이 공식이며, Notion/Drive는 업무 실행을 위한 인터페이스입니다.

---

## 동기화 방향

### 단방향 동기화 (Primary)

```
Notion/Drive → GitHub (승격)
─────────────────────────────
  문서가 안정화되면 GitHub으로 승격

GitHub → Notion/Drive (배포)
─────────────────────────────
  공식 문서를 읽기용으로 배포
```

### 동기화 흐름도

```
┌─────────────────────────────────────────────────────────────────┐
│                         WORKING AREA                            │
│                                                                 │
│    ┌─────────────┐              ┌─────────────┐                │
│    │   Notion    │              │   Google    │                │
│    │  (Wiki,     │              │   Drive     │                │
│    │   Tasks,    │              │  (Sheets,   │                │
│    │   Drafts)   │              │   Docs)     │                │
│    └──────┬──────┘              └──────┬──────┘                │
│           │                            │                        │
└───────────┼────────────────────────────┼────────────────────────┘
            │                            │
            │ 승격 조건 충족              │ 승격 조건 충족
            │                            │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SYNC LAYER                                │
│                                                                 │
│    ┌─────────────────────────────────────────────────────────┐ │
│    │                    Sync Agent                           │ │
│    │  • 변경 감지 (Webhook / Polling)                         │ │
│    │  • 승격 조건 검증                                         │ │
│    │  • 포맷 변환 (→ Markdown/YAML)                           │ │
│    │  • PR 생성                                               │ │
│    │  • 충돌 감지 및 알림                                      │ │
│    └─────────────────────────────────────────────────────────┘ │
│                              │                                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               │ PR 생성
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SSOT (GitHub Monorepo)                       │
│                                                                 │
│    ┌─────────────────────────────────────────────────────────┐ │
│    │                    main branch                          │ │
│    │                                                         │ │
│    │  /sops   /skills   /docs   /org   /agents               │ │
│    └─────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              │ Merge 후                         │
│                              ▼                                  │
│    ┌─────────────────────────────────────────────────────────┐ │
│    │              Read-Only View Sync                        │ │
│    │          (GitHub → Notion Hub 배포)                      │ │
│    └─────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 승격 기준

### Notion → GitHub 승격 조건

| 조건 | 설명 | 검증 방법 |
|------|------|----------|
| **상태** | "Ready for Official" 상태 | Notion Status 필드 |
| **태그** | "for-github" 태그 포함 | Notion Tags 필드 |
| **소유자** | Function Owner가 지정됨 | Notion Owner 필드 |
| **최소 기간** | Draft 후 최소 7일 경과 | Created Date 비교 |
| **승인** | 최소 1명 이상 리뷰 완료 | Notion Reviewers 필드 |

### Drive → GitHub 승격 조건

| 조건 | 설명 | 검증 방법 |
|------|------|----------|
| **폴더** | "Official" 폴더에 위치 | 폴더 경로 |
| **네이밍** | `[OFFICIAL]` 접두사 | 파일명 |
| **형식** | 지원 형식 (Sheet, Doc) | MIME 타입 |
| **권한** | 편집 잠금 상태 | Drive 권한 |

---

## 데이터 매핑

### Notion → GitHub

| Notion 타입 | GitHub 타입 | 디렉토리 |
|------------|------------|----------|
| SOP 페이지 | Markdown (.md) | `/sops/{function}/` |
| Policy 페이지 | Markdown (.md) | `/docs/policies/` |
| Skill 정의 | YAML (.yml) | `/skills/{function}/` |
| Function 정의 | YAML (.yml) | `/org/functions/` |
| 일반 문서 | Markdown (.md) | `/docs/{category}/` |

### Drive → GitHub

| Drive 타입 | GitHub 타입 | 디렉토리 |
|-----------|------------|----------|
| Spreadsheet (정책) | Markdown 테이블 | `/docs/policies/` |
| Spreadsheet (템플릿) | CSV 또는 YAML | `/templates/` |
| Document | Markdown (.md) | `/docs/` |

---

## 동기화 전략

### 이벤트 기반 (Primary)

```yaml
event_based_sync:
  notion:
    trigger: "Webhook (페이지 업데이트)"
    latency: "< 5분"
    conditions:
      - status_changed_to: "Ready for Official"
      - tag_added: "for-github"

  drive:
    trigger: "Drive API Watch"
    latency: "< 10분"
    conditions:
      - moved_to_folder: "Official"
      - renamed_with_prefix: "[OFFICIAL]"
```

### 배치 기반 (Backup)

```yaml
batch_sync:
  schedule: "매일 03:00 KST"

  tasks:
    - name: "전체 상태 검증"
      action: "Notion/Drive와 GitHub 간 불일치 검사"

    - name: "Orphan 정리"
      action: "GitHub에만 있고 소스가 삭제된 문서 감지"

    - name: "버전 동기화"
      action: "버전 번호 일관성 검증"
```

---

## 충돌 처리

### 충돌 유형

| 유형 | 상황 | 해결 방법 |
|------|------|----------|
| **동시 수정** | Notion과 GitHub에서 동시에 수정 | GitHub 우선, 알림 발송 |
| **삭제 충돌** | 한쪽에서 삭제, 다른 쪽에서 수정 | 수정 내용 보존, 알림 |
| **구조 충돌** | frontmatter 스키마 불일치 | 검증 실패, PR 블록 |

### 충돌 해결 플로우

```
충돌 감지
    │
    ▼
┌─────────────────┐
│ 자동 해결 가능? │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
   Yes        No
    │         │
    ▼         ▼
┌────────┐ ┌────────────┐
│ 자동   │ │ 알림 발송  │
│ 머지   │ │ (Owner에게)│
└────────┘ └─────┬──────┘
                 │
                 ▼
          ┌────────────┐
          │ 수동 해결  │
          │ PR 생성    │
          └────────────┘
```

---

## 민감 정보 처리

### 필터링 규칙

```yaml
sensitive_data_filter:
  # 자동 필터링
  patterns:
    - type: "email"
      action: "mask"  # john@company.com → j***@company.com

    - type: "phone"
      action: "remove"

    - type: "api_key"
      pattern: "(?i)(api[_-]?key|secret)[\"']?\\s*[:=]\\s*[\"']?[a-z0-9]+"
      action: "remove_line"

  # 태그 기반 제외
  excluded_tags:
    - "confidential"
    - "internal-only"
    - "no-sync"

  # 폴더 기반 제외
  excluded_folders:
    notion:
      - "HR Confidential"
      - "Legal Internal"
    drive:
      - "Confidential"
      - "Private"
```

### 마스킹 예시

```
Before: 담당자 연락처: 010-1234-5678
After:  담당자 연락처: [REDACTED]

Before: API_KEY=sk_live_abc123...
After:  [LINE REMOVED - SENSITIVE DATA]
```

---

## 동기화 모니터링

### 메트릭

| 메트릭 | 설명 | 알림 조건 |
|--------|------|----------|
| sync_latency | 동기화 지연 시간 | > 30분 |
| sync_failures | 동기화 실패 횟수 | > 3회/시간 |
| conflict_count | 충돌 발생 횟수 | > 0 |
| pending_prs | 대기 중인 PR 수 | > 5 |

### 대시보드

```
┌─────────────────────────────────────────────────────────────┐
│                    Sync Status Dashboard                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Last Sync: 2025-01-25 10:30:00 KST                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Notion     │  │    Drive     │  │   Pending    │      │
│  │   ✅ OK      │  │   ✅ OK      │  │   PRs: 2     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  Recent Activity:                                           │
│  • sop-brand-campaign-brief.md synced (5 min ago)          │
│  • doc-policy-expense.md synced (1 hour ago)               │
│  • ⚠️ conflict detected: skill-hr-leave.yml                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 롤백

### 롤백 시나리오

| 상황 | 롤백 방법 |
|------|----------|
| 잘못된 동기화 | Git revert → Notion/Drive 수동 복구 |
| 데이터 손실 | Git history에서 복원 |
| 대량 오류 | 배치 실행 전 스냅샷에서 복원 |

### 롤백 절차

```
1. 문제 PR 식별
2. Git revert 실행
3. 영향받은 Notion/Drive 페이지 상태 변경 (→ "Needs Review")
4. 알림 발송
5. 수동 검토 후 재동기화
```
