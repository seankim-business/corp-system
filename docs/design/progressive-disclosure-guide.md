# Progressive Disclosure UX Patterns for Complex SaaS Applications

## Table of Contents

1. [Introduction](#introduction)
2. [Cognitive Load Theory](#cognitive-load-theory)
3. [When to Use Progressive Disclosure](#when-to-use-progressive-disclosure)
4. [Core Patterns](#core-patterns)
5. [Production Examples](#production-examples)
6. [Mobile-First Progressive Disclosure](#mobile-first-progressive-disclosure)
7. [Accessibility Considerations](#accessibility-considerations)
8. [Implementation Guide](#implementation-guide)
9. [Decision Trees](#decision-trees)
10. [Usability Testing Data](#usability-testing-data)
11. [Power User Considerations](#power-user-considerations)
12. [Onboarding Implications](#onboarding-implications)

---

## Introduction

Progressive disclosure is a UX design technique that **reduces cognitive load** by revealing information and functionality gradually, showing only essential details initially and exposing advanced features as users engage deeper. This approach is crucial for complex SaaS applications where balancing power with simplicity is essential.

### Core Principle

> "Show users only what they need, when they need it."

Progressive disclosure addresses the fundamental conflict between users wanting **power** (features and options) and wanting **simplicity** (not having to learn a profusion of features).

---

## Cognitive Load Theory

### Understanding Cognitive Load

Cognitive load refers to the amount of mental effort required to process information. Progressive disclosure directly addresses three types of cognitive load:

1. **Intrinsic Load**: Complexity inherent to the task itself
2. **Extraneous Load**: Unnecessary complexity from poor design (this is what we reduce)
3. **Germane Load**: Mental effort devoted to learning and understanding

### How Progressive Disclosure Reduces Cognitive Load

- **Chunking Information**: Breaking complex tasks into manageable steps
- **Reducing Visual Clutter**: Hiding non-essential elements until needed
- **Prioritizing Attention**: Directing focus to the most important actions
- **Preventing Decision Paralysis**: Limiting choices at each interaction point

### Research Findings

According to Nielsen Norman Group research:

- Progressive disclosure improves **learnability** by helping novice users focus on essential features
- It increases **efficiency** by saving advanced users time (they don't scan past rarely-used features)
- It reduces **error rates** by preventing mistakes caused by overwhelming complexity

---

## When to Use Progressive Disclosure

### ✅ Use Progressive Disclosure When:

1. **Complex Workflows**: Multi-step processes with many configuration options
2. **Diverse User Base**: Users range from novice to expert
3. **Feature-Rich Applications**: Products with extensive functionality
4. **Limited Screen Real Estate**: Mobile interfaces or dense dashboards
5. **Onboarding Flows**: Guiding new users through setup
6. **Advanced Settings**: Specialized options used by <20% of users
7. **Conditional Fields**: Options that only apply in certain contexts

### ❌ Avoid Progressive Disclosure When:

1. **Critical Information**: Essential data users need immediately
2. **Frequently Used Features**: Actions performed in >80% of sessions
3. **Simple Interfaces**: Applications with minimal complexity
4. **Time-Critical Tasks**: Emergency or urgent workflows
5. **Comparison Tasks**: Users need to see multiple options simultaneously
6. **Linear Processes**: Single-path workflows with no branching

### Context-Specific Considerations

**For AI Workflow Automation Platforms:**

- ✅ Hide advanced AI model parameters behind "Advanced Settings"
- ✅ Use step-by-step wizards for complex automation setup
- ✅ Progressively reveal integration options based on selected triggers
- ❌ Don't hide workflow execution status or error messages
- ❌ Don't bury frequently-used automation templates

---

## Core Patterns

### 1. Expand/Collapse Patterns

#### Accordion Pattern

**Use Case**: Organizing related content into collapsible sections

**Best Practices**:

- Allow multiple sections to be open simultaneously for comparison
- Use clear visual indicators (chevron icons) for expand/collapse state
- Maintain context when expanding (don't scroll user away from trigger)
- Consider default-open state for most important section

**Example Structure**:

```
▼ Basic Settings (expanded)
  └─ [Configuration options visible]
▶ Advanced Settings (collapsed)
▶ Integration Options (collapsed)
```

**When to Use**:

- FAQ sections
- Settings panels with multiple categories
- Documentation with hierarchical content
- Form sections with optional fields

#### Disclosure Widget

**Use Case**: Revealing additional details for a single item

**Best Practices**:

- Use "Show more" / "Show less" text links for inline content
- Implement chevron/caret icons for structural disclosures
- Ensure smooth animations (200-300ms) for expand/collapse
- Maintain scroll position after expansion

**Visual Indicators**:

- **Chevron (>)**: Rotates 90° when expanded (GitHub pattern)
- **Fold/Unfold icon**: Indicates expandable text content
- **Ellipsis (...)**: Shows truncated inline text can be revealed

#### Details/Summary Pattern

**Use Case**: Native HTML5 progressive disclosure

**Advantages**:

- Built-in accessibility
- No JavaScript required
- Works without CSS
- Searchable content (browsers can find text in collapsed sections)

**Implementation**:

```html
<details>
  <summary>System Requirements</summary>
  <p>Details about system requirements here.</p>
</details>
```

### 2. Step-by-Step Wizards vs. All-at-Once

#### Multi-Step Wizards

**When to Use**:

- Complex setup processes (>5 configuration options)
- Sequential dependencies (step 2 depends on step 1)
- Onboarding new users
- Processes requiring validation at each stage
- Mobile-first experiences

**Advantages**:

- Reduces cognitive load per screen
- Clear progress indication
- Easier error handling
- Better mobile experience
- Lower abandonment rates

**Disadvantages**:

- More clicks required
- Harder to review all choices
- Can frustrate power users
- Difficult to go back and change earlier steps

**Best Practices**:

- Show progress indicator (e.g., "Step 2 of 5")
- Allow users to navigate back freely
- Save progress automatically
- Provide summary/review step before final submission
- Enable "Skip" for optional steps

**Example Flow**:

```
Step 1: Choose Trigger → Step 2: Configure Action → Step 3: Set Conditions → Step 4: Review & Activate
```

#### All-at-Once Forms

**When to Use**:

- Power users who know what they want
- Simple forms (<5 fields)
- Users need to see all options to make decisions
- Comparison-heavy tasks
- Expert modes

**Advantages**:

- Faster for experienced users
- Easier to see all options
- Better for comparison
- Fewer page loads

**Disadvantages**:

- Overwhelming for novices
- Higher error rates
- Poor mobile experience
- Increased abandonment

**Best Practices**:

- Group related fields visually
- Use progressive disclosure within the form (collapsible sections)
- Provide inline help text
- Implement smart defaults
- Consider a "Simple/Advanced" toggle

#### Hybrid Approach: Adaptive Forms

**Best of Both Worlds**:

- Start with wizard for first-time users
- Offer "Advanced Mode" toggle for power users
- Remember user preference
- Provide keyboard shortcuts to skip steps

**Example**: Linear's issue creation

- Default: Simple form with essential fields
- Click "Show all fields": Expands to full form
- Power users can use keyboard shortcuts to access any field

### 3. Advanced Settings Placement

#### Patterns for Hiding Advanced Options

##### Pattern A: Separate "Advanced" Section

**Structure**:

```
[Basic Settings - Always Visible]
─────────────────────
▶ Advanced Settings (collapsed by default)
```

**When to Use**:

- Clear distinction between basic and advanced features
- Advanced options used by <20% of users
- Settings that could confuse novices

**Examples**:

- GitHub repository settings (basic vs. advanced)
- Email client configuration (SMTP settings)
- AI model parameters (temperature, top-p, etc.)

##### Pattern B: Inline Progressive Disclosure

**Structure**:

```
Setting Name: [Value]
  ▶ More options (collapsed)
```

**When to Use**:

- Advanced options directly related to a basic setting
- Contextual configurations
- Optional parameters

**Example**: Figma's component properties

- Basic: Component name and description
- Expanded: Variants, properties, constraints

##### Pattern C: Modal/Drawer for Advanced Settings

**Structure**:

```
[Basic Interface]
[⚙️ Advanced Settings] → Opens modal/drawer
```

**When to Use**:

- Advanced settings require significant screen space
- Settings used infrequently
- Configuration that shouldn't distract from main workflow

**Examples**:

- IDE preferences (VS Code settings)
- Application preferences
- Admin panels

##### Pattern D: Contextual Disclosure

**Structure**:

```
When user selects Option A:
  → Show related advanced options
When user selects Option B:
  → Show different advanced options
```

**When to Use**:

- Options only relevant in specific contexts
- Conditional fields
- Dynamic forms

**Example**: Automation platform

- Select "Schedule" trigger → Show cron expression builder
- Select "Webhook" trigger → Show URL and authentication options

### 4. Tooltips and Popovers

**Use Case**: Providing additional information without leaving the page

**Best Practices**:

- Use for definitions and help text
- Keep content concise (<50 words)
- Don't hide critical information in tooltips
- Ensure keyboard accessibility
- Avoid tooltips on mobile (use tap-to-reveal instead)

**Pattern Types**:

- **Hover Tooltips**: Brief explanations (desktop only)
- **Click Popovers**: More detailed information
- **Info Icons (ℹ️)**: Indicate additional help available

### 5. Truncation Patterns

#### Text Truncation

**Patterns**:

- **Ellipsis with "Show more"**: For long descriptions
- **Character limit with expand**: For user-generated content
- **Fade-out effect**: Visual indicator of hidden content

**Best Practices**:

- Show enough text to convey meaning (2-3 lines minimum)
- Use "Read more" / "Read less" toggle
- Maintain reading position when expanding
- Make truncated content searchable

#### List Truncation

**Patterns**:

- **"Show X more items"**: For long lists
- **Pagination**: For very long lists (>100 items)
- **Infinite scroll**: For continuous feeds
- **Virtual scrolling**: For performance with massive lists

**Example**: GitHub's file tree

- Shows first 10 files
- "Show more files" button
- Search to find specific files

### 6. Tabs and Navigation

**Use Case**: Organizing different categories of content

**Progressive Disclosure Aspect**:

- Only show content for active tab
- Lazy-load tab content when selected
- Use tab count badges to indicate content volume

**Best Practices**:

- Limit to 5-7 tabs for usability
- Use clear, concise labels
- Indicate active tab clearly
- Consider vertical tabs for >5 options
- Ensure keyboard navigation (arrow keys)

### 7. Hamburger Menus and Navigation Drawers

**Use Case**: Mobile-first navigation

**Best Practices**:

- Reserve for secondary navigation
- Don't hide primary actions
- Use clear icon (☰) with label when possible
- Animate drawer open/close smoothly
- Allow swipe-to-close gesture
- Dim background when drawer is open

**Controversy**:

- Can reduce discoverability
- "Out of sight, out of mind" problem
- Consider tab bar for primary navigation on mobile

### 8. Skeleton Loaders and Lazy Loading

**Use Case**: Progressive disclosure of content as it loads

**Best Practices**:

- Show skeleton screens for slow-loading content
- Load critical content first
- Use intersection observer for lazy loading
- Provide loading indicators
- Maintain layout stability (avoid content jumps)

---

## Production Examples

### 1. **GitHub** - Multi-Layer Progressive Disclosure

#### Repository Settings

**Pattern**: Hierarchical disclosure with clear visual indicators

**Structure**:

```
General Settings (always visible)
├─ Repository name
├─ Description
└─ Visibility

▶ Features (collapsed)
  ├─ Wikis
  ├─ Issues
  └─ Projects

▶ Pull Requests (collapsed)
  ├─ Allow merge commits
  └─ Automatically delete head branches

▶ Danger Zone (collapsed, red border)
  └─ Delete repository
```

**Key Insights**:

- Uses chevron icons consistently
- Color-codes dangerous actions (red)
- Groups related settings logically
- Allows multiple sections open simultaneously

#### File Tree Navigation

**Pattern**: Truncation with search

**Implementation**:

- Shows first 10 files/folders
- "Show more" button for additional items
- Search box to find specific files
- Breadcrumb navigation for deep hierarchies

**Accessibility**:

- Proper ARIA attributes (`aria-expanded`, `aria-controls`)
- Keyboard navigation support
- Screen reader announcements

### 2. **Figma** - Contextual Progressive Disclosure

#### Properties Panel

**Pattern**: Context-aware disclosure based on selection

**Behavior**:

- Select text → Show typography options
- Select shape → Show fill, stroke, effects
- Select component → Show variant properties
- Click "..." → Reveal advanced options

**Advanced Options**:

- Collapsed by default
- Expand to show:
  - Constraints
  - Layout grid
  - Export settings
  - Prototype interactions

**Key Insights**:

- Only shows relevant options for selected object
- Reduces clutter dramatically
- Power users can expand all sections
- Remembers user's expansion preferences

#### Layer Panel

**Pattern**: Hierarchical tree with expand/collapse

**Implementation**:

- Nested groups can be collapsed
- Chevron indicates expandable groups
- Drag-and-drop reordering
- Search to filter layers

### 3. **Linear** - Adaptive Forms with Smart Defaults

#### Issue Creation

**Pattern**: Progressive enhancement from simple to complex

**Default View** (Novice-friendly):

```
Title: [____________]
Description: [____________]
[Create Issue]
```

**Expanded View** (Power user):

```
Title: [____________]
Description: [____________]
▼ Show all fields
  Assignee: [____________]
  Priority: [____________]
  Labels: [____________]
  Project: [____________]
  Estimate: [____________]
  Due date: [____________]
[Create Issue]
```

**Key Features**:

- Smart defaults (auto-assigns to current user)
- Keyboard shortcuts (Cmd+K to open command palette)
- Remembers user preferences
- Quick actions for common tasks

**Usability Impact**:

- 34% increase in setup completion rates after implementing progressive disclosure
- Reduced time-to-first-issue for new users
- Power users can still access all fields quickly

#### Command Palette

**Pattern**: Progressive disclosure through search

**Implementation**:

- Press Cmd+K to open
- Type to filter actions
- Shows recent actions first
- Progressively reveals more options as you type

**Benefits**:

- Reduces menu clutter
- Faster for power users
- Discoverable for novices (shows all options)
- Keyboard-first workflow

### 4. **Notion** - Nested Blocks and Toggles

#### Toggle Blocks

**Pattern**: User-controlled disclosure for content organization

**Use Cases**:

- Collapsible sections in documents
- FAQ pages
- Meeting notes with action items
- Project documentation

**Implementation**:

```
▶ Project Overview (collapsed)
▼ Current Sprint (expanded)
  ├─ Task 1
  ├─ Task 2
  └─ Task 3
▶ Backlog (collapsed)
```

**Key Insights**:

- User controls what's visible
- Nested toggles for hierarchical content
- Persists state across sessions
- Shareable with collapse state

### 5. **Stripe Dashboard** - Layered Information Architecture

#### Payment Details

**Pattern**: Summary with drill-down

**Structure**:

```
Payment #12345 - $99.00 - Succeeded
[View Details] →

Details View:
├─ Amount: $99.00
├─ Status: Succeeded
├─ Customer: John Doe
├─ Created: 2024-01-15
└─ ▶ More details (collapsed)
    ├─ Payment method
    ├─ Billing details
    ├─ Metadata
    └─ Events timeline
```

**Key Insights**:

- Shows critical info upfront (amount, status)
- Progressive drill-down for details
- Maintains context with breadcrumbs
- Quick actions always visible

### 6. **Slack** - Adaptive UI Based on Usage

#### Channel Settings

**Pattern**: Frequency-based disclosure

**Implementation**:

- Common settings always visible (notifications, description)
- "More options" reveals less-used settings
- Admin-only options shown only to admins
- Recently used settings bubble up

**Personalization**:

- Learns from user behavior
- Surfaces frequently-used options
- Hides rarely-used features

### 7. **VS Code** - Multi-Modal Progressive Disclosure

#### Settings Interface

**Pattern**: Multiple disclosure mechanisms

**Modes**:

1. **UI Mode**: Categorized settings with search
2. **JSON Mode**: Full settings file for power users
3. **Workspace vs. User**: Contextual settings

**Progressive Disclosure Techniques**:

- Search to filter settings
- Categories collapse/expand
- Modified settings highlighted
- "Show only modified" filter

**Key Insights**:

- Offers both simple and advanced interfaces
- Doesn't force users into one mode
- Powerful search reduces need for browsing
- Keyboard shortcuts for power users

### 8. **Airtable** - Contextual Field Configuration

#### Field Settings

**Pattern**: Inline expansion for field types

**Behavior**:

- Click field header → Basic options (rename, type)
- Click "Customize field type" → Advanced options
- Different options for different field types
- Preview changes in real-time

**Example** (Single Select field):

```
Field Name: [Status]
Field Type: [Single Select ▼]

▼ Customize field type
  ├─ Options: [To Do, In Progress, Done]
  ├─ Color coding
  └─ Default value
```

### 9. **Figma** - Progressive Onboarding

#### New User Experience

**Pattern**: Gradual feature introduction

**Stages**:

1. **First Session**: Basic tools only (rectangle, text, select)
2. **After 5 minutes**: Introduce layers panel
3. **After creating 3 objects**: Show alignment tools
4. **After 10 minutes**: Introduce components
5. **After first week**: Show advanced features

**Key Insights**:

- Doesn't overwhelm new users
- Features appear when contextually relevant
- Tooltips explain new features
- Can be skipped by power users

### 10. **Webflow** - Complexity Layering

#### Style Panel

**Pattern**: Beginner to expert progression

**Levels**:

1. **Basic**: Preset styles and common properties
2. **Intermediate**: Full CSS properties organized by category
3. **Advanced**: Custom code and interactions

**Implementation**:

- Toggle between "Simple" and "Advanced" mode
- Simple mode hides CSS properties
- Advanced mode shows all options
- Remembers user preference

### 11. **Superhuman** - Command-Driven Disclosure

#### Email Actions

**Pattern**: Progressive disclosure through keyboard commands

**Default View**:

- Minimal interface (just email content)
- No visible buttons

**Progressive Disclosure**:

- Press `Cmd+K` → Show all commands
- Press `H` → Show keyboard shortcuts
- Press `?` → Show help

**Key Insights**:

- Extreme minimalism for focus
- Power users learn keyboard shortcuts
- Commands progressively revealed through search
- Reduces visual clutter to zero

### 12. **Miro** - Canvas-Based Progressive Disclosure

#### Toolbar

**Pattern**: Contextual tools based on selection

**Behavior**:

- No selection → Basic creation tools
- Select object → Object-specific tools appear
- Select multiple → Alignment and grouping tools
- Hover over tool → Show tooltip with shortcut

**Floating Toolbar**:

- Appears near selection
- Only shows relevant actions
- Disappears when not needed

---

## Mobile-First Progressive Disclosure

### Why Mobile Demands Progressive Disclosure

Mobile interfaces have inherent constraints that make progressive disclosure **essential, not optional**:

1. **Limited Screen Real Estate**: 5-6 inch screens vs. 24+ inch desktops
2. **Touch Targets**: Minimum 44x44px tap targets (Apple HIG) reduce available space
3. **Cognitive Load**: Mobile users are often distracted or multitasking
4. **Context Switching**: Harder to compare multiple screens
5. **Network Constraints**: Progressive loading conserves bandwidth

### Mobile-Specific Patterns

#### 1. Bottom Sheets

**Use Case**: Revealing additional options without leaving context

**Implementation**:

```
[Main Content]
─────────────
[Swipe up handle]
─────────────
[Additional Options]
```

**Best Practices**:

- Use drag handle to indicate swipeable
- Support both tap and swipe gestures
- Provide three states: collapsed, half-expanded, full-screen
- Dim background when expanded
- Allow swipe-down to dismiss

**Examples**:

- Google Maps (location details)
- Apple Music (now playing)
- Uber (ride options)

#### 2. Swipe Gestures for Hidden Actions

**Use Case**: Revealing contextual actions without cluttering UI

**Patterns**:

- **Swipe left**: Delete, archive (destructive actions)
- **Swipe right**: Mark as done, favorite (positive actions)
- **Long press**: Show context menu

**Best Practices**:

- Provide visual feedback during swipe
- Use color coding (red for delete, green for complete)
- Allow partial swipe to preview action
- Provide undo option for destructive actions

**Examples**:

- iOS Mail (swipe to delete/archive)
- Todoist (swipe to complete)
- Slack (swipe to mark as read)

#### 3. Expandable Cards

**Use Case**: Showing summary with tap-to-expand for details

**Structure**:

```
┌─────────────────┐
│ Card Title      │
│ Brief summary   │
│ [Tap to expand] │
└─────────────────┘

↓ (After tap)

┌─────────────────┐
│ Card Title      │
│ Full content    │
│ Additional info │
│ [Actions]       │
│ [Collapse]      │
└─────────────────┘
```

**Best Practices**:

- Show enough info to decide if expansion is needed
- Animate expansion smoothly (300ms)
- Provide clear collapse affordance
- Maintain scroll position

**Examples**:

- Twitter (tweet threads)
- Reddit (comment threads)
- News apps (article previews)

#### 4. Hamburger Menu (Controversial)

**Use Case**: Hiding navigation on mobile

**Pros**:

- Saves screen space
- Standard pattern (users understand it)
- Accommodates many menu items

**Cons**:

- Reduces discoverability ("out of sight, out of mind")
- Requires extra tap
- Can hide important features

**Best Practices**:

- Use for secondary navigation only
- Keep primary actions in tab bar
- Consider hybrid approach (hamburger + tab bar)
- Label the icon ("Menu") when space allows
- Animate menu open/close

**Alternatives**:

- **Tab Bar**: For 3-5 primary sections
- **Priority+ Pattern**: Show top items, hide rest in "More"
- **Scrollable Tabs**: For 5-8 sections

#### 5. Accordion Lists

**Use Case**: Organizing content in limited vertical space

**Mobile Optimizations**:

- Larger tap targets (minimum 44px height)
- Clear expand/collapse indicators
- Smooth animations
- Allow multiple sections open (for comparison)

**Best Practices**:

- Use chevron icons (>) that rotate when expanded
- Provide enough padding for comfortable tapping
- Consider default-open for most important section
- Persist state across sessions

#### 6. Modal Overlays

**Use Case**: Focused tasks without navigation

**Mobile Considerations**:

- Full-screen on small devices
- Swipe-down to dismiss
- Clear close button (top-right or top-left)
- Prevent background scroll
- Maintain scroll position when dismissed

**Best Practices**:

- Use sparingly (interrupts flow)
- Provide clear escape route
- Save progress automatically
- Consider bottom sheet as alternative

#### 7. Progressive Image Loading

**Use Case**: Conserving bandwidth and improving perceived performance

**Techniques**:

- **Blur-up**: Load low-res blurred image, then high-res
- **Lazy loading**: Load images as they enter viewport
- **Responsive images**: Serve appropriate size for device
- **WebP format**: Smaller file sizes

**Implementation**:

```html
<img src="low-res.jpg" data-src="high-res.jpg" loading="lazy" alt="Description" />
```

#### 8. Infinite Scroll vs. Pagination

**Use Case**: Displaying long lists on mobile

**Infinite Scroll**:

- ✅ Better for continuous feeds (social media)
- ✅ Reduces friction (no tapping "Next")
- ❌ Harder to reach footer
- ❌ Difficult to return to specific item
- ❌ Can cause performance issues

**Pagination**:

- ✅ Better for goal-oriented browsing (search results)
- ✅ Easier to return to specific page
- ✅ Better performance
- ❌ More taps required
- ❌ Interrupts flow

**Hybrid: "Load More" Button**:

- User controls when to load more
- Better performance than infinite scroll
- Clearer than pagination

#### 9. Touch-Optimized Disclosure Patterns

**Tap vs. Long Press**:

- **Single tap**: Primary action (expand/collapse)
- **Long press**: Secondary actions (context menu)
- **Double tap**: Avoid (can be accidental)

**Swipe Gestures**:

- **Horizontal swipe**: Navigate between items
- **Vertical swipe**: Scroll content
- **Diagonal swipe**: Avoid (ambiguous)

**Pinch and Zoom**:

- Allow for images and maps
- Disable for UI elements (prevents accidental zoom)

### Mobile-First Design Process

#### 1. Start with Mobile Constraints

- Design for smallest screen first (320px width)
- Identify absolutely essential features
- Everything else is progressive disclosure

#### 2. Progressive Enhancement for Larger Screens

- Add features as screen size increases
- Use responsive breakpoints:
  - Mobile: 320-767px
  - Tablet: 768-1023px
  - Desktop: 1024px+

#### 3. Touch-First Interactions

- Design for fingers, not mouse pointers
- Minimum 44x44px tap targets
- Adequate spacing between interactive elements (8px minimum)

#### 4. Performance Budget

- Limit initial page weight (<500KB)
- Lazy load non-critical content
- Use progressive web app (PWA) techniques

### Mobile Progressive Disclosure Checklist

- [ ] Primary actions visible without scrolling
- [ ] Secondary actions hidden but discoverable
- [ ] Tap targets minimum 44x44px
- [ ] Gestures have visual feedback
- [ ] Animations smooth (60fps)
- [ ] Content loads progressively
- [ ] Works offline (where applicable)
- [ ] Respects reduced motion preferences
- [ ] Supports landscape and portrait
- [ ] Tested on actual devices (not just emulators)

---

## Accessibility Considerations

### WCAG Guidelines for Progressive Disclosure

Progressive disclosure must be implemented accessibly to ensure all users can access hidden content.

#### 1. Keyboard Accessibility

**Requirements**:

- All disclosure controls must be keyboard accessible
- Use `<button>` elements (not `<div>` or `<span>`)
- Support standard keyboard interactions:
  - **Enter** or **Space**: Toggle disclosure
  - **Tab**: Navigate to next element
  - **Shift+Tab**: Navigate to previous element

**Example**:

```html
<button aria-expanded="false" aria-controls="panel-1" onclick="togglePanel()">
  Show Advanced Settings
</button>
<div id="panel-1" hidden>
  <!-- Advanced settings content -->
</div>
```

#### 2. ARIA Attributes

**Essential ARIA Patterns**:

##### `aria-expanded`

- **Purpose**: Indicates whether controlled content is expanded or collapsed
- **Values**: `true` | `false`
- **Required**: Yes, on disclosure button
- **Updates**: Must toggle when state changes

```html
<button aria-expanded="false">Show Details</button>
<!-- When expanded: -->
<button aria-expanded="true">Hide Details</button>
```

##### `aria-controls`

- **Purpose**: Links button to the content it controls
- **Value**: ID of controlled element
- **Required**: Recommended (used by JAWS screen reader)

```html
<button aria-expanded="false" aria-controls="details-panel">Show Details</button>
<div id="details-panel">
  <!-- Content -->
</div>
```

##### `aria-hidden`

- **Purpose**: Hides content from screen readers
- **Values**: `true` | `false`
- **Caution**: Use sparingly; prefer `hidden` attribute

```html
<!-- When collapsed: -->
<div aria-hidden="true">Hidden content</div>

<!-- When expanded: -->
<div aria-hidden="false">Visible content</div>
```

##### `aria-live` (for dynamic content)

- **Purpose**: Announces content changes to screen readers
- **Values**: `polite` | `assertive` | `off`
- **Use Case**: When disclosure reveals dynamic/updated content

```html
<div aria-live="polite">
  <!-- Content that updates dynamically -->
</div>
```

**Warning**: Don't use `aria-live` on large regions (like entire forms) as it causes excessive announcements.

#### 3. Focus Management

**Best Practices**:

##### When Opening Disclosure

- **Option A**: Keep focus on trigger button (recommended for small disclosures)
- **Option B**: Move focus to first interactive element in revealed content (for large disclosures like modals)

##### When Closing Disclosure

- **Always**: Return focus to trigger button
- **Reason**: Prevents focus loss and disorientation

**Example**:

```javascript
function openDisclosure(buttonId, panelId) {
  const button = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);

  button.setAttribute("aria-expanded", "true");
  panel.removeAttribute("hidden");

  // For large disclosures, move focus to first focusable element
  const firstFocusable = panel.querySelector("button, a, input, select, textarea");
  if (firstFocusable) {
    firstFocusable.focus();
  }
}

function closeDisclosure(buttonId, panelId) {
  const button = document.getElementById(buttonId);
  const panel = document.getElementById(panelId);

  button.setAttribute("aria-expanded", "false");
  panel.setAttribute("hidden", "");

  // Always return focus to trigger
  button.focus();
}
```

#### 4. Screen Reader Announcements

**What Screen Readers Announce**:

1. Button label (e.g., "Show Advanced Settings")
2. Role (e.g., "button")
3. State (e.g., "collapsed" or "expanded")
4. Additional context from `aria-label` or `aria-describedby`

**Best Practices**:

- Use descriptive button text (not just "More" or "Show")
- Avoid redundant text (don't say "Click to expand" if it's a button)
- Provide context when needed with `aria-label`

**Example**:

```html
<!-- Good: Descriptive text -->
<button aria-expanded="false" aria-controls="advanced-settings">Advanced Settings</button>

<!-- Better: Adds context -->
<button
  aria-expanded="false"
  aria-controls="advanced-settings"
  aria-label="Show advanced settings for email notifications"
>
  Advanced Settings
</button>

<!-- Bad: Not descriptive -->
<button aria-expanded="false">More</button>
```

#### 5. Hidden Content and Searchability

**The `hidden` Attribute**:

- Hides content visually AND from screen readers
- Removes from tab order
- Preferred over `display: none` or `visibility: hidden`

```html
<div hidden>This content is hidden from everyone</div>
```

**The `hidden="until-found"` Attribute** (New):

- Hides content visually but makes it searchable (Ctrl+F)
- Browser can reveal content when search finds it
- Supported in Chrome 102+, Edge 102+

```html
<div hidden="until-found">This content is hidden but searchable</div>
```

**Progressive Enhancement**:

```javascript
// Feature detection
if ("onbeforematch" in document.body) {
  // Use hidden="until-found"
  panel.setAttribute("hidden", "until-found");
} else {
  // Fallback to regular hidden
  panel.setAttribute("hidden", "");
}
```

#### 6. Color and Visual Indicators

**WCAG Requirements**:

- **Don't rely on color alone** to indicate state
- Use multiple indicators:
  - Icon (chevron, plus/minus)
  - Text ("Show" / "Hide")
  - Position/animation

**Contrast Requirements**:

- Text: Minimum 4.5:1 contrast ratio (WCAG AA)
- Icons: Minimum 3:1 contrast ratio
- Interactive elements: Minimum 3:1 contrast ratio

**Example**:

```html
<!-- Good: Multiple indicators -->
<button aria-expanded="false">
  <svg class="chevron"><!-- Chevron icon --></svg>
  <span>Show Details</span>
</button>

<!-- Bad: Color only -->
<button style="color: blue;">Details</button>
```

#### 7. Reduced Motion

**Respect User Preferences**:

- Some users experience motion sickness from animations
- Check `prefers-reduced-motion` media query
- Disable or reduce animations for these users

**Implementation**:

```css
/* Default: Smooth animation */
.disclosure-panel {
  transition: height 300ms ease-in-out;
}

/* Reduced motion: Instant transition */
@media (prefers-reduced-motion: reduce) {
  .disclosure-panel {
    transition: none;
  }
}
```

#### 8. Testing with Assistive Technology

**Essential Tests**:

##### Screen Readers

- **NVDA** (Windows, free)
- **JAWS** (Windows, paid)
- **VoiceOver** (macOS/iOS, built-in)
- **TalkBack** (Android, built-in)

**Test Checklist**:

- [ ] Button announces as "button"
- [ ] State announced as "expanded" or "collapsed"
- [ ] Content is hidden when collapsed
- [ ] Content is revealed when expanded
- [ ] Focus management works correctly
- [ ] No orphaned content (content without context)

##### Keyboard Navigation

- [ ] Can reach all disclosure controls with Tab
- [ ] Can activate with Enter or Space
- [ ] Can navigate within revealed content
- [ ] Focus visible at all times
- [ ] No keyboard traps

##### Voice Control

- [ ] Can activate by speaking button label
- [ ] Labels are unique and descriptive

#### 9. Common Accessibility Mistakes

**❌ Mistake 1: Using `<div>` instead of `<button>`**

```html
<!-- Bad: Not keyboard accessible by default -->
<div onclick="toggle()">Show More</div>

<!-- Good: Keyboard accessible -->
<button onclick="toggle()">Show More</button>
```

**❌ Mistake 2: Forgetting `aria-expanded`**

```html
<!-- Bad: Screen readers don't know state -->
<button onclick="toggle()">Show More</button>

<!-- Good: State is announced -->
<button aria-expanded="false" onclick="toggle()">Show More</button>
```

**❌ Mistake 3: Not managing focus**

```javascript
// Bad: Focus lost when content revealed
function toggle() {
  panel.classList.toggle("hidden");
}

// Good: Focus managed appropriately
function toggle() {
  const isExpanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", !isExpanded);
  panel.hidden = isExpanded;
  if (!isExpanded) {
    // Optionally move focus to first element in panel
  }
}
```

**❌ Mistake 4: Using `aria-live` on large regions**

```html
<!-- Bad: Screen reader reads entire form on every change -->
<form aria-live="polite">
  <!-- Many form fields -->
</form>

<!-- Good: Only announce specific updates -->
<div aria-live="polite" id="status-message"></div>
```

**❌ Mistake 5: Hiding content with CSS only**

```css
/* Bad: Content still in tab order and announced by screen readers */
.hidden {
  display: none;
}
```

```html
<!-- Good: Properly hidden from all users -->
<div hidden>Content</div>
```

#### 10. Accessible Disclosure Component Checklist

- [ ] Uses semantic `<button>` element
- [ ] Includes `aria-expanded` attribute
- [ ] Includes `aria-controls` attribute
- [ ] Updates `aria-expanded` when toggled
- [ ] Uses `hidden` attribute on collapsed content
- [ ] Manages focus appropriately
- [ ] Keyboard accessible (Enter/Space to toggle)
- [ ] Visible focus indicator
- [ ] Descriptive button text
- [ ] Respects `prefers-reduced-motion`
- [ ] Sufficient color contrast
- [ ] Doesn't rely on color alone
- [ ] Tested with screen readers
- [ ] Tested with keyboard only
- [ ] Works with browser zoom (up to 200%)

---

## Implementation Guide

### React Component Libraries

#### 1. Headless UI (Tailwind Labs)

**Overview**: Completely unstyled, fully accessible UI components

**Disclosure Component**:

```jsx
import { Disclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";

function Example() {
  return (
    <Disclosure>
      {({ open }) => (
        <>
          <DisclosureButton className="flex items-center gap-2">
            Advanced Settings
            <ChevronDownIcon className={`w-5 ${open ? "rotate-180" : ""}`} />
          </DisclosureButton>
          <DisclosurePanel className="text-gray-500">
            {/* Advanced settings content */}
          </DisclosurePanel>
        </>
      )}
    </Disclosure>
  );
}
```

**Features**:

- Automatic ARIA attribute management
- Keyboard navigation built-in
- Render props for styling based on state
- TypeScript support
- Works with Tailwind CSS

**Accessibility**:

- ✅ `aria-expanded` managed automatically
- ✅ `aria-controls` managed automatically
- ✅ Keyboard accessible (Enter/Space)
- ✅ Focus management

**When to Use**:

- Building with Tailwind CSS
- Need full styling control
- Want minimal bundle size
- Prefer composition over configuration

#### 2. React Aria (Adobe)

**Overview**: Hooks and components for accessible UI patterns

**Disclosure Component**:

```jsx
import { useButton, useDisclosure } from "react-aria";
import { useDisclosureState } from "react-stately";

function Disclosure(props) {
  const state = useDisclosureState(props);
  const panelRef = React.useRef(null);
  const triggerRef = React.useRef(null);

  const { buttonProps, panelProps } = useDisclosure(props, state, panelRef);
  const { buttonProps: triggerButtonProps } = useButton(buttonProps, triggerRef);

  return (
    <div>
      <button ref={triggerRef} {...triggerButtonProps}>
        {props.title}
      </button>
      <div ref={panelRef} {...panelProps}>
        {props.children}
      </div>
    </div>
  );
}

// Usage
<Disclosure title="System Requirements">Details about system requirements here.</Disclosure>;
```

**Features**:

- Comprehensive accessibility
- Internationalization support
- Adaptive interactions (mouse, touch, keyboard)
- Composable hooks
- Platform-specific behaviors

**Accessibility**:

- ✅ Full ARIA support
- ✅ Keyboard navigation
- ✅ Focus management
- ✅ Screen reader tested
- ✅ Supports `hidden="until-found"`

**When to Use**:

- Need enterprise-grade accessibility
- Building design system
- Require internationalization
- Want maximum flexibility

#### 3. Radix UI

**Overview**: Low-level UI primitives with accessibility

**Accordion Component** (for multiple disclosures):

```jsx
import * as Accordion from "@radix-ui/react-accordion";

function Example() {
  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="item-1">
        <Accordion.Header>
          <Accordion.Trigger>Basic Settings</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>{/* Basic settings content */}</Accordion.Content>
      </Accordion.Item>

      <Accordion.Item value="item-2">
        <Accordion.Header>
          <Accordion.Trigger>Advanced Settings</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content>{/* Advanced settings content */}</Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
```

**Features**:

- Unstyled primitives
- Full keyboard navigation
- Animation support
- TypeScript support
- Composable API

**When to Use**:

- Building custom design system
- Need animation control
- Want unstyled components
- Prefer declarative API

#### 4. Material-UI (MUI)

**Overview**: Comprehensive component library with Material Design

**Accordion Component**:

```jsx
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

function Example() {
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>Advanced Settings</AccordionSummary>
      <AccordionDetails>{/* Advanced settings content */}</AccordionDetails>
    </Accordion>
  );
}
```

**Features**:

- Pre-styled components
- Material Design guidelines
- Extensive customization
- Large ecosystem

**When to Use**:

- Want pre-built styles
- Following Material Design
- Need comprehensive component library
- Rapid prototyping

### Native HTML5 Pattern

**Details/Summary Element**:

```html
<details>
  <summary>Advanced Settings</summary>
  <div>
    <!-- Advanced settings content -->
  </div>
</details>
```

**Advantages**:

- No JavaScript required
- Built-in accessibility
- Works without CSS
- Searchable content (browser can find text in collapsed sections)

**Limitations**:

- Limited styling control
- No animation control (without JavaScript)
- Inconsistent browser styling

**Enhanced with JavaScript**:

```javascript
const details = document.querySelector("details");

details.addEventListener("toggle", (event) => {
  if (details.open) {
    console.log("Expanded");
  } else {
    console.log("Collapsed");
  }
});
```

### Vanilla JavaScript Implementation

**Complete Accessible Disclosure**:

```html
<button
  id="disclosure-btn"
  aria-expanded="false"
  aria-controls="disclosure-panel"
  class="disclosure-button"
>
  <svg class="chevron" viewBox="0 0 24 24">
    <path d="M9 18l6-6-6-6" />
  </svg>
  <span>Advanced Settings</span>
</button>

<div id="disclosure-panel" class="disclosure-panel" hidden>
  <!-- Content -->
</div>
```

```javascript
class Disclosure {
  constructor(buttonId, panelId) {
    this.button = document.getElementById(buttonId);
    this.panel = document.getElementById(panelId);
    this.isExpanded = false;

    this.button.addEventListener("click", () => this.toggle());
    this.button.addEventListener("keydown", (e) => this.handleKeydown(e));
  }

  toggle() {
    this.isExpanded = !this.isExpanded;
    this.button.setAttribute("aria-expanded", this.isExpanded);

    if (this.isExpanded) {
      this.panel.removeAttribute("hidden");
    } else {
      this.panel.setAttribute("hidden", "");
    }
  }

  handleKeydown(event) {
    // Enter or Space to toggle
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.toggle();
    }
  }
}

// Initialize
new Disclosure("disclosure-btn", "disclosure-panel");
```

```css
.disclosure-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.disclosure-button:hover {
  background: #f5f5f5;
}

.disclosure-button:focus-visible {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}

.chevron {
  width: 1rem;
  height: 1rem;
  transition: transform 200ms;
}

.disclosure-button[aria-expanded="true"] .chevron {
  transform: rotate(90deg);
}

.disclosure-panel {
  padding: 1rem;
  border: 1px solid #ccc;
  border-top: none;
  border-radius: 0 0 4px 4px;
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  .chevron {
    transition: none;
  }
}
```

### Animation Best Practices

**Smooth Height Transitions**:

```css
.disclosure-panel {
  overflow: hidden;
  transition: height 300ms ease-in-out;
}

/* Calculate height with JavaScript */
```

```javascript
toggle() {
  if (this.isExpanded) {
    // Expand
    this.panel.style.height = '0px'
    this.panel.removeAttribute('hidden')

    // Get natural height
    const height = this.panel.scrollHeight
    this.panel.style.height = height + 'px'

    // Remove inline height after transition
    setTimeout(() => {
      this.panel.style.height = 'auto'
    }, 300)
  } else {
    // Collapse
    this.panel.style.height = this.panel.scrollHeight + 'px'

    // Force reflow
    this.panel.offsetHeight

    this.panel.style.height = '0px'

    setTimeout(() => {
      this.panel.setAttribute('hidden', '')
    }, 300)
  }
}
```

**CSS-Only Animation** (using max-height):

```css
.disclosure-panel {
  max-height: 0;
  overflow: hidden;
  transition: max-height 300ms ease-in-out;
}

.disclosure-panel[aria-hidden="false"] {
  max-height: 1000px; /* Adjust based on content */
}
```

**Note**: `max-height` approach is simpler but less precise (animation speed varies based on content height).

---

## Decision Trees

### Decision Tree 1: Which Progressive Disclosure Pattern?

```
START: Do you need to hide content?
│
├─ YES → Continue
│
└─ NO → Don't use progressive disclosure
    └─ Show all content upfront

Is the content critical for the primary task?
│
├─ YES → Don't hide it
│   └─ Keep visible, use visual hierarchy instead
│
└─ NO → Continue

How many sections of content do you have?
│
├─ ONE section
│   │
│   └─ Use: DISCLOSURE WIDGET
│       ├─ Simple show/hide toggle
│       ├─ "Show more" / "Show less" link
│       └─ Details/Summary element
│
├─ MULTIPLE related sections (2-7)
│   │
│   └─ Use: ACCORDION
│       ├─ Allow multiple sections open
│       ├─ Use chevron icons
│       └─ Consider default-open for most important
│
└─ MANY sections (8+)
    │
    └─ Use: TABS or NAVIGATION
        ├─ Tabs for 3-7 categories
        ├─ Sidebar navigation for 8+
        └─ Add search for 15+

Is this on mobile?
│
├─ YES → Consider mobile-specific patterns
│   ├─ Bottom sheet
│   ├─ Swipe gestures
│   ├─ Expandable cards
│   └─ Modal overlays
│
└─ NO → Use desktop patterns
    ├─ Hover tooltips
    ├─ Inline expansion
    └─ Sidebar panels
```

### Decision Tree 2: Wizard vs. All-at-Once Form

```
START: How many form fields do you have?
│
├─ 1-5 fields
│   └─ Use: ALL-AT-ONCE FORM
│       └─ Single page with all fields visible
│
├─ 6-15 fields
│   │
│   └─ Are there clear logical groups?
│       │
│       ├─ YES → Use: ACCORDION FORM
│       │   └─ Group fields in collapsible sections
│       │
│       └─ NO → Use: ALL-AT-ONCE with progressive disclosure
│           └─ Basic fields visible, advanced collapsed
│
└─ 16+ fields
    │
    └─ Use: MULTI-STEP WIZARD
        └─ Break into 3-5 steps

Are there dependencies between fields?
│
├─ YES (Field B depends on Field A)
│   └─ Use: MULTI-STEP WIZARD or CONDITIONAL DISCLOSURE
│       ├─ Wizard: Show fields in sequence
│       └─ Conditional: Show Field B only when Field A is filled
│
└─ NO → Consider user expertise

Who is the primary user?
│
├─ NOVICE users
│   └─ Use: MULTI-STEP WIZARD
│       ├─ One concept per step
│       ├─ Clear progress indicator
│       └─ Helpful descriptions
│
├─ EXPERT users
│   └─ Use: ALL-AT-ONCE FORM
│       ├─ All fields visible
│       ├─ Keyboard shortcuts
│       └─ Smart defaults
│
└─ MIXED (novice + expert)
    └─ Use: ADAPTIVE FORM
        ├─ Default: Wizard mode
        ├─ Toggle: "Advanced mode" for all-at-once
        └─ Remember user preference

Is this on mobile?
│
├─ YES → Prefer MULTI-STEP WIZARD
│   └─ Limited screen space favors one step at a time
│
└─ NO → Either approach works
    └─ Choose based on user expertise
```

### Decision Tree 3: Where to Place Advanced Settings

```
START: How often are these settings used?
│
├─ Frequently (>50% of users)
│   └─ DON'T HIDE THEM
│       └─ Keep visible in main interface
│
├─ Occasionally (20-50% of users)
│   │
│   └─ Use: INLINE PROGRESSIVE DISCLOSURE
│       ├─ Collapsed by default
│       ├─ Expand in place
│       └─ Example: "▶ More options"
│
└─ Rarely (<20% of users)
    │
    └─ Use: SEPARATE ADVANCED SECTION
        ├─ Dedicated "Advanced" tab
        ├─ Modal/drawer for advanced settings
        └─ Separate settings page

Are the advanced settings related to a specific basic setting?
│
├─ YES → Use: CONTEXTUAL DISCLOSURE
│   │
│   └─ Place advanced options near related basic setting
│       └─ Example: Basic "Color" picker → Advanced "Custom hex value"
│
└─ NO → Use: GROUPED ADVANCED SECTION
    └─ Separate section for all advanced settings

How complex are the advanced settings?
│
├─ Simple (1-3 options)
│   └─ Use: INLINE EXPANSION
│       └─ Expand in place with "▶ Advanced"
│
├─ Moderate (4-10 options)
│   └─ Use: COLLAPSIBLE SECTION
│       └─ Accordion or disclosure widget
│
└─ Complex (11+ options)
    └─ Use: SEPARATE INTERFACE
        ├─ Modal overlay
        ├─ Dedicated page
        └─ Drawer/sidebar

Is this on mobile?
│
├─ YES → Use: BOTTOM SHEET or MODAL
│   └─ Full-screen overlay for advanced settings
│
└─ NO → Use: INLINE or SIDEBAR
    └─ Expand in place or show in sidebar panel
```

### Decision Tree 4: Mobile Progressive Disclosure Pattern Selection

```
START: What type of content are you hiding?
│
├─ NAVIGATION (menu items)
│   │
│   └─ How many items?
│       │
│       ├─ 3-5 items → Use: TAB BAR
│       │   └─ Always visible at bottom
│       │
│       ├─ 6-8 items → Use: PRIORITY+ PATTERN
│       │   └─ Show top items, hide rest in "More"
│       │
│       └─ 9+ items → Use: HAMBURGER MENU
│           └─ But keep primary actions in tab bar
│
├─ ACTIONS (contextual options)
│   │
│   └─ Use: SWIPE GESTURES
│       ├─ Swipe left: Delete/Archive
│       ├─ Swipe right: Complete/Favorite
│       └─ Long press: Context menu
│
├─ DETAILS (additional information)
│   │
│   └─ Use: EXPANDABLE CARDS
│       ├─ Show summary
│       ├─ Tap to expand for full details
│       └─ Smooth animation
│
├─ SETTINGS (configuration options)
│   │
│   └─ Use: BOTTOM SHEET
│       ├─ Swipe up to reveal
│       ├─ Three states: collapsed, half, full
│       └─ Dim background when open
│
└─ CONTENT (long text, images)
    │
    └─ Use: LAZY LOADING
        ├─ Load as user scrolls
        ├─ Show skeleton screens
        └─ Infinite scroll or "Load more"

Is the action destructive (delete, remove)?
│
├─ YES → Require confirmation
│   ├─ Swipe to reveal action
│   ├─ Tap to confirm
│   └─ Provide undo option
│
└─ NO → Allow direct action
    └─ Single tap or swipe

Is network speed a concern?
│
├─ YES → Use aggressive progressive disclosure
│   ├─ Lazy load images
│   ├─ Load content on demand
│   ├─ Show placeholders
│   └─ Cache aggressively
│
└─ NO → Can load more upfront
    └─ But still respect user's data plan
```

### Decision Tree 5: Accessibility-First Pattern Selection

```
START: Can this be done with native HTML?
│
├─ YES → Use native HTML
│   ├─ <details>/<summary> for disclosures
│   ├─ <button> for interactive elements
│   └─ <dialog> for modals
│
└─ NO → Continue with custom implementation

Does your component library handle accessibility?
│
├─ YES (using Headless UI, React Aria, etc.)
│   └─ Use library components
│       └─ Verify with screen reader testing
│
└─ NO → Implement manually
    │
    └─ Checklist:
        ├─ [ ] Use semantic HTML (<button>, not <div>)
        ├─ [ ] Add aria-expanded
        ├─ [ ] Add aria-controls
        ├─ [ ] Manage focus
        ├─ [ ] Keyboard accessible
        ├─ [ ] Test with screen readers

Is this a critical user flow?
│
├─ YES → Extra accessibility rigor required
│   ├─ Test with multiple screen readers
│   ├─ Test with keyboard only
│   ├─ Test with voice control
│   ├─ Get feedback from users with disabilities
│   └─ Consider WCAG AAA (not just AA)
│
└─ NO → Standard accessibility sufficient
    └─ WCAG AA compliance
        ├─ Keyboard accessible
        ├─ Screen reader compatible
        └─ Sufficient contrast

Does your disclosure include form fields?
│
├─ YES → Additional considerations
│   ├─ Ensure labels are associated
│   ├─ Provide error messages
│   ├─ Don't hide required fields
│   └─ Validate before allowing collapse
│
└─ NO → Standard disclosure pattern
    └─ Follow ARIA disclosure pattern

Will users need to find content via search (Ctrl+F)?
│
├─ YES → Use hidden="until-found"
│   └─ Content hidden but searchable
│       └─ Browser reveals when found
│
└─ NO → Use standard hidden attribute
    └─ Content fully hidden
```

---

## Usability Testing Data

### Key Metrics for Progressive Disclosure

#### 1. Task Completion Rate

**Definition**: Percentage of users who successfully complete a task

**Benchmark Data**:

- **Average task completion rate**: 78% (across 1200+ usability tasks)
- **Top quartile (75th percentile)**: 92%+
- **Bottom quartile (25th percentile)**: <49%

**Impact of Progressive Disclosure**:

- **Enterprise design case study**: Task completion rates improved by **25-30%** after implementing progressive disclosure
- **Linear case study**: **34% increase** in setup completion rates after progressive disclosure in onboarding

**How to Measure**:

```
Task Completion Rate = (Successful completions / Total attempts) × 100
```

**Target Goals**:

- **High-stakes tasks** (financial, medical): Aim for 95%+
- **Consumer web apps**: Aim for 70%+
- **Complex enterprise software**: Aim for 60%+

#### 2. Time on Task

**Definition**: How long it takes users to complete a task

**Impact of Progressive Disclosure**:

- **Reduction in time on task** indicates efficient navigation
- **Increase in time on task** may indicate confusion or difficulty finding hidden features

**Expected Outcomes**:

- **Novice users**: May take longer initially (learning where things are)
- **Expert users**: Should be faster (less clutter to scan)
- **Overall**: 10-20% reduction in time on task after users learn the interface

**How to Measure**:

```
Average Time on Task = Sum of all task times / Number of users
```

**Analysis**:

- Compare time on task before and after progressive disclosure
- Segment by user expertise (novice vs. expert)
- Track over time (does it improve as users learn?)

#### 3. Error Rate

**Definition**: Percentage of tasks completed with errors

**Impact of Progressive Disclosure**:

- **Lower error rate** suggests design is intuitive
- **Higher error rate** may indicate hidden features are too hidden

**Expected Outcomes**:

- Progressive disclosure should **reduce error rates** by 15-25%
- Fewer accidental clicks on advanced features
- Less confusion from overwhelming interfaces

**How to Measure**:

```
Error Rate = (Tasks with errors / Total tasks) × 100
```

**Common Errors**:

- Clicking wrong button (too many options)
- Missing required fields (hidden in collapsed section)
- Abandoning task (can't find needed feature)

#### 4. User Satisfaction

**Definition**: Subjective rating of user experience

**Measurement Methods**:

- **System Usability Scale (SUS)**: 10-question survey, score 0-100
- **Net Promoter Score (NPS)**: "How likely are you to recommend?"
- **Post-task ratings**: "How easy was this task?" (1-5 scale)

**Impact of Progressive Disclosure**:

- **Novice users**: Higher satisfaction (less overwhelming)
- **Expert users**: May have lower satisfaction if features are too hidden
- **Overall**: 10-15% improvement in satisfaction scores

**SUS Benchmark**:

- **Average SUS score**: 68
- **Good SUS score**: 70+
- **Excellent SUS score**: 80+

#### 5. Conversion Rates

**Definition**: Percentage of users who complete desired action (sign up, purchase, etc.)

**Impact of Progressive Disclosure**:

- **Onboarding flows**: 20-40% increase in completion rates
- **Checkout processes**: 10-15% increase in conversions
- **Form submissions**: 15-25% increase in completions

**Case Study Data**:

- **SaaS pricing page**: Increased sign-ups after using progressive disclosure to simplify complex pricing
- **Multi-step checkout**: Reduced cart abandonment by 18% with progressive disclosure

#### 6. Discoverability Metrics

**Definition**: Can users find hidden features when they need them?

**How to Measure**:

- **Success rate finding feature**: % of users who find hidden feature within 2 minutes
- **Time to discover**: How long it takes to find hidden feature
- **Clicks to discover**: Number of clicks required to reveal feature

**Target Goals**:

- **80%+ of users** should be able to find hidden features when prompted
- **<30 seconds** to discover feature
- **<3 clicks** to reveal feature

**Warning Signs**:

- <50% discovery rate → Feature is too hidden
- > 60 seconds to discover → Poor information scent
- > 5 clicks to reveal → Too many layers of disclosure

#### 7. Abandonment Rate

**Definition**: Percentage of users who start but don't complete a task

**Impact of Progressive Disclosure**:

- **Multi-step wizards**: Can reduce abandonment by 20-30%
- **Long forms**: Progressive disclosure reduces abandonment by 15-25%

**How to Measure**:

```
Abandonment Rate = (Started but not completed / Total started) × 100
```

**Analysis by Step**:

- Track where users abandon in multi-step flows
- High abandonment at specific step indicates problem
- Progressive disclosure should reduce early abandonment

### Research Findings from Studies

#### Nielsen Norman Group Findings

**Progressive Disclosure Benefits**:

1. **Improves learnability**: Novice users focus on essential features
2. **Increases efficiency**: Advanced users save time (don't scan past rarely-used features)
3. **Reduces error rates**: Prevents mistakes from overwhelming complexity

**Usability Criteria**:

1. **Correct feature split**: Essential features upfront, specialized options secondary
2. **Obvious progression**: Mechanics for accessing secondary features must be simple

**Key Quote**:

> "Deferring secondary material is also a key guideline for mobile design."

#### Enterprise Design Case Study

**Context**: Complex enterprise application with overwhelming interface

**Problem**:

- New users felt overwhelmed
- Usability testing showed participants struggled to complete basic tasks
- Cluttered interface with too many options

**Solution**: Implemented progressive disclosure

- Hid advanced features until needed
- Used contextual inquiries and shadowing for user research
- Focused on core functions for new users

**Results**:

- **Task completion rates improved by 25-30%**
- **Error rates decreased**
- **User satisfaction increased**
- Experienced users still had access to advanced features

**Metrics Tracked**:

- Task completion rates
- Time on task
- Error rate
- User satisfaction

#### Linear Onboarding Case Study

**Context**: Complex setup process for project management tool

**Problem**:

- Low completion rates for onboarding
- Users abandoned setup process

**Solution**: Progressive disclosure in onboarding flows

- Revealed information incrementally
- Prevented user overwhelm during complex setup

**Results**:

- **34% increase in setup completion rates**
- Reduced time to first value
- Higher user activation

**Key Insight**:

> "Progressive disclosure in onboarding flows reveals information incrementally to prevent user overwhelm during complex setup processes."

#### Mobile-First Research

**Finding**: Progressive disclosure is **essential** for mobile, not just desirable

**Reasons**:

1. **Limited screen real estate**: 5-6 inch screens vs. 24+ inch desktops
2. **Touch targets**: Minimum 44x44px reduces available space
3. **Cognitive load**: Mobile users often distracted or multitasking

**Patterns**:

- **Swipe to reveal**: Options hidden until swipe gesture
- **Long-press**: Context menus for secondary actions
- **Bottom sheets**: Swipe up to reveal additional options

**Key Quote**:

> "Mobile interfaces have made progressive disclosure not just desirable but essential."

### Testing Methodology

#### Usability Testing Process

**1. Define Tasks**:

- Identify critical user flows
- Create realistic scenarios
- Include both common and edge cases

**2. Recruit Participants**:

- **Novice users**: Never used the product
- **Intermediate users**: Used for 1-3 months
- **Expert users**: Used for 6+ months
- **Minimum**: 5 users per segment (Nielsen's research shows 5 users find 85% of issues)

**3. Conduct Tests**:

- **Moderated testing**: Observe users, ask questions
- **Unmoderated testing**: Users complete tasks independently
- **Think-aloud protocol**: Users verbalize their thoughts

**4. Measure Metrics**:

- Task completion rate
- Time on task
- Error rate
- User satisfaction (post-task survey)
- Qualitative feedback

**5. Analyze Results**:

- Identify patterns across users
- Segment by user expertise
- Compare before/after progressive disclosure
- Prioritize issues by severity

#### A/B Testing Progressive Disclosure

**Test Setup**:

- **Control**: Original interface (no progressive disclosure)
- **Variant**: Interface with progressive disclosure

**Metrics to Track**:

- Conversion rate
- Task completion rate
- Time on task
- Abandonment rate
- User satisfaction

**Sample Size**:

- Minimum 100 users per variant for statistical significance
- Run test for at least 1 week (to account for day-of-week variations)

**Analysis**:

- Calculate statistical significance (p-value < 0.05)
- Segment by user type (new vs. returning)
- Look for unexpected negative impacts

### Common Pitfalls and Solutions

#### Pitfall 1: Hiding Critical Features

**Problem**: Users can't find essential features

**Symptoms**:

- Low task completion rates
- High abandonment rates
- User complaints about missing features

**Solution**:

- Only hide features used by <20% of users
- Ensure clear affordances for hidden features
- Provide search functionality
- Test discoverability with users

#### Pitfall 2: Too Many Layers

**Problem**: Users have to click through multiple levels to find features

**Symptoms**:

- High time on task
- User frustration
- Abandonment

**Solution**:

- Limit to 2 levels of disclosure maximum
- Provide shortcuts for power users
- Consider flattening hierarchy

#### Pitfall 3: Inconsistent Patterns

**Problem**: Different disclosure patterns used throughout the app

**Symptoms**:

- User confusion
- Increased learning curve
- Lower efficiency

**Solution**:

- Establish design system with consistent patterns
- Use same icons and interactions throughout
- Document patterns for team

#### Pitfall 4: Poor Mobile Experience

**Problem**: Desktop patterns don't translate to mobile

**Symptoms**:

- High mobile abandonment rates
- Accidental taps
- Difficulty accessing hidden features

**Solution**:

- Design mobile-first
- Use mobile-specific patterns (bottom sheets, swipe gestures)
- Test on actual devices (not just emulators)

---

## Power User Considerations

### The Power User Paradox

Progressive disclosure creates a tension:

- **Novice users** benefit from simplified interfaces
- **Power users** need quick access to advanced features

**The Challenge**: How to serve both audiences without compromising either experience?

### Strategies for Power Users

#### 1. Keyboard Shortcuts

**Purpose**: Bypass progressive disclosure for speed

**Implementation**:

- Provide shortcuts for common actions
- Allow direct access to hidden features
- Display shortcuts in tooltips and help

**Examples**:

- **Linear**: `Cmd+K` opens command palette (bypasses all menus)
- **Superhuman**: Every action has a keyboard shortcut
- **VS Code**: `Cmd+Shift+P` opens command palette

**Best Practices**:

- Use standard conventions (Cmd+S for save, etc.)
- Make shortcuts discoverable (show in menus, tooltips)
- Allow customization for power users
- Provide cheat sheet (accessible via `?` key)

**Example Shortcuts**:

```
Cmd+K: Open command palette
Cmd+/: Toggle advanced settings
Cmd+Shift+A: Show all actions
?: Show keyboard shortcuts
```

#### 2. Command Palette

**Purpose**: Universal search for all features and actions

**Benefits**:

- Bypasses all progressive disclosure
- Faster than clicking through menus
- Discoverable (shows all available actions)
- Keyboard-first workflow

**Implementation**:

```jsx
// Triggered by Cmd+K or Ctrl+K
<CommandPalette>
  <SearchInput placeholder="Search for actions..." />
  <CommandList>
    <CommandGroup heading="Recent">
      <CommandItem>Create new workflow</CommandItem>
      <CommandItem>Edit settings</CommandItem>
    </CommandGroup>
    <CommandGroup heading="Actions">
      <CommandItem>Export data</CommandItem>
      <CommandItem>Import configuration</CommandItem>
    </CommandGroup>
  </CommandList>
</CommandPalette>
```

**Features**:

- Fuzzy search (matches partial text)
- Recent actions shown first
- Keyboard navigation (arrow keys, Enter)
- Grouped by category
- Shows keyboard shortcuts

**Examples**:

- **Linear**: Cmd+K for universal search
- **Slack**: Cmd+K for quick switcher
- **VS Code**: Cmd+Shift+P for command palette
- **Figma**: Cmd+/ for search

#### 3. "Advanced Mode" Toggle

**Purpose**: Show all features at once for power users

**Implementation**:

```
[Simple Mode] ←→ [Advanced Mode]

Simple Mode:
- Essential features only
- Progressive disclosure
- Guided workflows

Advanced Mode:
- All features visible
- No progressive disclosure
- Keyboard shortcuts prominent
```

**Best Practices**:

- Remember user preference
- Make toggle easily accessible
- Provide smooth transition between modes
- Don't hide critical features in either mode

**Example**: Webflow

- Simple mode: Preset styles and common properties
- Advanced mode: Full CSS properties and custom code

#### 4. Customizable Interface

**Purpose**: Let power users configure their own layout

**Features**:

- Rearrange panels
- Show/hide sections
- Pin frequently-used features
- Save custom layouts

**Examples**:

- **VS Code**: Customizable sidebar, panels, and toolbars
- **Figma**: Collapsible panels, customizable toolbar
- **Adobe Creative Suite**: Workspace presets

**Implementation**:

```javascript
// Save user preferences
const userPreferences = {
  expandedSections: ["advanced-settings", "integrations"],
  pinnedActions: ["export", "share", "duplicate"],
  layout: "compact",
};

localStorage.setItem("userPreferences", JSON.stringify(userPreferences));
```

#### 5. Contextual Right-Click Menus

**Purpose**: Quick access to actions without navigating menus

**Best Practices**:

- Show relevant actions for selected item
- Include keyboard shortcuts in menu
- Allow customization of menu items
- Provide "More actions" submenu for less common options

**Example**:

```
Right-click on workflow:
├─ Edit (Cmd+E)
├─ Duplicate (Cmd+D)
├─ Delete (Cmd+Backspace)
├─ ─────────────
├─ Export
├─ Share
└─ More actions ▶
    ├─ Archive
    ├─ Move to folder
    └─ View history
```

#### 6. Bulk Actions

**Purpose**: Perform actions on multiple items at once

**Implementation**:

- Multi-select with Shift+Click or Cmd+Click
- Bulk action toolbar appears when items selected
- Keyboard shortcuts for bulk actions

**Example**:

```
Select multiple workflows:
[✓ Workflow 1]
[✓ Workflow 2]
[✓ Workflow 3]

Bulk Actions: [Delete] [Archive] [Export] [Move to...]
```

#### 7. Quick Actions / Floating Action Button

**Purpose**: One-click access to most common actions

**Best Practices**:

- Position consistently (usually bottom-right)
- Show most frequently-used actions
- Expand to reveal more actions
- Keyboard shortcut to trigger

**Example**:

```
[+] Floating Action Button
  ↓ (Click to expand)
  ├─ Create workflow
  ├─ Import data
  └─ Quick settings
```

#### 8. Smart Defaults and Auto-Complete

**Purpose**: Reduce clicks for power users who know what they want

**Features**:

- Remember previous choices
- Auto-fill based on context
- Suggest next actions
- Learn from user behavior

**Example**: AI workflow automation

- User frequently creates "Slack notification" workflows
- System suggests Slack as default integration
- Pre-fills common settings based on past workflows

#### 9. URL Parameters and Deep Linking

**Purpose**: Direct access to specific views or settings

**Implementation**:

```
// Direct link to advanced settings
https://app.example.com/settings?view=advanced

// Direct link to specific workflow
https://app.example.com/workflows/123?edit=true

// Direct link with pre-filled form
https://app.example.com/create?type=webhook&trigger=github
```

**Benefits**:

- Shareable links to specific states
- Bookmarkable for frequent tasks
- Scriptable for automation

#### 10. API and CLI Access

**Purpose**: Ultimate power user tool - bypass UI entirely

**Features**:

- REST API for all actions
- CLI tool for command-line access
- Webhooks for automation
- SDKs for custom integrations

**Example**:

```bash
# CLI for power users
workflow create --name "Daily Report" --trigger "schedule:daily"
workflow list --status active
workflow export --id 123 --format json
```

### Balancing Novice and Power User Needs

#### Strategy 1: Progressive Enhancement

**Approach**: Start simple, reveal complexity as users advance

**Implementation**:

1. **First use**: Show only essential features
2. **After 5 uses**: Introduce intermediate features
3. **After 20 uses**: Show advanced features
4. **After 50 uses**: Suggest power user features (keyboard shortcuts, API)

**Tracking**:

```javascript
const userLevel = {
  uses: 23,
  level: "intermediate", // novice, intermediate, advanced, power
  featuresUnlocked: ["keyboard-shortcuts", "bulk-actions"],
};
```

#### Strategy 2: Adaptive UI

**Approach**: Interface adapts based on user behavior

**Examples**:

- Frequently-used features bubble up
- Rarely-used features hide automatically
- Shortcuts appear for repeated actions

**Implementation**:

```javascript
// Track feature usage
const featureUsage = {
  export: 45,
  share: 32,
  archive: 2,
  "advanced-settings": 1,
};

// Show frequently-used features prominently
// Hide rarely-used features in "More" menu
```

#### Strategy 3: Explicit User Segmentation

**Approach**: Ask users their expertise level

**Implementation**:

```
Welcome! What's your experience level?
○ I'm new to workflow automation
○ I've used similar tools before
○ I'm an expert (show me everything)
```

**Benefits**:

- Immediate customization
- No guessing user level
- Can change later in settings

**Drawbacks**:

- Adds friction to onboarding
- Users may not know their level
- Can feel patronizing

#### Strategy 4: Contextual Help

**Approach**: Provide help when users need it, hide when they don't

**Features**:

- Tooltips on hover (desktop)
- Info icons (ℹ️) for additional help
- Inline documentation
- "Learn more" links to detailed docs

**Progressive Disclosure of Help**:

- **Novice**: Show all tooltips and help text
- **Intermediate**: Show tooltips on hover only
- **Expert**: Hide all help by default, accessible via `?` key

### Power User Feedback

**Common Complaints**:

1. "I can't find the feature I need"
2. "Too many clicks to do simple tasks"
3. "The interface is too hand-holdy"
4. "I want to customize the layout"
5. "Where are the keyboard shortcuts?"

**Solutions**:

1. Provide command palette for universal search
2. Add keyboard shortcuts for common actions
3. Offer "Advanced mode" toggle
4. Allow interface customization
5. Display shortcuts in tooltips and provide cheat sheet

**Gathering Feedback**:

- In-app feedback widget
- User interviews with power users
- Analytics on feature usage
- Monitor support tickets for patterns

### Power User Onboarding

**Challenge**: Power users skip traditional onboarding

**Solutions**:

#### 1. Fast-Track Onboarding

```
Welcome! Choose your path:
○ Show me around (guided tour)
○ I know what I'm doing (skip to dashboard)
```

#### 2. Keyboard Shortcut Tour

```
Quick tip: Press Cmd+K to open the command palette
[Show more shortcuts] [Skip]
```

#### 3. Import from Competitors

```
Switching from [Competitor]?
[Import your data] → Automatically configure based on previous tool
```

#### 4. Template Library

```
Start with a template:
- Slack notification workflow
- GitHub integration
- Daily report automation
[Browse all templates] [Start from scratch]
```

### Measuring Power User Satisfaction

**Metrics**:

1. **Feature adoption rate**: % of power users using advanced features
2. **Keyboard shortcut usage**: % of actions performed via shortcuts
3. **Time to complete tasks**: Should decrease as users become experts
4. **Retention rate**: Power users should have higher retention
5. **NPS by user segment**: Compare novice vs. power user satisfaction

**Qualitative Feedback**:

- User interviews with power users
- Feature requests from advanced users
- Support tickets about missing features

---

## Onboarding Implications

### The Onboarding Challenge

Progressive disclosure creates a unique challenge for onboarding:

- **Too much disclosure**: Overwhelms new users
- **Too little disclosure**: Users don't discover features
- **Goal**: Guide users to value while teaching them the interface

### Onboarding Strategies with Progressive Disclosure

#### 1. Gradual Feature Introduction

**Approach**: Introduce features progressively over time, not all at once

**Implementation**:

```
Session 1: Core features only
  ├─ Create basic workflow
  ├─ Run workflow
  └─ View results

Session 2: Introduce intermediate features
  ├─ Schedule workflows
  ├─ Add conditions
  └─ View history

Session 3: Introduce advanced features
  ├─ Custom integrations
  ├─ Advanced settings
  └─ API access
```

**Benefits**:

- Reduces initial cognitive load
- Builds confidence incrementally
- Prevents feature blindness (users ignore features shown too early)

**Example**: Figma

- First session: Basic tools only (rectangle, text, select)
- After 5 minutes: Introduce layers panel
- After creating 3 objects: Show alignment tools
- After 10 minutes: Introduce components

#### 2. Contextual Onboarding

**Approach**: Teach features when users need them, not before

**Implementation**:

```
User creates first workflow:
  → Show tooltip: "Add a trigger to start your workflow"

User adds trigger:
  → Show tooltip: "Now add an action to perform"

User adds action:
  → Show tooltip: "Click 'Test' to try your workflow"
```

**Benefits**:

- Information is immediately relevant
- Users learn by doing
- Reduces upfront learning curve

**Techniques**:

- **Tooltips**: Brief explanations at point of use
- **Modals**: More detailed guidance for complex features
- **Hotspots**: Pulsing indicators for new features
- **Empty states**: Guidance when no data exists

**Example**: Notion

- Empty page shows template suggestions
- First database shows column type options
- First formula shows example formulas

#### 3. Progressive Onboarding Checklist

**Approach**: Guide users through key tasks with a checklist

**Implementation**:

```
Get Started with [Product]
☐ Create your first workflow
☐ Add a trigger
☐ Add an action
☐ Test your workflow
☐ Activate your workflow

[2/5 completed]
```

**Benefits**:

- Clear progress indication
- Sense of accomplishment
- Guides users to activation

**Best Practices**:

- Keep to 5-7 tasks maximum
- Make tasks achievable in <5 minutes each
- Allow dismissal (don't force completion)
- Celebrate completion

**Examples**:

- **Slack**: Workspace setup checklist
- **GitHub**: Repository setup guide
- **Asana**: Project onboarding tasks

#### 4. Interactive Tutorials

**Approach**: Hands-on guided tour of key features

**Types**:

##### Product Tours

- Overlay highlights key UI elements
- Step-by-step walkthrough
- Can be skipped or replayed

**Example**:

```
Step 1/5: This is the workflow builder
[Highlight workflow canvas]
[Next] [Skip tour]

Step 2/5: Click here to add a trigger
[Highlight trigger button]
[Next] [Back]
```

##### Interactive Demos

- Simulated environment
- Users perform actual tasks
- Immediate feedback

**Example**:

```
Try it yourself: Create a workflow
1. Click "New Workflow"
2. Select "Schedule" trigger
3. Choose "Daily at 9am"
[Correct! ✓] [Next step]
```

##### Video Tutorials

- Short (<2 minute) videos
- Show common workflows
- Accessible from help menu

**Best Practices**:

- Keep tours short (5 steps maximum)
- Allow skipping
- Provide replay option
- Don't block the interface

#### 5. Empty States as Onboarding

**Approach**: Use empty states to guide first actions

**Implementation**:

```
No workflows yet

Get started by creating your first workflow:
[Create Workflow]

Or explore templates:
[Browse Templates]

Need help? [Watch tutorial]
```

**Benefits**:

- Contextual guidance
- Reduces blank canvas anxiety
- Suggests next action

**Best Practices**:

- Provide clear call-to-action
- Offer multiple paths (create, import, template)
- Include helpful resources
- Use friendly, encouraging tone

**Examples**:

- **Airtable**: Empty base shows template gallery
- **Figma**: Empty file shows starter templates
- **Linear**: Empty project shows issue creation guide

#### 6. Tiered Onboarding

**Approach**: Different onboarding for different user types

**Segments**:

##### Novice Users

- Full guided tour
- Step-by-step tutorials
- Extensive tooltips
- Template-based start

##### Experienced Users (from competitors)

- Quick comparison guide
- Import from competitor
- Keyboard shortcut cheat sheet
- Skip to advanced features

##### Power Users (returning)

- "What's new" highlights
- Skip onboarding
- Direct to dashboard

**Implementation**:

```
Welcome! Tell us about yourself:
○ I'm new to workflow automation
  → Full onboarding with tutorials
○ I'm switching from [Competitor]
  → Quick migration guide + import
○ I'm already familiar with [Product]
  → Skip to dashboard
```

#### 7. Progressive Disclosure in Onboarding Flows

**Approach**: Multi-step onboarding with progressive complexity

**Example**: Account Setup Wizard

```
Step 1: Basic Info (always required)
  ├─ Name
  ├─ Email
  └─ Password

Step 2: Workspace Setup (required)
  ├─ Workspace name
  └─ Team size

Step 3: Integrations (optional)
  ├─ Connect Slack
  ├─ Connect GitHub
  └─ [Skip for now]

Step 4: Advanced Settings (optional, collapsed)
  ▶ Show advanced options
    ├─ Custom domain
    ├─ SSO configuration
    └─ API access
```

**Benefits**:

- Required info upfront
- Optional info can be skipped
- Advanced options hidden but accessible

**Best Practices**:

- Show progress indicator
- Allow skipping optional steps
- Save progress automatically
- Provide "Back" button
- Summarize choices before final submission

#### 8. Onboarding Metrics

**Key Metrics**:

##### Time to First Value (TTFV)

- How long until user completes first meaningful action
- **Target**: <5 minutes for simple products, <15 minutes for complex

##### Activation Rate

- % of users who complete key onboarding tasks
- **Target**: 60%+ activation within first session

##### Onboarding Completion Rate

- % of users who complete full onboarding flow
- **Target**: 40%+ for multi-step onboarding

##### Feature Discovery Rate

- % of users who discover key features within first week
- **Target**: 70%+ for essential features

##### Retention by Onboarding Completion

- Compare retention of users who completed vs. skipped onboarding
- **Expected**: 2-3x higher retention for completed onboarding

**Tracking**:

```javascript
// Track onboarding progress
const onboardingProgress = {
  userId: "123",
  startedAt: "2024-01-15T10:00:00Z",
  completedSteps: ["account-setup", "first-workflow"],
  skippedSteps: ["integrations"],
  completedAt: null,
  timeToFirstValue: 180, // seconds
};
```

#### 9. Common Onboarding Mistakes

**❌ Mistake 1: Too Much Upfront**

- Showing all features in initial tour
- Overwhelming new users
- Feature blindness (users ignore everything)

**✅ Solution**: Progressive feature introduction over time

**❌ Mistake 2: Forced Tutorials**

- Blocking interface with modal tours
- Not allowing skip
- Frustrating experienced users

**✅ Solution**: Make tutorials optional, easily dismissible

**❌ Mistake 3: Generic Onboarding**

- Same experience for all users
- Not accounting for expertise level
- Boring for power users, overwhelming for novices

**✅ Solution**: Tiered onboarding based on user type

**❌ Mistake 4: No Clear Goal**

- Onboarding doesn't lead to value
- Users complete tour but don't know what to do next
- High drop-off after onboarding

**✅ Solution**: Focus on time to first value, not feature coverage

**❌ Mistake 5: Hiding Critical Features**

- Important features buried in progressive disclosure
- Users don't discover them during onboarding
- Low feature adoption

**✅ Solution**: Explicitly introduce key features during onboarding

#### 10. Onboarding Best Practices

**✅ Focus on Value, Not Features**

- Guide users to complete meaningful task
- Don't just show where buttons are
- Celebrate first success

**✅ Respect User Time**

- Keep onboarding <10 minutes
- Allow skipping
- Save progress

**✅ Provide Multiple Learning Paths**

- Interactive tutorial
- Video walkthrough
- Written documentation
- Template library

**✅ Make Onboarding Replayable**

- "Help" menu with tutorial replay
- Tooltips accessible anytime
- Documentation always available

**✅ Measure and Iterate**

- Track completion rates
- Identify drop-off points
- A/B test onboarding flows
- Gather user feedback

### Onboarding Checklist

- [ ] Onboarding focuses on time to first value
- [ ] Users can skip or dismiss tutorials
- [ ] Progress is saved automatically
- [ ] Different paths for different user types
- [ ] Key features explicitly introduced
- [ ] Empty states provide guidance
- [ ] Onboarding is replayable from help menu
- [ ] Metrics tracked (TTFV, activation, completion)
- [ ] Regular iteration based on data
- [ ] Tested with actual users

---

## Conclusion

Progressive disclosure is a powerful UX pattern for managing complexity in SaaS applications, but it must be implemented thoughtfully:

### Key Takeaways

1. **Use Progressive Disclosure When**:
   - Complex workflows with many options
   - Diverse user base (novice to expert)
   - Limited screen real estate (especially mobile)
   - Advanced settings used by <20% of users

2. **Avoid Progressive Disclosure When**:
   - Critical information users need immediately
   - Frequently-used features (>80% of sessions)
   - Simple interfaces with minimal complexity

3. **Accessibility is Non-Negotiable**:
   - Use semantic HTML (`<button>`, `<details>`)
   - Implement proper ARIA attributes (`aria-expanded`, `aria-controls`)
   - Manage focus appropriately
   - Test with screen readers and keyboard-only navigation

4. **Balance Novice and Power User Needs**:
   - Provide keyboard shortcuts and command palette
   - Offer "Advanced mode" toggle
   - Allow interface customization
   - Implement adaptive UI based on usage

5. **Mobile Demands Progressive Disclosure**:
   - Limited screen space makes it essential
   - Use mobile-specific patterns (bottom sheets, swipe gestures)
   - Design mobile-first, enhance for desktop

6. **Onboarding Requires Special Attention**:
   - Introduce features gradually over time
   - Focus on time to first value
   - Provide contextual help when needed
   - Measure and iterate based on data

7. **Test, Measure, Iterate**:
   - Track task completion rates, time on task, error rates
   - Conduct usability testing with real users
   - A/B test different disclosure patterns
   - Gather qualitative feedback

### Final Recommendations for AI Workflow Automation Platform

**For Your Context** (complex AI workflow automation, novice to expert users):

1. **Use Multi-Step Wizards** for workflow creation (novice-friendly)
2. **Provide Command Palette** (Cmd+K) for power users
3. **Hide Advanced AI Parameters** behind "Advanced Settings" disclosure
4. **Use Contextual Disclosure** for integration options (show relevant options based on selected trigger)
5. **Implement Bottom Sheets** on mobile for additional options
6. **Provide Template Library** for quick starts
7. **Offer "Simple/Advanced" Mode Toggle** for different user types
8. **Use Progressive Onboarding** with gradual feature introduction
9. **Ensure Full Accessibility** with ARIA attributes and keyboard navigation
10. **Measure Everything** and iterate based on user behavior

### Resources

**Design Systems with Progressive Disclosure**:

- [GitHub Primer](https://primer.style/ui-patterns/progressive-disclosure/)
- [GitLab Pajamas](https://design.gitlab.com/patterns/progressive-disclosure/)
- [Orbit Design System](https://orbit.kiwi/design-patterns/progressive-disclosure/)

**Component Libraries**:

- [Headless UI](https://headlessui.com/react/disclosure)
- [React Aria](https://react-aria.adobe.com/Disclosure)
- [Radix UI](https://www.radix-ui.com/primitives/docs/components/accordion)

**Accessibility Guidelines**:

- [W3C ARIA Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

**Research and Articles**:

- [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
- [Interaction Design Foundation](https://www.interaction-design.org/literature/topics/progressive-disclosure)

---

**Document Version**: 1.0  
**Last Updated**: January 2024  
**Author**: AI UX Research Team  
**License**: MIT
