# Notion Webhook Integration

**Feature Request Pipeline - Notion Integration**

## Overview

This implementation adds Notion webhook support to the Feature Request Pipeline, allowing feature requests to be automatically captured when Notion pages are created or updated with type "Feature Request".

## Files Created

### 1. `/src/services/notion/client.ts`
Notion API client wrapper service for extracting content from Notion pages.

**Key Features:**
- Get page metadata and properties
- Extract all blocks from a page (recursively)
- Convert rich text blocks to plain text
- Support for multiple block types (paragraphs, headings, lists, code, etc.)

**API:**
```typescript
const client = getNotionClient();
const { page, blocks } = await client.getPageContent(pageId);
```

### 2. `/src/api/notion-webhooks.ts`
Webhook endpoint for receiving Notion events.

**Endpoint:** `POST /webhooks/notion`

**Features:**
- HMAC-SHA256 signature verification
- Support for `page.created` and `page.updated` events
- Filters for "Feature Request" page type
- Asynchronous processing (fast ACK)
- Integration with existing FeatureRequestIntakeService

**Headers Required:**
- `x-notion-signature`: HMAC signature for verification

**Environment Variables:**
- `NOTION_API_KEY`: Notion integration API key
- `NOTION_WEBHOOK_SECRET`: Webhook signing secret
- `DEFAULT_ORGANIZATION_ID`: Fallback organization ID

## Integration Points

### Existing Services Used
1. **FeatureRequestIntakeService** (`src/services/mega-app/feature-request-pipeline/intake.service.ts`)
   - `captureFromNotion()` method processes the extracted Notion content
   - Handles deduplication via `sourceRef`
   - Resolves Notion user IDs to internal user IDs

2. **NotionCaptureData Type** (`src/services/mega-app/feature-request-pipeline/types.ts`)
   - Provides the data structure for Notion captures
   - Includes page ID, title, properties, and blocks

### Route Registration
Added to `src/index.ts`:
```typescript
import { notionWebhooksRouter } from "./api/notion-webhooks";
app.use("/api", webhookRateLimiter, notionWebhooksRouter);
```

## Configuration

### Environment Variables
Add to `.env`:
```bash
# Notion Webhooks
NOTION_API_KEY="secret_..."
NOTION_WEBHOOK_SECRET="your-webhook-secret"
DEFAULT_ORGANIZATION_ID="your-default-org-id"
```

### Notion Setup
1. Create a Notion integration at https://www.notion.so/my-integrations
2. Add the integration to your Notion workspace
3. Configure webhook in Notion:
   - URL: `https://your-domain.com/webhooks/notion`
   - Events: `page.created`, `page.updated`
   - Generate webhook secret

### Page Type Detection
The webhook looks for a "Type" property with value "Feature Request":
- Property name: `Type` (case-insensitive)
- Property type: `select`
- Value: `Feature Request`

## Security

### Signature Verification
Uses HMAC-SHA256 with constant-time comparison:
```typescript
const signature = crypto.createHmac("sha256", secret)
  .update(bodyString)
  .digest("hex");

crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
```

### Rate Limiting
Uses `webhookRateLimiter` middleware (same as other webhooks).

## Data Flow

```
Notion Page Created/Updated
  ↓
Webhook Event → POST /webhooks/notion
  ↓
Signature Verification
  ↓
Page Type Check (is "Feature Request"?)
  ↓
Fast ACK Response (200 OK)
  ↓
[Async] Fetch Full Page Content
  ↓
[Async] Extract Text from Blocks
  ↓
[Async] FeatureRequestIntakeService.captureFromNotion()
  ↓
[Async] Create FeatureRequest in Database
```

## Organization Mapping

**Current Implementation:**
Uses `DEFAULT_ORGANIZATION_ID` environment variable.

**TODO for Production:**
Implement proper mapping between Notion workspace/database ID and organization:
```typescript
// Example future implementation
const org = await db.notionIntegration.findFirst({
  where: { databaseId: event.page.parent?.database_id }
});
```

## Testing

### Manual Testing
1. Create a Notion page with Type = "Feature Request"
2. Check server logs for webhook receipt
3. Verify feature request created in database

### Webhook Debugging
Enable debug logging:
```bash
LOG_LEVEL=debug
```

Check logs for:
- `Received Notion webhook`
- `Feature request captured from Notion webhook`

## Block Type Support

**Supported Block Types:**
- `paragraph`
- `heading_1`, `heading_2`, `heading_3`
- `bulleted_list_item`, `numbered_list_item`
- `to_do`, `toggle`, `quote`, `callout`, `code`

**Not Supported:**
- Images, files, embeds (skipped during extraction)

## Error Handling

All errors are logged but do not fail the webhook:
- Invalid signature → 401 response
- Missing required fields → 400 response
- Processing errors → Logged, but webhook returns 200 OK

This ensures Notion doesn't retry on permanent failures.

## Future Enhancements

1. **Multi-org Support**: Map Notion workspaces to organizations
2. **Custom Property Mapping**: Configure which Notion properties map to feature request fields
3. **Rich Content**: Preserve formatting, images, and attachments
4. **Bi-directional Sync**: Update Notion pages when feature request status changes
5. **Database Filtering**: Only subscribe to specific Notion databases
