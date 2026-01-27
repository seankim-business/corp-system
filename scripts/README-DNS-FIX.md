# Cloudflare DNS Fix Scripts

Two automated approaches to fix nubabel.com DNS:

## Option 1: API Approach (Recommended)

**Pros**: Fast, reliable, no browser needed
**Cons**: Requires API token

### Setup:

1. Create API token at: https://dash.cloudflare.com/profile/api-tokens
2. Use "Edit zone DNS" template
3. Select zone: nubabel.com
4. Copy the token

### Run:

```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
npx tsx scripts/fix-cloudflare-dns-api.ts
```

Or run without export (will prompt):

```bash
npx tsx scripts/fix-cloudflare-dns-api.ts
```

## Option 2: Browser Automation

**Pros**: Uses existing login
**Cons**: Slower, requires browser, may need 2FA

### Run:

```bash
export CLOUDFLARE_EMAIL="your-email@example.com"
export CLOUDFLARE_PASSWORD="your-password"
npx tsx scripts/fix-cloudflare-dns.ts
```

Or run without export (will prompt):

```bash
npx tsx scripts/fix-cloudflare-dns.ts
```

## What These Scripts Do

1. ✅ Find Railway domain from app.nubabel.com DNS settings
2. ✅ Delete A records for @ (root) pointing to GoDaddy IPs (13.248.243.5, 76.223.105.230)
3. ✅ Add CNAME record: @ → Railway domain with Proxied ON
4. ✅ Wait 2 minutes for DNS propagation
5. ✅ Verify nubabel.com returns HTTP 200
6. ✅ Take screenshots (browser automation only)

## Expected Output

```
🚀 Starting Cloudflare DNS fix...
🔍 Finding zone ID for nubabel.com...
✅ Found zone ID: abc123...
📋 Fetching DNS records...
🔎 Finding Railway domain from app.nubabel.com...
✅ Found Railway domain: production-abc123.up.railway.app
🗑️  Deleting A records for @ (root)...
  ✅ Deleted A record: 13.248.243.5
  ✅ Deleted A record: 76.223.105.230
➕ Adding CNAME record: @ → production-abc123.up.railway.app...
  ✅ Created CNAME record
✅ DNS changes completed!
⏳ Waiting 2 minutes for DNS propagation...
🔍 Verifying nubabel.com...
📊 Verification Result:
  - Status: 200 OK
✅ SUCCESS! nubabel.com is now working!
```

## Troubleshooting

### API token doesn't work

- Make sure you selected "Edit zone DNS" permissions
- Make sure you selected the nubabel.com zone
- Token should start with a long string of characters

### Browser automation fails

- Check if 2FA is enabled (you'll need to complete it manually)
- Make sure credentials are correct
- Check tmp/cloudflare-error.png for screenshot of error

### DNS not propagating

- Wait longer (can take up to 5 minutes)
- Check with: `dig nubabel.com`
- Check with: `curl -I https://nubabel.com/`
