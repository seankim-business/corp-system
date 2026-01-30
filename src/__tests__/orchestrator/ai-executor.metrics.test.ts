jest.mock("@anthropic-ai/sdk", () => {
  const createMessageMock = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: createMessageMock,
      },
    })),
    APIError: class APIError extends Error {
      status: number;
      constructor(message: string, status: number) {
        super(message);
        this.status = status;
      }
    },
    __createMessageMock: createMessageMock,
  };
});

jest.mock("../../services/metrics", () => {
  const { createMetricsMock } = require("../utils/mock-metrics");
  return createMetricsMock();
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

jest.mock("../../services/anthropic-metrics", () => ({
  anthropicMetricsTracker: {
    recordRequest: jest.fn().mockResolvedValue(undefined),
    recordRateLimit: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("../../services/slack-anthropic-alerts", () => ({
  getSlackAlerts: jest.fn().mockReturnValue(null),
}));

jest.mock("../../mcp/registry", () => ({
  mcpRegistry: {
    getToolsForAgent: jest.fn().mockReturnValue([]),
    getTool: jest.fn().mockReturnValue(undefined),
    callTool: jest.fn(),
  },
}));

jest.mock("../../mcp/providers", () => ({
  getAllProviderTools: jest.fn().mockReturnValue([]),
  executeProviderTool: jest.fn().mockResolvedValue({ success: false, error: { message: "Not found" } }),
}));

jest.mock("../../services/mcp-registry", () => ({
  getActiveMCPConnections: jest.fn().mockResolvedValue([]),
  getAccessTokenFromConfig: jest.fn().mockReturnValue(null),
}));

jest.mock("../../api/organization-settings", () => ({
  getOrganizationApiKey: jest.fn().mockResolvedValue(null),
}));

jest.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: jest.fn().mockReturnValue({
      startActiveSpan: jest.fn((_name, fn) => fn({
        setAttribute: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
      })),
    }),
  },
  SpanStatusCode: {
    OK: 0,
    ERROR: 1,
  },
}));

import { executeWithAI } from "../../orchestrator/ai-executor";
import { recordAiRequest } from "../../services/metrics";

const { __createMessageMock } = jest.requireMock("@anthropic-ai/sdk");
const createMessageMock = __createMessageMock as jest.Mock;

describe("executeWithAI metrics", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    createMessageMock.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("records metrics on successful AI execution", async () => {
    createMessageMock.mockResolvedValueOnce({
      usage: { input_tokens: 12, output_tokens: 5 },
      content: [{ type: "text", text: "ok" }],
    });

    jest
      .spyOn(Date, "now")
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1100)
      .mockReturnValueOnce(1300)
      .mockReturnValueOnce(1600);

    const result = await executeWithAI({
      category: "quick",
      skills: [],
      prompt: "Hello",
      sessionId: "session-1",
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(result.status).toBe("success");
    expect(recordAiRequest).toHaveBeenCalledWith({
      model: "claude-3-5-haiku-20241022",
      category: "quick",
      success: true,
      duration: 600,
      inputTokens: 12,
      outputTokens: 5,
    });
  });

  it("records metrics on failed AI execution", async () => {
    createMessageMock.mockRejectedValueOnce(new Error("boom"));
    jest
      .spyOn(Date, "now")
      .mockReturnValueOnce(2000)
      .mockReturnValueOnce(2100)
      .mockReturnValueOnce(2300);

    const result = await executeWithAI({
      category: "quick",
      skills: [],
      prompt: "Hello",
      sessionId: "session-2",
      organizationId: "org-1",
      userId: "user-1",
    });

    expect(result.status).toBe("failed");
    expect(recordAiRequest).toHaveBeenCalledWith({
      model: "claude-3-5-haiku-20241022",
      category: "quick",
      success: false,
      duration: 300,
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});
