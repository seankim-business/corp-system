#!/bin/bash

echo "🔍 Searching for Cloudflare credentials..."
echo ""

# Check environment variables
echo "1. Checking environment variables..."
env | grep -i cloudflare || echo "   No Cloudflare env vars found"
echo ""

# Check .env files
echo "2. Checking .env files..."
find . -maxdepth 2 -name ".env*" -type f 2>/dev/null | while read file; do
  if grep -qi cloudflare "$file" 2>/dev/null; then
    echo "   Found in: $file"
    grep -i cloudflare "$file" | grep -v "^#"
  fi
done
echo ""

# Check for wrangler config
echo "3. Checking for Wrangler config..."
if [ -f ~/.wrangler/config/default.toml ]; then
  echo "   Found: ~/.wrangler/config/default.toml"
  cat ~/.wrangler/config/default.toml 2>/dev/null | grep -i "api_token\|account_id"
else
  echo "   No Wrangler config found"
fi
echo ""

# Check for cloudflare-cli config
echo "4. Checking for cloudflare-cli config..."
if [ -f ~/.cloudflare/credentials ]; then
  echo "   Found: ~/.cloudflare/credentials"
  cat ~/.cloudflare/credentials 2>/dev/null
else
  echo "   No cloudflare-cli config found"
fi
echo ""

echo "✅ Search complete"
echo ""
echo "If no credentials found, you need to:"
echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
echo "2. Get your API Token or Global API Key"
echo "3. Run one of:"
echo "   node scripts/delete-cloudflare-dns.js YOUR_TOKEN"
echo "   OR"
echo "   export CLOUDFLARE_GLOBAL_KEY='YOUR_KEY' && bash scripts/delete-dns-with-global-key.sh"
