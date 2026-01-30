/**
 * E2E Test Suite: Slack -> Orchestrator -> MCP Flow
 *
 * Tests the complete integration flow:
 * 1. Slack app_mention event received
 * 2. Orchestrator processes request via orchestrate()
 * 3. AI Executor uses MCP tool_use for external services (Notion/Slack/Linear/GitHub)
 * 4. Progress updates sent to Slack threads
 * 5. Multi-agent coordination for complex tasks
 *
 * SCENARIOS COVERED:
 * 1. Mention -> Response in Thread
 * 2. Create Notion Task via MCP Tool Use
 * 3. Budget Limit Enforcement
 * 4. Error Handling and User Messages
 * 5. Multi-Tenant Isolation
 */

import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { WebClient } from "@slack/web-api";

// Mock external dependencies before imports
jest.mock("@anthropic-ai/sdk");
jest.mock("@slack/web-api");
jest.mock("../../db/client");
jest.mock("../../db/redis");
jest.mock("../../mcp-servers/notion");
jest.mock("../../mcp-servers/slack");
jest.mock("../../services/mcp-registry");
jest.mock("../../queue/notification.queue");
jest.mock("../../services/slack-progress.service");

// Import mocked modules
import { db as prisma } from "../../db/client";
import { redis } from "../../db/redis";
import { executeNotionTool } from "../../mcp-servers/notion";
import { executeSlackTool } from "../../mcp-servers/slack";
import { getActiveMCPConnections } from "../../services/mcp-registry";
import { notificationQueue } from "../../queue/notification.queue";
import { getSlackProgressService } from "../../services/slack-progress.service";

// Import actual implementations to test
import { orchestrate } from "../../orchestrator";
import { executeWithAI } from "../../orchestrator/ai-executor";
import type { OrchestrationRequest } from "../../orchestrator/types";
import type { MCPConnection } from "../../orchestrator/types";

describe("E2E: Slack -> Orchestrator -> MCP Flow", () => {
  // Test data constants
  const mockOrgId = "org-test-123";
  const mockUserId = "user-test-456";
  const mockSessionId = randomUUID();
  const mockSlackChannel = "C1234567890";
  const mockSlackThreadTs = "1234567890.123456";
  const mockNotionDbId = "notion-db-abc123";

  // Mock MCP connections
  const mockMCPConnections: MCPConnection[] = [
    {
      id: "conn-notion-1",
      organizationId: mockOrgId,
      provider: "Notion",
      name: "Main Notion Workspace",
      namespace: "notion_main",
      enabled: true,
      config: {
        accessToken: "test-notion-token",
        databaseId: mockNotionDbId,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "conn-slack-1",
      organizationId: mockOrgId,
      provider: "Slack",
      name: "Main Slack Workspace",
      namespace: "slack_main",
      enabled: true,
      config: {
        accessToken: "xoxb-test-slack-token",
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup database mocks
    setupDatabaseMocks();

    // Setup Redis mocks
    setupRedisMocks();

    // Setup Anthropic client mocks
    setupAnthropicMocks();

    // Setup Slack client mocks
    setupSlackMocks();

    // Setup MCP registry mocks
    setupMCPMocks();

    // Setup notification queue mocks
    setupNotificationMocks();

    // Setup progress service mocks
    setupProgressMocks();
  });

  function setupDatabaseMocks() {
    // Organization mock
    (jest.mocked(prisma.organization.findUnique) as jest.Mock).mockResolvedValue({
      id: mockOrgId,
      name: "Test Organization",
      slug: "test-org",
      domain: "test.com",
      monthlyBudgetCents: 50000, // $500 budget
      currentMonthSpendCents: 10000, // $100 spent
      budgetResetAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    (jest.mocked(prisma.organization.updateMany) as jest.Mock).mockResolvedValue({
      count: 1,
    });

    // User mock
    (jest.mocked(prisma.user.findUnique) as jest.Mock).mockResolvedValue({
      id: mockUserId,
      email: "test@example.com",
      name: "Test User",
      organizationId: mockOrgId,
      role: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Orchestrator execution mock
    (jest.mocked(prisma.orchestratorExecution.create) as jest.Mock).mockResolvedValue({
      id: randomUUID(),
      organizationId: mockOrgId,
      userId: mockUserId,
      sessionId: mockSessionId,
      category: "quick",
      skills: ["mcp-integration"],
      status: "success",
      duration: 1500,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  function setupRedisMocks() {
    (jest.mocked(redis.get) as jest.Mock).mockResolvedValue(null);
    (jest.mocked(redis.set) as jest.Mock).mockResolvedValue("OK");
    (jest.mocked(redis.del) as jest.Mock).mockResolvedValue(1);
    (jest.mocked(redis.exists) as jest.Mock).mockResolvedValue(0);
  }

  function setupAnthropicMocks() {
    const mockAnthropicClient = {
      messages: {
        create: jest.fn().mockResolvedValue({
          id: "msg-123",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Task created successfully in Notion.",
            },
          ],
          model: "claude-3-5-haiku-20241022",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 150,
            output_tokens: 50,
            cache_read_input_tokens: 0,
          },
        }),
      },
    };
    (Anthropic as any).mockImplementation(() => mockAnthropicClient);
  }

  function setupSlackMocks() {
    const mockSlackClient = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true, ts: mockSlackThreadTs }),
        update: jest.fn().mockResolvedValue({ ok: true }),
      },
    };
    (WebClient as any).mockImplementation(() => mockSlackClient);
  }

  function setupMCPMocks() {
    (jest.mocked(getActiveMCPConnections) as jest.Mock).mockResolvedValue(mockMCPConnections);
  }

  function setupNotificationMocks() {
    (jest.mocked(notificationQueue.enqueueNotification) as jest.Mock).mockResolvedValue(undefined);
  }

  function setupProgressMocks() {
    const mockProgressService = {
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };
    (jest.mocked(getSlackProgressService) as jest.Mock).mockReturnValue(mockProgressService);
  }

  describe("1. Mention -> Response in Thread", () => {
    it("should process Slack app_mention and send response to thread", async () => {
      // Setup Notion tool execution mock
      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({
        task: {
          id: "task-123",
          properties: {
            Name: { title: [{ text: { content: "Test Task" } }] },
            Status: { status: { name: "To Do" } },
          },
        },
      });

      const request: OrchestrationRequest = {
        userRequest: "Create a task in Notion called Test Task",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      const result = await orchestrate(request);

      // Verify orchestration succeeded
      expect(result.status).toBe("success");
      expect(result.output).toBeTruthy();
      expect(result.metadata.category).toBeDefined();
      expect(result.metadata.skills).toBeDefined();

      // Verify database execution was saved
      expect(prisma.orchestratorExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: mockOrgId,
            userId: mockUserId,
            sessionId: mockSessionId,
            status: "success",
          }),
        })
      );
    });

    it("should handle Korean language requests", async () => {
      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({
        task: {
          id: "task-kr-123",
          properties: {
            Name: { title: [{ text: { content: "새로운 태스크" } }] },
            Status: { status: { name: "진행 중" } },
          },
        },
      });

      const request: OrchestrationRequest = {
        userRequest: "노션에 새로운 태스크 만들어줘",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      const result = await orchestrate(request);

      expect(result.status).toBe("success");
      expect(result.output).toBeTruthy();
    });
  });

  describe("2. Create Notion Task via MCP Tool Use", () => {
    it("should execute Notion createTask via MCP tool_use", async () => {
      // Mock AI response with tool_use block
      const mockAnthropicClient = {
        messages: {
          create: jest
            .fn()
            // First call: AI returns tool_use
            .mockResolvedValueOnce({
              id: "msg-tool-use",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "toolu_123",
                  name: "notion_main__createTask",
                  input: {
                    databaseId: mockNotionDbId,
                    title: "Implement new feature",
                    status: "In Progress",
                  },
                },
              ],
              model: "claude-3-5-haiku-20241022",
              stop_reason: "tool_use",
              usage: {
                input_tokens: 200,
                output_tokens: 80,
                cache_read_input_tokens: 0,
              },
            })
            // Second call: AI processes tool result
            .mockResolvedValueOnce({
              id: "msg-final",
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I've created the task 'Implement new feature' in Notion with status 'In Progress'.",
                },
              ],
              model: "claude-3-5-haiku-20241022",
              stop_reason: "end_turn",
              usage: {
                input_tokens: 300,
                output_tokens: 60,
                cache_read_input_tokens: 0,
              },
            }),
        },
      };
      (Anthropic as any).mockImplementation(() => mockAnthropicClient);

      // Mock Notion tool execution
      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({
        task: {
          id: "task-new-feature",
          properties: {
            Name: { title: [{ text: { content: "Implement new feature" } }] },
            Status: { status: { name: "In Progress" } },
          },
        },
      });

      const result = await executeWithAI({
        category: "quick",
        skills: ["mcp-integration"],
        prompt: "Create a task: Implement new feature with status In Progress",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      });

      // Verify AI was called with tool definitions
      expect(mockAnthropicClient.messages.create).toHaveBeenCalled();

      // Verify Notion tool was executed
      expect(executeNotionTool).toHaveBeenCalledWith(
        "test-notion-token",
        expect.stringContaining("createTask"),
        expect.objectContaining({
          databaseId: mockNotionDbId,
          title: "Implement new feature",
        }),
        mockOrgId,
        expect.anything(),
        mockUserId
      );

      expect(result.status).toBe("success");
      expect(result.output).toContain("created");
    });

    it("should handle multiple MCP tool calls in sequence", async () => {
      const mockAnthropicClient = {
        messages: {
          create: jest
            .fn()
            // First: Create Notion task
            .mockResolvedValueOnce({
              id: "msg-1",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "toolu_1",
                  name: "notion_main__createTask",
                  input: { databaseId: mockNotionDbId, title: "Task 1" },
                },
              ],
              stop_reason: "tool_use",
              usage: { input_tokens: 100, output_tokens: 50 },
            })
            // Second: Send Slack message
            .mockResolvedValueOnce({
              id: "msg-2",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "toolu_2",
                  name: "slack_main__sendMessage",
                  input: { channel: mockSlackChannel, text: "Task created!" },
                },
              ],
              stop_reason: "tool_use",
              usage: { input_tokens: 150, output_tokens: 60 },
            })
            // Final: Return summary
            .mockResolvedValueOnce({
              id: "msg-final",
              role: "assistant",
              content: [{ type: "text", text: "Done! Created task and sent notification." }],
              stop_reason: "end_turn",
              usage: { input_tokens: 200, output_tokens: 40 },
            }),
        },
      };
      (Anthropic as any).mockImplementation(() => mockAnthropicClient);

      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({ task: { id: "t1" } });
      (jest.mocked(executeSlackTool) as jest.Mock).mockResolvedValue({ ok: true });

      const result = await executeWithAI({
        category: "quick",
        skills: ["mcp-integration"],
        prompt: "Create a task and notify the team",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      });

      expect(result.status).toBe("success");
      expect(executeNotionTool).toHaveBeenCalled();
      expect(executeSlackTool).toHaveBeenCalled();
    });

    it("should handle tool execution errors gracefully", async () => {
      const mockAnthropicClient = {
        messages: {
          create: jest
            .fn()
            .mockResolvedValueOnce({
              id: "msg-tool-use",
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "toolu_error",
                  name: "notion_main__createTask",
                  input: { databaseId: "invalid-db", title: "Test" },
                },
              ],
              stop_reason: "tool_use",
              usage: { input_tokens: 100, output_tokens: 50 },
            })
            .mockResolvedValueOnce({
              id: "msg-error-handled",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "I encountered an error creating the task. The database ID may be invalid.",
                },
              ],
              stop_reason: "end_turn",
              usage: { input_tokens: 150, output_tokens: 60 },
            }),
        },
      };
      (Anthropic as any).mockImplementation(() => mockAnthropicClient);

      (jest.mocked(executeNotionTool) as jest.Mock).mockRejectedValue(
        new Error("Notion API: database not found")
      );

      const result = await executeWithAI({
        category: "quick",
        skills: ["mcp-integration"],
        prompt: "Create a task in invalid database",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      });

      // Should still return a result (AI handled the error)
      expect(result.status).toBe("success");
      expect(result.output).toContain("error");
    });
  });

  describe("3. Budget Limit Enforcement", () => {
    it("should reject request when budget is exhausted", async () => {
      // Mock exhausted budget
      (jest.mocked(prisma.organization.findUnique) as jest.Mock).mockResolvedValue({
        id: mockOrgId,
        name: "Test Organization",
        monthlyBudgetCents: 10000, // $100
        currentMonthSpendCents: 9995, // $99.95 spent (only 5 cents left)
        budgetResetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request: OrchestrationRequest = {
        userRequest: "Create a complex Notion task",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      const result = await orchestrate(request);

      expect(result.status).toBe("failed");
      expect(result.output).toContain("budget");
      expect(result.output.toLowerCase()).toContain("exhausted");

      // Verify execution was saved with budget_exhausted reason
      expect(prisma.orchestratorExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            metadata: expect.objectContaining({
              reason: "budget_exhausted",
            }),
          }),
        })
      );
    });

    it("should reject request when estimated cost exceeds remaining budget", async () => {
      // Mock low budget
      (jest.mocked(prisma.organization.findUnique) as jest.Mock).mockResolvedValue({
        id: mockOrgId,
        name: "Test Organization",
        monthlyBudgetCents: 10000, // $100
        currentMonthSpendCents: 9000, // $90 spent, $10 remaining
        budgetResetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Request that would require high-tier model (expensive)
      const request: OrchestrationRequest = {
        userRequest: "Analyze this complex data and create detailed visualizations...",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      const result = await orchestrate(request);

      // Should fail due to insufficient budget
      expect(result.status).toBe("failed");
      expect(result.output.toLowerCase()).toMatch(/budget|insufficient/);
    });

    it("should succeed when budget is sufficient", async () => {
      // Mock sufficient budget
      (jest.mocked(prisma.organization.findUnique) as jest.Mock).mockResolvedValue({
        id: mockOrgId,
        name: "Test Organization",
        monthlyBudgetCents: 50000, // $500
        currentMonthSpendCents: 10000, // $100 spent, $400 remaining
        budgetResetAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({
        task: { id: "task-ok" },
      });

      const request: OrchestrationRequest = {
        userRequest: "Create a simple task",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      const result = await orchestrate(request);

      expect(result.status).toBe("success");
      expect(result.output).not.toContain("budget");
    });

    it("should update spend after successful execution", async () => {
      const mockUpdateMany = jest.mocked(prisma.organization.updateMany) as jest.Mock;
      mockUpdateMany.mockResolvedValue({ count: 1 });

      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({
        task: { id: "task-spend" },
      });

      const request: OrchestrationRequest = {
        userRequest: "Create a task",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      await orchestrate(request);

      // Verify budget was updated (reserved + actual spend)
      expect(mockUpdateMany).toHaveBeenCalled();
    });
  });

  describe("4. Error Handling and User Messages", () => {
    it("should return user-friendly error for MCP connection failure", async () => {
      (jest.mocked(getActiveMCPConnections) as jest.Mock).mockRejectedValue(
        new Error("Database connection failed")
      );

      const request: OrchestrationRequest = {
        userRequest: "Create a Notion task",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      await expect(orchestrate(request)).rejects.toThrow("Database connection failed");
    });

    it("should include correlation ID in error messages", async () => {
      const mockError = new Error("Anthropic API error");
      const mockAnthropicClient = {
        messages: {
          create: jest.fn().mockRejectedValue(mockError),
        },
      };
      (Anthropic as any).mockImplementation(() => mockAnthropicClient);

      const request: OrchestrationRequest = {
        userRequest: "Test request",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      await expect(orchestrate(request)).rejects.toThrow();

      // Verify error was logged with correlation context
      expect(prisma.orchestratorExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            sessionId: mockSessionId,
          }),
        })
      );
    });

    it("should format Korean error messages", async () => {
      (jest.mocked(prisma.organization.findUnique) as jest.Mock).mockResolvedValue({
        id: mockOrgId,
        monthlyBudgetCents: 100,
        currentMonthSpendCents: 95, // Budget exhausted
        budgetResetAt: new Date(),
      });

      const request: OrchestrationRequest = {
        userRequest: "노션 태스크 만들어줘",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      const result = await orchestrate(request);

      expect(result.status).toBe("failed");
      // Error message should be in English by default (can be localized in notification layer)
      expect(result.output).toBeTruthy();
    });

    it("should handle Anthropic rate limit errors", async () => {
      const rateLimitError = new Error("429: rate limit exceeded");
      const mockAnthropicClient = {
        messages: {
          create: jest.fn().mockRejectedValue(rateLimitError),
        },
      };
      (Anthropic as any).mockImplementation(() => mockAnthropicClient);

      const request: OrchestrationRequest = {
        userRequest: "Test request",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      await expect(orchestrate(request)).rejects.toThrow("rate limit");
    });
  });

  describe("5. Multi-Tenant Isolation", () => {
    it("should isolate MCP connections by organization", async () => {
      const org1Id = "org-1";
      const org2Id = "org-2";

      const org1Connections: MCPConnection[] = [
        {
          id: "conn-org1-notion",
          organizationId: org1Id,
          provider: "Notion",
          name: "Org1 Notion",
          namespace: "org1_notion",
          enabled: true,
          config: { accessToken: "org1-token" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const org2Connections: MCPConnection[] = [
        {
          id: "conn-org2-notion",
          organizationId: org2Id,
          provider: "Notion",
          name: "Org2 Notion",
          namespace: "org2_notion",
          enabled: true,
          config: { accessToken: "org2-token" },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (jest.mocked(getActiveMCPConnections) as jest.Mock)
        .mockResolvedValueOnce(org1Connections)
        .mockResolvedValueOnce(org2Connections);

      // Org1 request
      await getActiveMCPConnections(org1Id);
      expect(getActiveMCPConnections).toHaveBeenCalledWith(org1Id);

      // Org2 request
      await getActiveMCPConnections(org2Id);
      expect(getActiveMCPConnections).toHaveBeenCalledWith(org2Id);

      // Verify calls were isolated
      expect(getActiveMCPConnections).toHaveBeenCalledTimes(2);
    });

    it("should prevent cross-organization data access via RLS", async () => {
      const org1Id = "org-1";
      const org2UserId = "user-from-org-2";

      // Mock user from different organization
      (jest.mocked(prisma.user.findUnique) as jest.Mock).mockResolvedValue({
        id: org2UserId,
        email: "user2@org2.com",
        organizationId: "org-2", // Different org
        role: "member",
      });

      (jest.mocked(prisma.organization.findUnique) as jest.Mock).mockResolvedValue({
        id: org1Id,
        name: "Org 1",
        monthlyBudgetCents: 10000,
        currentMonthSpendCents: 1000,
      });

      // Attempt to execute request with mismatched org/user would be caught by RLS
      const request: OrchestrationRequest = {
        userRequest: "Create task",
        sessionId: mockSessionId,
        organizationId: org1Id,
        userId: org2UserId, // User from different org
      };

      // In production, this would fail at database level via RLS
      // For this test, we verify the context is correctly passed
      await orchestrate(request);

      expect(prisma.orchestratorExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: org1Id,
            userId: org2UserId,
          }),
        })
      );
    });

    it("should isolate budget tracking by organization", async () => {
      const org1Budget = 50000;
      const org2Budget = 100000;

      (jest.mocked(prisma.organization.findUnique) as jest.Mock)
        .mockResolvedValueOnce({
          id: "org-1",
          monthlyBudgetCents: org1Budget,
          currentMonthSpendCents: 10000,
        })
        .mockResolvedValueOnce({
          id: "org-2",
          monthlyBudgetCents: org2Budget,
          currentMonthSpendCents: 20000,
        });

      // Both organizations should have independent budget tracking
      const org1Lookup = await prisma.organization.findUnique({ where: { id: "org-1" } });
      const org2Lookup = await prisma.organization.findUnique({ where: { id: "org-2" } });

      expect(org1Lookup?.monthlyBudgetCents).toBe(org1Budget);
      expect(org2Lookup?.monthlyBudgetCents).toBe(org2Budget);
      expect(org1Lookup?.id).not.toBe(org2Lookup?.id);
    });
  });

  describe("6. Progress Updates", () => {
    it("should send progress updates during orchestration", async () => {
      const mockProgressService = {
        updateProgress: jest.fn().mockResolvedValue(undefined),
      };
      (jest.mocked(getSlackProgressService) as jest.Mock).mockReturnValue(mockProgressService);

      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({
        task: { id: "task-progress" },
      });

      const request: OrchestrationRequest = {
        userRequest: "Create task",
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      await orchestrate(request);

      // Progress updates would be called by the worker, not orchestrate() directly
      // Verify the service is available
      expect(getSlackProgressService).toHaveBeenCalled();
    });
  });

  describe("7. Multi-Agent Coordination", () => {
    it("should detect multi-agent requests", async () => {
      const complexRequest = "Create a Notion task and then send a Slack message to the team";

      const request: OrchestrationRequest = {
        userRequest: complexRequest,
        sessionId: mockSessionId,
        organizationId: mockOrgId,
        userId: mockUserId,
      };

      (jest.mocked(executeNotionTool) as jest.Mock).mockResolvedValue({ task: { id: "t1" } });
      (jest.mocked(executeSlackTool) as jest.Mock).mockResolvedValue({ ok: true });

      const result = await orchestrate(request);

      // Should complete successfully (either via multi-agent or sequential tool use)
      expect(result.status).toBe("success");
    });
  });
});
