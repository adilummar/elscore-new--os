#!/usr/bin/env bash
# EL SCORE OS — encrypted PostgreSQL backup (and optional uploads archive) to Cloudflare R2.
#
# One script for BOTH environments. It contains NO credentials and refuses to run unless the
# environment it is told to back up matches the database it is actually connected to.
#
# Run it on the server, as the operator, with the settings supplied by the environment:
#
#   BACKUP_ENV=staging                      # staging | production (required)
#   PGDATABASE=elscore_os_staging           # database to dump (required)
#   PGUSER=...                              # role used for the dump (required)
#   PGHOST=localhost  PGPORT=5432           # optional; host must be local
#   PGPASSFILE=/root/.pgpass-staging        # credentials file (mode 0600). Do NOT put a password in a URL
#                                           # or on the command line: both are visible in the process list.
#   S3_BUCKET=s3://<bucket>                 # required, bucket for THIS environment
#   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # required
#   PUBLIC_KEY_PATH=/path/to/backup_public.pem               # required (private key stays offline)
#   UPLOADS_DIR=/var/www/elscore-os/apps/api/storage/private/onboarding   # optional but REQUIRED for a
#                                           # complete staging/production backup: uploaded documents live on disk
#   BACKUP_PREFIX=staging/                  # optional object prefix (defaults to "<BACKUP_ENV>/")
#
#   ./backup-db.sh --check                  # validate settings and print the target; dumps nothing
#   ./backup-db.sh                          # take, verify, encrypt and upload the backup
#
# Restore: infrastructure/backup/decrypt-backup.sh, then pg_restore into a SCRATCH database first.
# See docs/operations/STAGING_SECURITY_AND_RECOVERY_CHECKLIST.md.

set -Eeuo pipefail
umask 077

fail() { echo "backup-db: $*" >&2; exit 1; }

: "${BACKUP_ENV:?BACKUP_ENV must be 'staging' or 'production'}"
: "${PGDATABASE:?PGDATABASE is required (the database to dump)}"
: "${PGUSER:?PGUSER is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ENDPOINT:?S3_ENDPOINT is required}"
: "${PUBLIC_KEY_PATH:?PUBLIC_KEY_PATH is required}"

PGHOST="${PGHOST:-localhost}"
export PGHOST PGDATABASE PGUSER
[[ -n "${PGPORT:-}" ]] && export PGPORT
[[ -n "${PGPASSFILE:-}" ]] && export PGPASSFILE

case "$BACKUP_ENV" in
  staging)    [[ "$PGDATABASE" == *staging* && "$PGDATABASE" != *prod* ]] || fail "BACKUP_ENV=staging but PGDATABASE='$PGDATABASE' is not a staging database" ;;
  production) [[ "$PGDATABASE" == *prod* && "$PGDATABASE" != *staging* ]] || fail "BACKUP_ENV=production but PGDATABASE='$PGDATABASE' is not a production database" ;;
  *) fail "BACKUP_ENV must be 'staging' or 'production'" ;;
esac

case "$PGHOST" in
  localhost|127.0.0.1|::1|/*) ;;
  *) fail "PGHOST='$PGHOST' is not local; this script only backs up the database on this server" ;;
esac

[[ -r "$PUBLIC_KEY_PATH" ]] || fail "PUBLIC_KEY_PATH is not readable"
if [[ -n "${PGPASSFILE:-}" ]]; then
  [[ -r "$PGPASSFILE" ]] || fail "PGPASSFILE is not readable"
  [[ "$(stat -c '%a' "$PGPASSFILE")" == "600" ]] || fail "PGPASSFILE must have mode 600"
fi
if [[ -n "${UPLOADS_DIR:-}" ]]; then
  [[ -d "$UPLOADS_DIR" ]] || fail "UPLOADS_DIR does not exist: $UPLOADS_DIR"
fi

PREFIX="${BACKUP_PREFIX:-${BACKUP_ENV}/}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
NAME="elscore_${BACKUP_ENV}_${TIMESTAMP}"

echo "Target: environment=${BACKUP_ENV} database=${PGDATABASE} host=${PGHOST} uploads=${UPLOADS_DIR:-<not included>} destination=${S3_BUCKET}/${PREFIX}"
if [[ "${1:-}" == "--check" ]]; then
  psql --no-psqlrc -Atc "SELECT 'connected to ' || current_database()" >/dev/null && echo "Connection check passed (no data was read or written)."
  exit 0
fi

# Private working directory, always removed (including on failure).
WORKDIR="$(mktemp -d /var/tmp/elscore-backup.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

DUMP="$WORKDIR/${NAME}.dump"
KEY_FILE="$WORKDIR/${NAME}.key"

echo "1/6 Dumping database..."
pg_dump --format=custom --no-owner --file="$DUMP"

echo "2/6 Verifying the dump is readable..."
pg_restore --list "$DUMP" >/dev/null || fail "pg_restore could not read the dump; backup aborted"

ARTIFACTS=("$DUMP")
if [[ -n "${UPLOADS_DIR:-}" ]]; then
  echo "3/6 Archiving uploaded documents..."
  UPLOADS_TAR="$WORKDIR/${NAME}.uploads.tar.gz"
  tar -C "$UPLOADS_DIR" -czf "$UPLOADS_TAR" .
  ARTIFACTS+=("$UPLOADS_TAR")
else
  echo "3/6 Skipping uploads archive (UPLOADS_DIR not set). This backup will NOT contain uploaded documents."
fi

echo "4/6 Encrypting (AES-256; the key is wrapped with the offline RSA public key)..."
openssl rand -hex 32 > "$KEY_FILE"
UPLOAD_LIST=()
for artifact in "${ARTIFACTS[@]}"; do
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "$artifact" -out "${artifact}.enc" -pass "file:${KEY_FILE}"
  UPLOAD_LIST+=("${artifact}.enc")
done
openssl pkeyutl -encrypt -pubin -inkey "$PUBLIC_KEY_PATH" -in "$KEY_FILE" -out "$WORKDIR/${NAME}.key.enc"
UPLOAD_LIST+=("$WORKDIR/${NAME}.key.enc")

echo "5/6 Writing the integrity manifest..."
( cd "$WORKDIR" && sha256sum "${UPLOAD_LIST[@]##*/}" > "${NAME}.sha256" )
UPLOAD_LIST+=("$WORKDIR/${NAME}.sha256")

echo "6/6 Uploading to ${S3_BUCKET}/${PREFIX}..."
for file in "${UPLOAD_LIST[@]}"; do
  aws s3 cp "$file" "${S3_BUCKET}/${PREFIX}$(basename "$file")" --endpoint-url "$S3_ENDPOINT"
done

echo "Backup ${NAME} uploaded. Verify it by restoring into a scratch database before relying on it."
