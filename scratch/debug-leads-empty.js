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

  // Login as admin (CEO)
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ElscoreCEO!2026"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken;
  console.log('Admin login:', token ? 'OK' : 'FAILED');

  // Test 1: GET /leads without limit (old behavior)
  console.log('\n=== Test 1: Without limit param ===');
  const r1 = await sshExec(conn, `curl -s "http://localhost:3001/api/v1/leads" -H "Authorization: Bearer ${token}"`, { silent: true });
  try {
    const d1 = JSON.parse(r1);
    console.log('Count:', d1?.data?.data?.length, '| Error:', d1?.statusCode || 'none', d1?.message || '');
  } catch(e) { console.log('Parse error:', r1.slice(0,200)); }

  // Test 2: GET /leads with limit=20 (new behavior)
  console.log('\n=== Test 2: With limit=20 ===');
  const r2 = await sshExec(conn, `curl -s "http://localhost:3001/api/v1/leads?limit=20" -H "Authorization: Bearer ${token}"`, { silent: true });
  try {
    const d2 = JSON.parse(r2);
    console.log('Count:', d2?.data?.data?.length, '| Error:', d2?.statusCode || 'none', d2?.message || '');
  } catch(e) { console.log('Parse error:', r2.slice(0,200)); }

  // Test 3: Check API recent error logs for leads  
  console.log('\n=== Recent API logs for /leads ===');
  await sshExec(conn, `pm2 logs elscore-api --lines 30 --nostream 2>&1 | grep -E "GET.*leads|statusCode|P2|error" | head -20`);

  // Test 4: Check what user saleshead@gamil.com is and whether they have leads
  console.log('\n=== SalesHead user and their leads ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -t -c "SELECT u.id, u.email FROM users u WHERE u.email='saleshead@gamil.com';" 2>&1`);
  
  // Get saleshead user ID
  const shId = await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -t -c "SELECT id FROM users WHERE email='saleshead@gamil.com';" 2>&1`, { silent: true });
  const shUserId = shId.trim();
  console.log('SalesHead userId:', shUserId);
  
  if (shUserId && shUserId.length > 10) {
    await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT COUNT(*) as total_leads, COUNT(CASE WHEN assigned_to_user_id='${shUserId}' THEN 1 END) as assigned_to_saleshead FROM leads WHERE is_archived=false;" 2>&1`);
    
    // Does saleshead have lead.read-all permission?
    await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT p.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id JOIN role_permissions rp ON rp.role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE u.email='saleshead@gamil.com' AND p.code LIKE 'lead%' ORDER BY p.code;" 2>&1`);

    // Test 5: Call as saleshead (if they exist)
    const shLoginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"saleshead@gamil.com","password":"Password123!"}' 2>&1`, { silent: true });
    const shToken = JSON.parse(shLoginResp)?.data?.accessToken;
    if (shToken) {
      console.log('\n=== Test 5: GET /leads as saleshead user directly ===');
      const r5 = await sshExec(conn, `curl -s "http://localhost:3001/api/v1/leads?limit=20" -H "Authorization: Bearer ${shToken}"`, { silent: true });
      try {
        const d5 = JSON.parse(r5);
        console.log('Count:', d5?.data?.data?.length, '| Error:', d5?.statusCode || 'none', d5?.message || '');
      } catch(e) { console.log('Parse error:', r5.slice(0,200)); }
    } else {
      console.log('\nSaleshead login failed - checking password');
    }
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
