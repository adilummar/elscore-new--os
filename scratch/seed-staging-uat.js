const { Client } = require('ssh2');

const PROJECT_DIR = '/var/www/elscore-os';

function sshExec(conn, cmd, label = 'SERVER') {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(`[${label}] ${d}`); });
      stream.stderr.on('data', d => { out += d; process.stderr.write(`[${label} ERR] ${d}`); });
      stream.on('close', code => resolve({ out, code }));
    });
  });
}

function sshWrite(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', resolve);
      ws.on('error', reject);
      ws.write(content);
      ws.end();
    });
  });
}

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  console.log('✅ SSH Connected\n');

  const fs = require('fs');
  const seedScriptContent = fs.readFileSync('e:\\\\elscore new os\\\\apps\\\\api\\\\prisma\\\\seed-test-users.ts', 'utf8');

  console.log('=== Uploading seed-test-users.ts to server ===');
  await sshWrite(conn, `${PROJECT_DIR}/apps/api/prisma/seed-test-users.ts`, seedScriptContent);

  console.log('\n=== Running seed script on staging server ===');
  await sshExec(conn, `cd ${PROJECT_DIR}/apps/api && NODE_ENV=development npx ts-node --require tsconfig-paths/register prisma/seed-test-users.ts`, 'SEED');

  console.log('\n✅ Staging seed complete.');
  conn.end();
}

run().catch(console.error);
