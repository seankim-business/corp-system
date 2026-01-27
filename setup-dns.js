const { chromium } = require('playwright');
const fs = require('fs');

async function setupDNS() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  const results = {
    railway: {},
    cloudflare: {},
    timestamp: new Date().toISOString()
  };

  try {
    console.log('\n🚀 ===== Railway + Cloudflare DNS 설정 시작 =====\n');

    // ===== STEP 1: Railway 대시보드 접속 =====
    console.log('📍 STEP 1: Railway 대시보드 접속');
    await page.goto('https://railway.app/dashboard', { waitUntil: 'networkidle' });
    
    // 로그인 확인
    const loginButton = await page.locator('text=Login').isVisible().catch(() => false);
    if (loginButton) {
      console.log('❌ 로그인이 필요합니다.');
      console.log('📍 로그인 페이지: https://railway.app/login');
      console.log('⏳ 30초 대기 중... (수동으로 로그인해주세요)');
      await page.waitForTimeout(30000);
    }

    // 프로젝트 찾기
    console.log('\n📍 프로젝트 검색 중...');
    await page.waitForTimeout(2000);
    
    const projectLinks = await page.locator('a[href*="/project/"]').all();
    console.log(`✅ 발견된 프로젝트 링크: ${projectLinks.length}개`);

    // nubabel 프로젝트 찾기
    let projectUrl = null;
    for (const link of projectLinks) {
      const href = await link.getAttribute('href');
      const text = await link.textContent();
      console.log(`  - ${text?.trim()} (${href})`);
      
      if (text?.toLowerCase().includes('nubabel') || text?.toLowerCase().includes('corp')) {
        projectUrl = href;
        console.log(`  ✅ 선택됨: ${text?.trim()}`);
      }
    }

    if (!projectUrl) {
      console.log('❌ nubabel 프로젝트를 찾을 수 없습니다.');
      console.log('💡 수동으로 프로젝트를 선택해주세요.');
      await page.waitForTimeout(10000);
      projectUrl = page.url();
    }

    // 프로젝트 페이지 접속
    if (projectUrl && !projectUrl.startsWith('http')) {
      projectUrl = 'https://railway.app' + projectUrl;
    }
    
    console.log(`\n📍 프로젝트 페이지 접속: ${projectUrl}`);
    await page.goto(projectUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 서비스 목록 찾기
    console.log('\n📍 서비스 검색 중...');
    const serviceElements = await page.locator('[data-testid*="service"]').all();
    console.log(`✅ 발견된 서비스 요소: ${serviceElements.length}개`);

    // 스크린샷 저장
    await page.screenshot({ path: '/tmp/railway-step1.png', fullPage: true });
    console.log('📸 스크린샷 저장: /tmp/railway-step1.png');

    // ===== STEP 2: Cloudflare 대시보드 접속 =====
    console.log('\n\n📍 STEP 2: Cloudflare 대시보드 접속');
    await page.goto('https://dash.cloudflare.com', { waitUntil: 'networkidle' });
    
    // 로그인 확인
    const cfLoginButton = await page.locator('text=Login').isVisible().catch(() => false);
    if (cfLoginButton) {
      console.log('❌ Cloudflare 로그인이 필요합니다.');
      console.log('⏳ 30초 대기 중... (수동으로 로그인해주세요)');
      await page.waitForTimeout(30000);
    }

    // nubabel.com 도메인 찾기
    console.log('\n📍 nubabel.com 도메인 검색 중...');
    await page.waitForTimeout(2000);
    
    const domainLinks = await page.locator('a[href*="nubabel.com"]').all();
    console.log(`✅ 발견된 도메인 링크: ${domainLinks.length}개`);

    if (domainLinks.length > 0) {
      await domainLinks[0].click();
      await page.waitForTimeout(2000);
      console.log('✅ nubabel.com 도메인 선택됨');
    }

    // DNS Records 페이지 접속
    console.log('\n📍 DNS Records 페이지 접속');
    const dnsLink = await page.locator('text=DNS').first();
    if (await dnsLink.isVisible()) {
      await dnsLink.click();
      await page.waitForTimeout(2000);
      console.log('✅ DNS 페이지 접속됨');
    }

    // 스크린샷 저장
    await page.screenshot({ path: '/tmp/cloudflare-step1.png', fullPage: true });
    console.log('📸 스크린샷 저장: /tmp/cloudflare-step1.png');

    console.log('\n\n✅ ===== 설정 준비 완료 =====');
    console.log('\n📋 다음 단계:');
    console.log('1. Railway에서 각 서비스의 도메인 정보 확인');
    console.log('2. Cloudflare DNS Records에서 CNAME 레코드 추가');
    console.log('3. SSL/TLS 설정 확인');

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    console.log('\n⏳ 브라우저를 닫으려면 Enter를 누르세요...');
    await page.waitForTimeout(5000);
    await browser.close();
  }
}

setupDNS();
