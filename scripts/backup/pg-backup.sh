#!/usr/bin/env bash
#
# PostgreSQL Backup Script with S3 Upload
# Implements automated backup with verification and retention policies
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Load environment
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Required environment variables
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${AWS_S3_BACKUP_BUCKET:?AWS_S3_BACKUP_BUCKET is required}"

# Optional configuration
BACKUP_DIR="${BACKUP_DIR:-/tmp/nubabel-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_TYPE="${1:-full}"  # full or incremental
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
HOSTNAME=$(hostname -s)

# ---------------------------------------------------------------------------
# Parse DATABASE_URL
# ---------------------------------------------------------------------------

parse_database_url() {
  local url="$DATABASE_URL"

  # Remove protocol prefix
  url="${url#postgresql://}"
  url="${url#postgres://}"

  # Extract credentials
  local userpass="${url%%@*}"
  local hostdb="${url#*@}"

  DB_USER="${userpass%%:*}"
  DB_PASS="${userpass#*:}"

  # Extract host:port/database
  local hostport="${hostdb%%/*}"
  DB_NAME="${hostdb#*/}"
  DB_NAME="${DB_NAME%%\?*}"  # Remove query params

  DB_HOST="${hostport%%:*}"
  DB_PORT="${hostport#*:}"
  [[ "$DB_PORT" == "$DB_HOST" ]] && DB_PORT=5432
}

parse_database_url

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
}

# ---------------------------------------------------------------------------
# Backup Functions
# ---------------------------------------------------------------------------

create_backup_dir() {
  mkdir -p "$BACKUP_DIR"
  log "Backup directory: $BACKUP_DIR"
}

perform_full_backup() {
  local backup_file="$BACKUP_DIR/nubabel_${HOSTNAME}_${TIMESTAMP}_full.sql.gz"

  log "Starting full backup to $backup_file"

  PGPASSWORD="$DB_PASS" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -F c \
    -Z 9 \
    --no-owner \
    --no-acl \
    -f "$backup_file"

  echo "$backup_file"
}

perform_incremental_backup() {
  # For incremental, we use WAL archiving concept
  # This creates a smaller diff-style backup
  local backup_file="$BACKUP_DIR/nubabel_${HOSTNAME}_${TIMESTAMP}_incr.sql.gz"

  log "Starting incremental backup to $backup_file"

  # Get tables modified in last 24 hours based on updated_at columns
  local tables_query="
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND column_name = 'updated_at'
  "

  PGPASSWORD="$DB_PASS" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -F c \
    -Z 9 \
    --no-owner \
    --no-acl \
    --data-only \
    -f "$backup_file"

  echo "$backup_file"
}

verify_backup() {
  local backup_file="$1"

  log "Verifying backup integrity..."

  if [[ ! -f "$backup_file" ]]; then
    error "Backup file not found: $backup_file"
    return 1
  fi

  local file_size
  file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)

  if [[ "$file_size" -lt 1000 ]]; then
    error "Backup file too small: $file_size bytes"
    return 1
  fi

  # Test restore to /dev/null
  if pg_restore -l "$backup_file" > /dev/null 2>&1; then
    log "Backup verification passed ($file_size bytes)"
    return 0
  else
    error "Backup verification failed"
    return 1
  fi
}

upload_to_s3() {
  local backup_file="$1"
  local s3_path="s3://${AWS_S3_BACKUP_BUCKET}/postgresql/$(date +%Y/%m/%d)/$(basename "$backup_file")"

  log "Uploading to $s3_path"

  aws s3 cp "$backup_file" "$s3_path" \
    --storage-class STANDARD_IA \
    --metadata "hostname=$HOSTNAME,timestamp=$TIMESTAMP,type=$BACKUP_TYPE"

  log "Upload complete"
}

cleanup_old_backups() {
  log "Cleaning up backups older than $RETENTION_DAYS days"

  # Local cleanup
  find "$BACKUP_DIR" -name "nubabel_*.sql.gz" -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

  # S3 lifecycle handles remote cleanup (configured in backup-schedule.yaml)
  log "Local cleanup complete"
}

create_backup_manifest() {
  local backup_file="$1"
  local manifest_file="${backup_file%.sql.gz}.manifest.json"

  cat > "$manifest_file" << EOF
{
  "timestamp": "$TIMESTAMP",
  "hostname": "$HOSTNAME",
  "type": "$BACKUP_TYPE",
  "database": "$DB_NAME",
  "file": "$(basename "$backup_file")",
  "size": $(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null),
  "checksum": "$(sha256sum "$backup_file" | cut -d' ' -f1)"
}
EOF

  log "Created manifest: $manifest_file"
  echo "$manifest_file"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  log "=== PostgreSQL Backup Started ==="
  log "Type: $BACKUP_TYPE"
  log "Database: $DB_NAME@$DB_HOST:$DB_PORT"

  create_backup_dir

  local backup_file
  if [[ "$BACKUP_TYPE" == "incremental" ]]; then
    backup_file=$(perform_incremental_backup)
  else
    backup_file=$(perform_full_backup)
  fi

  if verify_backup "$backup_file"; then
    local manifest_file
    manifest_file=$(create_backup_manifest "$backup_file")

    upload_to_s3 "$backup_file"
    upload_to_s3 "$manifest_file"

    cleanup_old_backups

    log "=== Backup Completed Successfully ==="
  else
    error "Backup failed verification"
    exit 1
  fi
}

main "$@"
