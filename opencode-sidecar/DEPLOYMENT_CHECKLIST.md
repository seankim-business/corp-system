# OhMyOpenCode Sidecar Deployment Checklist

**Target**: Railway Production Deployment  
**Date**: 2026-01-26

---

## Pre-Deployment

- [x] Dockerfile ready
- [x] railway.json / railway.toml configured
- [x] Health check endpoint implemented
- [x] Environment variable templates created
- [ ] Anthropic API key available
- [ ] Railway account ready

---

## Deployment Steps

### 1. Create Railway Service

- [ ] Go to https://railway.app/dashboard
- [ ] Click **New Project**
- [ ] Select **Deploy from GitHub repo**
- [ ] Choose repository: `seankim-business/corp-system`
- [ ] Service created successfully

**Notes**: **********************\_\_\_**********************

### 2. Configure Service

- [ ] Open service settings
- [ ] Set **Root Directory**: `opencode-sidecar`
- [ ] Save changes
- [ ] Verify Dockerfile is detected

**Notes**: **********************\_\_\_**********************

### 3. Set Environment Variables

Go to **Variables** tab and add:

- [ ] `ANTHROPIC_API_KEY` = `sk-ant-api03-...`
- [ ] `PORT` = `3001`
- [ ] `NODE_ENV` = `production`
- [ ] `LOG_LEVEL` = `info` (optional)

**Notes**: **********************\_\_\_**********************

### 4. Deploy

- [ ] Click **Deploy** button
- [ ] Wait for build to complete (~3-5 minutes)
- [ ] Check logs for errors
- [ ] Verify status: **Deployment successful**

**Build Time**: **\_\_\_** minutes  
**Deployment ID**: **************\_\_\_**************

### 5. Generate Public Domain

- [ ] Go to **Settings** → **Networking**
- [ ] Click **Generate Domain**
- [ ] Copy generated URL

**Sidecar URL**: **********************\_\_\_**********************

### 6. Test Sidecar

```bash
# Test health endpoint
curl https://YOUR-SIDECAR-URL/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2026-01-26T...",
#   "uptime": 123,
#   "anthropic": { "configured": true }
# }
```

- [ ] Health check returns 200 OK
- [ ] `status` = `"healthy"`
- [ ] `anthropic.configured` = `true`

**Test Result**: **********************\_\_\_**********************

---

## Nubabel Integration

### 7. Update Nubabel Variables

Go to Nubabel service → **Variables** tab:

- [ ] Add `OPENCODE_SIDECAR_URL` = `https://YOUR-SIDECAR-URL`
- [ ] Add `OPENCODE_SIDECAR_TIMEOUT` = `120000`
- [ ] Add `USE_BUILTIN_AI` = `false`
- [ ] Save changes

**Notes**: **********************\_\_\_**********************

### 8. Wait for Nubabel Redeployment

- [ ] Railway auto-redeploys Nubabel
- [ ] Wait for deployment to complete (~2-3 minutes)
- [ ] Check Nubabel logs for sidecar connection

**Deployment Time**: **\_\_\_** minutes

### 9. Verify Connection

Check Nubabel logs for:

```
[Orchestrator] Delegating task to OpenCode sidecar
[Orchestrator] Sidecar URL: https://YOUR-SIDECAR-URL
```

- [ ] Sidecar URL appears in logs
- [ ] No connection errors
- [ ] Delegation successful

**Log Snippet**: **********************\_\_\_**********************

---

## Integration Testing

### 10. Slack Bot Test

```
@nubabel Create a Notion task "Test sidecar deployment"
```

- [ ] Bot responds within 3 seconds
- [ ] Task created successfully
- [ ] No errors in logs

**Test Result**: **********************\_\_\_**********************

### 11. Workflow Test

- [ ] Go to Nubabel Dashboard → Workflows
- [ ] Execute existing workflow
- [ ] Check execution logs
- [ ] Verify sidecar was used

**Workflow ID**: **************\_\_\_**************  
**Test Result**: **********************\_\_\_**********************

### 12. Direct API Test

```bash
curl -X POST https://YOUR-SIDECAR-URL/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": [],
    "prompt": "Hello from production test",
    "session_id": "test_production_deploy"
  }'
```

- [ ] Returns 200 OK
- [ ] `status` = `"success"`
- [ ] Response time < 5 seconds

**Response Time**: **\_\_\_** ms  
**Test Result**: **********************\_\_\_**********************

---

## Post-Deployment Monitoring

### 13. Monitor for 1 Hour

**Railway Metrics** (check every 15 minutes):

| Time | CPU | Memory | Requests | Errors |
| ---- | --- | ------ | -------- | ------ |
| +15m |     |        |          |        |
| +30m |     |        |          |        |
| +45m |     |        |          |        |
| +60m |     |        |          |        |

**Acceptance Criteria**:

- [ ] CPU usage < 50%
- [ ] Memory usage < 400 MB
- [ ] Error rate < 1%
- [ ] P95 latency < 5s

### 14. User Feedback

- [ ] No user complaints
- [ ] No increase in support tickets
- [ ] Slack bot working normally

**Notes**: **********************\_\_\_**********************

---

## Documentation Updates

### 15. Update Docs

- [ ] Update `COMPATIBILITY.md` with deployment date
- [ ] Update `opencode-sidecar/RAILWAY_DEPLOY.md` with actual URL
- [ ] Add sidecar URL to internal wiki
- [ ] Notify team in #engineering Slack channel

**Team Notification Sent**: [ ] Yes [ ] No

---

## Rollback Plan (If Needed)

If any issues occur:

1. **Immediate**: Set `USE_BUILTIN_AI=true` in Nubabel
2. **Then**: Investigate sidecar logs
3. **If unresolvable**: Rollback Railway deployment

```bash
# Rollback command
railway status
railway rollback <previous-deployment-id>
```

**Rollback Tested**: [ ] Yes [ ] No

---

## Sign-Off

**Deployed By**: **************\_\_\_**************  
**Deployment Date**: **************\_\_\_**************  
**Deployment Time**: **************\_\_\_**************  
**Status**: [ ] Success [ ] Failed [ ] Rollback

**Notes**:

---

---

---

---

**Next Review**: 1 week after deployment  
**Monitoring Period**: 30 days
