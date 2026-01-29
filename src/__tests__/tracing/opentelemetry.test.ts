jest.mock("@anthropic-ai/sdk", () => {
  const createMessageMock = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: createMessageMock,
      },
    })),
    __createMessageMock: createMessageMock,
  };
});

jest.mock("../../services/metrics", () => {
  const { createMetricsMock } = require("../utils/mock-metrics");
  return {
    ...createMetricsMock(),
    recordMcpToolCall: jest.fn(),
  };
});

jest.mock("../../services/cost-tracker", () => ({
  trackUsage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock("../../utils/circuit-breaker", () => ({
  getCircuitBreaker: jest.fn().mockReturnValue({
    execute: (operation: () => Promise<unknown>) => operation(),
  }),
}));

jest.mock("../../db/client", () => ({
  db: {
    orchestratorExecution: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("../../orchestrator/request-analyzer", () => ({
  analyzeRequest: jest.fn().mockResolvedValue({
    intent: "create",
    entities: { target: "notion" },
    keywords: ["notion"],
    requiresMultiAgent: false,
    complexity: "low",
  }),
}));

jest.mock("../../orchestrator/category-selector", () => ({
  selectCategoryHybrid: jest.fn().mockResolvedValue({
    category: "quick",
    confidence: 0.9,
    method: "keyword",
    matchedKeywords: ["notion"],
  }),
}));

jest.mock("../../orchestrator/skill-selector", () => ({
  selectSkillsEnhanced: jest.fn().mockReturnValue({
    skills: ["mcp-integration"],
    scores: { "mcp-integration": 2 },
    dependencies: [],
    conflicts: [],
  }),
}));

jest.mock("../../orchestrator/session-state", () => ({
  getSessionState: jest.fn().mockResolvedValue({
    conversationDepth: 1,
    lastCategory: "quick",
  }),
  updateSessionState: jest.fn().mockResolvedValue(undefined),
  isFollowUpQuery: jest.fn().mockReturnValue(false),
  applyContextBoost: jest.fn((confidence: number) => confidence),
}));

jest.mock("../../services/mcp-registry", () => ({
  getActiveMCPConnections: jest.fn().mockResolvedValue([]),
  getAccessTokenFromConfig: jest.fn().mockReturnValue(null),
  isTokenExpired: jest.fn().mockReturnValue(false),
  refreshOAuthToken: jest.fn(),
}));

jest.mock("../../orchestrator/delegate-task", () => ({
  delegateTask: jest.fn().mockResolvedValue({
    status: "success",
    output: "ok",
    metadata: { model: "test-model", duration: 1200 },
  }),
}));

jest.mock("@notionhq/client", () => ({
  Client: jest.fn().mockImplementation(() => ({
    search: jest.fn(),
    databases: {
      query: jest.fn().mockResolvedValue({ results: [], has_more: false, next_cursor: null }),
    },
    pages: {
      create: jest.fn(),
      update: jest.fn(),
    },
  })),
}));

import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  context,
  ContextManager,
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Context,
} from "@opentelemetry/api";
import { executeWithAI } from "../../orchestrator/ai-executor";
import { orchestrate } from "../../orchestrator";
import { NotionClient } from "../../mcp-servers/notion/client";
import { LinearClient } from "../../mcp-servers/linear/client";
import { GitHubClient } from "../../mcp-servers/github/client";

const { __createMessageMock } = jest.requireMock("@anthropic-ai/sdk");
const createMessageMock = __createMessageMock as jest.Mock;

describe("OpenTelemetry manual spans", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  class TestContextManager implements ContextManager {
    private activeContext: Context = ROOT_CONTEXT;

    active(): Context {
      return this.activeContext;
    }

    with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
      ctx: Context,
      fn: F,
      thisArg?: ThisParameterType<F>,
      ...args: A
    ): ReturnType<F> {
      const previous = this.activeContext;
      this.activeContext = ctx;
      const result = fn.call(thisArg, ...args);
      const maybePromise = result as unknown as Promise<ReturnType<F>>;
      if (result && typeof maybePromise.finally === "function") {
        return maybePromise.finally(() => {
          this.activeContext = previous;
        }) as ReturnType<F>;
      }
      this.activeContext = previous;
      return result;
    }

    bind<T>(_context: Context, target: T): T {
      return target;
    }

    enable(): this {
      return this;
    }

    disable(): this {
      return this;
    }
  }

  beforeAll(() => {
    const contextManager = new TestContextManager().enable();
    context.setGlobalContextManager(contextManager);
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(
      provider as unknown as Parameters<typeof trace.setGlobalTracerProvider>[0],
    );
  });

  beforeEach(() => {
    exporter.reset();
    jest.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NODE_ENV = "test";
  });

  afterAll(async () => {
    await provider.shutdown();
  });

  it("creates orchestrator spans with attributes and relationships", async () => {
    const tracer = trace.getTracer("test");
    const rootSpan = tracer.startSpan("root");

    await context.with(trace.setSpan(context.active(), rootSpan), async () => {
      await orchestrate({
        userRequest: "Create a task",
        sessionId: "session-1",
        organizationId: "org-1",
        userId: "user-1",
      });
    });

    rootSpan.end();

    const spans = exporter.getFinishedSpans();
    const orchestrateSpan = spans.find((span) => span.name === "orchestrator.orchestrate");
    const analyzeSpan = spans.find((span) => span.name === "orchestrator.analyze_request");
    const categorySpan = spans.find((span) => span.name === "orchestrator.select_category");
    const skillSpan = spans.find((span) => span.name === "orchestrator.select_skills");
    const executeSpan = spans.find((span) => span.name === "orchestrator.execute");

    expect(orchestrateSpan).toBeTruthy();
    expect(analyzeSpan).toBeTruthy();
    expect(categorySpan).toBeTruthy();
    expect(skillSpan).toBeTruthy();
    expect(executeSpan).toBeTruthy();

    expect(orchestrateSpan?.attributes["organization.id"]).toBe("org-1");
    expect(orchestrateSpan?.attributes["user.id"]).toBe("user-1");
    expect(orchestrateSpan?.attributes["environment"]).toBe("test");
    expect(orchestrateSpan?.attributes["intent"]).toBe("create");
    expect(orchestrateSpan?.attributes["category"]).toBe("quick");
    expect(orchestrateSpan?.attributes["complexity"]).toBe("low");
    expect(orchestrateSpan?.attributes["skills.names"]).toBe("mcp-integration");

    const orchestrateSpanId = orchestrateSpan?.spanContext().spanId;
    const getParentSpanId = (span: unknown) => {
      const candidate = span as { parentSpanId?: string; parentSpanContext?: { spanId?: string } };
      return candidate?.parentSpanId ?? candidate?.parentSpanContext?.spanId;
    };
    expect(getParentSpanId(analyzeSpan)).toBe(orchestrateSpanId);
    expect(getParentSpanId(categorySpan)).toBe(orchestrateSpanId);
    expect(getParentSpanId(skillSpan)).toBe(orchestrateSpanId);
    expect(getParentSpanId(executeSpan)).toBe(orchestrateSpanId);
  });

  it("captures AI executor spans and error status", async () => {
    createMessageMock.mockRejectedValueOnce(new Error("boom"));

    const tracer = trace.getTracer("test");
    const rootSpan = tracer.startSpan("root");

    await context.with(trace.setSpan(context.active(), rootSpan), async () => {
      const result = await executeWithAI({
        category: "quick",
        skills: [],
        prompt: "Hello",
        sessionId: "session-2",
        organizationId: "org-2",
        userId: "user-2",
      });
      expect(result.status).toBe("failed");
    });

    rootSpan.end();

    const spans = exporter.getFinishedSpans();
    const executeSpan = spans.find((span) => span.name === "ai_executor.execute");

    expect(executeSpan).toBeTruthy();
    expect(executeSpan?.attributes["organization.id"]).toBe("org-2");
    expect(executeSpan?.attributes["user.id"]).toBe("user-2");
    expect(executeSpan?.status.code).toBe(SpanStatusCode.ERROR);
    expect(executeSpan?.events.some((event) => event.name === "exception")).toBe(true);
  });

  it("records MCP client spans with multi-tenant attributes", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn() as unknown as typeof fetch;

    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          data: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } },
        }),
        text: jest.fn(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue([]),
        text: jest.fn(),
      });

    const tracer = trace.getTracer("test");
    const rootSpan = tracer.startSpan("root");

    await context.with(trace.setSpan(context.active(), rootSpan), async () => {
      const notionClient = new NotionClient("token", {
        connectionId: "conn-1",
        organizationId: "org-3",
        userId: "user-3",
      });
      await notionClient.getTasks("db-1");

      const linearClient = new LinearClient("token", {
        connectionId: "conn-2",
        organizationId: "org-3",
        userId: "user-3",
      });
      await linearClient.getIssues({ teamId: "team-1" });

      const githubClient = new GitHubClient("token", {
        connectionId: "conn-3",
        organizationId: "org-3",
        userId: "user-3",
      });
      await githubClient.getIssues({ owner: "octo", repo: "repo" });
    });

    rootSpan.end();
    global.fetch = originalFetch;

    const spans = exporter.getFinishedSpans();
    const notionSpan = spans.find((span) => span.name === "mcp.notion.get_tasks");
    const linearSpan = spans.find((span) => span.name === "mcp.linear.get_issues");
    const githubSpan = spans.find((span) => span.name === "mcp.github.get_issues");

    expect(notionSpan).toBeTruthy();
    expect(linearSpan).toBeTruthy();
    expect(githubSpan).toBeTruthy();

    for (const span of [notionSpan, linearSpan, githubSpan]) {
      expect(span?.attributes["organization.id"]).toBe("org-3");
      expect(span?.attributes["user.id"]).toBe("user-3");
      expect(span?.attributes["environment"]).toBe("test");
      expect(span?.attributes["mcp.connection_id"]).toBeDefined();
      const parentSpanId = (
        span as { parentSpanId?: string; parentSpanContext?: { spanId?: string } }
      )?.parentSpanId;
      const parentContextSpanId = (
        span as { parentSpanId?: string; parentSpanContext?: { spanId?: string } }
      )?.parentSpanContext?.spanId;
      expect(parentSpanId ?? parentContextSpanId).toBe(rootSpan.spanContext().spanId);
    }
  });
});
