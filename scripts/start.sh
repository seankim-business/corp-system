#!/bin/sh
set -e

echo "🚀 Starting Nubabel Platform..."
echo "Environment: NODE_ENV=${NODE_ENV}"
echo "Port: ${PORT}"

echo "📊 Running database migrations..."
if npx prisma migrate deploy; then
  echo "✅ Migrations completed successfully"
else
  echo "❌ Migration failed with exit code $?"
  exit 1
fi

echo "🌐 Starting Node.js server..."
echo "Server will bind to 0.0.0.0:${PORT}"
exec node dist/index.js
