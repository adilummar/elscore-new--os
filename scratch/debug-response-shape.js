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

  // Login
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ElscoreCEO!2026"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken;

  // Show the exact raw response shape from the API
  console.log('=== Exact API response shape (first 500 chars) ===');
  const raw = await sshExec(conn, `curl -s "http://localhost:3001/api/v1/leads?limit=20" -H "Authorization: Bearer ${token}"`, { silent: true });
  const parsed = JSON.parse(raw);
  // Show the top-level keys and nested structure
  console.log('Top-level keys:', Object.keys(parsed));
  console.log('data keys:', Object.keys(parsed.data || {}));
  if (parsed.data?.data) {
    console.log('data.data length:', parsed.data.data.length);
    console.log('data.pagination:', JSON.stringify(parsed.data.pagination));
  }
  // Also show the full first 600 chars
  console.log('\nRaw (first 300 chars):', raw.slice(0, 300));
  
  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
