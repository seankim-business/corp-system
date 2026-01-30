# Loading State UX for Long-Running AI Tasks

A comprehensive guide for implementing effective loading states and progress indicators for AI/LLM tasks that can take 10 seconds to 5 minutes.

## Table of Contents

1. [Overview](#overview)
2. [Progress Indicators: Choosing the Right Type](#progress-indicators-choosing-the-right-type)
3. [Streaming Token Display Patterns](#streaming-token-display-patterns)
4. [Perceived Performance Techniques](#perceived-performance-techniques)
5. [Cancellation UX](#cancellation-ux)
6. [Background Processing Patterns](#background-processing-patterns)
7. [Implementation Examples](#implementation-examples)
8. [Mobile Considerations](#mobile-considerations)
9. [Real-World Examples](#real-world-examples)

---

## Overview

Long-running AI tasks present unique UX challenges:

- **Uncertainty**: Users don't know if the system is working or frozen
- **Variable duration**: Tasks can range from 5 seconds to 5 minutes
- **Indeterminate progress**: Often impossible to calculate exact completion percentage
- **User engagement**: Need to keep users informed without causing anxiety

**Key Principle**: The first token latency (Time To First Token - TTFT) matters more than total completion time. Users perceive systems with TTFT under 500ms as instant and competent.

---

## Progress Indicators: Choosing the Right Type

### Skeleton Screens

**Best for**: Initial page loads, structured content, AI responses with predictable layouts

**Advantages**:

- Perceived as **20% faster** than spinners for the same wait time
- Users perceive sites using them as **30% faster** than identical sites with spinners
- Provides visual preview of final layout
- Reduces cognitive load
- Seamless transition to loaded state

**When to use**:

- Wait times **under 10 seconds**
- Full-page loads with structured content
- AI chat interfaces (message bubbles)
- Content grids and lists

**Implementation tips**:

```css
/* GPU-accelerated shimmer animation */
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  /* Use transform for GPU acceleration */
  will-change: transform;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

**Example structure**:

```tsx
const SkeletonMessage = () => (
  <div className="message-skeleton">
    <div className="skeleton skeleton-avatar" />
    <div className="skeleton-content">
      <div className="skeleton skeleton-line" style={{ width: "80%" }} />
      <div className="skeleton skeleton-line" style={{ width: "60%" }} />
      <div className="skeleton skeleton-line" style={{ width: "90%" }} />
    </div>
  </div>
);
```

### Spinners

**Best for**: Short, indeterminate operations (1-10 seconds), single module loading

**Advantages**:

- Simple to implement
- Universally understood
- Low design effort

**Disadvantages**:

- Passive waiting experience
- Can feel repetitive and mundane
- No indication of progress

**When to use**:

- Wait times **1-10 seconds**
- Single component/module loading
- Simple actions (form submission, button click)

**Implementation tips**:

```css
/* GPU-accelerated spinner */
.spinner {
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-top-color: #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  /* Use transform for GPU acceleration */
  animation: spin 1s linear infinite;
  will-change: transform;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
```

### Progress Bars

**Best for**: Determinate tasks, long operations (10+ seconds), file uploads/downloads

**Advantages**:

- Shows exact progress
- Provides sense of remaining time
- Reduces anxiety for long waits

**When to use**:

- Wait times **over 10 seconds**
- Progress can be calculated or estimated
- Multi-stage processes
- File operations

**Implementation for AI tasks**:

```tsx
const AIProgressBar = ({ stage, totalStages }: { stage: number; totalStages: number }) => {
  const progress = (stage / totalStages) * 100;

  return (
    <div className="progress-container">
      <div className="progress-bar" style={{ width: `${progress}%` }} />
      <div className="progress-label">
        Stage {stage} of {totalStages}
      </div>
    </div>
  );
};
```

### Stage-Based Progress Indicators

**Best for**: Long-running AI tasks with identifiable phases

**Example stages**:

1. "Reading document structure..."
2. "Analyzing relationships..."
3. "Generating insights..."
4. "Formatting response..."

```tsx
const StageIndicator = ({ currentStage, stages }: { currentStage: number; stages: string[] }) => (
  <div className="stage-indicator">
    {stages.map((stage, index) => (
      <div
        key={index}
        className={`stage ${index === currentStage ? "active" : ""} ${index < currentStage ? "complete" : ""}`}
      >
        <div className="stage-icon">
          {index < currentStage ? "✓" : index === currentStage ? "⟳" : "○"}
        </div>
        <div className="stage-label">{stage}</div>
      </div>
    ))}
  </div>
);
```

### Comparison Table

| Indicator Type      | Wait Time | Use Case                            | Perceived Speed           | User Engagement |
| ------------------- | --------- | ----------------------------------- | ------------------------- | --------------- |
| **Skeleton Screen** | < 10s     | Full-page loads, structured content | Fastest (30% improvement) | High            |
| **Spinner**         | 1-10s     | Single module, simple actions       | Baseline                  | Low             |
| **Progress Bar**    | > 10s     | Determinate tasks, file operations  | Good (with percentage)    | Medium          |
| **Stage Indicator** | > 30s     | Multi-phase AI tasks                | Good (with context)       | High            |

---

## Streaming Token Display Patterns

Streaming is **critical** for AI/LLM tasks. It provides immediate feedback and makes the system feel "alive."

### Why Streaming Matters

- **Perceived performance**: First token in 200ms feels instant, even if total generation takes 30 seconds
- **Engagement**: Users can start reading while generation continues
- **Transparency**: Shows the AI is actively working
- **Cancellation**: Users can stop generation early if output isn't relevant

### Server-Sent Events (SSE) Implementation

**Recommended for most AI applications** - simpler than WebSockets, unidirectional, automatic reconnection.

#### Backend (Node.js/Express)

```typescript
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body;

  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const { textStream } = streamText({
    model: openai("gpt-4"),
    prompt,
  });

  for await (const text of textStream) {
    res.write(`data: ${JSON.stringify({ token: text })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
});
```

#### Frontend (React with Fetch Streaming)

```typescript
const streamAIResponse = async (prompt: string, onToken: (token: string) => void) => {
  const controller = new AbortController();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") return;

          const { token } = JSON.parse(data);
          onToken(token);
        }
      }
    }
  } catch (error) {
    if (error.name === "AbortError") {
      console.log("Stream cancelled");
    } else {
      throw error;
    }
  }

  return controller;
};
```

### Using Vercel AI SDK

**Recommended for production** - handles streaming, error recovery, and state management.

```tsx
"use client";

import { useChat } from "@ai-sdk/react";

export default function ChatInterface() {
  const { messages, input, setInput, sendMessage, status, stop } = useChat({
    api: "/api/chat",
    onFinish: (message) => {
      console.log("Response complete:", message);
    },
  });

  return (
    <div className="chat-container">
      {/* Messages */}
      <div className="messages">
        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            {message.content}
          </div>
        ))}

        {/* Loading indicator */}
        {status === "submitted" && (
          <div className="message assistant">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
      </div>

      {/* Input form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput("");
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder="Type a message..."
        />

        {status === "streaming" ? (
          <button type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={status !== "ready"}>
            Send
          </button>
        )}
      </form>
    </div>
  );
}
```

### WebSocket Implementation

**Use when**: Bidirectional communication needed, multiple concurrent streams, real-time collaboration.

```typescript
import useWebSocket, { ReadyState } from 'react-use-websocket';

export const AIStreamingChat = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    'wss://api.example.com/ai-stream',
    {
      onOpen: () => console.log('WebSocket connected'),
      onClose: () => console.log('WebSocket disconnected'),
      shouldReconnect: () => true,
      reconnectAttempts: 10,
      reconnectInterval: 3000,
      // Heartbeat to detect connection failures
      heartbeat: {
        message: 'ping',
        returnMessage: 'pong',
        timeout: 60000,
        interval: 25000,
      },
    }
  );

  useEffect(() => {
    if (lastMessage !== null) {
      const data = JSON.parse(lastMessage.data);

      if (data.type === 'token') {
        setCurrentResponse((prev) => prev + data.content);
      } else if (data.type === 'done') {
        setMessages((prev) => [...prev, currentResponse]);
        setCurrentResponse('');
      }
    }
  }, [lastMessage]);

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
  }[readyState];

  return (
    <div>
      <div className="status">Status: {connectionStatus}</div>
      {/* Messages display */}
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx}>{msg}</div>
        ))}
        {currentResponse && <div className="streaming">{currentResponse}</div>}
      </div>
    </div>
  );
};
```

### Token Buffering for Smooth Rendering

**Problem**: Rendering every single token causes jittery updates and broken reading flow.

**Solution**: Decouple network speed from visual speed by buffering tokens.

```typescript
const useBufferedStream = (onUpdate: (text: string) => void) => {
  const bufferRef = useRef<string[]>([]);
  const intervalRef = useRef<NodeJS.Timeout>();

  const addToken = (token: string) => {
    bufferRef.current.push(token);
  };

  const startRendering = () => {
    intervalRef.current = setInterval(() => {
      if (bufferRef.current.length > 0) {
        // Consume 2-3 tokens at a time for smoother rendering
        const batch = bufferRef.current.splice(0, 3).join("");
        onUpdate(batch);
      }
    }, 50); // Update every 50ms for smooth visual flow
  };

  const stopRendering = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      // Flush remaining buffer
      if (bufferRef.current.length > 0) {
        onUpdate(bufferRef.current.join(""));
        bufferRef.current = [];
      }
    }
  };

  return { addToken, startRendering, stopRendering };
};
```

### Cursor Indicator

Show a blinking cursor to indicate generation is ongoing:

```css
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background-color: currentColor;
  margin-left: 2px;
  animation: blink 1s infinite;
  /* Use opacity for GPU acceleration */
  will-change: opacity;
}

@keyframes blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}
```

```tsx
const StreamingMessage = ({ content, isStreaming }: { content: string; isStreaming: boolean }) => (
  <div className="message">
    {content}
    {isStreaming && <span className="streaming-cursor" />}
  </div>
);
```

---

## Perceived Performance Techniques

### Time To First Token (TTFT) Optimization

**Target**: < 500ms for instant feel, < 700ms acceptable

**Techniques**:

1. **Prefill optimization**: Minimize prompt processing time
2. **Model selection**: Use faster models for initial response
3. **Caching**: Cache common prompts/contexts
4. **Streaming**: Start displaying immediately

### Progressive Enhancement

Show basic response first, then add detail:

```tsx
const ProgressiveResponse = () => {
  const [quickAnswer, setQuickAnswer] = useState("");
  const [detailedAnswer, setDetailedAnswer] = useState("");

  useEffect(() => {
    // Quick answer from fast model
    fetchQuickAnswer().then(setQuickAnswer);

    // Detailed answer from powerful model
    fetchDetailedAnswer().then(setDetailedAnswer);
  }, []);

  return (
    <div>
      {quickAnswer && (
        <div className="quick-answer">
          <strong>Quick Answer:</strong> {quickAnswer}
        </div>
      )}
      {detailedAnswer && (
        <div className="detailed-answer">
          <strong>Detailed Analysis:</strong> {detailedAnswer}
        </div>
      )}
    </div>
  );
};
```

### Estimated Time Display

For long tasks, show dynamic time estimates:

```tsx
const EstimatedTimeIndicator = ({
  startTime,
  estimatedDuration,
}: {
  startTime: number;
  estimatedDuration: number;
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const remaining = Math.max(0, estimatedDuration - elapsed);
  const progress = Math.min(100, (elapsed / estimatedDuration) * 100);

  return (
    <div className="time-indicator">
      <div className="progress-bar" style={{ width: `${progress}%` }} />
      <div className="time-text">
        {remaining > 0
          ? `Typically completes in ${Math.ceil(remaining / 1000)}s`
          : "Finishing up..."}
      </div>
    </div>
  );
};
```

### Contextual Activity Indicators

Animate elements related to expected output:

```tsx
const DocumentAnalysisLoader = () => (
  <div className="analysis-loader">
    <div className="document-icon animating">📄</div>
    <div className="analysis-stages">
      <div className="stage active">Reading structure...</div>
      <div className="stage">Analyzing content...</div>
      <div className="stage">Generating insights...</div>
    </div>
  </div>
);
```

---

## Cancellation UX

### Why Cancellation Matters

- **User control**: Empowers users to stop irrelevant generation
- **Resource efficiency**: Prevents unnecessary API costs
- **Better UX**: Reduces frustration when output isn't what user wanted

### AbortController Pattern

```typescript
const useCancellableAIRequest = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const sendRequest = async (prompt: string) => {
    // Cancel previous request if exists
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    controllerRef.current = new AbortController();
    setIsLoading(true);
    setResponse("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controllerRef.current.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const chunk = decoder.decode(value);
        setResponse((prev) => prev + chunk);
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Request cancelled by user");
      } else {
        console.error("Request failed:", error);
      }
    } finally {
      setIsLoading(false);
      controllerRef.current = null;
    }
  };

  const cancel = () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      setIsLoading(false);
    }
  };

  return { sendRequest, cancel, isLoading, response };
};
```

### Cancel Button UX

```tsx
const ChatWithCancel = () => {
  const { sendRequest, cancel, isLoading, response } = useCancellableAIRequest();

  return (
    <div>
      <div className="response">{response}</div>

      {isLoading && (
        <button onClick={cancel} className="cancel-button" aria-label="Stop generation">
          <span className="icon">⏹</span>
          Stop generating
        </button>
      )}
    </div>
  );
};
```

### Timeout Handling

```typescript
const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeout: number = 60000,
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
```

### Graceful Degradation

```tsx
const RobustAIChat = () => {
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "error" | "timeout">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async (prompt: string) => {
    setStatus("loading");
    setError(null);

    try {
      const response = await fetchWithTimeout(
        "/api/chat",
        {
          method: "POST",
          body: JSON.stringify({ prompt }),
        },
        120000,
      ); // 2 minute timeout

      setStatus("streaming");
      // Handle streaming...
    } catch (error) {
      if (error.message.includes("timed out")) {
        setStatus("timeout");
        setError("The request took too long. Please try a simpler query.");
      } else {
        setStatus("error");
        setError("Something went wrong. Please try again.");
      }
    }
  };

  return (
    <div>
      {status === "timeout" && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => handleRequest(lastPrompt)}>Retry</button>
        </div>
      )}
    </div>
  );
};
```

---

## Background Processing Patterns

For tasks taking 60+ seconds, consider background processing with polling or notifications.

### Polling Pattern

```typescript
const useBackgroundTask = () => {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "complete" | "error">("idle");
  const [result, setResult] = useState<any>(null);

  const startTask = async (prompt: string) => {
    // Initiate task
    const response = await fetch("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
    const { taskId } = await response.json();

    setTaskId(taskId);
    setStatus("processing");
  };

  useEffect(() => {
    if (!taskId || status !== "processing") return;

    const pollInterval = setInterval(async () => {
      const response = await fetch(`/api/tasks/${taskId}`);
      const data = await response.json();

      if (data.status === "complete") {
        setResult(data.result);
        setStatus("complete");
        clearInterval(pollInterval);
      } else if (data.status === "error") {
        setStatus("error");
        clearInterval(pollInterval);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [taskId, status]);

  return { startTask, status, result };
};
```

### Hybrid Foreground/Background Pattern

Start in foreground, offer background option after threshold:

```tsx
const HybridTaskProcessor = () => {
  const [mode, setMode] = useState<"foreground" | "background">("foreground");
  const [showBackgroundOption, setShowBackgroundOption] = useState(false);

  useEffect(() => {
    // After 30 seconds, offer background processing
    const timer = setTimeout(() => {
      if (mode === "foreground") {
        setShowBackgroundOption(true);
      }
    }, 30000);

    return () => clearTimeout(timer);
  }, [mode]);

  const moveToBackground = () => {
    setMode("background");
    // Show notification when complete
    // Allow user to navigate away
  };

  return (
    <div>
      {showBackgroundOption && (
        <div className="background-option">
          <p>This is taking longer than expected.</p>
          <button onClick={moveToBackground}>Continue in background</button>
        </div>
      )}
    </div>
  );
};
```

---

## Implementation Examples

### Complete Chat Interface with All Features

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";

export default function CompleteChatInterface() {
  const { messages, input, setInput, sendMessage, status, stop, error, reload } = useChat({
    api: "/api/chat",
    onFinish: (message) => {
      console.log("Response complete:", message);
    },
    onError: (error) => {
      console.error("Chat error:", error);
    },
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, autoScroll]);

  // Detect manual scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="chat-interface">
      {/* Messages container */}
      <div className="messages-container" onScroll={handleScroll}>
        {messages.map((message, index) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-avatar">{message.role === "user" ? "👤" : "🤖"}</div>
            <div className="message-content">
              {message.content}
              {/* Show cursor on last assistant message if streaming */}
              {message.role === "assistant" &&
                index === messages.length - 1 &&
                status === "streaming" && <span className="streaming-cursor" />}
            </div>
          </div>
        ))}

        {/* Loading skeleton */}
        {status === "submitted" && (
          <div className="message assistant">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="skeleton-loader">
                <div className="skeleton-line" style={{ width: "80%" }} />
                <div className="skeleton-line" style={{ width: "60%" }} />
                <div className="skeleton-line" style={{ width: "90%" }} />
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="error-message">
            <p>Something went wrong: {error.message}</p>
            <button onClick={() => reload()}>Retry</button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input form */}
      <form
        className="input-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && status === "ready") {
            sendMessage({ text: input });
            setInput("");
          }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== "ready"}
          placeholder="Type your message..."
          className="message-input"
        />

        {status === "streaming" ? (
          <button type="button" onClick={stop} className="stop-button">
            ⏹ Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={status !== "ready" || !input.trim()}
            className="send-button"
          >
            Send
          </button>
        )}
      </form>

      {/* Status indicator */}
      <div className="status-bar">
        {status === "submitted" && "Thinking..."}
        {status === "streaming" && "Generating response..."}
        {status === "ready" && "Ready"}
      </div>
    </div>
  );
}
```

### Styles for Complete Chat Interface

```css
.chat-interface {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  scroll-behavior: smooth;
}

.message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.message-content {
  background: #f0f0f0;
  padding: 12px 16px;
  border-radius: 12px;
  max-width: 70%;
  word-wrap: break-word;
}

.message.user .message-content {
  background: #007bff;
  color: white;
}

/* Streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background-color: currentColor;
  margin-left: 2px;
  animation: blink 1s infinite;
  will-change: opacity;
}

@keyframes blink {
  0%,
  49% {
    opacity: 1;
  }
  50%,
  100% {
    opacity: 0;
  }
}

/* Skeleton loader */
.skeleton-loader {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 16px;
  background: linear-gradient(90deg, #e0e0e0 25%, #d0d0d0 50%, #e0e0e0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 4px;
  will-change: transform;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Input form */
.input-form {
  display: flex;
  gap: 12px;
  padding: 20px;
  border-top: 1px solid #e0e0e0;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 16px;
}

.message-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-button,
.stop-button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
}

.send-button {
  background: #007bff;
  color: white;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stop-button {
  background: #dc3545;
  color: white;
}

.stop-button:hover {
  background: #c82333;
}

/* Status bar */
.status-bar {
  padding: 8px 20px;
  text-align: center;
  font-size: 14px;
  color: #666;
  border-top: 1px solid #e0e0e0;
}

/* Error message */
.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 12px;
  border-radius: 8px;
  margin: 12px 0;
}

.error-message button {
  margin-top: 8px;
  padding: 8px 16px;
  background: #721c24;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

---

## Mobile Considerations

### Battery Impact

**Key principle**: Use GPU-accelerated animations to reduce battery consumption.

#### GPU-Accelerated Properties

**Use these** (composited on GPU):

- `transform` (translate, rotate, scale)
- `opacity`
- `filter` (newer browsers)
- `background-color` (newer browsers)
- `clip-path` (newer browsers)

**Avoid animating** (triggers CPU layout/paint):

- `width`, `height`
- `top`, `left`, `right`, `bottom`
- `margin`, `padding`
- `border-width`
- `font-size`

#### Optimized Mobile Animations

```css
/* ✅ GOOD - GPU accelerated */
.loading-spinner {
  animation: spin 1s linear infinite;
  will-change: transform;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ❌ BAD - CPU intensive */
.loading-spinner-bad {
  animation: spin-bad 1s linear infinite;
}

@keyframes spin-bad {
  to {
    /* Triggers layout recalculation */
    margin-left: 360px;
  }
}
```

#### Reduce Animation Complexity on Mobile

```typescript
const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
};

// Usage
const LoadingIndicator = () => {
  const reducedMotion = useReducedMotion();

  return (
    <div className={reducedMotion ? 'spinner-static' : 'spinner-animated'}>
      Loading...
    </div>
  );
};
```

### Mobile-Specific Loading States

#### Responsive Skeleton Screens

```css
/* Desktop */
.skeleton-message {
  display: flex;
  gap: 16px;
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
}

/* Mobile */
@media (max-width: 768px) {
  .skeleton-message {
    gap: 8px;
  }

  .skeleton-avatar {
    width: 32px;
    height: 32px;
  }

  /* Reduce shimmer animation complexity */
  .skeleton-line {
    animation: shimmer-simple 2s infinite;
  }

  @keyframes shimmer-simple {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }
}
```

#### Touch-Friendly Cancel Button

```css
.cancel-button {
  /* Minimum 44x44px touch target (iOS HIG) */
  min-width: 44px;
  min-height: 44px;
  padding: 12px 24px;

  /* Prevent accidental double-tap zoom */
  touch-action: manipulation;

  /* Larger tap area on mobile */
  @media (max-width: 768px) {
    padding: 16px 32px;
  }
}
```

### Offline/Network Error States

```tsx
const NetworkAwareChat = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkError, setNetworkError] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkError(false);
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const sendMessage = async (message: string) => {
    if (!isOnline) {
      setNetworkError(true);
      return;
    }

    try {
      // Send message...
    } catch (error) {
      if (error.message.includes("network")) {
        setNetworkError(true);
      }
    }
  };

  return (
    <div>
      {!isOnline && (
        <div className="offline-banner">
          📡 You're offline. Messages will be sent when connection is restored.
        </div>
      )}

      {networkError && (
        <div className="error-banner">
          ⚠️ Network error. Please check your connection and try again.
        </div>
      )}
    </div>
  );
};
```

### Performance Monitoring

```typescript
const usePerformanceMonitoring = () => {
  useEffect(() => {
    // Monitor Time To First Token
    const measureTTFT = (startTime: number) => {
      const ttft = performance.now() - startTime;
      console.log(`TTFT: ${ttft}ms`);

      // Send to analytics
      if (typeof window !== "undefined" && window.gtag) {
        window.gtag("event", "ai_ttft", {
          value: ttft,
          event_category: "performance",
        });
      }
    };

    // Monitor battery status (if available)
    if ("getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        console.log(`Battery level: ${battery.level * 100}%`);
        console.log(`Charging: ${battery.charging}`);

        // Reduce animation complexity if battery is low
        if (battery.level < 0.2 && !battery.charging) {
          document.body.classList.add("low-battery-mode");
        }
      });
    }
  }, []);
};
```

---

## Real-World Examples

### ChatGPT Patterns

**Loading states**:

1. **Initial load**: Skeleton screen for message bubble
2. **Streaming**: Token-by-token display with blinking cursor
3. **Progress**: "Thinking..." indicator before first token
4. **Cancellation**: Stop button appears during generation

**Key features**:

- Fast TTFT (< 500ms)
- Smooth token rendering
- Clear stop affordance
- Regenerate option

### Claude Patterns

**Loading states**:

1. **Live progress updates**: "Contemplating, stand by...", "A bit longer, thanks for your patience..."
2. **Streaming**: Word-by-word display
3. **Transparency**: Shows when processing is taking longer than expected

**Key features**:

- Contextual status messages
- Progressive disclosure
- Clear communication about delays

### Perplexity Patterns

**Loading states**:

1. **Progressive disclosure**: Shows follow-up questions one at a time
2. **Quick answers**: Displays basic answer while gathering sources
3. **Source loading**: Shows sources being fetched in real-time

**Key features**:

- Multi-stage loading (quick answer → detailed answer → sources)
- Inline citations appear as they're found
- Clear visual hierarchy

---

## Best Practices Summary

### Do's ✅

1. **Use streaming** for all AI responses
2. **Target TTFT < 500ms** for instant feel
3. **Show skeleton screens** for structured content
4. **Provide cancel affordance** during generation
5. **Use GPU-accelerated animations** (`transform`, `opacity`)
6. **Buffer tokens** for smooth rendering (50ms intervals)
7. **Show contextual progress** (stages, time estimates)
8. **Handle offline/error states** gracefully
9. **Respect `prefers-reduced-motion`**
10. **Monitor performance** (TTFT, battery level)

### Don'ts ❌

1. **Don't use spinners** for full-page loads (use skeleton screens)
2. **Don't render every token** immediately (causes jitter)
3. **Don't forget cancel buttons** for long operations
4. **Don't animate layout properties** (`width`, `height`, `margin`)
5. **Don't ignore mobile battery** impact
6. **Don't skip error states** (timeout, network, offline)
7. **Don't use progress bars** for indeterminate tasks
8. **Don't block UI** during long operations
9. **Don't forget accessibility** (ARIA labels, keyboard navigation)
10. **Don't skip loading states** for < 1s operations (feels glitchy)

---

## Additional Resources

### Libraries

- **Vercel AI SDK**: https://sdk.vercel.ai/docs
- **react-use-websocket**: https://github.com/robtaussig/react-use-websocket
- **Server-Sent Events**: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

### Articles

- **Streaming AI Responses**: https://www.aiuxplayground.com/pattern/streaming
- **Skeleton Screens 101**: https://www.nngroup.com/articles/skeleton-screens/
- **CSS GPU Animation**: https://smashingmagazine.com/2016/12/gpu-animation-doing-it-right/
- **First Token Latency**: https://www.codeant.ai/blogs/ai-first-token-latency

### Design Systems

- **AWS Cloudscape GenAI Patterns**: https://cloudscape.design/patterns/genai/
- **Primer Loading Patterns**: https://primer.style/ui-patterns/loading/

---

## Conclusion

Effective loading states for long-running AI tasks require:

1. **Immediate feedback** (TTFT < 500ms)
2. **Streaming responses** (token-by-token display)
3. **Clear progress indicators** (skeleton screens, stage indicators)
4. **User control** (cancellation, timeout handling)
5. **Mobile optimization** (GPU acceleration, battery awareness)
6. **Graceful degradation** (offline, error, timeout states)

By following these patterns and examples, you can create AI interfaces that feel fast, responsive, and trustworthy—even when tasks take several minutes to complete.
