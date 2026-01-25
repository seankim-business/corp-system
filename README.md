# Nubabel

> **AI-Powered Workflow Automation Platform for Teams**

Multi-tenant B2B SaaS framework that enables companies to automate their workflows with AI agents.

[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-Alpha-orange.svg)](PROJECT_IDENTITY.md)
[![Domain](https://img.shields.io/badge/domain-nubabel.com-green.svg)](https://nubabel.com)

---

## 📌 What is Nubabel?

**Nubabel** is a workflow automation platform where companies can:

- **Automate repetitive tasks** with AI agents
- **Integrate existing tools** (Notion, Slack, Google Drive)
- **Build custom workflows** without code
- **Maintain data isolation** in a multi-tenant architecture

### 🎯 Vision

```
Start: Internal tool for Kyndof
  ↓
Evolve: Framework for any company
  ↓
Future: B2B SaaS with AI-powered automation
```

**Read more**: [PROJECT_IDENTITY.md](PROJECT_IDENTITY.md)

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│           Nubabel Core Platform                  │
│  ┌────────────────────────────────────────────┐  │
│  │ Multi-Tenant Authentication                │  │
│  │ - Google Workspace OAuth                   │  │
│  │ - Organization Isolation                   │  │
│  │ - Row-Level Security                       │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ Workflow Engine (Coming Soon)              │  │
│  │ - Task Orchestration                       │  │
│  │ - MCP Integration                          │  │
│  │ - Agent System                             │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ Web Dashboard (In Progress)                │  │
│  │ - User Management                          │  │
│  │ - Workflow Builder                         │  │
│  │ - Execution Logs                           │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
                      ▲
                      │ Plugin System
                      ▼
┌──────────────────────────────────────────────────┐
│        Company-Specific Extensions               │
│  ┌─────────────────┐    ┌──────────────────┐    │
│  │ Kyndof          │    │ Your Company     │    │
│  │ - Production    │    │ - Custom Workflow│    │
│  │ - Quality AI    │    │ - Integration    │    │
│  └─────────────────┘    └──────────────────┘    │
└──────────────────────────────────────────────────┘
```

---

## ✨ Features

### ✅ Implemented (v0.1 - Alpha)

**Multi-Tenant Authentication System**

- Google Workspace SSO (multi-domain support)
- Organization-based data isolation
- JWT session management
- Subdomain routing (`{tenant}.nubabel.com`)
- PostgreSQL with Row-Level Security (RLS)
- Redis for session caching

**Infrastructure**

- Docker containerization
- Railway deployment ready
- Automated migrations (Prisma)
- Health check endpoints
- Multi-stage Docker build

### ✅ Implemented (v0.2 - Phase 2 Week 1-8)

**Web Dashboard**

- ✅ User authentication UI (LoginPage with Google OAuth)
- ✅ Dashboard layout (Header + Sidebar + Protected routes)
- ✅ Organization switcher
- ✅ Settings page (Profile, Organization, Security)
- ✅ Workflows page (list, execute, view executions)
- ✅ Executions page (history with filters)

**Workflow System**

- ✅ Workflow CRUD (9 REST API endpoints)
- ✅ Workflow execution engine with background processing
- ✅ Execution history tracking (pending → running → success/failed)
- ✅ JSON input for workflows
- ✅ Real-time status updates

**MCP Integration System** (NEW - 2026-01-25 ✅ Complete)

- ✅ Generic MCP connection management (supports ANY tool: Linear, Notion, Jira, Asana, etc.)
- ✅ `MCPConnection` table for multi-provider support
- ✅ Notion MCP example (getTasks, createTask, updateTask, deleteTask)
- ✅ Template variable interpolation ({{input.field}})
- ✅ Workflow execution with MCP integration
- ✅ Database browser and connection testing

**Slack Bot + Orchestrator** (NEW - 2026-01-26 ✅ Complete)

- ✅ Slack Bot with Socket Mode (@mention handling)
- ✅ OhMyOpenCode `delegate_task` integration
- ✅ 6 orchestrator modules (request analyzer, category/skill selector, session manager)
- ✅ Redis + PostgreSQL hybrid session storage
- ✅ `mcp-integration` skill for dynamic MCP tool loading
- ✅ Dual-purpose Session model (JWT auth + orchestrator conversations)

### ✅ Completed (v0.2 - Phase 2 Week 9-12 Research)

**Architecture Research & Documentation** (NEW - 2026-01-26 ✅ Complete)

- ✅ 8 parallel research agents executed (~5 minutes, 65+ production codebases analyzed)
- ✅ 15 comprehensive documents created (~10,000+ lines)
- ✅ Technology stack finalized (BullMQ, Custom Router, MCP SDK, Redis+PostgreSQL)
- ✅ 9 technical deep-dive guides:
  - Orchestrator Architecture
  - Category System (cost analysis, optimization)
  - Skill System (mcp-integration, playwright, git-master, frontend-ui-ux)
  - Slack Integration Patterns (multi-tenant, BullMQ, Block Kit)
  - MCP SDK Production Patterns (multi-tenant, OAuth, circuit breaker)
  - LangGraph vs Custom Router (decision framework, benchmarks)
  - Redis Production Config (persistence, TTL, memory management)
  - AI Error Handling (retry, circuit breaker, cost tracking)
  - Multi-Tenant Security (RLS, RBAC, encryption, compliance)

**See**: `research/RESEARCH_COMPLETE.md` for full findings summary

### 🚧 In Progress (v0.2 - Q1 2026)

**Implementation (Week 9-12)**

- [ ] BullMQ + Redis setup (job queue infrastructure)
- [ ] Slack Bot event handlers (app_mention, message)
- [ ] Custom Router implementation (category + skill selection)
- [ ] Session Manager (Redis hot + PostgreSQL cold)
- [ ] MCP Registry enhancements (multi-provider support)
- [ ] Bull Board UI monitoring dashboard

**Deployment Verification**

- [ ] Railway deployment health check
- [ ] Run database migration (MCPConnection + Session enhancements)
- [ ] Slack Bot production testing

### 📋 Planned (v0.3+ - Q2 2026)

**AI Agent System**

- Task orchestration
- Multi-agent collaboration
- Background execution
- Error handling & retry logic

**Workflow Builder**

- Visual workflow editor
- No-code automation
- Template marketplace
- Execution analytics

**Advanced Features** (Long-term)

- "Human as Training Data" learning system
- Self-service automation builder
- RABSIC permission engine
- Physical world integration (sensors, IoT)

---

## 🚀 Quick Start

### Prerequisites

```bash
Node.js 20+
PostgreSQL 15+
Redis 7+
Docker & Docker Compose (optional)
```

### Installation

```bash
# Clone repository
git clone https://github.com/seankim-business/corp-system.git
cd corp-system

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

### Enable Slack Bot (Optional)

```bash
# 1. Create Slack App at https://api.slack.com/apps
# Required scopes: app_mentions:read, chat:write, users:read
# Enable Socket Mode and get App Token

# 2. Add to .env
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_APP_TOKEN=xapp-your-app-token
SLACK_SIGNING_SECRET=your-signing-secret

# 3. Restart server
npm run dev
# Expected: ✅ Slack Bot connected (Socket Mode)

# 4. Test in Slack
# @your-bot-name help
```

### Deploy to Railway

Follow our comprehensive deployment guide:

- **[RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md)** - Step-by-step (English)
- **[QUICK_DEPLOY.md](QUICK_DEPLOY.md)** - Quick guide (Korean)

**Estimated time**: 40-50 minutes

---

## 📂 Project Structure

```
nubabel/
├── src/                    # Backend (Express + TypeScript)
│   ├── auth/              # Authentication system
│   ├── api/               # REST API routes
│   │   ├── workflows.ts   # ✅ Workflow CRUD + execution
│   │   ├── notion.ts      # ✅ Notion MCP settings
│   │   └── slack.ts       # ✅ Slack Bot (Socket Mode)
│   ├── orchestrator/      # ✅ NEW: AI orchestration
│   │   ├── index.ts       # Main orchestration logic
│   │   ├── request-analyzer.ts
│   │   ├── category-selector.ts
│   │   ├── skill-selector.ts
│   │   └── session-manager.ts
│   ├── services/          # ✅ Business logic
│   │   ├── slack-service.ts
│   │   └── mcp-registry.ts
│   ├── mcp-servers/       # ✅ MCP integrations
│   │   └── notion/        # ✅ Notion MCP tools
│   ├── middleware/        # Tenant resolver, auth
│   ├── db/                # Prisma client
│   └── index.ts           # Server entry point
│
├── prisma/                 # Database
│   ├── schema.prisma      # Data model (12 tables: +MCPConnection, enhanced Session)
│   └── migrations/        # Migration history
│
├── frontend/               # React Dashboard ✅ Implemented
│   ├── src/
│   │   ├── pages/         # ✅ All main pages
│   │   ├── components/    # ✅ Reusable components
│   │   └── stores/        # ✅ Zustand stores
│   └── package.json
│
├── docs/                   # Documentation
│   ├── planning/          # Phase specifications
│   ├── PROJECT_IDENTITY.md   # ⭐ Start here
│   ├── ARCHITECTURE.md       # Technical design
│   └── AUTH_SYSTEM.md        # Authentication details
│
└── docker-compose.yml      # Local development setup
```

---

## 🎯 Current Status

| Component                | Status      | Progress |
| ------------------------ | ----------- | -------- |
| Authentication           | ✅ Complete | 100%     |
| Database Schema          | ✅ Complete | 100%     |
| Deployment Config        | ✅ Complete | 100%     |
| Web Dashboard            | ✅ Complete | 100%     |
| Workflow Engine          | ✅ Complete | 100%     |
| MCP System               | ✅ Complete | 100%     |
| Slack Bot (Stub)         | ✅ Complete | 100%     |
| Orchestrator (Stub)      | ✅ Complete | 100%     |
| **Research Phase**       | ✅ Complete | 100%     |
| Implementation (Wk 9-12) | 🚧 Next     | 0%       |
| Railway Deployment       | 🚧 Pending  | 90%      |
| AI Multi-Agent           | 📋 Planned  | 0%       |

**Overall Progress**: **~88%** (Phase 2 Week 1-8 완료, Research 완료, Week 9-12 Implementation 시작 준비)

**🌐 Production URL**: https://auth.nubabel.com

---

## 🗺️ Roadmap

### Phase 1: Foundation (Complete - Jan 2026)

- [x] Multi-tenant authentication
- [x] Database architecture
- [x] Deployment configuration
- [ ] Production deployment (manual step pending)

### Phase 2: Visible Features (Q1 2026 - 3 months)

- [x] **Week 1-2**: Web Dashboard (Login, Dashboard, Settings) ✅
- [x] **Week 3-4**: First automation (Manual workflow execution) ✅
- [x] **Week 5-8**: Notion integration (Read/write tasks) ✅ **DEPLOYED 2026-01-25**
- [ ] **Week 9-12**: Slack bot (Natural language triggers) ⏳

**Live URL**: https://auth.nubabel.com

### Phase 3: Intelligence (Q2 2026 - 3 months)

- [ ] Simple AI agent (single task executor)
- [ ] Background job system
- [ ] Execution logs & monitoring
- [ ] Success/failure handling

### Phase 4: Framework (Q3-Q4 2026)

- [ ] Multi-agent orchestration
- [ ] Self-service automation builder
- [ ] Template marketplace
- [ ] First external customer

### Phase 5: Learning (2027+)

- [ ] "Human as Training Data" system
- [ ] Predictive automation
- [ ] Continuous improvement loop

**Details**: See [PROJECT_IDENTITY.md](PROJECT_IDENTITY.md) for full roadmap

---

## 🔧 Technology Stack

### Core

- **Runtime**: Node.js 20 + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 15 (with RLS)
- **Cache**: Redis 7
- **ORM**: Prisma

### Authentication

- **OAuth**: Google Workspace
- **Tokens**: JWT (httpOnly cookies)
- **Security**: bcrypt, helmet, CORS

### Deployment

- **Platform**: Railway
- **Container**: Docker (multi-stage)
- **Proxy**: Nginx (subdomain routing)
- **SSL**: Let's Encrypt (automatic)

### Frontend (Coming Soon)

- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Data**: TanStack Query

### Future

- **AI Agents**: LangChain, LangGraph
- **MCP**: Model Context Protocol
- **Workflow**: n8n (embedded)
- **ML**: Fine-tuned models for learning

---

## 📖 Documentation

### Getting Started

- [PROJECT_IDENTITY.md](PROJECT_IDENTITY.md) - **Start here** - Project vision & strategy
- [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) - Deployment guide
- [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md) - Current deployment status

### Technical

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture (UPDATED with BullMQ, MCP, Session patterns)
- [AUTH_SYSTEM.md](AUTH_SYSTEM.md) - Authentication design
- **[Phase 2 Technical Spec](docs/PHASE2_TECHNICAL_SPEC.md)** ⭐ Week 9-12 - Slack Bot + Orchestrator
- **[OhMyOpenCode Integration](docs/core/06-ohmyopencode-integration.md)** ⭐ Agent orchestration system
- **[Slack + Orchestrator](docs/core/07-slack-orchestrator-implementation.md)** ⭐ Implementation details

### Research Documentation (NEW - 2026-01-26)

- **[Research Complete Summary](research/RESEARCH_COMPLETE.md)** ⭐⭐⭐ MUST READ - Executive summary of all findings
- **[Research Structure](research/README.md)** - Research methodology and organization
- **Architecture Analysis**:
  - [Current Architecture Analysis](research/architecture/00-current-architecture-analysis.md) - Complete codebase analysis
  - [Synthesis & Decisions](research/architecture/01-synthesis-and-decisions.md) - Final technology stack decisions
- **Technical Deep-Dive Guides** (9 documents):
  - [01 - Orchestrator Architecture](research/technical-deep-dive/01-orchestrator-architecture.md)
  - [02 - Category System](research/technical-deep-dive/02-category-system-deep-dive.md) - Cost analysis & optimization
  - [03 - Skill System](research/technical-deep-dive/03-skill-system-architecture.md) - 4 built-in skills
  - [04 - Slack Integration](research/technical-deep-dive/04-slack-integration-patterns.md) - Multi-tenant patterns
  - [05 - MCP SDK Production](research/technical-deep-dive/05-mcp-sdk-production-patterns.md) - Multi-tenant MCP servers
  - [06 - LangGraph vs Custom Router](research/technical-deep-dive/06-langgraph-vs-custom-router.md) - Decision framework
  - [07 - Redis Production Config](research/technical-deep-dive/07-redis-production-config.md) - Production settings
  - [08 - AI Error Handling](research/technical-deep-dive/08-ai-error-handling-guide.md) - Retry, circuit breaker, cost
  - [09 - Multi-Tenant Security](research/technical-deep-dive/09-multi-tenant-security-checklist.md) - RLS, RBAC, compliance

### Development

- [frontend/FRONTEND_README.md](frontend/FRONTEND_README.md) - Frontend setup guide
- Extension development guide (TBD)
- Tenant separation guide (TBD)

---

## 🤝 Contributing

This is currently a private project for Kyndof internal use.

**Roadmap**:

1. **Phase 1-2**: Internal only (Kyndof team)
2. **Phase 3**: Selected beta partners
3. **Phase 4+**: Open for external contributors

---

## 🔐 Security

### Multi-Tenant Isolation

Every request is automatically filtered by organization:

```sql
-- Row-Level Security (RLS)
CREATE POLICY tenant_isolation ON users
  USING (organization_id = current_setting('app.tenant_id')::uuid);
```

### Authentication

- Google Workspace OAuth 2.0
- JWT tokens with secure httpOnly cookies
- Domain-based organization mapping
- Session expiration & refresh

### Data Protection

- All passwords hashed with bcrypt
- Environment variables for secrets
- HTTPS-only in production
- CORS protection

**Security issues**: Please contact security@nubabel.com

---

## 📊 Use Cases

### For Kyndof (Internal)

- **Production Automation**: Track manufacturing orders
- **Quality Control**: AI-powered inspection
- **Workflow Optimization**: Learn from human actions

### For Future Customers

- **Operations Teams**: Automate repetitive tasks
- **Customer Success**: Streamline onboarding
- **Finance**: Invoice processing automation
- **HR**: Employee onboarding workflows

---

## 💡 Design Principles

### 1. **Framework-First**

Build general solutions, not one-off features. Every feature should be extensible.

### 2. **Multi-Tenant by Default**

Always assume multiple organizations. Data isolation is never optional.

### 3. **Progressive Enhancement**

Start simple, add complexity only when needed. Visible features first, then intelligence.

### 4. **Plugin Architecture**

Company-specific features live in extensions, not core platform.

### 5. **Data Sovereignty**

Each organization owns its data. No cross-tenant data sharing.

---

## 📝 FAQ

### Q: What's the difference between Nubabel and Kyndof?

**A**: Kyndof is the company (fashion tech). Nubabel is the product (automation platform).

### Q: Is this open source?

**A**: Not yet. Currently private. Future plans TBD.

### Q: Can I use this for my company?

**A**: Eventually, yes. We're building it to be multi-tenant from day one, but focusing on internal use first (Q1-Q2 2026). External customers in Q3 2026+.

### Q: Why multi-tenant if it's internal only?

**A**: Future-proofing. Easier to design for multiple tenants from the start than to retrofit later.

### Q: What about "Human as Training Data"?

**A**: That's the long-term vision (2027+). Right now, we're building the foundation: auth → dashboard → workflows → agents → learning.

### Q: Where are the AI agents?

**A**: Coming in Phase 3 (Q2 2026). First, we need a working dashboard and workflow engine.

---

## 📞 Contact

- **Team**: Nubabel Engineering (by Kyndof)
- **Email**: engineering@nubabel.com
- **Domain**: [nubabel.com](https://nubabel.com) (production)
- **Demo**: [auth.nubabel.com](https://auth.nubabel.com) (pending deployment)

---

## 📜 License

Proprietary - © 2026 Kyndof Corporation

All rights reserved. Unauthorized copying, distribution, or use is prohibited.

---

## 🙏 Acknowledgments

Built with:

- [Prisma](https://www.prisma.io/) - Database ORM
- [Express.js](https://expressjs.com/) - Web framework
- [Railway](https://railway.app/) - Deployment platform
- [Claude](https://anthropic.com/) - AI assistance

**Inspired by**: Notion (multi-tenant), Slack (extensibility), Zapier (automation)

---

<div align="center">

**Built with ❤️ by the Kyndof team**

[Website](https://nubabel.com) • [Documentation](docs/) • [Deployment Guide](RAILWAY_DEPLOYMENT.md)

</div>
