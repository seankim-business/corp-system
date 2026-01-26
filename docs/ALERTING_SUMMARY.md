# Prometheus Alerting - Complete Summary

**Last Updated**: 2026-01-26  
**Status**: Production Ready  
**Audience**: All Teams

---

## What Was Created

This package provides comprehensive production-grade alerting for Nubabel using Prometheus and Alert Manager.

### Deliverables

| File                                 | Purpose                                        | Status      |
| ------------------------------------ | ---------------------------------------------- | ----------- |
| `config/prometheus-alerts.yml`       | 30+ alert rules covering all critical systems  | ✅ Complete |
| `docs/ALERTING_SETUP.md`             | Complete setup guide for Railway/Grafana Cloud | ✅ Complete |
| `docs/ALERT_TESTING_GUIDE.md`        | Comprehensive testing procedures               | ✅ Complete |
| `docs/ALERT_INTEGRATION_EXAMPLES.md` | Copy-paste ready integration configs           | ✅ Complete |
| `docs/ALERTING_SUMMARY.md`           | This document                                  | ✅ Complete |

---

## Alert Coverage

### By Category

| Category             | Alerts | Purpose                                     |
| -------------------- | ------ | ------------------------------------------- |
| **SLI/SLO**          | 4      | Error rate, latency (P95/P99), availability |
| **Circuit Breakers** | 3      | Detect cascading failures                   |
| **Queues**           | 4      | Job processing health                       |
| **AI**               | 4      | AI service health and costs                 |
| **MCP Tools**        | 3      | External integration health                 |
| **Redis**            | 4      | Cache health                                |
| **Database**         | 4      | Database health                             |
| **Infrastructure**   | 3      | Process health                              |
| **Business**         | 3      | Workflow and webhook health                 |
| **Total**            | **32** | **Comprehensive coverage**                  |

### By Severity

| Severity     | Count | Response Time       | Channels                  |
| ------------ | ----- | ------------------- | ------------------------- |
| **Critical** | 12    | Immediate (< 5 min) | Slack + PagerDuty + Email |
| **Warning**  | 18    | 30 minutes          | Slack + Email             |
| **Info**     | 2     | Best effort         | Slack only                |

---

## Quick Start

### 1. Deploy Alert Rules (5 minutes)

```bash
# Copy alert rules to Prometheus
cp config/prometheus-alerts.yml /etc/prometheus/rules/

# Validate syntax
promtool check rules config/prometheus-alerts.yml

# Restart Prometheus
docker restart prometheus
```

### 2. Configure Notifications (10 minutes)

Choose one:

**Option A: Slack (Easiest)**

```bash
# 1. Create webhook at https://api.slack.com/apps
# 2. Copy webhook URL
# 3. Update config/alertmanager.yml with webhook URL
# 4. Restart Alert Manager
docker restart alertmanager
```

**Option B: Grafana Cloud (Recommended)**

```bash
# 1. Sign up at https://grafana.com/products/cloud/
# 2. Get Prometheus remote write URL
# 3. Add to .env.production
# 4. Restart application
npm run dev
```

### 3. Test Alerts (5 minutes)

```bash
# Trigger high error rate alert
for i in {1..100}; do
  curl -X POST http://api:3000/debug/error-test \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"message": "test"}' &
done

# Wait 5 minutes for alert to fire
sleep 300

# Check if alert fired
curl http://localhost:9093/api/v1/alerts | jq .
```

---

## Key Features

### 1. SLI/SLO Monitoring

Alerts track Service Level Indicators:

- **Error Rate**: Fires when > 5% of requests fail
- **P95 Latency**: Fires when > 2 seconds
- **P99 Latency**: Fires when > 5 seconds
- **Availability**: Fires when < 99.5% SLO

### 2. Resilience Monitoring

Circuit breaker alerts detect cascading failures:

- **Open State**: Immediate alert
- **High Failure Rate**: Detects degradation
- **Half-Open**: Tracks recovery attempts

### 3. Queue Health

BullMQ queue monitoring:

- **Queue Depth**: Detects backlog
- **Processing Lag**: Detects slowdown
- **Stalled Jobs**: Detects worker issues
- **Stuck Queue**: Detects deadlock

### 4. AI Service Health

Monitors AI request reliability:

- **Failure Rate**: Detects API issues
- **Latency**: Detects slowness
- **Cost Spike**: Detects unusual usage
- **Unavailable**: Detects outages

### 5. Infrastructure Health

Monitors system resources:

- **Memory Usage**: Detects leaks
- **CPU Usage**: Detects bottlenecks
- **Process Restart**: Detects crashes
- **Disk Space**: Detects capacity issues

---

## Integration Options

### Slack (Recommended for Teams)

**Pros**:

- Easy setup (5 minutes)
- Rich formatting
- Team collaboration
- Free

**Cons**:

- No incident tracking
- Limited escalation

**Setup**: See `docs/ALERT_INTEGRATION_EXAMPLES.md`

### PagerDuty (Recommended for On-Call)

**Pros**:

- Incident tracking
- On-call scheduling
- Escalation policies
- Mobile app

**Cons**:

- Paid service
- More complex setup

**Setup**: See `docs/ALERT_INTEGRATION_EXAMPLES.md`

### Email (Recommended for Backup)

**Pros**:

- Universal
- No setup required
- Searchable history

**Cons**:

- Slow delivery
- Easy to miss
- No rich formatting

**Setup**: See `docs/ALERT_INTEGRATION_EXAMPLES.md`

### Grafana Cloud (Recommended for Managed)

**Pros**:

- Fully managed
- Built-in dashboards
- Multi-channel support
- Free tier available

**Cons**:

- Vendor lock-in
- Limited customization

**Setup**: See `docs/ALERTING_SETUP.md`

---

## Testing Strategy

### Unit Testing (Per Deployment)

```bash
# Validate alert syntax
promtool check rules config/prometheus-alerts.yml

# Test individual expressions
curl 'http://prometheus:9090/api/v1/query' \
  --data-urlencode 'query=<alert_expression>'
```

### Integration Testing (Weekly)

```bash
# Test alert firing
./scripts/test-high-error-rate.sh
./scripts/test-circuit-breaker.sh
./scripts/test-queue-depth.sh

# Test notifications
# (Manual verification in Slack/Email/PagerDuty)
```

### End-to-End Testing (Monthly)

```bash
# Full incident response simulation
./scripts/test-full-incident-response.sh
```

See `docs/ALERT_TESTING_GUIDE.md` for detailed procedures.

---

## Runbooks

Each alert links to a runbook with troubleshooting steps.

**Create runbooks at**: `docs/runbooks/`

**Template**:

```markdown
# Alert: AlertName

## Description

What this alert means

## Severity

Critical/Warning/Info

## Impact

What users experience

## Troubleshooting Steps

1. Check logs
2. Check dependencies
3. Check recent changes
4. Escalate if needed

## Resolution

How to fix it

## Prevention

How to prevent it
```

**Example runbooks to create**:

- `high-error-rate.md`
- `high-latency.md`
- `circuit-breaker.md`
- `queue-depth.md`
- `ai-failures.md`
- (etc. - 30+ total)

---

## Best Practices

### 1. Start with Critical Alerts Only

Don't enable all alerts at once. Ramp up gradually:

**Week 1**: Critical alerts only

- HighErrorRate
- CircuitBreakerOpen
- RedisConnectionFailures
- DatabaseConnectionPoolExhausted

**Week 2**: Add warning alerts

- HighP95Latency
- HighQueueDepth
- HighMemoryUsage

**Week 3+**: Add info alerts and fine-tune

### 2. Set Thresholds Based on Baseline

```bash
# Collect 1 week of baseline metrics
# Calculate P50, P95, P99
# Set thresholds at 2-3x P95

# Example:
# Baseline P95 latency: 500ms
# Alert threshold: 2000ms (4x P95)
```

### 3. Include Runbooks

Every alert must have a runbook. Alerts without runbooks create alert fatigue.

### 4. Test Regularly

- **Weekly**: Test critical alerts
- **Monthly**: Full incident response simulation
- **Quarterly**: Chaos engineering tests

### 5. Review Weekly

Track:

- How many alerts fired?
- How many were false positives?
- How many required action?
- What thresholds need adjustment?

### 6. Use Alert Grouping

Group related alerts to reduce notification noise:

```yaml
route:
  group_by: ["alertname", "cluster", "service"]
  group_wait: 10s
  group_interval: 10s
```

### 7. Set Appropriate Repeat Intervals

- **Critical**: Repeat every 5 minutes
- **Warning**: Repeat every 1 hour
- **Info**: Repeat every 24 hours

### 8. Use Alert Inhibition

Inhibit lower-severity alerts when higher-severity alerts are firing:

```yaml
inhibit_rules:
  - source_match:
      severity: "critical"
    target_match:
      severity: "warning"
    equal: ["alertname", "cluster", "service"]
```

---

## Monitoring the Monitors

Monitor Prometheus and Alert Manager themselves:

```yaml
- alert: PrometheusDown
  expr: up{job="prometheus"} == 0
  for: 1m
  labels:
    severity: critical

- alert: AlertManagerDown
  expr: up{job="alertmanager"} == 0
  for: 1m
  labels:
    severity: critical
```

---

## Troubleshooting

### Alerts Not Firing

**Checklist**:

1. [ ] Prometheus is scraping metrics
2. [ ] Metric exists in Prometheus
3. [ ] Alert rule syntax is valid
4. [ ] Alert Manager is running
5. [ ] `for` duration has elapsed

**Debug**:

```bash
# Check metrics
curl 'http://prometheus:9090/api/v1/query?query=http_requests_total'

# Check alert rule
curl 'http://prometheus:9090/api/v1/rules' | jq '.data.groups'

# Check alert state
curl 'http://prometheus:9090/api/v1/alerts' | jq '.data'
```

### Notifications Not Received

**Checklist**:

1. [ ] Alert Manager received alert
2. [ ] Webhook URL is correct
3. [ ] Credentials are valid
4. [ ] Notification channel is accessible

**Debug**:

```bash
# Check Alert Manager
curl 'http://localhost:9093/api/v1/alerts'

# Test webhook
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -d '{"text": "test"}'

# Check logs
docker logs alertmanager | tail -50
```

### Too Many False Positives

**Solutions**:

1. Increase `for` duration
2. Increase threshold
3. Add label filters
4. Review baseline metrics

---

## Next Steps

### Immediate (This Week)

- [ ] Deploy alert rules to production
- [ ] Configure notification channel (Slack or PagerDuty)
- [ ] Test critical alerts
- [ ] Create runbooks for critical alerts

### Short-term (This Month)

- [ ] Test all alerts
- [ ] Create all runbooks
- [ ] Train team on alert response
- [ ] Set up on-call rotation

### Medium-term (This Quarter)

- [ ] Review and adjust thresholds
- [ ] Add custom alerts for business metrics
- [ ] Implement alert analytics
- [ ] Automate incident response

### Long-term (This Year)

- [ ] Implement AIOps (automated remediation)
- [ ] Build predictive alerting
- [ ] Integrate with incident management
- [ ] Implement SLO tracking

---

## Documentation Map

| Document                        | Purpose                     | Audience          |
| ------------------------------- | --------------------------- | ----------------- |
| `ALERTING_SETUP.md`             | How to deploy and configure | DevOps, SRE       |
| `ALERT_TESTING_GUIDE.md`        | How to test alerts          | QA, DevOps        |
| `ALERT_INTEGRATION_EXAMPLES.md` | Copy-paste configs          | DevOps, Platform  |
| `ALERTING_SUMMARY.md`           | This document               | Everyone          |
| `docs/runbooks/*.md`            | How to respond to alerts    | On-Call Engineers |

---

## Support

### Questions?

- **Setup**: See `docs/ALERTING_SETUP.md`
- **Testing**: See `docs/ALERT_TESTING_GUIDE.md`
- **Integration**: See `docs/ALERT_INTEGRATION_EXAMPLES.md`
- **Troubleshooting**: See `docs/ALERTING_SETUP.md#troubleshooting`

### Contact

- **Email**: devops@nubabel.com
- **Slack**: #alerts-help
- **On-Call**: See PagerDuty schedule

---

## Metrics Reference

### HTTP Metrics

- `http_requests_total` - Total requests (counter)
- `http_request_duration_seconds` - Request latency (histogram)

### AI Metrics

- `ai_requests_total` - Total AI requests (counter)
- `ai_request_duration_seconds` - AI latency (histogram)
- `ai_tokens_total` - Token consumption (counter)

### MCP Metrics

- `mcp_tool_calls_total` - Total tool calls (counter)
- `mcp_tool_duration_seconds` - Tool latency (histogram)

### Queue Metrics

- `bullmq_queue_jobs` - Jobs by state (gauge)

### Circuit Breaker Metrics

- `circuit_breaker_state` - State (0=closed, 1=half_open, 2=open)
- `circuit_breaker_failures_total` - Failure count (counter)

### System Metrics

- `nodejs_heap_used_bytes` - Heap usage (gauge)
- `nodejs_heap_size_bytes` - Total heap (gauge)
- `process_uptime_seconds` - Uptime (gauge)

---

## Version History

| Version | Date       | Changes                              |
| ------- | ---------- | ------------------------------------ |
| 1.0     | 2026-01-26 | Initial release with 30+ alert rules |

---

## License

These alert rules and documentation are part of Nubabel and are proprietary.

---

**Last Updated**: 2026-01-26  
**Next Review**: 2026-02-26
