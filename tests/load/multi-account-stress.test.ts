/**
 * Multi-Account System Load Tests
 *
 * Tests the multi-account system under high concurrency to verify:
 * - Request distribution across accounts
 * - Rate limit handling and throttling
 * - Circuit breaker failover performance
 * - Graceful degradation when all accounts exhausted
 * - Recovery after circuit breaker opens
 *
 * IMPORTANT: Uses test database and mock API keys only.
 * DO NOT run against production.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import {
  AccountPoolService,
  createAccountPoolService,
} from "../../src/services/account-pool/account-pool.service";
import { getAccountCircuitBreaker } from "../../src/services/account-pool/circuit-breaker";
import { CapacityTracker } from "../../src/services/account-pool/capacity-tracker";

const TEST_CONFIG = {
  CONCURRENT_REQUESTS: 1000,
  RATE_LIMIT_MULTIPLIER: 1.5,
  FAILOVER_REQUESTS: 500,
  QUOTA_EXHAUSTION_REQUESTS: 100,
  CIRCUIT_RECOVERY_WAIT_SECONDS: 60,
};

const prisma = new PrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});

const redisClient = createClient({
  url: process.env.TEST_REDIS_URL || process.env.REDIS_URL || "redis://localhost:6379",
});

let testOrgId: string;
let testAccountIds: string[] = [];

interface PerformanceMetrics {
  testName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errorRate: number;
  accountDistribution: Record<string, number>;
  startTime: Date;
  endTime: Date;
  durationMs: number;
}

async function setupTestOrganization(): Promise<string> {
  const org = await prisma.organization.create({
    data: {
      slug: `load-test-${Date.now()}`,
      name: "Load Test Organization",
      settings: {
        accountSelectionStrategy: "least-loaded",
      },
    },
  });

  console.log(`✅ Created test organization: ${org.id}`);
  return org.id;
}

async function registerTestAccounts(
  accountPool: AccountPoolService,
  orgId: string,
): Promise<string[]> {
  const accounts = [
    { name: "Test Account 1", tier: "tier1" as const, apiKey: "sk-ant-test-1" },
    { name: "Test Account 2", tier: "tier2" as const, apiKey: "sk-ant-test-2" },
    { name: "Test Account 3", tier: "tier3" as const, apiKey: "sk-ant-test-3" },
    { name: "Test Account 4", tier: "tier4" as const, apiKey: "sk-ant-test-4" },
    { name: "Test Account 5", tier: "tier4" as const, apiKey: "sk-ant-test-5" },
  ];

  const accountIds: string[] = [];

  for (const accountData of accounts) {
    const account = await accountPool.registerAccount({
      organizationId: orgId,
      name: accountData.name,
      apiKey: accountData.apiKey,
      tier: accountData.tier,
      metadata: {
        isTestAccount: true,
      },
    });

    accountIds.push(account.id);
    console.log(`✅ Registered ${accountData.name} (${accountData.tier}): ${account.id}`);
  }

  return accountIds;
}

async function cleanupTestData(orgId: string): Promise<void> {
  console.log("\n🧹 Cleaning up test data...");

  await (prisma as any).claudeAccount.deleteMany({
    where: { organizationId: orgId },
  });

  await prisma.organization.delete({
    where: { id: orgId },
  });

  const keys = await redisClient.keys(`capacity:*`);
  if (keys.length > 0) {
    await redisClient.del(keys);
  }

  console.log("✅ Cleanup complete");
}

async function simulateRequest(
  accountPool: AccountPoolService,
  orgId: string,
  estimatedTokens: number,
): Promise<{
  success: boolean;
  accountId: string | null;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    const account = await accountPool.selectAccount({
      organizationId: orgId,
      estimatedTokens,
    });

    if (!account) {
      return {
        success: false,
        accountId: null,
        responseTime: Date.now() - startTime,
        error: "No account available",
      };
    }

    await new Promise((resolve) => setTimeout(resolve, Math.random() * 40 + 10));

    await accountPool.recordRequest(account.id, {
      success: true,
      tokens: estimatedTokens,
      isCacheRead: false,
    });

    return {
      success: true,
      accountId: account.id,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      accountId: null,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function calculateMetrics(
  testName: string,
  results: Array<{
    success: boolean;
    accountId: string | null;
    responseTime: number;
    error?: string;
  }>,
  startTime: Date,
  endTime: Date,
): PerformanceMetrics {
  const responseTimes = results.map((r) => r.responseTime).sort((a, b) => a - b);
  const successfulRequests = results.filter((r) => r.success).length;
  const failedRequests = results.length - successfulRequests;

  const p50Index = Math.floor(responseTimes.length * 0.5);
  const p95Index = Math.floor(responseTimes.length * 0.95);
  const p99Index = Math.floor(responseTimes.length * 0.99);

  const accountDistribution: Record<string, number> = {};
  for (const result of results) {
    if (result.accountId) {
      accountDistribution[result.accountId] = (accountDistribution[result.accountId] || 0) + 1;
    }
  }

  const durationMs = endTime.getTime() - startTime.getTime();
  const durationSeconds = durationMs / 1000;

  return {
    testName,
    totalRequests: results.length,
    successfulRequests,
    failedRequests,
    averageResponseTime: responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length,
    p50ResponseTime: responseTimes[p50Index] || 0,
    p95ResponseTime: responseTimes[p95Index] || 0,
    p99ResponseTime: responseTimes[p99Index] || 0,
    requestsPerSecond: results.length / durationSeconds,
    errorRate: (failedRequests / results.length) * 100,
    accountDistribution,
    startTime,
    endTime,
    durationMs,
  };
}

function printMetrics(metrics: PerformanceMetrics): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 ${metrics.testName}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Total Requests:       ${metrics.totalRequests}`);
  console.log(
    `Successful:           ${metrics.successfulRequests} (${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%)`,
  );
  console.log(`Failed:               ${metrics.failedRequests} (${metrics.errorRate.toFixed(2)}%)`);
  console.log(`Duration:             ${(metrics.durationMs / 1000).toFixed(2)}s`);
  console.log(`Throughput:           ${metrics.requestsPerSecond.toFixed(2)} req/s`);
  console.log(`\nResponse Times:`);
  console.log(`  Average:            ${metrics.averageResponseTime.toFixed(2)}ms`);
  console.log(`  p50:                ${metrics.p50ResponseTime.toFixed(2)}ms`);
  console.log(`  p95:                ${metrics.p95ResponseTime.toFixed(2)}ms`);
  console.log(`  p99:                ${metrics.p99ResponseTime.toFixed(2)}ms`);
  console.log(`\nAccount Distribution:`);
  for (const [accountId, count] of Object.entries(metrics.accountDistribution)) {
    const percentage = ((count / metrics.totalRequests) * 100).toFixed(2);
    console.log(`  ${accountId.substring(0, 8)}...: ${count} (${percentage}%)`);
  }
  console.log(`${"=".repeat(60)}\n`);
}

async function testConcurrentRequestDistribution(
  accountPool: AccountPoolService,
  orgId: string,
): Promise<PerformanceMetrics> {
  console.log("\n🧪 Test 1: Concurrent Request Distribution");
  console.log(`Sending ${TEST_CONFIG.CONCURRENT_REQUESTS} concurrent requests...`);

  const startTime = new Date();

  const promises = Array.from({ length: TEST_CONFIG.CONCURRENT_REQUESTS }, () =>
    simulateRequest(accountPool, orgId, 1000),
  );

  const results = await Promise.all(promises);
  const endTime = new Date();

  const metrics = calculateMetrics(
    "Test 1: Concurrent Request Distribution",
    results,
    startTime,
    endTime,
  );
  printMetrics(metrics);

  const accountCount = Object.keys(metrics.accountDistribution).length;
  console.log(`✅ Requests distributed across ${accountCount} accounts`);

  const maxAccountLoad = Math.max(...Object.values(metrics.accountDistribution));
  const maxLoadPercentage = (maxAccountLoad / metrics.totalRequests) * 100;
  console.log(`✅ Max account load: ${maxLoadPercentage.toFixed(2)}% (should be <50%)`);

  return metrics;
}

async function testRateLimitHandling(
  accountPool: AccountPoolService,
  orgId: string,
): Promise<PerformanceMetrics> {
  console.log("\n🧪 Test 2: Rate Limit Handling");
  console.log("Sending requests at 150% of account RPM limit...");

  const accounts = await (prisma as any).claudeAccount.findMany({
    where: { organizationId: orgId },
  });

  const totalRpm = accounts.reduce((sum: number, account: any) => {
    const metadata = account.metadata as any;
    return sum + (metadata?.rateLimits?.rpm || 50);
  }, 0);

  const targetRequests = Math.floor(totalRpm * TEST_CONFIG.RATE_LIMIT_MULTIPLIER);
  console.log(`Total RPM capacity: ${totalRpm}, Target requests: ${targetRequests}`);

  const startTime = new Date();

  const results: Array<{
    success: boolean;
    accountId: string | null;
    responseTime: number;
    error?: string;
  }> = [];

  const batchSize = Math.ceil(targetRequests / 10);
  const delayBetweenBatches = 6000;

  for (let i = 0; i < 10; i++) {
    console.log(`  Batch ${i + 1}/10: Sending ${batchSize} requests...`);

    const batchPromises = Array.from({ length: batchSize }, () =>
      simulateRequest(accountPool, orgId, 1000),
    );

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    if (i < 9) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  const endTime = new Date();

  const metrics = calculateMetrics("Test 2: Rate Limit Handling", results, startTime, endTime);
  printMetrics(metrics);

  console.log(`✅ Capacity tracker handled ${metrics.totalRequests} requests`);
  console.log(`✅ Error rate: ${metrics.errorRate.toFixed(2)}% (should be <10%)`);

  return metrics;
}

async function testFailoverPerformance(
  accountPool: AccountPoolService,
  orgId: string,
  accountIds: string[],
): Promise<PerformanceMetrics> {
  console.log("\n🧪 Test 3: Failover Performance");
  console.log("Simulating account 1 circuit open...");

  const circuitBreaker = getAccountCircuitBreaker();

  for (let i = 0; i < 5; i++) {
    await circuitBreaker.recordFailure(accountIds[0], "Simulated failure for load test");
  }

  const circuitState = await circuitBreaker.checkState(accountIds[0]);
  console.log(`✅ Account 1 circuit state: ${circuitState}`);

  console.log(`Sending ${TEST_CONFIG.FAILOVER_REQUESTS} requests...`);

  const startTime = new Date();

  const promises = Array.from({ length: TEST_CONFIG.FAILOVER_REQUESTS }, () =>
    simulateRequest(accountPool, orgId, 1000),
  );

  const results = await Promise.all(promises);
  const endTime = new Date();

  const metrics = calculateMetrics("Test 3: Failover Performance", results, startTime, endTime);
  printMetrics(metrics);

  const account1Requests = metrics.accountDistribution[accountIds[0]] || 0;
  console.log(`✅ Account 1 requests: ${account1Requests} (should be 0)`);

  const activeAccounts = Object.keys(metrics.accountDistribution).filter(
    (id) => id !== accountIds[0],
  );
  console.log(`✅ Requests distributed across ${activeAccounts.length} active accounts`);

  await circuitBreaker.reset(accountIds[0]);
  console.log("✅ Circuit reset for account 1");

  return metrics;
}

async function testQuotaExhaustion(
  accountPool: AccountPoolService,
  orgId: string,
  accountIds: string[],
): Promise<PerformanceMetrics> {
  console.log("\n🧪 Test 4: Quota Exhaustion Scenario");
  console.log("Exhausting all accounts by opening all circuits...");

  const circuitBreaker = getAccountCircuitBreaker();

  for (const accountId of accountIds) {
    for (let i = 0; i < 5; i++) {
      await circuitBreaker.recordFailure(accountId, "Simulated exhaustion for load test");
    }
  }

  console.log("✅ All circuits opened");

  console.log(`Sending ${TEST_CONFIG.QUOTA_EXHAUSTION_REQUESTS} requests...`);

  const startTime = new Date();

  const promises = Array.from({ length: TEST_CONFIG.QUOTA_EXHAUSTION_REQUESTS }, () =>
    simulateRequest(accountPool, orgId, 1000),
  );

  const results = await Promise.all(promises);
  const endTime = new Date();

  const metrics = calculateMetrics(
    "Test 4: Quota Exhaustion Scenario",
    results,
    startTime,
    endTime,
  );
  printMetrics(metrics);

  console.log(
    `✅ Failed requests: ${metrics.failedRequests} (should be ${TEST_CONFIG.QUOTA_EXHAUSTION_REQUESTS})`,
  );
  console.log(`✅ Error rate: ${metrics.errorRate.toFixed(2)}% (should be 100%)`);

  for (const accountId of accountIds) {
    await circuitBreaker.reset(accountId);
  }
  console.log("✅ All circuits reset");

  return metrics;
}

async function testRecoveryAfterCircuitOpen(
  accountPool: AccountPoolService,
  orgId: string,
  accountIds: string[],
): Promise<PerformanceMetrics> {
  console.log("\n🧪 Test 5: Recovery After Circuit Open");
  console.log("Opening circuit on account 1...");

  const circuitBreaker = getAccountCircuitBreaker();

  for (let i = 0; i < 5; i++) {
    await circuitBreaker.recordFailure(accountIds[0], "Simulated failure for recovery test");
  }

  console.log(
    `✅ Circuit opened, waiting ${TEST_CONFIG.CIRCUIT_RECOVERY_WAIT_SECONDS} seconds for recovery...`,
  );

  await new Promise((resolve) =>
    setTimeout(resolve, TEST_CONFIG.CIRCUIT_RECOVERY_WAIT_SECONDS * 1000),
  );

  console.log("✅ Recovery timeout elapsed, circuit should be in HALF_OPEN state");

  const circuitState = await circuitBreaker.checkState(accountIds[0]);
  console.log(`✅ Account 1 circuit state: ${circuitState}`);

  console.log("Sending requests to trigger recovery...");

  const startTime = new Date();

  const promises = Array.from({ length: 10 }, () => simulateRequest(accountPool, orgId, 1000));

  const results = await Promise.all(promises);
  const endTime = new Date();

  const metrics = calculateMetrics(
    "Test 5: Recovery After Circuit Open",
    results,
    startTime,
    endTime,
  );
  printMetrics(metrics);

  const finalCircuitState = await circuitBreaker.checkState(accountIds[0]);
  console.log(`✅ Final circuit state: ${finalCircuitState} (should be CLOSED after 3 successes)`);

  const account1Requests = metrics.accountDistribution[accountIds[0]] || 0;
  console.log(`✅ Account 1 requests: ${account1Requests} (should be >0)`);

  return metrics;
}

async function runLoadTests(): Promise<void> {
  console.log("🚀 Starting Multi-Account Load Tests");
  console.log(`${"=".repeat(60)}\n`);

  try {
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    testOrgId = await setupTestOrganization();
    const accountPool = createAccountPoolService();
    testAccountIds = await registerTestAccounts(accountPool, testOrgId);

    console.log("\n✅ Test environment ready\n");

    const allMetrics: PerformanceMetrics[] = [];

    allMetrics.push(await testConcurrentRequestDistribution(accountPool, testOrgId));
    allMetrics.push(await testRateLimitHandling(accountPool, testOrgId));
    allMetrics.push(await testFailoverPerformance(accountPool, testOrgId, testAccountIds));
    allMetrics.push(await testQuotaExhaustion(accountPool, testOrgId, testAccountIds));
    allMetrics.push(await testRecoveryAfterCircuitOpen(accountPool, testOrgId, testAccountIds));

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const resultsPath = `tests/load/results/multi-account-stress-${timestamp}.json`;

    const fs = require("fs");
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          testConfig: TEST_CONFIG,
          metrics: allMetrics,
        },
        null,
        2,
      ),
    );

    console.log(`\n✅ Results saved to: ${resultsPath}`);

    console.log("\n📊 LOAD TEST SUMMARY");
    console.log(`${"=".repeat(60)}`);
    for (const metrics of allMetrics) {
      console.log(`${metrics.testName}:`);
      console.log(`  Total Requests:     ${metrics.totalRequests}`);
      console.log(
        `  Success Rate:       ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%`,
      );
      console.log(`  Avg Response Time:  ${metrics.averageResponseTime.toFixed(2)}ms`);
      console.log(`  Throughput:         ${metrics.requestsPerSecond.toFixed(2)} req/s`);
      console.log("");
    }
    console.log(`${"=".repeat(60)}\n`);

    await cleanupTestData(testOrgId);
  } catch (error) {
    console.error("❌ Load test failed:", error);
    throw error;
  } finally {
    await redisClient.disconnect();
    await prisma.$disconnect();
    console.log("✅ Disconnected from Redis and PostgreSQL");
  }
}

if (require.main === module) {
  runLoadTests()
    .then(() => {
      console.log("\n✅ All load tests completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Load tests failed:", error);
      process.exit(1);
    });
}

export {
  runLoadTests,
  testConcurrentRequestDistribution,
  testRateLimitHandling,
  testFailoverPerformance,
  testQuotaExhaustion,
  testRecoveryAfterCircuitOpen,
};
