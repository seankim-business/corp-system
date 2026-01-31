# Load Tests for Multi-Account System

## Overview

This directory contains load tests for the multi-account system. Tests verify system behavior under high concurrency, including:

- Request distribution across accounts
- Rate limit handling and throttling
- Circuit breaker failover performance
- Graceful degradation when all accounts exhausted
- Recovery after circuit breaker opens

## Quick Start

### 1. Setup Test Environment

```bash
# Copy example environment file
cp tests/load/.env.test.example tests/load/.env.test

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Edit .env.test and add:
# - TEST_DATABASE_URL (separate test database!)
# - TEST_REDIS_URL (separate test instance)
# - ENCRYPTION_KEY (generated above)
```

### 2. Prepare Test Database

```bash
# Create test database
createdb nubabel_test

# Run migrations
DATABASE_URL="postgresql://user:pass@localhost:5432/nubabel_test" npm run db:migrate

# Generate Prisma client
npm run db:generate
```

### 3. Run Load Tests

```bash
# Load environment variables
export $(cat tests/load/.env.test | xargs)

# Run all load tests
npm run test:load
```

## Test Scenarios

### Test 1: Concurrent Request Distribution

Sends 1000 concurrent requests and verifies even distribution across accounts.

**Expected Results**:

- Success rate: >95%
- No single account handles >50% of requests
- Response time p95: <100ms

### Test 2: Rate Limit Handling

Sends requests at 150% of account RPM limit over 60 seconds.

**Expected Results**:

- Capacity tracker throttles correctly
- Error rate: <10%
- Response time p95: <200ms

### Test 3: Failover Performance

Simulates account 1 circuit open and verifies failover to remaining accounts.

**Expected Results**:

- Account 1 receives 0 requests
- Requests distributed across accounts 2-5
- Failover latency: <50ms

### Test 4: Quota Exhaustion Scenario

Opens circuits on all accounts and verifies graceful error handling.

**Expected Results**:

- All requests fail gracefully
- Error rate: 100%
- Clear error messages

### Test 5: Recovery After Circuit Open

Opens circuit on account 1, waits 60 seconds, and verifies recovery.

**Expected Results**:

- Circuit transitions: OPEN → HALF_OPEN → CLOSED
- Account 1 re-enters rotation after 3 successes
- Recovery time: ~60 seconds

## Results

Test results are saved to `tests/load/results/` with timestamp:

```
tests/load/results/multi-account-stress-2026-01-30T12-00-00-000Z.json
```

View results:

```bash
# Latest results
cat tests/load/results/multi-account-stress-*.json | jq '.metrics'

# Compare results over time
ls -lt tests/load/results/ | head -5
```

## Configuration

Edit `TEST_CONFIG` in `multi-account-stress.test.ts`:

```typescript
const TEST_CONFIG = {
  CONCURRENT_REQUESTS: 1000,
  RATE_LIMIT_MULTIPLIER: 1.5,
  FAILOVER_REQUESTS: 500,
  QUOTA_EXHAUSTION_REQUESTS: 100,
  CIRCUIT_RECOVERY_WAIT_SECONDS: 60,
};
```

## Safety

**IMPORTANT**: Load tests use test database and mock API keys only.

- Never run against production database
- Never use real Claude API keys
- Always use separate test Redis instance
- Clean up test data after each run

## Troubleshooting

### Error: ENCRYPTION_KEY not set

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env.test
echo "ENCRYPTION_KEY=your-generated-key" >> tests/load/.env.test
```

### Error: Database connection failed

```bash
# Check database exists
psql -l | grep nubabel_test

# Create if missing
createdb nubabel_test

# Run migrations
DATABASE_URL="postgresql://user:pass@localhost:5432/nubabel_test" npm run db:migrate
```

### Error: Redis connection failed

```bash
# Check Redis is running
redis-cli ping

# Start Redis if needed
redis-server

# Use different database for tests
export TEST_REDIS_URL="redis://localhost:6379/1"
```

## Documentation

See `LOAD_TEST_RESULTS.md` for:

- Detailed test scenarios
- Performance benchmarks
- Capacity recommendations
- Bottlenecks identified
- Monitoring recommendations

## CI/CD Integration

Add to GitHub Actions:

```yaml
name: Load Tests

on:
  schedule:
    - cron: "0 0 * * 0" # Weekly on Sunday
  workflow_dispatch:

jobs:
  load-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: nubabel_test
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run db:migrate
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/nubabel_test
      - run: npm run test:load
        env:
          TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/nubabel_test
          TEST_REDIS_URL: redis://localhost:6379
          ENCRYPTION_KEY: ${{ secrets.TEST_ENCRYPTION_KEY }}
      - uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: tests/load/results/
```

## Next Steps

1. Run load tests in staging environment
2. Analyze bottlenecks and optimize hot paths
3. Implement monitoring and alerting
4. Document capacity planning guidelines
5. Set up automated load testing in CI/CD
