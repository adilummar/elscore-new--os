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

  // 1. Check CEO permissions re: lead.read-all
  console.log('=== CEO permissions for lead.* ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT p.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE u.email='admin@elscore.internal' AND p.code LIKE 'lead%' ORDER BY p.code;" 2>&1`);

  // 2. Does CEO have lead.read-all?
  console.log('\n=== CEO lead.read-all check ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -t -c "SELECT COUNT(*) FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE u.email='admin@elscore.internal' AND p.code='lead.read-all';" 2>&1`);

  // 3. Test call with CEO token + X-God-View-Target = saleshead userId
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ElscoreCEO!2026"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken;
  const shId = '064db2e5-02e3-42f0-8f8b-d088d837b93c';
  
  console.log('\n=== Test: CEO token WITHOUT God View (all leads) ===');
  const r1 = await sshExec(conn, `curl -s "http://localhost:3001/api/v1/leads?limit=20" -H "Authorization: Bearer ${token}"`, { silent: true });
  const d1 = JSON.parse(r1);
  console.log('Count:', d1?.data?.data?.length);

  console.log('\n=== Test: CEO token WITH X-God-View-Target = saleshead ===');
  const r2 = await sshExec(conn, `curl -s "http://localhost:3001/api/v1/leads?limit=20" -H "Authorization: Bearer ${token}" -H "X-God-View-Target: ${shId}"`, { silent: true });
  const d2 = JSON.parse(r2);
  console.log('Count:', d2?.data?.data?.length, '← This is what God View shows');

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
