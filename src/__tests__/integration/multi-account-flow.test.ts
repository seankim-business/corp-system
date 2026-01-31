import { AccountPoolService } from "../../services/account-pool/account-pool.service";
import { CapacityTracker } from "../../services/account-pool/capacity-tracker";
import { AccountCircuitBreaker } from "../../services/account-pool/circuit-breaker";
import { AccountSelector } from "../../services/account-pool/account-selector";
import { LeastLoadedStrategy } from "../../services/account-pool/strategies/least-loaded.strategy";
import { db } from "../../db/client";
import { withWorkerConnection } from "../../db/redis";

jest.mock("../../db/client");
jest.mock("../../db/redis");
jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("Multi-Account Flow Integration", () => {
  let accountPool: AccountPoolService;
  let capacityTracker: CapacityTracker;
  let circuitBreaker: AccountCircuitBreaker;
  let accountSelector: AccountSelector;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      pipeline: jest.fn().mockReturnThis(),
      zincrby: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
      zrangebyscore: jest.fn().mockResolvedValue([]),
    };

    (withWorkerConnection as jest.Mock).mockImplementation((callback) => callback(mockRedis));

    capacityTracker = new CapacityTracker();
    circuitBreaker = new AccountCircuitBreaker();
    accountSelector = new AccountSelector();
    accountSelector.registerStrategy("least-loaded", new LeastLoadedStrategy());

    accountPool = new AccountPoolService({
      capacityTracker,
      circuitBreaker,
      accountSelector,
    });

    jest.clearAllMocks();
  });

  it("should complete full multi-account workflow", async () => {
    const orgId = "org-test";

    const mockAccounts = [
      {
        id: "acc-tier1",
        organizationId: orgId,
        name: "Tier 1 Account",
        status: "active",
        consecutiveFailures: 0,
        halfOpenSuccesses: 0,
        circuitOpensAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        lastSuccessAt: null,
        metadata: {
          tier: "tier1",
          rateLimits: { rpm: 50, tpm: 40000, itpm: 20000 },
          encryptedApiKey: "encrypted-key-1",
          monthlyUsage: {
            requests: 0,
            tokens: 0,
            estimatedCostCents: 0,
            lastResetAt: new Date().toISOString(),
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "acc-tier3",
        organizationId: orgId,
        name: "Tier 3 Account",
        status: "active",
        consecutiveFailures: 0,
        halfOpenSuccesses: 0,
        circuitOpensAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        lastSuccessAt: null,
        metadata: {
          tier: "tier3",
          rateLimits: { rpm: 1000, tpm: 80000, itpm: 40000 },
          encryptedApiKey: "encrypted-key-3",
          monthlyUsage: {
            requests: 0,
            tokens: 0,
            estimatedCostCents: 0,
            lastResetAt: new Date().toISOString(),
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "acc-tier4",
        organizationId: orgId,
        name: "Tier 4 Account",
        status: "active",
        consecutiveFailures: 0,
        halfOpenSuccesses: 0,
        circuitOpensAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        lastSuccessAt: null,
        metadata: {
          tier: "tier4",
          rateLimits: { rpm: 4000, tpm: 400000, itpm: 200000 },
          encryptedApiKey: "encrypted-key-4",
          monthlyUsage: {
            requests: 0,
            tokens: 0,
            estimatedCostCents: 0,
            lastResetAt: new Date().toISOString(),
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (db as any).claudeAccount = {
      findMany: jest.fn().mockResolvedValue(mockAccounts),
      findUnique: jest.fn((args: any) => {
        return Promise.resolve(mockAccounts.find((a) => a.id === args.where.id));
      }),
      update: jest.fn().mockResolvedValue({}),
    };

    (db as any).organization = {
      findUnique: jest.fn().mockResolvedValue({
        id: orgId,
        settings: { accountSelectionStrategy: "least-loaded" },
      }),
    };

    mockRedis.zrangebyscore.mockResolvedValue([]);

    const selectedAccount = await accountPool.selectAccount({
      organizationId: orgId,
      estimatedTokens: 5000,
      category: "production",
    });

    expect(selectedAccount).toBeDefined();
    expect(selectedAccount?.id).toBe("acc-tier4");

    await accountPool.recordRequest(selectedAccount!.id, {
      success: true,
      tokens: 5000,
      isCacheRead: false,
    });

    expect(mockRedis.zincrby).toHaveBeenCalledTimes(3);
    expect((db as any).claudeAccount.update).toHaveBeenCalled();
  });

  it("should handle 429 error and failover to different account", async () => {
    const orgId = "org-test";

    const mockAccounts = [
      {
        id: "acc-1",
        organizationId: orgId,
        name: "Account 1",
        status: "active",
        consecutiveFailures: 0,
        halfOpenSuccesses: 0,
        circuitOpensAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        lastSuccessAt: null,
        metadata: {
          tier: "tier3",
          rateLimits: { rpm: 1000, tpm: 80000, itpm: 40000 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "acc-2",
        organizationId: orgId,
        name: "Account 2",
        status: "active",
        consecutiveFailures: 0,
        halfOpenSuccesses: 0,
        circuitOpensAt: null,
        lastFailureAt: null,
        lastFailureReason: null,
        lastSuccessAt: null,
        metadata: {
          tier: "tier3",
          rateLimits: { rpm: 1000, tpm: 80000, itpm: 40000 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (db as any).claudeAccount = {
      findMany: jest.fn().mockResolvedValue(mockAccounts),
      findUnique: jest.fn((args: any) => {
        return Promise.resolve(mockAccounts.find((a) => a.id === args.where.id));
      }),
      update: jest.fn((args: any) => {
        const account = mockAccounts.find((a) => a.id === args.where.id);
        if (account && args.data.consecutiveFailures !== undefined) {
          account.consecutiveFailures = args.data.consecutiveFailures;
          if (args.data.status) {
            account.status = args.data.status;
          }
          if (args.data.circuitOpensAt) {
            account.circuitOpensAt = args.data.circuitOpensAt;
          }
        }
        return Promise.resolve(account);
      }),
    };

    (db as any).organization = {
      findUnique: jest.fn().mockResolvedValue({
        id: orgId,
        settings: { accountSelectionStrategy: "least-loaded" },
      }),
    };

    mockRedis.zrangebyscore.mockResolvedValue([]);

    const firstAccount = await accountPool.selectAccount({
      organizationId: orgId,
      estimatedTokens: 5000,
    });

    expect(firstAccount?.id).toBe("acc-1");

    for (let i = 0; i < 5; i++) {
      await accountPool.recordRequest(firstAccount!.id, {
        success: false,
        error: "Rate limit exceeded (429)",
      });
    }

    expect(mockAccounts[0].consecutiveFailures).toBe(5);
    expect(mockAccounts[0].status).toBe("circuit_open");

    const secondAccount = await accountPool.selectAccount({
      organizationId: orgId,
      estimatedTokens: 5000,
    });

    expect(secondAccount?.id).toBe("acc-2");
  });

  it("should return null when all accounts exhausted", async () => {
    const orgId = "org-test";

    const mockAccounts = [
      {
        id: "acc-1",
        organizationId: orgId,
        name: "Account 1",
        status: "circuit_open",
        consecutiveFailures: 5,
        halfOpenSuccesses: 0,
        circuitOpensAt: new Date(),
        lastFailureAt: new Date(),
        lastFailureReason: "Rate limit exceeded",
        lastSuccessAt: null,
        metadata: {
          tier: "tier3",
          rateLimits: { rpm: 1000, tpm: 80000, itpm: 40000 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "acc-2",
        organizationId: orgId,
        name: "Account 2",
        status: "circuit_open",
        consecutiveFailures: 5,
        halfOpenSuccesses: 0,
        circuitOpensAt: new Date(),
        lastFailureAt: new Date(),
        lastFailureReason: "Rate limit exceeded",
        lastSuccessAt: null,
        metadata: {
          tier: "tier3",
          rateLimits: { rpm: 1000, tpm: 80000, itpm: 40000 },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (db as any).claudeAccount = {
      findMany: jest.fn().mockResolvedValue(mockAccounts),
      findUnique: jest.fn((args: any) => {
        return Promise.resolve(mockAccounts.find((a) => a.id === args.where.id));
      }),
    };

    (db as any).organization = {
      findUnique: jest.fn().mockResolvedValue({
        id: orgId,
        settings: { accountSelectionStrategy: "least-loaded" },
      }),
    };

    const selectedAccount = await accountPool.selectAccount({
      organizationId: orgId,
      estimatedTokens: 5000,
    });

    expect(selectedAccount).toBeNull();
  });

  it("should track usage correctly with cache reads", async () => {
    const accountId = "acc-test";

    await accountPool.recordRequest(accountId, {
      success: true,
      tokens: 10000,
      isCacheRead: true,
    });

    expect(mockRedis.zincrby).toHaveBeenCalledWith(
      expect.stringContaining("tpm"),
      1000,
      expect.any(String),
    );
  });
});
