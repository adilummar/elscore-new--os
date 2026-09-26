#!/bin/bash
# RUN THIS LOCALLY ON YOUR MACHINE, NOT ON HOSTINGER!

echo "Generating 4096-bit RSA key pair for secure backups..."

# Generate the private key (Keep this safe, NEVER upload to the server)
openssl genpkey -algorithm RSA -out backup_private.pem -pkeyopt rsa_keygen_bits:4096

# Extract the public key (Upload THIS to the server)
openssl rsa -pubout -in backup_private.pem -out backup_public.pem

echo "=========================================================="
echo "✅ Key generation complete!"
echo ""
echo "1. backup_private.pem - STORE THIS SAFELY OFFLINE. If you lose this, you cannot restore backups!"
echo "2. backup_public.pem  - UPLOAD THIS to your Hostinger server (e.g., to /var/www/backup/)"
echo "=========================================================="
