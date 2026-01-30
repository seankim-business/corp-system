# Troubleshooting Guide Index

Production issue debugging guides for Nubabel platform.

## Active Issues

| Issue | Status | Priority | Document |
| ----- | ------ | -------- | -------- |
| None  | -      | -        | -        |

## Resolved Issues Archive

| Issue                   | Resolved   | Root Cause                 | Document                                                                                                  |
| ----------------------- | ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| CSP Blocking API Calls  | 2026-01-30 | Helmet default CSP         | [AUTH_REDIRECT_LOOP.md#issue-5](./AUTH_REDIRECT_LOOP.md#issue-5-content-security-policy-csp-blocking-api) |
| Auth Race Condition     | 2026-01-28 | isLoading initial false    | [AUTH_REDIRECT_LOOP.md#issue-1](./AUTH_REDIRECT_LOOP.md#issue-1-auth-race-condition)                      |
| Cross-Subdomain Cookie  | 2026-01-29 | Cookie domain/sameSite     | [AUTH_REDIRECT_LOOP.md#issue-2](./AUTH_REDIRECT_LOOP.md#issue-2-cross-subdomain-cookie-sharing)           |
| Cookie Domain Fallback  | 2026-01-29 | Missing COOKIE_DOMAIN      | [AUTH_REDIRECT_LOOP.md#issue-3](./AUTH_REDIRECT_LOOP.md#issue-3-cookie-domain-auto-detection)             |
| VITE_API_BASE_URL Empty | 2026-01-29 | Frontend env misconfigured | [AUTH_REDIRECT_LOOP.md#issue-4](./AUTH_REDIRECT_LOOP.md#issue-4-empty-vite_api_base_url)                  |

## Quick Links

- [Debug Commands](./AUTH_REDIRECT_LOOP.md#debug-commands)
- [Environment Variables](./AUTH_REDIRECT_LOOP.md#environment-variables-reference)
- [Prevention Checklist](./AUTH_REDIRECT_LOOP.md#prevention-checklist)

## Adding New Troubleshooting Guides

1. Create `{ISSUE_NAME}.md` in this directory
2. Follow the template structure:
   - Symptoms
   - Root Cause
   - Solution
   - Files Changed
   - Debug Commands
3. Update this README index

## Contact

For urgent production issues: @sean in Slack #engineering
