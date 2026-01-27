#!/bin/bash

# Cloudflare credentials
CF_EMAIL="${CLOUDFLARE_EMAIL:-dev.ops.admin@kyndof.com}"
CF_GLOBAL_KEY="${CLOUDFLARE_GLOBAL_KEY}"
CF_ZONE_ID="33d7a92c496ef4d2001662f51d0ee853"
TARGET_IP="66.33.22.104"

if [ -z "$CF_GLOBAL_KEY" ]; then
  echo "❌ Error: CLOUDFLARE_GLOBAL_KEY environment variable required"
  echo ""
  echo "Get your Global API Key from:"
  echo "https://dash.cloudflare.com/profile/api-tokens"
  echo ""
  echo "Then run:"
  echo "  export CLOUDFLARE_GLOBAL_KEY='your_key_here'"
  echo "  bash scripts/delete-dns-with-global-key.sh"
  exit 1
fi

echo "🚀 Fetching DNS records..."
RECORDS=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_GLOBAL_KEY" \
  -H "Content-Type: application/json")

# Find the A record
RECORD_ID=$(echo "$RECORDS" | grep -o '"id":"[^"]*","zone_id":"'$CF_ZONE_ID'","zone_name":"nubabel.com","name":"nubabel.com","type":"A","content":"'$TARGET_IP'"' | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$RECORD_ID" ]; then
  echo "❌ A record not found for $TARGET_IP"
  echo ""
  echo "Current A records:"
  echo "$RECORDS" | grep -o '"name":"[^"]*","type":"A","content":"[^"]*"' | sed 's/"name":"//g' | sed 's/","type":"A","content":"/ → /g' | sed 's/"//g'
  exit 1
fi

echo "✅ Found A record: nubabel.com → $TARGET_IP"
echo "   Record ID: $RECORD_ID"
echo ""
echo "🗑️  Deleting record..."

DELETE_RESULT=$(curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$RECORD_ID" \
  -H "X-Auth-Email: $CF_EMAIL" \
  -H "X-Auth-Key: $CF_GLOBAL_KEY" \
  -H "Content-Type: application/json")

if echo "$DELETE_RESULT" | grep -q '"success":true'; then
  echo "✅ DNS record deleted successfully!"
  echo ""
  echo "📋 Next steps:"
  echo "1. Wait 60 seconds for DNS propagation"
  echo "2. Test: curl -I https://nubabel.com/"
else
  echo "❌ Failed to delete record"
  echo "$DELETE_RESULT"
  exit 1
fi
