# OhMyOpenCode Compatibility Matrix

This document tracks compatibility between Nubabel and OhMyOpenCode versions.

**Last Updated**: 2026-01-26

---

## Current Version

| Component        | Version | Commit    | Status        |
| ---------------- | ------- | --------- | ------------- |
| **Nubabel**      | 1.0.0   | -         | ✅ Production |
| **OhMyOpenCode** | 3.1.0   | `3ed1c66` | ✅ Tested     |

---

## Version History

### Nubabel 1.0.0 × OhMyOpenCode 3.1.0

**Status**: ✅ **Compatible** (Tested: 2026-01-26)

**Features**:

- Category system (7 categories)
- Skill system (4 skills)
- Built-in AI executor
- Sidecar support (optional)

**Notes**:

- Initial integration with OhMyOpenCode submodule
- Sidecar deployed but not yet enabled in production
- Using built-in AI executor for stability

**Test Results**:

- ✅ Health check
- ✅ All categories (quick, writing, artistry, ultrabrain, visual-engineering, unspecified-low, unspecified-high)
- ✅ All skills (mcp-integration, playwright, git-master, frontend-ui-ux)
- ✅ Validation errors handled correctly

---

## Breaking Changes Log

### OhMyOpenCode 3.x.x → 4.0.0 (Future)

**Status**: ⚠️ **Anticipated Breaking Changes**

Watch for:

- API contract changes in `/delegate` endpoint
- Category/skill schema modifications
- Authentication requirements

**Migration Guide**: TBD

---

### OhMyOpenCode 3.0.0 → 3.1.0

**Status**: ✅ **Non-breaking** (Tested: 2026-01-26)

**Changes**:

- Plan agent improvements (`@Jeremy-Kr CLA`, `feat(plan-agent)`)
- Dependency/parallel graph enforcement
- Category+skill recommendation enhancements
- Background agent question tool disabled

**Migration**: No changes needed

---

## Upgrade Process

### When OhMyOpenCode Updates

1. **Automated Detection** (GitHub Actions)
   - Runs every Monday 9:00 AM KST
   - Creates PR with changelog if update available

2. **Testing** (Automated via GitHub Actions)
   - Build sidecar
   - Run health checks
   - Test all categories and skills
   - Validate error handling

3. **Manual Review** (Required)
   - Review changelog for breaking changes
   - Check API compatibility
   - Test Slack bot integration in staging
   - Monitor for 1 hour

4. **Deployment** (After approval)
   - Merge PR
   - Rebuild sidecar: `cd opencode-sidecar && npm run build`
   - Deploy to staging first
   - Promote to production if stable

### Rollback Procedure

If issues occur after OhMyOpenCode update:

```bash
cd vendor/ohmyopencode
git checkout <PREVIOUS_COMMIT>
cd ../../opencode-sidecar
npm run build
docker-compose restart opencode-sidecar
```

See: `opencode-sidecar/rollback.sh` for automated rollback.

---

## Known Issues

### Issue Tracking

| Issue | OhMyOpenCode Version | Nubabel Version | Status | Workaround |
| ----- | -------------------- | --------------- | ------ | ---------- |
| -     | -                    | -               | -      | -          |

**Report issues**: Create issue in Nubabel repository with label `ohmyopencode`

---

## API Contract

### `/delegate` Endpoint (Current)

**Request**:

```typescript
{
  category: string;        // One of 7 categories
  load_skills: string[];   // Array of skill names
  prompt: string;          // User request
  session_id: string;      // Session identifier
  organizationId?: string; // Optional tenant context
  userId?: string;         // Optional user context
  context?: object;        // Optional metadata
}
```

**Response** (Success):

```typescript
{
  output: string; // AI response
  status: "success";
  metadata: {
    model: string; // Claude model used
    duration: number; // Execution time (ms)
    inputTokens: number; // Input token count
    outputTokens: number; // Output token count
    cost: number; // Estimated cost (USD)
  }
}
```

**Response** (Failure):

```typescript
{
  output: string;          // Error message
  status: "failed";
  metadata: {
    model: string;
    duration?: number;
    error: string;         // Error code
  }
}
```

### Contract Changes

**Breaking Change Policy**:

- Major version bump (e.g., 3.x → 4.0) = Breaking changes expected
- Minor version bump (e.g., 3.1 → 3.2) = Non-breaking only
- Patch version bump (e.g., 3.1.0 → 3.1.1) = Bug fixes only

---

## Testing Checklist

Before approving OhMyOpenCode update:

- [ ] Build succeeds: `cd opencode-sidecar && npm run build`
- [ ] Health check passes: `curl http://localhost:3001/health`
- [ ] Basic delegation works
- [ ] All 7 categories work
- [ ] All 4 skills work
- [ ] Validation errors handled correctly
- [ ] No regression in Nubabel main service
- [ ] Slack bot integration works
- [ ] Workflow execution works
- [ ] No increase in error rate (monitor for 1 hour)

---

## Support

**Questions?**

- Nubabel issues: https://github.com/seankim-business/corp-system/issues
- OhMyOpenCode issues: https://github.com/code-yeongyu/oh-my-opencode/issues

**Contact**:

- Engineering team: engineering@nubabel.com
- Slack: #engineering channel

---

**Maintained by**: Nubabel Engineering Team  
**Auto-updated by**: GitHub Actions workflow
