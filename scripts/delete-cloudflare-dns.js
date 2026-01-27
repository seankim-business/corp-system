#!/usr/bin/env node

const https = require("https");

// Configuration
const CF_ZONE_ID = "33d7a92c496ef4d2001662f51d0ee853";
const TARGET_IP = "66.33.22.104";
const TARGET_NAME = "@"; // Root domain

// Check for API token in environment or argument
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.argv[2];

if (!CF_TOKEN) {
  console.error("❌ Error: Cloudflare API token required");
  console.error("\nUsage:");
  console.error("  CLOUDFLARE_API_TOKEN=your_token node delete-cloudflare-dns.js");
  console.error("  OR");
  console.error("  node delete-cloudflare-dns.js your_token");
  console.error("\nGet token from: https://dash.cloudflare.com/profile/api-tokens");
  process.exit(1);
}

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.cloudflare.com",
      port: 443,
      path: `/client/v4${path}`,
      method: method,
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
    };

    if (data) {
      const body = JSON.stringify(data);
      options.headers["Content-Length"] = body.length;
    }

    const req = https.request(options, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          if (response.success) {
            resolve(response.result);
          } else {
            reject(new Error(response.errors?.[0]?.message || "Unknown error"));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on("error", reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function listDNSRecords() {
  console.log("📋 Fetching DNS records...\n");
  return await makeRequest("GET", `/zones/${CF_ZONE_ID}/dns_records`);
}

async function deleteDNSRecord(recordId) {
  console.log(`🗑️  Deleting DNS record ${recordId}...\n`);
  return await makeRequest("DELETE", `/zones/${CF_ZONE_ID}/dns_records/${recordId}`);
}

async function main() {
  try {
    console.log("🚀 ===== Cloudflare DNS Record Deletion =====\n");
    console.log(`Zone ID: ${CF_ZONE_ID}`);
    console.log(`Target: A record for "${TARGET_NAME}" → ${TARGET_IP}\n`);

    // List all DNS records
    const records = await listDNSRecords();

    console.log(`✅ Found ${records.length} DNS records\n`);

    // Find the A record pointing to target IP
    const targetRecord = records.find(
      (r) => r.type === "A" && r.name === "nubabel.com" && r.content === TARGET_IP,
    );

    if (!targetRecord) {
      console.log("❌ A record not found!");
      console.log("\nCurrent A records:");
      records
        .filter((r) => r.type === "A")
        .forEach((r) => {
          console.log(`  - ${r.name} → ${r.content} (ID: ${r.id})`);
        });
      process.exit(1);
    }

    console.log("✅ Found target A record:");
    console.log(`   Name: ${targetRecord.name}`);
    console.log(`   Type: ${targetRecord.type}`);
    console.log(`   Content: ${targetRecord.content}`);
    console.log(`   ID: ${targetRecord.id}`);
    console.log(`   Proxied: ${targetRecord.proxied}\n`);

    await deleteDNSRecord(targetRecord.id);

    console.log("✅ ===== DNS Record Deleted Successfully =====\n");
    console.log("📋 Next steps:");
    console.log("1. Wait 60 seconds for DNS propagation");
    console.log("2. Test with: curl -I https://nubabel.com/");
    console.log("3. Verify the site is no longer accessible\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
