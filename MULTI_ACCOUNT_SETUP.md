# Multi-Account System Setup Guide

This guide walks you through setting up the multi-account Claude API management system.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Steps](#installation-steps)
- [Configuration Guide](#configuration-guide)
- [First Account Registration](#first-account-registration)
- [Troubleshooting](#troubleshooting)
- [Architecture Overview](#architecture-overview)

---

## Prerequisites

### Required Services

1. **PostgreSQL 15+**
   - Database for storing account metadata and quota information
   - Must have UUID extension enabled (automatically handled by migrations)

2. **Redis 7+**
   - Required for capacity tracking and real-time quota synchronization
   - Recommended: Persistent storage enabled

3. **Node.js 20+**
   - Runtime environment for the application

### Optional Services

4. **Slack Bot** (for quota alerts)
   - Bot token with permissions: `chat:write`, `app_mentions:read`
   - Channels: `#eng-alerts`, `#it-test` (configurable)

5. **Railway CLI** (for QA automation)
   - Used for automated deployment testing

---

## Installation Steps

### 1. Generate Encryption Key

The encryption key is used to securely store API keys and tokens:

```bash
# Generate a 64-character hex key
openssl rand -hex 32
```

Copy the output and add it to your `.env` file.

### 2. Configure Environment Variables

Update your `.env` file with the following:

```bash
# Multi-Account System Configuration
ENCRYPTION_KEY="paste-your-64-character-hex-key-here"

# Optional: Admin API Key for quota monitoring
ANTHROPIC_ADMIN_API_KEY=""

# Slack Alert Channels (optional)
SLACK_ALERT_CHANNEL="#eng-alerts"
SLACK_ACTIVITY_CHANNEL="#it-test"

# Railway Token (optional - for QA automation)
RAILWAY_TOKEN=""

# Base URL (for Playwright tests)
BASE_URL="https://auth.nubabel.com"
```

### 3. Apply Database Migrations

Run the Prisma migrations to create required tables:

```bash
# For development (auto-apply)
npx prisma migrate dev

# For production (manual apply)
npx prisma migrate deploy
```

This creates the following tables:

- `claude_accounts` - Account metadata and circuit breaker state
- `quota_alerts` - Quota threshold alerts and notifications

### 4. Verify Service Connectivity

Run the initialization script to check all services:

```bash
tsx scripts/init-multi-account.ts
```

Expected output:

```
========================================
Multi-Account System Health Check
========================================

✅ ENCRYPTION_KEY       HEALTHY
   ENCRYPTION_KEY is properly configured

✅ PostgreSQL           HEALTHY
   Database connection successful
   Details: {"accountCount":0}

✅ Redis                HEALTHY
   Redis connection successful

❌ Slack                OFFLINE
   SLACK_BOT_TOKEN not configured (optional)

❌ Railway              OFFLINE
   RAILWAY_TOKEN not configured (optional)

✅ Default Account      HEALTHY
   Default Claude account created successfully
   Details: {"id":"..."}

========================================
✅ All systems operational
```

### 5. Build the Application

Compile TypeScript to JavaScript:

```bash
npm run build
```

### 6. Start the Server

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

---

## Configuration Guide

### Multi-Account Configuration File

The system uses `config/multi-account.json` for advanced configuration:

```json
{
  "accountSelection": {
    "strategy": "least_loaded",
    "fallbackStrategies": ["random", "round_robin"],
    "retryOnFailure": true,
    "maxRetries": 3
  },

  "capacityTracking": {
    "enabled": true,
    "syncIntervalSeconds": 60,
    "redisKeyPrefix": "claude:capacity:",
    "redisTTLSeconds": 300
  },

  "circuitBreaker": {
    "enabled": true,
    "failureThreshold": 5,
    "successThreshold": 2,
    "timeout": 60000,
    "resetTimeoutSeconds": 300
  },

  "quotaAlerts": {
    "enabled": true,
    "thresholds": {
      "warning": 80,
      "critical": 95,
      "emergency": 100
    }
  }
}
```

### Account Selection Strategies

1. **least_loaded** (default)
   - Selects account with lowest current usage
   - Best for balanced distribution

2. **round_robin**
   - Rotates through accounts sequentially
   - Simple and predictable

3. **random**
   - Randomly selects available account
   - Good for testing

### Circuit Breaker Configuration

Protects against cascading failures:

- **failureThreshold**: Number of consecutive failures before circuit opens (default: 5)
- **successThreshold**: Number of successes needed to close circuit (default: 2)
- **resetTimeoutSeconds**: Wait time before trying half-open state (default: 300)

### Quota Alert Thresholds

Alerts are triggered at:

- **80%** - Warning (logged + Slack to activity channel)
- **95%** - Critical (Slack to alert channel)
- **100%** - Emergency (Slack to alert channel + email if configured)

---

## First Account Registration

### Via Admin API (Recommended)

```bash
curl -X POST http://localhost:3000/api/v1/admin/claude-accounts \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "org-uuid-here",
    "name": "Production Account",
    "apiKey": "sk-ant-...",
    "tier": "pro"
  }'
```

### Via Database (Development Only)

```sql
INSERT INTO claude_accounts (
  id,
  organization_id,
  name,
  status,
  metadata,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'your-org-id',
  'Development Account',
  'active',
  '{"apiKey": "sk-ant-...", "tier": "free"}',
  NOW(),
  NOW()
);
```

**Note:** In production, API keys should be encrypted before storage.

### Verify Account Registration

```bash
tsx scripts/init-multi-account.ts
```

Check output for account count > 0.

---

## Troubleshooting

### Issue: `ENCRYPTION_KEY is not set`

**Solution:**

```bash
# Generate new key
openssl rand -hex 32

# Add to .env
echo "ENCRYPTION_KEY=your-generated-key" >> .env
```

### Issue: `Database connection failed`

**Symptoms:**

```
❌ PostgreSQL           OFFLINE
   Database connection failed: connect ECONNREFUSED
```

**Solution:**

1. Verify PostgreSQL is running:

   ```bash
   psql -U postgres -c "SELECT version();"
   ```

2. Check `DATABASE_URL` in `.env`:

   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/nubabel"
   ```

3. Test connection:
   ```bash
   npx prisma db pull
   ```

### Issue: `Redis connection failed`

**Symptoms:**

```
❌ Redis                OFFLINE
   Redis connection failed: ECONNREFUSED
```

**Solution:**

1. Start Redis:

   ```bash
   # macOS (Homebrew)
   brew services start redis

   # Linux
   sudo systemctl start redis

   # Docker
   docker run -d -p 6379:6379 redis:7-alpine
   ```

2. Verify Redis is running:

   ```bash
   redis-cli ping
   # Should return: PONG
   ```

3. Check `REDIS_URL` in `.env`:
   ```bash
   REDIS_URL="redis://localhost:6379"
   ```

### Issue: `claude_accounts table does not exist`

**Solution:**

```bash
# Apply migrations
npx prisma migrate deploy

# Or for development
npx prisma migrate dev
```

### Issue: Circuit breaker keeps opening

**Symptoms:**

- Accounts marked as `half_open` or circuit keeps opening
- Error: `All accounts are unavailable (circuit breaker open)`

**Solution:**

1. Check account status:

   ```bash
   npx prisma studio
   # Navigate to claude_accounts table
   ```

2. Reset circuit breaker manually:

   ```sql
   UPDATE claude_accounts
   SET status = 'active',
       consecutive_failures = 0,
       circuit_opens_at = NULL,
       last_failure_at = NULL
   WHERE status IN ('half_open', 'open');
   ```

3. Verify API keys are valid:
   ```bash
   curl https://api.anthropic.com/v1/messages \
     -H "x-api-key: YOUR_API_KEY" \
     -H "anthropic-version: 2023-06-01" \
     -H "content-type: application/json" \
     -d '{"model":"claude-3-sonnet-20240229","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
   ```

### Issue: Quota alerts not working

**Solution:**

1. Verify Slack credentials:

   ```bash
   # Test Slack connection
   curl https://slack.com/api/auth.test \
     -H "Authorization: Bearer $SLACK_BOT_TOKEN"
   ```

2. Check alert configuration:

   ```json
   {
     "quotaAlerts": {
       "enabled": true,
       "channels": {
         "slack": true
       }
     }
   }
   ```

3. Verify Slack channels exist:
   - `#eng-alerts` - For critical/emergency alerts
   - `#it-test` - For warning/activity alerts

### Debug Mode

Enable debug logging:

```bash
# Add to .env
LOG_LEVEL="debug"

# Restart server
npm run dev
```

Check logs for detailed information:

```bash
tail -f logs/app.log
```

---

## Architecture Overview

### Components

1. **Account Pool Service** (`src/services/account-pool/account-pool.service.ts`)
   - Manages multiple Claude API accounts
   - Implements account selection strategies
   - Handles circuit breaker logic

2. **Capacity Tracker** (`src/services/account-pool/capacity-tracker.ts`)
   - Tracks real-time usage metrics
   - Synchronizes with Redis
   - Monitors quota thresholds

3. **Quota Alert Service** (`src/services/account-pool/quota-alert.service.ts`)
   - Sends alerts via Slack/email
   - Throttles duplicate notifications
   - Tracks alert resolution

4. **Circuit Breaker**
   - Per-account failure tracking
   - Automatic recovery with half-open state
   - Prevents cascading failures

### Data Flow

```
Request
  ↓
Account Selection
  ↓
Capacity Check (Redis)
  ↓
Circuit Breaker Check
  ↓
API Call
  ↓
Update Metrics (Redis)
  ↓
Check Thresholds
  ↓
Send Alerts (if needed)
```

### Database Schema

**claude_accounts**

```sql
CREATE TABLE claude_accounts (
  id UUID PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id),
  name VARCHAR(255),
  status VARCHAR(50), -- active, half_open, open
  consecutive_failures INT,
  half_open_successes INT,
  circuit_opens_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  last_success_at TIMESTAMPTZ,
  metadata JSONB, -- API key (encrypted), tier, limits
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**quota_alerts**

```sql
CREATE TABLE quota_alerts (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES claude_accounts(id),
  type VARCHAR(50), -- requests_per_minute, tokens_per_day, etc.
  severity VARCHAR(20), -- warning, critical, emergency
  message TEXT,
  current_value INT,
  limit INT,
  percentage FLOAT,
  quota_type VARCHAR(50),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);
```

---

## Next Steps

1. **Production Deployment**
   - Use environment-specific `.env` files
   - Enable encryption for API keys in database
   - Set up monitoring and alerting

2. **Load Testing**
   - Test with multiple concurrent requests
   - Verify circuit breaker behavior
   - Check quota tracking accuracy

3. **Monitoring**
   - Set up application metrics (Prometheus/Grafana)
   - Monitor Redis memory usage
   - Track API response times

4. **Scaling**
   - Add more Claude accounts as needed
   - Implement account auto-scaling
   - Consider multi-region deployment

---

## Support

For issues and questions:

- GitHub Issues: https://github.com/your-org/nubabel/issues
- Documentation: https://docs.nubabel.com
- Email: engineering@nubabel.com
