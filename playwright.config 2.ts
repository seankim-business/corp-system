import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/__tests__/browser',
  fullyParallel: false,  // 기존 프로필 사용 시 병렬 실행 비활성화
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // 기존 프로필은 동시에 하나의 인스턴스만 사용 가능
  reporter: 'html',
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    headless: false,  // Show browser for debugging
    launchOptions: {
      slowMo: 100,    // Slow down actions for visibility
    },
    channel: 'chrome',  // 시스템에 설치된 Chrome 사용
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev --prefix frontend',
    url: process.env.BASE_URL || 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
