/**
 * Playwright E2E Test Configuration
 *
 * Runs only tests in tests/e2e directory, ignoring jest/vitest unit tests.
 */
module.exports = {
  testDir: './tests/e2e',
  testMatch: '**/*.test.ts',

  // Ignore non-playwright test files
  testIgnore: [
    '**/node_modules/**',
    '**/src/**/*.test.ts',
    '**/__tests__/**',
    '**/tests/load/**',
  ],

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI for stability
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',
  },

  // Configure projects for major browsers
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
};
