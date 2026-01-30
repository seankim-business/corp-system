# Feature Request Pipeline

Multi-channel feature request capture and analysis system for the Mega App architecture.

## Overview

The Feature Request Pipeline automatically captures, analyzes, and manages feature requests from multiple channels:

- **Slack**: Mentions, reactions, keyword detection
- **Web**: Direct submission forms
- **Notion**: Page sync
- **Email**: Inbound email processing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Capture Layer                            │
│  - Slack (@mention, :bulb: emoji, keywords)                  │
│  - Web (forms, feedback widget)                              │
│  - Notion (webhook sync)                                     │
│  - Email (inbound parse)                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Feature Request Database                        │
│  - Deduplication (by sourceRef)                              │
│  - Status tracking (new → analyzing → backlog → ...)         │
│  - Metadata preservation                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              AI Analysis (Future)                            │
│  - Intent extraction                                         │
│  - Module mapping                                            │
│  - Priority calculation                                      │
│  - Deduplication detection                                   │
└─────────────────────────────────────────────────────────────┘
```

## Slack Integration

### 1. Direct Mentions

```
@nubabel feature request: Add dark mode for better UX
```

When users mention `@nubabel` with feature request keywords, the system:
1. Detects the feature request pattern
2. Captures the message and thread context
3. Stores in database with `source: 'slack'`
4. Replies with confirmation and tracking ID
5. Adds 📝 emoji reaction

### 2. :bulb: Emoji Reactions

Users can react to ANY message with 💡 to mark it as a feature request:

1. System fetches the original message
2. Captures message + thread context
3. Notifies user with ephemeral message
4. Adds 📝 emoji for confirmation

### 3. Keyword Detection

Keywords automatically detected:
- Korean: "기능 요청", "기능요청", "이런거 있으면", "추가해주세요", "필요한 기능"
- English: "feature request", "can we have", "would be nice if", "please add"

## Database Schema

```prisma
model FeatureRequest {
  id             String   @id @default(uuid())
  organizationId String

  // Source tracking
  source         String   // "slack" | "web" | "notion" | "email"
  sourceRef      String   // "{channel}:{messageTs}" for Slack
  requesterId    String?  // User who requested

  // Content
  rawContent     String   // Original request + metadata
  analyzedIntent String?  // AI-extracted intent (future)

  // Categorization
  relatedModules String[] // Matched modules (future)
  tags           String[] // Auto-generated tags

  // Priority
  priority       Int      // 0=Critical, 1=High, 2=Medium, 3=Low
  businessImpact String?
  requestCount   Int      // Duplicate count

  // Status
  status         String   // "new" | "analyzing" | "backlog" | ...

  createdAt      DateTime
  updatedAt      DateTime
}
```

## Usage

### Capture from Slack

```typescript
import { captureFromSlack } from "./capture.service";

const result = await captureFromSlack(
  organizationId,
  requesterId,
  {
    channelId: "C123",
    channelName: "general",
    messageTs: "1234.5678",
    threadTs: "1234.0000",
    userId: "U456",
    userName: "John Doe",
    text: "Can we have better search?",
    threadContext: [
      { userId: "U456", text: "With filters", ts: "1234.5679" }
    ]
  }
);

if (result.success) {
  console.log("Feature request captured:", result.id);
}
```

### Capture from Web

```typescript
import { captureFromWeb } from "./capture.service";

const result = await captureFromWeb(
  organizationId,
  requesterId,
  {
    title: "Dark Mode Feature",
    description: "We need dark mode for better UX at night",
    category: "UI/UX",
    urgency: "medium",
    pageContext: "/dashboard/analytics"
  }
);
```

## Implementation Status

### ✅ Phase 1: Capture (Complete)
- [x] Slack mention detection
- [x] :bulb: emoji reactions
- [x] Keyword pattern matching
- [x] Database storage
- [x] Deduplication (by sourceRef)
- [x] Thread context collection

### 🚧 Phase 2: Analysis (Planned)
- [ ] Feature Analyzer Agent
- [ ] Intent extraction
- [ ] Module mapping
- [ ] Priority calculation
- [ ] Semantic deduplication

### 📅 Phase 3: Workflow (Planned)
- [ ] Auto-merge duplicates
- [ ] Backlog prioritization UI
- [ ] Stakeholder notifications
- [ ] Development task breakdown

## Testing

```bash
# Run unit tests
npm test -- feature-request-capture

# Test Slack integration
curl -X POST http://localhost:3000/api/slack/events \
  -H "Content-Type: application/json" \
  -d '{"type": "app_mention", ...}'
```

## Files

- `capture.service.ts` - Core capture logic for all channels
- `types.ts` - TypeScript type definitions
- `index.ts` - Public exports
- `README.md` - This file

## Future Enhancements

1. **AI Analysis Agent** - Extract intent, map to modules, calculate priority
2. **Semantic Deduplication** - Use embeddings to find similar requests
3. **Auto-linking** - Automatically link related requests
4. **Requester Analytics** - Track which users/teams request most
5. **Impact Scoring** - Business value calculation
6. **Release Tracking** - Link requests to releases
7. **Feedback Loop** - Post-release validation

## Related Documentation

- [Mega App Architecture Plan](/.omc/plans/mega-app-architecture.md)
- [Feature Request Pipeline Spec](/.omc/plans/mega-app-architecture.md#20-feature-request--development--release-pipeline)
