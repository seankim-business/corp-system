# Fix Plan: CSP Blocking Cross-Subdomain API Calls

**Date**: 2026-01-30  
**Issue**: #5 - Content Security Policy blocking auth.nubabel.com API calls  
**Status**: Implementation Ready

---

## Problem Summary

The `helmet()` middleware in `src/index.ts` applies default CSP headers that block API calls from `app.nubabel.com` to `auth.nubabel.com`.

```
Content-Security-Policy: default-src 'self'
```

This causes `connect-src 'self'` to be applied as fallback, blocking cross-origin XHR/fetch requests.

---

## Fix Plan

### Step 1: Modify Helmet Configuration

**File**: `src/index.ts`  
**Line**: 138

**Before**:

```typescript
app.use(helmet());
```

**After**:

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://static.cloudflareinsights.com"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://auth.nubabel.com",
          "https://*.nubabel.com",
          // WebSocket for SSE/real-time features
          "wss://*.nubabel.com",
        ],
        fontSrc: ["'self'", "https:", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);
```

### Step 2: Rebuild and Deploy

```bash
# Local test
npm run build
npm run dev

# Deploy to Railway
git add src/index.ts
git commit -m "fix(security): configure CSP to allow cross-subdomain API calls

- Add explicit CSP directives instead of helmet defaults
- Allow connect-src to auth.nubabel.com for API calls
- Allow Cloudflare Insights script
- Maintain security with strict defaults for other directives

Fixes: Dashboard -> Login redirect loop (Issue #5)
Root cause: default-src 'self' blocked /auth/me requests"

git push
```

### Step 3: Verify Fix

1. Open browser DevTools
2. Navigate to `https://app.nubabel.com/dashboard`
3. Check Console - no CSP errors
4. Check Network - `/auth/me` returns 200 with JSON
5. Verify login flow works end-to-end

---

## CSP Directive Explanation

| Directive    | Value                       | Purpose                     |
| ------------ | --------------------------- | --------------------------- |
| `defaultSrc` | `'self'`                    | Baseline - only same origin |
| `scriptSrc`  | `'self'`, Cloudflare        | Allow app JS + analytics    |
| `styleSrc`   | `'self'`, `'unsafe-inline'` | Tailwind/styled-components  |
| `imgSrc`     | `'self'`, `data:`, `https:` | Images from anywhere        |
| `connectSrc` | `'self'`, `*.nubabel.com`   | **KEY: Allow API calls**    |
| `fontSrc`    | `'self'`, fonts             | Google Fonts etc            |
| `objectSrc`  | `'none'`                    | Block plugins (Flash etc)   |
| `frameSrc`   | `'none'`                    | Block iframes               |

---

## Rollback Plan

If issues occur, revert to permissive CSP temporarily:

```typescript
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP entirely
  }),
);
```

Then investigate and create proper CSP.

---

## Testing Checklist

- [ ] No CSP errors in console
- [ ] `/auth/me` request succeeds
- [ ] Login flow works (Google OAuth)
- [ ] Dashboard loads after login
- [ ] Organization switcher works
- [ ] Logout works
- [ ] Re-login after logout works

---

## Future Improvements

1. **CSP Report-Only Mode**: Test new CSP without blocking

   ```typescript
   contentSecurityPolicy: {
     reportOnly: true,
     reportUri: '/api/csp-report',
     // ... directives
   }
   ```

2. **Nonce-based Scripts**: Replace `'unsafe-inline'` with nonces

   ```typescript
   scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`];
   ```

3. **Environment-based CSP**: Different policies for dev/prod
   ```typescript
   const cspDirectives =
     process.env.NODE_ENV === "production" ? strictDirectives : relaxedDirectives;
   ```
