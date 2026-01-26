# Collaborative Editing Patterns: Multiplayer Cursors Analysis

## Executive Summary

This document analyzes collaborative editing patterns focusing on multiplayer cursors, presence indicators, conflict resolution, real-time synchronization, and performance optimization. Based on implementations from Figma, Google Docs, Notion, and open-source libraries like Liveblocks and Yjs.

---

## 1. Presence Indicators

### 1.1 Core Components

**Multiplayer Cursors** consist of three primary visual elements:

1. **Cursor Icon** - Visual pointer (typically SVG)
2. **User Label** - Name/avatar badge
3. **Selection Highlight** - Text/object selection overlay

### 1.2 Data Structure

```typescript
interface CursorPresence {
  // Position data
  x: number;
  y: number;

  // User identification
  connectionId: string;
  userId: string;
  username: string;
  color: string;

  // Context data
  selectedElementId?: string;
  focusedFieldId?: string;

  // State
  isActive: boolean;
  lastUpdate: number;
}
```

### 1.3 Implementation Pattern (Liveblocks)

```typescript
// Client-side presence tracking
import { useOthers, useUpdateMyPresence } from '@liveblocks/react';

function CollaborativeCanvas() {
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();

  // Update cursor position
  const handlePointerMove = (e: PointerEvent) => {
    updateMyPresence({
      cursor: {
        x: e.clientX,
        y: e.clientY,
      }
    });
  };

  // Clear cursor on leave
  const handlePointerLeave = () => {
    updateMyPresence({ cursor: null });
  };

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {/* Render other users' cursors */}
      {others.map(({ connectionId, presence }) => (
        presence.cursor && (
          <Cursor
            key={connectionId}
            x={presence.cursor.x}
            y={presence.cursor.y}
            color={presence.color}
            name={presence.username}
          />
        )
      ))}
    </div>
  );
}
```

### 1.4 Cursor Component Pattern

```typescript
interface CursorProps {
  x: number;
  y: number;
  color: string;
  name: string;
}

function Cursor({ x, y, color, name }: CursorProps) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        pointerEvents: 'none',
        transition: 'transform 0.15s cubic-bezier(0.17, 0.67, 0.5, 0.71)',
        transform: 'translateX(-50%) translateY(-50%)',
      }}
    >
      {/* SVG cursor icon */}
      <svg width="24" height="24" viewBox="0 0 24 24">
        <path
          d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7841 12.3673H5.65376Z"
          fill={color}
        />
      </svg>

      {/* User label */}
      <div
        style={{
          backgroundColor: color,
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          marginLeft: '20px',
          marginTop: '-8px',
        }}
      >
        {name}
      </div>
    </div>
  );
}
```

### 1.5 Selection Highlights

```typescript
interface SelectionPresence {
  userId: string;
  color: string;
  selectedText?: {
    start: number;
    end: number;
  };
  selectedElements?: string[];
}

// Render selection overlay
function SelectionOverlay({ selection }: { selection: SelectionPresence }) {
  return (
    <div
      style={{
        position: 'absolute',
        backgroundColor: `${selection.color}33`, // 20% opacity
        border: `2px solid ${selection.color}`,
        pointerEvents: 'none',
      }}
    />
  );
}
```

---

## 2. Conflict Resolution Strategies

### 2.1 Operational Transformation (OT)

**Used by:** Google Docs, CKEditor

**How it works:**

- Operations are transformed based on concurrent operations
- Central server orders operations
- Client operations are transformed against server state

**Algorithm: Jupiter (Client-Server Model)**

```typescript
interface Operation {
  type: "insert" | "delete" | "retain";
  position: number;
  content?: string;
  length?: number;
}

class OTEngine {
  private serverRevision = 0;
  private clientRevision = 0;
  private pendingOperations: Operation[] = [];

  // Transform operation against another operation
  transform(op1: Operation, op2: Operation): Operation {
    // If op2 inserted before op1's position, shift op1 forward
    if (op2.type === "insert" && op2.position <= op1.position) {
      return {
        ...op1,
        position: op1.position + (op2.content?.length || 0),
      };
    }

    // If op2 deleted before op1's position, shift op1 backward
    if (op2.type === "delete" && op2.position < op1.position) {
      return {
        ...op1,
        position: Math.max(op2.position, op1.position - (op2.length || 0)),
      };
    }

    return op1;
  }

  // Apply local operation
  applyLocal(op: Operation) {
    this.pendingOperations.push(op);
    this.sendToServer(op, this.clientRevision);
  }

  // Receive operation from server
  receiveFromServer(op: Operation, revision: number) {
    // Transform pending operations against server operation
    this.pendingOperations = this.pendingOperations.map((pending) => this.transform(pending, op));

    this.serverRevision = revision;
    this.applyToDocument(op);
  }
}
```

**Characteristics:**

- ✅ Efficient for text editing (O(1) upstream updates)
- ✅ Smaller message sizes
- ✅ Strong consistency guarantees
- ❌ Complex implementation
- ❌ Requires central server
- ❌ Can have interleaving anomalies

### 2.2 Conflict-Free Replicated Data Types (CRDT)

**Used by:** Figma, Notion, Yjs, Automerge

**How it works:**

- Data structures that mathematically guarantee convergence
- No central authority needed
- Operations commute (order-independent)

**Implementation: Yjs (Popular CRDT Library)**

```typescript
import * as Y from "yjs";

// Create shared document
const doc = new Y.Doc();

// Shared text type
const yText = doc.getText("content");

// Listen to changes
yText.observe((event) => {
  console.log("Text changed:", event.changes);
});

// Insert text
yText.insert(0, "Hello ");
yText.insert(6, "World");

// Delete text
yText.delete(0, 5);

// Get current state
const currentText = yText.toString();
```

**CRDT Types:**

```typescript
// Y.Map - Key-value store
const yMap = doc.getMap("metadata");
yMap.set("title", "My Document");
yMap.set("author", "Alice");

// Y.Array - Ordered list
const yArray = doc.getArray("items");
yArray.push(["item1", "item2"]);
yArray.insert(1, ["inserted"]);

// Y.XmlFragment - Rich text/HTML
const yXml = doc.getXmlFragment("richtext");
```

**Characteristics:**

- ✅ No central server required
- ✅ Offline-first friendly
- ✅ Faster downstream updates (O(n) or O(n log n))
- ✅ Mathematically proven convergence
- ❌ Larger memory footprint
- ❌ Slower upstream updates (must transform to CRDT structure)
- ⚠️ Some implementations have interleaving anomalies (Loro/Fugue avoid this)

### 2.3 Last-Writer-Wins (LWW)

**Used by:** Figma (for object properties)

**How it works:**

- Server timestamps all operations
- Latest timestamp wins
- Simple but can lose data

```typescript
interface LWWProperty {
  value: any;
  timestamp: number;
  clientId: string;
}

class LWWResolver {
  resolve(local: LWWProperty, remote: LWWProperty): LWWProperty {
    // Server timestamp is authoritative
    if (remote.timestamp > local.timestamp) {
      return remote;
    }

    // Tie-breaker: use client ID
    if (remote.timestamp === local.timestamp) {
      return remote.clientId > local.clientId ? remote : local;
    }

    return local;
  }
}
```

**Figma's Hybrid Approach:**

- Object properties: Last-writer-wins
- Object creation/deletion: CRDT-like set
- Tree structure: Server validates (rejects cycles)
- Ordering: Fractional indexing

**Characteristics:**

- ✅ Simple implementation
- ✅ Fast
- ✅ Low memory overhead
- ❌ Can lose user intent
- ❌ Not suitable for text editing
- ⚠️ Best for independent properties (color, position, size)

### 2.4 Comparison Matrix

| Feature             | OT (Google Docs) | CRDT (Yjs/Notion) | LWW (Figma)       |
| ------------------- | ---------------- | ----------------- | ----------------- |
| **Complexity**      | High             | Medium            | Low               |
| **Server Required** | Yes              | No                | Optional          |
| **Offline Support** | Limited          | Excellent         | Good              |
| **Text Editing**    | Excellent        | Good              | Poor              |
| **Performance**     | Fast upstream    | Fast downstream   | Fastest           |
| **Memory**          | Low              | High              | Lowest            |
| **Use Case**        | Documents        | General purpose   | Object properties |

---

## 3. Real-Time Sync Architectures

### 3.1 WebSocket (Most Common)

**Used by:** Figma, Google Docs, Liveblocks, Yjs

**Architecture:**

```typescript
// Server (Bun/Node.js)
interface Connection {
  id: string;
  username: string;
  cursor: { x: number; y: number };
  ws: WebSocket;
}

class CollaborationServer {
  private connections = new Map<string, Connection>();

  handleConnection(ws: WebSocket) {
    const connectionId = generateId();

    ws.on("message", (data) => {
      const message = JSON.parse(data);

      switch (message.type) {
        case "cursor_move":
          this.handleCursorMove(connectionId, message.cursor);
          break;
        case "document_edit":
          this.handleEdit(connectionId, message.operation);
          break;
      }
    });

    ws.on("close", () => {
      this.connections.delete(connectionId);
      this.broadcast({
        type: "user_left",
        connectionId,
      });
    });
  }

  handleCursorMove(connectionId: string, cursor: { x: number; y: number }) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.cursor = cursor;

      // Broadcast to all OTHER clients
      this.broadcast(
        {
          type: "cursor_update",
          connectionId,
          cursor,
        },
        connectionId,
      );
    }
  }

  broadcast(message: any, excludeId?: string) {
    const data = JSON.stringify(message);
    this.connections.forEach((conn, id) => {
      if (id !== excludeId) {
        conn.ws.send(data);
      }
    });
  }
}
```

**Client:**

```typescript
class CollaborationClient {
  private ws: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(url: string) {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("Connected");
      this.reconnectAttempts = 0;

      // Request current state
      this.send({ type: "sync_request" });
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onclose = () => {
      this.handleReconnect();
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

      setTimeout(() => {
        console.log(`Reconnecting (attempt ${this.reconnectAttempts})...`);
        this.connect(this.ws.url);
      }, delay);
    }
  }

  send(message: any) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
```

**Characteristics:**

- ✅ Bi-directional, persistent connection
- ✅ Low latency (~50-100ms)
- ✅ Reliable (TCP-based)
- ✅ Ordered delivery
- ✅ Server can validate/authorize
- ❌ Requires server infrastructure
- ❌ Scaling requires load balancing

### 3.2 WebRTC (Peer-to-Peer)

**Used by:** Yjs (y-webrtc provider), demos

**Architecture:**

```typescript
import { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";

const doc = new Y.Doc();

// Connect via WebRTC (no server needed for sync)
const provider = new WebrtcProvider("room-name", doc, {
  signaling: ["wss://signaling-server.com"], // Only for initial peer discovery
  password: "optional-encryption-key",
  awareness: new awarenessProtocol.Awareness(doc),
  maxConns: 20, // Max peer connections
  filterBcConns: true, // Filter broadcast channel connections
});

// Listen to peer connections
provider.on("peers", ({ added, removed, webrtcPeers }) => {
  console.log("Connected peers:", webrtcPeers);
});
```

**Characteristics:**

- ✅ Direct peer-to-peer (no server for data)
- ✅ Lower latency potential
- ✅ Reduced server costs
- ✅ Better for demos/prototypes
- ❌ Requires signaling server for discovery
- ❌ NAT/firewall traversal issues
- ❌ Scales poorly (mesh topology)
- ❌ No central validation/authorization
- ⚠️ Best for <20 concurrent users

### 3.3 Hybrid Architecture (Recommended for Production)

**Pattern:** WebSocket for sync + WebRTC for media

```typescript
class HybridCollaboration {
  private wsProvider: WebsocketProvider;
  private webrtcProvider: WebrtcProvider;

  constructor(doc: Y.Doc, roomId: string) {
    // Primary sync via WebSocket (reliable, server-validated)
    this.wsProvider = new WebsocketProvider("wss://api.example.com", roomId, doc);

    // Optional WebRTC for voice/video
    this.webrtcProvider = new WebrtcProvider(roomId, doc, {
      signaling: ["wss://signaling.example.com"],
      // Disable document sync (use WebSocket for that)
      connect: false,
    });
  }
}
```

**When to use what:**

- **WebSocket**: Document sync, cursor positions, operations
- **WebRTC**: Voice chat, video, screen sharing
- **Polling**: Fallback for restrictive networks

---

## 4. Performance Optimization

### 4.1 Throttling & Batching

**Problem:** Mouse moves fire 60+ times/second, overwhelming network

**Solution 1: Throttle Updates**

```typescript
import { throttle } from 'lodash';

// Liveblocks approach: Configure throttle at provider level
<LiveblocksProvider
  client={client}
  throttle={16} // ~60fps (default: 100ms)
>
  {children}
</LiveblocksProvider>

// Manual throttling
const updateCursor = throttle((x: number, y: number) => {
  updateMyPresence({ cursor: { x, y } });
}, 16); // 16ms = ~60fps

function handlePointerMove(e: PointerEvent) {
  updateCursor(e.clientX, e.clientY);
}
```

**Solution 2: Batch Multiple Updates**

```typescript
class CursorBatcher {
  private batch: Array<{ x: number; y: number; timestamp: number }> = [];
  private batchInterval = 25; // Ably default: 25ms
  private timer: NodeJS.Timeout | null = null;

  addPosition(x: number, y: number) {
    this.batch.push({ x, y, timestamp: Date.now() });

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.batchInterval);
    }
  }

  flush() {
    if (this.batch.length === 0) return;

    // Send only the latest position (most common)
    const latest = this.batch[this.batch.length - 1];
    this.send({ type: "cursor_batch", cursor: latest });

    // OR send all positions for smooth interpolation
    // this.send({ type: 'cursor_batch', cursors: this.batch });

    this.batch = [];
    this.timer = null;
  }
}
```

**Ably Spaces Configuration:**

```typescript
const space = client.spaces.get("my-space", {
  cursors: {
    outboundBatchInterval: 25, // Default: 25ms
    paginationLimit: 20, // Max cursors to fetch from history
  },
});

// Recommended: Max 20 simultaneous cursors for optimal UX
```

### 4.2 Cursor Interpolation (Smooth Animation)

**Problem:** Network updates arrive at irregular intervals (100-500ms), causing jerky movement

**Solution 1: CSS Transitions (Simplest)**

```typescript
function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        // Linear transition for consistent speed
        transition: 'left 0.15s linear, top 0.15s linear',
      }}
    >
      {/* Cursor SVG */}
    </div>
  );
}
```

**Pros:** Simple, no JavaScript
**Cons:** Straight-line movement, unnatural with easing

**Solution 2: Spring Animation (Recommended)**

```typescript
import { useSpring, animated } from '@react-spring/web';

function SmoothCursor({ x, y }: { x: number; y: number }) {
  const spring = useSpring({
    x,
    y,
    config: {
      tension: 300,  // Stiffness
      friction: 30,  // Damping
      mass: 1,
    }
  });

  return (
    <animated.div
      style={{
        position: 'absolute',
        left: spring.x,
        top: spring.y,
      }}
    >
      {/* Cursor SVG */}
    </animated.div>
  );
}
```

**Pros:** Natural, organic motion; considers momentum
**Cons:** Slight overhead

**Solution 3: Spline Interpolation (Most Accurate)**

```typescript
class SplineInterpolator {
  private points: Array<{ x: number; y: number; t: number }> = [];
  private currentIndex = 0;

  addPoint(x: number, y: number) {
    this.points.push({ x, y, t: Date.now() });

    // Keep only last 4 points for Catmull-Rom spline
    if (this.points.length > 4) {
      this.points.shift();
    }
  }

  // Catmull-Rom spline interpolation
  interpolate(t: number): { x: number; y: number } {
    if (this.points.length < 2) {
      return this.points[0] || { x: 0, y: 0 };
    }

    // Get 4 control points (p0, p1, p2, p3)
    const p0 = this.points[Math.max(0, this.currentIndex - 1)];
    const p1 = this.points[this.currentIndex];
    const p2 = this.points[Math.min(this.points.length - 1, this.currentIndex + 1)];
    const p3 = this.points[Math.min(this.points.length - 1, this.currentIndex + 2)];

    // Catmull-Rom formula
    const t2 = t * t;
    const t3 = t2 * t;

    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );

    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );

    return { x, y };
  }
}

// Usage with requestAnimationFrame
function AnimatedCursor({ targetX, targetY }: CursorProps) {
  const interpolator = useRef(new SplineInterpolator());
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    interpolator.current.addPoint(targetX, targetY);
  }, [targetX, targetY]);

  useEffect(() => {
    let animationId: number;

    const animate = () => {
      const newPos = interpolator.current.interpolate(0.5);
      setPosition(newPos);
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, []);

  return <div style={{ left: position.x, top: position.y }} />;
}
```

**Pros:** Smoothest, most accurate path
**Cons:** Slight delay (waits for multiple points), complexity

### 4.3 Cursor Timeout (Cleanup)

```typescript
interface CursorWithTimeout {
  cursor: { x: number; y: number };
  lastUpdate: number;
  timeoutId?: NodeJS.Timeout;
}

class CursorManager {
  private cursors = new Map<string, CursorWithTimeout>();
  private TIMEOUT_DURATION = 5000; // 5 seconds

  updateCursor(userId: string, x: number, y: number) {
    const existing = this.cursors.get(userId);

    // Clear existing timeout
    if (existing?.timeoutId) {
      clearTimeout(existing.timeoutId);
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      this.cursors.delete(userId);
      this.onCursorRemoved(userId);
    }, this.TIMEOUT_DURATION);

    this.cursors.set(userId, {
      cursor: { x, y },
      lastUpdate: Date.now(),
      timeoutId,
    });
  }

  onCursorRemoved(userId: string) {
    // Trigger UI update to remove cursor
  }
}
```

### 4.4 Optimistic Updates

```typescript
class OptimisticEditor {
  private pendingOperations = new Map<string, Operation>();

  // Apply immediately, don't wait for server
  applyLocalEdit(operation: Operation) {
    const opId = generateId();

    // 1. Apply to local state immediately
    this.applyToDocument(operation);

    // 2. Store as pending
    this.pendingOperations.set(opId, operation);

    // 3. Send to server
    this.sendToServer({ ...operation, opId });
  }

  // Server confirms operation
  handleServerAck(opId: string) {
    this.pendingOperations.delete(opId);
  }

  // Server rejects operation (conflict)
  handleServerReject(opId: string, serverOperation: Operation) {
    const localOp = this.pendingOperations.get(opId);

    if (localOp) {
      // 1. Undo local operation
      this.undoOperation(localOp);

      // 2. Apply server operation
      this.applyToDocument(serverOperation);

      // 3. Transform and reapply pending operations
      this.pendingOperations.forEach((pending) => {
        const transformed = this.transform(pending, serverOperation);
        this.applyToDocument(transformed);
      });

      this.pendingOperations.delete(opId);
    }
  }
}
```

### 4.5 Delta Compression

```typescript
// Only send changed properties
interface CursorUpdate {
  connectionId: string;
  changes: Partial<CursorPresence>; // Only changed fields
}

class DeltaEncoder {
  private lastSent = new Map<string, CursorPresence>();

  encode(connectionId: string, current: CursorPresence): CursorUpdate {
    const last = this.lastSent.get(connectionId);
    const changes: Partial<CursorPresence> = {};

    if (!last || last.x !== current.x) changes.x = current.x;
    if (!last || last.y !== current.y) changes.y = current.y;
    if (!last || last.selectedElementId !== current.selectedElementId) {
      changes.selectedElementId = current.selectedElementId;
    }

    this.lastSent.set(connectionId, current);

    return { connectionId, changes };
  }
}
```

### 4.6 Spatial Partitioning (Large Canvases)

```typescript
// Only sync cursors in visible viewport
class SpatialCursorManager {
  private viewport = { x: 0, y: 0, width: 1920, height: 1080 };

  isInViewport(cursor: { x: number; y: number }): boolean {
    return (
      cursor.x >= this.viewport.x &&
      cursor.x <= this.viewport.x + this.viewport.width &&
      cursor.y >= this.viewport.y &&
      cursor.y <= this.viewport.y + this.viewport.height
    );
  }

  getVisibleCursors(allCursors: Map<string, CursorPresence>) {
    return Array.from(allCursors.values()).filter((cursor) => this.isInViewport(cursor));
  }

  updateViewport(x: number, y: number, width: number, height: number) {
    this.viewport = { x, y, width, height };

    // Request cursors only in new viewport
    this.requestCursorsInBounds(this.viewport);
  }
}
```

---

## 5. Real-World Implementation Examples

### 5.1 Figma Architecture

**Key Decisions:**

- **Sync:** WebSocket client-server model
- **Conflict Resolution:** Hybrid (LWW for properties, CRDT-inspired for structure)
- **Data Model:** Tree of objects (like DOM)
- **Performance:**
  - Fractional indexing for ordering
  - Client-generated unique IDs (prefix-based)
  - Server rejects cycles in tree structure
  - Deleted objects stored in undo buffer (not server)

**Unique Features:**

- Immediate local application (no flicker)
- Unacknowledged local changes prioritized over server conflicts
- Multiplayer cursors can be toggled (Cmd+Alt+\\)

### 5.2 Google Docs Architecture

**Key Decisions:**

- **Sync:** WebSocket
- **Conflict Resolution:** Operational Transformation (Jupiter algorithm)
- **Performance:**
  - Server serializes all operations
  - Strong intention preservation
  - Offline editing with sync on reconnect

**Characteristics:**

- Highly optimized for text editing
- Complex OT implementation
- Central server required
- Excellent for documents with linear structure

### 5.3 Notion Architecture

**Key Decisions:**

- **Sync:** WebSocket
- **Conflict Resolution:** CRDT-powered graph
- **Data Model:** Every change is a small operation in a graph
- **Performance:**
  - Deterministic convergence
  - Offline-first
  - No locking/freezing

**Migration:**

- Moved from older model to CRDT for offline support
- Pages marked offline are "dynamically migrated to CRDT data model"

### 5.4 Liveblocks (Modern SaaS Solution)

**Complete Implementation:**

```typescript
// liveblocks.config.ts
import { createClient } from "@liveblocks/client";
import { createRoomContext } from "@liveblocks/react";

const client = createClient({
  authEndpoint: "/api/liveblocks-auth",
  throttle: 16, // 60fps
});

type Presence = {
  cursor: { x: number; y: number } | null;
  selectedId: string | null;
};

type Storage = {
  // Liveblocks uses LiveObject, LiveList, LiveMap (CRDT-like)
  shapes: LiveList<LiveObject<Shape>>;
};

export const {
  RoomProvider,
  useOthers,
  useOthersConnectionIds,
  useUpdateMyPresence,
  useMyPresence,
  useMutation,
  useStorage,
} = createRoomContext<Presence, Storage>(client);
```

```typescript
// App.tsx
import { RoomProvider } from './liveblocks.config';

function App() {
  return (
    <RoomProvider id="my-room" initialPresence={{ cursor: null, selectedId: null }}>
      <CollaborativeEditor />
    </RoomProvider>
  );
}
```

```typescript
// CollaborativeEditor.tsx
import { useOthers, useUpdateMyPresence } from './liveblocks.config';

function CollaborativeEditor() {
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();

  return (
    <div
      onPointerMove={(e) => {
        updateMyPresence({
          cursor: { x: e.clientX, y: e.clientY }
        });
      }}
      onPointerLeave={() => {
        updateMyPresence({ cursor: null });
      }}
    >
      {/* Render cursors efficiently */}
      <Cursors />

      {/* Editor content */}
    </div>
  );
}

// Efficient cursor rendering using connection IDs
function Cursors() {
  const ids = useOthersConnectionIds();

  return (
    <>
      {ids.map(id => (
        <CursorById key={id} connectionId={id} />
      ))}
    </>
  );
}

function CursorById({ connectionId }: { connectionId: number }) {
  const other = useOther(connectionId, user => user.presence.cursor);

  if (!other) return null;

  return <Cursor x={other.x} y={other.y} />;
}
```

### 5.5 Yjs (Open Source CRDT)

**Complete Setup:**

```typescript
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { QuillBinding } from "y-quill";
import Quill from "quill";

// 1. Create shared document
const doc = new Y.Doc();

// 2. Create shared text type
const yText = doc.getText("quill");

// 3. Connect to WebSocket server
const provider = new WebsocketProvider("wss://demos.yjs.dev", "my-room-name", doc);

// 4. Bind to editor
const editor = new Quill("#editor", {
  theme: "snow",
  modules: {
    cursors: true, // Enable multiplayer cursors
  },
});

const binding = new QuillBinding(yText, editor, provider.awareness);

// 5. Set user info for cursor
provider.awareness.setLocalStateField("user", {
  name: "Alice",
  color: "#ff0000",
});

// 6. Listen to awareness changes (cursors)
provider.awareness.on("change", () => {
  const states = provider.awareness.getStates();
  states.forEach((state, clientId) => {
    console.log(`User ${state.user.name} at cursor position`, state.cursor);
  });
});
```

**Server (y-websocket):**

```typescript
import * as Y from "yjs";
import { WebSocketServer } from "ws";
import { setupWSConnection } from "y-websocket/bin/utils";

const wss = new WebSocketServer({ port: 1234 });

wss.on("connection", (ws, req) => {
  setupWSConnection(ws, req, {
    // Optional: Persist documents
    persistence: {
      bindState: async (docName, doc) => {
        // Load from database
        const persistedState = await db.get(docName);
        if (persistedState) {
          Y.applyUpdate(doc, persistedState);
        }
      },
      writeState: async (docName, doc) => {
        // Save to database
        const state = Y.encodeStateAsUpdate(doc);
        await db.set(docName, state);
      },
    },
  });
});
```

---

## 6. Performance Benchmarks & Best Practices

### 6.1 Update Frequency Targets

| Component             | Target Rate | Throttle Interval | Notes                           |
| --------------------- | ----------- | ----------------- | ------------------------------- |
| **Cursor Position**   | 40-60 fps   | 16-25ms           | Balance smoothness vs bandwidth |
| **Selection Changes** | Immediate   | 0ms               | Low frequency, high importance  |
| **Document Edits**    | Immediate   | 0ms               | Critical for consistency        |
| **Presence Status**   | 1-5 fps     | 200-1000ms        | Low priority                    |
| **Viewport Changes**  | 10-20 fps   | 50-100ms          | Moderate priority               |

### 6.2 Bandwidth Optimization

**Cursor Position Message Size:**

```typescript
// Inefficient (JSON): ~120 bytes
{
  "type": "cursor_update",
  "connectionId": "conn_abc123",
  "cursor": { "x": 450, "y": 320 },
  "timestamp": 1706234567890
}

// Efficient (Binary): ~20 bytes
// [type: u8][connId: u32][x: f32][y: f32][timestamp: u64]

// MessagePack (middle ground): ~40 bytes
import msgpack from 'msgpack-lite';
const packed = msgpack.encode({ t: 1, c: 123, x: 450, y: 320 });
```

**Convex Optimization:**

- ~1 mutation/second per active client
- Target: 500ms lag
- Idle clients = idle system
- One cursor move invalidates one query (shared by all peers)

### 6.3 Rendering Optimization

```typescript
// BAD: Re-renders all cursors on any change
function AllCursors() {
  const others = useOthers();

  return (
    <>
      {others.map(user => (
        <Cursor key={user.connectionId} {...user.presence.cursor} />
      ))}
    </>
  );
}

// GOOD: Only re-renders changed cursor
function OptimizedCursors() {
  // Only re-renders when users join/leave
  const connectionIds = useOthersConnectionIds();

  return (
    <>
      {connectionIds.map(id => (
        // Each cursor subscribes to its own data
        <CursorById key={id} connectionId={id} />
      ))}
    </>
  );
}

function CursorById({ connectionId }: { connectionId: number }) {
  // Only re-renders when THIS user's cursor changes
  const cursor = useOther(connectionId, user => user.presence.cursor);

  if (!cursor) return null;
  return <Cursor {...cursor} />;
}
```

### 6.4 Memory Management

```typescript
class CursorMemoryManager {
  private MAX_CURSORS = 100;
  private cursors = new Map<string, CursorPresence>();

  addCursor(id: string, cursor: CursorPresence) {
    // Limit total cursors (prevent memory leak)
    if (this.cursors.size >= this.MAX_CURSORS) {
      // Remove oldest cursor
      const oldestId = this.findOldestCursor();
      this.cursors.delete(oldestId);
    }

    this.cursors.set(id, cursor);
  }

  findOldestCursor(): string {
    let oldestId = "";
    let oldestTime = Infinity;

    this.cursors.forEach((cursor, id) => {
      if (cursor.lastUpdate < oldestTime) {
        oldestTime = cursor.lastUpdate;
        oldestId = id;
      }
    });

    return oldestId;
  }
}
```

---

## 7. Advanced Patterns

### 7.1 Cursor Prediction (Reduce Perceived Latency)

```typescript
class CursorPredictor {
  private history: Array<{ x: number; y: number; t: number }> = [];

  addPosition(x: number, y: number) {
    this.history.push({ x, y, t: Date.now() });

    // Keep last 3 positions
    if (this.history.length > 3) {
      this.history.shift();
    }
  }

  // Predict next position based on velocity
  predict(deltaTime: number): { x: number; y: number } {
    if (this.history.length < 2) {
      return this.history[this.history.length - 1] || { x: 0, y: 0 };
    }

    const last = this.history[this.history.length - 1];
    const prev = this.history[this.history.length - 2];

    // Calculate velocity
    const dt = last.t - prev.t;
    const vx = (last.x - prev.x) / dt;
    const vy = (last.y - prev.y) / dt;

    // Predict position
    return {
      x: last.x + vx * deltaTime,
      y: last.y + vy * deltaTime,
    };
  }
}
```

### 7.2 Awareness Protocol (Yjs)

```typescript
import { Awareness } from "y-protocols/awareness";

const awareness = new Awareness(doc);

// Set local state
awareness.setLocalStateField("user", {
  name: "Alice",
  color: "#ff0000",
  avatar: "https://...",
});

awareness.setLocalStateField("cursor", {
  x: 100,
  y: 200,
});

// Listen to changes
awareness.on("change", ({ added, updated, removed }) => {
  added.forEach((clientId) => {
    const state = awareness.getStates().get(clientId);
    console.log("User joined:", state.user);
  });

  updated.forEach((clientId) => {
    const state = awareness.getStates().get(clientId);
    console.log("User updated:", state.cursor);
  });

  removed.forEach((clientId) => {
    console.log("User left:", clientId);
  });
});

// Cleanup on disconnect
window.addEventListener("beforeunload", () => {
  awareness.setLocalState(null);
});
```

### 7.3 Conflict-Free Cursor Positioning (Stable Positions)

**Problem:** Cursor positions become invalid after edits

**Solution:** Anchor to operation IDs (Loro approach)

```typescript
interface StableCursor {
  // Instead of index-based position
  // position: 42

  // Use operation-based anchor
  anchor: {
    containerId: string;
    operationId: string;
    offset: number;
  };
}

// Automatically adjusts when content changes
class StableCursorManager {
  resolveCursor(cursor: StableCursor, doc: CRDTDoc): number {
    const container = doc.getContainer(cursor.anchor.containerId);
    const operation = container.getOperation(cursor.anchor.operationId);

    // Calculate current index from operation
    return operation.currentIndex + cursor.anchor.offset;
  }
}
```

### 7.4 Multi-Document Presence

```typescript
// Track presence across multiple documents
class MultiDocPresence {
  private presenceByDoc = new Map<string, Map<string, CursorPresence>>();

  updatePresence(docId: string, userId: string, presence: CursorPresence) {
    if (!this.presenceByDoc.has(docId)) {
      this.presenceByDoc.set(docId, new Map());
    }

    this.presenceByDoc.get(docId)!.set(userId, presence);
  }

  getActiveUsers(docId: string): CursorPresence[] {
    return Array.from(this.presenceByDoc.get(docId)?.values() || []);
  }

  // Cleanup inactive documents
  cleanupInactiveDocs() {
    this.presenceByDoc.forEach((users, docId) => {
      if (users.size === 0) {
        this.presenceByDoc.delete(docId);
      }
    });
  }
}
```

---

## 8. Testing Strategies

### 8.1 Cursor Synchronization Test

```typescript
import { test, expect } from "@playwright/test";

test("multiplayer cursors sync across clients", async ({ browser }) => {
  // Create two browser contexts (two users)
  const context1 = await browser.newContext();
  const context2 = await browser.newContext();

  const page1 = await context1.newPage();
  const page2 = await context2.newPage();

  // Both join same room
  await page1.goto("http://localhost:3000/room/test-room");
  await page2.goto("http://localhost:3000/room/test-room");

  // User 1 moves cursor
  await page1.mouse.move(100, 200);

  // User 2 should see User 1's cursor
  await expect(page2.locator('[data-cursor-id="user1"]')).toBeVisible();

  const cursorPos = await page2.locator('[data-cursor-id="user1"]').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  });

  expect(cursorPos.x).toBeCloseTo(100, 5);
  expect(cursorPos.y).toBeCloseTo(200, 5);
});
```

### 8.2 Conflict Resolution Test

```typescript
test("concurrent edits converge to same state", async () => {
  const doc1 = new Y.Doc();
  const doc2 = new Y.Doc();

  const text1 = doc1.getText("content");
  const text2 = doc2.getText("content");

  // Initial state
  text1.insert(0, "Hello");
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

  // Concurrent edits (offline)
  text1.insert(5, " World"); // "Hello World"
  text2.insert(0, "Hi "); // "Hi Hello"

  // Sync updates
  Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
  Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

  // Both should converge to same state
  expect(text1.toString()).toBe(text2.toString());
  expect(text1.toString()).toBe("Hi Hello World");
});
```

---

## 9. Security Considerations

### 9.1 Cursor Position Validation

```typescript
class SecureCursorManager {
  private canvasWidth = 1920;
  private canvasHeight = 1080;

  validateCursor(cursor: { x: number; y: number }): boolean {
    // Prevent malicious coordinates
    return (
      Number.isFinite(cursor.x) &&
      Number.isFinite(cursor.y) &&
      cursor.x >= 0 &&
      cursor.x <= this.canvasWidth &&
      cursor.y >= 0 &&
      cursor.y <= this.canvasHeight
    );
  }

  sanitizeCursor(cursor: { x: number; y: number }) {
    return {
      x: Math.max(0, Math.min(this.canvasWidth, cursor.x)),
      y: Math.max(0, Math.min(this.canvasHeight, cursor.y)),
    };
  }
}
```

### 9.2 Rate Limiting

```typescript
class RateLimitedCursorUpdates {
  private updateCounts = new Map<string, number[]>();
  private WINDOW_MS = 1000;
  private MAX_UPDATES = 100; // Max 100 updates per second

  allowUpdate(userId: string): boolean {
    const now = Date.now();
    const userUpdates = this.updateCounts.get(userId) || [];

    // Remove old timestamps outside window
    const recentUpdates = userUpdates.filter((t) => now - t < this.WINDOW_MS);

    if (recentUpdates.length >= this.MAX_UPDATES) {
      return false; // Rate limit exceeded
    }

    recentUpdates.push(now);
    this.updateCounts.set(userId, recentUpdates);
    return true;
  }
}
```

### 9.3 Permission-Based Presence

```typescript
interface PresencePermissions {
  canSeeCursors: boolean;
  canSeeSelections: boolean;
  canSeeViewports: boolean;
}

class PermissionedPresence {
  getVisiblePresence(userId: string, permissions: PresencePermissions): Partial<CursorPresence> {
    const presence = this.getFullPresence(userId);

    return {
      ...(permissions.canSeeCursors && { cursor: presence.cursor }),
      ...(permissions.canSeeSelections && { selectedId: presence.selectedId }),
      ...(permissions.canSeeViewports && { viewport: presence.viewport }),
    };
  }
}
```

---

## 10. Scalability Patterns

### 10.1 Document Sharding

```typescript
// Separate WebSocket connections per document
class ShardedCollaboration {
  private connections = new Map<string, WebSocket>();

  joinDocument(docId: string) {
    // Each document gets its own connection
    const ws = new WebSocket(`wss://api.example.com/doc/${docId}`);
    this.connections.set(docId, ws);
  }

  leaveDocument(docId: string) {
    const ws = this.connections.get(docId);
    ws?.close();
    this.connections.delete(docId);
  }
}
```

### 10.2 Presence Aggregation

```typescript
// Server aggregates presence updates
class PresenceAggregator {
  private updates = new Map<string, CursorPresence>();
  private broadcastInterval = 50; // Aggregate every 50ms

  constructor() {
    setInterval(() => this.flush(), this.broadcastInterval);
  }

  addUpdate(userId: string, presence: CursorPresence) {
    this.updates.set(userId, presence);
  }

  flush() {
    if (this.updates.size === 0) return;

    // Send all updates in single message
    this.broadcast({
      type: "presence_batch",
      updates: Array.from(this.updates.entries()).map(([id, presence]) => ({
        userId: id,
        ...presence,
      })),
    });

    this.updates.clear();
  }
}
```

### 10.3 Geographic Distribution

```typescript
// Route users to nearest server
class GeoDistributedCollab {
  private regions = [
    { name: "us-east", endpoint: "wss://us-east.api.example.com" },
    { name: "eu-west", endpoint: "wss://eu-west.api.example.com" },
    { name: "ap-south", endpoint: "wss://ap-south.api.example.com" },
  ];

  async getNearestEndpoint(): Promise<string> {
    // Measure latency to each region
    const latencies = await Promise.all(
      this.regions.map(async (region) => ({
        region,
        latency: await this.measureLatency(region.endpoint),
      })),
    );

    // Return fastest
    const fastest = latencies.reduce((min, curr) => (curr.latency < min.latency ? curr : min));

    return fastest.region.endpoint;
  }

  async measureLatency(endpoint: string): Promise<number> {
    const start = performance.now();
    await fetch(endpoint.replace("wss://", "https://") + "/ping");
    return performance.now() - start;
  }
}
```

---

## 11. Accessibility Considerations

### 11.1 Screen Reader Support

```typescript
function AccessibleCursor({ user, x, y }: CursorProps) {
  return (
    <div
      role="img"
      aria-label={`${user.name}'s cursor at position ${x}, ${y}`}
      style={{ position: 'absolute', left: x, top: y }}
    >
      <svg aria-hidden="true">
        {/* Cursor icon */}
      </svg>
      <span className="sr-only">
        {user.name} is editing at position {x}, {y}
      </span>
    </div>
  );
}
```

### 11.2 Reduced Motion

```typescript
function RespectMotionPreferences() {
  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  return (
    <Cursor
      style={{
        // Disable smooth animations if user prefers reduced motion
        transition: prefersReducedMotion
          ? 'none'
          : 'left 0.15s linear, top 0.15s linear',
      }}
    />
  );
}
```

---

## 12. Key Takeaways

### Architecture Decisions

1. **For Text Editors:**
   - Use OT (Google Docs approach) for best text editing experience
   - Or modern CRDTs like Loro (avoids interleaving anomaly)
   - WebSocket for sync

2. **For Visual Editors (Figma-like):**
   - Hybrid: LWW for properties + CRDT for structure
   - WebSocket for sync
   - Fractional indexing for ordering

3. **For General Collaboration:**
   - Yjs (CRDT) for flexibility
   - WebSocket provider for production
   - WebRTC for demos/small teams

### Performance Targets

- **Cursor updates:** 16-25ms throttle (40-60 fps)
- **Network latency:** <100ms target
- **Max simultaneous cursors:** 20-100 (UX vs performance tradeoff)
- **Message size:** <100 bytes per cursor update

### Critical Optimizations

1. **Throttle/batch** cursor updates (16-25ms)
2. **Interpolate** cursor movement (spring/spline)
3. **Optimize rendering** (per-cursor subscriptions)
4. **Timeout inactive** cursors (5-10 seconds)
5. **Spatial partitioning** for large canvases
6. **Delta compression** (only send changes)

### Technology Stack Recommendations

**Managed Solution:**

- Liveblocks (easiest, production-ready)
- Ably Spaces (enterprise-grade)
- Partykit (edge-based)

**Self-Hosted:**

- Yjs + y-websocket (most flexible)
- ShareDB (OT-based)
- Automerge (CRDT, offline-first)

**For Specific Use Cases:**

- **Text editing:** Yjs + ProseMirror/Quill
- **Whiteboard:** Liveblocks + Tldraw
- **Spreadsheet:** Yjs + custom renderer
- **Code editor:** Yjs + CodeMirror/Monaco

---

## 13. References

### Research Sources

- [Figma Multiplayer Technology](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/)
- [Google Docs OT Implementation](https://dev.to/dhanush___b/how-google-docs-uses-operational-transformation-for-real-time-collaboration-119)
- [Notion CRDT Architecture](https://www.notion.com/blog/how-we-made-notion-available-offline)
- [Liveblocks Cursor Animation](https://liveblocks.io/blog/how-to-animate-multiplayer-cursors)
- [OT vs CRDT Comparison](https://thom.ee/blog/crdt-vs-operational-transformation/)

### Open Source Libraries

- [Yjs](https://docs.yjs.dev/) - High-performance CRDT
- [Liveblocks](https://liveblocks.io/) - Managed collaboration platform
- [ShareDB](https://github.com/share/sharedb) - OT-based real-time database
- [Automerge](https://automerge.org/) - CRDT library
- [Loro](https://loro.dev/) - Modern CRDT (avoids interleaving)

### Example Implementations

- [Liveblocks Examples](https://github.com/liveblocks/liveblocks/tree/main/examples)
- [Figma Clone Tutorial](https://github.com/adrianhajdin/figma_clone)
- [Yjs Demos](https://github.com/yjs/yjs-demos)

---

## Appendix: Complete Working Example

### Full Stack Multiplayer Cursor Implementation

**Server (Bun + WebSocket):**

```typescript
// server.ts
import { ServerWebSocket } from "bun";

interface Connection {
  id: string;
  username: string;
  cursor: { x: number; y: number } | null;
}

const connections = new Map<string, Connection>();

Bun.serve({
  port: 3000,

  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, {
        data: {
          connectionId: crypto.randomUUID(),
          username: `User${Math.floor(Math.random() * 1000)}`,
        },
      });

      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }

      return undefined;
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: {
    open(ws: ServerWebSocket) {
      const { connectionId, username } = ws.data;

      connections.set(connectionId, {
        id: connectionId,
        username,
        cursor: null,
      });

      // Notify others
      ws.publish(
        "room",
        JSON.stringify({
          type: "user_joined",
          connectionId,
          username,
        }),
      );

      // Send current users to new connection
      ws.send(
        JSON.stringify({
          type: "init",
          users: Array.from(connections.values()),
        }),
      );

      ws.subscribe("room");
    },

    message(ws: ServerWebSocket, message: string) {
      const { connectionId } = ws.data;
      const data = JSON.parse(message);

      switch (data.type) {
        case "cursor_move":
          const connection = connections.get(connectionId);
          if (connection) {
            connection.cursor = data.cursor;

            ws.publish(
              "room",
              JSON.stringify({
                type: "cursor_update",
                connectionId,
                cursor: data.cursor,
              }),
            );
          }
          break;
      }
    },

    close(ws: ServerWebSocket) {
      const { connectionId } = ws.data;
      connections.delete(connectionId);

      ws.publish(
        "room",
        JSON.stringify({
          type: "user_left",
          connectionId,
        }),
      );
    },
  },
});

console.log("Server running on http://localhost:3000");
```

**Client (React + TypeScript):**

```typescript
// useCollaboration.ts
import { useEffect, useState, useCallback, useRef } from "react";

interface User {
  id: string;
  username: string;
  cursor: { x: number; y: number } | null;
}

export function useCollaboration(roomUrl: string) {
  const [users, setUsers] = useState<Map<string, User>>(new Map());
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(roomUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Connected to collaboration server");
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case "init":
          const userMap = new Map(message.users.map((u: User) => [u.id, u]));
          setUsers(userMap);
          break;

        case "user_joined":
          setUsers((prev) =>
            new Map(prev).set(message.connectionId, {
              id: message.connectionId,
              username: message.username,
              cursor: null,
            }),
          );
          break;

        case "user_left":
          setUsers((prev) => {
            const next = new Map(prev);
            next.delete(message.connectionId);
            return next;
          });
          break;

        case "cursor_update":
          setUsers((prev) => {
            const next = new Map(prev);
            const user = next.get(message.connectionId);
            if (user) {
              user.cursor = message.cursor;
            }
            return next;
          });
          break;
      }
    };

    ws.onclose = () => {
      console.log("Disconnected, attempting reconnect...");
      setTimeout(() => {
        // Reconnect logic
      }, 1000);
    };

    return () => {
      ws.close();
    };
  }, [roomUrl]);

  const updateCursor = useCallback((x: number, y: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "cursor_move",
          cursor: { x, y },
        }),
      );
    }
  }, []);

  const clearCursor = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "cursor_move",
          cursor: null,
        }),
      );
    }
  }, []);

  return {
    users,
    connectionId,
    updateCursor,
    clearCursor,
  };
}
```

```typescript
// CollaborativeCanvas.tsx
import { useCollaboration } from './useCollaboration';
import { throttle } from 'lodash';

export function CollaborativeCanvas() {
  const { users, connectionId, updateCursor, clearCursor } =
    useCollaboration('ws://localhost:3000/ws');

  // Throttle cursor updates to 60fps
  const throttledUpdate = useRef(
    throttle((x: number, y: number) => {
      updateCursor(x, y);
    }, 16)
  ).current;

  return (
    <div
      style={{ width: '100vw', height: '100vh', position: 'relative' }}
      onPointerMove={(e) => {
        throttledUpdate(e.clientX, e.clientY);
      }}
      onPointerLeave={() => {
        clearCursor();
      }}
    >
      {/* Render other users' cursors */}
      {Array.from(users.values()).map(user => (
        user.id !== connectionId && user.cursor && (
          <Cursor
            key={user.id}
            x={user.cursor.x}
            y={user.cursor.y}
            name={user.username}
            color={getUserColor(user.id)}
          />
        )
      ))}

      {/* Canvas content */}
      <div>Your collaborative content here</div>
    </div>
  );
}

// Deterministic color generation
function getUserColor(userId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
  ];

  const hash = userId.split('').reduce((acc, char) =>
    acc + char.charCodeAt(0), 0
  );

  return colors[hash % colors.length];
}
```

---

## Conclusion

Multiplayer cursors are a critical UX feature in collaborative applications. Success requires:

1. **Choose the right conflict resolution** strategy for your use case
2. **Optimize network usage** through throttling and batching
3. **Smooth animations** via interpolation (spring/spline)
4. **Efficient rendering** with granular subscriptions
5. **Handle edge cases** (reconnection, timeouts, validation)

The modern approach combines **CRDT-based sync** (Yjs) with **WebSocket transport** and **optimized rendering** (React with selective subscriptions) to achieve sub-100ms latency with smooth 60fps cursor animations.
