# Nubabel Deployment Status

**Last Updated**: 2026-01-25 15:36 KST  
**System**: Nubabel Multi-Tenant AI Automation System  
**Domain**: `nubabel.com`

---

## Current Status: Waiting for Railway Auto-Deploy (Attempt #4)

### 🟡 Deployment In Progress (2026-01-25 15:38 KST)

**Root Cause Identified**: Prisma Client mismatch between builder and runtime stages

**Latest Fixes Pushed** (commit `8ac9318`):
1. ✅ Server binding to `0.0.0.0` (commit `0eeacfd`)
2. ✅ Added OpenSSL to runtime stage (commit `8b490c3`)
3. ✅ Added migration script `scripts/start.sh`
4. ✅ Notion Settings frontend routing (commit `05fa214`)
5. ✅ **NEW**: Generate Prisma Client in runtime stage (commit `8ac9318`)
6. ✅ **NEW**: Enhanced startup logging for diagnostics

**Critical Change**: Instead of copying `node_modules/.prisma` from builder, we now run `npx prisma generate` in the runtime stage after `npm ci --only=production`. This ensures Prisma Client matches the runtime environment.

**Railway Status**: Auto-deploying from commit `8ac9318`
**Expected**: Deployment should complete within 5-10 minutes

**What to Check in Railway Logs**:
```
🚀 Initializing Nubabel Platform...
📍 Node version: v20.x.x
📍 Environment: production
📍 Port: 3000
🚀 Starting Nubabel Platform...
📊 Running database migrations...
✅ Migrations completed successfully
🌐 Starting Node.js server...
🌐 Starting server on 0.0.0.0:3000...
✅ Server running on port 3000
✅ Ready to accept connections
```

**Then Test**:
```bash
curl https://<railway-url>/health
# Expected: {"status":"ok","timestamp":"2026-01-25T..."}
```

## Previous Status: Ready for Manual Deployment

### ✅ Completed

1. **Backend Code**
   - Authentication system (Express + Prisma + PostgreSQL)
   - Multi-tenant architecture with RLS
   - Google OAuth integration
   - JWT session management
   - Health check endpoints
   - Docker containerization

2. **Database Schema**
   - Prisma schema with 9 tables
   - PostgreSQL migration scripts
   - Row-Level Security policies
   - Seed data preparation

3. **Deployment Configuration**
   - Dockerfile (multi-stage build)
   - Docker Compose setup
   - Railway configuration files
   - Nginx reverse proxy config

4. **Documentation**
   - **RAILWAY_DEPLOYMENT.md**: Comprehensive step-by-step guide (English)
   - **QUICK_DEPLOY.md**: Quick deployment guide (Korean)
   - **DEPLOYMENT.md**: General deployment overview
   - **AUTH_SYSTEM.md**: Complete authentication system design

5. **GitHub Repository**
   - Repository: `https://github.com/seankim-business/corp-system`
   - All code pushed to `main` branch
   - Deployment docs committed

---

## Pending: Manual User Actions Required

The following steps **cannot be automated** and require manual execution:

### 🔴 Step 1: Railway Deployment (15 minutes)

**Why Manual**: Requires browser login with 2FA

**Action Required**:
1. Login to https://railway.app
2. Create new project from GitHub: `seankim-business/corp-system`
3. Add PostgreSQL database
4. Add Redis database
5. Configure environment variables (see RAILWAY_DEPLOYMENT.md Part 2)

**Guide**: `RAILWAY_DEPLOYMENT.md` - Part 1 & 2

---

### 🔴 Step 2: GoDaddy DNS Configuration (10 minutes)

**Why Manual**: Requires GoDaddy account access

**Action Required**:
1. Login to https://godaddy.com
2. Navigate to DNS management for `nubabel.com`
3. Add CNAME records:
   - `auth` → Railway CNAME target
   - `*` → Railway CNAME target (for multi-tenancy)

**Guide**: `RAILWAY_DEPLOYMENT.md` - Part 3

---

### 🔴 Step 3: Google OAuth Setup (10 minutes)

**Why Manual**: Requires Google Cloud Console access

**Action Required**:
1. Login to https://console.cloud.google.com
2. Create OAuth 2.0 Client ID
3. Configure authorized redirect URIs:
   - `https://auth.nubabel.com/auth/google/callback`
4. Update Railway environment variables with Client ID/Secret

**Guide**: `RAILWAY_DEPLOYMENT.md` - Part 4

---

### 🟡 Step 4: Verification (5 minutes)

**Action Required**:
Test endpoints after deployment:

```bash
# Health checks
curl https://auth.nubabel.com/health
curl https://auth.nubabel.com/health/db
curl https://auth.nubabel.com/health/redis

# OAuth flow
open https://auth.nubabel.com/auth/google
```

**Guide**: `RAILWAY_DEPLOYMENT.md` - Part 5

---

## Deployment Checklist

Use this checklist when deploying:

- [ ] Railway project created
- [ ] PostgreSQL database added to Railway
- [ ] Redis database added to Railway
- [ ] Environment variables configured (12 variables)
- [ ] Custom domain `auth.nubabel.com` added to Railway
- [ ] GoDaddy DNS records created (`auth` and `*`)
- [ ] DNS propagation verified (dig auth.nubabel.com)
- [ ] SSL certificate active on Railway
- [ ] Google OAuth consent screen configured
- [ ] Google OAuth Client ID created
- [ ] OAuth redirect URIs set correctly
- [ ] Railway env vars updated with Google credentials
- [ ] Health endpoints responding (all 3)
- [ ] OAuth login flow works
- [ ] First user successfully created in database
- [ ] Organization data seeded

---

## Quick Start Commands

### Verify GitHub Status
```bash
cd /Users/sean/Documents/Kyndof/tools/kyndof-corp-system
git status
git log --oneline -5
```

### Test After Deployment
```bash
# Health checks
curl https://auth.nubabel.com/health
curl https://auth.nubabel.com/health/db
curl https://auth.nubabel.com/health/redis

# Test OAuth
open https://auth.nubabel.com/auth/google

# Check user info (after login)
curl https://auth.nubabel.com/auth/me
```

### Check DNS Propagation
```bash
dig auth.nubabel.com
dig nubabel.nubabel.com
dig clientco.nubabel.com
```

---

## Environment Variables Reference

Required for Railway deployment:

| Variable | Value | Source |
|----------|-------|--------|
| `NODE_ENV` | `production` | Fixed |
| `PORT` | `3000` | Fixed |
| `GOOGLE_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxx` | Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://auth.nubabel.com/auth/google/callback` | Fixed |
| `JWT_SECRET` | Generate: `openssl rand -base64 32` | Generated |
| `JWT_EXPIRES_IN` | `7d` | Fixed |
| `JWT_REFRESH_EXPIRES_IN` | `30d` | Fixed |
| `BASE_URL` | `https://auth.nubabel.com` | Fixed |
| `BASE_DOMAIN` | `nubabel.com` | Fixed |
| `COOKIE_DOMAIN` | `.nubabel.com` | Fixed |
| `LOG_LEVEL` | `info` | Fixed |
| `DATABASE_URL` | Auto-injected by Railway | Railway PostgreSQL |
| `REDIS_URL` | Auto-injected by Railway | Railway Redis |

---

## Architecture Overview

```
User Browser
    ↓
https://auth.nubabel.com (Railway + Let's Encrypt SSL)
    ↓
Docker Container (Node.js + Express)
    ↓
    ├── PostgreSQL (Railway) - User data, organizations
    └── Redis (Railway) - Session cache
    ↓
Google OAuth API (authentication)
```

---

## Endpoints Available After Deployment

| Endpoint | Method | Purpose | Auth Required |
|----------|--------|---------|---------------|
| `/health` | GET | Server health check | No |
| `/health/db` | GET | Database connectivity | No |
| `/health/redis` | GET | Redis connectivity | No |
| `/auth/google` | GET | Initiate OAuth login | No |
| `/auth/google/callback` | GET | OAuth callback handler | No |
| `/auth/me` | GET | Current user info | Yes |
| `/auth/logout` | POST | End session | Yes |
| `/auth/switch-org` | POST | Switch organization | Yes |
| `/auth/refresh` | POST | Refresh JWT token | Yes |

---

## Cost Breakdown

**Monthly Costs**:
- Railway Hobby Plan: **$5/month**
  - 512MB RAM, 1 vCPU
  - PostgreSQL included
  - Redis included
  - SSL certificates free
  - 500 execution hours/month

- Domain (`nubabel.com`): **Already purchased**

- Google OAuth: **Free**

**Total**: ~$5/month

---

## Next Steps After Deployment

Once backend is deployed and verified, choose next phase:

### Option A: Frontend Implementation
Build React application with:
- Login page (Google OAuth button)
- User dashboard
- Organization switcher
- Protected routes

**Files**: `frontend/` directory ready  
**Guide**: `frontend/FRONTEND_README.md`

### Option B: MacOS Desktop App (Recommended)
Start core product - "human as training data":
- Electron + React setup
- Glassmorphism floating UI (Cluely-style)
- Screen recording integration
- Phase 0: Onboarding experience
- Context observation engine

**Files**: To be created in `desktop-app/`  
**Value**: This is the real product vision

---

## Troubleshooting Common Issues

### DNS Not Resolving
```bash
# Check propagation
dig auth.nubabel.com

# If no CNAME:
# 1. Verify GoDaddy records saved
# 2. Wait 10-30 minutes
# 3. Clear local DNS cache
sudo dscacheutil -flushcache
```

### SSL Certificate Not Issuing
1. Ensure DNS fully propagated
2. Railway → Remove domain → Re-add
3. Wait 5 minutes

### OAuth Redirect Mismatch
Verify exact match:
- Railway env: `GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback`
- Google Console: `https://auth.nubabel.com/auth/google/callback`
- No trailing slashes
- Must be HTTPS

### 500 Internal Server Error
Check Railway logs:
1. Deployments → Latest → View Logs
2. Look for Prisma migration errors
3. Verify all env vars set
4. Check DATABASE_URL injected

---

## Support

**Documentation**:
- Comprehensive: `RAILWAY_DEPLOYMENT.md`
- Quick Start: `QUICK_DEPLOY.md`
- Architecture: `AUTH_SYSTEM.md`
- API Reference: `API.md`

**External Resources**:
- Railway Docs: https://docs.railway.app
- Prisma Docs: https://www.prisma.io/docs
- Google OAuth: https://developers.google.com/identity/protocols/oauth2

**Contact**:
- Team: Nubabel Engineering
- Email: engineering@nubabel.com

---

## Deployment Timeline

**Estimated Total Time**: 40-50 minutes

| Phase | Time | Status |
|-------|------|--------|
| Railway Project Setup | 10 min | Pending |
| Environment Variables | 5 min | Pending |
| Custom Domain (Railway) | 2 min | Pending |
| GoDaddy DNS Config | 5 min | Pending |
| DNS Propagation Wait | 10-30 min | Pending |
| Google OAuth Setup | 10 min | Pending |
| Railway Env Update | 2 min | Pending |
| Verification & Testing | 5 min | Pending |

---

**Ready to deploy!** Follow `RAILWAY_DEPLOYMENT.md` for step-by-step instructions.
