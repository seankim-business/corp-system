/**
 * Base MCP Server
 *
 * Abstract base class providing lifecycle management, tool registration,
 * health checks, request counting, error tracking, response time averaging,
 * concurrent request limiting, and timeout handling for MCP servers.
 */

import { logger } from "../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServerConfig {
  name: string;
  version: string;
  description: string;
  /** Maximum number of concurrent in-flight requests. Default: 10 */
  maxConcurrentRequests?: number;
  /** Per-request timeout in milliseconds. Default: 30 000 */
  requestTimeoutMs?: number;
  /** Interval between automatic health checks in milliseconds. Default: 60 000 */
  healthCheckIntervalMs?: number;
}

export interface MCPServerHealth {
  status: "healthy" | "degraded" | "unhealthy";
  lastCheckAt: Date;
  /** Milliseconds since the server was started. */
  uptime: number;
  requestCount: number;
  errorCount: number;
  avgResponseTimeMs: number;
}

export interface MCPToolContext {
  organizationId: string;
  userId?: string;
  connectionId?: string;
  /** Arbitrary metadata that subclasses may use. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_MAX_CONCURRENT_REQUESTS = 10;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 60_000;

/** Error rate threshold above which the server is considered degraded. */
const DEGRADED_ERROR_RATE_THRESHOLD = 0.1;
/** Error rate threshold above which the server is considered unhealthy. */
const UNHEALTHY_ERROR_RATE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// BaseMCPServer
// ---------------------------------------------------------------------------

export abstract class BaseMCPServer {
  // -----------------------------------------------------------------------
  // Global registry
  // -----------------------------------------------------------------------

  private static registry: Map<string, BaseMCPServer> = new Map();

  static getServer(name: string): BaseMCPServer | undefined {
    return BaseMCPServer.registry.get(name);
  }

  static getAllServers(): BaseMCPServer[] {
    return Array.from(BaseMCPServer.registry.values());
  }

  // -----------------------------------------------------------------------
  // Instance state
  // -----------------------------------------------------------------------

  protected readonly config: Readonly<Required<MCPServerConfig>>;

  private _started = false;
  private _startedAt: Date | null = null;
  private _healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _lastHealthCheck: Date = new Date();

  // Metrics
  private _requestCount = 0;
  private _errorCount = 0;
  private _totalResponseTimeMs = 0;

  // Semaphore for concurrent request limiting
  private _activeRequests = 0;
  private readonly _waitQueue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  constructor(config: MCPServerConfig) {
    this.config = Object.freeze({
      name: config.name,
      version: config.version,
      description: config.description,
      maxConcurrentRequests:
        config.maxConcurrentRequests ?? DEFAULT_MAX_CONCURRENT_REQUESTS,
      requestTimeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      healthCheckIntervalMs:
        config.healthCheckIntervalMs ?? DEFAULT_HEALTH_CHECK_INTERVAL_MS,
    });
  }

  // -----------------------------------------------------------------------
  // Abstract methods – implemented by subclasses
  // -----------------------------------------------------------------------

  /** Return the list of tools this server exposes. */
  abstract registerTools(): MCPToolDefinition[];

  /** Execute a specific tool by name. */
  abstract executeTool(
    toolName: string,
    input: unknown,
    context: MCPToolContext,
  ): Promise<unknown>;

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  async start(): Promise<void> {
    if (this._started) {
      logger.warn("MCP server already started", { server: this.config.name });
      return;
    }

    logger.info("Starting MCP server", {
      server: this.config.name,
      version: this.config.version,
    });

    // Register tools (validate that subclass provides at least one)
    const tools = this.registerTools();
    if (tools.length === 0) {
      logger.warn("MCP server registered zero tools", {
        server: this.config.name,
      });
    } else {
      logger.info("MCP server registered tools", {
        server: this.config.name,
        toolCount: tools.length,
        tools: tools.map((t) => t.name),
      });
    }

    this._started = true;
    this._startedAt = new Date();
    this._lastHealthCheck = new Date();

    // Register in the global registry
    BaseMCPServer.registry.set(this.config.name, this);

    // Start periodic health checks
    this._healthCheckTimer = setInterval(() => {
      this._performHealthCheck();
    }, this.config.healthCheckIntervalMs);

    // Prevent the timer from keeping the process alive
    if (
      this._healthCheckTimer &&
      typeof this._healthCheckTimer === "object" &&
      "unref" in this._healthCheckTimer
    ) {
      (this._healthCheckTimer as NodeJS.Timeout).unref();
    }

    logger.info("MCP server started", { server: this.config.name });
  }

  async stop(): Promise<void> {
    if (!this._started) {
      logger.warn("MCP server is not running", { server: this.config.name });
      return;
    }

    logger.info("Stopping MCP server", { server: this.config.name });

    // Stop health check timer
    if (this._healthCheckTimer !== null) {
      clearInterval(this._healthCheckTimer);
      this._healthCheckTimer = null;
    }

    // Reject any queued requests
    while (this._waitQueue.length > 0) {
      const waiter = this._waitQueue.shift();
      waiter?.reject(
        new Error(`MCP server ${this.config.name} is shutting down`),
      );
    }

    // Unregister from the global registry
    BaseMCPServer.registry.delete(this.config.name);

    this._started = false;

    logger.info("MCP server stopped", { server: this.config.name });
  }

  /** Whether the server has been started and not yet stopped. */
  get isRunning(): boolean {
    return this._started;
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  getHealth(): MCPServerHealth {
    const now = new Date();
    const uptime = this._startedAt
      ? now.getTime() - this._startedAt.getTime()
      : 0;
    const avgResponseTimeMs =
      this._requestCount > 0
        ? this._totalResponseTimeMs / this._requestCount
        : 0;

    const errorRate =
      this._requestCount > 0 ? this._errorCount / this._requestCount : 0;

    let status: MCPServerHealth["status"];
    if (!this._started) {
      status = "unhealthy";
    } else if (errorRate >= UNHEALTHY_ERROR_RATE_THRESHOLD) {
      status = "unhealthy";
    } else if (errorRate >= DEGRADED_ERROR_RATE_THRESHOLD) {
      status = "degraded";
    } else {
      status = "healthy";
    }

    return {
      status,
      lastCheckAt: this._lastHealthCheck,
      uptime,
      requestCount: this._requestCount,
      errorCount: this._errorCount,
      avgResponseTimeMs: Math.round(avgResponseTimeMs * 100) / 100,
    };
  }

  // -----------------------------------------------------------------------
  // Request execution with concurrency, timeout, and metrics
  // -----------------------------------------------------------------------

  /**
   * Execute a tool request with concurrency limiting, timeout enforcement,
   * and metric tracking. Callers should use this instead of calling
   * `executeTool` directly.
   */
  async handleRequest(
    toolName: string,
    input: unknown,
    context: MCPToolContext,
  ): Promise<unknown> {
    if (!this._started) {
      throw new Error(
        `MCP server ${this.config.name} is not running. Call start() first.`,
      );
    }

    // Wait for a concurrency slot
    await this._acquireSlot();

    const startTime = Date.now();

    try {
      const result = await this._executeWithTimeout(
        toolName,
        input,
        context,
        this.config.requestTimeoutMs,
      );

      this._recordSuccess(Date.now() - startTime);
      return result;
    } catch (error) {
      this._recordError(Date.now() - startTime);
      throw error;
    } finally {
      this._releaseSlot();
    }
  }

  // -----------------------------------------------------------------------
  // Concurrency semaphore
  // -----------------------------------------------------------------------

  private _acquireSlot(): Promise<void> {
    if (this._activeRequests < this.config.maxConcurrentRequests) {
      this._activeRequests++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this._waitQueue.push({ resolve, reject });
    });
  }

  private _releaseSlot(): void {
    if (this._waitQueue.length > 0) {
      const next = this._waitQueue.shift();
      // Keep _activeRequests the same – the slot transfers to the next waiter
      next?.resolve();
    } else {
      this._activeRequests--;
    }
  }

  // -----------------------------------------------------------------------
  // Timeout
  // -----------------------------------------------------------------------

  private _executeWithTimeout(
    toolName: string,
    input: unknown,
    context: MCPToolContext,
    timeoutMs: number,
  ): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `MCP tool "${toolName}" on server "${this.config.name}" timed out after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);

      this.executeTool(toolName, input, context)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  // -----------------------------------------------------------------------
  // Metrics
  // -----------------------------------------------------------------------

  private _recordSuccess(durationMs: number): void {
    this._requestCount++;
    this._totalResponseTimeMs += durationMs;
  }

  private _recordError(durationMs: number): void {
    this._requestCount++;
    this._errorCount++;
    this._totalResponseTimeMs += durationMs;
  }

  /** Reset all metric counters. Useful for testing or periodic resets. */
  protected resetMetrics(): void {
    this._requestCount = 0;
    this._errorCount = 0;
    this._totalResponseTimeMs = 0;
  }

  // -----------------------------------------------------------------------
  // Health check (periodic)
  // -----------------------------------------------------------------------

  private _performHealthCheck(): void {
    this._lastHealthCheck = new Date();
    const health = this.getHealth();

    if (health.status === "unhealthy") {
      logger.error("MCP server health check: unhealthy", {
        server: this.config.name,
        ...health,
      });
    } else if (health.status === "degraded") {
      logger.warn("MCP server health check: degraded", {
        server: this.config.name,
        ...health,
      });
    } else {
      logger.debug("MCP server health check: healthy", {
        server: this.config.name,
        requestCount: health.requestCount,
        avgResponseTimeMs: health.avgResponseTimeMs,
      });
    }
  }
}
