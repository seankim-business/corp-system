# WCAG 2.1 AA Accessibility Patterns

> **Comprehensive guide for implementing WCAG 2.1 Level AA compliance in Nubabel**

**Last Updated**: 2026-01-26  
**Status**: Production Guide  
**Compliance Target**: WCAG 2.1 Level AA

---

## Table of Contents

1. [Current Accessibility Status](#current-accessibility-status)
2. [Color Contrast (1.4.3)](#1-color-contrast-143)
3. [Keyboard Navigation (2.1.1)](#2-keyboard-navigation-211)
4. [Screen Reader Support](#3-screen-reader-support)
5. [ARIA Attributes](#4-aria-attributes)
6. [Focus Management (2.4.7)](#5-focus-management-247)
7. [Skip Links (2.4.1)](#6-skip-links-241)
8. [Testing Tools](#7-testing-tools)
9. [Implementation Checklist](#8-implementation-checklist)
10. [Code Examples](#9-code-examples)

---

## Current Accessibility Status

### ✅ Implemented Features

- **Focus Styles**: Basic focus rings on form inputs (`focus:ring-2 focus:ring-indigo-500`)
- **Semantic HTML**: Proper use of `<header>`, `<aside>`, `<nav>`, `<main>` elements
- **Color Palette**: Tailwind default colors with good contrast ratios

### ❌ Missing Critical Features

- **No ARIA attributes** (roles, labels, live regions)
- **No keyboard navigation** for interactive components
- **No skip links** for keyboard users
- **No screen reader announcements** for dynamic content
- **No focus trap** in modals
- **No alt text** on images
- **Insufficient color contrast** in some UI elements

### 🎯 Priority Fixes (High Impact)

1. Add skip navigation links
2. Implement keyboard navigation for modals and dropdowns
3. Add ARIA labels and roles
4. Ensure 4.5:1 contrast ratio for all text
5. Add focus trap in ExecuteWorkflowModal
6. Implement screen reader announcements for status changes

---

## 1. Color Contrast (1.4.3)

### WCAG 2.1 AA Requirements

- **Normal text** (< 18pt): Minimum 4.5:1 contrast ratio
- **Large text** (≥ 18pt or 14pt bold): Minimum 3:1 contrast ratio
- **UI components**: Minimum 3:1 contrast ratio

### Current Color Analysis

#### ✅ Passing Combinations

| Foreground                  | Background                | Ratio      | Usage                  |
| --------------------------- | ------------------------- | ---------- | ---------------------- |
| `text-gray-900` (#111827)   | `bg-white` (#FFFFFF)      | **15.3:1** | Headings, body text    |
| `text-indigo-600` (#4F46E5) | `bg-white` (#FFFFFF)      | **8.6:1**  | Primary buttons, links |
| `text-white` (#FFFFFF)      | `bg-indigo-600` (#4F46E5) | **8.6:1**  | Button text            |
| `text-green-800` (#166534)  | `bg-green-100` (#DCFCE7)  | **7.2:1**  | Success messages       |
| `text-red-800` (#991B1B)    | `bg-red-100` (#FEE2E2)    | **8.1:1**  | Error messages         |

#### ⚠️ Borderline/Failing Combinations

| Foreground                  | Background               | Ratio     | Issue          | Fix                         |
| --------------------------- | ------------------------ | --------- | -------------- | --------------------------- |
| `text-gray-500` (#6B7280)   | `bg-white` (#FFFFFF)     | **4.6:1** | Barely passes  | Use `text-gray-600` (5.9:1) |
| `text-gray-500` (#6B7280)   | `bg-gray-50` (#F9FAFB)   | **4.2:1** | **FAILS**      | Use `text-gray-700` (7.5:1) |
| `text-indigo-600` (#4F46E5) | `bg-indigo-50` (#EEF2FF) | **6.8:1** | Passes but low | Consider darker shade       |
| `text-blue-800` (#1E40AF)   | `bg-blue-50` (#EFF6FF)   | **8.9:1** | Passes         | ✅ OK                       |

### Recommended Color Palette

```css
/* Primary Colors (Indigo) */
--color-primary-50: #eef2ff; /* Backgrounds */
--color-primary-600: #4f46e5; /* Interactive elements */
--color-primary-700: #4338ca; /* Hover states */

/* Neutral Colors (Gray) */
--color-gray-50: #f9fafb; /* Page background */
--color-gray-100: #f3f4f6; /* Card backgrounds */
--color-gray-600: #4b5563; /* Secondary text (5.9:1) */
--color-gray-700: #374151; /* Body text (9.7:1) */
--color-gray-900: #111827; /* Headings (15.3:1) */

/* Semantic Colors */
--color-success: #166534; /* Green-800 (7.2:1 on green-100) */
--color-error: #991b1b; /* Red-800 (8.1:1 on red-100) */
--color-warning: #92400e; /* Yellow-800 (7.5:1 on yellow-100) */
--color-info: #1e40af; /* Blue-800 (8.9:1 on blue-50) */
```

### Implementation Pattern

```tsx
// ❌ BAD: Insufficient contrast
<p className="text-gray-500">Secondary text</p>

// ✅ GOOD: Sufficient contrast (5.9:1)
<p className="text-gray-600">Secondary text</p>

// ❌ BAD: Gray text on gray background
<div className="bg-gray-50">
  <span className="text-gray-500">Fails WCAG</span>
</div>

// ✅ GOOD: Darker text on light background
<div className="bg-gray-50">
  <span className="text-gray-700">Passes WCAG (7.5:1)</span>
</div>
```

---

## 2. Keyboard Navigation (2.1.1)

### WCAG 2.1 AA Requirements

- All functionality available via keyboard
- No keyboard traps (except modals with proper escape)
- Logical tab order
- Visible focus indicators

### Current Issues

1. **Dropdown menus** (OrganizationSwitcher): No keyboard support
2. **Modals** (ExecuteWorkflowModal): No focus trap or escape key
3. **Custom buttons**: Missing keyboard event handlers
4. **Tab order**: Not explicitly managed

### Implementation Patterns

#### Dropdown Menu (OrganizationSwitcher)

```tsx
import { useState, useRef, useEffect } from "react";

export default function OrganizationSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        setIsOpen(!isOpen);
        break;
      case "Escape":
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex((prev) => Math.min(prev + 1, organizations.length - 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setFocusedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setFocusedIndex(organizations.length - 1);
        break;
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select organization"
        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <span>{currentOrg?.name}</span>
        <ChevronDownIcon className="w-4 h-4" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Organizations"
          className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20"
        >
          {organizations.map((org, index) => (
            <div
              key={org.id}
              role="option"
              aria-selected={org.id === currentOrg?.id}
              tabIndex={focusedIndex === index ? 0 : -1}
              onClick={() => handleOrgSwitch(org.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOrgSwitch(org.id);
                }
              }}
              className={`px-4 py-3 cursor-pointer ${
                focusedIndex === index
                  ? "bg-indigo-50 outline outline-2 outline-indigo-500"
                  : org.id === currentOrg?.id
                    ? "bg-indigo-50 text-indigo-700"
                    : "hover:bg-gray-100 text-gray-700"
              }`}
            >
              <div className="font-medium">{org.name}</div>
              <div className="text-xs text-gray-500">{org.domain}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### Modal with Focus Trap (ExecuteWorkflowModal)

```tsx
import { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";

export default function ExecuteWorkflowModal({ isOpen, onClose, workflow }) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap hook
  useFocusTrap(modalRef, isOpen);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-40 flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 id="modal-title" className="text-xl font-semibold text-gray-900">
            Execute Workflow: {workflow.name}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">{/* Modal content */}</div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            Execute
          </button>
        </div>
      </div>
    </div>
  );
}
```

#### Focus Trap Hook

```tsx
// hooks/useFocusTrap.ts
import { useEffect } from "react";

export function useFocusTrap(ref: React.RefObject<HTMLElement>, isActive: boolean) {
  useEffect(() => {
    if (!isActive || !ref.current) return;

    const element = ref.current;
    const focusableElements = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Focus first element on mount
    firstElement?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    element.addEventListener("keydown", handleTab);
    return () => element.removeEventListener("keydown", handleTab);
  }, [ref, isActive]);
}
```

---

## 3. Screen Reader Support

### WCAG 2.1 AA Requirements

- Meaningful text alternatives (1.1.1)
- Programmatically determined information (1.3.1)
- Sensory characteristics not sole method (1.3.3)
- Status messages announced (4.1.3)

### Implementation Patterns

#### Image Alt Text

```tsx
// ❌ BAD: Missing alt text
<img src={user.picture} className="w-8 h-8 rounded-full" />

// ✅ GOOD: Descriptive alt text
<img
  src={user.picture}
  alt={`${user.name}'s profile picture`}
  className="w-8 h-8 rounded-full"
/>

// ✅ GOOD: Decorative image (empty alt)
<img src="/decorative-pattern.svg" alt="" role="presentation" />
```

#### Status Messages (Live Regions)

```tsx
import { useState, useEffect } from "react";

export default function ExecuteWorkflowModal() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [announcement, setAnnouncement] = useState("");

  const handleExecute = async () => {
    setStatus("loading");
    setAnnouncement("Executing workflow, please wait");

    try {
      await executeWorkflow();
      setStatus("success");
      setAnnouncement("Workflow executed successfully");
    } catch (error) {
      setStatus("error");
      setAnnouncement(`Error: ${error.message}`);
    }
  };

  return (
    <>
      {/* Screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Visual status */}
      {status === "loading" && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
          <div
            className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-blue-600"
            role="img"
            aria-label="Loading"
          />
          <span className="text-blue-800">Executing workflow...</span>
        </div>
      )}

      {status === "success" && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <span className="text-green-600 text-xl" aria-hidden="true">
            ✓
          </span>
          <span className="text-green-800">Workflow executed successfully!</span>
        </div>
      )}
    </>
  );
}
```

#### Screen Reader Only Text

```css
/* styles/index.css */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.sr-only-focusable:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

---

## 4. ARIA Attributes

### Essential ARIA Patterns

#### Landmark Roles

```tsx
// Header.tsx
<header role="banner" className="h-16 bg-white border-b border-gray-200">
  <nav role="navigation" aria-label="Main navigation">
    {/* Navigation items */}
  </nav>
</header>

// Sidebar.tsx
<aside role="complementary" aria-label="Sidebar navigation">
  <nav role="navigation" aria-label="Primary">
    {/* Nav items */}
  </nav>
</aside>

// DashboardLayout.tsx
<main role="main" id="main-content" className="ml-64 mt-16 p-8">
  {children}
</main>
```

#### Button Labels

```tsx
// ❌ BAD: Icon-only button without label
<button onClick={onClose}>
  <XMarkIcon className="w-6 h-6" />
</button>

// ✅ GOOD: Accessible label
<button onClick={onClose} aria-label="Close modal">
  <XMarkIcon className="w-6 h-6" />
</button>

// ✅ BETTER: Visible text + icon
<button onClick={onClose}>
  <XMarkIcon className="w-5 h-5" />
  <span>Close</span>
</button>
```

#### Form Labels

```tsx
// ❌ BAD: Placeholder as label
<input
  type="text"
  placeholder="Enter API key"
  className="w-full px-4 py-2 border"
/>

// ✅ GOOD: Explicit label
<label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
  Notion API Key
</label>
<input
  id="apiKey"
  type="text"
  placeholder="secret_..."
  aria-describedby="apiKey-help"
  className="w-full px-4 py-2 border"
/>
<p id="apiKey-help" className="mt-2 text-sm text-gray-500">
  Get your API key from Notion settings
</p>
```

#### Loading States

```tsx
// ❌ BAD: No indication for screen readers
<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-600" />

// ✅ GOOD: Accessible loading indicator
<div
  role="status"
  aria-live="polite"
  aria-label="Loading workflows"
  className="flex flex-col items-center justify-center py-12"
>
  <div
    className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"
    aria-hidden="true"
  />
  <p className="mt-4 text-gray-600">Loading workflows...</p>
</div>
```

#### Tables

```tsx
// ExecutionsPage.tsx
<table className="min-w-full divide-y divide-gray-200">
  <caption className="sr-only">Workflow execution history</caption>
  <thead className="bg-gray-50">
    <tr>
      <th scope="col" className="px-6 py-3 text-left">
        Workflow
      </th>
      <th scope="col" className="px-6 py-3 text-left">
        Status
      </th>
      <th scope="col" className="px-6 py-3 text-left">
        Started
      </th>
      <th scope="col" className="px-6 py-3 text-left">
        Duration
      </th>
    </tr>
  </thead>
  <tbody className="bg-white divide-y divide-gray-200">
    {executions.map((execution) => (
      <tr key={execution.id}>
        <td className="px-6 py-4">{execution.workflow.name}</td>
        <td className="px-6 py-4">
          <span
            className={getStatusBadgeClass(execution.status)}
            role="status"
            aria-label={`Status: ${execution.status}`}
          >
            {execution.status}
          </span>
        </td>
        <td className="px-6 py-4">
          <time dateTime={execution.startedAt}>{formatDate(execution.startedAt)}</time>
        </td>
        <td className="px-6 py-4">{execution.duration}</td>
      </tr>
    ))}
  </tbody>
</table>
```

---

## 5. Focus Management (2.4.7)

### WCAG 2.1 AA Requirements

- Visible focus indicator (2.4.7)
- Focus order follows logical sequence (2.4.3)
- Focus not trapped (except modals)

### Implementation Patterns

#### Custom Focus Styles

```css
/* styles/index.css */

/* Remove default outline, add custom ring */
*:focus {
  outline: none;
}

/* Visible focus indicator for keyboard users */
*:focus-visible {
  outline: 2px solid #4f46e5; /* indigo-600 */
  outline-offset: 2px;
}

/* Button focus styles */
button:focus-visible {
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.3);
}

/* Link focus styles */
a:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
  border-radius: 2px;
}

/* Input focus styles */
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  border-color: #4f46e5;
  box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}
```

#### Focus Management in React

```tsx
import { useEffect, useRef } from "react";

export default function WorkflowsPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus heading on page load for screen readers
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-3xl font-bold text-gray-900 mb-2 focus:outline-none"
      >
        Workflows
      </h1>
      {/* Page content */}
    </div>
  );
}
```

#### Skip to Content After Navigation

```tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function DashboardLayout({ children }) {
  const location = useLocation();

  // Focus main content after navigation
  useEffect(() => {
    const mainContent = document.getElementById("main-content");
    mainContent?.focus();
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <Sidebar />
      <main id="main-content" tabIndex={-1} className="ml-64 mt-16 p-8 focus:outline-none">
        {children}
      </main>
    </div>
  );
}
```

---

## 6. Skip Links (2.4.1)

### WCAG 2.1 AA Requirements

- Bypass blocks of repeated content (2.4.1)
- Multiple ways to locate pages (2.4.5)

### Implementation

```tsx
// components/SkipLinks.tsx
export default function SkipLinks() {
  return (
    <div className="skip-links">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <a href="#navigation" className="skip-link">
        Skip to navigation
      </a>
    </div>
  );
}
```

```css
/* styles/index.css */
.skip-links {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 9999;
}

.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #4f46e5;
  color: white;
  padding: 8px 16px;
  text-decoration: none;
  border-radius: 0 0 4px 0;
  font-weight: 600;
  transition: top 0.2s;
}

.skip-link:focus {
  top: 0;
  outline: 2px solid white;
  outline-offset: -4px;
}
```

```tsx
// App.tsx
import SkipLinks from "./components/SkipLinks";

export default function App() {
  return (
    <>
      <SkipLinks />
      <BrowserRouter>
        <Routes>{/* Routes */}</Routes>
      </BrowserRouter>
    </>
  );
}
```

---

## 7. Testing Tools

### Automated Testing

#### 1. **axe DevTools** (Browser Extension)

- **Install**: [Chrome](https://chrome.google.com/webstore/detail/axe-devtools-web-accessib/lhdoppojpmngadmnindnejefpokejbdd) | [Firefox](https://addons.mozilla.org/en-US/firefox/addon/axe-devtools/)
- **Usage**: Open DevTools → axe DevTools tab → Scan page
- **Detects**: WCAG violations, best practices, experimental issues

#### 2. **WAVE** (Web Accessibility Evaluation Tool)

- **Install**: [Chrome](https://chrome.google.com/webstore/detail/wave-evaluation-tool/jbbplnpkjmmeebjpijfedlgcdilocofh) | [Firefox](https://addons.mozilla.org/en-US/firefox/addon/wave-accessibility-tool/)
- **Usage**: Click extension icon → View report
- **Detects**: Errors, alerts, features, structural elements

#### 3. **Lighthouse** (Built into Chrome DevTools)

- **Usage**: DevTools → Lighthouse → Accessibility audit
- **Detects**: WCAG violations, performance, SEO issues
- **Score**: 0-100 accessibility score

#### 4. **Pa11y** (CLI Tool)

```bash
# Install
npm install -g pa11y

# Test single page
pa11y http://localhost:5173/dashboard

# Test with specific standard
pa11y --standard WCAG2AA http://localhost:5173

# Generate HTML report
pa11y --reporter html http://localhost:5173 > report.html
```

#### 5. **axe-core** (Automated Testing in Jest)

```bash
npm install --save-dev @axe-core/react jest-axe
```

```tsx
// __tests__/accessibility/LoginPage.test.tsx
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import LoginPage from "../../pages/LoginPage";

expect.extend(toHaveNoViolations);

describe("LoginPage Accessibility", () => {
  it("should have no accessibility violations", async () => {
    const { container } = render(<LoginPage />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### Manual Testing

#### 6. **Keyboard Navigation Testing**

**Test Checklist**:

- [ ] Tab through all interactive elements
- [ ] Shift+Tab navigates backwards
- [ ] Enter/Space activates buttons
- [ ] Arrow keys navigate dropdowns/menus
- [ ] Escape closes modals/dropdowns
- [ ] No keyboard traps

**Test Script**:

```bash
# 1. Open page
# 2. Press Tab repeatedly
# 3. Verify focus indicator visible on each element
# 4. Verify logical tab order
# 5. Test all interactive components
```

#### 7. **Screen Reader Testing**

**Tools**:

- **macOS**: VoiceOver (Cmd+F5)
- **Windows**: NVDA (free) or JAWS (paid)
- **Linux**: Orca

**Test Checklist**:

- [ ] All images have alt text
- [ ] Form labels announced correctly
- [ ] Buttons have descriptive labels
- [ ] Status messages announced
- [ ] Headings create logical structure
- [ ] Tables have captions and headers

**VoiceOver Commands** (macOS):

```
Cmd+F5          - Toggle VoiceOver
VO+A            - Start reading
VO+Right/Left   - Navigate elements
VO+Space        - Activate element
VO+U            - Open rotor (landmarks, headings, links)
```

#### 8. **Color Contrast Testing**

**Tools**:

- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Colour Contrast Analyser**: Desktop app (free)
- **Chrome DevTools**: Inspect element → Styles → Color picker shows contrast ratio

**Test Process**:

1. Inspect element with text
2. Note foreground and background colors
3. Check contrast ratio in DevTools or WebAIM
4. Verify ratio meets WCAG AA (4.5:1 for normal text, 3:1 for large text)

#### 9. **Focus Indicator Testing**

**Test Checklist**:

- [ ] Focus indicator visible on all interactive elements
- [ ] Minimum 3:1 contrast ratio against background
- [ ] Focus indicator not obscured by other elements
- [ ] Custom focus styles applied consistently

**Chrome DevTools Emulation**:

```
DevTools → Rendering → Emulate CSS media feature prefers-reduced-motion
DevTools → Rendering → Emulate vision deficiencies (protanopia, deuteranopia, etc.)
```

### Continuous Integration

#### 10. **GitHub Actions Workflow**

```yaml
# .github/workflows/accessibility.yml
name: Accessibility Tests

on: [push, pull_request]

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build --prefix frontend

      - name: Start server
        run: npm start &
        env:
          NODE_ENV: test

      - name: Wait for server
        run: npx wait-on http://localhost:3000

      - name: Run Pa11y tests
        run: |
          npm install -g pa11y-ci
          pa11y-ci --config .pa11yci.json

      - name: Run Jest accessibility tests
        run: npm test -- --testPathPattern=accessibility
```

```json
// .pa11yci.json
{
  "defaults": {
    "standard": "WCAG2AA",
    "timeout": 10000,
    "wait": 1000
  },
  "urls": [
    "http://localhost:3000/login",
    "http://localhost:3000/dashboard",
    "http://localhost:3000/workflows",
    "http://localhost:3000/executions",
    "http://localhost:3000/settings"
  ]
}
```

---

## 8. Implementation Checklist

### Phase 1: Critical Fixes (Week 1)

- [ ] **Add skip links** to all pages
- [ ] **Fix color contrast** issues (gray-500 → gray-600/700)
- [ ] **Add ARIA labels** to all icon-only buttons
- [ ] **Implement keyboard navigation** for OrganizationSwitcher
- [ ] **Add focus trap** to ExecuteWorkflowModal
- [ ] **Add alt text** to all images

### Phase 2: Enhanced Accessibility (Week 2)

- [ ] **Implement screen reader announcements** for status changes
- [ ] **Add ARIA landmarks** (banner, navigation, main, complementary)
- [ ] **Improve focus indicators** (custom styles, 3:1 contrast)
- [ ] **Add form validation** with accessible error messages
- [ ] **Implement keyboard shortcuts** (documented in help modal)
- [ ] **Add loading states** with aria-live regions

### Phase 3: Testing & Documentation (Week 3)

- [ ] **Run automated tests** (axe, Pa11y, Lighthouse)
- [ ] **Manual keyboard testing** on all pages
- [ ] **Screen reader testing** (VoiceOver, NVDA)
- [ ] **Color contrast audit** (all text and UI components)
- [ ] **Create accessibility statement** page
- [ ] **Document keyboard shortcuts** in UI

### Phase 4: Continuous Monitoring (Ongoing)

- [ ] **Set up CI/CD accessibility tests** (GitHub Actions)
- [ ] **Add accessibility tests** to Jest suite
- [ ] **Regular audits** (quarterly)
- [ ] **User feedback** mechanism for accessibility issues
- [ ] **Team training** on accessibility best practices

---

## 9. Code Examples

### Complete Accessible Component Example

```tsx
// components/AccessibleButton.tsx
import { forwardRef } from "react";

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  loadingText?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  ({ variant = "primary", loading, loadingText, icon, children, ...props }, ref) => {
    const baseClasses =
      "px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variantClasses = {
      primary: "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500",
      secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500",
      danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    };

    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]}`}
        disabled={loading || props.disabled}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <>
            <span
              className="inline-block animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"
              aria-hidden="true"
            />
            <span className="sr-only">Loading: </span>
          </>
        )}
        {icon && (
          <span className="mr-2" aria-hidden="true">
            {icon}
          </span>
        )}
        <span>{loading && loadingText ? loadingText : children}</span>
      </button>
    );
  },
);

AccessibleButton.displayName = "AccessibleButton";

export default AccessibleButton;
```

### Accessible Form Example

```tsx
// components/AccessibleForm.tsx
import { useState } from "react";

export default function AccessibleForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const handleBlur = (field: string) => {
    setTouched({ ...touched, [field]: true });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validation logic
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
          Email Address
          <span className="text-red-600" aria-label="required">
            *
          </span>
        </label>
        <input
          id="email"
          type="email"
          required
          aria-required="true"
          aria-invalid={touched.email && !!errors.email}
          aria-describedby={errors.email ? "email-error" : "email-help"}
          onBlur={() => handleBlur("email")}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 ${
            touched.email && errors.email ? "border-red-500" : "border-gray-300"
          }`}
        />
        {touched.email && errors.email ? (
          <p id="email-error" className="mt-2 text-sm text-red-600" role="alert">
            {errors.email}
          </p>
        ) : (
          <p id="email-help" className="mt-2 text-sm text-gray-500">
            We'll never share your email with anyone else.
          </p>
        )}
      </div>

      <button
        type="submit"
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        Submit
      </button>
    </form>
  );
}
```

### Accessible Data Table Example

```tsx
// components/AccessibleTable.tsx
interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface AccessibleTableProps<T> {
  data: T[];
  columns: Column<T>[];
  caption: string;
  emptyMessage?: string;
}

export default function AccessibleTable<T extends { id: string | number }>({
  data,
  columns,
  caption,
  emptyMessage = "No data available",
}: AccessibleTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-12 text-center" role="status">
        <p className="text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row) => (
            <tr key={row.id} className="hover:bg-gray-50">
              {columns.map((column) => (
                <td
                  key={String(column.key)}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                >
                  {column.render ? column.render(row[column.key], row) : String(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## Summary

### Current State

- **Basic accessibility**: Semantic HTML, some focus styles
- **Missing critical features**: ARIA, keyboard navigation, skip links, screen reader support

### Priority Actions

1. Add skip links (1 hour)
2. Fix color contrast (2 hours)
3. Implement keyboard navigation (4 hours)
4. Add ARIA attributes (3 hours)
5. Implement focus trap in modals (2 hours)
6. Add screen reader announcements (3 hours)

### Estimated Effort

- **Phase 1 (Critical)**: 15 hours
- **Phase 2 (Enhanced)**: 20 hours
- **Phase 3 (Testing)**: 10 hours
- **Total**: ~45 hours (1 week for 1 developer)

### Success Metrics

- **Lighthouse Accessibility Score**: 90+ (currently ~60-70)
- **axe DevTools**: 0 critical violations
- **Keyboard Navigation**: 100% functional without mouse
- **Screen Reader**: All content accessible via VoiceOver/NVDA

---

**Next Steps**: Start with Phase 1 critical fixes, focusing on skip links and color contrast as quick wins.
