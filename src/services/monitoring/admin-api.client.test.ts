import axios from "axios";
import { AdminAPIClient } from "./admin-api.client";
import { UsageGranularity } from "./admin-api.types";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("AdminAPIClient", () => {
  let client: AdminAPIClient;
  const validApiKey = "sk-ant-admin-test-key-12345";
  const mockApiKeyId = "key_abc123";

  beforeEach(() => {
    vi.clearAllMocks();

    mockedAxios.create.mockReturnValue({
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn(), eject: vi.fn() },
        response: { use: vi.fn(), eject: vi.fn() },
      },
    } as any);

    client = new AdminAPIClient(validApiKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create client with valid admin API key", () => {
      expect(() => new AdminAPIClient(validApiKey)).not.toThrow();
    });

    it("should reject invalid API key format", () => {
      expect(() => new AdminAPIClient("sk-ant-regular-key")).toThrow(
        "Invalid admin API key format",
      );
    });

    it("should reject empty API key", () => {
      expect(() => new AdminAPIClient("")).toThrow("Invalid admin API key format");
    });

    it("should configure axios with correct headers", () => {
      expect(mockedAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://api.anthropic.com/v1/organizations",
          headers: expect.objectContaining({
            "x-api-key": validApiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          }),
          timeout: 30000,
        }),
      );
    });
  });

  describe("getUsage", () => {
    const mockUsageResponse = {
      data: [
        {
          start_time: "2024-01-01T00:00:00Z",
          end_time: "2024-01-01T00:01:00Z",
          requests: 10,
          input_tokens: 1000,
          output_tokens: 500,
          cache_tokens: 200,
        },
        {
          start_time: "2024-01-01T00:01:00Z",
          end_time: "2024-01-01T00:02:00Z",
          requests: 5,
          input_tokens: 500,
          output_tokens: 250,
          cache_tokens: 100,
        },
      ],
    };

    beforeEach(() => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue({ data: mockUsageResponse });
    });

    it("should fetch usage data successfully", async () => {
      const result = await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      expect(result).toEqual({
        data: [
          {
            startTime: "2024-01-01T00:00:00Z",
            endTime: "2024-01-01T00:01:00Z",
            requests: 10,
            inputTokens: 1000,
            outputTokens: 500,
            cacheTokens: 200,
          },
          {
            startTime: "2024-01-01T00:01:00Z",
            endTime: "2024-01-01T00:02:00Z",
            requests: 5,
            inputTokens: 500,
            outputTokens: 250,
            cacheTokens: 100,
          },
        ],
        apiKeyId: mockApiKeyId,
      });
    });

    it("should include optional time parameters", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      const startTime = "2024-01-01T00:00:00Z";
      const endTime = "2024-01-01T01:00:00Z";

      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_HOUR, startTime, endTime);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith("/usage_report/messages", {
        params: {
          api_key_id: mockApiKeyId,
          granularity: "1h",
          start_time: startTime,
          end_time: endTime,
        },
      });
    });

    it("should cache results for 30 seconds", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;

      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);
      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it("should not use cache for different parameters", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;

      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);
      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_HOUR);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it("should expire cache after TTL", async () => {
      vi.useFakeTimers();
      const mockAxiosInstance = mockedAxios.create() as any;

      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      vi.advanceTimersByTime(31000);

      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should validate ISO 8601 timestamps", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [
            {
              start_time: "invalid-timestamp",
              end_time: "2024-01-01T00:01:00Z",
              requests: 10,
              input_tokens: 1000,
              output_tokens: 500,
              cache_tokens: 200,
            },
          ],
        },
      });

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Invalid ISO 8601 timestamp",
      );
    });

    it("should validate numeric fields", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [
            {
              start_time: "2024-01-01T00:00:00Z",
              end_time: "2024-01-01T00:01:00Z",
              requests: -5,
              input_tokens: 1000,
              output_tokens: 500,
              cache_tokens: 200,
            },
          ],
        },
      });

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Invalid requests",
      );
    });

    it("should reject invalid response format", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue({
        data: { invalid: "format" },
      });

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Invalid response format",
      );
    });
  });

  describe("error handling", () => {
    it("should handle 401 authentication error", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 401, data: {} },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Authentication failed: Invalid admin API key",
      );
    });

    it("should handle 403 authorization error", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 403, data: {} },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Authorization failed: Insufficient permissions",
      );
    });

    it("should handle 429 rate limit error", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 429, data: {}, headers: {} },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Rate limit exceeded",
      );
    });

    it("should handle network timeout", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        code: "ETIMEDOUT",
        message: "timeout",
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Request timeout",
      );
    });

    it("should handle network connection error", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        code: "ENOTFOUND",
        message: "getaddrinfo ENOTFOUND",
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Network error: Unable to reach Admin API",
      );
    });

    it("should handle API error messages", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        response: {
          status: 400,
          data: {
            type: "invalid_request",
            message: "Invalid granularity parameter",
          },
        },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Admin API error: Invalid granularity parameter",
      );
    });
  });

  describe("retryWithBackoff", () => {
    it("should retry on 429 with exponential backoff", async () => {
      vi.useFakeTimers();
      const mockAxiosInstance = mockedAxios.create() as any;

      let callCount = 0;
      mockAxiosInstance.get.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject({
            isAxiosError: true,
            response: { status: 429, data: {}, headers: {} },
          });
        }
        return Promise.resolve({
          data: {
            data: [
              {
                start_time: "2024-01-01T00:00:00Z",
                end_time: "2024-01-01T00:01:00Z",
                requests: 10,
                input_tokens: 1000,
                output_tokens: 500,
                cache_tokens: 200,
              },
            ],
          },
        });
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      const promise = client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);

      const result = await promise;

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
      expect(result.data).toHaveLength(1);

      vi.useRealTimers();
    });

    it("should respect retry-after header (seconds)", async () => {
      vi.useFakeTimers();
      const mockAxiosInstance = mockedAxios.create() as any;

      let callCount = 0;
      mockAxiosInstance.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject({
            isAxiosError: true,
            response: {
              status: 429,
              data: {},
              headers: { "retry-after": "5" },
            },
          });
        }
        return Promise.resolve({
          data: {
            data: [
              {
                start_time: "2024-01-01T00:00:00Z",
                end_time: "2024-01-01T00:01:00Z",
                requests: 10,
                input_tokens: 1000,
                output_tokens: 500,
                cache_tokens: 200,
              },
            ],
          },
        });
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      const promise = client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      await vi.advanceTimersByTimeAsync(5000);

      await promise;

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should retry on 500 server error", async () => {
      vi.useFakeTimers();
      const mockAxiosInstance = mockedAxios.create() as any;

      let callCount = 0;
      mockAxiosInstance.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject({
            isAxiosError: true,
            response: { status: 500, data: {} },
          });
        }
        return Promise.resolve({
          data: {
            data: [
              {
                start_time: "2024-01-01T00:00:00Z",
                end_time: "2024-01-01T00:01:00Z",
                requests: 10,
                input_tokens: 1000,
                output_tokens: 500,
                cache_tokens: 200,
              },
            ],
          },
        });
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      const promise = client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("should not retry on 401 authentication error", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 401, data: {} },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      await expect(client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE)).rejects.toThrow(
        "Authentication failed",
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it("should fail after max retries", async () => {
      vi.useFakeTimers();
      const mockAxiosInstance = mockedAxios.create() as any;

      mockAxiosInstance.get.mockRejectedValue({
        isAxiosError: true,
        response: { status: 429, data: {}, headers: {} },
      });

      mockedAxios.isAxiosError = vi.fn().mockReturnValue(true);

      const promise = client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(4000);

      await expect(promise).rejects.toThrow();
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);

      vi.useRealTimers();
    });
  });

  describe("cache management", () => {
    it("should clear cache", async () => {
      const mockAxiosInstance = mockedAxios.create() as any;
      mockAxiosInstance.get.mockResolvedValue({
        data: {
          data: [
            {
              start_time: "2024-01-01T00:00:00Z",
              end_time: "2024-01-01T00:01:00Z",
              requests: 10,
              input_tokens: 1000,
              output_tokens: 500,
              cache_tokens: 200,
            },
          ],
        },
      });

      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);
      client.clearCache();
      await client.getUsage(mockApiKeyId, UsageGranularity.ONE_MINUTE);

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });
  });
});
