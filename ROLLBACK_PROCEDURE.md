# Rollback Procedure - Multi-Account System

**Version**: Wave 8 - Multi-Account Claude Max Integration  
**Deployment Date**: 2026-01-30  
**Commit**: 3614f62

---

## When to Rollback

Rollback immediately if:

- ✗ Health checks failing (database, Redis, or service down)
- ✗ Error rate > 10% for more than 5 minutes
- ✗ Circuit breakers stuck open for all accounts
- ✗ Data corruption detected
- ✗ Critical security vulnerability discovered

Consider rollback if:

- ⚠️ Performance degradation > 50%
- ⚠️ Quota monitoring not working
- ⚠️ Slack notifications failing
- ⚠️ Admin API returning errors

---

## Quick Rollback (Railway Dashboard)

**Fastest method - Use if service is down**

1. **Navigate to Railway Dashboard**:

   ```
   https://railway.app/project/nubabel-production
   ```

2. **Go to Deployments Tab**:
   - Click on "app.nubabel.com" service
   - Click "Deployments" in sidebar

3. **Find Previous Deployment**:
   - Look for deployment before commit `3614f62`
   - Should be commit `620e605` or earlier
   - Status should show "SUCCESS"

4. **Rollback**:
   - Click three dots (...) on previous deployment
   - Click "Redeploy"
   - Confirm rollback

5. **Wait for Deployment** (5-10 minutes):
   - Monitor build logs
   - Wait for status: "ACTIVE"

6. **Verify Rollback**:
   ```bash
   curl https://app.nubabel.com/health/live
   # Expected: {"status":"ok",...}
   ```

**Estimated Time**: 10-15 minutes

---

## Git-Based Rollback (CLI)

**Use if you have git access and want to preserve history**

### Step 1: Revert Commit

```bash
cd /path/to/nubabel

git revert 3614f62 --no-edit

git push origin main
```

### Step 2: Trigger Railway Deployment

Railway will auto-deploy the revert commit, OR manually trigger:

```bash
railway up
```

### Step 3: Monitor Deployment

```bash
railway logs --tail 100
```

Wait for:

```
✅ Server running on port 3000
✅ Ready to accept connections
```

### Step 4: Verify Rollback

```bash
curl https://app.nubabel.com/health/live
curl https://app.nubabel.com/health/db
curl https://app.nubabel.com/health/redis
```

All should return `{"status":"ok",...}`

**Estimated Time**: 15-20 minutes

---

## Database Rollback

**CRITICAL: Only if database migrations were run**

### Check if Migrations Were Applied

```bash
railway run npx prisma migrate status
```

If you see:

```
Applied migrations:
  20260130_baseline
  20260130_add_multi_account  ← NEW MIGRATION
```

### Rollback Migration

**⚠️ WARNING: This will DELETE data in new tables**

```bash
railway run npx prisma migrate resolve --rolled-back 20260130_add_multi_account

railway run npx prisma migrate deploy
```

### Verify Database State

```bash
railway run npx prisma studio
```

Check that these tables are GONE:

- `claude_accounts`
- `quota_alerts`
- `account_usage_logs`

---

## Environment Variables Rollback

**If you changed environment variables**

### Step 1: List Current Variables

```bash
railway variables
```

### Step 2: Remove New Variables

```bash
railway variables delete ENCRYPTION_KEY
railway variables delete SLACK_ACTIVITY_CHANNEL
railway variables delete SLACK_ALERT_CHANNEL
railway variables delete SLACK_MENTION_USER_ID
railway variables delete ANTHROPIC_ADMIN_API_KEY
```

### Step 3: Restart Service

```bash
railway restart
```

---

## Redis Rollback

**If Redis state is corrupted**

### Step 1: Connect to Redis

```bash
railway run redis-cli
```

### Step 2: Clear Multi-Account Keys

```redis
KEYS claude:account:*
# Review keys, then delete:
DEL claude:account:capacity:*
DEL claude:account:circuit:*
DEL claude:account:usage:*
```

### Step 3: Verify Clean State

```redis
KEYS claude:account:*
# Should return: (empty array)
```

---

## Verification Checklist

After rollback, verify:

- [ ] Service is responding: `curl https://app.nubabel.com/health/live`
- [ ] Database connected: `curl https://app.nubabel.com/health/db`
- [ ] Redis connected: `curl https://app.nubabel.com/health/redis`
- [ ] No errors in logs: `railway logs --tail 50`
- [ ] Previous functionality works (test a known working feature)
- [ ] Error rate < 1%
- [ ] Response time < 500ms p95

---

## Post-Rollback Actions

### 1. Notify Team

Send message to #eng-alerts:

```
🔄 ROLLBACK COMPLETED
- Service: Nubabel Multi-Account System
- Rolled back from: 3614f62
- Rolled back to: 620e605
- Reason: [describe issue]
- Status: Service restored
- Action required: [if any]
```

### 2. Create Incident Report

File: `incidents/2026-01-30-multi-account-rollback.md`

Include:

- Timeline of events
- Root cause analysis
- Impact assessment
- Lessons learned
- Prevention measures

### 3. Review Logs

```bash
railway logs --since 1h > rollback-logs.txt
```

Analyze for:

- Error patterns
- Performance issues
- Data corruption
- Security issues

### 4. Plan Re-Deployment

Before re-deploying:

- [ ] Fix root cause
- [ ] Add additional tests
- [ ] Test in staging environment
- [ ] Create detailed deployment plan
- [ ] Schedule during low-traffic window

---

## Emergency Contacts

**If rollback fails or issues persist:**

- **Engineering Lead**: engineering@nubabel.com
- **Railway Support**: https://railway.app/help
- **Database Admin**: [contact info]
- **DevOps On-Call**: [contact info]

---

## Rollback Decision Matrix

| Issue                       | Severity | Action                                       | Timeframe   |
| --------------------------- | -------- | -------------------------------------------- | ----------- |
| Service down                | CRITICAL | Immediate rollback via Railway dashboard     | < 5 min     |
| Error rate > 10%            | HIGH     | Rollback via git + Railway                   | < 15 min    |
| Performance degraded > 50%  | HIGH     | Investigate first, rollback if no quick fix  | < 30 min    |
| Quota monitoring broken     | MEDIUM   | Fix forward if possible, rollback if complex | < 1 hour    |
| Slack notifications failing | LOW      | Fix forward                                  | No rollback |

---

## Testing Rollback Procedure

**Practice rollback in staging:**

```bash
# 1. Deploy to staging
railway environment staging
railway up

# 2. Test rollback
railway rollback

# 3. Verify
curl https://staging.nubabel.com/health/live
```

**Recommended**: Practice rollback quarterly

---

## Known Rollback Risks

1. **Data Loss**: New tables (`claude_accounts`, `quota_alerts`) will be deleted
2. **In-Flight Requests**: May fail during rollback window (< 30 seconds)
3. **Redis State**: May need manual cleanup
4. **Environment Variables**: Must be manually removed

**Mitigation**:

- Backup database before rollback
- Schedule rollback during low-traffic window
- Have Redis backup ready
- Document all environment variable changes

---

**Last Updated**: 2026-01-30  
**Tested**: No (recommend testing in staging)  
**Owner**: Nubabel Engineering Team
