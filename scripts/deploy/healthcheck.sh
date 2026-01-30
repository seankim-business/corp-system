#!/bin/bash

# ============================================================================
# Nubabel Platform - Health Check Script
# ============================================================================
# Comprehensive health verification for deployment and monitoring
# Exit codes:
#   0 - All services healthy
#   1 - One or more services unhealthy
#   2 - Critical failure (e.g., cannot reach API)
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

# Default to localhost if not set
BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMEOUT="${HEALTH_CHECK_TIMEOUT:-10}"
VERBOSE="${VERBOSE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    if [[ "${VERBOSE}" == "true" ]]; then
        echo -e "${BLUE}ℹ [INFO]${NC} $*" >&2
    fi
}

log_success() {
    echo -e "${GREEN}✓ [HEALTHY]${NC} $*" >&2
}

log_warning() {
    echo -e "${YELLOW}⚠ [WARNING]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}✗ [UNHEALTHY]${NC} $*" >&2
}

# ============================================================================
# Health Check Functions
# ============================================================================

check_endpoint() {
    local endpoint="${1}"
    local description="${2}"
    local critical="${3:-false}"

    log_info "Checking ${description}..."

    local url="${BASE_URL}${endpoint}"
    local response
    local http_code

    if response=$(curl -s -w "\n%{http_code}" --max-time "${TIMEOUT}" "${url}" 2>&1); then
        http_code=$(echo "${response}" | tail -n1)
        local body=$(echo "${response}" | sed '$d')

        if [[ "${http_code}" == "200" ]]; then
            log_success "${description}"
            if [[ "${VERBOSE}" == "true" ]]; then
                echo "${body}" | jq '.' 2>/dev/null || echo "${body}"
            fi
            return 0
        else
            log_error "${description} - HTTP ${http_code}"
            if [[ "${VERBOSE}" == "true" ]]; then
                echo "${body}"
            fi
            return 1
        fi
    else
        log_error "${description} - Connection failed"
        if [[ "${critical}" == "true" ]]; then
            log_error "Critical service unavailable, aborting"
            exit 2
        fi
        return 1
    fi
}

check_api_health() {
    log_info "====================================================="
    log_info "API Health Check"
    log_info "====================================================="

    check_endpoint "/health" "API Basic Health" true
}

check_database() {
    log_info "====================================================="
    log_info "Database Health Check"
    log_info "====================================================="

    if ! check_endpoint "/health/db" "Database Connection" true; then
        log_error "Database is not accessible"
        return 1
    fi

    return 0
}

check_redis() {
    log_info "====================================================="
    log_info "Redis Health Check"
    log_info "====================================================="

    if ! check_endpoint "/health/redis" "Redis Connection" false; then
        log_warning "Redis is not accessible (non-critical)"
        return 1
    fi

    # Check Redis pool health
    if ! check_endpoint "/health/redis-pool" "Redis Connection Pool" false; then
        log_warning "Redis pool is degraded"
        return 1
    fi

    return 0
}

check_readiness() {
    log_info "====================================================="
    log_info "Service Readiness Check"
    log_info "====================================================="

    if ! check_endpoint "/health/ready" "Service Readiness" true; then
        log_error "Service is not ready to accept traffic"
        return 1
    fi

    return 0
}

check_liveness() {
    log_info "====================================================="
    log_info "Service Liveness Check"
    log_info "====================================================="

    if ! check_endpoint "/health/live" "Service Liveness" true; then
        log_error "Service is not alive"
        return 1
    fi

    return 0
}

check_circuit_breakers() {
    log_info "====================================================="
    log_info "Circuit Breaker Health Check"
    log_info "====================================================="

    if ! check_endpoint "/health/circuits" "Circuit Breakers" false; then
        log_warning "One or more circuit breakers are open"
        return 1
    fi

    return 0
}

check_mcp_cache() {
    log_info "====================================================="
    log_info "MCP Cache Health Check"
    log_info "====================================================="

    if ! check_endpoint "/health/mcp-cache" "MCP Cache Status" false; then
        log_warning "MCP cache status check failed"
        return 1
    fi

    return 0
}

# ============================================================================
# Comprehensive Health Check
# ============================================================================

run_all_checks() {
    local exit_code=0

    # Critical checks (failure should stop deployment)
    check_api_health || exit_code=2
    check_liveness || exit_code=2
    check_database || exit_code=2
    check_readiness || exit_code=2

    # Non-critical checks (warnings only)
    check_redis || exit_code=1
    check_circuit_breakers || exit_code=1
    check_mcp_cache || exit_code=1

    return ${exit_code}
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    local check_type="${1:-all}"

    case "${check_type}" in
        all)
            run_all_checks
            ;;
        api)
            check_api_health
            ;;
        db|database)
            check_database
            ;;
        redis)
            check_redis
            ;;
        ready|readiness)
            check_readiness
            ;;
        live|liveness)
            check_liveness
            ;;
        circuits)
            check_circuit_breakers
            ;;
        mcp)
            check_mcp_cache
            ;;
        --help)
            cat << EOF
Nubabel Platform - Health Check Script

Usage: $0 [CHECK_TYPE]

Check Types:
  all                 Run all health checks (default)
  api                 Check API basic health
  database|db         Check database connectivity
  redis               Check Redis connectivity and pool
  readiness|ready     Check if service is ready for traffic
  liveness|live       Check if service is alive
  circuits            Check circuit breaker status
  mcp                 Check MCP cache status

Environment Variables:
  BASE_URL                  Base URL of the service (default: http://localhost:3000)
  HEALTH_CHECK_TIMEOUT      Timeout in seconds (default: 10)
  VERBOSE                   Enable verbose output (default: false)

Exit Codes:
  0 - All services healthy
  1 - One or more services unhealthy (warnings)
  2 - Critical failure

Examples:
  # Check all services
  ./healthcheck.sh

  # Check only database
  ./healthcheck.sh database

  # Check with custom URL and verbose output
  BASE_URL=https://api.nubabel.com VERBOSE=true ./healthcheck.sh

  # Use in deployment scripts
  if ./healthcheck.sh ready; then
    echo "Service is ready for traffic"
  fi
EOF
            exit 0
            ;;
        *)
            log_error "Unknown check type: ${check_type}"
            log_info "Run '$0 --help' for usage information"
            exit 1
            ;;
    esac

    local exit_code=$?

    log_info "====================================================="
    if [[ ${exit_code} -eq 0 ]]; then
        log_success "All health checks passed"
    elif [[ ${exit_code} -eq 1 ]]; then
        log_warning "Health checks completed with warnings"
    else
        log_error "Critical health checks failed"
    fi
    log_info "====================================================="

    exit ${exit_code}
}

# Run main function
main "$@"
