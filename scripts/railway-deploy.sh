#!/bin/bash
set -e

echo "🚀 Railway Deployment Script for Nubabel"
echo "========================================"
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔑 Please log in to Railway..."
    railway login
fi

echo "✅ Railway CLI ready"
echo ""

# Create new project
echo "📦 Creating Railway project..."
railway init --name nubabel-production

# Add PostgreSQL
echo "🐘 Adding PostgreSQL database..."
railway add --database postgres

# Add Redis
echo "🔴 Adding Redis cache..."
railway add --database redis

# Wait for services to be ready
echo "⏳ Waiting for services to initialize (30s)..."
sleep 30

# Set environment variables
echo "🔧 Setting environment variables..."
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set BASE_URL=https://auth.nubabel.com
railway variables set BASE_DOMAIN=nubabel.com
railway variables set COOKIE_DOMAIN=.nubabel.com
railway variables set JWT_SECRET="453KHA79UDFz2CUj2xIPzOPay+HAi/QErWQLw4G2Tls="
railway variables set JWT_EXPIRES_IN=7d
railway variables set JWT_REFRESH_EXPIRES_IN=30d
railway variables set SLACK_SOCKET_MODE=true
railway variables set SLACK_LOG_LEVEL=WARN
railway variables set LOG_LEVEL=warn
railway variables set USE_BUILTIN_AI=true

echo ""
echo "✅ Environment variables set"
echo ""

# Link current directory to project
echo "🔗 Linking project..."
railway link

# Deploy
echo "🚀 Deploying to Railway..."
railway up

echo ""
echo "========================================"
echo "✅ Deployment Complete!"
echo ""
echo "Next steps:"
echo "1. Get DATABASE_URL: railway variables get DATABASE_URL"
echo "2. Get REDIS_URL: railway variables get REDIS_URL"
echo "3. Set Google OAuth credentials in Railway dashboard"
echo "4. Set ANTHROPIC_API_KEY in Railway dashboard"
echo "5. Configure custom domain: railway domain"
echo ""
echo "View logs: railway logs"
echo "Open dashboard: railway open"
echo "========================================"
