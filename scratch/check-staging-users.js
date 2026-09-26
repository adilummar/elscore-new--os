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

  // Check existing users and roles
  console.log('=== Users in staging ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT u.email, r.code as role FROM users u LEFT JOIN employees e ON e.user_id = u.id LEFT JOIN roles r ON r.id = e.role_id ORDER BY u.email LIMIT 20;" 2>&1`);

  // Check what roles exist
  console.log('\n=== Roles ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT id, code, name FROM roles WHERE code LIKE '%HR%' OR code LIKE '%MANAGER%' ORDER BY code;" 2>&1`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
