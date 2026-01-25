# Zero-Downtime Deployment & CI/CD Guide for Nubabel

**Last Updated:** January 26, 2026  
**Target Platform:** Railway  
**Stack:** Node.js, Prisma, PostgreSQL

---

## Table of Contents

1. [Deployment Strategy Recommendation](#deployment-strategy-recommendation)
2. [CI/CD Pipeline Configuration](#cicd-pipeline-configuration)
3. [Database Migration Safety](#database-migration-safety)
4. [Rollback Procedures](#rollback-procedures)
5. [Feature Flags Implementation](#feature-flags-implementation)
6. [Health Checks & Monitoring](#health-checks--monitoring)

---

## 1. Deployment Strategy Recommendation

### Recommended: Rolling Deployment with Health Checks

**Why Rolling Deployment for Railway:**
- Railway natively supports rolling deployments with zero-downtime
- No infrastructure overhead (blue-green requires 2x resources)
- Simpler than canary deployments for small-to-medium applications
- Built-in health check support

### How Railway Rolling Deployments Work

```
┌─────────────────────────────────────────────────────────┐
│ Railway Rolling Deployment Flow                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. New deployment builds                               │
│  2. Container starts                                     │
│  3. Health check endpoint tested (up to 300s timeout)   │
│  4. Health check returns 200 OK                         │
│  5. Traffic switches to new deployment                  │
│  6. Old deployment receives SIGTERM (3s grace period)   │
│  7. Old deployment removed                              │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Key Configuration:**

```bash
# Railway Service Variables
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=300        # Default: 300s (5 min)
RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=10      # Overlap between old/new
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=3      # Graceful shutdown time
```

### Alternative Strategies (When to Use)

| Strategy | Use Case | Pros | Cons |
|----------|----------|------|------|
| **Rolling** | Standard deployments | Zero-downtime, simple, cost-effective | Brief overlap period |
| **Blue-Green** | Critical releases, large schema changes | Instant rollback, full testing | 2x infrastructure cost |
| **Canary** | High-risk features, A/B testing | Gradual rollout, risk mitigation | Complex setup, requires monitoring |

**For Nubabel:** Stick with **Rolling Deployment** + **Feature Flags** for gradual rollouts.

---

## 2. CI/CD Pipeline Configuration

### GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '20.x'

jobs:
  # ============================================
  # JOB 1: Lint & Type Check
  # ============================================
  lint:
    name: Lint & Type Check
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run ESLint
        run: npm run lint

      - name: Run TypeScript check
        run: npm run type-check

  # ============================================
  # JOB 2: Unit & Integration Tests
  # ============================================
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: nubabel_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate Prisma Client
        run: npx prisma generate

      - name: Run database migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/nubabel_test

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/nubabel_test

      - name: Upload coverage reports
        uses: codecov/codecov-action@v4
        if: always()

  # ============================================
  # JOB 3: Build & Validate
  # ============================================
  build:
    name: Build Application
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Check build artifacts
        run: |
          if [ ! -d "dist" ]; then
            echo "Build failed: dist directory not found"
            exit 1
          fi

  # ============================================
  # JOB 4: Deploy to Railway (Staging)
  # ============================================
  deploy-staging:
    name: Deploy to Staging
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/staging'
    environment:
      name: staging
      url: https://nubabel-staging.up.railway.app
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway Staging
        run: railway up --service nubabel-api --environment staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN_STAGING }}

      - name: Wait for deployment health check
        run: |
          echo "Waiting for deployment to be healthy..."
          sleep 30
          railway status --service nubabel-api --environment staging
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN_STAGING }}

      - name: Run smoke tests
        run: npm run test:smoke
        env:
          API_URL: https://nubabel-staging.up.railway.app

  # ============================================
  # JOB 5: Deploy to Railway (Production)
  # ============================================
  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [build]
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://nubabel.up.railway.app
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Install Railway CLI
        run: npm install -g @railway/cli

      - name: Deploy to Railway Production
        run: railway up --service nubabel-api --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN_PRODUCTION }}

      - name: Wait for deployment health check
        run: |
          echo "Waiting for deployment to be healthy..."
          sleep 30
          railway status --service nubabel-api --environment production
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN_PRODUCTION }}

      - name: Run smoke tests
        run: npm run test:smoke
        env:
          API_URL: https://nubabel.up.railway.app

      - name: Notify deployment success
        if: success()
        run: |
          echo "✅ Production deployment successful!"
          # Add Slack/Discord notification here

      - name: Notify deployment failure
        if: failure()
        run: |
          echo "❌ Production deployment failed!"
          # Add Slack/Discord notification here

  # ============================================
  # JOB 6: E2E Tests (Post-Deployment)
  # ============================================
  e2e-tests:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: [deploy-staging]
    if: github.ref == 'refs/heads/staging'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Install dependencies
        run: npm ci

      - name: Run Playwright E2E tests
        run: npm run test:e2e
        env:
          BASE_URL: https://nubabel-staging.up.railway.app

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### Package.json Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit",
    "test:unit": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:smoke": "node scripts/smoke-test.js",
    "build": "tsc && vite build",
    "db:migrate": "prisma migrate deploy",
    "db:generate": "prisma generate"
  }
}
```

### Smoke Test Script

Create `scripts/smoke-test.js`:

```javascript
#!/usr/bin/env node

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function runSmokeTests() {
  console.log(`🔍 Running smoke tests against ${API_URL}`);

  const tests = [
    {
      name: 'Health Check',
      url: `${API_URL}/health`,
      expectedStatus: 200,
    },
    {
      name: 'API Root',
      url: `${API_URL}/api`,
      expectedStatus: 200,
    },
    {
      name: 'Database Connection',
      url: `${API_URL}/health/db`,
      expectedStatus: 200,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const response = await fetch(test.url);
      if (response.status === test.expectedStatus) {
        console.log(`✅ ${test.name}: PASSED`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED (status ${response.status})`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: FAILED (${error.message})`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests();
```

---

## 3. Database Migration Safety

### The Expand-Contract Pattern

**The expand-contract pattern is the gold standard for zero-downtime database migrations.**

```
┌─────────────────────────────────────────────────────────┐
│ Expand-Contract Pattern (3 Phases)                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Phase 1: EXPAND                                        │
│  ├─ Add new column/table (nullable or with default)    │
│  ├─ Deploy code that writes to BOTH old and new        │
│  └─ Old code still works (ignores new column)          │
│                                                          │
│  Phase 2: MIGRATE                                       │
│  ├─ Backfill data from old to new column               │
│  ├─ Verify data integrity                              │
│  └─ Deploy code that reads from new column             │
│                                                          │
│  Phase 3: CONTRACT                                      │
│  ├─ Remove old column/table                            │
│  └─ Clean up migration code                            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Example: Renaming a Column (Safe Way)

**Scenario:** Rename `User.name` → `User.fullName`

#### Phase 1: Expand (Deploy 1)

```prisma
// prisma/schema.prisma
model User {
  id       Int     @id @default(autoincrement())
  name     String  // OLD - keep for now
  fullName String? // NEW - nullable
  email    String  @unique
}
```

```bash
# Create migration
npx prisma migrate dev --name add_fullname_column --create-only

# Edit migration to add trigger (optional, for automatic sync)
# prisma/migrations/XXX_add_fullname_column/migration.sql
```

```sql
-- Add new column
ALTER TABLE "User" ADD COLUMN "fullName" TEXT;

-- Create trigger to sync old → new (PostgreSQL)
CREATE OR REPLACE FUNCTION sync_fullname()
RETURNS TRIGGER AS $$
BEGIN
  NEW."fullName" = NEW.name;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_fullname_trigger
BEFORE INSERT OR UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION sync_fullname();
```

**Application Code (writes to both):**

```typescript
// services/user.service.ts
async createUser(data: { name: string; email: string }) {
  return prisma.user.create({
    data: {
      name: data.name,
      fullName: data.name, // Write to both columns
      email: data.email,
    },
  });
}

async updateUser(id: number, data: { name: string }) {
  return prisma.user.update({
    where: { id },
    data: {
      name: data.name,
      fullName: data.name, // Write to both columns
    },
  });
}
```

**Deploy Phase 1:**

```bash
npx prisma migrate deploy
npm run build
railway up
```

#### Phase 2: Migrate Data (Deploy 2)

**Backfill existing data:**

```typescript
// scripts/backfill-fullname.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillFullName() {
  const users = await prisma.user.findMany({
    where: { fullName: null },
  });

  console.log(`Backfilling ${users.length} users...`);

  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { fullName: user.name },
    });
  }

  console.log('✅ Backfill complete');
}

backfillFullName()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

**Run backfill:**

```bash
# In Railway dashboard or via CLI
railway run node scripts/backfill-fullname.ts
```

**Update code to read from new column:**

```typescript
// services/user.service.ts
async getUser(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  return {
    id: user.id,
    name: user.fullName || user.name, // Fallback during migration
    email: user.email,
  };
}
```

**Deploy Phase 2:**

```bash
npm run build
railway up
```

#### Phase 3: Contract (Deploy 3)

**Remove old column:**

```prisma
// prisma/schema.prisma
model User {
  id       Int    @id @default(autoincrement())
  fullName String // Only new column remains
  email    String @unique
}
```

```bash
npx prisma migrate dev --name remove_name_column --create-only
```

**Edit migration to drop trigger:**

```sql
-- Drop trigger
DROP TRIGGER IF EXISTS sync_fullname_trigger ON "User";
DROP FUNCTION IF EXISTS sync_fullname();

-- Drop old column
ALTER TABLE "User" DROP COLUMN "name";
```

**Update code (remove fallback):**

```typescript
// services/user.service.ts
async getUser(id: number) {
  const user = await prisma.user.findUnique({ where: { id } });
  return {
    id: user.id,
    name: user.fullName, // Only use new column
    email: user.email,
  };
}
```

**Deploy Phase 3:**

```bash
npx prisma migrate deploy
npm run build
railway up
```

### Database Migration Checklist

**Before Every Migration:**

- [ ] **Test locally** with production-like data
- [ ] **Review migration SQL** (`--create-only` flag)
- [ ] **Check for locking operations** (avoid `ALTER TABLE` on large tables)
- [ ] **Add indexes concurrently** (PostgreSQL: `CREATE INDEX CONCURRENTLY`)
- [ ] **Use nullable columns** or defaults for new fields
- [ ] **Never drop columns immediately** (use expand-contract)
- [ ] **Backup database** before production migration
- [ ] **Monitor query performance** after migration

**Safe Operations (No Downtime):**

✅ Add nullable column  
✅ Add column with default value  
✅ Add new table  
✅ Add index concurrently  
✅ Create new enum value (PostgreSQL)

**Unsafe Operations (Require Expand-Contract):**

❌ Rename column  
❌ Drop column  
❌ Change column type  
❌ Add NOT NULL constraint  
❌ Drop table

### Prisma Migration Commands

```bash
# Development (local)
npx prisma migrate dev --name <migration_name>

# Production (Railway)
npx prisma migrate deploy

# Create migration without applying
npx prisma migrate dev --create-only --name <migration_name>

# Reset database (DANGER: dev only)
npx prisma migrate reset

# Check migration status
npx prisma migrate status
```

### Railway Migration Setup

**Add to `package.json`:**

```json
{
  "scripts": {
    "railway:migrate": "prisma migrate deploy && prisma generate"
  }
}
```

**Railway Build Command:**

```bash
npm install && npm run railway:migrate && npm run build
```

**Railway Start Command:**

```bash
node dist/index.js
```

---

## 4. Rollback Procedures

### Quick Rollback Runbook

#### Scenario 1: Deployment Failed (Health Check)

**Railway automatically rolls back if health check fails.**

```bash
# Check deployment status
railway status --service nubabel-api --environment production

# If stuck, manually rollback to previous deployment
railway rollback --service nubabel-api --environment production
```

**Via Railway Dashboard:**

1. Go to **Deployments** tab
2. Find the last successful deployment
3. Click **⋮** → **Rollback**

#### Scenario 2: Deployment Succeeded but Bugs Found

**Option A: Rollback via Railway CLI**

```bash
# List recent deployments
railway deployments --service nubabel-api --environment production

# Rollback to specific deployment
railway rollback <deployment-id> --service nubabel-api --environment production
```

**Option B: Revert Git Commit**

```bash
# Revert the problematic commit
git revert <commit-hash>
git push origin main

# Railway auto-deploys the revert
```

#### Scenario 3: Database Migration Failed

**If migration fails during `prisma migrate deploy`:**

```bash
# 1. Check migration status
npx prisma migrate status

# 2. Mark failed migration as rolled back
npx prisma migrate resolve --rolled-back <migration_name>

# 3. Fix the migration SQL
# Edit prisma/migrations/<migration_name>/migration.sql

# 4. Re-apply migration
npx prisma migrate deploy
```

**If migration succeeded but caused issues:**

```bash
# 1. Create a rollback migration
npx prisma migrate dev --create-only --name rollback_<original_migration>

# 2. Write reverse SQL manually
# Example: If you added a column, drop it
# ALTER TABLE "User" DROP COLUMN "newColumn";

# 3. Apply rollback migration
npx prisma migrate deploy
```

#### Scenario 4: Data Corruption from Migration

**Emergency Restore from Backup:**

```bash
# 1. Stop the service (Railway dashboard)
railway service stop --service nubabel-api --environment production

# 2. Restore database from backup (Railway Postgres)
# Via Railway dashboard: Database → Backups → Restore

# 3. Rollback application deployment
railway rollback <last-good-deployment-id>

# 4. Restart service
railway service start --service nubabel-api --environment production
```

### Rollback Decision Matrix

| Issue | Rollback Method | Time to Recover |
|-------|----------------|-----------------|
| Health check fails | Automatic (Railway) | 0 min (instant) |
| API errors (no DB changes) | Railway rollback | 2-5 min |
| API errors (with DB changes) | Revert code + rollback migration | 10-15 min |
| Data corruption | Restore DB backup + rollback code | 30-60 min |

### Preventing Rollback Scenarios

**Pre-Deployment Checklist:**

- [ ] All tests pass (unit, integration, E2E)
- [ ] Staging deployment successful
- [ ] Database migration tested on staging
- [ ] Health check endpoint returns 200
- [ ] Smoke tests pass on staging
- [ ] Feature flags configured (if applicable)
- [ ] Rollback plan documented

**Post-Deployment Monitoring (First 15 Minutes):**

- [ ] Health check endpoint responding
- [ ] Error rate < 1% (check logs)
- [ ] Response time < 500ms (p95)
- [ ] Database connection pool healthy
- [ ] No spike in 5xx errors

---

## 5. Feature Flags Implementation

### Why Feature Flags?

**Feature flags decouple deployment from release:**

- Deploy code to production (dark launch)
- Enable features gradually (10% → 50% → 100%)
- Instant rollback without redeployment
- A/B testing and experimentation

### Recommended: PostHog (Open Source)

**Why PostHog over LaunchDarkly:**

| Feature | PostHog | LaunchDarkly | Statsig |
|---------|---------|--------------|---------|
| **Pricing** | Free tier (1M events/mo) | $10/seat/mo | Free tier (1M events/mo) |
| **Open Source** | ✅ Yes (self-hostable) | ❌ No | ❌ No |
| **Analytics** | ✅ Built-in | ❌ Separate tool | ✅ Built-in |
| **Experimentation** | ✅ A/B testing | ✅ A/B testing | ✅ A/B testing |
| **Local Evaluation** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Best For** | Startups, full-stack | Enterprise | Data-driven teams |

**For Nubabel:** Use **PostHog** (free, open-source, includes analytics).

### PostHog Setup

#### 1. Install PostHog

```bash
npm install posthog-node posthog-js
```

#### 2. Backend Setup (Node.js)

```typescript
// lib/posthog.ts
import { PostHog } from 'posthog-node';

export const posthog = new PostHog(
  process.env.POSTHOG_API_KEY!,
  {
    host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
    flushAt: 20, // Batch size
    flushInterval: 10000, // 10 seconds
  }
);

// Graceful shutdown
process.on('SIGTERM', async () => {
  await posthog.shutdown();
});
```

#### 3. Feature Flag Usage

```typescript
// services/feature-flags.service.ts
import { posthog } from '@/lib/posthog';

export async function isFeatureEnabled(
  flagKey: string,
  userId: string,
  userProperties?: Record<string, any>
): Promise<boolean> {
  try {
    const isEnabled = await posthog.isFeatureEnabled(
      flagKey,
      userId,
      {
        personProperties: userProperties,
      }
    );
    return isEnabled ?? false; // Default to false if undefined
  } catch (error) {
    console.error(`Feature flag error: ${flagKey}`, error);
    return false; // Fail closed (feature disabled on error)
  }
}

// Example: Check if new UI is enabled for user
export async function canUseNewUI(userId: string): Promise<boolean> {
  return isFeatureEnabled('new-ui-redesign', userId);
}
```

#### 4. Frontend Setup (React/Next.js)

```typescript
// lib/posthog-client.ts
import posthog from 'posthog-js';

if (typeof window !== 'undefined') {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') {
        posthog.debug();
      }
    },
  });
}

export default posthog;
```

```typescript
// hooks/useFeatureFlag.ts
import { useEffect, useState } from 'react';
import posthog from '@/lib/posthog-client';

export function useFeatureFlag(flagKey: string): boolean {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    // Initial check
    setIsEnabled(posthog.isFeatureEnabled(flagKey) ?? false);

    // Listen for flag changes
    const unsubscribe = posthog.onFeatureFlags(() => {
      setIsEnabled(posthog.isFeatureEnabled(flagKey) ?? false);
    });

    return unsubscribe;
  }, [flagKey]);

  return isEnabled;
}
```

```tsx
// components/NewFeature.tsx
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

export function NewFeature() {
  const isNewUIEnabled = useFeatureFlag('new-ui-redesign');

  if (!isNewUIEnabled) {
    return <OldUI />;
  }

  return <NewUI />;
}
```

### Gradual Rollout Pattern

**Example: Roll out new feature to 10% → 50% → 100%**

#### Step 1: Create Feature Flag in PostHog

1. Go to **Feature Flags** → **New Feature Flag**
2. Key: `new-payment-flow`
3. Rollout: **10%** of users
4. Save

#### Step 2: Deploy Code (Dark Launch)

```typescript
// routes/payment.ts
import { isFeatureEnabled } from '@/services/feature-flags.service';

app.post('/api/payment', async (req, res) => {
  const userId = req.user.id;

  const useNewFlow = await isFeatureEnabled('new-payment-flow', userId);

  if (useNewFlow) {
    return handleNewPaymentFlow(req, res);
  } else {
    return handleOldPaymentFlow(req, res);
  }
});
```

#### Step 3: Monitor & Increase Rollout

**After 24 hours (10% rollout):**

- Check error rates (should be < 1%)
- Check conversion rates (should be ≥ old flow)
- If stable → increase to **50%**

**After 48 hours (50% rollout):**

- Verify no performance degradation
- Check user feedback
- If stable → increase to **100%**

**After 1 week (100% rollout):**

- Remove old code path
- Delete feature flag

#### Step 4: Cleanup (Remove Flag)

```typescript
// routes/payment.ts (after 100% rollout)
app.post('/api/payment', async (req, res) => {
  // Old code removed, only new flow remains
  return handleNewPaymentFlow(req, res);
});
```

### Feature Flag Best Practices

**DO:**

✅ Use feature flags for risky changes  
✅ Default to `false` (fail closed)  
✅ Clean up flags after full rollout  
✅ Use descriptive flag names (`new-payment-flow`, not `flag1`)  
✅ Document flag purpose and rollout plan

**DON'T:**

❌ Use flags for permanent configuration (use env vars)  
❌ Nest flags more than 2 levels deep  
❌ Leave flags in code for > 3 months  
❌ Use flags for sensitive data (use secrets)

---

## 6. Health Checks & Monitoring

### Health Check Endpoint

**Create `/health` endpoint:**

```typescript
// routes/health.ts
import { Router } from 'express';
import { prisma } from '@/lib/prisma';

const router = Router();

// Basic health check (for Railway)
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed health check (for monitoring)
router.get('/health/detailed', async (req, res) => {
  const checks = {
    database: false,
    redis: false,
    memory: false,
  };

  try {
    // Database check
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;

    // Redis check (if applicable)
    // await redis.ping();
    // checks.redis = true;

    // Memory check
    const memUsage = process.memoryUsage();
    checks.memory = memUsage.heapUsed < memUsage.heapTotal * 0.9;

    const allHealthy = Object.values(checks).every(Boolean);

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      checks,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
```

### Railway Health Check Configuration

**In Railway Service Settings:**

1. Go to **Service Settings** → **Health Check**
2. Set **Health Check Path:** `/health`
3. Set **Health Check Timeout:** `300` seconds (5 min)
4. Save

**Environment Variables:**

```bash
# Railway automatically injects PORT
PORT=3000

# Optional: Custom health check timeout
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=300
```

### Graceful Shutdown (SIGTERM Handling)

**Railway sends SIGTERM before stopping containers. Handle it gracefully:**

```typescript
// index.ts
import express from 'express';
import { prisma } from '@/lib/prisma';
import { posthog } from '@/lib/posthog';

const app = express();
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
let isShuttingDown = false;

process.on('SIGTERM', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log('SIGTERM received, starting graceful shutdown...');

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');

    try {
      // Close database connections
      await prisma.$disconnect();
      console.log('Database disconnected');

      // Flush analytics
      await posthog.shutdown();
      console.log('PostHog flushed');

      console.log('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});
```

### Monitoring & Alerting

**Recommended Tools:**

1. **Railway Metrics** (built-in)
   - CPU, memory, network usage
   - Deployment history
   - Logs

2. **PostHog** (analytics + feature flags)
   - User behavior tracking
   - Feature flag analytics
   - Session replay

3. **Sentry** (error tracking)
   - Real-time error alerts
   - Performance monitoring
   - Release tracking

4. **Uptime Kuma** (uptime monitoring)
   - Deploy on Railway (free template)
   - Health check monitoring
   - Slack/Discord alerts

**Setup Sentry:**

```bash
npm install @sentry/node @sentry/profiling-node
```

```typescript
// lib/sentry.ts
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new ProfilingIntegration(),
  ],
  tracesSampleRate: 0.1, // 10% of transactions
  profilesSampleRate: 0.1,
});

export default Sentry;
```

---

## Summary Checklist

### Pre-Deployment

- [ ] All tests pass (unit, integration, E2E)
- [ ] Database migration tested on staging
- [ ] Health check endpoint configured
- [ ] Feature flags set up (if applicable)
- [ ] Rollback plan documented

### During Deployment

- [ ] Monitor Railway deployment logs
- [ ] Wait for health check to pass
- [ ] Run smoke tests
- [ ] Check error rates (< 1%)

### Post-Deployment

- [ ] Monitor for 15 minutes
- [ ] Check response times (< 500ms p95)
- [ ] Verify database migrations applied
- [ ] Test critical user flows
- [ ] Update documentation

### Rollback Triggers

- [ ] Health check fails for > 2 minutes
- [ ] Error rate > 5%
- [ ] Response time > 2 seconds (p95)
- [ ] Database connection failures
- [ ] Critical bug reported

---

## Additional Resources

- [Railway Deployment Docs](https://docs.railway.app/guides/deployments)
- [Prisma Migration Guide](https://www.prisma.io/docs/guides/data-migration)
- [PostHog Feature Flags](https://posthog.com/docs/feature-flags)
- [GitHub Actions CI/CD](https://docs.github.com/en/actions)
- [Expand-Contract Pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern)

---

**Last Updated:** January 26, 2026  
**Maintained By:** Nubabel Engineering Team
