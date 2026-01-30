import crypto from "crypto";
import { Transform } from "stream";
import { Request, Response } from "express";
import { redis } from "../db/redis";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionStatus = "active" | "idle" | "closing" | "closed";

interface SessionState {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  requestCount: number;
  status: SessionStatus;
}

interface TransportConfig {
  /** Maximum time (ms) to wait for a response before timing out. */
  timeoutMs: number;
  /** Maximum number of concurrent sessions. */
  maxSessions: number;
  /** Interval (ms) between keep-alive heartbeat pings. */
  heartbeatIntervalMs: number;
}

interface QueuedRequest {
  id: string;
  payload: unknown;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: NodeJS.Timeout;
  enqueuedAt: number;
}

interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  idleSessions: number;
  closingSessions: number;
  totalRequests: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: TransportConfig = {
  timeoutMs: 30_000,
  maxSessions: 100,
  heartbeatIntervalMs: 15_000,
};

const REDIS_SESSION_PREFIX = "mcp-transport:session";
const REDIS_SESSION_TTL_SECONDS = 3600; // 1 hour

// ---------------------------------------------------------------------------
// StreamableHTTPTransport — one per client connection
// ---------------------------------------------------------------------------

export class StreamableHTTPTransport {
  readonly sessionId: string;
  private state: SessionState;
  private requestQueue: Map<string, QueuedRequest> = new Map();
  private responseStream: Transform | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private config: TransportConfig;

  constructor(sessionId: string, config: TransportConfig) {
    this.sessionId = sessionId;
    this.config = config;

    const now = new Date();
    this.state = {
      id: sessionId,
      createdAt: now,
      lastActivity: now,
      requestCount: 0,
      status: "active",
    };
  }

  // ---- public API ---------------------------------------------------------

  /**
   * Handle an inbound request from the client.
   *
   * The caller provides a `handler` callback that receives the parsed payload
   * and returns a result (or throws). The transport takes care of queuing,
   * timeout, and bookkeeping.
   */
  async handleRequest(
    payload: unknown,
    handler: (payload: unknown) => Promise<unknown>,
  ): Promise<unknown> {
    if (this.state.status === "closed" || this.state.status === "closing") {
      throw new Error(`Session ${this.sessionId} is ${this.state.status}`);
    }

    this.touch();
    this.state.requestCount += 1;

    const requestId = crypto.randomUUID();

    return new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const queued = this.requestQueue.get(requestId);
        if (queued) {
          this.requestQueue.delete(requestId);
          queued.reject(
            new Error(
              `Request ${requestId} timed out after ${this.config.timeoutMs}ms`,
            ),
          );
        }
      }, this.config.timeoutMs);

      const queued: QueuedRequest = {
        id: requestId,
        payload,
        resolve,
        reject,
        timeoutId,
        enqueuedAt: Date.now(),
      };

      this.requestQueue.set(requestId, queued);

      // Execute the handler immediately (non-blocking queue bookkeeping).
      handler(payload)
        .then((result) => {
          const entry = this.requestQueue.get(requestId);
          if (entry) {
            clearTimeout(entry.timeoutId);
            this.requestQueue.delete(requestId);
            entry.resolve(result);
          }
        })
        .catch((err: unknown) => {
          const entry = this.requestQueue.get(requestId);
          if (entry) {
            clearTimeout(entry.timeoutId);
            this.requestQueue.delete(requestId);
            entry.reject(
              err instanceof Error ? err : new Error(String(err)),
            );
          }
        });
    });
  }

  /**
   * Begin streaming responses to the client over an Express `Response` object.
   *
   * Sets appropriate headers (SSE-style) and starts a heartbeat. The returned
   * `Transform` stream can be written to at any point; data is flushed to the
   * client immediately.
   */
  streamResponse(res: Response): Transform {
    if (this.state.status === "closed" || this.state.status === "closing") {
      throw new Error(`Session ${this.sessionId} is ${this.state.status}`);
    }

    this.touch();

    // Close any prior stream for this transport.
    this.stopStream();

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-MCP-Session-Id": this.sessionId,
    });

    const transform = new Transform({
      objectMode: true,
      transform(chunk, _encoding, callback) {
        const data =
          typeof chunk === "string" ? chunk : JSON.stringify(chunk);
        callback(null, `data: ${data}\n\n`);
      },
    });

    transform.pipe(res);
    this.responseStream = transform;

    // Heartbeat keeps the connection alive.
    this.heartbeatTimer = setInterval(() => {
      if (this.responseStream && !this.responseStream.destroyed) {
        this.responseStream.write(": heartbeat\n\n");
        this.touch();
      }
    }, this.config.heartbeatIntervalMs);
    this.heartbeatTimer.unref?.();

    // Clean up when the client disconnects.
    res.on("close", () => {
      this.stopStream();
    });

    logger.debug("MCP transport stream opened", { sessionId: this.sessionId });

    return transform;
  }

  /**
   * Push data to the active response stream (if any).
   * Returns `true` if the write succeeded, `false` otherwise.
   */
  pushToStream(data: unknown): boolean {
    if (!this.responseStream || this.responseStream.destroyed) {
      return false;
    }

    this.touch();
    this.responseStream.write(data);
    return true;
  }

  /**
   * Gracefully close the transport.
   */
  async close(): Promise<void> {
    if (this.state.status === "closed") {
      return;
    }

    this.state.status = "closing";
    this.stopStream();
    this.drainRequestQueue();
    this.state.status = "closed";

    await redis.del(`${REDIS_SESSION_PREFIX}:${this.sessionId}`);

    logger.debug("MCP transport closed", { sessionId: this.sessionId });
  }

  getState(): Readonly<SessionState> {
    return { ...this.state };
  }

  // ---- internal helpers ---------------------------------------------------

  private touch(): void {
    this.state.lastActivity = new Date();
    this.state.status =
      this.state.status === "active" || this.state.status === "idle"
        ? "active"
        : this.state.status;
  }

  private stopStream(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.responseStream && !this.responseStream.destroyed) {
      this.responseStream.end();
    }
    this.responseStream = null;
  }

  private drainRequestQueue(): void {
    for (const [id, queued] of this.requestQueue) {
      clearTimeout(queued.timeoutId);
      queued.reject(new Error(`Session ${this.sessionId} is closing`));
      this.requestQueue.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// MCPTransportManager — singleton managing all sessions
// ---------------------------------------------------------------------------

export class MCPTransportManager {
  private sessions: Map<string, StreamableHTTPTransport> = new Map();
  private config: TransportConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<TransportConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupLoop();
  }

  // ---- public API ---------------------------------------------------------

  /**
   * Create a new transport session and return its ID.
   */
  async createSession(): Promise<string> {
    if (this.sessions.size >= this.config.maxSessions) {
      // Attempt to evict the oldest idle session before refusing.
      const evicted = this.evictIdleSession();
      if (!evicted) {
        throw new Error(
          `Maximum session limit reached (${this.config.maxSessions})`,
        );
      }
    }

    const sessionId = crypto.randomUUID();
    const transport = new StreamableHTTPTransport(sessionId, this.config);
    this.sessions.set(sessionId, transport);

    // Persist lightweight state in Redis so other processes can discover it.
    await redis.set(
      `${REDIS_SESSION_PREFIX}:${sessionId}`,
      JSON.stringify({
        id: sessionId,
        createdAt: new Date().toISOString(),
        status: "active",
      }),
      REDIS_SESSION_TTL_SECONDS,
    );

    logger.info("MCP transport session created", { sessionId });
    return sessionId;
  }

  /**
   * Close and remove an existing session.
   */
  async closeSession(sessionId: string): Promise<void> {
    const transport = this.sessions.get(sessionId);
    if (!transport) {
      logger.warn("Attempted to close non-existent MCP session", {
        sessionId,
      });
      return;
    }

    await transport.close();
    this.sessions.delete(sessionId);

    logger.info("MCP transport session closed", { sessionId });
  }

  /**
   * Route an inbound HTTP request to the appropriate session and invoke
   * the supplied handler.
   *
   * This method is designed to be used inside an Express route:
   *
   * ```ts
   * app.post("/mcp/:sessionId", async (req, res) => {
   *   const result = await mcpTransportManager.handleRequest(
   *     req.params.sessionId,
   *     req.body,
   *     async (payload) => { ... },
   *   );
   *   res.json(result);
   * });
   * ```
   */
  async handleRequest(
    sessionId: string,
    payload: unknown,
    handler: (payload: unknown) => Promise<unknown>,
  ): Promise<unknown> {
    const transport = this.getTransportOrThrow(sessionId);

    // Refresh Redis TTL on activity.
    await redis.expire(
      `${REDIS_SESSION_PREFIX}:${sessionId}`,
      REDIS_SESSION_TTL_SECONDS,
    );

    return transport.handleRequest(payload, handler);
  }

  /**
   * Begin streaming responses for the given session.
   *
   * ```ts
   * app.get("/mcp/:sessionId/stream", (req, res) => {
   *   mcpTransportManager.streamResponse(req.params.sessionId, res);
   * });
   * ```
   */
  streamResponse(sessionId: string, res: Response): Transform {
    const transport = this.getTransportOrThrow(sessionId);
    return transport.streamResponse(res);
  }

  /**
   * Push data to a session's active stream.
   */
  pushToStream(sessionId: string, data: unknown): boolean {
    const transport = this.sessions.get(sessionId);
    if (!transport) {
      return false;
    }
    return transport.pushToStream(data);
  }

  /**
   * Return the IDs of all active sessions.
   */
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Aggregate statistics across all managed sessions.
   */
  getSessionStats(): SessionStats {
    let activeSessions = 0;
    let idleSessions = 0;
    let closingSessions = 0;
    let totalRequests = 0;

    for (const transport of this.sessions.values()) {
      const state = transport.getState();
      totalRequests += state.requestCount;

      switch (state.status) {
        case "active":
          activeSessions += 1;
          break;
        case "idle":
          idleSessions += 1;
          break;
        case "closing":
          closingSessions += 1;
          break;
        default:
          break;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      idleSessions,
      closingSessions,
      totalRequests,
    };
  }

  /**
   * Express-compatible middleware that extracts the session ID from the
   * `X-MCP-Session-Id` header and attaches the transport to `req`.
   */
  middleware() {
    return (req: Request, _res: Response, next: () => void): void => {
      const sessionId = req.headers["x-mcp-session-id"] as string | undefined;
      if (sessionId) {
        const transport = this.sessions.get(sessionId);
        if (transport) {
          // Attach for downstream handlers.
          (req as unknown as Record<string, unknown>)["mcpTransport"] = transport;
          (req as unknown as Record<string, unknown>)["mcpSessionId"] = sessionId;
        }
      }
      next();
    };
  }

  /**
   * Gracefully shut down the manager, closing every session.
   */
  async shutdown(): Promise<void> {
    logger.info("MCP transport manager shutting down", {
      sessions: this.sessions.size,
    });

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const closePromises: Promise<void>[] = [];
    for (const [sessionId, transport] of this.sessions) {
      closePromises.push(
        transport.close().then(() => {
          this.sessions.delete(sessionId);
        }),
      );
    }

    await Promise.all(closePromises);
    logger.info("MCP transport manager shutdown complete");
  }

  // ---- internal helpers ---------------------------------------------------

  private getTransportOrThrow(sessionId: string): StreamableHTTPTransport {
    const transport = this.sessions.get(sessionId);
    if (!transport) {
      throw new Error(`MCP session not found: ${sessionId}`);
    }
    return transport;
  }

  /**
   * Evict the single oldest idle session.  Returns `true` if a session was
   * evicted, `false` otherwise.
   */
  private evictIdleSession(): boolean {
    let oldest: { id: string; lastActivity: Date } | null = null;

    for (const [id, transport] of this.sessions) {
      const state = transport.getState();
      if (
        state.status === "idle" ||
        state.status === "active"
      ) {
        if (!oldest || state.lastActivity < oldest.lastActivity) {
          oldest = { id, lastActivity: state.lastActivity };
        }
      }
    }

    if (!oldest) {
      return false;
    }

    const transport = this.sessions.get(oldest.id);
    if (transport) {
      // Fire-and-forget close; the entry is removed synchronously below.
      transport.close().catch((err: unknown) => {
        logger.error("Failed to close evicted MCP session", {
          sessionId: oldest!.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    this.sessions.delete(oldest.id);
    logger.info("Evicted idle MCP session", { sessionId: oldest.id });
    return true;
  }

  /**
   * Periodic cleanup: mark stale sessions idle and close truly expired ones.
   */
  private startCleanupLoop(): void {
    const interval = this.config.heartbeatIntervalMs * 4; // ~60s at default

    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const staleThresholdMs = this.config.timeoutMs * 2;

      for (const [sessionId, transport] of this.sessions) {
        const state = transport.getState();
        const idleMs = now - state.lastActivity.getTime();

        if (state.status === "closed") {
          this.sessions.delete(sessionId);
          continue;
        }

        if (idleMs > staleThresholdMs) {
          logger.info("Closing stale MCP session", {
            sessionId,
            idleMs,
            staleThresholdMs,
          });
          transport.close().catch((err: unknown) => {
            logger.error("Error closing stale MCP session", {
              sessionId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
          this.sessions.delete(sessionId);
        } else if (
          idleMs > this.config.timeoutMs &&
          state.status === "active"
        ) {
          // Demote to idle — the next cleanup pass may evict it.
          (transport as any).state.status = "idle";
        }
      }
    }, interval);

    this.cleanupTimer.unref?.();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const mcpTransportManager = new MCPTransportManager();
