# AI Conversation History Management UX Guide

A comprehensive guide to designing and implementing conversation history management for AI chat applications, covering patterns from ChatGPT, Claude, Perplexity, and industry best practices.

---

## Table of Contents

1. [Conversation List/Inbox Patterns](#conversation-listinbox-patterns)
2. [Search and Filter UI](#search-and-filter-ui)
3. [Thread Organization](#thread-organization)
4. [Conversation Sharing and Export](#conversation-sharing-and-export)
5. [Mobile Conversation Browsing](#mobile-conversation-browsing)
6. [Performance Optimization for Large Histories](#performance-optimization-for-large-histories)
7. [Privacy Controls](#privacy-controls)
8. [Implementation Examples](#implementation-examples)

---

## Conversation List/Inbox Patterns

### Core UI Components

#### Sidebar Layout

The sidebar is the primary navigation pattern for AI chat applications:

**ChatGPT Pattern:**

- **Left sidebar** with collapsible functionality
- **New Chat** button prominently placed at the top
- Conversations listed chronologically (newest first)
- **Auto-generated titles** from first user message
- **Grouped by time periods**: Today, Yesterday, Previous 7 Days, Previous 30 Days, [Month Name], [Year]
- **Projects feature** for workspace organization with custom icons and colors
- Compact list showing truncated conversation titles

**Claude Pattern:**

- Similar sidebar approach with search integration
- **Chat search** functionality built into sidebar
- **Memory feature** to build on previous context across conversations
- Real-time conversation logging for Claude Code sessions
- Session persistence with unique identifiers

**Perplexity Pattern:**

- **Threads Library** as the main organizational view
- Filter by **Search Mode** (Pro, Research, Labs, Create files and apps)
- Sort options: newest to oldest and vice versa
- Search by keywords or thread title
- Type-based filtering for different query modes

### Key Features

#### Conversation Metadata Display

```typescript
interface ConversationListItem {
  id: string;
  title: string;
  lastMessage: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount?: number;
  participants?: string[];
  tags?: string[];
  folder?: string;
  isPinned?: boolean;
  isArchived?: boolean;
}
```

#### Visual Indicators

- **Unread/new message badges**
- **Pinned conversations** at the top
- **Shared conversation icons**
- **Project/folder color coding**
- **Timestamp display** (relative or absolute)
- **Message preview** (first line of last message)

### User Interactions

1. **Click to open** conversation
2. **Hover to reveal** actions menu (rename, delete, share, archive)
3. **Drag and drop** to organize into folders/projects
4. **Right-click context menu** for quick actions
5. **Swipe gestures** on mobile (archive, delete)

---

## Search and Filter UI

### Search Functionality

#### Search Bar Placement

- **Top of sidebar** (ChatGPT, Claude)
- **Dedicated search icon** with expandable input
- **Library page with search bar** (Perplexity)
- **Keyboard shortcut** support (Cmd/Ctrl + K)

#### Search Capabilities

**Basic Search:**

```typescript
interface SearchQuery {
  query: string; // Keyword search
  caseSensitive?: boolean; // Default: false
  matchWholeWords?: boolean;
}
```

**Advanced Search Operators:**

- `after:YYYY/MM/DD` - Messages after date
- `before:YYYY/MM/DD` - Messages before date
- `newer_than:2d` - Relative time (d=day, m=month, y=year)
- `older_than:1y` - Relative time periods
- `tag:tagname` - Search by tag
- `in:folder` - Search within folder

**Search Implementation Pattern:**

```typescript
interface SearchConversationsParams {
  query: string;
  filters?: {
    dateRange?: {
      start: Date;
      end: Date;
    };
    tags?: string[];
    folders?: string[];
    searchMode?: "Pro" | "Research" | "Labs";
  };
  sort?: {
    field: "updated_at" | "created_at" | "relevance";
    order: "asc" | "desc";
  };
  pagination?: {
    limit: number;
    offset: number;
  };
}
```

### Filter UI Patterns

#### Date Range Filters

**Three Common Patterns:**

1. **Checkboxes/Dropdown** (Simple)
   - Today
   - Yesterday
   - Last 7 days
   - Last 30 days
   - This month
   - All time

2. **Calendar Date Picker** (Precise)
   - Visual calendar interface
   - Start and end date selection
   - Best for specific date ranges

3. **Custom Range Selector** (Flexible)
   - Predefined ranges + custom option
   - Quick access to common periods
   - Dropdown or checkbox implementation

#### Tag/Category Filters

**Multi-select Pattern:**

```typescript
interface FilterConfig {
  field: "tags" | "folder" | "searchMode" | "updated_at";
  operator: "IN" | "AND" | "OR" | ">" | "<" | "=";
  value: string | string[] | number | Date;
}

// Nested filters (up to 2 levels)
interface ComplexFilter {
  operator: "AND" | "OR";
  filters: (FilterConfig | ComplexFilter)[];
}
```

**UI Components:**

- **Checkbox groups** for multiple tag selection
- **Tag pills** showing active filters
- **Clear all filters** button
- **Filter count badge** on filter icon

#### Search Results Display

**Result Highlighting:**

- **Matched keywords** highlighted in context
- **Snippet preview** with surrounding text
- **Relevance score** or ranking indicator
- **Breadcrumb path** (Folder > Subfolder > Conversation)

**Result Metadata:**

```typescript
interface SearchResult {
  conversationId: string;
  title: string;
  matchedSnippet: string;
  matchCount: number;
  lastUpdated: Date;
  relevanceScore: number;
  breadcrumb: string[];
}
```

---

## Thread Organization

### Folder/Project Structure

#### ChatGPT Projects

- **Visual organization** with custom icons and colors
- **Shared context** across conversations in a project
- **Custom instructions** per project
- **File attachments** associated with projects
- **Drag-and-drop** chat management
- **Shared project indicators** in sidebar

**Project Structure:**

```typescript
interface Project {
  id: string;
  name: string;
  icon: string;
  color: string;
  description?: string;
  customInstructions?: string;
  conversations: string[];
  files: File[];
  isShared: boolean;
  sharedWith?: string[];
  createdAt: Date;
}
```

#### Folder Hierarchy

**Best Practices:**

- **Maximum 2-3 levels** of nesting
- **Clear naming conventions** (Client - Project - Topic)
- **Color coding** for quick identification
- **Folder templates** for common structures

**Example Structures:**

```
Work/
├── Client - Acme Corp/
│   ├── Bugfix brainstorming
│   ├── Feature planning
│   └── Code reviews
├── Personal Projects/
│   ├── Learning - Python
│   └── Side project ideas
└── Research/
    ├── Theory - Fundamentals
    └── Literature research
```

### Tagging System

#### Tag Types

1. **Manual Tags**
   - User-created and assigned
   - Custom labels for categorization
   - Multi-tag support per conversation

2. **AI-Assisted Tags**
   - Auto-suggested based on content
   - Nested tagging capabilities
   - Cross-categorization support

3. **System Tags**
   - Auto-generated (e.g., "Shared", "Archived")
   - Search mode indicators
   - Status tags

**Tag Implementation:**

```typescript
interface Tag {
  id: string;
  name: string;
  color?: string;
  category?: string;
  isSystemTag: boolean;
  autoAssigned: boolean;
  conversationCount: number;
}

interface TaggingConfig {
  allowMultipleTags: boolean;
  maxTagsPerConversation: number;
  enableAutoTagging: boolean;
  enableNestedTags: boolean;
  tagSuggestions: boolean;
}
```

#### AI Auto-Tagging

**Two Approaches:**

1. **AI Auto-Suggest Tags**
   - Analyzes transcript after interaction
   - Pre-fills suggested tags
   - Agent confirms or adjusts
   - Best for human oversight

2. **AI Auto-Assign Tags**
   - Automatic tagging for bot-only interactions
   - No human intervention required
   - Best for abandoned/automated chats

### Conversation Naming

#### Auto-Naming Strategies

1. **First Message Extraction**
   - Use first user message as title
   - Truncate with ellipsis if too long
   - Fallback to "New Conversation"

2. **AI-Generated Titles**
   - Summarize conversation topic
   - Generate descriptive title
   - Update as conversation evolves

3. **Manual Naming**
   - User can rename anytime
   - Inline editing in sidebar
   - Keyboard shortcut support

**Naming Best Practices:**

```typescript
interface ConversationNaming {
  maxTitleLength: 60;
  autoGenerateTitle: boolean;
  updateTitleOnNewMessages: boolean;
  allowEmptyTitle: boolean;
  defaultTitlePattern: string; // e.g., "Conversation {date}"
}
```

---

## Conversation Sharing and Export

### Sharing Mechanisms

#### ChatGPT Shared Links

**Features:**

- **Unique URL** generation per conversation
- **Anonymous sharing** (no name associated by default)
- **Optional discoverability** in web searches
- **Snapshot sharing** (conversation state at share time)
- **No granular permissions** (all or nothing)
- **No expiration dates** currently

**Privacy Considerations:**

- Shared links **don't include personal information**
- **Anyone with link** can view
- **Cannot update** shared content after sharing
- **Delete original** to invalidate link
- **Manage shared links** in Settings > Data Controls

**Implementation Pattern:**

```typescript
interface SharedLink {
  id: string;
  conversationId: string;
  url: string;
  createdAt: Date;
  isDiscoverable: boolean;
  viewCount?: number;
  expiresAt?: Date; // Future feature
}

interface ShareOptions {
  includePersonalInfo: boolean;
  allowDiscovery: boolean;
  allowContinuation: boolean; // Let viewers continue chat
  expirationDays?: number;
  requireAuthentication?: boolean;
}
```

### Export Formats

#### 1. JSON Export

**ChatGPT Format:**

```json
{
  "title": "Conversation Title",
  "create_time": 1234567890,
  "update_time": 1234567890,
  "mapping": {
    "node_id": {
      "id": "node_id",
      "message": {
        "id": "message_id",
        "author": {
          "role": "user" | "assistant" | "system"
        },
        "content": {
          "content_type": "text",
          "parts": ["Message text here"]
        },
        "create_time": 1234567890,
        "metadata": {}
      },
      "parent": "parent_node_id",
      "children": ["child_node_id"]
    }
  },
  "current_node": "node_id"
}
```

**Claude Format:**

```json
{
  "meta": {
    "exported_at": "2024-03-19 16:03:09",
    "title": "Conversation Title"
  },
  "chats": [
    {
      "index": 0,
      "type": "prompt" | "response",
      "message": [
        {
          "type": "p" | "pre" | "code",
          "language": "javascript",
          "data": "Message content"
        }
      ]
    }
  ]
}
```

**Simplified Format (Recommended):**

```json
{
  "id": "conversation_id",
  "title": "Conversation Title",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z",
  "messages": [
    {
      "role": "user" | "assistant" | "system",
      "content": [
        {
          "type": "text" | "code" | "image",
          "text": "Message content",
          "language": "python"
        }
      ],
      "timestamp": "2024-01-01T00:00:00Z"
    }
  ],
  "metadata": {
    "model": "gpt-4",
    "tags": ["tag1", "tag2"],
    "folder": "Work/Projects"
  }
}
```

#### 2. Markdown Export

**Structure:**

```markdown
# Conversation Title

**Created:** 2024-01-01 10:00 AM
**Last Updated:** 2024-01-01 12:30 PM
**Tags:** research, coding, python

---

## User (10:00 AM)

How do I implement pagination in React?

## Assistant (10:01 AM)

Here's how to implement pagination in React:

\`\`\`javascript
function Pagination({ currentPage, totalPages, onPageChange }) {
return (
<div className="pagination">
{/_ Pagination controls _/}
</div>
);
}
\`\`\`

---

**Export Date:** 2024-01-01 13:00 PM
**Total Messages:** 24
```

#### 3. HTML Export

**Features:**

- **Styled output** with CSS
- **Syntax highlighting** for code blocks
- **Responsive design** for mobile viewing
- **Print-friendly** formatting
- **Embedded metadata**

#### 4. Plain Text Export

**Simple format:**

```
Conversation: Conversation Title
Date: 2024-01-01
Messages: 24

---

[User - 10:00 AM]
How do I implement pagination in React?

[Assistant - 10:01 AM]
Here's how to implement pagination in React...
```

### Export Implementation

```typescript
interface ExportOptions {
  format: "json" | "markdown" | "html" | "txt";
  includeMetadata: boolean;
  includeTimestamps: boolean;
  includeSystemMessages: boolean;
  dateFormat?: string;
  syntaxHighlighting?: boolean; // For HTML/Markdown
  compressOutput?: boolean; // ZIP for large exports
}

async function exportConversation(conversationId: string, options: ExportOptions): Promise<Blob> {
  const conversation = await fetchConversation(conversationId);

  switch (options.format) {
    case "json":
      return exportToJSON(conversation, options);
    case "markdown":
      return exportToMarkdown(conversation, options);
    case "html":
      return exportToHTML(conversation, options);
    case "txt":
      return exportToText(conversation, options);
  }
}
```

### Bulk Export

**Features:**

- **Export all conversations** as ZIP archive
- **Selective export** (by folder, tag, date range)
- **Background processing** for large exports
- **Progress indicator** during export
- **Email delivery** for very large exports

```typescript
interface BulkExportOptions extends ExportOptions {
  filters?: {
    folders?: string[];
    tags?: string[];
    dateRange?: { start: Date; end: Date };
    conversationIds?: string[];
  };
  splitByFolder?: boolean;
  maxFileSize?: number; // Split into multiple files
  notifyOnComplete?: boolean;
}
```

---

## Mobile Conversation Browsing

### Mobile-Specific Patterns

#### Responsive Sidebar

**Approaches:**

1. **Slide-out Drawer**
   - Hidden by default
   - Hamburger menu to open
   - Overlay on content
   - Swipe to close

2. **Bottom Sheet**
   - Conversation list in bottom sheet
   - Swipe up to expand
   - Partial view shows recent chats

3. **Tab Bar Navigation**
   - Bottom tab for "Conversations"
   - Dedicated screen for history
   - Badge for unread count

#### Touch Interactions

**Gestures:**

- **Swipe right** on conversation: Archive
- **Swipe left** on conversation: Delete
- **Long press**: Show context menu
- **Pull to refresh**: Sync conversations
- **Pinch to zoom**: Adjust text size

**Implementation:**

```typescript
interface MobileGestures {
  swipeThreshold: number; // px
  longPressDelay: number; // ms
  enableSwipeActions: boolean;
  swipeLeftAction: "delete" | "archive" | "share";
  swipeRightAction: "pin" | "mark-read" | "archive";
}
```

### Infinite Scroll on Mobile

#### Implementation Strategy

**Inverted Infinite Scroll:**

- Load **older messages** when scrolling up
- Anchor to **newest message** on initial load
- Maintain scroll position during load

**Performance Optimization:**

```typescript
interface InfiniteScrollConfig {
  threshold: number; // Distance from edge to trigger (px)
  pageSize: number; // Messages per load
  initialLoadCount: number; // Messages on first load
  bufferSize: number; // Messages to keep in memory
  enableVirtualization: boolean;
}

// Example: TanStack Virtual implementation
import { useVirtualizer } from '@tanstack/react-virtual';

function ChatHistory({ messages }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100, // Estimated message height
    overscan: 5, // Buffer messages above/below viewport
  });

  return (
    <div ref={parentRef} style={{ height: '100vh', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
          >
            <Message message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### Loading States

**Mobile-Optimized Indicators:**

- **Skeleton screens** for initial load
- **Spinner at top** when loading older messages
- **Pull-to-refresh** animation
- **"Loading more..."** text indicator
- **Haptic feedback** on load completion (iOS)

### Mobile Search UX

**Optimizations:**

- **Full-screen search** overlay
- **Recent searches** quick access
- **Voice search** integration
- **Search suggestions** as you type
- **Filter chips** for quick filtering
- **Clear search** button always visible

---

## Performance Optimization for Large Histories

### Virtualization Techniques

#### Why Virtualization?

**Problem:**

- Rendering 1000+ messages causes browser freeze
- High memory consumption
- Slow scrolling performance
- Poor user experience

**Solution:**

- Render only **visible items** + buffer
- Dynamically create/destroy DOM elements
- Maintain scroll position accurately

#### Implementation Libraries

**1. TanStack Virtual (React)**

```typescript
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedConversationList({ conversations }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated row height
    overscan: 10, // Render 10 extra items above/below
  });

  return (
    <div ref={parentRef} className="conversation-list">
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => (
          <ConversationItem
            key={virtualRow.key}
            conversation={conversations[virtualRow.index]}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
```

**2. Stream Chat React SDK**

```typescript
import { VirtualizedMessageList } from 'stream-chat-react';

function ChatChannel() {
  return (
    <Channel>
      <VirtualizedMessageList
        messageLimit={25} // Page size for pagination
        overscan={10}
        shouldGroupByUser={true}
      />
    </Channel>
  );
}
```

**3. React Window**

```typescript
import { FixedSizeList } from 'react-window';

function ConversationList({ conversations }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={conversations.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <ConversationItem conversation={conversations[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

### Pagination Strategies

#### 1. Cursor-Based Pagination

**Advantages:**

- Consistent results with concurrent updates
- No duplicate items when data changes
- Efficient for real-time applications

```typescript
interface CursorPaginationParams {
  cursor?: string; // Opaque cursor token
  limit: number;
  direction: "before" | "after";
}

interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  prevCursor?: string;
  hasMore: boolean;
}

// API Implementation
async function getConversations(
  params: CursorPaginationParams,
): Promise<PaginatedResponse<Conversation>> {
  const query = db.conversations.orderBy("updated_at", "desc").limit(params.limit);

  if (params.cursor) {
    if (params.direction === "after") {
      query.startAfter(params.cursor);
    } else {
      query.endBefore(params.cursor);
    }
  }

  const items = await query.get();

  return {
    items,
    nextCursor: items[items.length - 1]?.id,
    prevCursor: items[0]?.id,
    hasMore: items.length === params.limit,
  };
}
```

#### 2. Offset-Based Pagination

**Simple but less reliable:**

```typescript
interface OffsetPaginationParams {
  offset: number;
  limit: number;
}

// Use cutoff time for consistency
interface TimeBoundPagination {
  cutoffTime: Date; // Set when first opening chat
  offset: number;
  limit: number;
}

async function getMessages(params: TimeBoundPagination) {
  return db.messages
    .where("created_at", "<=", params.cutoffTime)
    .orderBy("created_at", "desc")
    .offset(params.offset)
    .limit(params.limit)
    .get();
}
```

#### 3. Lazy Loading

**Load on demand:**

```typescript
interface LazyLoadConfig {
  initialLoad: number; // Messages on first load
  chunkSize: number; // Messages per subsequent load
  preloadThreshold: number; // Distance from edge to preload
}

function useLazyLoadMessages(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    const oldestMessage = messages[0];
    const newMessages = await fetchMessagesBefore(conversationId, oldestMessage?.id, 20);

    setMessages([...newMessages, ...messages]);
    setHasMore(newMessages.length === 20);
    setLoading(false);
  };

  return { messages, loadMore, hasMore, loading };
}
```

### Caching Strategies

#### 1. Client-Side Caching

**IndexedDB Storage:**

```typescript
interface CacheConfig {
  maxConversations: number; // Keep N most recent
  maxMessagesPerConversation: number;
  ttl: number; // Time to live (ms)
  compressionEnabled: boolean;
}

class ConversationCache {
  private db: IDBDatabase;

  async cacheConversation(conversation: Conversation) {
    const compressed = this.config.compressionEnabled
      ? await this.compress(conversation)
      : conversation;

    await this.db.put("conversations", {
      ...compressed,
      cachedAt: Date.now(),
    });
  }

  async getCachedConversation(id: string): Promise<Conversation | null> {
    const cached = await this.db.get("conversations", id);

    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.cachedAt > this.config.ttl) {
      await this.db.delete("conversations", id);
      return null;
    }

    return this.config.compressionEnabled ? await this.decompress(cached) : cached;
  }
}
```

#### 2. Server-Side Caching

**Redis/Memcached:**

```typescript
interface ServerCacheStrategy {
  cacheRecentConversations: boolean; // Cache last N conversations
  cacheFrequentlyAccessed: boolean; // Cache by access count
  cacheByUser: boolean; // Per-user cache
  invalidateOnUpdate: boolean;
}

// Example: Cache recent conversations
async function getCachedConversations(userId: string) {
  const cacheKey = `user:${userId}:conversations:recent`;

  // Try cache first
  let conversations = await redis.get(cacheKey);

  if (!conversations) {
    // Cache miss - fetch from DB
    conversations = await db.conversations
      .where("userId", "==", userId)
      .orderBy("updated_at", "desc")
      .limit(50)
      .get();

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(conversations));
  }

  return JSON.parse(conversations);
}
```

### Data Compression

**Reduce payload size:**

```typescript
// Client-side compression
import pako from "pako";

function compressConversation(conversation: Conversation): string {
  const json = JSON.stringify(conversation);
  const compressed = pako.deflate(json);
  return btoa(String.fromCharCode(...compressed));
}

function decompressConversation(compressed: string): Conversation {
  const binary = atob(compressed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decompressed = pako.inflate(bytes, { to: "string" });
  return JSON.parse(decompressed);
}

// Server-side compression (Express)
import compression from "compression";

app.use(
  compression({
    level: 6, // Compression level (0-9)
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
      if (req.headers["x-no-compression"]) {
        return false;
      }
      return compression.filter(req, res);
    },
  }),
);
```

### Performance Monitoring

**Key Metrics:**

```typescript
interface PerformanceMetrics {
  // Load times
  initialLoadTime: number;
  timeToFirstMessage: number;
  timeToInteractive: number;

  // Rendering
  averageFrameRate: number;
  layoutShifts: number; // CLS

  // Memory
  heapSize: number;
  domNodeCount: number;

  // Network
  payloadSize: number;
  requestCount: number;
  cacheHitRate: number;
}

// Measure performance
function measureConversationLoad() {
  const startTime = performance.now();

  // Mark key events
  performance.mark("conversation-load-start");

  // ... load conversation ...

  performance.mark("conversation-load-end");
  performance.measure("conversation-load", "conversation-load-start", "conversation-load-end");

  const measure = performance.getEntriesByName("conversation-load")[0];
  console.log(`Load time: ${measure.duration}ms`);
}
```

---

## Privacy Controls

### Data Management

#### 1. Conversation Deletion

**Granular Control:**

```typescript
interface DeletionOptions {
  scope: "single" | "multiple" | "all";
  conversationIds?: string[];
  filters?: {
    olderThan?: Date;
    folder?: string;
    tags?: string[];
  };
  permanentDelete: boolean; // vs. soft delete
  deleteSharedLinks: boolean;
}

async function deleteConversations(options: DeletionOptions) {
  // Soft delete (recoverable)
  if (!options.permanentDelete) {
    await db.conversations.update({
      deleted_at: new Date(),
      deleted_by: currentUser.id,
    });
  } else {
    // Permanent deletion
    await db.conversations.delete();

    // Cascade delete
    await db.messages.where("conversation_id", "in", ids).delete();
    await db.shared_links.where("conversation_id", "in", ids).delete();
  }
}
```

**UI Patterns:**

- **Confirmation dialog** for deletion
- **Undo option** (30-second window)
- **Bulk delete** with selection
- **Auto-delete** old conversations (optional)

#### 2. Archive Functionality

**Archive vs. Delete:**

```typescript
interface ArchiveOptions {
  conversationId: string;
  removeFromSidebar: boolean;
  keepSearchable: boolean;
  autoArchiveAfterDays?: number;
}

// Archive implementation
async function archiveConversation(options: ArchiveOptions) {
  await db.conversations.update(options.conversationId, {
    archived: true,
    archived_at: new Date(),
  });

  // Optionally move to separate storage
  if (options.removeFromSidebar) {
    await moveToArchiveStorage(options.conversationId);
  }
}

// Restore from archive
async function unarchiveConversation(conversationId: string) {
  await db.conversations.update(conversationId, {
    archived: false,
    archived_at: null,
  });
}
```

#### 3. History Controls

**ChatGPT-Style Settings:**

```typescript
interface HistorySettings {
  enableHistory: boolean; // Save conversations
  enableTraining: boolean; // Use for model training
  retentionDays?: number; // Auto-delete after N days
  excludeFromTraining: string[]; // Specific conversation IDs
}

// Settings UI
interface HistoryControlsUI {
  toggleHistory: () => void;
  toggleTraining: () => void;
  clearAllHistory: () => void;
  exportData: () => void;
  viewSharedLinks: () => void;
}
```

**Privacy Modes:**

- **Temporary Chat** (not saved)
- **Incognito Mode** (no history, no training)
- **Selective Saving** (choose what to save)

#### 4. Shared Link Management

**Control Panel:**

```typescript
interface SharedLinkManagement {
  listSharedLinks: () => Promise<SharedLink[]>;
  revokeLink: (linkId: string) => Promise<void>;
  updateLinkSettings: (linkId: string, settings: ShareOptions) => Promise<void>;
  viewLinkAnalytics: (linkId: string) => Promise<LinkAnalytics>;
}

interface LinkAnalytics {
  viewCount: number;
  uniqueViewers: number;
  lastViewed: Date;
  viewerLocations?: string[];
  continuedConversations?: number;
}

// Bulk revoke
async function revokeAllSharedLinks(userId: string) {
  const links = await db.shared_links.where("user_id", "==", userId).get();

  await Promise.all(links.map((link) => db.shared_links.delete(link.id)));
}
```

### Data Export and Portability

**GDPR Compliance:**

```typescript
interface DataExportRequest {
  userId: string;
  includeConversations: boolean;
  includeSharedLinks: boolean;
  includeSettings: boolean;
  includeUsageData: boolean;
  format: "json" | "csv" | "xml";
  deliveryMethod: "download" | "email";
}

async function exportUserData(request: DataExportRequest) {
  const data = {
    user: await fetchUserProfile(request.userId),
    conversations: request.includeConversations ? await fetchAllConversations(request.userId) : [],
    sharedLinks: request.includeSharedLinks ? await fetchSharedLinks(request.userId) : [],
    settings: request.includeSettings ? await fetchUserSettings(request.userId) : {},
    usageData: request.includeUsageData ? await fetchUsageMetrics(request.userId) : {},
    exportedAt: new Date().toISOString(),
  };

  // Compress and deliver
  const archive = await createZipArchive(data, request.format);

  if (request.deliveryMethod === "email") {
    await sendExportEmail(request.userId, archive);
  } else {
    return archive;
  }
}
```

### Access Controls (Multi-User)

**Team/Organization Features:**

```typescript
interface AccessControl {
  conversationId: string;
  owner: string;
  permissions: {
    userId: string;
    role: "viewer" | "editor" | "admin";
    canShare: boolean;
    canDelete: boolean;
    canExport: boolean;
  }[];
  visibility: "private" | "team" | "organization" | "public";
}

// Permission check
async function canAccessConversation(userId: string, conversationId: string): Promise<boolean> {
  const acl = await db.access_control.where("conversation_id", "==", conversationId).get();

  if (acl.owner === userId) return true;

  const permission = acl.permissions.find((p) => p.userId === userId);
  return permission !== undefined;
}

// Share with team
async function shareWithTeam(conversationId: string, teamId: string, role: "viewer" | "editor") {
  const teamMembers = await getTeamMembers(teamId);

  await db.access_control.update(conversationId, {
    permissions: teamMembers.map((member) => ({
      userId: member.id,
      role,
      canShare: role === "editor",
      canDelete: false,
      canExport: true,
    })),
    visibility: "team",
  });
}
```

---

## Implementation Examples

### Complete Conversation List Component

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface ConversationListProps {
  userId: string;
  onSelectConversation: (id: string) => void;
}

export function ConversationList({ userId, onSelectConversation }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtualization
  const rowVirtualizer = useVirtualizer({
    count: conversations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  });

  // Load conversations
  useEffect(() => {
    loadConversations();
  }, [userId, searchQuery, filters]);

  async function loadConversations() {
    setLoading(true);
    const result = await searchConversations({
      query: searchQuery,
      filters: {
        userId,
        ...parseFilters(filters),
      },
      sort: { field: 'updated_at', order: 'desc' },
      pagination: { limit: 100, offset: 0 },
    });
    setConversations(result.items);
    setLoading(false);
  }

  // Search handler
  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Filter handler
  const handleFilterChange = (newFilters: FilterConfig[]) => {
    setFilters(newFilters);
  };

  return (
    <div className="conversation-list-container">
      {/* Search Bar */}
      <SearchBar
        value={searchQuery}
        onChange={handleSearch}
        placeholder="Search conversations..."
      />

      {/* Filters */}
      <FilterPanel
        filters={filters}
        onChange={handleFilterChange}
      />

      {/* Virtualized List */}
      <div
        ref={parentRef}
        className="conversation-list"
        style={{ height: '100%', overflow: 'auto' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const conversation = conversations[virtualRow.index];
            return (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                onClick={() => onSelectConversation(conversation.id)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              />
            );
          })}
        </div>
      </div>

      {loading && <LoadingIndicator />}
    </div>
  );
}

// Conversation Item Component
function ConversationItem({ conversation, onClick, style }) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="conversation-item"
      style={style}
      onClick={onClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="conversation-content">
        <h3 className="conversation-title">{conversation.title}</h3>
        <p className="conversation-preview">{conversation.lastMessage}</p>
        <span className="conversation-time">
          {formatRelativeTime(conversation.updatedAt)}
        </span>
      </div>

      {showActions && (
        <div className="conversation-actions">
          <button onClick={(e) => { e.stopPropagation(); shareConversation(conversation.id); }}>
            Share
          </button>
          <button onClick={(e) => { e.stopPropagation(); archiveConversation(conversation.id); }}>
            Archive
          </button>
          <button onClick={(e) => { e.stopPropagation(); deleteConversation(conversation.id); }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
```

### Search and Filter Implementation

```typescript
// Search Component
function SearchBar({ value, onChange, placeholder }) {
  const [localValue, setLocalValue] = useState(value);
  const debounceTimeout = useRef<NodeJS.Timeout>();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Debounce search
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      onChange(newValue);
    }, 300);
  };

  return (
    <div className="search-bar">
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="search-input"
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue('');
            onChange('');
          }}
          className="clear-button"
        >
          ×
        </button>
      )}
    </div>
  );
}

// Filter Panel Component
function FilterPanel({ filters, onChange }) {
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState<{ start?: Date; end?: Date }>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<string[]>([]);

  const applyFilters = () => {
    const newFilters: FilterConfig[] = [];

    // Date range filter
    if (dateRange.start || dateRange.end) {
      if (dateRange.start) {
        newFilters.push({
          field: 'updated_at',
          operator: '>',
          value: dateRange.start,
        });
      }
      if (dateRange.end) {
        newFilters.push({
          field: 'updated_at',
          operator: '<',
          value: dateRange.end,
        });
      }
    }

    // Tag filter
    if (selectedTags.length > 0) {
      newFilters.push({
        field: 'tags',
        operator: 'IN',
        value: selectedTags,
      });
    }

    // Folder filter
    if (selectedFolders.length > 0) {
      newFilters.push({
        field: 'folder',
        operator: 'IN',
        value: selectedFolders,
      });
    }

    onChange(newFilters);
  };

  const clearFilters = () => {
    setDateRange({});
    setSelectedTags([]);
    setSelectedFolders([]);
    onChange([]);
  };

  return (
    <div className="filter-panel">
      <button onClick={() => setShowFilters(!showFilters)}>
        Filters {filters.length > 0 && `(${filters.length})`}
      </button>

      {showFilters && (
        <div className="filter-dropdown">
          {/* Date Range */}
          <div className="filter-section">
            <h4>Date Range</h4>
            <DateRangePicker
              startDate={dateRange.start}
              endDate={dateRange.end}
              onChange={setDateRange}
            />
          </div>

          {/* Tags */}
          <div className="filter-section">
            <h4>Tags</h4>
            <TagSelector
              selectedTags={selectedTags}
              onChange={setSelectedTags}
            />
          </div>

          {/* Folders */}
          <div className="filter-section">
            <h4>Folders</h4>
            <FolderSelector
              selectedFolders={selectedFolders}
              onChange={setSelectedFolders}
            />
          </div>

          {/* Actions */}
          <div className="filter-actions">
            <button onClick={applyFilters}>Apply</button>
            <button onClick={clearFilters}>Clear All</button>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {filters.length > 0 && (
        <div className="active-filters">
          {filters.map((filter, index) => (
            <FilterChip
              key={index}
              filter={filter}
              onRemove={() => {
                const newFilters = filters.filter((_, i) => i !== index);
                onChange(newFilters);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### Export Implementation

```typescript
// Export Service
class ConversationExportService {
  async exportConversation(
    conversationId: string,
    format: "json" | "markdown" | "html" | "txt",
  ): Promise<Blob> {
    const conversation = await this.fetchConversation(conversationId);

    switch (format) {
      case "json":
        return this.exportToJSON(conversation);
      case "markdown":
        return this.exportToMarkdown(conversation);
      case "html":
        return this.exportToHTML(conversation);
      case "txt":
        return this.exportToText(conversation);
    }
  }

  private exportToMarkdown(conversation: Conversation): Blob {
    let markdown = `# ${conversation.title}\n\n`;
    markdown += `**Created:** ${formatDate(conversation.createdAt)}\n`;
    markdown += `**Last Updated:** ${formatDate(conversation.updatedAt)}\n`;

    if (conversation.tags?.length > 0) {
      markdown += `**Tags:** ${conversation.tags.join(", ")}\n`;
    }

    markdown += "\n---\n\n";

    for (const message of conversation.messages) {
      const role = message.role === "user" ? "User" : "Assistant";
      const time = formatTime(message.timestamp);

      markdown += `## ${role} (${time})\n\n`;

      for (const content of message.content) {
        if (content.type === "text") {
          markdown += `${content.text}\n\n`;
        } else if (content.type === "code") {
          markdown += `\`\`\`${content.language || ""}\n${content.text}\n\`\`\`\n\n`;
        }
      }

      markdown += "---\n\n";
    }

    markdown += `**Export Date:** ${formatDate(new Date())}\n`;
    markdown += `**Total Messages:** ${conversation.messages.length}\n`;

    return new Blob([markdown], { type: "text/markdown" });
  }

  private exportToJSON(conversation: Conversation): Blob {
    const json = JSON.stringify(conversation, null, 2);
    return new Blob([json], { type: "application/json" });
  }

  private exportToHTML(conversation: Conversation): Blob {
    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${conversation.title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
    .user { background: #e3f2fd; }
    .assistant { background: #f5f5f5; }
    .role { font-weight: bold; margin-bottom: 5px; }
    .time { color: #666; font-size: 0.9em; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
    code { font-family: 'Monaco', 'Courier New', monospace; }
  </style>
</head>
<body>
  <h1>${conversation.title}</h1>
  <p><strong>Created:</strong> ${formatDate(conversation.createdAt)}</p>
  <p><strong>Last Updated:</strong> ${formatDate(conversation.updatedAt)}</p>
`;

    for (const message of conversation.messages) {
      const roleClass = message.role === "user" ? "user" : "assistant";
      const roleName = message.role === "user" ? "User" : "Assistant";

      html += `
  <div class="message ${roleClass}">
    <div class="role">${roleName}</div>
    <div class="time">${formatTime(message.timestamp)}</div>
    <div class="content">
`;

      for (const content of message.content) {
        if (content.type === "text") {
          html += `      <p>${escapeHtml(content.text)}</p>\n`;
        } else if (content.type === "code") {
          html += `      <pre><code class="language-${content.language}">${escapeHtml(content.text)}</code></pre>\n`;
        }
      }

      html += `    </div>\n  </div>\n`;
    }

    html += `
  <hr>
  <p><strong>Export Date:</strong> ${formatDate(new Date())}</p>
  <p><strong>Total Messages:</strong> ${conversation.messages.length}</p>
</body>
</html>
`;

    return new Blob([html], { type: "text/html" });
  }
}

// Usage
const exportService = new ConversationExportService();

async function handleExport(conversationId: string, format: string) {
  const blob = await exportService.exportConversation(conversationId, format);

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conversation-${conversationId}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

---

## Summary and Best Practices

### Key Takeaways

1. **Conversation List**
   - Use sidebar with time-based grouping
   - Implement Projects/Folders for organization
   - Show metadata (time, preview, tags)
   - Support drag-and-drop management

2. **Search and Filter**
   - Prominent search bar placement
   - Support advanced operators (date, tags)
   - Debounce search input
   - Show active filters with chips
   - Highlight search results

3. **Organization**
   - Folders with 2-3 level nesting max
   - Tag system (manual + AI-assisted)
   - Color coding for visual categorization
   - Pin important conversations

4. **Sharing and Export**
   - Multiple export formats (JSON, Markdown, HTML, TXT)
   - Privacy-conscious sharing (anonymous by default)
   - Bulk export with filtering
   - Shared link management

5. **Mobile Optimization**
   - Responsive sidebar (drawer/bottom sheet)
   - Touch gestures (swipe, long-press)
   - Infinite scroll with virtualization
   - Mobile-optimized search

6. **Performance**
   - Virtualization for large lists (TanStack Virtual, React Window)
   - Cursor-based pagination
   - Client and server-side caching
   - Data compression (gzip, Brotli)
   - Lazy loading strategies

7. **Privacy**
   - Granular deletion controls
   - Archive functionality
   - History on/off toggle
   - Training opt-out
   - Shared link revocation
   - GDPR-compliant data export

### Implementation Checklist

- [ ] Implement virtualized conversation list
- [ ] Add search with debouncing
- [ ] Create filter panel with date/tag/folder options
- [ ] Build folder/project organization system
- [ ] Implement tagging (manual + AI-assisted)
- [ ] Add export functionality (JSON, Markdown, HTML)
- [ ] Create sharing mechanism with privacy controls
- [ ] Optimize for mobile (gestures, responsive design)
- [ ] Add pagination/infinite scroll
- [ ] Implement caching strategy
- [ ] Add privacy controls (delete, archive, history toggle)
- [ ] Create shared link management
- [ ] Add performance monitoring
- [ ] Implement compression for large datasets
- [ ] Add accessibility features (keyboard navigation, screen readers)

### Performance Targets

- **Initial load:** < 1 second
- **Time to interactive:** < 2 seconds
- **Scroll FPS:** 60fps
- **Search response:** < 300ms
- **Export generation:** < 5 seconds for 1000 messages
- **Cache hit rate:** > 80%

---

## Additional Resources

### Libraries and Tools

**React:**

- [TanStack Virtual](https://tanstack.com/virtual) - Virtualization
- [Stream Chat React](https://getstream.io/chat/sdk/react/) - Full chat SDK
- [React Window](https://github.com/bvaughn/react-window) - Virtualization
- [date-fns](https://date-fns.org/) - Date formatting
- [pako](https://github.com/nodeca/pako) - Compression

**Backend:**

- [Redis](https://redis.io/) - Caching
- [Elasticsearch](https://www.elastic.co/) - Full-text search
- [PostgreSQL](https://www.postgresql.org/) - Database with full-text search

**Testing:**

- [Playwright](https://playwright.dev/) - E2E testing
- [React Testing Library](https://testing-library.com/react) - Component testing
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) - Performance auditing

### Further Reading

- [ChatGPT Projects Documentation](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)
- [Claude Chat Search](https://support.claude.com/en/articles/11817273-using-claude-s-chat-search-and-memory-to-build-on-previous-context)
- [Perplexity Threads Guide](https://www.perplexity.ai/help-center/en/articles/10354769-what-is-a-thread)
- [Infinite Scroll Best Practices](https://addyosmani.com/blog/infinite-scroll-without-layout-shifts/)
- [Virtual Scrolling Guide](https://blog.logrocket.com/speed-up-long-lists-tanstack-virtual/)

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2026  
**Author:** AI Conversation History UX Research Team
