# Nubabel UX Improvement Plan
## Absorbing Moltbot's UX Patterns

**Plan ID:** nubabel-ux-improvement
**Created:** 2026-01-29
**Status:** Ready for Execution
**Revision:** 2 (Critic feedback addressed)

---

## 1. Executive Summary

Transform Nubabel's utilitarian dashboard interface into an intuitive, responsive experience by absorbing Moltbot's proven UX patterns. The goal is to dramatically improve usability while maintaining Nubabel's existing React + TypeScript + Tailwind stack.

### Key Transformation Goals

| Current State | Target State |
|---------------|--------------|
| No onboarding | Guided wizard with progress indicators |
| Static data fetching | Real-time streaming with SSE |
| Plain loading states | Animated spinners + skeleton screens |
| Basic error alerts | Toast notifications with actions |
| Dense navigation | Clean, contextual navigation |
| No typing indicators | Human-delay pacing + typing dots |

### Success Metrics
- Time to first value: < 5 minutes (currently ~30 min setup)
- User confusion rate: Reduced by 80%
- Real-time feedback: < 200ms latency
- Empty state abandonment: -50%

---

## 2. Existing SSE Infrastructure (VERIFIED)

### Backend SSE Endpoint: `/api/events`

The SSE endpoint already exists at `src/api/sse.ts` and is registered in `src/index.ts`:

```typescript
// src/index.ts line 500
app.use("/api", sseRouter);

// src/api/sse.ts line 165
sseRouter.get("/events", authenticate, (req: Request, res: Response) => {
  // ... SSE implementation
});
```

**Full endpoint path:** `GET /api/events`

### Authentication Mechanism

SSE uses cookie-based session authentication:

1. **Frontend:** Uses `withCredentials: true` to send cookies
2. **Backend:** The `/api/events` route uses `authenticate` middleware
3. **Session flow:**
   - User logs in via `/auth/login` or OAuth
   - Server sets `HttpOnly` session cookie
   - EventSource sends cookie automatically with `withCredentials: true`
   - Backend validates session via cookie in `authenticate` middleware

```typescript
// The authenticate middleware (src/middleware/auth.middleware.ts)
// validates the session cookie and attaches req.user and req.organization
```

### Existing Backend Event Names

The backend emits these events (from `src/services/sse-service.ts` and `src/api/sse.ts`):

| Event | Source | Description |
|-------|--------|-------------|
| `job:progress` | SSE Event Bridge | Job execution progress updates |
| `queue:*` | SSE Event Bridge | Queue-related events |
| `notification` | SSE Event Bridge | User/org notifications |
| `orchestration:*` | SSE Event Bridge | Agent orchestration events |
| `connected` | SSE Manager | Initial connection confirmation |
| `shutdown` | SSE Manager | Server shutdown notification |

---

## 3. Current State Analysis

### UX Problems Identified

#### A. Onboarding & First-Run Experience
**Problem:** Zero guidance for new users
- Login page goes straight to empty dashboard
- No prerequisite checks (integrations, permissions)
- "Getting Started" box is passive text, not interactive
- Users don't know what to configure first

**Evidence (DashboardPage.tsx:58-70):**
```tsx
<div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
  <h3>Getting Started</h3>
  <ol className="list-decimal">
    <li>Create your first workflow</li>
    <li>Configure your integrations</li>
    <li>Run and monitor your automation</li>
  </ol>
</div>
```
This is passive - tells users what to do but doesn't help them do it.

#### B. Real-Time Feedback
**Problem:** No streaming, no live updates
- Activity page polls every 30 seconds (AgentActivityPage.tsx:46)
- Conversations load without typing indicators
- Execution status doesn't update live
- SSE infrastructure exists but frontend doesn't use it

**Evidence (AgentActivityPage.tsx:42-51):**
```tsx
useEffect(() => {
  fetchActivities();
  // Auto-refresh every 30 seconds - TOO SLOW
  const interval = setInterval(() => fetchActivities(), 30000);
  return () => clearInterval(interval);
}, []);
```

#### C. Loading & Empty States
**Problem:** Generic, uninformative states
- Same spinner everywhere (border-t-2 border-b-2 border-indigo-600)
- Empty states are dead-ends with no call to action
- No skeleton screens during data loading
- No optimistic updates

**Evidence (WorkflowsPage.tsx:87-98):**
```tsx
{workflows.length === 0 ? (
  <div className="bg-white rounded-lg shadow p-12 text-center">
    <div className="text-6xl mb-4">clipboard emoji</div>
    <h2>No workflows yet</h2>
    <p>Create your first workflow...</p>
    <!-- NO BUTTON, NO ACTION -->
  </div>
)}
```

#### D. Navigation Overload
**Problem:** Too many sidebar items, no hierarchy
- 17+ navigation items visible at once
- No collapsible sections
- No quick actions or search
- Emoji icons feel unprofessional

**Evidence (Sidebar.tsx):**
- mainNavItems: 6 items
- activityNavItems: 5 items
- integrationNavItems: 2 items
- adminNavItems: 6 items (for admins)

#### E. Conversation Experience
**Problem:** No real-time chat features
- Messages load all at once, no streaming
- No typing indicators
- No "new message" notifications
- No message threading context

---

## 4. Moltbot UX Patterns to Absorb

### Pattern 1: One-Click Onboarding Wizard
**Moltbot:** `moltbot onboard --install-daemon`
- Prerequisite checks with pass/fail indicators
- Step-by-step guided flow
- Progress persistence (resume where you left off)
- Clear success/error states at each step

**Nubabel Implementation:**
```
/onboarding
  Step 1: Welcome + Goals
  Step 2: Integration Selection
  Step 3: Connect Slack (OAuth flow)
  Step 4: Connect Notion (OAuth flow)
  Step 5: First Workflow Creation
  Step 6: Test Run + Success
```

### Pattern 2: Block-by-Block Streaming
**Moltbot:** Responses appear word-by-word with natural pacing
- 30-80ms delay between words (human typing speed)
- Streaming via SSE/WebSocket
- Thinking indicator ("...") during processing
- Smooth cursor animation

**Nubabel Implementation:**
- Use existing SSE infrastructure (`/api/events`)
- Add StreamingMessage component
- Implement human-delay pacing (50ms default)
- Add ThinkingIndicator component

### Pattern 3: Live Canvas / Activity Feed
**Moltbot:** Real-time visual workspace
- Updates appear without refresh
- Animations for new items
- Status changes highlighted
- Collapse/expand for details

**Nubabel Implementation:**
- Real-time activity feed via SSE
- Animated entry for new items
- Click to expand details
- Auto-scroll to bottom option

### Pattern 4: Contextual Navigation
**Moltbot:** Clean sidebar with collapsible sections
- Primary actions always visible
- Secondary actions collapsed by default
- Quick action shortcuts (Cmd+K palette)
- Breadcrumb context

**Nubabel Implementation:**
- Collapsible sidebar sections
- Quick action modal (Cmd+K)
- Reduce visible items to 6-8 primary
- Professional icons (Heroicons instead of emoji)

### Pattern 5: Toast Notification System
**Moltbot:** Non-blocking notifications with actions
- Success/error/info/warning variants
- Auto-dismiss with countdown
- Action buttons (Undo, Retry, View)
- Stack multiple toasts

**Nubabel Implementation:**
- Toast provider at app root
- useToast() hook
- Toast component with variants
- Animation system (slide + fade)

---

## 5. Phase 1: Onboarding Wizard (Priority 1)

### Deliverables
1. `OnboardingPage.tsx` - Main wizard component
2. `OnboardingStep.tsx` - Reusable step component
3. `OnboardingProgress.tsx` - Progress indicator
4. `useOnboarding.ts` - State management hook
5. Backend: `/api/onboarding/status` endpoint with helper functions

### Component Structure

```
frontend/src/pages/OnboardingPage.tsx
frontend/src/components/onboarding/
  OnboardingWizard.tsx      # Main container
  OnboardingStep.tsx        # Individual step
  OnboardingProgress.tsx    # Progress bar
  PrerequisiteCheck.tsx     # Check items
  steps/
    WelcomeStep.tsx         # Step 1
    IntegrationStep.tsx     # Step 2
    SlackConnectStep.tsx    # Step 3
    NotionConnectStep.tsx   # Step 4
    FirstWorkflowStep.tsx   # Step 5
    SuccessStep.tsx         # Step 6
  index.ts
frontend/src/hooks/useOnboarding.ts
```

### OnboardingWizard Component

```tsx
// frontend/src/components/onboarding/OnboardingWizard.tsx
interface OnboardingState {
  currentStep: number;
  completedSteps: number[];
  integrations: {
    slack: 'pending' | 'connected' | 'skipped';
    notion: 'pending' | 'connected' | 'skipped';
  };
}

const STEPS = [
  { id: 'welcome', title: 'Welcome', component: WelcomeStep },
  { id: 'integrations', title: 'Choose Integrations', component: IntegrationStep },
  { id: 'slack', title: 'Connect Slack', component: SlackConnectStep, optional: true },
  { id: 'notion', title: 'Connect Notion', component: NotionConnectStep, optional: true },
  { id: 'workflow', title: 'First Workflow', component: FirstWorkflowStep },
  { id: 'success', title: 'Ready!', component: SuccessStep },
];
```

### Progress Indicator

```tsx
// frontend/src/components/onboarding/OnboardingProgress.tsx
export function OnboardingProgress({
  currentStep,
  totalSteps,
  completedSteps
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-full transition-all duration-300",
            i < currentStep
              ? "w-8 bg-indigo-600"
              : i === currentStep
                ? "w-8 bg-indigo-400 animate-pulse"
                : "w-2 bg-gray-300"
          )}
        />
      ))}
    </div>
  );
}
```

### Prerequisite Checks

```tsx
// frontend/src/components/onboarding/PrerequisiteCheck.tsx
interface Check {
  id: string;
  label: string;
  status: 'checking' | 'passed' | 'failed' | 'warning';
  message?: string;
}

const CHECKS: Check[] = [
  { id: 'auth', label: 'Authentication', status: 'checking' },
  { id: 'org', label: 'Organization', status: 'checking' },
  { id: 'slack', label: 'Slack Available', status: 'checking' },
  { id: 'notion', label: 'Notion Available', status: 'checking' },
];

function CheckItem({ check }: { check: Check }) {
  const icons = {
    checking: <Spinner className="h-4 w-4" />,
    passed: <CheckCircle className="h-4 w-4 text-green-500" />,
    failed: <XCircle className="h-4 w-4 text-red-500" />,
    warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  };

  return (
    <div className="flex items-center gap-3 py-2">
      {icons[check.status]}
      <span className={check.status === 'failed' ? 'text-red-600' : ''}>{check.label}</span>
      {check.message && <span className="text-sm text-gray-500">{check.message}</span>}
    </div>
  );
}
```

### API Endpoint with Helper Functions (CRITIC FIX #3)

```typescript
// src/api/onboarding.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../db/client';

const router = Router();

/**
 * Check if Slack integration exists for organization
 * Uses SlackIntegration model from Prisma schema
 */
async function checkSlackIntegration(organizationId: string): Promise<boolean> {
  const integration = await db.slackIntegration.findFirst({
    where: {
      organizationId,
      enabled: true,
    },
    select: { id: true },
  });
  return integration !== null;
}

/**
 * Check if Notion connection exists for organization
 * Uses NotionConnection model from Prisma schema
 */
async function checkNotionIntegration(organizationId: string): Promise<boolean> {
  const connection = await db.notionConnection.findUnique({
    where: { organizationId },
    select: { id: true },
  });
  return connection !== null;
}

/**
 * Check if organization has any workflows
 * Uses Workflow model from Prisma schema
 */
async function hasAnyWorkflows(organizationId: string): Promise<boolean> {
  const count = await db.workflow.count({
    where: { organizationId },
  });
  return count > 0;
}

/**
 * Determine current onboarding step based on completion status
 */
function determineCurrentStep(status: {
  slackConnected: boolean;
  notionConnected: boolean;
  hasWorkflows: boolean;
}): number {
  // Step 0: Welcome (always complete after first visit)
  // Step 1: Integration selection
  // Step 2: Slack (if not connected)
  // Step 3: Notion (if not connected)
  // Step 4: First workflow
  // Step 5: Success

  if (!status.slackConnected && !status.notionConnected) {
    return 1; // Integration selection
  }
  if (!status.slackConnected) {
    return 2; // Connect Slack
  }
  if (!status.notionConnected) {
    return 3; // Connect Notion
  }
  if (!status.hasWorkflows) {
    return 4; // Create first workflow
  }
  return 5; // Success / Complete
}

router.get('/onboarding/status', authenticate, async (req, res) => {
  const organizationId = req.organization!.id;

  // Check what's already configured using defined helper functions
  const [slackConnected, notionConnected, hasWorkflows] = await Promise.all([
    checkSlackIntegration(organizationId),
    checkNotionIntegration(organizationId),
    hasAnyWorkflows(organizationId),
  ]);

  // Determine onboarding state
  const onboardingComplete = (slackConnected || notionConnected) && hasWorkflows;
  const currentStep = determineCurrentStep({ slackConnected, notionConnected, hasWorkflows });

  res.json({
    complete: onboardingComplete,
    currentStep,
    integrations: {
      slack: slackConnected ? 'connected' : 'pending',
      notion: notionConnected ? 'connected' : 'pending',
    },
    hasWorkflows,
  });
});

export default router;
```

### Effort Estimate
- OnboardingWizard + steps: 4 hours
- Progress indicators: 1 hour
- Backend endpoint with helpers: 1.5 hours
- Testing + polish: 2 hours
- **Total: 8.5 hours**

---

## 6. Phase 2: Real-Time Streaming (Priority 2)

### Deliverables
1. `useSSE.ts` - SSE connection hook (FIXED for correct endpoint)
2. `StreamingMessage.tsx` - Word-by-word streaming component
3. `ThinkingIndicator.tsx` - Animated thinking dots
4. `useTypingEffect.ts` - Human-delay pacing hook

### SSE Hook (CRITIC FIX #1 & #5 - Correct endpoint & auth)

```tsx
// frontend/src/hooks/useSSE.ts
import { useState, useEffect, useRef, useCallback } from 'react';

interface SSEOptions {
  /**
   * Event names to listen for.
   * Backend emits: job:progress, notification, orchestration:*, queue:*
   */
  events: string[];
  onMessage: (event: string, data: unknown) => void;
  onError?: (error: Event) => void;
  onConnected?: () => void;
}

/**
 * SSE Hook for real-time updates
 *
 * Authentication: Uses cookie-based session auth.
 * The session cookie is set during login and sent automatically
 * via withCredentials: true. No additional auth headers needed.
 *
 * Endpoint: GET /api/events (from src/api/sse.ts)
 */
export function useSSE(options: SSEOptions) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const apiUrl = import.meta.env.VITE_API_URL || '';
    // CORRECT ENDPOINT: /api/events (not /api/sse/subscribe)
    const url = `${apiUrl}/api/events`;

    // EventSource with credentials for cookie-based session auth
    // The session cookie (HttpOnly) is sent automatically
    const eventSource = new EventSource(url, {
      withCredentials: true
    });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = (e) => {
      setConnected(false);
      options.onError?.(e);

      // Auto-reconnect with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        setReconnecting(true);
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      }
    };

    // Listen for 'connected' event (sent by backend on connection)
    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      console.log('SSE connected with clientId:', data.clientId);
      options.onConnected?.();
    });

    // Subscribe to requested events
    options.events.forEach(event => {
      eventSource.addEventListener(event, (e) => {
        try {
          const data = JSON.parse(e.data);
          options.onMessage(event, data);
        } catch (err) {
          console.error('Failed to parse SSE event data:', err);
        }
      });
    });
  }, [options]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      setConnected(false);
    };
  }, [connect]);

  return { connected, reconnecting };
}
```

### Event Name Mapping (CRITIC FIX #2)

The frontend must use event names that match what the backend emits:

| Backend Event | Frontend Use Case | Description |
|---------------|-------------------|-------------|
| `job:progress` | Execution progress | Job stage updates with percentage |
| `notification` | Toast/alerts | User and org notifications |
| `orchestration:started` | Agent activity | Agent started event |
| `orchestration:completed` | Agent activity | Agent finished event |
| `orchestration:error` | Error handling | Agent error event |
| `orchestration:message` | Chat messages | Agent message streaming |
| `queue:added` | Activity feed | New job queued |
| `queue:completed` | Activity feed | Job finished |
| `queue:failed` | Activity feed | Job failed |

**Frontend event subscription examples:**

```tsx
// For activity feed - use actual backend events
useSSE({
  events: [
    'job:progress',
    'orchestration:started',
    'orchestration:completed',
    'orchestration:error'
  ],
  onMessage: (event, data) => {
    // Handle each event type
  }
});

// For chat/conversations - use orchestration events
useSSE({
  events: [
    'orchestration:message',  // Agent messages
    'notification'            // System notifications
  ],
  onMessage: (event, data) => {
    if (event === 'orchestration:message') {
      // Handle streaming message
    }
  }
});
```

### Streaming Message Component

```tsx
// frontend/src/components/chat/StreamingMessage.tsx
interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  typingSpeed?: number; // ms between characters
}

export function StreamingMessage({
  content,
  isStreaming,
  typingSpeed = 30
}: StreamingMessageProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayedContent(content);
      return;
    }

    let index = 0;
    const timer = setInterval(() => {
      if (index < content.length) {
        setDisplayedContent(content.slice(0, index + 1));
        index++;
      } else {
        clearInterval(timer);
      }
    }, typingSpeed);

    return () => clearInterval(timer);
  }, [content, isStreaming, typingSpeed]);

  // Cursor blink effect
  useEffect(() => {
    if (!isStreaming) {
      setCursorVisible(false);
      return;
    }
    const blink = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);
    return () => clearInterval(blink);
  }, [isStreaming]);

  return (
    <div className="relative">
      <span>{displayedContent}</span>
      {isStreaming && cursorVisible && (
        <span className="inline-block w-0.5 h-5 bg-gray-800 ml-0.5 animate-pulse" />
      )}
    </div>
  );
}
```

### Thinking Indicator

```tsx
// frontend/src/components/chat/ThinkingIndicator.tsx
export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-2 px-3 bg-gray-100 rounded-lg w-fit">
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}
```

### Human-Delay Pacing Hook

```tsx
// frontend/src/hooks/useTypingEffect.ts
export function useTypingEffect(text: string, speed: number = 50) {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    setIsTyping(true);
    let i = 0;

    const interval = setInterval(() => {
      if (i < text.length) {
        // Natural variation in typing speed (30-70ms)
        const variance = Math.random() * 40 - 20;
        const actualSpeed = Math.max(10, speed + variance);

        setDisplayText(text.slice(0, i + 1));
        i++;

        // Longer pause at punctuation
        if ('.!?'.includes(text[i - 1])) {
          setTimeout(() => {}, 200);
        }
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayText, isTyping };
}
```

### Update Conversations Page (CRITIC FIX #2 - Correct events)

```tsx
// Modify frontend/src/pages/ConversationsPage.tsx
// Use ACTUAL backend event names

const [isAgentTyping, setIsAgentTyping] = useState(false);
const [messages, setMessages] = useState<Message[]>([]);

const { connected } = useSSE({
  // Use actual backend event names (not conversation:message)
  events: ['orchestration:message', 'orchestration:started', 'orchestration:completed'],
  onMessage: (event, data) => {
    if (event === 'orchestration:started') {
      // Agent started processing - show typing indicator
      setIsAgentTyping(true);
    }
    if (event === 'orchestration:message') {
      // Streaming message chunk from agent
      const msgData = data as { sessionId: string; content: string; isComplete: boolean };
      if (msgData.isComplete) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          content: msgData.content,
          role: 'agent',
          timestamp: new Date()
        }]);
      }
    }
    if (event === 'orchestration:completed') {
      // Agent finished - hide typing indicator
      setIsAgentTyping(false);
    }
  },
});

// In render, add typing indicator
{isAgentTyping && <ThinkingIndicator />}
```

### Effort Estimate
- useSSE hook (with correct endpoint): 2 hours
- StreamingMessage: 2 hours
- ThinkingIndicator: 30 mins
- useTypingEffect: 1 hour
- ConversationsPage updates: 2 hours
- Testing: 1.5 hours
- **Total: 9 hours**

---

## 7. Phase 3: Dashboard Redesign (Priority 3)

### Deliverables
1. Redesigned `DashboardPage.tsx` with action-oriented layout
2. `QuickActions.tsx` - Command palette component
3. `ActivityFeed.tsx` - Real-time activity stream (FIXED events)
4. `StatCard.tsx` - Animated statistics cards

### New Dashboard Layout

```
+-------------------------------------------+
| Dashboard                      [Cmd+K]    |
+-------------------------------------------+
|                                           |
|  +-------+  +-------+  +-------+  +-----+ |
|  | RUNS  |  | USERS |  | COST  |  | ERR | |
|  | 1,234 |  |   47  |  | $42.5 |  |  2  | |
|  +-------+  +-------+  +-------+  +-----+ |
|                                           |
|  +------------------+  +----------------+ |
|  | QUICK ACTIONS    |  | RECENT ACTIVITY| |
|  | [+] New Workflow |  | * Agent ran    | |
|  | [>] Run Workflow |  | * Slack msg    | |
|  | [*] Settings     |  | * User joined  | |
|  | [?] Help         |  |                | |
|  +------------------+  +----------------+ |
|                                           |
|  +--------------------------------------+ |
|  | GETTING STARTED        [Dismiss]     | |
|  | [x] Account created                  | |
|  | [ ] Connect Slack                    | |
|  | [ ] Create first workflow            | |
|  +--------------------------------------+ |
+-------------------------------------------+
```

### Quick Actions Component

```tsx
// frontend/src/components/dashboard/QuickActions.tsx
interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'new-workflow', label: 'New Workflow', icon: <PlusIcon />, shortcut: 'N', onClick: () => {} },
  { id: 'run-workflow', label: 'Run Workflow', icon: <PlayIcon />, shortcut: 'R', onClick: () => {} },
  { id: 'settings', label: 'Settings', icon: <CogIcon />, shortcut: 'S', onClick: () => {} },
  { id: 'help', label: 'Help & Docs', icon: <QuestionIcon />, shortcut: '?', onClick: () => {} },
];

export function QuickActions() {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
        Quick Actions
      </h3>
      <div className="space-y-2">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={action.onClick}
            className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-lg hover:bg-gray-50 transition-colors group"
          >
            <span className="text-gray-400 group-hover:text-indigo-600">{action.icon}</span>
            <span className="flex-1 text-gray-700">{action.label}</span>
            {action.shortcut && (
              <kbd className="px-2 py-0.5 text-xs bg-gray-100 rounded text-gray-500">
                {action.shortcut}
              </kbd>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Activity Feed Component (CRITIC FIX #2 - Correct events)

```tsx
// frontend/src/components/dashboard/ActivityFeed.tsx
interface Activity {
  id: string;
  type: 'execution' | 'message' | 'user' | 'system';
  title: string;
  description?: string;
  timestamp: Date;
  status?: 'success' | 'error' | 'pending';
}

export function ActivityFeed() {
  const [activities, setActivities] = useState<Activity[]>([]);

  // Subscribe to ACTUAL backend events (not activity:new)
  useSSE({
    events: [
      'job:progress',           // Job execution updates
      'orchestration:started',  // Agent started
      'orchestration:completed',// Agent completed
      'orchestration:error',    // Agent errors
      'notification',           // Notifications
    ],
    onMessage: (event, data) => {
      const newActivity = mapEventToActivity(event, data);
      if (newActivity) {
        setActivities(prev => [newActivity, ...prev].slice(0, 10));
      }
    },
  });

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
        Recent Activity
      </h3>
      <div className="space-y-3">
        {activities.map(activity => (
          <ActivityItem
            key={activity.id}
            activity={activity}
            className="animate-slide-in"
          />
        ))}
        {activities.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            No recent activity
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Map backend SSE events to Activity UI model
 */
function mapEventToActivity(event: string, data: unknown): Activity | null {
  const now = new Date();

  switch (event) {
    case 'job:progress': {
      const d = data as { jobId: string; stage: string; percentage: number };
      return {
        id: `job-${d.jobId}-${now.getTime()}`,
        type: 'execution',
        title: `Job ${d.stage}`,
        description: `${d.percentage}% complete`,
        timestamp: now,
        status: d.percentage === 100 ? 'success' : 'pending',
      };
    }
    case 'orchestration:started': {
      const d = data as { sessionId: string };
      return {
        id: `orch-start-${d.sessionId}`,
        type: 'execution',
        title: 'Agent started',
        timestamp: now,
        status: 'pending',
      };
    }
    case 'orchestration:completed': {
      const d = data as { sessionId: string };
      return {
        id: `orch-complete-${d.sessionId}`,
        type: 'execution',
        title: 'Agent completed',
        timestamp: now,
        status: 'success',
      };
    }
    case 'orchestration:error': {
      const d = data as { sessionId: string; error?: string };
      return {
        id: `orch-error-${d.sessionId}`,
        type: 'execution',
        title: 'Agent error',
        description: d.error,
        timestamp: now,
        status: 'error',
      };
    }
    case 'notification': {
      const d = data as { type: string; data: { message?: string } };
      return {
        id: `notif-${now.getTime()}`,
        type: 'system',
        title: d.type,
        description: d.data?.message,
        timestamp: now,
      };
    }
    default:
      return null;
  }
}
```

### Animated Stat Card

```tsx
// frontend/src/components/dashboard/StatCard.tsx
interface StatCardProps {
  title: string;
  value: number | string;
  change?: number; // percentage change
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export function StatCard({ title, value, change, icon, trend }: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0);

  // Animate number on mount
  useEffect(() => {
    if (typeof value !== 'number') return;

    const duration = 1000;
    const start = Date.now();

    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic

      setDisplayValue(Math.round(eased * value));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, [value]);

  return (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {typeof value === 'number' ? displayValue.toLocaleString() : value}
      </div>
      {change !== undefined && (
        <div className={cn(
          "text-sm mt-1",
          trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'
        )}>
          {change > 0 ? '+' : ''}{change}% from last week
        </div>
      )}
    </div>
  );
}
```

### Effort Estimate
- StatCard with animation: 2 hours
- QuickActions: 1.5 hours
- ActivityFeed + SSE (with correct events): 3 hours
- Dashboard layout: 2 hours
- Testing: 1.5 hours
- **Total: 10 hours**

---

## 8. Phase 4: Conversation UX (Priority 4)

### Deliverables
1. `ChatInterface.tsx` - Full chat component
2. `MessageThread.tsx` - Threaded messages
3. `ContextIndicator.tsx` - Session context display
4. `MessageInput.tsx` - Input with attachments

### Chat Interface (CRITIC FIX #2 - Correct events)

```tsx
// frontend/src/components/chat/ChatInterface.tsx
interface ChatInterfaceProps {
  conversationId?: string;
  onNewConversation?: () => void;
}

export function ChatInterface({ conversationId, onNewConversation }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAgentTyping]);

  // SSE subscription with CORRECT backend event names
  useSSE({
    events: [
      'orchestration:started',   // Agent started processing
      'orchestration:message',   // Streaming message content
      'orchestration:completed', // Agent finished
      'orchestration:error',     // Agent error
    ],
    onMessage: (event, data) => {
      const eventData = data as { sessionId: string; content?: string; isComplete?: boolean; error?: string };

      switch (event) {
        case 'orchestration:started':
          setIsAgentTyping(true);
          setStreamingContent('');
          break;

        case 'orchestration:message':
          // Append streaming content
          if (eventData.content) {
            setStreamingContent(prev => prev + eventData.content);
          }
          break;

        case 'orchestration:completed':
          setIsAgentTyping(false);
          // Add completed message to history
          if (streamingContent) {
            setMessages(prev => [...prev, {
              id: eventData.sessionId,
              content: streamingContent,
              role: 'agent',
              timestamp: new Date(),
            }]);
            setStreamingContent('');
          }
          break;

        case 'orchestration:error':
          setIsAgentTyping(false);
          // Show error as message
          setMessages(prev => [...prev, {
            id: `error-${Date.now()}`,
            content: eventData.error || 'An error occurred',
            role: 'system',
            timestamp: new Date(),
            isError: true,
          }]);
          break;
      }
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Context indicator */}
      <ContextIndicator conversationId={conversationId} />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {/* Show streaming content */}
        {streamingContent && (
          <StreamingMessage content={streamingContent} isStreaming={true} />
        )}

        {isAgentTyping && !streamingContent && <ThinkingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <MessageInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        disabled={isAgentTyping}
      />
    </div>
  );
}
```

### Context Indicator

```tsx
// frontend/src/components/chat/ContextIndicator.tsx
export function ContextIndicator({ conversationId }: { conversationId?: string }) {
  const { context } = useConversationContext(conversationId);

  if (!context) return null;

  return (
    <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 text-sm">
      <span className="text-indigo-600">Context:</span>
      {context.workflows.map(w => (
        <span key={w.id} className="px-2 py-0.5 bg-white rounded text-indigo-700">
          {w.name}
        </span>
      ))}
      {context.integrations.map(i => (
        <span key={i} className="px-2 py-0.5 bg-indigo-100 rounded text-indigo-600">
          {i}
        </span>
      ))}
    </div>
  );
}
```

### Message Input with Attachments

```tsx
// frontend/src/components/chat/MessageInput.tsx
interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function MessageInput({ value, onChange, onSend, disabled }: MessageInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-4 border-t bg-white">
      <div className="flex items-end gap-2 bg-gray-50 rounded-lg p-2">
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent border-0 focus:ring-0 text-gray-900 placeholder-gray-400"
          style={{ maxHeight: '120px' }}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
```

### Effort Estimate
- ChatInterface: 3 hours
- MessageBubble + threading: 2 hours
- ContextIndicator: 1 hour
- MessageInput: 1.5 hours
- Testing: 1.5 hours
- **Total: 9 hours**

---

## 9. Phase 5: Polish & Micro-interactions (Priority 5)

### Deliverables
1. Toast notification system
2. Skeleton loading screens
3. Animated transitions
4. Professional icons (Heroicons)

### Toast System

```tsx
// frontend/src/components/ui/Toast.tsx
interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}

// Toast context and provider
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...toast, id }]);

    if (toast.duration !== 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, toast.duration || 5000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// Toast container (renders at bottom-right)
function ToastContainer({ toasts, onRemove }: { toasts: Toast[], onRemove: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg shadow-lg max-w-sm animate-slide-in-right",
            {
              'bg-green-50 border border-green-200': toast.type === 'success',
              'bg-red-50 border border-red-200': toast.type === 'error',
              'bg-blue-50 border border-blue-200': toast.type === 'info',
              'bg-yellow-50 border border-yellow-200': toast.type === 'warning',
            }
          )}
        >
          <ToastIcon type={toast.type} />
          <div className="flex-1">
            <p className="font-medium text-gray-900">{toast.title}</p>
            {toast.message && <p className="text-sm text-gray-600 mt-1">{toast.message}</p>}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 mt-2"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button onClick={() => onRemove(toast.id)} className="text-gray-400 hover:text-gray-600">
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// Hook for using toasts
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
```

### Skeleton Screens

```tsx
// frontend/src/components/ui/Skeleton.tsx
interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = 'rectangular', width, height }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-gray-200",
        {
          'rounded-full': variant === 'circular',
          'rounded': variant === 'text' || variant === 'rectangular',
        },
        className
      )}
      style={{ width, height }}
    />
  );
}

// Skeleton loaders for specific components
export function WorkflowCardSkeleton() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <Skeleton className="h-6 w-3/4 mb-4" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-2/3 mb-4" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    </div>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow p-4">
          <Skeleton className="h-4 w-1/2 mb-3" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ))}
    </div>
  );
}
```

### CSS Animations

```css
/* frontend/src/styles/animations.css */

/* Slide in from right (for toasts) */
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.3s ease-out;
}

/* Slide in from top (for new items) */
@keyframes slide-in-down {
  from {
    transform: translateY(-10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-in-down {
  animation: slide-in-down 0.2s ease-out;
}

/* Fade in */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-fade-in {
  animation: fade-in 0.2s ease-out;
}

/* Pulse glow (for active states) */
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(99, 102, 241, 0);
  }
}

.animate-pulse-glow {
  animation: pulse-glow 2s infinite;
}

/* Bounce in (for success states) */
@keyframes bounce-in {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.animate-bounce-in {
  animation: bounce-in 0.3s ease-out;
}
```

### Icon Migration (Emoji to Heroicons)

```tsx
// frontend/src/components/layout/Sidebar.tsx - Updated
import {
  HomeIcon,
  DocumentDuplicateIcon,
  ClockIcon,
  ChatBubbleLeftRightIcon,
  MagnifyingGlassIcon,
  Cog6ToothIcon,
  SignalIcon,
  ChartBarIcon,
  FlagIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  WrenchIcon,
  HeartIcon,
  BuildingOfficeIcon,
  CpuChipIcon,
  BoltIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';

const mainNavItems = [
  { name: "Dashboard", path: "/dashboard", icon: HomeIcon },
  { name: "Workflows", path: "/workflows", icon: DocumentDuplicateIcon },
  { name: "Executions", path: "/executions", icon: ClockIcon },
  { name: "Conversations", path: "/conversations", icon: ChatBubbleLeftRightIcon },
  { name: "Search", path: "/search", icon: MagnifyingGlassIcon },
  { name: "Settings", path: "/settings", icon: Cog6ToothIcon },
];
```

### Effort Estimate
- Toast system: 3 hours
- Skeleton screens: 2 hours
- CSS animations: 1.5 hours
- Icon migration: 1 hour
- Integration: 1.5 hours
- **Total: 9 hours**

---

## 10. React Query Migration (CRITIC FIX #4)

### Scope Decision: OUT OF SCOPE

React Query refactoring is explicitly **out of scope** for this UX improvement plan. This plan focuses on:
1. Onboarding wizard
2. Real-time SSE integration
3. Dashboard redesign
4. Conversation UX
5. UI polish

### Follow-up Task Created

A separate follow-up task should be created for React Query migration:

```markdown
## Follow-up: React Query Migration

**Task:** Refactor existing pages to use React Query for data fetching

**Pages to refactor:**
- DashboardPage.tsx
- WorkflowsPage.tsx
- ExecutionDetailPage.tsx
- AgentActivityPage.tsx
- ConversationsPage.tsx

**Benefits:**
- Automatic caching and deduplication
- Background refetching
- Optimistic updates
- Loading/error state management

**Estimated effort:** 8-10 hours

**Priority:** P3 (after UX improvements are complete)
```

This keeps the current plan focused and achievable while acknowledging the React Query work as a future enhancement.

---

## 11. Implementation Details

### File Structure (New/Modified)

```
frontend/src/
  components/
    chat/
      ChatInterface.tsx        [NEW]
      MessageBubble.tsx        [NEW]
      MessageInput.tsx         [NEW]
      StreamingMessage.tsx     [NEW]
      ThinkingIndicator.tsx    [NEW]
      ContextIndicator.tsx     [NEW]
    dashboard/
      QuickActions.tsx         [NEW]
      ActivityFeed.tsx         [NEW]
      StatCard.tsx             [NEW]
    onboarding/
      OnboardingWizard.tsx     [NEW]
      OnboardingStep.tsx       [NEW]
      OnboardingProgress.tsx   [NEW]
      PrerequisiteCheck.tsx    [NEW]
      steps/
        WelcomeStep.tsx        [NEW]
        IntegrationStep.tsx    [NEW]
        SlackConnectStep.tsx   [NEW]
        NotionConnectStep.tsx  [NEW]
        FirstWorkflowStep.tsx  [NEW]
        SuccessStep.tsx        [NEW]
      index.ts
    ui/
      Toast.tsx                [NEW]
      Skeleton.tsx             [NEW]
      index.ts                 [NEW]
    layout/
      Sidebar.tsx              [MODIFIED - icons]
  hooks/
    useSSE.ts                  [NEW]
    useTypingEffect.ts         [NEW]
    useOnboarding.ts           [NEW]
    useToast.ts                [NEW]
  pages/
    OnboardingPage.tsx         [NEW]
    DashboardPage.tsx          [MODIFIED]
    ConversationsPage.tsx      [MODIFIED]
  styles/
    animations.css             [NEW]
  App.tsx                      [MODIFIED - routes]
```

### Backend Changes

```
src/
  api/
    onboarding.ts              [NEW - with helper functions]
```

### Dependencies to Add

```json
{
  "dependencies": {
    "@heroicons/react": "^2.0.18"
  }
}
```

---

## 12. Testing Strategy

### Browser Testing Setup
- Use existing Chrome profile at `/Users/sean/Library/Application Support/Google/Chrome`
- Test against local dev server (npm run dev)
- Manual verification of all flows

### Test Checklist

#### Phase 1: Onboarding
- [ ] Fresh user sees onboarding wizard
- [ ] Progress persists across page refresh
- [ ] OAuth flows complete successfully
- [ ] Skip button works for optional steps
- [ ] Final step shows success state
- [ ] Redirect to dashboard after completion

#### Phase 2: Streaming
- [ ] SSE connection establishes to `/api/events`
- [ ] Messages stream with `orchestration:message` events
- [ ] Typing indicator shows during `orchestration:started`
- [ ] Reconnection on disconnect with exponential backoff
- [ ] No message loss during reconnect

#### Phase 3: Dashboard
- [ ] Stats animate on load
- [ ] Activity feed updates with `job:progress` and `orchestration:*` events
- [ ] Quick actions work
- [ ] Cmd+K palette opens

#### Phase 4: Conversations
- [ ] Messages load with history
- [ ] New messages appear via SSE streaming
- [ ] Typing indicator works
- [ ] Context badge shows correctly

#### Phase 5: Polish
- [ ] Toasts appear and dismiss
- [ ] Skeleton screens show during load
- [ ] Animations are smooth (60fps)
- [ ] Icons render correctly

---

## 13. Commit Strategy

| Commit | Description | Files |
|--------|-------------|-------|
| 1 | Add Heroicons dependency | package.json, package-lock.json |
| 2 | Add CSS animations | animations.css, index.css |
| 3 | Add UI components (Toast, Skeleton) | components/ui/* |
| 4 | Add SSE and typing hooks | hooks/useSSE.ts, useTypingEffect.ts |
| 5 | Add chat components | components/chat/* |
| 6 | Add onboarding components | components/onboarding/* |
| 7 | Add dashboard components | components/dashboard/* |
| 8 | Update Sidebar with Heroicons | Sidebar.tsx |
| 9 | Update DashboardPage | DashboardPage.tsx |
| 10 | Add OnboardingPage + routes | OnboardingPage.tsx, App.tsx |
| 11 | Update ConversationsPage | ConversationsPage.tsx |
| 12 | Backend: onboarding endpoint with helpers | src/api/onboarding.ts |

---

## 14. Success Criteria

### Quantitative
- [ ] Onboarding completion rate > 80%
- [ ] Time to first workflow < 5 minutes
- [ ] Real-time latency < 200ms
- [ ] No console errors in production

### Qualitative
- [ ] User feedback: "Feels modern"
- [ ] User feedback: "Intuitive"
- [ ] User feedback: "Knows what I need"

---

## 15. Effort Summary

| Phase | Hours | Priority |
|-------|-------|----------|
| Phase 1: Onboarding | 8.5 | P1 |
| Phase 2: Streaming | 9 | P2 |
| Phase 3: Dashboard | 10 | P3 |
| Phase 4: Conversations | 9 | P4 |
| Phase 5: Polish | 9 | P5 |
| **Total** | **45.5 hours** | - |

---

## 16. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| SSE browser compatibility | Use EventSource polyfill for IE11 |
| OAuth flow interruption | Store state in localStorage, resume on return |
| Animation performance | Use CSS transforms, avoid layout triggers |
| Toast spam | Dedupe by message, max 5 visible |
| SSE reconnection storms | Exponential backoff with max 5 attempts |
| Cookie auth issues | Verify CORS and withCredentials settings |

---

## 17. Critic Issues Addressed

| Issue | Resolution |
|-------|------------|
| 1. SSE Endpoint Missing | Verified endpoint exists at `/api/events` (src/api/sse.ts:165) |
| 2. Event Name Mismatch | Frontend now uses actual backend events: `job:progress`, `notification`, `orchestration:*` |
| 3. Onboarding Helpers Undefined | Defined `checkSlackIntegration()`, `checkNotionIntegration()`, `hasAnyWorkflows()`, `determineCurrentStep()` with Prisma queries |
| 4. React Query Unused | Explicitly marked as OUT OF SCOPE with follow-up task documented |
| 5. SSE Authentication | Documented cookie-based session auth flow with `withCredentials: true` |

---

**PLAN_READY**

---

*Plan generated by Prometheus (Planner Agent)*
*Revision 2 - Critic feedback addressed*
*Ready for Critic review via RALPLAN*
