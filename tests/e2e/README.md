# E2E Tests for QA Automation Flow

Comprehensive end-to-end tests for Railway + Playwright + Slack integration using Playwright Test framework.

## Test Suites

### 1. Multi-Account Admin UI (`multi-account-admin-ui.spec.ts`)

Tests for the multi-account administration dashboard.

**Coverage:**

- ✅ Load accounts list
- ✅ Add new account via registration form
- ✅ Navigate to account details page
- ✅ Display health metrics
- ✅ Trigger sync and verify completion
- ✅ Form validation errors
- ✅ Filter accounts by status
- ✅ Search accounts by email

**Total Tests:** 8

### 2. Agent Activity Real-time (`agent-activity-realtime.spec.ts`)

Tests for real-time agent activity monitoring with Server-Sent Events (SSE).

**Coverage:**

- ✅ SSE connection establishment
- ✅ Real-time activity updates
- ✅ Status progression (started → in_progress → completed)
- ✅ Token usage display
- ✅ Filter by status
- ✅ Filter by agent type
- ✅ Filter by date range
- ✅ SSE reconnection on connection loss
- ✅ Activity details modal
- ✅ Clear all filters

**Total Tests:** 10

### 3. QA Orchestrator Flow (`qa-orchestrator-flow.spec.ts`)

Tests for the complete QA orchestration workflow.

**Coverage:**

- ✅ Mock Railway deployment status
- ✅ Poll Railway status until SUCCESS
- ✅ Launch Playwright browser after deployment
- ✅ Verify page loads correctly
- ✅ Capture screenshot on completion
- ✅ Post results to Slack (mocked)
- ✅ Handle deployment failure gracefully
- ✅ Display build errors
- ✅ Timeout handling
- ✅ Manual retry after failure

**Total Tests:** 10

## Running Tests

### Run all E2E tests

```bash
npm run test:e2e
```

### Run specific test file

```bash
npx playwright test tests/e2e/multi-account-admin-ui.spec.ts
```

### Run in headed mode (see browser)

```bash
npm run test:e2e:headed
```

### Run with UI mode (interactive)

```bash
npm run test:e2e:ui
```

### Generate and view HTML report

```bash
npm run test:e2e:report
```

## Configuration

Tests are configured in `playwright.config.ts`:

- **Base URL:** `process.env.BASE_URL` or `http://localhost:3000`
- **Browser:** Chrome (via `channel: 'chrome'`)
- **Timeout:** 60 seconds per test
- **Retries:** 2 on CI, 0 locally
- **Screenshots:** Captured on failure
- **Videos:** Retained on failure
- **Traces:** Captured on first retry

## Test Fixtures

Reusable test fixtures are available in `tests/e2e/fixtures/test-fixtures.ts`:

- `railwayService`: Railway API service instance
- `playwrightTestService`: Playwright service with auto-cleanup

## Environment Variables

Required for tests:

```bash
BASE_URL=http://localhost:3000
RAILWAY_API_TOKEN=your-railway-token
SLACK_BOT_TOKEN=xoxb-your-bot-token
```

## Best Practices

1. **Use proper locators:** Prefer `data-testid` attributes over CSS selectors
2. **Avoid hardcoded waits:** Use `waitForSelector` and `expect` with timeouts
3. **Mock external services:** Use `page.route()` for Railway API and Slack webhooks
4. **Clean up resources:** Always close browser contexts in `afterAll` hooks
5. **Capture screenshots on failure:** Automatic via Playwright config

## Debugging

### View test traces

```bash
npx playwright show-trace test-results/trace.zip
```

### Run single test in debug mode

```bash
npx playwright test --debug tests/e2e/multi-account-admin-ui.spec.ts:11
```

### Inspect selectors

```bash
npx playwright codegen http://localhost:3000
```

## CI/CD Integration

Tests run automatically on CI with:

- Headless mode enabled
- 2 retries per test
- Sequential execution (workers=1)
- HTML report generation

## Troubleshooting

### Tests fail with "Cannot find module '@playwright/test'"

```bash
npm install --save-dev @playwright/test
```

### Chrome not installed

```bash
npx playwright install chrome
```

### Port 3000 already in use

```bash
export BASE_URL=http://localhost:3001
npm run test:e2e
```

### Screenshots not captured

Check `playwright.config.ts` has `screenshot: 'only-on-failure'`

## Test Results

After running tests, view results:

- **Console output:** Real-time test status
- **HTML report:** `playwright-report/index.html`
- **JSON results:** `playwright-report/results.json`
- **Screenshots:** `test-results/` directory
- **Videos:** `test-results/` directory (on failure)

## Contributing

When adding new tests:

1. Follow existing naming conventions
2. Use descriptive test names
3. Add proper `data-testid` attributes to UI components
4. Mock external API calls
5. Clean up resources in `afterAll` hooks
6. Update this README with new test coverage
