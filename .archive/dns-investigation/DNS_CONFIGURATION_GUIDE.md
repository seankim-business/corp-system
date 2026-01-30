# DNS Configuration Guide for nubabel.com

## Current Status

- ✅ Landing page application deployed successfully on Railway
- ✅ Service running at: `inspiring-courage-production.up.railway.app`
- ❌ Custom domains (nubabel.com, www.nubabel.com) returning 502 Bad Gateway
- ❌ DNS records not yet configured in Cloudflare

## Required DNS Configuration

### Railway DNS Target

```
arzjnzoq.up.railway.app
```

### DNS Records to Add in Cloudflare

#### 1. Root Domain (nubabel.com)

- **Type**: CNAME
- **Name**: @ (or leave blank for root)
- **Value**: arzjnzoq.up.railway.app
- **TTL**: Auto (or 3600)
- **Proxy Status**: DNS only (⚠️ Important - see note below)

#### 2. WWW Subdomain (www.nubabel.com)

- **Type**: CNAME
- **Name**: www
- **Value**: arzjnzoq.up.railway.app
- **TTL**: Auto (or 3600)
- **Proxy Status**: DNS only (⚠️ Important - see note below)

## Important Notes

### Cloudflare Proxy Settings

⚠️ **CRITICAL**: The domains are currently set to "Proxied" (orange cloud icon) in Cloudflare.

**Why this matters:**

- When Cloudflare proxies traffic, it acts as a man-in-the-middle
- Railway provides its own SSL certificate
- Cloudflare's SSL certificate may not match Railway's certificate
- This causes the 502 Bad Gateway error

**Solution:**

1. Go to Cloudflare DNS settings
2. Find the CNAME records for nubabel.com and www.nubabel.com
3. Change the proxy status from "Proxied" (orange cloud) to "DNS only" (gray cloud)
4. This allows Railway's SSL certificate to be used directly

### Alternative: Cloudflare Full SSL Mode

If you want to keep Cloudflare proxying:

1. Go to Cloudflare SSL/TLS settings
2. Change mode to "Full (strict)"
3. Ensure Railway's SSL certificate is properly provisioned
4. This may require additional configuration

## Step-by-Step Instructions

### In Cloudflare Dashboard:

1. **Navigate to DNS Records**
   - Go to your domain (nubabel.com)
   - Click "DNS" in the left sidebar
   - Click "Records"

2. **Add/Update CNAME for Root Domain**
   - Click "Add record"
   - Type: CNAME
   - Name: @ (root)
   - Content: arzjnzoq.up.railway.app
   - TTL: Auto
   - Proxy status: DNS only (gray cloud)
   - Click "Save"

3. **Add/Update CNAME for WWW**
   - Click "Add record"
   - Type: CNAME
   - Name: www
   - Content: arzjnzoq.up.railway.app
   - TTL: Auto
   - Proxy status: DNS only (gray cloud)
   - Click "Save"

4. **Verify SSL/TLS Settings**
   - Click "SSL/TLS" in left sidebar
   - Ensure mode is set appropriately (Full or Full Strict)
   - Check that SSL certificate is active

## Expected Timeline

- **DNS Propagation**: 5-30 minutes (up to 72 hours in rare cases)
- **SSL Certificate**: Usually automatic once DNS is configured
- **Testing**: After propagation, test both domains

## Testing Commands

Once DNS is configured, verify with:

```bash
# Check DNS resolution
nslookup nubabel.com
nslookup www.nubabel.com

# Check HTTP response
curl -I https://nubabel.com
curl -I https://www.nubabel.com

# Should return HTTP 200 with landing page content
```

## Troubleshooting

### Still Getting 502 Bad Gateway?

1. Check Cloudflare proxy status (should be DNS only)
2. Verify CNAME records are correct
3. Wait for DNS propagation (check with `nslookup`)
4. Check Railway service status (should be Online)
5. Check Railway SSL certificate status

### DNS Not Resolving?

1. Verify CNAME records in Cloudflare DNS settings
2. Check TTL (may need to wait for old records to expire)
3. Use `nslookup` or `dig` to verify propagation
4. Try flushing local DNS cache

### SSL Certificate Issues?

1. Check Railway SSL certificate status
2. Ensure Cloudflare SSL/TLS mode is compatible
3. Consider switching to "DNS only" mode in Cloudflare
4. Wait 24 hours for certificate provisioning

## Railway Configuration Reference

- **Service**: inspiring-courage
- **Project ID**: 5d962626-4e7d-47da-978f-94dacc78d61a
- **Service ID**: 1f13bfdc-ceb9-414f-9209-ca275215628d
- **Public URL**: https://inspiring-courage-production.up.railway.app
- **Root Directory**: /landing
- **Port**: 3000 (via $PORT env var)
- **Status**: Online ✅

## Next Steps

1. ✅ Add CNAME records in Cloudflare
2. ✅ Change proxy status to "DNS only"
3. ⏳ Wait for DNS propagation (5-30 minutes)
4. ✅ Test custom domains with curl or browser
5. ✅ Verify SSL certificate is working
6. ✅ Monitor for any 502 errors

---

**Last Updated**: 2026-01-26
**Status**: Awaiting DNS configuration in Cloudflare
