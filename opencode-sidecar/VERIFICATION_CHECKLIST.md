# OpenCode Sidecar Integration - Verification Checklist

## ✅ Completed Fixes (Compile-Time Verified)

### BUG #1: Plugin Not Loaded ✅ FIXED

- **File**: `src/opencode-client.ts` (line 13)
- **Before**: `plugin: ["oh-my-opencode"]`
- **After**: `plugin: ["oh-my-opencode", "./.opencode/plugins/nubabel-bridge.ts"]`
- **Verification**:
  ```bash
  grep -A 2 "plugin:" opencode-sidecar/dist/opencode-client.js
  # Output shows both plugins ✓
  ```

### BUG #2: Plugin Type Signature Mismatch ✅ FIXED

- **File**: `.opencode/plugins/nubabel-bridge.ts` (line 5)
- **Before**: `export default (async (ctx) => { ... })`
- **After**: `export default (async (input: PluginInput) => { ... })`
- **Verification**:
  ```bash
  npm run build
  # Exit code: 0 (no TypeScript errors) ✓
  ```

### BUG #3: Event Handler Wrong Properties ✅ FIXED

- **File**: `.opencode/plugins/nubabel-bridge.ts` (lines 12-30)
- **Before**: `(event as any).properties?.sessionID` (doesn't exist)
- **After**: `event.properties.info` (correct structure)
- **Verification**:
  ```typescript
  // Type-safe access without `as any`
  const message = event.properties.info;
  if (message.role === "assistant" && message.time.completed) {
    // Correct property access ✓
  }
  ```

### BUG #4: Session Completion Polling Broken ✅ FIXED

- **File**: `src/opencode-client.ts` (lines 80-110)
- **Before**:
  ```typescript
  const parts = await client.part.list({ ... }); // API doesn't exist!
  ```
- **After**:
  ```typescript
  const context = (global as any).nubabelContext?.get(opencodeSessionId);
  if (context?.completed) {
    resolve(context.output || "Task completed successfully");
  }
  ```
- **Verification**: Logic now polls `context.completed` flag set by plugin ✓

### BUG #5: Tool Context Type Missing ✅ FIXED

- **File**: `.opencode/plugins/nubabel-bridge.ts`
- **Before**: Unsafe `any` type casting
- **After**: Proper `PluginInput` type with correct destructuring
- **Verification**: TypeScript compilation passes ✓

### BUG #6: Version Mismatch ✅ FIXED

- **File**: `package.json`
- **Before**: `"@opencode-ai/sdk": "^1.0.150"`
- **After**: `"@opencode-ai/sdk": "^1.1.36"`
- **Verification**:
  ```bash
  cat opencode-sidecar/package.json | grep "@opencode-ai"
  # Shows 1.1.36 for both SDK and plugin ✓
  ```

---

## ⏳ Pending Runtime Verification

### Test 1: Plugin Loading

**Status**: ⏳ **PENDING** (requires Anthropic API key)

**Prerequisites**:

```bash
cd opencode-sidecar
# Set API key in .env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

**Test Steps**:

```bash
npm run dev
```

**Expected Console Output**:

```
[opencode-client] Initializing OpenCode client with OhMyOpenCode plugin
[opencode-client] OpenCode client initialized { url: "http://..." }
[nubabel-bridge] Plugin loaded { directory: "...", worktree: "..." }
✅ Sidecar server listening on port 3001
```

**Success Criteria**:

- ✅ Log shows `[nubabel-bridge] Plugin loaded`
- ✅ No plugin loading errors
- ✅ Server starts on port 3001

**If Test Fails**:

- Check: Plugin path is correct (`./.opencode/plugins/nubabel-bridge.ts`)
- Check: Plugin file exists: `ls -la .opencode/plugins/nubabel-bridge.ts`
- Check: TypeScript types match SDK: `npm run build`

---

### Test 2: Event Handler Firing

**Status**: ⏳ **PENDING** (requires Test 1 to pass)

**Prerequisites**:

- Sidecar running (from Test 1)
- Nubabel running with `USE_OPENCODE=true`

**Test Steps**:

```bash
# Terminal 1: Sidecar
cd opencode-sidecar && npm run dev

# Terminal 2: Nubabel
cd /Users/sean/Documents/Kyndof/tools/nubabel && npm run dev

# Terminal 3: Trigger a task
curl -X POST http://localhost:3000/api/delegate \
  -H "Content-Type: application/json" \
  -d '{"category":"quick","prompt":"Hello","session_id":"ses_test_123"}'
```

**Expected Sidecar Logs**:

```
[opencode-client] Creating OpenCode session { sessionId: "ses_test_123", ... }
[opencode-client] OpenCode session created { opencodeSessionId: "...", ... }
[nubabel-bridge] Message updated { sessionID: "...", role: "assistant", completed: false }
[nubabel-bridge] Message updated { sessionID: "...", role: "assistant", completed: true }
[nubabel-bridge] Assistant message completed, calling completion callback
```

**Success Criteria**:

- ✅ Event handler fires on `message.updated`
- ✅ Correct sessionID extracted
- ✅ Completion detected when `message.time.completed` is true

**If Test Fails**:

- Check: Event structure matches SDK Event type
- Check: `message.sessionID` is not undefined
- Check: `message.time.completed` is set

---

### Test 3: Callback Delivery

**Status**: ⏳ **PENDING** (requires Test 2 to pass)

**Prerequisites**:

- Test 2 passing (events firing)
- Nubabel callback endpoints active

**Expected Nubabel Logs**:

```
[sidecar-callbacks] Session state updated via sidecar callback { sessionId: "ses_test_123", state: "completed" }
[sidecar-callbacks] Progress update received { sessionId: "ses_test_123", progress: {...} }
```

**Success Criteria**:

- ✅ Sidecar sends POST to `nubabelContext.callbacks.sessionUpdate`
- ✅ Nubabel receives and processes callback
- ✅ HTTP 200 response from Nubabel

**If Test Fails**:

- Check: `nubabelContext.callbacks.sessionUpdate` is a valid URL
- Check: Nubabel is running on expected port (3000)
- Check: Network connectivity between services

---

### Test 4: Session Completion

**Status**: ⏳ **PENDING** (requires Test 3 to pass)

**Prerequisites**:

- All previous tests passing
- Full end-to-end flow active

**Expected Behavior**:

```typescript
// In opencode-client.ts waitForSessionCompletion()
const context = (global as any).nubabelContext?.get(opencodeSessionId);
if (context?.completed) {
  // Should resolve within 30 seconds ✓
  resolve(context.output || "Task completed successfully");
}
```

**Success Criteria**:

- ✅ Request completes in < 30 seconds (not 120s timeout)
- ✅ Response contains valid output
- ✅ `context.completed = true` flag is set by plugin
- ✅ No "timeout" errors in logs

**If Test Fails**:

- Check: Plugin event handler is setting `context.completed = true`
- Check: Polling interval is correct (100ms)
- Check: Session ID mapping is correct (nubabelContext Map)

---

## 🧪 Quick Verification Commands

### 1. Build Verification

```bash
cd opencode-sidecar
npm run build
echo $?  # Should output: 0
```

### 2. Plugin File Exists

```bash
ls -la opencode-sidecar/.opencode/plugins/nubabel-bridge.ts
# Should show: -rw-r--r-- 3955 bytes
```

### 3. Compiled Config

```bash
grep "plugin:" opencode-sidecar/dist/opencode-client.js
# Should show: ["oh-my-opencode", "./.opencode/plugins/nubabel-bridge.ts"]
```

### 4. SDK Version

```bash
cat opencode-sidecar/package.json | grep "@opencode-ai"
# Should show: "^1.1.36" for both
```

### 5. Health Check (when running)

```bash
curl http://localhost:3001/health
# Should return: {"status":"healthy",...}
```

---

## 📊 Summary

### ✅ Compile-Time Verification (6/6 Complete)

| Fix                  | Status | File                      |
| -------------------- | ------ | ------------------------- |
| #1: Plugin loading   | ✅     | opencode-client.ts:13     |
| #2: Plugin signature | ✅     | nubabel-bridge.ts:5       |
| #3: Event properties | ✅     | nubabel-bridge.ts:12-30   |
| #4: Polling logic    | ✅     | opencode-client.ts:80-110 |
| #5: Type safety      | ✅     | nubabel-bridge.ts         |
| #6: Version match    | ✅     | package.json              |

### ⏳ Runtime Verification (0/4 Complete)

| Test               | Status     | Blocker                 |
| ------------------ | ---------- | ----------------------- |
| Plugin loading     | ⏳ Pending | Needs ANTHROPIC_API_KEY |
| Event firing       | ⏳ Pending | Needs Test 1            |
| Callback delivery  | ⏳ Pending | Needs Test 2            |
| Session completion | ⏳ Pending | Needs Test 3            |

---

## 🚀 Next Steps

1. **Set API Key**: Add `ANTHROPIC_API_KEY` to `opencode-sidecar/.env`
2. **Start Sidecar**: Run `npm run dev` in `opencode-sidecar/`
3. **Verify Logs**: Look for `[nubabel-bridge] Plugin loaded` message
4. **Test E2E**: Run full workflow (Nubabel → Sidecar → OpenCode → Callbacks)

---

## 🐛 Troubleshooting

### Plugin Doesn't Load

```bash
# Check plugin path
cd opencode-sidecar
cat src/opencode-client.ts | grep "plugin:"
# Should show both plugins in array

# Check file exists
ls -la .opencode/plugins/nubabel-bridge.ts
# Should exist with ~4KB size
```

### TypeScript Errors

```bash
# Rebuild and check
npm run build
# Should exit 0 with no errors
```

### Event Handler Not Firing

```bash
# Verify Event type usage
grep "event.type ===" .opencode/plugins/nubabel-bridge.ts
# Should show: if (event.type === "message.updated")

# Verify properties access
grep "event.properties.info" .opencode/plugins/nubabel-bridge.ts
# Should show: const message = event.properties.info;
```

### Session Never Completes

```bash
# Check context flag setting
grep "context.completed = true" .opencode/plugins/nubabel-bridge.ts
# Should show line in event handler

# Check polling logic
grep "context?.completed" src/opencode-client.ts
# Should show in waitForSessionCompletion
```

---

**Last Updated**: 2026-01-27 22:35 KST  
**Build Status**: ✅ PASSING  
**Runtime Status**: ⏳ PENDING (awaiting API key)
