# Redis Production Configuration

## Overview

This document describes the Redis security configuration for production deployment on Railway. The implementation includes TLS encryption, password authentication, and key prefix isolation for multi-environment support.

## Security Features

### 1. TLS Encryption

**Status**: Enabled for production environments

**URL Format**: `rediss://` (note the double 's' for TLS)

**How It Works**:

- Detects `rediss://` scheme in `REDIS_URL`
- Automatically enables TLS socket configuration
- Disables certificate verification for Railway self-signed certificates

**Configuration**:

```typescript
socket: {
  tls: redisUrl.startsWith("rediss://"),
  rejectUnauthorized: false,
}
```

**Railway Integration**:

- Railway automatically provides `rediss://` URLs when Redis plugin is added
- No manual TLS configuration needed
- Self-signed certificates are handled automatically

### 2. Password Authentication

**Status**: Enabled via environment variable

**Sources**:

1. **URL-embedded**: `rediss://default:PASSWORD@host:port`
2. **Environment variable**: `REDIS_PASSWORD` (fallback if not in URL)

**Configuration**:

```typescript
password: process.env.REDIS_PASSWORD || undefined;
```

**Best Practices**:

- For Railway: Include password in `REDIS_URL` (auto-generated)
- For local development: Leave `REDIS_PASSWORD` empty
- Never commit passwords to version control

### 3. Key Prefix for Environment Isolation

**Status**: Enabled for all operations

**Format**: `{environment}:{key}`

**Examples**:

- Development: `development:session:abc123`
- Staging: `staging:session:abc123`
- Production: `production:session:abc123`

**Implementation**:

```typescript
function getPrefixedKey(key: string): string {
  const nodeEnv = process.env.NODE_ENV || "development";
  return `${nodeEnv}:${key}`;
}
```

**Benefits**:

- Isolates data between environments sharing same Redis instance
- Prevents accidental data leakage
- Enables safe testing in production-like environments
- Automatic for all Redis operations (get, set, del, etc.)

## Deployment Guide

### Local Development

No TLS required for local development:

```bash
# .env
REDIS_URL=redis://localhost:6379
NODE_ENV=development
REDIS_PASSWORD=
```

Start Redis locally:

```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Verify connection:

```bash
npm run dev
# Expected log: ✅ Redis client connected { env: 'development', tls: false, keyPrefix: 'development:' }
```

### Railway Production Deployment

Railway automatically provides Redis with TLS:

**Step 1**: Add Redis plugin to Railway project

- Go to Railway dashboard
- Click "Add Service" → "Redis"
- Railway generates `REDIS_URL` with `rediss://` scheme

**Step 2**: Environment variables are auto-set

- Railway injects `REDIS_URL` automatically
- No manual configuration needed

**Step 3**: Verify in logs

```
✅ Redis client connected { env: 'production', tls: true, keyPrefix: 'production:' }
```

### Staging Environment

For staging with separate Redis instance:

```bash
# .env.staging
REDIS_URL=rediss://default:staging-password@staging-redis.railway.app:6379
NODE_ENV=staging
REDIS_PASSWORD=staging-password
```

## Verification

### Check Connection Status

Look for this log message on startup:

```
✅ Redis client connected { env: 'production', tls: true, keyPrefix: 'production:' }
```

**Fields**:

- `env`: Current environment (development/staging/production)
- `tls`: Whether TLS is enabled (true for rediss://)
- `keyPrefix`: Key prefix being used

### Verify Key Isolation

Connect to Redis and check keys:

```bash
redis-cli -u rediss://default:password@host:port

# List all keys
KEYS *

# Should see prefixed keys:
# production:session:abc123
# production:cache:xyz789
```

### Test Password Authentication

```bash
# This should fail without password
redis-cli -h host -p port

# This should succeed with password
redis-cli -u rediss://default:password@host:port
```

## Troubleshooting

### Error: "ECONNREFUSED"

**Cause**: Redis server not running or wrong host/port

**Solution**:

1. Check Redis is running: `redis-cli ping`
2. Verify `REDIS_URL` is correct
3. Check firewall/network access

### Error: "certificate verification failed"

**Cause**: TLS certificate validation failed

**Solution**:

- Already handled in code: `rejectUnauthorized: false`
- This is safe for Railway self-signed certificates
- If error persists, check TLS is enabled: `rediss://` in URL

### Error: "WRONGPASS invalid username-password pair"

**Cause**: Wrong password or missing authentication

**Solution**:

1. Verify `REDIS_PASSWORD` matches URL password
2. Check password is set in Railway environment
3. Ensure password is not empty string

### Keys not isolated by environment

**Cause**: Key prefix not applied

**Solution**:

1. Check `NODE_ENV` is set correctly
2. Verify logs show correct `keyPrefix`
3. All Redis operations use `getPrefixedKey()` helper

### Connection timeout

**Cause**: Network latency or connection pool exhausted

**Solution**:

1. Increase `connectTimeout`: Currently 5000ms
2. Check Redis server load
3. Monitor connection pool usage

## Configuration Reference

### Environment Variables

| Variable         | Required | Example                           | Notes                  |
| ---------------- | -------- | --------------------------------- | ---------------------- |
| `REDIS_URL`      | Yes      | `rediss://default:pass@host:6379` | Railway auto-provides  |
| `REDIS_PASSWORD` | No       | `my-secure-password`              | Fallback if not in URL |
| `NODE_ENV`       | Yes      | `production`                      | Used for key prefix    |

### Socket Configuration

| Option               | Value               | Purpose                 |
| -------------------- | ------------------- | ----------------------- |
| `connectTimeout`     | 5000ms              | Connection timeout      |
| `tls`                | Auto-detected       | Enable for `rediss://`  |
| `rejectUnauthorized` | false               | Allow self-signed certs |
| `reconnectStrategy`  | Exponential backoff | Retry on disconnect     |

### Reconnection Strategy

- **Max retries**: 10 attempts
- **Backoff**: `Math.min(retries * 100, 3000)` ms
- **Max wait**: 3 seconds between retries
- **Failure**: Logs error after 10 failed attempts

## Security Best Practices

### 1. Never Commit Passwords

```bash
# ❌ Bad
REDIS_PASSWORD=my-secret-password

# ✅ Good
REDIS_PASSWORD=  # Leave empty, use URL auth
```

### 2. Use TLS in Production

```bash
# ❌ Bad (production)
REDIS_URL=redis://host:6379

# ✅ Good (production)
REDIS_URL=rediss://default:password@host:6379
```

### 3. Rotate Passwords Regularly

- Change Redis password every 90 days
- Update `REDIS_URL` in Railway environment
- No restart needed (connection pool refreshes)

### 4. Monitor Connection Logs

```bash
# Check for connection errors
npm run dev 2>&1 | grep -i redis

# Expected: "Redis client connected"
# Unexpected: "Redis connection error"
```

### 5. Isolate Environments

- Use separate Redis instances for prod/staging
- Or use key prefixes (already implemented)
- Never share credentials between environments

## Performance Considerations

### Connection Pooling

- Single client instance (singleton pattern)
- Reused across all requests
- Automatic reconnection on failure

### Key Prefix Overhead

- Minimal performance impact
- Prefix added at operation time
- No additional memory overhead

### TLS Overhead

- ~5-10% latency increase
- Negligible for most use cases
- Worth the security benefit

## Migration Guide

### From Unencrypted to TLS

1. **Update REDIS_URL**:

   ```bash
   # Before
   REDIS_URL=redis://host:6379

   # After
   REDIS_URL=rediss://default:password@host:6379
   ```

2. **Restart application**:

   ```bash
   npm run dev
   ```

3. **Verify logs**:
   ```
   ✅ Redis client connected { env: 'production', tls: true, keyPrefix: 'production:' }
   ```

### From No Password to Password Auth

1. **Set password in Redis**:

   ```bash
   redis-cli CONFIG SET requirepass "new-password"
   ```

2. **Update REDIS_URL**:

   ```bash
   REDIS_URL=rediss://default:new-password@host:6379
   ```

3. **Restart application**

## Monitoring

### Key Metrics

- **Connection status**: Check logs on startup
- **Error rate**: Monitor `Redis client error` logs
- **Reconnection attempts**: Should be rare
- **Key count**: Use `DBSIZE` command

### Health Check

```typescript
// Add to health check endpoint
const redisClient = await getRedisClient();
const pong = await redisClient.ping();
// Returns "PONG" if healthy
```

## References

- [Redis Security Documentation](https://redis.io/docs/management/security/)
- [Railway Redis Plugin](https://docs.railway.app/databases/redis)
- [Node Redis Client](https://github.com/redis/node-redis)
- [TLS/SSL Configuration](https://redis.io/docs/management/security/encryption/)

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review logs: `npm run dev 2>&1 | grep redis`
3. Contact: engineering@nubabel.com
