import { chromium } from 'playwright';

async function debugAuth() {
  console.log('=== Deep Auth Debug v2 ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Console 에러 캡처
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warn') {
      console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`);
    }
  });

  // Network 에러 캡처
  page.on('requestfailed', req => {
    console.log(`[NET FAIL] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });

  // Response 캡처
  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/auth/') || url.includes('nubabel')) {
      const setCookie = res.headers()['set-cookie'];
      if (setCookie) {
        console.log(`[SET-COOKIE from ${url}]`);
        console.log(`  ${setCookie.substring(0, 200)}`);
      }
    }
  });

  // 1. Dashboard 직접 접근
  console.log('1. Going to https://app.nubabel.com/dashboard...');
  const resp = await page.goto('https://app.nubabel.com/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  console.log(`   Status: ${resp?.status()}`);
  console.log(`   Final URL: ${page.url()}`);

  // 2. 쿠키 확인
  const cookies = await context.cookies('https://app.nubabel.com');
  console.log(`\n2. Cookies for app.nubabel.com: ${cookies.length}`);
  cookies.forEach(c => console.log(`   - ${c.name}: domain=${c.domain}, httpOnly=${c.httpOnly}`));

  const authCookies = await context.cookies('https://auth.nubabel.com');
  console.log(`\n3. Cookies for auth.nubabel.com: ${authCookies.length}`);
  authCookies.forEach(c => console.log(`   - ${c.name}: domain=${c.domain}, httpOnly=${c.httpOnly}`));

  // 3. 프론트엔드에서 /auth/me 호출 확인
  console.log('\n4. Calling auth.nubabel.com/auth/me from app.nubabel.com...');
  const meResult = await page.evaluate(async () => {
    try {
      const r = await fetch('https://auth.nubabel.com/auth/me', {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
      const text = await r.text();
      return { status: r.status, headers: Object.fromEntries(r.headers), body: text.substring(0, 200) };
    } catch (e) {
      return { error: e.message, name: e.name };
    }
  });
  console.log(`   Result: ${JSON.stringify(meResult, null, 2)}`);

  // 4. 같은 도메인으로도 시도
  console.log('\n5. Calling /auth/me (same origin) from app.nubabel.com...');
  const sameDomainResult = await page.evaluate(async () => {
    try {
      const r = await fetch('/auth/me', { credentials: 'include' });
      const text = await r.text();
      return { status: r.status, body: text.substring(0, 200) };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log(`   Result: ${JSON.stringify(sameDomainResult, null, 2)}`);

  // 5. JS에서 실제 사용하는 API URL 확인
  console.log('\n6. Checking actual API base URL used by app...');
  const apiUrl = await page.evaluate(() => {
    // Check for common patterns
    return {
      metaEnv: typeof import.meta?.env === 'object' ? 'exists' : 'no',
    };
  }).catch(() => ({ error: 'cannot evaluate' }));
  console.log(`   ${JSON.stringify(apiUrl)}`);

  await browser.close();
  console.log('\n=== Done ===');
}

debugAuth().catch(console.error);
