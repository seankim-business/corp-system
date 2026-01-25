# Server-Sent Events (SSE) Implementation Guide for Nubabel

**Research Date:** January 26, 2026  
**Purpose:** Real-time updates for AI streaming responses and workflow execution status

---

## Table of Contents

1. [SSE Fundamentals](#1-sse-fundamentals)
2. [SSE vs WebSocket Decision Matrix](#2-sse-vs-websocket-decision-matrix)
3. [Streaming AI Responses (Anthropic Claude)](#3-streaming-ai-responses-anthropic-claude)
4. [Real-Time Workflow Updates](#4-real-time-workflow-updates)
5. [Express SSE Implementation](#5-express-sse-implementation)
6. [Client-Side EventSource Patterns](#6-client-side-eventsource-patterns)
7. [Connection Management & Heartbeats](#7-connection-management--heartbeats)
8. [Performance & Scalability](#8-performance--scalability)
9. [Production Examples](#9-production-examples)
10. [Fallback Strategies](#10-fallback-strategies)

---

## 1. SSE Fundamentals

### What is SSE?

Server-Sent Events (SSE) is an **HTML5 standard** for **unidirectional** real-time communication from server to client over HTTP.

**Key Characteristics:**
- **Protocol:** Standard HTTP/1.1 or HTTP/2
- **Direction:** Server → Client only (one-way)
- **Format:** Text-based (`text/event-stream`)
- **Reconnection:** Automatic browser reconnection with configurable retry
- **Browser Support:** All modern browsers (Firefox 6+, Safari 5+, Chrome 6+, Edge 79+)

**Official Specification:**
- [WHATWG HTML Living Standard - Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN Web Docs - Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

### SSE Event Format

```
event: message
data: {"type": "update", "content": "Hello World"}
id: 12345
retry: 3000

```

**Fields:**
- `data:` - The actual payload (required, can span multiple lines)
- `event:` - Custom event type (optional, defaults to "message")
- `id:` - Event ID for reconnection tracking (optional)
- `retry:` - Reconnection delay in milliseconds (optional)

**Important:** Each event MUST end with **two newlines** (`\n\n`)

---

## 2. SSE vs WebSocket Decision Matrix

### When to Use SSE

✅ **Perfect for:**
- **AI streaming responses** (token-by-token rendering)
- **Workflow execution status** (progress updates)
- **Notifications** (user alerts, system messages)
- **Live dashboards** (metrics, analytics)
- **Deployment logs** (Vercel, Railway, GitHub Actions)
- **Job queue progress** (BullMQ events)

### When to Use WebSocket

✅ **Better for:**
- **Chat applications** (bidirectional messaging)
- **Collaborative editing** (live cursors, presence)
- **Gaming** (real-time multiplayer)
- **Binary data streaming** (video, audio)

### Comparison Table

| Feature | SSE | WebSocket | Long Polling |
|---------|-----|-----------|--------------|
| **Direction** | Server → Client | Bidirectional | Server → Client |
| **Protocol** | HTTP/1.1 | WS/WSS (TCP) | HTTP/1.1 |
| **Complexity** | Low | Medium | Medium |
| **Auto-reconnect** | Built-in | Manual | N/A |
| **Binary data** | No (text only) | Yes | Yes |
| **Proxy/firewall friendly** | Yes | Sometimes problematic | Yes |
| **Max connections** | 6 per domain (HTTP/1.1) | Unlimited | N/A |
| **Browser API** | `EventSource` | `WebSocket` | `fetch` |

**Source:** [Why Server-Sent Events Beat WebSockets for 95% of Real-Time Cloud Applications](https://medium.com/codetodeploy/why-server-sent-events-beat-websockets-for-95-of-real-time-cloud-applications-830eff5a1d7c)

---

## 3. Streaming AI Responses (Anthropic Claude)

### Anthropic Streaming API

**Official Documentation:** [Anthropic Streaming Messages](https://docs.anthropic.com/en/api/streaming)

### Event Flow

1. `message_start` - Contains empty `Message` object
2. `content_block_start` - Begins a content block
3. `content_block_delta` - Token-by-token text deltas
4. `content_block_stop` - Ends content block
5. `message_delta` - Top-level message changes (usage stats)
6. `message_stop` - Stream complete

### TypeScript Implementation

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Streaming with SDK
const stream = await client.messages.stream({
  model: 'claude-sonnet-4-5',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

// Listen for text deltas
stream.on('text', (text) => {
  console.log(text); // Token-by-token output
});

// Or iterate manually
for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    if (event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);
    }
  }
}
```

### Express SSE Bridge for Claude Streaming

```typescript
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const anthropic = new Anthropic();

app.get('/api/chat/stream', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection event
  res.write('event: connected\n');
  res.write('data: {"status": "streaming"}\n\n');

  try {
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: req.query.prompt as string }],
    });

    // Forward Claude events to SSE
    stream.on('text', (text) => {
      res.write('event: token\n');
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('message', (message) => {
      res.write('event: complete\n');
      res.write(`data: ${JSON.stringify({ message })}\n\n`);
      res.end();
    });

    stream.on('error', (error) => {
      res.write('event: error\n');
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });

  } catch (error) {
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }

  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected');
  });
});
```

### Handling Streaming Errors Mid-Response

```typescript
// Error recovery pattern
stream.on('error', (error) => {
  if (error.type === 'overloaded_error') {
    // Send retry event
    res.write('event: retry\n');
    res.write(`data: ${JSON.stringify({ 
      message: 'Server overloaded, retrying...', 
      retryAfter: 5000 
    })}\n\n`);
  } else {
    // Fatal error
    res.write('event: error\n');
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});
```

**Source:** [Anthropic Streaming Documentation](https://docs.anthropic.com/en/api/streaming)

---

## 4. Real-Time Workflow Updates

### BullMQ → SSE Bridge Pattern

**Use Case:** Stream job progress from BullMQ to connected clients

```typescript
import { Queue, Worker } from 'bullmq';
import express from 'express';
import { EventEmitter } from 'events';

// Global event emitter for job updates
const jobEvents = new EventEmitter();

// BullMQ Worker with progress updates
const worker = new Worker('workflow-queue', async (job) => {
  for (let i = 0; i <= 100; i += 10) {
    await job.updateProgress(i);
    
    // Emit progress event
    jobEvents.emit(`job:${job.id}:progress`, {
      jobId: job.id,
      progress: i,
      status: i === 100 ? 'completed' : 'processing',
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}, { connection: redisConnection });

// SSE endpoint for job progress
app.get('/api/jobs/:jobId/stream', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send initial status
  res.write('event: connected\n');
  res.write(`data: ${JSON.stringify({ jobId })}\n\n`);

  // Listen for job-specific events
  const progressHandler = (data) => {
    res.write('event: progress\n');
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    
    if (data.status === 'completed') {
      res.end();
    }
  };

  jobEvents.on(`job:${jobId}:progress`, progressHandler);

  // Cleanup on disconnect
  req.on('close', () => {
    jobEvents.off(`job:${jobId}:progress`, progressHandler);
  });
});
```

**Source:** [Server-Sent Events (SSE) in Node.js: From Monoliths to Distributed Systems](https://www.chanalston.com/blog/nodejs-sse-monolith-to-distributed-system/)

### Multi-User Collaboration (Presence)

```typescript
// Presence tracking with SSE
const presenceMap = new Map<string, Set<string>>(); // workflowId -> Set<userId>

app.get('/api/workflows/:workflowId/presence', (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Add user to presence
  if (!presenceMap.has(workflowId)) {
    presenceMap.set(workflowId, new Set());
  }
  presenceMap.get(workflowId)!.add(userId);

  // Broadcast presence update
  broadcastPresence(workflowId);

  // Send current presence
  res.write('event: presence\n');
  res.write(`data: ${JSON.stringify({
    users: Array.from(presenceMap.get(workflowId)!)
  })}\n\n`);

  // Cleanup on disconnect
  req.on('close', () => {
    presenceMap.get(workflowId)?.delete(userId);
    broadcastPresence(workflowId);
  });
});

function broadcastPresence(workflowId: string) {
  // Emit to all connected clients for this workflow
  // (requires connection tracking - see section 7)
}
```

---

## 5. Express SSE Implementation

### Basic SSE Endpoint

```typescript
import express from 'express';

const app = express();

app.get('/api/events', (req, res) => {
  // 1. Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // 2. Disable compression (important!)
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx
  
  // 3. Send initial comment (prevents timeout)
  res.write(': connected\n\n');

  // 4. Send events
  const intervalId = setInterval(() => {
    res.write('event: update\n');
    res.write(`data: ${JSON.stringify({ 
      time: new Date().toISOString() 
    })}\n\n`);
  }, 1000);

  // 5. Cleanup on disconnect
  req.on('close', () => {
    clearInterval(intervalId);
    res.end();
  });
});

app.listen(3000);
```

### Production-Ready SSE Manager

```typescript
import { EventEmitter } from 'events';

class SSEManager {
  private clients = new Map<string, express.Response>();
  private events = new EventEmitter();

  connect(clientId: string, res: express.Response) {
    // Set headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Store client
    this.clients.set(clientId, res);

    // Send initial event
    this.sendToClient(clientId, 'connected', { clientId });

    // Cleanup on disconnect
    res.on('close', () => {
      this.clients.delete(clientId);
      console.log(`Client ${clientId} disconnected`);
    });
  }

  sendToClient(clientId: string, event: string, data: any) {
    const client = this.clients.get(clientId);
    if (client) {
      client.write(`event: ${event}\n`);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  broadcast(event: string, data: any) {
    this.clients.forEach((client, clientId) => {
      this.sendToClient(clientId, event, data);
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// Usage
const sseManager = new SSEManager();

app.get('/api/events', (req, res) => {
  const clientId = req.query.clientId as string || generateId();
  sseManager.connect(clientId, res);
});

// Broadcast from anywhere
sseManager.broadcast('notification', { message: 'Hello all clients!' });
```

**Source:** [Express Server-Sent Events Guide](https://compilenrun.com/docs/framework/express/express-advanced-patterns/express-server-sent-events)

---

## 6. Client-Side EventSource Patterns

### Basic EventSource Usage

```typescript
// Create connection
const eventSource = new EventSource('/api/events');

// Listen for default "message" events
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

// Listen for custom events
eventSource.addEventListener('token', (event) => {
  const { text } = JSON.parse(event.data);
  appendToUI(text);
});

// Handle connection open
eventSource.onopen = () => {
  console.log('Connection established');
};

// Handle errors
eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  // Browser will auto-reconnect
};

// Close connection
eventSource.close();
```

### React Hook for SSE

```typescript
import { useEffect, useState, useRef } from 'react';

interface UseSSEOptions {
  url: string;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  reconnect?: boolean;
}

export function useSSE({ url, onMessage, onError, reconnect = true }: UseSSEOptions) {
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [data, setData] = useState<any>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setStatus('open');
    };

    eventSource.onmessage = (event) => {
      const parsedData = JSON.parse(event.data);
      setData(parsedData);
      onMessage?.(parsedData);
    };

    eventSource.onerror = (error) => {
      setStatus('closed');
      onError?.(error);
      
      if (!reconnect) {
        eventSource.close();
      }
    };

    return () => {
      eventSource.close();
      setStatus('closed');
    };
  }, [url, reconnect]);

  const close = () => {
    eventSourceRef.current?.close();
    setStatus('closed');
  };

  return { status, data, close };
}

// Usage
function ChatComponent() {
  const { status, data } = useSSE({
    url: '/api/chat/stream?prompt=Hello',
    onMessage: (data) => {
      if (data.text) {
        appendToken(data.text);
      }
    },
  });

  return <div>Status: {status}</div>;
}
```

### Handling Custom Events

```typescript
const eventSource = new EventSource('/api/events');

// Listen for multiple event types
eventSource.addEventListener('token', (event) => {
  const { text } = JSON.parse(event.data);
  appendToken(text);
});

eventSource.addEventListener('progress', (event) => {
  const { percent } = JSON.parse(event.data);
  updateProgressBar(percent);
});

eventSource.addEventListener('error', (event) => {
  const { message } = JSON.parse(event.data);
  showError(message);
});

eventSource.addEventListener('complete', (event) => {
  const { result } = JSON.parse(event.data);
  showResult(result);
  eventSource.close();
});
```

**Source:** [How to Implement Server-Sent Events (SSE) in React](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view)

---

## 7. Connection Management & Heartbeats

### Heartbeat Pattern (Prevent Timeouts)

**Problem:** Proxies and load balancers may close idle connections after 30-60 seconds.

**Solution:** Send periodic heartbeat comments.

```typescript
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send heartbeat every 15 seconds
  const heartbeatInterval = setInterval(() => {
    res.write(': heartbeat\n\n'); // Comment line (ignored by client)
  }, 15000);

  // Cleanup
  req.on('close', () => {
    clearInterval(heartbeatInterval);
  });
});
```

**Best Practice:** Send heartbeats every **15-30 seconds** to prevent proxy timeouts.

**Source:** [WHATWG HTML Spec - Authoring Notes](https://html.spec.whatwg.org/multipage/server-sent-events.html#authoring-notes)

### Reconnection with Last-Event-ID

**Server:**
```typescript
app.get('/api/events', (req, res) => {
  const lastEventId = req.headers['last-event-id'];
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Resume from last event
  let eventId = lastEventId ? parseInt(lastEventId) : 0;

  const interval = setInterval(() => {
    eventId++;
    res.write(`id: ${eventId}\n`);
    res.write(`data: ${JSON.stringify({ eventId, time: Date.now() })}\n\n`);
  }, 1000);

  req.on('close', () => clearInterval(interval));
});
```

**Client:**
```typescript
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (event) => {
  console.log('Last Event ID:', event.lastEventId);
  // Browser automatically sends this in Last-Event-ID header on reconnect
};
```

### Connection State Management

```typescript
class SSEConnection {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(url: string) {
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('Connected');
      this.reconnectAttempts = 0; // Reset on successful connection
    };

    this.eventSource.onerror = (error) => {
      console.error('Connection error:', error);
      
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => {
          this.eventSource?.close();
          this.connect(url);
        }, delay);
      } else {
        console.error('Max reconnection attempts reached');
        this.eventSource?.close();
      }
    };
  }

  close() {
    this.eventSource?.close();
    this.eventSource = null;
  }
}
```

---

## 8. Performance & Scalability

### Connection Limits

**HTTP/1.1 Browser Limits:**
- **6 concurrent connections per domain** (Chrome, Firefox, Safari)
- SSE connections count toward this limit

**Solutions:**
1. **Use HTTP/2** - No connection limit
2. **Use subdomains** - `events1.example.com`, `events2.example.com`
3. **Share connections** - Use SharedWorker to multiplex

### HTTP/2 Configuration (Express)

```typescript
import express from 'express';
import http2 from 'http2';
import fs from 'fs';

const app = express();

// HTTP/2 server
const server = http2.createSecureServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt'),
}, app);

server.listen(3000);
```

### Load Balancing with Sticky Sessions

**Problem:** SSE requires sticky sessions - client must reconnect to same server.

**Solutions:**

1. **IP Hash (Nginx)**
```nginx
upstream sse_backend {
  ip_hash;
  server backend1.example.com:3000;
  server backend2.example.com:3000;
}

server {
  location /api/events {
    proxy_pass http://sse_backend;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
    proxy_buffering off;
    proxy_cache off;
  }
}
```

2. **Cookie-based (AWS ALB)**
```typescript
// Enable sticky sessions in ALB target group
// Duration: 1 day (86400 seconds)
```

3. **Redis Pub/Sub (Distributed)**
```typescript
import Redis from 'ioredis';

const redis = new Redis();
const subscriber = new Redis();

// Subscribe to events
subscriber.subscribe('sse:events');

subscriber.on('message', (channel, message) => {
  const { clientId, event, data } = JSON.parse(message);
  
  // Send to connected client
  sseManager.sendToClient(clientId, event, data);
});

// Publish from any server
redis.publish('sse:events', JSON.stringify({
  clientId: 'user-123',
  event: 'notification',
  data: { message: 'Hello' },
}));
```

**Source:** [Both SSE and StreamableHttp transport require sticky sessions](https://github.com/modelcontextprotocol/typescript-sdk/issues/330)

### Memory Management

```typescript
class SSEConnectionPool {
  private connections = new Map<string, express.Response>();
  private maxConnections = 10000;

  add(clientId: string, res: express.Response) {
    if (this.connections.size >= this.maxConnections) {
      throw new Error('Connection pool full');
    }
    
    this.connections.set(clientId, res);
    
    // Auto-cleanup after 1 hour
    setTimeout(() => {
      this.remove(clientId);
    }, 3600000);
  }

  remove(clientId: string) {
    const res = this.connections.get(clientId);
    if (res) {
      res.end();
      this.connections.delete(clientId);
    }
  }

  getStats() {
    return {
      activeConnections: this.connections.size,
      maxConnections: this.maxConnections,
      utilizationPercent: (this.connections.size / this.maxConnections) * 100,
    };
  }
}
```

### Performance Benchmarks

| Metric | SSE | WebSocket | Long Polling |
|--------|-----|-----------|--------------|
| **Latency** | ~50ms | ~10ms | ~500ms |
| **Memory per connection** | ~2KB | ~5KB | ~1KB |
| **CPU overhead** | Low | Medium | High |
| **Bandwidth efficiency** | High | High | Low |

**Source:** [Mastering Server-Sent Events (SSE): Real-Time Updates Made Simple](https://nerdleveltech.com/mastering-server-sent-events-sse-real-time-updates-made-simple)

---

## 9. Production Examples

### Vercel Deployment Logs

**Pattern:** Stream build/deployment logs in real-time

```typescript
// Vercel-style deployment log streaming
app.get('/api/deployments/:id/logs', async (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Stream logs from database/file
  const logStream = await getDeploymentLogStream(id);

  logStream.on('data', (log) => {
    res.write('event: log\n');
    res.write(`data: ${JSON.stringify({
      timestamp: log.timestamp,
      level: log.level,
      message: log.message,
    })}\n\n`);
  });

  logStream.on('end', () => {
    res.write('event: complete\n');
    res.write('data: {"status": "deployment_complete"}\n\n');
    res.end();
  });

  req.on('close', () => {
    logStream.destroy();
  });
});
```

**Source:** [Fixing Slow SSE Streaming in Next.js and Vercel](https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996)

### GitHub Actions Logs

**Pattern:** Real-time workflow execution logs

```typescript
// GitHub Actions-style workflow logs
app.get('/api/workflows/:id/logs', (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Subscribe to workflow events
  const unsubscribe = workflowEngine.subscribe(id, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
  });

  req.on('close', () => {
    unsubscribe();
  });
});
```

### Railway Deployment Logs

**Pattern:** Streaming deployment progress with SSE

**Source:** [MCP Server with HTTP Streaming - Railway Deployment](https://lobehub.com/it/mcp/magnazee-railwaymcp)

### Linear Real-Time Updates

**Pattern:** Issue/project updates via SSE

```typescript
// Linear-style issue updates
app.get('/api/issues/:id/updates', (req, res) => {
  const { id } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Subscribe to issue changes
  const subscription = issueStore.subscribe(id, (change) => {
    res.write('event: issue_updated\n');
    res.write(`data: ${JSON.stringify({
      issueId: id,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      updatedBy: change.userId,
    })}\n\n`);
  });

  req.on('close', () => {
    subscription.unsubscribe();
  });
});
```

---

## 10. Fallback Strategies

### EventSource Polyfill (Legacy Browsers)

**For IE11 and older browsers:**

```typescript
import { EventSourcePolyfill } from 'event-source-polyfill';

// Use polyfill if native EventSource not available
const EventSource = window.EventSource || EventSourcePolyfill;

const eventSource = new EventSource('/api/events', {
  headers: {
    'Authorization': `Bearer ${token}`,
  },
});
```

**Popular Polyfills:**
- [event-source-polyfill](https://www.npmjs.com/package/event-source-polyfill)
- [eventsource](https://www.npmjs.com/package/eventsource) (Node.js)

### Long Polling Fallback

```typescript
class RealTimeClient {
  private useSSE = true;

  connect(url: string) {
    if (this.supportsSSE()) {
      this.connectSSE(url);
    } else {
      this.connectLongPolling(url);
    }
  }

  private supportsSSE(): boolean {
    return typeof EventSource !== 'undefined';
  }

  private connectSSE(url: string) {
    const eventSource = new EventSource(url);
    
    eventSource.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };
  }

  private async connectLongPolling(url: string) {
    while (true) {
      try {
        const response = await fetch(url);
        const data = await response.json();
        this.handleMessage(data);
      } catch (error) {
        console.error('Long polling error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  private handleMessage(data: any) {
    // Process message regardless of transport
    console.log('Received:', data);
  }
}
```

### WebSocket Upgrade Path

```typescript
// Progressive enhancement: SSE → WebSocket
class AdaptiveRealTimeClient {
  connect(url: string) {
    if (this.supportsWebSocket() && this.needsBidirectional()) {
      this.connectWebSocket(url);
    } else if (this.supportsSSE()) {
      this.connectSSE(url);
    } else {
      this.connectLongPolling(url);
    }
  }

  private supportsWebSocket(): boolean {
    return typeof WebSocket !== 'undefined';
  }

  private supportsSSE(): boolean {
    return typeof EventSource !== 'undefined';
  }

  private needsBidirectional(): boolean {
    // Determine if bidirectional communication is needed
    return false; // For Nubabel, SSE is sufficient
  }
}
```

---

## Implementation Recommendations for Nubabel

### 1. AI Streaming Responses

**Use Case:** Stream Claude responses token-by-token

**Implementation:**
```typescript
// Route: POST /api/chat/stream
// Response: SSE stream with token events
// Client: React component with useSSE hook
```

**Key Features:**
- Token-by-token rendering
- Error recovery (retry on overload)
- Progress indicators
- Cancellation support

### 2. Workflow Execution Status

**Use Case:** Real-time workflow progress updates

**Implementation:**
```typescript
// Route: GET /api/workflows/:id/stream
// Response: SSE stream with progress events
// Backend: BullMQ → EventEmitter → SSE
```

**Key Features:**
- Job progress (0-100%)
- Step-by-step updates
- Error notifications
- Completion events

### 3. Notification Delivery

**Use Case:** Push notifications to users

**Implementation:**
```typescript
// Route: GET /api/notifications/stream
// Response: SSE stream with notification events
// Backend: Redis Pub/Sub → SSE
```

**Key Features:**
- User-specific streams
- Notification types (info, warning, error)
- Read receipts
- Presence tracking

### 4. Multi-User Collaboration

**Use Case:** Live cursors and presence

**Implementation:**
```typescript
// Route: GET /api/workflows/:id/presence
// Response: SSE stream with presence events
// Backend: In-memory presence map → SSE
```

**Key Features:**
- User join/leave events
- Cursor positions
- Active users list
- Typing indicators

---

## Next Steps

1. **Implement Express SSE Manager** - Centralized connection management
2. **Create React useSSE Hook** - Reusable client-side hook
3. **Set up BullMQ → SSE Bridge** - Workflow progress streaming
4. **Configure Nginx/Load Balancer** - Sticky sessions + buffering disabled
5. **Add Monitoring** - Track connection count, latency, errors
6. **Test Reconnection Logic** - Simulate network failures
7. **Implement Heartbeats** - Prevent proxy timeouts
8. **Add Authentication** - JWT tokens in EventSource headers (via polyfill)

---

## References

1. [WHATWG HTML Living Standard - Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
2. [MDN Web Docs - Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
3. [Anthropic Streaming Messages API](https://docs.anthropic.com/en/api/streaming)
4. [Express Server-Sent Events Guide](https://compilenrun.com/docs/framework/express/express-advanced-patterns/express-server-sent-events)
5. [SSE in Node.js: From Monoliths to Distributed Systems](https://www.chanalston.com/blog/nodejs-sse-monolith-to-distributed-system/)
6. [Why SSE Beats WebSockets for 95% of Real-Time Apps](https://medium.com/codetodeploy/why-server-sent-events-beat-websockets-for-95-of-real-time-cloud-applications-830eff5a1d7c)
7. [Mastering Server-Sent Events (SSE)](https://nerdleveltech.com/mastering-server-sent-events-sse-real-time-updates-made-simple)
8. [How to Implement SSE in React](https://oneuptime.com/blog/post/2026-01-15-server-sent-events-sse-react/view)

---

**Document Version:** 1.0  
**Last Updated:** January 26, 2026  
**Author:** Research compiled for Nubabel SSE implementation
