import { QuotaMonitorService } from "./quota-monitor.service";
import { AdminAPIClient } from "./admin-api.client";
import { UsageGranularity } from "./admin-api.types";
import { PrismaClient } from "@prisma/client";

jest.mock("./admin-api.client");
jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    claudeAccount: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
  })),
}));

describe("QuotaMonitorService", () => {
  let service: QuotaMonitorService;
  let mockAdminClient: jest.Mocked<AdminAPIClient>;
  let mockPrisma: any;

  beforeEach(() => {
    mockAdminClient = {
      getUsage: jest.fn(),
      getWorkspaceUsage: jest.fn(),
      getWorkspaceMembers: jest.fn(),
    } as any;

    (AdminAPIClient as jest.Mock).mockImplementation(() => mockAdminClient);

    const PrismaClientMock = PrismaClient as jest.MockedClass<typeof PrismaClient>;
    mockPrisma = new PrismaClientMock();

    service = new QuotaMonitorService("test-admin-api-key");
    (service as any).adminClient = mockAdminClient;

    jest.clearAllMocks();
  });

  afterEach(() => {
    service.stopScheduledSync();
  });

  describe("syncUsageFromAdminAPI", () => {
    it("should sync usage for all active accounts", async () => {
      const mockAccounts = [
        {
          id: "acc-1",
          metadata: { apiKeyId: "key-1" },
        },
        {
          id: "acc-2",
          metadata: { apiKeyId: "key-2" },
        },
      ];

      mockPrisma.claudeAccount.findMany.mockResolvedValue(mockAccounts);
      mockPrisma.claudeAccount.findUnique.mockImplementation((args: any) => {
        return Promise.resolve(mockAccounts.find((a) => a.id === args.where.id));
      });

      mockAdminClient.getUsage.mockResolvedValue({
        data: [
          {
            timestamp: "2026-01-30T10:00:00Z",
            requests: 100,
            inputTokens: 5000,
            outputTokens: 3000,
          },
        ],
      });

      mockPrisma.claudeAccount.update.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.syncUsageFromAdminAPI();

      expect(mockPrisma.claudeAccount.findMany).toHaveBeenCalledWith({
        where: { status: "active" },
      });
      expect(mockAdminClient.getUsage).toHaveBeenCalledTimes(2);
      expect(mockPrisma.claudeAccount.update).toHaveBeenCalledTimes(2);
    });

    it("should sync usage for specific account when accountId provided", async () => {
      const mockAccount = {
        id: "acc-1",
        metadata: { apiKeyId: "key-1" },
      };

      mockPrisma.claudeAccount.findMany.mockResolvedValue([mockAccount]);
      mockPrisma.claudeAccount.findUnique.mockResolvedValue(mockAccount);

      mockAdminClient.getUsage.mockResolvedValue({
        data: [
          {
            timestamp: "2026-01-30T10:00:00Z",
            requests: 50,
            inputTokens: 2500,
            outputTokens: 1500,
          },
        ],
      });

      mockPrisma.claudeAccount.update.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.syncUsageFromAdminAPI("acc-1");

      expect(mockPrisma.claudeAccount.findMany).toHaveBeenCalledWith({
        where: { id: "acc-1" },
      });
      expect(mockAdminClient.getUsage).toHaveBeenCalledWith("key-1", UsageGranularity.ONE_HOUR);
    });

    it("should skip accounts without apiKeyId", async () => {
      const mockAccounts = [
        {
          id: "acc-1",
          metadata: {},
        },
      ];

      mockPrisma.claudeAccount.findMany.mockResolvedValue(mockAccounts);
      mockPrisma.claudeAccount.findUnique.mockResolvedValue(mockAccounts[0]);

      await service.syncUsageFromAdminAPI();

      expect(mockAdminClient.getUsage).not.toHaveBeenCalled();
    });

    it("should continue syncing other accounts if one fails", async () => {
      const mockAccounts = [
        {
          id: "acc-1",
          metadata: { apiKeyId: "key-1" },
        },
        {
          id: "acc-2",
          metadata: { apiKeyId: "key-2" },
        },
      ];

      mockPrisma.claudeAccount.findMany.mockResolvedValue(mockAccounts);
      mockPrisma.claudeAccount.findUnique.mockImplementation((args: any) => {
        return Promise.resolve(mockAccounts.find((a) => a.id === args.where.id));
      });

      mockAdminClient.getUsage.mockRejectedValueOnce(new Error("API error")).mockResolvedValueOnce({
        data: [
          {
            timestamp: "2026-01-30T10:00:00Z",
            requests: 50,
            inputTokens: 2500,
            outputTokens: 1500,
          },
        ],
      });

      mockPrisma.claudeAccount.update.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.syncUsageFromAdminAPI();

      expect(mockAdminClient.getUsage).toHaveBeenCalledTimes(2);
      expect(mockPrisma.claudeAccount.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("checkThresholds", () => {
    it("should create warning alert at 80% usage", async () => {
      const mockAccount = {
        id: "acc-1",
        metadata: {
          currentMonthRequests: 80000,
          currentMonthTokens: 4000000,
          requestLimit: 100000,
          tokenLimit: 5000000,
        },
      };

      mockPrisma.claudeAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.checkThresholds("acc-1");

      expect(mockPrisma.$executeRaw).toHaveBeenCalledWith(
        expect.anything(),
        "acc-1",
        "approaching_limit",
        "warning",
        expect.stringContaining("80"),
        80000,
        100000,
        80,
        expect.anything(),
        "requests",
      );
    });

    it("should create critical alert at 95% usage", async () => {
      const mockAccount = {
        id: "acc-1",
        metadata: {
          currentMonthRequests: 95000,
          currentMonthTokens: 4750000,
          requestLimit: 100000,
          tokenLimit: 5000000,
        },
      };

      mockPrisma.claudeAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.checkThresholds("acc-1");

      expect(mockPrisma.$executeRaw).toHaveBeenCalledWith(
        expect.anything(),
        "acc-1",
        "approaching_limit",
        "critical",
        expect.stringContaining("95"),
        95000,
        100000,
        95,
        expect.anything(),
        "requests",
      );
    });

    it("should create quota_exceeded alert at 100% usage and set status to exhausted", async () => {
      const mockAccount = {
        id: "acc-1",
        metadata: {
          currentMonthRequests: 100000,
          currentMonthTokens: 5000000,
          requestLimit: 100000,
          tokenLimit: 5000000,
        },
      };

      mockPrisma.claudeAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.claudeAccount.update.mockResolvedValue({});
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.checkThresholds("acc-1");

      expect(mockPrisma.claudeAccount.update).toHaveBeenCalledWith({
        where: { id: "acc-1" },
        data: { status: "exhausted" },
      });

      expect(mockPrisma.$executeRaw).toHaveBeenCalledWith(
        expect.anything(),
        "acc-1",
        "quota_exceeded",
        "critical",
        expect.stringContaining("100"),
        100000,
        100000,
        100,
        expect.anything(),
        "requests",
      );
    });

    it("should not create alert when under 80% usage", async () => {
      const mockAccount = {
        id: "acc-1",
        metadata: {
          currentMonthRequests: 70000,
          currentMonthTokens: 3500000,
          requestLimit: 100000,
          tokenLimit: 5000000,
        },
      };

      mockPrisma.claudeAccount.findUnique.mockResolvedValue(mockAccount);

      await service.checkThresholds("acc-1");

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it("should not create duplicate alerts", async () => {
      const mockAccount = {
        id: "acc-1",
        metadata: {
          currentMonthRequests: 85000,
          currentMonthTokens: 4250000,
          requestLimit: 100000,
          tokenLimit: 5000000,
        },
      };

      mockPrisma.claudeAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.$queryRaw.mockResolvedValue([{ id: "existing-alert" }]);

      await service.checkThresholds("acc-1");

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe("resolveAlert", () => {
    it("should mark alert as resolved", async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.resolveAlert("alert-123");

      expect(mockPrisma.$executeRaw).toHaveBeenCalledWith(expect.anything(), "alert-123");
    });
  });

  describe("getUnresolvedAlerts", () => {
    it("should return unresolved alerts for account", async () => {
      const mockAlerts = [
        {
          id: "alert-1",
          accountId: "acc-1",
          type: "approaching_limit",
          severity: "warning",
          resolvedAt: null,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(mockAlerts);

      const alerts = await service.getUnresolvedAlerts("acc-1");

      expect(alerts).toEqual(mockAlerts);
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe("scheduledSync", () => {
    it("should start scheduled sync and run immediately", async () => {
      mockPrisma.claudeAccount.findMany.mockResolvedValue([]);

      service.scheduledSync();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockPrisma.claudeAccount.findMany).toHaveBeenCalled();

      service.stopScheduledSync();
    });

    it("should not start if already running", () => {
      service.scheduledSync();
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      service.scheduledSync();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Scheduled sync already running"),
      );

      consoleSpy.mockRestore();
      service.stopScheduledSync();
    });
  });
});
