# Nubabel Platform - Deployment Guide

This directory contains production deployment scripts and configuration for the Nubabel platform.

## Files Overview

### Core Deployment Files

- **`deploy.sh`** - Main deployment script with zero-downtime deployment, health checks, and rollback capability
- **`healthcheck.sh`** - Comprehensive health verification script for deployment and monitoring
- **`docker-compose.prod.yml`** - Production Docker Compose configuration (in project root)
- **`Dockerfile`** - Multi-stage production-optimized Docker image (in project root)

## Prerequisites

### Required Tools

```bash
# Install Docker and Docker Compose
docker --version
docker-compose --version

# Install curl for health checks
curl --version

# Install jq for JSON parsing (optional, for verbose output)
jq --version
```

### Required Environment Variables

Create `.env.production` file in the project root with the following variables:

```bash
# Database
POSTGRES_DB=nubabel
POSTGRES_USER=nubabel
POSTGRES_PASSWORD=<strong-password>

# Security
JWT_SECRET=<generate-with-openssl-rand-base64-32>
ENCRYPTION_KEY=<generate-with-openssl-rand-hex-32>
ENCRYPTION_SECRET=<generate-with-openssl-rand-hex-32>

# Google OAuth
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://auth.nubabel.com/auth/google/callback

# Application URLs
BASE_URL=https://auth.nubabel.com
FRONTEND_URL=https://app.nubabel.com
BASE_DOMAIN=nubabel.com
COOKIE_DOMAIN=.nubabel.com

# Monitoring (optional)
SENTRY_DSN=<your-sentry-dsn>
GRAFANA_ADMIN_PASSWORD=<strong-password>
```

## Deployment

### First-Time Deployment

```bash
# 1. Validate environment and build images
cd /path/to/nubabel
./scripts/deploy/deploy.sh

# This will:
# - Validate all required environment variables
# - Build Docker images with version tagging
# - Start infrastructure services (PostgreSQL, Redis)
# - Run database migrations with automatic backup
# - Deploy application with health checks
# - Start monitoring services (Prometheus, Grafana)
```

### Subsequent Deployments

```bash
# Deploy with pre-built images (faster)
./scripts/deploy/deploy.sh --skip-build

# Deploy without database backup (not recommended)
./scripts/deploy/deploy.sh --skip-backup
```

### Rollback

```bash
# Rollback to previous version
./scripts/deploy/deploy.sh --rollback
```

## Health Checks

### Manual Health Verification

```bash
# Check all services
./scripts/deploy/healthcheck.sh

# Check specific service
./scripts/deploy/healthcheck.sh database
./scripts/deploy/healthcheck.sh redis
./scripts/deploy/healthcheck.sh readiness

# Verbose output
VERBOSE=true ./scripts/deploy/healthcheck.sh

# Custom URL
BASE_URL=https://api.nubabel.com ./scripts/deploy/healthcheck.sh
```

### Health Check Endpoints

The application exposes the following health check endpoints:

- **`GET /health`** - Basic health check
- **`GET /health/live`** - Liveness probe (container is running)
- **`GET /health/ready`** - Readiness probe (ready to accept traffic)
- **`GET /health/db`** - Database connectivity
- **`GET /health/redis`** - Redis connectivity
- **`GET /health/redis-pool`** - Redis connection pool status
- **`GET /health/circuits`** - Circuit breaker status
- **`GET /health/mcp-cache`** - MCP cache statistics

### Kubernetes/Container Orchestration

Use these probes in your orchestration configuration:

```yaml
# Kubernetes example
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 5
```

## Monitoring

### Access Monitoring Services

- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3001`
  - Default credentials: `admin` / `<GRAFANA_ADMIN_PASSWORD>`

### View Metrics

```bash
# Application metrics
curl http://localhost:3000/metrics

# Prometheus targets
curl http://localhost:9090/api/v1/targets

# Service status
docker-compose -f docker-compose.prod.yml ps
```

## Database Management

### Backup

```bash
# Automatic backup (created before each deployment)
ls -lh backups/

# Manual backup
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U nubabel nubabel > backup-$(date +%Y%m%d-%H%M%S).sql
```

### Restore

```bash
# Restore from backup
docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U nubabel nubabel < backup-20240130-120000.sql
```

### Migrations

```bash
# Run migrations manually
docker-compose -f docker-compose.prod.yml run --rm app \
  npx prisma migrate deploy

# View migration status
docker-compose -f docker-compose.prod.yml run --rm app \
  npx prisma migrate status
```

## Troubleshooting

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f app
docker-compose -f docker-compose.prod.yml logs -f postgres
docker-compose -f docker-compose.prod.yml logs -f redis

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 app
```

### Common Issues

#### Migration Failures

```bash
# Check migration status
docker-compose -f docker-compose.prod.yml run --rm app \
  npx prisma migrate status

# Force reset (CAUTION: deletes all data)
docker-compose -f docker-compose.prod.yml run --rm app \
  npx prisma migrate reset --force
```

#### Connection Issues

```bash
# Check network connectivity
docker-compose -f docker-compose.prod.yml exec app ping postgres
docker-compose -f docker-compose.prod.yml exec app ping redis

# Verify service health
docker-compose -f docker-compose.prod.yml ps
```

#### Out of Memory

```bash
# Increase Docker memory limits in docker-compose.prod.yml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Service Management

```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Stop and remove volumes (CAUTION: deletes data)
docker-compose -f docker-compose.prod.yml down -v

# Restart specific service
docker-compose -f docker-compose.prod.yml restart app

# Rebuild and restart
docker-compose -f docker-compose.prod.yml up -d --build app
```

## Security Best Practices

1. **Use Strong Secrets**: Generate all secrets using cryptographically secure methods
   ```bash
   openssl rand -base64 32  # For JWT_SECRET
   openssl rand -hex 32     # For ENCRYPTION_KEY
   ```

2. **Restrict Network Access**: Use firewall rules to restrict access to services

3. **Regular Updates**: Keep base images and dependencies updated
   ```bash
   docker-compose -f docker-compose.prod.yml pull
   ./scripts/deploy/deploy.sh
   ```

4. **Monitor Logs**: Regularly review application and security logs

5. **Backup Strategy**: Implement automated daily backups with offsite storage

## Performance Tuning

### PostgreSQL

```bash
# Tune for production workload
# Edit docker-compose.prod.yml:
environment:
  POSTGRES_INITDB_ARGS: >-
    --encoding=UTF8
    --locale=en_US.UTF-8
    -c shared_buffers=256MB
    -c max_connections=200
```

### Redis

```bash
# Adjust memory limits in docker-compose.prod.yml
command: >
  redis-server
  --maxmemory 1gb
  --maxmemory-policy allkeys-lru
```

### Application

```bash
# Increase worker concurrency
environment:
  QUEUE_SLACK_CONCURRENCY: 10
  QUEUE_ORCHESTRATION_CONCURRENCY: 5
```

## Support

For issues or questions:
- Check logs: `docker-compose -f docker-compose.prod.yml logs`
- Run health checks: `./scripts/deploy/healthcheck.sh`
- Review deployment logs: `./scripts/deploy/deploy.sh --help`
