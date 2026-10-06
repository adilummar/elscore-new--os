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

  console.log('\n=== ALL PORTS ===');
  await sshExec('ss -tlnp | grep node');

  console.log('\n=== PM2 FULL LIST ===');
  await sshExec('pm2 list');

  console.log('\n=== elscore-web-prod env/details ===');
  await sshExec('pm2 show elscore-web-prod');

  console.log('\n=== elscore-api-prod env/details ===');
  await sshExec('pm2 show elscore-api-prod');

  conn.end();
}

run().catch(err => {
  console.error('❌ FAILED:', err.message);
  process.exit(1);
});
