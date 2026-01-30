# Multi-Agent Coordination Protocol

> **MANDATORY**: 모든 에이전트는 작업 시작 전 이 프로토콜을 따라야 함

---

## Quick Start (30초 체크리스트)

```bash
# 1. 현황판 확인
cat .omc/AGENT_BOARD.md

# 2. 내 작업 대상 파일이 잠겨있는지 확인
# File Lock Registry 테이블 참조

# 3. 없으면 등록하고 작업 시작
```

---

## Step-by-Step Protocol

### Phase 1: Pre-Work Check

1. **Read Agent Board**

   ```
   File: .omc/AGENT_BOARD.md
   Check: "Active Agents" table
   Check: "File Lock Registry" table
   ```

2. **Verify No Conflicts**
   - 내가 수정할 파일이 다른 에이전트에 의해 lock 되어있는지 확인
   - Lock 있으면 → 해당 에이전트 task 완료까지 대기 or 조율

3. **Register Self**
   - "Active Agents" 테이블에 추가:
     ```markdown
     | `my-agent-id` | 작업 설명 | `file1.ts`, `file2.ts` | **WORKING** | HH:MM |
     ```
   - "File Lock Registry"에 lock 추가 (필요시)

### Phase 2: During Work

1. **Respect Locks**
   - 다른 에이전트가 lock한 파일 수정 금지
   - 긴급시 user에게 escalate

2. **Heartbeat** (30분+ 작업시)
   - 15-30분마다 status 업데이트
   - `lastHeartbeat` 갱신 (JSON 파일)

3. **Conflict Detection**
   - Git status 확인으로 unexpected changes 감지
   - 충돌 발견시 즉시 중단 & 보고

### Phase 3: Post-Work

1. **Move to Completed**
   - "Active Agents" → "Recently Completed" 이동

2. **Release Locks**
   - "File Lock Registry"에서 내 lock 제거

3. **Update Timestamp**
   - `Last Updated` 갱신

---

## File Paths

| File                          | Purpose               | Format   |
| ----------------------------- | --------------------- | -------- |
| `.omc/AGENT_BOARD.md`         | Human-readable 현황판 | Markdown |
| `.omc/state/agent-board.json` | Machine-readable 상태 | JSON     |

---

## Conflict Resolution Matrix

| Situation                  | Action                    |
| -------------------------- | ------------------------- |
| 내 파일이 locked           | 대기 or 다른 작업 먼저    |
| Lock expired (1시간+)      | Lock 해제 가능, 주의 필요 |
| 두 에이전트 동시 lock 시도 | 먼저 등록한 쪽 우선       |
| Deadlock                   | User에게 escalate         |

---

## Agent ID Convention

```
{type}-{context}

Examples:
- sisyphus-main      # Main orchestrator
- executor-slack-01  # Slack 관련 executor
- explore-arch       # Architecture exploration
- designer-ui-01     # UI work
```

---

## Emergency Procedures

### 1. Agent Crash

다른 에이전트가 이 에이전트의 orphaned lock을 발견하면:

- 1시간 이상 heartbeat 없음 → lock 해제 가능
- 작업 결과물 확인 필요

### 2. File Corruption

- Git으로 즉시 revert
- 해당 파일 lock
- User에게 보고

### 3. Merge Conflict

- 양쪽 에이전트 작업 중단
- User가 수동 resolve
- Resolve 후 작업 재개

---

## Integration with Git

```bash
# 작업 시작 전
git status  # clean state 확인
git pull    # latest 확인

# 작업 후 (commit 전)
git diff    # 변경사항 확인
# Agent Board 업데이트

# Commit message convention
git commit -m "[agent-id] task description"
```

---

**Remember**: 이 프로토콜은 협업 효율성을 위한 것.
엄격한 규칙보다 **소통과 조율**이 더 중요함.
