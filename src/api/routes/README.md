# Claude Account Management API

REST API endpoints for managing Claude API accounts with health monitoring, quota alerts, and Admin API sync.

## Overview

This API provides admin-only endpoints for:

- **CRUD operations** on Claude accounts
- **Health monitoring** with circuit breaker state
- **Quota alerts** from Admin API sync
- **Usage tracking** (24h/7d/30d periods)
- **Manual operations** (sync, circuit reset)

## Authentication

All endpoints require:

1. **JWT authentication** (Bearer token or session cookie)
2. **Admin role** (owner or admin membership)

## Rate Limiting

- **100 requests per minute** per user
- Rate limit headers included in responses
- 429 status code when exceeded

## Endpoints

### Account CRUD

| Method | Endpoint                  | Description                          |
| ------ | ------------------------- | ------------------------------------ |
| GET    | `/api/admin/accounts`     | List all accounts with health status |
| GET    | `/api/admin/accounts/:id` | Get account details                  |
| POST   | `/api/admin/accounts`     | Register new account                 |
| PUT    | `/api/admin/accounts/:id` | Update account                       |
| DELETE | `/api/admin/accounts/:id` | Disable account (soft delete)        |

### Monitoring

| Method | Endpoint                         | Description                    |
| ------ | -------------------------------- | ------------------------------ |
| GET    | `/api/admin/accounts/:id/health` | Get real-time health metrics   |
| GET    | `/api/admin/accounts/:id/usage`  | Get usage history (24h/7d/30d) |
| GET    | `/api/admin/accounts/:id/alerts` | Get quota alerts               |

### Operations

| Method | Endpoint                                | Description                    |
| ------ | --------------------------------------- | ------------------------------ |
| POST   | `/api/admin/accounts/:id/sync`          | Trigger Admin API sync         |
| POST   | `/api/admin/accounts/:id/reset-circuit` | Manually reset circuit breaker |

## Request/Response Format

### Standardized Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Standardized Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

## Security

### API Key Masking

API keys are **never** exposed in responses. The `metadata.apiKey` field always returns:

```json
{
  "metadata": {
    "apiKey": "***ENCRYPTED***",
    "apiKeyId": "key_abc123"
  }
}
```

### Input Validation

All endpoints validate:

- Required fields
- Field types and formats
- Enum values (tier, status, period)
- UUID formats

### Error Sanitization

Database errors are sanitized before returning to client. Never expose:

- Stack traces
- Database connection strings
- Internal implementation details

## Usage Examples

### Register New Account

```bash
curl -X POST https://auth.nubabel.com/api/admin/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-ant-api03-...",
    "name": "Production Account",
    "tier": "tier3",
    "metadata": {
      "requestLimit": 1000000,
      "tokenLimit": 5000000000
    }
  }'
```

### List Accounts with Health

```bash
curl https://auth.nubabel.com/api/admin/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "organizationId": "uuid",
      "name": "Production Account",
      "status": "active",
      "consecutiveFailures": 0,
      "circuitOpensAt": null,
      "metadata": {
        "apiKey": "***ENCRYPTED***",
        "apiKeyId": "key_abc123"
      },
      "health": {
        "accountId": "uuid",
        "accountName": "Production Account",
        "status": "active",
        "circuitState": "CLOSED",
        "currentLoad": {
          "rpm": { "current": 45, "limit": 1000, "percentage": 4.5 },
          "tpm": { "current": 35000, "limit": 80000, "percentage": 43.75 },
          "itpm": { "current": 15000, "limit": 40000, "percentage": 37.5 }
        },
        "monthlyUsage": {
          "requests": 850000,
          "tokens": 4200000000,
          "estimatedCost": 12600.0
        },
        "uptime": {
          "consecutiveSuccesses": 1523,
          "consecutiveFailures": 0,
          "lastSuccessAt": "2026-01-30T12:00:00Z",
          "lastFailureAt": null,
          "lastFailureReason": null
        }
      }
    }
  ]
}
```

### Get Usage History

```bash
curl "https://auth.nubabel.com/api/admin/accounts/uuid/usage?period=7d" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Trigger Admin API Sync

```bash
curl -X POST https://auth.nubabel.com/api/admin/accounts/uuid/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Reset Circuit Breaker

```bash
curl -X POST https://auth.nubabel.com/api/admin/accounts/uuid/reset-circuit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Error Codes

| Code                     | HTTP Status | Description                           |
| ------------------------ | ----------- | ------------------------------------- |
| `VALIDATION_ERROR`       | 400         | Missing or invalid request fields     |
| `UNAUTHORIZED`           | 401         | Authentication required               |
| `FORBIDDEN`              | 403         | Admin role required                   |
| `ACCOUNT_NOT_FOUND`      | 404         | Account does not exist                |
| `DUPLICATE_ACCOUNT`      | 409         | Account with this name already exists |
| `RATE_LIMIT_EXCEEDED`    | 429         | Too many requests                     |
| `LIST_ACCOUNTS_ERROR`    | 500         | Failed to fetch accounts              |
| `GET_ACCOUNT_ERROR`      | 500         | Failed to fetch account               |
| `REGISTER_ACCOUNT_ERROR` | 500         | Failed to register account            |
| `UPDATE_ACCOUNT_ERROR`   | 500         | Failed to update account              |
| `DELETE_ACCOUNT_ERROR`   | 500         | Failed to disable account             |
| `GET_HEALTH_ERROR`       | 500         | Failed to fetch health metrics        |
| `GET_USAGE_ERROR`        | 500         | Failed to fetch usage history         |
| `GET_ALERTS_ERROR`       | 500         | Failed to fetch alerts                |
| `SYNC_ERROR`             | 500         | Failed to sync account                |
| `RESET_CIRCUIT_ERROR`    | 500         | Failed to reset circuit breaker       |

## OpenAPI Documentation

Full OpenAPI 3.0 specification available at:

- **File**: `src/api/routes/accounts.openapi.yaml`
- **Swagger UI**: (Coming soon)

## Integration with Services

### AccountPoolService

Used for:

- `registerAccount()` - Register new accounts with encryption
- `getAccountHealth()` - Get health metrics

### QuotaMonitorService

Used for:

- `syncUsageFromAdminAPI()` - Sync usage from Claude Admin API
- `checkThresholds()` - Check quota thresholds
- `getUnresolvedAlerts()` - Get active alerts
- `getAllAlerts()` - Get all alerts (including resolved)

## Database Schema

### ClaudeAccount Model

```prisma
model ClaudeAccount {
  id                  String    @id @default(uuid())
  organizationId      String
  name                String
  status              String    @default("active")
  consecutiveFailures Int       @default(0)
  halfOpenSuccesses   Int       @default(0)
  circuitOpensAt      DateTime?
  lastFailureAt       DateTime?
  lastFailureReason   String?
  lastSuccessAt       DateTime?
  metadata            Json      @default("{}")
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  organization Organization @relation(...)
  quotaAlerts  QuotaAlert[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@index([status])
  @@index([circuitOpensAt])
}
```

### QuotaAlert Model

```prisma
model QuotaAlert {
  id           String    @id @default(uuid())
  accountId    String
  type         String
  severity     String
  message      String
  currentValue Int
  limit        Int
  percentage   Float
  quotaType    String
  resolvedAt   DateTime?
  createdAt    DateTime  @default(now())

  account ClaudeAccount @relation(...)

  @@index([accountId])
  @@index([type])
  @@index([severity])
  @@index([resolvedAt])
}
```

## Testing

### Manual Testing

```bash
# Set environment variables
export JWT_TOKEN="your-jwt-token"
export BASE_URL="http://localhost:3000"

# Test list accounts
curl "$BASE_URL/api/admin/accounts" \
  -H "Authorization: Bearer $JWT_TOKEN"

# Test register account
curl -X POST "$BASE_URL/api/admin/accounts" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "apiKey": "sk-ant-api03-test",
    "name": "Test Account",
    "tier": "tier1"
  }'
```

### Integration Tests

(Coming soon - add tests in `src/api/routes/__tests__/accounts.test.ts`)

## Deployment

### Environment Variables

Required:

- `ANTHROPIC_ADMIN_API_KEY` - Claude Admin API key for usage sync

### Mounting in Express

Already mounted in `src/index.ts`:

```typescript
import accountsRouter from "./api/routes/accounts.routes";

app.use("/api/admin/accounts", apiRateLimiter, authenticate, sentryUserContext, accountsRouter);
```

## Future Enhancements

- [ ] Bulk operations (register/update/disable multiple accounts)
- [ ] Account usage analytics dashboard
- [ ] Automated quota alert notifications (Slack/email)
- [ ] Account cost optimization recommendations
- [ ] Historical usage trends (time-series data)
- [ ] Account performance benchmarking
- [ ] Automated failover between accounts
- [ ] Account health scoring algorithm
- [ ] Usage forecasting and capacity planning
- [ ] Integration with billing system

## Support

For issues or questions:

- **Email**: engineering@nubabel.com
- **Slack**: #eng-alerts
- **Documentation**: See OpenAPI spec for detailed endpoint documentation
