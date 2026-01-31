import { test, expect, Page } from "@playwright/test";
import { RailwayService } from "../../src/services/qa-automation/railway.service";
import { PlaywrightService } from "../../src/services/qa-automation/playwright.service";

test.describe("QA Orchestrator Flow", () => {
  let page: Page;
  let railwayService: RailwayService;
  let playwrightService: PlaywrightService;

  test.beforeAll(() => {
    railwayService = new RailwayService();
    playwrightService = new PlaywrightService({ headless: true });
  });

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
  });

  test.afterAll(async () => {
    if (playwrightService) {
      await playwrightService.close();
    }
  });

  test("should mock Railway deployment status", async () => {
    const mockStatus = {
      projectId: "test-project-123",
      lastDeployment: {
        id: "deploy-456",
        status: "BUILDING",
        createdAt: new Date().toISOString(),
      },
    };

    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockStatus),
      });
    });

    const response = await page.request.get("/api/railway/status");
    const data = await response.json();

    expect(data.lastDeployment.status).toBe("BUILDING");
  });

  test("should poll Railway status until SUCCESS", async () => {
    let pollCount = 0;

    await page.route("**/api/railway/status", async (route) => {
      pollCount++;
      const status = pollCount < 3 ? "BUILDING" : "SUCCESS";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status,
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");

    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="deployment-status"]')).toContainText("SUCCESS", {
      timeout: 30000,
    });

    expect(pollCount).toBeGreaterThanOrEqual(3);
  });

  test("should launch Playwright browser after deployment success", async () => {
    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "SUCCESS",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");
    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="browser-status"]')).toContainText("Launching", {
      timeout: 10000,
    });

    await expect(page.locator('[data-testid="browser-status"]')).toContainText("Ready", {
      timeout: 15000,
    });
  });

  test("should verify page loads correctly", async () => {
    const deploymentUrl = "https://auth.nubabel.com";

    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "SUCCESS",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");
    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="page-load-status"]')).toContainText("Loading", {
      timeout: 10000,
    });

    await expect(page.locator('[data-testid="page-load-status"]')).toContainText("Loaded", {
      timeout: 30000,
    });

    const urlDisplay = page.locator('[data-testid="tested-url"]');
    await expect(urlDisplay).toContainText(deploymentUrl);
  });

  test("should capture screenshot on test completion", async () => {
    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "SUCCESS",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");
    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="screenshot-status"]')).toContainText("Capturing", {
      timeout: 30000,
    });

    await expect(page.locator('[data-testid="screenshot-status"]')).toContainText("Captured", {
      timeout: 10000,
    });

    const screenshotLink = page.locator('[data-testid="screenshot-link"]');
    await expect(screenshotLink).toBeVisible();
  });

  test("should post results to Slack (mocked)", async () => {
    let slackPayload: any = null;

    await page.route("**/api/slack/webhook", async (route) => {
      const request = route.request();
      slackPayload = await request.postDataJSON();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "SUCCESS",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");
    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="slack-status"]')).toContainText("Posting", {
      timeout: 40000,
    });

    await expect(page.locator('[data-testid="slack-status"]')).toContainText("Posted", {
      timeout: 10000,
    });

    expect(slackPayload).not.toBeNull();
    expect(slackPayload.text).toContain("QA Test");
  });

  test("should handle deployment failure gracefully", async () => {
    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "FAILED",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");
    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="deployment-status"]')).toContainText("FAILED", {
      timeout: 10000,
    });

    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText("Deployment failed");
  });

  test("should display build errors when deployment fails", async () => {
    const mockErrors = [
      "Error: Module not found: 'missing-package'",
      "TypeError: Cannot read property 'foo' of undefined",
    ];

    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "FAILED",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route("**/api/railway/logs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ errors: mockErrors }),
      });
    });

    await page.goto("/qa-orchestrator");
    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="build-errors"]')).toBeVisible({ timeout: 15000 });

    const errorList = page.locator('[data-testid="error-item"]');
    await expect(errorList).toHaveCount(mockErrors.length);
  });

  test("should timeout if deployment takes too long", async () => {
    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "BUILDING",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");

    await page.evaluate(() => {
      (window as any).QA_TIMEOUT_MS = 5000;
    });

    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="timeout-error"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="timeout-error"]')).toContainText("Timeout");
  });

  test("should allow manual retry after failure", async () => {
    await page.route("**/api/railway/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          projectId: "test-project-123",
          lastDeployment: {
            id: "deploy-456",
            status: "FAILED",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.goto("/qa-orchestrator");
    await page.click('[data-testid="start-qa-button"]');

    await expect(page.locator('[data-testid="deployment-status"]')).toContainText("FAILED", {
      timeout: 10000,
    });

    const retryButton = page.locator('[data-testid="retry-button"]');
    await expect(retryButton).toBeVisible();
    await expect(retryButton).toBeEnabled();
  });
});
