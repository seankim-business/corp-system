import { PlaywrightService } from "../../../src/services/qa-automation/playwright.service";

export interface ClaudeTestConfig {
  headless?: boolean;
  timeout?: number;
}

export async function setupClaudeSession(
  config: ClaudeTestConfig = {},
): Promise<PlaywrightService> {
  const service = new PlaywrightService({
    headless: config.headless ?? false,
    timeout: config.timeout ?? 30000,
  });

  await service.initialize();
  await service.navigateToClaude();

  return service;
}

export async function askClaude(service: PlaywrightService, prompt: string): Promise<string> {
  return await service.sendPrompt(prompt);
}

export async function verifyClaudeResponse(
  response: string,
  expectedContent: string | RegExp,
): Promise<boolean> {
  if (typeof expectedContent === "string") {
    return response.toLowerCase().includes(expectedContent.toLowerCase());
  }
  return expectedContent.test(response);
}

export async function captureClaudeScreenshot(
  service: PlaywrightService,
  testName: string,
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const screenshotPath = `./screenshots/claude-${testName}-${timestamp}.png`;
  await service.screenshot(screenshotPath);
  return screenshotPath;
}

export async function cleanupClaudeSession(service: PlaywrightService): Promise<void> {
  await service.close();
}

export async function withClaudeSession<T>(
  testFn: (service: PlaywrightService) => Promise<T>,
  config: ClaudeTestConfig = {},
): Promise<T> {
  const service = await setupClaudeSession(config);

  try {
    return await testFn(service);
  } finally {
    await cleanupClaudeSession(service);
  }
}

export async function verifyDeploymentWithClaude(
  service: PlaywrightService,
  deploymentUrl: string,
  verificationPrompt: string,
): Promise<{ success: boolean; response: string }> {
  const prompt = `Please verify this deployment: ${deploymentUrl}\n\n${verificationPrompt}`;

  try {
    const response = await askClaude(service, prompt);
    const success = await verifyClaudeResponse(response, /success|working|correct|valid/i);

    return { success, response };
  } catch (error) {
    await captureClaudeScreenshot(service, "deployment-verification-error");
    throw error;
  }
}

export async function runQAChecklist(
  service: PlaywrightService,
  checklist: string[],
): Promise<{
  passed: number;
  failed: number;
  results: Array<{ check: string; passed: boolean; response: string }>;
}> {
  const results: Array<{ check: string; passed: boolean; response: string }> = [];
  let passed = 0;
  let failed = 0;

  for (const check of checklist) {
    try {
      const response = await askClaude(service, check);
      const checkPassed = await verifyClaudeResponse(response, /yes|correct|pass|success/i);

      results.push({ check, passed: checkPassed, response });

      if (checkPassed) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      results.push({
        check,
        passed: false,
        response: `Error: ${error instanceof Error ? error.message : String(error)}`,
      });
      failed++;
    }
  }

  return { passed, failed, results };
}
