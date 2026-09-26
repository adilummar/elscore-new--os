#!/bin/bash
# EL SCORE OS - Secure Encrypted Backup to Cloudflare R2
# This script runs on the Hostinger server

set -e

# --- CONFIGURATION ---
# IMPORTANT: Put your actual Production DATABASE_URL below
DATABASE_URL="postgresql://elscore:secret@localhost:5432/elscore_os_prod"
S3_BUCKET="s3://ellscore-production-new-backup"
S3_ENDPOINT="https://3ecfd7eb6fba0c493a74052dc7e00863.r2.cloudflarestorage.com"
PUBLIC_KEY_PATH="/var/www/backup/backup_public.pem" # Where you place the public key on Hostinger

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="/tmp/elscore_${TIMESTAMP}.dump"
ENCRYPTED_DUMP="/tmp/elscore_${TIMESTAMP}.dump.enc"
ENCRYPTED_KEY="/tmp/elscore_${TIMESTAMP}.key.enc"

echo "Starting secure database backup for ${TIMESTAMP}..."

# 1. Dump the Database safely
echo "Dumping PostgreSQL database..."
pg_dump --dbname="${DATABASE_URL}" -F c -b -f "${DUMP_FILE}"

# 2. Generate a random 256-bit symmetric key for this specific backup session
SYM_KEY=$(openssl rand -hex 32)

# 3. Encrypt the database dump using the symmetric key (AES-256)
echo "Encrypting backup archive..."
openssl enc -aes-256-cbc -salt -pbkdf2 -in "${DUMP_FILE}" -out "${ENCRYPTED_DUMP}" -pass pass:"${SYM_KEY}"

# 4. Encrypt the symmetric key itself using your RSA public key
# This ensures ONLY you (holding the offline private key) can decrypt the backup
echo "Securing encryption keys..."
echo "${SYM_KEY}" | openssl pkeyutl -encrypt -pubin -inkey "${PUBLIC_KEY_PATH}" -out "${ENCRYPTED_KEY}"

# 5. Upload both the encrypted backup and the encrypted key to Cloudflare R2
echo "Uploading to Cloudflare R2..."
aws s3 cp "${ENCRYPTED_DUMP}" "${S3_BUCKET}/" --endpoint-url "${S3_ENDPOINT}"
aws s3 cp "${ENCRYPTED_KEY}" "${S3_BUCKET}/" --endpoint-url "${S3_ENDPOINT}"

# 6. Clean up temporary files immediately
rm -f "${DUMP_FILE}" "${ENCRYPTED_DUMP}" "${ENCRYPTED_KEY}"

echo "✅ Backup successfully uploaded and secured!"
