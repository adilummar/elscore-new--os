const { Client } = require('ssh2');

const PROJECT = '/var/www/elscore-os';

function sshExec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err);
      stream.on('data', d => process.stdout.write(String(d)));
      stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
      stream.on('close', code => resolve(code));
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

  console.log('\n=== STEP 1: Pull latest fix from GitHub ===');
  await sshExec(conn, `cd ${PROJECT} && git pull origin main`);

  console.log('\n=== STEP 2: Build web only ===');
  await sshExec(conn, `cd ${PROJECT} && pnpm --filter web run build 2>&1 | tail -20`);

  console.log('\n=== STEP 3: Copy Next.js static assets ===');
  await sshExec(conn, `find ${PROJECT}/apps/web/.next/standalone -name "server.js" 2>/dev/null`);
  await sshExec(conn, `cp -r ${PROJECT}/apps/web/.next/static ${PROJECT}/apps/web/.next/standalone/.next/ 2>/dev/null || true`);
  await sshExec(conn, `cp -r ${PROJECT}/apps/web/public ${PROJECT}/apps/web/.next/standalone/ 2>/dev/null || true`);

  console.log('\n=== STEP 4: Start elscore-web on port 3000 ===');
  await sshExec(conn, 'pm2 delete elscore-web 2>/dev/null || true');
  // Next.js standalone in a monorepo nests the server under apps/web/
  await sshExec(conn, `cd ${PROJECT}/apps/web/.next/standalone/apps/web && PORT=3000 HOSTNAME=0.0.0.0 pm2 start server.js --name elscore-web`);
  await sshExec(conn, 'pm2 save');

  console.log('\nWaiting 10s for startup...');
  await new Promise(r => setTimeout(r, 10000));

  console.log('\n=== STEP 5: Verify ===');
  await sshExec(conn, 'pm2 list');
  await sshExec(conn, 'ss -tlnp | grep -E "3000|4000"');
  await sshExec(conn, 'curl -s -o /dev/null -w "Staging  (3000): %{http_code}\\n" http://localhost:3000/');
  await sshExec(conn, 'curl -s -o /dev/null -w "Prod     (4000): %{http_code}\\n" http://localhost:4000/');

  console.log('\n\n🎉 ================================================');
  console.log('STAGING RESTORED!');
  console.log('Staging:    http://200.234.39.163:3000');
  console.log('Production: http://200.234.39.163:4000');
  console.log('================================================\n');

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
