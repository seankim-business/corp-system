#!/bin/bash

# Railway Domain Verification Script
# Checks if nubabel.com is correctly routed to Railway

set -e

echo "🔍 Railway Domain Verification"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: DNS Resolution
echo "1️⃣  Checking DNS resolution..."
NUBABEL_IP=$(dig +short nubabel.com | tail -1)
RAILWAY_IP=$(dig +short inspiring-courage-production.up.railway.app | tail -1)

if [ "$NUBABEL_IP" = "$RAILWAY_IP" ]; then
    echo -e "${GREEN}✅ DNS Resolution: PASS${NC}"
    echo "   nubabel.com → $NUBABEL_IP"
    echo "   Railway     → $RAILWAY_IP"
else
    echo -e "${RED}❌ DNS Resolution: FAIL${NC}"
    echo "   nubabel.com → $NUBABEL_IP"
    echo "   Railway     → $RAILWAY_IP"
    echo "   ⚠️  IPs don't match!"
    exit 1
fi
echo ""

# Test 2: HTTP Headers
echo "2️⃣  Checking HTTP headers..."
NUBABEL_SERVER=$(curl -sI https://nubabel.com/ | grep -i "^server:" | cut -d' ' -f2- | tr -d '\r')
RAILWAY_SERVER=$(curl -sI https://inspiring-courage-production.up.railway.app/ | grep -i "^server:" | cut -d' ' -f2- | tr -d '\r')

echo "   nubabel.com: $NUBABEL_SERVER"
echo "   Railway:     $RAILWAY_SERVER"

if echo "$NUBABEL_SERVER" | grep -qi "railway"; then
    echo -e "${GREEN}✅ HTTP Headers: PASS${NC}"
else
    echo -e "${RED}❌ HTTP Headers: FAIL${NC}"
    echo "   ⚠️  nubabel.com is NOT routed to Railway!"
    echo "   ⚠️  Server header shows: $NUBABEL_SERVER"
    echo ""
    echo "📋 Action Required:"
    echo "   1. Login to Railway dashboard"
    echo "   2. Go to inspiring-courage-production service"
    echo "   3. Settings → Domains"
    echo "   4. Add custom domain: nubabel.com"
    echo ""
    echo "See FIX_RAILWAY_DOMAIN_MANUAL.md for detailed steps"
    exit 1
fi
echo ""

# Test 3: Content Verification
echo "3️⃣  Checking page content..."
NUBABEL_TITLE=$(curl -s https://nubabel.com/ | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g')
RAILWAY_TITLE=$(curl -s https://inspiring-courage-production.up.railway.app/ | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g')

echo "   nubabel.com: $NUBABEL_TITLE"
echo "   Railway:     $RAILWAY_TITLE"

if [ "$NUBABEL_TITLE" = "$RAILWAY_TITLE" ]; then
    echo -e "${GREEN}✅ Content: PASS${NC}"
else
    echo -e "${YELLOW}⚠️  Content: DIFFERENT${NC}"
    echo "   Titles don't match (might be cache)"
fi
echo ""

# Test 4: SSL Certificate
echo "4️⃣  Checking SSL certificate..."
NUBABEL_CERT=$(echo | openssl s_client -servername nubabel.com -connect nubabel.com:443 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -o "CN = [^,]*" | cut -d'=' -f2 | xargs)

if [ -n "$NUBABEL_CERT" ]; then
    echo -e "${GREEN}✅ SSL Certificate: VALID${NC}"
    echo "   Certificate for: $NUBABEL_CERT"
else
    echo -e "${YELLOW}⚠️  SSL Certificate: Could not verify${NC}"
fi
echo ""

# Final Summary
echo "================================"
echo "📊 Summary"
echo "================================"
echo ""

if echo "$NUBABEL_SERVER" | grep -qi "railway"; then
    echo -e "${GREEN}🎉 SUCCESS! nubabel.com is correctly routed to Railway${NC}"
    echo ""
    echo "✅ DNS points to Railway IP"
    echo "✅ HTTP requests routed to Railway edge"
    echo "✅ Content matches Railway service"
    echo ""
    echo "🌐 Your site is live at: https://nubabel.com/"
else
    echo -e "${RED}❌ FAILED! nubabel.com is NOT routed to Railway${NC}"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Read: FIX_RAILWAY_DOMAIN_MANUAL.md"
    echo "   2. Login to Railway dashboard"
    echo "   3. Add nubabel.com as custom domain"
    echo "   4. Run this script again to verify"
fi
echo ""
