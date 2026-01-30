/**
 * Feature Request Capture Service Tests
 */

import {
  createFeatureRequest,
  captureFromSlack,
  captureFromWeb,
} from "../../services/mega-app/feature-request-pipeline/capture.service";
import { isFeatureRequest } from "../../api/slack-feature-requests";

// Mock dependencies
jest.mock("../../db/client", () => ({
  db: {
    featureRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../utils/metrics", () => ({
  metrics: {
    increment: jest.fn(),
  },
}));

describe("Feature Request Detection", () => {
  it("should detect Korean feature request keywords", () => {
    expect(isFeatureRequest("기능 요청: 새로운 대시보드가 필요해요")).toBe(true);
    expect(isFeatureRequest("이런거 있으면 좋겠어요")).toBe(true);
    expect(isFeatureRequest("이런 기능 추가해주세요")).toBe(true);
  });

  it("should detect English feature request keywords", () => {
    expect(isFeatureRequest("feature request: new dashboard")).toBe(true);
    expect(isFeatureRequest("can we have a better search?")).toBe(true);
    expect(isFeatureRequest("would be nice if we could export")).toBe(true);
    expect(isFeatureRequest("please add dark mode")).toBe(true);
  });

  it("should not detect non-feature request messages", () => {
    expect(isFeatureRequest("hello world")).toBe(false);
    expect(isFeatureRequest("how are you?")).toBe(false);
    expect(isFeatureRequest("just a regular message")).toBe(false);
  });
});

describe("Feature Request Capture", () => {
  const { db: mockPrisma } = require("../../db/client");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createFeatureRequest", () => {
    it("should create a feature request successfully", async () => {
      const mockRequest = {
        id: "test-id",
        organizationId: "org-1",
        source: "slack",
        sourceRef: "C123:1234.5678",
        rawContent: "Feature request: Add dark mode",
        requesterId: "user-1",
        status: "new",
        priority: 3,
        requestCount: 1,
      };

      mockPrisma.featureRequest.create.mockResolvedValue(mockRequest as any);

      const result = await createFeatureRequest({
        source: "slack",
        sourceRef: "C123:1234.5678",
        rawContent: "Feature request: Add dark mode",
        requesterId: "user-1",
        organizationId: "org-1",
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe("test-id");
      expect(mockPrisma.featureRequest.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          source: "slack",
          sourceRef: "C123:1234.5678",
          rawContent: "Feature request: Add dark mode",
          requesterId: "user-1",
          status: "new",
          priority: 3,
          requestCount: 1,
        },
      });
    });

    it("should handle errors gracefully", async () => {
      mockPrisma.featureRequest.create.mockRejectedValue(
        new Error("Database error"),
      );

      const result = await createFeatureRequest({
        source: "web",
        sourceRef: "web:123",
        rawContent: "Test request",
        organizationId: "org-1",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database error");
    });
  });

  describe("captureFromSlack", () => {
    it("should capture from Slack with thread context", async () => {
      mockPrisma.featureRequest.findFirst.mockResolvedValue(null);
      mockPrisma.featureRequest.create.mockResolvedValue({
        id: "slack-request-1",
      } as any);

      const result = await captureFromSlack("org-1", "user-1", {
        channelId: "C123",
        channelName: "general",
        messageTs: "1234.5678",
        threadTs: "1234.0000",
        userId: "U456",
        userName: "John Doe",
        text: "Can we have a better search feature?",
        threadContext: [
          { userId: "U456", text: "I need better filters", ts: "1234.5679" },
          { userId: "U789", text: "That would be helpful", ts: "1234.5680" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe("slack-request-1");
    });

    it("should not duplicate existing Slack requests", async () => {
      mockPrisma.featureRequest.findFirst.mockResolvedValue({
        id: "existing-request",
      } as any);

      const result = await captureFromSlack("org-1", "user-1", {
        channelId: "C123",
        messageTs: "1234.5678",
        userId: "U456",
        text: "Feature request",
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe("existing-request");
      expect(mockPrisma.featureRequest.create).not.toHaveBeenCalled();
    });
  });

  describe("captureFromWeb", () => {
    it("should capture from web form", async () => {
      mockPrisma.featureRequest.create.mockResolvedValue({
        id: "web-request-1",
      } as any);

      const result = await captureFromWeb("org-1", "user-1", {
        title: "Dark Mode Feature",
        description: "We need a dark mode for better UX",
        category: "UI/UX",
        urgency: "medium",
      });

      expect(result.success).toBe(true);
      expect(result.id).toBe("web-request-1");

      const createCall = mockPrisma.featureRequest.create.mock.calls[0][0];
      expect(createCall.data.rawContent).toContain("Dark Mode Feature");
      expect(createCall.data.rawContent).toContain(
        "We need a dark mode for better UX",
      );
      expect(createCall.data.source).toBe("web");
    });

    it("should include metadata in raw content", async () => {
      mockPrisma.featureRequest.create.mockResolvedValue({
        id: "web-request-2",
      } as any);

      await captureFromWeb("org-1", "user-1", {
        title: "Export Feature",
        description: "Need CSV export",
        category: "Data",
        urgency: "high",
        pageContext: "/dashboard/analytics",
      });

      const createCall = mockPrisma.featureRequest.create.mock.calls[0][0];
      expect(createCall.data.rawContent).toContain("Category: Data");
      expect(createCall.data.rawContent).toContain("Urgency: high");
      expect(createCall.data.rawContent).toContain(
        "Page Context: /dashboard/analytics",
      );
    });
  });
});
