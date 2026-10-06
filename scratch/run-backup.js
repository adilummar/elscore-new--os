const { Client } = require('ssh2');
const fs = require('fs');

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(String(d)); });
      stream.stderr.on('data', d => { out += d; process.stderr.write('[ERR] ' + String(d)); });
      stream.on('close', code => resolve({ out, code }));
    });
  });
}

function sshWrite(conn, remotePath, localPath) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      sftp.fastPut(localPath, remotePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
}

const BACKUP_SH = `#!/bin/bash
set -e
DATABASE_URL="postgresql://elscore_staging:StagingDb2024@localhost:5432/elscore_os_staging"
S3_BUCKET="s3://ellscore-production-new-backup"
S3_ENDPOINT="https://3ecfd7eb6fba0c493a74052dc7e00863.r2.cloudflarestorage.com"
PUBLIC_KEY_PATH="/var/www/backup/backup_public.pem"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_FILE="/tmp/staging_\${TIMESTAMP}.dump"
ENCRYPTED_DUMP="/tmp/staging_\${TIMESTAMP}.dump.enc"
ENCRYPTED_KEY="/tmp/staging_\${TIMESTAMP}.key.enc"

echo "Dumping Staging DB..."
pg_dump --dbname="\${DATABASE_URL}" -F c -b -f "\${DUMP_FILE}"

SYM_KEY=$(openssl rand -hex 32)
echo "Encrypting..."
openssl enc -aes-256-cbc -salt -pbkdf2 -in "\${DUMP_FILE}" -out "\${ENCRYPTED_DUMP}" -pass pass:"\${SYM_KEY}"

echo "\${SYM_KEY}" | openssl pkeyutl -encrypt -pubin -inkey "\${PUBLIC_KEY_PATH}" -out "\${ENCRYPTED_KEY}"

echo "Uploading..."
aws s3 cp "\${ENCRYPTED_DUMP}" "\${S3_BUCKET}/" --endpoint-url "\${S3_ENDPOINT}"
aws s3 cp "\${ENCRYPTED_KEY}" "\${S3_BUCKET}/" --endpoint-url "\${S3_ENDPOINT}"

rm -f "\${DUMP_FILE}" "\${ENCRYPTED_DUMP}" "\${ENCRYPTED_KEY}"
echo "Backup SUCCESS"
`;

async function run() {
  const conn = new Client();
  conn.on('ready', async () => {
    try {
      console.log("=== Creating backup folder ===");
      await sshExec(conn, `mkdir -p /var/www/backup`);

      console.log("=== Uploading Public Key ===");
      await sshWrite(conn, '/var/www/backup/backup_public.pem', 'E:\\elscore new os\\infrastructure\\backup\\backup_public.pem');

      console.log("=== Writing One-Time Backup Script ===");
      await sshExec(conn, `cat << 'EOF' > /tmp/run_backup.sh\n${BACKUP_SH}\nEOF`);
      await sshExec(conn, `chmod +x /tmp/run_backup.sh`);

      console.log("=== Running Backup ===");
      await sshExec(conn, `/tmp/run_backup.sh`);

      console.log("=== Verifying on R2 ===");
      await sshExec(conn, `aws s3 ls s3://ellscore-production-new-backup/ --endpoint-url https://3ecfd7eb6fba0c493a74052dc7e00863.r2.cloudflarestorage.com`);

    } catch (err) {
      console.error("ERROR:", err);
    } finally {
      conn.end();
    }
  }).connect({
    host: '200.234.39.163',
    port: 22,
    username: 'root',
    password: 'Elscoreacadrmy@786'
  });
}

run();
