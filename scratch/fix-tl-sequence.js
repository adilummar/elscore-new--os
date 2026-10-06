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

  // Check what sequences exist
  console.log('=== Current sequences ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT entity_type, prefix, padding, next_number FROM sequences ORDER BY entity_type;" 2>&1`);

  // Add TL sequence if missing
  console.log('\n=== Add TL sequence if missing ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "INSERT INTO sequences (entity_type, prefix, padding, next_number) VALUES ('TL', 'TL', 4, 1) ON CONFLICT (entity_type) DO NOTHING;" 2>&1`);

  // Verify
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT entity_type, prefix, padding, next_number FROM sequences WHERE entity_type='TL';" 2>&1`);

  // Now test creating a lead via API
  console.log('\n=== Test creating a lead via API ===');
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"hr.test@elscoreacademy.com","password":"Password123!"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken;
  if (!token) { console.log('Login failed'); conn.end(); return; }

  const createResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/tutor-hr/leads -H "Content-Type: application/json" -H "Authorization: Bearer ${token}" -d '{"firstName":"Test","lastName":"Lead","phone":"+971500000001","email":"testlead@test.com"}' 2>&1`, { silent: true });
  console.log('Create lead response:', createResp.slice(0, 300));

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
