import { test, expect } from '@playwright/test';

const BASE_URL = process.env.QA_BASE_URL || 'https://auth.nubabel.com';

test.describe('Slack Integration E2E Tests', () => {
  test('OAuth installation flow completes successfully', async ({ page }) => {
    await page.goto(`${BASE_URL}/api/slack/oauth/install`);
    await page.waitForURL('https://slack.com/oauth/v2/authorize**', {
      timeout: 10000,
      waitUntil: 'networkidle',
    });
    
    const url = new URL(page.url());
    expect(url.searchParams.get('client_id')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('app_mentions:read');
    expect(url.searchParams.get('state')).toBeTruthy();
    
    console.log('✅ OAuth flow initiated correctly');
  });
  
  test('Slack integration API returns 401 for unauthenticated requests', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/api/slack/integration`, {
      failOnStatusCode: false,
    });
    
    expect([401, 302, 303]).toContain(response?.status() || 0);
    console.log('✅ Integration endpoint requires authentication');
  });
  
  test('Health check endpoint is accessible', async ({ page }) => {
    const response = await page.goto(`${BASE_URL}/health`);
    expect(response?.status()).toBe(200);
    
    const body = await response?.json();
    expect(body.status).toBe('healthy');
    
    console.log('✅ Health check passed');
  });
});
