# Plan: Fix "Nubabel user not found" Error

## Problem Statement

When user 선빈 Seonbin mentions @Nubabel in Slack and asks "Who am I?", the bot returns:
```
Nubabel user not found. Please login first at https://nubabel.com
```

This happens even after circuit breaker reset (07:25 UTC restart).

## Diagnostic Data (Gathered via Railway Logs)

**Seonbin's Identity:**
- Slack User ID: `U03KQMR2XH7`
- Slack Team/Workspace ID: `T03KC04T1GT`
- Nubabel User ID: `65879e78-b94a-42ec-b1ec-3aa5bbcb1aa5`
- ExternalIdentity ID: `77b2ac9d-1c2e-42fa-80c6-06b078f111e4`
- Organization ID: `b2e9db62-9c4a-4aac-b996-9346a08ebad8`
- Link Status: `already_linked` (confirmed at 12:05:18 UTC sync)

**Key Finding:** User IS properly linked in the database. The emergency sync at 12:05:18 UTC shows:
```
[INFO] Updating existing SlackUser {"slackUserId":"U03KQMR2XH7","slackTeamId":"T03KC04T1GT","userId":"65879e78-b94a-42ec-b1ec-3aa5bbcb1aa5"}
[INFO] ExternalIdentity sync completed {"slackUserId":"U03KQMR2XH7","action":"already_linked","linkedUserId":"65879e78-b94a-42ec-b1ec-3aa5bbcb1aa5","externalIdentityId":"77b2ac9d-1c2e-42fa-80c6-06b078f111e4"}
```

## Root Cause Analysis

### The User Lookup Flow

```
1. app_mention event received
2. Get workspaceId from Slack API
3. getOrganizationBySlackWorkspace(workspaceId) → Organization
4. runWithoutRLS(() => {
     a. Get Slack user profile via client.users.info()
     b. provisionSlackUser() → Creates/updates SlackUser + syncs to ExternalIdentity
     c. getUserBySlackId() → 3-tier lookup:
        - Method 1: SlackUser table (slackUserId → user relation)
        - Method 2: ExternalIdentity table (organizationId + provider + providerUserId)
        - Method 3: Email lookup from Slack profile → User table
   })
5. If all 3 methods return null → "Nubabel user not found"
```

### Why "User Not Found" Despite Being Linked

Given that Seonbin IS in the database and linked, the error must be caused by one of these runtime issues:

#### Scenario A: Timing Issue - Sync Not Yet Deployed
The error at 9:02 PM user time may have occurred BEFORE the 12:05:18 UTC sync completed. After the emergency sync, the user should be found.

**Verification:** Have user retry @Nubabel "Who am I?" now.

#### Scenario B: Query Returning Null Despite Data Existing
Possible causes:
1. **RLS blocking the query** - even with `runWithoutRLS()`, nested calls might lose bypass flag
2. **Prisma relation not loading** - `include: { user: true }` might fail silently
3. **Different organizationId** being used in lookup vs. where data is stored

#### Scenario C: Error in provisionSlackUser() Swallowed
**Location:** `src/api/slack.ts:455-462`
```typescript
} catch (provisionError) {
  logger.error("Failed to provision Slack user", {...});
  // Continue anyway - getUserBySlackId may still find the user
}
```
If provisioning fails AND getUserBySlackId also fails, user not found.

### linkStatus Semantics (Architect Clarification)

Per Architect analysis, the valid state combinations are:

| linkStatus | userId | Valid? | Meaning |
|------------|--------|--------|---------|
| `unlinked` | NULL | ✓ | Fresh/unlinked identity |
| `suggested` | NULL | ✓ | Pending admin review |
| `linked` | UUID | ✓ | Fully linked |
| `unlinked`/`suggested` | UUID | ✗ | Data corruption |

**Current Method 2 behavior** (`slack-service.ts:82-87`):
```typescript
if (externalIdentity?.user) {
  return externalIdentity.user;
}
```
This returns user if `userId` is set, regardless of `linkStatus`. This is **technically incorrect** but **practically safe** because the `IdentityLinker` always sets both atomically.

**Recommended:** Add defensive check for explicit semantics:
```typescript
if (externalIdentity?.user && externalIdentity.linkStatus === "linked") {
  return externalIdentity.user;
}
```

## Recommended Fixes (Priority Ordered)

### Fix 1: Verify Current State (Immediate - 0 risk)
Have user retry @Nubabel mention now that sync has completed.

**Test Command:** In #it-test channel: `@Nubabel Who am I?`

**Expected:** Bot should now recognize user and respond with identity.

### Fix 2: Add Detailed Diagnostic Logging (Low risk)
**File:** `src/services/slack-service.ts`

Add logging to each method to understand exactly where lookup fails:

```typescript
// After Method 1 lookup (line 44)
logger.info("Method 1 - SlackUser lookup result", {
  slackUserId,
  found: !!slackUserRecord,
  hasUser: !!slackUserRecord?.user,
  userId: slackUserRecord?.user?.id,
  slackUserRecordUserId: slackUserRecord?.userId,
});

// After Method 2 lookup (line 72-80)
logger.info("Method 2 - ExternalIdentity lookup result", {
  slackUserId,
  organizationId,
  found: !!externalIdentity,
  linkStatus: externalIdentity?.linkStatus,
  userId: externalIdentity?.userId,
  hasUser: !!externalIdentity?.user,
});
```

**Note:** This logging already exists in current code at lines 36-44 and 72-80!

### Fix 3: Add Defensive linkStatus Check (Medium risk)
**File:** `src/services/slack-service.ts:82-87`

Change:
```typescript
if (externalIdentity?.user) {
  return externalIdentity.user;
}
```

To:
```typescript
if (externalIdentity?.user && externalIdentity.linkStatus === "linked") {
  logger.info("User found via ExternalIdentity", {
    slackUserId,
    userId: externalIdentity.user.id,
    linkStatus: externalIdentity.linkStatus,
  });
  return externalIdentity.user;
} else if (externalIdentity && externalIdentity.linkStatus !== "linked") {
  logger.warn("ExternalIdentity exists but not linked", {
    slackUserId,
    linkStatus: externalIdentity.linkStatus,
    userId: externalIdentity.userId,
  });
}
```

**Rationale:** Makes semantics explicit, catches data corruption, aligns with `identity-resolver.ts:126-136`.

### Fix 4: Verify RLS Bypass Propagates Correctly (Investigation)
Check if nested `runWithoutRLS()` calls properly maintain bypass flag.

**File:** `src/utils/async-context.ts`

Verify the AsyncLocalStorage maintains the bypass flag through the entire lookup chain.

## Acceptance Criteria

1. ✅ Seonbin's data IS in database (verified via logs)
2. [ ] Seonbin can mention @Nubabel and get correct identity response
3. [ ] All three lookup methods work correctly
4. [ ] Detailed logging captures each lookup step
5. [ ] linkStatus check is explicit and defensive

## Implementation Steps

1. [ ] **Test First:** Have user retry @Nubabel "Who am I?" to verify if sync fixed it
2. [ ] If still failing, check Railway logs for the Method 1/2/3 lookup results
3. [ ] If Method 1 or 2 fails despite data existing, investigate RLS bypass
4. [ ] Deploy defensive linkStatus check (Fix 3)
5. [ ] Re-test and verify

## Files to Modify

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/services/slack-service.ts` | Enhancement | Add defensive linkStatus check at line 82 |

## Risk Assessment

- **Fix 1 (Test)**: Zero risk - just retry
- **Fix 2 (Logging)**: Zero risk - logging already exists
- **Fix 3 (linkStatus check)**: Low risk - makes behavior more strict, which is safer
- **Fix 4 (RLS investigation)**: No code change, just investigation

## Test Plan

1. Have Seonbin retry @Nubabel "Who am I?" in #it-test
2. Check Railway logs for the lookup flow
3. Verify each method's result in logs
4. If Fix 3 deployed, test with both linked and unlinked users
5. Confirm no regression for other Slack users
