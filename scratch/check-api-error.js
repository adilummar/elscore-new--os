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

  // Login as admin
  const resp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' 2>&1`, { silent: true });
  const token = JSON.parse(resp)?.data?.accessToken || '';
  console.log('Admin token:', token ? 'OK' : 'FAIL');

  // Full error response from tutor-hr/leads
  console.log('\n=== Full tutor-hr/leads response ===');
  await sshExec(conn, `curl -s http://localhost:3001/api/v1/tutor-hr/leads -H "Authorization: Bearer ${token}"`);

  // Check API logs
  console.log('\n\n=== API error logs (last 30 lines) ===');
  await sshExec(conn, `pm2 logs elscore-api --lines 30 --nostream 2>&1 | grep -i "error\\|prisma\\|column\\|relation" | head -20`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
