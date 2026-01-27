# OpenCode Sidecar - Quick Start Guide

## ✅ All Fixes Complete

All 6 critical bugs fixed and verified via TypeScript compilation.  
**Status**: Ready for runtime testing

---

## 🚀 3-Step Setup

### Step 1: Configure API Key

```bash
cd opencode-sidecar
nano .env

# Set your Anthropic API key:
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### Step 2: Start Service

```bash
npm run dev
```

### Step 3: Verify Plugin Loaded

Look for this log line:

```
[nubabel-bridge] Plugin loaded { directory: "...", worktree: "..." }
```

✅ If you see this → Plugin loading works! (BUG #1 and #2 fixed)  
❌ If you don't see this → Check error logs and report

---

## 🧪 Test End-to-End (Optional)

### Terminal 1: Start Sidecar

```bash
cd opencode-sidecar
npm run dev
```

### Terminal 2: Start Nubabel

```bash
cd /Users/sean/Documents/Kyndof/tools/nubabel
USE_OPENCODE=true npm run dev
```

### Terminal 3: Send Test Request

```bash
curl -X POST http://localhost:3000/api/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": [],
    "prompt": "Say hello world",
    "session_id": "ses_test_123"
  }'
```

### Expected Logs (Sidecar)

```
[opencode-client] Creating OpenCode session
[opencode-client] OpenCode session created
[nubabel-bridge] Message updated { completed: false }
[nubabel-bridge] Message updated { completed: true }
[nubabel-bridge] Assistant message completed, calling completion callback
```

### Expected Logs (Nubabel)

```
[sidecar-callbacks] Session state updated via sidecar callback
[sidecar-callbacks] Progress update received
```

---

## 🐛 Troubleshooting

### Plugin Doesn't Load

```bash
# Check plugin is in config
grep "plugin:" opencode-sidecar/src/opencode-client.ts
# Should show: ["oh-my-opencode", "./.opencode/plugins/nubabel-bridge.ts"]

# Check file exists
ls -la opencode-sidecar/.opencode/plugins/nubabel-bridge.ts
```

### TypeScript Errors

```bash
cd opencode-sidecar
npm run build
# Should exit 0 with no errors
```

### Timeout Issues

- Check: Sidecar logs show `[nubabel-bridge] Assistant message completed`
- Check: Nubabel logs show callback received
- Check: `context.completed = true` is being set

---

## 📚 Documentation

- **FIXES_COMPLETE.md**: Complete list of all 6 bugs fixed
- **VERIFICATION_CHECKLIST.md**: Detailed testing checklist
- **API_SPEC.md**: Full API documentation
- **README.md**: Deployment guide

---

## ✅ What's Fixed

| Bug                                | Status | File                      |
| ---------------------------------- | ------ | ------------------------- |
| #1: Plugin not loaded              | ✅     | opencode-client.ts:13     |
| #2: Plugin signature mismatch      | ✅     | nubabel-bridge.ts:5       |
| #3: Event handler wrong properties | ✅     | nubabel-bridge.ts:12-30   |
| #4: Session completion polling     | ✅     | opencode-client.ts:80-110 |
| #5: Tool context type              | ✅     | nubabel-bridge.ts         |
| #6: Version mismatch               | ✅     | package.json              |

**Build Status**: ✅ PASSING  
**Next Step**: Configure API key and start service

---

**Last Updated**: 2026-01-27 22:35 KST
