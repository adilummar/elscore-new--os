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

  // Login and get token
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"hr.test@elscoreacademy.com","password":"Password123!"}' 2>&1`, { silent: true });
  
  let token = '';
  try {
    const body = JSON.parse(loginResp);
    token = body?.data?.accessToken || '';
    console.log('Login:', token ? '✅ Got token' : '❌ No token');
    if (!token) console.log('Response:', loginResp.slice(0, 300));
  } catch(e) {
    console.log('Login failed:', loginResp.slice(0, 300));
    conn.end();
    return;
  }

  // Test GET /tutor-hr/leads
  console.log('\n=== Test GET /tutor-hr/leads ===');
  await sshExec(conn, `curl -s http://localhost:3001/api/v1/tutor-hr/leads -H "Authorization: Bearer ${token}" | head -c 300`);

  // Test GET /tutor-hr/reviews
  console.log('\n\n=== Test GET /tutor-hr/reviews ===');
  await sshExec(conn, `curl -s http://localhost:3001/api/v1/tutor-hr/reviews -H "Authorization: Bearer ${token}" | head -c 200`);

  // Test GET /tutor-hr/settings/mother-tongues
  console.log('\n\n=== Test GET /tutor-hr/settings/mother-tongues ===');
  await sshExec(conn, `curl -s http://localhost:3001/api/v1/tutor-hr/settings/mother-tongues -H "Authorization: Bearer ${token}" | head -c 200`);

  console.log('\n');
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
