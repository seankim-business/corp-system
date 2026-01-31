# E2E Tests Implementation Checklist

## ✅ COMPLETED TASKS

### Configuration & Setup

- [x] Created `playwright.config.ts` with production settings
- [x] Installed `@playwright/test` v1.58.0
- [x] Verified Chrome browser installation
- [x] Added npm scripts to `package.json`
- [x] Added test artifacts to `.gitignore`

### Test Files Created

- [x] `tests/e2e/multi-account-admin-ui.spec.ts` (8 tests)
- [x] `tests/e2e/agent-activity-realtime.spec.ts` (10 tests)
- [x] `tests/e2e/qa-orchestrator-flow.spec.ts` (10 tests)
- [x] `tests/e2e/fixtures/test-fixtures.ts` (reusable fixtures)

### Documentation

- [x] Created `tests/e2e/README.md` (comprehensive test guide)
- [x] Created `E2E_TESTS_SUMMARY.md` (implementation summary)
- [x] Created `E2E_TESTS_CHECKLIST.md` (this file)

### Test Coverage

- [x] Multi-account admin UI flows
- [x] Real-time SSE updates
- [x] QA orchestrator workflow
- [x] Railway deployment mocking
- [x] Slack webhook mocking
- [x] Error scenarios
- [x] Screenshot capture
- [x] Form validation
- [x] Filtering and search

## 📊 Test Statistics

```
Total Tests: 28
Test Files: 3
Framework: Playwright Test v1.58.0
Browser: Chrome (stable)
```

## 🚀 Quick Start Commands

```bash
# List all tests
npx playwright test --list

# Run all tests
npm run test:e2e

# Run specific suite
npx playwright test tests/e2e/multi-account-admin-ui.spec.ts

# Run in UI mode
npm run test:e2e:ui

# Run in headed mode (see browser)
npm run test:e2e:headed

# Generate HTML report
npm run test:e2e:report
```

## 📋 NEXT STEPS (For UI Implementation)

### 1. Add `data-testid` Attributes to UI Components

#### Multi-Account Admin UI

```tsx
// Accounts list page
<h1>Accounts</h1>
<div data-testid="accounts-list">
  <div data-testid="account-row">
    <span data-testid="account-email">user@example.com</span>
    <span data-testid="account-status">Active</span>
  </div>
</div>
<button data-testid="add-account-button">Add Account</button>
<input data-testid="search-input" placeholder="Search..." />
<select data-testid="status-filter">
  <option value="all">All</option>
  <option value="active">Active</option>
</select>

// Account registration form
<h2>Add Account</h2>
<input data-testid="account-email" type="email" />
<input data-testid="account-password" type="password" />
<input data-testid="account-name" type="text" />
<button data-testid="submit-account-button">Submit</button>
<div data-testid="success-message">Account created successfully</div>
<div data-testid="error-email">Email is required</div>
<div data-testid="error-password">Password is required</div>

// Account details page
<h1>Account Details</h1>
<div data-testid="health-metrics">
  <div data-testid="metric-status">Status: Healthy</div>
  <div data-testid="metric-uptime">Uptime: 99.9%</div>
  <div data-testid="metric-requests">Requests: 1,234</div>
</div>
<button data-testid="sync-now-button">Sync Now</button>
<div data-testid="sync-status">Syncing...</div>
<div data-testid="last-sync-time">Last sync: 2 minutes ago</div>
```

#### Agent Activity Real-time

```tsx
// Activity page
<h1>Agent Activity</h1>
<div data-testid="sse-status">Connected</div>
<div data-testid="activity-list">
  <div data-testid="activity-item">
    <span data-testid="status-badge">Completed</span>
    <span data-testid="agent-type">Executor</span>
    <span data-testid="token-usage">1,234 tokens</span>
  </div>
</div>

// Filters
<select data-testid="status-filter">
  <option value="all">All</option>
  <option value="completed">Completed</option>
</select>
<select data-testid="agent-type-filter">
  <option value="all">All</option>
  <option value="executor">Executor</option>
</select>
<input data-testid="date-from" type="date" />
<input data-testid="date-to" type="date" />
<button data-testid="apply-date-filter">Apply</button>
<button data-testid="clear-filters">Clear Filters</button>

// Activity details modal
<div data-testid="activity-details-modal">
  <div data-testid="detail-agent-type">Executor</div>
  <div data-testid="detail-status">Completed</div>
  <div data-testid="detail-timestamp">2024-01-30 10:30:00</div>
  <div data-testid="detail-duration">5.2s</div>
</div>
```

#### QA Orchestrator Flow

```tsx
// QA orchestrator page
<button data-testid="start-qa-button">Start QA</button>
<div data-testid="deployment-status">SUCCESS</div>
<div data-testid="browser-status">Ready</div>
<div data-testid="page-load-status">Loaded</div>
<div data-testid="screenshot-status">Captured</div>
<div data-testid="slack-status">Posted</div>
<div data-testid="tested-url">https://auth.nubabel.com</div>
<a data-testid="screenshot-link" href="/screenshots/test.png">View Screenshot</a>
<div data-testid="error-message">Deployment failed</div>
<div data-testid="build-errors">
  <div data-testid="error-item">Error: Module not found</div>
</div>
<div data-testid="timeout-error">Timeout exceeded</div>
<button data-testid="retry-button">Retry</button>
```

### 2. Implement API Endpoints

#### Test Trigger Endpoint

```typescript
// src/api/test-helpers.ts
router.post("/api/test/trigger-agent", async (req, res) => {
  // Trigger a test agent execution
  // Emit SSE event for real-time updates
  res.json({ success: true });
});
```

#### Railway Status Endpoint

```typescript
// src/api/railway.ts
router.get("/api/railway/status", async (req, res) => {
  const status = await railwayService.getStatus();
  res.json(status);
});

router.get("/api/railway/logs", async (req, res) => {
  const logs = await railwayService.getLogs();
  res.json({ errors: logs.errors });
});
```

#### Slack Webhook Endpoint

```typescript
// src/api/slack.ts
router.post("/api/slack/webhook", async (req, res) => {
  // Handle Slack webhook
  res.json({ ok: true });
});
```

### 3. Set Environment Variables

```bash
# .env
BASE_URL=http://localhost:3000
RAILWAY_API_TOKEN=your-railway-token
SLACK_BOT_TOKEN=xoxb-your-bot-token
```

### 4. Run Tests

```bash
# Start development server
npm run dev

# In another terminal, run tests
npm run test:e2e
```

## ✅ Verification Steps

1. **Verify test files exist:**

   ```bash
   ls -la tests/e2e/*.spec.ts
   ```

2. **Verify Playwright is installed:**

   ```bash
   npx playwright --version
   ```

3. **Verify Chrome is installed:**

   ```bash
   npx playwright install chrome
   ```

4. **List all tests:**

   ```bash
   npx playwright test --list
   ```

   Expected output: `Total: 28 tests in 3 files`

5. **Verify npm scripts:**
   ```bash
   npm run test:e2e -- --help
   ```

## 🎯 Success Criteria

- [x] All 28 tests are recognized by Playwright
- [x] Configuration file is valid
- [x] Test fixtures are properly structured
- [x] Documentation is comprehensive
- [x] npm scripts are working
- [ ] UI components have `data-testid` attributes (pending)
- [ ] API endpoints are implemented (pending)
- [ ] Tests pass when run (pending UI/API implementation)

## 📝 Notes

- Tests use proper Page Object Model patterns
- All external services are mocked
- Screenshots captured automatically on failure
- Tests follow Playwright best practices
- No hardcoded waits (uses proper locators)
- Proper resource cleanup in afterAll hooks

## 🔗 Related Files

- `playwright.config.ts` - Playwright configuration
- `tests/e2e/README.md` - Test documentation
- `E2E_TESTS_SUMMARY.md` - Implementation summary
- `package.json` - npm scripts
- `.gitignore` - Test artifacts exclusion

---

**Status:** ✅ **TESTS CREATED AND READY**
**Next:** Add `data-testid` attributes to UI components and implement API endpoints
