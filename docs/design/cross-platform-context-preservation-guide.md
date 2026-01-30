# Cross-Platform Context Preservation Guide

## Maintaining User Context Across Different Interfaces

### Table of Contents

1. [Overview](#overview)
2. [Deep Linking from Slack to Web](#deep-linking-from-slack-to-web)
3. [URL Parameter Encoding](#url-parameter-encoding)
4. [Secure Authentication Token Passing](#secure-authentication-token-passing)
5. [Session Continuity Patterns](#session-continuity-patterns)
6. [State Synchronization](#state-synchronization)
7. [Mobile App Deep Linking](#mobile-app-deep-linking)
8. [Browser Extension Patterns](#browser-extension-patterns)
9. [Fallback for Logged-Out Users](#fallback-for-logged-out-users)
10. [Accessibility Considerations](#accessibility-considerations)
11. [Real-World Examples](#real-world-examples)

---

## Overview

When users switch between interfaces (e.g., Slack → Web dashboard → Mobile app), maintaining context is critical for a seamless experience. This guide covers patterns and best practices for preserving user state, authentication, and workflow continuity across platforms.

**Key Principles:**

- **Security First**: Never expose sensitive data in URLs or logs
- **Graceful Degradation**: Always provide fallbacks for unsupported scenarios
- **User Control**: Allow users to resume or restart their workflow
- **Accessibility**: Ensure screen readers and assistive technologies work correctly

---

## Deep Linking from Slack to Web

### Slack Deep Link Patterns

Slack provides several deep linking mechanisms to direct users to specific locations:

#### 1. **App Redirect URLs** (`app_redirect`)

Used after OAuth or installation to send users to meaningful locations:

```javascript
// Open a direct message with your app
const dmLink = `https://slack.com/app_redirect?app=${APP_ID}&team=${TEAM_ID}`;

// Open a specific channel
const channelLink = `https://slack.com/app_redirect?channel=${CHANNEL_ID}&team=${TEAM_ID}`;
```

#### 2. **Slack URI Scheme** (`slack://`)

Works across desktop (Mac/Windows) and mobile (iOS/Android):

```javascript
// Open a specific channel
const channelDeepLink = `slack://channel?id=${CHANNEL_ID}&team=${TEAM_ID}`;

// Open a direct message
const dmDeepLink = `slack://user?team=${TEAM_ID}&id=${USER_ID}`;

// Open to a specific message
const messageLink = `slack://channel?id=${CHANNEL_ID}&team=${TEAM_ID}&message=${TIMESTAMP}`;

// Generic open (doesn't change workspace)
const genericOpen = "slack://open";
```

#### 3. **Web URLs with Fallback**

Provide both native app and web fallbacks:

```javascript
// Try to open in Slack app, fallback to web
function openSlackChannel(teamId, channelId) {
  const nativeLink = `slack://channel?id=${channelId}&team=${teamId}`;
  const webLink = `https://app.slack.com/client/${teamId}/${channelId}`;

  // Attempt native app first
  window.location.href = nativeLink;

  // Fallback to web after short delay
  setTimeout(() => {
    window.location.href = webLink;
  }, 500);
}
```

### From Slack to Web Dashboard

**Pattern: "Out and Back Again"**

This pattern enables users to perform "deep work" on an external web service and return to Slack:

```javascript
// 1. Post message in Slack with link button
const message = {
  text: "Build your dashboard",
  attachments: [
    {
      actions: [
        {
          type: "button",
          text: "Open Dashboard Builder",
          url: `https://yourapp.com/dashboard/build?task=${taskId}&slack_channel=${channelId}&slack_ts=${messageTs}`,
        },
      ],
    },
  ],
};

// 2. Map Slack message context to task
const taskContext = {
  taskId: generateTaskId(),
  slackChannel: channelId,
  slackTimestamp: messageTs,
  userId: userId,
};
await saveTaskContext(taskContext);

// 3. User completes work on web dashboard

// 4. Update original Slack message
await slack.chat.update({
  channel: channelId,
  ts: messageTs,
  text: "✅ Dashboard completed!",
  attachments: [
    {
      text: "View your dashboard",
      actions: [
        {
          type: "button",
          text: "Open Dashboard",
          url: `https://yourapp.com/dashboard/${taskId}`,
        },
      ],
    },
  ],
});

// 5. Redirect user back to Slack
const slackPermalink = await slack.chat.getPermalink({
  channel: channelId,
  message_ts: messageTs,
});
window.location.href = slackPermalink;
```

---

## URL Parameter Encoding

### Best Practices for URL Parameters

#### 1. **Use URLSearchParams for Construction**

```typescript
// ✅ Good: Type-safe parameter construction
function buildDeepLink(params: { taskId: string; userId: string; context?: string }): string {
  const url = new URL("https://yourapp.com/task");
  const searchParams = new URLSearchParams();

  searchParams.set("task_id", params.taskId);
  searchParams.set("user_id", params.userId);

  if (params.context) {
    searchParams.set("context", params.context);
  }

  url.search = searchParams.toString();
  return url.toString();
}

// Usage
const link = buildDeepLink({
  taskId: "task-123",
  userId: "user-456",
  context: "slack-channel-789",
});
// Result: https://yourapp.com/task?task_id=task-123&user_id=user-456&context=slack-channel-789
```

#### 2. **Parse Parameters Safely**

```typescript
// ✅ Good: Safe parameter extraction
function parseDeepLinkParams(url: string): {
  taskId: string | null;
  userId: string | null;
  context: string | null;
} {
  const parsedUrl = new URL(url);
  const params = parsedUrl.searchParams;

  return {
    taskId: params.get("task_id"),
    userId: params.get("user_id"),
    context: params.get("context"),
  };
}
```

#### 3. **Handle Complex Data Structures**

```typescript
// For complex objects, use base64-encoded JSON
function encodeContextParam(context: object): string {
  const json = JSON.stringify(context);
  return btoa(json); // Base64 encode
}

function decodeContextParam(encoded: string): object | null {
  try {
    const json = atob(encoded); // Base64 decode
    return JSON.parse(json);
  } catch (error) {
    console.error("Failed to decode context:", error);
    return null;
  }
}

// Usage
const context = {
  slackChannel: "C123456",
  messageTs: "1234567890.123456",
  workflowStep: "review",
};

const url = new URL("https://yourapp.com/task");
url.searchParams.set("ctx", encodeContextParam(context));
// Result: https://yourapp.com/task?ctx=eyJzbGFja0NoYW5uZWwiOiJDMTIzNDU2IiwibWVzc2FnZVRzIjoiMTIzNDU2Nzg5MC4xMjM0NTYiLCJ3b3JrZmxvd1N0ZXAiOiJyZXZpZXcifQ==
```

#### 4. **Next.js Router Integration**

```typescript
// Next.js App Router
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';

function TaskPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read parameters
  const taskId = searchParams.get('task_id');
  const context = searchParams.get('context');

  // Update parameters while preserving others
  const updateParams = useCallback((name: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(name, value);
    router.push(`${pathname}?${params.toString()}`);
  }, [searchParams, pathname, router]);

  return (
    <div>
      <button onClick={() => updateParams('step', 'review')}>
        Go to Review
      </button>
    </div>
  );
}
```

---

## Secure Authentication Token Passing

### ⚠️ Security Principles

**NEVER do this:**

```typescript
// ❌ DANGEROUS: Token in URL query parameter
const badLink = `https://yourapp.com/dashboard?token=${accessToken}`;
// Problems:
// - Logged in browser history
// - Logged in server access logs
// - Sent in Referer header to third parties
// - Visible in browser address bar
```

### ✅ Secure Patterns

#### 1. **Use URL Fragment (Hash) for Tokens**

The fragment (`#`) is NOT sent to the server and NOT included in Referer headers:

```typescript
// ✅ Better: Token in URL fragment
function createSecureDeepLink(taskId: string, token: string): string {
  return `https://yourapp.com/task/${taskId}#token=${token}`;
}

// Client-side extraction
function extractTokenFromFragment(): string | null {
  const hash = window.location.hash.substring(1); // Remove '#'
  const params = new URLSearchParams(hash);
  return params.get("token");
}

// Usage in React
useEffect(() => {
  const token = extractTokenFromFragment();
  if (token) {
    // Store in memory or sessionStorage
    sessionStorage.setItem("auth_token", token);

    // Clear fragment from URL for security
    window.history.replaceState(null, "", window.location.pathname);
  }
}, []);
```

#### 2. **Short-Lived One-Time Codes**

Instead of passing tokens directly, use short-lived authorization codes:

```typescript
// Server-side: Generate one-time code
async function generateDeepLinkCode(userId: string, context: object): Promise<string> {
  const code = generateSecureRandomString(32);

  await redis.setex(
    `deeplink:${code}`,
    300, // 5 minute expiration
    JSON.stringify({
      userId,
      context,
      createdAt: Date.now(),
    }),
  );

  return code;
}

// Create deep link with code
const code = await generateDeepLinkCode(userId, { taskId: "task-123" });
const deepLink = `https://yourapp.com/auth/deeplink?code=${code}`;

// Client-side: Exchange code for session
async function exchangeDeepLinkCode(code: string): Promise<Session> {
  const response = await fetch("/api/auth/exchange-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new Error("Invalid or expired code");
  }

  return response.json();
}
```

#### 3. **JWT in Fragment with Validation**

For capability-based URLs (limited scope tokens):

```typescript
// Server-side: Create JWT with limited scope
import jwt from "jsonwebtoken";

function createTaskAccessToken(taskId: string, userId: string): string {
  return jwt.sign(
    {
      taskId,
      userId,
      scope: ["task:read", "task:update"],
      exp: Math.floor(Date.now() / 1000) + 60 * 15, // 15 minutes
    },
    process.env.JWT_SECRET!,
  );
}

// Create deep link
const token = createTaskAccessToken("task-123", "user-456");
const deepLink = `https://yourapp.com/task/task-123#access_token=${token}`;

// Client-side: Extract and validate
async function validateTaskAccess(): Promise<boolean> {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  const token = params.get("access_token");

  if (!token) return false;

  try {
    const response = await fetch("/api/auth/validate-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      // Store in sessionStorage (not localStorage for security)
      sessionStorage.setItem("task_token", token);

      // Clear from URL
      window.history.replaceState(null, "", window.location.pathname);

      return true;
    }
  } catch (error) {
    console.error("Token validation failed:", error);
  }

  return false;
}
```

#### 4. **OAuth 2.0 PKCE Flow for Deep Links**

For browser-based apps, use PKCE (Proof Key for Code Exchange):

```typescript
// Generate PKCE challenge
async function generatePKCE() {
  const verifier = generateSecureRandomString(128);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const challenge = base64UrlEncode(hash);

  return { verifier, challenge };
}

// Initiate OAuth flow from Slack
async function initiateDeepLinkAuth(context: object) {
  const { verifier, challenge } = await generatePKCE();

  // Store verifier in sessionStorage
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("auth_context", JSON.stringify(context));

  // Redirect to authorization endpoint
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: generateSecureRandomString(32),
  });

  window.location.href = `https://yourapp.com/oauth/authorize?${params}`;
}

// Handle callback
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const verifier = sessionStorage.getItem("pkce_verifier");

  if (!code || !verifier) {
    throw new Error("Invalid OAuth callback");
  }

  // Exchange code for token
  const response = await fetch("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
    }),
  });

  const { access_token, refresh_token } = await response.json();

  // Store tokens securely
  sessionStorage.setItem("access_token", access_token);
  sessionStorage.setItem("refresh_token", refresh_token);

  // Restore context
  const context = JSON.parse(sessionStorage.getItem("auth_context") || "{}");

  // Clean up
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("auth_context");

  return context;
}
```

### Security Checklist

- ✅ Use HTTPS for all deep links
- ✅ Use URL fragments (`#`) for tokens, not query parameters
- ✅ Implement short-lived one-time codes (5-15 minutes)
- ✅ Validate tokens server-side before granting access
- ✅ Clear sensitive data from URL after extraction
- ✅ Use sessionStorage (not localStorage) for temporary tokens
- ✅ Implement PKCE for OAuth flows
- ✅ Never log tokens in server access logs
- ✅ Validate Referer header to prevent CSRF
- ❌ Never put tokens in query parameters
- ❌ Never put tokens in cookies without HttpOnly flag
- ❌ Never store long-lived tokens in localStorage

---

## Session Continuity Patterns

### 1. **localStorage for Persistent State**

Use `localStorage` for data that should persist across browser sessions:

```typescript
// Save user preferences and non-sensitive state
interface UserPreferences {
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
  lastViewedDashboard: string;
}

class PreferencesStore {
  private static KEY = "user_preferences";

  static save(prefs: UserPreferences): void {
    localStorage.setItem(this.KEY, JSON.stringify(prefs));
  }

  static load(): UserPreferences | null {
    const data = localStorage.getItem(this.KEY);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error("Failed to parse preferences:", error);
      return null;
    }
  }

  static clear(): void {
    localStorage.removeItem(this.KEY);
  }
}

// Usage
PreferencesStore.save({
  theme: "dark",
  sidebarCollapsed: false,
  lastViewedDashboard: "dashboard-123",
});
```

### 2. **sessionStorage for Tab-Specific State**

Use `sessionStorage` for data that should only persist within a single tab session:

```typescript
// Store temporary workflow state
interface WorkflowState {
  currentStep: number;
  formData: Record<string, any>;
  startedAt: number;
}

class WorkflowStore {
  private static KEY = "workflow_state";

  static save(state: WorkflowState): void {
    sessionStorage.setItem(this.KEY, JSON.stringify(state));
  }

  static load(): WorkflowState | null {
    const data = sessionStorage.getItem(this.KEY);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error("Failed to parse workflow state:", error);
      return null;
    }
  }

  static clear(): void {
    sessionStorage.removeItem(this.KEY);
  }
}

// Auto-save form data
function useAutoSaveWorkflow() {
  const [formData, setFormData] = useState({});
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Load saved state on mount
    const saved = WorkflowStore.load();
    if (saved) {
      setFormData(saved.formData);
      setCurrentStep(saved.currentStep);
    }
  }, []);

  useEffect(() => {
    // Auto-save on changes
    WorkflowStore.save({
      currentStep,
      formData,
      startedAt: Date.now(),
    });
  }, [currentStep, formData]);

  return { formData, setFormData, currentStep, setCurrentStep };
}
```

### 3. **"Continue Where You Left Off" UX**

Implement resume functionality for interrupted workflows:

```typescript
interface ResumeContext {
  taskId: string;
  taskType: string;
  progress: number;
  lastActivity: number;
  data: Record<string, any>;
}

class ResumeManager {
  private static KEY_PREFIX = 'resume_';

  static save(taskId: string, context: Omit<ResumeContext, 'taskId'>): void {
    const key = `${this.KEY_PREFIX}${taskId}`;
    const data: ResumeContext = {
      taskId,
      ...context,
      lastActivity: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(data));
  }

  static load(taskId: string): ResumeContext | null {
    const key = `${this.KEY_PREFIX}${taskId}`;
    const data = localStorage.getItem(key);
    if (!data) return null;

    try {
      const context = JSON.parse(data) as ResumeContext;

      // Check if context is stale (older than 7 days)
      const age = Date.now() - context.lastActivity;
      const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

      if (age > MAX_AGE) {
        this.clear(taskId);
        return null;
      }

      return context;
    } catch (error) {
      console.error('Failed to parse resume context:', error);
      return null;
    }
  }

  static clear(taskId: string): void {
    const key = `${this.KEY_PREFIX}${taskId}`;
    localStorage.removeItem(key);
  }

  static getAllResumable(): ResumeContext[] {
    const contexts: ResumeContext[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.KEY_PREFIX)) {
        const taskId = key.substring(this.KEY_PREFIX.length);
        const context = this.load(taskId);
        if (context) {
          contexts.push(context);
        }
      }
    }

    // Sort by most recent activity
    return contexts.sort((a, b) => b.lastActivity - a.lastActivity);
  }
}

// UI Component
function ResumeWorkflowBanner() {
  const [resumableTask, setResumableTask] = useState<ResumeContext | null>(null);
  const router = useRouter();

  useEffect(() => {
    const tasks = ResumeManager.getAllResumable();
    if (tasks.length > 0) {
      setResumableTask(tasks[0]); // Show most recent
    }
  }, []);

  if (!resumableTask) return null;

  const handleResume = () => {
    router.push(`/task/${resumableTask.taskId}?resume=true`);
  };

  const handleDismiss = () => {
    ResumeManager.clear(resumableTask.taskId);
    setResumableTask(null);
  };

  return (
    <div className="resume-banner" role="alert" aria-live="polite">
      <p>
        You have an unfinished {resumableTask.taskType} ({resumableTask.progress}% complete).
        Would you like to continue where you left off?
      </p>
      <button onClick={handleResume}>Resume</button>
      <button onClick={handleDismiss}>Start Fresh</button>
    </div>
  );
}
```

### 4. **Server-Side Session Sync**

For authenticated users, sync state to the server:

```typescript
// Hybrid approach: localStorage + server sync
class HybridStateManager {
  private static SYNC_INTERVAL = 30000; // 30 seconds
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(private userId: string) {
    this.startAutoSync();
  }

  async saveState(key: string, value: any): Promise<void> {
    // Save locally immediately
    localStorage.setItem(key, JSON.stringify(value));

    // Queue server sync
    this.queueSync(key, value);
  }

  async loadState(key: string): Promise<any> {
    // Try local first
    const local = localStorage.getItem(key);
    if (local) {
      try {
        return JSON.parse(local);
      } catch (error) {
        console.error("Failed to parse local state:", error);
      }
    }

    // Fallback to server
    try {
      const response = await fetch(`/api/user/${this.userId}/state/${key}`);
      if (response.ok) {
        const data = await response.json();
        // Update local cache
        localStorage.setItem(key, JSON.stringify(data));
        return data;
      }
    } catch (error) {
      console.error("Failed to load state from server:", error);
    }

    return null;
  }

  private queueSync(key: string, value: any): void {
    const queue = this.getSyncQueue();
    queue[key] = value;
    localStorage.setItem("_sync_queue", JSON.stringify(queue));
  }

  private getSyncQueue(): Record<string, any> {
    const data = localStorage.getItem("_sync_queue");
    return data ? JSON.parse(data) : {};
  }

  private async performSync(): Promise<void> {
    const queue = this.getSyncQueue();
    const keys = Object.keys(queue);

    if (keys.length === 0) return;

    try {
      await fetch(`/api/user/${this.userId}/state/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queue),
      });

      // Clear queue on success
      localStorage.removeItem("_sync_queue");
    } catch (error) {
      console.error("Failed to sync state to server:", error);
      // Queue will retry on next interval
    }
  }

  private startAutoSync(): void {
    this.syncTimer = setInterval(() => {
      this.performSync();
    }, HybridStateManager.SYNC_INTERVAL);
  }

  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }
}
```

---

## State Synchronization

### Cross-Tab Synchronization with Storage Events

Synchronize state across multiple browser tabs using the `storage` event:

```typescript
// Tab synchronization manager
class TabSyncManager {
  private listeners: Map<string, Set<(value: any) => void>> = new Map();

  constructor() {
    // Listen for storage events from other tabs
    window.addEventListener("storage", this.handleStorageEvent.bind(this));
  }

  private handleStorageEvent(event: StorageEvent): void {
    if (!event.key || !event.newValue) return;

    const listeners = this.listeners.get(event.key);
    if (!listeners) return;

    try {
      const value = JSON.parse(event.newValue);
      listeners.forEach((callback) => callback(value));
    } catch (error) {
      console.error("Failed to parse storage event:", error);
    }
  }

  // Broadcast change to other tabs
  broadcast(key: string, value: any): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  // Subscribe to changes from other tabs
  subscribe(key: string, callback: (value: any) => void): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }

    this.listeners.get(key)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  destroy(): void {
    window.removeEventListener("storage", this.handleStorageEvent.bind(this));
    this.listeners.clear();
  }
}

// Usage: Sync authentication state across tabs
const tabSync = new TabSyncManager();

function useAuthSync() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Subscribe to auth changes from other tabs
    const unsubscribe = tabSync.subscribe("auth_state", (state) => {
      setIsAuthenticated(state.isAuthenticated);

      if (!state.isAuthenticated) {
        // User logged out in another tab
        window.location.href = "/login";
      }
    });

    return unsubscribe;
  }, []);

  const login = async (credentials: any) => {
    // Perform login
    const result = await performLogin(credentials);

    // Broadcast to other tabs
    tabSync.broadcast("auth_state", {
      isAuthenticated: true,
      userId: result.userId,
    });

    setIsAuthenticated(true);
  };

  const logout = async () => {
    // Perform logout
    await performLogout();

    // Broadcast to other tabs
    tabSync.broadcast("auth_state", {
      isAuthenticated: false,
    });

    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
}
```

### BroadcastChannel API (Modern Alternative)

For modern browsers, use the BroadcastChannel API:

```typescript
// More efficient than storage events
class BroadcastSyncManager {
  private channel: BroadcastChannel;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(channelName: string = "app_sync") {
    this.channel = new BroadcastChannel(channelName);
    this.channel.onmessage = this.handleMessage.bind(this);
  }

  private handleMessage(event: MessageEvent): void {
    const { type, data } = event.data;
    const listeners = this.listeners.get(type);

    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }

  broadcast(type: string, data: any): void {
    this.channel.postMessage({ type, data });
  }

  subscribe(type: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  destroy(): void {
    this.channel.close();
    this.listeners.clear();
  }
}

// Usage
const sync = new BroadcastSyncManager();

// Tab 1: User updates their profile
sync.broadcast("profile_updated", {
  userId: "user-123",
  name: "John Doe",
  avatar: "https://...",
});

// Tab 2: Listen for profile updates
sync.subscribe("profile_updated", (data) => {
  console.log("Profile updated in another tab:", data);
  updateUIWithNewProfile(data);
});
```

### Real-Time State Sync with WebSockets

For real-time synchronization across devices:

```typescript
class RealtimeStateSync {
  private ws: WebSocket;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  constructor(
    private url: string,
    private userId: string,
  ) {
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(`${this.url}?userId=${this.userId}`);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.clearReconnectTimer();
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        const listeners = this.listeners.get(type);

        if (listeners) {
          listeners.forEach((callback) => callback(data));
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onclose = () => {
      console.log("WebSocket disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 5000); // Retry after 5 seconds
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  broadcast(type: string, data: any): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  subscribe(type: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }

    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  destroy(): void {
    this.clearReconnectTimer();
    this.ws.close();
    this.listeners.clear();
  }
}

// Usage: Sync task state across devices
const realtimeSync = new RealtimeStateSync("wss://api.yourapp.com/sync", userId);

realtimeSync.subscribe("task_updated", (data) => {
  console.log("Task updated on another device:", data);
  updateTaskInUI(data);
});

// Update task
realtimeSync.broadcast("task_updated", {
  taskId: "task-123",
  status: "completed",
  updatedAt: Date.now(),
});
```

---

## Mobile App Deep Linking

### iOS Universal Links

Universal Links allow standard HTTPS URLs to open your iOS app:

#### 1. **Create Apple App Site Association (AASA) File**

Host at `https://yourapp.com/.well-known/apple-app-site-association`:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.yourapp.bundle",
        "paths": ["/task/*", "/dashboard/*", "/auth/callback"]
      }
    ]
  }
}
```

**Critical Requirements:**

- Must be served over **HTTPS only**
- Must have `Content-Type: application/json` header
- **No redirects** allowed (301, 302, etc.)
- Must be accessible without authentication

#### 2. **Configure iOS App**

In Xcode, enable Associated Domains:

```swift
// AppDelegate.swift
import UIKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

  func application(_ application: UIApplication,
                   continue userActivity: NSUserActivity,
                   restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {

    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb,
          let url = userActivity.webpageURL else {
      return false
    }

    // Handle the deep link
    return handleUniversalLink(url)
  }

  private func handleUniversalLink(_ url: URL) -> Bool {
    // Parse URL and navigate
    let components = URLComponents(url: url, resolvingAgainstBaseURL: true)

    if url.path.starts(with: "/task/") {
      let taskId = url.lastPathComponent
      navigateToTask(taskId)
      return true
    }

    if url.path.starts(with: "/dashboard/") {
      let dashboardId = url.lastPathComponent
      navigateToDashboard(dashboardId)
      return true
    }

    return false
  }
}
```

#### 3. **Test Universal Links**

```bash
# Validate AASA file
curl -I https://yourapp.com/.well-known/apple-app-site-association

# Should return:
# HTTP/2 200
# content-type: application/json
# (no redirects)
```

### Android App Links

App Links allow standard HTTPS URLs to open your Android app:

#### 1. **Create Digital Asset Links File**

Host at `https://yourapp.com/.well-known/assetlinks.json`:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.yourapp",
      "sha256_cert_fingerprints": [
        "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5"
      ]
    }
  }
]
```

**Get SHA-256 fingerprint:**

```bash
keytool -list -v -keystore my-release-key.keystore
```

#### 2. **Configure Android App**

In `AndroidManifest.xml`:

```xml
<activity android:name=".MainActivity">
  <intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />

    <data
      android:scheme="https"
      android:host="yourapp.com"
      android:pathPrefix="/task" />

    <data
      android:scheme="https"
      android:host="yourapp.com"
      android:pathPrefix="/dashboard" />
  </intent-filter>
</activity>
```

In `MainActivity.kt`:

```kotlin
class MainActivity : AppCompatActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Handle deep link
    handleIntent(intent)
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    intent?.let { handleIntent(it) }
  }

  private fun handleIntent(intent: Intent) {
    val action = intent.action
    val data = intent.data

    if (action == Intent.ACTION_VIEW && data != null) {
      handleDeepLink(data)
    }
  }

  private fun handleDeepLink(uri: Uri) {
    when {
      uri.path?.startsWith("/task/") == true -> {
        val taskId = uri.lastPathSegment
        navigateToTask(taskId)
      }
      uri.path?.startsWith("/dashboard/") == true -> {
        val dashboardId = uri.lastPathSegment
        navigateToDashboard(dashboardId)
      }
    }
  }
}
```

### React Native Deep Linking

For React Native apps, use the `Linking` module:

```typescript
import { Linking } from "react-native";
import { useEffect } from "react";

function useDeepLinking() {
  useEffect(() => {
    // Handle initial URL (app opened from deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    // Handle URL while app is running
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    const { path, queryParams } = parseDeepLink(url);

    // Navigate based on path
    if (path.startsWith("/task/")) {
      const taskId = path.split("/")[2];
      navigation.navigate("Task", { taskId, ...queryParams });
    }
  };
}

function parseDeepLink(url: string): {
  path: string;
  queryParams: Record<string, string>;
} {
  const parsed = new URL(url);
  const queryParams: Record<string, string> = {};

  parsed.searchParams.forEach((value, key) => {
    queryParams[key] = value;
  });

  return {
    path: parsed.pathname,
    queryParams,
  };
}
```

### Custom URL Schemes (Fallback)

For older devices or as a fallback:

```typescript
// iOS: yourapp://task/123
// Android: yourapp://task/123

// Configure in iOS Info.plist
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>yourapp</string>
    </array>
  </dict>
</array>

// Configure in Android AndroidManifest.xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="yourapp" />
</intent-filter>
```

### Deferred Deep Linking

Handle deep links after app installation:

```typescript
// Use a service like Branch.io or Firebase Dynamic Links
import branch from "react-native-branch";

function useDeferredDeepLinking() {
  useEffect(() => {
    const unsubscribe = branch.subscribe(({ error, params }) => {
      if (error) {
        console.error("Branch error:", error);
        return;
      }

      if (params["+clicked_branch_link"]) {
        // User clicked a Branch link
        const taskId = params.taskId;
        const context = params.context;

        // Navigate to task after app install
        navigation.navigate("Task", { taskId, context });
      }
    });

    return unsubscribe;
  }, []);
}
```

---

## Browser Extension Patterns

### Chrome Extension Deep Linking

Chrome extensions can intercept and handle deep links:

#### 1. **Manifest Configuration**

```json
{
  "manifest_version": 3,
  "name": "YourApp Extension",
  "version": "1.0",
  "permissions": ["tabs", "storage", "webNavigation"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["https://yourapp.com/*"],
      "js": ["content.js"]
    }
  ]
}
```

#### 2. **Background Script**

```typescript
// background.js
chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  const url = new URL(details.url);

  // Intercept deep links
  if (url.hostname === "yourapp.com" && url.pathname.startsWith("/task/")) {
    const taskId = url.pathname.split("/")[2];

    // Load context from extension storage
    chrome.storage.local.get(["userContext"], (result) => {
      const context = result.userContext || {};

      // Inject context into page
      chrome.tabs.sendMessage(details.tabId, {
        type: "DEEP_LINK_CONTEXT",
        taskId,
        context,
      });
    });
  }
});

// Listen for context updates from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SAVE_CONTEXT") {
    chrome.storage.local.set({ userContext: message.context });
    sendResponse({ success: true });
  }
});
```

#### 3. **Content Script**

```typescript
// content.js
// Listen for context from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "DEEP_LINK_CONTEXT") {
    // Inject context into page
    window.postMessage(
      {
        type: "EXTENSION_CONTEXT",
        taskId: message.taskId,
        context: message.context,
      },
      "*",
    );
  }
});

// Listen for context updates from page
window.addEventListener("message", (event) => {
  if (event.source !== window) return;

  if (event.data.type === "SAVE_CONTEXT") {
    // Forward to background script
    chrome.runtime.sendMessage({
      type: "SAVE_CONTEXT",
      context: event.data.context,
    });
  }
});
```

#### 4. **Web Page Integration**

```typescript
// In your web app
function useExtensionContext() {
  const [context, setContext] = useState(null);

  useEffect(() => {
    // Listen for context from extension
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === "EXTENSION_CONTEXT") {
        setContext(event.data.context);
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const saveContext = (newContext: any) => {
    // Send to extension
    window.postMessage(
      {
        type: "SAVE_CONTEXT",
        context: newContext,
      },
      "*",
    );
  };

  return { context, saveContext };
}
```

### Firefox Extension

Similar pattern with WebExtensions API:

```typescript
// background.js (Firefox)
browser.webNavigation.onBeforeNavigate.addListener((details) => {
  const url = new URL(details.url);

  if (url.hostname === "yourapp.com") {
    browser.storage.local.get("userContext").then((result) => {
      browser.tabs.sendMessage(details.tabId, {
        type: "DEEP_LINK_CONTEXT",
        context: result.userContext,
      });
    });
  }
});
```

---

## Fallback for Logged-Out Users

### Graceful Degradation Patterns

#### 1. **Redirect to Login with Return URL**

```typescript
function requireAuth(Component: React.ComponentType) {
  return function AuthenticatedComponent(props: any) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        // Save current URL for redirect after login
        const returnUrl = encodeURIComponent(window.location.href);
        router.push(`/login?returnUrl=${returnUrl}`);
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return <LoadingSpinner />;
    }

    if (!isAuthenticated) {
      return null;
    }

    return <Component {...props} />;
  };
}

// Login page
function LoginPage() {
  const router = useRouter();
  const { returnUrl } = router.query;

  const handleLogin = async (credentials: any) => {
    await performLogin(credentials);

    // Redirect to original URL
    const destination = returnUrl
      ? decodeURIComponent(returnUrl as string)
      : '/dashboard';

    router.push(destination);
  };

  return <LoginForm onSubmit={handleLogin} />;
}
```

#### 2. **Guest Mode with Limited Access**

```typescript
function TaskPage() {
  const { isAuthenticated, user } = useAuth();
  const { taskId } = useParams();
  const [task, setTask] = useState(null);

  useEffect(() => {
    loadTask(taskId);
  }, [taskId]);

  if (!task) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    // Show read-only view for guests
    return (
      <div>
        <GuestBanner>
          <p>You're viewing this in guest mode.</p>
          <button onClick={() => router.push('/login')}>
            Sign in to edit
          </button>
        </GuestBanner>
        <TaskViewReadOnly task={task} />
      </div>
    );
  }

  // Full access for authenticated users
  return <TaskViewEditable task={task} user={user} />;
}
```

#### 3. **Save Context for Post-Login Resume**

```typescript
class LoginContextManager {
  private static KEY = "login_context";

  static save(context: {
    intendedUrl: string;
    taskId?: string;
    action?: string;
    data?: any;
  }): void {
    sessionStorage.setItem(this.KEY, JSON.stringify(context));
  }

  static load(): any {
    const data = sessionStorage.getItem(this.KEY);
    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  static clear(): void {
    sessionStorage.removeItem(this.KEY);
  }
}

// Before redirecting to login
function handleUnauthenticatedDeepLink() {
  const context = {
    intendedUrl: window.location.href,
    taskId: getTaskIdFromUrl(),
    action: "edit",
    data: getFormData(),
  };

  LoginContextManager.save(context);
  router.push("/login");
}

// After successful login
function handlePostLogin() {
  const context = LoginContextManager.load();

  if (context) {
    LoginContextManager.clear();

    // Restore user's intended action
    if (context.taskId && context.action === "edit") {
      router.push(`/task/${context.taskId}/edit`);

      // Restore form data if available
      if (context.data) {
        restoreFormData(context.data);
      }
    } else {
      router.push(context.intendedUrl);
    }
  } else {
    router.push("/dashboard");
  }
}
```

#### 4. **Public Share Links**

```typescript
// Generate public share link with limited access
async function generatePublicShareLink(taskId: string, options: {
  expiresIn?: number; // milliseconds
  permissions?: string[];
}): Promise<string> {
  const shareToken = generateSecureRandomString(32);

  await redis.setex(
    `share:${shareToken}`,
    options.expiresIn || 7 * 24 * 60 * 60, // 7 days default
    JSON.stringify({
      taskId,
      permissions: options.permissions || ['read'],
      createdAt: Date.now()
    })
  );

  return `https://yourapp.com/share/${shareToken}`;
}

// Handle public share link
function SharePage() {
  const { shareToken } = useParams();
  const [task, setTask] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSharedTask(shareToken)
      .then(setTask)
      .catch(setError);
  }, [shareToken]);

  if (error) {
    return (
      <div>
        <h1>Link Expired or Invalid</h1>
        <p>This share link is no longer valid.</p>
        <button onClick={() => router.push('/login')}>
          Sign in to access
        </button>
      </div>
    );
  }

  if (!task) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <PublicShareBanner>
        <p>You're viewing a shared task.</p>
        <button onClick={() => router.push('/signup')}>
          Sign up to create your own
        </button>
      </PublicShareBanner>
      <TaskViewReadOnly task={task} />
    </div>
  );
}
```

---

## Accessibility Considerations

### Screen Reader Support

#### 1. **Announce Navigation Changes**

```typescript
function useRouteAnnouncement() {
  const router = useRouter();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const handleRouteChange = (url: string) => {
      // Extract page title from URL or metadata
      const pageTitle = getPageTitleFromUrl(url);
      setAnnouncement(`Navigated to ${pageTitle}`);

      // Clear announcement after screen reader reads it
      setTimeout(() => setAnnouncement(''), 1000);
    };

    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}
```

#### 2. **Focus Management**

```typescript
function useDeepLinkFocus() {
  const router = useRouter();

  useEffect(() => {
    const handleRouteChange = () => {
      // Focus on main content after navigation
      const mainContent = document.querySelector('main');
      if (mainContent) {
        (mainContent as HTMLElement).focus();
      }
    };

    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  }, [router]);
}

// In your layout component
function Layout({ children }: { children: React.ReactNode }) {
  useDeepLinkFocus();

  return (
    <div>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <nav>...</nav>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
```

#### 3. **Loading States**

```typescript
function TaskPage() {
  const { taskId } = useParams();
  const [task, setTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTask(taskId)
      .then(setTask)
      .finally(() => setIsLoading(false));
  }, [taskId]);

  if (isLoading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <LoadingSpinner />
        <span className="sr-only">Loading task...</span>
      </div>
    );
  }

  return (
    <div role="main" aria-label={`Task: ${task.title}`}>
      <h1>{task.title}</h1>
      {/* ... */}
    </div>
  );
}
```

#### 4. **Error Handling**

```typescript
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<Error | null>(null);

  if (error) {
    return (
      <div role="alert" aria-live="assertive">
        <h1>Something went wrong</h1>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
```

### Keyboard Navigation

```typescript
function DeepLinkModal({ isOpen, onClose, url }: {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      // Trap focus within modal
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements && focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      }
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onKeyDown={handleKeyDown}
    >
      <h2 id="modal-title">Open in App</h2>
      <p>Would you like to open this in the app?</p>
      <button onClick={() => window.location.href = url}>
        Open in App
      </button>
      <button onClick={onClose}>
        Continue in Browser
      </button>
    </div>
  );
}
```

---

## Real-World Examples

### Notion

**Deep Linking Pattern:**

```
notion://www.notion.so/workspace/page-id
```

**Implementation:**

- Uses custom URL scheme (`notion://`) for native app
- Falls back to web URL (`https://www.notion.so/...`)
- Preserves page context and scroll position
- Syncs state across devices via WebSocket

**Context Preservation:**

```typescript
// Notion-style page state sync
interface PageState {
  pageId: string;
  cursorPosition: number;
  selectedBlocks: string[];
  scrollPosition: number;
}

class NotionStateSync {
  private ws: WebSocket;

  syncPageState(state: PageState): void {
    this.ws.send(
      JSON.stringify({
        type: "page_state_update",
        data: state,
      }),
    );

    // Also save locally for offline access
    localStorage.setItem(`page_state_${state.pageId}`, JSON.stringify(state));
  }

  restorePageState(pageId: string): PageState | null {
    // Try to load from server first
    // Fallback to localStorage if offline
    const local = localStorage.getItem(`page_state_${pageId}`);
    return local ? JSON.parse(local) : null;
  }
}
```

### Linear

**Deep Linking Pattern:**

```
linear://issue/TEAM-123
https://linear.app/team/issue/TEAM-123
```

**Implementation:**

- Supports both custom scheme and HTTPS URLs
- Universal Links (iOS) and App Links (Android)
- Preserves issue context when switching from Slack

**Slack Integration:**

```typescript
// Linear-style Slack to web flow
async function createLinearIssueFromSlack(slackMessage: any) {
  // Create issue
  const issue = await linear.createIssue({
    title: slackMessage.text,
    teamId: "team-123",
  });

  // Post back to Slack with deep link
  await slack.chat.postMessage({
    channel: slackMessage.channel,
    text: `Created issue ${issue.identifier}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${issue.title}*\n<https://linear.app/team/issue/${issue.identifier}|View in Linear>`,
        },
      },
    ],
  });
}
```

### GitHub

**Deep Linking Pattern:**

```
github://pull/owner/repo/123
https://github.com/owner/repo/pull/123
```

**Implementation:**

- Mobile app deep links from Slack
- Preserves PR context (comments, files, line numbers)
- Smart fallback to web if app not installed

**Context Preservation:**

```typescript
// GitHub-style PR context
interface PRContext {
  owner: string;
  repo: string;
  number: number;
  file?: string;
  line?: number;
  commentId?: string;
}

function buildGitHubDeepLink(context: PRContext): string {
  let url = `https://github.com/${context.owner}/${context.repo}/pull/${context.number}`;

  if (context.file) {
    url += `/files#diff-${hashFile(context.file)}`;

    if (context.line) {
      url += `R${context.line}`;
    }
  }

  if (context.commentId) {
    url += `#issuecomment-${context.commentId}`;
  }

  return url;
}

// Usage
const link = buildGitHubDeepLink({
  owner: "facebook",
  repo: "react",
  number: 12345,
  file: "src/index.js",
  line: 42,
});
// Result: https://github.com/facebook/react/pull/12345/files#diff-abc123R42
```

### Slack (Reverse: Web to Slack)

**Deep Linking Pattern:**

```
slack://channel?team=T123&id=C456&message=1234567890.123456
```

**Implementation:**

```typescript
// Open Slack channel from web dashboard
function openInSlack(channelId: string, messageTs?: string) {
  const teamId = getTeamId();
  let url = `slack://channel?team=${teamId}&id=${channelId}`;

  if (messageTs) {
    url += `&message=${messageTs}`;
  }

  // Try native app first
  window.location.href = url;

  // Fallback to web after delay
  setTimeout(() => {
    const webUrl = `https://app.slack.com/client/${teamId}/${channelId}`;
    window.open(webUrl, "_blank");
  }, 500);
}
```

---

## Best Practices Summary

### Security

- ✅ Use HTTPS for all deep links
- ✅ Use URL fragments (`#`) for tokens, not query parameters
- ✅ Implement short-lived one-time codes (5-15 minutes)
- ✅ Validate tokens server-side
- ✅ Clear sensitive data from URL after extraction
- ✅ Use sessionStorage for temporary tokens
- ❌ Never put tokens in query parameters
- ❌ Never log tokens in server access logs

### UX

- ✅ Provide clear loading states
- ✅ Show "Continue where you left off" prompts
- ✅ Implement graceful fallbacks for logged-out users
- ✅ Sync state across tabs and devices
- ✅ Preserve scroll position and form data
- ✅ Announce navigation changes for screen readers
- ❌ Don't lose user context on navigation
- ❌ Don't force users to re-enter data

### Mobile

- ✅ Implement Universal Links (iOS) and App Links (Android)
- ✅ Host verification files correctly (HTTPS, no redirects)
- ✅ Provide custom URL scheme fallback
- ✅ Test on both iOS and Android
- ✅ Handle deferred deep linking (post-install)
- ❌ Don't rely solely on custom URL schemes
- ❌ Don't forget to handle app-not-installed scenarios

### Performance

- ✅ Use BroadcastChannel for cross-tab sync (modern browsers)
- ✅ Debounce state sync operations
- ✅ Use WebSockets for real-time sync
- ✅ Cache state locally with localStorage
- ✅ Implement optimistic UI updates
- ❌ Don't poll for state changes
- ❌ Don't sync on every keystroke

### Accessibility

- ✅ Use semantic HTML and ARIA attributes
- ✅ Manage focus on navigation
- ✅ Announce route changes to screen readers
- ✅ Support keyboard navigation
- ✅ Provide skip links
- ❌ Don't trap focus unexpectedly
- ❌ Don't forget loading and error states

---

## Conclusion

Maintaining user context across different interfaces requires careful attention to security, UX, and technical implementation. By following the patterns and best practices outlined in this guide, you can create seamless experiences that preserve user state and workflow continuity across Slack, web dashboards, mobile apps, and browser extensions.

**Key Takeaways:**

1. **Security First**: Never expose sensitive data in URLs
2. **Graceful Degradation**: Always provide fallbacks
3. **User Control**: Let users resume or restart workflows
4. **Accessibility**: Ensure all users can navigate effectively
5. **Test Thoroughly**: Verify on all platforms and scenarios

For more information, refer to the official documentation:

- [Slack Deep Linking](https://api.slack.com/reference/deep-linking)
- [iOS Universal Links](https://developer.apple.com/ios/universal-links/)
- [Android App Links](https://developer.android.com/training/app-links)
- [Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [OAuth 2.0 for Browser-Based Apps](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
