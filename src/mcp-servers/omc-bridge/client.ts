/**
 * OMC Bridge SSE Client
 *
 * Handles communication with the OMC runtime via Server-Sent Events.
 * Manages connection lifecycle, reconnection, and request/response correlation.
 */

import { EventEmitter } from "events";
import {
  OmcBridgeConfig,
  OmcToolCallRequest,
  OmcToolCallResponse,
  OmcHealthStatus,
  OmcConnectionState,
  PendingRequest,
  OmcSseEvent,
} from "./types";
import { loadOmcBridgeConfig, getEffectiveTimeout } from "./config";
import { getToolDefinition, getAllToolNames } from "./tools/registry";
import { logger } from "../../utils/logger";
import { getCircuitBreaker } from "../../utils/circuit-breaker";

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `omc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * OMC Bridge SSE Client
 *
 * Maintains a persistent connection to the OMC runtime and handles
 * bidirectional communication for tool execution.
 */
export class OmcBridgeClient extends EventEmitter {
  private config: OmcBridgeConfig;
  private state: OmcConnectionState = "disconnected";
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private abortController: AbortController | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number = Date.now();

  // Statistics
  private stats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    timedOutCalls: 0,
    totalResponseTimeMs: 0,
  };

  private circuitBreaker = getCircuitBreaker("omc-bridge", {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
  });

  constructor(config?: Partial<OmcBridgeConfig>) {
    super();
    const baseConfig = loadOmcBridgeConfig();
    this.config = { ...baseConfig, ...config };
  }

  /**
   * Get current connection state
   */
  getState(): OmcConnectionState {
    return this.state;
  }

  /**
   * Connect to OMC runtime
   */
  async connect(): Promise<void> {
    if (this.state === "connected" || this.state === "connecting") {
      logger.debug("OMC Bridge already connected or connecting");
      return;
    }

    this.setState("connecting");
    this.abortController = new AbortController();

    try {
      await this.establishConnection();
      this.setState("connected");
      this.startHealthCheck();
      this.emit("connected");

      logger.info("OMC Bridge connected", {
        url: this.config.omcRuntimeUrl,
        protocol: this.config.protocol,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to connect to OMC runtime", { error: message });
      this.setState("error");
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Disconnect from OMC runtime
   */
  async disconnect(): Promise<void> {
    logger.info("Disconnecting OMC Bridge");

    // Clear reconnect timer
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Clear health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Abort active connection
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Reject all pending requests
    const pendingEntries = Array.from(this.pendingRequests.entries());
    for (const [requestId, pending] of pendingEntries) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error("Client disconnected"));
      this.pendingRequests.delete(requestId);
    }

    this.setState("disconnected");
    this.emit("disconnected");
  }

  /**
   * Execute a tool call
   */
  async executeToolCall(request: Omit<OmcToolCallRequest, "requestId">): Promise<OmcToolCallResponse> {
    const requestId = generateRequestId();
    const fullRequest: OmcToolCallRequest = { ...request, requestId };

    // Get tool definition for timeout
    const toolDef = getToolDefinition(request.toolName);
    const timeoutMs = getEffectiveTimeout(
      toolDef?.defaultTimeoutMs ?? 30000,
      request.timeoutMs,
      this.config,
    );

    this.stats.totalCalls++;

    if (this.state !== "connected") {
      await this.connect();
    }

    return this.circuitBreaker.execute(async () => {
      return new Promise<OmcToolCallResponse>((resolve, reject) => {
        const startTime = Date.now();

        // Set up timeout
        const timeoutHandle = setTimeout(() => {
          this.pendingRequests.delete(requestId);
          this.stats.timedOutCalls++;

          logger.warn("OMC tool call timed out", {
            requestId,
            toolName: request.toolName,
            timeoutMs,
          });

          reject(new Error(`Tool call timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        // Store pending request
        this.pendingRequests.set(requestId, {
          requestId,
          toolName: request.toolName,
          startTime,
          timeoutMs,
          resolve: (response) => {
            clearTimeout(timeoutHandle);
            this.pendingRequests.delete(requestId);

            const durationMs = Date.now() - startTime;
            this.stats.totalResponseTimeMs += durationMs;

            if (response.status === "success") {
              this.stats.successfulCalls++;
            } else {
              this.stats.failedCalls++;
            }

            resolve(response);
          },
          reject: (error) => {
            clearTimeout(timeoutHandle);
            this.pendingRequests.delete(requestId);
            this.stats.failedCalls++;
            reject(error);
          },
          timeoutHandle,
        });

        // Send request
        this.sendRequest(fullRequest).catch((error) => {
          const pending = this.pendingRequests.get(requestId);
          if (pending) {
            clearTimeout(pending.timeoutHandle);
            this.pendingRequests.delete(requestId);
            this.stats.failedCalls++;
            reject(error);
          }
        });
      });
    });
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<OmcHealthStatus> {
    const avgResponseTimeMs =
      this.stats.totalCalls > 0
        ? this.stats.totalResponseTimeMs / this.stats.totalCalls
        : 0;

    return {
      state: this.state,
      healthy: this.state === "connected",
      lastHealthCheck: new Date(),
      stats: {
        totalCalls: this.stats.totalCalls,
        successfulCalls: this.stats.successfulCalls,
        failedCalls: this.stats.failedCalls,
        timedOutCalls: this.stats.timedOutCalls,
        avgResponseTimeMs,
        activeConnections: this.pendingRequests.size,
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      },
      availableTools: getAllToolNames(),
    };
  }

  /**
   * Perform health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const healthUrl = `${this.config.omcRuntimeUrl}/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.connectionTimeoutMs);

      try {
        const response = await fetch(healthUrl, {
          method: "GET",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return true;
        }

        logger.warn("OMC health check failed", {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("OMC health check error", { error: message });
      return false;
    }
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private setState(state: OmcConnectionState): void {
    const previousState = this.state;
    this.state = state;

    if (previousState !== state) {
      this.emit("stateChange", { from: previousState, to: state });
    }
  }

  private async establishConnection(): Promise<void> {
    const sseUrl = `${this.config.omcRuntimeUrl}/events`;

    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    // Use fetch with streaming for SSE
    const response = await fetch(sseUrl, {
      method: "GET",
      headers,
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to connect: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body for SSE connection");
    }

    // Process SSE stream
    this.processEventStream(response.body);
  }

  private async processEventStream(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          logger.info("SSE stream ended");
          this.handleDisconnect();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = this.parseSSEBuffer(buffer);
        buffer = events.remaining;

        for (const event of events.parsed) {
          this.handleSSEEvent(event);
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        logger.debug("SSE connection aborted");
      } else {
        const message = error instanceof Error ? error.message : String(error);
        logger.error("SSE stream error", { error: message });
        this.handleDisconnect();
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseSSEBuffer(buffer: string): { parsed: OmcSseEvent[]; remaining: string } {
    const events: OmcSseEvent[] = [];
    const lines = buffer.split("\n");
    let remaining = "";
    let currentEvent: Partial<OmcSseEvent> = {};
    let dataLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Incomplete line at end of buffer
      if (i === lines.length - 1 && line !== "") {
        remaining = line;
        break;
      }

      // Empty line signals end of event
      if (line === "") {
        if (dataLines.length > 0) {
          const dataStr = dataLines.join("\n");
          try {
            const parsed = JSON.parse(dataStr);
            events.push({
              type: (currentEvent.type as OmcSseEvent["type"]) ?? "tool_result",
              requestId: parsed.requestId,
              data: parsed,
              timestamp: Date.now(),
            });
          } catch {
            logger.warn("Failed to parse SSE data", { data: dataStr });
          }
        }
        currentEvent = {};
        dataLines = [];
        continue;
      }

      // Parse field
      if (line.startsWith("event:")) {
        currentEvent.type = line.slice(6).trim() as OmcSseEvent["type"];
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      } else if (line.startsWith("id:")) {
        currentEvent.requestId = line.slice(3).trim();
      }
    }

    return { parsed: events, remaining };
  }

  private handleSSEEvent(event: OmcSseEvent): void {
    if (this.config.logToolCalls) {
      logger.debug("SSE event received", {
        type: event.type,
        requestId: event.requestId,
      });
    }

    switch (event.type) {
      case "tool_result": {
        if (event.requestId) {
          const pending = this.pendingRequests.get(event.requestId);
          if (pending) {
            const data = event.data as Record<string, unknown>;
            const response: OmcToolCallResponse = {
              requestId: event.requestId,
              status: data.error ? "error" : "success",
              result: data.result,
              error: data.error as OmcToolCallResponse["error"],
              metadata: {
                durationMs: Date.now() - pending.startTime,
                estimatedTokens: (data.estimatedTokens as number) ?? undefined,
                cached: (data.cached as boolean) ?? false,
                runtimeVersion: (data.runtimeVersion as string) ?? undefined,
              },
            };
            pending.resolve(response);
          }
        }
        break;
      }

      case "error": {
        if (event.requestId) {
          const pending = this.pendingRequests.get(event.requestId);
          if (pending) {
            const data = event.data as Record<string, unknown>;
            const response: OmcToolCallResponse = {
              requestId: event.requestId,
              status: "error",
              error: {
                code: (data.code as string) ?? "UNKNOWN_ERROR",
                message: (data.message as string) ?? "Unknown error",
                details: data.details,
              },
              metadata: {
                durationMs: Date.now() - pending.startTime,
              },
            };
            pending.resolve(response);
          }
        }
        break;
      }

      case "heartbeat":
        // Keep-alive, no action needed
        break;

      case "connected":
        logger.debug("OMC runtime confirmed connection");
        break;

      default:
        logger.warn("Unknown SSE event type", { type: event.type });
    }
  }

  private async sendRequest(request: OmcToolCallRequest): Promise<void> {
    const url = `${this.config.omcRuntimeUrl}/tools/execute`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: this.abortController?.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to send tool request: ${response.status} ${text}`);
    }

    if (this.config.logToolCalls) {
      logger.debug("Tool request sent", {
        requestId: request.requestId,
        toolName: request.toolName,
      });
    }
  }

  private handleDisconnect(): void {
    if (this.state === "disconnected") {
      return;
    }

    this.setState("disconnected");
    this.emit("disconnected");
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    const delay = this.config.retryDelayMs;
    logger.info("Scheduling OMC reconnection", { delayMs: delay });

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
      } catch (error) {
        // connect() will schedule another reconnect on failure
      }
    }, delay);
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      const healthy = await this.healthCheck();
      if (!healthy && this.state === "connected") {
        logger.warn("OMC health check failed, reconnecting");
        this.handleDisconnect();
      }
    }, this.config.healthCheckIntervalMs);

    // Don't prevent process exit
    this.healthCheckInterval.unref?.();
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let clientInstance: OmcBridgeClient | null = null;

/**
 * Get the singleton OMC Bridge client instance
 */
export function getOmcBridgeClient(): OmcBridgeClient {
  if (!clientInstance) {
    clientInstance = new OmcBridgeClient();
  }
  return clientInstance;
}

/**
 * Create a new OMC Bridge client with custom config
 */
export function createOmcBridgeClient(config?: Partial<OmcBridgeConfig>): OmcBridgeClient {
  return new OmcBridgeClient(config);
}
