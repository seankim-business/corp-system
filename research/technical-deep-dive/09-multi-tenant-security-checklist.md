# Multi-Tenant Security Checklist

**Purpose**: Comprehensive security checklist for Nubabel's multi-tenant SaaS platform, covering data isolation, authentication, authorization, and compliance.

**Source**: Research from OWASP Multi-Tenancy Security Guide, AWS SaaS Best Practices, and 20+ production multi-tenant systems

**Last Updated**: 2026-01-25

---

## Table of Contents

1. [Multi-Tenancy Model](#multi-tenancy-model)
2. [Database Security (Row-Level Security)](#database-security-row-level-security)
3. [API Security](#api-security)
4. [Authentication & Authorization](#authentication--authorization)
5. [Data Leakage Prevention](#data-leakage-prevention)
6. [Session Management](#session-management)
7. [Rate Limiting & DDoS Protection](#rate-limiting--ddos-protection)
8. [Encryption](#encryption)
9. [Audit Logging](#audit-logging)
10. [Testing Strategies](#testing-strategies)
11. [Compliance Checklist](#compliance-checklist)

---

## Multi-Tenancy Model

### Nubabel's Tenancy Structure

**Hierarchy**:

```
Organization (Tenant)
  └─ Users
      └─ Workflows
          └─ Workflow Executions
      └─ MCP Connections
      └─ Sessions
      └─ Slack Integrations
```

**Isolation Level**: **Shared Database, Row-Level Isolation**

| Approach   | Description                         | Nubabel Choice                    |
| ---------- | ----------------------------------- | --------------------------------- |
| **Silo**   | Separate database per tenant        | ❌ Too expensive at scale         |
| **Pool**   | Shared database, logical separation | ✅ **YES** - Using PostgreSQL RLS |
| **Bridge** | Hybrid (critical tenants get silo)  | Future consideration              |

---

## Database Security (Row-Level Security)

### PostgreSQL Row-Level Security (RLS) Implementation

**Enable RLS on all multi-tenant tables**:

```sql
-- migrations/enable-rls.sql

-- 1. Enable RLS on all tenant-scoped tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Workflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkflowExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MCPConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SlackUserMapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SlackThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AIUsage" ENABLE ROW LEVEL SECURITY;

-- 2. Create policy: Users can only see their organization's data
CREATE POLICY tenant_isolation ON "User"
  USING (
    "organizationId" = current_setting('app.current_organization_id')::uuid
  );

CREATE POLICY tenant_isolation ON "Workflow"
  USING (
    "organizationId" = current_setting('app.current_organization_id')::uuid
  );

CREATE POLICY tenant_isolation ON "WorkflowExecution"
  USING (
    EXISTS (
      SELECT 1 FROM "Workflow" w
      WHERE w.id = "WorkflowExecution"."workflowId"
        AND w."organizationId" = current_setting('app.current_organization_id')::uuid
    )
  );

CREATE POLICY tenant_isolation ON "MCPConnection"
  USING (
    "organizationId" = current_setting('app.current_organization_id')::uuid
  );

CREATE POLICY tenant_isolation ON "Session"
  USING (
    "organizationId" = current_setting('app.current_organization_id')::uuid
  );

CREATE POLICY tenant_isolation ON "SlackUserMapping"
  USING (
    "organizationId" = current_setting('app.current_organization_id')::uuid
  );

CREATE POLICY tenant_isolation ON "SlackThread"
  USING (
    EXISTS (
      SELECT 1 FROM "SlackUserMapping" sm
      WHERE sm."slackUserId" = "SlackThread"."slackUserId"
        AND sm."organizationId" = current_setting('app.current_organization_id')::uuid
    )
  );

CREATE POLICY tenant_isolation ON "AIUsage"
  USING (
    "organizationId" = current_setting('app.current_organization_id')::uuid
  );

-- 3. Create policy: Admin role can see all organizations (for support)
CREATE POLICY admin_access ON "User"
  USING (
    current_setting('app.current_user_role') = 'ADMIN'
  );

CREATE POLICY admin_access ON "Workflow"
  USING (
    current_setting('app.current_user_role') = 'ADMIN'
  );

-- Repeat for all tables
```

### Prisma Middleware for Automatic Tenant Context

```typescript
// src/config/prisma.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Middleware to set tenant context
export function setTenantContext(
  organizationId: string,
  userId: string,
  role: string = "USER",
) {
  return prisma.$executeRawUnsafe(`
    SELECT
      set_config('app.current_organization_id', '${organizationId}', true),
      set_config('app.current_user_id', '${userId}', true),
      set_config('app.current_user_role', '${role}', true)
  `);
}

// Express middleware
export async function tenantContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user) {
    await setTenantContext(req.user.organizationId, req.user.id, req.user.role);
  }
  next();
}

export default prisma;
```

### Usage in Express

```typescript
// src/index.ts
import { tenantContextMiddleware } from "./config/prisma";

app.use(authMiddleware); // Sets req.user
app.use(tenantContextMiddleware); // Sets PostgreSQL session vars

// Now all Prisma queries are automatically scoped to tenant
app.get("/api/workflows", async (req, res) => {
  // This query ONLY returns workflows for req.user.organizationId
  // (enforced by RLS, not application code)
  const workflows = await prisma.workflow.findMany();
  res.json(workflows);
});
```

### Testing RLS Policies

```typescript
// tests/security/rls.test.ts

describe("Row-Level Security", () => {
  it("should prevent cross-tenant data access", async () => {
    // Create two organizations
    const org1 = await prisma.organization.create({ data: { name: "Org 1" } });
    const org2 = await prisma.organization.create({ data: { name: "Org 2" } });

    // Create workflow for org1
    const workflow1 = await prisma.workflow.create({
      data: {
        name: "Workflow 1",
        organizationId: org1.id,
        userId: "user1",
      },
    });

    // Set context to org2
    await setTenantContext(org2.id, "user2");

    // Try to read org1's workflow
    const workflows = await prisma.workflow.findMany();

    // Should NOT include workflow1
    expect(workflows).not.toContainEqual(
      expect.objectContaining({ id: workflow1.id }),
    );
    expect(workflows.length).toBe(0);
  });

  it("should prevent SQL injection in tenant context", async () => {
    // Attempt SQL injection
    const maliciousOrgId = '\'; DROP TABLE "Workflow"; --';

    // Should throw error (invalid UUID)
    await expect(setTenantContext(maliciousOrgId, "user1")).rejects.toThrow();
  });
});
```

---

## API Security

### Tenant Validation on Every Request

**NEVER trust client-provided `organizationId`**. Always extract from authenticated session.

```typescript
// ❌ WRONG: Trusting client input
app.get("/api/workflows", async (req, res) => {
  const { organizationId } = req.body; // User can fake this!
  const workflows = await prisma.workflow.findMany({
    where: { organizationId },
  });
  res.json(workflows);
});

// ✅ CORRECT: Using authenticated session
app.get("/api/workflows", async (req, res) => {
  const organizationId = req.user.organizationId; // From JWT
  const workflows = await prisma.workflow.findMany({
    where: { organizationId },
  });
  res.json(workflows);
});

// ✅ BEST: Using RLS (automatic tenant scoping)
app.get("/api/workflows", async (req, res) => {
  // tenantContextMiddleware already set organization context
  const workflows = await prisma.workflow.findMany();
  res.json(workflows);
});
```

### Resource Ownership Verification

**Always verify user owns the resource before performing actions**.

```typescript
// src/api/workflows.ts

app.delete("/api/workflows/:id", async (req, res) => {
  const { id } = req.params;

  // 1. Fetch workflow with organization check
  const workflow = await prisma.workflow.findFirst({
    where: {
      id,
      organizationId: req.user.organizationId, // Verify ownership
    },
  });

  if (!workflow) {
    return res.status(404).json({ error: "Workflow not found" });
  }

  // 2. Check user has permission to delete
  if (workflow.userId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  // 3. Delete
  await prisma.workflow.delete({ where: { id } });

  res.json({ success: true });
});
```

### Prevent Insecure Direct Object References (IDOR)

```typescript
// ❌ WRONG: Directly using user-provided ID
app.get("/api/users/:userId", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
  });
  res.json(user);
});
// Attacker can enumerate all users by trying different IDs!

// ✅ CORRECT: Verify user is in same organization
app.get("/api/users/:userId", async (req, res) => {
  const user = await prisma.user.findFirst({
    where: {
      id: req.params.userId,
      organizationId: req.user.organizationId,
    },
  });

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
});
```

---

## Authentication & Authorization

### JWT-Based Authentication

```typescript
// src/auth/jwt.ts
import jwt from "jsonwebtoken";

interface JWTPayload {
  userId: string;
  organizationId: string;
  role: string;
  email: string;
}

export function generateToken(user: {
  id: string;
  organizationId: string;
  role: string;
  email: string;
}): string {
  return jwt.sign(
    {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET!,
    {
      expiresIn: "7d",
      issuer: "nubabel.com",
      audience: "nubabel-api",
    },
  );
}

export function verifyToken(token: string): JWTPayload {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!, {
      issuer: "nubabel.com",
      audience: "nubabel-api",
    }) as JWTPayload;

    return payload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

// Express middleware
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
  }

  const token = authHeader.substring(7);

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

### Role-Based Access Control (RBAC)

```typescript
// src/auth/rbac.ts

export enum Role {
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
  VIEWER = "VIEWER",
}

export enum Permission {
  WORKFLOW_CREATE = "workflow:create",
  WORKFLOW_READ = "workflow:read",
  WORKFLOW_UPDATE = "workflow:update",
  WORKFLOW_DELETE = "workflow:delete",
  MCP_CONNECT = "mcp:connect",
  MCP_DISCONNECT = "mcp:disconnect",
  USER_INVITE = "user:invite",
  USER_REMOVE = "user:remove",
  ORG_SETTINGS = "org:settings",
}

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    Permission.WORKFLOW_CREATE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_UPDATE,
    Permission.WORKFLOW_DELETE,
    Permission.MCP_CONNECT,
    Permission.MCP_DISCONNECT,
    Permission.USER_INVITE,
    Permission.USER_REMOVE,
    Permission.ORG_SETTINGS,
  ],
  [Role.MEMBER]: [
    Permission.WORKFLOW_CREATE,
    Permission.WORKFLOW_READ,
    Permission.WORKFLOW_UPDATE,
    Permission.WORKFLOW_DELETE,
    Permission.MCP_CONNECT,
  ],
  [Role.VIEWER]: [Permission.WORKFLOW_READ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

// Express middleware
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}

// Usage
app.post(
  "/api/workflows",
  authMiddleware,
  requirePermission(Permission.WORKFLOW_CREATE),
  async (req, res) => {
    // User has permission to create workflows
  },
);
```

---

## Data Leakage Prevention

### Common Leakage Vectors

| Vector               | Risk                                    | Prevention                           |
| -------------------- | --------------------------------------- | ------------------------------------ |
| **Shared IDs**       | Predictable UUIDs → enumeration attacks | Use UUIDv4 (random)                  |
| **Error Messages**   | Expose internal structure               | Generic error messages               |
| **Logs**             | Log sensitive data                      | Sanitize logs                        |
| **Cache Keys**       | Shared cache → data leakage             | Namespace by organization            |
| **Background Jobs**  | Process wrong tenant's data             | Always include tenant ID in job data |
| **Database Queries** | Forget WHERE organizationId             | Use RLS (enforced at DB level)       |

### Prevent ID Enumeration

```typescript
// ❌ WRONG: Sequential IDs
CREATE TABLE "Workflow" (
  id SERIAL PRIMARY KEY, -- 1, 2, 3... (predictable!)
  ...
);

// ✅ CORRECT: UUIDv4 (random)
CREATE TABLE "Workflow" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- random, non-guessable
  ...
);
```

### Sanitize Error Messages

```typescript
// ❌ WRONG: Exposing internal details
app.get("/api/workflows/:id", async (req, res) => {
  try {
    const workflow = await prisma.workflow.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json(workflow);
  } catch (error) {
    // Error: "Workflow with id abc123 not found in database nubabel_prod table workflows"
    res.status(500).json({ error: error.message }); // ❌ Leaks internal details!
  }
});

// ✅ CORRECT: Generic error message
app.get("/api/workflows/:id", async (req, res) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
      },
    });

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    res.json(workflow);
  } catch (error) {
    console.error("[API Error]", error); // Log internally
    res.status(500).json({ error: "An error occurred" }); // Generic message
  }
});
```

### Namespace Redis Keys by Organization

```typescript
// ❌ WRONG: Shared cache keys
await redis.set("session:abc123", JSON.stringify(session));
// If two orgs have same session ID, they overwrite each other!

// ✅ CORRECT: Namespaced keys
await redis.set(
  `org:${organizationId}:session:abc123`,
  JSON.stringify(session),
);
```

### Sanitize Logs

```typescript
// ❌ WRONG: Logging sensitive data
console.log("User login:", {
  email: user.email,
  password: user.password, // ❌ NEVER log passwords!
  apiKey: user.apiKey, // ❌ NEVER log API keys!
});

// ✅ CORRECT: Sanitized logs
console.log("User login:", {
  userId: user.id,
  organizationId: user.organizationId,
  // No sensitive data
});
```

---

## Session Management

### Secure Session Storage

**Redis (Hot) + PostgreSQL (Cold) 2-Tier Pattern**:

```typescript
// Store session in Redis
await redis.setex(
  `org:${organizationId}:session:${sessionId}`,
  24 * 60 * 60, // 24h TTL
  JSON.stringify(sessionData),
);

// Also persist to PostgreSQL (with organizationId for RLS)
await prisma.session.create({
  data: {
    id: sessionId,
    organizationId,
    userId,
    source: "web",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  },
});
```

### Session Hijacking Prevention

```typescript
// Bind session to user agent + IP address
interface SessionData {
  userId: string;
  organizationId: string;
  userAgent: string;
  ipAddress: string;
  createdAt: Date;
}

// Validate on every request
export function validateSession(session: SessionData, req: Request): boolean {
  // Check user agent
  if (session.userAgent !== req.headers["user-agent"]) {
    console.warn("[Security] User agent mismatch", {
      sessionId: session.id,
      expected: session.userAgent,
      actual: req.headers["user-agent"],
    });
    return false;
  }

  // Check IP address (allow some flexibility for mobile users)
  const currentIP = req.ip;
  if (!isSameSubnet(session.ipAddress, currentIP)) {
    console.warn("[Security] IP address mismatch", {
      sessionId: session.id,
      expected: session.ipAddress,
      actual: currentIP,
    });
    return false;
  }

  return true;
}
```

---

## Rate Limiting & DDoS Protection

### Organization-Level Rate Limiting

```typescript
// Prevent single organization from exhausting resources
app.use(async (req, res, next) => {
  if (!req.user) return next();

  const key = `ratelimit:org:${req.user.organizationId}`;
  const limit = 1000; // 1000 req/min
  const window = 60; // 60s

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, window);
  }

  if (count > limit) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      retryAfter: await redis.ttl(key),
    });
  }

  next();
});
```

### IP-Based Rate Limiting (DDoS Protection)

```typescript
// Prevent brute-force login attempts
app.post("/api/auth/login", async (req, res) => {
  const ip = req.ip;
  const key = `ratelimit:ip:${ip}:login`;
  const limit = 5; // 5 attempts per minute
  const window = 60;

  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, window);
  }

  if (count > limit) {
    return res.status(429).json({
      error: "Too many login attempts. Please try again later.",
    });
  }

  // Proceed with login
});
```

---

## Encryption

### Data at Rest

**Encrypt sensitive fields in database**:

```typescript
// src/utils/encryption.ts
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex"); // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(":");

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// Usage: Encrypt MCP credentials before storing
const credentials = {
  apiKey: "secret_key_123",
  accessToken: "token_456",
};

await prisma.mCPConnection.create({
  data: {
    organizationId,
    providerId,
    credentials: encrypt(JSON.stringify(credentials)),
  },
});

// Decrypt when needed
const connection = await prisma.mCPConnection.findUnique({ where: { id } });
const credentials = JSON.parse(decrypt(connection.credentials));
```

### Data in Transit

**Always use HTTPS/TLS**:

```typescript
// src/index.ts
import https from "https";
import fs from "fs";

const options = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH!),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH!),
};

const server = https.createServer(options, app);
server.listen(443);
```

**Railway automatically provides TLS** - no manual configuration needed.

---

## Audit Logging

### Log All Sensitive Actions

```typescript
// src/services/audit-logger.ts

export async function logAuditEvent(event: {
  organizationId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  metadata?: any;
}) {
  await prisma.auditLog.create({
    data: {
      organizationId: event.organizationId,
      userId: event.userId,
      action: event.action,
      resource: event.resource,
      resourceId: event.resourceId,
      metadata: event.metadata,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    },
  });
}

// Usage
app.delete("/api/workflows/:id", async (req, res) => {
  const workflow = await prisma.workflow.delete({
    where: { id: req.params.id },
  });

  await logAuditEvent({
    organizationId: req.user.organizationId,
    userId: req.user.id,
    action: "workflow.delete",
    resource: "workflow",
    resourceId: workflow.id,
    metadata: { workflowName: workflow.name },
  });

  res.json({ success: true });
});
```

### Audit Log Retention

```sql
-- Keep audit logs for 7 years (compliance requirement)
CREATE INDEX idx_audit_log_created_at ON "AuditLog"("createdAt");

-- Archive old logs to S3
-- (Scheduled job runs monthly)
```

---

## Testing Strategies

### Security Test Suite

```typescript
// tests/security/tenant-isolation.test.ts

describe('Tenant Isolation', () => {
  it('should prevent cross-tenant workflow access', async () => {
    const org1 = await createOrganization('Org 1');
    const org2 = await createOrganization('Org 2');

    const workflow1 = await createWorkflow(org1.id);

    // Login as user from org2
    const token = generateToken({ organizationId: org2.id, ... });

    // Try to access org1's workflow
    const res = await request(app)
      .get(`/api/workflows/${workflow1.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should prevent IDOR attacks', async () => {
    const user1 = await createUser({ organizationId: 'org1' });
    const user2 = await createUser({ organizationId: 'org2' });

    // User2 tries to access User1's profile
    const token = generateToken(user2);
    const res = await request(app)
      .get(`/api/users/${user1.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('should enforce RLS policies', async () => {
    const org1 = await createOrganization('Org 1');
    const org2 = await createOrganization('Org 2');

    await createWorkflow(org1.id);
    await createWorkflow(org2.id);

    // Set context to org1
    await setTenantContext(org1.id, 'user1');

    // Query should only return org1's workflows
    const workflows = await prisma.workflow.findMany();
    expect(workflows.length).toBe(1);
    expect(workflows[0].organizationId).toBe(org1.id);
  });
});
```

---

## Compliance Checklist

### GDPR Compliance

- [ ] **Right to Access** - Users can download their data
- [ ] **Right to Deletion** - Users can delete their account + all data
- [ ] **Right to Portability** - Export data in machine-readable format (JSON)
- [ ] **Consent Management** - Track user consent for data processing
- [ ] **Data Minimization** - Only collect necessary data
- [ ] **Breach Notification** - Notify users within 72 hours of breach

### SOC 2 Compliance

- [ ] **Access Control** - RBAC implemented
- [ ] **Encryption** - Data encrypted at rest and in transit
- [ ] **Audit Logging** - All sensitive actions logged
- [ ] **Change Management** - Documented deployment process
- [ ] **Incident Response** - Runbook for security incidents
- [ ] **Vendor Management** - Third-party risk assessment (Anthropic, Railway, etc.)

### HIPAA Compliance (if applicable)

- [ ] **BAA with Vendors** - Business Associate Agreement with Anthropic, Railway
- [ ] **PHI Encryption** - AES-256 for PHI at rest
- [ ] **Access Logs** - Track all PHI access
- [ ] **Minimum Necessary** - Only access PHI when required
- [ ] **De-identification** - Remove PHI from logs and analytics

---

## Implementation Checklist

### Phase 1: Database Security

- [ ] Enable RLS on all multi-tenant tables
- [ ] Create tenant isolation policies
- [ ] Implement Prisma middleware for tenant context
- [ ] Test RLS policies (cross-tenant access should fail)

### Phase 2: API Security

- [ ] Validate organizationId on every request (from JWT, not body)
- [ ] Implement resource ownership verification
- [ ] Prevent IDOR attacks (verify tenant ownership)
- [ ] Sanitize error messages (no internal details)

### Phase 3: Authentication & Authorization

- [ ] JWT-based authentication
- [ ] Role-based access control (RBAC)
- [ ] Permission middleware
- [ ] Session validation (user agent + IP)

### Phase 4: Data Protection

- [ ] Encrypt sensitive fields (MCP credentials, API keys)
- [ ] Use HTTPS/TLS for all traffic
- [ ] Namespace Redis keys by organization
- [ ] Sanitize logs (no passwords, API keys)

### Phase 5: Rate Limiting

- [ ] Organization-level rate limiting
- [ ] IP-based rate limiting (DDoS protection)
- [ ] API quota enforcement

### Phase 6: Audit & Compliance

- [ ] Audit logging for sensitive actions
- [ ] Security test suite (tenant isolation, IDOR, RLS)
- [ ] GDPR compliance (right to access, deletion, portability)
- [ ] SOC 2 compliance (access control, encryption, audit logs)

---

## Conclusion

Multi-tenant security requires **defense in depth**:

1. **Database Layer** - RLS ensures queries can't access other tenants' data
2. **Application Layer** - JWT + RBAC enforces authentication and authorization
3. **API Layer** - Validation prevents IDOR and injection attacks
4. **Infrastructure Layer** - Encryption, rate limiting, DDoS protection

**Key Principle**: **Never trust client input**. Always validate organizationId from authenticated session, never from request body.

**Testing**: Security must be tested continuously. Add tenant isolation tests to CI/CD pipeline.

**Compliance**: GDPR, SOC 2, and HIPAA require ongoing audits and documentation.

**Next Steps**: Implement Phase 1-6 checklist, then run security audit before production launch.
