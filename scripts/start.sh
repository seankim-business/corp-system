#!/bin/sh
set -e

echo "🚀 Starting Nubabel Platform..."
echo "Environment: NODE_ENV=${NODE_ENV}"
echo "Port: ${PORT}"

echo "📊 Running database migrations..."

echo "Step 1: Fix any failed migrations..."
node scripts/fix-migration.js || true

echo "Step 2: Deploy migrations..."
if npx prisma migrate deploy; then
  echo "✅ Migrations completed successfully"
else
  echo "⚠️  Migration failed, starting server anyway"
fi

echo "Step 3: Seed starter workflows (if not exists)..."
node scripts/seed-workflows.js || true

echo "🌐 Starting Node.js server..."
echo "Server will bind to 0.0.0.0:${PORT}"
exec node dist/index.js
