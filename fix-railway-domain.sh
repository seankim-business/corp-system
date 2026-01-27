#!/bin/bash
set -e

echo "🚀 Railway Custom Domain Fix Script"
echo "===================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="nubabel.com"
SERVICE_NAME="inspiring-courage-production"

echo -e "${YELLOW}Step 1: Checking Railway CLI authentication...${NC}"
if ! railway whoami &>/dev/null; then
    echo -e "${RED}❌ Not logged in to Railway CLI${NC}"
    echo ""
    echo "Please run: railway login"
    echo "Then run this script again."
    exit 1
fi

echo -e "${GREEN}✅ Authenticated${NC}"
RAILWAY_USER=$(railway whoami)
echo "   Logged in as: $RAILWAY_USER"
echo ""

echo -e "${YELLOW}Step 2: Linking to project...${NC}"
if ! railway status &>/dev/null; then
    echo -e "${YELLOW}⚠️  Not linked to a project. Attempting to link...${NC}"
    railway link
fi

echo -e "${GREEN}✅ Project linked${NC}"
echo ""

echo -e "${YELLOW}Step 3: Getting current domains...${NC}"
echo "Current domains for $SERVICE_NAME:"
railway domain 2>&1 || echo "Could not list domains"
echo ""

echo -e "${YELLOW}Step 4: Removing custom domain '$DOMAIN'...${NC}"
echo "This will delete the domain from Railway's routing table."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Try to remove the domain
railway domain remove "$DOMAIN" 2>&1 || {
    echo -e "${YELLOW}⚠️  Domain removal command failed (may not exist or already removed)${NC}"
}

echo -e "${GREEN}✅ Domain removal initiated${NC}"
echo ""

echo -e "${YELLOW}Step 5: Waiting 30 seconds for Railway to process...${NC}"
for i in {30..1}; do
    echo -ne "   Waiting: $i seconds remaining...\r"
    sleep 1
done
echo -e "\n${GREEN}✅ Wait complete${NC}"
echo ""

echo -e "${YELLOW}Step 6: Re-adding custom domain '$DOMAIN'...${NC}"
railway domain add "$DOMAIN" 2>&1 || {
    echo -e "${RED}❌ Failed to add domain${NC}"
    echo "Please add it manually in the Railway dashboard:"
    echo "   https://railway.app/project/$SERVICE_NAME/settings"
    exit 1
}

echo -e "${GREEN}✅ Domain added${NC}"
echo ""

echo -e "${YELLOW}Step 7: Verifying DNS configuration...${NC}"
echo "Railway expects: CNAME → inspiring-courage-production.up.railway.app"
echo ""
echo "Current DNS records for $DOMAIN:"
dig +short CNAME "$DOMAIN" || echo "No CNAME found"
echo ""

echo -e "${YELLOW}Step 8: Waiting for Railway to provision (60 seconds)...${NC}"
for i in {60..1}; do
    echo -ne "   Provisioning: $i seconds remaining...\r"
    sleep 1
done
echo -e "\n${GREEN}✅ Provisioning wait complete${NC}"
echo ""

echo -e "${YELLOW}Step 9: Testing both URLs...${NC}"
echo ""
echo "Testing Railway subdomain:"
curl -I "https://inspiring-courage-production.up.railway.app/" 2>&1 | head -10
echo ""
echo "Testing custom domain:"
curl -I "https://$DOMAIN/" 2>&1 | head -10
echo ""

echo -e "${GREEN}✅ Fix complete!${NC}"
echo ""
echo "Verify both URLs show:"
echo "  - HTTP/2 200"
echo "  - server: railway-edge"
echo "  - Same content-length"
echo ""
echo "If $DOMAIN still shows GoDaddy, wait 5 more minutes for DNS propagation."
