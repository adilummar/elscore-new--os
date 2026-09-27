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

  // Show full PM2 config for elscore-web
  console.log('=== PM2 describe elscore-web ===');
  await sshExec(conn, `pm2 describe elscore-web 2>&1 | head -60`);

  // Check ecosystem config
  console.log('\n=== ecosystem.config.js ===');
  await sshExec(conn, `cat /var/www/elscore-os/ecosystem.config.js 2>&1`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
