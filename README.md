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

**Notion MCP Integration** (NEW - 2026-01-25 ✅ Complete)

- ✅ Notion API connection management
- ✅ 4 MCP tools (getTasks, createTask, updateTask, deleteTask)
- ✅ Template variable interpolation ({{input.field}})
- ✅ Workflow execution with Notion integration
- ✅ Database browser and connection testing
- ✅ NotionSettingsPage with routing and navigation

### 🚧 In Progress (v0.2 - Q1 2026)

**Frontend Polish**

- [ ] Toast notifications for better UX
- [ ] CreateWorkflowModal component
- [ ] Execution detail page

**Deployment Verification**

- [ ] Railway deployment health check
- [ ] End-to-end Notion integration testing

**Slack Bot** (Phase 2 Week 9-12)

- [ ] Slack App setup
- [ ] Slash commands (/nubabel)
- [ ] Natural language parsing
- [ ] Workflow triggering from Slack

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
│   │   └── notion.ts      # ✅ Notion MCP settings
│   ├── mcp-servers/       # ✅ MCP integrations
│   │   └── notion/        # ✅ Notion MCP tools
│   ├── middleware/        # Tenant resolver, auth
│   ├── db/                # Prisma client
│   └── index.ts           # Server entry point
│
├── prisma/                 # Database
│   ├── schema.prisma      # Data model (11 tables + NotionConnection)
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

| Component          | Status      | Progress |
| ------------------ | ----------- | -------- |
| Authentication     | ✅ Complete | 100%     |
| Database Schema    | ✅ Complete | 100%     |
| Deployment Config  | ✅ Complete | 100%     |
| Web Dashboard      | ✅ Complete | 100%     |
| Workflow Engine    | ✅ Complete | 100%     |
| Notion MCP         | ✅ Complete | 100%     |
| Railway Deployment | ✅ Complete | 100%     |
| Slack Bot          | 📋 Planned  | 0%       |
| AI Agents          | 📋 Planned  | 0%       |

**Overall Progress**: **~75%** (Phase 2 Week 1-8 완료, Production 배포 완료)

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

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [AUTH_SYSTEM.md](AUTH_SYSTEM.md) - Authentication design
- **[OhMyOpenCode Integration](docs/core/06-ohmyopencode-integration.md)** ⭐ NEW - Agent orchestration
- **[Slack + Orchestrator](docs/core/07-slack-orchestrator-implementation.md)** ⭐ NEW - Implementation spec
- [API.md](API.md) - API reference (coming soon)

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
