import { RateLimiter } from "limiter";
import { logger } from "../../utils/logger";

// Import types
import type {
  N8nWorkflow,
  N8nWorkflowInput,
  N8nExecution,
  N8nCredential,
  N8nCredentialInput,
  ListOptions,
  ExecutionListOptions,
  PaginatedResponse,
} from "./types";

export class N8nApiClient {
  private baseUrl: string;
  private apiKey: string;
  private rateLimiter: RateLimiter;
  private maxRetries: number;

  constructor(instanceUrl: string, apiKey: string, options?: { maxRetries?: number }) {
    this.baseUrl = instanceUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.maxRetries = options?.maxRetries ?? 3;

    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 20,
      interval: "minute",
    });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    retryCount = 0,
  ): Promise<T> {
    await this.rateLimiter.removeTokens(1);

    const url = `${this.baseUrl}/api/v1${path}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "X-N8N-API-KEY": this.apiKey,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get("Retry-After") || "60", 10);
        if (retryCount < this.maxRetries) {
          logger.warn(`n8n API rate limited, retrying in ${retryAfter}s`, { path });
          await this.sleep(retryAfter * 1000);
          return this.request<T>(method, path, body, retryCount + 1);
        }
        throw new Error(`n8n API rate limited after ${this.maxRetries} retries`);
      }

      if (response.status >= 500 && retryCount < this.maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        logger.warn(`n8n API server error, retrying in ${delay}ms`, {
          path,
          status: response.status,
        });
        await this.sleep(delay);
        return this.request<T>(method, path, body, retryCount + 1);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`n8n API error: ${response.status} ${errorText}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("fetch failed") &&
        retryCount < this.maxRetries
      ) {
        const delay = Math.pow(2, retryCount) * 1000;
        logger.warn(`n8n API connection error, retrying in ${delay}ms`, { path });
        await this.sleep(delay);
        return this.request<T>(method, path, body, retryCount + 1);
      }
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async createWorkflow(workflow: N8nWorkflowInput): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("POST", "/workflows", workflow);
  }

  async getWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("GET", `/workflows/${id}`);
  }

  async updateWorkflow(id: string, workflow: Partial<N8nWorkflowInput>): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("PATCH", `/workflows/${id}`, workflow);
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.request<void>("DELETE", `/workflows/${id}`);
  }

  async activateWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("PATCH", `/workflows/${id}`, { active: true });
  }

  async deactivateWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("PATCH", `/workflows/${id}`, { active: false });
  }

  async listWorkflows(options?: ListOptions): Promise<PaginatedResponse<N8nWorkflow>> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit) params.set("limit", options.limit.toString());

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<PaginatedResponse<N8nWorkflow>>("GET", `/workflows${query}`);
  }

  async getExecution(id: string): Promise<N8nExecution> {
    return this.request<N8nExecution>("GET", `/executions/${id}`);
  }

  async listExecutions(options?: ExecutionListOptions): Promise<PaginatedResponse<N8nExecution>> {
    const params = new URLSearchParams();
    if (options?.cursor) params.set("cursor", options.cursor);
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.status) params.set("status", options.status);
    if (options?.workflowId) params.set("workflowId", options.workflowId);

    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<PaginatedResponse<N8nExecution>>("GET", `/executions${query}`);
  }

  async deleteExecution(id: string): Promise<void> {
    await this.request<void>("DELETE", `/executions/${id}`);
  }

  // ============ Webhook Methods ============

  async triggerWebhook(
    path: string,
    data: unknown,
    method: "GET" | "POST" = "POST",
  ): Promise<unknown> {
    const url = `${this.baseUrl}/webhook/${path}`;

    await this.rateLimiter.removeTokens(1);

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: method === "POST" ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook error: ${response.status} ${errorText}`);
    }

    const contentType = response.headers.get("Content-Type");
    if (contentType?.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  async createCredential(credential: N8nCredentialInput): Promise<N8nCredential> {
    return this.request<N8nCredential>("POST", "/credentials", credential);
  }

  async getCredential(id: string): Promise<N8nCredential> {
    return this.request<N8nCredential>("GET", `/credentials/${id}`);
  }

  async deleteCredential(id: string): Promise<void> {
    await this.request<void>("DELETE", `/credentials/${id}`);
  }

  async listCredentials(): Promise<PaginatedResponse<N8nCredential>> {
    return this.request<PaginatedResponse<N8nCredential>>("GET", "/credentials");
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function createN8nClient(instanceUrl: string, apiKey: string): N8nApiClient {
  return new N8nApiClient(instanceUrl, apiKey);
}
