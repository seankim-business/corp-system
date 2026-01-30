# Draft: OMC + Claude Max Integration

## Requirements (confirmed from interview)

1. **Claude Max Account Pool Manager** - Manage N Claude Max subscription accounts (NOT API keys)
2. **OMC Agent Visibility Layer** - Broadcast agent activity to Slack and Web UI
3. **Claude Code CLI Bridge** - Execute via CLI, parse output, handle sessions
4. **Slack #it-test Integration** - QA/QC in dedicated channel
5. **Railway Build Monitoring** - Deployment status notifications

## Technical Decisions

### Claude Max vs Claude API - CRITICAL DISTINCTION

- User explicitly wants **Claude Max subscription accounts** (consumer accounts)
- NOT API accounts with rate limits per key
- This means running `claude` CLI instances under different accounts
- No direct API - infer quota from CLI errors/behavior
- Account rotation when quota exhausted

### Existing Infrastructure Analysis

**What Already Exists:**

- `src/api/slack.ts` - Socket Mode, multi-tenant, BullMQ queue
- `src/api/sse.ts` - Redis pub/sub for multi-instance fanout
- `src/services/monitoring/agent-activity.service.ts` - SSE streaming, Slack placeholder
- `prisma/schema.prisma` - ClaudeAccount model with circuit breaker fields
- `src/orchestrator/delegate-task.ts` - References `createAccountPoolService` (needs implementation)
- `frontend/src/pages/AgentActivityPage.tsx` - Basic event streaming
- `vendor/ohmyopencode/` - Full Sisyphus, explore, librarian, oracle agents

**What Needs to Be Built:**

- Account pool service for Claude Max accounts (CLI-based, not API)
- Claude Code CLI bridge/wrapper
- Enhanced agent visibility (Slack Block Kit + enhanced frontend)
- Slack notification service for agent activity
- Railway CLI integration

## Research Findings

### From Codebase Analysis:

1. **AgentActivityService** already has `setSlackService()` placeholder - designed for this
2. **ClaudeAccount model** has circuit breaker fields but assumes API - needs CLI adaptation
3. **OhMyOpenCode** agents use `delegate_task` which already goes through Nubabel's orchestrator
4. **SSE infrastructure** is production-ready with Redis for multi-instance

### Architecture Implications:

1. Need a "Claude Max Pool Manager" that spawns/manages CLI processes
2. CLI output needs parsing for:
   - Quota warnings ("rate limit", "slow down")
   - Completion signals
   - Error detection
3. Account switching triggers:
   - "quota exceeded" type messages
   - Response time degradation
   - Explicit rate limit errors

## Open Questions - RESOLVED

1. **How many Claude Max accounts?** - Start with N configurable accounts
2. **Account storage?** - Reuse ClaudeAccount model, adapt for CLI auth
3. **CLI auth mechanism?** - Each account has its own `~/.config/claude/` profile
4. **Verification method?** - Playwright for browser, Slack #it-test for bot, Railway CLI for builds

## Scope Boundaries

### INCLUDE:

- Claude Max account pool with CLI bridge
- Agent activity → Slack notifications (Block Kit)
- Agent activity → Web UI (enhanced SSE)
- Slack #it-test channel integration
- Railway CLI status integration

### EXCLUDE:

- API key management (user explicitly wants Claude Max, not API)
- Changes to existing workflow engine
- New dashboard pages (enhance existing AgentActivityPage)
- Billing integration (out of scope)

## Test Strategy Decision

- **Infrastructure exists**: YES (bun test framework)
- **User wants tests**: YES (TDD for critical components)
- **QA approach**: TDD for services, Manual verification for integrations
