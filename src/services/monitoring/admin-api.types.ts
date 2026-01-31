/**
 * Claude Admin API Types
 * Types for interacting with the Claude Admin API for usage data synchronization
 */

/**
 * Usage data granularity options
 */
export enum UsageGranularity {
  ONE_MINUTE = "1m",
  ONE_HOUR = "1h",
  ONE_DAY = "1d",
}

/**
 * Single usage data point from the Admin API
 */
export interface UsageDataPoint {
  /** Start time of the measurement period (ISO 8601) */
  startTime: string;
  /** End time of the measurement period (ISO 8601) */
  endTime: string;
  /** Number of API requests in this period */
  requests: number;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Cache tokens used (read/write) */
  cacheTokens: number;
}

/**
 * Response from the Admin API usage endpoint
 */
export interface UsageResponse {
  /** Array of usage data points */
  data: UsageDataPoint[];
  /** API key ID that was queried */
  apiKeyId: string;
}

/**
 * Error response from the Admin API
 */
export interface AdminAPIError {
  /** Error type */
  type: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Options for getUsage method
 */
export interface GetUsageOptions {
  /** API key ID to query usage for */
  apiKeyId: string;
  /** Granularity of usage data */
  granularity: UsageGranularity;
  /** Start time for the query (ISO 8601) */
  startTime?: string;
  /** End time for the query (ISO 8601) */
  endTime?: string;
}
