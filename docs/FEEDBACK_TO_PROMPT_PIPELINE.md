# Feedback-to-Prompt Improvement Pipeline (E3-T2)

## Overview

Automated pipeline that analyzes user corrections from Slack feedback to detect patterns and generate prompt improvement suggestions for AI agents.

## Architecture

### 1. Data Flow

```
FeedbackCapture (corrections)
  → Weekly Job (feedback-analysis.job.ts)
  → Pattern Detection (prompt-improvement.service.ts + Claude API)
  → PromptSuggestion (database)
  → Admin Notification
  → Manual Review & Approval
```

### 2. Components

#### Service: `src/services/prompt-improvement.service.ts`

Core service for analyzing corrections and generating suggestions.

**Functions:**
- `analyzeCorrections(feedbacks)` - Analyzes corrections to detect common error patterns
- `generatePromptSuggestion(pattern)` - Generates prompt modification from detected pattern
- `storePromptSuggestion(suggestion)` - Saves suggestion for review
- `getPendingSuggestions(orgId)` - Retrieves pending suggestions
- `approveSuggestion(suggestionId, approvedBy)` - Approves a suggestion
- `rejectSuggestion(suggestionId)` - Rejects a suggestion

**Pattern Detection:**
Uses Claude API (claude-3-5-sonnet-20241022) to identify:
- Missing information patterns
- Wrong format patterns
- Incorrect reasoning patterns
- Tone mismatch patterns
- Other recurring error types

**Types:**
```typescript
interface CorrectionPattern {
  id: string;
  organizationId: string;
  agentType: string | null;
  patternType: string;
  description: string;
  examples: Array<{
    original: string;
    correction: string;
    context?: Record<string, unknown>;
  }>;
  frequency: number;
  confidence: number;
  createdAt: Date;
}

interface PromptSuggestion {
  id: string;
  organizationId: string;
  agentType: string | null;
  patternId: string;
  currentPrompt: string | null;
  suggestedPrompt: string;
  reason: string;
  confidence: number;
  status: "pending" | "approved" | "rejected";
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

#### Job: `src/jobs/feedback-analysis.job.ts`

Weekly scheduled job that runs the analysis pipeline.

**Functions:**
- `runFeedbackAnalysis()` - Runs for all organizations
- `runFeedbackAnalysisForOrg(orgId, options?)` - Runs for single org (manual trigger)

**Configuration:**
- `LOOKBACK_DAYS = 7` - Analyzes past week of data
- `MIN_CORRECTIONS_FOR_PATTERN = 2` - Minimum corrections needed
- `MIN_CONFIDENCE_FOR_SUGGESTION = 0.7` - Confidence threshold

**Schedule:**
- Runs every Sunday at midnight UTC
- Configured in `src/utils/scheduler.ts`

#### Database: `PromptSuggestion` Model

```prisma
model PromptSuggestion {
  id              String   @id @default(uuid())
  organizationId  String   @map("organization_id")
  agentType       String?  @map("agent_type")
  patternId       String   @map("pattern_id")
  currentPrompt   String?  @map("current_prompt")
  suggestedPrompt String   @map("suggested_prompt")
  reason          String   // Pattern description
  confidence      Float    // 0-1 confidence score
  status          String   @default("pending") // pending/approved/rejected
  approvedBy      String?  @map("approved_by")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

## Usage

### Automatic (Scheduled)

The job runs automatically every Sunday at midnight UTC. No action required.

### Manual Trigger

```typescript
import { runFeedbackAnalysisForOrg } from './jobs/feedback-analysis.job';

// Analyze single organization
const result = await runFeedbackAnalysisForOrg('org-uuid-here', {
  lookbackDays: 7,
  minConfidence: 0.7
});

console.log(result);
// {
//   feedbackCount: 15,
//   patternsDetected: 3,
//   suggestionsGenerated: 2,
//   duration: 12500
// }
```

### Review Suggestions

```typescript
import {
  getPendingSuggestions,
  approveSuggestion,
  rejectSuggestion
} from './services/prompt-improvement.service';

// Get pending suggestions
const suggestions = await getPendingSuggestions('org-uuid');

// Review and approve/reject
for (const suggestion of suggestions) {
  console.log(`Pattern: ${suggestion.reason}`);
  console.log(`Confidence: ${suggestion.confidence}`);
  console.log(`Suggested: ${suggestion.suggestedPrompt}`);

  // Approve
  await approveSuggestion(suggestion.id, 'admin-user-uuid');

  // Or reject
  // await rejectSuggestion(suggestion.id);
}
```

## Example Flow

### 1. User Corrections Captured

```
Original: "The meeting is at 3pm"
Correction: "Please format the time with timezone: 3:00 PM EST"
```

### 2. Pattern Detected

```json
{
  "patternType": "missing_timezone",
  "description": "Agent responses about time/dates are missing timezone information",
  "confidence": 0.85,
  "frequency": 5
}
```

### 3. Suggestion Generated

```
Current Prompt: "You are a helpful assistant..."
Suggested Addition: "When providing times or dates, always include the timezone (e.g., '3:00 PM EST'). Never assume the user's timezone."
```

### 4. Admin Review

- Email/Slack notification sent to admin
- Admin reviews in settings UI
- Approves or rejects suggestion
- If approved, prompt is updated

## Monitoring

### Metrics

Tracked via `metrics.increment()`:
- `prompt_improvement.patterns_detected` - Number of patterns found
- `prompt_improvement.suggestions_created` - Suggestions generated
- `prompt_improvement.suggestions_approved` - Approved by admin
- `prompt_improvement.suggestions_rejected` - Rejected by admin

### Logs

Key log messages:
- `"Correction pattern analysis completed"` - Analysis summary
- `"Generated prompt suggestion from pattern"` - Suggestion created
- `"Prompt suggestion approved"` - Manual approval
- `"Weekly feedback analysis completed"` - Job completion

## Configuration

### Environment Variables

None required. Uses existing:
- `DATABASE_URL` - PostgreSQL connection
- `ANTHROPIC_API_KEY` - Claude API access
- `FRONTEND_URL` - For notification links (optional)

### Scheduler Configuration

In `src/utils/scheduler.ts`:
- Calculates next Sunday at midnight UTC
- Runs weekly thereafter
- Timer unref'd to not block process shutdown

## Future Enhancements

### Phase 1 (Current)
- ✅ Weekly analysis
- ✅ Pattern detection
- ✅ Suggestion generation
- ✅ Manual approval workflow

### Phase 2 (TODO)
- [ ] Email notifications
- [ ] Slack notifications (when service available)
- [ ] Admin UI for review
- [ ] A/B testing of approved suggestions
- [ ] Automatic prompt updates for high-confidence patterns

### Phase 3 (TODO)
- [ ] Real-time pattern detection
- [ ] Multi-language support
- [ ] Pattern evolution tracking
- [ ] Feedback loop metrics (before/after improvement)
- [ ] Integration with prompt versioning system

## Dependencies

- `@anthropic-ai/sdk` - Claude API for pattern detection
- `@prisma/client` - Database access
- Existing: logging, metrics, scheduler infrastructure

## Testing

### Manual Test

1. Add test corrections:
```sql
INSERT INTO feedback_captures (
  organization_id, user_id, slack_message_ts,
  feedback_type, original_message, correction, metadata
) VALUES (
  'your-org-uuid', 'user-uuid', '1234567890.000000',
  'correction',
  'The task is done',
  'Please provide more details: which specific task, who completed it, and when?',
  '{"agentType": "executor"}'::jsonb
);
```

2. Run job manually:
```typescript
import { runFeedbackAnalysis } from './jobs/feedback-analysis.job';
const result = await runFeedbackAnalysis();
console.log(result);
```

3. Check suggestions:
```sql
SELECT * FROM prompt_suggestions WHERE status = 'pending';
```

## Troubleshooting

### No patterns detected
- Check if `MIN_CORRECTIONS_FOR_PATTERN` is too high
- Verify corrections have `agentType` in metadata
- Check Claude API rate limits

### Low confidence scores
- Need more correction examples (increase `LOOKBACK_DAYS`)
- Corrections may be too diverse (no clear pattern)
- Adjust `MIN_CONFIDENCE_FOR_SUGGESTION` threshold

### Job not running
- Check scheduler started: `startScheduledTasks()` called in main
- Verify next run time in logs
- Check for errors in scheduled task execution

## Related Components

- E3-T1: Feedback capture from Slack (prerequisite)
- E5-T1: Risk scoring (uses similar pattern detection)
- Existing: `prompt-optimizer.ts` (prompt variant A/B testing)
