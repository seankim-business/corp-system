# SendGrid Inbound Parse Implementation

**Status**: ✅ Complete
**Date**: 2026-01-30

## Overview

Implemented email-based feature request capture via SendGrid Inbound Parse webhook.

## Components Created

### 1. Email Parser Service
**File**: `src/services/email/inbound-parser.ts`

Parses incoming emails from SendGrid's multipart/form-data webhook into `EmailCaptureData` format.

**Features**:
- Parse from/to/subject fields
- Extract plain text body (with HTML fallback)
- Strip HTML tags and convert to plain text
- Parse attachment metadata
- Match uploaded files with metadata
- Generate message IDs if not provided
- Extract reply-to addresses
- Normalize email addresses

### 2. Email Webhooks API
**File**: `src/api/email-webhooks.ts`

Handles inbound email webhooks from SendGrid.

**Endpoints**:
- `POST /webhooks/email/inbound` - Receives emails from SendGrid
- `GET /webhooks/email/health` - Health check endpoint

**Features**:
- Multer integration for file uploads (max 10MB per file, 10 files total)
- Organization resolution from recipient email (3 strategies)
- Integration with feature request intake service
- Automatic acknowledgment email sending
- Graceful error handling (always returns 200 to SendGrid)

**Organization Resolution Strategies**:
1. Parse subdomain from `features@{subdomain}.nubabel.com`
2. Lookup by custom domain in organization settings
3. Match sender's email domain to organization members

### 3. Email Acknowledgment Service
**File**: `src/services/email/acknowledgment.service.ts`

Sends confirmation emails to feature request submitters.

**Features**:
- Success acknowledgment with tracking ID
- Error acknowledgment for processing failures
- HTML and plain text versions
- Professional email templates
- SendGrid API integration

**Email Templates**:
- Success: Includes tracking ID and next steps
- Error: Explains issue and provides support contact

## Routes Registered

Added to `src/index.ts`:
```typescript
import { emailWebhooksRouter } from "./api/email-webhooks";
app.use("/webhooks/email", webhookRateLimiter, emailWebhooksRouter);
```

## SendGrid Configuration

### Required Environment Variables
```bash
SENDGRID_API_KEY=your_api_key
SENDGRID_FROM_EMAIL=noreply@nubabel.com
SENDGRID_FROM_NAME="Nubabel Feature Requests"
```

### Inbound Parse Setup
1. Go to SendGrid → Settings → Inbound Parse
2. Add new domain: `nubabel.com`
3. Configure subdomain: `features` (for `features@acme.nubabel.com`)
4. Set webhook URL: `https://your-domain.com/webhooks/email/inbound`
5. Check "POST the raw, full MIME message"

## Expected Email Format

**Recipient**: `features@{org-subdomain}.nubabel.com`
**Example**: `features@acme.nubabel.com`

**SendGrid Payload** (multipart/form-data):
```
from: sender@example.com
to: features@acme.nubabel.com
subject: Feature Request Title
text: Email body in plain text
html: <html>Email body in HTML</html>
attachments: {"attachment1": {"filename": "doc.pdf", "type": "application/pdf"}}
attachment1: [file data]
```

## Integration with Feature Request Pipeline

Uses existing intake service:
```typescript
const intakeService = getIntakeService();
const capturedRequest = await intakeService.captureFromEmail(
  organizationId,
  emailData
);
```

Captured requests are automatically:
1. Stored in `FeatureRequest` table
2. Deduplicated by message ID
3. User resolved via email address
4. Ready for AI analysis (next pipeline stage)

## Testing

### Manual Testing
```bash
# Send test email
curl -X POST http://localhost:3000/webhooks/email/inbound \
  -H "Content-Type: multipart/form-data" \
  -F "from=test@example.com" \
  -F "to=features@acme.nubabel.com" \
  -F "subject=Test Feature Request" \
  -F "text=Please add dark mode support"
```

### Health Check
```bash
curl http://localhost:3000/webhooks/email/health
```

## Error Handling

- **Organization not found**: Sends error acknowledgment to sender
- **Processing failure**: Logs error, still returns 200 to prevent SendGrid retries
- **SendGrid API failure**: Logs warning, continues processing (acknowledgment is optional)

## Dependencies Added

```bash
npm install multer
npm install --save-dev @types/multer
```

## Type Safety

All components fully typed with TypeScript:
- ✅ SendGrid payload interface
- ✅ EmailCaptureData integration
- ✅ Express multer file handling
- ✅ Database queries

## Files Modified

1. `src/index.ts` - Added route registration
2. Created `src/services/email/inbound-parser.ts`
3. Created `src/services/email/acknowledgment.service.ts`
4. Created `src/api/email-webhooks.ts`

## Next Steps

1. Configure SendGrid Inbound Parse with webhook URL
2. Add DNS records for email routing
3. Test with real emails
4. Monitor acknowledgment email delivery
5. Set up alerts for processing failures

## References

- [SendGrid Inbound Parse Docs](https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook)
- [Feature Request Pipeline Plan](../.omc/plans/mega-app-architecture.md#section-20-1-1)
- [Intake Service](../src/services/mega-app/feature-request-pipeline/intake.service.ts)
