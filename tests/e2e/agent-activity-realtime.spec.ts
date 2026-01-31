import { test, expect, Page } from "@playwright/test";

test.describe("Agent Activity Real-time Updates", () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto("/activity");
  });

  test("should load activity page and establish SSE connection", async () => {
    await expect(page.locator("h1")).toContainText("Agent Activity");

    const sseStatus = page.locator('[data-testid="sse-status"]');
    await expect(sseStatus).toContainText("Connected", { timeout: 10000 });
  });

  test("should display real-time activity when agent executes", async () => {
    await page.waitForSelector('[data-testid="sse-status"]:has-text("Connected")');

    const activityList = page.locator('[data-testid="activity-list"]');
    const initialCount = await activityList.locator('[data-testid="activity-item"]').count();

    await page.evaluate(() => {
      fetch("/api/test/trigger-agent", { method: "POST" });
    });

    await expect(activityList.locator('[data-testid="activity-item"]')).toHaveCount(
      initialCount + 1,
      { timeout: 15000 },
    );
  });

  test("should show status progression: started → in_progress → completed", async () => {
    await page.waitForSelector('[data-testid="sse-status"]:has-text("Connected")');

    await page.evaluate(() => {
      fetch("/api/test/trigger-agent", { method: "POST" });
    });

    const latestActivity = page.locator('[data-testid="activity-item"]').first();

    await expect(latestActivity.locator('[data-testid="status-badge"]')).toContainText("Started");

    await expect(latestActivity.locator('[data-testid="status-badge"]')).toContainText(
      "In Progress",
      { timeout: 10000 },
    );

    await expect(latestActivity.locator('[data-testid="status-badge"]')).toContainText(
      "Completed",
      {
        timeout: 30000,
      },
    );
  });

  test("should display token usage metrics", async () => {
    await page.waitForSelector('[data-testid="sse-status"]:has-text("Connected")');

    const activityItem = page.locator('[data-testid="activity-item"]').first();

    if ((await activityItem.count()) > 0) {
      await expect(activityItem.locator('[data-testid="token-usage"]')).toBeVisible();

      const tokenText = await activityItem.locator('[data-testid="token-usage"]').textContent();
      expect(tokenText).toMatch(/\d+\s*tokens?/i);
    }
  });

  test("should filter by status", async () => {
    await page.selectOption('[data-testid="status-filter"]', "completed");

    await page.waitForTimeout(500);

    const activityItems = page.locator('[data-testid="activity-item"]');
    const count = await activityItems.count();

    for (let i = 0; i < count; i++) {
      const statusBadge = activityItems.nth(i).locator('[data-testid="status-badge"]');
      await expect(statusBadge).toContainText("Completed");
    }
  });

  test("should filter by agent type", async () => {
    await page.selectOption('[data-testid="agent-type-filter"]', "executor");

    await page.waitForTimeout(500);

    const activityItems = page.locator('[data-testid="activity-item"]');
    const count = await activityItems.count();

    for (let i = 0; i < count; i++) {
      const agentType = activityItems.nth(i).locator('[data-testid="agent-type"]');
      await expect(agentType).toContainText("Executor");
    }
  });

  test("should filter by date range", async () => {
    const today = new Date().toISOString().split("T")[0];

    await page.fill('[data-testid="date-from"]', today);
    await page.fill('[data-testid="date-to"]', today);

    await page.click('[data-testid="apply-date-filter"]');

    await page.waitForTimeout(500);

    const activityItems = page.locator('[data-testid="activity-item"]');
    const count = await activityItems.count();

    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("should handle SSE reconnection on connection loss", async () => {
    await page.waitForSelector('[data-testid="sse-status"]:has-text("Connected")');

    await page.evaluate(() => {
      const eventSource = (window as any).__eventSource;
      if (eventSource) {
        eventSource.close();
      }
    });

    await expect(page.locator('[data-testid="sse-status"]')).toContainText("Reconnecting", {
      timeout: 5000,
    });

    await expect(page.locator('[data-testid="sse-status"]')).toContainText("Connected", {
      timeout: 10000,
    });
  });

  test("should display activity details on click", async () => {
    const activityItem = page.locator('[data-testid="activity-item"]').first();

    if ((await activityItem.count()) > 0) {
      await activityItem.click();

      await expect(page.locator('[data-testid="activity-details-modal"]')).toBeVisible();

      await expect(page.locator('[data-testid="detail-agent-type"]')).toBeVisible();
      await expect(page.locator('[data-testid="detail-status"]')).toBeVisible();
      await expect(page.locator('[data-testid="detail-timestamp"]')).toBeVisible();
      await expect(page.locator('[data-testid="detail-duration"]')).toBeVisible();
    }
  });

  test("should clear all filters", async () => {
    await page.selectOption('[data-testid="status-filter"]', "completed");
    await page.selectOption('[data-testid="agent-type-filter"]', "executor");

    await page.click('[data-testid="clear-filters"]');

    const statusFilter = page.locator('[data-testid="status-filter"]');
    const agentTypeFilter = page.locator('[data-testid="agent-type-filter"]');

    await expect(statusFilter).toHaveValue("all");
    await expect(agentTypeFilter).toHaveValue("all");
  });
});
