const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Checking _prisma_migrations table...');
  
  const migrations = await prisma.$queryRaw`
    SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
    FROM _prisma_migrations
    ORDER BY started_at DESC
    LIMIT 10
  `;
  
  console.log('Recent migrations:', JSON.stringify(migrations, null, 2));
  
  // Check if feature_flags table exists
  try {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_name = 'feature_flags'
    `;
    console.log('feature_flags table exists:', result[0].count > 0);
  } catch (e) {
    console.log('Error checking table:', e.message);
  }
  
  // Check if set_current_organization function exists
  try {
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM pg_proc 
      WHERE proname = 'set_current_organization'
    `;
    console.log('set_current_organization function exists:', result[0].count > 0);
  } catch (e) {
    console.log('Error checking function:', e.message);
  }
}

main().catch(e => console.error('Error:', e)).finally(() => prisma.$disconnect());
