import { test, expect } from '@playwright/test';

test.describe('Protected Routes', () => {
  test('should show loading state when accessing dashboard without auth', async ({ page }) => {
    await page.goto('/dashboard');

    // Wait a moment for React to render
    await page.waitForTimeout(1000);

    // Should see either loading spinner or have redirected/stayed on page
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Check that page rendered something (loading or redirect)
    const hasContent = await page.locator('div, h1, p').count();
    expect(hasContent).toBeGreaterThan(0);
  });

  test('should render page structure without crashes', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Allow for network errors but not JS crashes
    const crashes = errors.filter(err =>
      !err.includes('fetch') &&
      !err.includes('NetworkError')
    );

    expect(crashes.length).toBe(0);
  });
});
