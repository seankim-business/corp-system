# Phase 5: Learning & Autonomy - Detailed Prompts (41-50)

**Timeline**: 2027+
**Vision**: "Human as Training Data" - System learns from user corrections and improves autonomously
**Core Concept**: Every human interaction becomes training signal

---

## Prompt 41: Activity Tracking Foundation (Privacy-Aware)

### Overview

Build the foundational activity tracking system that captures user actions while respecting privacy boundaries. This is the data collection layer for the learning system.

### Directory Structure

```
src/
  learning/
    activity/
      tracker.ts              # Core activity tracking service
      event-types.ts          # Activity event type definitions
      privacy-filter.ts       # PII scrubbing and privacy controls
      storage.ts              # Activity storage with retention policies
      consent-manager.ts      # User consent management
    types.ts                  # Learning system types
  api/
    activity.ts               # Activity API endpoints
frontend/src/
  hooks/
    useActivityTracker.ts     # Frontend activity capture hook
  components/
    privacy/
      ConsentBanner.tsx       # Privacy consent UI
      ActivitySettings.tsx    # User activity preferences
```

### Database Schema (Prisma)

```prisma
model ActivityEvent {
  id              String   @id @default(uuid())
  organizationId  String
  userId          String
  sessionId       String

  // Event classification
  eventType       String   // click, navigate, input, command, workflow_execute, etc.
  eventCategory   String   // ui_interaction, workflow, agent, system

  // Context (privacy-filtered)
  context         Json     // { page, component, action, metadata }

  // Timing
  timestamp       DateTime @default(now())
  duration        Int?     // milliseconds for timed events

  // Privacy
  consentLevel    String   // minimal, standard, full
  anonymized      Boolean  @default(false)

  // Retention
  expiresAt       DateTime

  @@index([organizationId, userId])
  @@index([organizationId, eventType])
  @@index([sessionId])
  @@index([expiresAt])
}

model UserActivityConsent {
  id              String   @id @default(uuid())
  userId          String   @unique
  organizationId  String

  // Consent levels
  trackClicks     Boolean  @default(false)
  trackNavigation Boolean  @default(true)
  trackWorkflows  Boolean  @default(true)
  trackAgentUse   Boolean  @default(true)
  trackInputs     Boolean  @default(false)  // Very sensitive

  // Retention preferences
  retentionDays   Int      @default(90)

  // Audit
  consentGivenAt  DateTime
  lastUpdated     DateTime @updatedAt

  @@index([organizationId])
}

model ActivitySession {
  id              String   @id @default(uuid())
  userId          String
  organizationId  String

  startedAt       DateTime @default(now())
  endedAt         DateTime?

  // Session context
  userAgent       String?
  ipHash          String?  // Hashed, not raw IP

  // Aggregates (computed)
  eventCount      Int      @default(0)

  @@index([userId])
  @@index([organizationId])
}
```

### TypeScript Interfaces

```typescript
// src/learning/activity/event-types.ts
export enum ActivityEventType {
  // UI Interactions
  CLICK = "click",
  NAVIGATE = "navigate",
  SCROLL = "scroll",
  INPUT_FOCUS = "input_focus",
  INPUT_BLUR = "input_blur",

  // Workflow Events
  WORKFLOW_VIEW = "workflow_view",
  WORKFLOW_EXECUTE = "workflow_execute",
  WORKFLOW_CANCEL = "workflow_cancel",
  WORKFLOW_RETRY = "workflow_retry",

  // Agent Events
  AGENT_INVOKE = "agent_invoke",
  AGENT_FEEDBACK = "agent_feedback", // User correction
  AGENT_APPROVAL = "agent_approval",
  AGENT_REJECTION = "agent_rejection",

  // System Events
  SEARCH = "search",
  FILTER = "filter",
  SORT = "sort",
  EXPORT = "export",
}

export enum ConsentLevel {
  MINIMAL = "minimal", // Only workflow/agent events
  STANDARD = "standard", // + navigation, no inputs
  FULL = "full", // Everything (opt-in only)
}

export interface ActivityContext {
  page?: string;
  component?: string;
  action?: string;
  targetId?: string;
  targetType?: string;
  metadata?: Record<string, unknown>;
}

export interface RawActivityEvent {
  eventType: ActivityEventType;
  context: ActivityContext;
  timestamp?: Date;
  duration?: number;
}

export interface ProcessedActivityEvent extends RawActivityEvent {
  id: string;
  userId: string;
  organizationId: string;
  sessionId: string;
  consentLevel: ConsentLevel;
  anonymized: boolean;
}
```

```typescript
// src/learning/activity/privacy-filter.ts
export interface PrivacyFilterConfig {
  scrubPatterns: RegExp[]; // Patterns to remove (emails, phones, etc.)
  allowedFields: string[]; // Whitelist of allowed metadata fields
  hashFields: string[]; // Fields to hash instead of remove
}

export interface PrivacyFilter {
  filter(event: RawActivityEvent, consentLevel: ConsentLevel): ProcessedActivityEvent | null;
  scrubPII(text: string): string;
  hashValue(value: string): string;
  isAllowed(eventType: ActivityEventType, consentLevel: ConsentLevel): boolean;
}
```

### API Endpoints

```typescript
// src/api/activity.ts
// POST /api/activity/events (batch)
interface BatchActivityRequest {
  sessionId: string;
  events: RawActivityEvent[];
}

// GET /api/activity/consent
// PUT /api/activity/consent
interface ConsentUpdateRequest {
  trackClicks?: boolean;
  trackNavigation?: boolean;
  trackWorkflows?: boolean;
  trackAgentUse?: boolean;
  trackInputs?: boolean;
  retentionDays?: number;
}

// GET /api/activity/sessions?from=&to=
// GET /api/activity/sessions/:sessionId/events

// DELETE /api/activity/my-data (GDPR right to erasure)
// GET /api/activity/my-data/export (GDPR data portability)
```

### Frontend Hook

```typescript
// frontend/src/hooks/useActivityTracker.ts
export function useActivityTracker() {
  const track = useCallback((event: RawActivityEvent) => {
    // Queue event for batch sending
  }, []);

  const trackClick = useCallback(
    (component: string, action: string, metadata?: Record<string, unknown>) => {
      track({
        eventType: ActivityEventType.CLICK,
        context: { component, action, metadata },
      });
    },
    [track],
  );

  const trackNavigation = useCallback(
    (from: string, to: string) => {
      track({
        eventType: ActivityEventType.NAVIGATE,
        context: { page: to, metadata: { from } },
      });
    },
    [track],
  );

  const trackWorkflowAction = useCallback(
    (
      action: "execute" | "cancel" | "retry",
      workflowId: string,
      metadata?: Record<string, unknown>,
    ) => {
      // ...
    },
    [track],
  );

  return { track, trackClick, trackNavigation, trackWorkflowAction };
}
```

### Success Criteria Checklist

- [ ] ActivityEvent, UserActivityConsent, ActivitySession tables created
- [ ] Privacy filter correctly scrubs PII (emails, phones, credit cards)
- [ ] Consent levels properly gate which events are captured
- [ ] Events batch-sent every 5 seconds (not per-event)
- [ ] GDPR endpoints work (export, delete)
- [ ] Retention policy auto-deletes expired events (background job)
- [ ] Frontend hook integrated into 3+ key pages
- [ ] ConsentBanner shown on first visit
- [ ] ActivitySettings page allows preference changes
- [ ] No PII in activity logs (verified by audit)

---

## Prompt 42: User Correction Capture System

### Overview

Capture and structure user corrections when they fix or override AI agent outputs. These corrections are the highest-value training signals - explicit human feedback on what the AI got wrong.

### Directory Structure

```
src/
  learning/
    corrections/
      capture.ts              # Correction capture service
      normalizer.ts           # Normalize corrections for learning
      classifier.ts           # Classify correction types
      storage.ts              # Correction storage
      feedback-loop.ts        # Connect to learning pipeline
    types.ts
  api/
    corrections.ts            # Correction API endpoints
frontend/src/
  components/
    feedback/
      CorrectionCapture.tsx   # Inline correction UI
      FeedbackModal.tsx       # Detailed feedback modal
      QuickFeedback.tsx       # Thumbs up/down component
```

### Database Schema (Prisma)

```prisma
model Correction {
  id                String   @id @default(uuid())
  organizationId    String
  userId            String

  // Source context
  sourceType        String   // agent_output, workflow_result, suggestion
  sourceId          String   // ID of the source (execution, suggestion, etc.)

  // Correction content
  originalValue     Json     // What the AI produced
  correctedValue    Json     // What the user changed it to

  // Classification
  correctionType    String   // factual_error, format_error, missing_info, wrong_action, style
  severity          String   // minor, moderate, major, critical

  // User explanation (optional but valuable)
  explanation       String?

  // Context for learning
  inputContext      Json?    // What inputs led to the original output

  // Metadata
  createdAt         DateTime @default(now())
  processedAt       DateTime? // When fed to learning system
  processedBy       String?   // Which learning job processed it

  @@index([organizationId])
  @@index([sourceType, sourceId])
  @@index([correctionType])
  @@index([processedAt])
}

model CorrectionPattern {
  id                String   @id @default(uuid())
  organizationId    String

  // Pattern identification
  patternHash       String   // Hash of the pattern for deduplication
  patternType       String   // Same as correctionType

  // Aggregated data
  occurrenceCount   Int      @default(1)
  firstSeenAt       DateTime
  lastSeenAt        DateTime

  // Pattern description (for humans)
  description       String?

  // Example corrections
  exampleIds        String[] // References to Correction records

  // Resolution status
  status            String   @default("open") // open, acknowledged, resolved
  resolvedAt        DateTime?
  resolution        String?  // How it was fixed

  @@unique([organizationId, patternHash])
  @@index([organizationId, status])
}

model AgentFeedback {
  id                String   @id @default(uuid())
  organizationId    String
  userId            String

  // Reference
  executionId       String   // OrchestratorExecution ID
  agentType         String   // Which agent

  // Feedback
  rating            Int      // 1-5 or thumbs (-1, 0, 1)
  feedbackType      String   // helpful, accurate, fast, wrong, slow, confusing
  comment           String?

  // Correction reference (if they also corrected)
  correctionId      String?

  createdAt         DateTime @default(now())

  @@index([organizationId, agentType])
  @@index([executionId])
}
```

### TypeScript Interfaces

```typescript
// src/learning/corrections/types.ts
export enum CorrectionType {
  FACTUAL_ERROR = "factual_error", // Wrong information
  FORMAT_ERROR = "format_error", // Right info, wrong format
  MISSING_INFO = "missing_info", // Incomplete response
  WRONG_ACTION = "wrong_action", // Did the wrong thing
  STYLE = "style", // Tone, voice, presentation
  HALLUCINATION = "hallucination", // Made up information
  OUTDATED = "outdated", // Used stale data
}

export enum CorrectionSeverity {
  MINOR = "minor", // Small fix, still usable
  MODERATE = "moderate", // Needed significant edit
  MAJOR = "major", // Mostly wrong
  CRITICAL = "critical", // Dangerous/harmful if not caught
}

export interface CorrectionCapture {
  sourceType: "agent_output" | "workflow_result" | "suggestion";
  sourceId: string;
  originalValue: unknown;
  correctedValue: unknown;
  correctionType?: CorrectionType;
  severity?: CorrectionSeverity;
  explanation?: string;
  inputContext?: Record<string, unknown>;
}

export interface CorrectionAnalysis {
  correctionType: CorrectionType;
  severity: CorrectionSeverity;
  confidence: number;
  suggestedPatternId?: string;
}
```

```typescript
// src/learning/corrections/classifier.ts
export interface CorrectionClassifier {
  // Auto-classify a correction
  classify(correction: CorrectionCapture): Promise<CorrectionAnalysis>;

  // Detect if this matches an existing pattern
  matchPattern(correction: CorrectionCapture): Promise<CorrectionPattern | null>;

  // Create new pattern from corrections
  extractPattern(corrections: Correction[]): Promise<CorrectionPattern>;
}
```

### API Endpoints

```typescript
// src/api/corrections.ts
// POST /api/corrections
interface CreateCorrectionRequest {
  sourceType: string;
  sourceId: string;
  originalValue: unknown;
  correctedValue: unknown;
  explanation?: string;
}

// GET /api/corrections?type=&severity=&from=&to=
// GET /api/corrections/:id

// POST /api/feedback
interface CreateFeedbackRequest {
  executionId: string;
  rating: number;
  feedbackType: string;
  comment?: string;
}

// GET /api/corrections/patterns
// GET /api/corrections/patterns/:id
// PUT /api/corrections/patterns/:id/resolve
```

### Frontend Components

```typescript
// frontend/src/components/feedback/QuickFeedback.tsx
interface QuickFeedbackProps {
  executionId: string;
  agentType: string;
  onFeedback?: (rating: number) => void;
}

// Shows thumbs up/down after agent response
export function QuickFeedback({ executionId, agentType, onFeedback }: QuickFeedbackProps) {
  const [rating, setRating] = useState<number | null>(null);
  // ...
}
```

```typescript
// frontend/src/components/feedback/CorrectionCapture.tsx
interface CorrectionCaptureProps {
  sourceType: string;
  sourceId: string;
  originalValue: unknown;
  onCorrect: (correctedValue: unknown, explanation?: string) => void;
}

// Inline edit with diff view
export function CorrectionCapture({
  sourceType,
  sourceId,
  originalValue,
  onCorrect,
}: CorrectionCaptureProps) {
  const [editing, setEditing] = useState(false);
  const [correctedValue, setCorrectedValue] = useState(originalValue);
  // Shows diff between original and corrected
  // ...
}
```

### Success Criteria Checklist

- [ ] Correction, CorrectionPattern, AgentFeedback tables created
- [ ] Quick feedback (thumbs up/down) shown after every agent response
- [ ] Inline correction capture allows editing agent outputs
- [ ] Corrections auto-classified with >80% accuracy
- [ ] Pattern detection groups similar corrections
- [ ] Explanation field captures "why" for valuable corrections
- [ ] Dashboard shows correction trends by type/severity
- [ ] API returns correction stats per agent
- [ ] Pattern resolution workflow exists
- [ ] Corrections linked to original input context

---

## Prompt 43: Behavioral Pattern Learning Engine

### Overview

Analyze collected activity data to detect repeatable patterns in user behavior. These patterns become candidates for automation suggestions and agent improvements.

### Directory Structure

```
src/
  learning/
    patterns/
      detector.ts             # Pattern detection algorithms
      analyzer.ts             # Pattern analysis and scoring
      sequencer.ts            # Action sequence extraction
      similarity.ts           # Pattern similarity matching
      storage.ts              # Pattern storage
    models/
      pattern-types.ts        # Pattern type definitions
      features.ts             # Feature extraction for ML
  jobs/
    pattern-detection.ts      # Background pattern detection job
  api/
    patterns.ts               # Pattern API endpoints
```

### Database Schema (Prisma)

```prisma
model BehavioralPattern {
  id                String   @id @default(uuid())
  organizationId    String

  // Pattern identification
  patternType       String   // sequence, frequency, temporal, contextual
  patternHash       String   // For deduplication

  // Pattern content
  actionSequence    Json     // Ordered list of actions
  triggerConditions Json     // What conditions trigger this pattern

  // Statistics
  occurrenceCount   Int      @default(1)
  uniqueUsers       Int      @default(1)
  firstSeenAt       DateTime
  lastSeenAt        DateTime

  // Quality metrics
  confidence        Float    @default(0)
  consistency       Float    @default(0)  // How consistently users follow this

  // Automation potential
  automatable       Boolean  @default(false)
  automationScore   Float?   // 0-1 how suitable for automation
  suggestedWorkflow Json?    // Generated workflow suggestion

  // Status
  status            String   @default("detected") // detected, validated, suggested, automated, rejected

  // User feedback
  userVotes         Json     @default("{}") // { helpful: 5, not_helpful: 2 }

  @@unique([organizationId, patternHash])
  @@index([organizationId, status])
  @@index([automationScore])
}

model PatternOccurrence {
  id                String   @id @default(uuid())
  patternId         String
  userId            String
  sessionId         String

  // When this occurrence happened
  startedAt         DateTime
  endedAt           DateTime

  // Actual actions taken
  actions           Json     // The specific events

  // Deviation from pattern
  deviationScore    Float    @default(0)
  deviations        Json?    // What was different

  @@index([patternId])
  @@index([userId])
}

model SequenceCandidate {
  id                String   @id @default(uuid())
  organizationId    String

  // Sequence data
  actions           Json     // Action sequence
  actionHash        String   // For grouping similar sequences

  // Frequency
  occurrenceCount   Int      @default(1)
  userCount         Int      @default(1)

  // Processing status
  processedAt       DateTime?
  promotedToPattern String?  // BehavioralPattern ID if promoted

  createdAt         DateTime @default(now())

  @@index([organizationId, actionHash])
  @@index([occurrenceCount])
}
```

### TypeScript Interfaces

```typescript
// src/learning/patterns/types.ts
export enum PatternType {
  SEQUENCE = "sequence", // A→B→C happens repeatedly
  FREQUENCY = "frequency", // X happens N times per day/week
  TEMPORAL = "temporal", // X happens at specific times
  CONTEXTUAL = "contextual", // X happens after Y in context Z
}

export interface ActionNode {
  eventType: string;
  component?: string;
  action?: string;
  duration?: number;
  // Wildcards for generalization
  anyComponent?: boolean;
  anyAction?: boolean;
}

export interface PatternSequence {
  nodes: ActionNode[];
  totalDuration: number;
  averageDuration: number;
}

export interface TriggerCondition {
  type: "time" | "event" | "context" | "state";
  value: unknown;
  operator: "equals" | "contains" | "after" | "before" | "between";
}

export interface DetectedPattern {
  patternType: PatternType;
  sequence: PatternSequence;
  triggers: TriggerCondition[];
  confidence: number;
  occurrences: number;
  users: number;
}
```

```typescript
// src/learning/patterns/detector.ts
export interface PatternDetectorConfig {
  minOccurrences: number; // Minimum times pattern must occur
  minUsers: number; // Minimum unique users
  minConfidence: number; // Minimum confidence threshold
  maxSequenceLength: number; // Maximum actions in a sequence
  timeWindow: number; // Seconds to group actions
}

export interface PatternDetector {
  // Detect patterns from activity events
  detect(
    events: ProcessedActivityEvent[],
    config?: Partial<PatternDetectorConfig>,
  ): Promise<DetectedPattern[]>;

  // Detect patterns for specific user (personalization)
  detectForUser(userId: string, events: ProcessedActivityEvent[]): Promise<DetectedPattern[]>;

  // Find sequence candidates
  extractSequences(events: ProcessedActivityEvent[]): Promise<SequenceCandidate[]>;

  // Match new events against known patterns
  matchPatterns(events: ProcessedActivityEvent[], patterns: BehavioralPattern[]): PatternMatch[];
}
```

```typescript
// src/learning/patterns/analyzer.ts
export interface PatternAnalyzer {
  // Score automation potential
  scoreAutomationPotential(pattern: DetectedPattern): number;

  // Generate workflow suggestion from pattern
  suggestWorkflow(pattern: DetectedPattern): WorkflowSuggestion;

  // Calculate pattern similarity
  similarity(a: PatternSequence, b: PatternSequence): number;

  // Merge similar patterns
  mergePatterns(patterns: DetectedPattern[]): DetectedPattern[];
}

export interface WorkflowSuggestion {
  name: string;
  description: string;
  steps: WorkflowStep[];
  triggers: TriggerCondition[];
  confidence: number;
}
```

### Background Job

```typescript
// src/jobs/pattern-detection.ts
export class PatternDetectionJob {
  // Run daily pattern detection
  async runDaily(organizationId: string): Promise<void> {
    // 1. Fetch recent activity (last 7 days)
    const events = await this.fetchRecentActivity(organizationId, 7);

    // 2. Extract sequence candidates
    const candidates = await this.detector.extractSequences(events);

    // 3. Promote high-frequency candidates to patterns
    const patterns = await this.promotePatterns(candidates);

    // 4. Score automation potential
    for (const pattern of patterns) {
      pattern.automationScore = await this.analyzer.scoreAutomationPotential(pattern);
    }

    // 5. Generate workflow suggestions for top patterns
    // ...
  }
}
```

### API Endpoints

```typescript
// src/api/patterns.ts
// GET /api/patterns?type=&status=&minScore=
// GET /api/patterns/:id
// GET /api/patterns/:id/occurrences

// POST /api/patterns/:id/vote
interface VoteRequest {
  vote: "helpful" | "not_helpful";
}

// POST /api/patterns/:id/automate
// Creates a workflow from the pattern

// GET /api/patterns/suggestions
// Returns patterns with high automation scores
```

### Success Criteria Checklist

- [ ] BehavioralPattern, PatternOccurrence, SequenceCandidate tables created
- [ ] Sequence extraction identifies 3+ action chains
- [ ] Pattern detection runs as daily background job
- [ ] Patterns deduplicated by hash
- [ ] Automation score calculated (0-1)
- [ ] Workflow suggestions generated for patterns with score > 0.7
- [ ] Pattern matching detects when user follows known pattern
- [ ] API returns suggested automations
- [ ] User voting affects pattern ranking
- [ ] Dashboard shows top patterns by automation potential

---

## Prompt 44: Proactive Assistance System

### Overview

Use detected patterns and context to proactively offer help before users ask. The system anticipates needs and offers timely suggestions without being intrusive.

### Directory Structure

```
src/
  learning/
    proactive/
      predictor.ts            # Predict user needs
      suggester.ts            # Generate suggestions
      timing.ts               # Optimal timing for suggestions
      personalization.ts      # Per-user preference learning
      delivery.ts             # Suggestion delivery methods
    types.ts
  api/
    suggestions.ts            # Suggestion API endpoints
frontend/src/
  components/
    suggestions/
      SuggestionToast.tsx     # Non-intrusive suggestion toast
      SuggestionPanel.tsx     # Sidebar suggestions
      ContextualHelp.tsx      # In-context help bubbles
  hooks/
    useProactiveSuggestions.ts
```

### Database Schema (Prisma)

```prisma
model ProactiveSuggestion {
  id                String   @id @default(uuid())
  organizationId    String
  userId            String

  // Suggestion content
  suggestionType    String   // action, workflow, shortcut, help, automation
  title             String
  description       String

  // Action to take
  actionType        String   // execute_workflow, navigate, show_help, create_automation
  actionPayload     Json     // Parameters for the action

  // Context that triggered this
  triggerContext    Json     // What conditions triggered this suggestion
  patternId         String?  // If based on a pattern

  // Confidence and ranking
  confidence        Float
  priority          Int      @default(0)

  // Delivery
  deliveryMethod    String   // toast, panel, inline, email, slack
  deliveredAt       DateTime?

  // User response
  status            String   @default("pending") // pending, shown, accepted, dismissed, expired
  respondedAt       DateTime?

  // Timing
  validUntil        DateTime
  createdAt         DateTime @default(now())

  @@index([organizationId, userId, status])
  @@index([validUntil])
}

model SuggestionPreference {
  id                String   @id @default(uuid())
  userId            String   @unique
  organizationId    String

  // Delivery preferences
  enableToasts      Boolean  @default(true)
  enablePanel       Boolean  @default(true)
  enableSlack       Boolean  @default(false)
  enableEmail       Boolean  @default(false)

  // Frequency limits
  maxPerHour        Int      @default(3)
  maxPerDay         Int      @default(10)

  // Quiet hours
  quietHoursStart   String?  // "22:00"
  quietHoursEnd     String?  // "08:00"

  // Type preferences
  disabledTypes     String[] // Types user doesn't want

  // Learning
  dismissalPatterns Json     @default("{}") // Track what gets dismissed

  @@index([organizationId])
}

model SuggestionFeedback {
  id                String   @id @default(uuid())
  suggestionId      String
  userId            String

  action            String   // accepted, dismissed, snoozed, never_show

  // If dismissed, why?
  dismissReason     String?  // not_relevant, bad_timing, already_did, annoying

  // Context at time of feedback
  contextSnapshot   Json?

  createdAt         DateTime @default(now())

  @@index([suggestionId])
  @@index([userId])
}
```

### TypeScript Interfaces

```typescript
// src/learning/proactive/types.ts
export enum SuggestionType {
  ACTION = "action", // "Do X now"
  WORKFLOW = "workflow", // "Run this workflow"
  SHORTCUT = "shortcut", // "Press Cmd+K for faster access"
  HELP = "help", // "Need help with X?"
  AUTOMATION = "automation", // "Automate this pattern"
}

export enum DeliveryMethod {
  TOAST = "toast",
  PANEL = "panel",
  INLINE = "inline",
  SLACK = "slack",
  EMAIL = "email",
}

export interface SuggestionContext {
  currentPage: string;
  currentAction?: string;
  recentActions: string[];
  timeOfDay: string;
  dayOfWeek: number;
  sessionDuration: number;
}

export interface GeneratedSuggestion {
  type: SuggestionType;
  title: string;
  description: string;
  actionType: string;
  actionPayload: unknown;
  confidence: number;
  validFor: number; // seconds
}
```

```typescript
// src/learning/proactive/predictor.ts
export interface NeedPredictor {
  // Predict what user needs based on context
  predict(context: SuggestionContext, userHistory: ActivityEvent[]): Promise<PredictedNeed[]>;

  // Check if current context matches any patterns
  matchCurrentContext(context: SuggestionContext, patterns: BehavioralPattern[]): PatternMatch[];
}

export interface PredictedNeed {
  needType: string;
  confidence: number;
  suggestedAction: string;
  reasoning: string;
}
```

```typescript
// src/learning/proactive/timing.ts
export interface TimingOptimizer {
  // Should we show suggestion now?
  shouldShowNow(
    suggestion: GeneratedSuggestion,
    userPrefs: SuggestionPreference,
    recentSuggestions: ProactiveSuggestion[],
  ): boolean;

  // Find optimal time to show
  findOptimalTime(
    suggestion: GeneratedSuggestion,
    userPrefs: SuggestionPreference,
    userActivity: ActivityEvent[],
  ): Date;

  // Is user in "flow state" (don't interrupt)?
  isInFlowState(recentActivity: ActivityEvent[]): boolean;
}
```

### API Endpoints

```typescript
// src/api/suggestions.ts
// GET /api/suggestions/active
// Returns currently relevant suggestions for user

// POST /api/suggestions/:id/respond
interface SuggestionResponseRequest {
  action: "accepted" | "dismissed" | "snoozed";
  dismissReason?: string;
  snoozeUntil?: string; // ISO date
}

// GET /api/suggestions/preferences
// PUT /api/suggestions/preferences

// POST /api/suggestions/generate
// Manually trigger suggestion generation for current context
interface GenerateSuggestionsRequest {
  context: SuggestionContext;
}
```

### Frontend Components

```typescript
// frontend/src/hooks/useProactiveSuggestions.ts
export function useProactiveSuggestions() {
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);

  // Fetch active suggestions
  useEffect(() => {
    // Poll or SSE for new suggestions
  }, []);

  const accept = useCallback(async (id: string) => {
    // Execute the suggestion action
    // Mark as accepted
  }, []);

  const dismiss = useCallback(async (id: string, reason?: string) => {
    // Mark as dismissed with reason
  }, []);

  return { suggestions, accept, dismiss };
}
```

```typescript
// frontend/src/components/suggestions/SuggestionToast.tsx
interface SuggestionToastProps {
  suggestion: ProactiveSuggestion;
  onAccept: () => void;
  onDismiss: (reason?: string) => void;
}

export function SuggestionToast({ suggestion, onAccept, onDismiss }: SuggestionToastProps) {
  // Non-intrusive toast in corner
  // Auto-dismiss after 10 seconds if no interaction
  // ...
}
```

### Success Criteria Checklist

- [ ] ProactiveSuggestion, SuggestionPreference, SuggestionFeedback tables created
- [ ] Predictor generates suggestions from patterns
- [ ] Timing optimizer respects quiet hours
- [ ] Flow state detection prevents interruptions during focused work
- [ ] Rate limiting enforced (max per hour/day)
- [ ] Toast component shows non-intrusively
- [ ] Acceptance rate tracked (target: >20%)
- [ ] Dismiss reasons captured for learning
- [ ] Personalization improves over time (fewer irrelevant suggestions)
- [ ] Slack/email delivery works for opted-in users

---

## Prompt 45: Continuous Learning Pipeline

### Overview

Build the data pipeline that transforms corrections, feedback, and patterns into model improvements. This closes the loop from human feedback to system improvement.

### Directory Structure

```
src/
  learning/
    pipeline/
      collector.ts            # Collect training data
      processor.ts            # Process and clean data
      trainer.ts              # Training orchestration
      evaluator.ts            # Evaluate improvements
      deployer.ts             # Deploy improved models
    data/
      dataset-builder.ts      # Build training datasets
      feature-extractor.ts    # Extract features for training
      labeler.ts              # Auto-labeling from corrections
  jobs/
    learning-pipeline.ts      # Background learning job
  api/
    learning.ts               # Learning status API
```

### Database Schema (Prisma)

```prisma
model TrainingDataset {
  id                String   @id @default(uuid())
  organizationId    String

  // Dataset info
  name              String
  description       String?
  datasetType       String   // corrections, patterns, feedback, mixed

  // Content
  sampleCount       Int

  // Quality metrics
  labelQuality      Float?   // 0-1 label accuracy estimate
  diversity         Float?   // 0-1 how diverse the samples are

  // Status
  status            String   @default("building") // building, ready, training, archived

  // Storage
  storagePath       String   // S3/GCS path

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([organizationId])
  @@index([status])
}

model TrainingRun {
  id                String   @id @default(uuid())
  organizationId    String
  datasetId         String

  // Model info
  baseModel         String   // What model we're improving
  targetModel       String   // Output model identifier

  // Training config
  config            Json     // Hyperparameters, etc.

  // Progress
  status            String   @default("queued") // queued, running, completed, failed
  progress          Float    @default(0) // 0-1

  // Results
  metrics           Json?    // Accuracy, loss, etc.

  // Timing
  startedAt         DateTime?
  completedAt       DateTime?

  createdAt         DateTime @default(now())

  @@index([organizationId])
  @@index([status])
}

model ModelVersion {
  id                String   @id @default(uuid())
  organizationId    String

  // Model identification
  modelType         String   // classifier, router, generator
  version           String   // Semantic version

  // Source
  trainingRunId     String?

  // Performance
  metrics           Json     // Evaluation metrics

  // Deployment
  status            String   @default("testing") // testing, canary, production, deprecated
  deployedAt        DateTime?

  // A/B testing
  trafficPercentage Float    @default(0) // For canary deployments

  createdAt         DateTime @default(now())

  @@index([organizationId, modelType])
  @@index([status])
}

model LearningEvent {
  id                String   @id @default(uuid())
  organizationId    String

  // Event type
  eventType         String   // data_collected, training_started, model_deployed, etc.

  // References
  datasetId         String?
  trainingRunId     String?
  modelVersionId    String?

  // Details
  details           Json

  createdAt         DateTime @default(now())

  @@index([organizationId, eventType])
}
```

### TypeScript Interfaces

```typescript
// src/learning/pipeline/types.ts
export interface TrainingDataCollector {
  // Collect corrections as training data
  collectCorrections(
    orgId: string,
    since: Date,
    minSeverity?: CorrectionSeverity,
  ): Promise<TrainingSample[]>;

  // Collect patterns as training data
  collectPatterns(orgId: string, minConfidence?: number): Promise<TrainingSample[]>;

  // Collect feedback as training data
  collectFeedback(orgId: string, since: Date): Promise<TrainingSample[]>;
}

export interface TrainingSample {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  context?: Record<string, unknown>;
  source: "correction" | "pattern" | "feedback" | "manual";
  quality: number; // 0-1 estimated label quality
}
```

```typescript
// src/learning/pipeline/processor.ts
export interface DataProcessor {
  // Clean and validate training data
  process(samples: TrainingSample[]): Promise<ProcessedSample[]>;

  // Remove duplicates
  deduplicate(samples: TrainingSample[]): TrainingSample[];

  // Balance classes
  balance(samples: TrainingSample[]): TrainingSample[];

  // Split into train/validation/test
  split(samples: TrainingSample[]): {
    train: TrainingSample[];
    validation: TrainingSample[];
    test: TrainingSample[];
  };
}
```

```typescript
// src/learning/pipeline/trainer.ts
export interface TrainingOrchestrator {
  // Start a training run
  startTraining(datasetId: string, config: TrainingConfig): Promise<TrainingRun>;

  // Monitor training progress
  getProgress(runId: string): Promise<TrainingProgress>;

  // Cancel a running training
  cancelTraining(runId: string): Promise<void>;
}

export interface TrainingConfig {
  baseModel: string;
  epochs?: number;
  learningRate?: number;
  batchSize?: number;
  // Model-specific config
  customConfig?: Record<string, unknown>;
}

export interface TrainingProgress {
  status: string;
  progress: number;
  currentEpoch?: number;
  currentLoss?: number;
  estimatedTimeRemaining?: number;
}
```

```typescript
// src/learning/pipeline/deployer.ts
export interface ModelDeployer {
  // Deploy a model version
  deploy(versionId: string, strategy: DeploymentStrategy): Promise<void>;

  // Rollback to previous version
  rollback(modelType: string): Promise<void>;

  // Update traffic split for canary
  updateTrafficSplit(versionId: string, percentage: number): Promise<void>;
}

export type DeploymentStrategy =
  | { type: "immediate" }
  | { type: "canary"; initialPercentage: number; incrementPerHour: number }
  | { type: "blue-green" };
```

### Background Job

```typescript
// src/jobs/learning-pipeline.ts
export class LearningPipelineJob {
  // Run weekly learning cycle
  async runWeekly(organizationId: string): Promise<void> {
    // 1. Collect training data
    const corrections = await this.collector.collectCorrections(orgId, lastWeek);
    const patterns = await this.collector.collectPatterns(orgId);
    const feedback = await this.collector.collectFeedback(orgId, lastWeek);

    // 2. Check if enough data (minimum 100 samples)
    const allSamples = [...corrections, ...patterns, ...feedback];
    if (allSamples.length < 100) {
      await this.log("Insufficient data for training");
      return;
    }

    // 3. Process and build dataset
    const processed = await this.processor.process(allSamples);
    const dataset = await this.datasetBuilder.build(processed);

    // 4. Start training
    const run = await this.trainer.startTraining(dataset.id, this.config);

    // 5. Wait for completion and evaluate
    await this.waitForCompletion(run.id);
    const metrics = await this.evaluator.evaluate(run.targetModel);

    // 6. If improved, deploy with canary
    if (metrics.improvement > 0.05) {
      // 5% improvement threshold
      await this.deployer.deploy(run.targetModel, {
        type: "canary",
        initialPercentage: 10,
        incrementPerHour: 10,
      });
    }
  }
}
```

### API Endpoints

```typescript
// src/api/learning.ts
// GET /api/learning/datasets
// GET /api/learning/datasets/:id

// GET /api/learning/runs
// GET /api/learning/runs/:id
// GET /api/learning/runs/:id/progress

// GET /api/learning/models
// GET /api/learning/models/:id

// POST /api/learning/trigger
// Manually trigger learning pipeline
interface TriggerLearningRequest {
  force?: boolean; // Force even if insufficient data
}

// GET /api/learning/status
// Overall learning system status
interface LearningStatus {
  lastRun: Date;
  nextScheduledRun: Date;
  currentModelVersions: Record<string, string>;
  pendingImprovements: number;
  dataCollectionRate: number; // samples/day
}
```

### Success Criteria Checklist

- [ ] TrainingDataset, TrainingRun, ModelVersion, LearningEvent tables created
- [ ] Data collection aggregates corrections, patterns, feedback
- [ ] Minimum data threshold (100 samples) enforced
- [ ] Training runs tracked with progress updates
- [ ] Evaluation metrics computed (accuracy, F1, etc.)
- [ ] Canary deployment with gradual traffic shift
- [ ] Rollback capability works
- [ ] Weekly pipeline job scheduled
- [ ] Learning events logged for audit
- [ ] Dashboard shows learning pipeline status

---

## Prompt 46: Agent Self-Improvement System

### Overview

Enable agents to improve their own performance based on accumulated feedback and corrections. This is the "learning" in "Human as Training Data" - agents evolve based on user interactions.

### Directory Structure

```
src/
  learning/
    agents/
      self-improver.ts        # Agent self-improvement logic
      prompt-optimizer.ts     # Optimize agent prompts
      skill-learner.ts        # Learn new skills from patterns
      performance-tracker.ts  # Track agent performance
      ab-tester.ts            # A/B test agent variations
  agents/
    versioned/
      agent-registry.ts       # Registry of agent versions
      agent-loader.ts         # Load appropriate agent version
  api/
    agent-performance.ts      # Agent performance API
```

### Database Schema (Prisma)

```prisma
model AgentVersion {
  id                String   @id @default(uuid())
  organizationId    String
  agentType         String   // orchestrator, brand, ops, etc.

  // Version info
  version           String
  parentVersion     String?  // What version this evolved from

  // Configuration
  systemPrompt      String   @db.Text
  skillIds          String[] // Skills this version has
  parameters        Json     // Temperature, etc.

  // Performance metrics
  successRate       Float?
  avgResponseTime   Float?   // ms
  userSatisfaction  Float?   // 0-5
  correctionRate    Float?   // How often users correct output

  // Status
  status            String   @default("testing") // testing, canary, production, deprecated
  trafficPercentage Float    @default(0)

  // Improvement tracking
  improvementSource String?  // What triggered this version: correction, pattern, manual
  improvementNotes  String?

  createdAt         DateTime @default(now())

  @@unique([organizationId, agentType, version])
  @@index([organizationId, agentType, status])
}

model AgentExperiment {
  id                String   @id @default(uuid())
  organizationId    String

  // Experiment setup
  name              String
  agentType         String
  hypothesis        String

  // Variants
  controlVersionId  String   // Current production version
  testVersionId     String   // New version to test

  // Traffic split
  testTrafficPct    Float    @default(50)

  // Sample size
  targetSamples     Int      // How many executions to collect
  currentSamples    Int      @default(0)

  // Results
  status            String   @default("running") // running, completed, stopped
  winner            String?  // control, test, tie
  confidenceLevel   Float?   // Statistical significance

  // Metrics comparison
  controlMetrics    Json?
  testMetrics       Json?

  startedAt         DateTime @default(now())
  endedAt           DateTime?

  @@index([organizationId, status])
}

model LearnedSkill {
  id                String   @id @default(uuid())
  organizationId    String

  // Skill identification
  name              String
  description       String

  // Source
  sourcePatternId   String?  // If learned from a pattern
  sourceType        String   // pattern, correction, manual

  // Skill definition
  triggerConditions Json     // When to use this skill
  actionSequence    Json     // What to do

  // Validation
  validatedAt       DateTime?
  validatedBy       String?  // User ID who validated

  // Usage tracking
  usageCount        Int      @default(0)
  successRate       Float?

  // Status
  status            String   @default("draft") // draft, testing, active, deprecated

  createdAt         DateTime @default(now())

  @@index([organizationId, status])
}
```

### TypeScript Interfaces

```typescript
// src/learning/agents/types.ts
export interface AgentPerformanceMetrics {
  successRate: number; // % of successful executions
  avgResponseTime: number; // ms
  userSatisfaction: number; // 0-5 from feedback
  correctionRate: number; // % of outputs corrected
  feedbackScore: number; // Aggregate feedback score
}

export interface AgentImprovement {
  type: "prompt" | "skill" | "parameter";
  description: string;
  changeDetails: unknown;
  expectedImprovement: string;
  source: "correction" | "pattern" | "feedback" | "manual";
}
```

```typescript
// src/learning/agents/self-improver.ts
export interface AgentSelfImprover {
  // Analyze agent performance and suggest improvements
  analyzePerformance(
    agentType: string,
    orgId: string,
    timeframe: { from: Date; to: Date },
  ): Promise<PerformanceAnalysis>;

  // Generate improvement suggestions
  suggestImprovements(
    analysis: PerformanceAnalysis,
    corrections: Correction[],
  ): Promise<AgentImprovement[]>;

  // Apply an improvement (creates new version)
  applyImprovement(agentType: string, improvement: AgentImprovement): Promise<AgentVersion>;
}

export interface PerformanceAnalysis {
  metrics: AgentPerformanceMetrics;
  trends: MetricTrend[];
  weaknesses: IdentifiedWeakness[];
  strengths: IdentifiedStrength[];
}

export interface IdentifiedWeakness {
  area: string;
  description: string;
  frequency: number;
  examples: string[];
  suggestedFix?: string;
}
```

```typescript
// src/learning/agents/prompt-optimizer.ts
export interface PromptOptimizer {
  // Optimize prompt based on corrections
  optimizeFromCorrections(
    currentPrompt: string,
    corrections: Correction[],
  ): Promise<OptimizedPrompt>;

  // Generate prompt variations for A/B testing
  generateVariations(basePrompt: string, numVariations: number): Promise<string[]>;
}

export interface OptimizedPrompt {
  prompt: string;
  changes: PromptChange[];
  expectedImprovement: string;
  confidence: number;
}

export interface PromptChange {
  type: "add" | "remove" | "modify";
  original?: string;
  new?: string;
  reason: string;
}
```

```typescript
// src/learning/agents/skill-learner.ts
export interface SkillLearner {
  // Learn a new skill from a pattern
  learnFromPattern(pattern: BehavioralPattern): Promise<LearnedSkill>;

  // Extract skill from correction (what should have been done)
  extractFromCorrection(correction: Correction): Promise<LearnedSkill | null>;

  // Validate a skill with user
  requestValidation(skill: LearnedSkill, userId: string): Promise<void>;
}
```

### API Endpoints

```typescript
// src/api/agent-performance.ts
// GET /api/agents/:type/performance?from=&to=
// Returns performance metrics for an agent type

// GET /api/agents/:type/versions
// GET /api/agents/:type/versions/:version

// POST /api/agents/:type/improvements/suggest
// Generate improvement suggestions

// POST /api/agents/:type/improvements/apply
interface ApplyImprovementRequest {
  improvement: AgentImprovement;
  startExperiment?: boolean; // Auto-start A/B test
}

// GET /api/agents/experiments
// GET /api/agents/experiments/:id
// POST /api/agents/experiments/:id/stop

// GET /api/agents/skills
// POST /api/agents/skills/:id/validate
// PUT /api/agents/skills/:id/activate
```

### Success Criteria Checklist

- [ ] AgentVersion, AgentExperiment, LearnedSkill tables created
- [ ] Performance tracking captures success rate, response time, satisfaction
- [ ] Weakness identification detects recurring issues
- [ ] Prompt optimization generates improved prompts from corrections
- [ ] A/B testing compares agent versions with statistical significance
- [ ] Skill learning extracts new capabilities from patterns
- [ ] Gradual rollout (canary) for new agent versions
- [ ] Rollback capability if new version underperforms
- [ ] Dashboard shows agent performance trends
- [ ] Experiment results automatically determine winner

---

## Prompt 47: Feedback Integration Hub

### Overview

Centralize all feedback channels (in-app, Slack, email, API) into a unified system that feeds the learning pipeline. Make it easy for users to provide feedback wherever they are.

### Directory Structure

```
src/
  learning/
    feedback/
      hub.ts                  # Central feedback aggregation
      channels/
        in-app.ts             # In-app feedback handling
        slack.ts              # Slack feedback handling
        email.ts              # Email feedback handling
        api.ts                # API feedback handling
      processor.ts            # Process and route feedback
      enricher.ts             # Enrich feedback with context
  api/
    feedback.ts               # Feedback API endpoints
frontend/src/
  components/
    feedback/
      FeedbackButton.tsx      # Floating feedback button
      FeedbackForm.tsx        # Full feedback form
      InlineFeedback.tsx      # Contextual inline feedback
```

### Database Schema (Prisma)

```prisma
model FeedbackSubmission {
  id                String   @id @default(uuid())
  organizationId    String
  userId            String?  // Can be anonymous

  // Source
  channel           String   // in_app, slack, email, api
  sourceId          String?  // Message ID, email ID, etc.

  // Content
  feedbackType      String   // bug, feature, complaint, praise, question
  category          String?  // agent, workflow, ui, integration
  subject           String?
  content           String   @db.Text

  // Context (enriched)
  context           Json?    // Page, workflow, agent, etc.
  attachments       String[] // File URLs

  // Sentiment analysis
  sentiment         String?  // positive, negative, neutral
  urgency           String?  // low, medium, high, critical

  // Processing
  status            String   @default("new") // new, triaged, in_progress, resolved, wont_fix
  assignedTo        String?

  // Learning linkage
  linkedCorrectionId String?
  linkedPatternId    String?
  addedToDataset     Boolean @default(false)

  // Response
  responseChannel   String?
  responseSent      Boolean @default(false)
  responseContent   String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  resolvedAt        DateTime?

  @@index([organizationId, status])
  @@index([channel])
  @@index([feedbackType])
}

model FeedbackTag {
  id                String   @id @default(uuid())
  organizationId    String

  name              String
  color             String?

  // Auto-tagging rules
  autoTagRules      Json?    // Keywords, patterns, etc.

  @@unique([organizationId, name])
}

model FeedbackToTag {
  feedbackId        String
  tagId             String

  @@id([feedbackId, tagId])
}

model FeedbackResponse {
  id                String   @id @default(uuid())
  feedbackId        String
  userId            String

  content           String   @db.Text
  channel           String   // Same channel as original or different

  createdAt         DateTime @default(now())

  @@index([feedbackId])
}
```

### TypeScript Interfaces

```typescript
// src/learning/feedback/types.ts
export enum FeedbackChannel {
  IN_APP = "in_app",
  SLACK = "slack",
  EMAIL = "email",
  API = "api",
}

export enum FeedbackType {
  BUG = "bug",
  FEATURE = "feature",
  COMPLAINT = "complaint",
  PRAISE = "praise",
  QUESTION = "question",
  CORRECTION = "correction",
}

export interface FeedbackInput {
  channel: FeedbackChannel;
  feedbackType: FeedbackType;
  content: string;
  subject?: string;
  category?: string;
  context?: FeedbackContext;
  attachments?: string[];
  userId?: string;
  organizationId: string;
}

export interface FeedbackContext {
  page?: string;
  workflowId?: string;
  executionId?: string;
  agentType?: string;
  sessionId?: string;
  userAgent?: string;
  errorMessage?: string;
}
```

```typescript
// src/learning/feedback/hub.ts
export interface FeedbackHub {
  // Submit feedback from any channel
  submit(input: FeedbackInput): Promise<FeedbackSubmission>;

  // Process incoming feedback
  process(feedbackId: string): Promise<void>;

  // Route feedback to appropriate handler
  route(feedback: FeedbackSubmission): Promise<void>;

  // Link feedback to learning artifacts
  linkToCorrection(feedbackId: string, correctionId: string): Promise<void>;
  linkToPattern(feedbackId: string, patternId: string): Promise<void>;
}
```

```typescript
// src/learning/feedback/enricher.ts
export interface FeedbackEnricher {
  // Add context to feedback
  enrich(feedback: FeedbackSubmission): Promise<EnrichedFeedback>;

  // Analyze sentiment
  analyzeSentiment(content: string): Promise<SentimentAnalysis>;

  // Detect urgency
  detectUrgency(content: string, context?: FeedbackContext): Promise<Urgency>;

  // Auto-categorize
  categorize(content: string): Promise<string>;

  // Auto-tag
  autoTag(content: string, existingTags: FeedbackTag[]): Promise<string[]>;
}

export interface SentimentAnalysis {
  sentiment: "positive" | "negative" | "neutral";
  confidence: number;
  emotions?: string[]; // frustrated, happy, confused, etc.
}
```

### Slack Integration

```typescript
// src/learning/feedback/channels/slack.ts
export class SlackFeedbackHandler {
  // Handle /feedback command
  async handleCommand(payload: SlackCommandPayload): Promise<void> {
    // Open feedback modal
  }

  // Handle reactions as quick feedback
  async handleReaction(payload: SlackReactionPayload): Promise<void> {
    // :thumbsup: = positive, :thumbsdown: = negative
    // :bug: = bug report, :bulb: = feature request
  }

  // Handle thread replies as feedback
  async handleThreadReply(payload: SlackMessagePayload): Promise<void> {
    // If replying to agent message, treat as feedback
  }
}
```

### API Endpoints

```typescript
// src/api/feedback.ts
// POST /api/feedback
interface SubmitFeedbackRequest {
  feedbackType: string;
  content: string;
  subject?: string;
  category?: string;
  attachments?: string[];
}

// GET /api/feedback?status=&type=&from=&to=
// GET /api/feedback/:id

// PUT /api/feedback/:id/status
interface UpdateStatusRequest {
  status: string;
  assignedTo?: string;
}

// POST /api/feedback/:id/respond
interface RespondRequest {
  content: string;
  channel?: string; // If different from original
}

// POST /api/feedback/:id/link-correction
// POST /api/feedback/:id/link-pattern
// POST /api/feedback/:id/add-to-dataset

// GET /api/feedback/tags
// POST /api/feedback/tags
// POST /api/feedback/:id/tags
```

### Frontend Components

```typescript
// frontend/src/components/feedback/FeedbackButton.tsx
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  // Floating button in corner
  // Opens FeedbackForm modal
}
```

```typescript
// frontend/src/components/feedback/InlineFeedback.tsx
interface InlineFeedbackProps {
  context: FeedbackContext;
  onSubmit?: (feedback: FeedbackInput) => void;
}

export function InlineFeedback({ context, onSubmit }: InlineFeedbackProps) {
  // Quick feedback inline (e.g., after agent response)
  // [Helpful] [Not Helpful] [Report Issue]
}
```

### Success Criteria Checklist

- [ ] FeedbackSubmission, FeedbackTag, FeedbackResponse tables created
- [ ] In-app feedback form with file attachments
- [ ] Slack /feedback command opens modal
- [ ] Slack reactions captured as quick feedback
- [ ] Email parsing extracts feedback content
- [ ] Sentiment analysis auto-classifies feedback
- [ ] Urgency detection prioritizes critical issues
- [ ] Auto-tagging based on content keywords
- [ ] Feedback linked to corrections/patterns for learning
- [ ] Response tracking across channels
- [ ] Dashboard shows feedback trends

---

## Prompt 48: Knowledge Distillation System

### Overview

Extract institutional knowledge from user interactions and corrections, then distill it into reusable knowledge artifacts (rules, best practices, FAQs) that agents can reference.

### Directory Structure

```
src/
  learning/
    knowledge/
      extractor.ts            # Extract knowledge from interactions
      distiller.ts            # Distill into structured knowledge
      validator.ts            # Validate knowledge accuracy
      indexer.ts              # Index for retrieval
      retriever.ts            # Retrieve relevant knowledge
  knowledge/
    base.ts                   # Knowledge base service
    types.ts                  # Knowledge types
  api/
    knowledge.ts              # Knowledge API endpoints
frontend/src/
  pages/
    KnowledgeBasePage.tsx     # Knowledge management UI
  components/
    knowledge/
      KnowledgeCard.tsx
      KnowledgeEditor.tsx
      KnowledgeSearch.tsx
```

### Database Schema (Prisma)

```prisma
model KnowledgeArticle {
  id                String   @id @default(uuid())
  organizationId    String

  // Identification
  title             String
  slug              String

  // Content
  content           String   @db.Text
  contentType       String   // markdown, structured, faq

  // Classification
  category          String   // policy, procedure, best_practice, faq, definition
  domain            String?  // hr, finance, ops, brand, etc.
  tags              String[]

  // Source tracking
  sourceType        String   // manual, extracted, distilled
  sourceIds         String[] // Correction IDs, pattern IDs, etc.

  // Quality
  confidence        Float    @default(1) // 0-1 for auto-generated
  validatedAt       DateTime?
  validatedBy       String?

  // Usage
  usageCount        Int      @default(0)
  lastUsedAt        DateTime?
  helpfulVotes      Int      @default(0)
  notHelpfulVotes   Int      @default(0)

  // Status
  status            String   @default("draft") // draft, review, published, archived

  // Versioning
  version           Int      @default(1)
  previousVersionId String?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  publishedAt       DateTime?

  @@unique([organizationId, slug])
  @@index([organizationId, category])
  @@index([organizationId, domain])
  @@index([status])
}

model KnowledgeRule {
  id                String   @id @default(uuid())
  organizationId    String

  // Rule definition
  name              String
  description       String

  // Condition
  triggerType       String   // keyword, pattern, intent
  triggerValue      Json     // Keywords, regex, intent name

  // Action
  actionType        String   // suggest_article, apply_template, show_warning
  actionPayload     Json

  // Priority
  priority          Int      @default(0)

  // Status
  enabled           Boolean  @default(true)

  // Tracking
  timesTriggered    Int      @default(0)

  createdAt         DateTime @default(now())

  @@index([organizationId, enabled])
}

model KnowledgeExtraction {
  id                String   @id @default(uuid())
  organizationId    String

  // Source
  sourceType        String   // correction, pattern, conversation, feedback
  sourceId          String

  // Extracted knowledge
  extractedContent  Json     // { facts: [], rules: [], definitions: [] }

  // Processing
  status            String   @default("pending") // pending, reviewed, accepted, rejected
  reviewedBy        String?
  reviewedAt        DateTime?

  // If accepted, what was created
  createdArticleId  String?
  createdRuleId     String?

  createdAt         DateTime @default(now())

  @@index([organizationId, status])
  @@index([sourceType, sourceId])
}
```

### TypeScript Interfaces

```typescript
// src/learning/knowledge/types.ts
export enum KnowledgeCategory {
  POLICY = "policy", // Company policies
  PROCEDURE = "procedure", // How to do things
  BEST_PRACTICE = "best_practice",
  FAQ = "faq",
  DEFINITION = "definition", // Terminology
  RULE = "rule", // Business rules
}

export interface ExtractedKnowledge {
  facts: ExtractedFact[];
  rules: ExtractedRule[];
  definitions: ExtractedDefinition[];
  questions: ExtractedQuestion[];
}

export interface ExtractedFact {
  statement: string;
  confidence: number;
  source: string;
}

export interface ExtractedRule {
  condition: string;
  action: string;
  confidence: number;
}

export interface ExtractedDefinition {
  term: string;
  definition: string;
  context?: string;
}

export interface ExtractedQuestion {
  question: string;
  answer: string;
  confidence: number;
}
```

```typescript
// src/learning/knowledge/extractor.ts
export interface KnowledgeExtractor {
  // Extract knowledge from a correction
  extractFromCorrection(correction: Correction): Promise<ExtractedKnowledge>;

  // Extract from conversation history
  extractFromConversation(messages: Message[]): Promise<ExtractedKnowledge>;

  // Extract from feedback
  extractFromFeedback(feedback: FeedbackSubmission): Promise<ExtractedKnowledge>;

  // Batch extraction from patterns
  extractFromPatterns(patterns: BehavioralPattern[]): Promise<ExtractedKnowledge>;
}
```

```typescript
// src/learning/knowledge/distiller.ts
export interface KnowledgeDistiller {
  // Distill extractions into article
  distillToArticle(
    extractions: KnowledgeExtraction[],
    category: KnowledgeCategory,
  ): Promise<KnowledgeArticle>;

  // Distill into rule
  distillToRule(extractions: KnowledgeExtraction[]): Promise<KnowledgeRule>;

  // Merge similar knowledge
  merge(articles: KnowledgeArticle[]): Promise<KnowledgeArticle>;

  // Detect conflicts
  detectConflicts(article: KnowledgeArticle, existing: KnowledgeArticle[]): Conflict[];
}
```

```typescript
// src/learning/knowledge/retriever.ts
export interface KnowledgeRetriever {
  // Search knowledge base
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  // Get relevant knowledge for context
  getRelevant(context: KnowledgeContext): Promise<KnowledgeArticle[]>;

  // Find applicable rules
  findRules(input: string): Promise<KnowledgeRule[]>;
}

export interface KnowledgeContext {
  domain?: string;
  agentType?: string;
  userQuery?: string;
  currentPage?: string;
}

export interface SearchResult {
  article: KnowledgeArticle;
  relevance: number;
  snippet: string;
}
```

### API Endpoints

```typescript
// src/api/knowledge.ts
// GET /api/knowledge/articles?category=&domain=&status=
// GET /api/knowledge/articles/:slug
// POST /api/knowledge/articles
// PUT /api/knowledge/articles/:id
// DELETE /api/knowledge/articles/:id

// POST /api/knowledge/articles/:id/publish
// POST /api/knowledge/articles/:id/vote
interface VoteRequest {
  vote: "helpful" | "not_helpful";
}

// GET /api/knowledge/rules
// POST /api/knowledge/rules
// PUT /api/knowledge/rules/:id

// GET /api/knowledge/search?q=
// POST /api/knowledge/relevant
interface GetRelevantRequest {
  context: KnowledgeContext;
  limit?: number;
}

// GET /api/knowledge/extractions?status=
// POST /api/knowledge/extractions/:id/accept
// POST /api/knowledge/extractions/:id/reject
```

### Success Criteria Checklist

- [ ] KnowledgeArticle, KnowledgeRule, KnowledgeExtraction tables created
- [ ] Extraction runs on new corrections/patterns
- [ ] Distillation creates structured articles
- [ ] Search finds relevant knowledge (semantic search)
- [ ] Rules trigger on matching inputs
- [ ] Article versioning tracks changes
- [ ] Validation workflow for auto-generated content
- [ ] Usage tracking (views, helpful votes)
- [ ] Conflict detection for contradictory knowledge
- [ ] Knowledge base UI for browsing/editing

---

## Prompt 49: Autonomy Progression System

### Overview

Gradually increase agent autonomy based on demonstrated reliability. Start with human approval for every action, then progressively reduce oversight as trust is established.

### Directory Structure

```
src/
  learning/
    autonomy/
      level-manager.ts        # Manage autonomy levels
      trust-scorer.ts         # Calculate trust scores
      escalation.ts           # Escalation rules
      approval-flow.ts        # Approval workflow
      autonomy-config.ts      # Per-org autonomy settings
  api/
    autonomy.ts               # Autonomy API endpoints
frontend/src/
  pages/
    AutonomySettingsPage.tsx  # Autonomy configuration UI
  components/
    autonomy/
      TrustDashboard.tsx      # Trust score visualization
      ApprovalQueue.tsx       # Pending approvals
      EscalationHistory.tsx
```

### Database Schema (Prisma)

```prisma
model AutonomyLevel {
  id                String   @id @default(uuid())
  organizationId    String
  agentType         String   // orchestrator, brand, ops, etc.

  // Current level
  level             Int      @default(1) // 1-5
  // 1: All actions require approval
  // 2: Low-risk actions auto-approved
  // 3: Medium-risk actions auto-approved
  // 4: High-risk actions need approval
  // 5: Full autonomy (only critical escalation)

  // Trust metrics
  trustScore        Float    @default(0.5) // 0-1
  successStreak     Int      @default(0)
  totalActions      Int      @default(0)
  approvedActions   Int      @default(0)
  rejectedActions   Int      @default(0)

  // Progression
  lastLevelChange   DateTime?
  levelChangeReason String?

  // Thresholds (customizable)
  thresholds        Json     // Per-level thresholds

  updatedAt         DateTime @updatedAt

  @@unique([organizationId, agentType])
}

model AutonomyRule {
  id                String   @id @default(uuid())
  organizationId    String

  // Rule identification
  name              String
  description       String

  // Action classification
  actionPattern     Json     // What actions this rule matches
  riskLevel         String   // low, medium, high, critical

  // Required autonomy level
  requiredLevel     Int      // Minimum level to auto-approve

  // Override rules
  alwaysApprove     Boolean  @default(false)
  alwaysEscalate    Boolean  @default(false)

  // Escalation
  escalateTo        String?  // User ID or role
  escalationTimeout Int?     // Minutes before auto-action

  enabled           Boolean  @default(true)

  createdAt         DateTime @default(now())

  @@index([organizationId])
}

model ApprovalRequest {
  id                String   @id @default(uuid())
  organizationId    String

  // Source
  agentType         String
  executionId       String

  // Action details
  actionType        String
  actionDetails     Json
  riskLevel         String
  riskReason        String?

  // Context
  context           Json     // What led to this action

  // Decision
  status            String   @default("pending") // pending, approved, rejected, expired, auto_approved
  decidedBy         String?
  decidedAt         DateTime?
  decisionReason    String?

  // Auto-approval
  autoApproveAt     DateTime? // If set, will auto-approve at this time

  // Outcome (if executed)
  executed          Boolean  @default(false)
  executionResult   Json?

  createdAt         DateTime @default(now())
  expiresAt         DateTime

  @@index([organizationId, status])
  @@index([agentType])
}

model TrustEvent {
  id                String   @id @default(uuid())
  organizationId    String
  agentType         String

  // Event
  eventType         String   // success, failure, correction, approval, rejection

  // Impact
  trustDelta        Float    // How much trust changed
  newTrustScore     Float

  // Context
  executionId       String?
  correctionId      String?
  approvalId        String?

  details           Json?

  createdAt         DateTime @default(now())

  @@index([organizationId, agentType])
}
```

### TypeScript Interfaces

```typescript
// src/learning/autonomy/types.ts
export enum AutonomyLevelValue {
  SUPERVISED = 1, // All actions require approval
  ASSISTED = 2, // Low-risk auto-approved
  COLLABORATIVE = 3, // Medium-risk auto-approved
  SEMI_AUTONOMOUS = 4, // Only high-risk needs approval
  AUTONOMOUS = 5, // Full autonomy, critical only
}

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface TrustScoreFactors {
  successRate: number; // Weight: 0.3
  correctionRate: number; // Weight: 0.3 (inverse)
  userSatisfaction: number; // Weight: 0.2
  streak: number; // Weight: 0.1
  recency: number; // Weight: 0.1
}

export interface AutonomyDecision {
  canProceed: boolean;
  requiresApproval: boolean;
  reason: string;
  riskLevel: RiskLevel;
  escalateTo?: string;
  autoApproveIn?: number; // minutes
}
```

```typescript
// src/learning/autonomy/level-manager.ts
export interface AutonomyLevelManager {
  // Get current autonomy level
  getLevel(orgId: string, agentType: string): Promise<AutonomyLevel>;

  // Check if action can proceed
  checkAction(orgId: string, agentType: string, action: AgentAction): Promise<AutonomyDecision>;

  // Update trust score based on outcome
  recordOutcome(orgId: string, agentType: string, outcome: ActionOutcome): Promise<void>;

  // Evaluate for level change
  evaluateLevelChange(orgId: string, agentType: string): Promise<LevelChangeResult>;
}

export interface LevelChangeResult {
  changed: boolean;
  oldLevel: number;
  newLevel: number;
  reason: string;
}
```

```typescript
// src/learning/autonomy/trust-scorer.ts
export interface TrustScorer {
  // Calculate trust score
  calculate(factors: TrustScoreFactors): number;

  // Update score after event
  updateAfterEvent(currentScore: number, event: TrustEventType, severity?: number): number;

  // Get score threshold for level
  getLevelThreshold(level: AutonomyLevelValue): number;
}
```

```typescript
// src/learning/autonomy/approval-flow.ts
export interface ApprovalFlow {
  // Request approval
  request(
    orgId: string,
    agentType: string,
    action: AgentAction,
    context: unknown,
  ): Promise<ApprovalRequest>;

  // Wait for approval (with timeout)
  waitForApproval(requestId: string, timeoutMs: number): Promise<ApprovalDecision>;

  // Approve
  approve(requestId: string, userId: string, reason?: string): Promise<void>;

  // Reject
  reject(requestId: string, userId: string, reason: string): Promise<void>;
}
```

### API Endpoints

```typescript
// src/api/autonomy.ts
// GET /api/autonomy/levels
// Returns autonomy levels for all agent types

// GET /api/autonomy/levels/:agentType
// PUT /api/autonomy/levels/:agentType
interface UpdateAutonomyLevelRequest {
  level?: number;
  thresholds?: Record<string, number>;
}

// GET /api/autonomy/rules
// POST /api/autonomy/rules
// PUT /api/autonomy/rules/:id

// GET /api/autonomy/approvals?status=pending
// POST /api/autonomy/approvals/:id/approve
// POST /api/autonomy/approvals/:id/reject

// GET /api/autonomy/trust-history/:agentType
// Trust score history over time

// GET /api/autonomy/dashboard
// Overview of all autonomy metrics
```

### Frontend Components

```typescript
// frontend/src/components/autonomy/TrustDashboard.tsx
export function TrustDashboard() {
  // Shows:
  // - Trust score per agent (gauge)
  // - Current autonomy level
  // - Recent trust events
  // - Trend over time (chart)
  // - Success streak
}
```

```typescript
// frontend/src/components/autonomy/ApprovalQueue.tsx
export function ApprovalQueue() {
  // Shows pending approvals
  // Quick approve/reject buttons
  // Action details expandable
  // Auto-approve countdown visible
}
```

### Success Criteria Checklist

- [ ] AutonomyLevel, AutonomyRule, ApprovalRequest, TrustEvent tables created
- [ ] Trust score calculated from success/correction/satisfaction
- [ ] 5 autonomy levels with clear progression
- [ ] Risk classification for actions (low/medium/high/critical)
- [ ] Approval queue with approve/reject functionality
- [ ] Auto-approval after timeout (configurable)
- [ ] Level progression triggers on threshold crossing
- [ ] Level regression on trust drop
- [ ] Notification on pending approvals (Slack, email)
- [ ] Dashboard shows trust trends and autonomy status

---

## Prompt 50: Learning System Dashboard & Analytics

### Overview

Build a comprehensive dashboard for monitoring the entire learning system - activity tracking, corrections, patterns, knowledge, autonomy, and learning pipeline status.

### Directory Structure

```
src/
  api/
    learning-dashboard.ts     # Dashboard API endpoints
  learning/
    analytics/
      metrics-aggregator.ts   # Aggregate learning metrics
      trend-analyzer.ts       # Analyze trends
      report-generator.ts     # Generate reports
frontend/src/
  pages/
    LearningDashboardPage.tsx # Main dashboard
    LearningReportsPage.tsx   # Detailed reports
  components/
    learning-dashboard/
      OverviewPanel.tsx       # High-level metrics
      ActivityPanel.tsx       # Activity tracking stats
      CorrectionPanel.tsx     # Correction analytics
      PatternPanel.tsx        # Pattern discovery stats
      KnowledgePanel.tsx      # Knowledge base stats
      AutonomyPanel.tsx       # Autonomy progression
      PipelinePanel.tsx       # Training pipeline status
      TrendCharts.tsx         # Time-series charts
```

### Database Schema (Prisma)

```prisma
model LearningMetricsSnapshot {
  id                String   @id @default(uuid())
  organizationId    String

  // Timestamp
  snapshotDate      DateTime @default(now())

  // Activity metrics
  totalEvents       Int
  uniqueUsers       Int
  avgEventsPerUser  Float

  // Correction metrics
  totalCorrections  Int
  correctionRate    Float    // corrections per 100 agent outputs
  avgCorrectionSeverity Float

  // Pattern metrics
  patternsDetected  Int
  patternsAutomated Int
  automationRate    Float

  // Knowledge metrics
  articlesCreated   Int
  articlesUsed      Int
  knowledgeGaps     Int      // Detected but unfilled

  // Autonomy metrics
  avgTrustScore     Float
  avgAutonomyLevel  Float
  approvalRate      Float    // % of approvals granted

  // Learning pipeline
  trainingSamples   Int
  modelsImproved    Int

  // Overall health score
  healthScore       Float    // 0-100

  @@index([organizationId, snapshotDate])
}

model LearningAlert {
  id                String   @id @default(uuid())
  organizationId    String

  // Alert type
  alertType         String   // anomaly, threshold, trend, error
  severity          String   // info, warning, critical

  // Content
  title             String
  description       String
  metric            String?  // Which metric triggered this
  currentValue      Float?
  threshold         Float?

  // Status
  status            String   @default("open") // open, acknowledged, resolved
  acknowledgedBy    String?
  acknowledgedAt    DateTime?
  resolvedAt        DateTime?

  createdAt         DateTime @default(now())

  @@index([organizationId, status])
}

model LearningReport {
  id                String   @id @default(uuid())
  organizationId    String

  // Report info
  reportType        String   // daily, weekly, monthly, custom
  periodStart       DateTime
  periodEnd         DateTime

  // Content
  summary           Json     // Executive summary
  metrics           Json     // Detailed metrics
  insights          Json     // AI-generated insights
  recommendations   Json     // Suggested actions

  // Status
  status            String   @default("generating") // generating, ready, error

  // Delivery
  sentTo            String[] // User IDs
  sentAt            DateTime?

  createdAt         DateTime @default(now())

  @@index([organizationId, reportType])
}
```

### TypeScript Interfaces

```typescript
// src/learning/analytics/types.ts
export interface LearningMetrics {
  activity: ActivityMetrics;
  corrections: CorrectionMetrics;
  patterns: PatternMetrics;
  knowledge: KnowledgeMetrics;
  autonomy: AutonomyMetrics;
  pipeline: PipelineMetrics;
  health: HealthScore;
}

export interface ActivityMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  uniqueUsers: number;
  avgEventsPerUser: number;
  peakHour: number;
  trend: Trend;
}

export interface CorrectionMetrics {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  rate: number; // per 100 outputs
  avgSeverity: number;
  topAgents: AgentCorrectionStat[];
  trend: Trend;
}

export interface PatternMetrics {
  detected: number;
  automated: number;
  pending: number;
  automationRate: number;
  topPatterns: PatternStat[];
  trend: Trend;
}

export interface KnowledgeMetrics {
  totalArticles: number;
  byCategory: Record<string, number>;
  created: number;
  used: number;
  helpfulRate: number;
  gaps: number;
  trend: Trend;
}

export interface AutonomyMetrics {
  byAgent: Record<string, AgentAutonomyStat>;
  avgTrustScore: number;
  avgLevel: number;
  pendingApprovals: number;
  approvalRate: number;
  levelChanges: LevelChange[];
}

export interface PipelineMetrics {
  datasetsBuilt: number;
  trainingRuns: number;
  modelsDeployed: number;
  avgImprovement: number;
  nextScheduledRun: Date;
  status: "healthy" | "degraded" | "error";
}

export interface HealthScore {
  overall: number; // 0-100
  components: {
    dataCollection: number;
    learning: number;
    knowledge: number;
    autonomy: number;
  };
  issues: HealthIssue[];
}

export type Trend = "up" | "down" | "stable";
```

```typescript
// src/learning/analytics/metrics-aggregator.ts
export interface MetricsAggregator {
  // Get current metrics
  getCurrent(orgId: string): Promise<LearningMetrics>;

  // Get metrics for time range
  getForPeriod(orgId: string, from: Date, to: Date): Promise<LearningMetrics>;

  // Get time series
  getTimeSeries(
    orgId: string,
    metric: string,
    from: Date,
    to: Date,
    granularity: "hour" | "day" | "week",
  ): Promise<TimeSeriesData>;

  // Compare periods
  compare(orgId: string, period1: DateRange, period2: DateRange): Promise<MetricsComparison>;
}
```

```typescript
// src/learning/analytics/report-generator.ts
export interface ReportGenerator {
  // Generate periodic report
  generate(orgId: string, type: ReportType, period: DateRange): Promise<LearningReport>;

  // Generate insights using AI
  generateInsights(metrics: LearningMetrics): Promise<Insight[]>;

  // Generate recommendations
  generateRecommendations(metrics: LearningMetrics): Promise<Recommendation[]>;
}

export interface Insight {
  type: "positive" | "negative" | "neutral";
  metric: string;
  description: string;
  impact: "high" | "medium" | "low";
}

export interface Recommendation {
  action: string;
  reason: string;
  expectedImpact: string;
  priority: "high" | "medium" | "low";
}
```

### API Endpoints

```typescript
// src/api/learning-dashboard.ts
// GET /api/learning/dashboard
// Returns comprehensive dashboard data

// GET /api/learning/metrics?from=&to=
// GET /api/learning/metrics/timeseries?metric=&from=&to=&granularity=

// GET /api/learning/health
// System health check

// GET /api/learning/alerts?status=
// PUT /api/learning/alerts/:id/acknowledge
// PUT /api/learning/alerts/:id/resolve

// GET /api/learning/reports?type=
// POST /api/learning/reports/generate
interface GenerateReportRequest {
  type: string;
  from: string;
  to: string;
}
// GET /api/learning/reports/:id
```

### Frontend Components

```typescript
// frontend/src/pages/LearningDashboardPage.tsx
export function LearningDashboardPage() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12">
        <OverviewPanel />
      </div>
      <div className="col-span-6">
        <ActivityPanel />
      </div>
      <div className="col-span-6">
        <CorrectionPanel />
      </div>
      <div className="col-span-4">
        <PatternPanel />
      </div>
      <div className="col-span-4">
        <KnowledgePanel />
      </div>
      <div className="col-span-4">
        <AutonomyPanel />
      </div>
      <div className="col-span-12">
        <PipelinePanel />
      </div>
    </div>
  );
}
```

```typescript
// frontend/src/components/learning-dashboard/OverviewPanel.tsx
export function OverviewPanel() {
  // Health score gauge (0-100)
  // Key metrics summary
  // Active alerts
  // Quick actions
}
```

```typescript
// frontend/src/components/learning-dashboard/TrendCharts.tsx
interface TrendChartsProps {
  metrics: string[];
  from: Date;
  to: Date;
  granularity: "hour" | "day" | "week";
}

export function TrendCharts({ metrics, from, to, granularity }: TrendChartsProps) {
  // Line charts for selected metrics over time
  // Comparison overlays
  // Anomaly highlighting
}
```

### Success Criteria Checklist

- [ ] LearningMetricsSnapshot, LearningAlert, LearningReport tables created
- [ ] Daily metrics snapshot job runs
- [ ] Dashboard shows all metric categories
- [ ] Time series charts with configurable granularity
- [ ] Health score accurately reflects system state
- [ ] Alerts generated on anomalies/thresholds
- [ ] Weekly reports auto-generated
- [ ] AI insights extracted from metrics
- [ ] Recommendations based on data
- [ ] Export capabilities (CSV, PDF)
- [ ] Mobile-responsive dashboard
- [ ] Real-time updates via SSE

---

## Summary

Phase 5 establishes Nubabel's learning capabilities - the "Human as Training Data" vision. These 10 prompts cover:

1. **Data Collection** (41-42): Activity tracking and correction capture
2. **Pattern Discovery** (43-44): Behavioral patterns and proactive assistance
3. **Learning Infrastructure** (45-46): Pipeline and agent self-improvement
4. **Knowledge Management** (47-48): Feedback hub and knowledge distillation
5. **Autonomy Progression** (49): Graduated autonomy based on trust
6. **Monitoring** (50): Dashboard and analytics

Each prompt is self-contained and can be executed by a separate agent. The total scope is approximately 6-12 months of development depending on parallelization.

### Execution Order Recommendation

```
Parallel Group 1 (Foundation):
  - Prompt 41: Activity Tracking
  - Prompt 42: Correction Capture

Parallel Group 2 (Intelligence):
  - Prompt 43: Pattern Learning
  - Prompt 47: Feedback Hub

Parallel Group 3 (Application):
  - Prompt 44: Proactive Assistance
  - Prompt 48: Knowledge Distillation

Sequential (Core):
  - Prompt 45: Learning Pipeline (depends on 41, 42, 43)
  - Prompt 46: Agent Self-Improvement (depends on 45)

Parallel Group 4 (Governance):
  - Prompt 49: Autonomy Progression
  - Prompt 50: Dashboard (integrates all)
```
