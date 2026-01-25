# Deployment Guide - Kyndof Corp System

## Overview

This guide covers deploying the Kyndof Corp System using Docker containers. The system includes:
- **Backend API** (Express + TypeScript)
- **PostgreSQL** (Database with RLS)
- **Redis** (Session cache)
- **Nginx** (Reverse proxy for subdomain routing)

---

## Prerequisites

### Required Tools
- Docker 24+ and Docker Compose 2.20+
- Node.js 20+ (for local development)
- Git

### Required Credentials
- **Google OAuth**: Client ID, Client Secret, Redirect URI
- **JWT Secret**: Generate with `openssl rand -base64 32`
- **PostgreSQL Password**: Strong password for production
- **Domain**: Wildcard DNS setup for `*.kyndof-corp.com`

---

## Quick Start (Local Development)

### 1. Clone Repository
```bash
git clone https://github.com/kyndof/corp-system.git
cd corp-system
```

### 2. Environment Setup
```bash
cp .env.example .env
```

Edit `.env` and set:
```env
DATABASE_URL="postgresql://kyndof:your_password@localhost:5432/kyndof_corp"
REDIS_URL="redis://localhost:6379"

GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"

JWT_SECRET="generated-with-openssl-rand-base64-32"
JWT_EXPIRES_IN="7d"

NODE_ENV="development"
PORT="3000"
BASE_URL="http://localhost:3000"
BASE_DOMAIN="localhost"
COOKIE_DOMAIN="localhost"
```

### 3. Start Services
```bash
docker-compose up -d postgres redis
npm install
npm run db:migrate
npm run dev
```

### 4. Test
```bash
curl http://localhost:3000/health
```

Expected response: `{"status":"ok"}`

---

## Production Deployment Options

### Option A: Railway.app (Recommended - Easiest)

**Pros**: Zero DevOps, automatic SSL, GitHub integration, $5/month
**Cons**: Limited customization, vendor lock-in

#### Steps:
1. **Create Railway Account**: https://railway.app
2. **New Project** → **Deploy from GitHub**
3. **Add PostgreSQL** service (built-in)
4. **Add Redis** service (built-in)
5. **Configure Environment Variables** in Railway dashboard
6. **Custom Domain**: Add `kyndof-corp.com` and `*.kyndof-corp.com`
7. **Deploy**: Automatic on git push

Railway auto-detects Dockerfile and handles everything.

---

### Option B: Fly.io (Global Edge Deployment)

**Pros**: Global CDN, great free tier, simple CLI
**Cons**: More complex than Railway, limited support

#### Steps:
1. **Install Fly CLI**: `curl -L https://fly.io/install.sh | sh`
2. **Login**: `fly auth login`
3. **Launch App**: `fly launch`
   - Choose region (closest to users)
   - Add PostgreSQL: `fly postgres create`
   - Add Redis: `fly redis create`
4. **Set Secrets**:
   ```bash
   fly secrets set JWT_SECRET="your-secret"
   fly secrets set GOOGLE_CLIENT_ID="..."
   fly secrets set GOOGLE_CLIENT_SECRET="..."
   ```
5. **Deploy**: `fly deploy`
6. **Custom Domain**: `fly certs add kyndof-corp.com`

---

### Option C: DigitalOcean App Platform

**Pros**: Predictable pricing, managed services, good docs
**Cons**: No free tier, $12/month minimum

#### Steps:
1. **Create App** from GitHub repo
2. **Add Database** (PostgreSQL managed)
3. **Add Redis** (via DO Marketplace)
4. **Environment Variables** → Set all from `.env.example`
5. **Custom Domain** → Add wildcard `*.kyndof-corp.com`
6. **Deploy**

---

### Option D: Self-Hosted VPS (Most Control)

**Pros**: Full control, cheapest ($6/month), no vendor lock-in
**Cons**: Manual setup, you manage everything

#### Steps:

**1. Create VPS** (DigitalOcean Droplet, Linode, Vultr)
   - Ubuntu 22.04 LTS
   - 2GB RAM minimum
   - SSH key authentication

**2. SSH into Server**
```bash
ssh root@your-server-ip
```

**3. Install Docker**
```bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose
systemctl enable docker
systemctl start docker
```

**4. Clone Repository**
```bash
git clone https://github.com/kyndof/corp-system.git /opt/kyndof
cd /opt/kyndof
```

**5. Setup Environment**
```bash
cp .env.example .env
nano .env
```

**6. SSL Certificates** (Let's Encrypt)
```bash
apt install -y certbot
certbot certonly --standalone -d kyndof-corp.com -d *.kyndof-corp.com

# Copy certs
mkdir -p /opt/kyndof/certs
cp /etc/letsencrypt/live/kyndof-corp.com/fullchain.pem /opt/kyndof/certs/
cp /etc/letsencrypt/live/kyndof-corp.com/privkey.pem /opt/kyndof/certs/
```

**7. Start Services**
```bash
docker-compose up -d
```

**8. Verify**
```bash
docker-compose ps
curl http://localhost/health
```

**9. Auto-renewal** (Cron job)
```bash
crontab -e

# Add:
0 0 1 * * certbot renew --quiet && cp /etc/letsencrypt/live/kyndof-corp.com/*.pem /opt/kyndof/certs/ && docker-compose restart nginx
```

---

## DNS Configuration

### Required DNS Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | your-server-ip | 300 |
| A | * | your-server-ip | 300 |
| CNAME | www | kyndof-corp.com | 300 |

**Wildcard DNS** is critical for subdomain routing (`kyndof.kyndof-corp.com`, `clientco.kyndof-corp.com`).

---

## Health Checks

### Endpoints
- **Health**: `GET /health` → `{"status":"ok"}`
- **Database**: `GET /health/db` → Check Prisma connection
- **Redis**: `GET /health/redis` → Check cache connection

### Monitoring
Add to your monitoring service (UptimeRobot, Pingdom):
```
https://kyndof-corp.com/health
```

---

## Database Migrations

### Initial Setup
```bash
docker-compose exec app npx prisma migrate deploy
```

### Adding Migrations (Development)
```bash
npm run db:migrate:dev -- --name add_new_table
```

### Production Migration Process
1. **Backup Database**:
   ```bash
   docker-compose exec postgres pg_dump -U kyndof kyndof_corp > backup.sql
   ```

2. **Run Migration**:
   ```bash
   docker-compose exec app npx prisma migrate deploy
   ```

3. **Verify**:
   ```bash
   docker-compose exec app npx prisma db seed
   ```

---

## Scaling

### Horizontal Scaling (Multiple App Instances)

**docker-compose.yml**:
```yaml
app:
  deploy:
    replicas: 3
```

**Nginx** automatically load-balances across instances.

### Vertical Scaling (Increase Resources)

**docker-compose.yml**:
```yaml
app:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 4G
```

---

## Backup Strategy

### Database Backups (Daily)
```bash
#!/bin/bash
docker-compose exec -T postgres pg_dump -U kyndof kyndof_corp | gzip > /backups/db-$(date +%Y%m%d).sql.gz

# Retention: 30 days
find /backups -name "db-*.sql.gz" -mtime +30 -delete
```

### Redis Backup (AOF Persistence)
Redis AOF is enabled in `docker-compose.yml`. Data persists in `redis_data` volume.

### Full System Backup
```bash
tar -czf /backups/kyndof-$(date +%Y%m%d).tar.gz \
  /opt/kyndof/.env \
  /opt/kyndof/certs \
  /var/lib/docker/volumes/kyndof-corp-system_postgres_data
```

---

## Security Checklist

- [ ] Change default passwords in `.env`
- [ ] Generate strong JWT secret (`openssl rand -base64 32`)
- [ ] Enable SSL/TLS (Let's Encrypt or CloudFlare)
- [ ] Set `NODE_ENV=production`
- [ ] Restrict PostgreSQL to localhost (docker network only)
- [ ] Enable Redis password (add to `docker-compose.yml`)
- [ ] Configure firewall (UFW): Allow 80, 443, SSH only
- [ ] Disable root SSH login
- [ ] Set up fail2ban for SSH brute-force protection
- [ ] Enable Docker security scanning: `docker scan kyndof-app`
- [ ] Review Nginx security headers in `nginx.conf`

---

## Troubleshooting

### Container Won't Start
```bash
docker-compose logs app
docker-compose logs postgres
```

### Database Connection Error
Check `DATABASE_URL` in `.env` matches PostgreSQL credentials.

### Nginx 502 Bad Gateway
```bash
docker-compose logs nginx
# Check if app container is running
docker-compose ps
```

### Migration Failures
```bash
docker-compose exec app npx prisma db push --accept-data-loss
```

### Redis Connection Error
```bash
docker-compose exec redis redis-cli ping
# Expected: PONG
```

---

## Rollback Procedure

### Rollback Application
```bash
git revert HEAD
docker-compose build app
docker-compose up -d app
```

### Rollback Database
```bash
docker-compose exec postgres psql -U kyndof kyndof_corp < backup.sql
```

---

## Performance Optimization

### Enable Gzip Compression (Nginx)
Add to `nginx.conf`:
```nginx
gzip on;
gzip_types text/plain application/json application/javascript text/css;
```

### Increase Connection Pool (Prisma)
Edit `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  pool_timeout = 60
  pool_size = 10
}
```

### Redis Caching
Implement Redis caching for:
- User sessions (already done via JWT)
- Frequently accessed organization data
- Google OAuth tokens (with expiration)

---

## Monitoring Recommendations

### Application Logs
```bash
docker-compose logs -f app
```

### Resource Usage
```bash
docker stats
```

### Recommended Tools
- **Sentry**: Error tracking (add `SENTRY_DSN` to `.env`)
- **Datadog**: Infrastructure monitoring
- **UptimeRobot**: Uptime monitoring (free tier)
- **CloudFlare**: DDoS protection + CDN

---

## Cost Estimates

| Platform | Monthly Cost | Notes |
|----------|--------------|-------|
| Railway.app | $5-20 | Easiest, auto-scaling |
| Fly.io | $0-15 | Great free tier |
| DigitalOcean | $12-30 | Managed DB + App |
| Self-Hosted VPS | $6-12 | Manual management |

**Recommendation**: Start with Railway.app for $5/month, migrate to self-hosted VPS when you hit scale.

---

## Support

- **Documentation**: https://github.com/kyndof/corp-system/wiki
- **Issues**: https://github.com/kyndof/corp-system/issues
- **Email**: engineering@kyndof.com
- **Slack**: #corp-system-ops
