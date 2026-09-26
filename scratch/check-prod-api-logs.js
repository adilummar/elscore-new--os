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

  console.log('\n=== Production API Error Log (last 60 lines, filtered for round-robin) ===');
  await sshExec(conn, 'pm2 logs elscore-api-prod --lines 100 --nostream 2>&1 | grep -A 10 "round-robin\\|distribution\\|500\\|Error\\|Cannot find"');

  conn.end();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
