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

  console.log('\n=== PM2 STATUS ===');
  await sshExec('pm2 list');

  console.log('\n=== WEB LOGS (last 50 lines) ===');
  await sshExec('pm2 logs elscore-web --lines 50 --nostream');

  console.log('\n=== WEB-PROD LOGS (last 50 lines) ===');
  await sshExec('pm2 logs elscore-web-prod --lines 50 --nostream');

  console.log('\n=== PORTS LISTENING ===');
  await sshExec('ss -tlnp | grep -E "3000|3001|3002|3003"');

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
