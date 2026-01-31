import { QAOrchestratorService, TestResult } from "./qa-orchestrator.service";
import { RailwayService } from "./railway.service";
import { PlaywrightService } from "./playwright.service";
import { WebClient } from "@slack/web-api";

jest.mock("./railway.service");
jest.mock("./playwright.service");
jest.mock("@slack/web-api");
jest.mock("../../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe("QAOrchestratorService", () => {
  let service: QAOrchestratorService;
  let mockRailwayService: jest.Mocked<RailwayService>;
  let mockPlaywrightService: jest.Mocked<PlaywrightService>;
  let mockSlackClient: jest.Mocked<WebClient>;

  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
    process.env.RAILWAY_DEPLOYMENT_URL = "https://test.nubabel.com";

    mockRailwayService = {
      getStatus: jest.fn(),
      detectBuildErrors: jest.fn(),
    } as any;

    mockPlaywrightService = {
      initialize: jest.fn(),
      getPage: jest.fn(),
      screenshot: jest.fn(),
      close: jest.fn(),
    } as any;

    mockSlackClient = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ok: true }),
      },
      files: {
        uploadV2: jest.fn().mockResolvedValue({ ok: true }),
      },
    } as any;

    (RailwayService as jest.Mock).mockImplementation(() => mockRailwayService);
    (PlaywrightService as jest.Mock).mockImplementation(() => mockPlaywrightService);
    (WebClient as jest.Mock).mockImplementation(() => mockSlackClient);

    service = new QAOrchestratorService();

    jest.clearAllMocks();
  });

  describe("monitorDeploymentAndTest", () => {
    it("should complete full workflow when deployment succeeds", async () => {
      mockRailwayService.getStatus.mockResolvedValue({
        lastDeployment: {
          status: "SUCCESS",
          url: "https://test.nubabel.com",
        },
      });

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      mockPlaywrightService.getPage.mockReturnValue(mockPage as any);
      mockPlaywrightService.screenshot.mockResolvedValue(undefined);

      const result = await service.monitorDeploymentAndTest();

      expect(result.status).toBe("PASS");
      expect(result.url).toBe("https://test.nubabel.com");
      expect(result.errors).toHaveLength(0);
      expect(mockSlackClient.chat.postMessage).toHaveBeenCalled();
    });

    it("should handle deployment failure", async () => {
      mockRailwayService.getStatus.mockResolvedValue({
        lastDeployment: {
          status: "FAILED",
        },
      });

      mockRailwayService.detectBuildErrors.mockResolvedValue({
        hasErrors: true,
        errors: ["Build error: Module not found"],
        errorCount: 1,
      });

      const result = await service.monitorDeploymentAndTest();

      expect(result.status).toBe("FAIL");
      expect(result.errors).toContain("Build error: Module not found");
      expect(mockSlackClient.chat.postMessage).toHaveBeenCalled();
    });

    it("should poll deployment status until completion", async () => {
      mockRailwayService.getStatus
        .mockResolvedValueOnce({
          lastDeployment: { status: "BUILDING" },
        })
        .mockResolvedValueOnce({
          lastDeployment: { status: "DEPLOYING" },
        })
        .mockResolvedValueOnce({
          lastDeployment: { status: "SUCCESS" },
        });

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
      };

      mockPlaywrightService.getPage.mockReturnValue(mockPage as any);
      mockPlaywrightService.screenshot.mockResolvedValue(undefined);

      const result = await service.monitorDeploymentAndTest();

      expect(mockRailwayService.getStatus).toHaveBeenCalledTimes(3);
      expect(result.status).toBe("PASS");
    });

    it("should detect console errors during smoke tests", async () => {
      mockRailwayService.getStatus.mockResolvedValue({
        lastDeployment: { status: "SUCCESS" },
      });

      const mockPage = {
        goto: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(undefined),
        on: jest.fn((event, callback) => {
          if (event === "console") {
            callback({ type: () => "error", text: () => "Uncaught TypeError" });
          }
        }),
      };

      mockPlaywrightService.getPage.mockReturnValue(mockPage as any);
      mockPlaywrightService.screenshot.mockResolvedValue(undefined);

      const result = await service.monitorDeploymentAndTest();

      expect(result.status).toBe("FAIL");
      expect(result.errors.some((e) => e.includes("Console errors detected"))).toBe(true);
    });

    it("should handle navigation failures", async () => {
      mockRailwayService.getStatus.mockResolvedValue({
        lastDeployment: { status: "SUCCESS" },
      });

      const mockPage = {
        goto: jest.fn().mockRejectedValue(new Error("Navigation timeout")),
        on: jest.fn(),
      };

      mockPlaywrightService.getPage.mockReturnValue(mockPage as any);
      mockPlaywrightService.screenshot.mockResolvedValue(undefined);

      const result = await service.monitorDeploymentAndTest();

      expect(result.status).toBe("FAIL");
      expect(result.errors.some((e) => e.includes("Navigation failed"))).toBe(true);
    });

    it("should always close Playwright after tests", async () => {
      mockRailwayService.getStatus.mockResolvedValue({
        lastDeployment: { status: "SUCCESS" },
      });

      const mockPage = {
        goto: jest.fn().mockRejectedValue(new Error("Test error")),
        on: jest.fn(),
      };

      mockPlaywrightService.getPage.mockReturnValue(mockPage as any);

      await service.monitorDeploymentAndTest();

      expect(mockPlaywrightService.close).toHaveBeenCalled();
    });
  });

  describe("detectBuildFailures", () => {
    it("should return build failure details", async () => {
      mockRailwayService.detectBuildErrors.mockResolvedValue({
        hasErrors: true,
        errors: ["Error 1", "Error 2"],
        errorCount: 2,
      });

      const result = await service.detectBuildFailures();

      expect(result).toBeDefined();
      expect(result?.errorCount).toBe(2);
      expect(result?.firstError).toBe("Error 1");
    });

    it("should return null when no errors", async () => {
      mockRailwayService.detectBuildErrors.mockResolvedValue({
        hasErrors: false,
        errors: [],
        errorCount: 0,
      });

      const result = await service.detectBuildFailures();

      expect(result).toBeNull();
    });

    it("should handle detection errors gracefully", async () => {
      mockRailwayService.detectBuildErrors.mockRejectedValue(new Error("Detection failed"));

      const result = await service.detectBuildFailures();

      expect(result).toBeNull();
    });
  });

  describe("postTestResults", () => {
    it("should post PASS results with green emoji", async () => {
      const result: TestResult = {
        status: "PASS",
        url: "https://test.nubabel.com",
        errors: [],
        timestamp: new Date().toISOString(),
        duration: 30000,
      };

      await service.postTestResults(result);

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("✅"),
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "header",
              text: expect.objectContaining({
                text: expect.stringContaining("PASS"),
              }),
            }),
          ]),
        }),
      );
    });

    it("should post FAIL results with red emoji and errors", async () => {
      const result: TestResult = {
        status: "FAIL",
        url: "https://test.nubabel.com",
        errors: ["Error 1", "Error 2", "Error 3"],
        timestamp: new Date().toISOString(),
        duration: 15000,
      };

      await service.postTestResults(result);

      expect(mockSlackClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("❌"),
          blocks: expect.arrayContaining([
            expect.objectContaining({
              type: "section",
              text: expect.objectContaining({
                text: expect.stringContaining("Error 1"),
              }),
            }),
          ]),
        }),
      );
    });

    it("should upload screenshot if available", async () => {
      const result: TestResult = {
        status: "PASS",
        url: "https://test.nubabel.com",
        screenshot: "./screenshots/test.png",
        errors: [],
        timestamp: new Date().toISOString(),
        duration: 30000,
      };

      await service.postTestResults(result);

      expect(mockSlackClient.files.uploadV2).toHaveBeenCalledWith(
        expect.objectContaining({
          file: "./screenshots/test.png",
        }),
      );
    });

    it("should handle Slack API errors gracefully", async () => {
      const result: TestResult = {
        status: "PASS",
        url: "https://test.nubabel.com",
        errors: [],
        timestamp: new Date().toISOString(),
        duration: 30000,
      };

      mockSlackClient.chat.postMessage = jest.fn().mockRejectedValue(new Error("Slack error"));

      await expect(service.postTestResults(result)).rejects.toThrow("Slack error");
    });
  });
});
