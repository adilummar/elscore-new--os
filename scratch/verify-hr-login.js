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

  // Test login with hr.test
  const resp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"hr.test@elscoreacademy.com","password":"Password123!"}' 2>&1`, { silent: true });
  let body;
  try { body = JSON.parse(resp); } catch(e) { body = {}; }
  
  const token = body?.data?.accessToken || '';
  console.log('HR Login:', token ? '✅ SUCCESS' : '❌ FAILED');
  if (!token) { console.log(resp.slice(0, 300)); conn.end(); return; }

  // Test tutor-hr access
  console.log('\nTesting tutor-hr endpoints:');
  for (const path of ['/tutor-hr/leads', '/tutor-hr/reviews', '/tutor-hr/settings/mother-tongues']) {
    const code = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1${path} -H "Authorization: Bearer ${token}"`, { silent: true });
    console.log(`  GET ${path}: ${code.trim()}`);
  }

  // Check what permissions the user has
  const permsResp = await sshExec(conn, `curl -s http://localhost:3001/api/v1/auth/me -H "Authorization: Bearer ${token}"`, { silent: true });
  try {
    const me = JSON.parse(permsResp);
    const permissions = me?.data?.permissions || me?.permissions || [];
    const tutorPerms = Array.isArray(permissions) 
      ? permissions.filter(p => p.includes('tutor'))
      : Object.keys(permissions).filter(k => k.includes('tutor'));
    console.log('\nTutor permissions:', tutorPerms);
  } catch(e) {
    console.log('Me response:', permsResp.slice(0, 200));
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
