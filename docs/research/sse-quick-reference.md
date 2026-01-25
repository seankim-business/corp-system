# SSE Quick Reference for Nubabel

**TL;DR:** Server-Sent Events (SSE) is the recommended approach for real-time updates in Nubabel.

---

## Why SSE Over WebSocket?

✅ **Use SSE for Nubabel because:**
- **AI streaming responses** - Token-by-token Claude output
- **Workflow progress** - BullMQ job status updates
- **Notifications** - User alerts and system messages
- **Simpler than WebSocket** - No bidirectional communication needed
- **HTTP-based** - Works with existing infrastructure
- **Auto-reconnect** - Built into browser EventSource API

❌ **Don't use WebSocket unless:**
- You need bidirectional communication (chat, collaborative editing)
- You need binary data streaming (video, audio)

---

## Basic Implementation

### Server (Express)

```typescript
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send event
  res.write('event: update\n');
  res.write(`data: ${JSON.stringify({ message: 'Hello' })}\n\n`);

  // Cleanup on disconnect
  req.on('close', () => res.end());
});
```

### Client (React)

```typescript
const eventSource = new EventSource('/api/events');

eventSource.addEventListener('update', (event) => {
  const data = JSON.parse(event.data);
  console.log(data);
});

eventSource.onerror = () => {
  // Browser auto-reconnects
};
```

---

## Critical Implementation Details

### 1. Event Format

**MUST end with two newlines (`\n\n`)**

```
event: token
data: {"text": "Hello"}

```

### 2. Headers (Required)

```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.setHeader('X-Accel-Buffering', 'no'); // Nginx only
```

### 3. Heartbeats (Prevent Timeouts)

```typescript
// Send every 15-30 seconds
setInterval(() => {
  res.write(': heartbeat\n\n'); // Comment line
}, 15000);
```

### 4. Cleanup (Prevent Memory Leaks)

```typescript
req.on('close', () => {
  clearInterval(heartbeatInterval);
  unsubscribeFromEvents();
  res.end();
});
```

---

## Use Cases for Nubabel

### 1. AI Streaming (Claude)

```typescript
// Server
app.get('/api/chat/stream', async (req, res) => {
  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: req.query.prompt }],
  });

  stream.on('text', (text) => {
    res.write('event: token\n');
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
  });
});

// Client
const eventSource = new EventSource('/api/chat/stream?prompt=Hello');
eventSource.addEventListener('token', (event) => {
  const { text } = JSON.parse(event.data);
  appendToUI(text);
});
```

### 2. Workflow Progress (BullMQ)

```typescript
// Server
app.get('/api/jobs/:id/stream', (req, res) => {
  jobEvents.on(`job:${req.params.id}:progress`, (data) => {
    res.write('event: progress\n');
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
});

// Client
const eventSource = new EventSource('/api/jobs/123/stream');
eventSource.addEventListener('progress', (event) => {
  const { percent } = JSON.parse(event.data);
  updateProgressBar(percent);
});
```

### 3. Notifications

```typescript
// Server
app.get('/api/notifications/stream', (req, res) => {
  const userId = req.user.id;
  
  notificationEmitter.on(`user:${userId}:notification`, (notification) => {
    res.write('event: notification\n');
    res.write(`data: ${JSON.stringify(notification)}\n\n`);
  });
});

// Client
const eventSource = new EventSource('/api/notifications/stream');
eventSource.addEventListener('notification', (event) => {
  const notification = JSON.parse(event.data);
  showToast(notification);
});
```

---

## Performance Considerations

### Connection Limits

- **HTTP/1.1:** 6 connections per domain
- **HTTP/2:** No limit (recommended)

### Load Balancing

**Requires sticky sessions** - client must reconnect to same server

**Nginx:**
```nginx
upstream sse_backend {
  ip_hash; # Sticky sessions
  server backend1:3000;
  server backend2:3000;
}
```

### Memory Management

- ~2KB per connection
- Max 10,000 connections per server (recommended)
- Auto-cleanup after 1 hour idle

---

## Common Pitfalls

❌ **Don't:**
- Forget the two newlines (`\n\n`) after each event
- Skip the `X-Accel-Buffering: no` header (Nginx)
- Forget to cleanup on disconnect
- Use SSE for bidirectional communication

✅ **Do:**
- Send heartbeats every 15-30 seconds
- Use event IDs for reconnection tracking
- Implement exponential backoff for reconnection
- Use HTTP/2 to avoid connection limits

---

## Next Steps

1. ✅ Read full guide: `./docs/research/sse-implementation-guide.md`
2. ⬜ Implement SSE Manager class
3. ⬜ Create React `useSSE` hook
4. ⬜ Set up BullMQ → SSE bridge
5. ⬜ Configure Nginx for SSE
6. ⬜ Add monitoring (connection count, latency)
7. ⬜ Test reconnection logic

---

## Resources

- [Full Implementation Guide](./sse-implementation-guide.md)
- [WHATWG Spec](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN Docs](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Anthropic Streaming](https://docs.anthropic.com/en/api/streaming)
