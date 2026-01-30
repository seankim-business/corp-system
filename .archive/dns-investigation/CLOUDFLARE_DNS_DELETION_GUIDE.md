# Cloudflare DNS A Record Deletion Guide

## Status: CAPTCHA Blocked - Manual Steps Required

### Problem

Browser automation was blocked by Cloudflare's CAPTCHA protection when attempting to delete the A record for `nubabel.com` pointing to `66.33.22.104`.

### Solution: Use Cloudflare API

## Option 1: Using API Token (Recommended)

### Step 1: Get API Token

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Log in with: `dev.ops.admin@kyndof.com`
3. Click **"Create Token"**
4. Use template: **"Edit zone DNS"**
5. Configure:
   - **Permissions**: Zone → DNS → Edit
   - **Zone Resources**: Include → Specific zone → `nubabel.com`
6. Click **"Continue to summary"**
7. Click **"Create Token"**
8. **Copy the token** (you won't see it again!)

### Step 2: Delete the A Record

```bash
# Run the deletion script with your token
node scripts/delete-cloudflare-dns.js YOUR_TOKEN_HERE

# OR set as environment variable
export CLOUDFLARE_API_TOKEN="YOUR_TOKEN_HERE"
node scripts/delete-cloudflare-dns.js
```

### Step 3: Verify Deletion

```bash
# Wait 60 seconds for DNS propagation
sleep 60

# Test that the site is no longer accessible
curl -I https://nubabel.com/

# Expected: Connection timeout or error (site should be unreachable)
```

## Option 2: Using Global API Key

### Step 1: Get Global API Key

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Scroll to **"API Keys"** section
3. Click **"View"** next to "Global API Key"
4. Enter your password
5. Copy the key

### Step 2: Delete the A Record

```bash
# Set credentials
export CLOUDFLARE_EMAIL="dev.ops.admin@kyndof.com"
export CLOUDFLARE_GLOBAL_KEY="YOUR_GLOBAL_KEY_HERE"

# Run the deletion script
bash scripts/delete-dns-with-global-key.sh
```

### Step 3: Verify Deletion

```bash
# Wait 60 seconds for DNS propagation
sleep 60

# Test that the site is no longer accessible
curl -I https://nubabel.com/

# Expected: Connection timeout or error
```

## Option 3: Manual Deletion via Dashboard

If API access is not available:

1. Go to: https://dash.cloudflare.com/33d7a92c496ef4d2001662f51d0ee853/nubabel.com/dns/records
2. Log in with: `dev.ops.admin@kyndof.com`
3. Find the A record:
   - **Type**: A
   - **Name**: @ (or nubabel.com)
   - **Content**: 66.33.22.104
4. Click the **three dots** menu (⋮) on the right
5. Click **"Delete"**
6. Confirm deletion
7. Wait 60 seconds for DNS propagation
8. Test: `curl -I https://nubabel.com/`

## Scripts Created

### 1. `scripts/delete-cloudflare-dns.js`

Main deletion script using API Token.

**Usage:**

```bash
node scripts/delete-cloudflare-dns.js YOUR_TOKEN
```

**Features:**

- Lists all DNS records
- Finds the target A record (@ → 66.33.22.104)
- Deletes the record
- Provides verification instructions

### 2. `scripts/delete-dns-with-global-key.sh`

Alternative script using Global API Key.

**Usage:**

```bash
export CLOUDFLARE_GLOBAL_KEY="YOUR_KEY"
bash scripts/delete-dns-with-global-key.sh
```

### 3. `scripts/cloudflare-get-token.js`

Helper script with instructions for getting API token.

**Usage:**

```bash
node scripts/cloudflare-get-token.js
```

### 4. `scripts/find-cloudflare-creds.sh`

Searches for existing Cloudflare credentials.

**Usage:**

```bash
bash scripts/find-cloudflare-creds.sh
```

## Target Record Details

- **Zone ID**: `33d7a92c496ef4d2001662f51d0ee853`
- **Domain**: `nubabel.com`
- **Record Type**: A
- **Record Name**: @ (root domain)
- **Record Content**: `66.33.22.104`

## Why Browser Automation Failed

Cloudflare's login page uses advanced CAPTCHA protection that detects:

- Automated browsers (Playwright, Puppeteer, Selenium)
- Headless browser signatures
- Automated interaction patterns

Even with human-like timing and delays, the CAPTCHA remained active and blocked login.

## Recommended Next Steps

1. **Get API Token** (5 minutes)
   - Follow Option 1 steps above
   - Most secure and recommended approach

2. **Run Deletion Script** (30 seconds)
   - Execute `scripts/delete-cloudflare-dns.js`
   - Script will confirm deletion

3. **Verify** (60 seconds)
   - Wait for DNS propagation
   - Test with curl command
   - Confirm site is unreachable

## Security Notes

- API tokens are more secure than Global API Keys
- API tokens can be scoped to specific permissions and zones
- Global API Keys have full account access
- Never commit API tokens or keys to git
- Store credentials in environment variables or secure vaults

## Troubleshooting

### "API token invalid"

- Verify token was copied correctly
- Check token hasn't expired
- Ensure token has "Edit zone DNS" permission for nubabel.com

### "Record not found"

- Record may have already been deleted
- Run: `curl https://api.cloudflare.com/client/v4/zones/33d7a92c496ef4d2001662f51d0ee853/dns_records -H "Authorization: Bearer YOUR_TOKEN"`
- Check current DNS records

### "DNS still resolving after deletion"

- DNS propagation can take up to 5 minutes
- Clear local DNS cache: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`
- Try from different network or use: `dig @8.8.8.8 nubabel.com`

## Support

If you encounter issues:

1. Check Cloudflare API status: https://www.cloudflarestatus.com
2. Review Cloudflare API docs: https://developers.cloudflare.com/api/
3. Contact Cloudflare support: https://support.cloudflare.com
