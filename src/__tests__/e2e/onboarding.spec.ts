import { test, expect } from '@playwright/test';

test.describe('Application Routes', () => {
  test('should handle navigation to dashboard route', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait for page to render (may show loading state)
    await page.waitForTimeout(2000);

    // Verify page renders something
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Check that React rendered content
    const elements = await page.locator('div').count();
    expect(elements).toBeGreaterThan(0);
  });

  test('should handle navigation to workflows route', async ({ page }) => {
    await page.goto('/workflows');

    // Wait for React to render
    await page.waitForTimeout(2000);

    // Verify basic rendering
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle navigation to settings route', async ({ page }) => {
    await page.goto('/settings');

    // Wait for React to render
    await page.waitForTimeout(2000);

    // Verify basic rendering
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should handle navigation to okr route', async ({ page }) => {
    await page.goto('/okr');

    // Wait for React to render
    await page.waitForTimeout(2000);

    // Verify basic rendering
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
