#!/bin/bash
set -e

echo "🌐 GoDaddy DNS Setup for auth.nubabel.com"
echo "=========================================="
echo ""

echo "📋 Prerequisites"
echo "----------------------------------------"
echo "You need:"
echo "1. GoDaddy account with nubabel.com domain"
echo "2. Railway project deployed"
echo "3. Railway custom domain configured"
echo ""
read -p "Press Enter to continue..."

echo ""
echo "📋 Step 1: Get Railway Domain"
echo "----------------------------------------"
echo "Run this command to get your Railway domain:"
echo "  railway domain"
echo ""
echo "You should see something like:"
echo "  nubabel-production-production.up.railway.app"
echo ""
read -p "Paste your Railway domain: " RAILWAY_DOMAIN

echo ""
echo "📋 Step 2: Configure Custom Domain in Railway"
echo "----------------------------------------"
echo "1. Run: railway domain add auth.nubabel.com"
echo "2. Railway will show you DNS records to add"
echo ""
read -p "Press Enter when Railway domain is configured..."

echo ""
echo "📋 Step 3: Add DNS Records in GoDaddy"
echo "----------------------------------------"
echo "1. Open: https://dcc.godaddy.com/domains"
echo "2. Find 'nubabel.com' → Click 'DNS'"
echo "3. Add a CNAME record:"
echo ""
echo "   Type:  CNAME"
echo "   Name:  auth"
echo "   Value: $RAILWAY_DOMAIN"
echo "   TTL:   600 seconds"
echo ""
echo "4. Click 'Save'"
echo ""
read -p "Press Enter when DNS record is added..."

echo ""
echo "📋 Step 4: Verify DNS Propagation"
echo "----------------------------------------"
echo "Checking DNS... (this may take 1-10 minutes)"
echo ""

max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if dig +short auth.nubabel.com | grep -q "$RAILWAY_DOMAIN"; then
        echo "✅ DNS propagation complete!"
        break
    fi
    attempt=$((attempt + 1))
    echo "Attempt $attempt/$max_attempts... waiting 20s"
    sleep 20
done

if [ $attempt -eq $max_attempts ]; then
    echo "⚠️  DNS propagation taking longer than expected."
    echo "Please check manually: dig auth.nubabel.com"
else
    echo ""
    echo "🎉 DNS Setup Complete!"
    echo ""
    echo "Your site should be accessible at:"
    echo "  https://auth.nubabel.com"
    echo ""
    echo "Note: SSL certificate may take 1-2 minutes to provision."
fi

echo "=========================================="
