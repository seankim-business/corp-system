#!/bin/bash

# ============================================================================
# Nubabel Platform - Production Deployment Script
# ============================================================================
# Features:
# - Zero-downtime deployment with health checks
# - Database migration execution
# - Automatic rollback capability
# - Docker image versioning
# - Pre-deployment validation
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
ENV_FILE="${PROJECT_ROOT}/.env.production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Deployment configuration
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_INTERVAL=5
BACKUP_RETENTION_DAYS=7

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}ℹ [INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓ [SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}⚠ [WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}✗ [ERROR]${NC} $*"
}

# ============================================================================
# Pre-deployment Validation
# ============================================================================

validate_environment() {
    log_info "Validating environment..."

    # Check required files
    if [[ ! -f "${COMPOSE_FILE}" ]]; then
        log_error "docker-compose.prod.yml not found at ${COMPOSE_FILE}"
        exit 1
    fi

    if [[ ! -f "${ENV_FILE}" ]]; then
        log_error ".env.production not found at ${ENV_FILE}"
        exit 1
    fi

    # Check required commands
    local required_commands=("docker" "docker-compose" "curl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" &> /dev/null; then
            log_error "Required command '${cmd}' not found"
            exit 1
        fi
    done

    # Check critical environment variables
    source "${ENV_FILE}"
    local required_vars=(
        "POSTGRES_PASSWORD"
        "JWT_SECRET"
        "ENCRYPTION_KEY"
        "ENCRYPTION_SECRET"
        "GOOGLE_CLIENT_ID"
        "GOOGLE_CLIENT_SECRET"
        "BASE_URL"
        "FRONTEND_URL"
    )

    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable ${var} is not set"
            exit 1
        fi
    done

    log_success "Environment validation passed"
}

# ============================================================================
# Docker Image Management
# ============================================================================

build_images() {
    log_info "Building Docker images..."

    # Generate version tag
    local git_hash=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    local timestamp=$(date +%Y%m%d-%H%M%S)
    export APP_VERSION="${timestamp}-${git_hash}"

    log_info "Building version: ${APP_VERSION}"

    cd "${PROJECT_ROOT}"
    docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" build --no-cache app

    # Tag the image
    docker tag nubabel-app:latest "nubabel-app:${APP_VERSION}"

    log_success "Docker images built successfully"
}

# ============================================================================
# Database Migration
# ============================================================================

run_migrations() {
    log_info "Running database migrations..."

    # Create backup before migration
    backup_database

    # Run migrations in a temporary container
    docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" run --rm app sh -c "npx prisma migrate deploy"

    local migration_exit_code=$?
    if [[ ${migration_exit_code} -ne 0 ]]; then
        log_error "Database migration failed with exit code ${migration_exit_code}"
        log_warning "Database backup is available for manual restoration if needed"
        return 1
    fi

    log_success "Database migrations completed successfully"
}

backup_database() {
    log_info "Creating database backup..."

    source "${ENV_FILE}"
    local backup_dir="${PROJECT_ROOT}/backups"
    local backup_file="${backup_dir}/db-backup-$(date +%Y%m%d-%H%M%S).sql"

    mkdir -p "${backup_dir}"

    # Use docker exec to run pg_dump inside the postgres container
    docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" exec -T postgres \
        pg_dump -U "${POSTGRES_USER:-nubabel}" "${POSTGRES_DB:-nubabel}" > "${backup_file}"

    if [[ -f "${backup_file}" && -s "${backup_file}" ]]; then
        log_success "Database backup created: ${backup_file}"

        # Cleanup old backups
        find "${backup_dir}" -name "db-backup-*.sql" -mtime +${BACKUP_RETENTION_DAYS} -delete
    else
        log_warning "Database backup failed or is empty"
    fi
}

# ============================================================================
# Health Check
# ============================================================================

wait_for_health() {
    local service_url="${1}"
    local retries=${HEALTH_CHECK_RETRIES}
    local interval=${HEALTH_CHECK_INTERVAL}

    log_info "Waiting for service health check at ${service_url}..."

    for ((i=1; i<=retries; i++)); do
        if curl -sf "${service_url}" > /dev/null 2>&1; then
            log_success "Service is healthy"
            return 0
        fi

        if [[ $i -lt $retries ]]; then
            log_info "Attempt ${i}/${retries} failed, retrying in ${interval}s..."
            sleep "${interval}"
        fi
    done

    log_error "Service health check failed after ${retries} attempts"
    return 1
}

# ============================================================================
# Deployment Execution
# ============================================================================

deploy_services() {
    log_info "Deploying services with zero-downtime strategy..."

    cd "${PROJECT_ROOT}"

    # Pull latest images (if using registry)
    # docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" pull

    # Start infrastructure services first (postgres, redis)
    log_info "Starting infrastructure services..."
    docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d postgres redis

    # Wait for infrastructure to be ready
    sleep 10

    # Run migrations
    if ! run_migrations; then
        log_error "Migration failed, aborting deployment"
        exit 1
    fi

    # Deploy application with rolling update
    log_info "Deploying application..."
    docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --no-deps --force-recreate app

    # Wait for application health
    source "${ENV_FILE}"
    local app_url="${BASE_URL}/health/ready"

    if ! wait_for_health "${app_url}"; then
        log_error "Application deployment failed health check"
        rollback
        exit 1
    fi

    # Start monitoring services
    log_info "Starting monitoring services..."
    docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d prometheus grafana

    log_success "Deployment completed successfully"
}

# ============================================================================
# Rollback
# ============================================================================

rollback() {
    log_warning "Initiating rollback..."

    # Get previous image version
    local previous_version=$(docker images nubabel-app --format "{{.Tag}}" | grep -v latest | head -n 2 | tail -n 1)

    if [[ -z "${previous_version}" ]]; then
        log_error "No previous version found for rollback"
        return 1
    fi

    log_info "Rolling back to version: ${previous_version}"

    # Tag previous version as latest
    docker tag "nubabel-app:${previous_version}" nubabel-app:latest

    # Restart with previous version
    docker-compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" up -d --no-deps --force-recreate app

    log_success "Rollback completed"
}

# ============================================================================
# Cleanup
# ============================================================================

cleanup() {
    log_info "Cleaning up old Docker images..."

    # Keep last 5 versions
    docker images nubabel-app --format "{{.Tag}}" | grep -v latest | tail -n +6 | xargs -r docker rmi || true

    log_success "Cleanup completed"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    log_info "====================================================="
    log_info "Nubabel Platform - Production Deployment"
    log_info "====================================================="

    # Parse command line arguments
    local skip_build=false
    local skip_backup=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                skip_build=true
                shift
                ;;
            --skip-backup)
                skip_backup=true
                shift
                ;;
            --rollback)
                rollback
                exit 0
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --skip-build     Skip Docker image build"
                echo "  --skip-backup    Skip database backup"
                echo "  --rollback       Rollback to previous version"
                echo "  --help           Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Execute deployment steps
    validate_environment

    if [[ "${skip_build}" == false ]]; then
        build_images
    fi

    deploy_services
    cleanup

    log_success "====================================================="
    log_success "Deployment completed successfully!"
    log_success "====================================================="
}

# Run main function
main "$@"
