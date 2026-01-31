#!/bin/bash

BASE_URL="http://localhost:3000"

echo "======================================"
echo "Slack Integration E2E Test"
echo "======================================"
echo ""

# Test 1: OAuth Callback Endpoint
echo "Test 1: GET /api/slack/oauth/callback (expect redirect or error)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/slack/oauth/callback")
echo "Status: ${RESPONSE}"
if [ "$RESPONSE" = "302" ] || [ "$RESPONSE" = "400" ]; then
  echo "✓ PASS - OAuth callback endpoint exists and responds"
else
  echo "✗ FAIL - Expected 302 or 400, got ${RESPONSE}"
fi
echo ""

# Test 2: Slack Events Endpoint (webhook)
echo "Test 2: POST /api/slack/events (expect 401 or signature verification error)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${BASE_URL}/api/webhooks/slack/events" \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test"}')
echo "Status: ${RESPONSE}"
if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "400" ] || [ "$RESPONSE" = "403" ]; then
  echo "✓ PASS - Events endpoint exists (rejected as expected without signature)"
else
  echo "✗ FAIL - Expected 401/400/403, got ${RESPONSE}"
fi
echo ""

# Test 3: Slack Commands Endpoint
echo "Test 3: POST /api/webhooks/slack/commands (expect 401 or signature verification error)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${BASE_URL}/api/webhooks/slack/commands" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "command=/nubabel&text=test")
echo "Status: ${RESPONSE}"
if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "400" ] || [ "$RESPONSE" = "403" ]; then
  echo "✓ PASS - Commands endpoint exists (rejected as expected without signature)"
else
  echo "✗ FAIL - Expected 401/400/403, got ${RESPONSE}"
fi
echo ""

# Test 4: Check Slack credentials endpoint (requires auth)
echo "Test 4: POST /api/slack/credentials (expect 401 without auth)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${BASE_URL}/api/slack/credentials" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"test","clientSecret":"test","signingSecret":"test"}')
echo "Status: ${RESPONSE}"
if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "403" ]; then
  echo "✓ PASS - Credentials endpoint exists (requires auth as expected)"
else
  echo "✗ FAIL - Expected 401/403, got ${RESPONSE}"
fi
echo ""

# Test 5: Check Slack integration status endpoint
echo "Test 5: GET /api/slack/integration (expect 401 without auth)"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  "${BASE_URL}/api/slack/integration")
echo "Status: ${RESPONSE}"
if [ "$RESPONSE" = "401" ] || [ "$RESPONSE" = "403" ]; then
  echo "✓ PASS - Integration status endpoint exists (requires auth as expected)"
else
  echo "✗ FAIL - Expected 401/403, got ${RESPONSE}"
fi
echo ""

echo "======================================"
echo "Summary"
echo "======================================"
echo ""
echo "Available Slack Endpoints:"
echo "1. OAuth Flow:"
echo "   GET /api/slack/oauth/callback - Handles OAuth callback from Slack"
echo ""
echo "2. Webhooks (require Slack signature):"
echo "   POST /api/webhooks/slack/events - Receives Slack events"
echo "   POST /api/webhooks/slack/commands - Receives Slack slash commands"
echo ""
echo "3. Management (require authentication):"
echo "   POST /api/slack/credentials - Save Slack app credentials (BYOA)"
echo "   GET /api/slack/integration - Get integration status"
echo ""
