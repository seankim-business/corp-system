# Nubabel Test Suite

## Overview

Comprehensive test coverage for the Slack Bot + Orchestrator system.

## Test Structure

```
__tests__/
├── setup.ts                    # Jest configuration
├── orchestrator/
│   └── integration.test.ts     # End-to-end orchestrator tests
└── services/
    └── mcp-registry.test.ts    # MCP connection management tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test -- orchestrator/integration

# Watch mode
npm run test:watch
```

## Prerequisites

### Database

Tests require a PostgreSQL test database. Create one:

```sql
CREATE DATABASE nubabel_test;
```

Update `.env.test` with the test database URL.

### Redis

Tests use Redis database 1 (separate from production database 0).

```bash
# Default Redis runs on localhost:6379
# Tests automatically use database 1
```

## Test Coverage Goals

- **Orchestrator**: >80% coverage
  - Request analysis (intent detection, entity extraction)
  - Category selection (7 categories)
  - Skill selection (mcp-integration, playwright, git-master, etc.)
- **MCP Registry**: >90% coverage
  - CRUD operations
  - Multi-tenant isolation
  - Connection state management

- **Integration**: End-to-end flows
  - Slack → Orchestrator → OhMyOpenCode
  - Session continuity
  - Multi-agent orchestration

## Known Limitations

### Migration Required

Some tests will fail until the database migration is applied:

```bash
npx prisma migrate deploy
npx prisma generate
```

This adds:

- `MCPConnection` table
- Enhanced `Session` model (source, state, history, metadata fields)

### Mocked External Dependencies

The following are mocked in tests:

- Prisma Client (`db.mCPConnection.*`)
- OhMyOpenCode `delegate_task` API
- Slack Bolt App events

## Writing New Tests

### Unit Tests

Focus on single function behavior:

```typescript
describe("Component Name", () => {
  it("should do specific thing", () => {
    // Arrange
    const input = "test";

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe("expected");
  });
});
```

### Integration Tests

Test multiple components together:

```typescript
describe("Feature Integration", () => {
  it("should process complete flow", async () => {
    const analysis = await analyzeRequest("...");
    const category = selectCategory("...", analysis);
    const skills = selectSkills("...");

    expect(category).toBe("quick");
    expect(skills).toContain("mcp-integration");
  });
});
```

## CI/CD Integration

Tests run automatically on:

- Pull request creation
- Commit to `main` branch
- Manual workflow dispatch

Required secrets:

- `DATABASE_URL` (test database)
- `REDIS_URL` (test Redis instance)

## Debugging Tests

### Verbose Output

```bash
npm test -- --verbose
```

### Single Test

```bash
npm test -- --testNamePattern="should process Linear update"
```

### Debug Mode

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

Then attach your debugger to `chrome://inspect`.

## Future Improvements

- [ ] Add E2E tests with real Slack Bot
- [ ] Add performance benchmarks
- [ ] Add contract tests for OhMyOpenCode API
- [ ] Add snapshot tests for LLM prompts
- [ ] Add load tests for session management
