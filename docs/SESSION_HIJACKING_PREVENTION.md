# Session Hijacking Prevention

## Overview

This document describes the session hijacking prevention system implemented in Nubabel. The system detects and prevents unauthorized access to user sessions by validating IP addresses and User-Agent headers on each request.

## Architecture

### Components

1. **Session Model Enhancement** (`prisma/schema.prisma`)
   - `ipAddress`: Stores the IP address where the session was created
   - `userAgent`: Stores the User-Agent string of the client

2. **SessionHijackingAttempt Audit Table** (`prisma/schema.prisma`)
   - Logs all detected mismatches for security monitoring
   - Tracks whether the request was blocked or just logged

3. **SessionHijackingService** (`src/services/session-hijacking.ts`)
   - Extracts IP and User-Agent from requests
   - Validates session context against stored values
   - Logs hijacking attempts to the database

4. **Auth Middleware** (`src/middleware/auth.middleware.ts`)
   - Validates IP and User-Agent on each authenticated request
   - Blocks or warns based on configuration

5. **Auth Routes** (`src/auth/auth.routes.ts`)
   - Captures IP and User-Agent during login/registration
   - Stores session metadata in the database

## How It Works

### Session Creation Flow

```
1. User logs in via /auth/login or /auth/google/callback
2. IP address extracted from X-Forwarded-For or req.ip
3. User-Agent extracted from request headers
4. Session token created with JWT (includes IP/User-Agent)
5. Session metadata stored in database with ipAddress and userAgent
6. Session cookie set in response
```

### Session Validation Flow

```
1. User makes authenticated request
2. Session token verified in auth middleware
3. Current IP and User-Agent extracted from request
4. Compared against stored values in JWT payload
5. If mismatch detected:
   - Log hijacking attempt to SessionHijackingAttempt table
   - If mode="block": reject request (401)
   - If mode="warn": allow request but log warning
```

## Configuration

### Environment Variable

```bash
# .env
SESSION_HIJACKING_MODE="warn"  # or "block"
```

**Modes:**

- `warn`: Log mismatches but allow requests (default, user-friendly)
- `block`: Reject requests with mismatches (strict security)

### Recommendation

- **Development**: Use `warn` mode to avoid blocking legitimate requests
- **Production**: Use `warn` mode initially, then switch to `block` after monitoring

## Database Schema

### Session Table

```sql
ALTER TABLE "sessions" ADD COLUMN "ip_address" VARCHAR(45);
ALTER TABLE "sessions" ADD COLUMN "user_agent" TEXT;
```

### SessionHijackingAttempt Table

```sql
CREATE TABLE "session_hijacking_attempts" (
    "id" UUID PRIMARY KEY,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "mismatch_type" VARCHAR(50) NOT NULL,  -- ip_mismatch, user_agent_mismatch, both
    "expected_ip" VARCHAR(45),
    "actual_ip" VARCHAR(45),
    "expected_user_agent" TEXT,
    "actual_user_agent" TEXT,
    "action" VARCHAR(50) NOT NULL,  -- logged, warned, blocked
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "request_path" VARCHAR(255),
    "request_method" VARCHAR(10),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## IP Address Extraction

The system extracts IP addresses in the following order:

1. **X-Forwarded-For header** (first value if multiple)
   - Used when behind a proxy/load balancer
   - Example: `X-Forwarded-For: 203.0.113.1, 198.51.100.1`
   - Extracts: `203.0.113.1`

2. **req.ip** (Express property)
   - Automatically handles X-Forwarded-For if configured

3. **req.socket.remoteAddress** (fallback)
   - Direct socket connection IP

## Legitimate Use Cases for Mismatches

### IP Changes

- User switches networks (WiFi → mobile data)
- User travels to different location
- ISP reassigns IP address
- VPN connection changes

**Recommendation**: Use `warn` mode to allow these legitimate cases.

### User-Agent Changes

- Browser update
- Browser extension installation
- User-Agent spoofing (rare)

**Recommendation**: User-Agent mismatches are less common and less critical than IP changes.

## Monitoring and Alerts

### Query Hijacking Attempts

```sql
-- Recent hijacking attempts
SELECT * FROM session_hijacking_attempts
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Blocked attempts
SELECT * FROM session_hijacking_attempts
WHERE blocked = true
ORDER BY created_at DESC;

-- Users with multiple attempts
SELECT user_id, COUNT(*) as attempt_count
FROM session_hijacking_attempts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_id
HAVING COUNT(*) > 5
ORDER BY attempt_count DESC;
```

### Logging

All hijacking attempts are logged with:

- User ID
- Session ID
- Mismatch type (IP, User-Agent, or both)
- Expected vs actual values
- Action taken (logged, warned, blocked)

## Security Considerations

### Strengths

✅ Detects IP-based session hijacking
✅ Detects User-Agent spoofing
✅ Audit trail for security investigations
✅ Configurable behavior (warn vs block)
✅ Non-blocking by default (user-friendly)

### Limitations

⚠️ IP addresses can change legitimately
⚠️ User-Agent can be spoofed
⚠️ Does not prevent token theft
⚠️ Does not prevent credential compromise

### Recommendations

1. **Use HTTPS only** - Prevent token interception
2. **Use httpOnly cookies** - Prevent XSS token theft
3. **Implement rate limiting** - Prevent brute force attacks
4. **Monitor for patterns** - Detect coordinated attacks
5. **Combine with other measures** - MFA, device fingerprinting, etc.

## Implementation Details

### SessionHijackingService

```typescript
// Extract IP and User-Agent from request
const context = sessionHijackingService.extractSessionContext(req);

// Check if session is valid
const result = await sessionHijackingService.checkSessionValidity(
  sessionId,
  userId,
  organizationId,
  currentContext,
  storedContext,
);

if (!result.isValid && result.shouldBlock) {
  return res.status(401).json({ error: result.reason });
}
```

### Auth Middleware

```typescript
// In authenticate middleware
const currentIp = req.ip || req.socket.remoteAddress;
const currentUserAgent = req.get("user-agent");

if (payload.ipAddress && payload.ipAddress !== currentIp) {
  logger.warn("Session hijacking attempt detected: IP mismatch", {
    userId: payload.userId,
    sessionIp: payload.ipAddress,
    currentIp,
  });
  return res.status(401).json({ error: "Session invalid: IP mismatch" });
}
```

## Migration Guide

### Step 1: Deploy Code

```bash
git pull
npm install
npm run build
```

### Step 2: Run Migration

```bash
npx prisma migrate deploy
```

This will:

- Add `ip_address` and `user_agent` columns to `sessions` table
- Create `session_hijacking_attempts` table
- Create indexes for performance

### Step 3: Configure Environment

```bash
# .env
SESSION_HIJACKING_MODE="warn"  # Start with warn mode
```

### Step 4: Monitor

```bash
# Check for hijacking attempts
SELECT COUNT(*) FROM session_hijacking_attempts
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Step 5: Adjust if Needed

If too many false positives:

- Keep `warn` mode
- Adjust IP extraction logic
- Consider User-Agent less critical

If no issues after 1 week:

- Switch to `block` mode
- Monitor for user complaints

## Testing

### Manual Testing

```bash
# 1. Login from one IP
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# 2. Use session token from different IP
curl -X GET http://localhost:3000/api/user \
  -H "Cookie: session=<token>" \
  -H "X-Forwarded-For: 203.0.113.1"

# 3. Check hijacking attempts
SELECT * FROM session_hijacking_attempts
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;
```

### Automated Testing

```typescript
// Example test
describe("Session Hijacking Prevention", () => {
  it("should detect IP mismatch", async () => {
    const result = await sessionHijackingService.checkSessionValidity(
      "session_123",
      "user_456",
      "org_789",
      { ipAddress: "203.0.113.2", userAgent: "Chrome" },
      { ipAddress: "203.0.113.1", userAgent: "Chrome" },
    );

    expect(result.isValid).toBe(false);
    expect(result.mismatchType).toBe("ip_mismatch");
  });
});
```

## Troubleshooting

### Issue: Too Many False Positives

**Cause**: Users legitimately changing IPs (mobile networks, VPNs)

**Solution**:

- Keep `warn` mode enabled
- Monitor patterns to identify legitimate changes
- Consider IP geolocation for smarter detection

### Issue: User-Agent Mismatches

**Cause**: Browser updates, extensions, or spoofing

**Solution**:

- User-Agent is less reliable than IP
- Consider making User-Agent validation optional
- Focus on IP-based detection

### Issue: Proxy/Load Balancer Issues

**Cause**: X-Forwarded-For header not properly configured

**Solution**:

- Verify proxy is setting X-Forwarded-For header
- Check Express trust proxy configuration
- Test IP extraction with `console.log(req.ip)`

## Future Enhancements

1. **Device Fingerprinting**: Add device ID to session validation
2. **Geolocation**: Detect impossible travel (e.g., US → China in 1 second)
3. **Behavioral Analysis**: Learn normal user patterns
4. **MFA Integration**: Require MFA for suspicious sessions
5. **Session Binding**: Bind sessions to specific devices
6. **Adaptive Security**: Adjust strictness based on risk level

## References

- [OWASP Session Management](https://owasp.org/www-community/attacks/Session_hijacking_attack)
- [RFC 7231 - User-Agent](https://tools.ietf.org/html/rfc7231#section-5.5.3)
- [X-Forwarded-For Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For)
