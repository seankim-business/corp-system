# Sentry Error Tracking Setup

This guide explains how to configure Sentry for Nubabel production monitoring.

## 1) Get your Sentry DSN

1. Create or open the project in Sentry.
2. Go to **Settings → Projects → Nubabel → Client Keys (DSN)**.
3. Copy the DSN and set it in your environment:

```bash
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
```

## 2) Verify events in Sentry

- Start the server in development and hit the test endpoint:

```bash
GET /debug/sentry-test
```

> Note: Events are **not sent** in development by default. The endpoint is only for manual testing.

## 3) Alerts & notifications

Recommended production alerts:

- **Error rate threshold** (e.g., > 5 errors / 5 minutes)
- **New issue created** (immediate notification)
- **Performance degradation** (optional, based on tracing)

Set alerts in **Alerts → Create Alert Rule** within Sentry.

## 4) Source maps for better stack traces

TypeScript source maps are enabled in `tsconfig.json`:

```json
"sourceMap": true
```

For production builds, upload source maps with the release value:

```bash
export SENTRY_RELEASE=${RAILWAY_GIT_COMMIT_SHA:-dev}
export SENTRY_ORG=<your-org>
export SENTRY_PROJECT=nubabel

npx sentry-cli releases new "$SENTRY_RELEASE"
npx sentry-cli releases files "$SENTRY_RELEASE" upload-sourcemaps dist --rewrite
npx sentry-cli releases finalize "$SENTRY_RELEASE"
```

## 5) Common error patterns

We intentionally filter out:

- **ECONNREFUSED** connection errors
- **Expected/operational errors** (validation, auth, user input)

If you need to capture additional errors, adjust the filters in:

- `src/services/sentry.ts` (`beforeSend`)
- `src/middleware/error-handler.ts` (`shouldCapture` logic)

## 6) Security & privacy

We avoid sending sensitive data:

- No cookies or authorization headers
- Only minimal request metadata is sent

If you add new context, keep it free of PII and secrets.
