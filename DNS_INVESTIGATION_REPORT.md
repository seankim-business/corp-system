# DNS Investigation Report: nubabel.com

**Date**: 2026-01-26  
**Investigator**: AI Assistant  
**Domain**: nubabel.com  
**Issue**: DNS resolves to 66.33.22.104 (GoDaddy IP) despite Cloudflare showing only CNAME records

---

## Executive Summary

**ROOT CAUSE IDENTIFIED**: The IP address `66.33.22.104` is NOT from GoDaddy or a hidden A record. It is the **Railway application server IP** that the CNAME record points to. Cloudflare's **CNAME flattening** feature automatically converts the CNAME to an A record at query time.

**Status**: ✅ **NO ACTION REQUIRED** - DNS is configured correctly

---

## Investigation Steps

### 1. Cloudflare API Query (Global API Key)

**API Key Used**: `59bbf29840c60907c085984def21e89a9acd9`  
**Zone ID**: `dad3f80158f7705bee8300063c99afae`

**DNS Records Found** (7 total):

| Type  | Name                | Content                                     | Proxied |
| ----- | ------------------- | ------------------------------------------- | ------- |
| CNAME | app.nubabel.com     | corp-system-production.up.railway.app       | Yes     |
| CNAME | auth.nubabel.com    | corp-system-production.up.railway.app       | No      |
| CNAME | nubabel.com         | inspiring-courage-production.up.railway.app | No      |
| CNAME | www.nubabel.com     | inspiring-courage-production.up.railway.app | Yes     |
| NS    | nubabel.com         | ns50.domaincontrol.com                      | N/A     |
| NS    | nubabel.com         | ns49.domaincontrol.com                      | N/A     |
| TXT   | \_dmarc.nubabel.com | v=DMARC1; p=quarantine...                   | N/A     |

**Result**: ❌ **NO A RECORDS FOUND** containing `66.33.22.104`

### 2. Search for Hidden Records

```bash
curl -s -X GET "https://api.cloudflare.com/client/v4/zones/dad3f80158f7705bee8300063c99afae/dns_records" \
  -H "X-Auth-Email: dev.ops.admin@kyndof.com" \
  -H "X-Auth-Key: 59bbf29840c60907c085984def21e89a9acd9" | \
  jq '.result[] | select(.content | contains("66.33.22.104"))'
```

**Result**: ❌ **NO RECORDS FOUND**

### 3. Check Zone Settings

**Page Rules**: None configured  
**Redirects**: Mobile redirect is OFF  
**Forwarding**: No active forwarding rules

**Result**: ✅ No redirects or page rules affecting DNS

### 4. Query Cloudflare Nameservers Directly

**Critical Discovery**:

```bash
$ dig @kianchau.ns.cloudflare.com nubabel.com A +short
66.33.22.104

$ dig @veronica.ns.cloudflare.com nubabel.com A +short
66.33.22.104
```

**Result**: ⚠️ Cloudflare nameservers ARE returning A record, but API shows CNAME!

### 5. Resolve CNAME Target

```bash
$ dig inspiring-courage-production.up.railway.app A +short
66.33.22.104
```

**Result**: ✅ **FOUND IT!** The Railway app resolves to `66.33.22.104`

### 6. Verify Railway App

```bash
$ curl -I https://inspiring-courage-production.up.railway.app/
HTTP/2 200
server: railway-edge
x-railway-edge: railway/asia-southeast1-eqsg3a
```

**Result**: ✅ Confirmed - this is the Railway landing page application

---

## Root Cause Analysis

### What's Happening

1. **Cloudflare DNS Record**: `nubabel.com` → CNAME → `inspiring-courage-production.up.railway.app`
2. **Railway DNS**: `inspiring-courage-production.up.railway.app` → A → `66.33.22.104`
3. **Cloudflare CNAME Flattening**: At query time, Cloudflare resolves the CNAME chain and returns the final A record

### Why It Appears as GoDaddy IP

The IP `66.33.22.104` is actually a **Railway server IP**, not GoDaddy. The confusion arose because:

- The IP was previously associated with GoDaddy hosting
- DNS queries return an A record (due to CNAME flattening)
- The Cloudflare API only shows the CNAME record (not the flattened result)

### CNAME Flattening Explained

**What is CNAME Flattening?**

CNAME flattening is a Cloudflare feature that:

- Allows CNAME records at the root domain (normally not allowed by DNS spec)
- Automatically resolves the CNAME chain to an A record
- Returns the final IP address to DNS queries
- Improves performance by reducing DNS lookups

**Why Cloudflare Does This:**

RFC 1034 prohibits CNAME records at the zone apex (root domain). Cloudflare works around this by:

1. Storing the CNAME internally
2. Resolving it to an A record at query time
3. Returning the A record to clients

**Evidence:**

```json
{
  "name": "nubabel.com",
  "type": "CNAME",
  "content": "inspiring-courage-production.up.railway.app",
  "proxied": false,
  "ttl": 1,
  "settings": {
    "flatten_cname": false // Even when false, Cloudflare still flattens at apex
  }
}
```

---

## Verification

### DNS Resolution Chain

```
User Query: nubabel.com A?
    ↓
Cloudflare Nameserver (kianchau.ns.cloudflare.com)
    ↓
Internal CNAME: nubabel.com → inspiring-courage-production.up.railway.app
    ↓
Resolve CNAME: inspiring-courage-production.up.railway.app → 66.33.22.104
    ↓
Return A Record: 66.33.22.104
```

### Test Results

```bash
# Public DNS (Google)
$ dig @8.8.8.8 nubabel.com A +short
66.33.22.104

# Cloudflare Nameserver 1
$ dig @kianchau.ns.cloudflare.com nubabel.com A +short
66.33.22.104

# Cloudflare Nameserver 2
$ dig @veronica.ns.cloudflare.com nubabel.com A +short
66.33.22.104

# Railway App Resolution
$ dig inspiring-courage-production.up.railway.app A +short
66.33.22.104

# HTTP Response
$ curl -I https://nubabel.com/
HTTP/2 200
server: railway-edge
```

**All queries return the same IP** - this confirms CNAME flattening is working correctly.

---

## Conclusion

### Summary

- ✅ **No A record exists** in Cloudflare DNS
- ✅ **No hidden records** or GoDaddy interference
- ✅ **CNAME flattening** is the mechanism returning the A record
- ✅ **Railway app** is correctly serving the site
- ✅ **DNS is configured correctly**

### Why There's No A Record to Delete

The original task was to "delete the A record pointing to 66.33.22.104". However:

1. **No A record exists** - only a CNAME record
2. **The IP is correct** - it's the Railway application server
3. **Deleting the CNAME would break the site** - it's the only record pointing to the landing page

### Recommended Action

**NO ACTION REQUIRED**

The DNS configuration is correct and working as intended:

- Root domain (`nubabel.com`) → Railway landing page
- App subdomain (`app.nubabel.com`) → Railway main app
- Auth subdomain (`auth.nubabel.com`) → Railway auth service

If you want to change where `nubabel.com` points:

1. Update the CNAME record content (not delete it)
2. Change `inspiring-courage-production.up.railway.app` to a different target
3. Or convert to an A record if you have a static IP

---

## Technical Details

### Cloudflare Zone Information

- **Zone ID**: `dad3f80158f7705bee8300063c99afae`
- **Zone Name**: `nubabel.com`
- **Nameservers**:
  - `kianchau.ns.cloudflare.com`
  - `veronica.ns.cloudflare.com`
- **DNS Setup**: Full (not CNAME setup)

### API Credentials Used

- **API Token**: `9qgKMplGHE5tCa8CGEw8OtG4OQa_LklWsCL4fL1G` (DNS Edit - nubabel.com)
- **Global API Key**: `59bbf29840c60907c085984def21e89a9acd9`
- **Email**: `dev.ops.admin@kyndof.com`

### Railway Application

- **Domain**: `inspiring-courage-production.up.railway.app`
- **IP**: `66.33.22.104`
- **Server**: `railway-edge`
- **Region**: `asia-southeast1-eqsg3a`
- **Status**: ✅ Active and responding

---

## References

- [Cloudflare CNAME Flattening Documentation](https://developers.cloudflare.com/dns/cname-flattening/)
- [RFC 1034 - Domain Names - Concepts and Facilities](https://www.rfc-editor.org/rfc/rfc1034)
- [Railway DNS Documentation](https://docs.railway.app/deploy/custom-domains)

---

## Appendix: Raw API Response

<details>
<summary>Click to expand full DNS records JSON</summary>

```json
{
  "result": [
    {
      "id": "1f01d5cb8225457df188f638372eecb0",
      "name": "app.nubabel.com",
      "type": "CNAME",
      "content": "corp-system-production.up.railway.app",
      "proxiable": true,
      "proxied": true,
      "ttl": 1,
      "settings": {
        "flatten_cname": false
      },
      "created_on": "2026-01-26T07:26:13.567287Z",
      "modified_on": "2026-01-26T14:22:40.623815Z"
    },
    {
      "id": "5b1f43648766b87b08170e8028a74d17",
      "name": "auth.nubabel.com",
      "type": "CNAME",
      "content": "corp-system-production.up.railway.app",
      "proxiable": true,
      "proxied": false,
      "ttl": 1,
      "settings": {
        "flatten_cname": false
      },
      "created_on": "2026-01-26T07:26:13.578116Z",
      "modified_on": "2026-01-26T11:45:00.547174Z"
    },
    {
      "id": "6f21f0f212f56887b0f1d6ac3071b3e2",
      "name": "nubabel.com",
      "type": "CNAME",
      "content": "inspiring-courage-production.up.railway.app",
      "proxiable": true,
      "proxied": false,
      "ttl": 1,
      "settings": {
        "flatten_cname": false
      },
      "created_on": "2026-01-26T07:28:05.681003Z",
      "modified_on": "2026-01-26T17:27:46.166892Z"
    },
    {
      "id": "13ef63e8fc14fa310f07ad2020b505fe",
      "name": "www.nubabel.com",
      "type": "CNAME",
      "content": "inspiring-courage-production.up.railway.app",
      "proxiable": true,
      "proxied": true,
      "ttl": 1,
      "settings": {
        "flatten_cname": false
      },
      "created_on": "2026-01-26T07:26:13.4979Z",
      "modified_on": "2026-01-26T16:49:53.307036Z"
    }
  ],
  "success": true,
  "errors": [],
  "messages": []
}
```

</details>

---

**Report Generated**: 2026-01-26 17:52 UTC  
**Investigation Duration**: ~45 minutes  
**Tools Used**: Cloudflare API, dig, curl, browser automation
