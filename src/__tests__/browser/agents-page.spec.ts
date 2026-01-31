import { test, expect } from '@playwright/test';

test.describe('Agents Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to agents page (may need login first)
    await page.goto('/admin/agents');
  });

  test('should display agent registry header', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('AGENT REGISTRY');
  });

  test('should switch between list and chart view', async ({ page }) => {
    // Check list view is default
    const listButton = page.locator('button:has-text("LIST")');
    const chartButton = page.locator('button:has-text("CHART")');

    await expect(listButton).toHaveClass(/bg-slate-900/);

    // Switch to chart view
    await chartButton.click();
    await expect(chartButton).toHaveClass(/bg-slate-900/);
  });

  test('should search agents', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('meta');

    // Should filter results
    await page.waitForTimeout(300);
  });

  test('should open agent detail panel', async ({ page }) => {
    // Wait for agents to load
    await page.waitForSelector('button:has-text("META")');

    // Click on first agent
    await page.click('button:has-text("META")');

    // Detail panel should appear
    await expect(page.locator('h2:has-text("Meta Agent")')).toBeVisible();
  });

  test('should display organization chart', async ({ page }) => {
    // Switch to chart view
    await page.click('button:has-text("CHART")');

    // Should show hierarchy
    await expect(page.locator('text=ORCHESTRATOR')).toBeVisible();
    await expect(page.locator('text=FUNCTION')).toBeVisible();
  });
});

// Debug helper test - runs browser with pause for manual inspection
test('debug: inspect agents page', async ({ page }) => {
  await page.goto('/admin/agents');

  // Pause for manual inspection
  await page.pause();
});
