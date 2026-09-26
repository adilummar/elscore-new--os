const { Client } = require('ssh2');

function sshExec(conn, cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; if (!opts.silent) process.stdout.write(String(d)); });
      stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
      stream.on('close', () => resolve(out));
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
  console.log('Connected\n');
  const STAGING = '/var/www/elscore-os';

  console.log('=== Pull latest main ===');
  await sshExec(conn, `cd ${STAGING} && git fetch origin && git reset --hard origin/main`);

  console.log('\n=== Resolve failed migration ===');
  // Mark the failed migration as rolled back so we can retry
  await sshExec(conn, `cd ${STAGING} && DATABASE_URL=$(grep DATABASE_URL apps/api/.env | cut -d= -f2-) pnpm --filter api exec prisma migrate resolve --rolled-back 20260926000001_tutor_lead_assignment_softdelete 2>&1 || echo "Resolve failed (may not be needed)"`);

  console.log('\n=== Run migrate deploy ===');
  await sshExec(conn, `cd ${STAGING} && DATABASE_URL=$(grep DATABASE_URL apps/api/.env | cut -d= -f2-) pnpm --filter api exec prisma migrate deploy 2>&1`);

  console.log('\n=== Build API ===');
  await sshExec(conn, `cd ${STAGING} && pnpm --filter api run build 2>&1 | tail -5`);

  console.log('\n=== Build Web ===');
  await sshExec(conn, `cd ${STAGING} && pnpm --filter web run build 2>&1 | grep -E "error|✓|Route|warn" | head -20`);

  console.log('\n=== Copy static assets ===');
  await sshExec(conn, `mkdir -p ${STAGING}/apps/web/.next/standalone/apps/web/.next && cp -r ${STAGING}/apps/web/.next/static ${STAGING}/apps/web/.next/standalone/apps/web/.next/ 2>/dev/null; cp -r ${STAGING}/apps/web/public ${STAGING}/apps/web/.next/standalone/apps/web/ 2>/dev/null; echo done`);

  console.log('\n=== Restart staging ===');
  await sshExec(conn, 'pm2 restart elscore-api; pm2 restart elscore-web; pm2 save');

  console.log('\nWaiting 10s...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('\n=== Health check ===');
  await sshExec(conn, 'pm2 list');
  await sshExec(conn, 'curl -s -o /dev/null -w "Staging API (3001): %{http_code}\\n" http://localhost:3001/api/v1/health');
  await sshExec(conn, 'curl -s -o /dev/null -w "Staging Web (3000): %{http_code}\\n" http://localhost:3000/');

  console.log('\nDone! URL: http://200.234.39.163:3000');
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
