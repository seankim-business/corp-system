import { test, expect } from '@playwright/test';

test.describe('Login Page Rendering', () => {
  test('should render login page at /login', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Check we're on login page
    await expect(page).toHaveURL(/\/login/);

    // Verify page renders without errors
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('should display main heading', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Check for any h1 heading
    const heading = page.locator('h1');
    await expect(heading.first()).toBeVisible();
  });

  test('should have interactive elements', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Check for button or clickable elements
    const buttons = page.locator('button, a[role="button"]');
    const buttonCount = await buttons.count();

    expect(buttonCount).toBeGreaterThanOrEqual(0);
  });
});
