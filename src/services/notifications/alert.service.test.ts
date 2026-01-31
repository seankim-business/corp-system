import { AlertService, QuotaAlert } from "./alert.service";
import { WebClient } from "@slack/web-api";
import { redis } from "../../db/redis";
import { db } from "../../db/client";
import { getSlackIntegrationByOrg } from "../../api/slack-integration";

jest.mock("@slack/web-api");
jest.mock("../../db/redis", () => ({
  redis: {
    exists: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));
jest.mock("../../db/client", () => ({
  db: {
    claudeAccount: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  },
}));
jest.mock("../../api/slack-integration");
jest.mock("../../utils/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("AlertService", () => {
  let service: AlertService;
  let mockSlackClient: jest.Mocked<WebClient>;

  beforeEach(() => {
    service = new AlertService();

    mockSlackClient = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
      },
    } as any;

    (WebClient as jest.Mock).mockImplementation(() => mockSlackClient);

    jest.clearAllMocks();
  });

  describe("sendQuotaAlert", () => {
    const mockAlert: QuotaAlert = {
      accountId: "acc-123",
      accountName: "Production Account",
      organizationId: "org-456",
      severity: "warning",
      thresholdType: "daily",
      percentageUsed: 85.5,
      currentValue: 8550,
      limit: 10000,
      recommendation: "Consider adding additional accounts",
    };

    it("should send quota alert to Slack with Block Kit formatting", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);
      (getSlackIntegrationByOrg as jest.Mock).mockResolvedValue({
        enabled: true,
        botToken: "xoxb-test-token",
      });

      await service.sendQuotaAlert(mockAlert);

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: expect.any(String),
          text: expect.stringContaining("85.5%"),
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "header",
              text: expect.objectContaining({
                text: expect.stringContaining("Production Account"),
              }),
            }),
          ]),
        }),
      );

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining("acc-123:quota_daily"),
        "1",
        30 * 60,
      );
    });

    it("should skip alert if in cooldown period", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(1);

      await service.sendQuotaAlert(mockAlert);

      expect(mockSlackClient.chat.postMessage).not.toHaveBeenCalled();
    });

    it("should skip alert if Slack integration not available", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);
      (getSlackIntegrationByOrg as jest.Mock).mockResolvedValue(null);

      await service.sendQuotaAlert(mockAlert);

      expect(mockSlackClient.chat.postMessage).not.toHaveBeenCalled();
    });

    it("should use critical emoji and color for critical alerts", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);
      (getSlackIntegrationByOrg as jest.Mock).mockResolvedValue({
        enabled: true,
        botToken: "xoxb-test-token",
      });

      const criticalAlert: QuotaAlert = {
        ...mockAlert,
        severity: "critical",
        percentageUsed: 95.0,
      };

      await service.sendQuotaAlert(criticalAlert);

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("🚨"),
          attachments: expect.arrayContaining([
            expect.objectContaining({
              color: "#FF0000",
            }),
          ]),
        }),
      );
    });

    it("should handle Slack API errors gracefully", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);
      (getSlackIntegrationByOrg as jest.Mock).mockResolvedValue({
        enabled: true,
        botToken: "xoxb-test-token",
      });

      mockSlackClient.chat.postMessage = jest.fn().mockRejectedValue(new Error("Slack API error"));

      await expect(service.sendQuotaAlert(mockAlert)).resolves.not.toThrow();
    });
  });

  describe("sendCircuitBreakerAlert", () => {
    it("should send circuit breaker alert with account details", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);
      (db.claudeAccount.findUnique as jest.Mock).mockResolvedValue({
        id: "acc-123",
        name: "Production Account",
        organizationId: "org-456",
        consecutiveFailures: 5,
        lastFailureAt: new Date("2026-01-30T10:00:00Z"),
        organization: { id: "org-456" },
      });
      (getSlackIntegrationByOrg as jest.Mock).mockResolvedValue({
        enabled: true,
        botToken: "xoxb-test-token",
      });

      await service.sendCircuitBreakerAlert("acc-123", "Rate limit exceeded (429)", "org-456");

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Circuit Breaker Opened"),
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "header",
              text: expect.objectContaining({
                text: expect.stringContaining("Production Account"),
              }),
            }),
          ]),
        }),
      );

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining("acc-123:circuit_breaker"),
        "1",
        5 * 60,
      );
    });

    it("should skip alert if in cooldown period", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(1);

      await service.sendCircuitBreakerAlert("acc-123", "Rate limit exceeded");

      expect(mockSlackClient.chat.postMessage).not.toHaveBeenCalled();
    });

    it("should handle account not found", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);
      (db.claudeAccount.findUnique as jest.Mock).mockResolvedValue(null);

      await service.sendCircuitBreakerAlert("acc-123", "Rate limit exceeded");

      expect(mockSlackClient.chat.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("sendAllAccountsExhaustedAlert", () => {
    it("should send critical alert with @channel mention", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);
      (getSlackIntegrationByOrg as jest.Mock).mockResolvedValue({
        enabled: true,
        botToken: "xoxb-test-token",
      });
      (db.claudeAccount.count as jest.Mock).mockResolvedValueOnce(10).mockResolvedValueOnce(10);

      await service.sendAllAccountsExhaustedAlert("org-456");

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("CRITICAL"),
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
              text: expect.objectContaining({
                text: expect.stringContaining("<!channel>"),
              }),
            }),
          ]),
        }),
      );

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining("org-456:all_accounts_exhausted"),
        "1",
        60 * 60,
      );
    });

    it("should skip alert if in cooldown period", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(1);

      await service.sendAllAccountsExhaustedAlert("org-456");

      expect(mockSlackClient.chat.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("isInCooldown", () => {
    it("should return true if alert is in cooldown", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(1);

      const result = await service.isInCooldown("acc-123", "quota_daily");

      expect(result).toBe(true);
    });

    it("should return false if alert is not in cooldown", async () => {
      (redis.exists as jest.Mock).mockResolvedValue(0);

      const result = await service.isInCooldown("acc-123", "quota_daily");

      expect(result).toBe(false);
    });
  });

  describe("clearCooldown", () => {
    it("should clear cooldown for alert", async () => {
      await service.clearCooldown("acc-123", "quota_daily");

      expect(redis.del).toHaveBeenCalledWith(expect.stringContaining("acc-123:quota_daily"));
    });
  });
});
