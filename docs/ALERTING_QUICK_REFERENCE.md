# Prometheus Alerting - Quick Reference Card

**Print this page for your desk!**

---

## 🚨 Critical Alerts (Page Immediately)

| Alert | Threshold | Response | Runbook |
|-------|-----------|----------|---------|
| HighErrorRate | > 5% for 5m | < 5 min | high-error-rate |
| HighP99Latency | > 5s for 5m | < 5 min | high-latency |
| CircuitBreakerOpen | Open for 1m | < 5 min | circuit-breaker |
| DatabaseConnectionPoolExhausted | > 90% for 2m | < 5 min | db-pool |
| RedisConnectionFailures | Down for 1m | < 5 min | redis-down |
| HighStalledJobRate | > 5/sec for 5m | < 5 min | stalled-jobs |
| QueueStuck | No completions for 10m | < 5 min | queue-stuck |
| AIServiceUnavailable | > 50% failures for 2m | < 5 min | ai-unavailable |
| MCPServiceUnavailable | > 50% failures for 2m | < 5 min | mcp-unavailable |
| ProcessRestart | Unexpected restart | < 5 min | process-restart |
| SLOAvailabilityBreach | < 99.5% for 10m | < 5 min | slo-breach |
| HighAIFailureRate | > 10% for 5m | < 5 min | ai-failures |

---

## ⚠️ Warning Alerts (30 Minutes)

| Alert | Threshold | Action | Runbook |
|-------|-----------|--------|---------|
| HighP95Latency | > 2s for 5m | Create ticket | high-latency |
| HighQueueDepth | > 1000 for 5m | Check workers | queue-depth |
| HighMemoryUsage | > 90% for 5m | Monitor | high-memory |
| HighCPUUsage | > 80% for 5m | Monitor | high-cpu |
| RedisMemoryHigh | > 90% for 5m | Increase memory | redis-memory |
| SlowQueries | P95 > 1s for 5m | Check indexes | slow-queries |
| HighAILatency | P95 > 30s for 5m | Monitor | ai-latency |
| HighMCPFailureRate | > 20% for 5m | Check provider | mcp-failures |
| CircuitBreakerHighFailureRate | > 10/sec for 2m | Investigate | circuit-breaker |
| QueueProcessingLag | Lag detected for 10m | Scale workers | queue-lag |
| HighWorkflowFailureRate | > 10% for 10m | Check workflows | workflow-failures |
| HighWebhookFailureRate | > 5% for 5m | Check endpoints | webhook-failures |

---

## ℹ️ Info Alerts (Best Effort)

| Alert | Meaning | Action |
|-------|---------|--------|
| CircuitBreakerHalfOpen | Testing recovery | Monitor |

---

## 🔧 Common Commands

### Check Alert Status
```bash
curl http://alertmanager:9093/api/v1/alerts | jq .
```

### Silence Alert (1 hour)
```bash
curl -X POST http://alertmanager:9093/api/v1/silences \
  -H "Content-Type: application/json" \
  -d '{
    "matchers": [{"name": "alertname", "value": "AlertName"}],
    "startsAt": "2026-01-26T10:00:00Z",
    "endsAt": "2026-01-26T11:00:00Z",
    "createdBy": "oncall@nubabel.com",
    "comment": "Maintenance window"
  }'
```

### Check Prometheus Metrics
```bash
curl 'http://prometheus:9090/api/v1/query?query=http_requests_total'
```

### View Alert Rules
```bash
curl 'http://prometheus:9090/api/v1/rules' | jq '.data.groups'
```

---

## 📞 Escalation Path

1. **Alert fires** → Check Slack/Email/PagerDuty
2. **Read runbook** → Follow troubleshooting steps
3. **Can't resolve?** → Page on-call engineer
4. **Still stuck?** → Escalate to team lead
5. **Critical issue** → Page manager

---

## 🎯 First Response Checklist

When an alert fires:

- [ ] Read alert description
- [ ] Check alert dashboard
- [ ] Review runbook
- [ ] Check recent deployments
- [ ] Check dependency status
- [ ] Check logs
- [ ] Escalate if needed

---

## 📊 Key Metrics

### HTTP
- `http_requests_total` - Total requests
- `http_request_duration_seconds` - Latency

### AI
- `ai_requests_total` - Total AI requests
- `ai_tokens_total` - Token consumption

### Queue
- `bullmq_queue_jobs` - Jobs by state

### Circuit Breaker
- `circuit_breaker_state` - 0=closed, 1=half_open, 2=open

### System
- `nodejs_heap_used_bytes` - Memory usage
- `process_uptime_seconds` - Uptime

---

## 🔗 Important Links

- **Prometheus**: http://prometheus:9090
- **Alert Manager**: http://alertmanager:9093
- **Grafana**: https://grafana.nubabel.com
- **Runbooks**: https://docs.nubabel.com/runbooks/
- **Slack**: #alerts-critical

---

## 💡 Pro Tips

1. **Silence alerts during maintenance**
   ```bash
   # Use Alert Manager API to silence
   ```

2. **Check alert history**
   ```bash
   # Prometheus stores 15 days of data
   ```

3. **Test alerts weekly**
   ```bash
   # Run test-all-alerts.sh
   ```

4. **Review thresholds monthly**
   ```bash
   # Adjust based on false positives
   ```

5. **Keep runbooks updated**
   ```bash
   # Update when procedures change
   ```

---

## 🚀 Quick Troubleshooting

### Alert Not Firing?
1. Check Prometheus is scraping metrics
2. Check metric exists: `curl 'http://prometheus:9090/api/v1/query?query=metric_name'`
3. Check alert rule syntax: `promtool check rules config/prometheus-alerts.yml`
4. Check Alert Manager is running: `curl http://alertmanager:9093/-/healthy`

### Notification Not Received?
1. Check Alert Manager received alert: `curl http://alertmanager:9093/api/v1/alerts`
2. Check webhook URL is correct
3. Test webhook manually: `curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL -d '{"text": "test"}'`
4. Check logs: `docker logs alertmanager | tail -50`

### Too Many False Positives?
1. Increase `for` duration (e.g., 5m → 10m)
2. Increase threshold (e.g., 0.05 → 0.10)
3. Add label filters (e.g., `and job="nubabel-api"`)
4. Review baseline metrics

---

## 📋 On-Call Checklist

**Start of shift**:
- [ ] Check for active alerts
- [ ] Review recent incidents
- [ ] Verify notification channels working
- [ ] Update status page if needed

**During shift**:
- [ ] Respond to alerts within SLA
- [ ] Document actions taken
- [ ] Update incident status
- [ ] Escalate if needed

**End of shift**:
- [ ] Handoff to next on-call
- [ ] Document any ongoing issues
- [ ] Update runbooks if needed
- [ ] Note any improvements

---

**Print Date**: 2026-01-26  
**Last Updated**: 2026-01-26  
**Next Review**: 2026-02-26
