# Prometheus Alerting Documentation Index

**Quick Navigation for Production Alerting Setup**

---

## 📋 Start Here

**New to Nubabel alerting?** Start with this document:

→ **[ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md)** - 5-minute overview of what was created

---

## 📚 Complete Documentation

### 1. Setup & Deployment

**[ALERTING_SETUP.md](./ALERTING_SETUP.md)** - Complete setup guide

- Overview of alert coverage
- Railway deployment (Prometheus + Alert Manager)
- Grafana Cloud setup (managed option)
- Notification channel configuration
- Alert severity levels
- Testing procedures
- Runbook guidelines
- Best practices
- Troubleshooting

**Time to read**: 20 minutes  
**Time to implement**: 30-60 minutes

### 2. Testing & Validation

**[ALERT_TESTING_GUIDE.md](./ALERT_TESTING_GUIDE.md)** - Comprehensive testing procedures

- Unit testing (alert expressions)
- Integration testing (alert firing)
- Notification testing
- End-to-end testing
- Chaos testing
- Performance testing
- Automated testing (CI/CD)
- Test results tracking
- Troubleshooting test failures

**Time to read**: 15 minutes  
**Time to implement**: 2-4 hours

### 3. Integration Examples

**[ALERT_INTEGRATION_EXAMPLES.md](./ALERT_INTEGRATION_EXAMPLES.md)** - Copy-paste ready configurations

- Slack integration
- Email integration
- PagerDuty integration
- Microsoft Teams integration
- Opsgenie integration
- Custom webhook integration
- Multi-channel routing
- Testing all integrations

**Time to read**: 10 minutes  
**Time to implement**: 15-30 minutes

### 4. Summary & Reference

**[ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md)** - Executive summary

- What was created
- Alert coverage by category
- Quick start guide
- Key features
- Integration options
- Testing strategy
- Best practices
- Next steps
- Metrics reference

**Time to read**: 10 minutes

---

## 🎯 Alert Rules File

**[config/prometheus-alerts.yml](../config/prometheus-alerts.yml)** - 30+ production alert rules

- 4 SLI/SLO alerts
- 3 Circuit breaker alerts
- 4 Queue alerts
- 4 AI alerts
- 3 MCP alerts
- 4 Redis alerts
- 4 Database alerts
- 3 Infrastructure alerts
- 3 Business alerts

**Total**: 32 alert rules covering critical production scenarios

---

## 🚀 Quick Start Paths

### Path 1: Slack + Manual Testing (Fastest)

**Time**: 1-2 hours

1. Read: [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md) (10 min)
2. Deploy: [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Slack section (15 min)
3. Test: [ALERT_TESTING_GUIDE.md](./ALERT_TESTING_GUIDE.md) - Manual testing (30 min)
4. Create: Runbooks for critical alerts (30 min)

### Path 2: PagerDuty + Full Testing (Recommended)

**Time**: 3-4 hours

1. Read: [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md) (10 min)
2. Deploy: [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Full setup (30 min)
3. Integrate: [ALERT_INTEGRATION_EXAMPLES.md](./ALERT_INTEGRATION_EXAMPLES.md) - PagerDuty (15 min)
4. Test: [ALERT_TESTING_GUIDE.md](./ALERT_TESTING_GUIDE.md) - Full testing (1-2 hours)
5. Create: Runbooks for all alerts (1 hour)

### Path 3: Grafana Cloud (Managed)

**Time**: 2-3 hours

1. Read: [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md) (10 min)
2. Deploy: [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Grafana Cloud section (20 min)
3. Configure: [ALERT_INTEGRATION_EXAMPLES.md](./ALERT_INTEGRATION_EXAMPLES.md) - Multi-channel (15 min)
4. Test: [ALERT_TESTING_GUIDE.md](./ALERT_TESTING_GUIDE.md) - Integration testing (1 hour)
5. Create: Runbooks for critical alerts (30 min)

---

## 📖 Reading by Role

### DevOps / SRE

**Essential**:

1. [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Full setup guide
2. [ALERT_TESTING_GUIDE.md](./ALERT_TESTING_GUIDE.md) - Testing procedures
3. [ALERT_INTEGRATION_EXAMPLES.md](./ALERT_INTEGRATION_EXAMPLES.md) - Integration configs

**Optional**:

- [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md) - Reference

### On-Call Engineers

**Essential**:

1. [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md) - Overview
2. `docs/runbooks/*.md` - Alert-specific runbooks

**Optional**:

- [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Troubleshooting section

### QA / Test Engineers

**Essential**:

1. [ALERT_TESTING_GUIDE.md](./ALERT_TESTING_GUIDE.md) - Testing procedures
2. [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Alert rules overview

**Optional**:

- [ALERT_INTEGRATION_EXAMPLES.md](./ALERT_INTEGRATION_EXAMPLES.md) - Integration testing

### Platform / Backend Engineers

**Essential**:

1. [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md) - Overview
2. [config/prometheus-alerts.yml](../config/prometheus-alerts.yml) - Alert rules

**Optional**:

- [ALERTING_SETUP.md](./ALERTING_SETUP.md) - Metrics reference section

### Managers / Leadership

**Essential**:

1. [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md) - Executive summary

---

## 🔍 Find Information By Topic

### Setup & Deployment

- **Railway deployment**: [ALERTING_SETUP.md - Railway Deployment](./ALERTING_SETUP.md#railway-deployment)
- **Grafana Cloud setup**: [ALERTING_SETUP.md - Grafana Cloud](./ALERTING_SETUP.md#option-2-grafana-cloud-easiest-for-getting-started)
- **Environment variables**: [ALERT_INTEGRATION_EXAMPLES.md - Environment Variables](./ALERT_INTEGRATION_EXAMPLES.md#environment-variables)

### Notifications

- **Slack**: [ALERT_INTEGRATION_EXAMPLES.md - Slack](./ALERT_INTEGRATION_EXAMPLES.md#slack-integration)
- **Email**: [ALERT_INTEGRATION_EXAMPLES.md - Email](./ALERT_INTEGRATION_EXAMPLES.md#email-integration)
- **PagerDuty**: [ALERT_INTEGRATION_EXAMPLES.md - PagerDuty](./ALERT_INTEGRATION_EXAMPLES.md#pagerduty-integration)
- **Teams**: [ALERT_INTEGRATION_EXAMPLES.md - Teams](./ALERT_INTEGRATION_EXAMPLES.md#microsoft-teams-integration)
- **Multi-channel**: [ALERT_INTEGRATION_EXAMPLES.md - Multi-Channel](./ALERT_INTEGRATION_EXAMPLES.md#multi-channel-configuration)

### Testing

- **Unit testing**: [ALERT_TESTING_GUIDE.md - Unit Testing](./ALERT_TESTING_GUIDE.md#unit-testing-alert-expressions)
- **Integration testing**: [ALERT_TESTING_GUIDE.md - Integration Testing](./ALERT_TESTING_GUIDE.md#integration-testing-alert-firing)
- **End-to-end testing**: [ALERT_TESTING_GUIDE.md - E2E Testing](./ALERT_TESTING_GUIDE.md#end-to-end-testing)
- **Chaos testing**: [ALERT_TESTING_GUIDE.md - Chaos Testing](./ALERT_TESTING_GUIDE.md#chaos-testing)

### Troubleshooting

- **Alerts not firing**: [ALERTING_SETUP.md - Troubleshooting](./ALERTING_SETUP.md#troubleshooting)
- **Notifications not received**: [ALERTING_SETUP.md - Troubleshooting](./ALERTING_SETUP.md#troubleshooting)
- **Test failures**: [ALERT_TESTING_GUIDE.md - Troubleshooting](./ALERT_TESTING_GUIDE.md#troubleshooting-test-failures)
- **Integration issues**: [ALERT_INTEGRATION_EXAMPLES.md - Troubleshooting](./ALERT_INTEGRATION_EXAMPLES.md#troubleshooting)

### Best Practices

- **Alert design**: [ALERTING_SETUP.md - Best Practices](./ALERTING_SETUP.md#best-practices)
- **Threshold setting**: [ALERTING_SUMMARY.md - Best Practices](./ALERTING_SUMMARY.md#best-practices)
- **Testing strategy**: [ALERTING_SUMMARY.md - Testing Strategy](./ALERTING_SUMMARY.md#testing-strategy)

### Metrics & Queries

- **Available metrics**: [ALERTING_SETUP.md - Key Metrics](./ALERTING_SETUP.md#key-metrics)
- **Metrics reference**: [ALERTING_SUMMARY.md - Metrics Reference](./ALERTING_SUMMARY.md#metrics-reference)

---

## 📊 Alert Coverage

### By Category

| Category         | Count | Docs                                                 |
| ---------------- | ----- | ---------------------------------------------------- |
| SLI/SLO          | 4     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| Circuit Breakers | 3     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| Queues           | 4     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| AI               | 4     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| MCP Tools        | 3     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| Redis            | 4     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| Database         | 4     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| Infrastructure   | 3     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |
| Business         | 3     | [ALERTING_SETUP.md](./ALERTING_SETUP.md#alert-rules) |

### By Severity

| Severity | Count | Response Time |
| -------- | ----- | ------------- |
| Critical | 12    | < 5 minutes   |
| Warning  | 18    | 30 minutes    |
| Info     | 2     | Best effort   |

---

## 🎓 Learning Resources

### External References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Alert Manager Documentation](https://prometheus.io/docs/alerting/latest/overview/)
- [Grafana Cloud](https://grafana.com/products/cloud/)
- [SLO Best Practices](https://sre.google/sre-book/service-level-objectives/)

### Related Nubabel Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) - Implementation details
- [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) - Deployment guide

---

## ✅ Implementation Checklist

### Phase 1: Setup (Week 1)

- [ ] Read [ALERTING_SUMMARY.md](./ALERTING_SUMMARY.md)
- [ ] Choose deployment option (Railway or Grafana Cloud)
- [ ] Follow [ALERTING_SETUP.md](./ALERTING_SETUP.md)
- [ ] Deploy alert rules
- [ ] Configure notification channel
- [ ] Test critical alerts

### Phase 2: Testing (Week 2)

- [ ] Follow [ALERT_TESTING_GUIDE.md](./ALERT_TESTING_GUIDE.md)
- [ ] Test all alert rules
- [ ] Test all notification channels
- [ ] Document test results

### Phase 3: Runbooks (Week 3)

- [ ] Create runbooks for all alerts
- [ ] Test runbook links
- [ ] Train team on runbooks
- [ ] Set up on-call rotation

### Phase 4: Optimization (Week 4+)

- [ ] Review alert metrics
- [ ] Adjust thresholds
- [ ] Add custom alerts
- [ ] Implement automation

---

## 📞 Support

### Questions?

- **Setup issues**: See [ALERTING_SETUP.md - Troubleshooting](./ALERTING_SETUP.md#troubleshooting)
- **Testing issues**: See [ALERT_TESTING_GUIDE.md - Troubleshooting](./ALERT_TESTING_GUIDE.md#troubleshooting-test-failures)
- **Integration issues**: See [ALERT_INTEGRATION_EXAMPLES.md - Troubleshooting](./ALERT_INTEGRATION_EXAMPLES.md#troubleshooting)

### Contact

- **Email**: devops@nubabel.com
- **Slack**: #alerts-help
- **On-Call**: See PagerDuty schedule

---

## 📝 Document Versions

| Document                      | Version | Last Updated | Status      |
| ----------------------------- | ------- | ------------ | ----------- |
| ALERTING_SETUP.md             | 1.0     | 2026-01-26   | ✅ Complete |
| ALERT_TESTING_GUIDE.md        | 1.0     | 2026-01-26   | ✅ Complete |
| ALERT_INTEGRATION_EXAMPLES.md | 1.0     | 2026-01-26   | ✅ Complete |
| ALERTING_SUMMARY.md           | 1.0     | 2026-01-26   | ✅ Complete |
| ALERTING_INDEX.md             | 1.0     | 2026-01-26   | ✅ Complete |
| prometheus-alerts.yml         | 1.0     | 2026-01-26   | ✅ Complete |

---

**Last Updated**: 2026-01-26  
**Next Review**: 2026-02-26
