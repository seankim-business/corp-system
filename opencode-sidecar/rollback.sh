#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔄 OhMyOpenCode Rollback Script"
echo "================================"
echo ""

if [ -z "$1" ]; then
  echo "Usage: ./rollback.sh <commit-hash>"
  echo ""
  echo "Example:"
  echo "  ./rollback.sh 3ed1c66"
  echo ""
  echo "To find available commits:"
  echo "  cd $PROJECT_ROOT/vendor/ohmyopencode"
  echo "  git log --oneline -10"
  exit 1
fi

TARGET_COMMIT="$1"

echo "Target commit: $TARGET_COMMIT"
echo ""

cd "$PROJECT_ROOT/vendor/ohmyopencode"

if ! git cat-file -e "$TARGET_COMMIT^{commit}" 2>/dev/null; then
  echo "❌ Error: Commit '$TARGET_COMMIT' not found"
  echo ""
  echo "Available recent commits:"
  git log --oneline -10
  exit 1
fi

CURRENT_COMMIT=$(git rev-parse HEAD)
CURRENT_VERSION=$(git show HEAD:package.json | grep '"version"' | head -1 | awk -F'"' '{print $4}')
TARGET_VERSION=$(git show "$TARGET_COMMIT:package.json" | grep '"version"' | head -1 | awk -F'"' '{print $4}')

echo "Current version: v$CURRENT_VERSION ($CURRENT_COMMIT)"
echo "Target version:  v$TARGET_VERSION ($TARGET_COMMIT)"
echo ""

read -p "Are you sure you want to rollback? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Rollback cancelled"
  exit 0
fi

echo ""
echo "Step 1: Checking out OhMyOpenCode to $TARGET_COMMIT..."
git checkout "$TARGET_COMMIT"

echo "Step 2: Updating parent repository..."
cd "$PROJECT_ROOT"
git add vendor/ohmyopencode

echo "Step 3: Rebuilding opencode-sidecar..."
cd "$SCRIPT_DIR"

if [ -f "package-lock.json" ]; then
  npm ci
else
  npm install
fi

npm run build

echo ""
echo "Step 4: Restarting service..."

if command -v docker-compose &> /dev/null && [ -f "docker-compose.yml" ]; then
  echo "Detected docker-compose, restarting container..."
  docker-compose restart opencode-sidecar
elif command -v docker &> /dev/null; then
  echo "Detected docker, restarting container..."
  docker restart opencode-sidecar 2>/dev/null || echo "No running container found"
elif command -v pm2 &> /dev/null; then
  echo "Detected PM2, restarting process..."
  pm2 restart opencode-sidecar
else
  echo "⚠️  Manual restart required"
  echo "Please restart the opencode-sidecar service manually"
fi

echo ""
echo "✅ Rollback complete!"
echo ""
echo "Rolled back:"
echo "  From: v$CURRENT_VERSION ($CURRENT_COMMIT)"
echo "  To:   v$TARGET_VERSION ($TARGET_COMMIT)"
echo ""
echo "Next steps:"
echo "1. Verify health: curl http://localhost:3001/health"
echo "2. Test delegation: curl -X POST http://localhost:3001/delegate -d @test-request.json"
echo "3. Monitor logs for 10 minutes"
echo "4. Commit the rollback: git commit -m 'chore: rollback OhMyOpenCode to v$TARGET_VERSION'"
echo ""
