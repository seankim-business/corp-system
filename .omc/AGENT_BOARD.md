# Agent Coordination Board

> **Last Updated**: 2026-01-30 17:16 KST
> **Purpose**: 멀티 에이전트 작업 현황 추적 및 충돌 방지

---

## Active Agents

| Agent ID          | Task                                  | Files Being Modified                                                                                          | Status      | Started |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- | ------- |
| `sisyphus-n8n-01` | Add n8n instance provisioning service | `src/services/n8n/instance-provisioner.ts`, `src/services/n8n/index.ts`, `src/services/encryption.service.ts` | **WORKING** | 14:20   |
| `sisyphus-n8n-02` | Add n8n credential sync service       | `src/services/n8n/credential-sync.ts`                                                                         | **WORKING** | 14:50   |
| `sisyphus-n8n-03` | Add n8n workflow generator service    | `src/services/n8n/workflow-generator.ts`, `src/api/n8n.ts`                                                    | **WORKING** | 17:12   |
| `sisyphus-sop-01` | Add SOP ↔ n8n converter               | `src/services/n8n/sop-converter.ts`, `src/services/n8n/index.ts`                                              | **WORKING** | 17:13   |
| `sisyphus-n8n-04` | Add n8n skill adapter + API endpoints | `src/services/n8n/skill-adapter.ts`, `src/services/n8n/index.ts`, `src/api/n8n.ts`                            | **WORKING** | 17:14   |

---

## File Lock Registry

> 파일 수정 전 여기서 lock 여부 확인. 충돌 시 기존 에이전트와 조율 필요.

| File/Directory                             | Locked By         | Reason                    | Until |
| ------------------------------------------ | ----------------- | ------------------------- | ----- |
| `.env`                                     | -                 | -                         | -     |
| `src/api/slack*.ts`                        | -                 | -                         | -     |
| `src/services/n8n/instance-provisioner.ts` | `sisyphus-n8n-01` | n8n instance provisioning | 15:20 |
| `src/services/n8n/index.ts`                | `sisyphus-n8n-04` | n8n skill adapter export  | 18:30 |
| `src/services/encryption.service.ts`       | `sisyphus-n8n-01` | n8n instance provisioning | 15:20 |
| `src/services/n8n/credential-sync.ts`      | `sisyphus-n8n-02` | n8n credential sync       | 15:50 |
| `src/services/n8n/workflow-generator.ts`   | `sisyphus-n8n-03` | workflow generator        | 18:12 |
| `src/api/n8n.ts`                           | `sisyphus-n8n-04` | n8n skill endpoints       | 18:30 |
| `src/services/n8n/sop-converter.ts`        | `sisyphus-sop-01` | SOP converter             | 18:13 |
| `src/services/n8n/skill-adapter.ts`        | `sisyphus-n8n-04` | n8n skill adapter         | 18:30 |

---

## Recently Completed

| Agent ID           | Task                                       | Files Modified                                                                                          | Completed |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------- |
| `sisyphus-main`    | **Next Phase Complete** - 9 tasks (T3-T12) | ai-executor.ts, slack-progress.service.ts, docs/, tests/                                                | 14:45     |
| `sisyphus-main`    | **Phase 3 Complete** - All P0/P1 tasks     | Multiple files - see git diff                                                                           | 13:57     |
| `executor-aed59b5` | P0-3: LLM Fallback Intent Detection        | `src/orchestrator/intent-detector.ts`, `src/orchestrator/ambiguity-detector.ts`, tests & examples       | 11:20     |
| `sisyphus-main`    | Slack credentials 테스트 환경 설정         | `.env`, `.env.slack.local`, `.env.example`                                                              | 10:35     |
| `executor-a7af`    | P0-2: Enhance Result Aggregator            | `src/orchestrator/result-aggregator.ts`, `src/__tests__/orchestrator/result-aggregator.test.ts`         | 11:05     |
| `executor-ac82`    | P1-1: GitHub PR Tracking                   | `src/api/org-changes.ts`, `src/services/org-change-tracker.ts`, `frontend/src/pages/OrgChangesPage.tsx` | 11:15     |

---

## Coordination Rules

### 1. Before Starting Work

```
1. Read this file
2. Check if target files are locked
3. Add your entry to "Active Agents" table
4. Add file locks to "File Lock Registry"
5. Begin work
```

### 2. During Work

```
- Update status periodically (every 15-30 min for long tasks)
- If you need a file that's locked, coordinate with the locking agent
- Use git branches if possible for isolated changes
```

### 3. After Completing Work

```
1. Move entry from "Active Agents" to "Recently Completed"
2. Remove file locks
3. Update "Last Updated" timestamp
```

### 4. Conflict Resolution

```
Priority Order:
1. Agent that locked first has priority
2. If unclear, smaller/faster task yields to larger task
3. Escalate to user if deadlock
```

---

## Agent Naming Convention

| Prefix        | Meaning                      |
| ------------- | ---------------------------- |
| `sisyphus-*`  | Main orchestrator agents     |
| `executor-*`  | Code modification agents     |
| `explore-*`   | Read-only exploration agents |
| `designer-*`  | UI/Frontend agents           |
| `architect-*` | Analysis/planning agents     |

---

## Notes

- 이 파일은 `.omc/` 디렉토리에 있어 gitignore 대상 아님
- 모든 에이전트는 작업 시작/종료 시 이 파일 업데이트 필수
- 긴 작업(30분+)은 중간 status update 권장
