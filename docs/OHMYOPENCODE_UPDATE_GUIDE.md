# OhMyOpenCode Update Guide

**Purpose**: Manual guide for updating OhMyOpenCode when automation fails or immediate update is needed.

**Last Updated**: 2026-01-26

---

## Table of Contents

1. [Automated Update (Recommended)](#automated-update)
2. [Manual Update](#manual-update)
3. [Emergency Update](#emergency-update)
4. [Rollback](#rollback)
5. [Troubleshooting](#troubleshooting)

---

## Automated Update (Recommended)

### Workflow

The GitHub Actions workflow automatically:

- Checks for updates every Monday 9:00 AM KST
- Creates PR with changelog
- Runs automated tests
- Waits for manual approval

### Trigger Manual Check

```bash
gh workflow run ohmyopencode-update.yml
```

Or visit: https://github.com/seankim-business/corp-system/actions/workflows/ohmyopencode-update.yml

### Review PR

1. Go to PR created by GitHub Actions
2. Review changelog and test results
3. Check for breaking changes
4. Approve if all tests pass
5. Merge to deploy

---

## Manual Update

### When to Use

- Automation failed
- Critical security patch needed immediately
- Testing specific OhMyOpenCode version

### Step 1: Check Current Version

```bash
cd /Users/sean/Documents/Kyndof/tools/nubabel
cd vendor/ohmyopencode
git log --oneline -1
cat package.json | grep version
```

### Step 2: Fetch Latest Updates

```bash
cd vendor/ohmyopencode
git fetch origin main
git log --oneline HEAD..origin/main
```

### Step 3: Review Changelog

```bash
git log --oneline --no-merges HEAD..origin/main
git diff HEAD..origin/main package.json
```

Check for:

- Version bump (major/minor/patch)
- Breaking changes in commit messages
- New dependencies

### Step 4: Update Submodule

```bash
git checkout origin/main

cd ../..
git add vendor/ohmyopencode
git status
```

### Step 5: Rebuild Sidecar

```bash
cd opencode-sidecar
npm ci
npm run build
```

### Step 6: Test Locally

```bash
npm start &
SIDECAR_PID=$!

sleep 10

curl http://localhost:3001/health

curl -X POST http://localhost:3001/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": [],
    "prompt": "Test update",
    "session_id": "test_manual_update"
  }'

kill $SIDECAR_PID
```

### Step 7: Update COMPATIBILITY.md

```bash
cd ..
vi COMPATIBILITY.md
```

Add new version entry with:

- Version numbers
- Commit hashes
- Test date
- Breaking changes (if any)

### Step 8: Commit Changes

```bash
NEW_VERSION=$(cd vendor/ohmyopencode && cat package.json | grep version | awk -F'"' '{print $4}')

git commit -m "chore(deps): update OhMyOpenCode to v$NEW_VERSION"
git push origin main
```

### Step 9: Deploy

**Railway** (auto-deploys on push to main):

- Wait for deployment to complete
- Check Railway logs
- Test staging environment

**Manual deployment**:

```bash
cd opencode-sidecar
docker-compose build
docker-compose up -d
```

### Step 10: Monitor

Monitor for 1 hour:

- Error rate
- Latency (p95, p99)
- Success rate
- Logs for errors

---

## Emergency Update

### Critical Security Patch

If OhMyOpenCode releases critical security fix:

```bash
cd /Users/sean/Documents/Kyndof/tools/nubabel/vendor/ohmyopencode

git fetch origin
git log origin/main | grep -i "security\|cve\|vulnerability"

PATCH_COMMIT=$(git rev-parse origin/main)
git checkout $PATCH_COMMIT

cd ../..
git add vendor/ohmyopencode

cd opencode-sidecar
npm run build

docker-compose restart opencode-sidecar

cd ..
git commit -m "security: emergency OhMyOpenCode security patch"
git push origin main
```

### Skip Testing (Use with Caution)

Only if:

- Security vulnerability actively exploited
- Production system at risk
- Patch is patch-level version bump (x.x.1 → x.x.2)

**Always rollback immediately if issues occur.**

---

## Rollback

### Automated Rollback Script

```bash
cd opencode-sidecar

./rollback.sh 3ed1c66

git status
git commit -m "chore: rollback OhMyOpenCode to v3.1.0"
git push origin main
```

### Manual Rollback

```bash
cd vendor/ohmyopencode

git log --oneline -10

PREVIOUS_COMMIT=<commit-hash>
git checkout $PREVIOUS_COMMIT

cd ../..
git add vendor/ohmyopencode

cd opencode-sidecar
npm run build
docker-compose restart opencode-sidecar

cd ..
git commit -m "chore: rollback OhMyOpenCode to $PREVIOUS_COMMIT"
git push origin main
```

### Verify Rollback

```bash
curl http://localhost:3001/health

cd vendor/ohmyopencode
git log -1
cat package.json | grep version
```

---

## Troubleshooting

### Build Fails After Update

```bash
cd opencode-sidecar

rm -rf node_modules package-lock.json
npm install
npm run build
```

### Health Check Fails

```bash
docker logs opencode-sidecar

curl -v http://localhost:3001/health
```

Check for:

- Port conflicts (3001 already in use)
- Missing ANTHROPIC_API_KEY
- Build errors

### Tests Fail

```bash
cd opencode-sidecar

npm test

npm start &
SIDECAR_PID=$!

curl http://localhost:3001/health
curl -X POST http://localhost:3001/delegate -d @test-request.json

kill $SIDECAR_PID
```

### Submodule Out of Sync

```bash
cd vendor/ohmyopencode
git status

git reset --hard origin/main

cd ../..
git submodule update --init --recursive
```

### Cannot Checkout Commit

```bash
cd vendor/ohmyopencode

git fetch origin
git fetch --tags
git remote -v

git checkout <commit>
```

If still fails:

```bash
cd ../..
rm -rf vendor/ohmyopencode
git submodule update --init --recursive
```

---

## Version Pinning Strategy

### Current Strategy: Submodule (Manual)

```bash
cd vendor/ohmyopencode
git checkout v3.1.0
```

Pros:

- Full control over updates
- Test before deploying
- Easy rollback

Cons:

- Manual work required
- May miss critical patches

### Alternative: Package Version

```json
{
  "dependencies": {
    "@ohmyopencode/core": "3.1.0"
  }
}
```

Pros:

- Familiar npm workflow
- Semantic versioning

Cons:

- If OhMyOpenCode publishes to npm
- Less control over exact commit

**Recommendation**: Keep current submodule approach for maximum control.

---

## Monitoring Checklist

After every update, monitor for 1 hour:

### Metrics

- [ ] Request rate (requests/minute)
- [ ] Error rate (< 1%)
- [ ] P95 latency (< 5s)
- [ ] P99 latency (< 15s)
- [ ] Success rate (> 99%)

### Logs

- [ ] No new error messages
- [ ] No deprecation warnings
- [ ] No unhandled exceptions

### Functionality

- [ ] Health endpoint responds
- [ ] All categories work
- [ ] All skills work
- [ ] Slack bot integration works
- [ ] Workflow execution works

### User Impact

- [ ] No user complaints
- [ ] No increase in support tickets
- [ ] Normal usage patterns

**If any issue detected**: Rollback immediately and investigate.

---

## Contact

**Questions?**

- Engineering team: engineering@nubabel.com
- Slack: #engineering channel
- On-call: Check PagerDuty

**Report issues**:

- Nubabel: https://github.com/seankim-business/corp-system/issues
- OhMyOpenCode: https://github.com/code-yeongyu/oh-my-opencode/issues

---

**Maintained by**: Nubabel Engineering Team  
**Last reviewed**: 2026-01-26
