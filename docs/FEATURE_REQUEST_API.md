# Feature Request API Documentation

## Overview

REST API endpoints for the Feature Request Pipeline system, enabling multi-channel feature request capture, analysis, and management.

## Files Created/Modified

### Created
- `src/api/feature-requests.ts` - Complete REST API implementation

### Modified
- `src/auth/rbac.ts` - Added `FEATURE_REQUEST_MANAGE` permission
- `src/index.ts` - Registered feature-requests router

## API Endpoints

### Public Endpoints (Authenticated Users)

#### `POST /api/feature-requests`
Submit a new feature request via web form.

**Request Body:**
```json
{
  "title": "string (5-200 chars)",
  "description": "string (10-5000 chars)",
  "category": "string (optional)",
  "urgency": "low" | "medium" | "high" (optional),
  "attachments": ["string"] (optional),
  "moduleContext": "string (optional)"
}
```

**Response (201):**
```json
{
  "success": true,
  "request": {
    "id": "uuid",
    "status": "new",
    "priority": 3,
    "createdAt": "timestamp"
  }
}
```

#### `GET /api/feature-requests`
List feature requests with filters and pagination.

**Query Parameters:**
- `status` - Filter by status (new, analyzing, backlog, planning, developing, released, merged, rejected)
- `priority` - Filter by priority (0=Critical, 1=High, 2=Medium, 3=Low)
- `moduleId` - Filter by related module
- `source` - Filter by source (web, slack, notion, email)
- `search` - Full-text search in content and analyzed intent
- `limit` - Results per page (1-100, default: 20)
- `offset` - Pagination offset (default: 0)

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid",
      "source": "web",
      "rawContent": "text",
      "analyzedIntent": "text",
      "relatedModules": ["module-id"],
      "tags": ["tag"],
      "priority": 3,
      "businessImpact": "medium",
      "requestCount": 1,
      "status": "new",
      "linkedModuleId": null,
      "createdAt": "timestamp"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### `GET /api/feature-requests/:id`
Get single feature request with full details.

**Response (200):**
```json
{
  "request": {
    "id": "uuid",
    "organizationId": "uuid",
    "source": "web",
    "sourceRef": "web-123",
    "requesterId": "uuid",
    "rawContent": "text",
    "analyzedIntent": "text",
    "relatedModules": ["module-id"],
    "tags": ["tag"],
    "priority": 3,
    "businessImpact": "medium",
    "requestCount": 1,
    "status": "new",
    "parentRequestId": null,
    "linkedModuleId": null,
    "createdAt": "timestamp",
    "requester": {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "John Doe"
    },
    "linkedRequests": [
      {
        "id": "uuid",
        "rawContent": "text",
        "status": "merged",
        "createdAt": "timestamp"
      }
    ]
  }
}
```

#### `GET /api/feature-requests/:id/status`
Track request status and get status history.

**Response (200):**
```json
{
  "currentStatus": "backlog",
  "priority": 2,
  "businessImpact": "high",
  "linkedModuleId": "module-123",
  "history": [
    {
      "action": "feature_request.status_changed",
      "timestamp": "timestamp",
      "details": {
        "newStatus": "backlog"
      }
    }
  ]
}
```

#### `POST /api/feature-requests/:id/vote`
Upvote a feature request (increases requestCount).

**Response (200):**
```json
{
  "success": true,
  "requestCount": 5
}
```

#### `POST /api/feature-requests/:id/comment`
Add comment/clarification to request.

**Request Body:**
```json
{
  "text": "string (1-2000 chars)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Comment added successfully"
}
```

### Admin Endpoints (Require `FEATURE_REQUEST_MANAGE` Permission)

#### `PATCH /api/feature-requests/:id`
Update request status, priority, or linked module.

**Request Body:**
```json
{
  "status": "backlog" (optional),
  "priority": 2 (optional, 0-3),
  "linkedModuleId": "module-id" (optional),
  "tags": ["tag1", "tag2"] (optional),
  "relatedModules": ["module-id"] (optional)
}
```

**Response (200):**
```json
{
  "success": true,
  "request": { /* updated request */ }
}
```

#### `POST /api/feature-requests/:id/merge`
Merge duplicate requests into this one.

**Request Body:**
```json
{
  "targetRequestIds": ["uuid1", "uuid2"]
}
```

**Response (200):**
```json
{
  "success": true,
  "primaryRequestId": "uuid",
  "mergedRequestIds": ["uuid1", "uuid2"],
  "totalRequestCount": 10
}
```

## Permissions

### `FEATURE_REQUEST_MANAGE`
Granted to: **Owner**, **Admin**

Allows:
- Updating feature request status, priority, linked modules
- Merging duplicate requests
- Managing tags and related modules

## Database Schema

Uses existing `FeatureRequest` model from Prisma schema:
```prisma
model FeatureRequest {
  id             String   @id @default(uuid())
  organizationId String
  source         String   // slack, web, notion, email
  sourceRef      String?
  requesterId    String?
  rawContent     String
  analyzedIntent String?
  relatedModules String[]
  tags           String[]
  priority       Int      @default(3) // 0-3
  businessImpact String?
  requestCount   Int      @default(1)
  status         String   @default("new")
  parentRequestId String?  // Merged into
  linkedModuleId  String?  // When implemented
  createdAt      DateTime @default(now())
}
```

## Integration with Feature Request Pipeline

This API serves as the REST interface for the Feature Request Pipeline service located at:
- `src/services/mega-app/feature-request-pipeline/`

The pipeline includes:
- Multi-channel capture (Slack, Web, Notion, Email)
- AI-powered analysis and intent extraction
- Deduplication and similarity detection
- Priority calculation
- Module mapping

## Usage Examples

### Submit a feature request
```bash
curl -X POST https://api.nubabel.com/api/feature-requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add dark mode to dashboard",
    "description": "Users want a dark mode option for better visibility in low light",
    "category": "ui-enhancement",
    "urgency": "medium",
    "moduleContext": "dashboard-module"
  }'
```

### List backlog items
```bash
curl "https://api.nubabel.com/api/feature-requests?status=backlog&priority=1&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

### Upvote a request
```bash
curl -X POST https://api.nubabel.com/api/feature-requests/$REQUEST_ID/vote \
  -H "Authorization: Bearer $TOKEN"
```

### Admin: Update status
```bash
curl -X PATCH https://api.nubabel.com/api/feature-requests/$REQUEST_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "planning",
    "priority": 1,
    "linkedModuleId": "dashboard-module"
  }'
```

### Admin: Merge duplicates
```bash
curl -X POST https://api.nubabel.com/api/feature-requests/$PRIMARY_ID/merge \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetRequestIds": ["uuid1", "uuid2", "uuid3"]
  }'
```

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden (missing permission)
- `404` - Resource not found
- `500` - Internal server error

Error response format:
```json
{
  "error": "Error message",
  "details": { /* Zod validation errors if applicable */ }
}
```

## Security

- All endpoints require authentication via session cookie or Bearer token
- Organization context is enforced via RLS (Row-Level Security)
- Admin endpoints require `FEATURE_REQUEST_MANAGE` permission
- Rate limiting applied via `apiRateLimiter` middleware
- CSRF protection enabled
- Audit logging for all mutations

## Next Steps

To fully activate the Feature Request Pipeline:
1. Implement pipeline service methods in `src/services/mega-app/feature-request-pipeline/`
2. Connect Slack webhook for slack-source captures
3. Implement AI analysis integration
4. Add notification system for status changes
5. Create frontend widget for embedding in modules
