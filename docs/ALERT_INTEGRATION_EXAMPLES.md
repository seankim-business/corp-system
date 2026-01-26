# Alert Integration Examples

**Last Updated**: 2026-01-26  
**Status**: Production Ready  
**Audience**: DevOps, SRE, Platform Engineers

---

## Quick Reference

This document provides copy-paste ready configurations for integrating Prometheus alerts with popular notification platforms.

---

## Slack Integration

### Setup Webhook

1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. Name: "Nubabel Alerts"
4. Select workspace
5. Go to "Incoming Webhooks"
6. Click "Add New Webhook to Workspace"
7. Select channel: `#alerts`
8. Copy webhook URL

### Alert Manager Configuration

```yaml
# config/alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: "slack-default"
  group_by: ["alertname", "cluster", "service"]
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  routes:
    - match:
        severity: critical
      receiver: "slack-critical"
      group_wait: 0s
      repeat_interval: 5m

    - match:
        severity: warning
      receiver: "slack-warning"
      group_wait: 30s
      repeat_interval: 1h

receivers:
  - name: "slack-default"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#alerts"
        title: "{{ .GroupLabels.alertname }}"
        text: "{{ .CommonAnnotations.description }}"
        color: '{{ if eq .Status "firing" }}warning{{ else }}good{{ end }}'
        actions:
          - type: button
            text: "View Runbook"
            url: "{{ .CommonAnnotations.runbook }}"
          - type: button
            text: "View Dashboard"
            url: "{{ .CommonAnnotations.dashboard }}"

  - name: "slack-critical"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#alerts-critical"
        title: "🚨 CRITICAL: {{ .GroupLabels.alertname }}"
        text: "{{ .CommonAnnotations.description }}"
        color: "danger"
        actions:
          - type: button
            text: "View Runbook"
            url: "{{ .CommonAnnotations.runbook }}"
          - type: button
            text: "View Dashboard"
            url: "{{ .CommonAnnotations.dashboard }}"
        mention_users: "@oncall"

  - name: "slack-warning"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#alerts"
        title: "⚠️ WARNING: {{ .GroupLabels.alertname }}"
        text: "{{ .CommonAnnotations.description }}"
        color: "warning"
        actions:
          - type: button
            text: "View Runbook"
            url: "{{ .CommonAnnotations.runbook }}"
```

### Test Slack Integration

```bash
# Test webhook directly
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Test alert from Nubabel",
    "attachments": [
      {
        "color": "danger",
        "title": "HighErrorRate",
        "text": "Error rate is above 5% for the last 5 minutes",
        "fields": [
          {
            "title": "Severity",
            "value": "critical",
            "short": true
          },
          {
            "title": "Value",
            "value": "5.2%",
            "short": true
          }
        ],
        "actions": [
          {
            "type": "button",
            "text": "View Runbook",
            "url": "https://docs.nubabel.com/runbooks/high-error-rate"
          }
        ]
      }
    ]
  }'
```

---

## Email Integration

### Setup SMTP

#### Gmail

1. Enable 2-factor authentication
2. Generate app password: https://myaccount.google.com/apppasswords
3. Use app password in config

#### SendGrid

1. Create account at https://sendgrid.com
2. Create API key
3. Use API key in config

#### AWS SES

1. Verify email address in SES console
2. Create SMTP credentials
3. Use credentials in config

### Alert Manager Configuration

```yaml
# config/alertmanager.yml
receivers:
  - name: "email-oncall"
    email_configs:
      - to: "oncall@nubabel.com"
        from: "alerts@nubabel.com"
        smarthost: "smtp.gmail.com:587"
        auth_username: "alerts@nubabel.com"
        auth_password: '{{ env "GMAIL_APP_PASSWORD" }}'
        headers:
          Subject: "[{{ .GroupLabels.severity | toUpper }}] {{ .GroupLabels.alertname }}"
        html: |
          <h2>{{ .GroupLabels.alertname }}</h2>
          <p><strong>Severity:</strong> {{ .GroupLabels.severity }}</p>
          <p><strong>Status:</strong> {{ .Status }}</p>
          <p><strong>Description:</strong> {{ .CommonAnnotations.description }}</p>
          <hr>
          <h3>Alerts</h3>
          {{ range .Alerts }}
          <p>
            <strong>{{ .Labels.alertname }}</strong><br>
            {{ .Annotations.description }}
          </p>
          {{ end }}
          <hr>
          <p>
            <a href="{{ .CommonAnnotations.runbook }}">View Runbook</a> | 
            <a href="{{ .CommonAnnotations.dashboard }}">View Dashboard</a>
          </p>

  - name: "email-critical"
    email_configs:
      - to: "critical@nubabel.com"
        from: "alerts@nubabel.com"
        smarthost: "smtp.gmail.com:587"
        auth_username: "alerts@nubabel.com"
        auth_password: '{{ env "GMAIL_APP_PASSWORD" }}'
        headers:
          Subject: "[CRITICAL] {{ .GroupLabels.alertname }}"
```

### Environment Variables

```bash
# .env.production
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
AWS_SES_USERNAME=AKIAIOSFODNN7EXAMPLE
AWS_SES_PASSWORD=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### Test Email Integration

```bash
# Test SMTP connection
telnet smtp.gmail.com 587

# Or use swaks
swaks --to oncall@nubabel.com \
  --from alerts@nubabel.com \
  --server smtp.gmail.com:587 \
  --auth-user alerts@nubabel.com \
  --auth-password "$GMAIL_APP_PASSWORD" \
  --header "Subject: Test Alert" \
  --body "This is a test alert"
```

---

## PagerDuty Integration

### Setup

1. Create account at https://www.pagerduty.com
2. Create service for Nubabel
3. Go to Integrations → Add Integration
4. Select "Prometheus"
5. Copy Integration Key

### Alert Manager Configuration

```yaml
# config/alertmanager.yml
receivers:
  - name: "pagerduty-critical"
    pagerduty_configs:
      - service_key: "YOUR_PAGERDUTY_INTEGRATION_KEY"
        description: "{{ .GroupLabels.alertname }}"
        details:
          firing: '{{ template "pagerduty.default.instances" .Alerts.Firing }}'
          resolved: '{{ template "pagerduty.default.instances" .Alerts.Resolved }}'
          severity: "{{ .GroupLabels.severity }}"
          runbook: "{{ .CommonAnnotations.runbook }}"
          dashboard: "{{ .CommonAnnotations.dashboard }}"
        client: "Nubabel Monitoring"
        client_url: "https://prometheus.nubabel.com"

  - name: "pagerduty-warning"
    pagerduty_configs:
      - service_key: "YOUR_PAGERDUTY_INTEGRATION_KEY"
        description: "{{ .GroupLabels.alertname }}"
        details:
          firing: '{{ template "pagerduty.default.instances" .Alerts.Firing }}'
          severity: "{{ .GroupLabels.severity }}"
        client: "Nubabel Monitoring"
        client_url: "https://prometheus.nubabel.com"
```

### Test PagerDuty Integration

```bash
# Test API endpoint
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d '{
    "routing_key": "YOUR_PAGERDUTY_INTEGRATION_KEY",
    "event_action": "trigger",
    "dedup_key": "test-alert-1",
    "payload": {
      "summary": "Test alert from Nubabel",
      "severity": "critical",
      "source": "Nubabel Monitoring",
      "custom_details": {
        "runbook": "https://docs.nubabel.com/runbooks/high-error-rate"
      }
    }
  }'
```

---

## Microsoft Teams Integration

### Setup

1. Create incoming webhook in Teams channel
2. Copy webhook URL

### Alert Manager Configuration

```yaml
# config/alertmanager.yml
receivers:
  - name: "teams-critical"
    webhook_configs:
      - url: "https://outlook.webhook.office.com/webhookb2/YOUR/WEBHOOK/URL"
        send_resolved: true

  - name: "teams-warning"
    webhook_configs:
      - url: "https://outlook.webhook.office.com/webhookb2/YOUR/WEBHOOK/URL"
        send_resolved: true
```

### Custom Teams Formatter

Create `config/teams-template.json`:

```json
{
  "@type": "MessageCard",
  "@context": "https://schema.org/extensions",
  "summary": "{{ .GroupLabels.alertname }}",
  "themeColor": "{{ if eq .Status \"firing\" }}ff0000{{ else }}00ff00{{ end }}",
  "sections": [
    {
      "activityTitle": "{{ .GroupLabels.alertname }}",
      "activitySubtitle": "{{ .GroupLabels.severity }}",
      "facts": [
        {
          "name": "Status",
          "value": "{{ .Status }}"
        },
        {
          "name": "Severity",
          "value": "{{ .GroupLabels.severity }}"
        },
        {
          "name": "Description",
          "value": "{{ .CommonAnnotations.description }}"
        }
      ],
      "potentialAction": [
        {
          "@type": "OpenUri",
          "name": "View Runbook",
          "targets": [
            {
              "os": "default",
              "uri": "{{ .CommonAnnotations.runbook }}"
            }
          ]
        },
        {
          "@type": "OpenUri",
          "name": "View Dashboard",
          "targets": [
            {
              "os": "default",
              "uri": "{{ .CommonAnnotations.dashboard }}"
            }
          ]
        }
      ]
    }
  ]
}
```

### Test Teams Integration

```bash
# Test webhook directly
curl -X POST https://outlook.webhook.office.com/webhookb2/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "Test Alert",
    "themeColor": "ff0000",
    "sections": [
      {
        "activityTitle": "Test Alert from Nubabel",
        "facts": [
          {
            "name": "Status",
            "value": "firing"
          },
          {
            "name": "Severity",
            "value": "critical"
          }
        ]
      }
    ]
  }'
```

---

## Opsgenie Integration

### Setup

1. Create account at https://www.opsgenie.com
2. Create API key
3. Create alert routing rules

### Alert Manager Configuration

```yaml
# config/alertmanager.yml
receivers:
  - name: "opsgenie-critical"
    opsgenie_configs:
      - api_key: "YOUR_OPSGENIE_API_KEY"
        api_url: "https://api.opsgenie.com/"
        message: "{{ .GroupLabels.alertname }}"
        description: "{{ .CommonAnnotations.description }}"
        priority: "P1"
        tags:
          - "nubabel"
          - "{{ .GroupLabels.severity }}"
        details:
          runbook: "{{ .CommonAnnotations.runbook }}"
          dashboard: "{{ .CommonAnnotations.dashboard }}"

  - name: "opsgenie-warning"
    opsgenie_configs:
      - api_key: "YOUR_OPSGENIE_API_KEY"
        api_url: "https://api.opsgenie.com/"
        message: "{{ .GroupLabels.alertname }}"
        description: "{{ .CommonAnnotations.description }}"
        priority: "P3"
        tags:
          - "nubabel"
          - "{{ .GroupLabels.severity }}"
```

---

## Webhook Integration (Custom)

### Generic Webhook

```yaml
# config/alertmanager.yml
receivers:
  - name: "custom-webhook"
    webhook_configs:
      - url: "https://api.nubabel.com/webhooks/alerts"
        send_resolved: true
        http_sd_configs:
          - targets: ["api.nubabel.com"]
```

### Webhook Payload Format

```json
{
  "status": "firing",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighErrorRate",
        "severity": "critical",
        "component": "api"
      },
      "annotations": {
        "summary": "High error rate detected (5.2%)",
        "description": "Error rate is above 5% for the last 5 minutes",
        "runbook": "https://docs.nubabel.com/runbooks/high-error-rate",
        "dashboard": "https://grafana.nubabel.com/d/api-health"
      },
      "startsAt": "2026-01-26T10:30:00Z",
      "endsAt": "0001-01-01T00:00:00Z"
    }
  ],
  "groupLabels": {
    "alertname": "HighErrorRate"
  },
  "commonLabels": {
    "severity": "critical",
    "component": "api"
  },
  "commonAnnotations": {
    "summary": "High error rate detected (5.2%)",
    "description": "Error rate is above 5% for the last 5 minutes"
  },
  "externalURL": "http://alertmanager:9093",
  "version": "4",
  "groupKey": "{}:{alertname=\"HighErrorRate\"}"
}
```

### Webhook Handler Example

```typescript
// src/api/webhooks.ts
import { Router, Request, Response } from "express";

interface AlertPayload {
  status: "firing" | "resolved";
  alerts: Array<{
    status: string;
    labels: Record<string, string>;
    annotations: Record<string, string>;
    startsAt: string;
    endsAt: string;
  }>;
  groupLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
}

const router = Router();

router.post("/webhooks/alerts", async (req: Request, res: Response) => {
  const payload: AlertPayload = req.body;

  for (const alert of payload.alerts) {
    if (payload.status === "firing") {
      // Handle firing alert
      console.log(`Alert firing: ${alert.labels.alertname}`);

      // Send to incident management system
      // Create ticket
      // Page on-call engineer
      // etc.
    } else {
      // Handle resolved alert
      console.log(`Alert resolved: ${alert.labels.alertname}`);

      // Close incident
      // Update ticket
      // etc.
    }
  }

  res.status(200).json({ status: "ok" });
});

export default router;
```

---

## Multi-Channel Configuration

### Route by Severity

```yaml
# config/alertmanager.yml
route:
  receiver: "default"
  group_by: ["alertname", "cluster", "service"]
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h

  routes:
    # Critical: All channels
    - match:
        severity: critical
      receiver: "critical-all"
      group_wait: 0s
      repeat_interval: 5m

    # Warning: Slack + Email
    - match:
        severity: warning
      receiver: "warning-slack-email"
      group_wait: 30s
      repeat_interval: 1h

    # Info: Slack only
    - match:
        severity: info
      receiver: "info-slack"
      group_wait: 5m
      repeat_interval: 24h

receivers:
  - name: "critical-all"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#alerts-critical"
    email_configs:
      - to: "critical@nubabel.com"
        smarthost: "smtp.gmail.com:587"
        auth_username: "alerts@nubabel.com"
        auth_password: '{{ env "GMAIL_APP_PASSWORD" }}'
    pagerduty_configs:
      - service_key: "YOUR_PAGERDUTY_KEY"

  - name: "warning-slack-email"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#alerts"
    email_configs:
      - to: "oncall@nubabel.com"
        smarthost: "smtp.gmail.com:587"
        auth_username: "alerts@nubabel.com"
        auth_password: '{{ env "GMAIL_APP_PASSWORD" }}'

  - name: "info-slack"
    slack_configs:
      - api_url: "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
        channel: "#alerts"
```

---

## Testing All Integrations

```bash
#!/bin/bash
# test-all-integrations.sh

echo "Testing all alert integrations..."

# 1. Test Slack
echo "1. Testing Slack..."
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "✅ Slack integration test"}'

# 2. Test Email
echo "2. Testing Email..."
swaks --to oncall@nubabel.com \
  --from alerts@nubabel.com \
  --server smtp.gmail.com:587 \
  --auth-user alerts@nubabel.com \
  --auth-password "$GMAIL_APP_PASSWORD" \
  --header "Subject: ✅ Email integration test" \
  --body "Email integration is working"

# 3. Test PagerDuty
echo "3. Testing PagerDuty..."
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d '{
    "routing_key": "YOUR_PAGERDUTY_KEY",
    "event_action": "trigger",
    "dedup_key": "test-integration",
    "payload": {
      "summary": "✅ PagerDuty integration test",
      "severity": "info",
      "source": "Nubabel"
    }
  }'

# 4. Test Teams
echo "4. Testing Teams..."
curl -X POST https://outlook.webhook.office.com/webhookb2/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "✅ Teams integration test",
    "sections": [{"activityTitle": "Teams integration is working"}]
  }'

echo "All integration tests sent!"
```

---

## Troubleshooting

### Slack Not Receiving Messages

```bash
# 1. Verify webhook URL
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "test"}'

# 2. Check Alert Manager logs
docker logs alertmanager | grep -i slack

# 3. Verify channel exists and bot has access
# (Manual verification in Slack)
```

### Email Not Received

```bash
# 1. Test SMTP connection
telnet smtp.gmail.com 587

# 2. Verify credentials
swaks --to test@example.com \
  --from alerts@nubabel.com \
  --server smtp.gmail.com:587 \
  --auth-user alerts@nubabel.com \
  --auth-password "$GMAIL_APP_PASSWORD" \
  --header "Subject: Test" \
  --body "Test"

# 3. Check Alert Manager logs
docker logs alertmanager | grep -i email
```

### PagerDuty Not Creating Incidents

```bash
# 1. Verify API key
curl -H "Authorization: Token token=$PAGERDUTY_TOKEN" \
  https://api.pagerduty.com/users

# 2. Test event endpoint
curl -X POST https://events.pagerduty.com/v2/enqueue \
  -H 'Content-Type: application/json' \
  -d '{
    "routing_key": "YOUR_KEY",
    "event_action": "trigger",
    "dedup_key": "test",
    "payload": {
      "summary": "Test",
      "severity": "critical",
      "source": "Test"
    }
  }'

# 3. Check Alert Manager logs
docker logs alertmanager | grep -i pagerduty
```

---

## References

- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [PagerDuty Events API](https://developer.pagerduty.com/docs/events-api-v2/overview/)
- [Microsoft Teams Webhooks](https://docs.microsoft.com/en-us/outlook/actionable-messages/send-via-connectors)
- [Alert Manager Receivers](https://prometheus.io/docs/alerting/latest/configuration/#receiver)

---

**Questions?** Contact: devops@nubabel.com
