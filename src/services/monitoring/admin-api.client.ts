import axios, { AxiosError, AxiosInstance } from "axios";
import {
  UsageGranularity,
  UsageResponse,
  GetUsageOptions,
  AdminAPIError,
  UsageDataPoint,
} from "./admin-api.types";

interface CacheEntry {
  data: UsageResponse;
  timestamp: number;
}

export class AdminAPIClient {
  private readonly apiKey: string;
  private readonly baseURL = "https://api.anthropic.com/v1/organizations";
  private readonly axiosInstance: AxiosInstance;
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 30000;

  constructor(apiKey: string) {
    if (!apiKey || !apiKey.startsWith("sk-ant-admin")) {
      throw new Error("Invalid admin API key format. Expected sk-ant-admin...");
    }

    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: 30000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.log(`[AdminAPIClient] ${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params,
        });
        return config;
      },
      (error) => {
        console.error("[AdminAPIClient] Request error:", error);
        return Promise.reject(error);
      },
    );

    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log(`[AdminAPIClient] Response ${response.status}`, {
          dataPoints: Array.isArray(response.data?.data) ? response.data.data.length : 0,
        });
        return response;
      },
      (error) => {
        console.error("[AdminAPIClient] Response error:", {
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      },
    );
  }

  async getUsage(
    apiKeyId: string,
    granularity: UsageGranularity,
    startTime?: string,
    endTime?: string,
  ): Promise<UsageResponse> {
    const cacheKey = this.buildCacheKey(apiKeyId, granularity, startTime, endTime);
    const cached = this.getFromCache(cacheKey);

    if (cached) {
      console.log("[AdminAPIClient] Returning cached result");
      return cached;
    }

    const options: GetUsageOptions = {
      apiKeyId,
      granularity,
      startTime,
      endTime,
    };

    const result = await this.retryWithBackoff(() => this.fetchUsage(options), 3);

    this.setCache(cacheKey, result);
    return result;
  }

  private async fetchUsage(options: GetUsageOptions): Promise<UsageResponse> {
    const params: Record<string, string> = {
      api_key_id: options.apiKeyId,
      granularity: options.granularity,
    };

    if (options.startTime) {
      params.start_time = options.startTime;
    }

    if (options.endTime) {
      params.end_time = options.endTime;
    }

    try {
      const response = await this.axiosInstance.get("/usage_report/messages", {
        params,
      });

      return this.parseUsageResponse(response.data, options.apiKeyId);
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private parseUsageResponse(data: any, apiKeyId: string): UsageResponse {
    if (!data || !Array.isArray(data.data)) {
      throw new Error("Invalid response format from Admin API");
    }

    const dataPoints: UsageDataPoint[] = data.data.map((point: any) => ({
      startTime: this.validateISO8601(point.start_time),
      endTime: this.validateISO8601(point.end_time),
      requests: this.parseNumber(point.requests, "requests"),
      inputTokens: this.parseNumber(point.input_tokens, "inputTokens"),
      outputTokens: this.parseNumber(point.output_tokens, "outputTokens"),
      cacheTokens: this.parseNumber(point.cache_tokens, "cacheTokens"),
    }));

    return {
      data: dataPoints,
      apiKeyId,
    };
  }

  private validateISO8601(timestamp: string): string {
    if (!timestamp || typeof timestamp !== "string") {
      throw new Error("Invalid timestamp: must be a string");
    }

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid ISO 8601 timestamp: ${timestamp}`);
    }

    return timestamp;
  }

  private parseNumber(value: any, fieldName: string): number {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      throw new Error(`Invalid ${fieldName}: must be a non-negative number`);
    }
    return num;
  }

  async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries - 1) {
          break;
        }

        const shouldRetry = this.isRetryableError(error);
        if (!shouldRetry) {
          throw error;
        }

        const delayMs = await this.getRetryDelay(error, attempt);
        console.log(
          `[AdminAPIClient] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`,
        );
        await this.sleep(delayMs);
      }
    }

    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (status === 429) return true;
      if (status && status >= 500) return true;
      if (error.code === "ECONNABORTED") return true;
      if (error.code === "ETIMEDOUT") return true;
      if (error.code === "ENOTFOUND") return true;
      if (error.code === "ECONNRESET") return true;
    }

    return false;
  }

  private async getRetryDelay(error: any, attempt: number): Promise<number> {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      const retryAfter = error.response.headers["retry-after"];

      if (retryAfter) {
        const retryAfterMs = this.parseRetryAfter(retryAfter);
        if (retryAfterMs) {
          console.log(`[AdminAPIClient] Using retry-after header: ${retryAfterMs}ms`);
          return retryAfterMs;
        }
      }
    }

    const exponentialDelay = Math.pow(2, attempt) * 1000;
    return exponentialDelay;
  }

  private parseRetryAfter(retryAfter: string): number | null {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      return Math.max(0, date.getTime() - Date.now());
    }

    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<AdminAPIError>;

      if (axiosError.response) {
        const status = axiosError.response.status;
        const errorData = axiosError.response.data;

        if (status === 401) {
          return new Error("Authentication failed: Invalid admin API key");
        }

        if (status === 403) {
          return new Error("Authorization failed: Insufficient permissions");
        }

        if (status === 429) {
          return new Error("Rate limit exceeded: Too many requests");
        }

        if (errorData && typeof errorData === "object" && "message" in errorData) {
          return new Error(`Admin API error: ${errorData.message}`);
        }

        return new Error(`Admin API error: HTTP ${status}`);
      }

      if (axiosError.code === "ECONNABORTED" || axiosError.code === "ETIMEDOUT") {
        return new Error("Request timeout: Admin API did not respond in time");
      }

      if (axiosError.code === "ENOTFOUND" || axiosError.code === "ECONNREFUSED") {
        return new Error("Network error: Unable to reach Admin API");
      }

      return new Error(`Network error: ${axiosError.message}`);
    }

    if (error instanceof Error) {
      return error;
    }

    return new Error("Unknown error occurred");
  }

  private buildCacheKey(
    apiKeyId: string,
    granularity: UsageGranularity,
    startTime?: string,
    endTime?: string,
  ): string {
    return `${apiKeyId}:${granularity}:${startTime || ""}:${endTime || ""}`;
  }

  private getFromCache(key: string): UsageResponse | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache(key: string, data: UsageResponse): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clearCache(): void {
    this.cache.clear();
  }
}
