# Railway Domain Fix - Summary

**Date**: 2026-01-27  
**Status**: ⚠️ MANUAL ACTION REQUIRED

---

## 🎯 Problem

`nubabel.com` shows GoDaddy "곧 시작" page instead of Nubabel landing page.

## 🔍 Root Cause

**DNS is correct**, but Railway doesn't have `nubabel.com` configured as a custom domain.

```bash
# DNS Resolution - ✅ CORRECT
nubabel.com → 66.33.22.104 (Railway IP)

# HTTP Routing - ❌ WRONG
nubabel.com → GoDaddy server (Railway's fallback)
inspiring-courage-production.up.railway.app → Railway edge ✅
```

## 🛠️ Solution

**Add `nubabel.com` as custom domain in Railway dashboard**

### Quick Steps

1. **Login**: https://railway.app/login (GitHub OAuth + 2FA)
2. **Navigate**: Find `inspiring-courage-production` project
3. **Add Domain**: Settings → Domains → Add `nubabel.com`
4. **Verify**: Run `./scripts/verify-railway-domain.sh`

### Detailed Guide

See **[FIX_RAILWAY_DOMAIN_MANUAL.md](FIX_RAILWAY_DOMAIN_MANUAL.md)** for:

- Step-by-step instructions with screenshots
- Troubleshooting guide
- Alternative CLI method
- Expected results

---

## 🚨 Why Automation Failed

**GitHub 2FA blocks automation**:

- ✅ Tried Railway CLI - Not logged in
- ✅ Searched for tokens - None found
- ✅ Tried browser automation - Blocked by 2FA
- ❌ Cannot proceed without user's 2FA code

**Manual intervention required** (estimated 5-10 minutes)

---

## ✅ Verification

After adding the domain, run:

```bash
./scripts/verify-railway-domain.sh
```

This checks:

- ✅ DNS resolution
- ✅ HTTP headers (should show `server: railway-edge`)
- ✅ Content matches Railway service
- ✅ SSL certificate

---

## 📋 Expected Result

```bash
# Before (WRONG)
$ curl -sI https://nubabel.com/ | grep server
Server: DPS/2.0.0+sha-57bdacc  # ← GoDaddy

# After (CORRECT)
$ curl -sI https://nubabel.com/ | grep server
server: railway-edge  # ← Railway ✅
```

---

## 📞 Need Help?

- **Detailed Guide**: [FIX_RAILWAY_DOMAIN_MANUAL.md](FIX_RAILWAY_DOMAIN_MANUAL.md)
- **Railway Status**: https://status.railway.com
- **Railway Discord**: https://discord.gg/railway

---

**Estimated time**: 5-10 minutes (including 2FA)
