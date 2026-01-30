import { IncomingMessage, ServerResponse } from "http";
import crypto from "crypto";
import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 message types
// ---------------------------------------------------------------------------

export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface JSONRPCNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface JSONRPCResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JSONRPCMessage = JSONRPCRequest | JSONRPCResponse | JSONRPCNotification;

// ---------------------------------------------------------------------------
// Transport options
// ---------------------------------------------------------------------------

export interface TransportOptions {
  /** Base path for the endpoint (e.g. "/mcp"). */
  endpoint?: string;

  /**
   * If true the transport will require a valid session ID header on every
   * request after the initial handshake. Defaults to true.
   */
  sessionManagement?: boolean;

  /** Name of the HTTP header that carries the session ID. */
  sessionHeader?: string;

  /**
   * How long (ms) an SSE connection may remain idle before the server
   * closes it. Defaults to 5 minutes.
   */
  sseKeepAliveMs?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface SSEConnection {
  res: ServerResponse;
  lastActivity: number;
}

/** Simple guard to tell requests from notifications (requests carry an `id`). */
function isRequest(msg: JSONRPCMessage): msg is JSONRPCRequest {
  return "id" in msg && "method" in msg;
}

function isNotification(msg: JSONRPCMessage): msg is JSONRPCNotification {
  return !("id" in msg) && "method" in msg;
}

// ---------------------------------------------------------------------------
// StreamableHTTPServerTransport
// ---------------------------------------------------------------------------

/**
 * MCP transport that exposes a JSON-RPC 2.0 interface over plain HTTP with
 * optional SSE streaming for server-initiated messages.
 *
 * Supported HTTP methods
 * - **POST**   – receive JSON-RPC requests / notifications, reply with JSON
 *                or SSE depending on content negotiation.
 * - **GET**    – open an SSE stream for server-initiated push messages.
 * - **DELETE** – close a session explicitly.
 *
 * Sessions are tracked via a configurable header (default `mcp-session-id`).
 */
export class StreamableHTTPServerTransport {
  // ---- public callbacks (set by the MCP server layer) --------------------
  onMessage: ((message: JSONRPCMessage) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  // ---- private state -----------------------------------------------------
  private readonly _endpoint: string;
  private readonly _sessionManagement: boolean;
  private readonly _sessionHeader: string;
  private readonly _sseKeepAliveMs: number;

  /** Active sessions. Value is the set of open SSE connections for that session. */
  private readonly _sessions: Map<string, Set<SSEConnection>> = new Map();

  /**
   * Pending responses: when we receive a JSON-RPC request we may not be able
   * to respond synchronously (the upper layer calls `send()` later). We park
   * the HTTP response object here keyed by `requestId`.
   */
  private readonly _pendingResponses: Map<
    string | number,
    { res: ServerResponse; sessionId: string; isSSE: boolean }
  > = new Map();

  /** Keep-alive interval handle. */
  private _keepAliveInterval: ReturnType<typeof setInterval> | null = null;

  private _closed = false;

  constructor(options: TransportOptions = {}) {
    this._endpoint = options.endpoint ?? "/mcp";
    this._sessionManagement = options.sessionManagement ?? true;
    this._sessionHeader = options.sessionHeader ?? "mcp-session-id";
    this._sseKeepAliveMs = options.sseKeepAliveMs ?? 5 * 60 * 1000;

    // Start the keep-alive reaper that closes stale SSE connections.
    this._keepAliveInterval = setInterval(() => this._reapStaleConnections(), this._sseKeepAliveMs);
    // Allow the process to exit even if the interval is still running.
    if (this._keepAliveInterval.unref) {
      this._keepAliveInterval.unref();
    }

    logger.info("StreamableHTTPServerTransport created", {
      endpoint: this._endpoint,
      sessionManagement: this._sessionManagement,
      sessionHeader: this._sessionHeader,
    });
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Main entry point: route an incoming HTTP request to the appropriate
   * handler based on its method.
   */
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this._closed) {
      this._sendHTTPError(res, 503, "Transport is closed");
      return;
    }

    const method = (req.method ?? "").toUpperCase();

    try {
      switch (method) {
        case "POST":
          await this._handlePost(req, res);
          break;
        case "GET":
          this._handleGet(req, res);
          break;
        case "DELETE":
          this._handleDelete(req, res);
          break;
        default:
          res.setHeader("Allow", "GET, POST, DELETE");
          this._sendHTTPError(res, 405, `Method ${method} not allowed`);
          break;
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Unhandled error in handleRequest", { method, error: error.message }, error);
      this.onError?.(error);
      if (!res.headersSent) {
        this._sendHTTPError(res, 500, "Internal server error");
      }
    }
  }

  /**
   * Send a JSON-RPC message (response, notification, etc.) back to the
   * appropriate client connection.
   *
   * For responses to requests the transport looks up the originating HTTP
   * response object by `id`. For server-initiated notifications the message
   * is broadcast to all SSE connections of every active session.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this._closed) {
      throw new Error("Transport is closed");
    }

    // If this is a response to a pending request, send it directly.
    if ("id" in message && message.id !== null && !("method" in message)) {
      const response = message as JSONRPCResponse;
      const id = response.id as string | number;
      const pending = this._pendingResponses.get(id);
      if (pending) {
        this._pendingResponses.delete(id);
        if (pending.isSSE) {
          this._writeSSEEvent(pending.res, "message", response);
          // For SSE responses we keep the connection open; the client will
          // consume the event and may continue listening.
        } else {
          this._sendJSON(pending.res, 200, response);
        }
        logger.debug("Sent JSON-RPC response", { id: response.id });
        return;
      }

      // No pending entry – the caller may have timed out or the connection
      // was already closed. Log and discard.
      logger.warn("No pending response found for JSON-RPC id", { id: response.id });
      return;
    }

    // Otherwise treat the message as a server-initiated notification and
    // broadcast it over all active SSE connections.
    this._broadcastSSE(message);
  }

  /**
   * Gracefully shut down the transport: close all SSE connections, reject
   * pending requests, and clear timers.
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    logger.info("Closing StreamableHTTPServerTransport");

    // Stop the keep-alive reaper.
    if (this._keepAliveInterval) {
      clearInterval(this._keepAliveInterval);
      this._keepAliveInterval = null;
    }

    // Close all SSE connections.
    for (const [sessionId, connections] of this._sessions) {
      for (const conn of connections) {
        try {
          conn.res.end();
        } catch {
          // Connection may already be dead; ignore.
        }
      }
      connections.clear();
      logger.debug("Closed SSE connections for session", { sessionId });
    }
    this._sessions.clear();

    // Reject all pending responses.
    for (const [id, pending] of this._pendingResponses) {
      try {
        const errorResponse: JSONRPCResponse = {
          jsonrpc: "2.0",
          id,
          error: { code: -32000, message: "Transport closed" },
        };
        if (!pending.res.headersSent) {
          this._sendJSON(pending.res, 503, errorResponse);
        }
      } catch {
        // Best effort.
      }
    }
    this._pendingResponses.clear();

    this.onClose?.();
    logger.info("StreamableHTTPServerTransport closed");
  }

  // -----------------------------------------------------------------------
  // HTTP method handlers
  // -----------------------------------------------------------------------

  /**
   * POST handler: receive a JSON-RPC request or batch of requests.
   */
  private async _handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Read the body.
    const body = await this._readBody(req);
    if (body === null) {
      this._sendHTTPError(res, 400, "Could not read request body");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      this._sendJSONRPCError(res, null, -32700, "Parse error");
      return;
    }

    // Session validation: on the very first POST (no session header) we
    // create a new session. Subsequent requests must carry a valid session.
    let sessionId = this._getSessionId(req);
    const isNewSession = !sessionId;

    if (this._sessionManagement) {
      if (sessionId && !this._sessions.has(sessionId)) {
        this._sendHTTPError(res, 404, "Session not found");
        return;
      }
      if (!sessionId) {
        sessionId = this._createSession();
      }
    } else {
      // Without session management we use a fixed synthetic session.
      sessionId = sessionId ?? "no-session";
    }

    // Determine if the client accepts SSE (event-stream) responses.
    const acceptsSSE = this._clientAcceptsSSE(req);

    // Handle batch vs single.
    const messages = Array.isArray(parsed) ? parsed : [parsed];

    if (messages.length === 0) {
      this._sendJSONRPCError(res, null, -32600, "Invalid Request: empty batch");
      return;
    }

    // Validate each message minimally.
    for (const msg of messages) {
      if (!this._isValidJSONRPC(msg)) {
        this._sendJSONRPCError(res, null, -32600, "Invalid Request");
        return;
      }
    }

    // For new sessions set the session header in the response.
    if (isNewSession && this._sessionManagement) {
      res.setHeader(this._sessionHeader, sessionId);
    }

    // For SSE responses: open the stream now.
    if (acceptsSSE) {
      this._initSSEResponse(res);
    }

    // Register pending responses for any *requests* (not notifications).
    const requests = (messages as JSONRPCMessage[]).filter(isRequest);
    const notifications = (messages as JSONRPCMessage[]).filter(isNotification);

    for (const request of requests) {
      this._pendingResponses.set(request.id, { res, sessionId, isSSE: acceptsSSE });
    }

    // Dispatch all messages to the upper layer.
    for (const msg of messages as JSONRPCMessage[]) {
      try {
        this.onMessage?.(msg);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error dispatching JSON-RPC message", { error: error.message }, error);
        this.onError?.(error);
      }
    }

    // Notifications don't get a response. If there are NO requests we can
    // end the response immediately (unless it's SSE, which stays open).
    if (requests.length === 0 && notifications.length > 0) {
      if (acceptsSSE) {
        // Write an empty "accepted" event then close.
        this._writeSSEEvent(res, "message", { jsonrpc: "2.0", result: "accepted" });
        res.end();
      } else {
        res.writeHead(202);
        res.end();
      }
    }

    logger.debug("Processed POST", {
      sessionId,
      requests: requests.length,
      notifications: notifications.length,
      sse: acceptsSSE,
    });
  }

  /**
   * GET handler: open a long-lived SSE stream for server push messages.
   * The client must provide a valid session ID.
   */
  private _handleGet(req: IncomingMessage, res: ServerResponse): void {
    const sessionId = this._getSessionId(req);

    if (this._sessionManagement) {
      if (!sessionId) {
        this._sendHTTPError(res, 400, "Missing session ID");
        return;
      }
      if (!this._sessions.has(sessionId)) {
        this._sendHTTPError(res, 404, "Session not found");
        return;
      }
    }

    const resolvedSession = sessionId ?? "no-session";

    this._initSSEResponse(res);

    const conn: SSEConnection = { res, lastActivity: Date.now() };
    const connSet = this._sessions.get(resolvedSession);
    if (connSet) {
      connSet.add(conn);
    }

    // When the client disconnects, clean up.
    req.on("close", () => {
      connSet?.delete(conn);
      logger.debug("SSE client disconnected", { sessionId: resolvedSession });
    });

    // Send an initial comment to flush proxy buffers.
    res.write(":ok\n\n");

    logger.info("SSE stream opened", { sessionId: resolvedSession });
  }

  /**
   * DELETE handler: explicitly close and remove a session.
   */
  private _handleDelete(req: IncomingMessage, res: ServerResponse): void {
    const sessionId = this._getSessionId(req);

    if (!sessionId) {
      this._sendHTTPError(res, 400, "Missing session ID");
      return;
    }

    const connections = this._sessions.get(sessionId);
    if (!connections) {
      this._sendHTTPError(res, 404, "Session not found");
      return;
    }

    // Close all SSE connections for the session.
    for (const conn of connections) {
      try {
        conn.res.end();
      } catch {
        // Ignore.
      }
    }
    connections.clear();
    this._sessions.delete(sessionId);

    // Also clean up any pending responses that belong to this session.
    for (const [id, pending] of this._pendingResponses) {
      if (pending.sessionId === sessionId) {
        this._pendingResponses.delete(id);
        try {
          if (!pending.res.headersSent) {
            pending.res.writeHead(410);
            pending.res.end();
          }
        } catch {
          // Best effort.
        }
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));

    logger.info("Session deleted", { sessionId });
  }

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  private _createSession(): string {
    const sessionId = crypto.randomUUID();
    this._sessions.set(sessionId, new Set());
    logger.info("Session created", { sessionId });
    return sessionId;
  }

  private _getSessionId(req: IncomingMessage): string | undefined {
    const header = req.headers[this._sessionHeader.toLowerCase()];
    if (typeof header === "string" && header.length > 0) {
      return header;
    }
    return undefined;
  }

  // -----------------------------------------------------------------------
  // SSE helpers
  // -----------------------------------------------------------------------

  private _initSSEResponse(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering.
    });
    res.flushHeaders();
  }

  private _writeSSEEvent(res: ServerResponse, event: string, data: unknown): void {
    try {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    } catch (err) {
      logger.debug("Failed to write SSE event", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Broadcast a JSON-RPC message (typically a notification) to all SSE
   * connections across every session.
   */
  private _broadcastSSE(message: JSONRPCMessage): void {
    let sent = 0;
    for (const [_sessionId, connections] of this._sessions) {
      for (const conn of connections) {
        this._writeSSEEvent(conn.res, "message", message);
        conn.lastActivity = Date.now();
        sent++;
      }
    }
    if (sent > 0) {
      logger.debug("Broadcast SSE message", { recipients: sent });
    }
  }

  /**
   * Close SSE connections that have been idle longer than `_sseKeepAliveMs`.
   */
  private _reapStaleConnections(): void {
    const now = Date.now();
    for (const [sessionId, connections] of this._sessions) {
      for (const conn of connections) {
        if (now - conn.lastActivity > this._sseKeepAliveMs) {
          try {
            conn.res.end();
          } catch {
            // Already dead.
          }
          connections.delete(conn);
          logger.debug("Reaped stale SSE connection", { sessionId });
        }
      }
    }
  }

  private _clientAcceptsSSE(req: IncomingMessage): boolean {
    const accept = req.headers["accept"] ?? "";
    return accept.includes("text/event-stream");
  }

  // -----------------------------------------------------------------------
  // HTTP response helpers
  // -----------------------------------------------------------------------

  private _sendJSON(res: ServerResponse, statusCode: number, body: unknown): void {
    const payload = JSON.stringify(body);
    if (!res.headersSent) {
      res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      });
    }
    res.end(payload);
  }

  private _sendHTTPError(res: ServerResponse, statusCode: number, message: string): void {
    this._sendJSON(res, statusCode, { error: message });
  }

  private _sendJSONRPCError(
    res: ServerResponse,
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
  ): void {
    const errorResponse: JSONRPCResponse = {
      jsonrpc: "2.0",
      id,
      error: { code, message, ...(data !== undefined ? { data } : {}) },
    };
    this._sendJSON(res, 200, errorResponse);
  }

  // -----------------------------------------------------------------------
  // Body reading
  // -----------------------------------------------------------------------

  private _readBody(req: IncomingMessage): Promise<string | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const maxSize = 4 * 1024 * 1024; // 4 MiB

      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxSize) {
          resolve(null);
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      });

      req.on("error", (err) => {
        logger.warn("Error reading request body", { error: err.message });
        resolve(null);
      });
    });
  }

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  private _isValidJSONRPC(msg: unknown): msg is JSONRPCMessage {
    if (typeof msg !== "object" || msg === null) {
      return false;
    }
    const obj = msg as Record<string, unknown>;
    if (obj.jsonrpc !== "2.0") {
      return false;
    }
    // Must have either `method` (request/notification) or `id`+`result`/`error` (response).
    if (typeof obj.method === "string") {
      return true;
    }
    if ("id" in obj && ("result" in obj || "error" in obj)) {
      return true;
    }
    return false;
  }
}
