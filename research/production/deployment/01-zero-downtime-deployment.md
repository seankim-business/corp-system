# Zero-Downtime Deployment Guide for Node/Express + Prisma/PostgreSQL

> **Target Platform**: Railway-like PaaS (Railway, Render, Fly.io)  
> **Stack**: Node.js/Express, Prisma ORM, PostgreSQL  
> **Context**: Nubabel multi-tenant SaaS

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Deployment Strategies Comparison](#deployment-strategies-comparison)
3. [Database Migrations: Expand/Contract Pattern](#database-migrations-expandcontract-pattern)
4. [Health Checks & Readiness Probes](#health-checks--readiness-probes)
5. [Feature Flags for Safe Releases](#feature-flags-for-safe-releases)
6. [Rollback Strategies](#rollback-strategies)
7. [CI/CD Pipeline (GitHub Actions)](#cicd-pipeline-github-actions)
8. [Actionable Checklist](#actionable-checklist)
9. [Sources & Citations](#sources--citations)

---

## Executive Summary

Zero-downtime deployment ensures users experience no service interruption during releases. For a multi-tenant SaaS like Nubabel, this is critical—any downtime affects all tenants simultaneously.

**Key Principles:**

- **Decouple deployment from release** using feature flags
- **Use backward-compatible migrations** (expand/contract pattern)
- **Implement health checks** for traffic routing decisions
- **Automate rollback** capabilities at every layer

---

## Deployment Strategies Comparison

### Blue-Green Deployment

**How it works:** Maintain two identical production environments. Deploy to the inactive environment, test, then switch traffic.

```
┌─────────────┐     ┌─────────────┐
│   BLUE      │     │   GREEN     │
│  (Active)   │ ──► │  (Staging)  │
│  v1.0.0     │     │  v1.1.0     │
└─────────────┘     └─────────────┘
       │                   │
       └───── Switch ──────┘
```

**Pros:**

- Instant rollback (switch back to blue)
- Full testing in production-like environment
- Zero downtime during switch

**Cons:**

- Requires 2x infrastructure (cost)
- Database schema must be backward-compatible
- Complex for stateful applications

**Best for:** Major releases, high-risk changes

### Rolling Deployment

**How it works:** Gradually replace old instances with new ones, one at a time.

```
Instance 1: v1.0 → v1.1 ✓
Instance 2: v1.0 → v1.1 ✓
Instance 3: v1.0 → v1.1 ✓
```

**Pros:**

- Resource efficient (no duplicate infrastructure)
- Gradual rollout reduces blast radius
- Native support on Railway/Render

**Cons:**

- Mixed versions during deployment
- Slower rollback (must redeploy)
- Requires backward-compatible code

**Best for:** Regular releases, incremental updates

### Canary Deployment

**How it works:** Route a small percentage of traffic to the new version, monitor, then gradually increase.

```
Traffic Split:
├── 95% → v1.0.0 (stable)
└── 5%  → v1.1.0 (canary)
```

**Pros:**

- Real-world testing with minimal risk
- Data-driven rollout decisions
- Early detection of issues

**Cons:**

- Requires sophisticated traffic routing
- Monitoring complexity
- Not natively supported on all PaaS

**Best for:** High-traffic applications, A/B testing

### Recommendation for Nubabel

**Primary Strategy: Rolling Deployment with Health Checks**

Railway and similar platforms use rolling deployments by default with health check gates. This provides:

- Zero downtime when health checks pass
- Automatic rollback on health check failure
- No additional infrastructure cost

**Supplement with:** Feature flags for gradual feature rollout within the deployment.

---

## Database Migrations: Expand/Contract Pattern

The expand/contract pattern enables zero-downtime schema changes by ensuring backward compatibility throughout the migration process.

### The Three Phases

```
Phase 1: EXPAND          Phase 2: MIGRATE         Phase 3: CONTRACT
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Add new column   │    │ Copy data to     │    │ Remove old       │
│ (nullable/default)│ → │ new column       │ → │ column           │
│ Keep old column  │    │ Update app code  │    │ Deploy cleanup   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Practical Example: Renaming a Column

**Scenario:** Rename `published` (boolean) to `status` (enum)

#### Step 1: Expand - Add New Column

```prisma
// schema.prisma - EXPAND phase
model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String?
  published Boolean? @default(false)  // Keep old, make nullable
  status    Status   @default(Unknown) // Add new with default
}

enum Status {
  Unknown
  Draft
  InProgress
  InReview
  Published
}
```

```bash
npx prisma migrate dev --name add-status-column
```

#### Step 2: Migrate - Data Migration Script

```typescript
// prisma/migrations/YYYYMMDD_add_status/data-migration.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    // Batch process for large datasets
    const batchSize = 1000;
    let processed = 0;

    while (true) {
      const posts = await tx.post.findMany({
        where: { status: "Unknown" },
        take: batchSize,
      });

      if (posts.length === 0) break;

      for (const post of posts) {
        await tx.post.update({
          where: { id: post.id },
          data: {
            status: post.published ? "Published" : "Draft",
          },
        });
      }

      processed += posts.length;
      console.log(`Migrated ${processed} records`);
    }
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

#### Step 3: Update Application Code

```typescript
// Dual-write pattern during transition
async function updatePost(id: number, data: UpdatePostInput) {
  return prisma.post.update({
    where: { id },
    data: {
      ...data,
      // Write to both columns during transition
      published: data.status === "Published",
      status: data.status,
    },
  });
}

// Read from new column
async function getPublishedPosts() {
  return prisma.post.findMany({
    where: { status: "Published" }, // Use new column
  });
}
```

#### Step 4: Contract - Remove Old Column

```prisma
// schema.prisma - CONTRACT phase (separate deployment)
model Post {
  id      Int      @id @default(autoincrement())
  title   String
  content String?
  status  Status   @default(Draft)
}

enum Status {
  Draft
  InProgress
  InReview
  Published
}
```

```bash
npx prisma migrate dev --name drop-published-column
```

### Migration Safety Rules

| Rule                                         | Description                     |
| -------------------------------------------- | ------------------------------- |
| **Never drop columns immediately**           | Always use expand/contract      |
| **Add columns as nullable or with defaults** | Prevents write failures         |
| **Avoid renaming in single migration**       | Split into add → migrate → drop |
| **Test migrations on production data copy**  | Catch edge cases                |
| **Use transactions for data migrations**     | Ensure atomicity                |
| **Batch large data migrations**              | Prevent timeouts and locks      |

### Prisma-Specific Considerations

```typescript
// prisma/migrations/migration_lock.toml
// Prisma uses this to prevent concurrent migrations

// In CI/CD, always run:
npx prisma migrate deploy  // Production-safe, no prompts

// Never run in production:
npx prisma migrate dev     // Development only, may reset data
npx prisma db push         // Skips migration history
```

---

## Health Checks & Readiness Probes

Health checks are the foundation of zero-downtime deployments on Railway-like platforms.

### Types of Health Checks

| Type          | Purpose                       | When Called            |
| ------------- | ----------------------------- | ---------------------- |
| **Liveness**  | Is the process running?       | Continuously           |
| **Readiness** | Can it handle traffic?        | Before routing traffic |
| **Startup**   | Has it finished initializing? | During boot            |

### Express Health Check Implementation

```typescript
// src/health/health.controller.ts
import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: boolean;
    memory: boolean;
    uptime: number;
  };
}

// Basic liveness - is the process alive?
router.get("/health/live", (req, res) => {
  res.status(200).json({ status: "alive" });
});

// Readiness - can we handle traffic?
router.get("/health", async (req, res) => {
  const startTime = Date.now();

  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - startTime;

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memoryOk = memUsage.heapUsed < memUsage.heapTotal * 0.9;

    const health: HealthStatus = {
      status: memoryOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "unknown",
      checks: {
        database: true,
        memory: memoryOk,
        uptime: process.uptime(),
      },
    };

    // Include latency for monitoring
    res.set("X-Health-Check-Latency", `${dbLatency}ms`);
    res.status(200).json(health);
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Detailed health for internal monitoring
router.get("/health/detailed", async (req, res) => {
  // Add authentication for detailed endpoint
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.HEALTH_CHECK_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const memUsage = process.memoryUsage();

  res.json({
    process: {
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + "MB",
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + "MB",
        rss: Math.round(memUsage.rss / 1024 / 1024) + "MB",
      },
      pid: process.pid,
    },
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version,
  });
});

export default router;
```

### Railway Health Check Configuration

Railway uses the `/health` endpoint to determine deployment readiness:

```javascript
// railway.json (or via Railway dashboard)
{
  "healthcheckPath": "/health",
  "healthcheckTimeout": 300  // 5 minutes max
}
```

**Key Railway behaviors:**

- Health check runs **only at deployment start**
- Must return HTTP 200 within timeout
- Failed health check = deployment marked as failed
- Previous deployment remains active on failure

### Graceful Shutdown

```typescript
// src/server.ts
import express from "express";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();

let isShuttingDown = false;

// Middleware to reject new requests during shutdown
app.use((req, res, next) => {
  if (isShuttingDown) {
    res.set("Connection", "close");
    return res.status(503).json({ error: "Server is shutting down" });
  }
  next();
});

const server = app.listen(process.env.PORT || 3000);

// Graceful shutdown handler
async function shutdown(signal: string) {
  console.log(`Received ${signal}, starting graceful shutdown...`);
  isShuttingDown = true;

  // Stop accepting new connections
  server.close(async () => {
    console.log("HTTP server closed");

    // Close database connections
    await prisma.$disconnect();
    console.log("Database connections closed");

    process.exit(0);
  });

  // Force exit after timeout
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000); // 30 second timeout
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

---

## Feature Flags for Safe Releases

Feature flags decouple deployment from release, enabling:

- Gradual rollouts
- Instant rollback without redeployment
- A/B testing
- Kill switches for problematic features

### Feature Flag Options

| Provider         | Pricing            | Best For                        |
| ---------------- | ------------------ | ------------------------------- |
| **LaunchDarkly** | $$$$               | Enterprise, complex targeting   |
| **Flagsmith**    | $$ (OSS available) | Self-hosted, cost-conscious     |
| **Unleash**      | $ (OSS)            | Self-hosted, simple needs       |
| **PostHog**      | $$                 | Already using PostHog analytics |
| **Custom**       | Free               | Simple boolean flags            |

### Simple Custom Implementation

```typescript
// src/features/feature-flags.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface FeatureFlag {
  name: string;
  enabled: boolean;
  percentage?: number; // For gradual rollout
  tenantIds?: string[]; // For tenant-specific flags
}

// Cache flags in memory with TTL
const flagCache = new Map<string, { flag: FeatureFlag; expires: number }>();
const CACHE_TTL = 60000; // 1 minute

export async function isFeatureEnabled(
  flagName: string,
  context?: { tenantId?: string; userId?: string },
): Promise<boolean> {
  // Check cache first
  const cached = flagCache.get(flagName);
  if (cached && cached.expires > Date.now()) {
    return evaluateFlag(cached.flag, context);
  }

  // Fetch from database
  const flag = await prisma.featureFlag.findUnique({
    where: { name: flagName },
  });

  if (!flag) return false;

  // Update cache
  flagCache.set(flagName, {
    flag: flag as FeatureFlag,
    expires: Date.now() + CACHE_TTL,
  });

  return evaluateFlag(flag as FeatureFlag, context);
}

function evaluateFlag(
  flag: FeatureFlag,
  context?: { tenantId?: string; userId?: string },
): boolean {
  if (!flag.enabled) return false;

  // Tenant-specific override
  if (flag.tenantIds?.length && context?.tenantId) {
    return flag.tenantIds.includes(context.tenantId);
  }

  // Percentage rollout
  if (flag.percentage !== undefined && context?.userId) {
    const hash = simpleHash(context.userId + flag.name);
    return hash % 100 < flag.percentage;
  }

  return flag.enabled;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
```

### Usage in Application Code

```typescript
// src/routes/posts.ts
import { isFeatureEnabled } from "../features/feature-flags";

router.get("/posts", async (req, res) => {
  const tenantId = req.tenant.id;

  // Check if new algorithm is enabled for this tenant
  const useNewAlgorithm = await isFeatureEnabled("new-post-ranking", {
    tenantId,
    userId: req.user?.id,
  });

  const posts = useNewAlgorithm
    ? await getPostsWithNewRanking(tenantId)
    : await getPostsWithLegacyRanking(tenantId);

  res.json(posts);
});
```

### Kill Switch Pattern

```typescript
// Wrap risky features in kill switches
export async function processPayment(payment: Payment) {
  const killSwitchActive = await isFeatureEnabled("kill-switch-payments");

  if (killSwitchActive) {
    throw new Error("Payment processing temporarily disabled");
  }

  return await paymentProcessor.process(payment);
}
```

---

## Rollback Strategies

### Application Rollback

**Railway/Render:** Redeploy previous successful deployment from dashboard or CLI.

```bash
# Railway CLI
railway up --detach  # Deploy
railway rollback     # Rollback to previous

# Or via GitHub: revert commit and push
git revert HEAD
git push origin main
```

### Database Rollback Considerations

**Critical:** Database migrations are generally **not reversible** automatically.

| Scenario           | Rollback Strategy                        |
| ------------------ | ---------------------------------------- |
| **Added column**   | Leave it (no harm)                       |
| **Dropped column** | Restore from backup                      |
| **Data migration** | Run reverse migration script             |
| **Schema change**  | Use expand/contract (no rollback needed) |

### Rollback Checklist

```markdown
## Pre-Deployment Rollback Preparation

- [ ] Database backup taken before deployment
- [ ] Previous deployment artifact available
- [ ] Rollback procedure documented
- [ ] Team notified of deployment window

## Rollback Decision Criteria

Trigger rollback if ANY:

- [ ] Error rate > 1% (baseline + 5x)
- [ ] P95 latency > 2x baseline
- [ ] Health check failures
- [ ] Critical functionality broken

## Rollback Execution

1. [ ] Announce rollback in #incidents
2. [ ] Trigger rollback via Railway/CI
3. [ ] Verify health checks pass
4. [ ] Monitor error rates
5. [ ] Post-mortem scheduled
```

---

## CI/CD Pipeline (GitHub Actions)

### Complete Pipeline for Node/Express + Prisma

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  workflow_dispatch:

env:
  NODE_VERSION: "20"

jobs:
  # ============================================
  # Stage 1: Validate (Parallel)
  # ============================================
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate

      - name: Type check
        run: npm run typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Setup test database
        run: |
          npx prisma migrate deploy
          npx prisma generate
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test

      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
          NODE_ENV: test

  # ============================================
  # Stage 2: Build
  # ============================================
  build:
    name: Build
    needs: [lint, typecheck, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate

      - name: Build application
        run: npm run build

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
          retention-days: 7

  # ============================================
  # Stage 3: Database Migration
  # ============================================
  migrate:
    name: Run Migrations
    needs: [build]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run Prisma migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      - name: Verify migration status
        run: npx prisma migrate status
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  # ============================================
  # Stage 4: Deploy
  # ============================================
  deploy:
    name: Deploy to Railway
    needs: [migrate]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway
        run: railway up --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

      - name: Wait for deployment
        run: |
          echo "Waiting for deployment to complete..."
          sleep 60  # Adjust based on typical deployment time

      - name: Verify deployment health
        run: |
          for i in {1..10}; do
            response=$(curl -s -o /dev/null -w "%{http_code}" ${{ vars.PRODUCTION_URL }}/health)
            if [ "$response" = "200" ]; then
              echo "Health check passed!"
              exit 0
            fi
            echo "Attempt $i: Health check returned $response, retrying..."
            sleep 10
          done
          echo "Health check failed after 10 attempts"
          exit 1

  # ============================================
  # Stage 5: Post-Deploy Verification
  # ============================================
  smoke-test:
    name: Smoke Tests
    needs: [deploy]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run smoke tests
        run: npm run test:smoke
        env:
          API_URL: ${{ vars.PRODUCTION_URL }}

  notify:
    name: Notify
    needs: [smoke-test]
    runs-on: ubuntu-latest
    if: always()
    steps:
      - name: Notify Slack on success
        if: ${{ needs.smoke-test.result == 'success' }}
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Deployment successful! :rocket:",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment to production completed successfully*\n\nCommit: `${{ github.sha }}`\nBy: ${{ github.actor }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Notify Slack on failure
        if: ${{ needs.smoke-test.result == 'failure' }}
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Deployment failed! :x:",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Deployment to production FAILED*\n\nCommit: `${{ github.sha }}`\nBy: ${{ github.actor }}\n\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|View logs>"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Required GitHub Secrets

| Secret              | Description                           |
| ------------------- | ------------------------------------- |
| `DATABASE_URL`      | Production database connection string |
| `RAILWAY_TOKEN`     | Railway API token for deployments     |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications       |

### Required GitHub Variables

| Variable         | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `PRODUCTION_URL` | Production API URL (e.g., `https://api.nubabel.com`) |

---

## Actionable Checklist

### Pre-Deployment Checklist

```markdown
## Code Quality

- [ ] All tests passing locally
- [ ] Linting passes with no errors
- [ ] TypeScript compilation succeeds
- [ ] Code reviewed and approved

## Database

- [ ] Migration uses expand/contract pattern
- [ ] Migration tested on staging database
- [ ] Data migration script tested (if applicable)
- [ ] Rollback procedure documented
- [ ] Database backup scheduled/completed

## Health Checks

- [ ] `/health` endpoint returns 200 when healthy
- [ ] `/health` checks database connectivity
- [ ] Graceful shutdown implemented (SIGTERM handling)
- [ ] Health check timeout configured (Railway: 300s default)

## Feature Flags

- [ ] New features behind feature flags
- [ ] Kill switches in place for critical paths
- [ ] Flag defaults are safe (disabled)

## Monitoring

- [ ] Error tracking configured (Sentry/etc.)
- [ ] Key metrics dashboards ready
- [ ] Alerting thresholds set
- [ ] On-call engineer identified
```

### Deployment Day Checklist

```markdown
## Before Deployment

- [ ] Announce deployment in team channel
- [ ] Verify staging deployment successful
- [ ] Check current production error rates (baseline)
- [ ] Ensure rollback procedure is ready

## During Deployment

- [ ] Monitor CI/CD pipeline progress
- [ ] Watch health check status
- [ ] Monitor error rates in real-time
- [ ] Check key user flows manually

## After Deployment

- [ ] Verify health check passing
- [ ] Compare error rates to baseline
- [ ] Run smoke tests
- [ ] Enable feature flags gradually (if applicable)
- [ ] Announce deployment complete
```

### Rollback Decision Matrix

| Metric       | Threshold     | Action                         |
| ------------ | ------------- | ------------------------------ |
| Error rate   | > 5x baseline | Immediate rollback             |
| P95 latency  | > 3x baseline | Investigate, consider rollback |
| Health check | Failing       | Automatic rollback (Railway)   |
| Critical bug | Any           | Immediate rollback             |
| Minor bug    | Non-blocking  | Hotfix forward                 |

---

## Sources & Citations

### Primary Sources

1. **Railway Documentation - Health Checks**  
   https://docs.railway.com/guides/healthchecks  
   _Official Railway documentation on configuring health checks for zero-downtime deployments_

2. **Prisma Documentation - Expand and Contract Pattern**  
   https://www.prisma.io/docs/guides/data-migration  
   _Official Prisma guide on safe database migrations using expand/contract_

3. **Prisma Data Guide - Expand and Contract Pattern**  
   https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern  
   _Detailed explanation of the pattern with examples_

4. **HashiCorp Well-Architected Framework - Zero-Downtime Deployments**  
   https://developer.hashicorp.com/well-architected-framework/define-and-automate-processes/deploy/zero-downtime-deployments  
   _Comprehensive guide on blue/green, canary, and rolling strategies_

5. **LaunchDarkly - Deployment Strategies**  
   https://launchdarkly.com/blog/deployment-strategies  
   _Comparison of 6 deployment strategies with feature flag integration_

6. **Flagsmith - Feature Flags Best Practices**  
   https://flagsmith.com/blog/feature-flags-best-practices  
   _Complete guide to feature flag implementation and management_

### GitHub Actions Examples

7. **Epic Stack - Deploy Workflow**  
   https://github.com/epicweb-dev/epic-stack/blob/main/.github/workflows/deploy.yml  
   _Production-ready CI/CD pipeline with Prisma migrations_

8. **CodeImage - Production Deploy**  
   https://github.com/riccardoperra/codeimage/blob/main/.github/workflows/prod-deploy.yml  
   _Real-world example of Railway deployment with Prisma_

### Additional References

9. **Xata - Zero-Downtime Schema Migrations in PostgreSQL**  
   https://xata.io/blog/zero-downtime-schema-migrations-postgresql  
   _Workshop-style guide on PostgreSQL migration strategies_

10. **DeployHQ - Database Migration Strategies**  
    https://www.deployhq.com/blog/database-migration-strategies-for-zero-downtime-deployments-a-step-by-step-guide  
    _Step-by-step guide for zero-downtime database migrations_

11. **Medium - Zero-Downtime Deployments in Node.js**  
    https://medium.com/@somendradev23/zero-downtime-deployments-in-node-js-a-practical-guide-a1192a28eb3d  
    _Practical Node.js-specific deployment guide_

12. **Tim Wellhausen - Expand and Contract Pattern**  
    https://www.tim-wellhausen.de/papers/ExpandAndContract/ExpandAndContract.html  
    _Original pattern documentation with formal description_

---

## Appendix: Quick Reference

### Railway CLI Commands

```bash
# Deploy
railway up --detach

# Rollback
railway rollback

# View logs
railway logs

# Check status
railway status
```

### Prisma Migration Commands

```bash
# Development (creates migration)
npx prisma migrate dev --name <name>

# Production (applies migrations)
npx prisma migrate deploy

# Check status
npx prisma migrate status

# Generate client
npx prisma generate
```

### Health Check Response Format

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.2.3",
  "checks": {
    "database": true,
    "memory": true,
    "uptime": 3600
  }
}
```

---

_Last updated: January 2025_  
_Maintainer: Nubabel Engineering Team_
