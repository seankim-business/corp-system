# Load Test Quick Reference

## One-Line Setup

```bash
# Generate encryption key, create test DB, run tests
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" && \
createdb nubabel_test && \
DATABASE_URL="postgresql://localhost:5432/nubabel_test" npm run db:migrate && \
ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
TEST_DATABASE_URL="postgresql://localhost:5432/nubabel_test" \
TEST_REDIS_URL="redis://localhost:6379/1" \
npm run test:load
```

## Test Scenarios at a Glance

| Test                       | Requests | Duration | Verifies                 |
| -------------------------- | -------- | -------- | ------------------------ |
| 1. Concurrent Distribution | 1000     | ~10s     | Even load distribution   |
| 2. Rate Limit Handling     | ~750     | 60s      | Throttling works         |
| 3. Failover Performance    | 500      | ~5s      | Circuit breaker failover |
| 4. Quota Exhaustion        | 100      | ~2s      | Graceful degradation     |
| 5. Recovery                | 10       | 70s      | Circuit recovery         |

## Expected Performance

| Metric              | Target      | Acceptable | Critical   |
| ------------------- | ----------- | ---------- | ---------- |
| Throughput          | >1000 req/s | >500 req/s | <100 req/s |
| Response Time (p50) | <50ms       | <100ms     | >200ms     |
| Response Time (p95) | <100ms      | <200ms     | >500ms     |
| Error Rate          | <1%         | <5%        | >10%       |

## Capacity Planning

| Load Level | RPM        | Accounts Needed | Infrastructure                                |
| ---------- | ---------- | --------------- | --------------------------------------------- |
| Low        | <1000      | 2-3 (tier 3/4)  | Single Redis, Standard PostgreSQL             |
| Medium     | 1000-5000  | 3-5 (tier 3/4)  | Redis + persistence, PostgreSQL pooling       |
| High       | 5000-10000 | 5-10 (tier 4)   | Redis Cluster, PostgreSQL replicas            |
| Very High  | >10000     | 10+ (tier 4)    | Redis Cluster + sharding, PostgreSQL sharding |

## Bottlenecks

1. **Redis Capacity Tracking**: Sorted set operations (ZINCRBY, ZRANGEBYSCORE)
2. **Prisma Account Selection**: Multiple queries per request
3. **Circuit Breaker Persistence**: PostgreSQL writes on every success/failure
4. **Account Selection Strategy**: Capacity check for all accounts

## Mitigation Strategies

| Bottleneck          | Solution                        | Impact |
| ------------------- | ------------------------------- | ------ |
| Redis operations    | Pipelining + aggressive TTL     | High   |
| Prisma queries      | Cache circuit state (5s TTL)    | Medium |
| Circuit persistence | Batch updates (every 10 events) | Low    |
| Selection strategy  | Cache capacity stats (1s TTL)   | Medium |

## Monitoring Alerts

| Metric              | Warning | Critical |
| ------------------- | ------- | -------- |
| Error Rate          | >5%     | >10%     |
| Response Time p95   | >200ms  | >500ms   |
| Circuit Opens       | >5/hour | >10/hour |
| Account Utilization | >80%    | >95%     |
| Redis Memory        | >70%    | >90%     |

## Common Issues

### ENCRYPTION_KEY not set

```bash
export ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
```

### Database not found

```bash
createdb nubabel_test
DATABASE_URL="postgresql://localhost:5432/nubabel_test" npm run db:migrate
```

### Redis not running

```bash
redis-server &
export TEST_REDIS_URL="redis://localhost:6379/1"
```

## Results Analysis

```bash
# View latest results
cat tests/load/results/multi-account-stress-*.json | jq '.metrics[] | {testName, successRate: (.successfulRequests / .totalRequests * 100), avgResponseTime, throughput: .requestsPerSecond}'

# Compare error rates
cat tests/load/results/multi-account-stress-*.json | jq '.metrics[] | {testName, errorRate}'

# Check account distribution
cat tests/load/results/multi-account-stress-*.json | jq '.metrics[0].accountDistribution'
```

## CI/CD Integration

```yaml
# .github/workflows/load-tests.yml
- run: npm run test:load
  env:
    TEST_DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
    TEST_REDIS_URL: ${{ secrets.TEST_REDIS_URL }}
    ENCRYPTION_KEY: ${{ secrets.TEST_ENCRYPTION_KEY }}
```

## Safety Checklist

- [ ] Using test database (not production)
- [ ] Using mock API keys (sk-ant-test-\*)
- [ ] Using separate Redis instance
- [ ] Test data cleanup enabled
- [ ] Results directory exists

## Next Steps After Running

1. ✅ Analyze results in `tests/load/results/`
2. ✅ Identify bottlenecks from metrics
3. ✅ Implement monitoring for key metrics
4. ✅ Set up alerting thresholds
5. ✅ Add to CI/CD pipeline
6. ✅ Document capacity limits
7. ✅ Plan scaling strategy
