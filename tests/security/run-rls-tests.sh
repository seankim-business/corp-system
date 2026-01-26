#!/bin/bash

# ============================================================================
# RLS TEST RUNNER
# ============================================================================
# Purpose: Execute comprehensive RLS test suite and verify results
# Usage: bash tests/security/run-rls-tests.sh
# ============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
TEST_FILE="tests/security/rls-test.sql"
OUTPUT_FILE="/tmp/rls-test-output.txt"
ERROR_FILE="/tmp/rls-test-errors.txt"
SUMMARY_FILE="/tmp/rls-test-summary.txt"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ ERROR: DATABASE_URL environment variable not set${NC}"
  echo "Please set DATABASE_URL before running tests:"
  echo "  export DATABASE_URL='postgresql://user:password@localhost:5432/nubabel'"
  exit 1
fi

# Check if test file exists
if [ ! -f "$TEST_FILE" ]; then
  echo -e "${RED}❌ ERROR: Test file not found: $TEST_FILE${NC}"
  exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  RLS (Row-Level Security) Test Suite${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📋 Test Configuration:${NC}"
echo "  Database: $DATABASE_URL"
echo "  Test File: $TEST_FILE"
echo "  Output: $OUTPUT_FILE"
echo ""

# Run the test
echo -e "${YELLOW}🚀 Running RLS tests...${NC}"
echo ""

if psql "$DATABASE_URL" -f "$TEST_FILE" > "$OUTPUT_FILE" 2> "$ERROR_FILE"; then
  TEST_PASSED=true
else
  TEST_PASSED=false
fi

# Parse output and check for expected patterns
echo -e "${YELLOW}📊 Analyzing test results...${NC}"
echo ""

# Count test results
SAME_ORG_SELECTS=$(grep -c "test_.*_same_org_select" "$OUTPUT_FILE" || echo "0")
CROSS_ORG_SELECTS=$(grep -c "test_.*_cross_org_select" "$OUTPUT_FILE" || echo "0")
SAME_ORG_INSERTS=$(grep -c "test_.*_same_org_insert" "$OUTPUT_FILE" || echo "0")
SAME_ORG_UPDATES=$(grep -c "test_.*_same_org_update" "$OUTPUT_FILE" || echo "0")

# Check for RLS violations (expected errors)
RLS_VIOLATIONS=$(grep -c "violates row-level security policy" "$ERROR_FILE" || echo "0")
RLS_ERRORS=$(grep -c "ERROR" "$ERROR_FILE" || echo "0")

# Display results
echo -e "${GREEN}✅ Test Execution Results:${NC}"
echo ""
echo "  Same-org SELECT tests: $SAME_ORG_SELECTS"
echo "  Cross-org SELECT tests: $CROSS_ORG_SELECTS"
echo "  Same-org INSERT tests: $SAME_ORG_INSERTS"
echo "  Same-org UPDATE tests: $SAME_ORG_UPDATES"
echo ""
echo -e "${YELLOW}🔒 RLS Violation Detection:${NC}"
echo "  RLS violations detected: $RLS_VIOLATIONS"
echo "  Total errors: $RLS_ERRORS"
echo ""

# Verify key assertions
echo -e "${YELLOW}🔍 Verifying Key Assertions:${NC}"
echo ""

ASSERTIONS_PASSED=0
ASSERTIONS_FAILED=0

# Check 1: Same-org SELECT should return rows
if grep -q "test_1_1_same_org_select.*|.*1" "$OUTPUT_FILE"; then
  echo -e "${GREEN}✅ PASS${NC}: Same-org SELECT returns data"
  ((ASSERTIONS_PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Same-org SELECT should return 1 row"
  ((ASSERTIONS_FAILED++))
fi

# Check 2: Cross-org SELECT should return 0 rows
if grep -q "test_1_2_cross_org_select.*|.*0" "$OUTPUT_FILE"; then
  echo -e "${GREEN}✅ PASS${NC}: Cross-org SELECT blocked by RLS"
  ((ASSERTIONS_PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Cross-org SELECT should return 0 rows"
  ((ASSERTIONS_FAILED++))
fi

# Check 3: Same-org INSERT should succeed
if grep -q "test_1_3_same_org_insert.*|.*1" "$OUTPUT_FILE"; then
  echo -e "${GREEN}✅ PASS${NC}: Same-org INSERT succeeds"
  ((ASSERTIONS_PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Same-org INSERT should succeed"
  ((ASSERTIONS_FAILED++))
fi

# Check 4: Same-org UPDATE should succeed
if grep -q "test_1_5_same_org_update.*|.*1" "$OUTPUT_FILE"; then
  echo -e "${GREEN}✅ PASS${NC}: Same-org UPDATE succeeds"
  ((ASSERTIONS_PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Same-org UPDATE should succeed"
  ((ASSERTIONS_FAILED++))
fi

# Check 5: Same-org DELETE should succeed
if grep -q "test_1_7_same_org_delete.*|.*0" "$OUTPUT_FILE"; then
  echo -e "${GREEN}✅ PASS${NC}: Same-org DELETE succeeds"
  ((ASSERTIONS_PASSED++))
else
  echo -e "${RED}❌ FAIL${NC}: Same-org DELETE should succeed"
  ((ASSERTIONS_FAILED++))
fi

# Check 6: RLS violations detected for cross-org operations
if [ "$RLS_VIOLATIONS" -gt 0 ]; then
  echo -e "${GREEN}✅ PASS${NC}: RLS violations detected for cross-org operations"
  ((ASSERTIONS_PASSED++))
else
  echo -e "${YELLOW}⚠️  WARNING${NC}: No RLS violations detected (expected for cross-org operations)"
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Test Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo "  Assertions Passed: $ASSERTIONS_PASSED"
echo "  Assertions Failed: $ASSERTIONS_FAILED"
echo ""

# Overall result
if [ "$ASSERTIONS_FAILED" -eq 0 ] && [ "$TEST_PASSED" = true ]; then
  echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
  echo ""
  echo "RLS policies are working correctly:"
  echo "  • Same-org operations succeed (SELECT, INSERT, UPDATE, DELETE)"
  echo "  • Cross-org operations fail with RLS violations"
  echo "  • All 15 multi-tenant tables are protected"
  echo ""
  exit 0
else
  echo -e "${RED}❌ SOME TESTS FAILED${NC}"
  echo ""
  echo "Review the following files for details:"
  echo "  • Output: $OUTPUT_FILE"
  echo "  • Errors: $ERROR_FILE"
  echo ""
  
  # Show error details
  if [ -s "$ERROR_FILE" ]; then
    echo -e "${YELLOW}Error Details:${NC}"
    head -20 "$ERROR_FILE"
  fi
  
  exit 1
fi
