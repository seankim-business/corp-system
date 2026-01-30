# OAuth Connection Flow UX Design Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Provider Selection UI](#provider-selection-ui)
3. [Permission Consent Screens](#permission-consent-screens)
4. [Connection Success/Failure States](#connection-successfailure-states)
5. [Error Handling](#error-handling)
6. [Re-authentication Patterns](#re-authentication-patterns)
7. [Scope Explanation UX](#scope-explanation-ux)
8. [Connection Management](#connection-management)
9. [Security Indicators](#security-indicators)
10. [Mobile OAuth Flows](#mobile-oauth-flows)
11. [Multi-Account Scenarios](#multi-account-scenarios)
12. [GDPR Consent Requirements](#gdpr-consent-requirements)
13. [Real-World Examples](#real-world-examples)

---

## Introduction

OAuth 2.0 is the industry-standard protocol for authorization, enabling third-party applications to access user data without exposing credentials. This guide provides comprehensive UX patterns for implementing OAuth connection flows in multi-tenant SaaS applications.

### Key Principles

- **Transparency**: Clearly communicate what data is being accessed and why
- **User Control**: Give users explicit control over permissions and connections
- **Security First**: Implement security best practices while maintaining usability
- **Graceful Degradation**: Handle errors elegantly with clear recovery paths
- **Mobile-First**: Design for mobile experiences from the start

---

## Provider Selection UI

### Design Patterns

#### 1. **Grid Layout (Recommended for 6+ Providers)**

```
┌─────────────────────────────────────────┐
│  Connect Your Accounts                  │
├─────────────────────────────────────────┤
│  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │ Google │  │ GitHub │  │ Slack  │   │
│  │   🔵   │  │   ⚫   │  │   💬   │   │
│  └────────┘  └────────┘  └────────┘   │
│  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │ Notion │  │ Dropbox│  │ Trello │   │
│  │   📝   │  │   📦   │  │   📋   │   │
│  └────────┘  └────────┘  └────────┘   │
└─────────────────────────────────────────┘
```

**Best Practices:**

- Use recognizable brand logos and colors
- Display provider name below the icon
- Show connection status (Connected/Not Connected)
- Group providers by category (Productivity, Storage, Communication)

#### 2. **List Layout (Recommended for 3-5 Providers)**

```
┌─────────────────────────────────────────┐
│  Choose a provider to connect           │
├─────────────────────────────────────────┤
│  🔵 Google                        →     │
│  Access Gmail, Calendar, Drive          │
├─────────────────────────────────────────┤
│  ⚫ GitHub                         →     │
│  Access repositories and issues         │
├─────────────────────────────────────────┤
│  💬 Slack                          →     │
│  Access channels and messages           │
└─────────────────────────────────────────┘
```

**Best Practices:**

- Include brief description of what data will be accessed
- Use chevron or arrow to indicate clickability
- Highlight the most popular or recommended provider
- Show "Recommended" or "Most Popular" badges

#### 3. **Search-First (Recommended for 20+ Providers)**

```
┌─────────────────────────────────────────┐
│  🔍 Search for a provider...            │
├─────────────────────────────────────────┤
│  Popular Integrations                   │
│  ┌────────┐  ┌────────┐  ┌────────┐   │
│  │ Google │  │ Slack  │  │ GitHub │   │
│  └────────┘  └────────┘  └────────┘   │
│                                         │
│  All Providers (A-Z)                    │
│  • Airtable                             │
│  • Asana                                │
│  • Box                                  │
└─────────────────────────────────────────┘
```

**Best Practices:**

- Implement instant search filtering
- Show popular/recently used providers first
- Categorize providers (CRM, Project Management, etc.)
- Display total number of available providers

### Implementation Examples

**Zapier Pattern:**

- Displays provider logo, name, and brief description
- Shows "Premium" badge for paid integrations
- Includes search bar for 5000+ apps
- Groups by categories and popularity

**Notion Pattern:**

- Clean, minimal design with large provider cards
- Shows connection status inline
- One-click connection for already-authorized providers
- Clear "Connect" CTA button

---

## Permission Consent Screens

### Anatomy of a Good Consent Screen

```
┌─────────────────────────────────────────┐
│  [App Logo]  YourApp                    │
│                                         │
│  wants to access your Google Account   │
│                                         │
│  This will allow YourApp to:            │
│  ✓ View your email address              │
│  ✓ View your basic profile info         │
│  ✓ Read and send emails on your behalf  │
│                                         │
│  [i] Why does YourApp need this?        │
│                                         │
│  By continuing, you allow this app to   │
│  use your information in accordance     │
│  with their privacy policy and terms    │
│  of service.                            │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │   Cancel    │  │   Allow     │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### Key Elements

#### 1. **Application Identity**

- Display your application name and logo prominently
- Show verified badge if applicable
- Include developer/company name

#### 2. **Clear Permission List**

- Use plain language, not technical jargon
- Group related permissions together
- Use checkmarks or icons for visual clarity
- Avoid overwhelming users with too many permissions at once

**Good Examples:**

- ✅ "Read your email messages"
- ✅ "Access your calendar events"
- ✅ "View your profile information"

**Bad Examples:**

- ❌ "Access to https://www.googleapis.com/auth/gmail.readonly"
- ❌ "Full access to all data"
- ❌ "Scope: user:email, repo, admin:org"

#### 3. **Contextual Help**

- Provide "Why do we need this?" expandable section
- Link to detailed privacy policy
- Explain how data will be used
- Show data retention policy

#### 4. **Trust Indicators**

- Display security badges (verified app, SSL, etc.)
- Show number of users who have connected
- Include link to privacy policy and terms of service
- Display last updated date for permissions

### Incremental Authorization Pattern

Instead of requesting all permissions upfront, request them when needed:

```javascript
// Initial connection - minimal scopes
const initialScopes = ["openid", "profile", "email"];

// Later, when user wants to use calendar feature
const additionalScopes = ["calendar.readonly"];
```

**UX Flow:**

1. Initial connection: Request only basic profile access
2. Feature activation: Request additional scopes when user tries to use a feature
3. Contextual prompt: Explain why the new permission is needed
4. Graceful degradation: Allow app to work with limited permissions

**Example Message:**

```
┌─────────────────────────────────────────┐
│  📅 Calendar Sync                       │
│                                         │
│  To sync your calendar events, we need  │
│  permission to access your Google       │
│  Calendar.                              │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Not Now    │  │  Grant Access│      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### Google OAuth Consent Screen Best Practices

Based on Google's requirements:

- **Application Name**: Displayed prominently on consent screen
- **Support Email**: Required for all external production apps
- **Privacy Policy**: Must be publicly accessible URL
- **Terms of Service**: Recommended for production apps
- **Authorized Domains**: Verify ownership of domains
- **Scopes**: Request minimum necessary scopes
- **Verification**: Required for sensitive/restricted scopes

---

## Connection Success/Failure States

### Success State Patterns

#### 1. **Inline Success Message**

```
┌─────────────────────────────────────────┐
│  ✅ Successfully connected to Google    │
│                                         │
│  You can now sync your emails and       │
│  calendar events.                       │
│                                         │
│  [View Connected Accounts]              │
└─────────────────────────────────────────┘
```

#### 2. **Toast Notification**

```
┌─────────────────────────────────────────┐
│  ✅ OAuth Connection Successful         │
│  Successfully connected to GitHub       │
│                                    [×]  │
└─────────────────────────────────────────┘
```

#### 3. **Redirect with Confirmation**

```
┌─────────────────────────────────────────┐
│  🎉 All Set!                            │
│                                         │
│  Your Slack workspace is now connected. │
│                                         │
│  Connected as: @john.doe                │
│  Workspace: Acme Corp                   │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Continue to Dashboard      │       │
│  └─────────────────────────────┘       │
│                                         │
│  You can close this window now.         │
└─────────────────────────────────────────┘
```

### Success State Best Practices

- **Immediate Feedback**: Show success message within 1 second
- **Clear Confirmation**: Display connected account details (email, username)
- **Next Steps**: Guide users on what they can do next
- **Visual Indicators**: Use checkmarks, green colors, success icons
- **Auto-Close Option**: For popup windows, offer auto-close after 3-5 seconds
- **Persistent State**: Update UI to reflect connected status

### Failure State Patterns

#### 1. **User Denied Access**

```
┌─────────────────────────────────────────┐
│  ⚠️ Connection Cancelled                │
│                                         │
│  You denied access to your Google       │
│  account. To use this feature, we need  │
│  permission to access your data.        │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Go Back    │  │  Try Again  │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

#### 2. **Connection Failed**

```
┌─────────────────────────────────────────┐
│  ❌ OAuth Connection Failed             │
│                                         │
│  We couldn't connect to GitHub.         │
│                                         │
│  Error: invalid_grant                   │
│  The authorization code has expired.    │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Try Again                  │       │
│  └─────────────────────────────┘       │
│                                         │
│  Need help? Contact support             │
└─────────────────────────────────────────┘
```

#### 3. **Network Error**

```
┌─────────────────────────────────────────┐
│  🔌 Connection Error                    │
│                                         │
│  Unable to reach the authentication     │
│  server. Please check your internet     │
│  connection and try again.              │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Retry      │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### Failure State Best Practices

- **Clear Error Messages**: Use plain language, avoid technical jargon
- **Actionable Solutions**: Provide clear next steps
- **Error Codes**: Include for debugging (can be hidden in "Details")
- **Support Links**: Offer help documentation or contact support
- **Retry Mechanism**: Always provide a way to retry the connection
- **Graceful Degradation**: Allow users to continue with limited functionality

---

## Error Handling

### Common OAuth Error Scenarios

#### 1. **Access Denied (User Cancelled)**

**Error Code**: `access_denied`

**User Message**:

```
You cancelled the connection to Google.
To use this feature, please try connecting again.
```

**UX Pattern**:

- Don't treat as critical error
- Provide easy retry option
- Explain why permission is needed
- Allow user to skip and continue with limited features

#### 2. **Invalid Grant (Expired Authorization Code)**

**Error Code**: `invalid_grant`

**User Message**:

```
The authorization code has expired.
Please try connecting again.
```

**UX Pattern**:

- Auto-retry once silently
- If retry fails, show user-friendly message
- Provide "Try Again" button
- Log error details for debugging

#### 3. **Invalid Client (Configuration Error)**

**Error Code**: `invalid_client`

**User Message**:

```
There's a configuration issue with this integration.
Please contact support.
```

**UX Pattern**:

- Show generic error to user
- Log detailed error for developers
- Provide support contact information
- Don't expose sensitive configuration details

#### 4. **Insufficient Scope**

**Error Code**: `insufficient_scope`

**User Message**:

```
Additional permissions are required to use this feature.
Please reconnect and grant the necessary permissions.
```

**UX Pattern**:

- Explain which specific permission is missing
- Show what feature requires this permission
- Provide "Grant Permission" button
- Allow user to decline and disable feature

#### 5. **Rate Limit Exceeded**

**Error Code**: `rate_limit_exceeded`

**User Message**:

```
Too many connection attempts.
Please wait a few minutes and try again.
```

**UX Pattern**:

- Show countdown timer if possible
- Disable retry button temporarily
- Explain rate limiting in simple terms
- Provide alternative actions

#### 6. **Server Error**

**Error Code**: `server_error`

**User Message**:

```
The authentication server is temporarily unavailable.
Please try again in a few minutes.
```

**UX Pattern**:

- Show temporary error message
- Provide retry button
- Don't blame the user
- Log error for monitoring

### Error Handling Implementation

```typescript
interface OAuthError {
  error: string;
  error_description?: string;
  error_uri?: string;
}

function handleOAuthError(error: OAuthError): void {
  const errorMessages: Record<string, string> = {
    access_denied:
      "You cancelled the connection. To use this feature, please try connecting again.",
    invalid_grant: "The authorization code has expired. Please try connecting again.",
    invalid_client: "There's a configuration issue. Please contact support.",
    invalid_request: "Invalid request. Please try again.",
    unauthorized_client: "This application is not authorized. Please contact support.",
    unsupported_grant_type: "Unsupported authentication method. Please contact support.",
    invalid_scope: "Invalid permissions requested. Please contact support.",
    server_error: "The authentication server is temporarily unavailable. Please try again later.",
    temporarily_unavailable: "The service is temporarily unavailable. Please try again later.",
  };

  const userMessage =
    errorMessages[error.error] || "An unexpected error occurred. Please try again.";

  // Show user-friendly message
  showToast({
    type: "error",
    title: "OAuth Connection Failed",
    message: userMessage,
  });

  // Log detailed error for debugging
  console.error("OAuth Error:", {
    error: error.error,
    description: error.error_description,
    uri: error.error_uri,
  });
}
```

### Error Recovery Patterns

#### Automatic Retry with Exponential Backoff

```typescript
async function connectWithRetry(maxAttempts: number = 3, baseDelay: number = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await initiateOAuthFlow();
      return; // Success
    } catch (error) {
      if (attempt === maxAttempts) {
        handleOAuthError(error);
        return;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
```

#### Graceful Degradation

```typescript
function handleInsufficientScope(requiredScope: string): void {
  // Disable feature that requires this scope
  disableFeature(requiredScope);

  // Show informational message
  showMessage({
    type: "info",
    title: "Limited Functionality",
    message: `Some features are disabled because we don't have permission to access your ${requiredScope}.`,
    actions: [
      { label: "Grant Permission", onClick: () => requestScope(requiredScope) },
      { label: "Continue Anyway", onClick: () => dismissMessage() },
    ],
  });
}
```

---

## Re-authentication Patterns

### When Re-authentication is Needed

1. **Token Expiration**: Access token has expired and refresh token is invalid/expired
2. **Revoked Access**: User revoked app permissions from provider settings
3. **Scope Changes**: App requires additional permissions
4. **Security Events**: Suspicious activity detected
5. **Manual Disconnect**: User manually disconnected and wants to reconnect

### Re-authentication UX Patterns

#### 1. **Proactive Token Refresh (Silent)**

**Best Practice**: Use refresh tokens to get new access tokens without user interaction

```typescript
async function refreshAccessToken(): Promise<void> {
  try {
    const newToken = await fetch("/oauth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: storedRefreshToken }),
    });

    // Update stored token silently
    updateStoredToken(newToken);
  } catch (error) {
    // Refresh failed, prompt user to re-authenticate
    promptReauthentication();
  }
}
```

**UX**: No user interaction needed - seamless experience

#### 2. **Expiry Notification with Grace Period**

**Pattern**: Warn users before token expires

```
┌─────────────────────────────────────────┐
│  ⚠️ Connection Expiring Soon            │
│                                         │
│  Your Google connection will expire in  │
│  2 days. Please reconnect to continue   │
│  syncing your data.                     │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Remind Me  │  │  Reconnect  │      │
│  │  Later      │  │  Now        │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

**Best Practices**:

- Notify 7 days, 3 days, and 1 day before expiration
- Provide one-click reconnection
- Don't interrupt critical workflows
- Allow users to snooze notifications

#### 3. **On-Demand Re-authentication**

**Pattern**: Prompt when user tries to use a feature requiring valid token

```
┌─────────────────────────────────────────┐
│  🔐 Re-authentication Required          │
│                                         │
│  Your GitHub connection has expired.    │
│  Please reconnect to continue.          │
│                                         │
│  Last connected: 30 days ago            │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Reconnect to GitHub        │       │
│  └─────────────────────────────┘       │
│                                         │
│  [Cancel]                               │
└─────────────────────────────────────────┘
```

**Best Practices**:

- Show when connection was last active
- Explain why re-authentication is needed
- Preserve user's workflow context
- Auto-resume after successful re-authentication

#### 4. **Automatic Re-authentication on 401 Error**

**Pattern**: Intercept API errors and handle re-authentication

```typescript
// Axios interceptor example
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      try {
        await refreshAccessToken();
        // Retry original request
        return axios.request(error.config);
      } catch (refreshError) {
        // Refresh failed, prompt user
        showReauthenticationModal();
        throw error;
      }
    }
    return Promise.reject(error);
  },
);
```

**UX**: Seamless for users - automatic retry after token refresh

#### 5. **Scheduled Re-authentication**

**Pattern**: For high-security applications, require periodic re-authentication

```
┌─────────────────────────────────────────┐
│  🔒 Security Check                      │
│                                         │
│  For your security, please verify your  │
│  identity to continue.                  │
│                                         │
│  This is required every 30 days.        │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Verify with Google         │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

**Best Practices**:

- Explain security rationale
- Show time since last authentication
- Allow "Remember this device" option
- Provide alternative verification methods

### Re-authentication Flow Diagram

```
User Action → API Request → 401 Unauthorized
                                    ↓
                          Check Refresh Token
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
            Refresh Token Valid          Refresh Token Invalid
                    ↓                               ↓
          Get New Access Token            Show Re-auth Modal
                    ↓                               ↓
            Retry Original Request          User Clicks "Reconnect"
                    ↓                               ↓
                Success                    OAuth Flow Initiated
                                                    ↓
                                          New Tokens Received
                                                    ↓
                                          Retry Original Request
```

### Adaptive Expiration Policies

**Pattern**: Extend token validity for active users

```typescript
interface TokenPolicy {
  baseExpiration: number; // 1 hour
  maxExpiration: number; // 30 days
  inactivityThreshold: number; // 7 days
}

function calculateTokenExpiration(lastActivity: Date, policy: TokenPolicy): number {
  const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceActivity < 1) {
    // Very active user - extend to max
    return policy.maxExpiration;
  } else if (daysSinceActivity < policy.inactivityThreshold) {
    // Moderately active - sliding scale
    return policy.baseExpiration * (7 - daysSinceActivity);
  } else {
    // Inactive user - minimum expiration
    return policy.baseExpiration;
  }
}
```

---

## Scope Explanation UX

### Principles of Good Scope Communication

1. **Plain Language**: Avoid technical OAuth scope names
2. **Specific Actions**: Explain exactly what the app will do
3. **User Benefit**: Explain why this permission helps the user
4. **Minimal Permissions**: Request only what's necessary
5. **Granular Control**: Allow users to approve/deny individual scopes

### Scope Translation Examples

| OAuth Scope         | ❌ Bad Explanation                   | ✅ Good Explanation                 |
| ------------------- | ------------------------------------ | ----------------------------------- |
| `user:email`        | Access to user:email scope           | View your email address             |
| `repo`              | Full control of private repositories | Read and write to your repositories |
| `admin:org`         | Full control of orgs and teams       | Manage your organization settings   |
| `calendar.readonly` | Read-only access to calendar         | View your calendar events           |
| `gmail.send`        | Send email on your behalf            | Send emails from your account       |

### Scope Grouping Pattern

```
┌─────────────────────────────────────────┐
│  YourApp needs access to:               │
│                                         │
│  📧 Email (Required)                    │
│  • View your email address              │
│  • Send emails on your behalf           │
│                                         │
│  📅 Calendar (Optional)                 │
│  • View your calendar events            │
│  • Create new events                    │
│  [✓] Include calendar access            │
│                                         │
│  📁 Drive (Optional)                    │
│  • View and download your files         │
│  • Upload new files                     │
│  [✓] Include drive access               │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │   Cancel    │  │   Continue  │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### Contextual Scope Explanation

**Pattern**: Explain scopes in context of the feature

```
┌─────────────────────────────────────────┐
│  📧 Email Sync Setup                    │
│                                         │
│  To sync your emails, we need:          │
│                                         │
│  ✓ Read your email messages             │
│    We'll sync your inbox to show        │
│    emails in the dashboard              │
│                                         │
│  ✓ Send emails on your behalf           │
│    You'll be able to reply to emails    │
│    directly from our app                │
│                                         │
│  [i] We never store your emails on      │
│      our servers. All data is           │
│      encrypted in transit.              │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Grant Access               │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Progressive Scope Disclosure

**Pattern**: Request scopes incrementally as needed

**Step 1: Initial Connection (Minimal Scopes)**

```
┌─────────────────────────────────────────┐
│  Connect to Google                      │
│                                         │
│  We need basic access to:               │
│  • View your email address              │
│  • View your profile information        │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Connect                    │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

**Step 2: Feature Activation (Additional Scopes)**

```
┌─────────────────────────────────────────┐
│  📅 Enable Calendar Sync                │
│                                         │
│  To sync your calendar, we need         │
│  additional permission to:              │
│                                         │
│  • View your calendar events            │
│  • Create and edit events               │
│                                         │
│  This allows you to:                    │
│  • See upcoming meetings in dashboard   │
│  • Schedule meetings from our app       │
│  • Get meeting reminders                │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Not Now    │  │  Enable     │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### Scope Audit & Management

**Pattern**: Show users what permissions they've granted

```
┌─────────────────────────────────────────┐
│  Google Account Permissions             │
│                                         │
│  Connected as: john@example.com         │
│  Connected on: Jan 15, 2026             │
│                                         │
│  Active Permissions:                    │
│  ✓ View email address                   │
│  ✓ View profile information             │
│  ✓ Read and send emails                 │
│  ✓ View calendar events                 │
│                                         │
│  [Manage Permissions]  [Disconnect]     │
└─────────────────────────────────────────┘
```

### Scope Change Notifications

**Pattern**: Notify users when app requests new scopes

```
┌─────────────────────────────────────────┐
│  🔔 New Permission Request              │
│                                         │
│  YourApp is requesting additional       │
│  access to your Google account:         │
│                                         │
│  New Permission:                        │
│  • Manage your Google Drive files       │
│                                         │
│  Why we need this:                      │
│  We've added a new feature that lets    │
│  you attach files from Google Drive.    │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Deny       │  │  Approve    │      │
│  └─────────────┘  └─────────────┘      │
│                                         │
│  [View all permissions]                 │
└─────────────────────────────────────────┘
```

---

## Connection Management

### Connection Status Display

#### 1. **Connected State**

```
┌─────────────────────────────────────────┐
│  🔵 Google                              │
│  ✓ Connected                            │
│                                         │
│  john.doe@gmail.com                     │
│  Last synced: 2 minutes ago             │
│                                         │
│  [Reconnect]  [Disconnect]              │
└─────────────────────────────────────────┘
```

#### 2. **Disconnected State**

```
┌─────────────────────────────────────────┐
│  🔵 Google                              │
│  ○ Not Connected                        │
│                                         │
│  Connect your Google account to sync    │
│  emails and calendar events.            │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Connect                    │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

#### 3. **Error State**

```
┌─────────────────────────────────────────┐
│  🔵 Google                              │
│  ⚠️ Connection Error                    │
│                                         │
│  john.doe@gmail.com                     │
│  Your connection has expired.           │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Reconnect                  │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

#### 4. **Syncing State**

```
┌─────────────────────────────────────────┐
│  🔵 Google                              │
│  🔄 Syncing...                          │
│                                         │
│  john.doe@gmail.com                     │
│  Syncing your latest emails             │
│                                         │
│  [Cancel Sync]                          │
└─────────────────────────────────────────┘
```

### Reconnection Patterns

#### 1. **Simple Reconnect**

```
┌─────────────────────────────────────────┐
│  Reconnect to Google?                   │
│                                         │
│  Your connection has expired. Click     │
│  below to reconnect.                    │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Reconnect                  │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

#### 2. **Reconnect with Account Selection**

```
┌─────────────────────────────────────────┐
│  Reconnect to Google                    │
│                                         │
│  Previously connected as:               │
│  john.doe@gmail.com                     │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Reconnect Same Account     │       │
│  └─────────────────────────────┘       │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Connect Different Account  │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

#### 3. **Reconnect with Scope Changes**

```
┌─────────────────────────────────────────┐
│  Reconnect to Google                    │
│                                         │
│  We've added new features that require  │
│  additional permissions:                │
│                                         │
│  Previous Permissions:                  │
│  • View email address                   │
│  • Read emails                          │
│                                         │
│  New Permissions:                       │
│  • Manage calendar events               │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Reconnect & Grant Access   │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Revocation Patterns

#### 1. **Simple Disconnect**

```
┌─────────────────────────────────────────┐
│  Disconnect Google Account?             │
│                                         │
│  This will:                             │
│  • Stop syncing your emails             │
│  • Remove access to your calendar       │
│  • Delete cached data from our servers  │
│                                         │
│  You can reconnect anytime.             │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Disconnect │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

#### 2. **Disconnect with Data Options**

```
┌─────────────────────────────────────────┐
│  Disconnect Google Account              │
│                                         │
│  What should we do with your data?      │
│                                         │
│  ○ Keep my synced data                  │
│    You can still view previously        │
│    synced emails and events             │
│                                         │
│  ○ Delete all my data                   │
│    Permanently remove all synced        │
│    data from our servers                │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Disconnect │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

#### 3. **Disconnect Confirmation**

```
┌─────────────────────────────────────────┐
│  ✓ Account Disconnected                 │
│                                         │
│  Your Google account has been           │
│  disconnected.                          │
│                                         │
│  • Access tokens have been revoked      │
│  • Synced data has been deleted         │
│                                         │
│  [Reconnect]  [Close]                   │
└─────────────────────────────────────────┘
```

### Connection Settings Panel

```
┌─────────────────────────────────────────┐
│  Connected Accounts                     │
├─────────────────────────────────────────┤
│  🔵 Google                              │
│  ✓ Connected as john.doe@gmail.com      │
│  Last synced: 5 minutes ago             │
│  [Manage] [Disconnect]                  │
├─────────────────────────────────────────┤
│  ⚫ GitHub                               │
│  ✓ Connected as @johndoe                │
│  Last synced: 1 hour ago                │
│  [Manage] [Disconnect]                  │
├─────────────────────────────────────────┤
│  💬 Slack                                │
│  ⚠️ Connection expired                  │
│  [Reconnect]                            │
├─────────────────────────────────────────┤
│  📝 Notion                               │
│  ○ Not connected                        │
│  [Connect]                              │
└─────────────────────────────────────────┘
```

### Bulk Connection Management

```
┌─────────────────────────────────────────┐
│  Manage All Connections                 │
│                                         │
│  [✓] Google (john.doe@gmail.com)        │
│  [✓] GitHub (@johndoe)                  │
│  [✓] Slack (Acme Corp)                  │
│  [ ] Notion                             │
│  [ ] Dropbox                            │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Disconnect Selected (3)    │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

---

## Security Indicators

### Visual Security Cues

#### 1. **SSL/HTTPS Indicator**

```
┌─────────────────────────────────────────┐
│  🔒 Secure Connection                   │
│  https://accounts.google.com            │
│                                         │
│  This connection is encrypted and       │
│  verified by Google.                    │
└─────────────────────────────────────────┘
```

#### 2. **Verified App Badge**

```
┌─────────────────────────────────────────┐
│  [App Logo] YourApp ✓ Verified          │
│                                         │
│  This app has been verified by Google   │
│  and follows security best practices.   │
└─────────────────────────────────────────┘
```

#### 3. **Trust Indicators**

```
┌─────────────────────────────────────────┐
│  YourApp                                │
│                                         │
│  ✓ Verified by Google                   │
│  ✓ 10,000+ users                        │
│  ✓ Privacy policy reviewed              │
│  ✓ Secure data encryption               │
└─────────────────────────────────────────┘
```

### Security Warnings

#### 1. **Unverified App Warning**

```
┌─────────────────────────────────────────┐
│  ⚠️ Unverified App                      │
│                                         │
│  This app hasn't been verified by       │
│  Google. Only continue if you trust     │
│  the developer.                         │
│                                         │
│  Developer: Acme Corp                   │
│  Website: acme.com                      │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Go Back    │  │  Continue   │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

#### 2. **Sensitive Scope Warning**

```
┌─────────────────────────────────────────┐
│  ⚠️ Sensitive Permissions               │
│                                         │
│  This app is requesting access to       │
│  sensitive data:                        │
│                                         │
│  • Full access to your Gmail            │
│  • Ability to delete emails             │
│                                         │
│  Only grant access if you fully trust   │
│  this application.                      │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Deny       │  │  Allow      │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

#### 3. **Phishing Warning**

```
┌─────────────────────────────────────────┐
│  🚨 Security Alert                      │
│                                         │
│  This site may be impersonating         │
│  "accounts.google.com" to steal your    │
│  personal information.                  │
│                                         │
│  URL: accounts-google-login.xyz         │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Go Back to Safety          │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Security Best Practices Display

```
┌─────────────────────────────────────────┐
│  🔒 Your Security Matters               │
│                                         │
│  How we protect your data:              │
│                                         │
│  ✓ End-to-end encryption                │
│    All data is encrypted in transit     │
│                                         │
│  ✓ No password storage                  │
│    We never see or store your password  │
│                                         │
│  ✓ Revocable access                     │
│    You can revoke access anytime        │
│                                         │
│  ✓ Minimal permissions                  │
│    We only request what we need         │
│                                         │
│  [Learn More] [Privacy Policy]          │
└─────────────────────────────────────────┘
```

### OAuth State Parameter

**Security Pattern**: Use state parameter to prevent CSRF attacks

```typescript
// Generate random state
const state = generateRandomString(32);
sessionStorage.setItem("oauth_state", state);

// Include in OAuth URL
const authUrl =
  `${authEndpoint}?` +
  `client_id=${clientId}&` +
  `redirect_uri=${redirectUri}&` +
  `state=${state}&` +
  `scope=${scopes}`;

// Validate on callback
const callbackState = new URLSearchParams(window.location.search).get("state");
const storedState = sessionStorage.getItem("oauth_state");

if (callbackState !== storedState) {
  throw new Error("Invalid state parameter - possible CSRF attack");
}
```

### PKCE (Proof Key for Code Exchange)

**Security Pattern**: Use PKCE for mobile and SPA applications

```typescript
// Generate code verifier and challenge
const codeVerifier = generateRandomString(128);
const codeChallenge = await sha256(codeVerifier);

sessionStorage.setItem("code_verifier", codeVerifier);

// Include in authorization request
const authUrl =
  `${authEndpoint}?` +
  `client_id=${clientId}&` +
  `redirect_uri=${redirectUri}&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256`;

// Include verifier in token exchange
const tokenResponse = await fetch(tokenEndpoint, {
  method: "POST",
  body: JSON.stringify({
    code: authorizationCode,
    code_verifier: codeVerifier,
    client_id: clientId,
    redirect_uri: redirectUri,
  }),
});
```

---

## Mobile OAuth Flows

### Mobile-Specific Challenges

1. **No browser cookies**: Can't rely on existing sessions
2. **App switching**: User switches between app and browser
3. **Deep linking**: Returning to app after authorization
4. **Security**: Protecting tokens in mobile environment
5. **UX**: Minimizing friction in mobile context

### Recommended Pattern: AppAuth with PKCE

**Why AppAuth?**

- Uses system browser (SFSafariViewController on iOS, Custom Tabs on Android)
- Implements PKCE for security
- Handles deep linking automatically
- Follows OAuth 2.0 for Native Apps best practices

### Mobile OAuth Flow Diagram

```
Mobile App → Opens System Browser → Provider Login
                                           ↓
                                    User Authenticates
                                           ↓
                                    Grants Permissions
                                           ↓
                              Redirect to Custom URL Scheme
                                           ↓
                                    Deep Link to App
                                           ↓
                              App Receives Authorization Code
                                           ↓
                              Exchange Code for Tokens (with PKCE)
                                           ↓
                                    Store Tokens Securely
```

### iOS Implementation Pattern

```swift
// Using ASWebAuthenticationSession (iOS 12+)
import AuthenticationServices

func initiateOAuth() {
    let authURL = buildAuthorizationURL() // Include PKCE challenge

    let session = ASWebAuthenticationSession(
        url: authURL,
        callbackURLScheme: "myapp"
    ) { callbackURL, error in
        guard error == nil, let callbackURL = callbackURL else {
            handleError(error)
            return
        }

        handleCallback(callbackURL)
    }

    session.presentationContextProvider = self
    session.prefersEphemeralWebBrowserSession = false // Allow SSO
    session.start()
}
```

**UX Pattern**:

```
┌─────────────────────────────────────────┐
│  MyApp wants to connect to Google       │
│                                         │
│  [Continue] will open Safari to sign in │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Continue                   │       │
│  └─────────────────────────────┘       │
│                                         │
│  [Cancel]                               │
└─────────────────────────────────────────┘
```

### Android Implementation Pattern

```kotlin
// Using Custom Tabs
import androidx.browser.customtabs.CustomTabsIntent

fun initiateOAuth() {
    val authUrl = buildAuthorizationURL() // Include PKCE challenge

    val customTabsIntent = CustomTabsIntent.Builder()
        .setShowTitle(true)
        .setToolbarColor(ContextCompat.getColor(this, R.color.primary))
        .build()

    customTabsIntent.launchUrl(this, Uri.parse(authUrl))
}

// Handle callback in Activity
override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val data: Uri? = intent?.data
    if (data != null && data.scheme == "myapp") {
        handleCallback(data)
    }
}
```

**UX Pattern**:

```
┌─────────────────────────────────────────┐
│  ← MyApp                                │
│  accounts.google.com                    │
├─────────────────────────────────────────┤
│                                         │
│  [Google Sign In Page]                  │
│                                         │
│  Email: _________________               │
│  Password: ______________               │
│                                         │
│  [Sign In]                              │
│                                         │
└─────────────────────────────────────────┘
```

### Mobile UX Best Practices

#### 1. **Pre-Authorization Context**

```
┌─────────────────────────────────────────┐
│  📧 Connect Your Email                  │
│                                         │
│  To sync your emails, we'll securely    │
│  connect to your Google account.        │
│                                         │
│  What happens next:                     │
│  1. You'll sign in with Google          │
│  2. Review permissions                  │
│  3. Return to this app                  │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Connect with Google        │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

#### 2. **Loading State During Browser Switch**

```
┌─────────────────────────────────────────┐
│                                         │
│           🔄                            │
│                                         │
│  Waiting for authorization...           │
│                                         │
│  Complete the sign-in process in        │
│  your browser.                          │
│                                         │
│  [Cancel]                               │
│                                         │
└─────────────────────────────────────────┘
```

#### 3. **Return to App Confirmation**

```
┌─────────────────────────────────────────┐
│  ✅ Authorization Complete              │
│                                         │
│  Tap below to return to MyApp           │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Open MyApp                 │       │
│  └─────────────────────────────┘       │
│                                         │
│  Or wait 3 seconds for automatic        │
│  redirect...                            │
└─────────────────────────────────────────┘
```

#### 4. **Deep Link Handling**

```
┌─────────────────────────────────────────┐
│  Open in MyApp?                         │
│                                         │
│  This link wants to open MyApp          │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Open       │      │
│  └─────────────┘  └─────────────┘      │
│                                         │
│  [✓] Always open links in MyApp         │
└─────────────────────────────────────────┘
```

### Mobile Token Storage

**Security Best Practices**:

```swift
// iOS - Store in Keychain
import Security

func storeToken(_ token: String, forKey key: String) {
    let data = token.data(using: .utf8)!

    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
    ]

    SecItemDelete(query as CFDictionary) // Delete existing
    SecItemAdd(query as CFDictionary, nil)
}
```

```kotlin
// Android - Store in EncryptedSharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

fun storeToken(token: String, key: String) {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    val sharedPreferences = EncryptedSharedPreferences.create(
        context,
        "oauth_tokens",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    sharedPreferences.edit()
        .putString(key, token)
        .apply()
}
```

### Mobile-Specific Error Handling

#### 1. **Browser Not Available**

```
┌─────────────────────────────────────────┐
│  ⚠️ Browser Required                    │
│                                         │
│  To connect your account, you need a    │
│  web browser installed.                 │
│                                         │
│  Please install a browser and try again.│
│                                         │
│  ┌─────────────────────────────┐       │
│  │  OK                         │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

#### 2. **User Cancelled Browser**

```
┌─────────────────────────────────────────┐
│  Connection Cancelled                   │
│                                         │
│  You closed the browser before          │
│  completing sign-in.                    │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Go Back    │  │  Try Again  │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

#### 3. **Network Error on Mobile**

```
┌─────────────────────────────────────────┐
│  📶 No Internet Connection              │
│                                         │
│  Please check your connection and       │
│  try again.                             │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Retry                      │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Biometric Re-authentication

**Pattern**: Use biometric authentication for token refresh

```
┌─────────────────────────────────────────┐
│  🔐 Verify Your Identity                │
│                                         │
│  Use Touch ID to continue               │
│                                         │
│         [Fingerprint Icon]              │
│                                         │
│  Touch the sensor to verify             │
│                                         │
│  [Use Passcode Instead]                 │
└─────────────────────────────────────────┘
```

---

## Multi-Account Scenarios

### Account Selection Patterns

#### 1. **Pre-Authorization Account Picker**

**Pattern**: Show account picker before OAuth flow

```
┌─────────────────────────────────────────┐
│  Choose a Google Account                │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 john.doe@gmail.com           │   │
│  │    John Doe                     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 john@company.com             │   │
│  │    John Doe (Work)              │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ➕ Use another account          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Implementation**: Use `prompt=select_account` parameter

```typescript
const authUrl =
  `${authEndpoint}?` +
  `client_id=${clientId}&` +
  `redirect_uri=${redirectUri}&` +
  `scope=${scopes}&` +
  `prompt=select_account`; // Force account picker
```

#### 2. **Post-Authorization Account Switcher**

**Pattern**: Allow switching between connected accounts

```
┌─────────────────────────────────────────┐
│  👤 john.doe@gmail.com          ▼       │
├─────────────────────────────────────────┤
│  Current Account                        │
│  ● john.doe@gmail.com                   │
│    Personal                             │
│                                         │
│  Other Accounts                         │
│  ○ john@company.com                     │
│    Work                                 │
│                                         │
│  ○ john@freelance.com                   │
│    Freelance                            │
│                                         │
│  ➕ Add Another Account                 │
└─────────────────────────────────────────┘
```

#### 3. **Inline Account Switcher**

**Pattern**: Quick account switching in navigation

```
┌─────────────────────────────────────────┐
│  [Logo] MyApp                           │
│                                         │
│  Accounts: [john.doe@gmail.com ▼]       │
│                                         │
│  • Dashboard                            │
│  • Settings                             │
│  • Logout                               │
└─────────────────────────────────────────┘
```

### Multi-Account Management

#### 1. **Account List View**

```
┌─────────────────────────────────────────┐
│  Connected Accounts                     │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 john.doe@gmail.com           │   │
│  │    ✓ Active                     │   │
│  │    Last used: 5 minutes ago     │   │
│  │    [Switch] [Manage]            │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 john@company.com             │   │
│  │    ○ Inactive                   │   │
│  │    Last used: 2 days ago        │   │
│  │    [Switch] [Manage]            │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ➕ Add Another Account          │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

#### 2. **Account Details View**

```
┌─────────────────────────────────────────┐
│  Account Details                        │
│                                         │
│  👤 john.doe@gmail.com                  │
│                                         │
│  Status: ✓ Active                       │
│  Connected: Jan 15, 2026                │
│  Last synced: 5 minutes ago             │
│                                         │
│  Permissions:                           │
│  • View email address                   │
│  • Read and send emails                 │
│  • View calendar events                 │
│                                         │
│  [Manage Permissions]                   │
│  [Disconnect Account]                   │
└─────────────────────────────────────────┘
```

### Account Switching UX Patterns

#### 1. **Seamless Switching (No Re-auth)**

**Pattern**: Switch between already-connected accounts instantly

```typescript
async function switchAccount(accountId: string): Promise<void> {
  // Update active account
  setActiveAccount(accountId);

  // Load account-specific data
  await loadAccountData(accountId);

  // Update UI
  updateUI();

  // Show confirmation
  showToast({
    type: "success",
    message: `Switched to ${getAccountEmail(accountId)}`,
  });
}
```

**UX**:

```
┌─────────────────────────────────────────┐
│  ✓ Switched to john@company.com         │
└─────────────────────────────────────────┘
```

#### 2. **Switching with Re-authentication**

**Pattern**: Require re-auth for security-sensitive operations

```
┌─────────────────────────────────────────┐
│  Switch to Work Account?                │
│                                         │
│  john@company.com                       │
│                                         │
│  For security, please verify your       │
│  identity.                              │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Verify with Google         │       │
│  └─────────────────────────────┘       │
│                                         │
│  [Cancel]                               │
└─────────────────────────────────────────┘
```

#### 3. **Expired Session Handling**

**Pattern**: Handle expired sessions gracefully during switch

```
┌─────────────────────────────────────────┐
│  Session Expired                        │
│                                         │
│  Your session for john@company.com      │
│  has expired.                           │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Sign In Again              │       │
│  └─────────────────────────────┘       │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Use Different Account      │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Multi-Tenant Account Patterns

**Scenario**: User belongs to multiple organizations

```
┌─────────────────────────────────────────┐
│  Select Organization                    │
│                                         │
│  john.doe@gmail.com                     │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 🏢 Acme Corp                    │   │
│  │    Admin • 50 members           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 🏢 Freelance Projects           │   │
│  │    Owner • 5 members            │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 🏢 Side Business                │   │
│  │    Member • 3 members           │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Account Conflict Resolution

**Pattern**: Handle conflicts when adding duplicate accounts

```
┌─────────────────────────────────────────┐
│  Account Already Connected              │
│                                         │
│  john.doe@gmail.com is already          │
│  connected to your account.             │
│                                         │
│  What would you like to do?             │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Switch to This Account     │       │
│  └─────────────────────────────┘       │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Reconnect (Update Tokens)  │       │
│  └─────────────────────────────┘       │
│                                         │
│  [Cancel]                               │
└─────────────────────────────────────────┘
```

### GitHub Account Picker Example

Based on GitHub's implementation:

```
┌─────────────────────────────────────────┐
│  Choose an account                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 johndoe                      │   │
│  │    john.doe@gmail.com           │   │
│  │    ✓ Signed in                  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 johndoe-work                 │   │
│  │    john@company.com             │   │
│  │    ⚠️ Session expired           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ ➕ Sign in to another account   │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Features**:

- Shows all signed-in accounts
- Indicates session status (active/expired)
- Allows adding new accounts
- Grayed out expired sessions
- Prompts re-auth when selecting expired account

---

## GDPR Consent Requirements

### Legal Requirements for OAuth Consent

#### 1. **Freely Given Consent**

- Users must have genuine choice to refuse
- Cannot make service conditional on unnecessary data access
- Must allow separate consent for different processing purposes
- Users can withdraw consent anytime without detriment

#### 2. **Specific Consent**

- Clearly distinguish between different data processing activities
- Allow granular consent for each scope/permission
- No blanket consent for all permissions

#### 3. **Informed Consent**

- Clearly state who is collecting data (controller identity)
- Explain exact data processing activities
- State purpose of processing
- Inform about right to withdraw consent
- Use clear, plain language (no jargon)

#### 4. **Unambiguous Consent**

- Require clear affirmative action (opt-in)
- No pre-ticked boxes
- No silence or inactivity as consent
- Active consent required

### GDPR-Compliant Consent Screen

```
┌─────────────────────────────────────────┐
│  Data Access Request                    │
│                                         │
│  YourApp (Acme Corp) wants to access    │
│  your Google account data.              │
│                                         │
│  We will access:                        │
│  [ ] Email address (Required)           │
│      To identify your account           │
│                                         │
│  [ ] Read emails (Optional)             │
│      To sync your inbox                 │
│                                         │
│  [ ] Calendar events (Optional)         │
│      To show upcoming meetings          │
│                                         │
│  Your Rights:                           │
│  • You can withdraw consent anytime     │
│  • You can request data deletion        │
│  • You can access your data             │
│                                         │
│  [Privacy Policy] [Terms of Service]    │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Decline    │  │  Accept     │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### Required Information Display

#### 1. **Controller Identity**

```
┌─────────────────────────────────────────┐
│  Data Controller Information            │
│                                         │
│  Company: Acme Corp                     │
│  Address: 123 Main St, City, Country    │
│  Email: privacy@acme.com                │
│  DPO: dpo@acme.com                      │
└─────────────────────────────────────────┘
```

#### 2. **Purpose of Processing**

```
┌─────────────────────────────────────────┐
│  How We Use Your Data                   │
│                                         │
│  Email Address:                         │
│  • Account identification               │
│  • Service notifications                │
│                                         │
│  Email Content:                         │
│  • Inbox synchronization                │
│  • Email search functionality           │
│  • Not used for marketing               │
│                                         │
│  Calendar Data:                         │
│  • Display upcoming events              │
│  • Meeting reminders                    │
│  • Schedule coordination                │
└─────────────────────────────────────────┘
```

#### 3. **Data Retention Policy**

```
┌─────────────────────────────────────────┐
│  Data Retention                         │
│                                         │
│  We retain your data:                   │
│  • While your account is active         │
│  • Up to 30 days after disconnection    │
│  • Longer if required by law            │
│                                         │
│  You can request deletion anytime by:   │
│  • Disconnecting your account           │
│  • Contacting privacy@acme.com          │
└─────────────────────────────────────────┘
```

#### 4. **Third-Party Data Sharing**

```
┌─────────────────────────────────────────┐
│  Data Sharing                           │
│                                         │
│  We share your data with:               │
│                                         │
│  ✓ Google (OAuth Provider)              │
│    For authentication purposes          │
│                                         │
│  ✓ AWS (Cloud Provider)                 │
│    For secure data storage              │
│                                         │
│  We do NOT:                             │
│  ✗ Sell your data to third parties      │
│  ✗ Use your data for advertising        │
│  ✗ Share with unauthorized parties      │
└─────────────────────────────────────────┘
```

### User Rights Implementation

#### 1. **Right to Access**

```
┌─────────────────────────────────────────┐
│  Your Data                              │
│                                         │
│  Download a copy of all data we have    │
│  about you.                             │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Download My Data           │       │
│  └─────────────────────────────┘       │
│                                         │
│  Format: JSON                           │
│  Includes: Profile, emails, calendar    │
│  Processing time: Up to 48 hours        │
└─────────────────────────────────────────┘
```

#### 2. **Right to Erasure (Right to be Forgotten)**

```
┌─────────────────────────────────────────┐
│  Delete My Data                         │
│                                         │
│  This will permanently delete:          │
│  • Your profile information             │
│  • All synced emails                    │
│  • All calendar events                  │
│  • All connection tokens                │
│                                         │
│  ⚠️ This action cannot be undone        │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Delete All │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

#### 3. **Right to Withdraw Consent**

```
┌─────────────────────────────────────────┐
│  Manage Consent                         │
│                                         │
│  Current Permissions:                   │
│  [✓] Email address                      │
│  [✓] Read emails                        │
│  [✓] Calendar events                    │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Update Permissions         │       │
│  └─────────────────────────────┘       │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Withdraw All Consent       │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

#### 4. **Right to Data Portability**

```
┌─────────────────────────────────────────┐
│  Export Your Data                       │
│                                         │
│  Export your data in a machine-readable │
│  format to transfer to another service. │
│                                         │
│  Format: [JSON ▼]                       │
│  • JSON                                 │
│  • CSV                                  │
│  • XML                                  │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Export Data                │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

### Privacy Policy Requirements

**Must Include**:

- Identity and contact details of controller
- Contact details of Data Protection Officer (if applicable)
- Purposes of processing
- Legal basis for processing (consent, contract, etc.)
- Recipients of data
- Data retention periods
- User rights (access, erasure, portability, etc.)
- Right to withdraw consent
- Right to lodge complaint with supervisory authority
- Whether data provision is statutory/contractual requirement
- Information about automated decision-making

**Example Privacy Policy Link**:

```
┌─────────────────────────────────────────┐
│  Before you continue...                 │
│                                         │
│  By connecting your account, you agree  │
│  to our data processing practices as    │
│  described in our Privacy Policy.       │
│                                         │
│  📄 [Read Privacy Policy]               │
│  📄 [Read Terms of Service]             │
│                                         │
│  Key Points:                            │
│  • We only access data you authorize    │
│  • You can revoke access anytime        │
│  • We don't sell your data              │
│  • Data is encrypted and secure         │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Decline    │  │  I Agree    │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### Consent Logging

**Best Practice**: Log all consent events for compliance

```typescript
interface ConsentLog {
  userId: string;
  timestamp: Date;
  action: "granted" | "withdrawn" | "updated";
  scopes: string[];
  ipAddress: string;
  userAgent: string;
  consentVersion: string; // Privacy policy version
}

async function logConsent(log: ConsentLog): Promise<void> {
  // Store in immutable audit log
  await auditLog.create(log);

  // Required for GDPR compliance
  // Must be able to prove consent was given
}
```

### Cookie Consent Integration

**Pattern**: Combine OAuth consent with cookie consent

```
┌─────────────────────────────────────────┐
│  🍪 Cookie & Data Consent               │
│                                         │
│  We use cookies and access your data    │
│  to provide our services.               │
│                                         │
│  Essential (Always Active)              │
│  • Authentication                       │
│  • Security                             │
│                                         │
│  Optional                               │
│  [✓] Analytics                          │
│      Improve our service                │
│                                         │
│  [✓] Personalization                    │
│      Customize your experience          │
│                                         │
│  [ ] Marketing                          │
│      Promotional communications         │
│                                         │
│  [Manage Preferences] [Accept All]      │
└─────────────────────────────────────────┘
```

---

## Real-World Examples

### Zapier OAuth Flow

**1. Provider Selection**

- Search-first interface with 5000+ apps
- Categorized by popularity and use case
- Shows "Premium" badge for paid integrations
- Clear provider logos and descriptions

**2. Connection Initiation**

```
┌─────────────────────────────────────────┐
│  Connect Google Sheets                  │
│                                         │
│  Zapier needs permission to access      │
│  your Google Sheets.                    │
│                                         │
│  This will allow Zapier to:             │
│  • View and manage your spreadsheets    │
│  • Create new spreadsheets              │
│  • Share spreadsheets                   │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Continue to Google         │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

**3. Success State**

- Shows connected account email
- Displays "Test" button to verify connection
- Allows immediate use in workflow creation
- Provides "Reconnect" option if needed

**4. Connection Management**

- Centralized "My Apps" page
- Shows all connected accounts
- Displays last sync time
- One-click reconnect/disconnect

### Notion OAuth Flow

**1. Integration Page**

```
┌─────────────────────────────────────────┐
│  Notion Integrations                    │
│                                         │
│  [Search integrations...]               │
│                                         │
│  Popular                                │
│  ┌──────┐ ┌──────┐ ┌──────┐            │
│  │Slack │ │Google│ │GitHub│            │
│  └──────┘ └──────┘ └──────┘            │
│                                         │
│  All Integrations                       │
│  • Asana                                │
│  • Figma                                │
│  • Jira                                 │
└─────────────────────────────────────────┘
```

**2. Authorization Flow**

- Opens in popup window
- Shows Notion workspace selector
- Displays clear permission list
- Allows page-level access control

**3. Page Selection**

```
┌─────────────────────────────────────────┐
│  Select pages to share with GitHub      │
│                                         │
│  [✓] Project Documentation              │
│  [✓] Meeting Notes                      │
│  [ ] Personal Journal                   │
│  [ ] Private Ideas                      │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Allow      │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

**4. Success Confirmation**

- Shows integration card in workspace
- Displays connected status
- Provides settings/disconnect options
- Shows which pages are shared

### IFTTT OAuth Flow

**1. Applet Creation**

```
┌─────────────────────────────────────────┐
│  If This Then That                      │
│                                         │
│  If [Gmail ▼] receives email            │
│  Then [Notion ▼] create page            │
│                                         │
│  ⚠️ Connect Gmail to continue           │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Connect Gmail              │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

**2. Service Connection**

- Contextual connection prompts
- Explains why connection is needed
- Shows example use cases
- Provides "Learn More" links

**3. Permission Explanation**

```
┌─────────────────────────────────────────┐
│  IFTTT needs access to Gmail            │
│                                         │
│  This allows IFTTT to:                  │
│  ✓ Monitor for new emails               │
│  ✓ Read email content                   │
│  ✓ Send emails on your behalf           │
│                                         │
│  IFTTT will only access emails when     │
│  triggered by your applets.             │
│                                         │
│  [Privacy Policy] [Learn More]          │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Continue                   │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

**4. Connection Status**

- Shows green checkmark for connected services
- Displays "Reconnect" for expired connections
- Allows testing connection
- Shows last successful trigger time

### Google OAuth Consent Screen

**1. Account Selection**

```
┌─────────────────────────────────────────┐
│  🔵 Sign in with Google                 │
│                                         │
│  Choose an account                      │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 john.doe@gmail.com           │   │
│  │    John Doe                     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 👤 john@company.com             │   │
│  │    John Doe                     │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Use another account             │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**2. Consent Screen**

```
┌─────────────────────────────────────────┐
│  [App Logo] YourApp wants to access     │
│  your Google Account                    │
│                                         │
│  john.doe@gmail.com                     │
│                                         │
│  This will allow YourApp to:            │
│                                         │
│  ✓ See your primary Google Account      │
│    email address                        │
│                                         │
│  ✓ See your personal info, including    │
│    any personal info you've made        │
│    publicly available                   │
│                                         │
│  Make sure you trust YourApp            │
│                                         │
│  You may be sharing sensitive info with │
│  this site or app. Learn about how      │
│  YourApp will handle your data by       │
│  reviewing its privacy policy.          │
│                                         │
│  [Privacy Policy]                       │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Allow      │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

**3. Advanced Permissions**

```
┌─────────────────────────────────────────┐
│  ⚠️ YourApp wants additional access     │
│                                         │
│  This app has not been verified by      │
│  Google yet.                            │
│                                         │
│  This will allow YourApp to:            │
│                                         │
│  ⚠️ Read, compose, send, and            │
│     permanently delete all your email   │
│     from Gmail                          │
│                                         │
│  Only continue if you understand why    │
│  YourApp needs access and you trust     │
│  the developer.                         │
│                                         │
│  [Show Advanced]                        │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Continue   │      │
│  └─────────────┘  └─────────────┘      │
└─────────────────────────────────────────┘
```

### GitHub OAuth Flow

**1. Authorization Request**

```
┌─────────────────────────────────────────┐
│  ⚫ Authorize YourApp                    │
│                                         │
│  YourApp by Acme Corp wants to access   │
│  your johndoe account                   │
│                                         │
│  This application will be able to:      │
│  • Read your public information         │
│  • Read and write repository data       │
│  • Read and write organization data     │
│                                         │
│  Authorizing will redirect to           │
│  https://yourapp.com/callback           │
│                                         │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  Cancel     │  │  Authorize  │      │
│  └─────────────┘  └─────────────┘      │
│                                         │
│  Not owned or operated by GitHub        │
└─────────────────────────────────────────┘
```

**2. Repository Access Selection**

```
┌─────────────────────────────────────────┐
│  Repository access                      │
│                                         │
│  ○ All repositories                     │
│    This applies to all current and      │
│    future repositories.                 │
│                                         │
│  ● Only select repositories             │
│    Select at least one repository.      │
│                                         │
│    [Select repositories ▼]              │
│    • johndoe/project-a                  │
│    • johndoe/project-b                  │
│                                         │
│  ┌─────────────────────────────┐       │
│  │  Authorize                  │       │
│  └─────────────────────────────┘       │
└─────────────────────────────────────────┘
```

**3. Authorized Applications Management**

```
┌─────────────────────────────────────────┐
│  Authorized OAuth Apps                  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ [Logo] YourApp                  │   │
│  │ Authorized Jan 15, 2026         │   │
│  │                                 │   │
│  │ Permissions:                    │   │
│  │ • repo - Full control           │   │
│  │ • user:email - Read access      │   │
│  │                                 │   │
│  │ [Revoke]                        │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## Summary & Best Practices

### Key Takeaways

1. **Transparency is Critical**
   - Always explain what data you're accessing and why
   - Use plain language, not technical jargon
   - Show clear permission lists

2. **User Control Matters**
   - Allow granular permission control
   - Provide easy disconnect/revoke options
   - Support multi-account scenarios

3. **Security First**
   - Use PKCE for mobile and SPA apps
   - Implement proper token storage
   - Show security indicators
   - Validate state parameters

4. **Graceful Error Handling**
   - Provide clear error messages
   - Offer actionable recovery steps
   - Don't blame the user
   - Log errors for debugging

5. **Mobile Optimization**
   - Use system browsers (AppAuth pattern)
   - Handle deep linking properly
   - Provide context before browser switch
   - Secure token storage

6. **GDPR Compliance**
   - Obtain explicit, informed consent
   - Allow granular permission control
   - Provide data access and deletion
   - Maintain consent logs

7. **Progressive Enhancement**
   - Request minimal scopes initially
   - Add permissions when needed
   - Explain context for new permissions
   - Allow feature degradation

### Implementation Checklist

- [ ] Provider selection UI implemented
- [ ] Clear consent screens with plain language
- [ ] Success/failure state handling
- [ ] Comprehensive error handling
- [ ] Token refresh mechanism
- [ ] Re-authentication flows
- [ ] Scope explanation and management
- [ ] Connection management (reconnect/revoke)
- [ ] Security indicators displayed
- [ ] Mobile OAuth flow (if applicable)
- [ ] Multi-account support (if applicable)
- [ ] GDPR compliance (consent, privacy policy, user rights)
- [ ] Audit logging for consent events
- [ ] Token secure storage
- [ ] PKCE implementation (for mobile/SPA)
- [ ] State parameter validation

### Testing Recommendations

1. **Happy Path Testing**
   - Successful connection flow
   - Token refresh
   - Account switching

2. **Error Scenarios**
   - User denies access
   - Network failures
   - Expired tokens
   - Invalid credentials
   - Rate limiting

3. **Security Testing**
   - CSRF protection (state parameter)
   - Token storage security
   - PKCE implementation
   - Redirect URI validation

4. **Mobile Testing**
   - Deep linking
   - Browser switching
   - Token storage
   - Biometric re-auth

5. **GDPR Compliance**
   - Consent logging
   - Data export
   - Data deletion
   - Consent withdrawal

---

## Additional Resources

### OAuth 2.0 Specifications

- [RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [RFC 7636 - PKCE](https://tools.ietf.org/html/rfc7636)
- [RFC 8252 - OAuth 2.0 for Native Apps](https://tools.ietf.org/html/rfc8252)

### Libraries & Tools

- **AppAuth**: iOS, Android, and JS OAuth libraries
- **Passport.js**: Node.js OAuth middleware
- **Angular OAuth2 OIDC**: Angular OAuth library
- **OAuth2 Client (Badgateway)**: TypeScript OAuth client

### Design Resources

- Google OAuth UX Guidelines
- GitHub OAuth Best Practices
- Auth0 UX Design Patterns
- IFTTT Integration Guidelines

### GDPR Resources

- [ICO GDPR Guidance](https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/)
- [GDPR Consent Requirements](https://gdpr.eu/gdpr-consent-requirements/)
- [Privacy and GDPR Using OAuth (Curity)](https://curity.io/resources/learn/privacy-and-gdpr/)

---

**Document Version**: 1.0  
**Last Updated**: January 26, 2026  
**Author**: OAuth UX Research Team
