import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const REMOTE_DEBUGGING_PORT = 9222;
// 테스트 전용 프로필 (로그인 1회 후 영구 유지)
const testProfileDir = path.join(process.cwd(), '.chrome-test-profile');

async function isDebugPortOpen(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${REMOTE_DEBUGGING_PORT}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

function setupTestProfile(): void {
  const isFirstRun = !fs.existsSync(testProfileDir);

  if (isFirstRun) {
    fs.mkdirSync(testProfileDir, { recursive: true });
    console.log('📁 새 테스트 프로필 생성됨');
    console.log('💡 테스트 Chrome에서 필요한 사이트에 로그인하세요 (1회만)');
  }
}

function startTestChrome(): void {
  console.log('테스트용 Chrome 시작 중...');

  setupTestProfile();

  const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    `--remote-debugging-port=${REMOTE_DEBUGGING_PORT}`,
    `--user-data-dir=${testProfileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: 'ignore' });
  chromeProcess.unref();
}

/**
 * 테스트 전용 Chrome (일반 Chrome과 동시 실행 가능)
 *
 * - 일반 Chrome을 끄지 않아도 사용 가능
 * - 테스트 Chrome에서 1회 로그인하면 영구 유지
 * - 프로필: .chrome-test-profile/
 */
export const test = base.extend<{
  persistentContext: BrowserContext;
  persistentPage: Page;
}>({
  persistentContext: async ({}, use) => {
    let isOpen = await isDebugPortOpen();

    if (!isOpen) {
      startTestChrome();

      console.log('Chrome 준비 대기 중...');
      for (let i = 0; i < 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (await isDebugPortOpen()) {
          console.log('Chrome 준비 완료!');
          isOpen = true;
          break;
        }
      }

      if (!isOpen) {
        throw new Error('Chrome 시작 실패');
      }
    } else {
      console.log('기존 테스트 Chrome 사용');
    }

    const browser = await chromium.connectOverCDP(`http://localhost:${REMOTE_DEBUGGING_PORT}`);
    const context = browser.contexts()[0];

    await use(context);
    await browser.close();
  },
  persistentPage: async ({ persistentContext }, use) => {
    const page = await persistentContext.newPage();
    await use(page);
  },
});

export { expect } from '@playwright/test';
