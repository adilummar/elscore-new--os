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

  console.log('=== Web .env ===');
  await sshExec(conn, `cat /var/www/elscore-os/apps/web/.env 2>&1`);

  console.log('\n=== PM2 env for elscore-web ===');
  await sshExec(conn, `pm2 describe elscore-web 2>&1 | grep -E "API_URL|NODE_ENV|COOKIE" | head -10`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
