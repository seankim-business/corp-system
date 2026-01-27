#!/usr/bin/env node

const https = require('https');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function setupCloudflare() {
  console.log('\n🚀 ===== Cloudflare DNS 설정 자동화 =====\n');

  // 입력 수집
  console.log('📋 필요한 정보를 입력해주세요:\n');

  const cfToken = await question('1️⃣  Cloudflare API Token: ');
  const cfZoneId = await question('2️⃣  Cloudflare Zone ID (nubabel.com): ');
  const landingDomain = await question('3️⃣  Landing Page Railway Domain (예: nubabel-landing-prod.up.railway.app): ');
  const appDomain = await question('4️⃣  Main App Railway Domain (예: nubabel-app-prod.up.railway.app): ');

  if (!cfToken || !cfZoneId || !landingDomain || !appDomain) {
    console.log('\n❌ 모든 정보를 입력해주세요.');
    rl.close();
    return;
  }

  console.log('\n✅ 입력 완료. DNS 레코드 설정 중...\n');

  try {
    // CNAME 레코드 #1: @ → Landing
    console.log('📍 레코드 #1: nubabel.com → Landing Page');
    await createDNSRecord(cfToken, cfZoneId, {
      type: 'CNAME',
      name: '@',
      content: landingDomain,
      proxied: true,
      ttl: 1 // Auto
    });
    console.log('✅ 레코드 #1 생성 완료\n');

    // CNAME 레코드 #2: app → Main App
    console.log('📍 레코드 #2: app.nubabel.com → Main App');
    await createDNSRecord(cfToken, cfZoneId, {
      type: 'CNAME',
      name: 'app',
      content: appDomain,
      proxied: true,
      ttl: 1 // Auto
    });
    console.log('✅ 레코드 #2 생성 완료\n');

    console.log('✅ ===== DNS 설정 완료 =====\n');
    console.log('📋 다음 단계:');
    console.log('1. Cloudflare SSL/TLS 설정 확인');
    console.log('   - SSL/TLS → Encryption mode → Full (strict)');
    console.log('2. Always Use HTTPS 활성화');
    console.log('3. DNS 전파 확인 (5-10분 소요)');
    console.log('   - dig nubabel.com');
    console.log('   - dig app.nubabel.com');
    console.log('4. 브라우저 테스트');
    console.log('   - https://nubabel.com');
    console.log('   - https://app.nubabel.com');

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    rl.close();
  }
}

function createDNSRecord(token, zoneId, record) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(record);

    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: `/client/v4/zones/${zoneId}/dns_records`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.success) {
            resolve(response.result);
          } else {
            reject(new Error(response.errors?.[0]?.message || 'Unknown error'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

setupCloudflare();
