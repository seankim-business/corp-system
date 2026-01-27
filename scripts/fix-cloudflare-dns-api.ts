#!/usr/bin/env tsx

import * as readline from "readline";

const DOMAIN = "nubabel.com";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

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

async function cloudflareRequest(endpoint: string, options: RequestInit, apiToken: string) {
  const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data)}`);
  }

  return data;
}

async function main() {
  console.log("🚀 Starting Cloudflare DNS fix via API...\n");

  const apiToken = process.env.CLOUDFLARE_API_TOKEN || (await prompt("Cloudflare API Token: "));

  if (!apiToken) {
    console.error("❌ API token is required");
    console.log("\n📖 To create an API token:");
    console.log("1. Go to https://dash.cloudflare.com/profile/api-tokens");
    console.log('2. Click "Create Token"');
    console.log('3. Use "Edit zone DNS" template');
    console.log("4. Select zone: nubabel.com");
    console.log("5. Copy the token");
    process.exit(1);
  }

  try {
    console.log("🔍 Finding zone ID for nubabel.com...");
    const zonesResponse = await cloudflareRequest(
      `/zones?name=${DOMAIN}`,
      {
        method: "GET",
      },
      apiToken,
    );

    if (!zonesResponse.result || zonesResponse.result.length === 0) {
      console.error(`❌ Could not find zone for ${DOMAIN}`);
      process.exit(1);
    }

    const zoneId = zonesResponse.result[0].id;
    console.log(`✅ Found zone ID: ${zoneId}`);

    console.log("\n📋 Fetching DNS records...");
    const recordsResponse = await cloudflareRequest(
      `/zones/${zoneId}/dns_records`,
      {
        method: "GET",
      },
      apiToken,
    );

    const records = recordsResponse.result;
    console.log(`Found ${records.length} DNS records`);

    console.log("\n🔎 Finding Railway domain from app.nubabel.com...");
    const appRecord = records.find((r: any) => r.name === "app.nubabel.com" && r.type === "CNAME");

    if (!appRecord) {
      console.error("❌ Could not find CNAME record for app.nubabel.com");
      console.log("\n📋 Available records:");
      records.forEach((r: any) => {
        console.log(`  - ${r.type} ${r.name} → ${r.content}`);
      });
      process.exit(1);
    }

    const railwayDomain = appRecord.content;
    console.log(`✅ Found Railway domain: ${railwayDomain}`);

    console.log("\n🗑️  Deleting A records for @ (root)...");
    const aRecords = records.filter(
      (r: any) =>
        r.name === DOMAIN &&
        r.type === "A" &&
        (r.content === "13.248.243.5" || r.content === "76.223.105.230"),
    );

    console.log(`Found ${aRecords.length} A records to delete`);

    for (const record of aRecords) {
      try {
        await cloudflareRequest(
          `/zones/${zoneId}/dns_records/${record.id}`,
          {
            method: "DELETE",
          },
          apiToken,
        );
        console.log(`  ✅ Deleted A record: ${record.content}`);
      } catch (e) {
        console.log(`  ⚠️  Could not delete record ${record.content}: ${e}`);
      }
    }

    console.log(`\n➕ Adding CNAME record: @ → ${railwayDomain}...`);

    const existingCname = records.find((r: any) => r.name === DOMAIN && r.type === "CNAME");

    if (existingCname) {
      console.log("  ℹ️  CNAME record already exists, updating...");
      await cloudflareRequest(
        `/zones/${zoneId}/dns_records/${existingCname.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            type: "CNAME",
            name: "@",
            content: railwayDomain,
            proxied: true,
            ttl: 1,
          }),
        },
        apiToken,
      );
      console.log("  ✅ Updated CNAME record");
    } else {
      await cloudflareRequest(
        `/zones/${zoneId}/dns_records`,
        {
          method: "POST",
          body: JSON.stringify({
            type: "CNAME",
            name: "@",
            content: railwayDomain,
            proxied: true,
            ttl: 1,
          }),
        },
        apiToken,
      );
      console.log("  ✅ Created CNAME record");
    }

    console.log("\n✅ DNS changes completed!");
    console.log(`\n📋 Summary:`);
    console.log(`  - Railway domain: ${railwayDomain}`);
    console.log(`  - Deleted ${aRecords.length} A records`);
    console.log(`  - Added/Updated CNAME: @ → ${railwayDomain} (Proxied)`);
    console.log(`\n⏳ Waiting 2 minutes for DNS propagation...`);

    await sleep(120000);

    console.log("\n🔍 Verifying nubabel.com...");

    try {
      const response = await fetch("https://nubabel.com/", {
        method: "HEAD",
        redirect: "follow",
      });

      console.log(`\n📊 Verification Result:`);
      console.log(`  - Status: ${response.status} ${response.statusText}`);
      console.log(`  - URL: ${response.url}`);

      if (response.status === 200) {
        console.log("\n✅ SUCCESS! nubabel.com is now working!");
      } else {
        console.log("\n⚠️  DNS updated but site returned non-200 status");
        console.log("   This may be normal if the app needs more time to start");
      }
    } catch (e) {
      console.log(`\n⚠️  Could not verify: ${e}`);
      console.log("   DNS may need more time to propagate");
    }

    console.log("\n🎉 Done!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
