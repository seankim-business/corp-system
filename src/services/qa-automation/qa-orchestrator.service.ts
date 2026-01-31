/**
 * QA Orchestrator Service
 *
 * Coordinates the full QA workflow:
 * 1. Monitor Railway deployment status
 * 2. Wait for deployment success
 * 3. Run Playwright smoke tests
 * 4. Post results to Slack #it-test channel
 *
 * Usage:
 *   const orchestrator = new QAOrchestratorService();
 *   const result = await orchestrator.monitorDeploymentAndTest();
 *   // Results automatically posted to Slack
 */

import { WebClient } from "@slack/web-api";
import { RailwayService } from "./railway.service";
import { PlaywrightService } from "./playwright.service";
import { logger } from "../../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export interface TestResult {
  status: "PASS" | "FAIL";
  url: string;
  screenshot?: string;
  errors: string[];
  timestamp: string;
  duration: number; // milliseconds
}

export interface BuildFailure {
  logs: string[];
  errorCount: number;
  firstError: string;
}

export interface SmokeTestResult {
  pageLoads: boolean;
  noConsoleErrors: boolean;
  basicNavigation: boolean;
  screenshot: string;
  errors: string[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const POLLING_INTERVAL_MS = 10000; // 10 seconds
const MAX_POLLING_DURATION_MS = 600000; // 10 minutes
const POST_DEPLOY_WAIT_MS = 30000; // 30 seconds
const SLACK_CHANNEL = "#it-test";
const SLACK_BOT_MENTION = "@Nubabel";

// =============================================================================
// QA ORCHESTRATOR SERVICE
// =============================================================================

export class QAOrchestratorService {
  private railwayService: RailwayService;
  private playwrightService: PlaywrightService;
  private slackClient: WebClient;

  constructor() {
    this.railwayService = new RailwayService();
    this.playwrightService = new PlaywrightService({
      headless: true,
      timeout: 30000,
    });

    // Initialize Slack client
    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      throw new Error("SLACK_BOT_TOKEN environment variable is required");
    }
    this.slackClient = new WebClient(slackToken);
  }

  /**
   * Main orchestration method: Monitor deployment and run tests
   *
   * @param projectId - Optional Railway project ID
   * @returns Test result with status, URL, and errors
   */
  async monitorDeploymentAndTest(projectId?: string): Promise<TestResult> {
    const startTime = Date.now();
    logger.info("Starting QA orchestration", { projectId });

    try {
      // Step 1: Get initial deployment status
      logger.info("Step 1: Getting deployment status");
      let status = await this.railwayService.getStatus(projectId);

      // Step 2: Poll until deployment completes
      if (
        status.lastDeployment?.status === "BUILDING" ||
        status.lastDeployment?.status === "DEPLOYING"
      ) {
        logger.info("Step 2: Deployment in progress, polling...", {
          status: status.lastDeployment.status,
        });
        status = await this.pollDeploymentStatus(projectId);
      }

      // Check for deployment failure
      if (status.lastDeployment?.status === "FAILED") {
        logger.error("Deployment failed", { status });
        const failure = await this.detectBuildFailures();
        const result: TestResult = {
          status: "FAIL",
          url: "",
          errors: failure ? failure.logs : ["Deployment failed with unknown error"],
          timestamp: new Date().toISOString(),
          duration: Date.now() - startTime,
        };
        await this.postTestResults(result);
        return result;
      }

      // Step 3: Get deployment URL
      logger.info("Step 3: Deployment successful, getting URL");
      const deploymentUrl = await this.getDeploymentUrl(projectId);

      // Step 4: Wait for services to fully start
      logger.info("Step 4: Waiting 30 seconds for services to start");
      await this.sleep(POST_DEPLOY_WAIT_MS);

      // Step 5-9: Run Playwright tests
      logger.info("Step 5-9: Running Playwright smoke tests");
      const smokeTestResult = await this.runSmokeTests(deploymentUrl);

      // Build final result
      const result: TestResult = {
        status: smokeTestResult.errors.length === 0 ? "PASS" : "FAIL",
        url: deploymentUrl,
        screenshot: smokeTestResult.screenshot,
        errors: smokeTestResult.errors,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };

      // Step 10: Post results to Slack
      logger.info("Step 10: Posting results to Slack");
      await this.postTestResults(result);

      logger.info("QA orchestration complete", {
        status: result.status,
        duration: result.duration,
      });

      return result;
    } catch (error) {
      logger.error("QA orchestration failed", { error });

      const result: TestResult = {
        status: "FAIL",
        url: "",
        errors: [error instanceof Error ? error.message : String(error)],
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      };

      await this.postTestResults(result);
      return result;
    }
  }

  /**
   * Detect build failures from Railway logs
   *
   * @returns Structured failure info or null if no errors
   */
  async detectBuildFailures(): Promise<BuildFailure | null> {
    try {
      logger.info("Detecting build failures");
      const errorAnalysis = await this.railwayService.detectBuildErrors();

      if (!errorAnalysis.hasErrors) {
        logger.info("No build errors detected");
        return null;
      }

      const failure: BuildFailure = {
        logs: errorAnalysis.errors,
        errorCount: errorAnalysis.errorCount,
        firstError: errorAnalysis.errors[0] || "Unknown error",
      };

      logger.warn("Build failures detected", {
        errorCount: failure.errorCount,
        firstError: failure.firstError,
      });

      return failure;
    } catch (error) {
      logger.error("Failed to detect build failures", { error });
      return null;
    }
  }

  /**
   * Post test results to Slack #it-test channel
   *
   * @param result - Test result to post
   */
  async postTestResults(result: TestResult): Promise<void> {
    try {
      logger.info("Posting test results to Slack", {
        status: result.status,
        channel: SLACK_CHANNEL,
      });

      // Format status emoji
      const statusEmoji = result.status === "PASS" ? "✅" : "❌";
      const statusText = result.status === "PASS" ? "PASS" : "FAIL";

      // Build Slack Block Kit message
      const blocks: any[] = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `${statusEmoji} QA Test ${statusText}`,
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Status:*\n${statusEmoji} ${statusText}`,
            },
            {
              type: "mrkdwn",
              text: `*Duration:*\n${Math.round(result.duration / 1000)}s`,
            },
            {
              type: "mrkdwn",
              text: `*URL:*\n${result.url || "N/A"}`,
            },
            {
              type: "mrkdwn",
              text: `*Timestamp:*\n${new Date(result.timestamp).toLocaleString()}`,
            },
          ],
        },
      ];

      // Add errors section if any
      if (result.errors.length > 0) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Errors (${result.errors.length}):*\n\`\`\`${result.errors.slice(0, 5).join("\n")}\`\`\``,
          },
        });

        if (result.errors.length > 5) {
          blocks.push({
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `_... and ${result.errors.length - 5} more errors_`,
              },
            ],
          });
        }
      }

      // Add divider
      blocks.push({ type: "divider" });

      // Add mention
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `cc: ${SLACK_BOT_MENTION}`,
          },
        ],
      });

      // Post message
      await this.slackClient.chat.postMessage({
        channel: SLACK_CHANNEL,
        text: `${statusEmoji} QA Test ${statusText}`, // Fallback text
        blocks,
      });

      // Upload screenshot if available
      if (result.screenshot) {
        await this.uploadScreenshot(result.screenshot);
      }

      logger.info("Successfully posted test results to Slack");
    } catch (error) {
      logger.error("Failed to post test results to Slack", { error });
      throw error;
    }
  }

  // =========================================================================
  // PRIVATE HELPERS
  // =========================================================================

  /**
   * Poll deployment status until completion or timeout
   */
  private async pollDeploymentStatus(projectId?: string): Promise<any> {
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < MAX_POLLING_DURATION_MS) {
      attempts++;
      logger.debug("Polling deployment status", { attempt: attempts });

      const status = await this.railwayService.getStatus(projectId);
      const deploymentStatus = status.lastDeployment?.status;

      if (deploymentStatus === "SUCCESS" || deploymentStatus === "FAILED") {
        logger.info("Deployment completed", {
          status: deploymentStatus,
          attempts,
          duration: Date.now() - startTime,
        });
        return status;
      }

      // Wait before next poll
      await this.sleep(POLLING_INTERVAL_MS);
    }

    throw new Error(`Deployment polling timeout after ${MAX_POLLING_DURATION_MS}ms`);
  }

  /**
   * Get deployment URL from Railway
   */
  private async getDeploymentUrl(_projectId?: string): Promise<string> {
    const url = process.env.RAILWAY_DEPLOYMENT_URL || "https://auth.nubabel.com";
    logger.info("Using deployment URL", { url });
    return url;
  }

  /**
   * Run smoke tests with Playwright
   */
  private async runSmokeTests(url: string): Promise<SmokeTestResult> {
    const errors: string[] = [];
    let pageLoads = false;
    let noConsoleErrors = true;
    let basicNavigation = false;
    let screenshot = "";

    try {
      // Step 5: Initialize Playwright
      logger.info("Initializing Playwright");
      await this.playwrightService.initialize();

      const page = this.playwrightService.getPage();
      if (!page) {
        throw new Error("Failed to get Playwright page");
      }

      // Listen for console errors
      const consoleErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          consoleErrors.push(msg.text());
        }
      });

      // Step 6: Navigate to deployment URL
      logger.info("Navigating to deployment URL", { url });
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        pageLoads = true;
        logger.info("✓ Page loaded successfully");
      } catch (navError) {
        errors.push(
          `Navigation failed: ${navError instanceof Error ? navError.message : String(navError)}`,
        );
        logger.error("Navigation failed", { error: navError });
      }

      // Step 7: Check for console errors
      if (consoleErrors.length > 0) {
        noConsoleErrors = false;
        errors.push(`Console errors detected: ${consoleErrors.join(", ")}`);
        logger.warn("Console errors detected", { count: consoleErrors.length });
      } else {
        logger.info("✓ No console errors");
      }

      // Basic navigation test (check if page has expected elements)
      try {
        // Wait for body to be visible
        await page.waitForSelector("body", { state: "visible", timeout: 5000 });
        basicNavigation = true;
        logger.info("✓ Basic navigation successful");
      } catch (navError) {
        errors.push("Basic navigation failed: body element not found");
        logger.error("Basic navigation failed", { error: navError });
      }

      // Step 8: Take screenshot
      logger.info("Taking screenshot");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      screenshot = `./screenshots/smoke-test-${timestamp}.png`;
      await this.playwrightService.screenshot(screenshot);
      logger.info("✓ Screenshot captured", { path: screenshot });
    } catch (error) {
      errors.push(`Smoke test error: ${error instanceof Error ? error.message : String(error)}`);
      logger.error("Smoke test failed", { error });
    } finally {
      // Step 9: Close Playwright (prevent memory leak)
      logger.info("Closing Playwright");
      try {
        await this.playwrightService.close();
        logger.info("✓ Playwright closed cleanly");
      } catch (closeError) {
        logger.error("Failed to close Playwright", { error: closeError });
      }
    }

    return {
      pageLoads,
      noConsoleErrors,
      basicNavigation,
      screenshot,
      errors,
    };
  }

  /**
   * Upload screenshot to Slack
   */
  private async uploadScreenshot(screenshotPath: string): Promise<void> {
    try {
      logger.info("Uploading screenshot to Slack", { path: screenshotPath });

      await this.slackClient.files.uploadV2({
        channel_id: SLACK_CHANNEL,
        file: screenshotPath,
        filename: `qa-test-${Date.now()}.png`,
        title: "QA Test Screenshot",
      });

      logger.info("✓ Screenshot uploaded to Slack");
    } catch (error) {
      logger.error("Failed to upload screenshot to Slack", { error });
      // Don't throw - screenshot upload is not critical
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const qaOrchestratorService = new QAOrchestratorService();
