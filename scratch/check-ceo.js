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

  // Find CEO role and users with it
  console.log('=== CEO role and users on staging ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "
    SELECT u.email, r.code as role, u.status
    FROM user_roles ur
    JOIN users u ON u.id = ur.user_id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.code = 'CEO'
    ORDER BY u.email;" 2>&1`);

  // Also check all roles
  console.log('\n=== All roles on staging ===');
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "SELECT code FROM roles ORDER BY code;" 2>&1`);

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
