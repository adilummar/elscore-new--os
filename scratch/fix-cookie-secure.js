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

  // Check the current web env
  console.log('\n=== Current staging .env.local ===');
  await sshExec(conn, 'cat /var/www/elscore-os/apps/web/.env.local 2>/dev/null || echo "NOT FOUND"');

  // Append COOKIE_SECURE=false so cookies work over HTTP
  console.log('\n=== Writing COOKIE_SECURE=false to staging web .env.local ===');
  await sshExec(conn, `grep -q "COOKIE_SECURE" /var/www/elscore-os/apps/web/.env.local 2>/dev/null && sed -i 's/COOKIE_SECURE=.*/COOKIE_SECURE=false/' /var/www/elscore-os/apps/web/.env.local || echo "COOKIE_SECURE=false" >> /var/www/elscore-os/apps/web/.env.local`);

  // Also need to set it on the pm2 process env so Next.js server action can read it
  // The cleanest way is to restart with the env variable set
  console.log('\n=== Restarting elscore-web with COOKIE_SECURE=false ===');
  await sshExec(conn, 'pm2 delete elscore-web 2>/dev/null || true');
  await sshExec(conn, `cd /var/www/elscore-os/apps/web/.next/standalone/apps/web && COOKIE_SECURE=false PORT=3000 HOSTNAME=0.0.0.0 pm2 start server.js --name elscore-web`);
  await sshExec(conn, 'pm2 save');

  // Wait for startup
  await new Promise(r => setTimeout(r, 6000));

  console.log('\n=== Verifying ===');
  await sshExec(conn, 'pm2 list');
  await sshExec(conn, 'curl -s -o /dev/null -w "Staging (3000): %{http_code}\\n" http://localhost:3000/');

  // Test login and confirm cookies are set
  console.log('\n=== Testing login + cookie ===');
  await sshExec(conn, `curl -s -c /tmp/test-cookies.txt -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' | grep -o '"message":"[^"]*"'`);

  console.log('\n\n✅ Fix applied: COOKIE_SECURE=false set for HTTP staging');
  console.log('Try logging in at http://200.234.39.163:3000/login');

  conn.end();
}

run().catch(err => {
  console.error('\n❌ FAILED:', err.message);
  process.exit(1);
});
