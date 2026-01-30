# Phase 10: Monitoring & Operations - Implementation Plan

## TODO List

### TODO 1: Telemetry Foundation
**Files to create:**
- `src/telemetry/index.ts`
- `src/telemetry/tracing.ts`
- `src/telemetry/sampling.ts`
- `src/telemetry/context-propagation.ts`

**Acceptance Criteria:**
- [ ] Error-priority sampler (100% errors, 10% success)
- [ ] W3C trace context propagation
- [ ] Enhanced OTel setup with custom sampler
- [ ] Export function for telemetry initialization

### TODO 2: Metrics Bridge (prom-client)
**Files to create:**
- `src/telemetry/metrics-bridge.ts`

**Files to modify:**
- `src/services/metrics.ts` (add prom-client internally)

**Acceptance Criteria:**
- [ ] prom-client based metrics collector
- [ ] All existing metric functions preserved
- [ ] Compatible with Grafana

### TODO 3: Sentry-OTel Integration
**Files to create:**
- `src/telemetry/sentry-integration.ts`

**Files to modify:**
- `src/services/sentry.ts`

**Acceptance Criteria:**
- [ ] OTel trace context linked to Sentry
- [ ] Error-trace correlation working

### TODO 4: Health Dashboard API
**Files to create:**
- `src/api/health-dashboard.ts`

**Files to modify:**
- `src/index.ts` (add route)

**Acceptance Criteria:**
- [ ] `/health/full` endpoint
- [ ] Weighted health scoring
- [ ] All component checks aggregated

### TODO 5: Grafana Dashboards
**Files to create:**
- `config/grafana/dashboards/system-overview.json`
- `config/grafana/dashboards/api-performance.json`
- `config/grafana/dashboards/agent-operations.json`
- `config/grafana/provisioning/datasources.yaml`
- `config/grafana/provisioning/dashboards.yaml`

**Acceptance Criteria:**
- [ ] 3 dashboard JSON files
- [ ] Auto-provisioning config
- [ ] Works with Prometheus datasource

### TODO 6: Observability Stack (Docker)
**Files to create:**
- `docker/docker-compose.observability.yml`

**Acceptance Criteria:**
- [ ] Jaeger for tracing
- [ ] Grafana for dashboards
- [ ] Prometheus for metrics scraping

### TODO 7: Alerting Rules
**Files to create:**
- `config/alerting/prometheus-rules.yaml`
- `config/alerting/alerting-config.yaml`

**Acceptance Criteria:**
- [ ] Alert rules for latency, error rate, queue depth
- [ ] Notification configuration template

### TODO 8: Uptime Monitoring
**Files to create:**
- `config/uptime/README.md` (setup documentation)

**Acceptance Criteria:**
- [ ] External monitoring setup documented
- [ ] Webhook integration documented

### TODO 9: Integration & Verification
**Files to modify:**
- `src/instrumentation.ts` (use new telemetry)
- `package.json` (add dependencies)

**Acceptance Criteria:**
- [ ] Build passes
- [ ] All tests pass
- [ ] Telemetry working end-to-end

---

## Execution Strategy

**Parallel Execution Groups:**

| Group | TODOs | Agent Type |
|-------|-------|------------|
| A | TODO 1 (Telemetry) | executor-high (opus) |
| B | TODO 2 (Metrics) + TODO 3 (Sentry) | executor (sonnet) |
| C | TODO 4 (Health API) | executor (sonnet) |
| D | TODO 5 (Dashboards) + TODO 6 (Docker) + TODO 7 (Alerting) | executor (sonnet) |

**Sequential:**
- TODO 9 (Integration) runs after A, B, C complete

---

*Implementation Plan - Phase 10*
