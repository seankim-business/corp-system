# Autocomplete UX for AI Prompt Interfaces: A Comprehensive Guide

## Table of Contents

1. [Introduction](#introduction)
2. [Command Suggestions](#command-suggestions)
3. [Context-Aware Autocomplete](#context-aware-autocomplete)
4. [Template Suggestions](#template-suggestions)
5. [Keyboard Navigation](#keyboard-navigation)
6. [Fuzzy Matching Algorithms](#fuzzy-matching-algorithms)
7. [Variable & Placeholder Patterns](#variable--placeholder-patterns)
8. [Trigger Characters](#trigger-characters)
9. [Mobile Touch Autocomplete](#mobile-touch-autocomplete)
10. [Accessibility](#accessibility)
11. [Internationalization](#internationalization)
12. [Performance Considerations](#performance-considerations)
13. [Privacy & Security](#privacy--security)
14. [Real-World Examples](#real-world-examples)
15. [Implementation Patterns](#implementation-patterns)

---

## Introduction

Autocomplete in AI prompt interfaces serves a dual purpose: **discoverability** and **efficiency**. Users need to discover what capabilities an AI system offers while maintaining typing speed and flow. This guide synthesizes patterns from leading AI interfaces (ChatGPT, Claude, Notion AI) and established autocomplete libraries to provide actionable UX guidance.

### Core Principles

- **Progressive Disclosure**: Show capabilities as users type, not all at once
- **Contextual Relevance**: Suggestions should match current conversation context
- **Non-Intrusive**: Never block or slow down typing flow
- **Accessible by Default**: Support keyboard, screen readers, and touch from the start

---

## Command Suggestions

### Slash Commands (`/`)

Slash commands have become the de facto standard for triggering AI capabilities, popularized by Slack and adopted by ChatGPT, Claude, Notion AI, and others.

#### Pattern Structure

```typescript
interface SlashCommand {
  name: string; // e.g., "summarize"
  trigger: string; // "/"
  description: string; // "Summarize the conversation"
  argumentHint?: string; // "text to summarize"
  category?: string; // "Text Processing"
  icon?: string; // Visual identifier
  keywords?: string[]; // For fuzzy matching
}
```

#### UX Best Practices

1. **Trigger on `/` character**: Show dropdown immediately when user types `/`
2. **Filter as user types**: `/sum` should show "summarize", "summary", etc.
3. **Group by category**: Organize commands into logical groups (Text, Code, Data, etc.)
4. **Show keyboard shortcuts**: Display `↑↓` for navigation, `Enter` to select, `Esc` to dismiss
5. **Limit initial display**: Show 5-8 most relevant commands, allow scrolling for more

#### Example: Claude Code Slash Commands

Claude Code implements slash commands with YAML frontmatter:

```yaml
---
name: commit
description: Generate a Conventional Commit message based on code changes
argument-hint: optional commit message
---
```

The `description` field enables Claude to auto-suggest the command when contextually relevant, while `argument-hint` guides users on expected input.

### At-Mentions (`@`)

At-mentions pull in external context like files, documents, or data sources.

#### Pattern Structure

```typescript
interface MentionSuggestion {
  trigger: string; // "@"
  type: "file" | "user" | "document" | "data";
  label: string; // Display name
  value: string; // Actual value to insert
  metadata?: {
    path?: string; // File path
    lastModified?: Date; // Recency
    size?: number; // File size
  };
}
```

#### UX Best Practices

1. **Context-aware filtering**: `@` in a code context shows files; in a team context shows users
2. **Show metadata**: Display file paths, last modified dates, or user roles
3. **Support partial paths**: `@src/com` should match `src/components/Button.tsx`
4. **Highlight matches**: Visually emphasize matched characters
5. **Separate by type**: Group files, users, documents into distinct sections

#### Example: Notion AI Context Mentions

Notion AI uses `@` to reference pages within the workspace:

```
@Project Roadmap
@Meeting Notes - Jan 2026
@Design System Documentation
```

This solves the context window problem at the UX level by letting users explicitly include relevant documents.

### Hash Tags (`#`)

Hash tags typically reference categories, labels, or metadata.

```typescript
interface HashtagSuggestion {
  trigger: string; // "#"
  label: string; // "bug-fix"
  category?: string; // "Issue Type"
  color?: string; // Visual coding
  count?: number; // Usage frequency
}
```

---

## Context-Aware Autocomplete

Context-aware autocomplete adapts suggestions based on:

1. **Conversation history**: Previous messages and topics
2. **Current input**: What the user is typing right now
3. **Available capabilities**: What the AI can actually do
4. **User preferences**: Frequently used commands

### Implementation Pattern

```typescript
function getContextualSuggestions(
  input: string,
  conversationContext: Message[],
  availableCommands: Command[],
): Suggestion[] {
  // 1. Analyze conversation context
  const topics = extractTopics(conversationContext);
  const recentCommands = getRecentCommands(conversationContext);

  // 2. Filter by input
  const filtered = fuzzyMatch(input, availableCommands);

  // 3. Rank by relevance
  return rankByRelevance(filtered, {
    topics,
    recentCommands,
    userPreferences: getUserPreferences(),
  });
}
```

### Ranking Factors

- **Recency**: Commands used in last 5 messages get boosted
- **Frequency**: User's most-used commands rank higher
- **Semantic similarity**: Match input intent to command purpose
- **Conversation topic**: Code-related commands rank higher in coding conversations

---

## Template Suggestions

Templates provide pre-structured prompts for common workflows.

### Template Structure

```typescript
interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string; // With placeholders
  placeholders: Placeholder[];
  category: string;
  examples?: string[];
}

interface Placeholder {
  name: string; // "language"
  type: "text" | "select" | "multiline";
  required: boolean;
  default?: string;
  options?: string[]; // For select type
}
```

### Example Templates

````typescript
const templates = [
  {
    name: "Code Review",
    template:
      "Review this {{language}} code for:\n- Performance issues\n- Security vulnerabilities\n- Best practices\n\n```{{language}}\n{{code}}\n```",
    placeholders: [
      { name: "language", type: "select", options: ["JavaScript", "Python", "Go"] },
      { name: "code", type: "multiline", required: true },
    ],
  },
  {
    name: "Explain Concept",
    template: "Explain {{concept}} to someone with {{experience_level}} experience in {{domain}}",
    placeholders: [
      { name: "concept", type: "text", required: true },
      {
        name: "experience_level",
        type: "select",
        options: ["beginner", "intermediate", "advanced"],
      },
      { name: "domain", type: "text", required: true },
    ],
  },
];
````

### UX for Template Selection

1. **Show preview**: Display filled template before submission
2. **Tab navigation**: Use `Tab` to move between placeholders
3. **Inline editing**: Allow editing placeholders directly in the template
4. **Save custom templates**: Let users save frequently used prompts

---

## Keyboard Navigation

Keyboard navigation is critical for power users and accessibility.

### Standard Key Bindings

| Key                     | Action                                        |
| ----------------------- | --------------------------------------------- |
| `↓` / `↑`               | Navigate suggestions                          |
| `Enter`                 | Select highlighted suggestion                 |
| `Tab`                   | Select suggestion or move to next placeholder |
| `Esc`                   | Dismiss autocomplete dropdown                 |
| `Ctrl/Cmd + K`          | Open command palette                          |
| `Home` / `End`          | Jump to first/last suggestion                 |
| `Page Up` / `Page Down` | Scroll suggestions by page                    |

### Implementation with ARIA

```tsx
function AutocompleteDropdown({ suggestions, onSelect }) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        onSelect(suggestions[highlightedIndex]);
        break;
      case "Escape":
        e.preventDefault();
        onDismiss();
        break;
      case "Home":
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      case "End":
        e.preventDefault();
        setHighlightedIndex(suggestions.length - 1);
        break;
    }
  };

  return (
    <div
      role="combobox"
      aria-expanded={true}
      aria-controls="suggestions-list"
      onKeyDown={handleKeyDown}
    >
      <input
        role="searchbox"
        aria-autocomplete="list"
        aria-activedescendant={`suggestion-${highlightedIndex}`}
      />
      <ul id="suggestions-list" role="listbox">
        {suggestions.map((suggestion, index) => (
          <li
            key={suggestion.id}
            id={`suggestion-${index}`}
            role="option"
            aria-selected={index === highlightedIndex}
          >
            {suggestion.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Scroll Management

When navigating with keyboard, ensure highlighted item is visible:

```typescript
function scrollIntoViewIfNeeded(element: HTMLElement) {
  const parent = element.parentElement;
  const elementTop = element.offsetTop;
  const elementBottom = elementTop + element.offsetHeight;
  const parentTop = parent.scrollTop;
  const parentBottom = parentTop + parent.clientHeight;

  if (elementTop < parentTop) {
    parent.scrollTop = elementTop;
  } else if (elementBottom > parentBottom) {
    parent.scrollTop = elementBottom - parent.clientHeight;
  }
}
```

---

## Fuzzy Matching Algorithms

Fuzzy matching allows users to find suggestions even with typos or partial input.

### Algorithm Comparison

| Algorithm                | Speed     | Accuracy | Use Case                       |
| ------------------------ | --------- | -------- | ------------------------------ |
| **Levenshtein Distance** | Medium    | High     | Typo tolerance                 |
| **Jaro-Winkler**         | Fast      | Medium   | Short strings, prefix matching |
| **Fuse.js**              | Fast      | High     | General-purpose fuzzy search   |
| **Trigram Indexing**     | Very Fast | Medium   | Large datasets (10k+ items)    |

### Fuse.js Configuration

Fuse.js is the most popular fuzzy search library for JavaScript, offering excellent balance of speed and accuracy.

```typescript
import Fuse from "fuse.js";

const fuseOptions = {
  // Matching behavior
  threshold: 0.4, // 0.0 = perfect match, 1.0 = match anything
  distance: 100, // Max character distance from expected location
  ignoreLocation: true, // Search entire string, not just near location 0

  // Performance
  minMatchCharLength: 2, // Minimum characters before searching

  // Results
  includeScore: true, // Include match score in results
  includeMatches: true, // Include match positions for highlighting

  // Fields to search
  keys: [
    { name: "name", weight: 0.7 },
    { name: "description", weight: 0.2 },
    { name: "keywords", weight: 0.1 },
  ],
};

const fuse = new Fuse(commands, fuseOptions);

// Search
const results = fuse.search("sumrize"); // Finds "summarize" despite typo
```

### Threshold Tuning

- **0.0 - 0.2**: Very strict, only minor typos
- **0.3 - 0.4**: Balanced (recommended for most use cases)
- **0.5 - 0.6**: Lenient, allows significant differences
- **0.7 - 1.0**: Very lenient, may return irrelevant results

### Performance Optimization

For large datasets (10k+ items):

```typescript
// 1. Debounce input
const debouncedSearch = debounce((query: string) => {
  const results = fuse.search(query);
  setResults(results);
}, 150);

// 2. Limit results
const results = fuse.search(query, { limit: 50 });

// 3. Use Web Workers for heavy searches
const worker = new Worker("fuzzy-search-worker.js");
worker.postMessage({ query, items });
worker.onmessage = (e) => setResults(e.data);
```

### Highlighting Matches

```typescript
function highlightMatches(text: string, matches: FuseMatch[]): ReactNode {
  if (!matches || matches.length === 0) return text;

  const indices = matches[0].indices;
  const parts = [];
  let lastIndex = 0;

  indices.forEach(([start, end]) => {
    // Add unmatched text
    if (start > lastIndex) {
      parts.push(text.substring(lastIndex, start));
    }
    // Add matched text with highlight
    parts.push(
      <mark key={start}>{text.substring(start, end + 1)}</mark>
    );
    lastIndex = end + 1;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}
```

---

## Variable & Placeholder Patterns

Variables and placeholders guide users on expected input format.

### Placeholder Syntax

Common patterns across AI interfaces:

```
{{variable}}          - Double curly braces (Handlebars-style)
$VARIABLE             - Dollar sign prefix (shell-style)
{variable}            - Single curly braces
<variable>            - Angle brackets
[variable]            - Square brackets
```

### Interactive Placeholders

```tsx
interface Placeholder {
  name: string;
  type: "text" | "select" | "multiselect" | "number" | "date";
  validation?: (value: string) => boolean;
  suggestions?: string[];
}

function InteractivePlaceholder({ placeholder, onFill }: Props) {
  const [value, setValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <span className="placeholder">
      {placeholder.type === "select" ? (
        <select onChange={(e) => onFill(e.target.value)}>
          {placeholder.suggestions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={placeholder.type}
          placeholder={placeholder.name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => onFill(value)}
          onFocus={() => setShowSuggestions(true)}
        />
      )}
    </span>
  );
}
```

### Validation Patterns

```typescript
const validators = {
  email: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
  url: (value: string) => {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
  number: (value: string) => !isNaN(Number(value)),
  date: (value: string) => !isNaN(Date.parse(value)),
  filepath: (value: string) => /^[a-zA-Z0-9_\-\/\.]+$/.test(value),
};
```

---

## Trigger Characters

Trigger characters initiate autocomplete for specific contexts.

### Common Triggers

| Character | Purpose                 | Example        |
| --------- | ----------------------- | -------------- |
| `/`       | Commands                | `/summarize`   |
| `@`       | Mentions (files, users) | `@README.md`   |
| `#`       | Tags, labels            | `#bug-fix`     |
| `:`       | Emojis                  | `:smile:`      |
| `{{`      | Variables               | `{{username}}` |
| `$`       | Environment variables   | `$PATH`        |

### Implementation Pattern

```typescript
interface TriggerConfig {
  trigger: string;
  minChars?: number; // Minimum chars after trigger
  allowSpaces?: boolean; // Allow spaces in query
  triggerOnlyAtStart?: boolean;
  triggerOnlyAfterSpace?: boolean;
  getSuggestions: (query: string) => Promise<Suggestion[]>;
}

function detectTrigger(
  text: string,
  cursorPosition: number,
  triggers: TriggerConfig[],
): { trigger: TriggerConfig; query: string } | null {
  const textBeforeCursor = text.substring(0, cursorPosition);

  for (const config of triggers) {
    const lastIndex = textBeforeCursor.lastIndexOf(config.trigger);

    if (lastIndex === -1) continue;

    // Check if trigger is at start (if required)
    if (config.triggerOnlyAtStart && lastIndex !== 0) continue;

    // Check if trigger follows space (if required)
    if (config.triggerOnlyAfterSpace) {
      const charBefore = textBeforeCursor[lastIndex - 1];
      if (charBefore && charBefore !== " " && charBefore !== "\n") {
        continue;
      }
    }

    // Extract query after trigger
    const query = textBeforeCursor.substring(lastIndex + config.trigger.length);

    // Check minimum characters
    if (config.minChars && query.length < config.minChars) continue;

    // Check for spaces (if not allowed)
    if (!config.allowSpaces && query.includes(" ")) continue;

    return { trigger: config, query };
  }

  return null;
}
```

### Multi-Trigger Example

```typescript
const triggers: TriggerConfig[] = [
  {
    trigger: "/",
    minChars: 0,
    triggerOnlyAtStart: true,
    getSuggestions: async (query) => searchCommands(query),
  },
  {
    trigger: "@",
    minChars: 1,
    allowSpaces: true,
    getSuggestions: async (query) => searchFiles(query),
  },
  {
    trigger: "#",
    minChars: 1,
    getSuggestions: async (query) => searchTags(query),
  },
];
```

### Trigger Precedence

When multiple triggers are detected, use the **most recent** one:

```typescript
function getMostRecentTrigger(
  text: string,
  cursorPosition: number,
  triggers: TriggerConfig[],
): { trigger: TriggerConfig; query: string } | null {
  const detected = triggers
    .map((config) => ({
      config,
      index: text.substring(0, cursorPosition).lastIndexOf(config.trigger),
    }))
    .filter(({ index }) => index !== -1)
    .sort((a, b) => b.index - a.index); // Sort by most recent

  if (detected.length === 0) return null;

  const { config, index } = detected[0];
  const query = text.substring(index + config.trigger.length, cursorPosition);

  return { trigger: config, query };
}
```

---

## Mobile Touch Autocomplete

Mobile autocomplete requires different UX considerations than desktop.

### Key Differences

1. **Larger touch targets**: Minimum 44x44px (iOS) or 48x48dp (Android)
2. **Thumb-friendly positioning**: Place dropdown above keyboard, not below input
3. **Reduced suggestions**: Show 3-5 items instead of 8-10
4. **Swipe to dismiss**: Support swipe-down gesture to close
5. **Haptic feedback**: Vibrate on selection (if supported)

### Touch-Optimized Layout

```tsx
function MobileAutocomplete({ suggestions, onSelect }: Props) {
  return (
    <div className="mobile-autocomplete">
      {/* Input at bottom, above keyboard */}
      <div className="input-container">
        <input type="text" />
      </div>

      {/* Suggestions above input */}
      <div className="suggestions-container">
        {suggestions.slice(0, 5).map((suggestion) => (
          <button
            key={suggestion.id}
            className="suggestion-item"
            style={{ minHeight: "48px", padding: "12px 16px" }}
            onClick={() => {
              // Haptic feedback
              if ("vibrate" in navigator) {
                navigator.vibrate(10);
              }
              onSelect(suggestion);
            }}
          >
            <div className="suggestion-label">{suggestion.label}</div>
            <div className="suggestion-meta">{suggestion.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Responsive Breakpoints

```css
/* Desktop */
.autocomplete-dropdown {
  max-height: 400px;
  width: 100%;
}

/* Tablet */
@media (max-width: 768px) {
  .autocomplete-dropdown {
    max-height: 300px;
  }

  .suggestion-item {
    min-height: 48px;
    font-size: 16px; /* Prevent zoom on iOS */
  }
}

/* Mobile */
@media (max-width: 480px) {
  .autocomplete-dropdown {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 50vh;
    border-radius: 16px 16px 0 0;
  }

  .suggestion-item {
    min-height: 56px;
    padding: 16px;
  }
}
```

### Virtual Keyboard Handling

```typescript
// Adjust viewport when keyboard appears
function useKeyboardAwareLayout() {
  useEffect(() => {
    const handleResize = () => {
      // On mobile, visualViewport changes when keyboard appears
      if ("visualViewport" in window) {
        const viewport = window.visualViewport;
        const keyboardHeight = window.innerHeight - viewport.height;

        document.documentElement.style.setProperty("--keyboard-height", `${keyboardHeight}px`);
      }
    };

    window.visualViewport?.addEventListener("resize", handleResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);
}
```

### Touch Gestures

```typescript
function useTouchGestures(onDismiss: () => void) {
  const [startY, setStartY] = useState(0);

  const handleTouchStart = (e: TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const endY = e.changedTouches[0].clientY;
    const deltaY = endY - startY;

    // Swipe down to dismiss
    if (deltaY > 100) {
      onDismiss();
    }
  };

  return { handleTouchStart, handleTouchEnd };
}
```

---

## Accessibility

Autocomplete must be accessible to screen readers and keyboard-only users.

### ARIA Attributes

```tsx
function AccessibleAutocomplete() {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [inputValue, setInputValue] = useState("");

  return (
    <div>
      <label id="autocomplete-label" htmlFor="autocomplete-input">
        Search commands
      </label>

      <input
        id="autocomplete-input"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="autocomplete-listbox"
        aria-activedescendant={highlightedIndex >= 0 ? `option-${highlightedIndex}` : undefined}
        aria-labelledby="autocomplete-label"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
      />

      {isOpen && (
        <ul id="autocomplete-listbox" role="listbox" aria-labelledby="autocomplete-label">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`option-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Screen Reader Announcements

```typescript
function useLiveRegion() {
  const announceRef = useRef<HTMLDivElement>(null);

  const announce = (message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announceRef.current) {
      announceRef.current.textContent = message;
      announceRef.current.setAttribute('aria-live', priority);
    }
  };

  return {
    announceRef,
    announce,
    LiveRegion: () => (
      <div
        ref={announceRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"  // Visually hidden
      />
    )
  };
}

// Usage
const { announce, LiveRegion } = useLiveRegion();

// Announce results
useEffect(() => {
  if (suggestions.length > 0) {
    announce(`${suggestions.length} suggestions available`);
  } else if (query.length > 0) {
    announce('No suggestions found');
  }
}, [suggestions, query]);
```

### Focus Management

```typescript
function useFocusTrap(containerRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const focusableElements = container.querySelectorAll(
      'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener("keydown", handleTabKey);
    return () => container.removeEventListener("keydown", handleTabKey);
  }, [containerRef]);
}
```

### Color Contrast

Ensure WCAG AA compliance (4.5:1 for normal text, 3:1 for large text):

```css
.suggestion-item {
  /* Normal state */
  color: #1a1a1a; /* 16.1:1 on white */
  background: #ffffff;
}

.suggestion-item:hover,
.suggestion-item[aria-selected="true"] {
  /* Highlighted state */
  color: #ffffff; /* 16.1:1 on blue */
  background: #0066cc; /* WCAG AAA */
}

.suggestion-meta {
  /* Secondary text */
  color: #666666; /* 5.7:1 on white - WCAG AA */
}
```

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .autocomplete-dropdown {
    animation: none;
    transition: none;
  }

  .suggestion-item {
    transition: none;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .autocomplete-dropdown {
    animation: slideUp 200ms ease-out;
  }

  .suggestion-item {
    transition: background-color 150ms ease;
  }
}
```

---

## Internationalization

Support for multiple languages and RTL (right-to-left) layouts.

### RTL Support

```tsx
function AutocompleteWithRTL({ locale }: { locale: string }) {
  const isRTL = ["ar", "he", "fa", "ur"].includes(locale);

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="autocomplete">
      <input
        type="text"
        placeholder={t("search_placeholder")}
        style={{
          textAlign: isRTL ? "right" : "left",
        }}
      />
      <div className="suggestions">
        {suggestions.map((suggestion) => (
          <div key={suggestion.id} className="suggestion-item">
            {suggestion.label}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### CSS Logical Properties

Use logical properties instead of physical directions:

```css
/* ❌ Physical properties (don't use) */
.suggestion-item {
  padding-left: 16px;
  margin-right: 8px;
  border-left: 2px solid blue;
}

/* ✅ Logical properties (use these) */
.suggestion-item {
  padding-inline-start: 16px;
  margin-inline-end: 8px;
  border-inline-start: 2px solid blue;
}
```

### Translated Strings

```typescript
const translations = {
  en: {
    search_placeholder: "Type / for commands",
    no_results: "No suggestions found",
    results_count: "{count} suggestions available",
    loading: "Loading suggestions...",
    keyboard_hint: "Use ↑↓ to navigate, Enter to select",
  },
  es: {
    search_placeholder: "Escribe / para comandos",
    no_results: "No se encontraron sugerencias",
    results_count: "{count} sugerencias disponibles",
    loading: "Cargando sugerencias...",
    keyboard_hint: "Usa ↑↓ para navegar, Enter para seleccionar",
  },
  ar: {
    search_placeholder: "اكتب / للأوامر",
    no_results: "لم يتم العثور على اقتراحات",
    results_count: "{count} اقتراحات متاحة",
    loading: "جاري تحميل الاقتراحات...",
    keyboard_hint: "استخدم ↑↓ للتنقل، Enter للاختيار",
  },
};

function t(key: string, params?: Record<string, any>): string {
  const locale = getCurrentLocale();
  let text = translations[locale]?.[key] || translations.en[key];

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      text = text.replace(`{${key}}`, String(value));
    });
  }

  return text;
}
```

### Number and Date Formatting

```typescript
function formatSuggestionMeta(suggestion: Suggestion, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return {
    lastModified: formatter.format(suggestion.lastModified),
    size: new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "kilobyte",
    }).format(suggestion.size / 1024),
  };
}
```

---

## Performance Considerations

Autocomplete must remain responsive even with large datasets.

### Debouncing Input

```typescript
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Usage
function Autocomplete() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 150);

  useEffect(() => {
    if (debouncedQuery) {
      fetchSuggestions(debouncedQuery);
    }
  }, [debouncedQuery]);
}
```

### Virtual Scrolling

For large suggestion lists (100+ items):

```tsx
import { FixedSizeList } from "react-window";

function VirtualizedSuggestions({ suggestions }: Props) {
  const Row = ({ index, style }) => (
    <div style={style} className="suggestion-item">
      {suggestions[index].label}
    </div>
  );

  return (
    <FixedSizeList height={400} itemCount={suggestions.length} itemSize={48} width="100%">
      {Row}
    </FixedSizeList>
  );
}
```

### Caching Strategies

```typescript
class SuggestionCache {
  private cache = new Map<string, Suggestion[]>();
  private maxSize = 100;

  get(query: string): Suggestion[] | undefined {
    return this.cache.get(query.toLowerCase());
  }

  set(query: string, suggestions: Suggestion[]): void {
    const key = query.toLowerCase();

    // LRU eviction
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, suggestions);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Usage
const cache = new SuggestionCache();

async function fetchSuggestions(query: string): Promise<Suggestion[]> {
  // Check cache first
  const cached = cache.get(query);
  if (cached) return cached;

  // Fetch from API
  const results = await api.search(query);

  // Cache results
  cache.set(query, results);

  return results;
}
```

### Lazy Loading

```typescript
function useLazySuggestions(query: string) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const loadMore = async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    const results = await fetchSuggestions(query, page, 20);

    setSuggestions((prev) => [...prev, ...results]);
    setHasMore(results.length === 20);
    setPage((prev) => prev + 1);
    setIsLoading(false);
  };

  return { suggestions, isLoading, hasMore, loadMore };
}
```

### Web Workers

For CPU-intensive fuzzy matching:

```typescript
// fuzzy-worker.ts
import Fuse from "fuse.js";

self.onmessage = (e: MessageEvent) => {
  const { query, items, options } = e.data;

  const fuse = new Fuse(items, options);
  const results = fuse.search(query);

  self.postMessage(results);
};

// main.ts
const worker = new Worker(new URL("./fuzzy-worker.ts", import.meta.url));

function searchWithWorker(query: string, items: any[]): Promise<any[]> {
  return new Promise((resolve) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.postMessage({ query, items, options: fuseOptions });
  });
}
```

### Performance Metrics

```typescript
function measureAutocompletePerformance() {
  const metrics = {
    inputLatency: 0, // Time from keypress to UI update
    searchTime: 0, // Time to search/filter
    renderTime: 0, // Time to render suggestions
  };

  // Measure input latency
  const inputStart = performance.now();
  requestAnimationFrame(() => {
    metrics.inputLatency = performance.now() - inputStart;
  });

  // Measure search time
  const searchStart = performance.now();
  const results = fuse.search(query);
  metrics.searchTime = performance.now() - searchStart;

  // Measure render time
  const renderStart = performance.now();
  requestAnimationFrame(() => {
    metrics.renderTime = performance.now() - renderStart;

    // Log if performance is poor
    if (metrics.inputLatency > 16) {
      console.warn("Input latency exceeds 16ms:", metrics);
    }
  });

  return metrics;
}
```

**Performance Targets:**

- Input latency: < 16ms (60 FPS)
- Search time: < 50ms for 1k items, < 200ms for 10k items
- Render time: < 16ms for 50 items
- Total time to interactive: < 100ms

---

## Privacy & Security

Autocomplete can expose sensitive information if not handled carefully.

### Sensitive Data Detection

```typescript
const SENSITIVE_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+\d{1,3}[- ]?)?\d{10}/g,
  ssn: /\d{3}-\d{2}-\d{4}/g,
  creditCard: /\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}/g,
  apiKey: /[a-zA-Z0-9_-]{32,}/g,
  jwt: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
};

function containsSensitiveData(text: string): boolean {
  return Object.values(SENSITIVE_PATTERNS).some((pattern) => pattern.test(text));
}

function filterSensitiveSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.filter(
    (suggestion) =>
      !containsSensitiveData(suggestion.label) && !containsSensitiveData(suggestion.value),
  );
}
```

### Redaction

```typescript
function redactSensitiveData(text: string): string {
  let redacted = text;

  // Redact emails
  redacted = redacted.replace(
    SENSITIVE_PATTERNS.email,
    (match) => match.split("@")[0].slice(0, 2) + "***@" + match.split("@")[1],
  );

  // Redact API keys
  redacted = redacted.replace(
    SENSITIVE_PATTERNS.apiKey,
    (match) => match.slice(0, 4) + "***" + match.slice(-4),
  );

  return redacted;
}
```

### File Path Privacy

```typescript
function sanitizeFilePath(path: string): string {
  // Remove user home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir && path.startsWith(homeDir)) {
    return path.replace(homeDir, "~");
  }

  // Remove absolute paths
  const projectRoot = getProjectRoot();
  if (path.startsWith(projectRoot)) {
    return path.replace(projectRoot, ".");
  }

  return path;
}
```

### Autocomplete History

```typescript
interface AutocompleteHistory {
  query: string;
  timestamp: number;
  selected?: Suggestion;
}

class PrivacyAwareHistory {
  private history: AutocompleteHistory[] = [];
  private maxAge = 24 * 60 * 60 * 1000; // 24 hours
  private maxSize = 100;

  add(query: string, selected?: Suggestion): void {
    // Don't store sensitive queries
    if (containsSensitiveData(query)) return;

    this.history.push({
      query,
      timestamp: Date.now(),
      selected,
    });

    // Trim old entries
    this.cleanup();
  }

  private cleanup(): void {
    const now = Date.now();

    // Remove old entries
    this.history = this.history.filter((entry) => now - entry.timestamp < this.maxAge);

    // Limit size
    if (this.history.length > this.maxSize) {
      this.history = this.history.slice(-this.maxSize);
    }
  }

  getFrequent(): string[] {
    const counts = new Map<string, number>();

    this.history.forEach((entry) => {
      counts.set(entry.query, (counts.get(entry.query) || 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query]) => query);
  }

  clear(): void {
    this.history = [];
  }
}
```

### Content Security Policy

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; 
               script-src 'self' 'unsafe-inline'; 
               connect-src 'self' https://api.example.com;"
/>
```

---

## Real-World Examples

### ChatGPT

**Slash Commands:**

- `/` triggers command palette
- Commands include: "Summarize", "Translate", "Explain", "Code"
- Grouped by category (Writing, Code, Learning)
- Shows keyboard shortcuts (⌘K to open)

**Context Mentions:**

- `@` mentions files from uploaded documents
- Shows file name, type, and upload date
- Supports partial name matching

**UX Patterns:**

- Dropdown appears immediately on `/`
- Fuzzy matching with typo tolerance
- Keyboard navigation with ↑↓ and Enter
- Esc to dismiss

### Claude

**Slash Commands:**

- Custom commands defined in `.claude/commands/` or `.claude/skills/`
- YAML frontmatter for metadata
- `argument-hint` shows expected input
- Auto-invocation based on `description` field

**Example Command:**

```yaml
---
name: commit
description: Generate a Conventional Commit message based on code changes
argument-hint: optional commit message
---
Analyze the git diff and create a commit message following Conventional Commits format.
```

**UX Patterns:**

- Tab completion for file paths
- Context-aware suggestions based on conversation
- Inline argument hints

### Notion AI

**Slash Commands:**

- `/ai` triggers AI menu
- Commands: "Summarize", "Improve writing", "Translate", "Find action items"
- Contextual to selected text

**Context Mentions:**

- `@` mentions pages within workspace
- Shows page hierarchy and last edited date
- Fuzzy search across page titles

**Template Suggestions:**

- Pre-built prompts for common tasks
- Placeholders for customization
- Save custom templates

---

## Implementation Patterns

### React Hook Pattern

```tsx
interface UseAutocompleteOptions {
  triggers: TriggerConfig[];
  debounceMs?: number;
  maxSuggestions?: number;
}

function useAutocomplete(options: UseAutocompleteOptions) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [activeTrigger, setActiveTrigger] = useState<TriggerConfig | null>(null);

  const debouncedInput = useDebounce(inputValue, options.debounceMs ?? 150);

  // Detect trigger and fetch suggestions
  useEffect(() => {
    const detected = detectTrigger(debouncedInput, debouncedInput.length, options.triggers);

    if (detected) {
      setActiveTrigger(detected.trigger);
      detected.trigger.getSuggestions(detected.query).then((results) => {
        setSuggestions(results.slice(0, options.maxSuggestions ?? 50));
        setIsOpen(true);
      });
    } else {
      setIsOpen(false);
      setActiveTrigger(null);
    }
  }, [debouncedInput]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        selectSuggestion(suggestions[highlightedIndex]);
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const selectSuggestion = (suggestion: Suggestion) => {
    if (!activeTrigger) return;

    // Replace trigger + query with selected value
    const triggerIndex = inputValue.lastIndexOf(activeTrigger.trigger);
    const newValue = inputValue.substring(0, triggerIndex) + suggestion.value + " ";

    setInputValue(newValue);
    setIsOpen(false);
    setHighlightedIndex(0);
  };

  return {
    inputValue,
    setInputValue,
    suggestions,
    isOpen,
    highlightedIndex,
    handleKeyDown,
    selectSuggestion,
  };
}
```

### Component Pattern

```tsx
interface AutocompleteProps {
  placeholder?: string;
  triggers: TriggerConfig[];
  onSubmit: (value: string) => void;
}

export function Autocomplete({ placeholder, triggers, onSubmit }: AutocompleteProps) {
  const {
    inputValue,
    setInputValue,
    suggestions,
    isOpen,
    highlightedIndex,
    handleKeyDown,
    selectSuggestion,
  } = useAutocomplete({ triggers });

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && highlightedIndex >= 0) {
      const item = listRef.current.children[highlightedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  return (
    <div className="autocomplete">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-controls="suggestions-list"
        aria-activedescendant={highlightedIndex >= 0 ? `suggestion-${highlightedIndex}` : undefined}
      />

      {isOpen && suggestions.length > 0 && (
        <ul ref={listRef} id="suggestions-list" role="listbox" className="suggestions-dropdown">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.id}
              id={`suggestion-${index}`}
              role="option"
              aria-selected={index === highlightedIndex}
              className={index === highlightedIndex ? "highlighted" : ""}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="suggestion-label">{suggestion.label}</div>
              {suggestion.description && (
                <div className="suggestion-description">{suggestion.description}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### Styling

```css
.autocomplete {
  position: relative;
  width: 100%;
}

.autocomplete input {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  outline: none;
  transition: border-color 150ms ease;
}

.autocomplete input:focus {
  border-color: #0066cc;
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.1);
}

.suggestions-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 400px;
  overflow-y: auto;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  list-style: none;
  margin: 0;
  padding: 4px;
  z-index: 1000;
}

.suggestions-dropdown li {
  padding: 12px 16px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 150ms ease;
}

.suggestions-dropdown li:hover,
.suggestions-dropdown li.highlighted {
  background-color: #f5f5f5;
}

.suggestions-dropdown li[aria-selected="true"] {
  background-color: #e3f2fd;
}

.suggestion-label {
  font-weight: 500;
  color: #1a1a1a;
}

.suggestion-description {
  font-size: 14px;
  color: #666666;
  margin-top: 4px;
}

/* Accessibility */
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

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .autocomplete input,
  .suggestions-dropdown,
  .suggestions-dropdown li {
    transition: none;
  }
}
```

---

## Conclusion

Effective autocomplete UX in AI prompt interfaces balances **discoverability**, **efficiency**, and **accessibility**. Key takeaways:

1. **Use standard triggers**: `/` for commands, `@` for mentions, `#` for tags
2. **Implement fuzzy matching**: Tolerate typos with Fuse.js or similar
3. **Prioritize keyboard navigation**: Support ↑↓ Enter Esc Tab
4. **Design for mobile**: Larger touch targets, thumb-friendly positioning
5. **Ensure accessibility**: ARIA attributes, screen reader announcements, focus management
6. **Support internationalization**: RTL layouts, logical CSS properties, translated strings
7. **Optimize performance**: Debounce input, cache results, virtual scrolling for large lists
8. **Protect privacy**: Filter sensitive data, sanitize file paths, limit history retention

By following these patterns, you can create autocomplete experiences that help users discover AI capabilities while maintaining typing flow and accessibility for all users.

---

## References

- [WAI-ARIA Authoring Practices: Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Downshift: Accessible Autocomplete Library](https://github.com/downshift-js/downshift)
- [Fuse.js: Fuzzy Search Library](https://fusejs.io/)
- [Radix UI: Accessible Component Primitives](https://www.radix-ui.com/)
- [Claude Code Documentation](https://docs.claude.com/en/docs/claude-code/slash-commands)
- [Algolia: Mobile Autocomplete Best Practices](https://www.algolia.com/blog/ecommerce/search-autocomplete-on-mobile/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
