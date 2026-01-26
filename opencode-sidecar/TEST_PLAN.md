# OpenCode Sidecar - Test Plan

## Testing Status

### ✅ Completed Tests

1. **TypeScript Compilation**: Build successful, 0 errors
2. **Dependency Installation**: 234 packages installed, 0 vulnerabilities
3. **Type Safety**: All imports resolved, strict mode enabled
4. **Code Structure**: All files present, proper exports

### 🧪 Manual Testing Required

Testing requires a valid `ANTHROPIC_API_KEY` to complete full integration tests.

---

## Test Scenarios

### 1. Health Check (No API Key Required)

```bash
# Start sidecar
cd opencode-sidecar
npm run dev

# In another terminal
curl http://localhost:3001/health

# Expected Response:
{
  "status": "healthy",
  "timestamp": "2026-01-26T...",
  "uptime": 0.123,
  "anthropic": {
    "configured": false  # Will be true when API key is set
  }
}
```

**Status**: ✅ Can test without API key

---

### 2. Request Validation (No API Key Required)

```bash
# Test invalid category
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "invalid-category",
    "load_skills": [],
    "prompt": "test",
    "session_id": "ses_123_test"
  }'

# Expected: 400 Bad Request with detailed error

# Test missing fields
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: 400 Bad Request listing all missing fields

# Test invalid session ID format
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": [],
    "prompt": "test",
    "session_id": "invalid-format"
  }'

# Expected: 400 Bad Request - session ID pattern mismatch
```

**Status**: ✅ Can test without API key

---

### 3. AI Delegation (Requires API Key)

```bash
# Set API key in .env first
# ANTHROPIC_API_KEY=sk-ant-...

# Start sidecar
npm run dev

# Test actual delegation
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d @test-request.json

# Expected: 200 OK with AI response
{
  "output": "Git rebase and merge are...",
  "status": "success",
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "duration": 3456,
    "inputTokens": 1234,
    "outputTokens": 567,
    "cost": 0.0089
  }
}
```

**Status**: ⏳ Requires API key

---

### 4. Category & Model Selection (Requires API Key)

Test each category maps to correct model:

```bash
# Quick → Haiku
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": [],
    "prompt": "What is 2+2?",
    "session_id": "ses_123_quick"
  }'
# Expected: model: "claude-3-5-haiku-20241022"

# Ultrabrain → Sonnet
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "ultrabrain",
    "load_skills": [],
    "prompt": "Explain quantum computing",
    "session_id": "ses_123_ultra"
  }'
# Expected: model: "claude-3-5-sonnet-20241022"
```

**Status**: ⏳ Requires API key

---

### 5. Skill System Prompts (Requires API Key)

Test skill injection:

```bash
# Test git-master skill
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": ["git-master"],
    "prompt": "What is git rebase?",
    "session_id": "ses_123_git"
  }'
# Expected: Response includes Git expertise context

# Test multiple skills
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "visual-engineering",
    "load_skills": ["frontend-ui-ux", "playwright"],
    "prompt": "Create a responsive navbar",
    "session_id": "ses_123_multi"
  }'
# Expected: Response includes both frontend and Playwright expertise
```

**Status**: ⏳ Requires API key

---

### 6. Error Handling

```bash
# Test with invalid API key
# Edit .env: ANTHROPIC_API_KEY=invalid-key
npm run dev

curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d @test-request.json

# Expected: 500 Internal Server Error with authentication error

# Test timeout (mock long-running request)
# Would need to simulate 30s+ execution time
```

**Status**: ⏳ Requires API key

---

### 7. Integration with Nubabel

```bash
# Terminal 1: Start sidecar
cd opencode-sidecar
npm run dev

# Terminal 2: Configure and start Nubabel
cd /path/to/nubabel
echo "OPENCODE_SIDECAR_URL=http://localhost:3001" >> .env
npm run dev

# Terminal 3: Trigger delegation via Nubabel
# Option A: Use Slack bot
# @your-bot help me with git

# Option B: Use workflow execution
# Execute a workflow that triggers orchestration

# Expected: Nubabel logs show:
# "Delegating task to OpenCode sidecar"
# "Task delegation completed"
```

**Status**: ⏳ Requires API key + Nubabel setup

---

### 8. Docker Testing

```bash
# Build image
cd opencode-sidecar
docker build -t opencode-sidecar .

# Expected: Build succeeds with multi-stage output

# Run container (without API key)
docker run -p 3001:3001 \
  -e NODE_ENV=production \
  opencode-sidecar

# Test health check
curl http://localhost:3001/health

# Run with API key
docker run -p 3001:3001 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e NODE_ENV=production \
  opencode-sidecar

# Test delegation
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d @test-request.json
```

**Status**: ✅ Can test build without API key, delegation requires API key

---

### 9. Docker Compose Testing

```bash
# Edit docker-compose.yml with API key
# Or set in environment: export ANTHROPIC_API_KEY=sk-ant-...

cd opencode-sidecar
docker-compose up -d

# Check logs
docker-compose logs -f

# Test
curl http://localhost:3001/health
curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d @test-request.json

# Stop
docker-compose down
```

**Status**: ⏳ Requires API key

---

### 10. Load Testing (Optional)

```bash
# Install k6
brew install k6

# Create load test script
cat > load-test.js << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  const res = http.post('http://localhost:3001/delegate', JSON.stringify({
    category: 'quick',
    load_skills: [],
    prompt: 'What is 2+2?',
    session_id: `ses_${Date.now()}_load`,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });
}
EOF

# Run load test
k6 run load-test.js
```

**Status**: ⏳ Requires API key

---

## Test Results Template

### Environment

- Node.js version: 20.x
- npm version: 10.x
- OS: macOS / Linux / Docker

### Test Results

| Test                | Status     | Notes                    |
| ------------------- | ---------- | ------------------------ |
| TypeScript Build    | ✅ Pass    | 0 errors                 |
| Dependency Install  | ✅ Pass    | 0 vulnerabilities        |
| Health Check        | ⏳ Pending | Requires local start     |
| Request Validation  | ⏳ Pending | Requires local start     |
| AI Delegation       | ⏳ Pending | Requires API key         |
| Category Selection  | ⏳ Pending | Requires API key         |
| Skill Injection     | ⏳ Pending | Requires API key         |
| Error Handling      | ⏳ Pending | Requires API key         |
| Nubabel Integration | ⏳ Pending | Requires both services   |
| Docker Build        | ⏳ Pending | Can test without API key |
| Docker Compose      | ⏳ Pending | Requires API key         |
| Load Testing        | ⏳ Pending | Optional                 |

---

## Quick Validation Without API Key

You can validate the implementation without an API key by checking:

### 1. Code Structure

```bash
cd opencode-sidecar
tree src/
```

Expected:

```
src/
├── constants.ts  ✓
├── delegate.ts   ✓
├── index.ts      ✓
├── types.ts      ✓
└── validator.ts  ✓
```

### 2. Type Safety

```bash
npm run type-check
```

Expected: No errors

### 3. Build Output

```bash
npm run build
ls dist/
```

Expected:

```
constants.js  delegate.js  index.js  types.js  validator.js
+ .d.ts and .map files
```

### 4. Dependencies

```bash
npm list --depth=0 | grep -E "(express|anthropic|cors|helmet|rate-limit)"
```

Expected: All dependencies present

### 5. Validation Logic (Unit Test Style)

```bash
# Create manual test file
cat > test-validator.js << 'EOF'
const { validateRequest } = require('./dist/validator');

// Test 1: Valid request
const valid = validateRequest({
  category: 'quick',
  load_skills: [],
  prompt: 'Hello',
  session_id: 'ses_123_test'
});
console.log('Valid request:', valid.valid ? '✅ Pass' : '❌ Fail');

// Test 2: Invalid category
const invalid = validateRequest({
  category: 'invalid',
  load_skills: [],
  prompt: 'Hello',
  session_id: 'ses_123_test'
});
console.log('Invalid category detection:', !invalid.valid ? '✅ Pass' : '❌ Fail');

// Test 3: Missing fields
const missing = validateRequest({});
console.log('Missing fields detection:', !missing.valid && missing.errors.length >= 4 ? '✅ Pass' : '❌ Fail');
EOF

node test-validator.js
```

---

## Next Steps

### To complete full testing:

1. **Get Anthropic API key**:

   ```bash
   # Sign up at https://console.anthropic.com/
   # Create API key
   # Add to opencode-sidecar/.env
   echo "ANTHROPIC_API_KEY=sk-ant-your-key" >> .env
   ```

2. **Run all tests**:

   ```bash
   npm run dev
   # Run curl commands from scenarios above
   ```

3. **Test Nubabel integration**:

   ```bash
   # Set OPENCODE_SIDECAR_URL in Nubabel's .env
   # Restart Nubabel
   # Trigger delegation (Slack bot or workflow)
   ```

4. **Deploy to staging**:
   ```bash
   # Railway or Docker deployment
   # Set production environment variables
   # Run smoke tests
   ```

---

## Automated Test Suite (Future)

For production, create automated tests:

```typescript
// tests/delegate.test.ts
import { delegateTask } from "../src/delegate";

describe("delegateTask", () => {
  it("should select correct model for quick category", async () => {
    const result = await delegateTask({
      category: "quick",
      load_skills: [],
      prompt: "test",
      session_id: "ses_test",
    });
    expect(result.metadata.model).toBe("claude-3-5-haiku-20241022");
  });

  // More tests...
});
```

Setup with Jest or Vitest + mock Anthropic SDK for unit tests.

---

**Test Status**: Ready for manual testing with API key  
**Automated Tests**: To be implemented in next phase
