import { test, expect } from '@playwright/test';

test.describe('UI Rendering and Animations', () => {
  test('should render login page with basic elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Verify basic page structure
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Check for title
    const title = page.locator('h1');
    await expect(title.first()).toBeVisible();
  });

  test('should have interactive button element', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Look for button elements
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    expect(buttonCount).toBeGreaterThan(0);
  });

  test('should render page without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Filter out known acceptable errors
    const criticalErrors = errors.filter(err =>
      !err.includes('favicon') &&
      !err.includes('404') &&
      !err.includes('Failed to fetch')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
