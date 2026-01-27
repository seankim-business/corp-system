# Railway Deployment Guide - OhMyOpenCode Sidecar

**목적**: OhMyOpenCode Sidecar를 Railway에 배포

**소요 시간**: 10-15분

---

## Prerequisites

- Railway 계정 (https://railway.app)
- Railway CLI 설치 (optional)
- Anthropic API Key

---

## 배포 방법 1: Railway Dashboard (권장)

### Step 1: New Project 생성

1. Railway Dashboard 접속: https://railway.app/dashboard
2. **New Project** 클릭
3. **Deploy from GitHub repo** 선택
4. Repository 선택: `seankim-business/corp-system`

### Step 2: Root Directory 설정

1. 생성된 서비스 클릭
2. **Settings** 탭 이동
3. **Root Directory** 설정:
   ```
   opencode-sidecar
   ```
4. **Save Changes**

### Step 3: 환경변수 설정

1. **Variables** 탭 이동
2. 다음 변수 추가:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-...  # Your Anthropic API key

# Optional (defaults)
PORT=3001
NODE_ENV=production
LOG_LEVEL=info
```

3. **Deploy** 버튼 클릭 (자동 배포 시작)

### Step 4: 배포 확인

1. **Deployments** 탭에서 배포 진행 상황 확인
2. 빌드 로그 확인:

   ```
   Building Dockerfile...
   ✓ CACHED [builder 1/4] FROM docker.io/library/node:20-alpine
   ✓ DONE Building
   ```

3. **Deployment successful** 메시지 확인

### Step 5: Public URL 확인

1. **Settings** 탭 이동
2. **Networking** 섹션
3. **Generate Domain** 클릭
4. 생성된 URL 복사 (예: `opencode-sidecar-production.up.railway.app`)

### Step 6: Health Check 테스트

```bash
curl https://opencode-sidecar-production.up.railway.app/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-01-26T...",
  "uptime": 123,
  "anthropic": {
    "configured": true
  }
}
```

---

## 배포 방법 2: Railway CLI (고급)

### Step 1: Railway CLI 설치

```bash
# macOS
brew install railway

# npm
npm install -g @railway/cli

# Login
railway login
```

### Step 2: 프로젝트 초기화

```bash
cd /Users/sean/Documents/Kyndof/tools/nubabel/opencode-sidecar

railway init

# Select: Create new project
# Name: opencode-sidecar
```

### Step 3: 환경변수 설정

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-api03-...
railway variables set PORT=3001
railway variables set NODE_ENV=production
```

### Step 4: 배포

```bash
railway up

# Railway will:
# 1. Detect Dockerfile
# 2. Build image
# 3. Deploy to production
# 4. Show deployment URL
```

### Step 5: 로그 확인

```bash
railway logs

# Real-time logs
railway logs --follow
```

---

## Nubabel 연결 설정

### Step 1: Nubabel 환경변수 업데이트

Railway Dashboard에서 Nubabel 서비스의 **Variables** 탭:

```bash
# Add new variable
OPENCODE_SIDECAR_URL=https://opencode-sidecar-production.up.railway.app
OPENCODE_SIDECAR_TIMEOUT=120000
USE_BUILTIN_AI=false
```

### Step 2: Nubabel 재배포

Railway가 자동으로 Nubabel을 재배포합니다.

### Step 3: 연결 확인

Nubabel 로그에서 확인:

```
[Orchestrator] Delegating task to OpenCode sidecar
[Orchestrator] Sidecar URL: https://opencode-sidecar-production.up.railway.app
[Orchestrator] Task delegation completed
```

---

## 테스트

### Slack Bot 테스트

```
@nubabel Create a Notion task "Test sidecar deployment"
```

예상 응답:

```
✅ Task created successfully!
[Using OhMyOpenCode Sidecar v3.1.0]
```

### Workflow 테스트

1. Nubabel Dashboard → Workflows
2. 기존 workflow 실행
3. Execution 로그 확인
4. Sidecar 호출 로그 확인

### Direct API 테스트

```bash
curl -X POST https://opencode-sidecar-production.up.railway.app/delegate \
  -H "Content-Type: application/json" \
  -d '{
    "category": "quick",
    "load_skills": [],
    "prompt": "Hello from Railway deployment test",
    "session_id": "test_railway_deploy"
  }'
```

---

## Monitoring

### Railway Dashboard

1. **Metrics** 탭:
   - CPU usage
   - Memory usage
   - Network traffic

2. **Logs** 탭:
   - Application logs
   - Build logs
   - Deployment logs

### Custom Monitoring (Optional)

OpenTelemetry 설정 (Nubabel이 이미 설정되어 있음):

```bash
# Sidecar Variables에 추가
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-otlp-collector.com
OTEL_SERVICE_NAME=opencode-sidecar
OTEL_EXPORTER_OTLP_HEADERS=x-api-key=your-key
```

---

## Troubleshooting

### Build Failed

**Error**: `npm ci failed`

**Solution**:

```bash
# Locally test build
cd opencode-sidecar
npm ci
npm run build

# If successful, commit and push
git add .
git commit -m "fix: update dependencies"
git push
```

### Health Check Failed

**Error**: `Deployment unhealthy`

**Solution**:

1. Check logs: Railway Dashboard → Logs
2. Verify ANTHROPIC_API_KEY is set
3. Check PORT=3001 is set
4. Manually test health endpoint

### Connection Refused (from Nubabel)

**Error**: `Failed to connect to orchestration service: ECONNREFUSED`

**Solution**:

1. Verify sidecar URL: `https://` (not `http://`)
2. Check Railway deployment status
3. Test health endpoint directly
4. Check network policies (Railway allows all outbound)

### High Latency

**Symptoms**: Requests take >30s

**Solution**:

1. Check Railway region (should be close to Nubabel)
2. Increase timeout: `OPENCODE_SIDECAR_TIMEOUT=180000`
3. Check Anthropic API status
4. Scale Railway service (upgrade plan if needed)

---

## Scaling

### Vertical Scaling (Railway Plan)

```
Hobby:   512 MB RAM, shared CPU  - $5/month
Pro:     8 GB RAM, dedicated CPU - $20/month
```

For production with high traffic, upgrade to Pro plan.

### Horizontal Scaling (Future)

Railway supports multiple replicas:

```bash
railway up --replicas 3
```

Requires:

- Load balancer (Railway provides)
- Stateless service (already is)
- Shared Redis for rate limiting (optional)

---

## Cost Estimation

### Railway Costs

```
Service: opencode-sidecar
- Hobby Plan: $5/month (512 MB RAM)
- Estimated usage: 50-100 hours/month
- Total: ~$5-10/month
```

### Anthropic API Costs

```
Average request:
- Input: 1,200 tokens (~$0.0036)
- Output: 300 tokens (~$0.0045)
- Total: ~$0.0081 per request

Monthly (1,000 requests):
- Total: ~$8.10/month
```

**Total estimated cost**: $13-20/month

---

## Rollback

### Railway Dashboard

1. **Deployments** 탭
2. 이전 배포 선택
3. **Rollback to this deployment** 클릭

### Railway CLI

```bash
railway status
railway rollback <deployment-id>
```

### Git-based Rollback

```bash
cd opencode-sidecar
./rollback.sh <commit-hash>
git push origin main
# Railway auto-deploys
```

---

## Production Checklist

배포 전 확인사항:

- [ ] `ANTHROPIC_API_KEY` 설정됨
- [ ] Health endpoint 응답 확인
- [ ] Nubabel `OPENCODE_SIDECAR_URL` 설정
- [ ] Slack bot 테스트 완료
- [ ] Workflow 실행 테스트 완료
- [ ] 로그 모니터링 설정
- [ ] 롤백 계획 준비
- [ ] `COMPATIBILITY.md` 업데이트

---

## Next Steps

배포 완료 후:

1. **Monitor for 1 hour**: Check logs, error rates
2. **Update docs**: Add production URL to internal docs
3. **Test all features**: Slack bot, workflows, MCP integrations
4. **Enable auto-updates**: GitHub Actions will handle OhMyOpenCode updates

---

## Support

**Issues?**

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Nubabel Engineering: #engineering Slack channel

**Emergency contact**: engineering@nubabel.com

---

**Last Updated**: 2026-01-26  
**Deployment Status**: ⏳ Pending (follow this guide to deploy)
