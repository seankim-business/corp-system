# RLS (Row-Level Security) Test Suite

Comprehensive test suite for validating Row-Level Security policies on all multi-tenant tables in Nubabel.

## Overview

This test suite ensures that PostgreSQL Row-Level Security (RLS) policies correctly enforce data isolation between organizations. It tests all 15+ multi-tenant tables with complete coverage of SELECT, INSERT, UPDATE, and DELETE operations.

## Files

- **`rls-test.sql`** - Main test script with 50+ test cases
- **`run-rls-tests.sh`** - Automated test runner with result verification
- **`README.md`** - This file

## Test Coverage

### Tables Tested (15 total)

| #   | Table                     | organizationId | Tests                          |
| --- | ------------------------- | -------------- | ------------------------------ |
| 1   | `workflows`               | Direct         | SELECT, INSERT, UPDATE, DELETE |
| 2   | `workflow_executions`     | Via workflow   | SELECT, UPDATE                 |
| 3   | `mcp_connections`         | Direct         | SELECT, INSERT                 |
| 4   | `sessions`                | Direct         | SELECT, UPDATE                 |
| 5   | `slack_integrations`      | Direct         | SELECT, UPDATE                 |
| 6   | `feature_flag_overrides`  | Direct         | SELECT, UPDATE                 |
| 7   | `audit_logs`              | Direct         | SELECT, INSERT                 |
| 8   | `projects`                | Direct         | SELECT, INSERT                 |
| 9   | `tasks`                   | Direct         | SELECT, UPDATE                 |
| 10  | `goals`                   | Direct         | SELECT                         |
| 11  | `value_streams`           | Direct         | SELECT                         |
| 12  | `kpis`                    | Direct         | SELECT                         |
| 13  | `agents`                  | Direct         | SELECT                         |
| 14  | `teams`                   | Direct         | SELECT                         |
| 15  | `orchestrator_executions` | Direct         | SELECT                         |

### Test Cases (50+)

Each table is tested with:

- ✅ **Same-org SELECT** - Should return rows
- ❌ **Cross-org SELECT** - Should return 0 rows (RLS blocks)
- ✅ **Same-org INSERT** - Should succeed
- ❌ **Cross-org INSERT** - Should fail with RLS violation
- ✅ **Same-org UPDATE** - Should succeed
- ❌ **Cross-org UPDATE** - Should fail with RLS violation
- ✅ **Same-org DELETE** - Should succeed
- ❌ **Cross-org DELETE** - Should fail with RLS violation

## Quick Start

### Prerequisites

1. PostgreSQL 15+ with RLS enabled
2. Database with Nubabel schema (run migrations first)
3. `psql` command-line tool installed
4. `bash` shell

### Setup

```bash
# 1. Set database connection
export DATABASE_URL="postgresql://user:password@localhost:5432/nubabel"

# 2. Run migrations (if not already done)
npx prisma migrate deploy

# 3. Enable RLS on all tables (if not already done)
psql $DATABASE_URL -f prisma/migrations/enable-rls.sql
```

### Run Tests

```bash
# Run the test suite
bash tests/security/run-rls-tests.sh

# Expected output:
# ✅ ALL TESTS PASSED
# RLS policies are working correctly:
#   • Same-org operations succeed (SELECT, INSERT, UPDATE, DELETE)
#   • Cross-org operations fail with RLS violations
#   • All 15 multi-tenant tables are protected
```

## Test Structure

### Setup Phase

```sql
-- Create 2 test organizations
INSERT INTO "organizations" (id, slug, name, ...)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'test-org-1', ...),
  ('00000000-0000-0000-0000-000000000002', 'test-org-2', ...);

-- Create test users and memberships
INSERT INTO "users" (id, email, ...) VALUES (...);
INSERT INTO "memberships" (id, organization_id, user_id, ...) VALUES (...);
```

### Test Phase

For each table, tests follow this pattern:

```sql
-- Set organization context
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);

-- TEST: Same-org SELECT (should return 1 row)
-- EXPECT: 1 row
SELECT COUNT(*) FROM "workflows" WHERE id = '...';

-- TEST: Cross-org SELECT (should return 0 rows)
-- EXPECT: 0 rows (RLS blocks cross-org access)
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);
SELECT COUNT(*) FROM "workflows" WHERE id = '...';

-- TEST: Same-org INSERT (should succeed)
-- EXPECT: INSERT succeeds
INSERT INTO "workflows" (...) VALUES (...);

-- TEST: Cross-org INSERT (should fail)
-- EXPECT: ERROR - new row violates row-level security policy
INSERT INTO "workflows" (...) VALUES (...);
```

### Cleanup Phase

All test data is automatically deleted in reverse order of dependencies:

```sql
DELETE FROM "orchestrator_executions" WHERE "organization_id" IN (...);
DELETE FROM "audit_logs" WHERE "organization_id" IN (...);
-- ... (all tables in dependency order)
DELETE FROM "organizations" WHERE id IN (...);
```

## Expected Results

### Success Criteria

✅ **All tests pass when:**

1. Same-org SELECT returns data
2. Cross-org SELECT returns 0 rows
3. Same-org INSERT succeeds
4. Cross-org INSERT fails with RLS violation
5. Same-org UPDATE succeeds
6. Cross-org UPDATE fails with RLS violation
7. Same-org DELETE succeeds
8. Cross-org DELETE fails with RLS violation

### Example Output

```
═══════════════════════════════════════════════════════════════
  RLS (Row-Level Security) Test Suite
═══════════════════════════════════════════════════════════════

📋 Test Configuration:
  Database: postgresql://...
  Test File: tests/security/rls-test.sql
  Output: /tmp/rls-test-output.txt

🚀 Running RLS tests...

📊 Analyzing test results...

✅ Test Execution Results:
  Same-org SELECT tests: 15
  Cross-org SELECT tests: 15
  Same-org INSERT tests: 8
  Same-org UPDATE tests: 8

🔒 RLS Violation Detection:
  RLS violations detected: 8
  Total errors: 8

🔍 Verifying Key Assertions:
  ✅ PASS: Same-org SELECT returns data
  ✅ PASS: Cross-org SELECT blocked by RLS
  ✅ PASS: Same-org INSERT succeeds
  ✅ PASS: Same-org UPDATE succeeds
  ✅ PASS: Same-org DELETE succeeds
  ✅ PASS: RLS violations detected for cross-org operations

═══════════════════════════════════════════════════════════════
  Test Summary
═══════════════════════════════════════════════════════════════

  Assertions Passed: 6
  Assertions Failed: 0

✅ ALL TESTS PASSED

RLS policies are working correctly:
  • Same-org operations succeed (SELECT, INSERT, UPDATE, DELETE)
  • Cross-org operations fail with RLS violations
  • All 15 multi-tenant tables are protected
```

## Troubleshooting

### Error: DATABASE_URL not set

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/nubabel"
```

### Error: Test file not found

Ensure you're running from the project root:

```bash
cd /path/to/nubabel
bash tests/security/run-rls-tests.sh
```

### Error: RLS policies not enabled

Check if RLS is enabled on tables:

```bash
psql $DATABASE_URL -c "
  SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
"
```

If RLS is not enabled, run:

```bash
psql $DATABASE_URL -f prisma/migrations/enable-rls.sql
```

### Error: Cross-org operations not failing

This indicates RLS policies are not properly configured. Check:

1. RLS is enabled on the table
2. Policies are created correctly
3. `app.current_organization_id` is being set properly

```bash
psql $DATABASE_URL -c "
  SELECT schemaname, tablename, policyname, qual
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
"
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: RLS Security Tests

on: [push, pull_request]

jobs:
  rls-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: nubabel
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm install

      - name: Run migrations
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/nubabel
        run: npx prisma migrate deploy

      - name: Run RLS tests
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/nubabel
        run: bash tests/security/run-rls-tests.sh
```

## Manual Testing

For manual testing and debugging:

```bash
# Connect to database
psql $DATABASE_URL

-- Set organization context
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000001'::text, true);

-- Test query
SELECT * FROM "workflows";

-- Switch organization
SELECT set_config('app.current_organization_id', '00000000-0000-0000-0000-000000000002'::text, true);

-- Should return 0 rows
SELECT * FROM "workflows" WHERE "organization_id" = '00000000-0000-0000-0000-000000000001'::uuid;
```

## Security Considerations

### What RLS Protects

✅ **Database-level enforcement** - Policies are enforced at the PostgreSQL level, not application code
✅ **Prevents SQL injection** - Even if attacker bypasses application, RLS still protects
✅ **Transparent to application** - No code changes needed, just set session variables
✅ **Audit trail** - All access is logged by PostgreSQL

### What RLS Does NOT Protect

❌ **Application bugs** - If application doesn't set `app.current_organization_id`, RLS won't help
❌ **Superuser access** - PostgreSQL superusers can bypass RLS
❌ **Backup/restore** - Ensure backups are encrypted and access-controlled
❌ **Logical replication** - Replicas inherit RLS policies

### Best Practices

1. **Always set organization context** in middleware before queries
2. **Test RLS regularly** - Add to CI/CD pipeline
3. **Monitor RLS violations** - Log and alert on policy violations
4. **Encrypt sensitive data** - RLS + encryption = defense in depth
5. **Audit access** - Log all data access for compliance

## References

- [PostgreSQL Row-Level Security Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Nubabel Multi-Tenant Security Checklist](../../research/technical-deep-dive/09-multi-tenant-security-checklist.md)
- [OWASP Multi-Tenancy Security Guide](https://owasp.org/www-community/attacks/Multi-Tenant_Data_Isolation)

## Contributing

To add new test cases:

1. Add test data setup in the SETUP phase
2. Add test cases following the pattern (same-org, cross-org)
3. Add assertions in the test runner script
4. Update this README with new coverage

## License

Proprietary - © 2026 Kyndof Corporation
