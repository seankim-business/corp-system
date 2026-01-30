# QA/QC Verification Runbook

## Overview

This runbook documents verification procedures for the Nubabel OMC + Claude Max integration using:

- Slack #it-test channel with @Nubabel mention
- Claude in Chrome browser for visual verification

## Prerequisites

1. **Slack Setup**
   - Bot installed in workspace with #it-test channel access
   - Bot has `app_mentions:read`, `chat:write` scopes
   - Socket Mode enabled with valid app token

2. **Claude Max Accounts**
   - At least one Claude Max account configured in database
   - Account has valid credentials stored

3. **Environment**
   - Application deployed to Railway
   - Database migrations applied
   - Redis running

## Verification Tests

### 1. Slack Bot Basic Functionality

**Test**: Bot responds to mentions

```
@Nubabel hello
```

**Expected**: Bot acknowledges with greeting

**Test**: Help command

```
@Nubabel /qa:help
```

**Expected**: List of available QA commands

### 2. Claude Max Account Pool Status

**Test**: Check pool status

```
@Nubabel /qa:status
```

**Expected**: Block Kit formatted response showing:

- Number of active accounts
- Average usage percentage
- Any accounts in cooldown

**Test**: List all accounts

```
@Nubabel /qa:accounts
```

**Expected**: Table showing each account with:

- Nickname
- Status (active/rate_limited/exhausted/cooldown)
- Usage percentage
- Cooldown remaining (if any)

### 3. Agent Execution Test

**Test**: Run test prompt

```
@Nubabel /qa:test What is 2+2?
```

**Expected**:

1. Account selection notification
2. Agent activity updates in thread
3. Final response with answer

### 4. Health Check

**Test**: System health

```
@Nubabel /qa:health
```

**Expected**: Status report showing:

- 🟢 PostgreSQL: healthy
- 🟢 Redis: healthy
- 🟢 Bull Queues: healthy
- 🟢 SSE: connected

### 5. Web Dashboard Verification

**Location**: https://auth.nubabel.com/agent-activity

**Visual Checks**:

1. ✅ SSE connection indicator shows "Live" (green)
2. ✅ Agent Hierarchy panel visible (left)
3. ✅ Event Feed panel visible (center)
4. ✅ Claude Max Pool panel visible (right)
5. ✅ Filter buttons work correctly

**Interactive Checks**:

1. Trigger a test from Slack: `@Nubabel /qa:test hello`
2. Watch Agent Activity page for:
   - New agent appearing in hierarchy
   - Progress updates in event feed
   - Account selection in pool panel

### 6. Account Rotation Test

**Test**: Exhaust one account, verify rotation

```
@Nubabel /qa:test [long prompt that triggers rate limit]
```

**Expected**:

1. First account hits rate limit
2. System automatically selects next available account
3. Slack notification shows account switch
4. Request completes with different account

### 7. Error Handling

**Test**: Invalid command

```
@Nubabel /qa:invalid
```

**Expected**: Helpful error message with valid commands

**Test**: No available accounts

```
(All accounts in cooldown)
@Nubabel /qa:test hello
```

**Expected**: Error message indicating no accounts available

## Chrome Browser Verification

### Using Claude in Chrome

1. Open Chrome DevTools (F12)
2. Go to Network tab
3. Navigate to Agent Activity page
4. Verify SSE connection:
   - Look for `/api/events` request
   - Status should be "pending" (streaming)
   - EventStream tab shows incoming events

### Visual Verification Checklist

```
[ ] Page loads without console errors
[ ] SSE connection established within 3 seconds
[ ] Three-column layout renders correctly
[ ] Agent tree shows "No active agents" initially
[ ] Pool panel shows configured accounts
[ ] Event feed updates when agents run
[ ] Filters correctly filter events
[ ] Session selector works (if multiple sessions)
```

## Automated E2E Tests

Run Playwright tests:

```bash
npx playwright test src/__tests__/e2e/claude-max-integration.test.ts
```

Expected results:

- All tests pass
- Response times under 5 seconds
- No authentication errors (for public endpoints)

## Troubleshooting

### Bot Not Responding

1. Check Socket Mode connection:
   ```bash
   railway logs --service nubabel | grep "Slack Bot"
   ```
2. Verify app token in environment
3. Check bot is in the channel

### SSE Not Connecting

1. Check CORS settings
2. Verify Redis pub/sub working
3. Check authentication cookies

### Account Pool Empty

1. Verify accounts in database:
   ```sql
   SELECT nickname, status, estimated_usage_percent
   FROM claude_max_accounts;
   ```
2. Check cooldown timestamps
3. Verify organization ID matches

### Agents Not Showing

1. Check AgentActivity table:
   ```sql
   SELECT * FROM agent_activities
   ORDER BY created_at DESC LIMIT 10;
   ```
2. Verify SSE event emission
3. Check frontend console for errors

## Sign-Off

After completing all verifications:

| Test                | Passed | Notes |
| ------------------- | ------ | ----- |
| Slack Bot Basic     | ☐      |       |
| Account Pool Status | ☐      |       |
| Agent Execution     | ☐      |       |
| Health Check        | ☐      |       |
| Web Dashboard       | ☐      |       |
| Account Rotation    | ☐      |       |
| Error Handling      | ☐      |       |
| E2E Tests           | ☐      |       |

**Verified By**: ******\_\_\_******
**Date**: ******\_\_\_******
**Environment**: ☐ Staging ☐ Production
