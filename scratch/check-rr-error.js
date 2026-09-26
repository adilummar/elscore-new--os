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

  console.log('\n=== Production Web Error Logs (last 80 lines) ===');
  await sshExec(conn, 'pm2 logs elscore-web-prod --lines 80 --nostream 2>&1 | grep -A5 "Error\\|digest\\|round-robin\\|history"');

  console.log('\n=== Testing round-robin/history endpoint directly ===');
  // Test the API endpoint - need a valid token from admin login first
  const loginRes = await sshExec(conn, `curl -s -X POST http://localhost:4001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}'`);
  
  let token = '';
  try { token = JSON.parse(loginRes).data?.accessToken || ''; } catch(e) {}
  
  if (token) {
    console.log('\n=== Hitting round-robin/history API ===');
    await sshExec(conn, `curl -s "http://localhost:4001/api/v1/round-robin/history?date=2026-09-26" -H "Authorization: Bearer ${token}"`);
  } else {
    console.log('Could not get token, checking prod admin password...');
    await sshExec(conn, `cat /var/www/elscore/apps/api/.env | grep -i "seed\\|admin"`);
  }

  conn.end();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
