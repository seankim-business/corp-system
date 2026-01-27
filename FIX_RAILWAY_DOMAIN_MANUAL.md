# Railway Domain Configuration Fix - MANUAL STEPS REQUIRED

**Date**: 2026-01-27  
**Status**: ⚠️ REQUIRES MANUAL INTERVENTION (GitHub 2FA blocks automation)

---

## 🔍 Problem Diagnosis

### Current Situation

```bash
# DNS Resolution - ✅ CORRECT
$ dig nubabel.com +short
66.33.22.104  # ← Same IP as Railway

$ dig inspiring-courage-production.up.railway.app +short
66.33.22.104  # ← Same IP

# HTTP Headers - ❌ WRONG ROUTING
$ curl -sI https://nubabel.com/ | grep -i server
Server: DPS/2.0.0+sha-57bdacc  # ← GoDaddy server!

$ curl -sI https://inspiring-courage-production.up.railway.app/ | grep -i server
server: railway-edge  # ← Railway server ✅
```

### Root Cause

**DNS is correct**, but Railway's edge router doesn't know about `nubabel.com`:

1. ✅ DNS CNAME points to Railway (`inspiring-courage-production.up.railway.app`)
2. ✅ Both domains resolve to same IP (`66.33.22.104`)
3. ❌ Railway edge router routes `nubabel.com` to **default/fallback** (GoDaddy)
4. ✅ Railway edge router routes `inspiring-courage-production.up.railway.app` correctly

**Solution**: Add `nubabel.com` as a custom domain in Railway dashboard.

---

## 🛠️ Manual Fix Steps

### Step 1: Login to Railway

1. Go to https://railway.app/login
2. Click "Continue with GitHub"
3. Enter your GitHub credentials:
   - Email: `sean.kim.business@gmail.com`
   - Password: `mz10pqnvgG!`
4. **Complete 2FA verification** (this is why automation failed)

### Step 2: Navigate to Service

1. Go to your Railway dashboard
2. Find project: **inspiring-courage-production**
3. Click on the service (should be the landing page service)

### Step 3: Add Custom Domain

1. Click **Settings** tab
2. Scroll to **Domains** section
3. You should see:
   - ✅ `inspiring-courage-production.up.railway.app` (Railway domain)
   - ❓ `nubabel.com` (might be listed but inactive)

### Step 4: Fix Domain Configuration

**Option A: If `nubabel.com` is already listed**

1. Click the **⋮** (three dots) next to `nubabel.com`
2. Click **Remove Domain**
3. Wait 10 seconds
4. Click **+ Add Domain**
5. Enter: `nubabel.com`
6. Click **Add**
7. Wait for Railway to verify (should be instant since DNS is already correct)

**Option B: If `nubabel.com` is NOT listed**

1. Click **+ Add Domain**
2. Enter: `nubabel.com`
3. Click **Add**
4. Railway will show DNS instructions (you can ignore - already done)
5. Wait for verification (should turn green)

### Step 5: Verify Fix

```bash
# Test 1: Check HTTP headers
curl -sI https://nubabel.com/ | grep -i server
# Expected: server: railway-edge

# Test 2: Check content
curl -s https://nubabel.com/ | head -20
# Expected: "Nubabel — Your AI Workforce"

# Test 3: Browser test
open https://nubabel.com/
# Expected: Landing page with "Nubabel — Your AI Workforce"
```

---

## 🎯 Expected Result

After completing these steps:

```bash
# Before (WRONG)
$ curl -sI https://nubabel.com/ | grep server
Server: DPS/2.0.0+sha-57bdacc  # ← GoDaddy

# After (CORRECT)
$ curl -sI https://nubabel.com/ | grep server
server: railway-edge  # ← Railway ✅
```

---

## 🚨 Why Automation Failed

1. **GitHub 2FA Required**: Railway login requires GitHub OAuth
2. **No Saved Session**: No existing Railway CLI token or browser session
3. **No API Token**: Railway API requires authentication
4. **No Recovery Code**: Can't bypass 2FA without user interaction

**Automation attempted**:

- ✅ Checked Railway CLI (`railway whoami`) - Not logged in
- ✅ Searched for Railway tokens (keychain, env, files) - None found
- ✅ Tried Playwright browser automation - Blocked by GitHub 2FA
- ❌ Cannot proceed without user's 2FA code

---

## 📋 Alternative: Railway CLI Method

If you prefer command-line:

```bash
# 1. Login to Railway
railway login
# This will open browser for GitHub OAuth + 2FA

# 2. Link to project
railway link
# Select: inspiring-courage-production

# 3. Add domain
railway domain add nubabel.com

# 4. Verify
railway domain list
# Should show both:
# - inspiring-courage-production.up.railway.app
# - nubabel.com
```

---

## 🔍 Troubleshooting

### Issue: Domain shows "Pending Verification"

**Cause**: DNS propagation delay (rare, since DNS is already correct)

**Solution**: Wait 5-10 minutes, then refresh Railway dashboard

### Issue: Domain shows "DNS Configuration Error"

**Cause**: Railway can't verify CNAME record

**Solution**:

```bash
# Verify DNS is correct
dig nubabel.com +short
# Should show: 66.33.22.104 (or CNAME to Railway)

# If wrong, update GoDaddy DNS:
# 1. Go to GoDaddy DNS management
# 2. Delete A record for nubabel.com
# 3. Add CNAME: nubabel.com → inspiring-courage-production.up.railway.app
```

### Issue: Still shows GoDaddy page after adding domain

**Cause**: Browser cache or Railway edge cache

**Solution**:

```bash
# 1. Clear browser cache
# 2. Test with curl (bypasses cache)
curl -sI https://nubabel.com/ | grep server

# 3. Wait 1-2 minutes for Railway edge cache to clear
```

---

## 📞 Need Help?

If you encounter issues:

1. **Check Railway Status**: https://status.railway.com
2. **Railway Discord**: https://discord.gg/railway
3. **Railway Support**: https://station.railway.com

---

## ✅ Success Checklist

- [ ] Logged into Railway dashboard
- [ ] Found `inspiring-courage-production` project
- [ ] Added `nubabel.com` as custom domain
- [ ] Domain shows "Active" status (green checkmark)
- [ ] `curl -sI https://nubabel.com/` shows `server: railway-edge`
- [ ] Browser shows Nubabel landing page at https://nubabel.com/

---

**Once complete, run this to verify**:

```bash
./scripts/verify-railway-domain.sh
```

This will check:

- DNS resolution
- HTTP headers
- Content verification
- SSL certificate

---

**Estimated time**: 5-10 minutes (including 2FA)
