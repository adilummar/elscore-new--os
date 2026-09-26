const { Client } = require('ssh2');

async function run() {
  const conn = new Client();
  await new Promise((res, rej) => {
    conn.on('ready', res).on('error', rej).connect({
      host: '200.234.39.163', port: 22, username: 'root',
      password: 'Elscoreacadrmy@786', readyTimeout: 30000,
    });
  });
  console.log('✅ SSH Connected\n');

  function sshExec(cmd) {
    return new Promise((resolve, reject) => {
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => process.stdout.write(String(d)));
        stream.stderr.on('data', d => process.stderr.write('[ERR] ' + String(d)));
        stream.on('close', code => resolve(code));
      });
    });
  }

  const PROJECT = '/var/www/elscore-os';

  // Build just the Next.js web app properly this time
  console.log('\n=== Rebuilding web app ===');
  await sshExec(`cd ${PROJECT} && pnpm --filter web run build 2>&1 | tail -20`);

  // Copy static assets for standalone
  console.log('\n=== Copying static assets ===');
  await sshExec(`mkdir -p ${PROJECT}/apps/web/.next/standalone/.next`);
  await sshExec(`cp -r ${PROJECT}/apps/web/.next/static ${PROJECT}/apps/web/.next/standalone/.next/ 2>/dev/null || true`);
  await sshExec(`cp -r ${PROJECT}/apps/web/public ${PROJECT}/apps/web/.next/standalone/ 2>/dev/null || true`);

  // Find the server.js
  console.log('\n=== Locating server.js ===');
  await sshExec(`find ${PROJECT}/apps/web/.next/standalone -name "server.js" 2>/dev/null`);

  // Stop the old failing elscore-web and restart with correct path
  console.log('\n=== Restarting elscore-web with correct path ===');
  await sshExec('pm2 delete elscore-web 2>/dev/null || true');
  await sshExec(`cd ${PROJECT}/apps/web/.next/standalone/apps/web && PORT=3000 HOSTNAME=0.0.0.0 pm2 start server.js --name elscore-web --env production`);
  await sshExec('pm2 save');

  // Wait and verify
  console.log('\nWaiting 8s for service to come up...');
  await new Promise(r => setTimeout(r, 8000));

  console.log('\n=== PM2 status ===');
  await sshExec('pm2 list');

  console.log('\n=== Port check ===');
  await sshExec('ss -tlnp | grep -E "3000|4000"');

  console.log('\n=== Web health check ===');
  await sshExec('curl -s -o /dev/null -w "Staging Web (3000): %{http_code}\\n" http://localhost:3000/ || echo "Still starting..."');
  await sshExec('curl -s -o /dev/null -w "Prod Web (4000): %{http_code}\\n" http://localhost:4000/ || echo "Still starting..."');

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
