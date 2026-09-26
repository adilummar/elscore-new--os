#!/bin/bash
# RUN THIS LOCALLY ON YOUR MACHINE DURING A DISASTER RECOVERY
# You must have 'backup_private.pem' in the same directory

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <encrypted-key-file> <encrypted-dump-file>"
    echo "Example: $0 elscore_20260924_120000.key.enc elscore_20260924_120000.dump.enc"
    exit 1
fi

ENCRYPTED_KEY_FILE=$1
ENCRYPTED_DUMP_FILE=$2
DECRYPTED_DUMP_FILE="${ENCRYPTED_DUMP_FILE%.enc}" # Removes .enc extension

if [ ! -f "backup_private.pem" ]; then
    echo "ERROR: backup_private.pem not found in current directory!"
    exit 1
fi

echo "Decrypting the symmetric key using your offline private RSA key..."
# Decrypt the symmetric key
SYM_KEY=$(openssl pkeyutl -decrypt -inkey backup_private.pem -in "${ENCRYPTED_KEY_FILE}")

echo "Decrypting the database backup..."
# Decrypt the actual database dump
openssl enc -d -aes-256-cbc -pbkdf2 -in "${ENCRYPTED_DUMP_FILE}" -out "${DECRYPTED_DUMP_FILE}" -pass pass:"${SYM_KEY}"

echo "✅ Decryption complete! Your database dump is ready: ${DECRYPTED_DUMP_FILE}"
echo "You can now restore it using: pg_restore -U elscore -d <database_name> -1 ${DECRYPTED_DUMP_FILE}"
