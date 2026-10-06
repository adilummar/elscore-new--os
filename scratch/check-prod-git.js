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
  console.log('✅ SSH Connected');

  console.log('\n=== Production app location ===');
  await sshExec(conn, 'ls /var/www/elscore/');

  console.log('\n=== Production git status ===');
  await sshExec(conn, 'cd /var/www/elscore && git log --oneline -5');

  console.log('\n=== Production remote ===');
  await sshExec(conn, 'cd /var/www/elscore && git remote -v');

  conn.end();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
