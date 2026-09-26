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

  // Use prod credentials
  const loginResult = await sshExec(conn, `curl -s -X POST http://localhost:4001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"ceo@elscoreacademy.com","password":"ElscoreCEO!2026Secure"}'`);
  let token = '';
  try { token = JSON.parse(loginResult).data?.accessToken || ''; } catch(e) {}

  if (!token) { console.log('No token:', loginResult); conn.end(); return; }
  console.log('\n✅ Got prod token');

  console.log('\n=== Testing round-robin/history on PROD API (4001) ===');
  await sshExec(conn, `curl -s "http://localhost:4001/api/v1/round-robin/history?date=2026-09-26" -H "Authorization: Bearer ${token}"`);

  conn.end();
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
