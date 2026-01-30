# Railway Deployment Verification Guide

**Created**: 2026-01-25 15:36 KST  
**Latest Commit**: `82ffbba` (auto-deploying on Railway)

---

## ✅ Pre-Deployment Checklist

All fixes have been applied and pushed:
- [x] Server binds to `0.0.0.0` (Railway requirement)
- [x] OpenSSL installed in runtime stage (Prisma requirement)
- [x] Migration script runs on startup (`scripts/start.sh`)
- [x] Health check endpoints implemented
- [x] Notion Settings frontend routing added
- [x] All code committed and pushed to GitHub

---

## 📋 Verification Steps

### Step 1: Check Railway Dashboard (Browser Required)

1. **Login to Railway**:
   - Go to https://railway.app
   - Login with GitHub account

2. **Find Your Project**:
   - Should be named "corp-system" or similar
   - Connected to `seankim-business/corp-system` repository

3. **Check Deployment Status**:
   - Navigate to: Deployments → Latest deployment
   - Look for: **"Success"** status (green checkmark)
   - If still deploying: Wait 5-10 minutes

4. **View Deployment Logs**:
   - Click on the latest deployment
   - Click "View Logs" button
   - **Must see these lines**:
     ```
     📊 Running database migrations...
     ✅ Migrations completed successfully
     ✅ Server running on port 3000
     🚀 Health check endpoint: /health
     ```

5. **Get Railway URL**:
   - Copy the Railway-generated URL (e.g., `abc123.up.railway.app`)
   - Or if custom domain configured: `auth.nubabel.com`

---

### Step 2: Test Health Endpoints (Terminal)

Replace `<railway-url>` with your actual Railway URL from Step 1.5:

```bash
# Test basic health
curl https://<railway-url>/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-25T06:36:57.000Z"}

# Test database connection
curl https://<railway-url>/health/db

# Expected response:
# {"status":"ok","database":"connected"}

# Test Redis connection
curl https://<railway-url>/health/redis

# Expected response:
# {"status":"ok","redis":"connected"}
```

**All three must return "ok" status.**

---

### Step 3: Test Notion API Endpoints (Terminal)

First, get an authentication token (requires browser):

```bash
# 1. Visit OAuth URL in browser:
open https://<railway-url>/auth/google

# 2. Login with Google
# 3. Open browser DevTools → Application → Cookies
# 4. Copy the 'token' cookie value

# 5. Set as environment variable:
export AUTH_TOKEN="<your-token-from-cookie>"
```

Now test Notion endpoints:

```bash
# Create Notion connection
curl -X POST https://<railway-url>/api/notion/connection \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "secret_YOUR_NOTION_API_KEY",
    "defaultDatabaseId": "your-database-id"
  }'

# Expected: {"id":"...","organizationId":"...","createdAt":"..."}

# Get connection
curl https://<railway-url>/api/notion/connection \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Expected: Same connection object

# Test API key validity
curl -X POST https://<railway-url>/api/notion/test \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Expected: {"valid":true,"databaseCount":5}

# List Notion databases
curl https://<railway-url>/api/notion/databases \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Expected: [{"id":"...","title":"Task Database","url":"..."},...]
```

---

### Step 4: Test Frontend Access (Browser)

1. **Visit Frontend**:
   ```bash
   open https://<railway-url>/
   ```
   - Should redirect to `/login`

2. **Test Login**:
   - Click "Sign in with Google"
   - Complete OAuth flow
   - Should redirect to `/dashboard`

3. **Test Navigation**:
   - Click "Settings" in sidebar
   - Scroll down in sidebar to "Integrations" section
   - Click "Notion Settings"
   - Should navigate to `/settings/notion`

4. **Test Notion Settings Page**:
   - Enter Notion API key
   - Click "Save Connection"
   - Should show success message
   - Click "Test Connection"
   - Should show database count
   - View database list

---

### Step 5: End-to-End Workflow Test

1. **Create Test Workflow**:
   ```bash
   curl -X POST https://<railway-url>/api/workflows \
     -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Notion Integration",
       "description": "E2E test workflow",
       "trigger": {
         "type": "manual"
       },
       "config": {
         "steps": [
           {
             "type": "mcp_call",
             "mcp": "notion",
             "tool": "notion_create_task",
             "input": {
               "title": "{{input.taskTitle}}",
               "assignee": "{{input.assignee}}"
             }
           }
         ]
       }
     }'
   ```

2. **Execute Workflow**:
   ```bash
   # Use the workflow ID from previous response
   curl -X POST https://<railway-url>/api/workflows/<workflow-id>/execute \
     -H "Authorization: Bearer $AUTH_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "input": {
         "taskTitle": "Test task from Nubabel",
         "assignee": "Sean Kim"
       }
     }'
   
   # Expected: {"executionId":"...","status":"pending"}
   ```

3. **Check Execution Status**:
   ```bash
   curl https://<railway-url>/api/workflows/<workflow-id>/executions/<execution-id> \
     -H "Authorization: Bearer $AUTH_TOKEN"
   
   # Wait a few seconds, then check again
   # Expected final status: "success"
   ```

4. **Verify in Notion**:
   - Open your Notion database in browser
   - Look for new task: "Test task from Nubabel"
   - Assignee should be: "Sean Kim"

---

## ✅ Success Criteria

All of the following must pass:

- [ ] Railway deployment status: **Success**
- [ ] `/health` endpoint returns 200 OK
- [ ] `/health/db` endpoint returns "connected"
- [ ] `/health/redis` endpoint returns "connected"
- [ ] Migration logs show successful database setup
- [ ] Google OAuth login flow works
- [ ] Dashboard accessible after login
- [ ] Notion Settings page accessible at `/settings/notion`
- [ ] Can save Notion API key
- [ ] Can test Notion connection
- [ ] Can list Notion databases
- [ ] Can create workflow with Notion MCP call
- [ ] Can execute workflow successfully
- [ ] Task appears in Notion database

---

## 🔴 Troubleshooting

### Deployment Still Failing

**Check Railway logs for**:
```
Error: Cannot find module '@prisma/client'
→ FIX: Ensure `npx prisma generate` runs in Dockerfile

Error: ECONNREFUSED 127.0.0.1:5432
→ FIX: Check DATABASE_URL environment variable

Error: listen EADDRINUSE :::3000
→ FIX: Check if PORT env var is set correctly

Error: Invalid `prisma.user.findUnique()` invocation
→ FIX: Migrations didn't run. Check start.sh execution
```

**If health checks still timeout**:
1. Check if Railway assigned a different port
2. Verify `app.listen(port, '0.0.0.0', ...)` in logs
3. Check Railway service settings → Health Check settings

### Notion API Errors

**"Invalid API key"**:
- Verify API key format: `secret_...`
- Check Notion integration has correct permissions
- Ensure database is shared with integration

**"Database not found"**:
- Verify database ID format (32 chars, no dashes)
- Check database is shared with Notion integration
- Use database ID from Notion URL: `https://notion.so/..?v=DATABASE_ID`

**"Unauthorized"**:
- Check JWT token is valid (not expired)
- Verify Authorization header format: `Bearer <token>`
- Try logging in again to get fresh token

---

## 📊 Expected Timeline

| Step | Duration | Status |
|------|----------|--------|
| Railway auto-deploy | 5-10 min | 🟡 In progress |
| Health check verification | 2 min | ⏳ Waiting |
| Notion API testing | 5 min | ⏳ Waiting |
| Frontend testing | 5 min | ⏳ Waiting |
| E2E workflow test | 10 min | ⏳ Waiting |
| **Total** | **~25 min** | |

---

## 🎉 After Verification Complete

Once all checks pass:

1. **Update DEPLOYMENT_STATUS.md**:
   ```markdown
   ## ✅ Deployment Verified (2026-01-25)
   - All health checks passing
   - Notion integration working end-to-end
   - Ready for Phase 2 Week 9-12 (Slack Bot)
   ```

2. **Next Phase**: Start implementing Slack Bot
   - Follow `docs/planning/phase-2-spec.md` Week 9-12 spec
   - Create Slack App
   - Implement slash commands
   - Add natural language parsing

---

**Questions? Issues?**
- Check `RAILWAY_DEPLOYMENT.md` for detailed deployment guide
- Check `DEPLOYMENT_STATUS.md` for current status
- Check Railway logs for detailed error messages
