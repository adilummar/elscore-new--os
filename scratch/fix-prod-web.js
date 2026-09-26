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

  // Find which port the prod web is on
  console.log('\n=== WHAT PORTS HAVE NODE LISTENING ===');
  await sshExec('ss -tlnp | grep node');

  // Check what port elscore-web-prod is on
  console.log('\n=== PM2 env for elscore-web-prod (port info) ===');
  await sshExec('pm2 env 10 | grep -i port');

  // Check what port elscore-web is supposed to be on
  console.log('\n=== PM2 env for elscore-web (port info) ===');
  await sshExec('pm2 env 8 | grep -i port');

  // Check error log for elscore-web
  console.log('\n=== elscore-web ERROR LOG ===');
  await sshExec('cat /root/.pm2/logs/elscore-web-error-8.log | tail -30');

  // Check the actual server.js path for elscore-web
  console.log('\n=== Check if standalone server exists at new path ===');
  await sshExec('ls -la /var/www/elscore-os/apps/web/.next/standalone/ 2>/dev/null || echo "PATH NOT FOUND"');
  await sshExec('ls -la /var/www/elscore-os/apps/web/.next/standalone/apps/web/ 2>/dev/null || echo "NESTED PATH NOT FOUND"');

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
