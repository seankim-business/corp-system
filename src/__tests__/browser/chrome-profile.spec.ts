import { test, expect } from './fixtures';

test('Chrome 프로필이 로드되는지 확인', async ({ persistentPage }) => {
  test.setTimeout(60000);

  // Google에 접속
  await persistentPage.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // 페이지가 로드되었는지 확인
  await expect(persistentPage).toHaveTitle(/Google/);

  // 스크린샷 저장
  await persistentPage.screenshot({ path: 'test-results/chrome-profile.png' });

  console.log('Chrome 프로필로 브라우저가 열렸습니다.');
});
