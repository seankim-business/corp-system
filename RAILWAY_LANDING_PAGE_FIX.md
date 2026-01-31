# Railway Landing Page Deployment - CRITICAL FIX REQUIRED

**Date**: 2026-01-27  
**Status**: ⚠️ PARTIAL SUCCESS - Railway fixed, DNS configuration required

---

## 🎯 Problem Summary

The Railway service `inspiring-courage-production` was NOT serving the Nubabel landing page. Instead, `nubabel.com` was showing GoDaddy's "곧 시작" (Coming Soon) page.

## ✅ What Was Fixed

### 1. Railway Deployment Configuration

**Problem**: Railway service was not configured to deploy from the `/landing` directory.

**Solution**: Added `landing/railway.json` to specify the correct build configuration:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Commit**: `5f72a5c` - "fix(landing): add railway.json to configure deployment root directory"

**Result**: ✅ **SUCCESS** - Railway now serves the correct landing page!

### Verification

```bash
# Railway URL - ✅ WORKING
curl -s https://inspiring-courage-production.up.railway.app/ | head -10
# Output: "Nubabel — Your AI Workforce" landing page

# Server headers confirm Railway deployment
HTTP/2 200
server: railway-edge
x-railway-edge: railway/asia-southeast1-eqsg3a
content-length: 186284
```

---

## ❌ What Still Needs Fixing

### 2. DNS Configuration - CRITICAL ISSUE

**Problem**: `nubabel.com` DNS is pointing to GoDaddy's servers, NOT Railway!

**Current DNS Resolution**:

```bash
# nubabel.com → GoDaddy CloudFront (WRONG!)
dig nubabel.com +short
# Output: 13.248.243.5, 76.223.105.230

# Railway service → Railway edge (CORRECT)
dig inspiring-courage-production.up.railway.app +short
# Output: 66.33.22.104
```

**Current HTTP Response**:

```bash
curl -sI https://nubabel.com/ | grep Server
# Output: Server: DPS/2.0.0+sha-57bdacc (GoDaddy Domain Parking Service)
```

---

## 🔧 Required Manual Steps

### Step 1: Configure Railway Custom Domain

1. **Log into Railway Dashboard**: https://railway.app/dashboard
2. **Navigate to**: `inspiring-courage-production` service
3. **Go to**: Settings → Domains
4. **Add Custom Domain**: `nubabel.com`
5. **Railway will provide**: CNAME or A record values

### Step 2: Update DNS Records (GoDaddy or Cloudflare)

**If using GoDaddy DNS**:

1. Log into GoDaddy: https://dcc.godaddy.com/
2. Go to: My Products → Domains → nubabel.com → DNS
3. **Delete** existing A records pointing to GoDaddy
4. **Add** Railway's CNAME or A record:
   - Type: `CNAME` or `A`
   - Name: `@` (root domain)
   - Value: (from Railway dashboard)
   - TTL: `600` (10 minutes)

**If using Cloudflare DNS** (recommended):

1. Log into Cloudflare: https://dash.cloudflare.com/
2. Select domain: `nubabel.com`
3. Go to: DNS → Records
4. **Delete** existing A records
5. **Add** Railway's CNAME or A record:
   - Type: `CNAME` or `A`
   - Name: `@`
   - Target: (from Railway dashboard)
   - Proxy status: `Proxied` (orange cloud) or `DNS only` (grey cloud)
   - TTL: `Auto`

### Step 3: Verify DNS Propagation

```bash
# Wait 5-10 minutes, then check:
dig nubabel.com +short
# Should show: 66.33.22.104 (Railway IP)

# Test HTTP response:
curl -sI https://nubabel.com/ | grep -i server
# Should show: server: railway-edge

# Test content:
curl -s https://nubabel.com/ | grep "Nubabel — Your AI Workforce"
# Should return: <title>Nubabel — Your AI Workforce</title>
```

---

## 📊 Current Status

| Component       | Status         | URL                                                  | IP Address             |
| --------------- | -------------- | ---------------------------------------------------- | ---------------------- |
| Railway Service | ✅ **WORKING** | https://inspiring-courage-production.up.railway.app/ | 66.33.22.104           |
| nubabel.com DNS | ❌ **WRONG**   | https://nubabel.com/                                 | 13.248.243.5 (GoDaddy) |

---

## 🎯 Next Actions

1. **IMMEDIATE**: Configure custom domain in Railway dashboard
2. **IMMEDIATE**: Update DNS records to point to Railway
3. **WAIT**: 5-10 minutes for DNS propagation
4. **VERIFY**: Test both URLs show the same content

---

## 📝 Technical Details

### Landing Page Structure

```
landing/
├── Dockerfile          # Nginx-based static server
├── index.html          # "Nubabel — Your AI Workforce" page (186KB)
├── images/             # Hero images, diagrams
├── nginx.conf          # Nginx configuration
└── railway.json        # ✅ NEW - Railway deployment config
```

### Railway Configuration

- **Builder**: Dockerfile
- **Dockerfile Path**: `Dockerfile` (in `/landing` directory)
- **Root Directory**: `/landing` (configured via railway.json)
- **Branch**: `main`
- **Latest Commit**: `5f72a5c`

### DNS Requirements

Railway requires one of:

- **CNAME record**: `nubabel.com` → `inspiring-courage-production.up.railway.app`
- **A record**: `nubabel.com` → `66.33.22.104` (Railway edge IP)

**Note**: Railway's IP may change. CNAME is recommended for stability.

---

## 🚨 Why This Happened

1. **Railway deployment was misconfigured**: Service was not deploying from `/landing` directory
2. **DNS was never updated**: Domain still points to GoDaddy's parking page
3. **No custom domain in Railway**: Railway doesn't know to serve `nubabel.com`

---

## ✅ Success Criteria

- [ ] Railway dashboard shows `nubabel.com` as custom domain
- [ ] DNS resolves `nubabel.com` to Railway IP (66.33.22.104)
- [ ] `https://nubabel.com/` shows "Nubabel — Your AI Workforce" landing page
- [ ] HTTP headers show `server: railway-edge`
- [ ] Both URLs serve identical content

---

## 📞 Support

If DNS propagation takes longer than 1 hour:

1. Check DNS with: `dig nubabel.com @8.8.8.8 +short` (Google DNS)
2. Check DNS with: `dig nubabel.com @1.1.1.1 +short` (Cloudflare DNS)
3. Clear browser cache: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
4. Try incognito/private browsing mode

---

**Last Updated**: 2026-01-27 03:10 KST  
**Fixed By**: Sisyphus-Junior (OhMyOpenCode)  
**Commit**: 5f72a5c
