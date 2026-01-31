import { AgentActivity } from "../slack-activity.service";

describe("SlackActivityService", () => {
  const mockActivity: AgentActivity = {
    id: "act_123456789",
    organizationId: "org_123",
    userId: "user_123",
    sessionId: "sess_123",
    agentType: "executor",
    model: "claude-sonnet-4",
    category: "quick",
    taskDescription: "Fix TypeScript errors in authentication module",
    status: "started",
    startedAt: new Date(),
  };

  it("should create valid AgentActivity structure", () => {
    expect(mockActivity.id).toBeDefined();
    expect(mockActivity.agentType).toBe("executor");
    expect(mockActivity.status).toBe("started");
  });

  it("should handle completed activity with results", () => {
    const completedActivity: AgentActivity = {
      ...mockActivity,
      status: "completed",
      completedAt: new Date(),
      progress: 100,
      result: {
        summary: "Fixed 5 TypeScript errors",
        filesModified: ["src/auth/auth.service.ts", "src/middleware/auth.middleware.ts"],
        tokensUsed: 1500,
      },
    };

    expect(completedActivity.status).toBe("completed");
    expect(completedActivity.result?.filesModified).toHaveLength(2);
    expect(completedActivity.result?.tokensUsed).toBe(1500);
  });

  it("should handle failed activity with error", () => {
    const failedActivity: AgentActivity = {
      ...mockActivity,
      status: "failed",
      completedAt: new Date(),
      result: {
        error: "Build failed: Type 'string' is not assignable to type 'number'",
      },
    };

    expect(failedActivity.status).toBe("failed");
    expect(failedActivity.result?.error).toContain("Build failed");
  });
});
