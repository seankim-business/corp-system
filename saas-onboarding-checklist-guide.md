# SaaS Onboarding Checklist UI/UX Patterns Guide

## Executive Summary

This comprehensive guide analyzes onboarding checklist patterns for multi-tenant SaaS applications, focusing on guiding users to first value quickly while balancing helpfulness with user autonomy. Based on research from industry leaders like Notion, Linear, and Stripe, this document provides actionable patterns for implementation.

---

## Table of Contents

1. [Checklist Placement Patterns](#checklist-placement-patterns)
2. [Progress Visualization](#progress-visualization)
3. [Skippable vs Mandatory Steps](#skippable-vs-mandatory-steps)
4. [Gamification Elements](#gamification-elements)
5. [Completion Rewards & Celebrations](#completion-rewards--celebrations)
6. [Dismissal & Minimization Patterns](#dismissal--minimization-patterns)
7. [Step Ordering Strategies](#step-ordering-strategies)
8. [Personalized Checklist Examples](#personalized-checklist-examples)
9. [Team vs Individual Checklists](#team-vs-individual-checklists)
10. [Returning User Experience](#returning-user-experience)
11. [Mobile Checklist UX](#mobile-checklist-ux)
12. [Activation Metrics](#activation-metrics)
13. [Real-World Examples](#real-world-examples)
14. [Implementation Guidelines](#implementation-guidelines)

---

## Checklist Placement Patterns

### 1. **Sidebar Placement** (Most Common)

**Best for:** Persistent guidance without blocking main workflow

**Characteristics:**

- Fixed position on left or right side
- Collapsible/expandable
- Remains visible across navigation
- Non-intrusive to main content

**When to use:**

- Complex products with multiple setup steps
- When users need to reference checklist across different pages
- Desktop-first applications

**Example Pattern:**

```
┌─────────────────────────────────────┐
│  Logo    Navigation                 │
├──────┬──────────────────────────────┤
│      │                              │
│ ✓ 1  │   Main Content Area          │
│ → 2  │                              │
│   3  │                              │
│   4  │                              │
│      │                              │
│ 50%  │                              │
└──────┴──────────────────────────────┘
```

**Pros:**

- Always accessible
- Doesn't interrupt workflow
- Clear progress tracking

**Cons:**

- Takes up screen real estate
- May be ignored on smaller screens
- Can feel overwhelming if too many steps

---

### 2. **Modal/Overlay Placement**

**Best for:** Critical setup steps that must be completed

**Characteristics:**

- Centers on screen
- Blocks background content
- Forces user attention
- Often used for initial setup

**When to use:**

- Essential configuration required before product use
- Security/compliance requirements
- Payment/billing setup

**Example Pattern:**

```
     ┌─────────────────────┐
     │  Welcome! Let's get │
     │  you started        │
     │                     │
     │  ☐ Step 1          │
     │  ☐ Step 2          │
     │  ☐ Step 3          │
     │                     │
     │  [Continue] [Skip]  │
     └─────────────────────┘
```

**Pros:**

- High visibility
- Ensures critical steps are seen
- Good for linear flows

**Cons:**

- Interrupts user exploration
- Can feel restrictive
- May increase abandonment if too aggressive

---

### 3. **Banner Placement** (Top/Bottom)

**Best for:** Lightweight reminders and non-critical tasks

**Characteristics:**

- Horizontal bar at top or bottom
- Minimal vertical space
- Easy to dismiss
- Less intrusive than modals

**When to use:**

- Optional optimization steps
- Feature discovery
- Profile completion prompts

**Example Pattern:**

```
┌─────────────────────────────────────┐
│ 🎯 Complete your profile (3/5) →   │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│                                     │
│   Main Content                      │
│                                     │
└─────────────────────────────────────┘
```

**Pros:**

- Minimal disruption
- Easy to implement
- Mobile-friendly

**Cons:**

- Easy to ignore
- Limited space for information
- May be hidden by banner blindness

---

### 4. **Embedded/Inline Placement**

**Best for:** Contextual guidance within specific pages

**Characteristics:**

- Integrated into page content
- Appears where action is needed
- Context-specific steps
- Feels native to the interface

**When to use:**

- Feature-specific onboarding
- Progressive disclosure
- Contextual help

**Example Pattern:**

```
┌─────────────────────────────────────┐
│  Dashboard                          │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐ │
│  │ Getting Started (2/4)         │ │
│  │ ☑ Create account              │ │
│  │ → Add your first project      │ │
│  │ ☐ Invite team members         │ │
│  │ ☐ Connect integrations        │ │
│  └───────────────────────────────┘ │
│                                     │
│  Your Projects                      │
│  [+ New Project]                    │
└─────────────────────────────────────┘
```

**Pros:**

- Highly contextual
- Feels integrated
- Guides users at point of action

**Cons:**

- May be missed if user navigates away
- Requires careful placement
- Can clutter interface

---

### 5. **Floating Widget/Beacon**

**Best for:** Persistent but unobtrusive access

**Characteristics:**

- Small circular or rectangular widget
- Fixed position (usually bottom-right)
- Expandable on click
- Shows progress indicator

**When to use:**

- Long-term onboarding (days/weeks)
- When sidebar space is limited
- Mobile-responsive designs

**Example Pattern:**

```
┌─────────────────────────────────────┐
│                                     │
│   Main Content                      │
│                                     │
│                              ┌────┐ │
│                              │ 3/5│ │
│                              │ ✓  │ │
│                              └────┘ │
└─────────────────────────────────────┘
```

**Pros:**

- Minimal footprint
- Always accessible
- Modern, clean aesthetic

**Cons:**

- May be overlooked
- Limited information display when collapsed
- Can conflict with chat widgets

---

## Progress Visualization

### Core Principles

1. **Show progress immediately** - Even 0% is better than no indicator
2. **Credit early actions** - Showing 25% after first step increases completion by 21%
3. **Use multiple indicators** - Combine percentage, fraction, and visual bars
4. **Animate transitions** - Smooth progress updates feel rewarding

### Progress Indicator Types

#### 1. **Linear Progress Bar**

```
Getting Started
[████████░░░░░░░░] 50% Complete (3/6)
```

**Implementation:**

```jsx
<div className="progress-container">
  <div className="progress-bar" style={{ width: `${percentage}%` }}>
    <span>{percentage}% Complete</span>
  </div>
  <span className="progress-fraction">
    {completed}/{total}
  </span>
</div>
```

**Best practices:**

- Minimum height: 8-12px for visibility
- Use smooth transitions (0.3-0.5s ease-in-out)
- Show both percentage and fraction (e.g., "50% (3/6)")
- Consider gradient fills for visual interest

---

#### 2. **Circular/Radial Progress**

```
    ┌─────┐
    │ 75% │
    │ ◔   │
    └─────┘
```

**When to use:**

- Compact spaces
- Dashboard widgets
- Mobile interfaces

**Implementation:**

```jsx
<svg viewBox="0 0 36 36" className="circular-progress">
  <path
    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
    fill="none"
    stroke="#eee"
    strokeWidth="3"
  />
  <path
    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
    fill="none"
    stroke="#4CAF50"
    strokeWidth="3"
    strokeDasharray={`${percentage}, 100`}
  />
  <text x="18" y="20.35" className="percentage">
    {percentage}%
  </text>
</svg>
```

---

#### 3. **Step Indicators (Stepper UI)**

```
1 ──●── 2 ──●── 3 ──○── 4 ──○── 5
✓       ✓       →
```

**Characteristics:**

- Shows current position in sequence
- Indicates completed, current, and upcoming steps
- Often includes step labels

**Best practices:**

- Use checkmarks for completed steps
- Highlight current step with color/animation
- Show step numbers and titles
- Consider horizontal scrolling on mobile

**Example:**

```jsx
const StepIndicator = ({ steps, currentStep }) => (
  <div className="stepper">
    {steps.map((step, index) => (
      <div
        key={index}
        className={`step ${
          index < currentStep ? "completed" : index === currentStep ? "active" : "pending"
        }`}
      >
        <div className="step-icon">{index < currentStep ? "✓" : index + 1}</div>
        <div className="step-label">{step.title}</div>
        {index < steps.length - 1 && <div className="step-connector" />}
      </div>
    ))}
  </div>
);
```

---

#### 4. **Checklist with Visual Progress**

```
Getting Started                    [████░░] 67%

✓ Create your account
✓ Set up your profile
→ Add your first project
☐ Invite team members
☐ Connect integrations
☐ Complete first task
```

**Best practices:**

- Use distinct icons for states (✓ completed, → current, ☐ pending)
- Highlight current step
- Show overall progress at top
- Animate checkmarks on completion

---

### Advanced Progress Patterns

#### **Multi-Phase Progress**

For complex onboarding with distinct phases:

```
Setup (Complete) → Configuration (2/3) → Launch (Not Started)

Configuration Phase:
[████████░░] 67%
✓ Connect database
✓ Configure API keys
→ Set up webhooks
```

#### **Weighted Progress**

Not all steps are equal - weight critical steps more heavily:

```javascript
const calculateWeightedProgress = (steps) => {
  const totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
  const completedWeight = steps
    .filter((step) => step.completed)
    .reduce((sum, step) => sum + step.weight, 0);
  return (completedWeight / totalWeight) * 100;
};

// Example:
const steps = [
  { id: 1, title: "Create account", weight: 10, completed: true },
  { id: 2, title: "Add payment", weight: 30, completed: true },
  { id: 3, title: "Invite team", weight: 20, completed: false },
  { id: 4, title: "First project", weight: 40, completed: false },
];
// Progress: (10 + 30) / 100 = 40%
```

---

## Skippable vs Mandatory Steps

### Decision Framework

```
Is this step required for core functionality?
│
├─ YES → Is it legally/security required?
│         │
│         ├─ YES → MANDATORY (cannot skip)
│         │        Examples: Terms acceptance, payment info (paid plans)
│         │
│         └─ NO → Can user complete it later?
│                  │
│                  ├─ YES → SKIPPABLE with reminder
│                  │        Examples: Profile photo, bio
│                  │
│                  └─ NO → MANDATORY (but allow "Remind me later")
│                           Examples: Email verification
│
└─ NO → SKIPPABLE
         Examples: Optional integrations, advanced features
```

---

### Mandatory Steps Pattern

**Characteristics:**

- No skip button
- Clear explanation of why it's required
- Minimal friction to complete
- Progress blocked until completion

**Example:**

```jsx
<Modal blocking={true}>
  <h2>Verify your email</h2>
  <p>We need to verify your email address to secure your account and enable notifications.</p>

  <EmailVerificationForm />

  {/* No skip button - must complete */}
  <p className="help-text">
    Didn't receive the email? <button>Resend</button>
  </p>
</Modal>
```

**Best practices:**

- Explain WHY it's mandatory
- Make completion as easy as possible
- Provide help/support options
- Show progress toward completion

---

### Skippable Steps Pattern

**Characteristics:**

- Clear "Skip" or "Do this later" option
- Optional reminder system
- No penalty for skipping
- Easy to return to later

**Example:**

```jsx
<ChecklistItem>
  <h3>Add a profile photo</h3>
  <p>Help your team recognize you</p>

  <div className="actions">
    <button className="primary">Upload Photo</button>
    <button className="secondary">Skip for now</button>
  </div>
</ChecklistItem>
```

**Skip button variations:**

- "Skip for now"
- "I'll do this later"
- "Remind me later"
- "Not now"
- "Maybe later"

**Best practices:**

- Make skip option visible but not primary
- Consider "Remind me in X days" option
- Track skip rate to identify friction
- Allow easy re-access to skipped steps

---

### Hybrid: "Soft Mandatory" Pattern

Steps that are technically optional but highly recommended:

```jsx
<ChecklistItem priority="high">
  <Badge color="orange">Recommended</Badge>
  <h3>Enable two-factor authentication</h3>
  <p>Protect your account from unauthorized access</p>

  <div className="actions">
    <button className="primary">Enable 2FA</button>
    <button className="tertiary" onClick={showWarning}>
      Skip (not recommended)
    </button>
  </div>
</ChecklistItem>

// On skip:
<ConfirmDialog>
  <h3>Are you sure?</h3>
  <p>Without 2FA, your account is more vulnerable to attacks. We strongly recommend enabling it.</p>
  <button className="primary">Go back and enable 2FA</button>
  <button className="secondary">Skip anyway</button>
</ConfirmDialog>
```

---

### Progressive Skipping Strategy

Allow skipping initially, but re-prompt based on usage:

```javascript
const skipStrategy = {
  // First time: Easy skip
  firstPrompt: {
    skipButton: "Skip for now",
    reminder: null,
  },

  // After 3 days: Gentle reminder
  secondPrompt: {
    skipButton: "Remind me later",
    reminder: "7 days",
  },

  // After 10 days: Stronger nudge
  thirdPrompt: {
    skipButton: "I understand the risks",
    reminder: "30 days",
    showBenefits: true,
  },
};
```

---

### Skip Analytics

Track and analyze skip behavior:

```javascript
const trackSkip = (stepId, reason) => {
  analytics.track("Onboarding Step Skipped", {
    step_id: stepId,
    step_name: steps[stepId].name,
    skip_reason: reason, // 'not_now', 'not_relevant', 'too_complex'
    time_on_step: Date.now() - stepStartTime,
    user_segment: userSegment,
    device_type: deviceType,
  });
};

// Use data to:
// 1. Identify high-friction steps
// 2. Improve step clarity
// 3. Adjust mandatory/optional classification
// 4. Personalize future prompts
```

---

## Gamification Elements

### Core Gamification Principles

1. **Immediate Feedback** - Instant visual response to actions
2. **Clear Goals** - Users know what to achieve
3. **Sense of Progress** - Visible advancement
4. **Rewards** - Recognition for completion
5. **Social Proof** - Show others' achievements (when appropriate)

---

### Gamification Patterns

#### 1. **Progress Bars with Milestones**

```
Getting Started
[████████████░░░░░░░░] 60%

Milestones:
✓ 25% - Account Created 🎉
✓ 50% - First Project Added ⭐
→ 75% - Team Invited 👥
  100% - Ready to Launch 🚀
```

**Implementation:**

```jsx
const milestones = [
  { threshold: 25, label: "Account Created", icon: "🎉", achieved: true },
  { threshold: 50, label: "First Project", icon: "⭐", achieved: true },
  { threshold: 75, label: "Team Invited", icon: "👥", achieved: false },
  { threshold: 100, label: "Ready to Launch", icon: "🚀", achieved: false },
];

<ProgressBar
  percentage={60}
  milestones={milestones}
  onMilestoneReached={(milestone) => {
    showCelebration(milestone);
  }}
/>;
```

---

#### 2. **Points & Badges System**

```
Your Progress: 350 XP

Badges Earned:
🏆 Quick Starter - Completed setup in under 5 minutes
📸 Profile Pro - Added profile photo and bio
🤝 Team Builder - Invited 5+ team members

Next Badge: 🎯 Power User (50 XP away)
Complete 10 tasks to unlock
```

**Badge Categories:**

- **Speed badges** - "Quick Starter", "Lightning Setup"
- **Completion badges** - "Completionist", "All Done"
- **Feature badges** - "Integration Master", "Automation Expert"
- **Social badges** - "Team Builder", "Collaborator"
- **Milestone badges** - "First Week", "30 Day Streak"

**Best practices:**

- Make early badges easy to achieve
- Show progress toward next badge
- Use meaningful, not arbitrary, achievements
- Allow badge sharing (optional)

---

#### 3. **Leveling System**

```
Level 2: Getting Started
[████████░░] 80% to Level 3

Level 1: Newbie ✓
Level 2: Getting Started (current)
Level 3: Active User (unlock at 10 tasks)
Level 4: Power User (unlock at 50 tasks)
Level 5: Expert (unlock at 100 tasks)
```

**Implementation:**

```javascript
const levels = [
  { level: 1, name: "Newbie", threshold: 0, perks: [] },
  { level: 2, name: "Getting Started", threshold: 5, perks: ["Basic templates"] },
  {
    level: 3,
    name: "Active User",
    threshold: 10,
    perks: ["Advanced features", "Priority support"],
  },
  { level: 4, name: "Power User", threshold: 50, perks: ["Custom integrations", "API access"] },
  { level: 5, name: "Expert", threshold: 100, perks: ["Beta features", "Expert badge"] },
];

const calculateLevel = (completedTasks) => {
  return levels.reduce((current, level) => (completedTasks >= level.threshold ? level : current));
};
```

---

#### 4. **Streaks & Consistency Rewards**

```
🔥 3 Day Streak!

You've logged in and completed tasks for 3 days in a row.
Keep it up to unlock the "Consistent" badge at 7 days!

[●●●○○○○] 3/7 days
```

**Best practices:**

- Don't penalize too harshly for breaks
- Consider "freeze" days for weekends
- Show streak progress prominently
- Celebrate milestone streaks (7, 30, 100 days)

---

#### 5. **Leaderboards (Team Context)**

```
Team Onboarding Progress

1. 🥇 Sarah Chen      100% ✓ Complete
2. 🥈 Mike Johnson     87% (6/7)
3. 🥉 You             71% (5/7)
4.    Emma Davis      57% (4/7)
5.    Alex Kumar      43% (3/7)

You're almost there! Complete 2 more steps to reach #2
```

**Considerations:**

- Use carefully - can demotivate low performers
- Consider opt-in only
- Focus on team progress, not individual competition
- Celebrate team milestones together

---

#### 6. **Challenges & Quests**

```
Daily Challenge: Complete 3 onboarding steps
[██░░░░] 2/3 complete

Reward: Unlock "Fast Learner" badge + 50 XP

Weekly Quest: Invite your team
Invite 5 team members this week
[███░░░] 3/5 invited

Reward: Team collaboration features unlocked
```

---

### Gamification Anti-Patterns (Avoid These)

❌ **Meaningless points** - Points that don't unlock anything
❌ **Forced competition** - Making users compete when they don't want to
❌ **Overwhelming complexity** - Too many systems (points + badges + levels + streaks)
❌ **Fake urgency** - "Only 2 hours left!" when it's not true
❌ **Punitive mechanics** - Losing points for inactivity
❌ **Childish aesthetics** - Overly playful for B2B contexts

---

### Contextual Gamification by Product Type

**B2B SaaS:**

- Subtle, professional aesthetics
- Focus on productivity metrics
- Team-based achievements
- Unlock actual features, not just badges

**B2C SaaS:**

- More playful visuals
- Individual achievements
- Social sharing options
- Fun rewards and celebrations

**Developer Tools:**

- Technical achievements
- Code-related metaphors
- Integration milestones
- API usage badges

---

## Completion Rewards & Celebrations

### Celebration Timing

```
Micro-celebrations:
├─ After each step completion (subtle)
├─ After milestone (25%, 50%, 75%)
└─ After full completion (major)
```

---

### Celebration Patterns

#### 1. **Confetti Animation**

**When to use:** Major milestones (50%, 100% completion)

```jsx
import confetti from "canvas-confetti";

const celebrateCompletion = () => {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
  });

  // Show success message
  showToast({
    title: "🎉 Onboarding Complete!",
    message: "You're all set up and ready to go!",
    duration: 5000,
  });
};
```

**Best practices:**

- Use sparingly (major achievements only)
- Keep animation short (1-2 seconds)
- Ensure it doesn't block UI
- Make it skippable

---

#### 2. **Success Modals**

```jsx
<Modal onComplete={true}>
  <div className="success-modal">
    <div className="icon">🎉</div>
    <h2>You're all set!</h2>
    <p>You've completed your onboarding. Here's what you can do next:</p>

    <div className="next-steps">
      <Card>
        <h3>Create your first project</h3>
        <button>Get Started</button>
      </Card>
      <Card>
        <h3>Invite your team</h3>
        <button>Send Invites</button>
      </Card>
      <Card>
        <h3>Explore features</h3>
        <button>Take a Tour</button>
      </Card>
    </div>

    <button className="primary">Go to Dashboard</button>
  </div>
</Modal>
```

---

#### 3. **Animated Checkmarks**

**For individual step completion:**

```css
@keyframes checkmark {
  0% {
    transform: scale(0) rotate(0deg);
    opacity: 0;
  }
  50% {
    transform: scale(1.2) rotate(10deg);
  }
  100% {
    transform: scale(1) rotate(0deg);
    opacity: 1;
  }
}

.checkmark {
  animation: checkmark 0.4s ease-in-out;
}
```

```jsx
<ChecklistItem completed={true}>
  <div className="checkmark">✓</div>
  <span className="completed-text">Profile created!</span>
</ChecklistItem>
```

---

#### 4. **Progress Bar Animations**

```css
@keyframes progress-fill {
  from {
    width: var(--start-width);
  }
  to {
    width: var(--end-width);
  }
}

.progress-bar {
  animation: progress-fill 0.5s ease-out;
  transition: background-color 0.3s;
}

/* Pulse effect on milestone */
@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.progress-bar.milestone-reached {
  animation: pulse 0.6s ease-in-out;
}
```

---

#### 5. **Toast Notifications**

**For subtle, non-blocking celebrations:**

```jsx
const showStepCompletionToast = (stepName) => {
  toast.success(
    <div className="completion-toast">
      <span className="icon">✓</span>
      <span className="message">{stepName} completed!</span>
    </div>,
    {
      position: "bottom-right",
      duration: 3000,
      style: {
        background: "#10B981",
        color: "white",
      },
    },
  );
};
```

---

#### 6. **Unlocked Features Announcement**

```jsx
<UnlockModal>
  <div className="unlock-animation">🔓</div>
  <h2>New Feature Unlocked!</h2>
  <p>You've completed your profile and unlocked:</p>

  <FeatureCard>
    <Icon name="team" />
    <h3>Team Collaboration</h3>
    <p>Invite unlimited team members and collaborate in real-time</p>
  </FeatureCard>

  <button>Try it now</button>
  <button className="secondary">Maybe later</button>
</UnlockModal>
```

---

### Tangible Rewards

#### **Credits/Discounts**

```
🎁 Onboarding Bonus!

Complete your setup and get:
• $50 in platform credits
• 20% off your first month
• Free premium template pack

[Claim Reward]
```

#### **Extended Trial**

```
✨ Bonus Time!

You completed onboarding in record time!
Enjoy an extra 7 days on your trial.

Trial extended to: March 15, 2026
```

#### **Exclusive Content**

```
📚 Expert Resources Unlocked

Access our exclusive onboarding guide:
• 50+ best practice templates
• Video tutorials from experts
• Private community access

[Download Now]
```

---

### Celebration Intensity Matrix

| Completion Level | Celebration Type | Example                                 |
| ---------------- | ---------------- | --------------------------------------- |
| Single step      | Subtle           | Animated checkmark, small toast         |
| 25% milestone    | Moderate         | Toast + progress highlight              |
| 50% milestone    | Moderate-High    | Toast + badge + progress animation      |
| 75% milestone    | High             | Modal + badge + "almost there" message  |
| 100% complete    | Maximum          | Confetti + modal + rewards + next steps |

---

### Social Celebration (Optional)

```jsx
<CompletionModal>
  <h2>🎉 Onboarding Complete!</h2>
  <p>You're now a certified [Product Name] user!</p>

  <ShareButtons>
    <button onClick={shareToLinkedIn}>Share on LinkedIn</button>
    <button onClick={shareToTwitter}>Share on Twitter</button>
  </ShareButtons>

  <PreviewCard>
    "Just completed my onboarding for [Product]! Excited to start using [key feature].
    #productivity"
  </PreviewCard>
</CompletionModal>
```

**Best practices:**

- Make sharing optional
- Pre-fill share text
- Show preview before posting
- Track share rate for virality

---

## Dismissal & Minimization Patterns

### Dismissal Strategy Framework

```
Should this checklist be dismissible?
│
├─ Is onboarding complete?
│  ├─ YES → Allow permanent dismissal
│  └─ NO → Continue below
│
├─ Are there mandatory steps remaining?
│  ├─ YES → Only allow minimization (not dismissal)
│  └─ NO → Allow dismissal with confirmation
│
└─ Has user engaged with checklist?
   ├─ NO (< 30 seconds) → Prevent dismissal, show value
   └─ YES → Allow dismissal with "Don't show again" option
```

---

### Pattern 1: Minimize/Collapse

**Best for:** Persistent checklists that users may want to hide temporarily

```jsx
<Checklist minimized={isMinimized}>
  {isMinimized ? (
    // Minimized state
    <MinimizedWidget onClick={() => setMinimized(false)}>
      <span className="icon">📋</span>
      <span className="progress">3/6 complete</span>
      <span className="expand-hint">Click to expand</span>
    </MinimizedWidget>
  ) : (
    // Full checklist
    <div className="checklist-full">
      <header>
        <h3>Getting Started</h3>
        <button
          className="minimize-btn"
          onClick={() => setMinimized(true)}
          aria-label="Minimize checklist"
        >
          <MinimizeIcon />
        </button>
      </header>

      <ProgressBar percentage={50} />

      <ChecklistItems>{/* Steps */}</ChecklistItems>
    </div>
  )}
</Checklist>
```

**Minimized states:**

- **Floating badge** - Small circular indicator with progress
- **Collapsed sidebar** - Thin vertical bar with icon
- **Header bar** - Horizontal strip at top/bottom
- **Launcher button** - Fixed position button (bottom-right)

---

### Pattern 2: Temporary Dismissal

**Best for:** Allowing users to focus without losing progress

```jsx
const dismissChecklist = () => {
  // Store dismissal
  localStorage.setItem(
    "checklist_dismissed_until",
    Date.now() + 24 * 60 * 60 * 1000, // 24 hours
  );

  setChecklistVisible(false);

  // Show confirmation
  toast.info(
    <div>
      Checklist hidden.
      <button onClick={showChecklist}>Undo</button>
    </div>,
    { duration: 5000 },
  );
};

// On app load
useEffect(() => {
  const dismissedUntil = localStorage.getItem("checklist_dismissed_until");
  if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
    setChecklistVisible(false);
  }
}, []);
```

**Dismissal options:**

- "Hide for today"
- "Remind me tomorrow"
- "Remind me in 3 days"
- "Remind me next week"

---

### Pattern 3: Permanent Dismissal with Confirmation

**Best for:** When users want to opt out completely

```jsx
const [showDismissConfirm, setShowDismissConfirm] = useState(false);

const handleDismissClick = () => {
  setShowDismissConfirm(true);
};

const confirmDismiss = () => {
  analytics.track("Onboarding Checklist Dismissed", {
    completion_percentage: completionPercentage,
    steps_completed: completedSteps.length,
    time_to_dismiss: Date.now() - checklistFirstShown,
  });

  localStorage.setItem("checklist_permanently_dismissed", "true");
  setChecklistVisible(false);
  setShowDismissConfirm(false);
};

return (
  <>
    <Checklist>
      <button onClick={handleDismissClick}>Don't show this again</button>
    </Checklist>

    {showDismissConfirm && (
      <ConfirmDialog>
        <h3>Hide onboarding checklist?</h3>
        <p>
          You can always access it later from Settings → Onboarding.
          {completionPercentage < 100 && (
            <strong>You're {100 - completionPercentage}% away from completing setup!</strong>
          )}
        </p>
        <button onClick={confirmDismiss}>Yes, hide it</button>
        <button onClick={() => setShowDismissConfirm(false)}>Keep it visible</button>
      </ConfirmDialog>
    )}
  </>
);
```

---

### Pattern 4: Contextual Dismissal

**Different dismissal options based on progress:**

```javascript
const getDismissalOptions = (completionPercentage) => {
  if (completionPercentage === 0) {
    return {
      allowDismiss: false,
      message: "Complete at least one step to dismiss",
      options: ["Minimize"],
    };
  } else if (completionPercentage < 50) {
    return {
      allowDismiss: true,
      message: "You're making progress! Sure you want to hide this?",
      options: ["Hide for today", "Minimize", "Cancel"],
    };
  } else if (completionPercentage < 100) {
    return {
      allowDismiss: true,
      message: "You're almost done! Just a few more steps.",
      options: ["Hide for today", "Don't show again", "Cancel"],
    };
  } else {
    return {
      allowDismiss: true,
      message: "Congratulations on completing onboarding!",
      options: ["Don't show again"],
    };
  }
};
```

---

### Pattern 5: Re-access After Dismissal

**Always provide a way back:**

```jsx
// In settings or help menu
<SettingsSection>
  <h3>Onboarding</h3>
  <p>
    {checklistDismissed
      ? 'You\'ve hidden the onboarding checklist.'
      : 'Onboarding checklist is currently visible.'
    }
  </p>
  <button onClick={resetChecklist}>
    {checklistDismissed ? 'Show checklist again' : 'Reset onboarding'}
  </button>
</SettingsSection>

// Or in help menu
<HelpMenu>
  <MenuItem onClick={showChecklist}>
    📋 View onboarding checklist
  </MenuItem>
</HelpMenu>
```

---

### Pattern 6: Smart Re-prompting

**Show dismissed checklist again based on behavior:**

```javascript
const shouldRepromptChecklist = (user) => {
  const dismissed = user.checklistDismissedAt;
  const daysSinceDismissal = (Date.now() - dismissed) / (1000 * 60 * 60 * 24);

  // Re-prompt if:
  return (
    // User dismissed but hasn't completed critical steps
    (user.completionPercentage < 50 && daysSinceDismissal > 7) ||
    // User is struggling (low engagement)
    (user.loginCount > 5 && user.tasksCompleted === 0) ||
    // New features added to checklist
    user.checklistVersion < currentChecklistVersion ||
    // User explicitly requested help
    user.requestedHelp === true
  );
};

// Show gentle re-prompt
if (shouldRepromptChecklist(user)) {
  showBanner({
    message: "Need help getting started? Your onboarding checklist is here to guide you.",
    action: "Show checklist",
    dismissible: true,
  });
}
```

---

### Dismissal UX Best Practices

✅ **Do:**

- Provide clear dismissal options
- Explain what happens when dismissed
- Offer multiple dismissal levels (minimize, hide temporarily, hide permanently)
- Make it easy to re-access
- Track dismissal analytics
- Show value before allowing dismissal

❌ **Don't:**

- Make dismissal too easy (accidental clicks)
- Hide dismissal option completely
- Shame users for dismissing
- Make it impossible to re-access
- Re-show immediately after dismissal
- Use dark patterns to prevent dismissal

---

### Dismissal Analytics

```javascript
const trackDismissal = (type) => {
  analytics.track("Checklist Dismissed", {
    dismissal_type: type, // 'minimize', 'hide_temporary', 'hide_permanent'
    completion_percentage: completionPercentage,
    steps_completed: completedSteps.length,
    steps_remaining: remainingSteps.length,
    time_visible: Date.now() - checklistFirstShown,
    user_segment: userSegment,
    device_type: deviceType,
  });
};

// Use data to:
// 1. Identify when users dismiss (early vs late)
// 2. Correlate dismissal with activation
// 3. Optimize checklist length/content
// 4. Improve re-prompting strategy
```

---

## Step Ordering Strategies

### Core Principles

1. **Front-load quick wins** - Start with easy, high-value steps
2. **Build momentum** - Increase complexity gradually
3. **Logical dependencies** - Respect natural workflow order
4. **Personalize when possible** - Adapt to user goals

---

### Strategy 1: Quick Win First

**Start with the easiest, most rewarding step**

```
✓ 1. Create your account (auto-completed)
→ 2. Add a profile photo (30 seconds)
  3. Invite team members (2 minutes)
  4. Create first project (5 minutes)
  5. Set up integrations (10 minutes)
```

**Why it works:**

- Immediate sense of progress (already 20% done!)
- Builds confidence
- Leverages Zeigarnik effect (desire to complete)

**Example:**

```javascript
const steps = [
  {
    id: 1,
    title: "Create account",
    difficulty: "auto",
    value: "high",
    autoComplete: true, // Already done during signup
  },
  {
    id: 2,
    title: "Add profile photo",
    difficulty: "easy",
    value: "medium",
    estimatedTime: "30 seconds",
  },
  {
    id: 3,
    title: "Invite team",
    difficulty: "medium",
    value: "high",
    estimatedTime: "2 minutes",
  },
  // ... more steps
];
```

---

### Strategy 2: Value-First Ordering

**Prioritize steps that deliver immediate value**

```
→ 1. Create your first project (aha moment!)
  2. Add a task to your project
  3. Complete your first task
  4. Invite team members
  5. Set up profile
```

**When to use:**

- Product-led growth
- Self-serve onboarding
- When time-to-value is critical

**Example (Project Management Tool):**

```javascript
const valueFirstSteps = [
  { id: 1, title: "Create first project", value: "critical", order: 1 },
  { id: 2, title: "Add first task", value: "critical", order: 2 },
  { id: 3, title: "Mark task complete", value: "high", order: 3 },
  { id: 4, title: "Invite team", value: "high", order: 4 },
  { id: 5, title: "Upload profile photo", value: "low", order: 5 },
];
```

---

### Strategy 3: Dependency-Based Ordering

**Respect natural workflow dependencies**

```
→ 1. Connect your data source (required for next steps)
  2. Configure data mapping (depends on #1)
  3. Set up automation rules (depends on #2)
  4. Test your workflow (depends on #3)
  5. Invite team to review (depends on #4)
```

**Implementation:**

```javascript
const steps = [
  {
    id: 1,
    title: "Connect data source",
    dependencies: [],
    locked: false,
  },
  {
    id: 2,
    title: "Configure mapping",
    dependencies: [1],
    locked: !steps[0].completed,
  },
  {
    id: 3,
    title: "Set up automation",
    dependencies: [2],
    locked: !steps[1].completed,
  },
];

// Render with lock indicators
<ChecklistItem disabled={step.locked}>
  {step.locked && (
    <LockIcon tooltip={`Complete "${getDependencyTitle(step.dependencies[0])}" first`} />
  )}
  {step.title}
</ChecklistItem>;
```

---

### Strategy 4: Personalized Ordering

**Adapt order based on user goals/role**

```javascript
const getPersonalizedSteps = (userGoal) => {
  const allSteps = {
    createProject: { id: 1, title: "Create project", priority: { teamLead: 1, developer: 3 } },
    inviteTeam: { id: 2, title: "Invite team", priority: { teamLead: 2, developer: 5 } },
    setupIntegration: {
      id: 3,
      title: "Setup integration",
      priority: { teamLead: 4, developer: 1 },
    },
    configureAPI: { id: 4, title: "Configure API", priority: { teamLead: 5, developer: 2 } },
    setProfile: { id: 5, title: "Set up profile", priority: { teamLead: 3, developer: 4 } },
  };

  // Sort by priority for user's role
  return Object.values(allSteps).sort((a, b) => a.priority[userGoal] - b.priority[userGoal]);
};

// Usage
const steps = getPersonalizedSteps(user.role); // 'teamLead' or 'developer'
```

**Personalization factors:**

- User role (admin, member, viewer)
- Company size (solo, small team, enterprise)
- Use case (selected during signup)
- Industry vertical
- Technical proficiency

---

### Strategy 5: Progressive Disclosure

**Show steps gradually as users progress**

```
Phase 1: Essential Setup (visible immediately)
→ 1. Create account
  2. Verify email
  3. Create first project

Phase 2: Team Setup (unlocked after Phase 1)
  4. Invite team members
  5. Set permissions

Phase 3: Advanced Features (unlocked after Phase 2)
  6. Set up integrations
  7. Configure automation
```

**Implementation:**

```jsx
const ChecklistPhases = () => {
  const [currentPhase, setCurrentPhase] = useState(1);

  const phases = [
    {
      id: 1,
      title: "Essential Setup",
      steps: [1, 2, 3],
      unlocked: true,
    },
    {
      id: 2,
      title: "Team Setup",
      steps: [4, 5],
      unlocked: phase1Complete,
    },
    {
      id: 3,
      title: "Advanced Features",
      steps: [6, 7],
      unlocked: phase2Complete,
    },
  ];

  return (
    <div>
      {phases.map((phase) => (
        <PhaseSection key={phase.id} locked={!phase.unlocked}>
          <h3>{phase.title}</h3>
          {phase.unlocked ? (
            <StepList steps={phase.steps} />
          ) : (
            <LockedMessage>Complete {phases[phase.id - 2].title} to unlock</LockedMessage>
          )}
        </PhaseSection>
      ))}
    </div>
  );
};
```

---

### Strategy 6: Parallel Paths

**Allow users to choose their own adventure**

```
Choose your path:

Path A: Team Collaboration
→ 1. Invite team members
  2. Create shared workspace
  3. Set up permissions

Path B: Solo Productivity
→ 1. Import existing data
  2. Set up personal workspace
  3. Configure automation

Both paths:
  4. Complete profile
  5. Explore features
```

**Implementation:**

```jsx
const OnboardingPaths = () => {
  const [selectedPath, setSelectedPath] = useState(null);

  const paths = {
    team: {
      title: "Team Collaboration",
      description: "Best for teams of 2+",
      steps: [
        { id: 1, title: "Invite team" },
        { id: 2, title: "Create workspace" },
        { id: 3, title: "Set permissions" },
      ],
    },
    solo: {
      title: "Solo Productivity",
      description: "Best for individual use",
      steps: [
        { id: 1, title: "Import data" },
        { id: 2, title: "Personal workspace" },
        { id: 3, title: "Configure automation" },
      ],
    },
  };

  if (!selectedPath) {
    return (
      <PathSelector>
        <h2>How will you use [Product]?</h2>
        {Object.entries(paths).map(([key, path]) => (
          <PathCard key={key} onClick={() => setSelectedPath(key)}>
            <h3>{path.title}</h3>
            <p>{path.description}</p>
          </PathCard>
        ))}
      </PathSelector>
    );
  }

  return <Checklist steps={paths[selectedPath].steps} />;
};
```

---

### Step Ordering Best Practices

✅ **Do:**

- Show estimated time for each step
- Allow skipping non-critical steps
- Indicate dependencies clearly
- Test order with real users
- Track completion rates per step
- Adjust based on data

❌ **Don't:**

- Make every step mandatory
- Hide step count (users want to know what's ahead)
- Change order mid-onboarding
- Force linear progression when parallel is better
- Ignore user feedback on ordering

---

### A/B Testing Step Order

```javascript
const stepOrderExperiments = {
  control: {
    name: "Quick Win First",
    order: ["profile", "invite", "project", "integration"],
  },
  variant_a: {
    name: "Value First",
    order: ["project", "invite", "profile", "integration"],
  },
  variant_b: {
    name: "Dependency Based",
    order: ["profile", "project", "integration", "invite"],
  },
};

// Assign user to experiment
const experiment = assignExperiment(user.id, stepOrderExperiments);

// Track results
analytics.track("Onboarding Step Completed", {
  step_id: stepId,
  step_position: experiment.order.indexOf(stepId),
  experiment_variant: experiment.name,
  time_to_complete: completionTime,
});

// Analyze:
// - Which order has highest completion rate?
// - Which order has fastest time-to-value?
// - Which order has best retention?
```

---

## Personalized Checklist Examples

### Personalization Dimensions

1. **User Role** - Admin, Member, Viewer
2. **Company Size** - Solo, Small Team (2-10), Medium (11-50), Enterprise (50+)
3. **Use Case** - Selected during signup
4. **Industry** - SaaS, E-commerce, Healthcare, etc.
5. **Technical Level** - Beginner, Intermediate, Advanced
6. **Integration Needs** - Which tools they use

---

### Example 1: Role-Based Personalization

#### Admin Checklist

```
Welcome, Admin! Let's set up your workspace.

Essential Setup:
✓ Create your account
→ Set up company profile
  Configure SSO (recommended for teams 10+)
  Invite team members
  Assign roles & permissions

Advanced Configuration:
  Set up billing
  Configure integrations
  Customize branding
  Set data retention policies

Progress: 1/8 complete
```

#### Team Member Checklist

```
Welcome! Let's get you started.

Quick Setup:
✓ Create your account
→ Complete your profile
  Join your team workspace
  Set notification preferences

Get Productive:
  Create your first project
  Complete your first task
  Explore features

Progress: 1/6 complete
```

**Implementation:**

```javascript
const getChecklistByRole = (role) => {
  const checklists = {
    admin: [
      { id: 1, title: "Create account", category: "essential", completed: true },
      { id: 2, title: "Set up company profile", category: "essential" },
      { id: 3, title: "Configure SSO", category: "essential", conditional: user.teamSize > 10 },
      { id: 4, title: "Invite team", category: "essential" },
      { id: 5, title: "Assign roles", category: "essential" },
      { id: 6, title: "Set up billing", category: "advanced" },
      { id: 7, title: "Configure integrations", category: "advanced" },
      { id: 8, title: "Customize branding", category: "advanced" },
    ],
    member: [
      { id: 1, title: "Create account", category: "setup", completed: true },
      { id: 2, title: "Complete profile", category: "setup" },
      { id: 3, title: "Join workspace", category: "setup" },
      { id: 4, title: "Set notifications", category: "setup" },
      { id: 5, title: "Create first project", category: "productivity" },
      { id: 6, title: "Complete first task", category: "productivity" },
    ],
  };

  return checklists[role] || checklists.member;
};
```

---

### Example 2: Use Case Personalization

#### Marketing Team Use Case

```
Let's set up your marketing workspace!

Campaign Setup:
→ Create your first campaign
  Set up email templates
  Connect email provider (Mailchimp, SendGrid)
  Import contact list

Analytics:
  Connect Google Analytics
  Set up conversion tracking
  Create first report

Progress: 0/6 complete
```

#### Development Team Use Case

```
Let's configure your dev environment!

Repository Setup:
→ Connect GitHub/GitLab
  Create first project
  Set up CI/CD pipeline
  Configure webhooks

Team Collaboration:
  Invite developers
  Set up code review workflow
  Configure notifications

Progress: 0/6 complete
```

**Implementation:**

```javascript
const getChecklistByUseCase = (useCase) => {
  const useCaseChecklists = {
    marketing: {
      title: "Marketing Workspace Setup",
      steps: [
        { id: 1, title: "Create campaign", icon: "📧" },
        { id: 2, title: "Email templates", icon: "📝" },
        {
          id: 3,
          title: "Connect email provider",
          icon: "🔗",
          integrations: ["mailchimp", "sendgrid"],
        },
        { id: 4, title: "Import contacts", icon: "👥" },
        { id: 5, title: "Connect analytics", icon: "📊", integrations: ["google-analytics"] },
        { id: 6, title: "Set up tracking", icon: "🎯" },
      ],
    },
    development: {
      title: "Dev Environment Setup",
      steps: [
        { id: 1, title: "Connect repository", icon: "🔗", integrations: ["github", "gitlab"] },
        { id: 2, title: "Create project", icon: "📁" },
        { id: 3, title: "Setup CI/CD", icon: "⚙️" },
        { id: 4, title: "Configure webhooks", icon: "🪝" },
        { id: 5, title: "Invite developers", icon: "👥" },
        { id: 6, title: "Code review workflow", icon: "✅" },
      ],
    },
    sales: {
      title: "Sales Pipeline Setup",
      steps: [
        { id: 1, title: "Import contacts", icon: "👥" },
        { id: 2, title: "Create pipeline stages", icon: "📊" },
        { id: 3, title: "Connect CRM", icon: "🔗", integrations: ["salesforce", "hubspot"] },
        { id: 4, title: "Set up email sequences", icon: "📧" },
        { id: 5, title: "Configure notifications", icon: "🔔" },
      ],
    },
  };

  return useCaseChecklists[useCase] || useCaseChecklists.marketing;
};
```

---

### Example 3: Company Size Personalization

#### Solo User (1 person)

```
Welcome! Let's get you productive.

Quick Start:
→ Create your first project
  Add your first task
  Complete a task
  Explore templates

Optional:
  Set up integrations
  Customize workspace

Progress: 0/4 core steps
```

#### Small Team (2-10 people)

```
Welcome! Let's set up your team.

Team Setup:
→ Create team workspace
  Invite team members (2-10)
  Create first shared project
  Set up basic permissions

Collaboration:
  Set up team notifications
  Create project templates
  Connect team tools

Progress: 0/7 steps
```

#### Enterprise (50+ people)

```
Welcome! Let's configure your enterprise workspace.

Security & Compliance:
→ Configure SSO (SAML/OKTA)
  Set up SCIM provisioning
  Configure audit logs
  Set data retention policies

Organization Setup:
  Create departments/teams
  Set up role hierarchy
  Configure approval workflows
  Bulk invite users

Integrations:
  Connect enterprise tools
  Set up API access
  Configure webhooks

Progress: 0/12 steps
```

---

### Example 4: Technical Level Personalization

#### Beginner

```
Let's get started! We'll guide you step-by-step.

Step 1: Create your first project
[Video Tutorial] [Step-by-step Guide]
→ Click the "New Project" button
  Give it a name
  Choose a template

Step 2: Add a task
[Video Tutorial]
  Click "Add Task"
  Write what you need to do
  Set a due date

Progress: 0/5 steps (each with detailed guidance)
```

#### Advanced

```
Quick Setup Checklist:

→ API key generation
  Webhook configuration
  Custom integration setup
  Advanced automation rules
  CLI installation

[View API Docs] [Skip to Dashboard]

Progress: 0/5 steps
```

---

### Example 5: Integration-Based Personalization

**Detected integrations during signup:**

```javascript
// User selected: Slack, GitHub, Figma during signup

const personalizedChecklist = [
  { id: 1, title: "Create account", completed: true },
  { id: 2, title: "Connect Slack", icon: "slack", priority: "high" },
  { id: 3, title: "Connect GitHub", icon: "github", priority: "high" },
  { id: 4, title: "Connect Figma", icon: "figma", priority: "high" },
  { id: 5, title: "Set up Slack notifications", dependsOn: [2] },
  { id: 6, title: "Configure GitHub webhooks", dependsOn: [3] },
  { id: 7, title: "Import Figma designs", dependsOn: [4] },
];
```

**Rendered checklist:**

```
Let's connect your tools!

Priority Integrations:
→ Connect Slack (you selected this)
  Connect GitHub (you selected this)
  Connect Figma (you selected this)

Configuration:
  Set up Slack notifications
  Configure GitHub webhooks
  Import Figma designs

Other Integrations:
  Browse 50+ more integrations

Progress: 0/7 steps
```

---

### Dynamic Personalization

**Adapt checklist based on user behavior:**

```javascript
const adaptChecklist = (user, behavior) => {
  let checklist = getBaseChecklist(user.role);

  // User struggling with a feature?
  if (behavior.failedAttempts > 3) {
    checklist.unshift({
      id: "help",
      title: "Watch tutorial video",
      priority: "urgent",
      icon: "🎥",
    });
  }

  // User invited team but they haven't joined?
  if (behavior.invitesSent > 0 && behavior.teamSize === 1) {
    checklist.push({
      id: "follow-up",
      title: "Follow up with team invites",
      priority: "medium",
      icon: "📧",
    });
  }

  // User completed core tasks quickly?
  if (behavior.coreTasksCompleted && behavior.timeToComplete < 300) {
    checklist.push({
      id: "advanced",
      title: "Explore advanced features",
      priority: "low",
      icon: "🚀",
    });
  }

  return checklist;
};
```

---

### Personalization Best Practices

✅ **Do:**

- Ask 1-3 questions during signup to personalize
- Show why steps are relevant ("You selected Marketing")
- Allow users to switch personalization
- Track which personalizations drive activation
- Test different personalization strategies

❌ **Don't:**

- Over-personalize (too many questions upfront)
- Lock users into wrong personalization
- Assume personalization without asking
- Ignore user feedback on relevance
- Make personalization feel creepy

---

## Team vs Individual Checklists

### Key Differences

| Aspect             | Individual Checklist              | Team Checklist                        |
| ------------------ | --------------------------------- | ------------------------------------- |
| **Focus**          | Personal productivity             | Collaboration & setup                 |
| **Completion**     | Individual progress               | Team-wide progress                    |
| **Steps**          | Profile, preferences, first tasks | Workspace setup, invites, permissions |
| **Visibility**     | Private to user                   | Visible to admins/team                |
| **Timeline**       | Minutes to hours                  | Hours to days                         |
| **Success Metric** | User activation                   | Team activation                       |

---

### Individual User Checklist

**Purpose:** Get individual user to "aha moment" quickly

```
Your Personal Setup

Quick Start:
✓ Create your account
→ Complete your profile
  Set notification preferences
  Create your first project
  Complete your first task

Explore:
  Try a template
  Explore features
  Join a team workspace (optional)

Progress: 1/7 steps
Time to complete: ~5 minutes
```

**Characteristics:**

- Self-contained
- Can be completed independently
- Focuses on individual value
- Quick wins emphasized
- Optional team features

**Implementation:**

```javascript
const individualChecklist = {
  id: "individual_onboarding",
  userId: user.id,
  visibility: "private",
  steps: [
    {
      id: 1,
      title: "Create account",
      completed: true,
      autoComplete: true,
    },
    {
      id: 2,
      title: "Complete profile",
      estimatedTime: "1 min",
      value: "medium",
    },
    {
      id: 3,
      title: "Set notifications",
      estimatedTime: "30 sec",
      value: "low",
      skippable: true,
    },
    {
      id: 4,
      title: "Create first project",
      estimatedTime: "2 min",
      value: "critical",
      isAhaMoment: true,
    },
    {
      id: 5,
      title: "Complete first task",
      estimatedTime: "1 min",
      value: "high",
    },
  ],
  metrics: {
    targetCompletionTime: 300, // 5 minutes
    activationThreshold: 4, // Complete 4/5 steps
  },
};
```

---

### Team Checklist (Admin/Workspace Setup)

**Purpose:** Set up team workspace for collaboration

```
Team Workspace Setup

Essential Configuration:
✓ Create workspace
→ Set up company profile
  Configure team settings
  Invite team members (0/5 invited)
  Assign roles & permissions

Team Collaboration:
  Create shared projects
  Set up team templates
  Configure integrations
  Set team goals

Progress: 1/9 steps
Team activation: 20% (1/5 members active)
```

**Characteristics:**

- Requires admin privileges
- Affects multiple users
- Longer completion time
- Focuses on team value
- May have mandatory compliance steps

**Implementation:**

```javascript
const teamChecklist = {
  id: "team_onboarding",
  workspaceId: workspace.id,
  adminId: admin.id,
  visibility: "admin",
  steps: [
    {
      id: 1,
      title: "Create workspace",
      completed: true,
      autoComplete: true,
    },
    {
      id: 2,
      title: "Set up company profile",
      estimatedTime: "3 min",
      value: "high",
      fields: ["company_name", "logo", "industry"],
    },
    {
      id: 3,
      title: "Configure team settings",
      estimatedTime: "5 min",
      value: "medium",
      subSteps: ["timezone", "work_hours", "holidays"],
    },
    {
      id: 4,
      title: "Invite team members",
      estimatedTime: "2 min",
      value: "critical",
      isAhaMoment: true,
      progress: {
        current: 0,
        target: 5,
        metric: "invites_sent",
      },
    },
    {
      id: 5,
      title: "Assign roles",
      estimatedTime: "3 min",
      value: "high",
      dependsOn: [4],
    },
  ],
  metrics: {
    targetCompletionTime: 1800, // 30 minutes
    teamActivationThreshold: 0.6, // 60% of team active
  },
};
```

---

### Hybrid: Two-Phase Onboarding

**Phase 1: Individual (Immediate)**

```
Welcome! Let's get you started.

→ Complete your profile
  Create your first project
  Explore features

You can invite your team anytime!
```

**Phase 2: Team (When ready)**

```
Ready to collaborate?

→ Invite team members
  Create team workspace
  Set up shared projects
  Configure permissions

Your team's progress: 2/5 members active
```

**Implementation:**

```jsx
const TwoPhaseOnboarding = () => {
  const [phase, setPhase] = useState("individual");

  return (
    <div>
      {phase === "individual" && (
        <IndividualChecklist
          onComplete={() => {
            // Show team invitation prompt
            showTeamInvitePrompt();
          }}
        />
      )}

      {phase === "team" && <TeamChecklist workspaceId={workspace.id} />}

      {/* Allow switching */}
      <PhaseToggle>
        <button onClick={() => setPhase("individual")}>My Setup</button>
        <button onClick={() => setPhase("team")}>Team Setup {user.isAdmin && "(Admin)"}</button>
      </PhaseToggle>
    </div>
  );
};
```

---

### Team Progress Visibility

**Admin View:**

```
Team Onboarding Progress

Overall: 67% complete (6/9 steps)

Team Member Status:
✓ Sarah Chen (Admin)      100% complete
✓ Mike Johnson            87% complete (6/7)
→ You (Admin)             71% complete (5/7)
  Emma Davis              57% complete (4/7)
  Alex Kumar              14% complete (1/7) - Invited, not joined

[Send reminder to Alex]
[View individual progress]
```

**Member View:**

```
Your Progress: 71% complete (5/7)

Your Setup:
✓ Complete profile
✓ Create first project
→ Invite a colleague
  Complete first task

Team Progress: 67% complete
Your team is making great progress!
```

**Implementation:**

```javascript
const TeamProgressDashboard = ({ workspace, currentUser }) => {
  const teamMembers = workspace.members;
  const overallProgress = calculateTeamProgress(teamMembers);

  return (
    <div>
      <OverallProgress percentage={overallProgress} />

      {currentUser.isAdmin && (
        <TeamMemberList>
          {teamMembers.map((member) => (
            <MemberProgress key={member.id}>
              <Avatar src={member.avatar} />
              <Name>{member.name}</Name>
              <ProgressBar percentage={member.onboardingProgress} />
              <Status>
                {member.onboardingProgress === 100
                  ? "✓ Complete"
                  : member.status === "invited"
                    ? "Invited, not joined"
                    : `${member.completedSteps}/${member.totalSteps} complete`}
              </Status>
              {member.status === "invited" && (
                <button onClick={() => sendReminder(member.id)}>Send Reminder</button>
              )}
            </MemberProgress>
          ))}
        </TeamMemberList>
      )}

      <YourProgress>
        <h3>Your Progress</h3>
        <IndividualChecklist userId={currentUser.id} />
      </YourProgress>
    </div>
  );
};
```

---

### Multi-Tenant Considerations

**Tenant-Level Checklist (Organization Setup):**

```
Organization Setup (Admin Only)

Tenant Configuration:
→ Set up organization profile
  Configure SSO/SAML
  Set data retention policies
  Configure audit logging

Workspace Management:
  Create departments/workspaces
  Set organization-wide settings
  Configure billing

Progress: 0/7 steps
```

**Workspace-Level Checklist (Team Setup):**

```
Marketing Team Workspace

Workspace Setup:
→ Name your workspace
  Invite team members
  Create first project
  Set workspace preferences

Progress: 0/4 steps
```

**User-Level Checklist (Individual):**

```
Your Personal Setup

→ Complete profile
  Join workspace
  Create first task

Progress: 0/3 steps
```

**Hierarchy:**

```
Organization (Tenant)
├── Workspace 1 (Marketing)
│   ├── User A (Individual checklist)
│   └── User B (Individual checklist)
└── Workspace 2 (Sales)
    ├── User C (Individual checklist)
    └── User D (Individual checklist)
```

---

### Team Activation Metrics

```javascript
const calculateTeamActivation = (workspace) => {
  const metrics = {
    // Individual activation
    usersActivated: workspace.members.filter((m) => m.isActivated).length,
    totalUsers: workspace.members.length,
    userActivationRate: 0,

    // Team collaboration
    sharedProjectsCreated: workspace.sharedProjects.length,
    collaborativeActions: workspace.collaborativeActions.length,

    // Admin setup
    adminSetupComplete: workspace.adminChecklist.completed,

    // Overall team health
    teamActivationScore: 0,
  };

  metrics.userActivationRate = metrics.usersActivated / metrics.totalUsers;

  // Calculate team activation score (0-100)
  metrics.teamActivationScore =
    metrics.userActivationRate * 40 + // 40% weight on user activation
    (metrics.sharedProjectsCreated > 0 ? 30 : 0) + // 30% weight on collaboration
    (metrics.adminSetupComplete ? 30 : 0); // 30% weight on admin setup

  return metrics;
};

// Team is "activated" when score > 70
const isTeamActivated = (workspace) => {
  return calculateTeamActivation(workspace).teamActivationScore > 70;
};
```

---

## Returning User Experience

### Challenge

New users need onboarding, but returning users need:

- Quick access to core features
- Discovery of new features
- Reminders of incomplete setup
- No repetition of completed onboarding

---

### Pattern 1: Persistent but Contextual

**First visit:**

```
Welcome! Let's get you started.

Getting Started Checklist:
→ Complete your profile
  Create first project
  Invite team

[Show me around]
```

**Second visit (some progress):**

```
Welcome back!

You're 60% done with setup:
✓ Profile complete
✓ First project created
→ Invite your team to collaborate

[Continue setup] [Skip to dashboard]
```

**Third visit (checklist complete):**

```
Welcome back!

✓ Setup complete!

New this week:
• Advanced automation features
• New integrations available

[Explore new features] [Go to dashboard]
```

**Implementation:**

```javascript
const getWelcomeExperience = (user) => {
  const visits = user.loginCount;
  const onboardingProgress = user.onboardingProgress;

  if (visits === 1) {
    return {
      type: "full_onboarding",
      message: "Welcome! Let's get you started.",
      showChecklist: true,
      showTour: true,
    };
  } else if (onboardingProgress < 100) {
    return {
      type: "continue_onboarding",
      message: "Welcome back!",
      showChecklist: true,
      showProgress: true,
      allowSkip: true,
    };
  } else {
    return {
      type: "returning_user",
      message: "Welcome back!",
      showChecklist: false,
      showWhatsNew: true,
      showQuickActions: true,
    };
  }
};
```

---

### Pattern 2: Progressive Feature Discovery

**Instead of showing all features upfront, introduce them over time:**

```javascript
const featureDiscoverySchedule = {
  visit_1: ["core_features"],
  visit_3: ["collaboration_features"],
  visit_7: ["automation_features"],
  visit_14: ["advanced_features"],
  visit_30: ["power_user_features"],
};

const getFeaturesToHighlight = (user) => {
  const visits = user.loginCount;

  // Find appropriate feature set
  const milestones = Object.keys(featureDiscoverySchedule)
    .map((k) => parseInt(k.split("_")[1]))
    .sort((a, b) => b - a);

  const milestone = milestones.find((m) => visits >= m);
  const featureKey = `visit_${milestone}`;

  return featureDiscoverySchedule[featureKey];
};

// Show feature spotlight
if (shouldShowFeatureSpotlight(user)) {
  const features = getFeaturesToHighlight(user);
  showFeatureSpotlight(features);
}
```

**UI Example:**

```
Visit 3:

🎉 New features unlocked!

Team Collaboration:
• Share projects with teammates
• Real-time collaboration
• Comment and mention

[Try it now] [Remind me later]
```

---

### Pattern 3: Contextual Nudges

**Show incomplete steps contextually, not as a full checklist:**

```jsx
// User visits Projects page but hasn't created a project
<EmptyState>
  <h2>No projects yet</h2>
  <p>Create your first project to get started</p>
  <button>Create Project</button>

  {!user.hasInvitedTeam && (
    <Tip>
      💡 Tip: Invite your team to collaborate on projects
      <button>Invite Team</button>
    </Tip>
  )}
</EmptyState>

// User visits Settings but hasn't set up integrations
<SettingsPage>
  {!user.hasIntegrations && (
    <Banner dismissible>
      🔗 Connect your favorite tools to streamline your workflow
      <button>Browse Integrations</button>
    </Banner>
  )}
</SettingsPage>
```

---

### Pattern 4: "What's New" for Returning Users

```jsx
const WhatsNewModal = ({ user }) => {
  const lastVisit = user.lastLoginAt;
  const newFeatures = getFeaturesSince(lastVisit);

  if (newFeatures.length === 0) return null;

  return (
    <Modal>
      <h2>What's New Since Your Last Visit</h2>

      {newFeatures.map((feature) => (
        <FeatureCard key={feature.id}>
          <Icon>{feature.icon}</Icon>
          <h3>{feature.name}</h3>
          <p>{feature.description}</p>
          <button>Try it now</button>
        </FeatureCard>
      ))}

      <button onClick={dismiss}>Got it</button>
    </Modal>
  );
};
```

---

### Pattern 5: Adaptive Onboarding Completion

**Don't force completion if user is already getting value:**

```javascript
const shouldShowOnboarding = (user) => {
  const progress = user.onboardingProgress;
  const engagement = user.engagementScore;

  // User is engaged despite incomplete onboarding
  if (engagement > 70 && progress < 100) {
    return {
      show: false,
      reason: "user_already_engaged",
      action: "hide_checklist",
    };
  }

  // User has low engagement and incomplete onboarding
  if (engagement < 30 && progress < 100) {
    return {
      show: true,
      reason: "needs_guidance",
      action: "show_checklist_prominently",
    };
  }

  // User completed onboarding
  if (progress === 100) {
    return {
      show: false,
      reason: "onboarding_complete",
      action: "show_whats_new",
    };
  }

  return {
    show: true,
    reason: "in_progress",
    action: "show_checklist_minimized",
  };
};
```

---

### Pattern 6: Re-engagement for Dormant Users

**User hasn't logged in for 7+ days:**

```jsx
// Email or in-app message
<ReengagementMessage>
  <h2>We miss you!</h2>
  <p>You're 75% done with setup. Finish in just 2 minutes:</p>

  <ChecklistPreview>
    ✓ Profile complete ✓ First project created → Invite your team → Set up integrations
  </ChecklistPreview>

  <button>Complete Setup</button>

  <p>Or jump straight to:</p>
  <QuickActions>
    <button>Create Project</button>
    <button>View Dashboard</button>
  </QuickActions>
</ReengagementMessage>
```

---

### Pattern 7: Graduated Onboarding

**Different "levels" of onboarding:**

```javascript
const onboardingLevels = {
  beginner: {
    name: "Getting Started",
    steps: ["profile", "first_project", "first_task"],
    completed: user.beginnerOnboardingComplete,
  },
  intermediate: {
    name: "Team Collaboration",
    steps: ["invite_team", "shared_project", "permissions"],
    unlocked: user.beginnerOnboardingComplete,
    completed: user.intermediateOnboardingComplete,
  },
  advanced: {
    name: "Power User",
    steps: ["automation", "integrations", "api_access"],
    unlocked: user.intermediateOnboardingComplete,
    completed: user.advancedOnboardingComplete,
  },
};

// Show appropriate level
const currentLevel = getCurrentOnboardingLevel(user);
```

**UI:**

```
Your Learning Path:

✓ Level 1: Getting Started (Complete!)
→ Level 2: Team Collaboration (2/3 complete)
  Level 3: Power User (Locked - complete Level 2 first)

Current: Invite your team
[Continue] [Skip to dashboard]
```

---

### Returning User Best Practices

✅ **Do:**

- Remember user progress
- Show what's new since last visit
- Allow skipping to main app
- Provide contextual nudges
- Celebrate milestones on return
- Adapt based on engagement

❌ **Don't:**

- Show completed steps again
- Force full onboarding on every visit
- Ignore user's actual usage patterns
- Repeat the same prompts
- Block access to main features
- Assume all users need same guidance

---

## Mobile Checklist UX

### Mobile-Specific Challenges

1. **Limited screen space** - Checklists compete with main content
2. **Touch targets** - Need larger, finger-friendly buttons
3. **Scrolling** - Long checklists require scrolling
4. **Context switching** - Harder to reference checklist while completing steps
5. **Notifications** - Mobile users expect push notifications

---

### Mobile Placement Patterns

#### 1. **Bottom Sheet**

**Best for:** Persistent access without blocking content

```
┌─────────────────────┐
│                     │
│   Main Content      │
│                     │
│                     │
├─────────────────────┤
│ Getting Started 3/5 │ ← Tap to expand
└─────────────────────┘

// Expanded:
┌─────────────────────┐
│ Getting Started     │
│ [████░░] 60%       │
│                     │
│ ✓ Create account    │
│ ✓ Add profile       │
│ → Create project    │
│ ☐ Invite team       │
│ ☐ First task        │
│                     │
│ [Minimize]          │
└─────────────────────┘
```

**Implementation:**

```jsx
import { BottomSheet } from "react-spring-bottom-sheet";

const MobileChecklist = () => {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Collapsed trigger */}
      <BottomSheetTrigger onClick={() => setOpen(true)}>
        <span>Getting Started</span>
        <ProgressRing percentage={60} size="small" />
        <span>3/5</span>
      </BottomSheetTrigger>

      {/* Expanded sheet */}
      <BottomSheet
        open={open}
        onDismiss={() => setOpen(false)}
        snapPoints={({ maxHeight }) => [maxHeight * 0.6, maxHeight * 0.9]}
      >
        <ChecklistContent />
      </BottomSheet>
    </>
  );
};
```

---

#### 2. **Collapsible Banner**

**Best for:** Lightweight, non-intrusive reminders

```
┌─────────────────────┐
│ 📋 3 steps left →   │ ← Tap to expand
├─────────────────────┤
│                     │
│   Main Content      │
│                     │
└─────────────────────┘

// Expanded:
┌─────────────────────┐
│ Getting Started     │
│ [████░░] 60%       │
│ → Create project    │
│ ☐ Invite team       │
│ ☐ First task        │
│ [Collapse]          │
├─────────────────────┤
│   Main Content      │
└─────────────────────┘
```

---

#### 3. **Full-Screen Modal** (Initial Setup)

**Best for:** Critical onboarding that must be completed

```
┌─────────────────────┐
│  Welcome!           │
│                     │
│  Let's get started  │
│                     │
│  Step 1 of 3        │
│  [██░░░░] 33%      │
│                     │
│  Create your        │
│  first project      │
│                     │
│  [Continue]         │
│  [Skip for now]     │
└─────────────────────┘
```

---

#### 4. **Floating Action Button (FAB)**

**Best for:** Always-accessible but minimal footprint

```
┌─────────────────────┐
│                     │
│   Main Content      │
│                     │
│                  ┌─┐│
│                  │3││ ← Tap to open
│                  └─┘│
└─────────────────────┘
```

**Implementation:**

```jsx
<FloatingActionButton
  onClick={() => setChecklistOpen(true)}
  badge={remainingSteps}
  position="bottom-right"
>
  <ChecklistIcon />
</FloatingActionButton>
```

---

### Mobile-Optimized Step Design

#### **Larger Touch Targets**

```jsx
// Desktop: 40px height
// Mobile: 56px height (minimum)

<ChecklistItem
  style={{
    minHeight: "56px",
    padding: "16px",
    fontSize: "16px", // Prevent zoom on iOS
  }}
>
  <Checkbox size="24px" /> {/* Larger checkbox */}
  <span>Create your first project</span>
</ChecklistItem>
```

---

#### **Swipe Gestures**

```jsx
import { useSwipeable } from "react-swipeable";

const SwipeableChecklistItem = ({ step, onComplete, onSkip }) => {
  const handlers = useSwipeable({
    onSwipedRight: () => onComplete(step.id),
    onSwipedLeft: () => onSkip(step.id),
    trackMouse: false,
  });

  return (
    <div {...handlers} className="swipeable-item">
      <span>Swipe right to complete →</span>
      <span>{step.title}</span>
      <span>← Swipe left to skip</span>
    </div>
  );
};
```

---

#### **Accordion/Expandable Steps**

**Save space by collapsing step details:**

```jsx
<ChecklistItem>
  <div onClick={() => toggleExpanded(step.id)}>
    <Checkbox />
    <span>Create your first project</span>
    <ExpandIcon />
  </div>

  {expanded && (
    <StepDetails>
      <p>Projects help you organize your work.</p>
      <button>Create Project</button>
      <button>Watch Tutorial</button>
    </StepDetails>
  )}
</ChecklistItem>
```

---

### Mobile Progress Indicators

#### **Compact Progress Bar**

```jsx
<MobileProgressBar>
  <div className="progress-header">
    <span>Getting Started</span>
    <span>3/5</span>
  </div>
  <div className="progress-bar">
    <div className="fill" style={{ width: "60%" }} />
  </div>
</MobileProgressBar>
```

---

#### **Step Dots**

```
● ● ● ○ ○
```

```jsx
<StepDots>
  {steps.map((step, index) => (
    <Dot key={index} completed={step.completed} active={index === currentStep} />
  ))}
</StepDots>
```

---

### Mobile-Specific Features

#### **Push Notifications**

```javascript
// Request permission
const requestNotificationPermission = async () => {
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    scheduleOnboardingReminders();
  }
};

// Schedule reminders
const scheduleOnboardingReminders = () => {
  // Day 1: Gentle reminder
  scheduleNotification({
    title: "Complete your setup",
    body: "You're 60% done! Just 2 more steps.",
    delay: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Day 3: Stronger nudge
  scheduleNotification({
    title: "Finish setting up your account",
    body: "Unlock all features by completing setup.",
    delay: 3 * 24 * 60 * 60 * 1000, // 3 days
  });
};
```

---

#### **Offline Support**

```javascript
// Cache checklist state locally
const saveChecklistProgress = (progress) => {
  localStorage.setItem("checklist_progress", JSON.stringify(progress));
};

// Sync when back online
window.addEventListener("online", () => {
  const localProgress = JSON.parse(localStorage.getItem("checklist_progress"));
  syncProgressToServer(localProgress);
});
```

---

#### **Native App Integration**

```jsx
// React Native example
import { Platform } from "react-native";

const MobileChecklist = () => {
  const isNative = Platform.OS !== "web";

  return (
    <View>
      {isNative ? (
        <NativeBottomSheet>
          <ChecklistContent />
        </NativeBottomSheet>
      ) : (
        <WebBottomSheet>
          <ChecklistContent />
        </WebBottomSheet>
      )}
    </View>
  );
};
```

---

### Mobile Checklist Best Practices

✅ **Do:**

- Use bottom sheets or FABs for persistent access
- Make touch targets at least 44x44px (iOS) or 48x48px (Android)
- Support swipe gestures
- Show progress prominently
- Use push notifications for reminders
- Test on actual devices
- Support offline mode
- Optimize for one-handed use

❌ **Don't:**

- Block entire screen with checklist
- Use tiny touch targets
- Require precise tapping
- Show too many steps at once
- Ignore platform conventions (iOS vs Android)
- Assume desktop patterns work on mobile
- Forget about landscape orientation
- Use hover states (no hover on touch)

---

### Responsive Breakpoints

```css
/* Mobile-first approach */

/* Mobile (default) */
.checklist {
  position: fixed;
  bottom: 0;
  width: 100%;
  max-height: 60vh;
}

/* Tablet */
@media (min-width: 768px) {
  .checklist {
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: 400px;
    max-height: 500px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .checklist {
    position: fixed;
    right: 0;
    top: 0;
    width: 320px;
    height: 100vh;
    max-height: none;
  }
}
```

---

## Activation Metrics

### Key Metrics to Track

#### 1. **Checklist Completion Rate**

```javascript
const checklistCompletionRate = {
  formula: "users_completed_checklist / users_started_checklist",

  calculate: (users) => {
    const started = users.filter((u) => u.checklistProgress > 0).length;
    const completed = users.filter((u) => u.checklistProgress === 100).length;
    return (completed / started) * 100;
  },

  benchmark: {
    good: "> 60%",
    average: "40-60%",
    poor: "< 40%",
  },
};

// Track by cohort
const completionByCohort = {
  week_1: 45,
  week_2: 52,
  week_3: 58,
  week_4: 61,
};
```

---

#### 2. **Time to Complete Checklist**

```javascript
const timeToComplete = {
  formula: "checklist_completed_at - checklist_started_at",

  track: (userId, event) => {
    if (event === "checklist_started") {
      analytics.track("Checklist Started", {
        user_id: userId,
        started_at: Date.now(),
      });
    } else if (event === "checklist_completed") {
      analytics.track("Checklist Completed", {
        user_id: userId,
        completed_at: Date.now(),
        time_to_complete: Date.now() - user.checklistStartedAt,
      });
    }
  },

  benchmark: {
    target: "< 10 minutes",
    acceptable: "10-30 minutes",
    concerning: "> 30 minutes",
  },
};
```

---

#### 3. **Step Completion Rates**

**Identify drop-off points:**

```javascript
const stepCompletionRates = {
  step_1: { name: "Create account", completion: 100 }, // Auto-complete
  step_2: { name: "Add profile photo", completion: 85 },
  step_3: { name: "Create project", completion: 72 },
  step_4: { name: "Invite team", completion: 45 }, // ← Drop-off!
  step_5: { name: "First task", completion: 38 },
};

// Identify problematic steps
const problematicSteps = Object.entries(stepCompletionRates)
  .filter(([_, data]) => data.completion < 50)
  .map(([step, data]) => ({
    step,
    ...data,
    action: "investigate_friction",
  }));
```

---

#### 4. **Activation Rate**

**Users who complete key actions (not just checklist):**

```javascript
const activationCriteria = {
  // Define what "activated" means for your product
  criteria: [
    { action: "created_project", weight: 30 },
    { action: "completed_task", weight: 25 },
    { action: "invited_team", weight: 20 },
    { action: "used_core_feature", weight: 15 },
    { action: "returned_day_2", weight: 10 },
  ],

  threshold: 70, // User is "activated" at 70+ points

  calculate: (user) => {
    return activationCriteria.criteria.reduce((score, criterion) => {
      return score + (user.actions.includes(criterion.action) ? criterion.weight : 0);
    }, 0);
  },
};

const activationRate = {
  formula: "activated_users / total_signups",

  calculate: (users) => {
    const activated = users.filter(
      (u) => activationCriteria.calculate(u) >= activationCriteria.threshold,
    ).length;
    return (activated / users.length) * 100;
  },
};
```

---

#### 5. **Time to First Value (TTFV)**

**Time until user experiences "aha moment":**

```javascript
const timeToFirstValue = {
  // Define "aha moment" for your product
  ahaMoment: "completed_first_task",

  track: (userId, event) => {
    if (event === ahaMoment) {
      const ttfv = Date.now() - user.signupAt;

      analytics.track("First Value Achieved", {
        user_id: userId,
        time_to_first_value: ttfv,
        time_to_first_value_minutes: ttfv / (1000 * 60),
      });
    }
  },

  benchmark: {
    excellent: "< 5 minutes",
    good: "5-15 minutes",
    acceptable: "15-30 minutes",
    poor: "> 30 minutes",
  },
};
```

---

#### 6. **Checklist Dismissal Rate**

```javascript
const dismissalMetrics = {
  formula: "users_dismissed / users_shown_checklist",

  track: (userId, dismissalType, progress) => {
    analytics.track("Checklist Dismissed", {
      user_id: userId,
      dismissal_type: dismissalType, // 'minimize', 'hide_temporary', 'hide_permanent'
      progress_at_dismissal: progress,
      steps_completed: user.completedSteps.length,
      time_visible: Date.now() - user.checklistFirstShown,
    });
  },

  analyze: (dismissals) => {
    // When do users dismiss?
    const dismissalByProgress = {
      "0-25%": dismissals.filter((d) => d.progress < 25).length,
      "25-50%": dismissals.filter((d) => d.progress >= 25 && d.progress < 50).length,
      "50-75%": dismissals.filter((d) => d.progress >= 50 && d.progress < 75).length,
      "75-100%": dismissals.filter((d) => d.progress >= 75).length,
    };

    return dismissalByProgress;
  },
};
```

---

#### 7. **Retention by Checklist Completion**

**Do users who complete checklist retain better?**

```javascript
const retentionByCompletion = {
  cohorts: {
    completed_checklist: {
      day_1: 85,
      day_7: 72,
      day_30: 58,
    },
    incomplete_checklist: {
      day_1: 65,
      day_7: 42,
      day_30: 28,
    },
  },

  calculate: (users, days) => {
    const completed = users.filter((u) => u.checklistProgress === 100);
    const incomplete = users.filter((u) => u.checklistProgress < 100);

    const completedRetained = completed.filter(
      (u) => u.lastLoginAt > Date.now() - days * 24 * 60 * 60 * 1000,
    ).length;

    const incompleteRetained = incomplete.filter(
      (u) => u.lastLoginAt > Date.now() - days * 24 * 60 * 60 * 1000,
    ).length;

    return {
      completed: (completedRetained / completed.length) * 100,
      incomplete: (incompleteRetained / incomplete.length) * 100,
    };
  },
};
```

---

### Analytics Implementation

```javascript
// Track checklist events
const trackChecklistEvent = (event, properties = {}) => {
  analytics.track(event, {
    ...properties,
    checklist_version: CHECKLIST_VERSION,
    user_segment: user.segment,
    device_type: getDeviceType(),
    timestamp: Date.now(),
  });
};

// Key events to track
const checklistEvents = {
  // Lifecycle
  "Checklist Viewed": () => trackChecklistEvent("Checklist Viewed"),
  "Checklist Started": () => trackChecklistEvent("Checklist Started"),
  "Checklist Completed": (timeToComplete) =>
    trackChecklistEvent("Checklist Completed", { timeToComplete }),

  // Step events
  "Step Viewed": (stepId) => trackChecklistEvent("Step Viewed", { step_id: stepId }),
  "Step Started": (stepId) => trackChecklistEvent("Step Started", { step_id: stepId }),
  "Step Completed": (stepId, timeToComplete) =>
    trackChecklistEvent("Step Completed", {
      step_id: stepId,
      time_to_complete: timeToComplete,
    }),
  "Step Skipped": (stepId, reason) =>
    trackChecklistEvent("Step Skipped", {
      step_id: stepId,
      skip_reason: reason,
    }),

  // Interaction events
  "Checklist Minimized": () => trackChecklistEvent("Checklist Minimized"),
  "Checklist Expanded": () => trackChecklistEvent("Checklist Expanded"),
  "Checklist Dismissed": (type, progress) =>
    trackChecklistEvent("Checklist Dismissed", {
      dismissal_type: type,
      progress,
    }),

  // Milestone events
  "Milestone Reached": (milestone) => trackChecklistEvent("Milestone Reached", { milestone }),
};
```

---

### Dashboard Metrics

**What to monitor:**

```javascript
const checklistDashboard = {
  overview: {
    total_users: 10000,
    checklist_started: 8500,
    checklist_completed: 5100,
    completion_rate: 60,
    avg_time_to_complete: 12, // minutes
  },

  funnel: {
    step_1: { started: 8500, completed: 8500, rate: 100 },
    step_2: { started: 8500, completed: 7225, rate: 85 },
    step_3: { started: 7225, completed: 6120, rate: 72 },
    step_4: { started: 6120, completed: 3825, rate: 45 }, // ← Investigate!
    step_5: { started: 3825, completed: 3230, rate: 38 },
  },

  cohorts: {
    week_1: { completion: 45, activation: 38 },
    week_2: { completion: 52, activation: 44 },
    week_3: { completion: 58, activation: 51 },
    week_4: { completion: 61, activation: 55 },
  },

  segments: {
    solo_users: { completion: 72, activation: 65 },
    small_teams: { completion: 58, activation: 52 },
    enterprise: { completion: 45, activation: 61 }, // Lower completion but higher activation!
  },
};
```

---

### A/B Testing Framework

```javascript
const checklistExperiments = {
  experiment_1: {
    name: "Step Order Test",
    variants: {
      control: { order: ["profile", "project", "invite", "task"] },
      variant_a: { order: ["project", "task", "profile", "invite"] },
    },
    metrics: ["completion_rate", "time_to_complete", "activation_rate"],
    results: {
      control: { completion: 58, ttc: 15, activation: 52 },
      variant_a: { completion: 64, ttc: 12, activation: 58 }, // Winner!
    },
  },

  experiment_2: {
    name: "Progress Visualization",
    variants: {
      control: { type: "linear_bar" },
      variant_a: { type: "circular_progress" },
      variant_b: { type: "step_dots" },
    },
    metrics: ["completion_rate", "engagement"],
    results: {
      control: { completion: 58, engagement: 72 },
      variant_a: { completion: 61, engagement: 75 },
      variant_b: { completion: 55, engagement: 68 },
    },
  },
};
```

---

## Real-World Examples

### Notion

**Approach:** Embedded, learn-by-doing checklist

```
Getting Started

✓ Type "/" to see commands
→ Drag blocks to rearrange
☐ Click "+" to add content
☐ Share with your team

[████░░] 50%
```

**Key Features:**

- Embedded directly in workspace
- Interactive (do it in the product)
- Minimal steps (3-5)
- No separate modal
- Focuses on core mechanics

**Why it works:**

- Users learn by doing, not reading
- Doesn't interrupt workflow
- Quick wins (typing "/" is instant)
- Builds muscle memory

---

### Linear

**Approach:** Anti-onboarding (minimal guidance)

```
// No traditional checklist!

// Instead:
- Pre-populated demo data
- Opinionated defaults
- Constraints that teach (e.g., issues must have owners)
- Delayed education (welcome email sent later)
```

**Key Features:**

- No product tours
- No tooltips
- No progress tracking
- Trust in good design
- Philosophy-first approach

**Why it works:**

- Targets users who value speed
- Reduces cognitive load
- Lets design speak for itself
- Qualifies users who align with philosophy

**When to use this approach:**

- Product has intuitive design
- Target users are tech-savvy
- Strong opinionated defaults
- Clear visual hierarchy

---

### Stripe

**Approach:** Developer-focused, documentation-driven

```
Quick Start

Essential Setup:
→ Get your API keys
  Make your first API call
  Test with sample data

Integration:
  Choose your integration path
  Install SDK
  Handle webhooks

[View Docs] [API Reference]
```

**Key Features:**

- Developer-centric language
- Code examples prominent
- Demo sandbox environment
- Embedded tips
- Documentation links

**Why it works:**

- Developers prefer docs over tours
- Sandbox allows safe testing
- Code examples are actionable
- Respects developer workflow

---

### Slack

**Approach:** Conversational, bot-guided

```
Slackbot: Welcome to Slack! 👋

I'll help you get started. First, let's send a message.

Try typing a message below and hit Enter.

[Type your message...]

Progress: Step 1 of 4
```

**Key Features:**

- Conversational UI
- Bot-guided onboarding
- Interactive prompts
- Contextual help
- Social onboarding (invite team early)

**Why it works:**

- Feels natural (chat interface)
- Immediate engagement
- Social proof (team activity)
- Low friction

---

### Asana

**Approach:** Template-based onboarding

```
Choose how you'll use Asana:

[Project Management]
[Task Tracking]
[Team Collaboration]
[Goal Setting]

// After selection:
We've created a sample project for you!

✓ Explore your project
→ Add your first task
☐ Invite your team
☐ Set a due date

[████░░░░] 25%
```

**Key Features:**

- Personalization upfront
- Pre-populated templates
- Role-based guidance
- Visual progress

**Why it works:**

- Reduces blank slate problem
- Shows value immediately
- Personalized experience
- Clear next steps

---

### Figma

**Approach:** Interactive tutorial file

```
// Creates a tutorial file in user's workspace

"Welcome to Figma!"

This file will teach you the basics:

1. Selection tool →
2. Frame tool →
3. Text tool →
4. Components →

Try each tool on the canvas!

[Next: Selection Tool]
```

**Key Features:**

- Hands-on learning
- In-product tutorial
- Visual examples
- Progressive disclosure

**Why it works:**

- Learn by doing
- Contextual to design tool
- Visual learners benefit
- Safe practice environment

---

### Comparison Matrix

| Product    | Approach             | Checklist Type  | Steps | Time   | Best For          |
| ---------- | -------------------- | --------------- | ----- | ------ | ----------------- |
| **Notion** | Learn-by-doing       | Embedded        | 3-5   | 2 min  | Knowledge workers |
| **Linear** | Anti-onboarding      | None            | 0     | 0 min  | Tech-savvy users  |
| **Stripe** | Documentation        | Sidebar         | 5-7   | 10 min | Developers        |
| **Slack**  | Conversational       | Bot-guided      | 4-6   | 3 min  | Teams             |
| **Asana**  | Template-based       | Modal → Sidebar | 6-8   | 5 min  | Project managers  |
| **Figma**  | Interactive tutorial | In-product file | 8-10  | 10 min | Designers         |

---

## Implementation Guidelines

### Technical Stack Recommendations

#### **React Implementation**

```bash
npm install react-joyride framer-motion canvas-confetti
```

```jsx
import Joyride from "react-joyride";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";

const OnboardingChecklist = () => {
  const [steps, setSteps] = useState([
    { id: 1, title: "Create account", completed: true },
    { id: 2, title: "Complete profile", completed: false },
    { id: 3, title: "Create project", completed: false },
  ]);

  const progress = (steps.filter((s) => s.completed).length / steps.length) * 100;

  const completeStep = (stepId) => {
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, completed: true } : s)));

    // Celebrate
    if (progress === 100) {
      confetti();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="checklist"
    >
      <h3>Getting Started</h3>
      <ProgressBar percentage={progress} />

      {steps.map((step) => (
        <ChecklistItem key={step.id} step={step} onComplete={() => completeStep(step.id)} />
      ))}
    </motion.div>
  );
};
```

---

#### **State Management**

```javascript
// Using Zustand
import create from "zustand";
import { persist } from "zustand/middleware";

const useOnboardingStore = create(
  persist(
    (set, get) => ({
      steps: [],
      progress: 0,
      dismissed: false,

      completeStep: (stepId) => {
        const steps = get().steps.map((s) => (s.id === stepId ? { ...s, completed: true } : s));
        const progress = (steps.filter((s) => s.completed).length / steps.length) * 100;

        set({ steps, progress });

        // Track analytics
        analytics.track("Step Completed", { step_id: stepId, progress });
      },

      dismissChecklist: (type) => {
        set({ dismissed: true });
        analytics.track("Checklist Dismissed", { type });
      },

      resetChecklist: () => {
        set({ dismissed: false, progress: 0 });
      },
    }),
    {
      name: "onboarding-storage",
      getStorage: () => localStorage,
    },
  ),
);
```

---

#### **API Integration**

```javascript
// Sync checklist progress to backend
const syncProgress = async (userId, progress) => {
  try {
    await fetch("/api/onboarding/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        progress: progress,
        completed_steps: steps.filter((s) => s.completed).map((s) => s.id),
        timestamp: Date.now(),
      }),
    });
  } catch (error) {
    console.error("Failed to sync progress:", error);
    // Queue for retry
    queueProgressSync(userId, progress);
  }
};

// Debounce sync to avoid excessive API calls
const debouncedSync = debounce(syncProgress, 1000);
```

---

### Accessibility Considerations

```jsx
const AccessibleChecklist = () => {
  return (
    <div role="region" aria-label="Onboarding checklist" aria-live="polite">
      <h2 id="checklist-title">Getting Started</h2>

      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-labelledby="checklist-title"
      >
        <div className="progress-bar" style={{ width: `${progress}%` }} />
        <span className="sr-only">{progress}% complete</span>
      </div>

      <ul role="list">
        {steps.map((step) => (
          <li key={step.id}>
            <button
              onClick={() => completeStep(step.id)}
              aria-pressed={step.completed}
              aria-label={`${step.title}, ${step.completed ? "completed" : "not completed"}`}
            >
              <span aria-hidden="true">{step.completed ? "✓" : "○"}</span>
              {step.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
```

---

### Performance Optimization

```javascript
// Lazy load checklist component
const Checklist = lazy(() => import("./components/Checklist"));

// Only render when needed
const App = () => {
  const { checklistDismissed, onboardingComplete } = useOnboarding();

  return (
    <div>
      <MainContent />

      {!checklistDismissed && !onboardingComplete && (
        <Suspense fallback={<ChecklistSkeleton />}>
          <Checklist />
        </Suspense>
      )}
    </div>
  );
};

// Memoize expensive calculations
const ChecklistProgress = memo(({ steps }) => {
  const progress = useMemo(
    () => (steps.filter((s) => s.completed).length / steps.length) * 100,
    [steps],
  );

  return <ProgressBar percentage={progress} />;
});
```

---

### Testing Strategy

```javascript
// Unit tests
describe("Checklist", () => {
  it("calculates progress correctly", () => {
    const steps = [
      { id: 1, completed: true },
      { id: 2, completed: true },
      { id: 3, completed: false },
    ];
    expect(calculateProgress(steps)).toBe(66.67);
  });

  it("completes step when clicked", () => {
    const { getByText } = render(<Checklist />);
    fireEvent.click(getByText("Create project"));
    expect(getByText("Create project")).toHaveAttribute("aria-pressed", "true");
  });
});

// Integration tests
describe("Onboarding flow", () => {
  it("completes full onboarding", async () => {
    const { getByText } = render(<App />);

    // Complete each step
    fireEvent.click(getByText("Complete profile"));
    await waitFor(() => expect(getByText("Profile complete!")).toBeInTheDocument());

    fireEvent.click(getByText("Create project"));
    await waitFor(() => expect(getByText("Project created!")).toBeInTheDocument());

    // Verify completion
    expect(getByText("Onboarding complete!")).toBeInTheDocument();
  });
});

// E2E tests (Playwright)
test("user completes onboarding", async ({ page }) => {
  await page.goto("/");

  // Verify checklist visible
  await expect(page.locator('[aria-label="Onboarding checklist"]')).toBeVisible();

  // Complete steps
  await page.click("text=Complete profile");
  await page.fill('[name="name"]', "Test User");
  await page.click("text=Save");

  // Verify progress
  await expect(page.locator("text=50% complete")).toBeVisible();

  // Complete remaining steps
  await page.click("text=Create project");
  await page.fill('[name="project_name"]', "My Project");
  await page.click("text=Create");

  // Verify completion celebration
  await expect(page.locator("text=Onboarding complete!")).toBeVisible();
});
```

---

### Deployment Checklist

Before launching your onboarding checklist:

- [ ] **Analytics tracking** - All events instrumented
- [ ] **A/B testing** - Experiment framework ready
- [ ] **Performance** - Lazy loading, code splitting
- [ ] **Accessibility** - WCAG 2.1 AA compliant
- [ ] **Mobile responsive** - Tested on iOS and Android
- [ ] **Cross-browser** - Tested on Chrome, Safari, Firefox, Edge
- [ ] **Error handling** - Graceful degradation
- [ ] **Loading states** - Skeleton screens, spinners
- [ ] **Offline support** - Local storage, sync on reconnect
- [ ] **Internationalization** - Multi-language support
- [ ] **Documentation** - Internal docs for team
- [ ] **Monitoring** - Error tracking, performance monitoring
- [ ] **Rollback plan** - Feature flag to disable if needed

---

## Conclusion

Effective onboarding checklists balance **guidance** with **autonomy**, **structure** with **flexibility**, and **education** with **action**.

### Key Takeaways

1. **Placement matters** - Choose based on product type and user needs
2. **Progress visualization** - Show users where they are and where they're going
3. **Skippable by default** - Only make steps mandatory when truly necessary
4. **Gamify thoughtfully** - Use game elements to motivate, not manipulate
5. **Celebrate wins** - Acknowledge progress with appropriate celebrations
6. **Allow dismissal** - Give users control over their experience
7. **Order strategically** - Front-load quick wins, respect dependencies
8. **Personalize** - Adapt to user role, use case, and behavior
9. **Team vs Individual** - Different checklists for different contexts
10. **Returning users** - Don't repeat completed onboarding
11. **Mobile-first** - Optimize for touch, limited space, and context
12. **Measure everything** - Track metrics to continuously improve

### Next Steps

1. **Define your activation metric** - What does "activated" mean for your product?
2. **Map your user journey** - What steps lead to first value?
3. **Choose your approach** - Which pattern fits your product and users?
4. **Build and test** - Start simple, iterate based on data
5. **Monitor and optimize** - Continuously improve based on metrics

---

**Remember:** The best onboarding checklist is the one that gets users to value fastest while respecting their autonomy and intelligence.

---

## Additional Resources

### Tools & Libraries

- **React Joyride** - Product tours and guided experiences
- **Intro.js** - Step-by-step user onboarding
- **Shepherd.js** - Guide users through your app
- **Appcues** - No-code onboarding platform
- **Userpilot** - Product adoption platform
- **Pendo** - Product analytics and guidance

### Further Reading

- [UserOnboard.com](https://www.useronboard.com) - Onboarding teardowns
- [GoodUI](https://goodui.org) - UI patterns and A/B tests
- [Laws of UX](https://lawsofux.com) - Psychology principles
- [Baymard Institute](https://baymard.com) - UX research

### Communities

- [Product-Led Alliance](https://productled.com)
- [Product School](https://productschool.com)
- [Growth Hackers](https://growthhackers.com)

---

_Last updated: January 26, 2026_
