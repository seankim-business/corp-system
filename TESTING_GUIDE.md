# Testing Guide - Workflow System

## Prerequisites

### 1. Start Database Services

```bash
# Start Docker Desktop first, then:
docker-compose up -d

# Verify services are running:
docker-compose ps
# Should show: postgres (port 5432) and redis (port 6379) running
```

### 2. Run Database Migration

```bash
npx prisma migrate dev --name add_workflows
npx prisma generate
```

Expected output:
```
✔ Generated Prisma Client
```

### 3. Start Backend Server

```bash
npm run dev
```

Expected output:
```
Server running on port 3000
Environment: development
Base URL: http://localhost:3000
```

### 4. Start Frontend Server

```bash
cd frontend
npm run dev
```

Expected output:
```
VITE vX.X.X  ready in XXX ms
➜  Local:   http://localhost:3001/
```

---

## Test Scenarios

### Test 1: API Endpoint - List Workflows

**Endpoint**: `GET /api/workflows`

```bash
# You need a valid session cookie first (login via frontend)
curl http://localhost:3000/api/workflows \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "workflows": []
}
```

### Test 2: API Endpoint - Create Workflow

**Endpoint**: `POST /api/workflows`

```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Workflow",
    "description": "A test workflow for validation",
    "config": {},
    "enabled": true
  }'
```

**Expected Response**:
```json
{
  "workflow": {
    "id": "cm5xxxxx",
    "organizationId": "cm5xxxxx",
    "name": "Test Workflow",
    "description": "A test workflow for validation",
    "config": {},
    "enabled": true,
    "createdAt": "2026-01-25T...",
    "updatedAt": "2026-01-25T..."
  }
}
```

### Test 3: API Endpoint - Execute Workflow

**Endpoint**: `POST /api/workflows/:id/execute`

```bash
# Replace WORKFLOW_ID with actual ID from Test 2
curl -X POST http://localhost:3000/api/workflows/WORKFLOW_ID/execute \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputData": {
      "test": "data"
    }
  }'
```

**Expected Response** (202 Accepted):
```json
{
  "execution": {
    "id": "cm5xxxxx",
    "workflowId": "cm5xxxxx",
    "status": "pending",
    "inputData": {
      "test": "data"
    },
    "outputData": null,
    "errorMessage": null,
    "startedAt": "2026-01-25T...",
    "completedAt": null,
    "createdAt": "2026-01-25T..."
  }
}
```

**After 2-3 seconds**, check execution status:

```bash
# Replace EXECUTION_ID with actual ID from above
curl http://localhost:3000/api/executions/EXECUTION_ID \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response** (status should be "success"):
```json
{
  "execution": {
    "id": "cm5xxxxx",
    "workflowId": "cm5xxxxx",
    "status": "success",
    "inputData": {
      "test": "data"
    },
    "outputData": {
      "message": "Workflow executed successfully",
      "timestamp": "2026-01-25T..."
    },
    "errorMessage": null,
    "startedAt": "2026-01-25T...",
    "completedAt": "2026-01-25T...",
    "createdAt": "2026-01-25T...",
    "workflow": {
      "id": "cm5xxxxx",
      "name": "Test Workflow",
      ...
    }
  }
}
```

### Test 4: API Endpoint - List All Executions

**Endpoint**: `GET /api/executions`

```bash
curl http://localhost:3000/api/executions \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response**:
```json
{
  "executions": [
    {
      "id": "cm5xxxxx",
      "workflowId": "cm5xxxxx",
      "status": "success",
      "inputData": { "test": "data" },
      "outputData": {
        "message": "Workflow executed successfully",
        "timestamp": "2026-01-25T..."
      },
      "errorMessage": null,
      "startedAt": "2026-01-25T...",
      "completedAt": "2026-01-25T...",
      "createdAt": "2026-01-25T...",
      "workflow": {
        "name": "Test Workflow"
      }
    }
  ]
}
```

---

## Frontend UI Tests

### Test 5: Workflows Page

1. **Navigate to**: `http://localhost:3001/workflows`
2. **Login** if redirected to `/login`
3. **Expected State**: Empty state (no workflows yet)
   - Should see: "No workflows yet" message
   - Should see: "Create your first workflow to get started" text

### Test 6: Create First Workflow via Database

Since CreateWorkflowModal isn't implemented yet, create via Prisma Studio:

```bash
npx prisma studio
```

1. Open `Workflow` model
2. Click "Add record"
3. Fill in:
   - `organizationId`: (copy from your user's organization)
   - `name`: "Production Tracking"
   - `description`: "Track manufacturing orders"
   - `config`: `{}`
   - `enabled`: `true`
4. Click "Save"

**Refresh Workflows Page** - Should now show the workflow card.

### Test 7: Execute Workflow from UI

1. **On Workflows Page**, click "Execute" button on a workflow card
2. **Modal appears** with JSON editor
3. **Enter input data**:
   ```json
   {
     "orderId": "ORD-001",
     "quantity": 100
   }
   ```
4. **Click "Execute"**
5. **Expected**:
   - Modal closes
   - Success message appears (if implemented)
   - Workflows list refreshes

### Test 8: Executions Page

1. **Navigate to**: `http://localhost:3001/executions`
2. **Expected**:
   - Table showing execution history
   - Status badges (Success ✓, Failed ✗, Running ⏳)
   - Workflow name column
   - Started timestamp
   - Duration (in seconds)

3. **Test Filters**:
   - Click "All" - shows all executions
   - Click "Success" - shows only successful
   - Click "Failed" - shows only failed
   - Click "Running" - shows only running

---

## Error Scenarios to Test

### Test 9: Execute Disabled Workflow

1. **Via Prisma Studio**: Set a workflow's `enabled` to `false`
2. **Try to execute** via API:
   ```bash
   curl -X POST http://localhost:3000/api/workflows/DISABLED_WORKFLOW_ID/execute \
     -H "Cookie: session=YOUR_SESSION_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"inputData": {}}'
   ```
3. **Expected**: 404 error - "Workflow not found or disabled"

### Test 10: Execute Non-Existent Workflow

```bash
curl -X POST http://localhost:3000/api/workflows/invalid-id/execute \
  -H "Cookie: session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inputData": {}}'
```

**Expected**: 404 error - "Workflow not found or disabled"

### Test 11: Access Without Authentication

```bash
curl http://localhost:3000/api/workflows
```

**Expected**: 401 error - "Unauthorized"

### Test 12: Cross-Tenant Access (Multi-Tenancy Test)

This requires two organizations. If you have access to multiple orgs:

1. **Create workflow in Org A**
2. **Switch to Org B** (via Organization Switcher)
3. **Try to access Org A's workflow**:
   ```bash
   curl http://localhost:3000/api/workflows/ORG_A_WORKFLOW_ID \
     -H "Cookie: session=ORG_B_SESSION_TOKEN"
   ```
4. **Expected**: 404 error (workflow isolation working)

---

## Database Verification

### Check Workflow Table

```bash
npx prisma studio
```

Navigate to `Workflow` model - verify:
- ✅ `id` (cuid)
- ✅ `organizationId` (foreign key)
- ✅ `name` (string)
- ✅ `description` (nullable string)
- ✅ `config` (JSON object)
- ✅ `enabled` (boolean)
- ✅ `createdAt` (timestamp)
- ✅ `updatedAt` (timestamp)

### Check WorkflowExecution Table

Navigate to `WorkflowExecution` model - verify:
- ✅ `id` (cuid)
- ✅ `workflowId` (foreign key to Workflow)
- ✅ `status` (pending → running → success/failed)
- ✅ `inputData` (JSON object, nullable)
- ✅ `outputData` (JSON object, nullable)
- ✅ `errorMessage` (string, nullable)
- ✅ `startedAt` (timestamp, nullable)
- ✅ `completedAt` (timestamp, nullable)
- ✅ `createdAt` (timestamp)

---

## Expected Behavior Summary

### Workflow Execution Flow

```
1. User clicks "Execute" on WorkflowCard
   ↓
2. ExecuteWorkflowModal opens
   ↓
3. User inputs JSON data (optional)
   ↓
4. Click "Execute" button
   ↓
5. POST /api/workflows/:id/execute
   ↓
6. Backend creates WorkflowExecution (status: 'pending')
   ↓
7. Backend returns 202 Accepted immediately
   ↓
8. Background setTimeout runs:
   - pending → running (immediate)
   - running → success/failed (after 2 seconds)
   ↓
9. User sees success message
   ↓
10. User navigates to /executions page
   ↓
11. Sees execution history with status, duration, workflow name
```

### Status Transitions

```
pending → running → success
                 ↘ failed
```

**Simulated Timing**:
- `pending → running`: immediate
- `running → success`: +2 seconds
- Total duration: ~2 seconds

---

## Known Limitations (Phase 2 Week 3-4)

### Not Yet Implemented

1. **CreateWorkflowModal** - Must create workflows via:
   - API endpoint (`POST /api/workflows`)
   - Prisma Studio (manual database insert)

2. **Real Workflow Engine** - Current implementation:
   - Simulates execution with 2-second delay
   - Always returns success
   - Does not actually process `config` or `inputData`

3. **Workflow Builder UI** - Cannot:
   - Define workflow steps visually
   - Configure actions/triggers
   - Set up conditional logic

4. **Error Handling in UI** - Missing:
   - Toast notifications for success/error
   - Loading states during execution
   - Retry mechanism for failed executions

5. **Execution Details Page** - Cannot:
   - Click on execution row to see details
   - View input/output data in detail
   - Debug error messages

### Coming in Phase 2 Week 5-8 (Notion MCP)

- Real workflow execution engine
- Notion database connection
- Read/write actions for Notion
- Workflow configuration UI
- Trigger setup (manual, scheduled, webhook)

---

## Troubleshooting

### Issue: "Cannot reach database server"

**Solution**:
```bash
docker-compose up -d
docker-compose ps  # Verify postgres is running
```

### Issue: "Module not found: @prisma/client"

**Solution**:
```bash
npx prisma generate
npm install
```

### Issue: "Unauthorized" on API calls

**Solution**:
1. Login via frontend (`http://localhost:3001/login`)
2. Open browser DevTools → Application → Cookies
3. Copy `session` cookie value
4. Use in curl: `-H "Cookie: session=YOUR_TOKEN"`

### Issue: Frontend shows empty workflow list

**Possible Causes**:
1. No workflows created yet → Create via Prisma Studio
2. Backend not running → Check `npm run dev`
3. CORS error → Check backend CORS config allows `http://localhost:3001`
4. Wrong organization → Check `organizationId` in workflow matches your user's org

### Issue: Execution status stuck at "pending"

**Possible Causes**:
1. Backend crashed → Check backend console logs
2. Database connection lost → Restart docker-compose
3. setTimeout not firing → Restart backend server

---

## Next Steps After Testing

Once all tests pass:

### 1. Optional Enhancements for Week 3-4
- [ ] Add CreateWorkflowModal component
- [ ] Add toast notifications (react-hot-toast)
- [ ] Add execution details page
- [ ] Add workflow edit/delete UI

### 2. Move to Phase 2 Week 5-8 (Notion MCP)
- [ ] Install Notion SDK
- [ ] Create MCP server for Notion
- [ ] Add Notion connection config to workflows
- [ ] Implement real workflow engine
- [ ] Add Notion read/write actions

### 3. Deploy to Railway
Once local testing is complete:
```bash
git add .
git commit -m "feat: complete Phase 2 Week 3-4 workflow system"
git push
```

Railway will auto-deploy. Verify at: `https://your-app.railway.app`

---

## Test Checklist

Copy this checklist and mark items as you test:

```markdown
### API Tests
- [ ] GET /api/workflows (empty list)
- [ ] POST /api/workflows (create)
- [ ] GET /api/workflows (with data)
- [ ] GET /api/workflows/:id (single workflow)
- [ ] PUT /api/workflows/:id (update)
- [ ] DELETE /api/workflows/:id (delete)
- [ ] POST /api/workflows/:id/execute (execute)
- [ ] GET /api/executions (all executions)
- [ ] GET /api/executions/:id (single execution)

### UI Tests
- [ ] Workflows page - empty state
- [ ] Workflows page - with workflows
- [ ] Execute workflow modal
- [ ] Workflow execution succeeds
- [ ] Executions page - shows history
- [ ] Executions page - filter by status

### Error Handling
- [ ] Execute disabled workflow (404)
- [ ] Execute non-existent workflow (404)
- [ ] Access without auth (401)
- [ ] Cross-tenant access blocked (404)

### Database
- [ ] Workflow table has correct schema
- [ ] WorkflowExecution table has correct schema
- [ ] Foreign key constraints work
- [ ] Status enum values correct

### Multi-Tenancy
- [ ] Workflows filtered by organizationId
- [ ] Executions filtered by workflow.organizationId
- [ ] Cannot access other org's data
```

---

**Testing Status**: Ready to test (requires Docker daemon running)

**Last Updated**: 2026-01-25
