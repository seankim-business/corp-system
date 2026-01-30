# Identity Linking Migration - Rollback Strategy

**Last Updated**: January 30, 2026
**Status**: Ready for Implementation
**Migration Type**: SlackUser → ExternalIdentity

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Migration Checklist](#pre-migration-checklist)
3. [Rollback Scenarios](#rollback-scenarios)
4. [Rollback Commands](#rollback-commands)
5. [Monitoring During Migration](#monitoring-during-migration)
6. [Deprecation Timeline](#deprecation-timeline)
7. [Testing & Verification](#testing--verification)

---

## 1. Overview

### Migration Scope

The identity linking migration consolidates user identity management across multiple external providers (Slack, Google, Notion) into a unified `external_identities` table, replacing the current `slack_users` table-based approach.

**Key Changes**:
- **Old Model**: `SlackUser` table storing `slackUserId → userId` mappings
- **New Model**: `ExternalIdentity` table supporting multiple providers with flexible linking logic
- **Features**: Auto-linking, fuzzy name matching, admin management, audit trails

### Why Rollback Might Be Needed

| Scenario | Likelihood | Impact |
| -------- | ---------- | ------ |
| Critical data loss | Low | Complete service failure |
| Linking logic errors | Medium | Broken identity resolution |
| Performance degradation | Low-Medium | Query/response timeouts |
| Third-party integration issues | Medium | Integration failures |
| User authentication failures | Medium | Users cannot access system |

### Rollback Decision Matrix

| Condition | Action |
| --------- | ------ |
| <1% links failed | Continue, monitor closely |
| 1-5% links failed | Investigate, consider partial rollback |
| >5% links failed | **PAUSE, investigate, rollback if root cause unfixable** |
| Data inconsistency detected | **IMMEDIATE ROLLBACK** |
| Auth failures >0.1% | **IMMEDIATE ROLLBACK** |
| Query performance >3x slower | Investigate, may rollback if unfixable |

---

## 2. Pre-Migration Checklist

### 2.1 Database Backups

Before running any migration:

```bash
# 1. Create full database backup (at least 24 hours before migration)
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --format=custom --file=backup-pre-identity-migration-$(date +%Y%m%d).dump

# 2. Store backup in secure location (S3, encrypted storage)
aws s3 cp backup-pre-identity-migration-*.dump \
  s3://backups/database/pre-migration/ \
  --sse=AES256

# 3. Verify backup integrity
pg_restore -l backup-pre-identity-migration-*.dump | head -20

# 4. Document backup details
echo "Backup created: backup-pre-identity-migration-$(date +%Y%m%d).dump" >> migration-log.txt
echo "Size: $(du -h backup-pre-identity-migration-*.dump)" >> migration-log.txt
echo "MD5: $(md5sum backup-pre-identity-migration-*.dump)" >> migration-log.txt
```

**Backup Checklist**:
- [ ] Full database backup created
- [ ] Backup verified to be restorable
- [ ] Backup stored in geographically separate location
- [ ] Backup integrity documented (size, MD5 hash)
- [ ] Restore procedure tested in non-prod environment
- [ ] Backup recovery time acceptable (< 4 hours)

### 2.2 Dual-Write Verification

Verify the migration helper flag is properly configured:

```typescript
// File: src/services/slack-user-provisioner.ts
const ENABLE_IDENTITY_DUAL_WRITE = true; // Must be TRUE before migration
```

**Tests to Run**:

```bash
# 1. Verify dual-write is working (creates both slack_users AND external_identities)
npm run test -- src/__tests__/unit/dual-write-verification.test.ts

# 2. Check that reads prefer ExternalIdentity with fallback to SlackUser
npm run test -- src/__tests__/unit/identity-resolver.test.ts

# 3. Verify audit logging captures all writes
npm run test -- src/__tests__/unit/audit-logging.test.ts
```

**Expected Results**:
- All new Slack users are written to BOTH tables
- Identity resolver returns correct user regardless of source
- Audit logs show all operations with source tracking

### 2.3 Staging Environment Testing

**Critical**: Run full migration in staging before production:

```bash
# 1. Deploy new schema to staging
npm run migrate:staging

# 2. Run dry-run migration
npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts \
  --dry-run \
  --env=staging

# 3. Review dry-run output - verify counts
# Expected output:
# - Total Records: [count]
# - Linked Users: [count]
# - Unlinked Users: [count]
# - Errors: 0

# 4. Run actual migration
npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts \
  --env=staging

# 5. Run full test suite
npm run test:integration -- --env=staging

# 6. Test in browser (staging frontend)
# - Login with Slack OAuth
# - Verify identity linked correctly
# - Check admin identity management panel
# - Test identity linking workflow

# 7. Run load test (simulating 100 concurrent users)
npm run test:load -- --env=staging --concurrency=100

# 8. Monitor for 4+ hours
# - Check error rates
# - Monitor query performance
# - Verify no data inconsistencies
# - Confirm audit logs being written
```

**Go/No-Go Decision**:
- [ ] Dry-run output matches expectations
- [ ] All tests pass
- [ ] No new errors in logs
- [ ] Load test successful
- [ ] Manual testing successful
- [ ] Performance acceptable

---

## 3. Rollback Scenarios

### Scenario A: Partial Migration Failure

**Symptoms**: Some SlackUser records fail to migrate, causing orphaned data.

**Detection**:

```sql
-- Check for SlackUser records without corresponding ExternalIdentity
SELECT
  su.id,
  su.slack_user_id,
  su.user_id,
  su.organization_id,
  su.created_at
FROM slack_users su
LEFT JOIN external_identities ei ON
  ei.provider_user_id = su.slack_user_id
  AND ei.provider_team_id = su.slack_team_id
  AND ei.provider = 'slack'
  AND ei.organization_id = su.organization_id
WHERE ei.id IS NULL
ORDER BY su.created_at DESC
LIMIT 20;
```

**Resolution Steps**:

```bash
# 1. Identify affected organization(s)
SELECT DISTINCT organization_id FROM slack_users
WHERE id IN ([orphaned_ids]);

# 2. For each affected org, re-run migration for those specific records
npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts \
  --org-id=[org_uuid]

# 3. Verify migration completed
# Run detection query again - should return 0 rows

# 4. Create incident report
cat > incident-report-partial-failure.md << EOF
## Partial Migration Failure - Incident Report

**Date**: $(date)
**Affected Organization**: [org_uuid]
**Affected Records**: [count]
**Root Cause**: [identified during troubleshooting]

### Resolution Steps Taken
1. Re-ran migration script for affected org
2. Verified all records now present
3. Tested identity resolution for affected users
4. Confirmed audit logs record retry

### Timeline
- Detection: [timestamp]
- Resolution: [timestamp]
- Verification: [timestamp]
EOF
```

### Scenario B: Full Rollback to SlackUser

**When to Use**: Critical issue discovered where ExternalIdentity system causes widespread failures.

**Rollback Steps**:

#### Step 1: Disable Dual-Write and Auth Bypass

```typescript
// File: src/services/slack-user-provisioner.ts
// Change:
const ENABLE_IDENTITY_DUAL_WRITE = false; // Disable dual-write
const ENABLE_AUTH_BYPASS = true;          // Allow SlackUser fallback

// This causes:
// - New writes go ONLY to slack_users
// - Reads fall back to slack_users if ExternalIdentity not found
// - No new ExternalIdentity records created
```

```typescript
// File: src/services/identity/identity-resolver.ts
// Revert to SlackUser-based resolution:
async getIdentitiesForUser(organizationId: string, userId: string) {
  // Option 1: Use legacy SlackUser query
  return db.slackUser.findMany({
    where: { organizationId, userId }
  });
}
```

#### Step 2: Revert Code to SlackUser

```bash
# 1. Check out previous version
git checkout HEAD~1 -- src/api/identity.ts

# 2. Disable new identity endpoints
# OR add feature flag:
if (process.env.LEGACY_SLACK_USER_MODE === 'true') {
  // Use old endpoints
} else {
  // Use new endpoints
}

# 3. Recompile and verify
npm run build
npm run typecheck
```

#### Step 3: Database Rollback

```sql
-- CRITICAL: Run in transaction with backup
BEGIN;

-- Disable RLS temporarily for admin operations
SET app.bypass_rls = 'true';

-- Step 1: Verify data integrity before deletion
SELECT COUNT(*) as external_identity_count FROM external_identities;
SELECT COUNT(*) as slack_user_count FROM slack_users;

-- Step 2: Create backup of external_identities (if needed for investigation)
CREATE TABLE external_identities_backup_[TIMESTAMP] AS
SELECT * FROM external_identities;

-- Step 3: Delete external_identities records created during migration
DELETE FROM external_identities
WHERE link_method = 'migration'
  OR (metadata->>'migratedFrom' = 'SlackUser' AND metadata->>'migratedAt' IS NOT NULL);

-- Step 4: Verify deletion
SELECT COUNT(*) as remaining_external_identities FROM external_identities;

-- Step 5: Verify SlackUser data integrity
SELECT COUNT(*) as slack_user_count FROM slack_users;
SELECT COUNT(DISTINCT user_id) as linked_users FROM slack_users WHERE user_id IS NOT NULL;

-- If all looks good:
COMMIT;

-- If any issues discovered:
-- ROLLBACK;
```

#### Step 4: Redeploy Application

```bash
# 1. Set environment variables
export LEGACY_SLACK_USER_MODE=true
export ENABLE_IDENTITY_DUAL_WRITE=false

# 2. Redeploy
npm run build
railway up

# 3. Verify deployment
curl https://api.nubabel.app/health
# Expected: 200 OK

# 4. Test login flow
# - Authenticate with Slack
# - Verify user loads correctly
# - Check slash commands work
```

#### Step 5: Communication & Monitoring

```bash
# 1. Create incident postmortem
cat > postmortem-identity-rollback.md << EOF
# Identity Linking Rollback - Postmortem

## Summary
[One-line summary of what went wrong]

## Timeline
- [timestamp]: Issue detected
- [timestamp]: Rollback initiated
- [timestamp]: System restored to working state

## Root Cause
[Detailed analysis of root cause]

## Resolution
[What was done to fix]

## Prevention
[What could have prevented this]

## Action Items
- [ ] Add detection for [specific issue] in monitoring
- [ ] Add test case for [specific scenario]
- [ ] Update [documentation] to clarify behavior
EOF

# 2. Post incident notification
slack-notify "#incidents" "Identity linking rollback complete.
  See postmortem: [link].
  Expected recovery time: [X hours]"

# 3. Monitor error rates
# - Track 404 errors on identity endpoints (should drop)
# - Track auth failures (should drop)
# - Track query times (should improve)
```

### Scenario C: Data Inconsistency

**Symptoms**: Linking status doesn't match reality, users see different identities, duplicate links.

**Detection**:

```sql
-- 1. Find duplicate links (same user linked to multiple identities for same provider)
SELECT
  user_id,
  provider,
  COUNT(*) as link_count
FROM external_identities
WHERE link_status = 'linked'
  AND user_id IS NOT NULL
GROUP BY user_id, provider
HAVING COUNT(*) > 1
ORDER BY link_count DESC;

-- 2. Find broken links (user_id points to non-existent user)
SELECT
  ei.id,
  ei.provider,
  ei.user_id,
  ei.link_status
FROM external_identities ei
LEFT JOIN "user" u ON ei.user_id = u.id
WHERE ei.link_status = 'linked'
  AND ei.user_id IS NOT NULL
  AND u.id IS NULL;

-- 3. Find unlinked identities with user_id set (inconsistent state)
SELECT
  id,
  provider,
  provider_user_id,
  user_id,
  link_status
FROM external_identities
WHERE link_status = 'unlinked'
  AND user_id IS NOT NULL
LIMIT 20;

-- 4. Audit trail verification
SELECT
  entity_id,
  action,
  COUNT(*) as action_count,
  MAX(created_at) as last_action
FROM audit_logs
WHERE entity_type = 'external_identity'
GROUP BY entity_id, action
ORDER BY created_at DESC
LIMIT 20;
```

**Fix Steps**:

```sql
BEGIN;

-- Fix 1: Resolve duplicate links (keep most recent, unlink others)
WITH duplicates AS (
  SELECT
    id,
    user_id,
    provider,
    linked_at,
    ROW_NUMBER() OVER (PARTITION BY user_id, provider ORDER BY linked_at DESC) as rn
  FROM external_identities
  WHERE link_status = 'linked'
    AND user_id IS NOT NULL
)
UPDATE external_identities
SET link_status = 'unlinked',
    user_id = NULL,
    link_method = NULL,
    linked_at = NULL
WHERE id IN (SELECT id FROM duplicates WHERE rn > 1);

-- Fix 2: Remove broken links (user_id points to deleted user)
UPDATE external_identities
SET link_status = 'unlinked',
    user_id = NULL,
    link_method = NULL,
    linked_at = NULL
WHERE user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM "user");

-- Fix 3: Correct inconsistent state (unlinked but has user_id)
UPDATE external_identities
SET user_id = NULL
WHERE link_status = 'unlinked'
  AND user_id IS NOT NULL;

COMMIT;
```

**Verification After Fix**:

```sql
-- Re-run detection queries - should return 0 rows
SELECT COUNT(*) FROM external_identities
WHERE link_status = 'linked'
  AND user_id IS NOT NULL
GROUP BY user_id, provider
HAVING COUNT(*) > 1;

-- Verify link integrity
SELECT
  COUNT(*) as total_linked,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT provider) as providers
FROM external_identities
WHERE link_status = 'linked'
  AND user_id IS NOT NULL;
```

---

## 4. Rollback Commands

### Quick Reference

```bash
# ============================================================================
# PRE-MIGRATION
# ============================================================================

# Create backup
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME --format=custom \
  --file=backup-pre-identity-migration-$(date +%Y%m%d).dump

# Test migration (dry-run)
npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts --dry-run

# ============================================================================
# DURING MIGRATION
# ============================================================================

# Run actual migration
npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts

# Monitor progress
SELECT
  COUNT(*) as migrated,
  COUNT(*) FILTER (WHERE link_status = 'linked') as linked,
  COUNT(*) FILTER (WHERE link_status = 'unlinked') as unlinked
FROM external_identities
WHERE metadata->>'migratedFrom' = 'SlackUser';

# ============================================================================
# ROLLBACK: PARTIAL FAILURE (Scenario A)
# ============================================================================

# Re-run for specific org
npx ts-node src/scripts/migrate-slack-users-to-external-identity.ts \
  --org-id=[org_uuid]

# ============================================================================
# ROLLBACK: FULL ROLLBACK (Scenario B)
# ============================================================================

# 1. Disable dual-write (edit file)
# src/services/slack-user-provisioner.ts
# const ENABLE_IDENTITY_DUAL_WRITE = false;

# 2. Delete migration records
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << EOF
BEGIN;
SET app.bypass_rls = 'true';
DELETE FROM external_identities
WHERE link_method = 'migration'
   OR metadata->>'migratedFrom' = 'SlackUser';
COMMIT;
EOF

# 3. Rebuild and redeploy
npm run build
railway up

# 4. Verify
curl https://api.nubabel.app/health

# ============================================================================
# ROLLBACK: DATA INCONSISTENCY (Scenario C)
# ============================================================================

# Run consistency checks
psql -h $DB_HOST -U $DB_USER -d $DB_NAME << EOF
-- Check for duplicates
SELECT user_id, provider, COUNT(*) as cnt
FROM external_identities
WHERE link_status = 'linked'
GROUP BY user_id, provider
HAVING COUNT(*) > 1;

-- Check for broken links
SELECT COUNT(*) FROM external_identities
WHERE link_status = 'linked'
  AND user_id IS NOT NULL
  AND user_id NOT IN (SELECT id FROM "user");
EOF

# Fix if needed (see Scenario C above)
```

### Restore from Backup (Last Resort)

```bash
# 1. Stop application
railway stop

# 2. Restore database
pg_restore -h $DB_HOST -U $DB_USER -d $DB_NAME \
  --clean --if-exists \
  backup-pre-identity-migration-20260130.dump

# 3. Verify restore
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \
  "SELECT COUNT(*) FROM slack_users; SELECT COUNT(*) FROM external_identities;"

# 4. Restart with rollback code
git revert [commit_hash]
npm run build
railway up

# 5. Verify service health
curl https://api.nubabel.app/health
```

---

## 5. Monitoring During Migration

### Key Metrics

| Metric | Normal | Alert | Critical |
| ------ | ------ | ----- | -------- |
| Migration Success Rate | >99% | 95-99% | <95% |
| Average Query Time | <100ms | 100-500ms | >500ms |
| Auth Failure Rate | <0.01% | 0.01-0.1% | >0.1% |
| Orphaned Records | 0 | 1-10 | >10 |
| Audit Log Lag | <100ms | 100-500ms | >500ms |

### Dashboard Queries

```sql
-- Real-time migration progress
SELECT
  'Migration Progress' as metric,
  COUNT(*) FILTER (WHERE link_method = 'migration') as migrated_count,
  COUNT(*) FILTER (WHERE link_status = 'linked' AND link_method = 'migration') as linked_count,
  COUNT(*) FILTER (WHERE link_status = 'unlinked' AND link_method = 'migration') as unlinked_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE link_method = 'migration') /
    (SELECT COUNT(*) FROM slack_users),
    2
  ) as progress_percent
FROM external_identities;

-- Query performance before/after
SELECT
  'Query Performance' as metric,
  ROUND(AVG(EXTRACT(EPOCH FROM execution_time)) * 1000, 2) as avg_ms,
  MAX(EXTRACT(EPOCH FROM execution_time)) * 1000 as max_ms,
  COUNT(*) as sample_count
FROM query_logs
WHERE query LIKE '%external_identities%'
  AND executed_at > NOW() - INTERVAL '1 hour';

-- Error rate tracking
SELECT
  'Error Rate' as metric,
  COUNT(*) FILTER (WHERE status >= 400) as error_count,
  COUNT(*) as total_requests,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status >= 400) / COUNT(*),
    3
  ) as error_percent
FROM api_logs
WHERE endpoint LIKE '/api/identities%'
  AND created_at > NOW() - INTERVAL '1 hour';

-- Auth failure tracking
SELECT
  'Auth Failures' as metric,
  COUNT(*) as auth_failure_count,
  COUNT(DISTINCT user_id) as affected_users,
  ROUND(
    100.0 * COUNT(*) /
    (SELECT COUNT(*) FROM api_logs WHERE endpoint LIKE '/auth/%'),
    3
  ) as failure_rate_percent
FROM api_logs
WHERE endpoint LIKE '/auth/%'
  AND status IN (401, 403)
  AND created_at > NOW() - INTERVAL '1 hour';
```

### Alert Thresholds

Set up Slack/PagerDuty alerts:

```bash
# Alert 1: Migration failure rate exceeds 5%
if [ "$(sql_query 'SELECT error_count FROM migration_stats')" -gt 5 ]; then
  slack-notify "#alerts-critical" "Identity migration failure rate >5%. Investigating..."
fi

# Alert 2: Auth failures spike
if [ "$(sql_query 'SELECT auth_failures FROM metrics WHERE time > now - 5min')" -gt 10 ]; then
  slack-notify "#alerts-critical" "Auth failures detected during migration. Initiating rollback protocol."
fi

# Alert 3: Query performance degrades
if [ "$(sql_query 'SELECT avg_query_time FROM metrics')" -gt 500 ]; then
  slack-notify "#alerts" "Query performance degraded (>500ms). Monitoring..."
fi

# Alert 4: Orphaned records detected
if [ "$(sql_query 'SELECT COUNT(*) FROM slack_users WHERE user_id NOT IN (SELECT DISTINCT user_id FROM external_identities)')" -gt 0 ]; then
  slack-notify "#alerts" "Orphaned SlackUser records detected. Re-running migration for affected org."
fi
```

### Log Monitoring

```bash
# Watch for errors in real-time
tail -f logs/application.log | grep -i "error\|fail\|warn" | grep -E "external_identity|migration|identity" &

# Count errors by type
jq 'select(.level == "error") | .message' logs/application.log | \
  sort | uniq -c | sort -rn

# Monitor audit logs for anomalies
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c \
  "SELECT action, COUNT(*) FROM audit_logs
   WHERE entity_type = 'external_identity'
   AND created_at > NOW() - INTERVAL '1 hour'
   GROUP BY action ORDER BY COUNT DESC;"
```

---

## 6. Deprecation Timeline

After successful migration and stabilization, follow this timeline for complete SlackUser removal:

### Phase 1: Dual-Write Period (Weeks 1-4)

**State**: Both `slack_users` and `external_identities` tables active

```typescript
// Code behavior
const ENABLE_IDENTITY_DUAL_WRITE = true;

// - All writes go to BOTH tables
// - Reads prefer ExternalIdentity with SlackUser fallback
// - Audit logs mark source of data
```

**Actions**:
- [ ] Monitor for data inconsistencies
- [ ] Verify all existing users migrated
- [ ] Test all identity management flows

### Phase 2: Deprecation Warnings (Weeks 5-8)

**State**: Warnings added, SlackUser still functional

```typescript
// Code behavior
const ENABLE_IDENTITY_DUAL_WRITE = true;
const DEPRECATION_WARNINGS_ENABLED = true;

// - Log deprecation warning each time SlackUser is accessed
// - Frontend shows banner: "SlackUser feature deprecated, using ExternalIdentity"
// - API returns warning header: X-Deprecated: SlackUser-endpoint
```

**Actions**:
- [ ] Add deprecation warnings to logs
- [ ] Update documentation with migration guide
- [ ] Notify users of change (email, in-app banner)
- [ ] Monitor for backwards-compat issues

### Phase 3: Code Cleanup (Weeks 9-12)

**State**: Remove SlackUser code references

```bash
# Remove SlackUser from codebase
rm -f src/services/slack-user-provisioner.ts
rm -f src/api/slack-commands.ts (legacy endpoints)
grep -r "SlackUser" src/ --exclude-dir=node_modules | grep -v "test"

# Update all imports
find src -name "*.ts" -exec sed -i 's/SlackUser/ExternalIdentity/g' {} \;

# Update documentation
find docs -name "*.md" -exec sed -i 's/SlackUser/ExternalIdentity/g' {} \;
```

**Actions**:
- [ ] Remove SlackUser model from Prisma schema
- [ ] Remove SlackUser service files
- [ ] Update all documentation
- [ ] Remove SlackUser migration scripts

### Phase 4: Table Deprovisioning (Week 13+)

**State**: Database schema cleaned up

```sql
-- Final verification before deletion
SELECT COUNT(*) FROM slack_users;  -- Should be 0 or very small
SELECT COUNT(*) FROM external_identities WHERE provider = 'slack';  -- Should match

-- Drop table
DROP TABLE IF EXISTS slack_users;
DROP TABLE IF EXISTS slack_users_audit;

-- Clean up related indexes, sequences
```

**Actions**:
- [ ] Run final backups
- [ ] Archive slack_users data if needed
- [ ] Drop table
- [ ] Update database documentation

### Milestones Checklist

- [ ] **Week 4**: Phase 1 complete, zero issues with dual-write
- [ ] **Week 8**: Phase 2 complete, users notified, no escalations
- [ ] **Week 12**: Phase 3 complete, code fully migrated
- [ ] **Week 13+**: Phase 4 complete, table dropped

---

## 7. Testing & Verification

### Pre-Rollback Verification

Before initiating any rollback, verify your backup and recovery procedure:

```bash
# 1. Backup test restore (non-prod environment)
pg_restore -h $TEST_DB_HOST -U $TEST_USER -d $TEST_DB_NAME \
  backup-pre-identity-migration-20260130.dump

# 2. Verify data integrity
psql -h $TEST_DB_HOST -U $TEST_USER -d $TEST_DB_NAME << EOF
SELECT
  'slack_users' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_record
FROM slack_users
UNION ALL
SELECT
  'external_identities' as table_name,
  COUNT(*) as row_count,
  MAX(created_at) as latest_record
FROM external_identities;
EOF

# 3. Test authentication flow
# - Login with Slack
# - Verify user resolves correctly
# - Check identity linking

# 4. Time recovery procedure
time pg_restore -h $PROD_DB_HOST -U $PROD_USER -d $PROD_DB_NAME \
  backup-pre-identity-migration-20260130.dump

# Expected: < 4 hours for full restore
```

### Post-Rollback Verification

After rolling back, verify the system is stable:

```bash
# 1. Check system health
curl -I https://api.nubabel.app/health
# Expected: 200 OK

# 2. Verify user authentication
curl -X POST https://api.nubabel.app/auth/slack \
  -H "Content-Type: application/json" \
  -d '{"code": "test_code"}'
# Expected: 200 or 401 (but no 500 errors)

# 3. Check error rates
# Before rollback: [X% errors]
# After rollback: Should be < 0.1%

# 4. Verify SlackUser data intactness
SELECT COUNT(*) as total_users,
       COUNT(DISTINCT user_id) as linked_users
FROM slack_users;

# 5. Run smoke tests
npm run test:smoke -- --env=production

# 6. Monitor metrics for 2 hours
# - Error rates
# - Query latency
# - Slack bot responsiveness
```

---

## Document Control

| Version | Date | Changes | Author |
| ------- | ---- | ------- | ------ |
| 1.0 | 2026-01-30 | Initial version, all scenarios documented | System |

## Related Documents

- [Identity Linking Plan](../plans/identity-linking.md)
- [Migration Script](../src/scripts/migrate-slack-users-to-external-identity.ts)
- [Identity API Reference](./api/identity-api.md) (TBD)
- [Incident Response Playbook](./operations/incident-response.md)

## Support & Escalation

**For rollback questions**:
- Technical Lead: [slack @eng-lead]
- Database Admin: [slack @dba]
- DevOps: [slack @devops]

**Critical Issues (24/7)**:
- PagerDuty: `#incidents` → Emergency escalation
- On-call: Check calendar in Notion

---

*This document is a living guide. Update based on lessons learned during and after migration.*
