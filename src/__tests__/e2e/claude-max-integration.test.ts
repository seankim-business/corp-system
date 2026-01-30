import { test, expect } from "@playwright/test";

const BASE_URL = process.env.QA_BASE_URL || "https://auth.nubabel.com";

test.describe("Claude Max Account Pool E2E Tests", () => {
  test("Agent Activity page loads successfully", async ({ page }) => {
    await page.goto(`${BASE_URL}/agent-activity`);

    await expect(page.locator("h1")).toContainText("Agent Activity");

    const sseIndicator = page.locator('[class*="rounded-full"]').first();
    await expect(sseIndicator).toBeVisible();

    console.log("✅ Agent Activity page loaded");
  });

  test("Agent Activity page shows SSE connection status", async ({ page }) => {
    await page.goto(`${BASE_URL}/agent-activity`);

    await page.waitForTimeout(2000);

    const connectionText = page.getByText(/Connected|Disconnected|Live/);
    await expect(connectionText).toBeVisible();

    console.log("✅ SSE connection status displayed");
  });

  test("Event type filters are present", async ({ page }) => {
    await page.goto(`${BASE_URL}/agent-activity`);

    const filterButtons = page.locator("button").filter({ hasText: /agent|execution|all/i });
    const count = await filterButtons.count();

    expect(count).toBeGreaterThanOrEqual(3);
    console.log(`✅ Found ${count} filter buttons`);
  });

  test("Claude Max Pool panel is visible", async ({ page }) => {
    await page.goto(`${BASE_URL}/agent-activity`);

    const poolPanel = page.getByText(/Claude Max Pool/i);
    await expect(poolPanel).toBeVisible();

    console.log("✅ Claude Max Pool panel visible");
  });

  test("Agent Hierarchy panel is visible", async ({ page }) => {
    await page.goto(`${BASE_URL}/agent-activity`);

    const hierarchyPanel = page.getByText(/Agent Hierarchy/i);
    await expect(hierarchyPanel).toBeVisible();

    console.log("✅ Agent Hierarchy panel visible");
  });
});

test.describe("QA Commands API Tests", () => {
  test("Health check endpoint returns healthy", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/health`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("healthy");

    console.log("✅ Health endpoint healthy");
  });

  test("Claude Max accounts API requires authentication", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/claude-max-accounts`);

    expect([401, 403, 302]).toContain(response.status());
    console.log("✅ Accounts API protected");
  });

  test("SSE events endpoint accepts connections", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/events`, {
      headers: {
        Accept: "text/event-stream",
      },
    });

    expect([200, 401, 302]).toContain(response.status());
    console.log("✅ SSE endpoint accessible");
  });
});

test.describe("Slack QA Integration Tests", () => {
  test.skip("Slack webhook endpoint exists", async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/slack/events`, {
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        type: "url_verification",
        challenge: "test-challenge-123",
      },
    });

    expect([200, 400, 401]).toContain(response.status());
    console.log("✅ Slack events endpoint exists");
  });
});

test.describe("Railway Monitoring Tests", () => {
  test("Application responds to requests", async ({ request }) => {
    const start = Date.now();
    const response = await request.get(`${BASE_URL}/health`);
    const responseTime = Date.now() - start;

    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(5000);

    console.log(`✅ Response time: ${responseTime}ms`);
  });
});
