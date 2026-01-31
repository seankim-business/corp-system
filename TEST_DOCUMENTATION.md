# Multi-Account Services Test Suite

## Overview

Comprehensive unit and integration tests for the multi-account management system, covering account selection, capacity tracking, circuit breakers, quota monitoring, and alert notifications.

## Test Coverage

### Unit Tests

#### 1. Account Pool Service (`account-pool.service.test.ts`)

- **Coverage**: Account selection, registration, health monitoring, request recording
- **Key Tests**:
  - Select account using least-loaded strategy
  - Return null when no active accounts exist
  - Skip accounts with open circuits
  - Filter by allowedAccountIds
  - Register new account with encrypted API key
  - Reject invalid API key format
  - Reject invalid tier
  - Soft delete account
  - Return health metrics for single/all accounts
  - Record successful/failed requests
  - Handle cache reads with discounted tokens

#### 2. Capacity Tracker (`capacity-tracker.test.ts`)

- **Coverage**: Sliding window rate limiting, Redis operations
- **Key Tests**:
  - Return hasCapacity=true when under all limits
  - Return hasCapacity=false when RPM/TPM/ITPM limit exceeded
  - Fail open when Redis unavailable
  - Increment RPM, TPM, ITPM counters
  - Apply cache discount factor for cache reads
  - Handle Redis errors gracefully
  - Return current usage statistics
  - Remove expired buckets from all keys

#### 3. Circuit Breaker (`circuit-breaker.test.ts`)

- **Coverage**: State transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)
- **Key Tests**:
  - Record success and reset failure counter
  - Record failure and increment counter
  - Open circuit after threshold failures (5)
  - Transition to HALF_OPEN after recovery timeout (60s)
  - Close circuit after threshold successes (3)
  - Reopen circuit if failure in HALF_OPEN state
  - Get circuit breaker statistics
  - Manual reset

#### 4. Account Selector (`account-selector.test.ts`)

- **Coverage**: All 4 selection strategies
- **Key Tests**:
  - Round-robin strategy
  - Least-loaded strategy
  - Priority-weighted strategy
  - Capacity-aware strategy
  - Register and retrieve strategies
  - Throw error for unknown strategy
  - Filter to only active accounts

#### 5. Quota Monitor Service (`quota-monitor.service.test.ts`)

- **Coverage**: Admin API sync, threshold detection, alert creation
- **Key Tests**:
  - Sync usage for all active accounts
  - Sync usage for specific account
  - Skip accounts without apiKeyId
  - Continue syncing if one account fails
  - Create warning alert at 80% usage
  - Create critical alert at 95% usage
  - Create quota_exceeded alert at 100% and set status to exhausted
  - Not create alert when under 80% usage
  - Not create duplicate alerts
  - Resolve alert
  - Get unresolved/all alerts
  - Start/stop scheduled sync

#### 6. Alert Service (`alert.service.test.ts`)

- **Coverage**: Slack notifications, Block Kit formatting, cooldown management
- **Key Tests**:
  - Send quota alert with Block Kit formatting
  - Skip alert if in cooldown period
  - Skip alert if Slack integration not available
  - Use critical emoji and color for critical alerts
  - Handle Slack API errors gracefully
  - Send circuit breaker alert with account details
  - Send all accounts exhausted alert with @channel mention
  - Check if alert is in cooldown
  - Clear cooldown

#### 7. QA Orchestrator Service (`qa-orchestrator.service.test.ts`)

- **Coverage**: Deployment monitoring, Playwright smoke tests, Slack reporting
- **Key Tests**:
  - Complete full workflow when deployment succeeds
  - Handle deployment failure
  - Poll deployment status until completion
  - Detect console errors during smoke tests
  - Handle navigation failures
  - Always close Playwright after tests
  - Return build failure details
  - Post PASS/FAIL results with correct formatting
  - Upload screenshot if available
  - Handle Slack API errors gracefully

### Integration Tests

#### 1. Multi-Account Flow (`multi-account-flow.test.ts`)

- **Coverage**: End-to-end multi-account workflows
- **Key Tests**:
  - Complete full multi-account workflow:
    - Register 3 accounts with different tiers (tier1, tier3, tier4)
    - Select account with least-loaded strategy
    - Verify tier4 account selected (highest capacity)
    - Record successful API request
    - Verify usage tracking (Redis + database)
  - Handle 429 error and failover:
    - Select first account
    - Simulate 5 consecutive failures (429 errors)
    - Verify circuit opens for first account
    - Select second account (failover)
    - Verify second account selected
  - Return null when all accounts exhausted:
    - All accounts have open circuits
    - Verify no account selected
  - Track usage correctly with cache reads:
    - Record request with cache read flag
    - Verify 10% discount applied (10,000 tokens → 1,000 effective)

#### 2. Circuit Breaker Flow (`circuit-breaker-flow.test.ts`)

- **Coverage**: Circuit breaker state machine
- **Key Tests**:
  - Simulate 5 consecutive failures
  - Verify circuit opens
  - Wait 60 seconds (recovery timeout)
  - Verify circuit half-opens
  - Simulate success
  - Verify circuit closes

#### 3. Quota Monitoring (`quota-monitoring.test.ts`)

- **Coverage**: Admin API integration, threshold alerts, Slack notifications
- **Key Tests**:
  - Mock Admin API responses
  - Sync usage data
  - Verify threshold alerts created at 80%, 95%, 100%
  - Verify Slack notifications sent with correct formatting

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test Suite

```bash
npm test -- --testPathPattern="account-pool"
npm test -- --testPathPattern="capacity-tracker"
npm test -- --testPathPattern="quota-monitor"
npm test -- --testPathPattern="alert.service"
npm test -- --testPathPattern="qa-orchestrator"
npm test -- --testPathPattern="multi-account-flow"
```

### With Coverage

```bash
npm test -- --coverage --testPathPattern="account-pool|monitoring"
```

### Watch Mode

```bash
npm run test:watch
```

## Test Environment Setup

### Environment Variables

```bash
# Required for tests
DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/nubabel_test
REDIS_URL=redis://localhost:6379/1
ENCRYPTION_KEY=<32-byte-hex-key>

# Optional for integration tests
SLACK_BOT_TOKEN=xoxb-test-token
ANTHROPIC_ADMIN_API_KEY=sk-ant-admin-test
```

### Database Setup

```bash
# Create test database
createdb nubabel_test

# Run migrations
DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy
DATABASE_URL=$DATABASE_URL_TEST npx prisma generate
```

### Redis Setup

Tests use Redis database 1 (separate from production database 0).

```bash
# Default Redis runs on localhost:6379
# Tests automatically use database 1
```

## Mocking Strategy

### External Services

- **Slack API**: Mocked with `jest.mock('@slack/web-api')`
- **Claude API**: Mocked with `jest.mock('@anthropic-ai/sdk')`
- **Railway CLI**: Mocked with `jest.mock('./railway.service')`
- **Playwright**: Mocked with `jest.mock('./playwright.service')`

### Database

- **Prisma Client**: Mocked with `jest.mock('../../db/client')`
- **Redis**: Mocked with `jest.mock('../../db/redis')`

### Test Isolation

- Each test suite uses `beforeEach` to reset mocks
- Tests do not share state
- All external calls are mocked (no network requests)

## Coverage Goals

| Service               | Target Coverage | Current Status |
| --------------------- | --------------- | -------------- |
| Account Pool Service  | 80%+            | ✅ Implemented |
| Capacity Tracker      | 80%+            | ✅ Implemented |
| Circuit Breaker       | 80%+            | ✅ Implemented |
| Account Selector      | 80%+            | ✅ Implemented |
| Quota Monitor         | 80%+            | ✅ Implemented |
| Alert Service         | 80%+            | ✅ Implemented |
| QA Orchestrator       | 80%+            | ✅ Implemented |
| **Integration Tests** | -               | ✅ Implemented |

## Known Issues

### 1. Encryption Key Required

Some tests require `ENCRYPTION_KEY` environment variable:

```bash
export ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 2. TypeScript Errors

Some tests have TypeScript errors due to Prisma schema mismatches:

- `claudeAccount` property not found (requires migration)
- `timestamp` field in UsageDataPoint (API type mismatch)

### 3. Test Database Migration

Tests will fail until database migration is applied:

```bash
npx prisma migrate deploy
npx prisma generate
```

## Future Improvements

- [ ] Add E2E tests with real Slack Bot
- [ ] Add performance benchmarks for capacity tracker
- [ ] Add contract tests for Admin API
- [ ] Add snapshot tests for Slack message formatting
- [ ] Add load tests for concurrent account selection
- [ ] Increase coverage to 90%+ for all services
- [ ] Add mutation testing with Stryker

## Test Maintenance

### Adding New Tests

1. Create test file co-located with source: `service-name.test.ts`
2. Follow existing test structure (describe/it blocks)
3. Mock all external dependencies
4. Use descriptive test names
5. Test both success and error cases
6. Verify edge cases (null, empty, race conditions)

### Updating Tests

1. Run tests after code changes: `npm test`
2. Update mocks if interfaces change
3. Add tests for new functionality
4. Remove tests for deprecated features
5. Keep test documentation up to date

## CI/CD Integration

Tests run automatically on:

- Pull request creation
- Commit to `main` branch
- Manual workflow dispatch

Required secrets:

- `DATABASE_URL` (test database)
- `REDIS_URL` (test Redis instance)
- `ENCRYPTION_KEY` (32-byte hex key)
