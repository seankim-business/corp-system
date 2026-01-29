# Uptime Monitoring Configuration

This directory contains documentation and configuration for external uptime monitoring services.

## Overview

External uptime monitoring provides continuous availability checks, alert routing, and status pages for the Nubabel platform. The platform exposes multiple health check endpoints designed for integration with popular monitoring services.

## Health Check Endpoints

### Basic Health Checks

#### `/health/live`
- **Purpose**: Kubernetes liveness probe
- **Response Time**: <10ms
- **Check Frequency**: Every 10 seconds
- **Use**: Determines if the application should be restarted
- **Response**:
  ```json
  {
    "status": "ok",
    "service": "live",
    "timestamp": "2025-01-29T12:00:00.000Z"
  }
  ```

#### `/health/ready`
- **Purpose**: Kubernetes readiness probe
- **Response Time**: 50-200ms
- **Check Frequency**: Every 15 seconds
- **Use**: Determines if the pod can receive traffic
- **Checks**: Database, Redis, Queue Redis, Worker Redis
- **Response**:
  ```json
  {
    "status": "ok",
    "service": "ready",
    "checks": {
      "database": true,
      "redis": true,
      "queueRedis": true,
      "workerRedis": true
    },
    "timestamp": "2025-01-29T12:00:00.000Z"
  }
  ```

#### `/health`
- **Purpose**: Basic system health
- **Response Time**: <10ms
- **Check Frequency**: Every 30 seconds
- **Use**: Quick environment validation
- **Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "2025-01-29T12:00:00.000Z",
    "environment": {
      "NODE_ENV": "production",
      "PORT": "3000",
      "DATABASE_URL": "SET",
      "REDIS_URL": "SET",
      "BASE_URL": "https://nubabel.com",
      "FRONTEND_URL": "https://app.nubabel.com"
    }
  }
  ```

### Comprehensive Health Dashboard

#### `/health/full`
- **Purpose**: Detailed system health with metrics
- **Response Time**: 100-500ms
- **Check Frequency**: Every 60 seconds
- **Use**: Status page, alerting, diagnostics
- **Checks**:
  - Database connectivity and latency
  - Redis connectivity and latency
  - BullMQ queue health (depth, failures)
  - Circuit breaker states
- **Response**:
  ```json
  {
    "status": "healthy",
    "timestamp": "2025-01-29T12:00:00.000Z",
    "uptime_seconds": 86400,
    "health_score": 100,
    "checks": {
      "database": {
        "status": "healthy",
        "latency_ms": 45,
        "message": null
      },
      "redis": {
        "status": "healthy",
        "latency_ms": 12,
        "message": null
      },
      "queues": {
        "status": "healthy",
        "latency_ms": 78,
        "message": null
      },
      "circuits": {
        "status": "healthy",
        "latency_ms": 3,
        "message": null
      }
    },
    "metrics_summary": {
      "requests_per_minute": 120,
      "error_rate_percent": 0.5,
      "p95_latency_ms": 250
    }
  }
  ```

#### Health Status Values
- **healthy**: All systems operational (score 100)
- **degraded**: Some systems slow or warning (score 50)
- **unhealthy**: Critical systems down (score 0)

#### Health Score Calculation
- Database: 35% weight
- Redis: 25% weight
- Queues: 20% weight
- Circuit Breakers: 20% weight

### Component Health Endpoints

#### `/health/db`
- Database connectivity check
- Returns connection status and query time

#### `/health/redis`
- Redis connectivity and metrics
- Returns ping status, uptime, memory usage

#### `/health/redis-pool`
- Redis connection pool health
- Returns available/in-use connections for queue and worker pools

#### `/health/mcp-cache`
- MCP (Model Context Protocol) cache statistics
- Returns hit rate, miss rate, size by provider

#### `/health/circuits`
- Circuit breaker status for all external services
- Returns state (CLOSED/OPEN/HALF_OPEN) per circuit
- HTTP 503 if any circuit is OPEN

## Monitoring Service Integration

### 1. Better Uptime (Recommended)

Better Uptime provides status pages, incident management, and on-call scheduling.

#### Setup

1. **Create Monitor**
   - URL: `https://api.nubabel.com/health/full`
   - Method: GET
   - Check Interval: 60 seconds
   - Timeout: 10 seconds
   - Regions: US East, US West, EU Central

2. **Configure Assertions**
   ```json
   {
     "status_code": 200,
     "response_time": 500,
     "json_path": [
       { "path": "$.status", "equals": "healthy" },
       { "path": "$.health_score", "greater_than": 50 }
     ]
   }
   ```

3. **Set Up Status Page**
   - Create components: API, Database, Redis, Queues
   - Map `/health/full` checks to components
   - Custom domain: `status.nubabel.com`

4. **Configure Webhooks**
   ```bash
   # Webhook URL (Slack, PagerDuty, etc.)
   POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL

   # Payload template
   {
     "text": "🚨 Nubabel {{monitor_name}} is {{status}}",
     "attachments": [{
       "color": "{{#if is_up}}good{{else}}danger{{/if}}",
       "fields": [
         { "title": "URL", "value": "{{url}}", "short": true },
         { "title": "Status", "value": "{{status}}", "short": true },
         { "title": "Response Time", "value": "{{response_time}}ms", "short": true },
         { "title": "Timestamp", "value": "{{checked_at}}", "short": true }
       ]
     }]
   }
   ```

5. **Alert Routing**
   - On-call schedule for critical incidents
   - Escalation policy: 5 min → 15 min → 30 min
   - Channels: Slack (#alerts), PagerDuty, Email

#### Environment Variables
```bash
# Better Uptime API key for status updates
BETTER_UPTIME_API_KEY=your_api_key
BETTER_UPTIME_MONITOR_ID=monitor_id
```

### 2. UptimeRobot

Free tier alternative with basic monitoring.

#### Setup

1. **Create HTTP(s) Monitor**
   - Monitor Type: HTTP(s)
   - URL: `https://api.nubabel.com/health/ready`
   - Monitoring Interval: 5 minutes (free tier)
   - Monitor Timeout: 30 seconds

2. **Advanced Settings**
   - Keyword Check: `"status":"ok"`
   - HTTP Method: GET (HEAD)
   - Expected Status Code: 200

3. **Alert Contacts**
   - Email notifications
   - Webhook integration: `https://hooks.slack.com/...`

4. **Public Status Page**
   - Custom domain: `status.nubabel.com`
   - Show uptime percentage (30/60/90 days)
   - Show response time graph

#### Environment Variables
```bash
# UptimeRobot API key
UPTIMEROBOT_API_KEY=your_api_key
```

### 3. Pingdom

Enterprise-grade monitoring with detailed transaction monitoring.

#### Setup

1. **Create Uptime Check**
   - Name: Nubabel API Production
   - URL: `https://api.nubabel.com/health/full`
   - Check Interval: 1 minute
   - Timeout: 10 seconds
   - Locations: Dallas, London, Sydney

2. **Response Time Validation**
   - Alert if > 500ms
   - Alert if > 1000ms (critical)

3. **JSON Response Validation**
   - Contains: `"status":"healthy"`
   - Does not contain: `"status":"unhealthy"`

4. **Integrations**
   - Slack: #incidents
   - PagerDuty: Critical alerts
   - Email: Warning alerts

#### Environment Variables
```bash
# Pingdom API credentials
PINGDOM_API_KEY=your_api_key
PINGDOM_CHECK_ID=check_id
```

### 4. Datadog Synthetic Monitoring

Full-featured monitoring with APM integration.

#### Setup

1. **Create API Test**
   ```yaml
   name: Nubabel Health Check
   type: api
   subtype: http
   request:
     method: GET
     url: https://api.nubabel.com/health/full
     timeout: 10
   assertions:
     - type: statusCode
       operator: is
       target: 200
     - type: responseTime
       operator: lessThan
       target: 500
     - type: body
       operator: validatesJSONPath
       target:
         jsonPath: "$.status"
         operator: is
         targetValue: "healthy"
     - type: body
       operator: validatesJSONPath
       target:
         jsonPath: "$.health_score"
         operator: isNot
         targetValue: 0
   locations:
     - aws:us-east-1
     - aws:eu-west-1
     - aws:ap-southeast-1
   options:
     tick_every: 60
     min_location_failed: 1
     min_failure_duration: 120
   ```

2. **Create Monitors**
   - Health Score < 50: Warning
   - Health Score = 0: Critical
   - Response Time > 500ms: Warning
   - Response Time > 1000ms: Critical

3. **Notification Channels**
   - Slack: #alerts-production
   - PagerDuty: On-call engineer
   - Email: Platform team

#### Environment Variables
```bash
# Datadog API credentials
DD_API_KEY=your_api_key
DD_APP_KEY=your_app_key
DD_SITE=datadoghq.com
```

## Alert Routing

### Severity Levels

#### Critical (P0)
- `/health/full` returns 503
- Health score = 0
- Database unreachable
- All circuit breakers open
- **Route**: PagerDuty → On-call engineer → Escalate after 5 min

#### High (P1)
- Health status = "unhealthy"
- Health score < 25
- Multiple queues failing
- Critical circuit breaker open
- **Route**: Slack #incidents + Email → Platform team

#### Medium (P2)
- Health status = "degraded"
- Health score < 50
- High queue depth (>5000 jobs)
- Moderate failures (>50 failed jobs)
- **Route**: Slack #alerts → Platform team

#### Low (P3)
- Response time > 500ms
- Individual component degraded
- Single circuit breaker in HALF_OPEN state
- **Route**: Slack #monitoring → Platform team

### Slack Integration

#### Webhook Setup
```bash
# Create Slack app at api.slack.com/apps
# Add Incoming Webhook
# Copy webhook URL to environment variable
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00/B00/xxx"
```

#### Alert Format
```json
{
  "text": "🚨 Nubabel Health Alert",
  "attachments": [{
    "color": "danger",
    "fields": [
      { "title": "Status", "value": "unhealthy", "short": true },
      { "title": "Health Score", "value": "0", "short": true },
      { "title": "Database", "value": "❌ Unhealthy (timeout)", "short": false },
      { "title": "Redis", "value": "✅ Healthy (12ms)", "short": false },
      { "title": "Queues", "value": "⚠️ Degraded (5200 jobs)", "short": false },
      { "title": "Circuits", "value": "❌ Unhealthy (2 open)", "short": false }
    ],
    "footer": "Nubabel Platform Monitoring",
    "ts": 1706529600
  }]
}
```

### PagerDuty Integration

#### Setup
1. Create PagerDuty service: "Nubabel API"
2. Add integration: "Events API v2"
3. Copy integration key to environment variable

#### Environment Variables
```bash
PAGERDUTY_INTEGRATION_KEY=your_integration_key
PAGERDUTY_SERVICE_ID=your_service_id
```

#### Alert Payload
```json
{
  "routing_key": "YOUR_INTEGRATION_KEY",
  "event_action": "trigger",
  "payload": {
    "summary": "Nubabel API Health Degraded",
    "severity": "critical",
    "source": "health-monitoring",
    "component": "api",
    "custom_details": {
      "health_score": 0,
      "status": "unhealthy",
      "checks": {
        "database": "unhealthy",
        "redis": "healthy",
        "queues": "degraded",
        "circuits": "unhealthy"
      }
    }
  }
}
```

## Runbook

### Common Issues and Responses

#### Database Unhealthy
1. Check RDS instance status in AWS Console
2. Check connection count: `SELECT count(*) FROM pg_stat_activity;`
3. Check slow queries: Review CloudWatch logs
4. Action: Scale RDS instance or restart if needed

#### Redis Unhealthy
1. Check ElastiCache cluster status
2. Check memory usage: `INFO memory`
3. Check connection count: `INFO clients`
4. Action: Scale cluster or restart node if needed

#### Queues Degraded
1. Check queue depths: `/admin/queues` (Bull Board)
2. Check worker status: Verify workers are running
3. Check failed jobs: Review error patterns
4. Action: Add workers or fix recurring job failures

#### Circuits Open
1. Identify affected service: `/health/circuits`
2. Check external service status page
3. Check recent error logs for that circuit
4. Action: Wait for circuit to recover or manually reset via `/health/circuits/reset`

## Status Page Setup

### Better Uptime Status Page

1. **Components**
   - API Server (maps to `/health/full`)
   - Database (maps to `$.checks.database`)
   - Redis Cache (maps to `$.checks.redis`)
   - Background Jobs (maps to `$.checks.queues`)
   - External Services (maps to `$.checks.circuits`)

2. **Metrics Display**
   - Uptime percentage (30/60/90 days)
   - Response time graph (24 hours)
   - Incident history (30 days)

3. **Custom Domain**
   - CNAME: `status.nubabel.com` → `statuspage.betteruptime.com`
   - SSL: Automatic via Better Uptime

4. **Incident Management**
   - Auto-create incident when monitor fails
   - Manual updates via Better Uptime dashboard
   - Subscriber notifications (email, SMS, Slack)

### Self-Hosted Status Page (Optional)

If you prefer a self-hosted solution, consider:
- **Cachet**: Laravel-based status page
- **Upptime**: GitHub Actions + GitHub Pages
- **Statping**: Go-based with Docker support

## Testing

### Manual Health Check
```bash
# Basic health
curl -i https://api.nubabel.com/health

# Readiness
curl -i https://api.nubabel.com/health/ready

# Full dashboard
curl -i https://api.nubabel.com/health/full | jq
```

### Simulated Downtime
```bash
# Test alerting by temporarily blocking database
# (Do not run in production without notification!)
# 1. Modify security group to block Postgres port
# 2. Wait for alerts to fire
# 3. Verify alert routing
# 4. Restore security group
# 5. Verify recovery notifications
```

## Metrics and SLIs

### Service Level Indicators

| Metric | Target | Measurement |
|--------|--------|-------------|
| Availability | 99.9% | `/health/ready` success rate |
| Latency (p95) | <300ms | `$.metrics_summary.p95_latency_ms` |
| Error Rate | <1% | `$.metrics_summary.error_rate_percent` |
| Health Score | >90 | `$.health_score` |

### Prometheus Metrics

Metrics are exposed at `/metrics` endpoint:
- `http_requests_total` - Total HTTP requests by status code
- `http_request_duration_seconds` - Request duration histogram
- `error_total` - Total errors by type
- `health_score` - Current health score (0-100)

## Maintenance Mode

### Planned Maintenance

1. **Pre-maintenance** (24h before)
   - Post incident on status page
   - Set status to "scheduled maintenance"
   - Notify subscribers

2. **During Maintenance**
   - Return 503 from `/health/ready` to prevent traffic
   - Keep `/health/live` returning 200 for pod stability
   - Update status page with progress

3. **Post-maintenance**
   - Restore normal health check responses
   - Update status page to "operational"
   - Send completion notification

### Environment Variable
```bash
# Enable maintenance mode
MAINTENANCE_MODE=true
```

## Troubleshooting

### False Positives

If monitors are alerting but service is healthy:
1. Check monitor timeout (increase to 30s)
2. Check monitor regions (avoid overloaded regions)
3. Review response time requirements (500ms may be too aggressive)
4. Check for intermittent network issues

### Missing Alerts

If service is down but no alerts:
1. Verify monitor is enabled
2. Check webhook URL is correct
3. Review alert routing rules
4. Check notification channel settings (Slack/PagerDuty)

### High Noise

If receiving too many alerts:
1. Adjust alert thresholds (e.g., health_score < 25 instead of < 50)
2. Add alert cooldown period (5 minutes)
3. Require multiple failed checks before alerting (min_failure_duration)
4. Use alert aggregation (group similar alerts)

## Additional Resources

- [Better Uptime Documentation](https://docs.betteruptime.com/)
- [UptimeRobot API Documentation](https://uptimerobot.com/api/)
- [Pingdom API Documentation](https://docs.pingdom.com/)
- [Datadog Synthetic Monitoring](https://docs.datadoghq.com/synthetics/)
- [PagerDuty Integration Guide](https://support.pagerduty.com/docs/services-and-integrations)
