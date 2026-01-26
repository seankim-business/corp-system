# Production Alerting Setup Guide

**Last Updated**: 2026-01-26  
**Status**: Production Ready  
**Audience**: DevOps, SRE, On-Call Engineers

---

## Table of Contents

1. [Overview](#overview)
2. [Alert Rules](#alert-rules)
3. [Railway Deployment](#railway-deployment)
4. [Notification Channels](#notification-channels)
5. [Alert Severity Levels](#alert-severity-levels)
6. [Testing Alerts](#testing-alerts)
7. [Runbooks](#runbooks)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This guide describes how to set up production alerting for Nubabel using Prometheus and Alert Manager. The alert rules are designed to detect incidents early and enable rapid response.

### Alert Coverage

Alert rules are defined in `config/prometheus-alerts.yml` and cover:

| Category             | Alerts                                           | Purpose                             |
| -------------------- | ------------------------------------------------ | ----------------------------------- |
| **SLI/SLO**          | Error Rate, P95/P99 Latency, Availability        | Monitor service health against SLOs |
| **Circuit Breakers** | Open State, High Failure Rate, Half-Open         | Detect cascading failures           |
| **Queues**           | Depth, Processing Lag, Stalled Jobs, Stuck       | Monitor job processing health       |
| **AI**               | Failure Rate, Latency, Cost Spike, Unavailable   | Monitor AI service health           |
| **MCP Tools**        | Failure Rate, Latency, Unavailable               | Monitor external integrations       |
| **Redis**            | Connection, Memory, Evictions, Replication       | Monitor cache health                |
| **Database**         | Connection Pool, Slow Queries, Replication, Disk | Monitor database health             |
| **Infrastructure**   | Memory, CPU, Process Restart                     | Monitor process health              |
| **Business**         | Workflow Failures, Webhook Failures, Quota       | Monitor business metrics            |

**Total**: 30+ alert rules covering critical production scenarios

---

## Alert Rules

### Rule Structure

Each alert rule includes:

```yaml
- alert: AlertName
  expr: <PromQL expression>
  for: <duration>
  labels:
    severity: <critical|warning|info>
    component: <component>
  annotations:
    summary: <short description>
    description: <detailed description with {{ $value }}>
    runbook: <link to runbook>
    dashboard: <link to Grafana dashboard>
```

### Key Metrics

The following metrics are exported by the application:

#### HTTP Metrics

- `http_requests_total` - Total HTTP requests (counter)
- `http_request_duration_seconds` - Request latency (histogram)

#### AI Metrics

- `ai_requests_total` - Total AI requests (counter)
- `ai_request_duration_seconds` - AI request latency (histogram)
- `ai_tokens_total` - Token consumption (counter)

#### MCP Metrics

- `mcp_tool_calls_total` - Total MCP tool calls (counter)
- `mcp_tool_duration_seconds` - MCP tool latency (histogram)

#### Queue Metrics

- `bullmq_queue_jobs` - Jobs by state (gauge)

#### Circuit Breaker Metrics

- `circuit_breaker_state` - State (0=closed, 1=half_open, 2=open)
- `circuit_breaker_failures_total` - Failure count (counter)

#### System Metrics

- `nodejs_heap_used_bytes` - Heap memory usage (gauge)
- `nodejs_heap_size_bytes` - Total heap size (gauge)
- `process_uptime_seconds` - Process uptime (gauge)

---

## Railway Deployment

### Option 1: Prometheus + Alert Manager (Recommended for Production)

This option provides full control and is recommended for production deployments.

#### Step 1: Add Prometheus Service

1. Go to Railway project dashboard
2. Click "New Service" → "Database" → "Prometheus"
3. Configure:
   - **Name**: `prometheus`
   - **Memory**: 512MB (adjust based on metrics volume)
   - **Storage**: 10GB (adjust based on retention)

#### Step 2: Configure Prometheus

Create `config/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: "nubabel-prod"
    environment: "production"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
            - "alertmanager:9093"

rule_files:
  - "/etc/prometheus/rules/*.yml"

scrape_configs:
  - job_name: "nubabel-api"
    static_configs:
      - targets: ["api:3000"]
    metrics_path: "/metrics"
    scrape_interval: 30s
    scrape_timeout: 10s

  - job_name: "redis"
    static_configs:
      - targets: ["redis:6379"]
    metrics_path: "/metrics"

  - job_name: "postgres"
    static_configs:
      - targets: ["postgres-exporter:9187"]
```

#### Step 3: Add Alert Manager Service

1. Click "New Service" → "Database" → "Alert Manager"
2. Configure:
   - **Name**: `alertmanager`
   - **Memory**: 256MB

#### Step 4: Configure Alert Manager

Create `config/alertmanager.yml`:

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

route:
  receiver: "default"
  group_by: ["alertname", "cluster", "service"]
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  routes:
    - match:
        severity: critical
      receiver: "critical"
      group_wait: 0s
      repeat_interval: 5m

    - match:
        severity: warning
      receiver: "warning"
      group_wait: 30s
      repeat_interval: 1h

receivers:
  - name: "default"
    slack_configs:
      - channel: "#alerts"
        title: "{{ .GroupLabels.alertname }}"
        text: "{{ .CommonAnnotations.description }}"

  - name: "critical"
    slack_configs:
      - channel: "#alerts-critical"
        title: "🚨 CRITICAL: {{ .GroupLabels.alertname }}"
        text: "{{ .CommonAnnotations.description }}"
    pagerduty_configs:
      - service_key: "YOUR_PAGERDUTY_KEY"
        severity: "critical"

  - name: "warning"
    slack_configs:
      - channel: "#alerts"
        title: "⚠️ WARNING: {{ .GroupLabels.alertname }}"
        text: "{{ .CommonAnnotations.description }}"

inhibit_rules:
  - source_match:
      severity: "critical"
    target_match:
      severity: "warning"
    equal: ["alertname", "cluster", "service"]
```

#### Step 4: Deploy

```bash
# Copy alert rules to Prometheus
cp config/prometheus-alerts.yml /etc/prometheus/rules/

# Restart Prometheus
railway run prometheus --config.file=config/prometheus.yml \
  --storage.tsdb.path=/data \
  --web.console.libraries=/usr/share/prometheus/console_libraries \
  --web.console.templates=/usr/share/prometheus/consoles

# Restart Alert Manager
railway run alertmanager --config.file=config/alertmanager.yml \
  --storage.path=/data
```

### Option 2: Grafana Cloud (Easiest for Getting Started)

Grafana Cloud provides managed Prometheus and Alert Manager with minimal setup.

#### Step 1: Sign Up

1. Go to [Grafana Cloud](https://grafana.com/products/cloud/)
2. Sign up for free tier (includes 10GB metrics/month)
3. Create a new Prometheus instance

#### Step 2: Get Credentials

From Grafana Cloud dashboard:

- Copy **Prometheus Remote Write URL**
- Copy **Username** (usually your user ID)
- Generate **API Token** for authentication

#### Step 3: Configure Application

Add to `.env.production`:

```bash
# Prometheus Remote Write (Grafana Cloud)
PROMETHEUS_REMOTE_WRITE_URL=https://prometheus-blocks-prod-us-central1.grafana-blocks.com/api/prom/push
PROMETHEUS_REMOTE_WRITE_USERNAME=YOUR_USER_ID
PROMETHEUS_REMOTE_WRITE_PASSWORD=YOUR_API_TOKEN
```

#### Step 4: Update Metrics Middleware

Modify `src/services/metrics.ts` to send metrics to Grafana Cloud:

```typescript
async function flushMetricsToGrafana(metrics: MetricValue[]) {
  const url = process.env.PROMETHEUS_REMOTE_WRITE_URL;
  if (!url) return;

  const payload = metricsCollector.formatPrometheus(metrics);

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Authorization: `Basic ${Buffer.from(
        `${process.env.PROMETHEUS_REMOTE_WRITE_USERNAME}:${process.env.PROMETHEUS_REMOTE_WRITE_PASSWORD}`,
      ).toString("base64")}`,
    },
    body: payload,
  });
}
```

#### Step 5: Upload Alert Rules

1. In Grafana Cloud, go to **Alerting** → **Alert Rules**
2. Click **Create Alert Rule**
3. Copy rules from `config/prometheus-alerts.yml`
4. Configure notification channels (see below)

---

## Notification Channels

### Slack Integration

#### Setup

1. Create Slack App at https://api.slack.com/apps
2. Enable **Incoming Webhooks**
3. Create webhook for `#alerts` channel
4. Copy webhook URL

#### Configuration

In `config/alertmanager.yml`:

```yaml
receivers:
  - name: "slack-critical"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#alerts-critical"
        title: "🚨 {{ .GroupLabels.alertname }}"
        text: "{{ .CommonAnnotations.description }}"
        actions:
          - type: button
            text: "View Runbook"
            url: "{{ .CommonAnnotations.runbook }}"
          - type: button
            text: "View Dashboard"
            url: "{{ .CommonAnnotations.dashboard }}"
```

#### Message Format

Slack messages include:

- **Alert Name**: `{{ .GroupLabels.alertname }}`
- **Severity**: `{{ .GroupLabels.severity }}`
- **Description**: `{{ .CommonAnnotations.description }}`
- **Runbook Link**: `{{ .CommonAnnotations.runbook }}`
- **Dashboard Link**: `{{ .CommonAnnotations.dashboard }}`

### Email Integration

#### Setup

1. Get SMTP credentials (Gmail, SendGrid, etc.)
2. Add to environment variables

#### Configuration

In `config/alertmanager.yml`:

```yaml
receivers:
  - name: "email-oncall"
    email_configs:
      - to: "oncall@nubabel.com"
        from: "alerts@nubabel.com"
        smarthost: "smtp.gmail.com:587"
        auth_username: "alerts@nubabel.com"
        auth_password: '{{ env "GMAIL_PASSWORD" }}'
        headers:
          Subject: "[{{ .GroupLabels.severity | toUpper }}] {{ .GroupLabels.alertname }}"
        html: |
          <h2>{{ .GroupLabels.alertname }}</h2>
          <p><strong>Severity:</strong> {{ .GroupLabels.severity }}</p>
          <p><strong>Description:</strong> {{ .CommonAnnotations.description }}</p>
          <p><a href="{{ .CommonAnnotations.runbook }}">View Runbook</a></p>
```

### PagerDuty Integration

#### Setup

1. Create PagerDuty account at https://www.pagerduty.com/
2. Create service for Nubabel
3. Get **Integration Key**

#### Configuration

In `config/alertmanager.yml`:

```yaml
receivers:
  - name: "pagerduty-critical"
    pagerduty_configs:
      - service_key: "YOUR_PAGERDUTY_KEY"
        description: "{{ .GroupLabels.alertname }}"
        details:
          firing: '{{ template "pagerduty.default.instances" .Alerts.Firing }}'
          severity: "{{ .GroupLabels.severity }}"
          runbook: "{{ .CommonAnnotations.runbook }}"
```

### Microsoft Teams Integration

#### Setup

1. Create incoming webhook in Teams channel
2. Copy webhook URL

#### Configuration

In `config/alertmanager.yml`:

```yaml
receivers:
  - name: "teams-critical"
    webhook_configs:
      - url: "https://outlook.webhook.office.com/webhookb2/YOUR/WEBHOOK/URL"
        send_resolved: true
```

---

## Alert Severity Levels

| Severity     | Response Time       | Channels                        | Escalation            | Example                                              |
| ------------ | ------------------- | ------------------------------- | --------------------- | ---------------------------------------------------- |
| **critical** | Immediate (< 5 min) | Slack + PagerDuty + Email + SMS | Page on-call engineer | Error rate > 5%, Circuit breaker open, Database down |
| **warning**  | 30 minutes          | Slack + Email                   | Create ticket         | High latency, Queue depth high, Memory usage high    |
| **info**     | Best effort         | Slack only                      | Log only              | Deployment started, Configuration changed            |

### Severity Assignment Rules

**Critical** (Page immediately):

- Error rate > 5%
- P99 latency > 5s
- Circuit breaker open
- Database connection pool exhausted
- Redis connection lost
- AI service unavailable (>50% failures)
- Process restart detected

**Warning** (Create ticket):

- Error rate > 1%
- P95 latency > 2s
- Queue depth > 1000
- Memory usage > 90%
- Slow queries detected
- AI failure rate > 10%
- MCP failure rate > 20%

**Info** (Log only):

- Circuit breaker half-open
- Deployment started
- Configuration changed

---

## Testing Alerts

### Manual Testing

#### Test High Error Rate Alert

```bash
# Trigger 100 errors in 5 minutes
for i in {1..100}; do
  curl -X POST https://api.nubabel.com/debug/error-test \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"message": "test error"}'
  sleep 3
done

# Alert should fire after 5 minutes
```

#### Test Circuit Breaker Alert

```bash
# Disable AI API key temporarily
export ANTHROPIC_API_KEY=""

# Make requests that will fail
for i in {1..50}; do
  curl -X POST https://api.nubabel.com/api/workflows/123/execute \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"input": "test"}'
  sleep 1
done

# Circuit breaker should open after ~10 failures
# Alert should fire after 1 minute
```

#### Test Queue Depth Alert

```bash
# Pause orchestration worker
docker pause nubabel-orchestration-worker

# Add jobs to queue
for i in {1..1500}; do
  curl -X POST https://api.nubabel.com/api/workflows/123/execute \
    -H "Authorization: Bearer $TEST_TOKEN" \
    -d '{"input": "test"}'
done

# Queue depth should exceed 1000
# Alert should fire after 5 minutes
```

#### Test Memory Alert

```bash
# Create memory leak (for testing only)
curl -X POST https://api.nubabel.com/debug/memory-leak \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -d '{"size_mb": 500}'

# Memory usage should increase
# Alert should fire after 5 minutes
```

### Alert Manager API Testing

#### Check Alert Status

```bash
# Get all active alerts
curl http://alertmanager:9093/api/v1/alerts

# Response:
# {
#   "status": "success",
#   "data": [
#     {
#       "labels": {
#         "alertname": "HighErrorRate",
#         "severity": "critical"
#       },
#       "annotations": {
#         "summary": "High error rate detected (5.2%)",
#         "description": "Error rate is above 5% for the last 5 minutes..."
#       },
#       "state": "firing",
#       "activeAt": "2026-01-26T10:30:00Z",
#       "value": "0.052"
#     }
#   ]
# }
```

#### Silence Alert

```bash
# Silence alert for 1 hour (e.g., during maintenance)
curl -X POST http://alertmanager:9093/api/v1/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [
      {
        "name": "alertname",
        "value": "HighErrorRate",
        "isRegex": false
      }
    ],
    "startsAt": "2026-01-26T10:00:00Z",
    "endsAt": "2026-01-26T11:00:00Z",
    "createdBy": "oncall@nubabel.com",
    "comment": "Maintenance window - expected high error rate"
  }'
```

#### Get Silence Status

```bash
curl http://alertmanager:9093/api/v1/silences
```

### Prometheus Query Testing

#### Test Alert Expression

```bash
# Test error rate query
curl 'http://prometheus:9090/api/v1/query?query=rate(http_requests_total{status=~"5.."}[5m])'

# Test latency query
curl 'http://prometheus:9090/api/v1/query?query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))'

# Test circuit breaker query
curl 'http://prometheus:9090/api/v1/query?query=circuit_breaker_state'
```

---

## Runbooks

Each alert has a linked runbook with troubleshooting steps. Create runbooks at:

```
docs/runbooks/
├── high-error-rate.md
├── high-latency.md
├── circuit-breaker.md
├── queue-depth.md
├── queue-lag.md
├── stalled-jobs.md
├── queue-stuck.md
├── ai-failures.md
├── ai-latency.md
├── ai-cost-spike.md
├── ai-unavailable.md
├── mcp-failures.md
├── mcp-latency.md
├── mcp-unavailable.md
├── redis-down.md
├── redis-memory.md
├── redis-evictions.md
├── redis-replication.md
├── db-pool.md
├── slow-queries.md
├── db-replication.md
├── db-disk-space.md
├── high-memory.md
├── process-restart.md
├── high-cpu.md
├── workflow-failures.md
├── webhook-failures.md
└── quota-exceeded.md
```

### Runbook Template

````markdown
# Alert: HighErrorRate

## Description

Error rate has exceeded 5% for the last 5 minutes.

## Severity

Critical - Immediate action required

## Impact

- Users experiencing errors
- Service reliability degraded
- SLO at risk

## Troubleshooting Steps

1. **Check error logs**
   ```bash
   kubectl logs -f deployment/nubabel-api --tail=100
   ```
````

2. **Identify error pattern**
   - Are errors from specific endpoint?
   - Are errors from specific organization?
   - Are errors from specific AI model?

3. **Check dependencies**
   - Is Redis available?
   - Is database available?
   - Is AI API available?

4. **Check recent deployments**
   - Was there a recent code change?
   - Was there a configuration change?

5. **Escalate if needed**
   - Page on-call engineer
   - Create incident in PagerDuty
   - Notify #incidents Slack channel

## Resolution

[Document resolution steps]

## Prevention

[Document how to prevent this in future]

````

---

## Best Practices

### 1. Start with Critical Alerts Only

Don't enable all alerts at once. Start with critical alerts and gradually add warning alerts as you understand your baseline metrics.

```yaml
# Phase 1: Critical only
- HighErrorRate
- CircuitBreakerOpen
- RedisConnectionFailures
- DatabaseConnectionPoolExhausted

# Phase 2: Add warnings
- HighP95Latency
- HighQueueDepth
- HighMemoryUsage

# Phase 3: Add info
- CircuitBreakerHalfOpen
````

### 2. Set Reasonable Thresholds

Thresholds should be based on your baseline metrics, not arbitrary values.

```bash
# Collect baseline metrics for 1 week
# Calculate P50, P95, P99 for each metric
# Set thresholds at 2-3x P95

# Example:
# Baseline P95 latency: 500ms
# Alert threshold: 2000ms (4x P95)
```

### 3. Include Runbooks

Every alert must have a runbook. Alerts without runbooks create alert fatigue.

```yaml
annotations:
  runbook: "https://docs.nubabel.com/runbooks/high-error-rate"
```

### 4. Test Regularly

Test alerts weekly to ensure they fire correctly.

```bash
# Weekly alert test
# 1. Trigger each critical alert
# 2. Verify notification received
# 3. Verify runbook is accurate
# 4. Document any issues
```

### 5. Review Weekly

Review alert metrics weekly to adjust thresholds based on false positives.

```
Weekly Alert Review Checklist:
- [ ] How many alerts fired?
- [ ] How many were false positives?
- [ ] How many required action?
- [ ] What thresholds need adjustment?
- [ ] What new alerts are needed?
```

### 6. Use Alert Grouping

Group related alerts to reduce notification noise.

```yaml
route:
  group_by: ["alertname", "cluster", "service"]
  group_wait: 10s
  group_interval: 10s
```

### 7. Set Appropriate Repeat Intervals

Repeat intervals prevent alert fatigue while ensuring visibility.

```yaml
# Critical: repeat every 5 minutes
# Warning: repeat every 1 hour
# Info: repeat every 24 hours
```

### 8. Use Alert Inhibition

Inhibit lower-severity alerts when higher-severity alerts are firing.

```yaml
inhibit_rules:
  - source_match:
      severity: "critical"
    target_match:
      severity: "warning"
    equal: ["alertname", "cluster", "service"]
```

---

## Troubleshooting

### Alerts Not Firing

**Problem**: Alert expression is correct but alert doesn't fire

**Solution**:

1. Check Prometheus is scraping metrics

   ```bash
   curl http://prometheus:9090/api/v1/targets
   ```

2. Check metric exists

   ```bash
   curl 'http://prometheus:9090/api/v1/query?query=http_requests_total'
   ```

3. Check alert rule syntax

   ```bash
   promtool check rules config/prometheus-alerts.yml
   ```

4. Check Alert Manager is running
   ```bash
   curl http://alertmanager:9093/api/v1/status
   ```

### Too Many False Positives

**Problem**: Alert fires frequently but doesn't indicate real problem

**Solution**:

1. Increase `for` duration

   ```yaml
   for: 10m # was 5m
   ```

2. Increase threshold

   ```yaml
   expr: ... > 0.1 # was > 0.05
   ```

3. Add label filters
   ```yaml
   expr: ... and job="nubabel-api"
   ```

### Notifications Not Received

**Problem**: Alert fires but notification not received

**Solution**:

1. Check Alert Manager configuration

   ```bash
   curl http://alertmanager:9093/api/v1/status
   ```

2. Check receiver configuration

   ```bash
   curl http://alertmanager:9093/api/v1/alerts
   ```

3. Check webhook URL

   ```bash
   curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
     -d '{"text": "test"}'
   ```

4. Check credentials
   - Slack: Verify webhook URL is correct
   - PagerDuty: Verify service key is correct
   - Email: Verify SMTP credentials

### High Memory Usage in Prometheus

**Problem**: Prometheus using too much memory

**Solution**:

1. Reduce retention period

   ```bash
   --storage.tsdb.retention.time=7d  # was 30d
   ```

2. Reduce scrape interval

   ```yaml
   global:
     scrape_interval: 30s # was 15s
   ```

3. Increase memory allocation
   ```bash
   # In Railway: increase memory to 1GB
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
  annotations:
    summary: "Prometheus is down"

- alert: AlertManagerDown
  expr: up{job="alertmanager"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Alert Manager is down"
```

---

## Next Steps

1. **Deploy Prometheus**: Follow Option 1 or Option 2 above
2. **Configure Notifications**: Set up Slack, Email, or PagerDuty
3. **Test Alerts**: Run manual tests to verify alerts fire
4. **Create Runbooks**: Document troubleshooting steps for each alert
5. **Review Weekly**: Adjust thresholds based on false positives
6. **Iterate**: Add new alerts as you identify new failure modes

---

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Alert Manager Documentation](https://prometheus.io/docs/alerting/latest/overview/)
- [Grafana Cloud](https://grafana.com/products/cloud/)
- [Railway Deployment](https://docs.railway.app/)
- [SLO Best Practices](https://sre.google/sre-book/service-level-objectives/)

---

**Questions?** Contact: devops@nubabel.com
