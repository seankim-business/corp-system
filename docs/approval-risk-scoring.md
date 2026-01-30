# Approval Risk Scoring System

**Phase 3 Intelligence Layer - E5-T1**

## Overview

The Approval Risk Scoring System evaluates approval requests to determine risk levels and auto-approval eligibility. This reduces approval fatigue by identifying low-risk routine requests while maintaining security for high-risk operations.

## Features

### Risk Assessment
- **5 Risk Factors** with configurable weights
- **3 Risk Levels**: LOW (0.0-0.3), MEDIUM (0.3-0.7), HIGH (0.7-1.0)
- **Confidence Scoring** based on available data
- **Auto-Approval Detection** for ultra-low-risk requests

### Intelligent Learning
- Tracks approval history per request type
- Builds user trust scores over time
- Identifies patterns in approval behavior
- Adapts risk scores based on organizational patterns

### Integration
- Seamlessly integrated with Approval Agent
- Works with learning system for pattern detection
- Redis-backed for fast lookups
- Metrics and logging for observability

## Risk Factors

### 1. Request Type Risk (Weight: 0.3)
Base risk level by request category:
- **Low Risk**: task_creation (0.1), data_creation (0.2)
- **Medium Risk**: configuration_change (0.4), deployment (0.5)
- **High Risk**: data_deletion (0.7), financial_transfer (0.8), contract_signing (0.9)

Impact scope multipliers:
- User: 0.7x
- Team: 0.85x
- Organization: 1.0x
- External: 1.2x

### 2. Historical Approval Rate (Weight: 0.25)
Based on organization-wide approval history for the request type:
- ≥95% approval rate → 0.1 risk (very safe pattern)
- ≥80% approval rate → 0.2 risk
- ≥60% approval rate → 0.35 risk
- ≥40% approval rate → 0.5 risk
- <20% approval rate → 0.9 risk (high rejection rate)

### 3. User Trust Score (Weight: 0.2)
Based on user's personal approval history:
- ≥90% approval (10+ requests) → 0.1 risk (highly trusted)
- ≥80% approval (5+ requests) → 0.2 risk (trusted)
- ≥60% approval → 0.4 risk (moderately trusted)
- <60% approval → 0.6 risk (low trust)

### 4. Amount/Impact Risk (Weight: 0.15)
For financial requests:
- <$100 → 0.1 risk
- $100-$500 → 0.2 risk
- $500-$1,000 → 0.3 risk
- $1,000-$5,000 → 0.5 risk
- $5,000-$10,000 → 0.7 risk
- >$10,000 → 0.9 risk

For non-financial: normalized impact scale 0-100

### 5. Recency/Frequency Risk (Weight: 0.1)
Based on time since last similar request:
- <1 day (3+ recent) → 0.1 risk (routine daily action)
- <7 days (2+ recent) → 0.2 risk (weekly routine)
- <30 days → 0.3 risk (monthly routine)
- <90 days → 0.4 risk (quarterly)
- >90 days → 0.5 risk (rare request)

## Auto-Approval Criteria

A request is eligible for auto-approval when **ALL** of:
1. Total risk score ≤ 0.25
2. Confidence score ≥ 0.8
3. Request type is not contract_signing or financial_transfer

## Request Types

```typescript
type RequestType =
  | "task_creation"          // Low risk
  | "task_modification"      // Low risk
  | "task_deletion"          // Medium risk
  | "data_creation"          // Low-medium risk
  | "data_modification"      // Medium risk
  | "data_deletion"          // High risk
  | "financial_spend"        // Medium-high risk
  | "financial_transfer"     // High risk
  | "deployment"             // Medium-high risk
  | "configuration_change"   // Medium risk
  | "user_permission"        // Medium-high risk
  | "content_publication"    // Medium risk
  | "contract_signing"       // High risk (never auto-approve)
  | "other";                 // Medium risk
```

## Approval Recommendations

Based on risk score, the system recommends:

| Risk Score | Recommendation | Action |
|------------|----------------|--------|
| ≤ 0.25 (high confidence) | `auto_approve` | Automatically approve and execute |
| 0.25-0.7 | `standard_approval` | Route to primary approver |
| 0.7-0.8 | `enhanced_approval` | Require detailed review |
| > 0.8 or contract/transfer | `multi_approver` | Require multiple approvers |

## Usage

### Basic Usage

```typescript
import { scoreApprovalRequest, ApprovalRequest } from './services/approval-risk-scorer';

const request: ApprovalRequest = {
  id: "req-123",
  organizationId: "org-456",
  userId: "user-789",
  requestType: "task_creation",
  description: "Create task for documentation update",
  impactScope: "user",
  createdAt: new Date(),
};

const riskScore = await scoreApprovalRequest(request);

console.log(riskScore.totalScore);           // 0.18
console.log(riskScore.riskLevel);            // "LOW"
console.log(riskScore.autoApprovalEligible); // true
console.log(riskScore.recommendation);       // "auto_approve"
console.log(riskScore.reasoning);            // Detailed breakdown
```

### With Approval Workflow

```typescript
import { processApprovalRequest } from './services/approval-integration-example';

const result = await processApprovalRequest(request, true);

if (result.autoApproved) {
  // Execute the action immediately
  await executeAction(request);
} else {
  // Send to approval queue
  await sendToApprovalQueue(request, result.riskScore);
}
```

### Recording Decisions

```typescript
import { recordApprovalDecision } from './services/approval-risk-scorer';

// Record when human approves/rejects
await recordApprovalDecision(
  organizationId,
  userId,
  requestType,
  "approved", // or "rejected"
  amount
);
```

### Getting Insights

```typescript
import {
  getUserTrustScore,
  getApprovalStats
} from './services/approval-risk-scorer';

// User trust level
const userTrust = await getUserTrustScore(orgId, userId);
console.log(userTrust.trustLevel); // "high", "moderate", "low", "new"

// Organization stats
const orgStats = await getApprovalStats(orgId);
console.log(orgStats.task_creation.approvalRate); // 0.95
```

## Integration with Approval Agent

The risk scoring system is integrated into the Approval Agent in `agent-registry.ts`:

### Enhanced Capabilities
- `approval_creation` - Creates requests with risk assessment
- `risk_assessment` - Evaluates auto-approval eligibility
- `approval_tracking` - Tracks and manages approvals

### System Prompt Updates
The Approval Agent now:
1. Automatically scores all approval requests
2. Determines auto-approval eligibility
3. Routes based on risk level (LOW/MEDIUM/HIGH)
4. Escalates high-risk requests to multiple approvers
5. Learns from historical approval patterns

## Data Storage

### Redis Keys

**Approval History** (per user, per type):
```
approval:history:{orgId}:{userId}:{requestType}
```
Stores last 100 approval decisions per user/type combo.

**User Trust Score**:
```
approval:trust:{orgId}:{userId}
```
Tracks total requests and approval rate.

**Request Type Statistics**:
```
approval:stats:{orgId}:{requestType}
```
Tracks organization-wide approval rates by type.

**TTL**: All keys expire after 90 days.

## Testing

Comprehensive test suite at `src/services/__tests__/approval-risk-scorer.test.ts`:

```bash
npm test approval-risk-scorer
```

Tests cover:
- Low-risk request scoring
- High-risk request scoring
- User trust factor
- Historical approval rates
- Auto-approval eligibility
- Error handling
- Factor weight validation
- Impact scope multipliers
- Recency calculations
- Confidence scoring

## Metrics

The system emits the following metrics:

**Counters**:
- `approval.risk_score.calculated` - Total scores calculated
- `approval.risk_score.auto_approval_eligible` - Requests eligible for auto-approval
- `approval.risk_score.errors` - Scoring errors
- `approval.auto_approved` - Requests auto-approved
- `approval.escalated` - High-risk requests escalated
- `approval.enhanced_review` - Medium-high risk requiring enhanced review
- `approval.standard_review` - Standard approval flow
- `approval.human_decision` - Human approval decisions recorded
- `approval.decision_recorded` - All decisions recorded for learning

**Histograms**:
- `approval.risk_score.duration` - Time to calculate risk score

**Tags**: All metrics tagged with `requestType` and `riskLevel` where applicable.

## Configuration

Risk thresholds and weights are configurable in `approval-risk-scorer.ts`:

```typescript
// Risk level thresholds
const RISK_THRESHOLDS = {
  LOW: 0.3,
  MEDIUM: 0.7,
  HIGH: 1.0,
};

// Auto-approval thresholds
const AUTO_APPROVAL_THRESHOLD = 0.25;
const AUTO_APPROVAL_MIN_CONFIDENCE = 0.8;

// Factor weights (must sum to 1.0)
const FACTOR_WEIGHTS = {
  requestType: 0.3,
  historicalRate: 0.25,
  userTrust: 0.2,
  impact: 0.15,
  recency: 0.1,
};
```

## Example Scenarios

### Scenario 1: Routine Task Creation (Auto-Approved)
```typescript
// Trusted user creating a task
{
  requestType: "task_creation",
  impactScope: "user",
  // User has 95% approval rate, 50+ requests
  // Task creation has 98% approval rate in org
}
// Result: score = 0.12, AUTO-APPROVED ✓
```

### Scenario 2: Medium Financial Spend (Standard Approval)
```typescript
// Mid-trust user requesting $2,000 spend
{
  requestType: "financial_spend",
  amount: 2000,
  impactScope: "team",
  // User has 75% approval rate, 15 requests
}
// Result: score = 0.48, STANDARD APPROVAL
```

### Scenario 3: High-Value Transfer (Multi-Approver)
```typescript
// Any user requesting large transfer
{
  requestType: "financial_transfer",
  amount: 50000,
  impactScope: "external",
}
// Result: score = 0.85, MULTI-APPROVER REQUIRED ⚠️
```

### Scenario 4: Contract Signing (Never Auto-Approve)
```typescript
// Even highly trusted user
{
  requestType: "contract_signing",
  impactScope: "external",
}
// Result: MULTI-APPROVER REQUIRED (regardless of score)
```

## Best Practices

1. **Seed Historical Data**: For new organizations, seed some historical data to bootstrap the system
2. **Monitor Auto-Approval Rates**: Track how many requests are auto-approved vs. requiring human review
3. **Review Rejections**: When auto-approved requests are manually overridden, investigate patterns
4. **Adjust Thresholds**: Fine-tune risk thresholds based on your organization's risk tolerance
5. **User Onboarding**: New users start with neutral trust; they earn trust over time
6. **Regular Audits**: Periodically review auto-approval decisions for quality

## Future Enhancements

Potential improvements for E5-T2:
- Machine learning for dynamic risk scoring
- Anomaly detection for unusual request patterns
- Time-of-day risk adjustments
- Team-level trust scores
- Risk score explanations with LLM
- A/B testing for threshold optimization
- Predictive approval time estimation

## Security Considerations

- **Never auto-approve**: contract_signing, financial_transfer (hardcoded)
- **Conservative fallback**: Errors → high risk score (0.8)
- **Audit trail**: All decisions logged for compliance
- **TTL limits**: Historical data expires after 90 days
- **Rate limiting**: Consider adding rate limits on auto-approvals

## API Reference

See `src/services/approval-risk-scorer.ts` for complete API documentation.

### Main Functions
- `scoreApprovalRequest(request)` - Calculate risk score
- `recordApprovalDecision(...)` - Record decision for learning
- `getUserTrustScore(orgId, userId)` - Get user trust level
- `getApprovalStats(orgId)` - Get organization statistics

### Integration Functions
- `processApprovalRequest(request)` - Full approval workflow
- `handleApprovalDecision(...)` - Record human decision
- `getUserApprovalInsights(...)` - User-specific insights
- `getOrganizationApprovalInsights(...)` - Org-wide insights

## Support

For questions or issues:
- See example usage in `approval-integration-example.ts`
- Check tests in `__tests__/approval-risk-scorer.test.ts`
- Review agent integration in `agent-registry.ts`
