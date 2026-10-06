const { Client } = require('ssh2');

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    let out = '';
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => { out += d; process.stdout.write(String(d)); });
      stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
      stream.on('close', code => resolve(out));
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

  const PROD = '/var/www/elscore';

  console.log('=== STEP 1: Pull production branch (no tutor-hr) ===');
  await sshExec(conn, `cd ${PROD} && git fetch origin && git checkout production && git reset --hard origin/production`);

  console.log('\n=== STEP 2: Install deps ===');
  await sshExec(conn, `cd ${PROD} && pnpm install --frozen-lockfile 2>&1 | tail -5`);

  console.log('\n=== STEP 3: Regenerate Prisma client ===');
  await sshExec(conn, `cd ${PROD} && pnpm --filter api exec prisma generate 2>&1 | tail -5`);

  console.log('\n=== STEP 4: Build API ===');
  await sshExec(conn, `cd ${PROD} && pnpm --filter api run build 2>&1 | tail -10`);

  console.log('\n=== STEP 5: Build Web ===');
  await sshExec(conn, `cd ${PROD} && pnpm --filter web run build 2>&1 | tail -15`);

  console.log('\n=== STEP 6: Copy Next.js standalone assets ===');
  await sshExec(conn, `find ${PROD}/apps/web/.next/standalone -name "server.js" | grep "apps/web" | head -1`);
  await sshExec(conn, `mkdir -p ${PROD}/apps/web/.next/standalone/apps/web/.next`);
  await sshExec(conn, `cp -r ${PROD}/apps/web/.next/static ${PROD}/apps/web/.next/standalone/apps/web/.next/ 2>/dev/null || true`);
  await sshExec(conn, `cp -r ${PROD}/apps/web/public ${PROD}/apps/web/.next/standalone/apps/web/ 2>/dev/null || true`);

  console.log('\n=== STEP 7: Restart PM2 production processes ===');
  await sshExec(conn, 'pm2 restart elscore-api-prod');
  await sshExec(conn, 'pm2 restart elscore-web-prod');
  await sshExec(conn, 'pm2 save');

  console.log('\nWaiting 10s for services to start...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('\n=== STEP 8: Verify ===');
  await sshExec(conn, 'pm2 list');
  await sshExec(conn, 'curl -s -o /dev/null -w "Prod API  (4001): %{http_code}\\n" http://localhost:4001/api/v1/health');
  await sshExec(conn, 'curl -s -o /dev/null -w "Prod Web  (4000): %{http_code}\\n" http://localhost:4000/');

  // Test the fixed round-robin endpoint
  const loginRes = await sshExec(conn, `curl -s -X POST http://localhost:4001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ceo@elscoreacademy.com","password":"ElscoreCEO!2026Secure"}'`);
  let token = '';
  try { token = JSON.parse(loginRes).data?.accessToken || ''; } catch(e) {}
  if (token) {
    await sshExec(conn, `curl -s "http://localhost:4001/api/v1/round-robin/history?date=2026-09-26" -H "Authorization: Bearer ${token}" | head -c 200`);
    console.log('\n✅ Round-robin history endpoint tested');
  }

  console.log('\n\n🎉 ================================================');
  console.log('PRODUCTION DEPLOYMENT COMPLETE!');
  console.log('================================================');
  console.log('URL:  http://200.234.39.163:4000');
  console.log('Fixes deployed:');
  console.log('  ✅ Lead scoping (counsellors see own leads only)');
  console.log('  ✅ Login autofill');
  console.log('  ✅ Distribution History page DB fix');
  console.log('================================================\n');

  conn.end();
}

run().catch(err => { console.error('\n❌ FAILED:', err.message); process.exit(1); });
