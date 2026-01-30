# 🚀 Deploy Kyndof Corp System to Railway - Step by Step

## Current Status: Ready for Deployment ✅

All code is complete and committed to git. Follow these steps to deploy.

---

## Option 1: Deploy via Railway Web (Recommended - 10 minutes)

### Step 1: Push to GitHub

```bash
# If not already pushed to GitHub:
cd /Users/sean/Documents/Kyndof/tools/kyndof-corp-system
git remote add origin https://github.com/YOUR_USERNAME/kyndof-corp-system.git
git push -u origin main
```

### Step 2: Create Railway Project

1. Go to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub
4. Select repository: `YOUR_USERNAME/kyndof-corp-system`
5. Railway will auto-detect `Dockerfile` and start building

### Step 3: Add PostgreSQL Database

1. In Railway project dashboard
2. Click **"New"** → **"Database"** → **"PostgreSQL"**
3. Railway automatically sets `DATABASE_URL` variable
4. Wait for PostgreSQL to be ready (green status)

### Step 4: Add Redis Cache

1. Click **"New"** → **"Database"** → **"Redis"**
2. Railway automatically sets `REDIS_URL` variable
3. Wait for Redis to be ready (green status)

### Step 5: Configure Environment Variables

1. Click on your **app service** (not database)
2. Go to **"Variables"** tab
3. Add these variables:

```env
NODE_ENV=production
PORT=3000

# Google OAuth (REQUIRED - get from https://console.cloud.google.com)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret-here
GOOGLE_REDIRECT_URI=https://YOUR-APP.up.railway.app/auth/google/callback

# JWT (REQUIRED - generate with: openssl rand -base64 32)
JWT_SECRET=PASTE_GENERATED_SECRET_HERE
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Application (will update after getting Railway URL)
BASE_URL=https://YOUR-APP.up.railway.app
BASE_DOMAIN=YOUR-APP.up.railway.app
COOKIE_DOMAIN=.YOUR-APP.up.railway.app

# Logging
LOG_LEVEL=info
```

**Important**: 
- `DATABASE_URL` and `REDIS_URL` are auto-set by Railway
- Replace `YOUR-APP` with your actual Railway domain (found in Settings → Domains)

### Step 6: Generate JWT Secret

On your local machine:
```bash
openssl rand -base64 32
```

Copy the output and paste into `JWT_SECRET` in Railway.

### Step 7: Setup Google OAuth

1. Go to https://console.cloud.google.com/apis/credentials
2. Create **OAuth 2.0 Client ID** (if not exists)
3. Add **Authorized Redirect URIs**:
   - `https://YOUR-APP.up.railway.app/auth/google/callback`
4. Copy **Client ID** and **Client Secret** to Railway variables

### Step 8: Deploy

Railway auto-deploys when you push to GitHub or change variables.

To trigger manual deployment:
1. Go to **Deployments** tab
2. Click **"Deploy"** button

### Step 9: Wait for Build

Railway will:
1. Build Docker image (2-3 minutes)
2. Run database migrations automatically
3. Start application
4. Assign public URL

Check logs in **Deployments** → **View Logs**

### Step 10: Test Deployment

```bash
# Get your Railway URL from dashboard (e.g., kyndof-corp-production.up.railway.app)
curl https://YOUR-APP.up.railway.app/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-25T..."}

# Test database
curl https://YOUR-APP.up.railway.app/health/db

# Test redis
curl https://YOUR-APP.up.railway.app/health/redis
```

### Step 11: Test Google OAuth

1. Visit: `https://YOUR-APP.up.railway.app`
2. Navigate to: `https://YOUR-APP.up.railway.app/auth/google`
3. Should redirect to Google login
4. After login, should redirect back with callback

### Step 12: Custom Domain (Optional)

**If you have a custom domain (e.g., kyndof-corp.com):**

1. **In Railway**:
   - Go to **Settings** → **Domains**
   - Click **"Custom Domain"**
   - Add: `kyndof-corp.com`
   - Add wildcard: `*.kyndof-corp.com`

2. **In your DNS provider**:
   ```
   Type: CNAME
   Name: @
   Value: YOUR-APP.up.railway.app
   TTL: 300

   Type: CNAME
   Name: *
   Value: YOUR-APP.up.railway.app
   TTL: 300
   ```

3. **Update Railway variables**:
   ```env
   BASE_URL=https://kyndof-corp.com
   BASE_DOMAIN=kyndof-corp.com
   COOKIE_DOMAIN=.kyndof-corp.com
   GOOGLE_REDIRECT_URI=https://kyndof-corp.com/auth/google/callback
   ```

4. **Update Google OAuth**:
   - Add new redirect URI: `https://kyndof-corp.com/auth/google/callback`
   - Add wildcard: `https://*.kyndof-corp.com/auth/google/callback`

5. **Redeploy**:
   - Railway auto-redeploys on variable change
   - Wait 1-2 minutes for SSL certificate (automatic via Let's Encrypt)

---

## Option 2: Deploy via Railway CLI (Alternative)

If you prefer command-line:

```bash
# Install Railway CLI (already done)
# Login requires browser
railway login

# Link to project
railway link

# Deploy
railway up

# Add PostgreSQL
railway add --plugin postgresql

# Add Redis
railway add --plugin redis

# Set variables
railway variables set GOOGLE_CLIENT_ID="your-id"
railway variables set GOOGLE_CLIENT_SECRET="your-secret"
railway variables set JWT_SECRET="$(openssl rand -base64 32)"
# ... (set all variables from Step 5)

# View logs
railway logs

# Open dashboard
railway open
```

---

## Troubleshooting

### Build Fails

**Check logs**:
```bash
# In Railway dashboard → Deployments → View Logs
```

**Common issues**:
- Missing `GOOGLE_CLIENT_ID` → Add in Variables
- Missing `JWT_SECRET` → Generate and add
- Database migration error → Check `DATABASE_URL` is set

### Application Won't Start

**Check health endpoint**:
```bash
curl https://YOUR-APP.up.railway.app/health
```

**If 503 error**:
- Check if `DATABASE_URL` and `REDIS_URL` are set
- Check application logs for errors
- Verify all required env vars are present

### OAuth Redirect Error

**"redirect_uri_mismatch"**:
1. Check Google Console → Authorized Redirect URIs
2. Must exactly match Railway URL
3. Include `/auth/google/callback` path
4. No typos, no extra slashes

### Database Connection Error

**Check DATABASE_URL format**:
```
postgresql://user:password@host:port/database
```

Railway sets this automatically. If missing:
1. Go to PostgreSQL service
2. Copy **DATABASE_URL** from Variables
3. Paste into app service Variables

---

## Post-Deployment Checklist

- [ ] Health endpoint returns 200 OK
- [ ] Database health check passes
- [ ] Redis health check passes
- [ ] Google OAuth redirect works
- [ ] Can login with Google Workspace account
- [ ] JWT cookie is set after login
- [ ] User data appears in database (check Prisma Studio)
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active (https://)
- [ ] Railway monitoring enabled

---

## Monitoring & Maintenance

### View Logs
```bash
railway logs --live
```

Or in Railway dashboard → **Logs** tab

### Database Backups

Railway PostgreSQL includes **automatic daily backups** (7-day retention).

Manual backup:
```bash
railway run pg_dump $DATABASE_URL > backup.sql
```

### Restart Application
```bash
railway restart
```

Or in dashboard → **Deployments** → **Restart**

### Scaling

**Vertical scaling** (more resources):
- Railway → **Settings** → **Resources**
- Increase RAM/CPU as needed

**Horizontal scaling** (multiple instances):
- Requires Team plan ($20/month)
- Edit `railway.json`: `"numReplicas": 3`

---

## Cost Estimate

**Railway Pricing**:
- **Trial**: $5 free credit (good for 1-2 months)
- **Starter**: $5/month (512MB RAM, 1 vCPU)
- **Developer**: $10/month (2GB RAM, 2 vCPUs)

**For Kyndof Corp System**:
- Development: $0 (trial)
- Production (<100 users): $5/month
- Production (<1000 users): $10/month

PostgreSQL, Redis, SSL certificates: **Included**

---

## Next Steps After Deployment

1. **Test All Features**:
   - Google OAuth login
   - Organization switching
   - JWT session persistence
   - Multi-tenant data isolation

2. **Add First Users**:
   ```bash
   railway run npx prisma studio
   # Add users via Prisma Studio UI
   ```

3. **Implement Frontend**:
   - Follow `frontend/FRONTEND_README.md`
   - Deploy frontend to Railway (separate service)
   - Or serve from Express (integrated deployment)

4. **Monitor Performance**:
   - Railway dashboard → Metrics
   - Set up Sentry for error tracking (optional)
   - Configure uptime monitoring (UptimeRobot)

5. **Setup CI/CD**:
   - Railway auto-deploys on git push
   - Already configured!

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Google OAuth Docs**: https://developers.google.com/identity/protocols/oauth2
- **Project Issues**: https://github.com/YOUR_USERNAME/kyndof-corp-system/issues

---

## Quick Command Reference

```bash
# Check Railway status
railway status

# View logs
railway logs --live

# Connect to database
railway connect postgres

# Run migrations
railway run npx prisma migrate deploy

# Open Prisma Studio
railway run npx prisma studio

# Restart app
railway restart

# View environment variables
railway variables

# Deploy current code
railway up
```

---

**Ready to deploy? Start with Step 1! 🚀**

**Estimated time to production: 10-15 minutes**
