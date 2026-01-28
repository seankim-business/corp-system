/**
 * E2E Test Infrastructure
 *
 * Provides comprehensive test setup for end-to-end testing of the agent system:
 * - Test database setup/teardown
 * - Mock services (Slack, Redis, external APIs)
 * - Helper functions for E2E testing
 * - Test context creation utilities
 */

import { config } from "dotenv";
import { randomUUID } from "crypto";

config({ path: ".env.test" });

// Mock external dependencies
jest.mock("../../db/client", () => ({
  db: {
    organization: {
      create: jest.fn().mockResolvedValue({ id: "test-org-id", name: "Test Org" }),
      findUnique: jest.fn().mockResolvedValue({ id: "test-org-id", name: "Test Org" }),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    },
    user: {
      create: jest.fn().mockResolvedValue({ id: "test-user-id", email: "test@test.com" }),
      findUnique: jest.fn().mockResolvedValue({ id: "test-user-id", email: "test@test.com" }),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue({}),
    },
    session: {
      create: jest.fn().mockResolvedValue({ id: "test-session-id" }),
      findUnique: jest.fn().mockResolvedValue({ id: "test-session-id" }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    approval: {
      create: jest.fn().mockResolvedValue({ id: "test-approval-id", status: "pending" }),
      findUnique: jest.fn().mockResolvedValue({ id: "test-approval-id", status: "pending" }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: "test-approval-id", status: "approved" }),
    },
    workflow: {
      create: jest.fn().mockResolvedValue({ id: "test-workflow-id" }),
      findUnique: jest.fn().mockResolvedValue({ id: "test-workflow-id" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    workflowExecution: {
      create: jest.fn().mockResolvedValue({ id: "test-execution-id" }),
      findUnique: jest.fn().mockResolvedValue({ id: "test-execution-id" }),
      update: jest.fn().mockResolvedValue({}),
    },
    orchestratorExecution: {
      create: jest.fn().mockResolvedValue({ id: "test-orch-execution-id" }),
    },
    sopExecution: {
      create: jest.fn().mockResolvedValue({ id: "test-sop-execution-id", status: "running" }),
      findUnique: jest.fn().mockResolvedValue({ id: "test-sop-execution-id", status: "running" }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((fn) =>
      fn({
        organization: { create: jest.fn(), findUnique: jest.fn() },
        user: { create: jest.fn(), findUnique: jest.fn() },
      }),
    ),
    $disconnect: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../db/redis", () => ({
  redis: createMockRedisClient(),
}));

jest.mock("../../orchestrator/delegate-task", () => ({
  delegateTask: jest.fn().mockResolvedValue({
    status: "success",
    output: "Mock agent output",
    metadata: {
      duration: 100,
      model: "mock",
    },
  }),
}));

jest.mock("../../services/approval-checker", () => ({
  createApprovalRequest: jest.fn().mockResolvedValue("test-approval-id"),
  checkApprovalStatus: jest.fn().mockResolvedValue({ status: "pending" }),
  ApprovalType: {
    CONTENT: "content",
    PRODUCT_LAUNCH: "product_launch",
    BUDGET: "budget",
  },
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../utils/metrics", () => ({
  metrics: {
    increment: jest.fn(),
    timing: jest.fn(),
    histogram: jest.fn(),
    gauge: jest.fn(),
  },
}));

// Types
export interface MockSlackEvent {
  type: "app_mention" | "message" | "slash_command";
  user: string;
  text: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  team?: string;
}

export interface MockSlackClient {
  chat: {
    postMessage: jest.Mock;
    update: jest.Mock;
  };
  team: {
    info: jest.Mock;
  };
  users: {
    info: jest.Mock;
  };
}

export interface TestOrchestrationRequest {
  userRequest: string;
  sessionId: string;
  organizationId: string;
  userId: string;
}

export interface TestWorkflowContext {
  organizationId: string;
  userId: string;
  sessionId: string;
  variables: Record<string, unknown>;
  nodeResults: Record<string, unknown>;
  currentNode: string;
  status: "pending" | "running" | "waiting_approval" | "completed" | "failed";
  startedAt: Date;
  completedAt?: Date;
}

// Mock Redis Client
export function createMockRedisClient() {
  const store = new Map<string, string>();
  const expiries = new Map<string, number>();

  return {
    get: jest.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: jest.fn((key: string, value: string, ttlSeconds?: number) => {
      store.set(key, value);
      if (ttlSeconds) {
        expiries.set(key, Date.now() + ttlSeconds * 1000);
      }
      return Promise.resolve("OK");
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      expiries.delete(key);
      return Promise.resolve(1);
    }),
    exists: jest.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    expire: jest.fn((key: string, ttl: number) => {
      expiries.set(key, Date.now() + ttl * 1000);
      return Promise.resolve(1);
    }),
    incr: jest.fn((key: string) => {
      const current = parseInt(store.get(key) || "0", 10);
      store.set(key, String(current + 1));
      return Promise.resolve(current + 1);
    }),
    hset: jest.fn(),
    hget: jest.fn(),
    hgetall: jest.fn().mockResolvedValue({}),
    hdel: jest.fn(),
    lpush: jest.fn(),
    rpop: jest.fn(),
    lrange: jest.fn().mockResolvedValue([]),
    sadd: jest.fn(),
    smembers: jest.fn().mockResolvedValue([]),
    srem: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    flushall: jest.fn(() => {
      store.clear();
      expiries.clear();
      return Promise.resolve("OK");
    }),
    quit: jest.fn().mockResolvedValue("OK"),
    _store: store,
    _expiries: expiries,
  };
}

export const mockRedisClient = createMockRedisClient();

// Mock Slack Client
export function createMockSlackClient(): MockSlackClient {
  return {
    chat: {
      postMessage: jest.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
      update: jest.fn().mockResolvedValue({ ok: true }),
    },
    team: {
      info: jest.fn().mockResolvedValue({
        ok: true,
        team: { id: "T12345678", name: "Test Workspace" },
      }),
    },
    users: {
      info: jest.fn().mockResolvedValue({
        ok: true,
        user: {
          id: "U12345678",
          name: "testuser",
          real_name: "Test User",
          profile: { email: "test@test.com" },
        },
      }),
    },
  };
}

export const mockSlackClient = createMockSlackClient();

// Test Database Setup
let testDbInitialized = false;

export async function setupTestDatabase(): Promise<void> {
  if (testDbInitialized) return;

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://test:test@localhost:5432/nubabel_test";

  // Reset mocks
  jest.clearAllMocks();

  testDbInitialized = true;
}

export async function teardownTestDatabase(): Promise<void> {
  if (!testDbInitialized) return;

  // Clear mock data
  mockRedisClient.flushall();
  jest.clearAllMocks();

  testDbInitialized = false;
}

// Helper Functions
export function createMockSlackEvent(overrides: Partial<MockSlackEvent> = {}): MockSlackEvent {
  return {
    type: "app_mention",
    user: "U12345678",
    text: "Test message",
    channel: "C12345678",
    ts: Date.now().toString(),
    team: "T12345678",
    ...overrides,
  };
}

export function createMockContext(overrides: Partial<TestWorkflowContext> = {}): TestWorkflowContext {
  return {
    organizationId: "test-org-id",
    userId: "test-user-id",
    sessionId: "test-session-id",
    variables: { userRequest: "Test request" },
    nodeResults: {},
    currentNode: "START",
    status: "pending",
    startedAt: new Date(),
    ...overrides,
  };
}

export function createTestOrchestrationRequest(
  overrides: Partial<TestOrchestrationRequest> = {},
): TestOrchestrationRequest {
  return {
    userRequest: "Test request",
    sessionId: randomUUID(),
    organizationId: "test-org-id",
    userId: "test-user-id",
    ...overrides,
  };
}

export function createMockApproval(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    organizationId: "test-org-id",
    requesterId: "test-user-id",
    approverId: "test-approver-id",
    type: "content",
    title: "Test Approval",
    description: "Test approval request",
    status: "pending",
    context: {},
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockSOPExecution(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: randomUUID(),
    sopId: "customer-onboarding",
    organizationId: "test-org-id",
    userId: "test-user-id",
    status: "running",
    currentStepIndex: 0,
    stepResults: [],
    context: {},
    startedAt: new Date(),
    ...overrides,
  };
}

// Async test helpers
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await condition();
    if (result) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

export async function waitForTimeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock workflow helpers
export function createMockWorkflow(name: string, nodes: unknown[] = [], edges: unknown[] = []) {
  return {
    name,
    version: "1.0.0",
    defaultTimeout: 60000,
    nodes: nodes.length > 0 ? nodes : [
      { id: "step1", type: "agent", agentId: "product-agent" },
      { id: "step2", type: "parallel", parallelAgents: ["brand-agent", "ops-agent"] },
      { id: "step3", type: "human_approval", approvalType: "product_launch" },
    ],
    edges: edges.length > 0 ? edges : [
      { from: "START", to: "step1" },
      { from: "step1", to: "step2" },
      { from: "step2", to: "step3" },
      { from: "step3", to: "END" },
    ],
  };
}

// Agent routing helpers
export interface RoutingResult {
  agentId: string;
  confidence: number;
  action?: string;
  requiresMultiAgent?: boolean;
  agents?: string[];
}

export async function routeRequest(request: string): Promise<RoutingResult> {
  const { analyzeRequestEnhanced } = await import("../../orchestrator/request-analyzer");
  const analysis = await analyzeRequestEnhanced(request);

  // Determine agent based on keywords
  const agentKeywords: Record<string, string[]> = {
    "brand-agent": ["캠페인", "브리프", "콘텐츠", "브랜드", "마케팅", "campaign", "brief", "brand"],
    "finance-agent": ["예산", "확인", "비용", "budget", "finance", "cost"],
    "product-agent": ["제품", "출시", "product", "launch"],
    "ops-agent": ["운영", "작업", "operations", "ops"],
    "data-agent": ["데이터", "분석", "통계", "data", "analytics", "stats"],
  };

  let selectedAgent = "general-agent";
  let maxScore = 0;

  const lowercased = request.toLowerCase();
  for (const [agentId, keywords] of Object.entries(agentKeywords)) {
    const score = keywords.filter((kw) => lowercased.includes(kw)).length;
    if (score > maxScore) {
      maxScore = score;
      selectedAgent = agentId;
    }
  }

  // Check for ambiguous requests
  const isAmbiguous = analysis.ambiguity?.isAmbiguous || request.trim().length < 5;

  if (isAmbiguous) {
    return {
      agentId: "general-agent",
      confidence: 0.3,
      action: "ask_clarification",
    };
  }

  // Check for multi-agent requirement
  if (analysis.requiresMultiAgent) {
    const agents = Object.entries(agentKeywords)
      .filter(([, keywords]) => keywords.some((kw) => lowercased.includes(kw)))
      .map(([agentId]) => agentId);

    return {
      agentId: selectedAgent,
      confidence: Math.min(0.9, maxScore * 0.3),
      requiresMultiAgent: true,
      agents,
    };
  }

  return {
    agentId: selectedAgent,
    confidence: Math.min(0.95, 0.5 + maxScore * 0.2),
  };
}

// Test data generators
export function generateTestCustomer() {
  return {
    id: randomUUID(),
    name: "Test Customer",
    email: "customer@test.com",
    company: "Test Company",
    plan: "enterprise",
  };
}

export function generateTestWorkflowExecution() {
  return {
    id: randomUUID(),
    workflowName: "product-launch",
    status: "running",
    context: createMockContext(),
    startedAt: new Date(),
  };
}

// Global test setup
beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});

beforeEach(() => {
  jest.clearAllMocks();
});
