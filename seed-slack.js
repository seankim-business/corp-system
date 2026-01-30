const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Simple encryption matching the app's encrypt function
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
  if (!ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY not set');
    process.exit(1);
  }
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

async function main() {
  console.log('Checking existing Organizations...');
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, domain: true }
  });
  console.log('Organizations:', JSON.stringify(orgs, null, 2));
  
  if (orgs.length === 0) {
    console.log('No organizations found. Need to create one first.');
    process.exit(1);
  }
  
  // Use first org (should be Kyndof)
  const org = orgs[0];
  console.log(`\nUsing organization: ${org.name} (${org.id})`);
  
  // Check existing Slack integration
  const existing = await prisma.slackIntegration.findFirst({
    where: { workspaceId: 'T03KC04T1GT' }
  });
  
  if (existing) {
    console.log('Slack integration already exists:', existing.id);
    console.log('Enabled:', existing.enabled);
    console.log('Bot User ID:', existing.botUserId);
    return;
  }
  
  // Create new integration
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    console.error('SLACK_BOT_TOKEN not set');
    process.exit(1);
  }
  
  const integration = await prisma.slackIntegration.create({
    data: {
      organizationId: org.id,
      workspaceId: 'T03KC04T1GT',
      workspaceName: 'Kyndof',
      botToken: encrypt(botToken),
      botUserId: 'U08DGQX4K5M', // Bot user ID from Slack
      scopes: ['app_mentions:read', 'chat:write', 'channels:history', 'groups:history', 'im:history', 'mpim:history', 'users:read', 'users:read.email', 'team:read'],
      enabled: true,
      healthStatus: 'healthy',
      installedAt: new Date(),
      installedBy: org.id, // Using org ID as placeholder
    }
  });
  
  console.log('Created SlackIntegration:', integration.id);
  console.log('Workspace:', integration.workspaceName);
  console.log('Enabled:', integration.enabled);
}

main().catch(e => console.error('Error:', e)).finally(() => prisma.$disconnect());
