# Grafana Dashboards for Nubabel

This directory contains Grafana dashboard definitions and provisioning configuration for monitoring the Nubabel platform.

## Directory Structure

```
monitoring/grafana/
├── dashboards/                      # Dashboard JSON definitions
│   ├── nubabel-overview.json       # Main overview dashboard
│   ├── orchestration-performance.json  # Orchestration metrics
│   └── infrastructure.json         # Infrastructure health
├── provisioning/
│   ├── datasources/
│   │   └── prometheus.yml          # Prometheus datasource config
│   └── dashboards/
│       └── default.yml             # Dashboard provisioning config
└── README.md                       # This file
```

## Dashboards

### 1. Nubabel Overview (`nubabel-overview.json`)

Main operational dashboard showing:
- **API Request Rate**: HTTP requests/sec by method and path
- **API Request Latency**: p50, p95, p99 latencies
- **Active SSE Connections**: Current count of server-sent event connections
- **Success Rate**: Percentage of successful requests (2xx status codes)
- **Response Status Distribution**: Pie chart of HTTP status codes
- **Errors per Minute**: Total error rate
- **Error Rate by Type**: Errors broken down by type and source
- **Cache Operations**: Cache hit/miss rates and operation counts

### 2. Orchestration Performance (`orchestration-performance.json`)

Orchestration and queue metrics:
- **Orchestration Request Rate by Skill**: Requests/sec for each skill
- **Orchestration Duration by Skill**: p50, p95, p99 latencies per skill
- **Average Orchestration Duration**: Overall average execution time
- **Active Queue Jobs**: Current number of jobs being processed
- **Queue Job Success Rate**: Percentage of successful job completions
- **Queue Jobs per Minute**: Job processing rate
- **Queue Job Duration**: p50, p95, p99 latencies by queue
- **Queue Job Status by Queue**: Job status breakdown (active, completed, failed)
- **SSE Connections by Organization**: Active connections per organization

### 3. Infrastructure (`infrastructure.json`)

System health and resources:
- **Node.js Memory Usage**: Heap used, heap total, external memory
- **CPU Usage**: Process CPU utilization
- **Redis Memory Usage**: Memory used vs. max
- **Redis Connected Clients**: Current client count
- **Redis Health**: Up/down status
- **Database Active Connections**: PostgreSQL connection count
- **Database Health**: Up/down status
- **Database Query Latency**: p50, p95, p99 query times
- **Active SSE Connections**: Real-time connection count
- **Redis Operations Rate**: Commands/sec
- **Rate Limit Violations**: HTTP 429 responses per minute

## Metrics

All dashboards query Prometheus metrics exported by the Nubabel application. The following metrics are available:

### HTTP Metrics
- `http_requests_total{method, path, status}` - Counter
- `http_request_duration_ms{method, path}` - Histogram

### Queue Metrics
- `queue_jobs_total{queue, status}` - Counter
- `queue_job_duration_ms{queue}` - Histogram

### Orchestration Metrics
- `orchestration_duration_ms{skill_id}` - Histogram

### SSE Metrics
- `sse_connections_active{organization_id}` - Gauge

### Cache Metrics
- `cache_operations_total{operation, result}` - Counter

### Error Metrics
- `errors_total{type, source}` - Counter

## Setup

### Prerequisites

1. **Prometheus** must be running and scraping metrics from the Nubabel application
2. **Grafana** must be installed and accessible

### Using Docker Compose

If using the provided `docker-compose.yml`:

```bash
# Start Grafana with provisioning
docker-compose up -d grafana
```

The dashboards will be automatically provisioned at startup.

### Manual Import

1. Access Grafana UI (default: http://localhost:3000)
2. Navigate to **Dashboards** → **Import**
3. Upload each JSON file from `dashboards/` directory
4. Select the Prometheus datasource when prompted

### Provisioning Configuration

The provisioning files automatically configure:

**Datasource** (`provisioning/datasources/prometheus.yml`):
- Prometheus connection to `http://prometheus:9090`
- POST method for queries
- 60s query timeout
- 15s time interval (scrape interval)

**Dashboards** (`provisioning/dashboards/default.yml`):
- Auto-loads all dashboards from `/etc/grafana/provisioning/dashboards`
- Creates "Nubabel" folder
- Allows UI updates
- 10s refresh interval

## Configuration

### Environment Filter

All dashboards include an `environment` template variable with values:
- `development`
- `staging`
- `production` (default)

This allows filtering metrics by deployment environment.

### Refresh Rate

All dashboards auto-refresh every **10 seconds** by default. You can change this in the dashboard settings or by clicking the refresh dropdown in the top-right corner.

### Time Range

Default time range is **Last 1 hour**. You can adjust this using the time picker in the top-right corner.

## Customization

### Adding New Panels

1. Edit the dashboard JSON file
2. Add a new panel object to the `panels` array
3. Increment the `id` field to be unique
4. Set appropriate `gridPos` coordinates
5. Configure the Prometheus query in `targets`

### Modifying Queries

Each panel's `targets` array contains Prometheus queries. Common patterns:

```promql
# Rate of change
rate(metric_name[5m])

# Histogram quantile
histogram_quantile(0.95, sum(rate(metric_bucket[5m])) by (le))

# Sum by label
sum(metric_name) by (label_name)
```

### Updating Datasource URL

Edit `provisioning/datasources/prometheus.yml`:

```yaml
url: http://your-prometheus-host:9090
```

## Alerting

To configure alerts based on these dashboards:

1. Navigate to **Alerting** → **Alert rules**
2. Create alerts based on panel queries
3. Configure notification channels (Slack, email, PagerDuty, etc.)

Example alert conditions:
- Error rate > 10/min
- API latency p95 > 2000ms
- Success rate < 95%
- Redis/DB health = Down

## Troubleshooting

### No Data Showing

1. Verify Prometheus is scraping metrics:
   - Check Prometheus targets: `http://prometheus:9090/targets`
   - Verify Nubabel metrics endpoint is accessible: `http://nubabel:3000/metrics`

2. Check datasource connection:
   - Navigate to **Configuration** → **Data sources** → **Prometheus**
   - Click "Save & Test"

3. Verify metric names match:
   - Open Prometheus UI and search for metrics like `http_requests_total`
   - Ensure metric names in dashboard queries match exported metrics

### Dashboard Not Loading

1. Check JSON syntax: `cat dashboard.json | jq .`
2. Verify provisioning path in `default.yml` matches dashboard location
3. Check Grafana logs: `docker-compose logs grafana`

### Template Variables Not Working

1. Ensure `environment` label exists on your metrics
2. Add label to metrics exporter if missing:
   ```typescript
   httpRequestsTotal.inc({
     method,
     path,
     status,
     environment: process.env.NODE_ENV
   });
   ```

## Best Practices

1. **Use templating**: Add more template variables for dynamic filtering
2. **Set appropriate units**: Configure panel units (ms, bytes, %, etc.)
3. **Add annotations**: Mark deployments, incidents, etc.
4. **Create alerts**: Don't just visualize - alert on anomalies
5. **Document thresholds**: Add threshold lines to panels
6. **Version control**: Keep dashboard JSON in git
7. **Export regularly**: Backup dashboards by exporting JSON

## Resources

- [Grafana Documentation](https://grafana.com/docs/)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [Dashboard Provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/)
- [Best Practices for Metrics](https://prometheus.io/docs/practices/naming/)
