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

  // Add currency column to tutor_salary_slabs
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "ALTER TABLE tutor_salary_slabs ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'AED';" 2>&1`);

  // Grant so app user can see it  
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "GRANT ALL ON TABLE tutor_salary_slabs TO elscore_staging;" 2>&1`);

  // Also add communication_languages grant
  await sshExec(conn, `sudo -u postgres psql -d elscore_os_staging -c "GRANT ALL ON TABLE communication_languages TO elscore_staging; GRANT ALL ON TABLE mother_tongues TO elscore_staging;" 2>&1`);

  // Verify
  const loginResp = await sshExec(conn, `curl -s -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@elscore.internal","password":"ChangeMe123!"}' 2>&1`, { silent: true });
  const token = JSON.parse(loginResp)?.data?.accessToken;

  for (const path of ['/tutor-hr/leads','/tutor-hr/reviews','/tutor-hr/settings/mother-tongues','/tutor-hr/settings/salary-slabs','/tutor-hr/settings/communication-languages']) {
    const code = await sshExec(conn, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1${path} -H "Authorization: Bearer ${token}"`, { silent: true });
    console.log(`  ${path}: ${code.trim()}`);
  }

  conn.end();
}

run().catch(e => { console.error('Error:', e.message); process.exit(1); });
