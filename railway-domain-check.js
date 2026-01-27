const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('🚀 Railway 대시보드 접속 중...');
    await page.goto('https://railway.app/dashboard', { waitUntil: 'networkidle' });
    
    // 로그인 상태 확인
    const isLoggedIn = await page.locator('text=Projects').isVisible({ timeout: 5000 }).catch(() => false);
    
    if (!isLoggedIn) {
      console.log('❌ 로그인이 필요합니다. 수동으로 로그인해주세요.');
      console.log('📍 로그인 페이지: https://railway.app/login');
      await page.waitForTimeout(30000); // 30초 대기
    }

    // 프로젝트 목록 확인
    const projects = await page.locator('[data-testid="project-card"]').all();
    console.log(`\n✅ 발견된 프로젝트: ${projects.length}개`);

    // nubabel 또는 corp-system 프로젝트 찾기
    for (const project of projects) {
      const name = await project.locator('text=').first().textContent();
      console.log(`  - ${name}`);
    }

    // 스크린샷 저장
    await page.screenshot({ path: '/tmp/railway-dashboard.png', fullPage: true });
    console.log('\n📸 스크린샷 저장: /tmp/railway-dashboard.png');

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await browser.close();
  }
})();
