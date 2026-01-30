#!/usr/bin/env bash
#
# PostgreSQL Restore Script with S3 Download
# Restores backups from S3 or local storage
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

# Optional configuration
BACKUP_DIR="${BACKUP_DIR:-/tmp/nubabel-backups}"
AWS_S3_BACKUP_BUCKET="${AWS_S3_BACKUP_BUCKET:-}"

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
  DB_NAME="${DB_NAME%%\?*}"

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
# Functions
# ---------------------------------------------------------------------------

show_usage() {
  cat << EOF
Usage: $0 [OPTIONS] <backup_file_or_s3_path>

Options:
  -l, --list          List available backups from S3
  -d, --date DATE     Restore from specific date (YYYY/MM/DD)
  -t, --target DB     Target database name (default: from DATABASE_URL)
  -c, --clean         Drop existing objects before restore
  -n, --no-owner      Skip restoration of object ownership
  --dry-run           Show what would be done without executing

Examples:
  $0 --list
  $0 --date 2024/01/15
  $0 /tmp/nubabel-backups/nubabel_host_20240115_120000_full.sql.gz
  $0 s3://bucket/postgresql/2024/01/15/nubabel_host_20240115_120000_full.sql.gz

EOF
}

list_s3_backups() {
  if [[ -z "$AWS_S3_BACKUP_BUCKET" ]]; then
    error "AWS_S3_BACKUP_BUCKET not set"
    exit 1
  fi

  log "Available backups in s3://${AWS_S3_BACKUP_BUCKET}/postgresql/"
  aws s3 ls "s3://${AWS_S3_BACKUP_BUCKET}/postgresql/" --recursive | grep -E '\.sql\.gz$' | sort -r | head -20
}

download_from_s3() {
  local s3_path="$1"
  local local_file="$BACKUP_DIR/$(basename "$s3_path")"

  mkdir -p "$BACKUP_DIR"

  log "Downloading $s3_path to $local_file"
  aws s3 cp "$s3_path" "$local_file"

  echo "$local_file"
}

find_latest_backup_for_date() {
  local date_path="$1"

  if [[ -z "$AWS_S3_BACKUP_BUCKET" ]]; then
    error "AWS_S3_BACKUP_BUCKET not set"
    exit 1
  fi

  local s3_prefix="s3://${AWS_S3_BACKUP_BUCKET}/postgresql/${date_path}/"
  log "Searching for backups in $s3_prefix"

  local latest
  latest=$(aws s3 ls "$s3_prefix" | grep -E '\.sql\.gz$' | sort -r | head -1 | awk '{print $4}')

  if [[ -z "$latest" ]]; then
    error "No backups found for date: $date_path"
    exit 1
  fi

  echo "${s3_prefix}${latest}"
}

verify_backup_file() {
  local backup_file="$1"

  if [[ ! -f "$backup_file" ]]; then
    error "Backup file not found: $backup_file"
    return 1
  fi

  log "Verifying backup file..."
  if pg_restore -l "$backup_file" > /dev/null 2>&1; then
    log "Backup file is valid"
    return 0
  else
    error "Backup file appears corrupted"
    return 1
  fi
}

perform_restore() {
  local backup_file="$1"
  local target_db="${2:-$DB_NAME}"
  local clean="${3:-false}"
  local no_owner="${4:-true}"
  local dry_run="${5:-false}"

  log "=== Starting Restore ==="
  log "Backup: $backup_file"
  log "Target: $target_db@$DB_HOST:$DB_PORT"
  log "Clean: $clean"
  log "No Owner: $no_owner"

  if [[ "$dry_run" == "true" ]]; then
    log "DRY RUN - Would execute:"
    echo "pg_restore -h $DB_HOST -p $DB_PORT -U $DB_USER -d $target_db"
    [[ "$clean" == "true" ]] && echo "  --clean"
    [[ "$no_owner" == "true" ]] && echo "  --no-owner"
    echo "  $backup_file"
    return 0
  fi

  local restore_opts=()
  restore_opts+=(-h "$DB_HOST")
  restore_opts+=(-p "$DB_PORT")
  restore_opts+=(-U "$DB_USER")
  restore_opts+=(-d "$target_db")
  restore_opts+=(--verbose)

  [[ "$clean" == "true" ]] && restore_opts+=(--clean)
  [[ "$no_owner" == "true" ]] && restore_opts+=(--no-owner)

  log "Restoring database..."
  PGPASSWORD="$DB_PASS" pg_restore "${restore_opts[@]}" "$backup_file"

  log "=== Restore Completed ==="
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  local list_only=false
  local date_path=""
  local target_db="$DB_NAME"
  local clean=false
  local no_owner=true
  local dry_run=false
  local backup_source=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -l|--list)
        list_only=true
        shift
        ;;
      -d|--date)
        date_path="$2"
        shift 2
        ;;
      -t|--target)
        target_db="$2"
        shift 2
        ;;
      -c|--clean)
        clean=true
        shift
        ;;
      -n|--no-owner)
        no_owner=true
        shift
        ;;
      --dry-run)
        dry_run=true
        shift
        ;;
      -h|--help)
        show_usage
        exit 0
        ;;
      *)
        backup_source="$1"
        shift
        ;;
    esac
  done

  if [[ "$list_only" == "true" ]]; then
    list_s3_backups
    exit 0
  fi

  local backup_file=""

  if [[ -n "$date_path" ]]; then
    local s3_path
    s3_path=$(find_latest_backup_for_date "$date_path")
    backup_file=$(download_from_s3 "$s3_path")
  elif [[ -n "$backup_source" ]]; then
    if [[ "$backup_source" == s3://* ]]; then
      backup_file=$(download_from_s3 "$backup_source")
    else
      backup_file="$backup_source"
    fi
  else
    show_usage
    exit 1
  fi

  verify_backup_file "$backup_file"
  perform_restore "$backup_file" "$target_db" "$clean" "$no_owner" "$dry_run"
}

main "$@"
