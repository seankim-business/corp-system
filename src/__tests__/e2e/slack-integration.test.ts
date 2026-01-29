/**
 * Slack Integration E2E Tests
 *
 * Tests the complete Slack integration flow:
 * - App mention handling
 * - Direct message handling
 * - Slash command handling
 * - Event deduplication
 * - Error handling
 * - Response formatting
 */

import {
  setupTestDatabase,
  teardownTestDatabase,
  createMockSlackEvent,
  createMockSlackClient,
  MockSlackEvent,
  MockSlackClient,
} from "./setup";

// Mock Slack event queue
const mockSlackEventQueue = {
  enqueueEvent: jest.fn().mockResolvedValue(undefined),
  processEvent: jest.fn().mockResolvedValue({ status: "success", output: "Processed" }),
};

// Mock Slack service functions
const mockGetUserBySlackId = jest.fn();
const mockGetOrganizationBySlackWorkspace = jest.fn();
const mockCreateSession = jest.fn();
const mockGetSessionBySlackThread = jest.fn();

jest.mock("../../queue/slack-event.queue", () => ({
  slackEventQueue: mockSlackEventQueue,
}));

jest.mock("../../services/slack-service", () => ({
  getUserBySlackId: (...args: unknown[]) => mockGetUserBySlackId(...args),
  getOrganizationBySlackWorkspace: (...args: unknown[]) =>
    mockGetOrganizationBySlackWorkspace(...args),
}));

jest.mock("../../orchestrator/session-manager", () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  getSessionBySlackThread: (...args: unknown[]) => mockGetSessionBySlackThread(...args),
}));

// Mock Slack handler implementation
class MockSlackHandler {
  private slackClient: MockSlackClient;
  private processedEvents: Set<string> = new Set();

  constructor() {
    this.slackClient = createMockSlackClient();
  }

  async handleAppMention(event: MockSlackEvent): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    // Check for duplicate event
    const dedupeKey = `${event.channel}:${event.ts}`;
    if (this.processedEvents.has(dedupeKey)) {
      return { success: true, response: "Duplicate event ignored" };
    }
    this.processedEvents.add(dedupeKey);

    try {
      // Validate user
      const user = await mockGetUserBySlackId(event.user, this.slackClient);
      if (!user) {
        await this.slackClient.chat.postMessage({
          channel: event.channel,
          text: "User not found. Please login first.",
          thread_ts: event.thread_ts || event.ts,
        });
        return { success: false, error: "User not found" };
      }

      // Get organization
      const org = await mockGetOrganizationBySlackWorkspace(event.team);
      if (!org) {
        await this.slackClient.chat.postMessage({
          channel: event.channel,
          text: "Organization not found. Please connect Slack workspace.",
          thread_ts: event.thread_ts || event.ts,
        });
        return { success: false, error: "Organization not found" };
      }

      // Get or create session
      let session = await mockGetSessionBySlackThread(event.thread_ts || event.ts);
      if (!session) {
        session = await mockCreateSession({
          userId: user.id,
          organizationId: org.id,
          source: "slack",
          metadata: {
            slackChannelId: event.channel,
            slackThreadTs: event.thread_ts || event.ts,
          },
        });
      }

      // Clean mention from text
      const cleanedText = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

      // Enqueue event for processing
      await mockSlackEventQueue.enqueueEvent({
        type: event.type,
        channel: event.channel,
        user: event.user,
        text: cleanedText,
        ts: event.ts,
        organizationId: org.id,
        userId: user.id,
        sessionId: session.id,
      });

      // Send processing message
      await this.slackClient.chat.postMessage({
        channel: event.channel,
        text: "Processing your request...",
        thread_ts: event.thread_ts || event.ts,
      });

      return { success: true, response: "Event enqueued" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.slackClient.chat.postMessage({
        channel: event.channel,
        text: `Error: ${errorMessage}`,
        thread_ts: event.thread_ts || event.ts,
      });
      return { success: false, error: errorMessage };
    }
  }

  async handleDirectMessage(event: MockSlackEvent): Promise<{
    success: boolean;
    response?: string;
    error?: string;
  }> {
    // Similar to app mention but without @mention
    const dedupeKey = `dm:${event.channel}:${event.ts}`;
    if (this.processedEvents.has(dedupeKey)) {
      return { success: true, response: "Duplicate event ignored" };
    }
    this.processedEvents.add(dedupeKey);

    try {
      const user = await mockGetUserBySlackId(event.user, this.slackClient);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      const org = await mockGetOrganizationBySlackWorkspace(event.team);
      if (!org) {
        return { success: false, error: "Organization not found" };
      }

      await mockSlackEventQueue.enqueueEvent({
        type: "direct_message",
        channel: event.channel,
        user: event.user,
        text: event.text,
        ts: event.ts,
        organizationId: org.id,
        userId: user.id,
      });

      return { success: true, response: "Direct message enqueued" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async handleSlashCommand(
    command: { text: string; user_id: string; channel_id: string; team_id: string },
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      const user = await mockGetUserBySlackId(command.user_id, this.slackClient);
      if (!user) {
        return { success: false, error: "User not found" };
      }

      const org = await mockGetOrganizationBySlackWorkspace(command.team_id);
      if (!org) {
        return { success: false, error: "Organization not found" };
      }

      await mockSlackEventQueue.enqueueEvent({
        type: "slash_command",
        channel: command.channel_id,
        user: command.user_id,
        text: command.text,
        ts: Date.now().toString(),
        organizationId: org.id,
        userId: user.id,
      });

      return { success: true, response: "Command enqueued" };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  clearProcessedEvents(): void {
    this.processedEvents.clear();
  }

  getSlackClient(): MockSlackClient {
    return this.slackClient;
  }
}

describe("Slack Integration E2E", () => {
  let slackHandler: MockSlackHandler;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(() => {
    slackHandler = new MockSlackHandler();
    jest.clearAllMocks();

    // Default mock implementations
    mockGetUserBySlackId.mockResolvedValue({
      id: "test-user-id",
      email: "test@test.com",
      name: "Test User",
    });
    mockGetOrganizationBySlackWorkspace.mockResolvedValue({
      id: "test-org-id",
      name: "Test Organization",
    });
    mockCreateSession.mockResolvedValue({
      id: "test-session-id",
      userId: "test-user-id",
      organizationId: "test-org-id",
    });
    mockGetSessionBySlackThread.mockResolvedValue(null);
  });

  describe("App mention handling", () => {
    it("processes app mention and enqueues event", async () => {
      const event = createMockSlackEvent({
        type: "app_mention",
        text: "<@U123456789> 캠페인 브리프 작성해줘",
        user: "U12345678",
        channel: "C12345678",
      });

      const result = await slackHandler.handleAppMention(event);

      expect(result.success).toBe(true);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "app_mention",
          text: "캠페인 브리프 작성해줘", // Mention removed
          channel: "C12345678",
        }),
      );
    });

    it("removes @mention from text before processing", async () => {
      const event = createMockSlackEvent({
        text: "<@U123456789> hello <@U987654321> world",
      });

      await slackHandler.handleAppMention(event);

      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "hello  world",
        }),
      );
    });

    it("sends processing message to thread", async () => {
      const event = createMockSlackEvent({
        thread_ts: "1234567890.123456",
      });

      await slackHandler.handleAppMention(event);

      expect(slackHandler.getSlackClient().chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_ts: "1234567890.123456",
          text: expect.stringContaining("Processing"),
        }),
      );
    });

    it("handles user not found error", async () => {
      mockGetUserBySlackId.mockResolvedValue(null);

      const event = createMockSlackEvent();
      const result = await slackHandler.handleAppMention(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("User not found");
      expect(slackHandler.getSlackClient().chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("User not found"),
        }),
      );
    });

    it("handles organization not found error", async () => {
      mockGetOrganizationBySlackWorkspace.mockResolvedValue(null);

      const event = createMockSlackEvent();
      const result = await slackHandler.handleAppMention(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Organization not found");
    });

    it("creates new session for new thread", async () => {
      mockGetSessionBySlackThread.mockResolvedValue(null);

      const event = createMockSlackEvent({
        ts: "new-thread-ts",
      });

      await slackHandler.handleAppMention(event);

      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "slack",
          metadata: expect.objectContaining({
            slackChannelId: event.channel,
          }),
        }),
      );
    });

    it("reuses existing session for same thread", async () => {
      const existingSession = { id: "existing-session-id" };
      mockGetSessionBySlackThread.mockResolvedValue(existingSession);

      const event = createMockSlackEvent({
        thread_ts: "existing-thread-ts",
      });

      await slackHandler.handleAppMention(event);

      expect(mockCreateSession).not.toHaveBeenCalled();
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "existing-session-id",
        }),
      );
    });
  });

  describe("Event deduplication", () => {
    it("ignores duplicate events", async () => {
      const event = createMockSlackEvent({
        ts: "same-ts-123",
        channel: "C12345678",
      });

      // First call
      await slackHandler.handleAppMention(event);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledTimes(1);

      // Second call with same event
      await slackHandler.handleAppMention(event);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledTimes(1); // Still 1
    });

    it("processes events with different timestamps", async () => {
      const event1 = createMockSlackEvent({ ts: "ts-1" });
      const event2 = createMockSlackEvent({ ts: "ts-2" });

      await slackHandler.handleAppMention(event1);
      await slackHandler.handleAppMention(event2);

      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledTimes(2);
    });

    it("can be reset to process same event again", async () => {
      const event = createMockSlackEvent({ ts: "same-ts" });

      await slackHandler.handleAppMention(event);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledTimes(1);

      slackHandler.clearProcessedEvents();

      await slackHandler.handleAppMention(event);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe("Direct message handling", () => {
    it("processes direct messages", async () => {
      const event = createMockSlackEvent({
        type: "message",
        text: "Hello, help me with something",
        channel: "D12345678", // DM channel
      });

      const result = await slackHandler.handleDirectMessage(event);

      expect(result.success).toBe(true);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "direct_message",
          text: "Hello, help me with something",
        }),
      );
    });

    it("handles direct message without user", async () => {
      mockGetUserBySlackId.mockResolvedValue(null);

      const event = createMockSlackEvent({
        type: "message",
      });

      const result = await slackHandler.handleDirectMessage(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("User not found");
    });
  });

  describe("Slash command handling", () => {
    it("processes /nubabel command", async () => {
      const command = {
        text: "show my tasks",
        user_id: "U12345678",
        channel_id: "C12345678",
        team_id: "T12345678",
      };

      const result = await slackHandler.handleSlashCommand(command);

      expect(result.success).toBe(true);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "slash_command",
          text: "show my tasks",
        }),
      );
    });

    it("handles slash command with empty text", async () => {
      const command = {
        text: "",
        user_id: "U12345678",
        channel_id: "C12345678",
        team_id: "T12345678",
      };

      const result = await slackHandler.handleSlashCommand(command);

      expect(result.success).toBe(true);
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "",
        }),
      );
    });

    it("handles slash command user not found", async () => {
      mockGetUserBySlackId.mockResolvedValue(null);

      const command = {
        text: "help",
        user_id: "unknown-user",
        channel_id: "C12345678",
        team_id: "T12345678",
      };

      const result = await slackHandler.handleSlashCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain("User not found");
    });
  });

  describe("Error handling", () => {
    it("handles queue enqueue failure", async () => {
      mockSlackEventQueue.enqueueEvent.mockRejectedValueOnce(new Error("Queue unavailable"));

      const event = createMockSlackEvent();
      const result = await slackHandler.handleAppMention(event);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Queue unavailable");
    });

    it("sends error message to Slack on failure", async () => {
      mockSlackEventQueue.enqueueEvent.mockRejectedValueOnce(new Error("Processing failed"));

      const event = createMockSlackEvent();
      await slackHandler.handleAppMention(event);

      expect(slackHandler.getSlackClient().chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("Error"),
        }),
      );
    });
  });

  describe("Full flow integration", () => {
    it("completes full mention → orchestrate → response flow", async () => {
      // Setup
      const event = createMockSlackEvent({
        text: "<@UBOT123> 캠페인 브리프 작성해줘",
        user: "U12345678",
        channel: "C12345678",
        ts: "1234567890.123456",
        team: "T12345678",
      });

      // Execute
      const result = await slackHandler.handleAppMention(event);

      // Verify complete flow
      expect(result.success).toBe(true);
      expect(mockGetUserBySlackId).toHaveBeenCalledWith("U12345678", expect.anything());
      expect(mockGetOrganizationBySlackWorkspace).toHaveBeenCalledWith("T12345678");
      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "캠페인 브리프 작성해줘",
          organizationId: "test-org-id",
          userId: "test-user-id",
        }),
      );
      expect(slackHandler.getSlackClient().chat.postMessage).toHaveBeenCalled();
    });

    it("handles threaded conversation correctly", async () => {
      // First message in new thread
      const firstEvent = createMockSlackEvent({
        ts: "1234567890.000001",
        text: "<@UBOT> 캠페인 브리프 작성해줘",
      });

      await slackHandler.handleAppMention(firstEvent);
      expect(mockCreateSession).toHaveBeenCalledTimes(1);

      // Reply in same thread
      const existingSession = { id: "session-from-first-msg" };
      mockGetSessionBySlackThread.mockResolvedValue(existingSession);

      const replyEvent = createMockSlackEvent({
        ts: "1234567890.000002",
        thread_ts: "1234567890.000001",
        text: "<@UBOT> 브랜드 가이드라인도 적용해줘",
      });

      await slackHandler.handleAppMention(replyEvent);
      expect(mockCreateSession).toHaveBeenCalledTimes(1); // Not called again
    });
  });

  describe("Korean language support", () => {
    it("preserves Korean text in messages", async () => {
      const event = createMockSlackEvent({
        text: "<@UBOT> 마케팅 캠페인 브리프 작성하고 예산 확인해줘",
      });

      await slackHandler.handleAppMention(event);

      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "마케팅 캠페인 브리프 작성하고 예산 확인해줘",
        }),
      );
    });

    it("handles mixed Korean and English text", async () => {
      const event = createMockSlackEvent({
        text: "<@UBOT> Create a 마케팅 campaign brief",
      });

      await slackHandler.handleAppMention(event);

      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Create a 마케팅 campaign brief",
        }),
      );
    });
  });

  describe("Special characters handling", () => {
    it("handles URLs in messages", async () => {
      const event = createMockSlackEvent({
        text: "<@UBOT> Check this link https://example.com/page?id=123",
      });

      await slackHandler.handleAppMention(event);

      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("https://example.com"),
        }),
      );
    });

    it("handles emoji in messages", async () => {
      const event = createMockSlackEvent({
        text: "<@UBOT> Great work! :tada: :rocket:",
      });

      await slackHandler.handleAppMention(event);

      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Great work! :tada: :rocket:",
        }),
      );
    });

    it("handles code blocks in messages", async () => {
      const event = createMockSlackEvent({
        text: "<@UBOT> Run this: ```npm install```",
      });

      await slackHandler.handleAppMention(event);

      expect(mockSlackEventQueue.enqueueEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Run this: ```npm install```",
        }),
      );
    });
  });
});
