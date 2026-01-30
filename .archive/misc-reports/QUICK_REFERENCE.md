# Quick Reference: Landing Page Deployment

## 🎯 Current Status

✅ **Application**: Deployed and running on Railway  
⏳ **DNS**: Awaiting Cloudflare configuration  
🔗 **Public URL**: https://inspiring-courage-production.up.railway.app

---

## 🚀 What's Working

```
✅ https://inspiring-courage-production.up.railway.app → HTTP 200
✅ Landing page displays correctly
✅ All static assets loaded
✅ SSL certificate active
```

## ❌ What's Not Working

```
❌ https://nubabel.com → 502 Bad Gateway
❌ https://www.nubabel.com → 502 Bad Gateway
```

---

## 🔧 What You Need to Do

### In Cloudflare Dashboard (5 minutes)

1. **Go to DNS Records**
   - https://dash.cloudflare.com → nubabel.com → DNS

2. **Add/Update Root Domain**

   ```
   Type:   CNAME
   Name:   @
   Value:  arzjnzoq.up.railway.app
   Proxy:  DNS only ⚠️ (gray cloud, not orange)
   ```

3. **Add/Update WWW Subdomain**

   ```
   Type:   CNAME
   Name:   www
   Value:  arzjnzoq.up.railway.app
   Proxy:  DNS only ⚠️ (gray cloud, not orange)
   ```

4. **Save and Wait**
   - DNS propagation: 5-30 minutes
   - Then test: `curl https://nubabel.com`

---

## ⚠️ Critical: Proxy Settings

**MUST be "DNS only" (gray cloud), NOT "Proxied" (orange cloud)**

Why? Cloudflare's SSL certificate conflicts with Railway's SSL certificate when proxying.

---

## 📋 Verification

After DNS propagates, verify:

```bash
nslookup nubabel.com
curl -I https://nubabel.com
# Should return HTTP 200
```

---

## 📚 Full Documentation

- `DEPLOYMENT_SUMMARY.md` - Complete deployment details
- `DNS_CONFIGURATION_GUIDE.md` - Detailed DNS setup guide

---

## 🆘 If It Doesn't Work

1. Check Cloudflare proxy status (should be DNS only)
2. Verify CNAME records are correct
3. Wait for DNS propagation: `nslookup nubabel.com`
4. Check Railway service status (should be Online)

---

**Status**: Ready for DNS configuration  
**Next Step**: Add CNAME records in Cloudflare  
**Time to Complete**: ~5 minutes + 5-30 minutes for DNS propagation
