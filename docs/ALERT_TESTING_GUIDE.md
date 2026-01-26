# Alert Rules Testing Guide

**Last Updated**: 2026-01-26  
**Status**: Production Ready  
**Audience**: QA Engineers, DevOps, SRE

---

## Overview

This guide provides comprehensive testing procedures for Prometheus alert rules. Testing ensures alerts fire correctly and notifications are delivered reliably.

---

## Testing Strategy

### Test Levels

| Level           | Scope                        | Frequency      | Owner  |
| --------------- | ---------------------------- | -------------- | ------ |
| **Unit**        | Individual alert expressions | Per deployment | DevOps |
| **Integration** | Alert → Notification flow    | Weekly         | QA     |
| **End-to-End**  | Full incident response       | Monthly        | SRE    |
| **Chaos**       | Failure scenarios            | Quarterly      | SRE    |

### Test Checklist

Before deploying alerts to production:

- [ ] All alert expressions validated with `promtool`
- [ ] All alert thresholds tested with synthetic data
- [ ] All notification channels tested
- [ ] All runbooks verified as accurate
- [ ] Alert grouping and inhibition rules tested
- [ ] False positive rate < 5%

---

## Unit Testing: Alert Expressions

### Validate Syntax

```bash
# Install promtool
go install github.com/prometheus/prometheus/cmd/promtool@latest

# Validate alert rules
promtool check rules config/prometheus-alerts.yml

# Expected output:
# Checking config/prometheus-alerts.yml
#   PASS
```

### Test Individual Expressions

#### Test Error Rate Alert

```bash
# Query Prometheus for error rate
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=(sum(rate(http_requests_total{status=~"5.."}[5m])) by (job) / sum(rate(http_requests_total[5m])) by (job)) > 0.05'

# Expected response:
# {
#   "status": "success",
#   "data": {
#     "resultType": "vector",
#     "result": [
#       {
#         "metric": {"job": "nubabel-api"},
#         "value": [1234567890, "0.052"]
#       }
#     ]
#   }
# }
```

#### Test Latency Alert

```bash
# Query P95 latency
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, job))'

# Expected: value > 2 seconds triggers alert
```

#### Test Circuit Breaker Alert

```bash
# Query circuit breaker state
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=circuit_breaker_state{state="open"}'

# Expected: value == 1 triggers alert
```

### Test with Synthetic Data

Create test data to verify alert expressions:

```bash
# Generate synthetic error rate
# This script creates 100 requests with 10% error rate
for i in {1..100}; do
  if [ $((RANDOM % 10)) -eq 0 ]; then
    # 10% errors
    curl -X POST http://api:3000/test-endpoint \
      -H "X-Test-Error: true" \
      -s > /dev/null
  else
    # 90% success
    curl -X POST http://api:3000/test-endpoint \
      -s > /dev/null
  fi
  sleep 0.5
done

# Wait 5 minutes for metrics to accumulate
sleep 300

# Check if alert fires
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=ALERTS{alertname="HighErrorRate"}'
```

---

## Integration Testing: Alert Firing

### Test Alert Firing

#### Setup Test Environment

```bash
# Start test containers
docker-compose -f docker-compose.test.yml up -d

# Verify Prometheus is running
curl http://localhost:9090/-/healthy

# Verify Alert Manager is running
curl http://localhost:9093/-/healthy
```

#### Test High Error Rate Alert

```bash
#!/bin/bash
# test-high-error-rate.sh

echo "Testing HighErrorRate alert..."

# Generate errors
for i in {1..100}; do
  curl -X POST http://api:3000/debug/error-test \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"message": "test error"}' \
    -s > /dev/null &
done

wait

# Wait for metrics to be scraped and evaluated
echo "Waiting 5 minutes for alert to fire..."
sleep 300

# Check if alert is firing
ALERT=$(curl -s http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.labels.alertname == "HighErrorRate")')

if [ -z "$ALERT" ]; then
  echo "❌ FAIL: Alert did not fire"
  exit 1
else
  echo "✅ PASS: Alert fired"
  echo "$ALERT" | jq .
fi
```

#### Test Circuit Breaker Alert

```bash
#!/bin/bash
# test-circuit-breaker.sh

echo "Testing CircuitBreakerOpen alert..."

# Disable AI API to trigger circuit breaker
export ANTHROPIC_API_KEY=""

# Make requests that will fail
for i in {1..50}; do
  curl -X POST http://api:3000/api/workflows/test/execute \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"input": "test"}' \
    -s > /dev/null &
done

wait

# Wait for circuit breaker to open
echo "Waiting 2 minutes for circuit breaker to open..."
sleep 120

# Check if alert is firing
ALERT=$(curl -s http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.labels.alertname == "CircuitBreakerOpen")')

if [ -z "$ALERT" ]; then
  echo "❌ FAIL: Alert did not fire"
  exit 1
else
  echo "✅ PASS: Alert fired"
  echo "$ALERT" | jq .
fi

# Restore API key
unset ANTHROPIC_API_KEY
```

#### Test Queue Depth Alert

```bash
#!/bin/bash
# test-queue-depth.sh

echo "Testing HighQueueDepth alert..."

# Pause worker to accumulate jobs
docker pause nubabel-orchestration-worker

# Add jobs to queue
for i in {1..1500}; do
  curl -X POST http://api:3000/api/workflows/test/execute \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"input": "test"}' \
    -s > /dev/null &
done

wait

# Wait for queue depth to exceed threshold
echo "Waiting 5 minutes for queue depth alert..."
sleep 300

# Check if alert is firing
ALERT=$(curl -s http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.labels.alertname == "HighQueueDepth")')

if [ -z "$ALERT" ]; then
  echo "❌ FAIL: Alert did not fire"
  exit 1
else
  echo "✅ PASS: Alert fired"
  echo "$ALERT" | jq .
fi

# Resume worker
docker unpause nubabel-orchestration-worker
```

#### Test Memory Alert

```bash
#!/bin/bash
# test-memory-alert.sh

echo "Testing HighMemoryUsage alert..."

# Trigger memory leak
curl -X POST http://api:3000/debug/memory-leak \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"size_mb": 500}' \
  -s > /dev/null

# Wait for memory to accumulate
echo "Waiting 5 minutes for memory alert..."
sleep 300

# Check if alert is firing
ALERT=$(curl -s http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.labels.alertname == "HighMemoryUsage")')

if [ -z "$ALERT" ]; then
  echo "❌ FAIL: Alert did not fire"
  exit 1
else
  echo "✅ PASS: Alert fired"
  echo "$ALERT" | jq .
fi
```

---

## Notification Testing

### Test Slack Notifications

#### Setup Slack Webhook

1. Create test Slack channel: `#alerts-test`
2. Create incoming webhook: https://api.slack.com/apps
3. Add webhook URL to Alert Manager config

#### Test Notification Delivery

```bash
#!/bin/bash
# test-slack-notification.sh

echo "Testing Slack notification..."

# Trigger alert
curl -X POST http://api:3000/debug/error-test \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"message": "test"}' \
  -s > /dev/null

# Wait for alert to fire and notification to be sent
sleep 300

# Check Slack channel for message
# (Manual verification required)
echo "Check #alerts-test channel for notification"
```

#### Test Notification Format

Verify notification includes:

- [ ] Alert name
- [ ] Severity level
- [ ] Description with current value
- [ ] Runbook link
- [ ] Dashboard link
- [ ] Timestamp

### Test Email Notifications

```bash
#!/bin/bash
# test-email-notification.sh

echo "Testing email notification..."

# Trigger critical alert
curl -X POST http://api:3000/debug/error-test \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"message": "test"}' \
  -s > /dev/null

# Wait for notification
sleep 300

# Check email inbox
# (Manual verification required)
echo "Check email for notification"
```

### Test PagerDuty Notifications

```bash
#!/bin/bash
# test-pagerduty-notification.sh

echo "Testing PagerDuty notification..."

# Trigger critical alert
curl -X POST http://api:3000/debug/error-test \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"message": "test"}' \
  -s > /dev/null

# Wait for notification
sleep 300

# Check PagerDuty incidents
# (Manual verification required)
echo "Check PagerDuty for incident"
```

---

## End-to-End Testing

### Full Incident Response Test

```bash
#!/bin/bash
# test-full-incident-response.sh

set -e

echo "=== Full Incident Response Test ==="

# 1. Trigger alert
echo "1. Triggering HighErrorRate alert..."
for i in {1..100}; do
  curl -X POST http://api:3000/debug/error-test \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"message": "test"}' \
    -s > /dev/null &
done
wait

# 2. Wait for alert to fire
echo "2. Waiting for alert to fire..."
sleep 300

# 3. Verify alert is firing
echo "3. Verifying alert is firing..."
ALERT=$(curl -s http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.labels.alertname == "HighErrorRate")')

if [ -z "$ALERT" ]; then
  echo "❌ FAIL: Alert did not fire"
  exit 1
fi

echo "✅ Alert is firing"

# 4. Verify notification was sent
echo "4. Verifying notification was sent..."
# (Manual verification in Slack/Email/PagerDuty)

# 5. Verify runbook is accessible
echo "5. Verifying runbook..."
RUNBOOK=$(echo "$ALERT" | jq -r '.annotations.runbook')
curl -s "$RUNBOOK" > /dev/null || {
  echo "❌ FAIL: Runbook not accessible: $RUNBOOK"
  exit 1
}
echo "✅ Runbook is accessible"

# 6. Verify dashboard is accessible
echo "6. Verifying dashboard..."
DASHBOARD=$(echo "$ALERT" | jq -r '.annotations.dashboard')
curl -s "$DASHBOARD" > /dev/null || {
  echo "❌ FAIL: Dashboard not accessible: $DASHBOARD"
  exit 1
}
echo "✅ Dashboard is accessible"

# 7. Resolve alert
echo "7. Resolving alert..."
# Stop generating errors
# (Implementation depends on your test setup)

# 8. Verify alert resolves
echo "8. Waiting for alert to resolve..."
sleep 300

ALERT=$(curl -s http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.labels.alertname == "HighErrorRate")')

if [ -z "$ALERT" ]; then
  echo "✅ Alert resolved"
else
  echo "⚠️  Alert still firing (may be expected)"
fi

echo ""
echo "=== Test Complete ==="
```

---

## Chaos Testing

### Test Failure Scenarios

#### Prometheus Down

```bash
# Stop Prometheus
docker stop prometheus

# Verify Alert Manager detects it
sleep 60

curl http://localhost:9093/api/v1/alerts | \
  jq '.data[] | select(.labels.alertname == "PrometheusDown")'

# Restart Prometheus
docker start prometheus
```

#### Alert Manager Down

```bash
# Stop Alert Manager
docker stop alertmanager

# Verify Prometheus detects it
sleep 60

curl http://localhost:9090/api/v1/query \
  --data-urlencode 'query=up{job="alertmanager"}'

# Restart Alert Manager
docker start alertmanager
```

#### Notification Channel Down

```bash
# Disable Slack webhook
# (Update config to invalid URL)

# Trigger alert
curl -X POST http://api:3000/debug/error-test \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"message": "test"}' \
  -s > /dev/null

# Wait for alert
sleep 300

# Verify Alert Manager retries
curl http://localhost:9093/api/v1/alerts | jq .

# Re-enable webhook
# (Restore valid URL)
```

---

## Performance Testing

### Load Test Alerts

```bash
#!/bin/bash
# test-alert-performance.sh

echo "Testing alert performance under load..."

# Generate high volume of requests
ab -n 10000 -c 100 http://api:3000/api/health

# Monitor Prometheus performance
echo "Prometheus memory usage:"
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=process_resident_memory_bytes{job="prometheus"}' | \
  jq '.data.result[0].value[1]'

echo "Prometheus query latency:"
curl -s http://localhost:9090/api/v1/query \
  --data-urlencode 'query=prometheus_tsdb_symbol_table_size_bytes' | \
  jq '.data.result[0].value[1]'

# Verify alerts still fire
curl http://localhost:9093/api/v1/alerts | jq '.data | length'
```

---

## Automated Testing

### CI/CD Integration

Add alert testing to CI/CD pipeline:

```yaml
# .github/workflows/alert-tests.yml
name: Alert Tests

on:
  push:
    paths:
      - "config/prometheus-alerts.yml"
  pull_request:
    paths:
      - "config/prometheus-alerts.yml"

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install promtool
        run: |
          go install github.com/prometheus/prometheus/cmd/promtool@latest

      - name: Validate alert rules
        run: |
          promtool check rules config/prometheus-alerts.yml

      - name: Check for required annotations
        run: |
          # Verify all alerts have runbook and dashboard
          grep -E 'runbook:|dashboard:' config/prometheus-alerts.yml | \
            wc -l | grep -q 60  # 30 alerts * 2 annotations
```

### Weekly Test Schedule

```bash
# crontab entry for weekly alert tests
0 9 * * MON /opt/nubabel/scripts/test-all-alerts.sh
```

---

## Test Results Tracking

### Test Report Template

```markdown
# Alert Testing Report

**Date**: 2026-01-26  
**Tester**: DevOps Team  
**Status**: ✅ PASS

## Test Summary

| Alert              | Status  | Notes                 |
| ------------------ | ------- | --------------------- |
| HighErrorRate      | ✅ PASS | Fired after 5 minutes |
| HighP95Latency     | ✅ PASS | Fired after 5 minutes |
| CircuitBreakerOpen | ✅ PASS | Fired after 1 minute  |
| HighQueueDepth     | ✅ PASS | Fired after 5 minutes |
| HighMemoryUsage    | ✅ PASS | Fired after 5 minutes |

## Notification Tests

| Channel   | Status  | Notes                       |
| --------- | ------- | --------------------------- |
| Slack     | ✅ PASS | Message received in #alerts |
| Email     | ✅ PASS | Email received in 2 minutes |
| PagerDuty | ✅ PASS | Incident created            |

## Issues Found

None

## Recommendations

1. Increase P95 latency threshold from 2s to 2.5s (too many false positives)
2. Add alert for database replication lag
3. Update runbook for circuit breaker alert

## Sign-off

- [ ] All tests passed
- [ ] No critical issues
- [ ] Ready for production
```

---

## Troubleshooting Test Failures

### Alert Not Firing

**Symptoms**: Alert expression is correct but alert doesn't fire

**Diagnosis**:

```bash
# 1. Check metrics exist
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=http_requests_total'

# 2. Check metric values
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=rate(http_requests_total[5m])'

# 3. Check alert rule is loaded
curl 'http://prometheus:9090/api/v1/rules' | \
  jq '.data.groups[] | select(.name == "sli_slo_alerts")'

# 4. Check alert state
curl 'http://prometheus:9090/api/v1/alerts' | \
  jq '.data[] | select(.labels.alertname == "HighErrorRate")'
```

**Solution**:

- Verify metrics are being scraped
- Verify threshold is correct
- Verify `for` duration has elapsed
- Check Prometheus logs for errors

### Notification Not Received

**Symptoms**: Alert fires but notification not received

**Diagnosis**:

```bash
# 1. Check Alert Manager received alert
curl 'http://localhost:9093/api/v1/alerts' | \
  jq '.data[] | select(.labels.alertname == "HighErrorRate")'

# 2. Check Alert Manager config
curl 'http://localhost:9093/api/v1/status' | jq .

# 3. Check Alert Manager logs
docker logs alertmanager | tail -50
```

**Solution**:

- Verify webhook URL is correct
- Verify credentials are valid
- Check Alert Manager logs for errors
- Test webhook manually

---

## Best Practices

1. **Test before deploying**: Always test new alerts in staging
2. **Document test results**: Keep records of all test runs
3. **Test regularly**: Run full test suite weekly
4. **Automate tests**: Use CI/CD to validate alert rules
5. **Monitor false positives**: Track and adjust thresholds
6. **Update runbooks**: Keep runbooks in sync with alerts

---

## References

- [Prometheus Testing Guide](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/)
- [Alert Manager Testing](https://prometheus.io/docs/alerting/latest/overview/)
- [Promtool Documentation](https://prometheus.io/docs/prometheus/latest/command-line/promtool/)

---

**Questions?** Contact: devops@nubabel.com
