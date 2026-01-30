# Pattern-Based Response Optimization (E3-T3)

## Overview

Pattern-based response optimization is the core feature of Phase 3 Intelligence Layer that enables the system to learn from user feedback and automatically improve agent responses. This feature is part of the "Human as Training Data" concept where the AI learns from user corrections.

## Architecture

### Components

1. **FeedbackCapture** (`src/services/feedback-capture.service.ts`)
   - Captures user corrections when they edit AI responses
   - Stores feedback in `feedback_captures` table
   - Links corrections to agent executions

2. **Prompt Improvement Service** (`src/services/prompt-improvement.service.ts`)
   - Analyzes feedback corrections to detect patterns (E3-T1)
   - Generates prompt suggestions to fix patterns (E3-T2)
   - Classifies error types: missing_info, wrong_format, incorrect_reasoning, tone_mismatch, etc.

3. **Pattern Optimizer** (`src/services/pattern-optimizer.ts`) ✨ **NEW**
   - Retrieves relevant patterns for agent executions (E3-T3)
   - Filters patterns by confidence threshold (>80%)
   - Applies pattern context to agent prompts
   - Tracks pattern application for analytics

4. **AI Executor Integration** (`src/orchestrator/ai-executor.ts`)
   - Automatically applies patterns before agent execution
   - Enhances system prompts with learned guidance
   - Tracks which patterns were applied

## How It Works

### 1. Pattern Discovery Flow

```
User Correction (FeedbackCapture)
  ↓
Pattern Detection (Prompt Improvement Service)
  ↓
Pattern Review & Approval (Admin)
  ↓
Pattern Application (Pattern Optimizer)
  ↓
Improved Agent Response
```

### 2. Pattern Application Logic

When an agent execution starts:

1. **Retrieve Patterns**: Query approved patterns for organization + agent type
2. **Filter by Confidence**: Only use patterns with >80% confidence
3. **Filter by Relevance**: Score patterns by query keyword overlap
4. **Limit Patterns**: Maximum 5 patterns per request to prevent prompt bloat
5. **Apply Context**: Prepend pattern guidance to system prompt
6. **Track Application**: Store which patterns were applied in execution metadata

### 3. Pattern Context Format

Patterns are injected as structured guidance:

```
=== LEARNED PATTERNS (from user feedback) ===

The following patterns have been learned from previous user corrections.
Please incorporate these learnings into your response:

[LEARNED PATTERN - missing_info]
Based on previous corrections: Always include input validation and error handling
Confidence: 90%
Recommendation: Apply this learning to avoid similar errors.

---

[LEARNED PATTERN - wrong_format]
Based on previous corrections: Use TypeScript with explicit type annotations
Confidence: 85%
Recommendation: Apply this learning to avoid similar errors.

=== END LEARNED PATTERNS ===

[Original system prompt...]
```

## Configuration

### Confidence Threshold

Default: **0.8** (80%)

Only patterns with confidence above this threshold are automatically applied. This ensures high-quality guidance.

### Pattern Limit

Default: **5 patterns per request**

Prevents prompt bloat while still providing valuable context.

### Cache TTL

Default: **1 hour**

Pattern cache is refreshed hourly to balance performance and freshness.

## API Endpoints

### Get Pattern Statistics

```bash
GET /api/pattern-analytics/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPatterns": 42,
    "highConfidencePatterns": 18,
    "patternsByType": {
      "missing_info": 12,
      "wrong_format": 8,
      "incorrect_reasoning": 6,
      "tone_mismatch": 3
    },
    "avgConfidence": 0.82
  }
}
```

### Clear Pattern Cache

```bash
POST /api/pattern-analytics/clear-cache
Authorization: Bearer <token>
Content-Type: application/json

{
  "agentType": "data_agent"  // Optional: clear cache for specific agent
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cache cleared for agent type: data_agent"
}
```

## Usage

### Automatic Application

Pattern optimization is **enabled by default** for all agent executions. No code changes required.

### Programmatic Control

```typescript
import { executeWithAI } from "./orchestrator/ai-executor";

const result = await executeWithAI({
  category: "writing",
  skills: ["summarization"],
  prompt: "Summarize this document...",
  sessionId: "session-123",
  organizationId: "org-456",
  userId: "user-789",
  agentType: "data_agent",
  enablePatternOptimization: true, // Enabled by default
});

// Check applied patterns
console.log(result.metadata.appliedPatterns);
// [
//   { id: "pattern-1", type: "missing_info", confidence: 0.90 },
//   { id: "pattern-2", type: "wrong_format", confidence: 0.85 }
// ]
```

### Disable for Specific Execution

```typescript
const result = await executeWithAI({
  // ... other params
  enablePatternOptimization: false, // Disable pattern application
});
```

## Metrics

Pattern optimizer emits the following metrics:

### Counters

- `pattern_optimizer.patterns_retrieved`: Number of patterns retrieved from database
- `pattern_optimizer.patterns_applied`: Number of patterns applied to prompts
- `pattern_optimizer.pattern_used`: Number of times each pattern type was used

### Histograms

- `pattern_optimizer.confidence_level`: Distribution of pattern confidence scores

### Tags

All metrics include:
- `organizationId`: Organization identifier
- `patternType`: Pattern classification (missing_info, wrong_format, etc.)

## Database Schema

### PromptSuggestion Table

Stores approved patterns that are applied during execution:

```sql
CREATE TABLE prompt_suggestions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  agent_type VARCHAR,
  pattern_id VARCHAR NOT NULL,
  current_prompt TEXT,
  suggested_prompt TEXT NOT NULL,
  reason TEXT NOT NULL,
  confidence FLOAT NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  approved_by VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prompt_suggestions_org_agent ON prompt_suggestions(organization_id, agent_type);
CREATE INDEX idx_prompt_suggestions_status ON prompt_suggestions(status);
CREATE INDEX idx_prompt_suggestions_confidence ON prompt_suggestions(confidence);
```

## Testing

### Unit Tests

```bash
npm test src/services/__tests__/pattern-optimizer.test.ts
```

### Integration Test

```typescript
import { getRelevantPatterns, applyPatternContext } from "./services/pattern-optimizer";

// 1. Create test pattern in database (via admin approval)
// 2. Retrieve patterns
const patterns = await getRelevantPatterns("org-123", "data_agent", "create a report");

// 3. Apply to prompt
const result = applyPatternContext("Generate quarterly report", patterns);

// 4. Verify enhancement
expect(result.enhancedPrompt).toContain("LEARNED PATTERNS");
expect(result.patternCount).toBeGreaterThan(0);
```

## Performance Considerations

### Caching Strategy

- Patterns are cached per organization + agent type
- Cache TTL: 1 hour
- Cache is automatically cleared when new patterns are approved
- Manual cache clearing via API endpoint

### Query Optimization

- Patterns are filtered at database level (confidence >= 0.8, status = 'approved')
- Results limited to 10 patterns (2x limit for relevance filtering)
- Index on `(organization_id, agent_type, confidence, status)` for fast queries

### Prompt Size Impact

- Each pattern adds ~150-200 characters to system prompt
- Maximum 5 patterns = ~1000 characters added
- Minimal impact on token usage (< 250 tokens)

## Monitoring

### Key Metrics to Watch

1. **Pattern Application Rate**: What % of executions use patterns?
2. **Average Confidence**: Are patterns meeting quality threshold?
3. **Pattern Distribution**: Which error types are most common?
4. **Cache Hit Rate**: Is caching effective?

### Alerting

Set up alerts for:
- Low pattern application rate (< 10%) → Check if patterns are being approved
- High rejection rate (> 50%) → Review pattern quality
- Cache misses > 50% → Consider increasing TTL

## Future Enhancements

### Planned Features

1. **Semantic Pattern Matching**: Use embeddings for better relevance filtering
2. **A/B Testing**: Test pattern effectiveness with control groups
3. **Pattern Decay**: Reduce confidence over time for outdated patterns
4. **Auto-Approval**: High-confidence patterns (>95%) auto-approve after validation
5. **Pattern Feedback Loop**: Track if patterns actually reduce corrections

### Experimental Features

1. **Dynamic Threshold**: Adjust confidence threshold based on error rate
2. **Pattern Clustering**: Group similar patterns to reduce redundancy
3. **Cross-Agent Learning**: Share patterns across agent types
4. **Real-time Pattern Generation**: Generate patterns without batch processing

## Troubleshooting

### Patterns Not Being Applied

1. **Check Pattern Approval**: Verify patterns have `status = 'approved'`
2. **Check Confidence**: Patterns must have `confidence > 0.8`
3. **Check Agent Type**: Pattern `agent_type` must match execution agent
4. **Clear Cache**: Force cache refresh with `/api/pattern-analytics/clear-cache`

### Low Pattern Effectiveness

1. **Review Pattern Quality**: Are patterns too generic or too specific?
2. **Check Relevance Filtering**: Are patterns being filtered out unnecessarily?
3. **Increase Threshold**: Raise confidence threshold to 0.85 or 0.9
4. **Add More Feedback**: Collect more user corrections to improve patterns

### Performance Issues

1. **Check Query Performance**: Monitor `prompt_suggestions` query time
2. **Optimize Indexes**: Ensure proper indexes on filtered columns
3. **Reduce Pattern Count**: Lower `MAX_PATTERNS_PER_REQUEST` to 3
4. **Increase Cache TTL**: Extend cache to 2-4 hours

## References

- [Phase 3 Intelligence Layer Documentation](./PHASE3_INTELLIGENCE.md)
- [E3-T1: FeedbackCapture Implementation](./E3_T1_FEEDBACK_CAPTURE.md)
- [E3-T2: Prompt Suggestion Implementation](./E3_T2_PROMPT_SUGGESTION.md)
- [Learning System Architecture](./LEARNING_SYSTEM.md)
