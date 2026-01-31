import { test, expect, Page } from "@playwright/test";

test.describe("Multi-Account Admin UI", () => {
  let page: Page;

  test.beforeEach(async ({ page: testPage }) => {
    page = testPage;
    await page.goto("/admin/accounts");
  });

  test("should load accounts list", async () => {
    await expect(page.locator("h1")).toContainText("Accounts");

    const accountsList = page.locator('[data-testid="accounts-list"]');
    await expect(accountsList).toBeVisible();
  });

  test("should add new account via registration form", async () => {
    await page.click('[data-testid="add-account-button"]');

    await expect(page.locator("h2")).toContainText("Add Account");

    await page.fill('[data-testid="account-email"]', `test-${Date.now()}@example.com`);
    await page.fill('[data-testid="account-password"]', "SecurePassword123!");
    await page.fill('[data-testid="account-name"]', "Test Account");

    await page.click('[data-testid="submit-account-button"]');

    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      "Account created successfully",
    );
  });

  test("should navigate to account details page", async () => {
    const firstAccount = page.locator('[data-testid="account-row"]').first();
    await firstAccount.click();

    await expect(page).toHaveURL(/\/admin\/accounts\/[a-z0-9-]+/);

    await expect(page.locator("h1")).toContainText("Account Details");
  });

  test("should display health metrics on account details", async () => {
    await page.goto("/admin/accounts/test-account-id");

    const healthMetrics = page.locator('[data-testid="health-metrics"]');
    await expect(healthMetrics).toBeVisible();

    await expect(page.locator('[data-testid="metric-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="metric-uptime"]')).toBeVisible();
    await expect(page.locator('[data-testid="metric-requests"]')).toBeVisible();
  });

  test("should trigger sync and verify completion", async () => {
    await page.goto("/admin/accounts/test-account-id");

    await page.click('[data-testid="sync-now-button"]');

    await expect(page.locator('[data-testid="sync-status"]')).toContainText("Syncing...");

    await expect(page.locator('[data-testid="sync-status"]')).toContainText("Sync complete", {
      timeout: 30000,
    });

    await expect(page.locator('[data-testid="last-sync-time"]')).toBeVisible();
  });

  test("should handle form validation errors", async () => {
    await page.click('[data-testid="add-account-button"]');

    await page.click('[data-testid="submit-account-button"]');

    await expect(page.locator('[data-testid="error-email"]')).toContainText("Email is required");
    await expect(page.locator('[data-testid="error-password"]')).toContainText(
      "Password is required",
    );
  });

  test("should filter accounts by status", async () => {
    await page.selectOption('[data-testid="status-filter"]', "active");

    const accountRows = page.locator('[data-testid="account-row"]');
    const count = await accountRows.count();

    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const statusBadge = accountRows.nth(i).locator('[data-testid="account-status"]');
      await expect(statusBadge).toContainText("Active");
    }
  });

  test("should search accounts by email", async () => {
    const searchTerm = "test@example.com";
    await page.fill('[data-testid="search-input"]', searchTerm);

    await page.waitForTimeout(500);

    const accountRows = page.locator('[data-testid="account-row"]');
    const count = await accountRows.count();

    if (count > 0) {
      const firstEmail = await accountRows
        .first()
        .locator('[data-testid="account-email"]')
        .textContent();
      expect(firstEmail?.toLowerCase()).toContain(searchTerm.toLowerCase());
    }
  });
});
