import { useEffect, useRef, useState, useCallback } from "react";

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

interface UseSSEOptions {
  url?: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  onEvent?: (event: SSEEvent) => void;
}

interface UseSSEReturn {
  isConnected: boolean;
  lastEvent: SSEEvent | null;
  error: string | null;
  reconnect: () => void;
}

const EVENT_TYPES = [
  "execution:started",
  "execution:progress",
  "execution:completed",
  "execution:failed",
  "workflow:updated",
  "notification",
] as const;

export function useSSE(options: UseSSEOptions = {}): UseSSEReturn {
  const {
    url = "/api/events",
    reconnectDelay = 3000,
    maxReconnectAttempts = 10,
    onEvent,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const eventListenersRef = useRef<Array<{ type: string; handler: EventListener }>>([]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const cleanupEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventListenersRef.current.forEach(({ type, handler }) => {
        eventSourceRef.current?.removeEventListener(type, handler);
      });
      eventListenersRef.current = [];
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanupEventSource();

    const baseUrl = import.meta.env.VITE_API_BASE_URL || "https://auth.nubabel.com";
    const fullUrl = `${baseUrl}${url}`;

    try {
      const eventSource = new EventSource(fullUrl, { withCredentials: true });
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        cleanupEventSource();

        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError("Failed to connect to server. Please refresh the page.");
        }
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const sseEvent: SSEEvent = {
            type: data.type || "message",
            data: data.data || data,
            timestamp: Date.now(),
          };
          setLastEvent(sseEvent);
          onEventRef.current?.(sseEvent);
        } catch {
          if (event.data !== "heartbeat") {
            console.warn("Failed to parse SSE message:", event.data);
          }
        }
      };

      EVENT_TYPES.forEach((eventType) => {
        const handler = (event: Event) => {
          try {
            const messageEvent = event as MessageEvent;
            const data = JSON.parse(messageEvent.data);
            const sseEvent: SSEEvent = {
              type: eventType,
              data,
              timestamp: Date.now(),
            };
            setLastEvent(sseEvent);
            onEventRef.current?.(sseEvent);
          } catch (e) {
            console.warn(`Failed to parse ${eventType} event:`, e);
          }
        };
        eventSource.addEventListener(eventType, handler);
        eventListenersRef.current.push({ type: eventType, handler });
      });
    } catch (e) {
      setError("Failed to create EventSource connection");
      console.error("SSE connection error:", e);
    }
  }, [url, reconnectDelay, maxReconnectAttempts, cleanupEventSource]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return cleanupEventSource;
  }, [connect, cleanupEventSource]);

  return { isConnected, lastEvent, error, reconnect };
}

export default useSSE;
