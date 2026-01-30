# Railway Deployment Guide - Nubabel Authentication System

**Domain**: `nubabel.com`  
**Main Auth Endpoint**: `auth.nubabel.com`  
**Tenant Subdomains**: `*.nubabel.com`

---

## Prerequisites

- GitHub account with `seankim-business/corp-system` repository access
- Railway account (sign up at https://railway.app)
- GoDaddy account with `nubabel.com` domain access
- Google Cloud Platform account for OAuth setup

---

## Part 1: Railway Project Setup (10 minutes)

### Step 1.1: Create Railway Project

1. Navigate to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub account
4. Select repository: `seankim-business/corp-system`
5. Click **"Deploy Now"**

Railway will automatically:
- Detect the `Dockerfile`
- Start building the Docker image
- Deploy the container

### Step 1.2: Add PostgreSQL Database

1. In your Railway project dashboard, click **"New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. PostgreSQL will automatically provision
4. Railway automatically sets `DATABASE_URL` environment variable

**Wait for PostgreSQL to show "Running" status** (~30 seconds)

### Step 1.3: Add Redis

1. Click **"New"** again
2. Select **"Database"** → **"Add Redis"**
3. Redis will automatically provision
4. Railway automatically sets `REDIS_URL` environment variable

**Wait for Redis to show "Running" status** (~30 seconds)

---

## Part 2: Environment Variables Configuration (5 minutes)

### Step 2.1: Generate JWT Secret

On your Mac, open Terminal:

```bash
openssl rand -base64 32
```

**Copy the output** (example: `T8xK9fG2mP5nQ3rJ7vW1cZ4dE6hL0sA8bN5mK2gF9tU=`)

### Step 2.2: Set Environment Variables

1. Click on your **app service** (not PostgreSQL or Redis)
2. Go to **"Variables"** tab
3. Click **"RAW Editor"**
4. Paste the following configuration:

```env
NODE_ENV=production
PORT=3000

# Google OAuth - Temporary values, update in Part 4
GOOGLE_CLIENT_ID=PLACEHOLDER_UPDATE_AFTER_OAUTH_SETUP
GOOGLE_CLIENT_SECRET=PLACEHOLDER_UPDATE_AFTER_OAUTH_SETUP
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback

# JWT - Paste your generated secret here
JWT_SECRET=YOUR_GENERATED_SECRET_FROM_STEP_2.1
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Application - Using custom domain
BASE_URL=https://auth.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com

# Logging
LOG_LEVEL=info
```

5. **Replace `YOUR_GENERATED_SECRET_FROM_STEP_2.1`** with your actual JWT secret
6. Click **"Save"**

Railway will automatically redeploy with new environment variables.

---

## Part 3: Custom Domain Setup (15 minutes)

### Step 3.1: Get Railway CNAME Target

1. In Railway, click on your **app service**
2. Go to **"Settings"** tab → **"Domains"** section
3. Click **"Custom Domain"**
4. Enter: `auth.nubabel.com`
5. Click **"Add Domain"**

Railway will display a **CNAME target** (example: `your-app-name.up.railway.app`)

**Copy this CNAME target** - you'll need it for DNS configuration.

### Step 3.2: Configure DNS on GoDaddy

1. Login to https://godaddy.com
2. Go to **"My Products"** → Find `nubabel.com` → Click **"DNS"**
3. Click **"Add New Record"**

**Record 1: Auth Subdomain**
```
Type: CNAME
Name: auth
Value: <YOUR_RAILWAY_CNAME_TARGET>
TTL: 600 seconds (10 minutes)
```

4. Click **"Add New Record"** again

**Record 2: Wildcard Subdomain (for multi-tenancy)**
```
Type: CNAME
Name: *
Value: <YOUR_RAILWAY_CNAME_TARGET>
TTL: 600 seconds (10 minutes)
```

5. Click **"Save"** for both records

### Step 3.3: Wait for DNS Propagation

DNS propagation typically takes **5-30 minutes**. 

Check status:
```bash
# On your Mac Terminal
dig auth.nubabel.com

# Look for CNAME record pointing to Railway
```

### Step 3.4: Verify SSL Certificate

1. Return to Railway → **Settings** → **Domains**
2. Wait for SSL certificate to provision (~2-5 minutes after DNS propagates)
3. Status should show: **"SSL: Active"** with green checkmark ✅

---

## Part 4: Google OAuth Configuration (10 minutes)

### Step 4.1: Access Google Cloud Console

1. Navigate to https://console.cloud.google.com/apis/credentials
2. Select your project (or create a new one)

### Step 4.2: Configure OAuth Consent Screen (First-time only)

1. Click **"OAuth consent screen"** in left sidebar
2. Select **User Type**:
   - **Internal**: If using Google Workspace for `nubabel.com` domain only
   - **External**: If allowing any Google account
3. Fill in required fields:
   - **App name**: `Nubabel Authentication System`
   - **User support email**: Your email
   - **Developer contact email**: Your email
4. Click **"Save and Continue"**
5. Skip "Scopes" (click **"Save and Continue"**)
6. Skip "Test users" (click **"Save and Continue"**)

### Step 4.3: Create OAuth 2.0 Client ID

1. Go back to **"Credentials"** tab
2. Click **"Create Credentials"** → **"OAuth 2.0 Client ID"**
3. Configure:

```
Application type: Web application
Name: Nubabel Production Auth

Authorized JavaScript origins:
  https://auth.nubabel.com

Authorized redirect URIs:
  https://auth.nubabel.com/auth/google/callback
```

4. Click **"Create"**

### Step 4.4: Copy OAuth Credentials

A modal will appear with:
- **Client ID**: Something like `123456789-abc...xyz.apps.googleusercontent.com`
- **Client Secret**: Something like `GOCSPX-...`

**Copy both values**

### Step 4.5: Update Railway Environment Variables

1. Return to Railway → Your app service → **"Variables"** tab
2. Find and update these two variables:

```env
GOOGLE_CLIENT_ID=<YOUR_ACTUAL_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<YOUR_ACTUAL_CLIENT_SECRET>
```

3. Click **"Save"**

Railway will redeploy automatically (~2 minutes).

---

## Part 5: Verification & Testing (5 minutes)

### Step 5.1: Check Deployment Status

1. Railway → **"Deployments"** tab
2. Wait for latest deployment to show **"Success"** status
3. Click on deployment → **"View Logs"**
4. Verify no errors in startup logs

### Step 5.2: Test Health Endpoints

Open Terminal on your Mac:

```bash
# Basic health check
curl https://auth.nubabel.com/health
# Expected: {"status":"ok","timestamp":"2026-01-25T..."}

# Database health check
curl https://auth.nubabel.com/health/db
# Expected: {"status":"ok",...}

# Redis health check
curl https://auth.nubabel.com/health/redis
# Expected: {"status":"ok",...}
```

**If all return `{"status":"ok"...}` → Backend is healthy!** ✅

### Step 5.3: Test Google OAuth Flow

**Option A: Browser Test**
1. Open browser
2. Navigate to: `https://auth.nubabel.com/auth/google`
3. Should redirect to Google login page
4. Login with your Google account
5. Grant permissions
6. Should redirect back to `auth.nubabel.com` with success

**Option B: Terminal Test**
```bash
curl -I https://auth.nubabel.com/auth/google
# Should return: HTTP/1.1 302 Found
# Location: https://accounts.google.com/o/oauth2/...
```

### Step 5.4: Verify Database Tables

1. Railway → PostgreSQL service → **"Data"** tab
2. Check that tables exist:
   - `organizations`
   - `users`
   - `memberships`
   - `workspace_domains`
   - `sessions`
   - `agents`
   - `teams`
   - `projects`

**If tables exist → Database migrations ran successfully!** ✅

---

## Part 6: Initialize Organization Data (3 minutes)

### Step 6.1: Seed Initial Organization (if needed)

If the `organizations` table is empty, you can seed it using Railway's PostgreSQL console:

1. Railway → PostgreSQL service → **"Query"** tab
2. Run this SQL:

```sql
-- Create Nubabel organization
INSERT INTO organizations (id, name, slug, domain, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Nubabel',
  'nubabel',
  'nubabel.com',
  NOW(),
  NOW()
)
RETURNING *;

-- Verify creation
SELECT * FROM organizations WHERE domain = 'nubabel.com';
```

### Step 6.2: Test First Login

1. Navigate to: `https://auth.nubabel.com/auth/google`
2. Login with a Google account using `@nubabel.com` email (if you have Workspace)
   - **OR** use any Google account if OAuth is set to "External"
3. After successful login, verify user creation:

```sql
-- In Railway PostgreSQL Query tab
SELECT * FROM users ORDER BY created_at DESC LIMIT 1;
SELECT * FROM memberships ORDER BY created_at DESC LIMIT 1;
```

You should see your user and membership records!

---

## Part 7: Multi-Tenant Testing (Optional)

### Test Subdomain Routing

1. Create a second organization:

```sql
INSERT INTO organizations (id, name, slug, domain, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'ClientCo',
  'clientco',
  'clientco.com',
  NOW(),
  NOW()
);
```

2. Test subdomain access:

```bash
# Nubabel tenant
curl https://nubabel.nubabel.com/auth/me

# ClientCo tenant  
curl https://clientco.nubabel.com/auth/me
```

Each should return organization context based on subdomain!

---

## Deployment Complete! 🎉

### What You Now Have

✅ **Backend API**: Running at `https://auth.nubabel.com`  
✅ **Database**: PostgreSQL with all tables and RLS policies  
✅ **Cache**: Redis for session management  
✅ **SSL**: Auto-renewing Let's Encrypt certificates  
✅ **OAuth**: Google Workspace authentication  
✅ **Multi-tenancy**: Subdomain-based routing (`*.nubabel.com`)

### Available Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Server health check |
| `GET /health/db` | Database connectivity |
| `GET /health/redis` | Redis connectivity |
| `GET /auth/google` | Initiate OAuth login |
| `GET /auth/google/callback` | OAuth callback handler |
| `GET /auth/me` | Current user info (requires auth) |
| `POST /auth/logout` | End session |
| `POST /auth/switch-org` | Switch organization |
| `POST /auth/refresh` | Refresh JWT token |

---

## Next Steps

### Option 1: Build Frontend (Recommended Next)
Create React application to provide UI for:
- Login page with Google OAuth button
- User dashboard
- Organization switcher
- Protected routes

**Guide**: See `frontend/FRONTEND_README.md`

### Option 2: Build MacOS Desktop App
Start the core "human as training data" experience:
- Glassmorphism floating UI
- Screen recording & context observation
- Passive → Proactive AI assistant
- Phase 0: Onboarding flow

**Guide**: To be created in `desktop-app/`

### Option 3: Add Monitoring
- **Uptime monitoring**: UptimeRobot (free)
- **Error tracking**: Sentry
- **Performance**: Railway built-in metrics

---

## Troubleshooting

### Issue: DNS Not Resolving

```bash
# Check DNS propagation
dig auth.nubabel.com

# If no CNAME record appears, wait longer or:
# 1. Verify GoDaddy DNS records are saved
# 2. Check TTL hasn't expired
# 3. Try clearing DNS cache: sudo dscacheutil -flushcache
```

### Issue: SSL Certificate Not Provisioning

1. Ensure DNS is fully propagated (check with `dig`)
2. Railway → Settings → Domains → Remove and re-add domain
3. Wait 5 minutes and check again

### Issue: OAuth Redirect Mismatch

**Error**: `redirect_uri_mismatch`

**Solution**: Verify in Google Cloud Console:
1. Authorized redirect URIs **exactly** match: `https://auth.nubabel.com/auth/google/callback`
2. No trailing slashes
3. Must be `https://` (not `http://`)

### Issue: Database Migration Failures

Check Railway deployment logs:
```
Railway → Deployments → Latest → View Logs
```

Look for Prisma migration errors. If needed, manually run:
```bash
# In Railway PostgreSQL Query tab
-- Check if tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```

### Issue: 500 Internal Server Error

1. Check Railway logs for errors
2. Verify all environment variables are set correctly
3. Check DATABASE_URL and REDIS_URL are automatically injected
4. Ensure JWT_SECRET is set

---

## Cost Breakdown

**Railway Pricing**:
- **Hobby Plan**: $5/month
  - 512MB RAM, 1 vCPU
  - PostgreSQL included
  - Redis included
  - SSL certificates free
  - 500 execution hours/month

**Free Trial**: Railway provides $5 credit initially

**GoDaddy Domain**: 
- `nubabel.com` - Already purchased by you

**Google OAuth**: Free

**Total Monthly Cost**: ~$5/month

---

## Support Resources

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Prisma Docs**: https://www.prisma.io/docs
- **Google OAuth Guide**: https://developers.google.com/identity/protocols/oauth2

---

## Security Checklist

Before going to production:

- [ ] Change all placeholder environment variables
- [ ] Enable Railway's built-in DDoS protection
- [ ] Set up automated database backups (Railway Pro plan)
- [ ] Configure CORS properly for your frontend domain
- [ ] Enable rate limiting on auth endpoints
- [ ] Set up monitoring and alerting
- [ ] Review and audit PostgreSQL RLS policies
- [ ] Implement session rotation strategy
- [ ] Set up log retention policies

---

**Deployment Time**: ~40 minutes  
**Difficulty**: Medium  
**Last Updated**: 2026-01-25
