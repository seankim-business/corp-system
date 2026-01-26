jest.mock("../../services/metrics", () => ({
  recordMcpToolCall: jest.fn(),
}));

jest.mock("../../utils/circuit-breaker", () => ({
  getCircuitBreaker: jest.fn().mockReturnValue({
    execute: (operation: () => Promise<unknown>) => operation(),
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

import { NotionClient } from "../../mcp-servers/notion/client";
import { LinearClient } from "../../mcp-servers/linear/client";
import { GitHubClient } from "../../mcp-servers/github/client";
import { recordMcpToolCall } from "../../services/metrics";

describe("MCP client metrics", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("records metrics for Notion client tool calls", async () => {
    jest.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(1200);

    const client = new NotionClient("token");
    await client.getTasks("db-1");

    expect(recordMcpToolCall).toHaveBeenCalledWith({
      provider: "notion",
      toolName: "getTasks",
      success: true,
      duration: 200,
    });
  });

  it("records metrics for Linear client tool calls", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        data: {
          issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
        },
      }),
      text: jest.fn(),
    });

    jest.spyOn(Date, "now").mockReturnValueOnce(2000).mockReturnValueOnce(2300);

    const client = new LinearClient("token");
    await client.getIssues({ teamId: "team-1" });

    expect(recordMcpToolCall).toHaveBeenCalledWith({
      provider: "linear",
      toolName: "getIssues",
      success: true,
      duration: 300,
    });
  });

  it("records metrics for GitHub client tool calls", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue([]),
      text: jest.fn(),
    });

    jest.spyOn(Date, "now").mockReturnValueOnce(3000).mockReturnValueOnce(3400);

    const client = new GitHubClient("token");
    await client.getIssues({ owner: "octo", repo: "repo" });

    expect(recordMcpToolCall).toHaveBeenCalledWith({
      provider: "github",
      toolName: "getIssues",
      success: true,
      duration: 400,
    });
  });
});
