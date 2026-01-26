# RLS Test Suite - Quick Start Guide

## 30-Second Setup

```bash
# 1. Set database URL
export DATABASE_URL="postgresql://user:password@localhost:5432/nubabel"

# 2. Run migrations (if needed)
npx prisma migrate deploy

# 3. Run tests
bash tests/security/run-rls-tests.sh
```

## Expected Output

```
✅ ALL TESTS PASSED

RLS policies are working correctly:
  • Same-org operations succeed (SELECT, INSERT, UPDATE, DELETE)
  • Cross-org operations fail with RLS violations
  • All 15 multi-tenant tables are protected
```

## What Gets Tested

| Operation | Same-Org        | Cross-Org         |
| --------- | --------------- | ----------------- |
| SELECT    | ✅ Returns data | ❌ Returns 0 rows |
| INSERT    | ✅ Succeeds     | ❌ RLS violation  |
| UPDATE    | ✅ Succeeds     | ❌ RLS violation  |
| DELETE    | ✅ Succeeds     | ❌ RLS violation  |

## Tables Covered (15 total)

- workflows
- workflow_executions
- mcp_connections
- sessions
- slack_integrations
- feature_flag_overrides
- audit_logs
- projects
- tasks
- goals
- value_streams
- kpis
- agents
- teams
- orchestrator_executions

## Test Cases

- **50+ test cases** covering all operations
- **2 test organizations** for cross-org testing
- **Automatic cleanup** after tests complete
- **Clear pass/fail assertions** with expected results

## Troubleshooting

### Error: DATABASE_URL not set

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/nubabel"
```

### Error: Test file not found

```bash
cd /path/to/nubabel
bash tests/security/run-rls-tests.sh
```

### Error: RLS not enabled

```bash
# Check RLS status
psql $DATABASE_URL -c "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"

# Enable RLS (if needed)
psql $DATABASE_URL -f prisma/migrations/enable-rls.sql
```

## Files

- **rls-test.sql** - Main test script (533 lines, 50+ test cases)
- **run-rls-tests.sh** - Automated test runner (180 lines)
- **README.md** - Full documentation (366 lines)
- **QUICK_START.md** - This file

## Next Steps

1. ✅ Run tests: `bash tests/security/run-rls-tests.sh`
2. ✅ Add to CI/CD: See README.md for GitHub Actions example
3. ✅ Monitor in production: Log RLS violations for security alerts

## More Info

See **README.md** for:

- Detailed test structure
- Manual testing guide
- CI/CD integration
- Security best practices
- Troubleshooting guide
