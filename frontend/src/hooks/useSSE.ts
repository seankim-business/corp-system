import { useState, useEffect, useRef, useCallback } from 'react';

interface SSEOptions {
  events: string[];
  onMessage: (event: string, data: unknown) => void;
  onError?: (error: Event) => void;
  onConnected?: () => void;
}

export function useSSE(options: SSEOptions) {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();

    const apiUrl = import.meta.env.VITE_API_URL || '';
    const url = `${apiUrl}/api/events`;

    const eventSource = new EventSource(url, { withCredentials: true });
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = (e) => {
      setConnected(false);
      options.onError?.(e);
      if (reconnectAttempts.current < 5) {
        setReconnecting(true);
        const delay = 1000 * Math.pow(2, reconnectAttempts.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, Math.min(delay, 30000));
      }
    };

    eventSource.addEventListener('connected', () => options.onConnected?.());

    options.events.forEach(event => {
      eventSource.addEventListener(event, (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          options.onMessage(event, data);
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      });
    });
  }, [options]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, [connect]);

  return { connected, reconnecting };
}
