# Landing Page Deployment Summary

**Date**: January 26, 2026  
**Status**: ✅ Application Deployed | ⏳ DNS Configuration Pending  
**Project**: corp-system (Kyndof/Nubabel)

---

## 🎯 Deployment Status

### ✅ Completed

- Landing page application deployed to Railway
- Dockerfile configured with Nginx and PORT environment variable support
- Service running and accessible at public URL
- All static assets (HTML, CSS, images) deployed
- SSL certificate provisioned by Railway

### ⏳ In Progress

- Custom domain DNS configuration in Cloudflare
- Domain routing from nubabel.com to Railway service

### 📋 Next Steps (Manual)

- Add CNAME DNS records in Cloudflare
- Change proxy settings from "Proxied" to "DNS only"
- Wait for DNS propagation
- Test custom domains

---

## 🚀 Service Details

| Property           | Value                                               |
| ------------------ | --------------------------------------------------- |
| **Service Name**   | inspiring-courage                                   |
| **Environment**    | production                                          |
| **Platform**       | Railway                                             |
| **Project ID**     | 5d962626-4e7d-47da-978f-94dacc78d61a                |
| **Service ID**     | 1f13bfdc-ceb9-414f-9209-ca275215628d                |
| **Public URL**     | https://inspiring-courage-production.up.railway.app |
| **Status**         | 🟢 Online                                           |
| **Root Directory** | /landing                                            |
| **Port**           | 3000 (via $PORT env var)                            |
| **Builder**        | Dockerfile                                          |

---

## 📍 Current Access

### ✅ Working

```
https://inspiring-courage-production.up.railway.app
```

Returns HTTP 200 with landing page content

### ❌ Not Working (DNS Pending)

```
https://nubabel.com
https://www.nubabel.com
```

Currently returning 502 Bad Gateway (DNS not configured)

---

## 🔧 What Was Fixed

### Issue 1: Missing /landing Directory

**Problem**: Root directory was set to "landing" but directory didn't exist  
**Solution**: Created and committed /landing directory with Dockerfile and static assets

### Issue 2: PORT Environment Variable

**Problem**: Nginx wasn't listening on Railway's $PORT environment variable  
**Solution**: Modified Dockerfile to use `envsubst` to substitute $PORT in nginx.conf

**Dockerfile Changes**:

```dockerfile
FROM nginx:alpine
COPY landing/nginx.conf /etc/nginx/nginx.conf.template
COPY landing/index.html /usr/share/nginx/html/
RUN envsubst < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

**nginx.conf Changes**:

```nginx
server {
    listen $PORT;
    server_name _;

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 📝 Files Deployed

### In `/landing` directory:

- `Dockerfile` - Nginx container configuration
- `index.html` - Landing page HTML
- `nginx.conf` - Nginx server configuration with $PORT substitution

### In root directory:

- `railway.toml` - Railway deployment configuration

---

## 🌐 DNS Configuration Required

### Railway DNS Target

```
arzjnzoq.up.railway.app
```

### Records to Add in Cloudflare

#### 1. Root Domain (nubabel.com)

```
Type:   CNAME
Name:   @ (root)
Value:  arzjnzoq.up.railway.app
TTL:    Auto
Proxy:  DNS only (⚠️ IMPORTANT)
```

#### 2. WWW Subdomain (www.nubabel.com)

```
Type:   CNAME
Name:   www
Value:  arzjnzoq.up.railway.app
TTL:    Auto
Proxy:  DNS only (⚠️ IMPORTANT)
```

### ⚠️ Critical: Cloudflare Proxy Settings

**Current Issue**: Domains are set to "Proxied" (orange cloud) which causes 502 errors

**Why**:

- Cloudflare proxying intercepts traffic
- Railway provides its own SSL certificate
- Cloudflare's certificate doesn't match Railway's
- Results in SSL/TLS mismatch → 502 Bad Gateway

**Solution**:

1. Go to Cloudflare DNS settings
2. Find CNAME records for nubabel.com and www.nubabel.com
3. Change proxy status from "Proxied" (orange) to "DNS only" (gray)
4. This allows Railway's SSL certificate to work directly

---

## 📋 Manual Steps to Complete Deployment

### Step 1: Access Cloudflare Dashboard

1. Go to https://dash.cloudflare.com
2. Select domain: nubabel.com
3. Click "DNS" in left sidebar

### Step 2: Add/Update CNAME for Root Domain

1. Click "Add record" or edit existing @ record
2. **Type**: CNAME
3. **Name**: @ (or leave blank)
4. **Content**: arzjnzoq.up.railway.app
5. **TTL**: Auto
6. **Proxy status**: DNS only (gray cloud) ⚠️
7. Click "Save"

### Step 3: Add/Update CNAME for WWW

1. Click "Add record" or edit existing www record
2. **Type**: CNAME
3. **Name**: www
4. **Content**: arzjnzoq.up.railway.app
5. **TTL**: Auto
6. **Proxy status**: DNS only (gray cloud) ⚠️
7. Click "Save"

### Step 4: Verify SSL/TLS Settings

1. Click "SSL/TLS" in left sidebar
2. Check that mode is set to "Full" or "Full (strict)"
3. Verify SSL certificate is active

### Step 5: Wait for DNS Propagation

- Typical time: 5-30 minutes
- Maximum time: 72 hours (rare)
- Check propagation with: `nslookup nubabel.com`

### Step 6: Test Custom Domains

```bash
# Test DNS resolution
nslookup nubabel.com
nslookup www.nubabel.com

# Test HTTP response
curl -I https://nubabel.com
curl -I https://www.nubabel.com

# Should return HTTP 200 with landing page content
```

---

## 🔍 Verification Checklist

- [ ] CNAME record added for nubabel.com
- [ ] CNAME record added for www.nubabel.com
- [ ] Proxy status changed to "DNS only" for both records
- [ ] DNS propagation verified with nslookup
- [ ] SSL certificate is active in Cloudflare
- [ ] https://nubabel.com returns HTTP 200
- [ ] https://www.nubabel.com returns HTTP 200
- [ ] Landing page content displays correctly
- [ ] No 502 Bad Gateway errors

---

## 🆘 Troubleshooting

### Still Getting 502 Bad Gateway?

1. ✅ Verify Cloudflare proxy status is "DNS only"
2. ✅ Confirm CNAME records are correct
3. ✅ Check DNS propagation: `nslookup nubabel.com`
4. ✅ Verify Railway service status (should be Online)
5. ✅ Check Railway SSL certificate status

### DNS Not Resolving?

1. ✅ Verify CNAME records in Cloudflare
2. ✅ Check TTL (may need to wait for old records to expire)
3. ✅ Use `dig` command: `dig nubabel.com`
4. ✅ Try flushing local DNS cache

### SSL Certificate Issues?

1. ✅ Check Railway SSL certificate status
2. ✅ Ensure Cloudflare SSL/TLS mode is compatible
3. ✅ Consider switching to "DNS only" mode
4. ✅ Wait 24 hours for certificate provisioning

---

## 📚 Documentation

- **DNS Configuration Guide**: `DNS_CONFIGURATION_GUIDE.md`
- **Railway Service**: https://railway.app/project/5d962626-4e7d-47da-978f-94dacc78d61a
- **GitHub Repository**: https://github.com/seankim-business/corp-system

---

## 🎓 Key Learnings

1. **Railway PORT Environment Variable**: Must use `envsubst` in Dockerfile to substitute $PORT at runtime
2. **Cloudflare Proxy Settings**: "Proxied" mode conflicts with Railway's SSL certificate
3. **DNS Configuration**: CNAME records must point to Railway's DNS target, not the service URL
4. **SSL/TLS**: Railway handles SSL automatically; Cloudflare should be in "DNS only" mode

---

## ✅ Deployment Complete

The landing page application is successfully deployed and running on Railway. The only remaining step is to configure DNS records in Cloudflare to route custom domains to the Railway service.

**Next Action**: Follow the manual steps above to add CNAME records in Cloudflare.

---

**Last Updated**: 2026-01-26  
**Deployed By**: Claude Code  
**Status**: Ready for DNS Configuration
