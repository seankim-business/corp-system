# Activity Feed Patterns with Real-Time Updates

A comprehensive guide to implementing activity feeds with real-time updates, covering feed types, aggregation strategies, and infinite scroll patterns. Based on real-world implementations from Linear, GitHub, Slack, and other production systems.

## Table of Contents

1. [Feed Types](#feed-types)
2. [Core Architecture](#core-architecture)
3. [Aggregation Strategies](#aggregation-strategies)
4. [Infinite Scroll Implementation](#infinite-scroll-implementation)
5. [Real-Time Updates](#real-time-updates)
6. [Performance Optimization](#performance-optimization)
7. [Complete Examples](#complete-examples)

---

## Feed Types

### 1. Global Activity Feed

**Purpose**: Shows all activity across the entire platform or organization.

**Use Cases**:

- Organization-wide updates
- Platform announcements
- Cross-team visibility
- Admin dashboards

**Key Characteristics**:

- High volume of events
- Requires aggressive filtering
- Often needs permission-based filtering
- May include system-generated events

```typescript
// Global Feed Query
interface GlobalFeedQuery {
  organizationId: string;
  limit?: number;
  cursor?: string;
  filters?: {
    eventTypes?: ActivityEventType[];
    dateRange?: { start: Date; end: Date };
    excludeSystemEvents?: boolean;
  };
}

// Example from Novu's activity feed implementation
interface GlobalActivityFeed {
  async getActivityFeed(command: GetActivityFeedCommand): Promise<ActivitiesResponseDto> {
    const { organizationId, subscriberId, page = 0, limit = 10 } = command;

    // Fetch activities with pagination
    const activities = await this.notificationRepository.find({
      _organizationId: organizationId,
      _subscriberId: subscriberId,
    }, {
      limit,
      skip: page * limit,
      sort: { createdAt: -1 }
    });

    return {
      data: activities.map(mapFeedItemToDto),
      totalCount: await this.notificationRepository.count({ _organizationId: organizationId }),
      page,
      pageSize: limit,
    };
  }
}
```

### 2. Personal Activity Feed

**Purpose**: Shows activity relevant to a specific user.

**Use Cases**:

- User notifications
- Personalized updates
- "What I missed" summaries
- User-specific events

**Key Characteristics**:

- Filtered by user permissions
- Includes mentions and assignments
- May include followed items
- Typically lower volume than global feed

```typescript
// Personal Feed with Subscription Filtering
interface PersonalFeedQuery {
  userId: string;
  includeFollowing?: boolean;
  includeMentions?: boolean;
  includeAssignments?: boolean;
  limit?: number;
  cursor?: string;
}

interface PersonalActivityFeed {
  // User's subscribed feeds
  subscriptions: Subscription[];

  // Activity filtering
  getPersonalFeed(query: PersonalFeedQuery): Promise<ActivityFeedResponse> {
    const filters = [];

    // Include items user is subscribed to
    if (query.includeFollowing) {
      filters.push({
        feedId: { $in: this.subscriptions.map(s => s.feedId) }
      });
    }

    // Include mentions
    if (query.includeMentions) {
      filters.push({
        mentions: { $contains: query.userId }
      });
    }

    // Include assignments
    if (query.includeAssignments) {
      filters.push({
        assigneeId: query.userId
      });
    }

    return this.fetchActivities({
      $or: filters,
      limit: query.limit,
      cursor: query.cursor
    });
  }
}

// Example: User subscription management (from RSSNext/Folo)
const usePersonalFeed = (userId: string) => {
  const subscriptions = useSubscriptionByUserId(userId);

  return useInfiniteQuery({
    queryKey: ['personalFeed', userId],
    queryFn: async ({ pageParam = 0 }) => {
      const feedIds = subscriptions.map(s => s.feedId);
      return fetchActivities({
        feedIds,
        userId,
        page: pageParam,
        limit: 20
      });
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
};
```

### 3. Team/Group Activity Feed

**Purpose**: Shows activity for a specific team, project, or workspace.

**Use Cases**:

- Team collaboration updates
- Project-specific activity
- Workspace changes
- Team member actions

**Key Characteristics**:

- Scoped to team/project context
- Includes team member actions
- May aggregate related events
- Medium volume

```typescript
// Team Feed with Context
interface TeamFeedQuery {
  teamId: string;
  projectId?: string;
  workspaceId?: string;
  limit?: number;
  cursor?: string;
  filters?: {
    members?: string[];
    eventTypes?: ActivityEventType[];
  };
}

interface TeamActivityFeed {
  teamId: string;
  members: TeamMember[];

  async getTeamFeed(query: TeamFeedQuery): Promise<ActivityFeedResponse> {
    // Build context-aware query
    const baseQuery = {
      teamId: query.teamId,
      ...(query.projectId && { projectId: query.projectId }),
      ...(query.workspaceId && { workspaceId: query.workspaceId }),
    };

    // Apply member filtering
    if (query.filters?.members) {
      baseQuery.actorId = { $in: query.filters.members };
    }

    // Apply event type filtering
    if (query.filters?.eventTypes) {
      baseQuery.eventType = { $in: query.filters.eventTypes };
    }

    return this.fetchActivities({
      ...baseQuery,
      limit: query.limit,
      cursor: query.cursor,
      sort: { createdAt: -1 }
    });
  }
}

// Example: Team feed with real-time sync (from Spacedrive)
const TeamFeedWithSync = ({ teamId }: { teamId: string }) => {
  const [showActivityFeed, setShowActivityFeed] = useState(false);
  const { onlinePeerCount, isSyncing } = useSyncCount();
  const sync = useSyncMonitor();

  return (
    <div>
      <PeerList teamId={teamId} />
      {showActivityFeed && (
        <ActivityFeed
          teamId={teamId}
          syncStatus={isSyncing}
          onlinePeers={onlinePeerCount}
        />
      )}
    </div>
  );
};
```

---

## Core Architecture

### Activity Event Model

```typescript
// Base Activity Event
interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  actorId: string;
  actorType: "user" | "system" | "bot";
  targetId: string;
  targetType: string;
  action: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  // Contextual information
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  workspaceId?: string;

  // Aggregation support
  aggregationKey?: string;
  aggregatedCount?: number;

  // Real-time support
  isRealtime?: boolean;
  sequenceNumber?: number;
}

// Activity Event Types
enum ActivityEventType {
  // Content events
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",

  // Collaboration events
  COMMENTED = "commented",
  MENTIONED = "mentioned",
  ASSIGNED = "assigned",
  UNASSIGNED = "unassigned",

  // Status events
  STATUS_CHANGED = "status_changed",
  PRIORITY_CHANGED = "priority_changed",

  // Sharing events
  SHARED = "shared",
  FORKED = "forked",
  PUBLISHED = "published",

  // User events
  USER_JOINED = "user_joined",
  USER_LEFT = "user_left",
  USER_VISITED = "user_visited",
}

// Activity Feed Item (UI representation)
interface ActivityFeedItem {
  id: string;
  sortIndex: number;
  userId?: string | null;
  state: "created" | "updated" | "deleted" | "commented" | "shared" | "forked" | "published";
  title: React.ReactNode;
  subtitle: React.ReactNode;
  userPic?: React.ReactNode;
  timestamp: Date;
  isAggregated?: boolean;
  aggregatedEvents?: ActivityEvent[];
}
```

### Feed Response Structure

```typescript
// Paginated Feed Response
interface ActivityFeedResponse {
  data: ActivityFeedItem[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
    nextCursor?: string;
  };
  metadata?: {
    fetchedAt: Date;
    cacheKey?: string;
  };
}

// Infinite Query Response (TanStack Query pattern)
interface InfiniteActivityFeedResponse {
  pages: ActivityFeedResponse[];
  pageParams: (string | number)[];
}
```

---

## Aggregation Strategies

### 1. Time-Based Aggregation

Group events that occur within a specific time window.

```typescript
// Time-based binning
function binActivitiesByTime<T extends ActivityEvent>(
  activities: readonly T[],
  timeWindowMs: number = 5 * 60 * 1000, // 5 minutes
): readonly (readonly T[])[] {
  const bins: T[][] = [];
  let currentBin: T[] = [];

  for (let i = 0; i < activities.length; i++) {
    const current = activities[i];
    const previous = activities[i - 1];

    if (!previous) {
      currentBin = [current];
      continue;
    }

    const timeDiff = previous.createdAt.getTime() - current.createdAt.getTime();

    if (timeDiff <= timeWindowMs) {
      currentBin.push(current);
    } else {
      bins.push(currentBin);
      currentBin = [current];
    }
  }

  if (currentBin.length > 0) {
    bins.push(currentBin);
  }

  return bins;
}

// Example usage
const aggregatedByTime = binActivitiesByTime(activities, 5 * 60 * 1000);
// Result: [[event1, event2], [event3, event4, event5], [event6]]
```

### 2. Actor-Based Aggregation

Group events by the same actor performing similar actions.

```typescript
// Actor-based aggregation
function aggregateByActor(activities: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const aggregated = new Map<string, ActivityEvent[]>();

  for (const activity of activities) {
    const key = `${activity.actorId}:${activity.action}:${activity.targetType}`;

    if (!aggregated.has(key)) {
      aggregated.set(key, []);
    }

    aggregated.get(key)!.push(activity);
  }

  return aggregated;
}

// Create aggregated feed items
function createAggregatedFeedItems(
  aggregatedMap: Map<string, ActivityEvent[]>,
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];

  for (const [key, events] of aggregatedMap) {
    if (events.length === 1) {
      // Single event - no aggregation needed
      items.push(createFeedItem(events[0]));
    } else {
      // Multiple events - create aggregated item
      items.push({
        id: key,
        sortIndex: events[0].createdAt.getTime(),
        userId: events[0].actorId,
        state: events[0].type as any,
        title: `${events[0].actorId} ${events[0].action} ${events.length} items`,
        subtitle: formatTimeAgo(events[0].createdAt),
        timestamp: events[0].createdAt,
        isAggregated: true,
        aggregatedEvents: events,
      });
    }
  }

  return items.sort((a, b) => b.sortIndex - a.sortIndex);
}
```

### 3. Context-Based Aggregation

Group events related to the same target or context.

```typescript
// Context-based aggregation (from BotFramework WebChat)
interface GroupActivitiesMiddleware {
  (
    groupingName: string,
  ): (options: { activities: readonly ActivityEvent[] }) => readonly (readonly ActivityEvent[])[];
}

// Default grouping middleware
function createDefaultGroupActivitiesMiddleware({
  groupTimestamp,
}: {
  groupTimestamp: boolean | number;
}): GroupActivitiesMiddleware[] {
  return [
    (groupingName) =>
      ({ activities }) => {
        if (groupingName === "status") {
          // Group by send status
          return groupByStatus(activities);
        } else if (groupingName === "sender") {
          // Group by sender with time window
          return groupBySender(activities, groupTimestamp);
        }

        // Default: no grouping
        return activities.map((a) => [a]);
      },
  ];
}

// Group by status
function groupByStatus(
  activities: readonly ActivityEvent[],
): readonly (readonly ActivityEvent[])[] {
  const groups: ActivityEvent[][] = [];
  let currentGroup: ActivityEvent[] = [];
  let currentStatus: string | null = null;

  for (const activity of activities) {
    const status = activity.metadata?.sendStatus || "sent";

    if (status !== currentStatus) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [activity];
      currentStatus = status;
    } else {
      currentGroup.push(activity);
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

// Group by sender with time window
function groupBySender(
  activities: readonly ActivityEvent[],
  timeWindowMs: number | boolean,
): readonly (readonly ActivityEvent[])[] {
  if (timeWindowMs === false) {
    return activities.map((a) => [a]);
  }

  const windowMs = typeof timeWindowMs === "number" ? timeWindowMs : 5 * 60 * 1000; // 5 minutes default

  const groups: ActivityEvent[][] = [];
  let currentGroup: ActivityEvent[] = [];
  let lastActivity: ActivityEvent | null = null;

  for (const activity of activities) {
    if (!lastActivity) {
      currentGroup = [activity];
      lastActivity = activity;
      continue;
    }

    const sameActor = activity.actorId === lastActivity.actorId;
    const withinTimeWindow =
      activity.createdAt.getTime() - lastActivity.createdAt.getTime() <= windowMs;

    if (sameActor && withinTimeWindow) {
      currentGroup.push(activity);
    } else {
      groups.push(currentGroup);
      currentGroup = [activity];
    }

    lastActivity = activity;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}
```

### 4. Smart Aggregation with Multiple Strategies

Combine multiple aggregation strategies for optimal UX.

```typescript
// Multi-strategy aggregation
interface AggregationStrategy {
  name: string;
  shouldAggregate: (events: ActivityEvent[]) => boolean;
  aggregate: (events: ActivityEvent[]) => ActivityFeedItem;
}

class ActivityAggregator {
  private strategies: AggregationStrategy[] = [];

  constructor() {
    this.registerDefaultStrategies();
  }

  private registerDefaultStrategies() {
    // Strategy 1: Aggregate multiple creates by same user
    this.strategies.push({
      name: "bulk-create",
      shouldAggregate: (events) => {
        return (
          events.length > 1 &&
          events.every((e) => e.type === ActivityEventType.CREATED) &&
          events.every((e) => e.actorId === events[0].actorId)
        );
      },
      aggregate: (events) => ({
        id: `agg-${events[0].id}`,
        sortIndex: events[0].createdAt.getTime(),
        userId: events[0].actorId,
        state: "created",
        title: `Created ${events.length} items`,
        subtitle: formatTimeAgo(events[0].createdAt),
        timestamp: events[0].createdAt,
        isAggregated: true,
        aggregatedEvents: events,
      }),
    });

    // Strategy 2: Aggregate status changes on same item
    this.strategies.push({
      name: "status-progression",
      shouldAggregate: (events) => {
        return (
          events.length > 1 &&
          events.every((e) => e.type === ActivityEventType.STATUS_CHANGED) &&
          events.every((e) => e.targetId === events[0].targetId)
        );
      },
      aggregate: (events) => {
        const firstStatus = events[events.length - 1].metadata.fromStatus;
        const lastStatus = events[0].metadata.toStatus;

        return {
          id: `agg-${events[0].id}`,
          sortIndex: events[0].createdAt.getTime(),
          userId: events[0].actorId,
          state: "updated",
          title: `Changed status from ${firstStatus} to ${lastStatus}`,
          subtitle: `${events.length} status changes`,
          timestamp: events[0].createdAt,
          isAggregated: true,
          aggregatedEvents: events,
        };
      },
    });

    // Strategy 3: Aggregate comments on same item
    this.strategies.push({
      name: "comment-thread",
      shouldAggregate: (events) => {
        return (
          events.length > 2 &&
          events.every((e) => e.type === ActivityEventType.COMMENTED) &&
          events.every((e) => e.targetId === events[0].targetId)
        );
      },
      aggregate: (events) => ({
        id: `agg-${events[0].id}`,
        sortIndex: events[0].createdAt.getTime(),
        userId: events[0].actorId,
        state: "commented",
        title: `${events.length} comments on ${events[0].metadata.targetTitle}`,
        subtitle: formatTimeAgo(events[0].createdAt),
        timestamp: events[0].createdAt,
        isAggregated: true,
        aggregatedEvents: events,
      }),
    });
  }

  aggregate(activities: ActivityEvent[]): ActivityFeedItem[] {
    const items: ActivityFeedItem[] = [];
    const processed = new Set<string>();

    // Sort by timestamp descending
    const sorted = [...activities].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    for (let i = 0; i < sorted.length; i++) {
      if (processed.has(sorted[i].id)) continue;

      // Look ahead for potential aggregation candidates
      const candidates = [sorted[i]];
      for (let j = i + 1; j < Math.min(i + 10, sorted.length); j++) {
        if (!processed.has(sorted[j].id)) {
          candidates.push(sorted[j]);
        }
      }

      // Try each strategy
      let aggregated = false;
      for (const strategy of this.strategies) {
        if (strategy.shouldAggregate(candidates)) {
          items.push(strategy.aggregate(candidates));
          candidates.forEach((c) => processed.add(c.id));
          aggregated = true;
          break;
        }
      }

      // No aggregation - add as single item
      if (!aggregated) {
        items.push(this.createSingleItem(sorted[i]));
        processed.add(sorted[i].id);
      }
    }

    return items;
  }

  private createSingleItem(event: ActivityEvent): ActivityFeedItem {
    return {
      id: event.id,
      sortIndex: event.createdAt.getTime(),
      userId: event.actorId,
      state: event.type as any,
      title: this.formatEventTitle(event),
      subtitle: formatTimeAgo(event.createdAt),
      timestamp: event.createdAt,
    };
  }

  private formatEventTitle(event: ActivityEvent): string {
    // Format based on event type
    switch (event.type) {
      case ActivityEventType.CREATED:
        return `Created ${event.targetType}`;
      case ActivityEventType.UPDATED:
        return `Updated ${event.targetType}`;
      case ActivityEventType.COMMENTED:
        return `Commented on ${event.metadata.targetTitle}`;
      default:
        return event.action;
    }
  }
}
```

---

## Infinite Scroll Implementation

### 1. TanStack Query (React Query) Pattern

The most common pattern for infinite scroll in modern React applications.

```typescript
// Infinite Query Hook
import { useInfiniteQuery } from '@tanstack/react-query';

interface UseActivityFeedOptions {
  feedType: 'global' | 'personal' | 'team';
  feedId?: string;
  userId?: string;
  teamId?: string;
  limit?: number;
}

function useActivityFeed(options: UseActivityFeedOptions) {
  const { feedType, feedId, userId, teamId, limit = 20 } = options;

  return useInfiniteQuery({
    queryKey: ['activityFeed', feedType, feedId, userId, teamId],

    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch('/api/activity-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedType,
          feedId,
          userId,
          teamId,
          page: pageParam,
          limit,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch activity feed');
      }

      return response.json() as Promise<ActivityFeedResponse>;
    },

    getNextPageParam: (lastPage, allPages) => {
      // Cursor-based pagination
      if (lastPage.pagination.nextCursor) {
        return lastPage.pagination.nextCursor;
      }

      // Offset-based pagination
      if (lastPage.pagination.hasNextPage) {
        return allPages.length;
      }

      return undefined;
    },

    // Optional: Get previous page param for bi-directional scroll
    getPreviousPageParam: (firstPage) => {
      return firstPage.pagination.previousCursor;
    },

    // Stale time - how long data is considered fresh
    staleTime: 30 * 1000, // 30 seconds

    // Cache time - how long to keep unused data in cache
    cacheTime: 5 * 60 * 1000, // 5 minutes

    // Refetch on window focus
    refetchOnWindowFocus: true,

    // Refetch interval for real-time updates
    refetchInterval: 60 * 1000, // 1 minute
  });
}

// Usage in component
function ActivityFeedList({ feedType, userId }: { feedType: 'personal', userId: string }) {
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useActivityFeed({ feedType, userId });

  // Flatten pages into single array
  const activities = data?.pages.flatMap(page => page.data) ?? [];

  if (status === 'loading') {
    return <LoadingSpinner />;
  }

  if (status === 'error') {
    return <ErrorMessage error={error} />;
  }

  return (
    <div>
      {activities.map(activity => (
        <ActivityFeedItem key={activity.id} activity={activity} />
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading more...' : 'Load More'}
        </button>
      )}

      {isFetching && !isFetchingNextPage && <div>Refreshing...</div>}
    </div>
  );
}
```

### 2. Intersection Observer Pattern

Automatically load more content when user scrolls near the bottom.

```typescript
// Intersection Observer Hook
import { useEffect, useRef, useCallback } from 'react';

interface UseInfiniteScrollOptions {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage: () => void;
  rootMargin?: string;
  threshold?: number;
}

function useInfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  rootMargin = '100px',
  threshold = 0.1,
}: UseInfiniteScrollOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;

      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) return;

    const option = {
      root: null,
      rootMargin,
      threshold,
    };

    observerRef.current = new IntersectionObserver(handleObserver, option);
    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleObserver, rootMargin, threshold]);

  return loadMoreRef;
}

// Usage in component
function ActivityFeedWithAutoLoad({ feedType, userId }: { feedType: 'personal', userId: string }) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityFeed({ feedType, userId });

  const loadMoreRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootMargin: '200px', // Start loading 200px before reaching the bottom
  });

  const activities = data?.pages.flatMap(page => page.data) ?? [];

  return (
    <div className="activity-feed">
      {activities.map(activity => (
        <ActivityFeedItem key={activity.id} activity={activity} />
      ))}

      {/* Sentinel element for intersection observer */}
      <div ref={loadMoreRef} className="load-more-sentinel">
        {isFetchingNextPage && <LoadingSpinner />}
      </div>

      {!hasNextPage && activities.length > 0 && (
        <div className="end-of-feed">You've reached the end</div>
      )}
    </div>
  );
}
```

### 3. Virtual Scrolling for Large Feeds

For feeds with thousands of items, use virtual scrolling to render only visible items.

```typescript
// Virtual Infinite Scroll (from TryGhost/Ghost)
import { useVirtualizer } from '@tanstack/react-virtual';

interface UseInfiniteVirtualScrollOptions<T> {
  items: T[];
  totalItems: number;
  parentRef: React.RefObject<HTMLElement>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage: () => void;
  estimateSize?: (index: number) => number;
  overscan?: number;
}

function useInfiniteVirtualScroll<T>({
  items,
  totalItems,
  parentRef,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  estimateSize = () => 100,
  overscan = 5,
}: UseInfiniteVirtualScrollOptions<T>) {
  const virtualizer = useVirtualizer({
    count: totalItems,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Fetch more when scrolling near the end
  useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();

    if (!lastItem) return;

    if (
      lastItem.index >= items.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    hasNextPage,
    fetchNextPage,
    items.length,
    isFetchingNextPage,
    virtualItems,
  ]);

  return {
    virtualizer,
    virtualItems,
  };
}

// Usage in component
function VirtualActivityFeed({ feedType, userId }: { feedType: 'personal', userId: string }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityFeed({ feedType, userId });

  const activities = data?.pages.flatMap(page => page.data) ?? [];
  const totalItems = data?.pages[0]?.pagination.total ?? 0;

  const { virtualizer, virtualItems } = useInfiniteVirtualScroll({
    items: activities,
    totalItems,
    parentRef,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    estimateSize: () => 80, // Estimated height of each item
    overscan: 10, // Render 10 items above/below viewport
  });

  return (
    <div
      ref={parentRef}
      className="activity-feed-container"
      style={{ height: '600px', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map(virtualItem => {
          const activity = activities[virtualItem.index];

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <ActivityFeedItem activity={activity} />
            </div>
          );
        })}
      </div>

      {isFetchingNextPage && (
        <div className="loading-more">Loading more...</div>
      )}
    </div>
  );
}
```

### 4. Bi-Directional Infinite Scroll

Support scrolling both up and down (useful for chat-like feeds).

```typescript
// Bi-directional infinite scroll
function useBidirectionalInfiniteScroll({
  feedType,
  userId,
}: {
  feedType: "personal";
  userId: string;
}) {
  const {
    data,
    fetchNextPage,
    fetchPreviousPage,
    hasNextPage,
    hasPreviousPage,
    isFetchingNextPage,
    isFetchingPreviousPage,
  } = useInfiniteQuery({
    queryKey: ["activityFeed", feedType, userId],

    queryFn: async ({ pageParam = { cursor: null, direction: "next" } }) => {
      const response = await fetch("/api/activity-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedType,
          userId,
          cursor: pageParam.cursor,
          direction: pageParam.direction,
          limit: 20,
        }),
      });

      return response.json() as Promise<ActivityFeedResponse>;
    },

    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.nextCursor) {
        return {
          cursor: lastPage.pagination.nextCursor,
          direction: "next",
        };
      }
      return undefined;
    },

    getPreviousPageParam: (firstPage) => {
      if (firstPage.pagination.previousCursor) {
        return {
          cursor: firstPage.pagination.previousCursor,
          direction: "previous",
        };
      }
      return undefined;
    },
  });

  // Intersection observers for both directions
  const topSentinelRef = useInfiniteScroll({
    hasNextPage: hasPreviousPage,
    isFetchingNextPage: isFetchingPreviousPage,
    fetchNextPage: fetchPreviousPage,
    rootMargin: "200px",
  });

  const bottomSentinelRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootMargin: "200px",
  });

  return {
    data,
    topSentinelRef,
    bottomSentinelRef,
    isFetchingPreviousPage,
    isFetchingNextPage,
  };
}
```

---

## Real-Time Updates

### 1. WebSocket Subscription Pattern

```typescript
// WebSocket subscription for real-time updates
import { useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface UseActivityFeedSubscriptionOptions {
  feedType: "global" | "personal" | "team";
  feedId?: string;
  userId?: string;
  teamId?: string;
  enabled?: boolean;
}

function useActivityFeedSubscription(options: UseActivityFeedSubscriptionOptions) {
  const { feedType, feedId, userId, teamId, enabled = true } = options;
  const queryClient = useQueryClient();

  const handleNewActivity = useCallback(
    (newActivity: ActivityEvent) => {
      // Update the query cache with new activity
      queryClient.setQueryData(
        ["activityFeed", feedType, feedId, userId, teamId],
        (oldData: InfiniteActivityFeedResponse | undefined) => {
          if (!oldData) return oldData;

          // Add new activity to the first page
          const newPages = [...oldData.pages];
          newPages[0] = {
            ...newPages[0],
            data: [createFeedItemFromEvent(newActivity), ...newPages[0].data],
            pagination: {
              ...newPages[0].pagination,
              total: newPages[0].pagination.total + 1,
            },
          };

          return {
            ...oldData,
            pages: newPages,
          };
        },
      );
    },
    [queryClient, feedType, feedId, userId, teamId],
  );

  useEffect(() => {
    if (!enabled) return;

    // Connect to WebSocket
    const ws = new WebSocket(`wss://api.example.com/activity-feed`);

    ws.onopen = () => {
      // Subscribe to feed
      ws.send(
        JSON.stringify({
          type: "subscribe",
          feedType,
          feedId,
          userId,
          teamId,
        }),
      );
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "activity") {
        handleNewActivity(message.data);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      // Unsubscribe and close connection
      ws.send(
        JSON.stringify({
          type: "unsubscribe",
          feedType,
          feedId,
          userId,
          teamId,
        }),
      );
      ws.close();
    };
  }, [enabled, feedType, feedId, userId, teamId, handleNewActivity]);
}

// Usage
function ActivityFeedWithRealtime({ feedType, userId }: { feedType: "personal"; userId: string }) {
  const feedQuery = useActivityFeed({ feedType, userId });

  // Subscribe to real-time updates
  useActivityFeedSubscription({
    feedType,
    userId,
    enabled: true,
  });

  // ... render feed
}
```

### 2. GraphQL Subscription Pattern

```typescript
// GraphQL subscription (from OpenCTI)
import { useSubscription } from "@apollo/client";
import { gql } from "@apollo/client";

const ACTIVITY_SUBSCRIPTION = gql`
  subscription ActivityFeedSubscription($userId: ID!) {
    activityBus(userId: $userId) {
      id
      type
      actorId
      targetId
      action
      metadata
      createdAt
    }
  }
`;

function useActivityFeedGraphQLSubscription(userId: string) {
  const queryClient = useQueryClient();

  useSubscription(ACTIVITY_SUBSCRIPTION, {
    variables: { userId },
    onData: ({ data }) => {
      if (data.data?.activityBus) {
        const newActivity = data.data.activityBus;

        // Update query cache
        queryClient.setQueryData(
          ["activityFeed", "personal", userId],
          (oldData: InfiniteActivityFeedResponse | undefined) => {
            if (!oldData) return oldData;

            return {
              ...oldData,
              pages: [
                {
                  ...oldData.pages[0],
                  data: [createFeedItemFromEvent(newActivity), ...oldData.pages[0].data],
                },
                ...oldData.pages.slice(1),
              ],
            };
          },
        );
      }
    },
  });
}
```

### 3. Server-Sent Events (SSE) Pattern

```typescript
// SSE for real-time updates
function useActivityFeedSSE(options: UseActivityFeedSubscriptionOptions) {
  const { feedType, userId, enabled = true } = options;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const eventSource = new EventSource(
      `/api/activity-feed/stream?feedType=${feedType}&userId=${userId}`,
    );

    eventSource.addEventListener("activity", (event) => {
      const newActivity = JSON.parse(event.data) as ActivityEvent;

      queryClient.setQueryData(
        ["activityFeed", feedType, userId],
        (oldData: InfiniteActivityFeedResponse | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            pages: [
              {
                ...oldData.pages[0],
                data: [createFeedItemFromEvent(newActivity), ...oldData.pages[0].data],
              },
              ...oldData.pages.slice(1),
            ],
          };
        },
      );
    });

    eventSource.onerror = (error) => {
      console.error("SSE error:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [enabled, feedType, userId, queryClient]);
}
```

### 4. Optimistic Updates

```typescript
// Optimistic updates for immediate feedback
function useOptimisticActivityUpdate() {
  const queryClient = useQueryClient();

  const addActivityOptimistically = useCallback(
    async (activity: Omit<ActivityEvent, "id" | "createdAt">, feedKey: string[]) => {
      // Create optimistic activity
      const optimisticActivity: ActivityEvent = {
        ...activity,
        id: `optimistic-${Date.now()}`,
        createdAt: new Date(),
        isRealtime: true,
      };

      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: feedKey });

      // Snapshot the previous value
      const previousData = queryClient.getQueryData<InfiniteActivityFeedResponse>(feedKey);

      // Optimistically update
      queryClient.setQueryData<InfiniteActivityFeedResponse>(feedKey, (old) => {
        if (!old) return old;

        return {
          ...old,
          pages: [
            {
              ...old.pages[0],
              data: [createFeedItemFromEvent(optimisticActivity), ...old.pages[0].data],
            },
            ...old.pages.slice(1),
          ],
        };
      });

      return { previousData, optimisticActivity };
    },
    [queryClient],
  );

  const rollbackOptimisticUpdate = useCallback(
    (feedKey: string[], previousData: InfiniteActivityFeedResponse | undefined) => {
      queryClient.setQueryData(feedKey, previousData);
    },
    [queryClient],
  );

  return {
    addActivityOptimistically,
    rollbackOptimisticUpdate,
  };
}

// Usage in mutation
function useCreateActivity() {
  const queryClient = useQueryClient();
  const { addActivityOptimistically, rollbackOptimisticUpdate } = useOptimisticActivityUpdate();

  return useMutation({
    mutationFn: async (activity: Omit<ActivityEvent, "id" | "createdAt">) => {
      const response = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activity),
      });

      if (!response.ok) {
        throw new Error("Failed to create activity");
      }

      return response.json();
    },

    onMutate: async (newActivity) => {
      const feedKey = ["activityFeed", "personal", newActivity.actorId];
      return addActivityOptimistically(newActivity, feedKey);
    },

    onError: (err, newActivity, context) => {
      if (context?.previousData) {
        const feedKey = ["activityFeed", "personal", newActivity.actorId];
        rollbackOptimisticUpdate(feedKey, context.previousData);
      }
    },

    onSettled: (data, error, variables) => {
      const feedKey = ["activityFeed", "personal", variables.actorId];
      queryClient.invalidateQueries({ queryKey: feedKey });
    },
  });
}
```

---

## Performance Optimization

### 1. Memoization and React.memo

```typescript
// Memoized activity feed item
import { memo } from 'react';

interface ActivityFeedItemProps {
  activity: ActivityFeedItem;
  onSelect?: (id: string) => void;
  isSelected?: boolean;
}

const ActivityFeedItem = memo<ActivityFeedItemProps>(
  ({ activity, onSelect, isSelected }) => {
    const handleClick = useCallback(() => {
      onSelect?.(activity.id);
    }, [activity.id, onSelect]);

    return (
      <div
        className={`activity-item ${isSelected ? 'selected' : ''}`}
        onClick={handleClick}
      >
        <div className="activity-header">
          {activity.userPic}
          <span className="activity-title">{activity.title}</span>
        </div>
        <div className="activity-subtitle">{activity.subtitle}</div>
        {activity.isAggregated && (
          <div className="aggregation-badge">
            +{activity.aggregatedEvents?.length} more
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for better performance
    return (
      prevProps.activity.id === nextProps.activity.id &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.activity.sortIndex === nextProps.activity.sortIndex
    );
  }
);
```

### 2. Debounced Scroll Handling

```typescript
// Debounced scroll for better performance
import { useDebouncedCallback } from 'use-debounce';

function useDebounced InfiniteScroll({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  debounceMs = 300,
}: {
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  fetchNextPage: () => void;
  debounceMs?: number;
}) {
  const debouncedFetchNextPage = useDebouncedCallback(
    () => {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    debounceMs,
    { leading: true, trailing: false }
  );

  return debouncedFetchNextPage;
}
```

### 3. Request Deduplication

```typescript
// Automatic request deduplication with React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Deduplicate requests within 1 second
      staleTime: 1000,

      // Keep unused data in cache for 5 minutes
      cacheTime: 5 * 60 * 1000,

      // Retry failed requests
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),

      // Refetch on window focus
      refetchOnWindowFocus: true,

      // Don't refetch on mount if data is fresh
      refetchOnMount: false,
    },
  },
});
```

### 4. Pagination Strategy

```typescript
// Cursor-based pagination for better performance
interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

interface CursorPaginationResponse<T> {
  data: T[];
  nextCursor?: string;
  previousCursor?: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

async function fetchActivitiesWithCursor(
  params: CursorPaginationParams,
): Promise<CursorPaginationResponse<ActivityEvent>> {
  const { cursor, limit } = params;

  // Build query
  const query: any = {};

  if (cursor) {
    // Decode cursor (base64 encoded timestamp + id)
    const [timestamp, id] = Buffer.from(cursor, "base64").toString("utf-8").split(":");

    query.createdAt = { $lt: new Date(timestamp) };
    query.id = { $ne: id };
  }

  // Fetch activities
  const activities = await db.activities
    .find(query)
    .sort({ createdAt: -1, id: -1 })
    .limit(limit + 1) // Fetch one extra to check if there's a next page
    .toArray();

  const hasNextPage = activities.length > limit;
  const data = hasNextPage ? activities.slice(0, limit) : activities;

  // Generate next cursor
  let nextCursor: string | undefined;
  if (hasNextPage && data.length > 0) {
    const lastItem = data[data.length - 1];
    nextCursor = Buffer.from(`${lastItem.createdAt.toISOString()}:${lastItem.id}`).toString(
      "base64",
    );
  }

  return {
    data,
    nextCursor,
    hasNextPage,
    hasPreviousPage: !!cursor,
  };
}
```

---

## Complete Examples

### Example 1: Personal Activity Feed with Real-Time Updates

```typescript
// Complete personal activity feed component
import { useState, useCallback } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

interface PersonalActivityFeedProps {
  userId: string;
}

export function PersonalActivityFeed({ userId }: PersonalActivityFeedProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Infinite query for activity feed
  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: ['activityFeed', 'personal', userId],

    queryFn: async ({ pageParam = null }) => {
      const response = await fetch('/api/activity-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedType: 'personal',
          userId,
          cursor: pageParam,
          limit: 20,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch activity feed');
      }

      return response.json() as Promise<ActivityFeedResponse>;
    },

    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Real-time subscription
  useActivityFeedSubscription({
    feedType: 'personal',
    userId,
    enabled: true,
  });

  // Infinite scroll
  const loadMoreRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rootMargin: '200px',
  });

  // Flatten activities
  const activities = data?.pages.flatMap(page => page.data) ?? [];

  // Aggregate activities
  const aggregator = new ActivityAggregator();
  const aggregatedActivities = aggregator.aggregate(
    activities.map(item => ({
      id: item.id,
      type: item.state as ActivityEventType,
      actorId: item.userId || 'system',
      actorType: 'user' as const,
      targetId: item.id,
      targetType: 'unknown',
      action: item.state,
      metadata: {},
      createdAt: item.timestamp,
      updatedAt: item.timestamp,
    }))
  );

  // Handlers
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['activityFeed', 'personal', userId] });
  }, [queryClient, userId]);

  // Render states
  if (status === 'loading') {
    return (
      <div className="activity-feed-loading">
        <LoadingSpinner />
        <p>Loading your activity feed...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="activity-feed-error">
        <ErrorIcon />
        <p>Failed to load activity feed</p>
        <button onClick={handleRefresh}>Retry</button>
      </div>
    );
  }

  if (aggregatedActivities.length === 0) {
    return (
      <div className="activity-feed-empty">
        <EmptyStateIcon />
        <p>No activity yet</p>
        <p className="subtitle">Your activity will appear here</p>
      </div>
    );
  }

  return (
    <div className="activity-feed">
      <div className="activity-feed-header">
        <h2>Activity Feed</h2>
        <button
          onClick={handleRefresh}
          disabled={isFetching}
          className="refresh-button"
        >
          {isFetching ? <LoadingSpinner size="small" /> : <RefreshIcon />}
        </button>
      </div>

      <div className="activity-feed-list">
        {aggregatedActivities.map(activity => (
          <ActivityFeedItem
            key={activity.id}
            activity={activity}
            isSelected={activity.id === selectedId}
            onSelect={handleSelect}
          />
        ))}

        {/* Sentinel for infinite scroll */}
        <div ref={loadMoreRef} className="load-more-sentinel">
          {isFetchingNextPage && (
            <div className="loading-more">
              <LoadingSpinner size="small" />
              <span>Loading more...</span>
            </div>
          )}
        </div>

        {!hasNextPage && (
          <div className="end-of-feed">
            <span>You've reached the end</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Example 2: Team Activity Feed with Filtering

```typescript
// Team activity feed with advanced filtering
import { useState, useMemo } from 'react';

interface TeamActivityFeedProps {
  teamId: string;
}

interface ActivityFilters {
  eventTypes: ActivityEventType[];
  members: string[];
  dateRange: { start: Date; end: Date } | null;
}

export function TeamActivityFeed({ teamId }: TeamActivityFeedProps) {
  const [filters, setFilters] = useState<ActivityFilters>({
    eventTypes: [],
    members: [],
    dateRange: null,
  });

  // Fetch team members
  const { data: teamMembers } = useQuery({
    queryKey: ['teamMembers', teamId],
    queryFn: () => fetchTeamMembers(teamId),
  });

  // Infinite query with filters
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['activityFeed', 'team', teamId, filters],

    queryFn: async ({ pageParam = null }) => {
      const response = await fetch('/api/activity-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedType: 'team',
          teamId,
          cursor: pageParam,
          limit: 20,
          filters: {
            eventTypes: filters.eventTypes.length > 0 ? filters.eventTypes : undefined,
            members: filters.members.length > 0 ? filters.members : undefined,
            dateRange: filters.dateRange,
          },
        }),
      });

      return response.json() as Promise<ActivityFeedResponse>;
    },

    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
  });

  // Real-time updates
  useActivityFeedSubscription({
    feedType: 'team',
    teamId,
    enabled: true,
  });

  // Infinite scroll
  const loadMoreRef = useInfiniteScroll({
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  });

  const activities = data?.pages.flatMap(page => page.data) ?? [];

  // Filter handlers
  const handleEventTypeToggle = (eventType: ActivityEventType) => {
    setFilters(prev => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(eventType)
        ? prev.eventTypes.filter(t => t !== eventType)
        : [...prev.eventTypes, eventType],
    }));
  };

  const handleMemberToggle = (memberId: string) => {
    setFilters(prev => ({
      ...prev,
      members: prev.members.includes(memberId)
        ? prev.members.filter(m => m !== memberId)
        : [...prev.members, memberId],
    }));
  };

  const handleDateRangeChange = (range: { start: Date; end: Date } | null) => {
    setFilters(prev => ({ ...prev, dateRange: range }));
  };

  const handleClearFilters = () => {
    setFilters({
      eventTypes: [],
      members: [],
      dateRange: null,
    });
  };

  const hasActiveFilters =
    filters.eventTypes.length > 0 ||
    filters.members.length > 0 ||
    filters.dateRange !== null;

  return (
    <div className="team-activity-feed">
      <div className="feed-header">
        <h2>Team Activity</h2>

        <div className="feed-filters">
          {/* Event type filter */}
          <FilterDropdown label="Event Types">
            {Object.values(ActivityEventType).map(type => (
              <FilterCheckbox
                key={type}
                label={type}
                checked={filters.eventTypes.includes(type)}
                onChange={() => handleEventTypeToggle(type)}
              />
            ))}
          </FilterDropdown>

          {/* Member filter */}
          <FilterDropdown label="Members">
            {teamMembers?.map(member => (
              <FilterCheckbox
                key={member.id}
                label={member.name}
                checked={filters.members.includes(member.id)}
                onChange={() => handleMemberToggle(member.id)}
              />
            ))}
          </FilterDropdown>

          {/* Date range filter */}
          <DateRangePicker
            value={filters.dateRange}
            onChange={handleDateRangeChange}
          />

          {/* Clear filters */}
          {hasActiveFilters && (
            <button onClick={handleClearFilters} className="clear-filters">
              Clear Filters
            </button>
          )}
        </div>
      </div>

      <div className="feed-content">
        {activities.map(activity => (
          <ActivityFeedItem key={activity.id} activity={activity} />
        ))}

        <div ref={loadMoreRef}>
          {isFetchingNextPage && <LoadingSpinner />}
        </div>

        {!hasNextPage && activities.length > 0 && (
          <div className="end-of-feed">No more activities</div>
        )}

        {activities.length === 0 && (
          <div className="empty-state">
            <p>No activities match your filters</p>
            <button onClick={handleClearFilters}>Clear Filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

### Example 3: Global Activity Feed with Virtual Scrolling

```typescript
// Global activity feed with virtual scrolling for high performance
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface GlobalActivityFeedProps {
  organizationId: string;
}

export function GlobalActivityFeed({ organizationId }: GlobalActivityFeedProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Infinite query
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['activityFeed', 'global', organizationId],

    queryFn: async ({ pageParam = null }) => {
      const response = await fetch('/api/activity-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedType: 'global',
          organizationId,
          cursor: pageParam,
          limit: 50, // Larger page size for virtual scrolling
        }),
      });

      return response.json() as Promise<ActivityFeedResponse>;
    },

    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
  });

  const activities = data?.pages.flatMap(page => page.data) ?? [];
  const totalItems = data?.pages[0]?.pagination.total ?? 0;

  // Virtual scrolling
  const virtualizer = useVirtualizer({
    count: totalItems,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Fetch more when scrolling near the end
  useEffect(() => {
    const [lastItem] = [...virtualItems].reverse();

    if (!lastItem) return;

    if (
      lastItem.index >= activities.length - 1 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage();
    }
  }, [
    hasNextPage,
    fetchNextPage,
    activities.length,
    isFetchingNextPage,
    virtualItems,
  ]);

  return (
    <div className="global-activity-feed">
      <div className="feed-header">
        <h2>Organization Activity</h2>
        <div className="feed-stats">
          <span>{totalItems.toLocaleString()} total activities</span>
        </div>
      </div>

      <div
        ref={parentRef}
        className="feed-scroll-container"
        style={{ height: '600px', overflow: 'auto' }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map(virtualItem => {
            const activity = activities[virtualItem.index];

            if (!activity) {
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <LoadingPlaceholder />
                </div>
              );
            }

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <ActivityFeedItem activity={activity} />
              </div>
            );
          })}
        </div>

        {isFetchingNextPage && (
          <div className="loading-more">
            <LoadingSpinner />
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Best Practices

### 1. Performance

- **Use virtual scrolling** for feeds with 1000+ items
- **Implement cursor-based pagination** instead of offset-based for better performance
- **Memoize components** with React.memo and useMemo
- **Debounce scroll events** to reduce unnecessary renders
- **Lazy load images** in activity items
- **Implement request deduplication** with React Query

### 2. User Experience

- **Show loading states** clearly (initial load, loading more, refreshing)
- **Provide empty states** with helpful messaging
- **Implement optimistic updates** for immediate feedback
- **Add pull-to-refresh** on mobile
- **Show "new activity" indicators** for real-time updates
- **Preserve scroll position** when navigating away and back

### 3. Real-Time Updates

- **Use WebSockets or SSE** for real-time updates
- **Implement reconnection logic** for dropped connections
- **Batch updates** to avoid overwhelming the UI
- **Show notification badges** for new activity
- **Allow users to disable** real-time updates if needed

### 4. Data Management

- **Implement proper caching** with React Query
- **Set appropriate stale times** based on data freshness requirements
- **Clean up old data** from cache to prevent memory leaks
- **Handle errors gracefully** with retry logic
- **Implement offline support** with service workers

### 5. Accessibility

- **Use semantic HTML** (nav, article, section)
- **Provide ARIA labels** for screen readers
- **Support keyboard navigation**
- **Announce new activities** to screen readers
- **Ensure sufficient color contrast**

---

## Summary

Activity feeds are a critical component of modern applications, providing users with real-time visibility into system events and user actions. Key takeaways:

1. **Feed Types**: Choose between global, personal, and team feeds based on your use case
2. **Aggregation**: Implement smart aggregation to reduce noise and improve readability
3. **Infinite Scroll**: Use TanStack Query with Intersection Observer for smooth infinite scrolling
4. **Real-Time**: Implement WebSocket or SSE subscriptions for live updates
5. **Performance**: Use virtual scrolling, memoization, and cursor-based pagination for large feeds
6. **UX**: Provide clear loading states, empty states, and optimistic updates

By following these patterns and best practices, you can build activity feeds that scale to millions of events while maintaining excellent performance and user experience.
