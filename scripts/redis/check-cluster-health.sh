#!/usr/bin/env bash
#
# Redis Cluster Health Check Script
#
# This script checks the health of a Redis cluster by:
# - Testing connectivity to all cluster nodes
# - Verifying cluster state
# - Checking node roles (master/replica)
# - Validating slot coverage
# - Reporting any issues
#
# Usage:
#   ./check-cluster-health.sh [OPTIONS]
#
# Options:
#   --nodes <node1:port1,node2:port2,...>  Comma-separated list of cluster nodes (default: from env)
#   --password <password>                  Redis password (default: from env)
#   --json                                 Output results in JSON format
#   --verbose                              Show detailed output
#   -h, --help                             Show this help message
#
# Environment Variables:
#   REDIS_CLUSTER_NODES    Comma-separated list of cluster nodes (host:port)
#   REDIS_PASSWORD         Redis authentication password
#
# Exit Codes:
#   0 - Cluster is healthy
#   1 - Cluster has issues
#   2 - Script error (missing dependencies, invalid args, etc.)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
NODES="${REDIS_CLUSTER_NODES:-}"
PASSWORD="${REDIS_PASSWORD:-}"
JSON_OUTPUT=false
VERBOSE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --nodes)
      NODES="$2"
      shift 2
      ;;
    --password)
      PASSWORD="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    -h|--help)
      head -n 30 "$0" | grep "^#" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 2
      ;;
  esac
done

# Check if redis-cli is available
if ! command -v redis-cli &> /dev/null; then
  echo "Error: redis-cli is not installed or not in PATH"
  exit 2
fi

# Validate required parameters
if [[ -z "$NODES" ]]; then
  echo "Error: No cluster nodes specified. Use --nodes or set REDIS_CLUSTER_NODES env var"
  exit 2
fi

# Parse nodes into array
IFS=',' read -ra NODE_ARRAY <<< "$NODES"

# Counters and arrays for tracking
TOTAL_NODES=0
HEALTHY_NODES=0
UNHEALTHY_NODES=0
MASTERS=0
REPLICAS=0
FAILED_NODES=()
CLUSTER_STATE=""
SLOTS_COVERED=0
TOTAL_SLOTS=16384

log() {
  if [[ "$JSON_OUTPUT" == false ]]; then
    echo "$@"
  fi
}

log_verbose() {
  if [[ "$VERBOSE" == true ]] && [[ "$JSON_OUTPUT" == false ]]; then
    echo "$@"
  fi
}

log_success() {
  if [[ "$JSON_OUTPUT" == false ]]; then
    echo -e "${GREEN}✓${NC} $@"
  fi
}

log_error() {
  if [[ "$JSON_OUTPUT" == false ]]; then
    echo -e "${RED}✗${NC} $@"
  fi
}

log_warning() {
  if [[ "$JSON_OUTPUT" == false ]]; then
    echo -e "${YELLOW}⚠${NC} $@"
  fi
}

# Function to execute redis-cli command
redis_cmd() {
  local host=$1
  local port=$2
  shift 2

  if [[ -n "$PASSWORD" ]]; then
    redis-cli -h "$host" -p "$port" -a "$PASSWORD" --no-auth-warning "$@"
  else
    redis-cli -h "$host" -p "$port" "$@"
  fi
}

# Check each node
log "Checking Redis Cluster health..."
log "Total nodes to check: ${#NODE_ARRAY[@]}"
log ""

for node in "${NODE_ARRAY[@]}"; do
  IFS=':' read -r host port <<< "$node"
  TOTAL_NODES=$((TOTAL_NODES + 1))

  log_verbose "Checking node $host:$port..."

  # Test connectivity
  if ! redis_cmd "$host" "$port" PING &> /dev/null; then
    log_error "Node $host:$port is unreachable"
    UNHEALTHY_NODES=$((UNHEALTHY_NODES + 1))
    FAILED_NODES+=("$host:$port")
    continue
  fi

  # Get cluster info
  CLUSTER_INFO=$(redis_cmd "$host" "$port" CLUSTER INFO)

  # Check cluster state
  NODE_STATE=$(echo "$CLUSTER_INFO" | grep "cluster_state:" | cut -d':' -f2 | tr -d '\r')
  if [[ -z "$CLUSTER_STATE" ]]; then
    CLUSTER_STATE="$NODE_STATE"
  fi

  if [[ "$NODE_STATE" != "ok" ]]; then
    log_error "Node $host:$port has cluster_state: $NODE_STATE"
    UNHEALTHY_NODES=$((UNHEALTHY_NODES + 1))
    FAILED_NODES+=("$host:$port")
    continue
  fi

  # Get node role
  CLUSTER_NODES=$(redis_cmd "$host" "$port" CLUSTER NODES)
  MYSELF=$(echo "$CLUSTER_NODES" | grep "myself")

  if echo "$MYSELF" | grep -q "master"; then
    MASTERS=$((MASTERS + 1))
    log_verbose "Node $host:$port is a master"
  elif echo "$MYSELF" | grep -q "slave"; then
    REPLICAS=$((REPLICAS + 1))
    log_verbose "Node $host:$port is a replica"
  fi

  # Check slots assignment (only on first master)
  if [[ $SLOTS_COVERED -eq 0 ]] && echo "$MYSELF" | grep -q "master"; then
    SLOTS_COVERED=$(echo "$CLUSTER_INFO" | grep "cluster_slots_assigned:" | cut -d':' -f2 | tr -d '\r')
  fi

  HEALTHY_NODES=$((HEALTHY_NODES + 1))
  log_success "Node $host:$port is healthy"
done

# Determine overall health
OVERALL_HEALTHY=true

if [[ $UNHEALTHY_NODES -gt 0 ]]; then
  OVERALL_HEALTHY=false
fi

if [[ "$CLUSTER_STATE" != "ok" ]]; then
  OVERALL_HEALTHY=false
fi

if [[ $SLOTS_COVERED -ne $TOTAL_SLOTS ]]; then
  OVERALL_HEALTHY=false
fi

# Output results
log ""
log "===== Health Check Summary ====="

if [[ "$JSON_OUTPUT" == true ]]; then
  # JSON output
  cat <<EOF
{
  "healthy": $OVERALL_HEALTHY,
  "cluster_state": "$CLUSTER_STATE",
  "total_nodes": $TOTAL_NODES,
  "healthy_nodes": $HEALTHY_NODES,
  "unhealthy_nodes": $UNHEALTHY_NODES,
  "masters": $MASTERS,
  "replicas": $REPLICAS,
  "slots_covered": $SLOTS_COVERED,
  "total_slots": $TOTAL_SLOTS,
  "failed_nodes": [$(printf '"%s",' "${FAILED_NODES[@]}" | sed 's/,$//')]
}
EOF
else
  # Human-readable output
  log "Cluster State:    $CLUSTER_STATE"
  log "Total Nodes:      $TOTAL_NODES"
  log "Healthy Nodes:    $HEALTHY_NODES"
  log "Unhealthy Nodes:  $UNHEALTHY_NODES"
  log "Masters:          $MASTERS"
  log "Replicas:         $REPLICAS"
  log "Slots Covered:    $SLOTS_COVERED/$TOTAL_SLOTS"

  if [[ ${#FAILED_NODES[@]} -gt 0 ]]; then
    log ""
    log_error "Failed Nodes:"
    for failed in "${FAILED_NODES[@]}"; do
      log "  - $failed"
    done
  fi

  log ""
  if [[ "$OVERALL_HEALTHY" == true ]]; then
    log_success "Cluster is HEALTHY"
  else
    log_error "Cluster has ISSUES"
  fi
fi

# Exit with appropriate code
if [[ "$OVERALL_HEALTHY" == true ]]; then
  exit 0
else
  exit 1
fi
