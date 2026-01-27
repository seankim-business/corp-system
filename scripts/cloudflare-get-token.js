#!/usr/bin/env node

console.log('\n🔐 ===== Cloudflare API Token Required =====\n');
console.log('Browser automation is blocked by CAPTCHA.');
console.log('Please manually retrieve your Cloudflare API token:\n');
console.log('📋 Steps:');
console.log('1. Open: https://dash.cloudflare.com/profile/api-tokens');
console.log('2. Log in with: dev.ops.admin@kyndof.com');
console.log('3. Click "Create Token"');
console.log('4. Use template: "Edit zone DNS"');
console.log('5. Zone Resources: Include → Specific zone → nubabel.com');
console.log('6. Click "Continue to summary"');
console.log('7. Click "Create Token"');
console.log('8. Copy the token\n');
console.log('Then run:');
console.log('  export CLOUDFLARE_API_TOKEN="your_token_here"');
console.log('  node scripts/delete-cloudflare-dns.js\n');
console.log('OR run directly:');
console.log('  node scripts/delete-cloudflare-dns.js your_token_here\n');
