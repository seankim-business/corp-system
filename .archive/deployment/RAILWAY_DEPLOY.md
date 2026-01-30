# Railway.app Deployment Guide

## Why Railway.app?

**Most reasonable choice for Kyndof Corp System:**
- ✅ Zero DevOps configuration
- ✅ Automatic SSL/TLS certificates
- ✅ GitHub integration (auto-deploy on push)
- ✅ Built-in PostgreSQL and Redis
- ✅ Environment variable management
- ✅ $5/month starter plan (free trial available)
- ✅ Custom domain support with wildcard subdomains
- ✅ Automatic health checks and restarts
- ✅ Built-in logging and monitoring

---

## Prerequisites

1. **Railway.app Account**: https://railway.app/login
2. **GitHub Repository**: Push your code to GitHub
3. **Google OAuth Credentials**: Set up at https://console.cloud.google.com
4. **Domain** (optional): For production use

---

## Step-by-Step Deployment

### 1. Create Railway Project

```bash
# Visit https://railway.app/new
# Click "Deploy from GitHub repo"
# Select: kyndof/corp-system
```

Or via Railway CLI:
```bash
npm install -g @railway/cli
railway login
railway init
railway link
```

### 2. Add PostgreSQL Database

In Railway dashboard:
1. Click **"New"** → **"Database"** → **"PostgreSQL"**
2. Railway automatically creates database and sets `DATABASE_URL`
3. Database is private (only accessible from your services)

### 3. Add Redis Cache

In Railway dashboard:
1. Click **"New"** → **"Database"** → **"Redis"**
2. Railway automatically creates Redis and sets `REDIS_URL`

### 4. Configure Environment Variables

In Railway dashboard → **Variables** tab:

```env
NODE_ENV=production
PORT=3000

# Database (automatically set by Railway)
DATABASE_URL=${RAILWAY_POSTGRES_CONNECTION_URL}
REDIS_URL=${RAILWAY_REDIS_URL}

# Application
BASE_URL=https://kyndof-corp-system.up.railway.app
BASE_DOMAIN=kyndof-corp-system.up.railway.app
COOKIE_DOMAIN=.kyndof-corp-system.up.railway.app

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://kyndof-corp-system.up.railway.app/auth/google/callback

# JWT
JWT_SECRET=<generate-with-openssl-rand-base64-32>
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Optional: Logging
LOG_LEVEL=info
```

**Generate JWT Secret:**
```bash
openssl rand -base64 32
```

### 5. Deploy Application

Railway auto-deploys when you:
1. Push to GitHub main branch
2. Or manually trigger via dashboard **"Deploy"** button

**First deployment:**
```bash
git push origin main
```

Railway will:
1. Detect `Dockerfile`
2. Build Docker image
3. Run migrations (via `CMD` in Dockerfile)
4. Start application
5. Assign public URL

### 6. Run Database Migrations

Railway automatically runs migrations on deploy (via Dockerfile CMD):
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
```

To run manually:
```bash
railway run npx prisma migrate deploy
```

### 7. Verify Deployment

```bash
# Check health endpoint
curl https://kyndof-corp-system.up.railway.app/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-25T06:36:57.000Z"}

# Check database
curl https://kyndof-corp-system.up.railway.app/health/db

# Check redis
curl https://kyndof-corp-system.up.railway.app/health/redis
```

### 8. Setup Custom Domain (Optional)

**For production with custom domain:**

1. **Add Domain in Railway:**
   - Go to **Settings** → **Domains**
   - Click **"Custom Domain"**
   - Enter: `kyndof-corp.com`
   - Add wildcard: `*.kyndof-corp.com`

2. **Update DNS Records:**
   ```
   Type: CNAME
   Name: @
   Value: kyndof-corp-system.up.railway.app
   TTL: 300

   Type: CNAME
   Name: *
   Value: kyndof-corp-system.up.railway.app
   TTL: 300
   ```

3. **Update Environment Variables:**
   ```env
   BASE_URL=https://kyndof-corp.com
   BASE_DOMAIN=kyndof-corp.com
   COOKIE_DOMAIN=.kyndof-corp.com
   GOOGLE_REDIRECT_URI=https://kyndof-corp.com/auth/google/callback
   ```

4. **Update Google OAuth:**
   - Go to Google Cloud Console
   - Update **Authorized Redirect URIs**:
     - `https://kyndof-corp.com/auth/google/callback`
     - `https://*.kyndof-corp.com/auth/google/callback`

5. **Redeploy:**
   ```bash
   git commit --allow-empty -m "chore: update domain configuration"
   git push origin main
   ```

Railway automatically provisions SSL certificates via Let's Encrypt.

---

## Post-Deployment Tasks

### 1. Test Google OAuth Flow

1. Visit: `https://kyndof-corp.com` (or Railway URL)
2. Click **"Login with Google"**
3. Authenticate with Google account (`@kyndof.com`)
4. Verify redirect back with JWT cookie
5. Check dashboard loads correctly

### 2. Create First Organization

Seed data should already exist (Kyndof organization). Verify:

```bash
railway run npx prisma studio
```

Browse to `organizations` table → confirm Kyndof exists.

### 3. Invite Users

Add users via Prisma Studio or API:
```bash
POST /api/organizations/{orgId}/invite
{
  "email": "user@kyndof.com",
  "role": "admin"
}
```

### 4. Setup Monitoring

Railway provides built-in:
- **Logs**: View in dashboard
- **Metrics**: CPU, Memory, Network
- **Alerts**: Configure in **Settings** → **Notifications**

Optional external monitoring:
- **Sentry** for error tracking (add `SENTRY_DSN` to env vars)
- **UptimeRobot** for uptime monitoring (free tier)

---

## Railway CLI Commands

### Deploy
```bash
railway up
```

### View Logs
```bash
railway logs
```

### Run Commands
```bash
railway run npx prisma migrate deploy
railway run npx prisma studio
railway run npm run db:seed
```

### Connect to Database
```bash
railway connect postgres
```

### Connect to Redis
```bash
railway connect redis
```

### Shell Access
```bash
railway shell
```

---

## Scaling

### Horizontal Scaling (Multiple Instances)

Railway doesn't support horizontal scaling on starter plan. For high availability:
- Upgrade to **Team Plan** ($20/month)
- Configure replicas in `railway.json`:
  ```json
  {
    "deploy": {
      "numReplicas": 3
    }
  }
  ```

### Vertical Scaling (More Resources)

Railway auto-scales within plan limits:
- **Starter**: Up to 8GB RAM, 8 vCPUs
- Increase limits in **Settings** → **Resources**

---

## Backup Strategy

### Database Backups

Railway PostgreSQL includes **automatic daily backups** (7-day retention).

Manual backup:
```bash
railway run pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

Restore:
```bash
railway run psql $DATABASE_URL < backup-20260125.sql
```

### Redis Persistence

Railway Redis uses **AOF persistence** (append-only file). Data survives restarts.

---

## Troubleshooting

### Build Fails

**View build logs:**
```bash
railway logs --deployment
```

**Common issues:**
- Missing dependencies → Check `package.json`
- Prisma client not generated → Add `npx prisma generate` to build
- TypeScript errors → Run `npm run build` locally first

### Database Connection Error

**Check DATABASE_URL:**
```bash
railway variables
```

**Test connection:**
```bash
railway run npx prisma db push
```

### OAuth Redirect Error

**Verify Google OAuth settings:**
1. **Authorized Redirect URIs** must exactly match deployment URL
2. Include trailing `/auth/google/callback`
3. No typos in domain

**Check environment variables:**
```bash
railway variables | grep GOOGLE
```

### Application Won't Start

**View runtime logs:**
```bash
railway logs --live
```

**Check health endpoint:**
```bash
railway logs | grep "Server listening"
```

**Force restart:**
```bash
railway restart
```

---

## Cost Estimation

### Railway Pricing

| Plan | Cost | Resources |
|------|------|-----------|
| **Trial** | $0 | $5 credit, 500 hours |
| **Starter** | $5/month | 512MB RAM, 1 vCPU, 1GB storage |
| **Developer** | $10/month | 2GB RAM, 2 vCPUs, 5GB storage |
| **Team** | $20/month | 8GB RAM, 8 vCPUs, 50GB storage, replicas |

**For Kyndof Corp System:**
- **Development**: Trial ($0) for 1-2 months
- **Production**: Starter ($5/month) for < 100 users
- **Scale**: Developer ($10/month) for < 1000 users

**Additional costs:**
- PostgreSQL: Included in plan
- Redis: Included in plan
- SSL certificates: Free (Let's Encrypt)
- Custom domain: Free

**Total: $5-10/month for production deployment.**

---

## Migration to Self-Hosted (Future)

When Railway becomes expensive (> $50/month), migrate to:

1. **Export Database:**
   ```bash
   railway run pg_dump $DATABASE_URL > full_backup.sql
   ```

2. **Download Code:**
   ```bash
   git clone https://github.com/kyndof/corp-system.git
   ```

3. **Setup VPS** (DigitalOcean Droplet $6/month):
   ```bash
   docker-compose up -d
   psql < full_backup.sql
   ```

4. **Update DNS** → Point to new server IP

5. **Verify** → Test health endpoints

---

## Security Checklist

- [ ] Strong JWT secret (32+ characters)
- [ ] Strong PostgreSQL password
- [ ] Google OAuth credentials secured (never commit to git)
- [ ] `NODE_ENV=production`
- [ ] HTTPS enforced (Railway default)
- [ ] Cookie `httpOnly` and `secure` flags (implemented)
- [ ] Rate limiting enabled (implemented in `auth.routes.ts`)
- [ ] CORS configured for specific domains
- [ ] Helmet.js security headers (implemented)

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Kyndof Team**: engineering@kyndof.com
- **GitHub Issues**: https://github.com/kyndof/corp-system/issues

---

## Quick Reference

```bash
# Deploy to Railway
git push origin main

# View logs
railway logs --live

# Run migrations
railway run npx prisma migrate deploy

# Connect to database
railway run npx prisma studio

# Restart app
railway restart

# Check environment variables
railway variables

# Test health
curl https://kyndof-corp-system.up.railway.app/health
```

---

**Railway.app is the most reasonable deployment option for Kyndof Corp System:**
- Fastest time to production (< 30 minutes)
- Zero DevOps overhead
- Cost-effective ($5/month)
- Easy to scale
- Built-in monitoring
- GitHub integration

**Deploy now:**
```bash
git push origin main
railway up
```
