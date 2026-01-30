# Nubabel - AI Agent Guidelines

> 이 파일은 모든 AI 에이전트가 이 코드베이스 작업 시 참조해야 하는 가이드라인입니다.

---

## Multi-Agent Coordination (REQUIRED)

**여러 에이전트가 동시 작업 중일 수 있습니다. 반드시 확인하세요!**

```bash
# 작업 시작 전 필수 확인
cat .omc/AGENT_BOARD.md
```

| File                          | Purpose                       |
| ----------------------------- | ----------------------------- |
| `.omc/AGENT_BOARD.md`         | 현재 작업 중인 에이전트 현황  |
| `.omc/AGENT_PROTOCOL.md`      | 협업 프로토콜 상세            |
| `.omc/state/agent-board.json` | JSON 형태 상태 (프로그래밍용) |

---

## Project Overview

**Nubabel** = AI-Powered Workflow Automation Platform (Multi-tenant B2B SaaS)

### Tech Stack

- **Backend**: Node.js 20 + TypeScript + Express.js
- **Database**: PostgreSQL 15 (with RLS) + Prisma ORM
- **Cache/Queue**: Redis 7 + BullMQ
- **Frontend**: React 18 + Vite + Tailwind CSS
- **AI**: Anthropic Claude + OhMyOpenCode orchestration

### Key Directories

```
nubabel/
├── src/                    # Backend source
│   ├── api/               # REST API routes
│   ├── orchestrator/      # AI orchestration system
│   ├── services/          # Business logic
│   ├── workers/           # BullMQ workers
│   └── queue/             # Queue definitions
├── frontend/              # React dashboard
├── prisma/                # Database schema & migrations
├── research/              # Architecture research docs
├── docs/                  # Documentation
└── .omc/                  # Agent coordination state
```

---

## Critical Files (Handle with Care)

| File                   | Risk Level   | Notes                              |
| ---------------------- | ------------ | ---------------------------------- |
| `prisma/schema.prisma` | **HIGH**     | DB schema - migration 필요         |
| `src/index.ts`         | **HIGH**     | Server entry point                 |
| `.env*`                | **CRITICAL** | Secrets - never commit             |
| `src/auth/*`           | **HIGH**     | Authentication - security critical |
| `src/orchestrator/*`   | **MEDIUM**   | AI routing logic                   |

---

## Environment Variables

### Required for Development

```bash
DATABASE_URL     # PostgreSQL connection
REDIS_URL        # Redis connection
JWT_SECRET       # Auth tokens
```

### Slack Bot (Test Environment)

```bash
SLACK_APP_TOKEN        # Socket Mode connection
SLACK_SIGNING_SECRET   # Request verification
SLACK_BOT_TOKEN        # API calls
SLACK_SOCKET_MODE=true
```

See `.env.example` for full list.

---

## Common Tasks

### Adding a New API Endpoint

1. Create route in `src/api/`
2. Add to router in `src/index.ts`
3. Add types if needed
4. Test with curl/Postman

### Modifying Database Schema

1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name description`
3. Update affected services

### Working with Slack Bot

- Main file: `src/api/slack.ts`
- Integration: `src/api/slack-integration.ts`
- Queue: `src/queue/slack-event.queue.ts`
- Worker: `src/workers/slack-event.worker.ts`

---

## Testing

```bash
npm run test           # Unit tests
npm run test:e2e       # E2E tests (requires running server)
npm run lint           # ESLint
npm run typecheck      # TypeScript check
```

---

## Git Conventions

### Commit Messages

```
[component] brief description

Examples:
- [slack] add socket mode configuration
- [orchestrator] fix session timeout bug
- [api] add user preferences endpoint
```

### Branch Naming

```
feature/description
fix/issue-description
refactor/component-name
```

---

## Important Links

- **Slack App Dashboard**: https://api.slack.com/apps/A0AC7PVN28Y
- **Production URL**: https://auth.nubabel.com
- **Research Docs**: `research/RESEARCH_COMPLETE.md`

---

## Agent-Specific Notes

### For Executor Agents

- Always run `npm run typecheck` after changes
- Check `.omc/AGENT_BOARD.md` before modifying any file

### For Explore Agents

- Read-only operations - no locks needed
- But still check board for context on ongoing work

### For Designer Agents

- Frontend code in `frontend/src/`
- Use existing Tailwind classes
- Check `frontend/FRONTEND_README.md`

---

---

## Autonomous QA/QC (YOLO MODE)

YOLO MODE 활성화 시 사용자 승인 없이 자율 QA 수행.

**Config**: `.omc/AUTONOMOUS_QA.md`

| Channel | Tool           | Command                                 |
| ------- | -------------- | --------------------------------------- |
| Browser | Playwright MCP | `skill_mcp(mcp_name="playwright", ...)` |
| Slack   | #it-test       | `@Nubabel help`                         |
| Deploy  | Railway CLI    | `railway status`, `railway logs`        |
| Local   | npm            | `npm run test`, `npm run typecheck`     |

**Auto-Trigger Keywords**: `yolo`, `autopilot`, `자율`, `알아서`

**Railway 배포 실패 시**: ralph 모드 자동 활성화 → 성공할 때까지 fix 반복

---

**Remember**: Check `.omc/AGENT_BOARD.md` before starting any work!
