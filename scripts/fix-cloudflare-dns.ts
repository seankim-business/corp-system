#!/usr/bin/env tsx

import { chromium, Browser, Page, ElementHandle } from "playwright";
import * as readline from "readline";

const CLOUDFLARE_LOGIN_URL = "https://dash.cloudflare.com/login";
const DOMAIN = "nubabel.com";

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("🚀 Starting Cloudflare DNS automation...\n");

  const email = process.env.CLOUDFLARE_EMAIL || (await prompt("Cloudflare Email: "));
  const password = process.env.CLOUDFLARE_PASSWORD || (await prompt("Cloudflare Password: "));

  if (!email || !password) {
    console.error("❌ Email and password are required");
    process.exit(1);
  }

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log("🌐 Launching browser...");
    browser = await chromium.launch({
      headless: false,
      slowMo: 500,
    });

    page = await browser.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    console.log("🔐 Logging into Cloudflare...");
    await page.goto(CLOUDFLARE_LOGIN_URL);
    await page.waitForLoadState("networkidle");

    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    console.log("⏳ Waiting for dashboard...");
    await page.waitForURL("**/dash.cloudflare.com/**", { timeout: 30000 });
    await sleep(2000);

    const currentUrl = page.url();
    if (currentUrl.includes("challenge") || currentUrl.includes("verify")) {
      console.log("⚠️  2FA or verification required. Please complete it in the browser...");
      await prompt("Press Enter after completing verification...");
    }

    console.log(`🔍 Navigating to ${DOMAIN} DNS settings...`);

    await page.goto("https://dash.cloudflare.com/");
    await page.waitForLoadState("networkidle");

    const domainSelectors = [`text=${DOMAIN}`, `a:has-text("${DOMAIN}")`, `[href*="${DOMAIN}"]`];

    let domainFound = false;
    for (const selector of domainSelectors) {
      try {
        await page.click(selector, { timeout: 5000 });
        domainFound = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!domainFound) {
      console.error(`❌ Could not find domain ${DOMAIN} in dashboard`);
      await page.screenshot({ path: "tmp/cloudflare-error.png", fullPage: true });
      process.exit(1);
    }

    await page.waitForLoadState("networkidle");
    await sleep(2000);

    console.log("📋 Opening DNS settings...");
    const dnsSelectors = ["text=DNS", 'a:has-text("DNS")', '[href*="/dns"]'];

    let dnsFound = false;
    for (const selector of dnsSelectors) {
      try {
        await page.click(selector, { timeout: 5000 });
        dnsFound = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!dnsFound) {
      console.error("❌ Could not find DNS settings");
      await page.screenshot({ path: "tmp/cloudflare-error.png", fullPage: true });
      process.exit(1);
    }

    await page.waitForLoadState("networkidle");
    await sleep(2000);

    await page.screenshot({ path: "tmp/dns-before.png", fullPage: true });
    console.log("📸 Screenshot saved: tmp/dns-before.png");

    console.log("🔎 Finding Railway domain from app.nubabel.com...");

    const records = await page.$$('[data-testid="dns-record-row"], tr:has(td)');
    let railwayDomain = "";

    for (const record of records) {
      const text = await record.textContent();
      if (text && text.includes("app.nubabel.com") && text.includes("CNAME")) {
        const match = text.match(/([a-z0-9-]+\.up\.railway\.app)/i);
        if (match) {
          railwayDomain = match[1];
          console.log(`✅ Found Railway domain: ${railwayDomain}`);
          break;
        }
      }
    }

    if (!railwayDomain) {
      console.error("❌ Could not find Railway domain from app.nubabel.com");
      console.log("📋 Current DNS records:");
      for (const record of records) {
        const text = await record.textContent();
        console.log(`  - ${text?.substring(0, 100)}`);
      }
      process.exit(1);
    }

    console.log("🗑️  Deleting A records for @ (root)...");

    const aRecordsToDelete: ElementHandle<SVGElement | HTMLElement>[] = [];
    for (const record of records) {
      const text = await record.textContent();
      if (text && (text.includes("13.248.243.5") || text.includes("76.223.105.230"))) {
        aRecordsToDelete.push(record);
      }
    }

    console.log(`Found ${aRecordsToDelete.length} A records to delete`);

    for (const record of aRecordsToDelete) {
      try {
        const deleteButton = await record.$(
          'button:has-text("Delete"), button[aria-label*="Delete"]',
        );
        if (deleteButton) {
          await deleteButton.click();
          await sleep(1000);

          const confirmButton = await page.$(
            'button:has-text("Delete"), button:has-text("Confirm")',
          );
          if (confirmButton) {
            await confirmButton.click();
            await sleep(1000);
            console.log("  ✅ Deleted A record");
          }
        }
      } catch (e) {
        console.log(`  ⚠️  Could not delete record: ${e}`);
      }
    }

    console.log(`➕ Adding CNAME record: @ → ${railwayDomain}...`);

    const addRecordSelectors = [
      'button:has-text("Add record")',
      'button:has-text("Add")',
      '[data-testid="add-dns-record-button"]',
    ];

    let addButtonFound = false;
    for (const selector of addRecordSelectors) {
      try {
        await page.click(selector, { timeout: 5000 });
        addButtonFound = true;
        break;
      } catch (e) {
        continue;
      }
    }

    if (!addButtonFound) {
      console.error('❌ Could not find "Add record" button');
      await page.screenshot({ path: "tmp/cloudflare-error.png", fullPage: true });
      process.exit(1);
    }

    await sleep(2000);

    const typeDropdown = await page.$('select[name="type"], [data-testid="dns-record-type"]');
    if (typeDropdown) {
      await typeDropdown.selectOption("CNAME");
    }

    const nameInput = await page.$('input[name="name"], [placeholder*="Name"]');
    if (nameInput) {
      await nameInput.fill("@");
    }

    const targetInput = await page.$(
      'input[name="content"], input[name="target"], [placeholder*="Target"]',
    );
    if (targetInput) {
      await targetInput.fill(railwayDomain);
    }

    const proxyToggle = await page.$('button:has-text("Proxied"), [data-testid="proxy-toggle"]');
    if (proxyToggle) {
      const isProxied = await proxyToggle.getAttribute("aria-checked");
      if (isProxied !== "true") {
        await proxyToggle.click();
      }
    }

    await sleep(1000);

    const saveButton = await page.$('button:has-text("Save"), button[type="submit"]');
    if (saveButton) {
      await saveButton.click();
      console.log("✅ CNAME record added");
    } else {
      console.error("❌ Could not find Save button");
      await page.screenshot({ path: "tmp/cloudflare-error.png", fullPage: true });
      process.exit(1);
    }

    await sleep(3000);

    await page.screenshot({ path: "tmp/dns-after.png", fullPage: true });
    console.log("📸 Screenshot saved: tmp/dns-after.png");

    console.log("\n✅ DNS changes completed!");
    console.log(`\n📋 Summary:`);
    console.log(`  - Railway domain: ${railwayDomain}`);
    console.log(`  - Deleted ${aRecordsToDelete.length} A records`);
    console.log(`  - Added CNAME: @ → ${railwayDomain} (Proxied)`);
    console.log(`\n⏳ Waiting 2-3 minutes for DNS propagation...`);

    await sleep(120000);

    console.log("\n🔍 Verifying nubabel.com...");
  } catch (error) {
    console.error("❌ Error:", error);
    if (page) {
      await page.screenshot({ path: "tmp/cloudflare-error.png", fullPage: true });
      console.log("📸 Error screenshot saved: tmp/cloudflare-error.png");
    }
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(console.error);
