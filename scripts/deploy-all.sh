#!/bin/bash
set -e

echo "🚀 Nubabel Complete Deployment Script"
echo "======================================"
echo ""

echo "This script will guide you through:"
echo "1. Railway project setup and deployment"
echo "2. Google OAuth configuration"
echo "3. Slack Bot setup (optional)"
echo "4. GoDaddy DNS configuration"
echo ""
read -p "Press Enter to start deployment..."

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1/4: Railway Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/railway-deploy.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2/4: Google OAuth Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/setup-google-oauth.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3/4: Slack Bot Setup (Optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -p "Do you want to set up Slack Bot? (y/n): " setup_slack
if [ "$setup_slack" = "y" ]; then
    ./scripts/setup-slack-bot.sh
else
    echo "Skipping Slack Bot setup"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4/4: GoDaddy DNS Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
./scripts/setup-godaddy-dns.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Your Nubabel instance is now deployed!"
echo ""
echo "URLs:"
echo "  Production: https://auth.nubabel.com"
echo "  Railway:    $(railway status --json | jq -r '.url')"
echo ""
echo "Next steps:"
echo "1. Test login: https://auth.nubabel.com"
echo "2. Check logs: railway logs"
echo "3. Monitor: railway open"
echo ""
echo "======================================"
