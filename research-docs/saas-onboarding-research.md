# Multi-Tenant SaaS Onboarding Flows: Comprehensive Research Report

**Research Date:** January 26, 2026  
**Purpose:** Understanding best-in-class SaaS onboarding patterns for Nubabel implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [First-Time Setup Flows](#first-time-setup-flows)
3. [Progressive Onboarding](#progressive-onboarding)
4. [Account Verification](#account-verification)
5. [Integration Setup](#integration-setup)
6. [Onboarding Metrics](#onboarding-metrics)
7. [Implementation Recommendations](#implementation-recommendations)
8. [Code Examples & Patterns](#code-examples--patterns)
9. [References](#references)

---

## Executive Summary

### Key Findings

**Time to Value (TTV) Benchmarks (2026):**
- **Average TTV across SaaS:** 1 day, 12 hours, 23 minutes
- **Excellent TTV:** Under 15 minutes
- **Good TTV:** 15-60 minutes
- **Problematic TTV:** Over 24 hours
- **Impact:** Users who reach value in under 1 hour show 2-5x higher Day 7 retention

**Activation Metrics:**
- **Average Activation Rate:** 37.5%
- **Target Activation Rate:** 60%+ (excellent)
- **Onboarding Checklist Completion:** 19.2% average
- **Impact of Checklists:** Users who complete onboarding checklists are 3x more likely to become paying customers

**Gamification Impact:**
- Apps with gamification (badges, progress bars) see **50% higher completion rates**
- Progress bars alone improve completion rates by **22%**
- Onboarding checklists improve task completion by **67%**

---

## 1. First-Time Setup Flows

### 1.1 Linear's Onboarding Approach

**Flow Structure (25 steps):**
1. **Account Creation** - Email/OAuth signup
2. **Email Verification** - Immediate verification prompt
3. **Workspace Setup** - Organization name, subdomain selection
4. **Team Size Selection** - Helps personalize experience
5. **Role Selection** - Admin/Member assignment
6. **Tutorial Browsing** - Interactive product tour

**Key Principles:**
- **One input per step** - Reduces cognitive load
- **Seamless flow** - No friction between steps
- **Instant "Wow" effect** - Delightful UI details throughout
- **Educational & productive** - Users learn while setting up

**Source:** [Linear Onboarding Flow Analysis](https://mobbin.com/explore/flows/64ae582c-747c-4c77-8629-812abcbef186)

### 1.2 Notion's Team Setup Flow

**Workspace Architecture:**
```
Organization
├── Teamspaces (Department-level)
│   ├── General (Company-wide)
│   ├── Engineering
│   ├── Marketing
│   └── Sales
└── Pages & Databases
```

**Setup Steps:**
1. **Create Workspace** - Name, icon, description
2. **Set Allowed Email Domains** - Auto-join for company emails
3. **Create Teamspaces** - Organize by department/team
4. **Invite Members** - Email invites with role assignment
5. **Set Permissions** - Workspace Owner, Membership Admin, Member, Guest

**User Roles:**
- **Organization Owner** - Full control across all workspaces
- **Workspace Owner** - Manage workspace settings, billing, members
- **Membership Admin** - Invite/remove members, manage groups
- **Member** - Create/edit content, collaborate
- **Guest** - Limited access to specific pages

**Source:** [Notion Team Setup Guide](https://www.notion.com/help/guides/how-to-set-up-your-notion-workspace-for-your-team)

### 1.3 Organization Creation Pattern

**Common Flow Across Linear, Notion, Asana, Airtable:**

```typescript
interface OrganizationSetup {
  // Step 1: Basic Info
  organizationName: string;
  subdomain: string; // e.g., "acme" → acme.app.com
  
  // Step 2: Team Size (for personalization)
  teamSize: '1-10' | '11-50' | '51-200' | '201-500' | '500+';
  
  // Step 3: Use Case Selection
  useCases: string[]; // e.g., ['project-management', 'bug-tracking']
  
  // Step 4: Admin Setup
  adminUser: {
    name: string;
    email: string;
    role: 'owner' | 'admin';
  };
}
```

**Subdomain Setup Best Practices:**
- **Wildcard DNS:** Use `*.yourdomain.com` for dynamic tenant routing
- **Validation:** Check subdomain availability in real-time
- **Restrictions:** 3-63 characters, alphanumeric + hyphens only
- **Reserved Names:** Block 'www', 'api', 'admin', 'app', etc.

**Technical Implementation:**
```typescript
// Subdomain validation pattern
const SUBDOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = ['www', 'api', 'admin', 'app', 'mail', 'ftp'];

function validateSubdomain(subdomain: string): boolean {
  return (
    SUBDOMAIN_REGEX.test(subdomain) &&
    !RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase())
  );
}
```

**Source:** [Multi-tenant SaaS Architecture Guide](https://www.clickittech.com/software-development/multi-tenant-architecture/)

### 1.4 Team Invite Patterns

**Three Common Approaches:**

#### A. Email Invites (Most Common)
```typescript
interface TeamInvite {
  email: string;
  role: 'admin' | 'member' | 'viewer';
  teamspaces?: string[]; // Optional: specific team access
  message?: string; // Optional: personal message
}

// Invitation flow:
// 1. Admin enters email + role
// 2. System sends email with unique token
// 3. Recipient clicks link → redirected to signup/login
// 4. After auth, automatically added to organization
```

**Example from SigNoz:**
```typescript
// frontend/src/container/OnboardingV2Container/InviteTeamMembers/InviteTeamMembers.tsx
const handleInviteUsersSuccess = (): void => {
  logEvent('Org Onboarding: Invite Team Members Success', {
    teamMembers: teamMembersToInvite,
  });
  notifications.success({
    message: 'Invites sent successfully!',
  });
};
```

**Source:** [SigNoz Invite Implementation](https://github.com/SigNoz/signoz/blob/main/frontend/src/container/OnboardingV2Container/InviteTeamMembers/InviteTeamMembers.tsx)

#### B. Invite Links (Shareable)
```typescript
interface InviteLink {
  token: string; // Unique, time-limited token
  organizationId: string;
  defaultRole: 'member' | 'viewer';
  expiresAt: Date;
  maxUses?: number; // Optional: limit number of uses
}

// Example: https://app.example.com/invite/abc123xyz
```

**Benefits:**
- Easy to share (Slack, email, etc.)
- No need to collect emails upfront
- Can be revoked/regenerated

#### C. Domain-Based Auto-Join
```typescript
interface DomainSettings {
  allowedDomains: string[]; // e.g., ['acme.com', 'acme.io']
  autoJoinEnabled: boolean;
  defaultRole: 'member' | 'viewer';
}

// Example: Anyone with @acme.com email can auto-join as Member
```

**Used by:** Notion, Slack, Linear (Enterprise plans)

**Source:** [Notion Domain Settings](https://www.notion.com/help/guides/the-ultimate-quickstart-guide-to-notion-for-enterprise)

### 1.5 Role Selection & RBAC

**Standard Role Hierarchy:**

| Role | Permissions | Use Case |
|------|-------------|----------|
| **Owner** | Full access: billing, settings, user management, all features | Founder, CEO |
| **Admin** | Manage users, configure settings, access all features (no billing) | CTO, Team Lead |
| **Member** | Create/edit content, collaborate, limited settings | Engineers, Designers |
| **Viewer** | Read-only access, can comment | Stakeholders, Clients |

**Permission Granularity:**
```typescript
interface Permission {
  resource: string; // e.g., 'projects', 'billing', 'settings'
  actions: ('create' | 'read' | 'update' | 'delete')[];
}

// Example: Admin role
const adminPermissions: Permission[] = [
  { resource: 'projects', actions: ['create', 'read', 'update', 'delete'] },
  { resource: 'users', actions: ['create', 'read', 'update', 'delete'] },
  { resource: 'settings', actions: ['read', 'update'] },
  // No billing access
];
```

**Advanced: Organization-Scoped Roles**
- Users can have different roles in different organizations
- Example: Admin in "Acme Corp", Member in "Beta Testers"

**Source:** [RBAC for B2B SaaS Guide](https://www.propelauth.com/post/guide-to-rbac-for-b2b-saas)

---

## 2. Progressive Onboarding

### 2.1 Core Principles

**Progressive Disclosure Definition:**
> Gradually revealing information based on user need, preventing overwhelm by showing only essential details first and exposing advanced options as users engage deeper.

**Benefits:**
- Reduces cognitive overload
- Improves learnability
- Increases efficiency
- Minimizes errors
- Lowers learning curve

**Source:** [Progressive Disclosure in SaaS](https://lollypop.design/blog/2025/may/progressive-disclosure/)

### 2.2 Implementation Patterns

#### Pattern 1: Step-by-Step Wizards
```typescript
interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType;
  canSkip?: boolean;
  condition?: (context: any) => boolean; // Show step conditionally
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Acme',
    description: 'Let\'s get you set up in 3 minutes',
    component: WelcomeStep,
    canSkip: false,
  },
  {
    id: 'create-workspace',
    title: 'Create your workspace',
    description: 'Name your workspace and choose a subdomain',
    component: WorkspaceStep,
    canSkip: false,
  },
  {
    id: 'invite-team',
    title: 'Invite your team',
    description: 'Collaborate with your teammates',
    component: InviteStep,
    canSkip: true, // Can skip and do later
  },
];
```

**Source:** [Hatchet Onboarding Implementation](https://github.com/hatchet-dev/hatchet/blob/main/frontend/app/src/pages/onboarding/create-tenant/types.ts)

#### Pattern 2: Onboarding Checklists

**Visual Example:**
```
┌─────────────────────────────────────┐
│ Get Started with Acme        [3/5] │
├─────────────────────────────────────┤
│ ✓ Create your workspace             │
│ ✓ Invite team members               │
│ ✓ Create your first project         │
│ ○ Connect an integration            │
│ ○ Set up notifications              │
└─────────────────────────────────────┘
```

**Implementation:**
```typescript
interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action: {
    label: string;
    href: string;
  };
  reward?: {
    type: 'badge' | 'points' | 'unlock';
    value: string;
  };
}

const onboardingChecklist: ChecklistItem[] = [
  {
    id: 'create-workspace',
    title: 'Create your workspace',
    description: 'Set up your team\'s home base',
    completed: true,
    action: { label: 'Done', href: '#' },
  },
  {
    id: 'invite-team',
    title: 'Invite team members',
    description: 'Collaborate with your team',
    completed: false,
    action: { label: 'Invite', href: '/settings/team' },
    reward: { type: 'badge', value: 'Team Builder' },
  },
];
```

**Best Practices:**
- **3-7 items max** - Keep it manageable
- **Progress bar** - Visual completion indicator (increases completion by 22%)
- **Gamification** - Badges, celebrations on completion (50% higher completion)
- **Skippable** - Allow users to dismiss and return later
- **Persistent** - Show in sidebar/header until complete

**Source:** [Onboarding Checklist Best Practices](https://www.userflow.com/blog/the-ultimate-product-onboarding-checklist)

#### Pattern 3: Contextual Tooltips & Hints

**Types:**
1. **Feature Tooltips** - Explain UI elements on hover
2. **Hotspots** - Pulsing indicators for new features
3. **Inline Hints** - Contextual help text
4. **Modals** - For important announcements

**React Libraries (2026):**

| Library | Bundle Size | Features | Best For |
|---------|-------------|----------|----------|
| **React Joyride** | ~50KB | Custom components, TypeScript, step callbacks | Complex tours |
| **Reactour** | ~15KB | Lightweight, hooks-based, simple API | Simple tours |
| **Shepherd** | ~40KB | Multi-theme, modal focus, framework-agnostic | Mature products |
| **Driver.js** | ~5KB | Minimal, element highlighting | Lightweight needs |
| **OnboardJS** | ~30KB | Headless state machine, custom flows | Wizard flows |

**Example: React Joyride Implementation**
```typescript
import Joyride, { Step } from 'react-joyride';

const tourSteps: Step[] = [
  {
    target: '.create-project-btn',
    content: 'Click here to create your first project',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.sidebar-nav',
    content: 'Navigate between different sections here',
    placement: 'right',
  },
];

function App() {
  const [runTour, setRunTour] = useState(false);
  
  return (
    <>
      <Joyride
        steps={tourSteps}
        run={runTour}
        continuous
        showProgress
        showSkipButton
        styles={{
          options: {
            primaryColor: '#007bff',
          },
        }}
      />
      {/* Your app */}
    </>
  );
}
```

**Source:** [React Product Tour Libraries 2026](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared)

#### Pattern 4: Empty States

**Purpose:** Guide users when there's no data to display

**Anatomy of Good Empty State:**
```
┌─────────────────────────────────────┐
│         [Illustration/Icon]         │
│                                     │
│     No projects yet                 │
│                                     │
│  Create your first project to      │
│  start tracking your work           │
│                                     │
│  [+ Create Project]  [Import]      │
└─────────────────────────────────────┘
```

**Components:**
1. **Visual** - Icon or illustration (not just text)
2. **Heading** - Clear, empathetic message
3. **Description** - Explain what should be here
4. **Action** - Primary CTA to fill the space
5. **Secondary Action** - Alternative path (optional)

**Types of Empty States:**

| Type | Purpose | Example |
|------|---------|---------|
| **First-time use** | Onboard new users | "Welcome! Create your first workflow" |
| **User cleared** | Celebrate completion | "Inbox Zero! 🎉 You're all caught up" |
| **No results** | Guide next steps | "No results found. Try adjusting filters" |
| **Error state** | Explain & recover | "Connection lost. Retry or check settings" |

**Real-World Examples:**

**Linear (Feature Education):**
```
No issues yet
Create your first issue to start tracking work
[+ New Issue]
```

**GitHub (Celebration):**
```
✓ All caught up!
You have no notifications
```

**Airbnb (No Results):**
```
No exact matches
Try adjusting your filters or search area
[Adjust Filters]
```

**Source:** [Empty State UX Examples](https://www.eleken.co/blog-posts/empty-state-ux)

### 2.3 Progressive Disclosure Strategy

**Level 1: Beginner Mode (First 7 Days)**
- Show only 3-5 core features
- Hide advanced settings
- Use simple language
- Provide guided tours

**Level 2: Intermediate (Days 8-30)**
- Unlock secondary features via milestones
- Introduce keyboard shortcuts
- Show advanced filters
- Offer customization options

**Level 3: Power User (30+ Days)**
- Full feature access
- API documentation
- Automation tools
- Advanced integrations

**Example: Canva's Approach**
- **Beginners:** Simple templates, basic tools
- **Advanced:** Background removal, brand kits, animations (unlocked after usage)

**Source:** [SaaS Onboarding Best Practices 2026](https://clepher.com/saas-onboarding-best-practices/)

---

## 3. Account Verification

### 3.1 Email Verification Flow

**Standard Flow:**
```
1. User signs up → Email sent immediately
2. Email contains verification link with token
3. User clicks link → Token validated
4. Account activated → Redirect to app
```

**Implementation Pattern:**
```typescript
interface EmailVerificationToken {
  token: string; // Unique, cryptographically secure
  userId: string;
  email: string;
  expiresAt: Date; // Typically 24 hours
  type: 'EMAIL_VERIFICATION';
}

// Token generation
async function generateEmailVerificationToken(
  userId: string,
  email: string
): Promise<EmailVerificationToken> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
  
  return {
    token,
    userId,
    email,
    expiresAt,
    type: 'EMAIL_VERIFICATION',
  };
}

// Token validation
async function verifyEmailToken(token: string): Promise<void> {
  const appToken = await db.findToken({ token, type: 'EMAIL_VERIFICATION' });
  
  if (!appToken) {
    throw new Error('Invalid email verification token');
  }
  
  if (new Date() > appToken.expiresAt) {
    throw new Error('Email verification token expired');
  }
  
  // Mark user as verified
  await db.updateUser(appToken.userId, { emailVerified: true });
  
  // Delete used token
  await db.deleteToken(token);
}
```

**Source:** [Twenty CRM Email Verification](https://github.com/twentyhq/twenty/blob/main/packages/twenty-server/src/engine/core-modules/auth/token/services/email-verification-token.service.ts)

**Best Practices:**
- **Immediate send** - Send verification email within seconds of signup
- **Resend option** - Allow users to request new email
- **Clear CTA** - "Verify Email" button, not just a link
- **Expiration** - 24-48 hours is standard
- **One-time use** - Invalidate token after verification
- **Fallback** - Allow login even if unverified, but limit features

### 3.2 Phone Verification (Optional 2FA)

**When to Require:**
- Financial/payment features
- Sensitive data access
- Enterprise security requirements

**Flow:**
```
1. User enters phone number
2. SMS sent with 6-digit code
3. User enters code within 10 minutes
4. Phone verified → 2FA enabled (optional)
```

**Implementation:**
```typescript
interface PhoneVerification {
  phoneNumber: string;
  code: string; // 6-digit numeric
  expiresAt: Date; // 10 minutes
  attempts: number; // Max 3 attempts
}

// Using Twilio/AWS SNS
async function sendVerificationSMS(phoneNumber: string): Promise<void> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  await smsService.send({
    to: phoneNumber,
    message: `Your verification code is: ${code}. Valid for 10 minutes.`,
  });
  
  await db.saveVerificationCode({
    phoneNumber,
    code: await bcrypt.hash(code, 10),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0,
  });
}
```

**Best Practices:**
- **Optional during onboarding** - Don't block signup
- **Offer later** - "Set up 2FA" in settings
- **Backup codes** - Provide recovery codes
- **Multiple methods** - SMS + Authenticator app

### 3.3 Organization Domain Verification (SSO)

**Purpose:** Verify ownership of company domain for SSO setup

**Flow:**
```
1. Admin enters company domain (e.g., acme.com)
2. System provides verification options:
   a. DNS TXT record
   b. HTML file upload
   c. Meta tag
3. Admin completes verification
4. Domain verified → SSO enabled
```

**DNS Verification Example:**
```
Add this TXT record to acme.com:

Name: _nubabel-verification
Value: nubabel-site-verification=abc123xyz789
TTL: 3600
```

**Verification Check:**
```typescript
async function verifyDomain(domain: string, token: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`_nubabel-verification.${domain}`);
    const expectedValue = `nubabel-site-verification=${token}`;
    
    return records.some(record => 
      record.join('').includes(expectedValue)
    );
  } catch (error) {
    return false;
  }
}
```

**Source:** [Domain Verification Best Practices](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/domain-names)

---

## 4. Integration Setup

### 4.1 OAuth Connection Flows

**OAuth 2.0 Standard Flow:**
```
1. User clicks "Connect Notion"
2. Redirect to Notion authorization page
3. User grants permissions
4. Notion redirects back with auth code
5. Exchange code for access token
6. Store token → Integration active
```

**Implementation Example (Notion):**

```typescript
// Step 1: Generate authorization URL
function getNotionAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    owner: 'user',
  });
  
  return `https://api.notion.com/v1/oauth/authorize?${params}`;
}

// Step 2: Handle callback
async function handleNotionCallback(code: string): Promise<void> {
  const response = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(
        `${CLIENT_ID}:${CLIENT_SECRET}`
      ).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  
  const { access_token, workspace_id } = await response.json();
  
  // Store tokens securely
  await db.saveIntegration({
    provider: 'notion',
    accessToken: await encrypt(access_token),
    workspaceId: workspace_id,
  });
}
```

**Source:** [Notion OAuth Integration Guide](https://developers.notion.com/docs/authorization)

**Common OAuth Providers:**

| Provider | Use Case | Scopes Needed |
|----------|----------|---------------|
| **Notion** | Knowledge base sync | Read/write pages, databases |
| **Slack** | Notifications, commands | Chat:write, commands |
| **Linear** | Issue tracking sync | Read/write issues |
| **GitHub** | Code repository access | Repo, user |
| **Google** | Calendar, Drive, Gmail | Calendar.readonly, drive.file |

### 4.2 API Key Setup (Power Users)

**Flow:**
```
1. User navigates to Settings → API Keys
2. Click "Generate New Key"
3. Enter key name/description
4. System generates key → Show once
5. User copies key (can't view again)
6. Key stored hashed in database
```

**Implementation:**
```typescript
interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string; // First 8 chars for identification
  keyHash: string; // bcrypt hash of full key
  userId: string;
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
}

async function generateApiKey(userId: string, name: string): Promise<string> {
  // Generate secure random key
  const key = `nub_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = key.substring(0, 12); // "nub_abc12345"
  const keyHash = await bcrypt.hash(key, 10);
  
  await db.createApiKey({
    id: generateId(),
    name,
    keyPrefix,
    keyHash,
    userId,
    createdAt: new Date(),
  });
  
  // Return full key (only time it's shown)
  return key;
}

// Validate API key on requests
async function validateApiKey(key: string): Promise<User | null> {
  const keyPrefix = key.substring(0, 12);
  const apiKey = await db.findApiKey({ keyPrefix });
  
  if (!apiKey) return null;
  
  const isValid = await bcrypt.compare(key, apiKey.keyHash);
  if (!isValid) return null;
  
  // Update last used
  await db.updateApiKey(apiKey.id, { lastUsedAt: new Date() });
  
  return db.findUser(apiKey.userId);
}
```

**Best Practices:**
- **Prefix keys** - `nub_` for easy identification
- **Show once** - Never display full key again
- **Revocation** - Easy to delete/regenerate
- **Scopes** - Allow limiting permissions per key
- **Expiration** - Optional auto-expiry
- **Rate limiting** - Prevent abuse

### 4.3 Webhook Configuration

**Setup Flow:**
```
1. User enters webhook URL
2. Optional: Select events to subscribe to
3. System sends test payload
4. User confirms receipt → Webhook active
```

**Implementation:**
```typescript
interface Webhook {
  id: string;
  url: string;
  events: string[]; // e.g., ['project.created', 'task.updated']
  secret: string; // For signature verification
  active: boolean;
  createdAt: Date;
}

// Send webhook
async function sendWebhook(webhook: Webhook, event: string, data: any) {
  const payload = {
    event,
    data,
    timestamp: new Date().toISOString(),
  };
  
  // Generate signature
  const signature = crypto
    .createHmac('sha256', webhook.secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  try {
    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Log failure, implement retry logic
  }
}
```

**Best Practices:**
- **Signature verification** - HMAC signatures for security
- **Retry logic** - Exponential backoff on failures
- **Event filtering** - Let users choose specific events
- **Test endpoint** - Send test payload before activation
- **Logs** - Show delivery history and failures

---

## 5. Onboarding Metrics

### 5.1 Time to First Value (TTFV)

**Definition:** Time from signup to first meaningful outcome

**2026 Benchmarks:**
- **Average:** 1 day, 12 hours, 23 minutes
- **Excellent:** < 15 minutes
- **Good:** 15-60 minutes
- **Needs Improvement:** 1-24 hours
- **Problematic:** > 24 hours

**Impact:**
- Users reaching value in < 1 hour: **2-5x higher Day 7 retention**
- Faster TTFV correlates with higher satisfaction and lower churn

**How to Measure:**
```typescript
interface TTFVEvent {
  userId: string;
  signupAt: Date;
  firstValueAt: Date; // When user completed "aha moment" action
  ttfvMinutes: number;
}

// Define "first value" actions (varies by product)
const firstValueActions = [
  'project_created',
  'first_task_completed',
  'team_member_invited',
  'integration_connected',
];

// Calculate TTFV
function calculateTTFV(userId: string): number {
  const user = db.getUser(userId);
  const firstValueEvent = db.getFirstEvent(userId, firstValueActions);
  
  if (!firstValueEvent) return null;
  
  const ttfvMs = firstValueEvent.timestamp - user.signupAt;
  return Math.round(ttfvMs / 1000 / 60); // Convert to minutes
}
```

**Optimization Strategies:**
1. **Templates** - Pre-filled examples to skip empty state
2. **Quick wins** - Guide to easiest valuable action first
3. **Remove friction** - Minimize required fields
4. **Progressive profiling** - Collect data over time, not upfront

**Source:** [Time to Value Benchmarks 2026](https://onramp.us/blog/customer-onboarding-metrics)

### 5.2 Activation Rate

**Definition:** % of users who complete key activation milestone

**2026 Benchmarks:**
- **Average:** 37.5%
- **Good:** 50-60%
- **Excellent:** 60%+

**Defining Activation:**
Varies by product, but typically:
- **Project Management:** Created first project + added task
- **Communication:** Sent first message + invited team member
- **Analytics:** Connected data source + viewed first report

**Measurement:**
```typescript
interface ActivationCriteria {
  requiredActions: string[];
  timeWindow?: number; // Days (optional)
}

const activationCriteria: ActivationCriteria = {
  requiredActions: [
    'workspace_created',
    'first_project_created',
    'team_member_invited',
  ],
  timeWindow: 7, // Must complete within 7 days
};

function isUserActivated(userId: string): boolean {
  const user = db.getUser(userId);
  const userEvents = db.getUserEvents(userId);
  
  // Check if all required actions completed
  const completedActions = activationCriteria.requiredActions.filter(action =>
    userEvents.some(event => event.type === action)
  );
  
  if (completedActions.length !== activationCriteria.requiredActions.length) {
    return false;
  }
  
  // Check time window if specified
  if (activationCriteria.timeWindow) {
    const lastRequiredEvent = userEvents
      .filter(e => activationCriteria.requiredActions.includes(e.type))
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    
    const daysSinceSignup = 
      (lastRequiredEvent.timestamp - user.signupAt) / (1000 * 60 * 60 * 24);
    
    return daysSinceSignup <= activationCriteria.timeWindow;
  }
  
  return true;
}

// Calculate activation rate
function getActivationRate(): number {
  const totalUsers = db.countUsers({ signupAfter: thirtyDaysAgo });
  const activatedUsers = db.countUsers({ 
    signupAfter: thirtyDaysAgo,
    activated: true 
  });
  
  return (activatedUsers / totalUsers) * 100;
}
```

**Source:** [SaaS Product Metrics 2026](https://userpilot.com/saas-product-metrics/)

### 5.3 Onboarding Checklist Completion Rate

**Definition:** % of users who complete onboarding checklist

**2026 Benchmarks:**
- **Average:** 19.2%
- **With gamification:** 28.8% (+50%)
- **With progress bar:** 23.4% (+22%)

**Impact:**
- Users who complete checklist: **3x more likely to convert to paid**
- Checklists improve task completion by **67%**

**Tracking:**
```typescript
interface ChecklistProgress {
  userId: string;
  totalSteps: number;
  completedSteps: number;
  completionRate: number; // 0-100
  startedAt: Date;
  completedAt?: Date;
  timeToComplete?: number; // Minutes
}

function trackChecklistProgress(userId: string): ChecklistProgress {
  const checklist = getOnboardingChecklist();
  const userProgress = db.getUserChecklistProgress(userId);
  
  const completedSteps = checklist.filter(item => 
    userProgress.completedItems.includes(item.id)
  ).length;
  
  const completionRate = (completedSteps / checklist.length) * 100;
  
  return {
    userId,
    totalSteps: checklist.length,
    completedSteps,
    completionRate,
    startedAt: userProgress.startedAt,
    completedAt: completionRate === 100 ? new Date() : undefined,
  };
}
```

**Source:** [Onboarding Statistics 2026](https://userguiding.com/blog/user-onboarding-statistics)

### 5.4 Drop-off Analysis

**Common Drop-off Points:**

| Stage | Avg Drop-off | Common Causes |
|-------|--------------|---------------|
| **Email verification** | 20-30% | Email not received, forgot to verify |
| **Workspace setup** | 15-20% | Too many fields, unclear value |
| **Team invites** | 10-15% | Not ready to invite, solo user |
| **First action** | 25-35% | Unclear next steps, empty state |
| **Integration setup** | 30-40% | Too complex, not needed yet |

**Tracking:**
```typescript
interface FunnelStep {
  step: string;
  order: number;
  usersEntered: number;
  usersCompleted: number;
  dropoffRate: number;
  avgTimeSpent: number; // Seconds
}

function analyzeFunnel(startDate: Date, endDate: Date): FunnelStep[] {
  const steps = [
    'signup',
    'email_verification',
    'workspace_created',
    'first_project',
    'team_invited',
    'activated',
  ];
  
  return steps.map((step, index) => {
    const entered = db.countUsersReached(step, startDate, endDate);
    const completed = index < steps.length - 1 
      ? db.countUsersReached(steps[index + 1], startDate, endDate)
      : entered;
    
    return {
      step,
      order: index,
      usersEntered: entered,
      usersCompleted: completed,
      dropoffRate: ((entered - completed) / entered) * 100,
      avgTimeSpent: db.getAvgTimeOnStep(step, startDate, endDate),
    };
  });
}
```

**Optimization Strategies:**
1. **Email verification:** Auto-verify for OAuth signups, resend option
2. **Workspace setup:** Reduce required fields, add progress indicator
3. **Team invites:** Make skippable, add "Invite later" option
4. **First action:** Strong empty states, templates, guided tours
5. **Integrations:** Move to post-activation, show value first

---

## 6. Implementation Recommendations for Nubabel

### 6.1 Recommended Onboarding Flow

**Phase 1: Account Creation (< 2 minutes)**
```
Step 1: Sign Up
- Email + Password OR OAuth (Google, GitHub)
- No email verification required yet (verify later)

Step 2: Create Organization
- Organization name (required)
- Subdomain (auto-suggested, editable)
- Team size (optional, for personalization)

Step 3: Quick Profile
- Your name (required)
- Role/Job title (optional)
- Avatar (optional, can skip)

→ Redirect to dashboard
```

**Phase 2: First Value (< 5 minutes)**
```
Dashboard shows:
1. Welcome message with name
2. Onboarding checklist (5 items, 0/5 complete)
3. Empty state with "Create your first workflow" CTA
4. Contextual tooltip: "Start here 👆"

Checklist:
☐ Create your first workflow (PRIORITY)
☐ Invite a team member
☐ Connect an integration
☐ Set up notifications
☐ Explore templates
```

**Phase 3: Activation (< 15 minutes)**
```
User creates first workflow:
1. Template selection (show 3-5 popular templates)
2. Customize template (minimal edits)
3. Run workflow → See results
4. ✓ Checklist item complete → Celebration animation

Activation = Workflow created + Run successfully
```

**Phase 4: Expansion (Days 1-7)**
```
Progressive disclosure:
- Day 1: Team invites, basic integrations
- Day 3: Advanced workflow features
- Day 7: API access, webhooks, automation

Email drip campaign:
- Day 1: "Welcome! Here's how to get started"
- Day 3: "Invite your team to collaborate"
- Day 7: "Unlock advanced features"
```

### 6.2 Onboarding Checklist Design

**Visual Design:**
```
┌────────────────────────────────────────┐
│ 🚀 Get Started with Nubabel     [2/5] │
│ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░  40%  │
├────────────────────────────────────────┤
│ ✓ Create your organization             │
│ ✓ Create your first workflow           │
│ ○ Invite team members          [Invite]│
│ ○ Connect an integration    [Connect]  │
│ ○ Set up notifications      [Configure]│
└────────────────────────────────────────┘
```

**Implementation:**
```typescript
interface OnboardingChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  action: {
    label: string;
    onClick: () => void;
  };
  reward?: {
    type: 'badge' | 'points';
    value: string;
  };
}

const nubabelChecklist: OnboardingChecklistItem[] = [
  {
    id: 'create-org',
    title: 'Create your organization',
    description: 'Set up your workspace',
    completed: true,
    priority: 'high',
    action: { label: 'Done', onClick: () => {} },
  },
  {
    id: 'create-workflow',
    title: 'Create your first workflow',
    description: 'Build and run your first automation',
    completed: false,
    priority: 'high',
    action: { 
      label: 'Create', 
      onClick: () => router.push('/workflows/new') 
    },
    reward: { type: 'badge', value: 'Workflow Creator' },
  },
  {
    id: 'invite-team',
    title: 'Invite team members',
    description: 'Collaborate with your team',
    completed: false,
    priority: 'medium',
    action: { 
      label: 'Invite', 
      onClick: () => openInviteModal() 
    },
  },
  {
    id: 'connect-integration',
    title: 'Connect an integration',
    description: 'Link Notion, Slack, or other tools',
    completed: false,
    priority: 'medium',
    action: { 
      label: 'Connect', 
      onClick: () => router.push('/integrations') 
    },
  },
  {
    id: 'setup-notifications',
    title: 'Set up notifications',
    description: 'Get alerts for important events',
    completed: false,
    priority: 'low',
    action: { 
      label: 'Configure', 
      onClick: () => router.push('/settings/notifications') 
    },
  },
];
```

**Gamification Elements:**
- **Progress bar** - Visual completion indicator
- **Celebration animation** - Confetti on checklist completion
- **Badges** - "Workflow Creator", "Team Builder", "Integration Master"
- **Points** - Earn points for each completed item
- **Completion reward** - Unlock advanced feature or discount

### 6.3 Empty State Designs

**Workflows Page (No workflows yet):**
```tsx
<EmptyState
  icon={<WorkflowIcon />}
  title="No workflows yet"
  description="Create your first workflow to automate your work"
  primaryAction={{
    label: "Create Workflow",
    onClick: () => router.push('/workflows/new'),
  }}
  secondaryAction={{
    label: "Browse Templates",
    onClick: () => router.push('/templates'),
  }}
/>
```

**Team Page (No members yet):**
```tsx
<EmptyState
  icon={<UsersIcon />}
  title="No team members yet"
  description="Invite your team to collaborate on workflows"
  primaryAction={{
    label: "Invite Team Member",
    onClick: () => openInviteModal(),
  }}
  secondaryAction={{
    label: "Import from CSV",
    onClick: () => openImportModal(),
  }}
/>
```

**Integrations Page (No integrations):**
```tsx
<EmptyState
  icon={<PlugIcon />}
  title="No integrations connected"
  description="Connect Notion, Slack, Linear, and more"
  primaryAction={{
    label: "Browse Integrations",
    onClick: () => router.push('/integrations/browse'),
  }}
/>
```

### 6.4 Product Tour Implementation

**Recommended Library:** React Joyride (most customizable, TypeScript support)

**Tour Steps:**
```typescript
const nubabelTour: Step[] = [
  {
    target: 'body',
    content: (
      <div>
        <h2>Welcome to Nubabel! 👋</h2>
        <p>Let's take a quick tour to get you started.</p>
      </div>
    ),
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '.sidebar-workflows',
    content: 'This is where you'll find all your workflows',
    placement: 'right',
  },
  {
    target: '.create-workflow-btn',
    content: 'Click here to create your first workflow',
    placement: 'bottom',
  },
  {
    target: '.integrations-nav',
    content: 'Connect your favorite tools here',
    placement: 'right',
  },
  {
    target: '.team-settings',
    content: 'Invite your team to collaborate',
    placement: 'right',
  },
];

function OnboardingTour() {
  const [runTour, setRunTour] = useState(false);
  
  useEffect(() => {
    // Show tour for new users
    const hasSeenTour = localStorage.getItem('hasSeenTour');
    if (!hasSeenTour) {
      setRunTour(true);
    }
  }, []);
  
  const handleTourEnd = () => {
    localStorage.setItem('hasSeenTour', 'true');
    setRunTour(false);
  };
  
  return (
    <Joyride
      steps={nubabelTour}
      run={runTour}
      continuous
      showProgress
      showSkipButton
      callback={(data) => {
        if (data.status === 'finished' || data.status === 'skipped') {
          handleTourEnd();
        }
      }}
      styles={{
        options: {
          primaryColor: '#6366f1', // Nubabel brand color
          zIndex: 10000,
        },
      }}
    />
  );
}
```

### 6.5 Email Verification Strategy

**Approach: Delayed Verification**
- Allow users to use app immediately after signup
- Show persistent banner: "Please verify your email"
- Limit certain features until verified (e.g., team invites, integrations)
- Send verification email immediately
- Resend option available

**Implementation:**
```tsx
function EmailVerificationBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  
  if (user.emailVerified || dismissed) return null;
  
  return (
    <Banner variant="warning">
      <BannerIcon>⚠️</BannerIcon>
      <BannerContent>
        Please verify your email to unlock all features.
        <BannerAction onClick={resendVerificationEmail}>
          Resend Email
        </BannerAction>
      </BannerContent>
      <BannerClose onClick={() => setDismissed(true)} />
    </Banner>
  );
}
```

### 6.6 Team Invite Flow

**Recommended Approach: Hybrid (Email + Link)**

**Email Invites:**
```tsx
function InviteTeamMemberModal() {
  const [invites, setInvites] = useState<TeamInvite[]>([
    { email: '', role: 'member' }
  ]);
  
  const handleSendInvites = async () => {
    await api.inviteTeamMembers(invites);
    toast.success(`Invites sent to ${invites.length} people`);
  };
  
  return (
    <Modal title="Invite Team Members">
      {invites.map((invite, index) => (
        <InviteRow key={index}>
          <Input
            type="email"
            placeholder="colleague@example.com"
            value={invite.email}
            onChange={(e) => updateInvite(index, 'email', e.target.value)}
          />
          <Select
            value={invite.role}
            onChange={(e) => updateInvite(index, 'role', e.target.value)}
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </Select>
        </InviteRow>
      ))}
      <Button onClick={() => addInviteRow()}>+ Add Another</Button>
      <Button variant="primary" onClick={handleSendInvites}>
        Send Invites
      </Button>
    </Modal>
  );
}
```

**Invite Link:**
```tsx
function InviteLinkSection() {
  const { organization } = useOrganization();
  const [inviteLink, setInviteLink] = useState('');
  
  const generateInviteLink = async () => {
    const link = await api.generateInviteLink({
      organizationId: organization.id,
      defaultRole: 'member',
      expiresIn: 7 * 24 * 60 * 60, // 7 days
    });
    setInviteLink(link.url);
  };
  
  return (
    <Section>
      <SectionTitle>Invite Link</SectionTitle>
      <SectionDescription>
        Share this link with your team. Anyone with the link can join as a Member.
      </SectionDescription>
      {inviteLink ? (
        <CopyableLink value={inviteLink} />
      ) : (
        <Button onClick={generateInviteLink}>Generate Invite Link</Button>
      )}
    </Section>
  );
}
```

### 6.7 Integration Setup UX

**OAuth Flow:**
```tsx
function IntegrationCard({ integration }: { integration: Integration }) {
  const handleConnect = async () => {
    // Redirect to OAuth authorization
    const authUrl = await api.getOAuthUrl(integration.id);
    window.location.href = authUrl;
  };
  
  return (
    <Card>
      <CardIcon src={integration.icon} />
      <CardTitle>{integration.name}</CardTitle>
      <CardDescription>{integration.description}</CardDescription>
      {integration.connected ? (
        <Badge variant="success">Connected</Badge>
      ) : (
        <Button onClick={handleConnect}>Connect</Button>
      )}
    </Card>
  );
}

// OAuth callback handler
function OAuthCallback() {
  const { code, state } = useSearchParams();
  
  useEffect(() => {
    if (code) {
      api.completeOAuth({ code, state })
        .then(() => {
          toast.success('Integration connected!');
          router.push('/integrations');
        })
        .catch((error) => {
          toast.error('Failed to connect integration');
        });
    }
  }, [code]);
  
  return <LoadingSpinner />;
}
```

### 6.8 Metrics Dashboard

**Track These Metrics:**
```typescript
interface OnboardingMetrics {
  // Activation
  activationRate: number; // Target: 60%+
  avgTimeToActivation: number; // Target: < 15 min
  
  // Checklist
  checklistStartRate: number; // % who start checklist
  checklistCompletionRate: number; // Target: 25%+
  avgChecklistTime: number; // Minutes
  
  // Drop-offs
  signupToVerification: number; // % who verify email
  verificationToWorkspace: number; // % who create workspace
  workspaceToFirstAction: number; // % who take first action
  
  // Engagement
  day1Retention: number; // % who return day 1
  day7Retention: number; // % who return day 7
  day30Retention: number; // % who return day 30
}

// Dashboard component
function OnboardingMetricsDashboard() {
  const metrics = useOnboardingMetrics();
  
  return (
    <Grid>
      <MetricCard
        title="Activation Rate"
        value={`${metrics.activationRate}%`}
        target="60%"
        trend="+5% vs last week"
      />
      <MetricCard
        title="Avg Time to Activation"
        value={`${metrics.avgTimeToActivation} min`}
        target="< 15 min"
        trend="-3 min vs last week"
      />
      <MetricCard
        title="Checklist Completion"
        value={`${metrics.checklistCompletionRate}%`}
        target="25%"
        trend="+8% vs last week"
      />
      {/* More metrics... */}
    </Grid>
  );
}
```

---

## 7. Code Examples & Patterns

### 7.1 Onboarding State Management

**Using Zustand:**
```typescript
import create from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  currentStep: number;
  completedSteps: string[];
  checklistItems: ChecklistItem[];
  hasSeenTour: boolean;
  
  // Actions
  completeStep: (stepId: string) => void;
  nextStep: () => void;
  previousStep: () => void;
  completeChecklistItem: (itemId: string) => void;
  dismissTour: () => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set, get) => ({
      currentStep: 0,
      completedSteps: [],
      checklistItems: initialChecklist,
      hasSeenTour: false,
      
      completeStep: (stepId) => set((state) => ({
        completedSteps: [...state.completedSteps, stepId],
      })),
      
      nextStep: () => set((state) => ({
        currentStep: state.currentStep + 1,
      })),
      
      previousStep: () => set((state) => ({
        currentStep: Math.max(0, state.currentStep - 1),
      })),
      
      completeChecklistItem: (itemId) => set((state) => ({
        checklistItems: state.checklistItems.map(item =>
          item.id === itemId ? { ...item, completed: true } : item
        ),
      })),
      
      dismissTour: () => set({ hasSeenTour: true }),
      
      reset: () => set({
        currentStep: 0,
        completedSteps: [],
        checklistItems: initialChecklist,
        hasSeenTour: false,
      }),
    }),
    {
      name: 'onboarding-storage',
    }
  )
);
```

### 7.2 Onboarding Wizard Component

```tsx
interface OnboardingWizardProps {
  steps: OnboardingStep[];
  onComplete: () => void;
}

function OnboardingWizard({ steps, onComplete }: OnboardingWizardProps) {
  const { currentStep, nextStep, previousStep } = useOnboarding();
  const [formData, setFormData] = useState({});
  
  const CurrentStepComponent = steps[currentStep].component;
  const isLastStep = currentStep === steps.length - 1;
  
  const handleNext = async () => {
    // Validate current step
    const isValid = await steps[currentStep].validate?.(formData);
    if (!isValid) return;
    
    if (isLastStep) {
      await onComplete();
    } else {
      nextStep();
    }
  };
  
  return (
    <WizardContainer>
      <WizardHeader>
        <ProgressBar 
          current={currentStep + 1} 
          total={steps.length} 
        />
        <StepIndicator>
          Step {currentStep + 1} of {steps.length}
        </StepIndicator>
      </WizardHeader>
      
      <WizardContent>
        <StepTitle>{steps[currentStep].title}</StepTitle>
        <StepDescription>{steps[currentStep].description}</StepDescription>
        
        <CurrentStepComponent
          value={formData}
          onChange={setFormData}
        />
      </WizardContent>
      
      <WizardFooter>
        <Button
          variant="ghost"
          onClick={previousStep}
          disabled={currentStep === 0}
        >
          Back
        </Button>
        
        {steps[currentStep].canSkip && (
          <Button variant="ghost" onClick={nextStep}>
            Skip
          </Button>
        )}
        
        <Button variant="primary" onClick={handleNext}>
          {isLastStep ? 'Complete' : 'Next'}
        </Button>
      </WizardFooter>
    </WizardContainer>
  );
}
```

### 7.3 Onboarding Checklist Component

```tsx
interface ChecklistProps {
  items: ChecklistItem[];
  onItemComplete: (itemId: string) => void;
}

function OnboardingChecklist({ items, onItemComplete }: ChecklistProps) {
  const completedCount = items.filter(item => item.completed).length;
  const progress = (completedCount / items.length) * 100;
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <ChecklistContainer>
      <ChecklistHeader onClick={() => setIsExpanded(!isExpanded)}>
        <ChecklistTitle>
          🚀 Get Started with Nubabel
        </ChecklistTitle>
        <ChecklistProgress>
          {completedCount}/{items.length}
        </ChecklistProgress>
        <ChevronIcon expanded={isExpanded} />
      </ChecklistHeader>
      
      <ProgressBar value={progress} />
      
      {isExpanded && (
        <ChecklistItems>
          {items.map(item => (
            <ChecklistItem
              key={item.id}
              completed={item.completed}
            >
              <Checkbox
                checked={item.completed}
                onChange={() => onItemComplete(item.id)}
              />
              
              <ItemContent>
                <ItemTitle>{item.title}</ItemTitle>
                <ItemDescription>{item.description}</ItemDescription>
              </ItemContent>
              
              {!item.completed && (
                <ItemAction onClick={item.action.onClick}>
                  {item.action.label}
                </ItemAction>
              )}
              
              {item.completed && item.reward && (
                <Badge variant="success">
                  {item.reward.value}
                </Badge>
              )}
            </ChecklistItem>
          ))}
        </ChecklistItems>
      )}
      
      {completedCount === items.length && (
        <CompletionCelebration>
          <Confetti />
          <CelebrationMessage>
            🎉 Congratulations! You've completed onboarding!
          </CelebrationMessage>
        </CompletionCelebration>
      )}
    </ChecklistContainer>
  );
}
```

### 7.4 Empty State Component

```tsx
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <EmptyStateContainer>
      <EmptyStateIcon>{icon}</EmptyStateIcon>
      <EmptyStateTitle>{title}</EmptyStateTitle>
      <EmptyStateDescription>{description}</EmptyStateDescription>
      
      <EmptyStateActions>
        {primaryAction && (
          <Button
            variant="primary"
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        )}
        
        {secondaryAction && (
          <Button
            variant="outline"
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </Button>
        )}
      </EmptyStateActions>
    </EmptyStateContainer>
  );
}
```

---

## 8. References

### Research Sources

**Linear:**
- [Linear Onboarding Flow (Mobbin)](https://mobbin.com/explore/flows/64ae582c-747c-4c77-8629-812abcbef186)
- [Linear Start Guide](https://linear.app/docs/tutorials)
- [How Linear Welcomes New Users](https://medium.com/@fmerian/delightful-onboarding-experience-the-linear-ftux-cf56f3bc318c)

**Notion:**
- [Notion Team Setup Guide](https://www.notion.com/help/guides/how-to-set-up-your-notion-workspace-for-your-team)
- [5 Steps to Adopt Notion](https://www.notion.com/help/guides/5-steps-to-adopt-notion-for-your-entire-organization)
- [Notion Enterprise Quickstart](https://www.notion.com/help/guides/the-ultimate-quickstart-guide-to-notion-for-enterprise)
- [Notion OAuth Authorization](https://developers.notion.com/docs/authorization)

**Asana:**
- [Get Started with Asana](https://academy.asana.com/get-started-with-asana)

**Airtable:**
- [Airtable Quick Start](https://www.airtable.com/guides/start/how-to-create-a-base)
- [Prep Your Base for Onboarding](https://www.airtable.com/guides/collaborate/prepare-your-base-for-onboarding)
- [Invite Your Collaborators](https://www.airtable.com/guides/collaborate/invite-your-collaborators)

**Best Practices & Patterns:**
- [SaaS Onboarding UX Best Practices 2026](https://www.designstudiouiux.com/blog/saas-onboarding-ux/)
- [Progressive Disclosure in SaaS](https://lollypop.design/blog/2025/may/progressive-disclosure/)
- [7 Essential SaaS Onboarding Best Practices](https://docsbot.ai/article/saas-onboarding-best-practices)
- [9 SaaS Onboarding Best Practices](https://clepher.com/saas-onboarding-best-practices/)
- [Empty State UX Examples](https://www.eleken.co/blog-posts/empty-state-ux)
- [SaaS Empty State Examples](https://www.saasframe.io/patterns/empty-state)

**Multi-Tenancy:**
- [Multi-Tenant SaaS Architecture on AWS](https://www.clickittech.com/software-development/multi-tenant-architecture/)
- [Domain Name Considerations](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/domain-names)
- [Multi-Tenancy in B2B SaaS](https://auth0.com/blog/demystifying-multi-tenancy-in-b2b-saas/)

**RBAC:**
- [Guide to RBAC for B2B SaaS](https://www.propelauth.com/post/guide-to-rbac-for-b2b-saas)
- [Auth0 RBAC Documentation](https://auth0.com/docs/manage-users/access-control/rbac)
- [WorkOS RBAC](https://workos.com/docs/rbac)

**Metrics:**
- [Customer Onboarding Metrics 2026](https://onramp.us/blog/customer-onboarding-metrics)
- [Onboarding & Time-to-Value Guide](https://resources.rework.com/libraries/saas-growth/onboarding-time-to-value)
- [Time-to-Value Benchmark Report](https://userpilot.com/blog/time-to-value-benchmark-report-2024/)
- [SaaS Product Metrics](https://userpilot.com/saas-product-metrics/)
- [100+ User Onboarding Statistics](https://userguiding.com/blog/user-onboarding-statistics)

**React Libraries:**
- [5 Best React Onboarding Libraries 2026](https://onboardjs.com/blog/5-best-react-onboarding-libraries-in-2025-compared)
- [React Joyride Documentation](https://docs.react-joyride.com/)
- [Reactour Documentation](https://docs.reactour.dev/)
- [React Product Tour Libraries](https://whatfix.com/blog/react-onboarding-tour/)

**Gamification:**
- [UX Gamification for SaaS](https://userpilot.com/blog/gamification-ux/)
- [Onboarding Gamification Strategies](https://www.appcues.com/blog/onboarding-gamification-strategies)
- [Gamification Strategies for SaaS](https://userpilot.com/blog/gamification-strategies-a-guide-to-getting-gamification-right-for-saas-products/)

**Code Examples:**
- [Hatchet Onboarding Types](https://github.com/hatchet-dev/hatchet/blob/main/frontend/app/src/pages/onboarding/create-tenant/types.ts)
- [SigNoz Invite Team Members](https://github.com/SigNoz/signoz/blob/main/frontend/src/container/OnboardingV2Container/InviteTeamMembers/InviteTeamMembers.tsx)
- [Twenty Email Verification](https://github.com/twentyhq/twenty/blob/main/packages/twenty-server/src/engine/core-modules/auth/token/services/email-verification-token.service.ts)
- [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)

---

## Appendix: Quick Reference

### Onboarding Flow Checklist

**Pre-Launch:**
- [ ] Define activation criteria (what = "activated user"?)
- [ ] Design onboarding wizard (3-5 steps max)
- [ ] Create onboarding checklist (5-7 items)
- [ ] Build empty states for all major pages
- [ ] Set up email verification flow
- [ ] Implement team invite system
- [ ] Configure OAuth for integrations
- [ ] Set up analytics tracking

**Launch:**
- [ ] Monitor activation rate (target: 60%+)
- [ ] Track time to first value (target: < 15 min)
- [ ] Measure checklist completion (target: 25%+)
- [ ] Analyze drop-off points
- [ ] A/B test onboarding variations

**Post-Launch:**
- [ ] Iterate based on metrics
- [ ] Add progressive disclosure
- [ ] Implement gamification
- [ ] Create drip email campaign
- [ ] Build in-app help center

### Key Metrics to Track

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Activation Rate** | 60%+ | % users completing key action |
| **Time to First Value** | < 15 min | Signup → first value event |
| **Checklist Completion** | 25%+ | % users completing checklist |
| **Day 7 Retention** | 40%+ | % users returning after 7 days |
| **Email Verification** | 80%+ | % users verifying email |
| **Team Invite Rate** | 30%+ | % users inviting team members |

### Common Pitfalls to Avoid

1. **Too many steps** - Keep onboarding under 5 steps
2. **Requiring email verification** - Allow usage first, verify later
3. **No empty states** - Always guide users when there's no data
4. **Overwhelming with features** - Use progressive disclosure
5. **No progress indicators** - Always show completion progress
6. **Skipping gamification** - Add celebrations and rewards
7. **No analytics** - Track everything from day one
8. **Forcing team invites** - Make it optional/skippable
9. **Complex integrations upfront** - Move to post-activation
10. **No onboarding checklist** - Checklists increase conversion 3x

---

**End of Report**

*Generated: January 26, 2026*  
*For: Nubabel Multi-Tenant SaaS Platform*
