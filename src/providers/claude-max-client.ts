/**
 * Claude Max Client
 *
 * Unofficial client for interacting with Claude Max (claude.ai) subscription
 * using the web API instead of the paid Anthropic API.
 *
 * Base URL: https://claude.ai/api
 * Authentication: Cookie-based with sessionKey
 */

import { randomUUID } from "crypto";
import { logger } from "../utils/logger";

// ============================================================================
// Types
// ============================================================================

export interface ClaudeMaxConfig {
  sessionKey: string;
  organizationId?: string; // Auto-fetched if not provided
}

export interface Organization {
  uuid: string;
  name: string;
  created_at: string;
  join_token?: string;
  settings?: Record<string, unknown>;
  capabilities?: string[];
}

export interface Conversation {
  uuid: string;
  name: string;
  model: string;
  created_at: string;
  updated_at: string;
}

export interface SendOptions {
  model?: string;
  timezone?: string;
  attachments?: Array<{
    file_name: string;
    file_type: string;
    file_size: number;
    extracted_content: string;
  }>;
}

export interface ChatResponse {
  content: string;
  conversationId: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ClaudeMaxUsage {
  inputTokens: number;
  outputTokens: number;
}

// SSE Event types from claude.ai
interface SSEMessage {
  type: string;
  message?: {
    id: string;
    type: string;
    role: string;
    content: Array<{
      type: string;
      text?: string;
    }>;
    model: string;
    stop_reason?: string;
    stop_sequence?: string | null;
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
  };
  index?: number;
  content_block?: {
    type: string;
    text?: string;
  };
  delta?: {
    type: string;
    text?: string;
    stop_reason?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

const BASE_URL = "https://claude.ai/api";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_TIMEZONE = "Asia/Seoul";
const REQUEST_TIMEOUT_MS = 120000; // 2 minutes

// Model mapping from API models to claude.ai models
const MODEL_MAPPING: Record<string, string> = {
  // Sonnet models
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-20250514",
  "claude-sonnet-4-20250514": "claude-sonnet-4-20250514",
  // Haiku models (use sonnet on claude.ai as haiku may not be available)
  "claude-3-5-haiku-20241022": "claude-sonnet-4-20250514",
  // Opus models
  "claude-3-opus-20240229": "claude-sonnet-4-20250514", // Opus may have limited availability
};

// ============================================================================
// Client Implementation
// ============================================================================

export class ClaudeMaxClient {
  private sessionKey: string;
  private organizationId?: string;
  private conversationCache: Map<string, Conversation> = new Map();

  constructor(config: ClaudeMaxConfig) {
    this.sessionKey = config.sessionKey;
    this.organizationId = config.organizationId;
  }

  /**
   * Get organization ID, fetching it if not already known
   */
  async getOrganizationId(): Promise<string> {
    if (this.organizationId) {
      return this.organizationId;
    }

    const orgs = await this.getOrganizations();
    if (orgs.length === 0) {
      throw new ClaudeMaxError("No organizations found for this account", "NO_ORGANIZATIONS");
    }

    // Use the first organization
    this.organizationId = orgs[0].uuid;
    logger.info("Claude Max organization auto-selected", {
      organizationId: this.organizationId,
      organizationName: orgs[0].name,
    });

    return this.organizationId;
  }

  /**
   * Get user's organizations
   */
  async getOrganizations(): Promise<Organization[]> {
    const response = await this.makeRequest<Organization[]>("GET", "/organizations");
    return response;
  }

  /**
   * Create a new conversation
   */
  async createConversation(name?: string, model?: string): Promise<Conversation> {
    const orgId = await this.getOrganizationId();
    const uuid = randomUUID();
    const mappedModel = model ? this.mapModel(model) : DEFAULT_MODEL;

    const response = await this.makeRequest<Conversation>(
      "POST",
      `/organizations/${orgId}/chat_conversations`,
      {
        name: name || "",
        uuid,
        model: mappedModel,
      },
    );

    // Cache the conversation
    this.conversationCache.set(response.uuid, response);

    logger.debug("Claude Max conversation created", {
      conversationId: response.uuid,
      model: mappedModel,
    });

    return response;
  }

  /**
   * Send a message and get response (handles SSE streaming internally)
   */
  async sendMessage(
    conversationId: string,
    message: string,
    options?: SendOptions,
  ): Promise<{ content: string; usage?: ClaudeMaxUsage }> {
    const orgId = await this.getOrganizationId();
    const model = options?.model ? this.mapModel(options.model) : DEFAULT_MODEL;

    const body = {
      prompt: message,
      timezone: options?.timezone || DEFAULT_TIMEZONE,
      model,
      attachments: options?.attachments || [],
    };

    const response = await this.makeStreamingRequest(
      `/organizations/${orgId}/chat_conversations/${conversationId}/completion`,
      body,
    );

    return response;
  }

  /**
   * Complete chat (create conv + send message + return response)
   * This is the main method for simple one-off requests
   */
  async chat(
    message: string,
    options?: {
      systemPrompt?: string;
      model?: string;
      conversationId?: string;
    },
  ): Promise<ChatResponse> {
    let conversationId = options?.conversationId;
    let conversation: Conversation;

    // Create new conversation if not provided
    if (!conversationId) {
      conversation = await this.createConversation(undefined, options?.model);
      conversationId = conversation.uuid;
    } else {
      conversation =
        this.conversationCache.get(conversationId) ||
        (await this.getConversation(conversationId));
    }

    // Prepend system prompt if provided
    let finalMessage = message;
    if (options?.systemPrompt) {
      finalMessage = `<system>${options.systemPrompt}</system>\n\n${message}`;
    }

    const result = await this.sendMessage(conversationId, finalMessage, {
      model: options?.model,
    });

    return {
      content: result.content,
      conversationId,
      model: conversation.model,
      inputTokens: result.usage?.inputTokens,
      outputTokens: result.usage?.outputTokens,
    };
  }

  /**
   * Get an existing conversation
   */
  async getConversation(conversationId: string): Promise<Conversation> {
    // Check cache first
    if (this.conversationCache.has(conversationId)) {
      return this.conversationCache.get(conversationId)!;
    }

    const orgId = await this.getOrganizationId();
    const response = await this.makeRequest<Conversation>(
      "GET",
      `/organizations/${orgId}/chat_conversations/${conversationId}`,
    );

    this.conversationCache.set(conversationId, response);
    return response;
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const orgId = await this.getOrganizationId();
    await this.makeRequest(
      "DELETE",
      `/organizations/${orgId}/chat_conversations/${conversationId}`,
    );
    this.conversationCache.delete(conversationId);
  }

  /**
   * Map API model names to claude.ai model names
   */
  private mapModel(model: string): string {
    return MODEL_MAPPING[model] || model;
  }

  /**
   * Make a standard HTTP request to claude.ai API
   */
  private async makeRequest<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;
    const headers = this.getHeaders();

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "DELETE")) {
      options.body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new ClaudeMaxError(
          `Request failed: ${response.status} ${response.statusText} - ${errorText}`,
          this.mapHttpStatusToErrorCode(response.status),
          response.status,
        );
      }

      // Handle empty responses (e.g., DELETE)
      const text = await response.text();
      if (!text) {
        return {} as T;
      }

      return JSON.parse(text) as T;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof ClaudeMaxError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new ClaudeMaxError("Request timeout", "TIMEOUT");
        }
        throw new ClaudeMaxError(error.message, "NETWORK_ERROR");
      }

      throw new ClaudeMaxError("Unknown error", "UNKNOWN_ERROR");
    }
  }

  /**
   * Make a streaming request to claude.ai API (for completion endpoint)
   */
  private async makeStreamingRequest(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ content: string; usage?: ClaudeMaxUsage }> {
    const url = `${BASE_URL}${path}`;
    const headers = this.getHeaders();
    headers["Accept"] = "text/event-stream";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new ClaudeMaxError(
          `Streaming request failed: ${response.status} ${response.statusText} - ${errorText}`,
          this.mapHttpStatusToErrorCode(response.status),
          response.status,
        );
      }

      // Parse SSE stream
      const result = await this.parseSSEStream(response);
      return result;
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof ClaudeMaxError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new ClaudeMaxError("Streaming request timeout", "TIMEOUT");
        }
        throw new ClaudeMaxError(error.message, "NETWORK_ERROR");
      }

      throw new ClaudeMaxError("Unknown streaming error", "UNKNOWN_ERROR");
    }
  }

  /**
   * Parse Server-Sent Events stream from claude.ai
   */
  private async parseSSEStream(
    response: Response,
  ): Promise<{ content: string; usage?: ClaudeMaxUsage }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ClaudeMaxError("No response body", "INVALID_RESPONSE");
    }

    const decoder = new TextDecoder();
    let content = "";
    let usage: ClaudeMaxUsage | undefined;
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Append new data to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim() || line.startsWith(":")) {
            continue;
          }

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") {
              continue;
            }

            try {
              const event = JSON.parse(jsonStr) as SSEMessage;
              const { text, eventUsage } = this.processSSEEvent(event);

              if (text) {
                content += text;
              }

              if (eventUsage) {
                usage = eventUsage;
              }
            } catch (parseError) {
              // Skip malformed JSON events
              logger.debug("Failed to parse SSE event", {
                error: parseError instanceof Error ? parseError.message : String(parseError),
                line: jsonStr.substring(0, 100),
              });
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content, usage };
  }

  /**
   * Process a single SSE event and extract content/usage
   */
  private processSSEEvent(event: SSEMessage): {
    text: string | null;
    eventUsage: ClaudeMaxUsage | null;
  } {
    let text: string | null = null;
    let eventUsage: ClaudeMaxUsage | null = null;

    switch (event.type) {
      case "content_block_delta":
        if (event.delta?.type === "text_delta" && event.delta.text) {
          text = event.delta.text;
        }
        break;

      case "message_delta":
        // Final message with usage info
        if (event.usage) {
          eventUsage = {
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
          };
        }
        break;

      case "message_start":
        // Could extract model info or initial usage here
        if (event.message?.usage) {
          eventUsage = {
            inputTokens: event.message.usage.input_tokens,
            outputTokens: event.message.usage.output_tokens,
          };
        }
        break;

      case "message_stop":
        // End of message
        break;

      case "ping":
        // Keep-alive ping
        break;

      case "error":
        logger.warn("Claude Max SSE error event", { event });
        break;
    }

    return { text, eventUsage };
  }

  /**
   * Get request headers with authentication
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Cookie: `sessionKey=${this.sessionKey}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Origin: "https://claude.ai",
      Referer: "https://claude.ai/",
    };
  }

  /**
   * Map HTTP status code to error code
   */
  private mapHttpStatusToErrorCode(status: number): ClaudeMaxErrorCode {
    switch (status) {
      case 401:
        return "INVALID_SESSION";
      case 403:
        return "FORBIDDEN";
      case 404:
        return "NOT_FOUND";
      case 429:
        return "RATE_LIMITED";
      case 500:
      case 502:
      case 503:
      case 504:
        return "SERVER_ERROR";
      default:
        return "UNKNOWN_ERROR";
    }
  }
}

// ============================================================================
// Error Handling
// ============================================================================

export type ClaudeMaxErrorCode =
  | "INVALID_SESSION"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "NO_ORGANIZATIONS"
  | "UNKNOWN_ERROR";

export class ClaudeMaxError extends Error {
  constructor(
    message: string,
    public readonly code: ClaudeMaxErrorCode,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ClaudeMaxError";
  }

  isRetryable(): boolean {
    return ["RATE_LIMITED", "SERVER_ERROR", "NETWORK_ERROR", "TIMEOUT"].includes(this.code);
  }
}
