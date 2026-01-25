#!/bin/sh
set -e

echo "🚀 Starting Nubabel Platform..."

echo "📊 Running database migrations..."
npx prisma migrate deploy

echo "✅ Migrations complete!"

echo "🌐 Starting Node.js server..."
exec node dist/index.js
