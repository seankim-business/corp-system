#!/bin/bash

BASE_URL="http://localhost:3000"
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItaWQiLCJvcmdhbml6YXRpb25JZCI6InRlc3Qtb3JnLWlkIiwiaXBBZGRyZXNzIjoiMTI3LjAuMC4xIiwidXNlckFnZW50IjoiY3VybC90ZXN0IiwiaWF0IjoxNzY5Njc1MTk1LCJleHAiOjE3Njk2Nzg3OTV9.wHAKG3bh83yqvjRbPUT3I-qv2JVSL-MqLS-GYfyZxDc"

echo "======================================"
echo "Testing Extensions API"
echo "======================================"
echo ""

echo "1. Health Check"
echo "--------------------------------------"
curl -s "$BASE_URL/health" | jq '.' 2>/dev/null || curl -s "$BASE_URL/health"
echo ""
echo ""

echo "2. Test without authentication (expecting 401)"
echo "--------------------------------------"
curl -s "$BASE_URL/api/v1/extensions" | jq '.' 2>/dev/null || curl -s "$BASE_URL/api/v1/extensions"
echo ""
echo ""

echo "3. Test with Bearer token (may fail if user not in DB)"
echo "--------------------------------------"
curl -s -H "Authorization: Bearer $TOKEN" \
     -H "User-Agent: curl/test" \
     "$BASE_URL/api/v1/extensions" | jq '.' 2>/dev/null || \
curl -s -H "Authorization: Bearer $TOKEN" \
     -H "User-Agent: curl/test" \
     "$BASE_URL/api/v1/extensions"
echo ""
echo ""

echo "4. Test with Cookie (may fail if user not in DB)"
echo "--------------------------------------"
curl -s -b "session=$TOKEN" \
     -H "User-Agent: curl/test" \
     "$BASE_URL/api/v1/extensions" | jq '.' 2>/dev/null || \
curl -s -b "session=$TOKEN" \
     -H "User-Agent: curl/test" \
     "$BASE_URL/api/v1/extensions"
echo ""
echo ""

echo "5. Test search endpoint without auth (expecting 401)"
echo "--------------------------------------"
curl -s "$BASE_URL/api/v1/extensions/search?q=test" | jq '.' 2>/dev/null || \
curl -s "$BASE_URL/api/v1/extensions/search?q=test"
echo ""
echo ""

echo "6. Test resolve endpoint without auth (expecting 401)"
echo "--------------------------------------"
curl -s -X POST "$BASE_URL/api/v1/extensions/resolve" \
     -H "Content-Type: application/json" \
     -d '{"request": "test request"}' | jq '.' 2>/dev/null || \
curl -s -X POST "$BASE_URL/api/v1/extensions/resolve" \
     -H "Content-Type: application/json" \
     -d '{"request": "test request"}'
echo ""
echo ""

echo "======================================"
echo "Tests completed"
echo "======================================"
